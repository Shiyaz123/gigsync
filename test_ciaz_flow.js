const { aiAgent } = require('./backend/ai_agent');
const DB = require('./backend/database');
const assert = require('assert');

async function testCiazRegistrationFlow() {
    console.log('--- Testing Ciaz Multi-Turn Voice Registration Flow ---');

    const session = {
        callerPhone: null,
        callerRole: 'worker',
        city: 'Ramanagara',
        history: [],
        context: {}
    };

    // Turn 1: "hello"
    console.log('\nTurn 1 Input: "hello"');
    const r1 = await aiAgent.processTurn(session, "hello");
    console.log('Turn 1 Output:', r1.spokenResponse);
    assert(!r1.spokenResponse.includes("can't reach the GigSync assistant service"), "No outage on greeting");

    // Turn 2: "I am an electrician I am available tomorrow 9 to 5"
    console.log('\nTurn 2 Input: "I am an electrician I am available tomorrow 9 to 5"');
    const r2 = await aiAgent.processTurn(session, "I am an electrician I am available tomorrow 9 to 5");
    console.log('Turn 2 Output:', r2.spokenResponse);
    assert(r2.spokenResponse.toLowerCase().includes('name'), "Should prompt for name");

    // Turn 3: "ciaz"
    console.log('\nTurn 3 Input: "ciaz"');
    const r3 = await aiAgent.processTurn(session, "ciaz");
    console.log('Turn 3 Output:', r3.spokenResponse);
    console.log('Session Context workerDraft:', session.context.workerDraft);

    let r4;
    if (r3.spokenResponse.toLowerCase().includes('phone') || r3.spokenResponse.toLowerCase().includes('mobile') || r3.spokenResponse.toLowerCase().includes('number')) {
        // AI directly asked for phone number
        console.log('\nTurn 4 Input: "9876543210"');
        r4 = await aiAgent.processTurn(session, "9876543210");
        console.log('Turn 4 Output:', r4.spokenResponse);
        assert(r4.spokenResponse.toLowerCase().includes('ciaz'), 'Should summarize details with name Ciaz');

        // Turn 5: "yes please"
        console.log('\nTurn 5 Input: "yes please"');
        const r5 = await aiAgent.processTurn(session, "yes please");
        console.log('Turn 5 Output:', r5.spokenResponse);
        assert(r5.spokenResponse.toLowerCase().includes('done') || r5.spokenResponse.toLowerCase().includes('saved') || r5.spokenResponse.toLowerCase().includes('registered'), 'Should confirm registration');
    } else {
        // If it asked for confirmation, say "yes please"
        console.log('\nTurn 4 Input: "yes please"');
        r4 = await aiAgent.processTurn(session, "yes please");
        console.log('Turn 4 Output:', r4.spokenResponse);
        assert(r4.spokenResponse.toLowerCase().includes('phone') || r4.spokenResponse.toLowerCase().includes('mobile') || r4.spokenResponse.toLowerCase().includes('number'), 'Must prompt for phone number before saving');

        // Turn 5: "9876543210"
        console.log('\nTurn 5 Input: "9876543210"');
        const r5 = await aiAgent.processTurn(session, "9876543210");
        console.log('Turn 5 Output:', r5.spokenResponse);

        // Turn 6: "yes please"
        console.log('\nTurn 6 Input: "yes please"');
        const r6 = await aiAgent.processTurn(session, "yes please");
        console.log('Turn 6 Output:', r6.spokenResponse);
        assert(r6.spokenResponse.toLowerCase().includes('done') || r6.spokenResponse.toLowerCase().includes('saved') || r6.spokenResponse.toLowerCase().includes('registered'), 'Should confirm registration');
    }

    // Verify DB
    const saved = DB.getWorkerByPhone('9876543210');
    assert(saved, 'Worker 9876543210 must exist in DB');
    assert.strictEqual(saved.name, 'Ciaz', 'Worker name must be Ciaz');
    assert(/Electric/i.test(saved.trade), 'Worker trade must be Electrician/Electrical');
    console.log('\n✅ DB Record Verified:', saved);
    console.log('🎉 Ciaz registration flow passed with 100% success!');
}

testCiazRegistrationFlow().catch(e => {
    console.error('❌ Test failed:', e);
    process.exit(1);
});
