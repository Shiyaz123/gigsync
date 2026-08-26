const { aiAgent } = require('./backend/ai_agent');
const DB = require('./backend/database');
const assert = require('assert');

async function testUserTranscript() {
    console.log('Testing User Transcript Flow:\n');

    const session = {
        callerPhone: null,
        callerRole: 'worker',
        city: 'Ramanagara',
        history: [],
        context: {}
    };

    // Turn 1: "yes please"
    console.log('Turn 1 Input: "yes please"');
    const r1 = await aiAgent.processTurn(session, "yes please");
    console.log('Turn 1 Output:', r1.spokenResponse, '\n');
    assert(!r1.spokenResponse.includes("can't reach the GigSync assistant service"), "Should not return outage error");

    // Turn 2: "hello"
    console.log('Turn 2 Input: "hello"');
    const r2 = await aiAgent.processTurn(session, "hello");
    console.log('Turn 2 Output:', r2.spokenResponse, '\n');
    assert(!r2.spokenResponse.includes("can't reach the GigSync assistant service"), "Should not return outage error");

    // Turn 3: "my number is 70 122 8069 5 I would like to add me a cliteration I am any literation"
    console.log('Turn 3 Input: "my number is 70 122 8069 5 I would like to add me a cliteration I am any literation"');
    const r3 = await aiAgent.processTurn(session, "my number is 70 122 8069 5 I would like to add me a cliteration I am any literation");
    console.log('Turn 3 Output:', r3.spokenResponse, '\n');
    assert(!r3.spokenResponse.includes("can't reach the GigSync assistant service"), "Should not return outage error");
    assert(r3.spokenResponse.toLowerCase().includes('register') || r3.spokenResponse.toLowerCase().includes('electr') || r3.spokenResponse.toLowerCase().includes('name') || r3.spokenResponse.toLowerCase().includes('hours'), 'Should prompt for confirmation or details');

    // Turn 4: Caller confirms "Yes"
    console.log('Turn 4 Input: "Yes"');
    const r4 = await aiAgent.processTurn(session, "Yes");
    console.log('Turn 4 Output:', r4.spokenResponse, '\n');
    assert(!r4.spokenResponse.includes("can't reach the GigSync assistant service"), "Should not return outage error");

    console.log('\n🎉 All turns passed smoothly without any outages!');
}

testUserTranscript().catch(e => {
    console.error('❌ Test failed:', e);
    process.exit(1);
});
