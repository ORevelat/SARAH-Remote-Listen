const fs      = require('fs');
const path    = require('path');
const http    = require('http');
const request = require('request');
const querystring = require('qs');

let REMOTE  = { }
let BUFFERS = { }

let localPort = 10000;
let server = http.createServer();

server.on('listening', () => {
    console.log('Remote Sarah listen server started - listening to ', localPort);
});
server.on('error', (err) => {
    console.log(err);
});
server.on('request', (request, response) => {
    if (request.method.toLowerCase() == 'post') {
        let body = [];

        request.on('data', (chunk) => {
            body.push(chunk);
        }).on('end', () => {
            body = Buffer.concat(body).toString();

            let postdata = querystring.parse(body);
            let id = postdata.id;
            let json = JSON.parse(postdata.json);

            handleBuffer(id, json, REMOTE[id].cb);

            response.writeHead(200, {'Content-Type': 'text/plain'});
            response.end('OK');
        });
    }
});

server.listen(localPort);

const kill = exports.kill = (id, cb, options, callback, logback) => {

    let pid = REMOTE[id]; 
    if (!pid) { 
        if (cb) {
            cb(id, options, callback, logback);
        }
        return;
    }

    var url = 'http://' + pid.ip + ':' + pid.port + '/stop';

    request(url, function(err, response, body) {
        if (err) {
            console.log('@@@ error:' + err);
        }
        else if (response && response.statusCode) {
            if (body.toUpperCase() === 'OK'.toUpperCase()) {
                console.log('@@@ Stopped remote using ' + url);
            }
            else {
                console.log("@@@ remote process returned '" + body + "'");
            }

            REMOTE[id] = undefined;
            BUFFERS[id] = undefined;

            if (cb) {
                setTimeout(function() { cb(id, options, callback, logback); }, 1000);
            }
        }
    });
}

const stdErr = exports.stdErr = (id, data, logback) => {
    logback(data.toString('utf8'))
}

const close = exports.close = (id, code, logback) => {
    logback('@@@ Process "listen.exe" closed with ('+ code + ') for ID '+ id + ' pid: ' + PIDS[id])
}

const real_start = (id, options, callback, logback) => {
    if (!options.grammar)
        return;

    let start_params = {
		d : '1',
		g : path.normalize(options.grammar),
		c : options.confidence || '0.7',
		ip : '127.0.0.1',
        port : localPort,
        id : id
    };
   
    // lets start the remote process
    var url = 'http://' + options.remoteip + ':' + options.remoteport + '/start?' + querystring.stringify(start_params);

    request(url, function(err, response, body) {
        if (err) {
            logback('@@@error:' + err);
        }
        else if (response && response.statusCode) {
            if (body.toUpperCase() === 'OK'.toUpperCase()) {
                logback('Starting id=' + id + ', remote process using ' + url);

                BUFFERS[id] = '';
                REMOTE[id] = { ip: options.remoteip, port: options.remoteport, cb: callback };
            }
            else {
                stdErr("remote process returned '" + body + "'");
            }
        }
    });
};

const start = exports.start = (id, options, callback, logback) => {
    // kill previous process and start a new one
    kill(id, real_start, options, callback, logback);
}

const handleBuffer = (id, data, callback) => {
    BUFFERS[id] += data.toString('utf8'); 
    let buffer = BUFFERS[id];

    let end = buffer.indexOf('</JSON>')
    if (end < 0){ return true; }

    let start = buffer.indexOf('<JSON>')
    if (start < 0){ return true; }

    let json    = buffer.substring(start + 6, end);
    BUFFERS[id] = buffer.substring(end   + 7);

    try { json  = JSON.parse(json); } catch(ex){ console.log('Parsing Error:', ex, json); return; }
    json.buffer = Buffer.from(json.base64, 'base64');

    callback(json);
}
