const http = require('node:http');

async function testVercelHandlerDirectly() {
    const handler = require('./api/index.js');

    const req = {
        method: 'POST',
        url: '/api/ai/voice-call',
        headers: {
            host: 'localhost',
            'content-type': 'application/json'
        },
        body: {
            sessionId: 'test_sess_live_trace',
            callerPhone: '9845012345',
            callerRole: 'worker',
            callerName: 'Rajesh',
            city: 'Ramanagara',
            speechText: 'Rajesh I am an electrician I am available tomorrow from 6 to 5'
        }
    };

    let responseData = null;
    let statusCode = null;

    const res = {
        statusCode: 200,
        headers: {},
        setHeader(k, v) { this.headers[k] = v; },
        writeHead(code, headers) { this.statusCode = code; Object.assign(this.headers, headers || {}); },
        end(chunk) {
            if (chunk) {
                try {
                    responseData = JSON.parse(chunk);
                } catch (e) {
                    responseData = chunk;
                }
            }
        }
    };

    console.log('Testing handler with:', req.body.speechText);
    await handler(req, res);
    console.log('Status Code:', res.statusCode);
    console.log('Response Data:', responseData);
}

testVercelHandlerDirectly().catch(console.error);
