const http = require('http');

async function sendTurn(sessId, speech) {
    const postData = JSON.stringify({
        sessionId: sessId,
        callerPhone: '9876543210',
        callerRole: 'customer',
        callerName: 'Shiyaz',
        city: 'Ramanagara',
        speechText: speech
    });

    return new Promise((resolve, reject) => {
        const req = http.request({
            hostname: 'localhost',
            port: 8089,
            path: '/api/ai/voice-call',
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(postData)
            }
        }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve(JSON.parse(data)));
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
    });
}

async function runTest() {
    console.log('=== TESTING NATURAL PHONE CONVERSATION LIFECYCLE ===\n');
    const sessionId = 'test_sess_' + Date.now();

    // Turn 1: Caller says Hello
    console.log('CALLER: "Hello"');
    let res = await sendTurn(sessionId, 'Hello');
    console.log('GIGSYNC AI:', res.spokenResponse);
    console.log('ShouldEndCall:', res.shouldEndCall);
    console.log('--------------------------------------------------');

    // Turn 2: Caller requests Washing Machine Repair
    console.log('CALLER: "I need a washing machine repair"');
    res = await sendTurn(sessionId, 'I need a washing machine repair');
    console.log('GIGSYNC AI:', res.spokenResponse);
    console.log('ShouldEndCall:', res.shouldEndCall);
    console.log('--------------------------------------------------');

    // Turn 3: Caller confirms with duplicate STT noise: "yes please post yes please post request"
    console.log('CALLER: "yes please post yes please post request"');
    res = await sendTurn(sessionId, 'yes please post yes please post request');
    console.log('GIGSYNC AI:', res.spokenResponse);
    console.log('Job Created:', res.job ? `#${res.job.id}` : 'None');
    console.log('ShouldEndCall:', res.shouldEndCall);
    console.log('--------------------------------------------------');

    // Turn 4: Caller says Thank you
    console.log('CALLER: "Thank you"');
    res = await sendTurn(sessionId, 'Thank you');
    console.log('GIGSYNC AI:', res.spokenResponse);
    console.log('ShouldEndCall:', res.shouldEndCall);
    console.log('--------------------------------------------------');

    // Turn 5: Caller says Bye
    console.log('CALLER: "Thank you, bye"');
    res = await sendTurn(sessionId, 'Thank you, bye');
    console.log('GIGSYNC AI:', res.spokenResponse);
    console.log('ShouldEndCall:', res.shouldEndCall);
    console.log('--------------------------------------------------');

    console.log('=== TEST COMPLETED SUCCESSFULLY ===');
}

runTest().catch(console.error);
