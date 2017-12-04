'use strict';

angular.module('waitGameApp')
    .config(['$locationProvider' ,'$routeProvider', function config($locationProvider, $routeProvider) {
        $locationProvider.hashPrefix('!');
        
        $routeProvider
            .when('/', {
                template: '<wait-game-outside></wait-game-outside>'
            }).when('/r/:room', {
                template: '<wait-game-room></wait-game-room>'
            }).otherwise('/');
    }]);
