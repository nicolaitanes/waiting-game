# waiting-game
Online game in which people can wait to see who can wait the longest (without locking screen or changing to a different tab or app).

waitdb.js implements the game logic on a mysql database.
waitserv.js exposes it as an express Router (e.g. for a sub-route of http server)
which also serves the user interface, found in static/.

To get started, run 'npm install' in the main directory and in static/,
create the database described in waitdb.js,
and install waitserv's Router in an express http/https/spdy server.
