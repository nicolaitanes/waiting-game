define('waitdb', ['mymysql', 'node-uuid'], (mysql, uuid) => {
    'use strict';

    // Administers the Waiting Game, a set of rooms in which people can wait to see who can wait the longest
    // (without locking screen or changing to a different tab or app). All state is kept in a mysql database.

    // Players identify themselves by seatKey: a random string generated on the server, and stored in client's
    // localStorage between sessions. Players are publicly listed by name, which need not be unique.

    const UPDATE_SEC = 3;
    const GRACE_SEC = 5;
    const ROOM_NAME_LEN = 6;
    const SEAT_KEY_LEN = 8;

    const db = mysql.newPool({
        host: process.env.WAITDB_HOST || 'localhost',
        user: process.env.WAITDB_USER || 'waitdm',
        password: process.env.WAITDB_PW || 'vc8swje3kj',
        database: process.env.WAITDB_DB || 'waiting',
    });
    /*
CREATE DATABASE waiting;
CREATE TABLE Seat(seatId INT PRIMARY KEY AUTO_INCREMENT, seatKey CHAR(8), seatName VARCHAR(255), seatBudget FLOAT);
CREATE TABLE Time(timeId INT PRIMARY KEY AUTO_INCREMENT, timeSeat INT, timeTotal FLOAT, timeRoom VARCHAR(32), timeWhen DATETIME);
CREATE TABLE Finished(finishedId INT PRIMARY KEY AUTO_INCREMENT, finishedRoom VARCHAR(32), finishedWhen DATETIME);
    */
    // hourly cleanup:
    function cleanupDB() {
        (async () => {
            // delete records from games finished more than a day ago
            const oneDayAgo = new Date(new Date() - 24*60*60*1000);
            const stale = await db.query(`SELECT * from Finished WHERE finishedWhen < ${mysql.escape(oneDayAgo)}`);
            await Promise.all(stale.map(row => db.query(`DELETE FROM Time WHERE timeRoom=${mysql.escape(stale.finishedRoom)}`)));
            await db.query(`DELETE FROM Finished WHERE finishedWhen < ${mysql.escape(oneDayAgo)}`);
            // TODO: sweep out unfinished games that haven't seen any players in the last month
        })().catch(err => console.log('cleanupDB',err.stack));
    }
    setInterval(cleanupDB, 60*60*1000);
    
    function newRoomName() { // randomly generated room name, for tests
        return uuid.v4().substring(0, ROOM_NAME_LEN);
    }

    function newSeatKeyRand() { // random seatKey, no collision test
        return uuid.v4().substring(0, SEAT_KEY_LEN);
    }
    
    async function newSeatKey() { // random seatKey, re-tries until it finds one not in the db
        const seatKey = newSeatKeyRand();
        const existing = await db.query(`SELECT seatId, seatKey FROM Seat WHERE seatKey=${mysql.escape(seatKey)} LIMIT 1`);
        if ( existing.length ) {
            return newSeatKey();
        }
        return seatKey;
    }

    async function setName(seatKey, name) {
        const existing = await db.query(`SELECT seatId, seatKey FROM Seat WHERE seatKey=${mysql.escape(seatKey)} LIMIT 1`);
        if ( existing.length ) {
            await db.query(`UPDATE Seat SET seatName=${mysql.escape(name)} WHERE seatId=${existing[0].seatId}`);
        } else {
            await db.query(`INSERT INTO Seat SET ?`, {
                seatKey,
                seatName: name,
                seatBudget: GRACE_SEC
            });
        }
    }
    
    async function postDwell(room, seatKey, seconds) {
        // adds time for a player's game session (room, seatKey),
        // subject to checks and limits against cheating:
        //   not negative
        //   not several multiples of the expected interval
        //   variance vs. message arrival times is within "budget" --
        //     each Seat gets up to GRACE_SEC to spend/replenish;
        //     if it goes to 0, we limit seconds to actual time since last post
        // if the (previous) game is over, we clear its records first.
        seconds = Math.max(0, Math.min(GRACE_SEC, seconds));
        const reqTime = new Date();
        const seats = await db.query(`SELECT * FROM Seat WHERE seatKey=${mysql.escape(seatKey)} LIMIT 1`);
        if ( seats.length === 0 ) {
            console.log('Warning: postDwell without setName; ignoring it.');
            return;
        }
        const seat = seats[0];
        const finished = await db.query(`SELECT * FROM Finished WHERE finishedRoom=${mysql.escape(room)} LIMIT 1`);
        if ( finished.length ) { // starting a new game
            await Promise.all([
                db.query(`DELETE FROM Time WHERE timeRoom=${mysql.escape(room)}`),
                db.query(`DELETE FROM Finished WHERE finishedId=${finished[0].finishedId}`)
            ]);
        }
        const times = await db.query(`SELECT * FROM Time WHERE timeSeat=${seat.seatId} AND timeRoom=${mysql.escape(room)} LIMIT 1`);
        if ( times.length > 0 ) {
            const time = times[0];
            const elapsedHere = (new Date() - new Date(time.timeWhen)) / 1000;
            const crook = seconds - elapsedHere;
            seconds -= Math.max(0, crook - seat.seatBudget);
            const tasks = [db.query(`UPDATE Time SET timeWhen=${mysql.escape(reqTime)}, timeTotal=${time.timeTotal + seconds} WHERE timeId=${time.timeId}`)];
            const newBudget = Math.max(0, Math.min(GRACE_SEC, seat.seatBudget - crook));
            if ( newBudget !== seat.seatBudget ) {
                tasks.push(db.query(`UPDATE Seat SET seatBudget=${newBudget} WHERE seatId=${seat.seatId}`));
            }
            await Promise.all(tasks);
        } else {
            await db.query(`INSERT INTO Time SET ?`, {
                timeSeat: seat.seatId,
                timeRoom: room,
                timeWhen: reqTime,
                timeTotal: seconds
            });
        }
    }

    async function getRoom(room, seatKey) {
        // Lists info about a room, including gameOver: bool, gameOverWhen: datetime, players: [player]
        // player: {name, seconds, present, isSelf}
        // present: has posted recently
        // isSelf: player's seatKey matches input seatKey
        const [seats, finished] = await Promise.all([
            db.query(`SELECT * FROM Time INNER JOIN Seat ON timeSeat=seatId WHERE timeRoom=${mysql.escape(room)} ORDER BY timeTotal DESC`),
            db.query(`SELECT * FROM Finished WHERE finishedRoom=${mysql.escape(room)} LIMIT 1`)
        ]);
        let foundSelf = false;
        const players = seats.map(seat => {
            const isSelf = seat.seatKey === seatKey;
            if ( isSelf ) {
                foundSelf = true;
            }
            return {
                name: seat.seatName,
                seconds: seat.timeTotal,
                present: (new Date() - new Date(seat.timeWhen)) < (GRACE_SEC*1000),
                isSelf
            }
        });
        if ( ! foundSelf ) {
            const selfSeats = await db.query(`SELECT * FROM Seat WHERE seatKey=${mysql.escape(seatKey)} LIMIT 1`);
            if ( selfSeats.length > 0 ) {
                players.push({
                    name: selfSeats[0].seatName,
                    seconds: 0,
                    present: true,
                    isSelf: true
                });
            }
        }
        return {
            gameOver: (finished.length > 0),
            gameOverWhen: (finished.length > 0) && new Date(finished[0].finishedWhen),
            players
        };                
    }

    async function quit(room, seatKey) {
        // absents the player,
        // and attempts to set gameOver after GRACE_SEC if no players are then present
        const seats = await db.query(`SELECT * FROM Seat WHERE seatKey=${mysql.escape(seatKey)} LIMIT 1`);
        if ( seats.length === 0 ) {
            console.log('Warning: unknown seat', seatKey);
            return;
        }
        // presence/absence is measured by how recent seatKey's last post was, so we backdate their last post, if any
        const times = await db.query(`SELECT * FROM Time WHERE timeSeat=${seats[0].seatId} AND timeRoom=${mysql.escape(room)} LIMIT 1`);
        if ( times.length > 0 ) {
            const {timeId} = times[0];
            await db.query(`UPDATE Time SET timeWhen=${mysql.escape(new Date(new Date() - 1000*(GRACE_SEC+1)))} WHERE timeId=${timeId}`);
        }
        setTimeout(() => checkGameOver(room).catch(err => console.log(err)),
                   1000*GRACE_SEC);
    }

    async function checkGameOver(room) {
        // marks game over for a room by adding a row to Finished,
        // unless already marked, or a player is present.
        const [recentTimes, finished] = await Promise.all([
            db.query(`SELECT * FROM Time WHERE timeRoom=${mysql.escape(room)} AND timeWhen>${mysql.escape(new Date(new Date() - 1000*GRACE_SEC))}`),
            db.query(`SELECT * FROM Finished WHERE finishedRoom=${mysql.escape(room)} LIMIT 1`)
        ]);
        if ( (finished.length === 0) && (recentTimes.length === 0) ) {
            db.query(`INSERT INTO Finished SET ?`, {
                finishedRoom: room,
                finishedWhen: new Date()
            });
        }
    }
    
    return {
        GRACE_SEC,      // timeout for presence and quitting
        UPDATE_SEC,     // expected interval between postDwell calls

        cleanupDB,      // housekeeping interval function, exposed for testing
        
        newRoomName,    // random naming functions, exposed for testing
        newSeatKeyRand,

        newSeatKey,     // () => {seatKey}; generates a new unique random seat identifier
        setName,        // (seatKey, name) => {}; associates a name with seatKey
        postDwell,      // (room, seatKey, seconds) => {}; asserts active presence
        getRoom,        // (room, seatKey) => {gameOver, gameOverWhen, players}
        quit            // (room, seatKey) => {}; requests gameOver
    };
});
