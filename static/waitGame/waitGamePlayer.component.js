'use strict';

angular
    .module('waitGame')
    .filter('fromSeconds', [function fromSeconds() {
        // formats seconds as MM:SS or HH:MM:SS
        function withLeadingZero2Dig(s) {
            return ("0" + s).slice(-2);
        }
        return function fromSecondsFilter(seconds, minutesAlways) {
            if ( minutesAlways === undefined ) {
                minutesAlways = true;
            }
            var ss = Math.round(seconds);
            var hh = Math.floor(ss / (60*60));
            ss -= hh*60*60;
            var mm = Math.floor(ss / 60);
            ss -= mm*60;
            var parts = hh ? [hh,mm,ss]
                      : ((minutesAlways || mm) ? [mm,ss]
                      : [ss]);
            return parts.map(withLeadingZero2Dig)
                .join(':');
        };
    }]).component('waitGamePlayer', {
        templateUrl: 'waitGame/waitGamePlayer.html',
        bindings: {
            player: '<'
        },
        controller: [function WaitGameRoomController() {
        }]
    });
