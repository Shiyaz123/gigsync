/* ==========================================================================
   GigSync — Physical Phone & Cellular Audio Bridge (Option 3 / Option 2)
   Connects Real Android Phone Call Audio to GigSync AI Voice Gateway
   ==========================================================================

   HARDWARE SETUP (Option 3 - Analog Loopback Cable):
   1. Connect 3.5mm TRRS Splitter to Android Phone (Headphone Jack or USB-C DAC).
   2. Connect Phone Headphone Out -> Laptop Line-In / USB Sound Card Mic (AI listens to caller).
   3. Connect Laptop Headphone Out -> Phone Microphone In (AI speaks back to caller).
   4. Set Android: Settings -> Accessibility / Calls -> Auto-Answer on Headset.
   5. When anyone calls the SIM number, phone auto-answers, AI talks, updates DB!
   ========================================================================== */

const http = require('node:http');

const GIGSYNC_API = 'http://localhost:8089/api/ai/voice-call';

console.log('===============================================================');
console.log(' GigSync Physical Phone Bridge (Cellular Gateway)');
console.log('===============================================================');
console.log('Ready to receive audio from connected Android Phone / Line-In.');
console.log('API Target:', GIGSYNC_API);
console.log('Tip: You can also use the Live In-Browser Phone Simulator directly');
console.log('on the GigSync website by clicking the "📞 AI Phone Call" button!');
console.log('===============================================================');

async function processPhoneAudioTurn(callerPhone, callerRole, recognizedSpeech) {
    try {
        const res = await fetch(GIGSYNC_API, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                callerPhone,
                callerRole,
                speechText: recognizedSpeech
            })
        });
        const data = await res.json();
        console.log('\n[CALL INCOMING] From:', callerPhone);
        console.log('[CALLER SAID]:', recognizedSpeech);
        console.log('[AI EXECUTED TOOL]:', data.toolExecuted);
        console.log('[AI SPOKEN RESPONSE]:', data.spokenResponse);
        return data;
    } catch (err) {
        console.error('Phone Bridge Error:', err.message);
    }
}

module.exports = { processPhoneAudioTurn };
