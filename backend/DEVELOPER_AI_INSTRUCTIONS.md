# 🤖 GigSync System Prompt & AI Agent Development Instructions

Use the contents of this file to prime any AI Agent or Coding Assistant working on the **GigSync** codebase. It outlines the architecture, data models, solved edge cases, and testing pipelines.

---

## 1. System Architecture Overview
* **Web UI (Frontend):** 
  * Single-page interface in `index.html` styled with vanilla CSS in `styles.css`.
  * State management and UI event handlers (including Web Speech API audio transcription) in `app.js`.
* **Backend Gateway (Node.js on Port 8089):**
  * Configured in `backend/server.js`.
  * Exposes REST endpoints (`/api/ai/voice-call`, `/api/ai/reset-session`, `/api/auth/*`).
* **Semantic NLU Microservice (Python on Port 8091):**
  * Spawns automatically on Node start (`backend/nlu_server.py`).
  * Uses `sentence-transformers/all-MiniLM-L6-v2` to match spoken trade descriptions to standard taxonomies (`backend/taxonomy.json`).
* **Database Layer:**
  * Uses Node's experimental native `node:sqlite` module to persist profiles and bookings in `gigsync.db`.
  * Dual Sync: Synchronizes SQLite table updates to Google Cloud Firestore REST API (`backend/firebase.js`).

---

## 2. Crucial Dialogue Design Patterns & Solved Bugs

When editing dialogue trees (`processCustomerTurn` / `processWorkerTurn`), ensure the following behaviors are maintained:

### A. Session Isolation (No State Bleed)
* **Rule:** Anonymous callers (guest visitors) must *never* share a single state key (like `'default_session'`).
* **Implementation:** `ConversationSessionManager.getSession()` generates a unique random key (`anon_sess_...`) if no phone number or session ID exists.

### B. Interactive Location Slot-Filling
* **Rule:** Do not default callers to `'Ramanagara'` (or any city). Default city states to `null`.
* **Implementation:** If a customer checks availability or books a service but their city is unknown, prompt: *"Which city or area do you need the service in?"*. Save `pendingIntent` as `'ask_city_for_booking'` or `'ask_city_for_availability'` and resume confirmation on the subsequent turn.

### C. Prioritized Preposition Extraction
* **Rule:** If the user text contains multiple locations (e.g., *"I need in Kanakapura, who said Ramanagara?"*), prioritize the one linked directly to a preposition (`in`, `at`, `near`).
* **Implementation:** `extractLocationEntity` checks preposition regexes first before falling back to full-sentence string searches.

### D. Real-Time Location Correction
* **Rule:** If the user corrects their location during booking confirmation, apologize, update the session city, query the new city's workers, and re-prompt for confirmation without crashing or falling back to the LLM.
* **Implementation:** Add location correction checks directly inside the `'confirm_booking'` intent handler in `processCustomerTurn`.

### E. Web Speech API Recovery
* **Rule:** If the Web Speech API throws a temporary network delay error, the mic must not permanently lock out the user.
* **Implementation:** Reset `speechRecNetworkBlocked = false` at the beginning of `startAiModalListening()` in `app.js` to ensure subsequent clicks recover listening.

---

## 3. How to Resolve the Firestore API Sync Error

If the backend log prints:
> `Cloud Firestore API has not been used in project gigsync-app-tier2 before or it is disabled.`

Follow these manual steps (API enablement is external and cannot be executed by the code agent):
1. Open the Google Cloud Console: https://console.developers.google.com/
2. Select your project: `gigsync-app-tier2` (or the active project ID).
3. Search for **Cloud Firestore API** in the API library.
4. Click **Enable**.
5. Once enabled, restart the Node server. SQLite updates will now sync successfully to Firestore.

---

## 4. Regression Testing Verification
Every time you make modifications to the dialogue loops or agent parsing logic, always verify the integrity of the system by running the regression test suite:
```bash
node tests/regression.js
```
All 12 tests (covering isolation, semantic mapping, interactive locations, and correction flows) must pass successfully before committing code.
