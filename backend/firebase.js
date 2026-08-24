/* ==========================================================================
   GigSync — Firebase Cloud Firestore Synchronization Layer
   Persists Workers, Customers, Jobs, and Availability to Google Cloud Firestore
   ========================================================================== */

const fs = require('node:fs');
const path = require('node:path');
const https = require('node:https');

const CONFIG_PATH = path.join(__dirname, '..', 'firebase_config.json');

// Default Firebase Configuration (can be overridden via firebase_config.json or ENV)
let firebaseConfig = {
    projectId: process.env.FIREBASE_PROJECT_ID || 'gigsync-tier2-app',
    apiKey: process.env.FIREBASE_API_KEY || '',
    authDomain: process.env.FIREBASE_AUTH_DOMAIN || 'gigsync-tier2-app.firebaseapp.com',
    databaseURL: process.env.FIREBASE_DATABASE_URL || 'https://gigsync-tier2-app.firebaseio.com',
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || 'gigsync-tier2-app.appspot.com'
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
            return resolve({ status: 'skipped', reason: 'No projectId configured' });
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

        const bodyData = JSON.stringify({ fields: firestoreFields });
        const pathName = `/v1/projects/${projectId}/databases/(default)/documents/${collection}/${encodeURIComponent(documentId)}`;

        const options = {
            hostname: 'firestore.googleapis.com',
            port: 443,
            path: pathName,
            method: method,
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(bodyData)
            }
        };

        const req = https.request(options, (res) => {
            let resBody = '';
            res.on('data', chunk => { resBody += chunk; });
            res.on('end', () => {
                if (res.statusCode >= 200 && res.statusCode < 300) {
                    resolve({ status: 'success', statusCode: res.statusCode, collection, documentId });
                } else {
                    resolve({ status: 'error', statusCode: res.statusCode, message: resBody });
                }
            });
        });

        req.on('error', (err) => {
            resolve({ status: 'error', message: err.message });
        });

        req.write(bodyData);
        req.end();
    });
}

const FirebaseSync = {
    getConfig() {
        return firebaseConfig;
    },

    saveConfig(newConfig) {
        firebaseConfig = { ...firebaseConfig, ...newConfig };
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(firebaseConfig, null, 2), 'utf8');
        return firebaseConfig;
    },

    // 1. Sync Worker to Firestore 'workers' collection
    async syncWorker(worker) {
        if (!worker || !worker.id) return;
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

        try {
            const res = await firestoreRequest('workers', docId, 'PATCH', payload);
            console.log(`[Firebase Sync] Worker #${worker.id} (${worker.name}) synced to Firestore collection 'workers'. Result:`, res.status);
            return res;
        } catch (e) {
            console.warn('[Firebase Sync] Worker sync notice:', e.message);
        }
    },

    // 2. Sync Customer to Firestore 'customers' collection
    async syncCustomer(customer) {
        if (!customer || !customer.id) return;
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

        try {
            const res = await firestoreRequest('customers', docId, 'PATCH', payload);
            console.log(`[Firebase Sync] Customer #${customer.id} (${customer.name}) synced to Firestore collection 'customers'. Result:`, res.status);
            return res;
        } catch (e) {
            console.warn('[Firebase Sync] Customer sync notice:', e.message);
        }
    },

    // 3. Sync Job / Booking to Firestore 'jobs' collection
    async syncJob(job) {
        if (!job || !job.id) return;
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

        try {
            const res = await firestoreRequest('jobs', docId, 'PATCH', payload);
            console.log(`[Firebase Sync] Job #${job.id} (${job.service}) synced to Firestore collection 'jobs'. Result:`, res.status);
            return res;
        } catch (e) {
            console.warn('[Firebase Sync] Job sync notice:', e.message);
        }
    }
};

module.exports = FirebaseSync;
