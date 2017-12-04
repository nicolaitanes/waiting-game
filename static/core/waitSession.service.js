'use strict';

// Connects to game server and manages one player's local state in a game;
// the goal is to wait, with the page onscreen, longer than any other player
// in the "room."

// The client is identified by seatKey, a random string generated
// by the server and stored in client's localStorage
// along with the user's most recent name and room choices.

// Gameplay takes place in rooms, named with a client-generated string.
// When playing, this component counts only the seconds during which
// this page is onscreen, as detected by requestAnimationFrame,
// and reports them to the server in ~3 seconds increments.

// The server considers a player absent after several seconds of inactivity.
// A game is over when the last non-absent player quits.

// Gameplay state progresses through:
//   'Entering': confirming user's name before they start playing
//   'In': counting the seconds
//   'Quitting': user pressed Quit, waiting for server to call game over
//   'Current': game is over; mis-named because I'm also (ab)using these as display labels
// via
//   'Entering'    ---- startWaiting() ------------>    'In'
//   'In'          ---- quit() -------------------->    'Quitting'
//                <---- startWaiting() ------------
//   'Quitting'    ---- (interval: listRooms()) --->    'Current'
//   'Current'     ---- startWaiting() ------------>    'In'
//   'Entering'   <---- exitRoom() ----------------     *
// Change rooms with enterRoom(name), only when state === 'Entering'.
// Must set name(playerName) before startWaiting().

// In principle, a single browser could support multiple identities (seatKeys),
// but this implementation reuses the same seatKey for all sessions.

// assign callbacks:
//   onstate(state) when it changes
//   onroom({gameOver :bool, gameOverWhen :datetime, players :[{name, seconds, present, isSelf}]
//     -- only during 'In', 'Quitting'

angular
    .module('core.waitSession')
    .factory('WaitSession', ['$http', '$q', '$timeout', function WaitSessionController($http, $q, $timeout) {
        var TICK_DELAY = 250;
        var waitCounter = {
            // counts seconds since start(), only counting while the page is onscreen,
            // using setTimeout(requestAnimationFrame(...))
            // calls ontick(seconds) with latest total every TICK_DELAY ms
            started: false,
            seconds: 0,
            ontick: function(seconds) {},
            clear: function() {
                this.seconds = 0;
            },
            tick: function(first) {
                if ( ! first ) {
                    this.seconds += TICK_DELAY/1000;
                }
                this.ontick(this.seconds);
                this.started && setTimeout(function() {
                    requestAnimationFrame(function() {
                        this.tick();
                    }.bind(this));
                }.bind(this), TICK_DELAY);
            },
            start: function() {
                if ( this.started ) {
                    return;
                }
                this.started = true;
                this.tick(true);
            },
            stop: function() {
                this.started = false;
            }
        };

        var server = {
            postName: function(seatKey, name) {
                $http.post('name', {
                    seatKey: seatKey,
                    name: name
                });
            },
            postDwell: function(room, seatKey, seconds) {
                return (state === 'In') ? $http.post('dwell', {
                    seatKey: seatKey,
                    room: room,
                    seconds: seconds
                }) : $q.resolve(true);
            },
            quit: function(room, seatKey) {
                return $http.post('quit', {
                    room: room,
                    seatKey: seatKey
                });
            },
            listRoom: function(room, seatKey) {
                return $http.get('room', {
                    params: {
                        room: room,
                        seatKey: seatKey
                    }
                });
            },
            newSeatKey: function() {
                return $http.post('newSeat', '{}');
            }
        };

        var seatKey = localStorage.getItem('waiting_seatKey') || '';
        var haveSeatKey = seatKey ? $q.resolve(seatKey)
            : server.newSeatKey().then(function(response) {
                seatKey = response.data.seatKey;
                localStorage.setItem('waiting_seatKey', seatKey);
                return seatKey;
            });
        
        var room = localStorage.getItem('waiting_room') || '';
        var name = localStorage.getItem('waiting_name') || '';
        var state = 'Entering';
        var POST_DELAY = 3000;
        var secondsIn = 0;
        var secondsOut = 0;

        return {
            onstate: function(state) {},
            onroom: function(room) {},
            name: function(x) {
                if ( x === undefined ) {
                    return name;
                }
                name = x;
                localStorage.setItem('waiting_name', x);
                haveSeatKey.then(function(seatKey) {
                    server.postName(seatKey, name);
                });
                return this;
            },
            room: function() {
                return room;
            },
            state: function() {
                return state;
            },
            enterRoom: function(r) {
                if ( state !== 'Entering' ) {
                    throw new Error('Change rooms only in "Entering" state');
                }
                room = r.toLowerCase();
                localStorage.setItem('waiting_room', r.toLowerCase());
            },
            exitRoom: function() {
                waitCounter.stop();
                if ( state !== 'Entering' ) {
                    state = 'Entering';
                    this.onstate(state);
                }
            },
            startWaiting: function() {
                if ( ! name ) {
                    throw new Error('Must set name() before playing');
                }
                state = 'In';
                this.onstate(state);
                waitCounter.ontick = function ontick(seconds) {
                    if ( state === 'In' ) {
                        secondsIn += seconds;
                    } else {
                        secondsOut += seconds;
                    }
                    var secondsInOut = secondsIn + secondsOut;
                    waitCounter.clear();
                    var posted = $q.resolve(true);
                    if ( secondsIn >= (POST_DELAY/1000) ) {
                        posted = server.postDwell(room, seatKey, secondsIn);
                        secondsIn = 0;
                    }
                    if ( secondsInOut >= (POST_DELAY/1000) ) {
                        posted.then(function() {
                            this.listRoom();
                        }.bind(this));
                        if ( secondsOut > 0 ) {
                            secondsOut = Math.max(0, secondsOut - .5*(POST_DELAY/1000));
                        }
                    }
                }.bind(this);
                waitCounter.start();
                // game starts on receipt of the first dwell; start immediately and update player list
                server.postDwell(room, seatKey, 1e-5).then(function() {
                    this.listRoom();
                }.bind(this));
            },
            quit: function() {
                server.quit(room, seatKey);
                state = 'Quitting';
                this.onstate(state);
            },
            listRoom: function() {
                return haveSeatKey.then(function(seatKey) {
                    return server.listRoom(room, seatKey);
                }.bind(this)).then(function(response) {
                    var r = response.data;
                    if ( r.gameOver && (0 <= ['In', 'Quitting'].indexOf(state)) ) {
                        state = 'Current';
                        this.onstate(state);
                        waitCounter.stop();
                    }
                    this.onroom(r);
                    return r;
                }.bind(this));
            }
        };
    }]);
