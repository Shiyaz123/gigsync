const http = require('http');

async function sendTurn(sessId, speech, callerPhone = '9876543210', callerRole = 'customer', callerName = 'User', city = 'Ramanagara') {
    const postData = JSON.stringify({
        sessionId: sessId,
        callerPhone,
        callerRole,
        callerName,
        city,
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

async function runAll20Tests() {
    console.log('================================================================');
    console.log(' GIGSYNC 20-SCENARIO VERIFICATION TEST SUITE (REAL DB & VOICE)');
    console.log('================================================================\n');

    let passCount = 0;

    function recordTest(num, name, condition) {
        if (condition) {
            passCount++;
            console.log(`✅ [TEST ${num}/20] PASS: ${name}`);
        } else {
            console.log(`❌ [TEST ${num}/20] FAIL: ${name}`);
        }
    }

    // Test 1: Hello
    let r1 = await sendTurn('t1', 'Hello.');
    recordTest(1, 'Greeting', r1.spokenResponse && r1.spokenResponse.includes('Hello! Welcome to GigSync'));

    // Test 2: "I need a plumber."
    let r2 = await sendTurn('t2', 'I need a plumber.');
    recordTest(2, 'Search plumber', r2.spokenResponse && (r2.spokenResponse.includes('plumber') || r2.spokenResponse.includes('Plumbing')));

    // Test 3: "Is anyone available now?"
    let r3 = await sendTurn('t3', 'Is anyone available now?');
    recordTest(3, 'General Availability', !!r3.spokenResponse);

    // Test 4: "Can you post a job?"
    let s4 = 't4_session_' + Date.now();
    let r4 = await sendTurn(s4, 'Can you post a job for Washing Machine Repair?');
    recordTest(4, 'Prepare job post', r4.spokenResponse && r4.spokenResponse.includes('prepared a Washing Machine Repair job'));

    // Test 5: "Yes, post it."
    let r5 = await sendTurn(s4, 'Yes, post it.');
    recordTest(5, 'Confirm job post', r5.spokenResponse && r5.spokenResponse.includes('posted'));

    // Test 6: "What's my booking tomorrow?"
    let r6 = await sendTurn('t6', "What's my booking tomorrow?");
    recordTest(6, 'Check bookings', !!r6.spokenResponse);

    // Test 7: "Who accepted my request?"
    let r7 = await sendTurn(s4, "Who accepted my request?");
    recordTest(7, 'Tracking status', r7.spokenResponse && r7.spokenResponse.includes('Washing Machine Repair'));

    // Test 8: "Cancel my booking."
    let r8 = await sendTurn(s4, "Cancel my booking.");
    let r8_conf = await sendTurn(s4, "Yes cancel it.");
    recordTest(8, 'Cancel booking', r8_conf.spokenResponse && r8_conf.spokenResponse.includes('cancelled'));

    // Test 9: "Thank you."
    let r9 = await sendTurn('t9', "Thank you.");
    recordTest(9, 'Gratitude stay open', r9.spokenResponse && r9.spokenResponse.includes("You're welcome") && !r9.shouldEndCall);

    // Test 10: "Thank you, bye."
    let r10 = await sendTurn('t10', "Thank you, bye.");
    recordTest(10, 'Goodbye end call', r10.spokenResponse && r10.shouldEndCall);

    // Test 11: Kannada natural request
    let r11 = await sendTurn('t11', "Nanage electrician beku Ramanagara alli");
    recordTest(11, 'Kannada electrician', r11.spokenResponse && (r11.spokenResponse.includes('Electrician') || r11.spokenResponse.includes('electrician') || r11.spokenResponse.includes('Electrical')));

    // Test 12: Mixed Kannada-English
    let r12 = await sendTurn('t12', "I need an electrician naale morning");
    recordTest(12, 'Mixed Kanglish electrician', r12.spokenResponse && (r12.spokenResponse.includes('Electrician') || r12.spokenResponse.includes('Electrical')));

    // Test 13: Worker availability query
    let r13 = await sendTurn('t13', "Am I available tomorrow?", '9876543210', 'worker', 'Ramesh Kumar');
    recordTest(13, 'Worker availability query', !!r13.spokenResponse);

    // Test 14: Worker earnings
    let r14 = await sendTurn('t14', "How much have I earned?", '9876543210', 'worker', 'Ramesh Kumar');
    recordTest(14, 'Worker earnings query', r14.spokenResponse && (r14.spokenResponse.includes('earned') || r14.spokenResponse.includes('recorded earnings')));

    // Test 15: Trade with 0 workers in DB
    let r15 = await sendTurn('t15', "I need an AC and fridge repair technician right now");
    recordTest(15, 'Zero worker truth', r15.spokenResponse && (r15.spokenResponse.includes("couldn't find") || r15.spokenResponse.includes("post an open job")));

    // Test 16: Zero booking fresh user
    let r16 = await sendTurn('t16', "What bookings do I have?", '9111222333', 'customer', 'New Customer');
    recordTest(16, 'Zero booking truth', r16.spokenResponse && r16.spokenResponse.includes("don't have any bookings"));

    // Test 17: Unsupported feature
    let r17 = await sendTurn('t17', "Can I make online payment with UPI or credit card?");
    recordTest(17, 'Unsupported feature truth', r17.spokenResponse && (r17.spokenResponse.includes("cash") || r17.spokenResponse.includes("upcoming update")));

    // Test 18: Off-topic query
    let r18 = await sendTurn('t18', "What is the capital of France?");
    recordTest(18, 'Off-topic refocus', r18.spokenResponse && r18.spokenResponse.includes("GigSync"));

    // Test 19: Repeated STT Noise deduplication in multi-turn job post
    let s19 = 't19_session_' + Date.now();
    await sendTurn(s19, 'Can you post a job for Electrical repair?');
    let r19 = await sendTurn(s19, 'yes please post yes please post request');
    recordTest(19, 'STT noise deduplication', r19.spokenResponse && r19.spokenResponse.includes('posted'));

    // Test 20: General knowledge
    let r20 = await sendTurn('t20', "What is GigSync and how does it work?");
    recordTest(20, 'General platform info', r20.spokenResponse && r20.spokenResponse.includes("GigSync is an on-demand"));

    console.log('\n================================================================');
    console.log(` 🏆 TOTAL SCORE: ${passCount}/20 TESTS PASSED (${(passCount/20)*100}%)`);
    console.log('================================================================');
}

runAll20Tests().catch(console.error);
