define("waitserv", ["waitdb", "express", "body-parser"], (waitdb, express, bodyParser) => {
    'use strict';

    // exposes waitdb api via an express Router

    const router = express.Router();
    router.use(bodyParser.json());
    router.use(bodyParser.urlencoded({ extended: true }));

    function cleanup(res) {
        return err => {
            if ( err ) {
                console.log(err.stack);
                res.status(500).send('{"err": "Internal error."}');
            }
        };
    }
    
    const MAX_ROOM_LEN = 32;
    function parseRoom(s) {
        return (s || '').substring(0, MAX_ROOM_LEN);
    }
    
    router.post('/name', (req, res) => {
        waitdb.setName(req.body.seatKey||'', req.body.name||'')
            .then(() => res.jsonp({}))
            .catch(cleanup(res));
    });
    router.post('/dwell', (req, res) => {
        waitdb.postDwell(parseRoom(req.body.room), req.body.seatKey||'', +req.body.seconds)
            .then(() => res.jsonp({}))
            .catch(cleanup(res));
    });
    router.post('/quit', (req, res) => {
        waitdb.quit(parseRoom(req.body.room), req.body.seatKey||'')
            .then(() => res.jsonp({}))
            .catch(cleanup(res));
    });
    router.get('/room', (req, res) => {
        waitdb.getRoom(parseRoom(req.query.room), req.query.seatKey||'')
            .then(room => res.jsonp(room))
            .catch(cleanup(res));
    });
    router.post('/newSeat', (req, res) => {
        waitdb.newSeatKey()
            .then(seatKey => res.jsonp({seatKey}))
            .catch(cleanup(res));
    });

    router.use('/', express.static('waiting/static'));

    return router;
});
