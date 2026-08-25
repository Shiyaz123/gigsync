console.log('================================================================');
console.log(' GIGSYNC 3-LAYER ECHO SUPPRESSION TEST SUITE');
console.log('================================================================\n');

const recentAiResponses = [
    { text: 'Hello! Welcome to GigSync. How may I help you today?', time: Date.now() - 2000 },
    { text: 'I couldn\'t find any registered Plumbing specialists available in Ramanagara right now.', time: Date.now() - 5000 }
];

function isAiSelfEcho(callerText) {
    if (!callerText) return false;
    const cClean = callerText.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
    const cTokens = cClean.split(/\s+/).filter(Boolean);
    if (cTokens.length === 0) return false;

    for (const item of recentAiResponses) {
        if (Date.now() - item.time < 15000) {
            const aiClean = item.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
            const aiTokens = aiClean.split(/\s+/).filter(Boolean);
            if (aiTokens.length === 0) continue;

            if (aiClean.includes(cClean) || (cClean.length > 8 && aiClean.includes(cClean.slice(0, Math.floor(cClean.length * 0.8))))) {
                return true;
            }

            let matches = 0;
            for (const token of cTokens) {
                if (aiTokens.includes(token)) matches++;
            }
            const overlapRatio = matches / cTokens.length;
            if (overlapRatio >= 0.50 && cTokens.length >= 2) {
                return true;
            }
        }
    }
    return false;
}

const testCases = [
    { input: 'hello welcome to GigSync how may I help you today', expectedEcho: true, desc: 'Exact leak of AI greeting' },
    { input: 'welcome to GigSync how may I help', expectedEcho: true, desc: 'Substring leak of AI greeting' },
    { input: 'couldnt find any registered plumbing specialists', expectedEcho: true, desc: 'Partial leak of AI search response' },
    { input: 'I need an electrician for my fan', expectedEcho: false, desc: 'Real user request (electrician)' },
    { input: 'Can you please post a job in Ramanagara', expectedEcho: false, desc: 'Real user request (job post)' },
    { input: 'Yes please confirm', expectedEcho: false, desc: 'Real user confirmation' },
    { input: 'Thank you bye', expectedEcho: false, desc: 'Real user goodbye' }
];

let allPassed = true;
testCases.forEach((tc, idx) => {
    const isEcho = isAiSelfEcho(tc.input);
    const passed = isEcho === tc.expectedEcho;
    if (passed) {
        console.log(`✅ [TEST ${idx + 1}/${testCases.length}] PASS: ${tc.desc} (isEcho = ${isEcho})`);
    } else {
        console.error(`❌ [TEST ${idx + 1}/${testCases.length}] FAIL: ${tc.desc} (expected ${tc.expectedEcho}, got ${isEcho})`);
        allPassed = false;
    }
});

if (allPassed) {
    console.log('\n================================================================');
    console.log(' 🏆 ALL ECHO SUPPRESSION TESTS PASSED 100%');
    console.log('================================================================');
} else {
    process.exit(1);
}
