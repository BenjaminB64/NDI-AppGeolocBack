'use strict';
const Composer = require('./index');
const corsHeaders = require('hapi-cors-headers');

Composer((err, server) => {

    if (err) {
        throw err;
    }

    server.start(() => {

        console.log('Started the plot device on port ' + server.info.port);
    });
    server.ext('onPreResponse', corsHeaders);
});
