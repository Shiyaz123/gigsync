const { aiAgent } = require('./backend/ai_agent');
const DB = require('./backend/database');

async function testAvailabilityIntents() {
    console.log('================================================================');
    console.log(' GIGSYNC WORKER AVAILABILITY INTENT VERIFICATION SUITE');
    console.log('================================================================\n');

    const agent = aiAgent;

    // Ensure we have real workers registered
    const totalWorkers = DB.getAllWorkers().length;
    console.log(`Current real database registered workers: ${totalWorkers}\n`);

    const testPhrases = [
        { text: 'available today', desc: 'General availability: available today' },
        { text: 'worker available', desc: 'General availability: worker available' },
        { text: 'I would like to check worker available', desc: 'General availability: I would like to check worker available' },
        { text: 'Anyone available today?', desc: 'General availability: Anyone available today?' },
        { text: 'Is any worker free?', desc: 'General availability: Is any worker free?' },
        { text: 'Who is available now?', desc: 'General availability: Who is available now?' },
        { text: 'Do you have anyone available?', desc: 'General availability: Do you have anyone available?' },
        { text: 'Can I get a worker today?', desc: 'General availability: Can I get a worker today?' },
        { text: 'Is there someone available near me?', desc: 'General availability: Is there someone available near me?' },
        { text: 'Any electrician available?', desc: 'Trade specific: Any electrician available?' },
        { text: 'Is a plumber available today?', desc: 'Trade specific: Is a plumber available today?' }
    ];

    let allPassed = true;

    for (let i = 0; i < testPhrases.length; i++) {
        const item = testPhrases[i];
        const res = await agent.processCallTurn({
            sessionId: `sess_avail_test_${i}`,
            callerPhone: '9876543210',
            callerRole: 'customer',
            callerName: 'Test Caller',
            city: 'Ramanagara',
            speechText: item.text
        });

        // Verify it NEVER returns the generic fallback "I can help you check worker availability, book a specialist..."
        const isGenericFallback = res.spokenResponse.includes('I can help you check worker availability, book a specialist, or post a job');
        const isDatabaseResponse = res.spokenResponse.includes('worker') || res.spokenResponse.includes('specialist') || res.spokenResponse.includes('available');

        if (!isGenericFallback && isDatabaseResponse) {
            console.log(`✅ [TEST ${i + 1}/${testPhrases.length}] PASS: "${item.text}"`);
            console.log(`   Response: "${res.spokenResponse}"\n`);
        } else {
            console.error(`❌ [TEST ${i + 1}/${testPhrases.length}] FAIL: "${item.text}" returned generic fallback!`);
            console.error(`   Response: "${res.spokenResponse}"\n`);
            allPassed = false;
        }
    }

    if (allPassed) {
        console.log('================================================================');
        console.log(' 🏆 ALL WORKER AVAILABILITY INTENTS VERIFIED 100% (0 FALLBACKS)');
        console.log('================================================================');
    } else {
        process.exit(1);
    }
}

testAvailabilityIntents().catch(console.error);
