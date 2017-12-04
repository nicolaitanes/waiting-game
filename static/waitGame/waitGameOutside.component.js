'use strict';

// Default screen, picking a room
// WaitSession.state should be 'Entering'

angular
    .module('waitGame')
    .component('waitGameOutside', {
        templateUrl: 'waitGame/waitGameOutside.html',
        controller: ['WaitSession', function WaitGameOutsideController(WaitSession) {
            this.room = WaitSession.room();
            this.enterRoom = function enterRoom() {
                WaitSession.enterRoom(this.room);
                document.location.hash = '!/r/'+this.room; // navigate to waitGameRoom
            }.bind(this);
        }]
    });
