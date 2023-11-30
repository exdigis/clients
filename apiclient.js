#!/usr/bin/env node

// Set API keys
const apiKey = '<PASTE>';
const apiSecret = '<PASTE>';



const crypto = require('crypto');
const WebSocket = require('ws');

let nonce = 1;
let sessionToken = '';



const pubWs = new WebSocket('wss://api-pub.exdigis.com/ws/');
const privWs = new WebSocket('wss://api.exdigis.com/ws/');


// On the private endpoint, we wait for the 'hello' event to be received
// before attempting to log in.
privWs.on('open', function() {
	setInterval(function() { wsPing('priv');}, 60000);
});
privWs.on('message', function(data) {
	let d = JSON.parse(data);
	switch (d.cmd) {

		case 'v1/hello':
			sessionToken = d.sessionToken;
			console.log('Got sessionToken, attempting to authenticate...');
			wsSend(privWs, {
				cmd:	'v1/user_auth',
				args:	{
					apiKey:	apiKey
				}
			});
			break;

		case 'v1/user_auth':
			if (d.data.status === 'ok') {
				console.log('We are now authenticated on the private WS API endpoint');
				
				// Uncommenting the next line will set the trade killswitch on -
				// upon disconnection (for any reason) of THIS connection, all active orders for
				// the authenticated user account will be canceled.
				// wsSend(privWs, {cmd: 'v1/setcnxopt', args: {opt:'v1/trade_killswitch',value:true}});
				
				wsSend(privWs, {cmd: 'v1/user_account_info'});
				break;
			} else {
				console.log('Authentication failed - double check those API keys!');
			}
			break;

		case 'v1/user_account_info':
			console.log(`Received account info, our verification level is ${d.data.verificationLevel}`);
			break;

		case 'v1/ping':
			wsSend(privWs, {cmd: 'v1/pong'});
			break;
	}
});



// On the public endpoint, we do not need to wait for anything, nor do we need
// to login. We go ahead with whatever we want to do upon connection establishment.
pubWs.on('open', function() {
	setInterval(function() { wsPing('pub');}, 60000);
	console.log('Public WS API endpoint connected - requesting list of instruments');
	wsSend(pubWs, {
		cmd:	'v1/subscribe',
		args:	['v1/instruments']
	});
});

pubWs.on('message', function(data) {
	let d = JSON.parse(data);
	switch (d.cmd) {
		case 'v1/instruments':
			console.log('Received ' + d.data.length + ' trade instruments');
			break;

		case 'v1/ping':
			wsSend(pubWs, {cmd: 'v1/pong'});
			break;
	}
});

function wsSend(sock, data) {
	let msg = false;
	if (sock === pubWs) {
		msg = JSON.stringify(data);
	} else if (sock === privWs) {
		data.sessionToken = sessionToken;
		data.nonce = nonce++;
		msg = JSON.stringify(data);
		let sig = crypto.createHmac('sha384', apiSecret).update(msg).digest('hex');
		msg += `\n${sig}`;
	}
	sock.send(msg);
}
function wsPing(type) {
	wsSend(type === 'pub' ? pubWs : privWs, {cmd: 'v1/ping'});
}
