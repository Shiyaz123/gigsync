"""
=============================================================================
 GigSync Physical Phone Bridge (Method 1 - Cellular GSM Gateway)
 Real-time bidirectional audio routing between Android Phone and GigSync AI
=============================================================================
"""

import sys
import json
import urllib.request
import time

GIGSYNC_API = "http://localhost:8089/api/ai/voice-call"

print("=" * 65)
print("  GIGSYNC CELLULAR PHONE BRIDGE (METHOD 1)")
print("  Android Phone + SIM + 3.5mm Hardware Splitter Loopback")
print("=" * 65)
print(f"Target Server: {GIGSYNC_API}")
print("Status: Ready to process cellular calls.\n")

def process_call(caller_phone, caller_role, speech_text):
    """
    Sends recognized speech from phone audio to GigSync AI Telephony engine.
    """
    payload = json.dumps({
        "callerPhone": caller_phone,
        "callerRole": caller_role,
        "speechText": speech_text
    }).encode("utf-8")

    req = urllib.request.Request(
        GIGSYNC_API,
        data=payload,
        headers={"Content-Type": "application/json"}
    )

    try:
        with urllib.request.urlopen(req) as response:
            res_data = json.loads(response.read().decode("utf-8"))
            print("\n[CALL DETECTED] From:", caller_phone)
            print(f"[CALLER SPOKE]: \"{speech_text}\"")
            print(f"[AI TOOL EXECUTED]: {res_data.get('toolExecuted')}")
            print(f"[DATABASE ACTION]: {json.dumps(res_data.get('toolResult', {}), indent=2)}")
            print(f"[AI SPOKEN RESPONSE]: \"{res_data.get('spokenResponse')}\"\n")
            return res_data
    except Exception as e:
        print(f"[ERROR] Could not reach GigSync backend: {e}")
        return None

if __name__ == "__main__":
    print("Testing pipeline with a sample incoming worker call...")
    time.sleep(1)
    process_call(
        caller_phone="9845011223",
        caller_role="worker",
        speech_text="I am an electrician. I am available tomorrow from 10 AM to 2 PM."
    )
