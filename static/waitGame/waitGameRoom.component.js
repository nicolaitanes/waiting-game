'use strict';

// Main gameplay screen, with ng-switch section on $ctrl.state = WaitSession.state()

angular
    .module('waitGame')
    .component('waitGameRoom', {
        templateUrl: 'waitGame/waitGameRoom.html',
        controller: ['$http', '$routeParams', 'WaitSession', function WaitGameRoomController($http, $routeParams, WaitSession) {
            this.room = $routeParams.room;
            this.name = WaitSession.name();
            this.state = WaitSession.state();
            this.url = document.location.href;
            this.players = [];
            
            WaitSession.onstate = function(state) {
                this.state = state;
            }.bind(this);
            WaitSession.onroom = function(room) {
                room.players.forEach(function(p) {
                    // css for display:
                    if ( p.isSelf ) {
                        p.playerClass = 'playerSelf';
                    } else if ( ! p.present ) {
                        p.playerClass = 'playerAbsent';
                    } else {
                        p.playerClass = '';
                    }
                });
                this.players = room.players;
            }.bind(this);
            
            this.startWaiting = function startWaiting() {
                if ( this.name.length === 0 ) {
                    return;
                }
                WaitSession.name(this.name);
                WaitSession.startWaiting();
            }.bind(this);

            this.quit = function quit() {
                WaitSession.quit();
            };
            this.unquit = function unquit() {
                WaitSession.startWaiting();
            };
            
            this.exitRoom = function exitRoom() {
                WaitSession.exitRoom();
                document.location.hash = ''; // navigate to waitGameOutside
            }.bind(this);
        }]
    });
