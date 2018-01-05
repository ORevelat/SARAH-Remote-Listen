var http = require('http');
var querystring = require('querystring');
var killPID = require('tree-kill');

var server  = http.createServer();
var localPort = 10001;

var listen = "bin/listen.exe";
var PID    = 0;
var BUFFER = '';

var remote_info = { };

var sendAnswer = function(res, isOk) {
	res.writeHead(isOk ? 200 : 404, {'Content-Type': 'text/plain'});
	res.end(isOk ? 'OK' : 'KO');
	
	return true;
};

var isStartRequest = function(req, callback) {
	var rePattern = /^\/start\?d=(.+)&g=(.+)&c=(.+)&ip=(.+)&port=(.+)&id=(.+)$/
	var arr = req.url.match(rePattern);
	if (arr == null)
		return false;

	var start_params = {
		device : arr[1],
		grammar : querystring.unescape(arr[2]),
		confidence: arr[3]
	};

	var remote_params = {
		ip : arr[4],
		port : arr[5],
		id : arr[6]
	};

	callback(start_params, remote_params);
	return true;
};

var isStopRequest = function(req, callback) {
	var rePattern = /^\/stop$/
	var arr = req.url.match(rePattern);
	if (arr == null)
		return false;

	callback();
	return true;
}

var startListen = function(params) {
	var args = ['-device', params.device, '-grammar', params.grammar, '-confidence', params.confidence];
	
	var child = require('child_process').spawn(listen, args);

	child.stdin.setEncoding('utf-8');
    child.stdout.on('data', function(data) {
		handleBuffer(data, sendToRemote, remote_info);
	});
	child.stderr.on('data', function(data) {
		console.log(data.toString('utf8'))
	});
    child.on('close', function(code) {
		console.log('@@@ Process "listen.exe" pid=' + PID + ' closed (code='+ code + ')');
	});
    child.on('error', function(err) {
		console.log('@@@ Process "listen.exe" pid=' + PID + ' closed (code='+ code + ')');
	});

	PID = child.pid;

	console.log('\x1b[91mCommand - started ' + listen + ' ' + args.join(" ") + ' (pid=' + PID + ')\x1b[0m');
};

var stopListen = function(cb, cb_param) {
	try { 
		if (PID > 0) {
			console.log('\x1b[91mCommand - stop ' + listen + ' (pid=' + PID + ')\x1b[0m');

			killPID(PID, cb(cb_param));
		}
		else
			cb(cb_param);
	} 
	catch (ex) {
		console.log('Kill Error:', ex);
	}
};

var handleBuffer = function(data, callback, cb_params) {
	// first concat with current buffer
	BUFFER += data.toString('utf8'); 

	// then check if a full message from listen process
	let end = BUFFER.indexOf('</JSON>')
	if (end < 0)
		return true;

    let start =BUFFER.indexOf('<JSON>')
	if (start < 0)
		return true;

	// a whole buffer with <json> / </json>
	let json = BUFFER.substring(start, end+7);
	
	// if more received keep it for later
	BUFFER = BUFFER.substring(end + 7);
	
	callback(json, cb_params);
};

var sendToRemote = function(data, params) {
	var post_data = querystring.stringify({
		'json' : JSON.stringify(data),
		'id' : params.id
	});
  
	var post_options = {
		host: params.ip,
		port: params.port,
		path: '/listen',
		method: 'POST',
		headers: {
			'Content-Type': 'application/x-www-form-urlencoded',
			'Content-Length': Buffer.byteLength(post_data)
		}
	};

	var post_req = http.request(post_options, function(res) {
		res.setEncoding('utf8');
		res.on('data', function (data) {
			// console.log('Response: ' + data);
		});
	});
	
	post_req.on('error', function (err) {
		console.log('@@@ remote error: ' + err);
	});

	 post_req.write(post_data);
	 post_req.end();
}

server.listen(localPort);

server.on('listening', function(){
	console.log('Sarah listen server started - listening to ', localPort);
});

server.on('request', function(req, res) {
	if (req.method != 'GET')
	{
		return sendAnswer(res, false);
	}

	if (isStartRequest(req, function(params_start, params_remote) {
		// save remote info
		remote_info = params_remote;

		// start
		startListen(params_start);

		// finally send OK to remote
		sendAnswer(res, true);
	})) {
		return;
	}

	if (isStopRequest(req, function() {

		const finish_stop = (res) => {
			PID = 0;

			// clean remote info
			remote_info = { };

			// finally send OK to remote
			sendAnswer(res, true);
		};

		// stop
		stopListen(finish_stop, res);

	})) {
		return;
	}

	return sendAnswer(res, false);
});

server.on('error', function(err) {
	console.log(err);
});
