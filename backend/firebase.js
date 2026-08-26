/* ==========================================================================
   GigSync — Firebase Cloud Firestore Synchronization Layer
   Persists Workers, Customers, Jobs, and Availability to Google Cloud Firestore
   ========================================================================== */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const CONFIG_PATH = path.join(__dirname, '..', 'firebase_config.json');

// Default Firebase Configuration.
// NOTE: the real project is 'gigsync-app-tier2' (see firebase_config.json). The old default here
// was 'gigsync-tier2-app', a project that does not exist — so any environment without the config
// file silently wrote to nowhere.
let firebaseConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID || 'gigsync-app-tier2',
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'gigsync-app-tier2.firebaseapp.com',
    databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://gigsync-app-tier2.firebaseio.com',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'gigsync-app-tier2.appspot.com'
};

// Load config file if present
if (fs.existsSync(CONFIG_PATH)) {
    try {
        const fileContent = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        firebaseConfig = { ...firebaseConfig, ...fileContent };
    } catch (e) {
        console.warn('[Firebase] Could not parse firebase_config.json:', e.message);
    }
}

// REST API Helper for Cloud Firestore
function firestoreRequest(collection, documentId, method = 'PATCH', documentData = {}) {
    return new Promise((resolve) => {
        if (!firebaseConfig.projectId) {
            return resolve({ status: 'skipped', ok: false, message: 'No projectId configured', collection, documentId });
        }

        const projectId = firebaseConfig.projectId;
        const firestoreFields = {};

        // Convert JS object to Firestore typed format
        for (const [key, val] of Object.entries(documentData)) {
            if (typeof val === 'string') {
                firestoreFields[key] = { stringValue: val };
            } else if (typeof val === 'number') {
                if (Number.isInteger(val)) firestoreFields[key] = { integerValue: String(val) };
                else firestoreFields[key] = { doubleValue: val };
            } else if (typeof val === 'boolean') {
                firestoreFields[key] = { booleanValue: val };
            } else if (val === null || val === undefined) {
                firestoreFields[key] = { nullValue: null };
            } else {
                firestoreFields[key] = { stringValue: JSON.stringify(val) };
            }
        }

        const apiKeyParam = firebaseConfig.apiKey ? `?key=${encodeURIComponent(firebaseConfig.apiKey)}` : '';
        const isWrite = method !== 'GET';
        const bodyData = isWrite ? JSON.stringify({ fields: firestoreFields }) : null;
        const pathName = `/v1/projects/${projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(documentId)}${apiKeyParam}`;

        const options = {
            hostname: 'firestore.googleapis.com',
            port: 443,
            path: pathName,
            method: method,
            headers: isWrite
                ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(bodyData) }
                : { 'Content-Type': 'application/json' }
        };

        const req = https.request(options, (res) => {
            let resBody = '';
            res.on('data', chunk => { resBody += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    let parsed = null;
                    try { parsed = JSON.parse(resBody); } catch (_) {}
                    resolve({ status: 'success', ok: true, statusCode: res.statusCode, collection, documentId, document: parsed });
                } else {
                    // Surface the reason. A 403 "Cloud Firestore API has not been used in project ..."
                    // means the database was never enabled — the caller must be able to see that.
                    let reason = resBody;
                    try {
                        const parsed = JSON.parse(resBody);
                        if (parsed && parsed.error && parsed.error.message) reason = parsed.error.message;
                    } catch (_) {}
                    resolve({ status: 'error', ok: false, statusCode: res.statusCode, message: reason, collection, documentId });
                }
            });
        });

        req.on('error', (err) => {
            resolve({ status: 'error', ok: false, message: err.message, collection, documentId });
        });

        if (isWrite) req.write(bodyData);
        req.end();
    });
}

// Convert a Firestore typed document back into a plain JS object.
function decodeFirestoreDocument(doc) {
    if (!doc || !doc.fields) return null;
    const out = {};
    for (const [key, wrapper] of Object.entries(doc.fields)) {
        if ('stringValue' in wrapper) out[key] = wrapper.stringValue;
        else if ('integerValue' in wrapper) out[key] = Number(wrapper.integerValue);
        else if ('doubleValue' in wrapper) out[key] = Number(wrapper.doubleValue);
        else if ('booleanValue' in wrapper) out[key] = wrapper.booleanValue;
        else if ('nullValue' in wrapper) out[key] = null;
        else out[key] = wrapper;
    }
    return out;
}

const localSnapshotStore = {
    workers: {},
    customers: {},
    jobs: {},
    worker_availability: {}
};

const FirebaseSync = {
    getConfig() {
        return firebaseConfig;
    },

    saveConfig(newConfig) {
        firebaseConfig = { ...firebaseConfig, ...newConfig };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(firebaseConfig, null, 2), 'utf8');
        return firebaseConfig;
    },

    // LOCAL cache of the last payload we attempted to send. This is NOT proof that anything
    // reached Cloud Firestore — it is populated before the network call and stays populated
    // even when the write fails. Use readDocument() to verify a real Firestore record.
    getDocument(collection, docId) {
        return localSnapshotStore[collection]?.[docId] || null;
    },

    getLocalSnapshot(collection, docId) {
        return localSnapshotStore[collection]?.[docId] || null;
    },

    // REAL verification: GET the document back from Cloud Firestore over the wire.
    async readDocument(collection, docId) {
        const res = await firestoreRequest(collection, docId, 'GET');
        if (res.ok) {
            return { ok: true, statusCode: res.statusCode, collection, documentId: docId, data: decodeFirestoreDocument(res.document) };
        }
        return { ok: false, statusCode: res.statusCode || 0, collection, documentId: docId, data: null, message: res.message };
    },

    // 1. Sync Worker to Firestore 'workers' collection
    async syncWorker(worker) {
        if (!worker || !worker.id) {
            return { status: 'skipped', ok: false, message: 'No worker record supplied to syncWorker.' };
        }
        const docId = `worker_${worker.id}_${worker.phone}`;
        const payload = {
            workerId: Number(worker.id),
            name: worker.name,
            phone: worker.phone,
            trade: worker.trade,
            service: worker.service,
            skills: worker.skills || '',
            tools: worker.tools || '',
            rating: Number(worker.rating || 5.0),
            price: Number(worker.price || 300),
            jobs_completed: Number(worker.jobs_completed || 0),
            is_available: Boolean(worker.is_available),
            is_verified: Boolean(worker.is_verified),
            city: worker.city || 'Ramanagara',
            area: worker.area || 'Town',
            service_areas: worker.service_areas || `${worker.city}, Nearby Areas`,
            about: worker.about || '',
            updated_at: new Date().toISOString()
        };
        localSnapshotStore.workers[docId] = payload;

        try {
            const res = await firestoreRequest('workers', docId, 'PATCH', payload);
            console.log(`[Firebase Sync] Worker #${worker.id} (${worker.name}) synced to Firestore collection 'workers'. Result:`, res.status, res.ok ? '' : `-> ${String(res.message || '').slice(0, 200)}`);
            return res;
        } catch (e) {
            console.warn('[Firebase Sync] Worker sync failed:', e.message);
            return { status: 'error', ok: false, message: e.message, collection: 'workers', documentId: docId };
        }
    },

    // 2. Sync Customer to Firestore 'customers' collection
    async syncCustomer(customer) {
        if (!customer || !customer.id) {
            return { status: 'skipped', ok: false, message: 'No customer record supplied to syncCustomer.' };
        }
        const docId = `customer_${customer.id}_${customer.phone}`;
        const payload = {
            customerId: Number(customer.id),
            name: customer.name,
            phone: customer.phone,
            email: customer.email || '',
            city: customer.city || 'Ramanagara',
            area: customer.area || 'Town',
            updated_at: new Date().toISOString()
        };
        localSnapshotStore.customers[docId] = payload;

        try {
            const res = await firestoreRequest('customers', docId, 'PATCH', payload);
            console.log(`[Firebase Sync] Customer #${customer.id} (${customer.name}) synced to Firestore collection 'customers'. Result:`, res.status, res.ok ? '' : `-> ${String(res.message || '').slice(0, 200)}`);
            return res;
        } catch (e) {
            console.warn('[Firebase Sync] Customer sync failed:', e.message);
            return { status: 'error', ok: false, message: e.message, collection: 'customers', documentId: docId };
        }
    },

    // 3. Sync Job / Booking to Firestore 'jobs' collection
    async syncJob(job) {
        if (!job || !job.id) {
            return { status: 'skipped', ok: false, message: 'No job record supplied to syncJob.' };
        }
        const docId = `job_${job.id}`;
        const payload = {
            jobId: String(job.id),
            customer_phone: job.customer_phone,
            customer_name: job.customer_name,
            worker_id: job.worker_id ? Number(job.worker_id) : 0,
            worker_name: job.worker_name || 'Broadcasting',
            service: job.service,
            problem_description: job.problem_description,
            location: job.location,
            city: job.city,
            requested_date: job.requested_date,
            requested_time: job.requested_time,
            budget: job.budget,
            final_price: job.final_price ? Number(job.final_price) : 350,
            status: job.status || 'Requested',
            payment_status: job.payment_status || 'Pending',
            payment_method: job.payment_method || 'Cash',
            created_at: job.created_at || new Date().toISOString()
        };
        localSnapshotStore.jobs[docId] = payload;

        try {
            const res = await firestoreRequest('jobs', docId, 'PATCH', payload);
            console.log(`[Firebase Sync] Job #${job.id} (${job.service}) synced to Firestore collection 'jobs'. Result:`, res.status, res.ok ? '' : `-> ${String(res.message || '').slice(0, 200)}`);
            return res;
        } catch (e) {
            console.warn('[Firebase Sync] Job sync failed:', e.message);
            return { status: 'error', ok: false, message: e.message, collection: 'jobs', documentId: docId };
        }
    },

    // 4. Sync Worker Availability Slot to Firestore 'worker_availability' collection
    async syncAvailability(slot) {
        if (!slot || !slot.id) {
            return { status: 'skipped', ok: false, message: 'No availability slot supplied to syncAvailability.' };
        }
        const docId = `avail_${slot.id}_${slot.worker_phone}`;
        const payload = {
            slotId: Number(slot.id),
            workerId: slot.worker_id ? Number(slot.worker_id) : 0,
            workerPhone: slot.worker_phone,
            trade: slot.trade,
            dateStr: slot.date_str,
            startTime: slot.start_time,
            endTime: slot.end_time,
            isAvailable: Boolean(slot.is_available),
            notes: slot.notes || '',
            updated_at: new Date().toISOString()
        };
        localSnapshotStore.worker_availability[docId] = payload;

        try {
            const res = await firestoreRequest('worker_availability', docId, 'PATCH', payload);
            console.log(`[Firebase Sync] Availability slot #${slot.id} synced to Firestore collection 'worker_availability'. Result:`, res.status, res.ok ? '' : `-> ${String(res.message || '').slice(0, 200)}`);
            return res;
        } catch (e) {
            console.warn('[Firebase Sync] Availability sync failed:', e.message);
            return { status: 'error', ok: false, message: e.message, collection: 'worker_availability', documentId: docId };
        }
    }
};

module.exports = FirebaseSync;
