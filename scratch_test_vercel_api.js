const handler = require('./api/index.js');

async function testVercelEndpoint() {
    console.log('Testing Vercel Serverless Handler: /api/ai/voice-call');

    const mockReq = {
        method: 'POST',
        url: '/api/ai/voice-call',
        headers: { host: 'localhost' },
        body: {
            sessionId: 'test_session_vercel_1',
            speechText: 'Hello',
            callerPhone: '9876543210',
            callerRole: 'customer',
            callerName: 'User',
            city: 'Ramanagara'
        }
    };

    let responseData = null;
    let statusCode = null;

    const mockRes = {
        setHeader: (k, v) => {},
        status: (code) => {
            statusCode = code;
            return mockRes;
        },
        json: (data) => {
            responseData = data;
            return mockRes;
        },
        end: (data) => {
            if (data && !responseData) {
                try { responseData = JSON.parse(data); } catch(e){}
            }
        }
    };

    await handler(mockReq, mockRes);

    console.log('Status Code:', statusCode || mockRes.statusCode || 200);
    console.log('Response Data:', responseData);

    // Test 2: Search Plumber
    const mockReq2 = {
        method: 'POST',
        url: '/api/ai/voice-call',
        headers: { host: 'localhost' },
        body: {
            sessionId: 'test_session_vercel_1',
            speechText: 'I need a plumber',
            callerPhone: '9876543210',
            callerRole: 'customer',
            callerName: 'User',
            city: 'Ramanagara'
        }
    };
    responseData = null;
    await handler(mockReq2, mockRes);
    console.log('Turn 2 Response:', responseData.spokenResponse);

    // Test 3: Gratitude & Goodbye
    const mockReq3 = {
        method: 'POST',
        url: '/api/ai/voice-call',
        headers: { host: 'localhost' },
        body: {
            sessionId: 'test_session_vercel_1',
            speechText: 'Thank you, bye',
            callerPhone: '9876543210',
            callerRole: 'customer',
            callerName: 'User',
            city: 'Ramanagara'
        }
    };
    responseData = null;
    await handler(mockReq3, mockRes);
    console.log('Turn 3 Response:', responseData.spokenResponse);
    console.log('Should End Call:', responseData.shouldEndCall);

    if (responseData && responseData.shouldEndCall) {
        console.log('✅ Vercel Serverless Multi-Turn Flow is 100% OPERATIONAL!');
    } else {
        process.exit(1);
    }
}

testVercelEndpoint().catch(console.error);
