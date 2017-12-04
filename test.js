'use strict';

// test using mocha

const expect = require('expect.js');
var waitdb;

before(function(done) {
    const requirejs = require('requirejs');
    requirejs.config({
        //Pass the top-level main.js/index.js require
        //function to requirejs so that node modules
        //are loaded relative to the top-level JS file.
        nodeRequire: require,
        baseUrl: __dirname,
        paths: {
            'mymysql': '../mymysql'
        }
    });
    requirejs(['./waitdb'], db => {
        waitdb = db;
        if ( db ) {
            done();
        } else {
            done(new Error("waitdb module didn't load"));
        }
    });
});

function sleep(seconds) {
    return new Promise((resolve, reject) => setTimeout(() => resolve(true), 1000*seconds));
}

function newScenario() {
    return {
        room: 'R'+waitdb.newRoomName(),
        seatKey: waitdb.newSeatKeyRand(),
        name: 'N'+waitdb.newRoomName(),
        seatKey2: waitdb.newSeatKeyRand(),
        name2: 'n'+waitdb.newRoomName()
    };
}

describe('waitdb', function() {
    it('Cleans up old DB entries', async function() {
        await waitdb.cleanupDB();
    });
    it('Generates names', async function() {
        newScenario();
        expect(await waitdb.newSeatKey()).to.have.length(waitdb.newSeatKeyRand().length);
    });
    it('Defines time constants', function() {
        expect(waitdb.GRACE_SEC).not.to.be(undefined);
        expect(waitdb.UPDATE_SEC).not.to.be(undefined);
    });
    it('Lists an empty room', async function() {
        const room = waitdb.newRoomName(); /// uuid.v4();
        const {gameOver, players} = await waitdb.getRoom(room);
        expect(gameOver).to.be(false);
        expect(players).to.have.length(0);
    });
    it('Lists a new room with named entrant', async function() {
        const scene = newScenario();
        await waitdb.setName(scene.seatKey, scene.name);
        const {gameOver, players} = await waitdb.getRoom(scene.room, scene.seatKey);
        expect(players).to.have.length(1);
        expect(players[0].present).to.be(true);
        expect(players[0].isSelf).to.be(true);
        expect(players[0].name).to.be(scene.name);
        expect(players[0].seconds).to.be(0.0);
    });
    it('Registers the first dwell', async function() {
        const scene = newScenario();
        const seconds = 2.0;
        await waitdb.setName(scene.seatKey, scene.name);
        await waitdb.postDwell(scene.room, scene.seatKey, seconds);
        const {gameOver, players} = await waitdb.getRoom(scene.room, scene.seatKey);
        expect(gameOver).to.be(false);
        expect(players).to.have.length(1);
        expect(players[0].seconds).to.be(seconds);
    });
    it('Adds the second dwell', async function() {
        const scene = newScenario();
        const seconds = 2.0;
        this.timeout(2*seconds*1000);
        await waitdb.setName(scene.seatKey, scene.name);
        await waitdb.postDwell(scene.room, scene.seatKey, seconds);
        await sleep(seconds);
        await waitdb.postDwell(scene.room, scene.seatKey, seconds);
        const {gameOver, players} = await waitdb.getRoom(scene.room, scene.seatKey);
        expect(gameOver).to.be(false);
        expect(players).to.have.length(1);
        expect(players[0].seconds).to.be(2*seconds);
    });
    it('Limits a falsely long dwell', async function() {
        const scene = newScenario();
        const seconds = 2.0;
        this.timeout(2*seconds*1000);
        await waitdb.setName(scene.seatKey, scene.name);
        await waitdb.postDwell(scene.room, scene.seatKey, seconds);
        await sleep(seconds);
        await waitdb.postDwell(scene.room, scene.seatKey, 20*seconds);
        const {gameOver, players} = await waitdb.getRoom(scene.room, scene.seatKey);
        expect(players).to.have.length(1);
        expect(players[0].seconds).to.be.lessThan(10*seconds);
    });
    it('Lists two players', async function() {
        const scene = newScenario();
        const seconds = 2.0;
        await waitdb.setName(scene.seatKey, scene.name);
        await waitdb.setName(scene.seatKey2, scene.name2);
        await waitdb.postDwell(scene.room, scene.seatKey, seconds);
        await waitdb.postDwell(scene.room, scene.seatKey2, 2*seconds);
        const {gameOver, players} = await waitdb.getRoom(scene.room, scene.seatKey);
        expect(players).to.have.length(2);
        expect(players[0].name).to.be(scene.name2);
        expect(players[0].seconds).to.be(2*seconds);
        expect(players[1].name).to.be(scene.name);
        expect(players[1].seconds).to.be(seconds);
    });
    it('Notices an absent player', async function() {
        this.timeout(4*waitdb.UPDATE_SEC*1000);
        const scene = newScenario();
        await waitdb.setName(scene.seatKey, scene.name);
        await waitdb.setName(scene.seatKey2, scene.name2);
        await waitdb.postDwell(scene.room, scene.seatKey, 1);
        await waitdb.postDwell(scene.room, scene.seatKey2, 1);
        await sleep(waitdb.UPDATE_SEC);
        await waitdb.postDwell(scene.room, scene.seatKey, waitdb.UPDATE_SEC);
        await sleep(waitdb.UPDATE_SEC);
        await waitdb.postDwell(scene.room, scene.seatKey, waitdb.UPDATE_SEC);
        await sleep(waitdb.UPDATE_SEC);
        const {gameOver, players} = await waitdb.getRoom(scene.room, scene.seatKey);
        expect(players).to.have.length(2);
        expect(players[0].name).to.be(scene.name);
        expect(players[0].present).to.be(true);
        expect(players[1].present).to.be(false);
    });
    it('Absents a quit player', async function() {
        this.timeout((waitdb.GRACE_SEC+3)*1000);
        const scene = newScenario();
        await waitdb.setName(scene.seatKey, scene.name);
        await waitdb.postDwell(scene.room, scene.seatKey, 1);
        await waitdb.quit(scene.room, scene.seatKey);
        const {players} = await waitdb.getRoom(scene.room, scene.seatKey);
        expect(players).to.have.length(1);
        expect(players[0].present).to.be(false);
        await sleep(waitdb.GRACE_SEC+1);
        const {gameOver} = await waitdb.getRoom(scene.room, scene.seatKey);
        expect(gameOver).to.be(true);
    });
    it('Un-quits a dwelling player', async function() {
        this.timeout((waitdb.GRACE_SEC+4)*1000);
        const scene = newScenario();
        await waitdb.setName(scene.seatKey, scene.name);
        await waitdb.postDwell(scene.room, scene.seatKey, 1);
        await waitdb.quit(scene.room, scene.seatKey);
        await sleep(1);
        await waitdb.postDwell(scene.room, scene.seatKey, 1);
        const {players} = await waitdb.getRoom(scene.room, scene.seatKey);
        expect(players).to.have.length(1);
        expect(players[0].present).to.be(true);
        await sleep(waitdb.GRACE_SEC+1);
        const {gameOver} = await waitdb.getRoom(scene.room, scene.seatKey);
        expect(gameOver).to.be(false);
    });
    it('Ends game when last player present quits', async function() {
        this.timeout((waitdb.GRACE_SEC+3)*1000);
        const scene = newScenario();
        await waitdb.setName(scene.seatKey, scene.name);
        await waitdb.postDwell(scene.room, scene.seatKey, 1);
        // with 2 players?
        await waitdb.quit(scene.room, scene.seatKey);
        await sleep(waitdb.GRACE_SEC+1);
        const {gameOver} = await waitdb.getRoom(scene.room, scene.seatKey);
        expect(gameOver).to.be(true);
    });
    it('Starts a new game if a dwell is posted after the grace period', async function() {
        this.timeout(2*waitdb.GRACE_SEC*1000);
        const scene = newScenario();
        await waitdb.setName(scene.seatKey, scene.name);
        await waitdb.setName(scene.seatKey2, scene.name2);
        await waitdb.postDwell(scene.room, scene.seatKey, 1);
        await waitdb.postDwell(scene.room, scene.seatKey2, 1);
        await waitdb.quit(scene.room, scene.seatKey);
        await waitdb.quit(scene.room, scene.seatKey2);
        await sleep(waitdb.GRACE_SEC+1);
        const {gameOver} = await waitdb.getRoom(scene.room, scene.seatKey);
        expect(gameOver).to.be(true);
        await waitdb.postDwell(scene.room, scene.seatKey, 1);
        const newGame = await waitdb.getRoom(scene.room, scene.seatKey);
        expect(newGame.gameOver).to.be(false);
        expect(newGame.players).to.have.length(1);
    });
    
});
