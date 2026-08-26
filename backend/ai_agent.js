/* ==========================================================================
   GigSync — Context-Aware & Database-First AI Voice Agent Engine
   Unified Google Gemini API Brain · Verified Real Database Tools
   ========================================================================== */

const fs = require('node:fs');
const path = require('node:path');

// Auto-load .env if present (strictly server-side, never exposed to client)
const envPath = path.join(__dirname, '..', '.env');
if (fs.existsSync(envPath)) {
    try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        for (const line of envContent.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
                const [k, ...v] = trimmed.split('=');
                const key = k.trim();
                const val = v.join('=').trim().replace(/^["']|["']$/g, '');
                if (!process.env[key]) {
                    process.env[key] = val;
                }
            }
        }
    } catch(e){}
}

const { GoogleGenAI } = require('@google/genai');
const DB = require('./database');

// 1. Definition of Real Database Tools (No Assumptions, No Fabricated Records)
const AI_TOOLS = {
    // 1. Register or Update Worker Profile in Verified Database & Firebase
    registerWorkerProfile({ name, phone, trade = 'Skilled Specialist', city = 'Ramanagara', area = 'Town', tools = 'Standard tool kit', price = 300, experienceYears = 2 }) {
        const cleanPhone = (phone || '').replace(/\D/g, '');
        const worker = DB.registerWorkerProfile({
            name,
            phone: cleanPhone,
            trade,
            city,
            area,
            tools,
            price: Number(price) || 300,
            experienceYears: Number(experienceYears) || 2
        });

        return {
            status: 'success',
            action: 'WORKER_REGISTERED',
            worker
        };
    },

    // 2. Worker Availability Update
    updateWorkerAvailability({ workerPhone, trade = 'Skilled Specialist', date = 'Tomorrow', startTime = '09:00 AM', endTime = '05:00 PM', isAvailable = true }) {
        const cleanPhone = (workerPhone || '').replace(/\D/g, '');
        const worker = DB.getWorkerByPhone(cleanPhone);

        const slot = DB.setWorkerAvailabilitySlot({
            workerId: worker ? worker.id : null,
            workerPhone: cleanPhone,
            trade: worker ? worker.trade : trade,
            dateStr: date,
            startTime,
            endTime,
            isAvailable: Boolean(isAvailable)
        });

        if (worker) {
            DB.updateWorkerAvailabilityStatus(worker.id, isAvailable);
        }

        return {
            status: 'success',
            action: 'AVAILABILITY_UPDATED',
            workerName: worker ? worker.name : 'Worker',
            workerPhone: cleanPhone,
            date,
            hours: `${startTime} – ${endTime}`,
            isAvailable: Boolean(isAvailable)
        };
    },

    // 3. Get Worker Schedule & Bookings for Given Date
    getWorkerSchedule({ workerPhone, date = 'Today' }) {
        const cleanPhone = (workerPhone || '').replace(/\D/g, '');
        const schedule = DB.getWorkerSchedule(cleanPhone);
        const allJobs = DB.getAllJobs().filter(j => (j.worker_phone && j.worker_phone.replace(/\D/g, '') === cleanPhone));
        let activeJobs = allJobs.filter(j => ['Requested', 'Accepted', 'On the Way', 'In Progress', 'Confirmed'].includes(j.status));

        if (date && date.toLowerCase() !== 'all') {
            activeJobs = activeJobs.filter(j => j.requested_date && j.requested_date.toLowerCase() === date.toLowerCase());
        }

        return {
            status: 'success',
            workerName: schedule?.worker?.name || 'Worker',
            isAvailableNow: schedule?.isAvailableNow || false,
            date,
            count: activeJobs.length,
            bookings: activeJobs,
            availabilitySlots: schedule?.availabilitySlots || []
        };
    },

    // 4. Get Next Upcoming Job for Worker
    getWorkerNextJob({ workerPhone }) {
        const cleanPhone = (workerPhone || '').replace(/\D/g, '');
        const jobs = DB.getAllJobs().filter(j => 
            (j.worker_phone && j.worker_phone.replace(/\D/g, '') === cleanPhone) &&
            ['Requested', 'Accepted', 'On the Way', 'In Progress', 'Confirmed'].includes(j.status)
        );

        if (jobs.length === 0) {
            return { status: 'none', message: 'No upcoming jobs scheduled.' };
        }

        return {
            status: 'success',
            job: jobs[0]
        };
    },

    // 5. Update Job Status by Worker (Arrived, Completed, Cancelled)
    updateJobStatusByWorker({ workerPhone, jobId, status = 'Completed' }) {
        const cleanPhone = (workerPhone || '').replace(/\D/g, '');
        const allJobs = DB.getAllJobs().filter(j => (j.worker_phone && j.worker_phone.replace(/\D/g, '') === cleanPhone));
        
        let targetJob = null;
        if (jobId) {
            targetJob = allJobs.find(j => String(j.id).toLowerCase() === String(jobId).toLowerCase());
        }
        if (!targetJob && allJobs.length > 0) {
            targetJob = allJobs.find(j => ['Accepted', 'On the Way', 'In Progress', 'Confirmed'].includes(j.status)) || allJobs[0];
        }

        if (!targetJob) {
            return { status: 'error', message: 'No active job found to update.' };
        }

        const updated = DB.updateJobStatus(targetJob.id, status);
        return {
            status: 'success',
            action: 'JOB_STATUS_UPDATED',
            jobId: targetJob.id,
            newStatus: status,
            job: updated
        };
    },

    // 6. Get Worker Earnings
    getWorkerEarnings({ workerPhone }) {
        const cleanPhone = (workerPhone || '').replace(/\D/g, '');
        const earnings = DB.getWorkerEarnings(cleanPhone);
        return {
            status: 'success',
            workerPhone: cleanPhone,
            earnings
        };
    },

    // 7. Find Real Registered Workers from Database (Customer Tool)
    findWorkers({ service, trade, city = 'Ramanagara' } = {}) {
        const targetTrade = trade || (service && service !== 'all' ? service : undefined);
        const workers = DB.getAllWorkers({
            service: targetTrade,
            city: city,
            isAvailable: true
        });

        return {
            status: 'success',
            count: workers.length,
            workers: workers.map(w => ({
                id: w.id,
                name: w.name,
                phone: w.phone,
                trade: w.trade,
                service: w.service,
                rating: w.rating,
                distanceKm: w.km,
                startingPrice: `₹${w.price}`,
                isAvailable: Boolean(w.is_available),
                tools: w.tools,
                city: w.city,
                area: w.area
            }))
        };
    },

    // 8. Create Job in Real Database (Customer Tool)
    createJob({ customerPhone = '9876543210', customerName = 'Customer', service, problemDescription, location = 'Town Area', city = 'Ramanagara', requestedDate = 'Today', requestedTime = 'Immediate', budget = '₹300', workerId = null, workerName = null, workerPhone = null }) {
        let assignedWorker = null;
        if (workerId) {
            assignedWorker = DB.getWorkerById(workerId);
        } else if (workerPhone) {
            assignedWorker = DB.getWorkerByPhone(workerPhone);
        }

        const newJob = DB.createJob({
            customer_phone: (customerPhone || '').replace(/\D/g, '') || '9876543210',
            customer_name: customerName || 'Customer',
            service: service || 'General Service',
            problem_description: problemDescription || `Service request for ${service}`,
            location: location || `${city} Town`,
            city: city || 'Ramanagara',
            requested_date: requestedDate,
            requested_time: requestedTime,
            budget: budget || '₹300',
            worker_id: assignedWorker ? assignedWorker.id : null,
            worker_phone: assignedWorker ? assignedWorker.phone : (workerPhone || null),
            worker_name: assignedWorker ? assignedWorker.name : (workerName || null),
            status: assignedWorker ? 'Confirmed' : 'Requested'
        });

        return {
            status: 'success',
            action: 'JOB_CREATED',
            job: newJob,
            assignedWorker
        };
    },

    // 9. Get Customer Bookings (Customer Tool)
    getCustomerBookings({ customerPhone }) {
        const cleanPhone = (customerPhone || '').replace(/\D/g, '');
        const jobs = DB.getAllJobs().filter(j => j.customer_phone && j.customer_phone.replace(/\D/g, '') === cleanPhone);
        return {
            status: 'success',
            count: jobs.length,
            bookings: jobs
        };
    },

    // 10. Cancel Job (Customer Tool)
    cancelJob({ jobId, customerPhone }) {
        const job = DB.getJobById(jobId);
        if (!job) {
            return { status: 'error', message: `Job #${jobId} was not found.` };
        }
        if (customerPhone && job.customer_phone.replace(/\D/g, '') !== customerPhone.replace(/\D/g, '')) {
            return { status: 'error', message: `Unauthorized to cancel Job #${jobId}.` };
        }

        const updated = DB.updateJobStatus(jobId, 'Cancelled');
        return {
            status: 'success',
            action: 'JOB_CANCELLED',
            job: updated
        };
    },

    // 11. List Supported Services
    getServices() {
        return [
            'Electrical (Fan, wiring, switchboards)',
            'Plumbing (Pipe leaks, tap repairs, motor)',
            'Carpentry (Doors, locks, furniture)',
            'Two-Wheeler & Auto Mechanics',
            'AC & Fridge Tech',
            'Washing Machine & Appliance Repair',
            'Painting',
            'Home Cleaning',
            'Masonry & Construction',
            'Tailoring & Alterations',
            'Welding & Metalwork',
            'Driver Services',
            'TV & Electronics Repair',
            'Water Purifier & RO Service'
        ];
    }
};

// ======================================================================
// 1.1 GEMINI FUNCTION DECLARATIONS (OFFICIAL GOOGLE GENAI SCHEMA)
// ======================================================================
const GEMINI_TOOLS_DECLARATIONS = [
    {
        name: 'registerWorkerProfile',
        description: 'Register or update a worker profile and trade skills in the verified database and sync with Firebase.',
        parameters: {
            type: 'OBJECT',
            properties: {
                name: { type: 'STRING', description: 'Full name of the worker e.g. Rajesh' },
                phone: { type: 'STRING', description: '10-digit mobile number e.g. 7012280695' },
                trade: { type: 'STRING', description: 'Trade profession e.g. Electrical, Plumbing, Carpentry, Mechanics' },
                city: { type: 'STRING', description: 'City/town in Karnataka e.g. Ramanagara' },
                experienceYears: { type: 'NUMBER', description: 'Years of experience' }
            },
            required: ['name', 'phone', 'trade']
        }
    },
    {
        name: 'updateWorkerAvailability',
        description: 'Set or update the working schedule, hours, or duty status for a worker on a given date.',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Worker phone number' },
                trade: { type: 'STRING', description: 'Trade e.g. Electrician' },
                date: { type: 'STRING', description: 'Date e.g. Tomorrow, Sunday, Today' },
                startTime: { type: 'STRING', description: 'Start time e.g. 09:00 AM, 10:00 AM' },
                endTime: { type: 'STRING', description: 'End time e.g. 05:00 PM, 06:00 PM' },
                isAvailable: { type: 'BOOLEAN', description: 'True if on duty/available, false if off duty/unavailable' }
            }
        }
    },
    {
        name: 'getWorkerSchedule',
        description: 'Check a worker schedule and active customer bookings for today, tomorrow, or a specific date.',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Worker phone number' },
                date: { type: 'STRING', description: 'Optional date to filter e.g. Today, Tomorrow' }
            }
        }
    },
    {
        name: 'getWorkerNextJob',
        description: 'Get the next upcoming job details (customer name, time, location, problem description) for the worker.',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Worker phone number' }
            }
        }
    },
    {
        name: 'updateJobStatusByWorker',
        description: 'Update the job progress status by worker (e.g. Arrived / In Progress, Completed, Cancelled).',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Worker phone number' },
                jobId: { type: 'STRING', description: 'Optional Job ID (e.g. GS-1048)' },
                status: { type: 'STRING', description: 'New status: "In Progress" (Arrived), "Completed" (Job finished), "Cancelled" (Cannot take job)' }
            },
            required: ['status']
        }
    },
    {
        name: 'getWorkerEarnings',
        description: 'Calculate real total earnings, this month earnings, and completed gigs for the worker.',
        parameters: {
            type: 'OBJECT',
            properties: {
                workerPhone: { type: 'STRING', description: 'Worker phone number' }
            }
        }
    },
    {
        name: 'findWorkers',
        description: 'Find real registered and available trade workers from the GigSync database for a requested trade and city.',
        parameters: {
            type: 'OBJECT',
            properties: {
                service: { type: 'STRING', description: 'Trade or service category, e.g. Electrical, Plumbing, Carpentry, Mechanics, Painting' },
                city: { type: 'STRING', description: 'City name e.g. Ramanagara' }
            },
            required: ['service']
        }
    },
    {
        name: 'createJob',
        description: 'Create a real customer job request or dispatch a booking to a registered worker in the database.',
        parameters: {
            type: 'OBJECT',
            properties: {
                service: { type: 'STRING', description: 'The service required e.g. Electrical, Plumbing' },
                problemDescription: { type: 'STRING', description: 'Brief description of the customer issue' },
                city: { type: 'STRING', description: 'Service city' },
                location: { type: 'STRING', description: 'Neighborhood or address' },
                requestedDate: { type: 'STRING', description: 'Requested service date' },
                requestedTime: { type: 'STRING', description: 'Requested time' },
                budget: { type: 'STRING', description: 'Budget or fee' },
                workerId: { type: 'STRING', description: 'ID of worker if booking a specific worker' },
                workerName: { type: 'STRING', description: 'Name of worker if booking a specific worker' },
                workerPhone: { type: 'STRING', description: 'Phone of worker if booking a specific worker' }
            },
            required: ['service', 'city']
        }
    },
    {
        name: 'getCustomerBookings',
        description: 'Retrieve real active bookings and jobs for the customer.',
        parameters: {
            type: 'OBJECT',
            properties: {
                customerPhone: { type: 'STRING', description: 'Customer phone number' }
            }
        }
    },
    {
        name: 'cancelJob',
        description: 'Cancel an active job or booking in the database.',
        parameters: {
            type: 'OBJECT',
            properties: {
                jobId: { type: 'STRING', description: 'The Job ID to cancel' },
                customerPhone: { type: 'STRING', description: 'Customer phone for verification' }
            },
            required: ['jobId']
        }
    }
];

// ======================================================================
// 1.2 UNIFIED GEMINI CONVERSATIONAL BRAIN
// ======================================================================
class GeminiConversationalBrain {
    constructor() {
        this.apiKey = process.env.GEMINI_API_KEY || '';
        this.client = this.apiKey ? new GoogleGenAI({ apiKey: this.apiKey }) : null;
    }

    getClient() {
        if (!this.client && process.env.GEMINI_API_KEY) {
            this.apiKey = process.env.GEMINI_API_KEY;
            this.client = new GoogleGenAI({ apiKey: this.apiKey });
        }
        return this.client;
    }

    async processTurn({ session, text }) {
        const client = this.getClient();
        if (!client) return null;

        const workerRecord = DB.getWorkerByPhone(session.callerPhone);
        const isVerifiedWorker = Boolean(workerRecord);

        const systemInstruction = `You are GigSync AI, the official voice assistant and conversational intelligence for GigSync — a hyperlocal marketplace serving Tier-2 and Tier-3 cities in Karnataka, India (including Ramanagara, Kanakapura, Channapatna, Bengaluru, Mysuru, Bidadi, Magadi, etc.).

AUTHENTICATION & IDENTITY CONTEXT:
- Caller Phone: ${session.callerPhone || '9876543210'}
- Caller Role: ${session.callerRole || 'customer'}
- Verified Worker Account: ${isVerifiedWorker ? `YES (Name: ${workerRecord.name}, Trade: ${workerRecord.trade}, ID: ${workerRecord.id})` : 'NO (Unregistered or Customer account)'}
- Service City: ${session.city || 'Ramanagara'}

CRITICAL RULES:
1. SINGLE CONVERSATIONAL BRAIN: Maintain smooth, natural, empathetic multi-turn conversation. Keep spoken answers concise, conversational, and direct for TTS speech synthesis.
2. SOURCE OF TRUTH: You MUST execute real tools ('findWorkers', 'createJob', 'updateWorkerAvailability', 'getWorkerSchedule', 'getWorkerNextJob', 'getWorkerEarnings', 'getCustomerBookings', 'cancelJob') to interact with the database. NEVER fabricate data or simulate success without executing the tool.
3. WORKER SELF-IDENTIFICATION & AVAILABILITY FLOW:
   - When a caller says "I am an electrician", "yeah I am an electrician", "I am a plumber", or states their trade:
     If verified worker: Acknowledge warmly and ask how to help with their schedule, bookings, or earnings.
     If unregistered: Ask "Okay. Are you registering as a GigSync worker, or would you like to update your worker details?"
   - When a caller says "I would like to do workers schedule", "I want to update my schedule", "change my availability":
     Ask "Sure. What hours are you available?" or "What would you like to change in your schedule?"
   - When a caller provides availability (e.g. "Tomorrow from 9 to 5", "Tomorrow from 9 AM to 5 PM", "from 6 to 5"):
     Ask for confirmation: "You're available tomorrow from 9 AM to 5 PM. Should I save that?"
   - When the worker confirms ("Yes", "Save it", "Do it", "Sure", "Okay", "Ha", "Sari"):
     Execute tool 'updateWorkerAvailability' with { workerPhone: "${session.callerPhone}", date, startTime, endTime, isAvailable: true }.
     Respond after tool success: "Done. Your availability has been updated."
   - When the worker says "I am not available tomorrow" or "off duty on Sunday":
     Execute 'updateWorkerAvailability' with { workerPhone: "${session.callerPhone}", date, isAvailable: false } and confirm off-duty status.
4. WORKER QUERIES:
   - "What jobs do I have today?" -> Execute 'getWorkerSchedule' and state active bookings or "You don't have any jobs scheduled for today."
   - "Who is my next customer?" -> Execute 'getWorkerNextJob' and state the next customer name, location, and service.
   - "How much did I earn this month?" -> Execute 'getWorkerEarnings' and state the computed earnings and completed jobs count.
5. CUSTOMER REQUESTS:
   - "I need an electrician tomorrow", "Nanage electrician beku", "Find a plumber":
     This is a CUSTOMER looking for a worker. Execute 'findWorkers' (NEVER 'updateWorkerAvailability').
6. CLOSING CALLS:
   - "Thank you", "Bye", "That's all": Acknowledge warmly and say goodbye.`;

        try {
            // Format history for Gemini API
            const contents = [];
            for (const h of session.history.slice(-8)) {
                contents.push({
                    role: h.role === 'assistant' ? 'model' : 'user',
                    parts: [{ text: h.text }]
                });
            }
            if (contents.length === 0 || contents[contents.length - 1].parts[0].text !== text) {
                contents.push({
                    role: 'user',
                    parts: [{ text }]
                });
            }

            const actionsPerformed = [];
            let toolExecuted = null;
            let toolResult = null;
            let shouldEndCall = false;

            // Gemini Function Calling Loop (up to 4 tool turns)
            for (let step = 0; step < 4; step++) {
                const response = await client.models.generateContent({
                    model: 'gemini-3.6-flash',
                    contents,
                    config: {
                        systemInstruction,
                        tools: [{ functionDeclarations: GEMINI_TOOLS_DECLARATIONS }]
                    }
                });

                const candidate = response.candidates && response.candidates[0];
                if (!candidate || !candidate.content) break;

                const parts = candidate.content.parts || [];
                const functionCallPart = parts.find(p => p.functionCall);

                if (functionCallPart && functionCallPart.functionCall) {
                    const call = functionCallPart.functionCall;
                    toolExecuted = call.name;
                    const args = call.args || {};

                    // Default contextual arguments
                    if (!args.city) args.city = session.city;
                    if (!args.customerPhone) args.customerPhone = session.callerPhone;
                    if (!args.workerPhone) args.workerPhone = session.callerPhone;
                    if (!args.customerName) args.customerName = session.callerName;

                    // Execute tool from AI_TOOLS
                    if (typeof AI_TOOLS[call.name] === 'function') {
                        toolResult = AI_TOOLS[call.name](args);
                        actionsPerformed.push(`Gemini tool called: ${call.name}`);
                    } else {
                        toolResult = { status: 'error', message: `Unknown tool ${call.name}` };
                    }

                    // Append assistant function call and tool result to contents
                    contents.push(candidate.content);
                    contents.push({
                        role: 'user',
                        parts: [{
                            functionResponse: {
                                name: call.name,
                                response: { output: toolResult }
                            }
                        }]
                    });
                } else {
                    // Final text response generated
                    const spokenText = parts.map(p => p.text || '').join(' ').trim();

                    // Check for natural call closure
                    if (/goodbye|have a great day|have a good day|take care|bye|ಧನ್ಯವಾದ|ಶುಭ ದಿನ/i.test(spokenText) &&
                        /\b(thank you|bye|goodbye|thats all|that's all|nothing else|end call)\b/i.test(text.toLowerCase())) {
                        shouldEndCall = true;
                    }

                    return {
                        spokenResponse: spokenText,
                        toolExecuted,
                        toolResult,
                        actionsPerformed,
                        shouldEndCall
                    };
                }
            }
        } catch (err) {
            console.warn('[Gemini Engine] Fallback to deterministic rules engine:', err.message);
            return null;
        }

        return null;
    }
}

const geminiBrain = new GeminiConversationalBrain();

// 2. Multi-Turn Session & Memory Manager
class ConversationSessionManager {
    constructor() {
        this.sessions = new Map();
    }

    getSession(sessionId, defaultData = {}) {
        const key = sessionId || defaultData.callerPhone || 'default_session';
        if (!this.sessions.has(key)) {
            this.sessions.set(key, {
                sessionId: key,
                callerPhone: defaultData.callerPhone || '9876543210',
                callerRole: defaultData.callerRole || 'customer',
                callerName: defaultData.callerName || 'User',
                city: defaultData.city || 'Ramanagara',
                history: [],
                context: {
                    pendingIntent: null,
                    currentService: null,
                    currentLocation: defaultData.city || 'Ramanagara',
                    currentDate: null,
                    currentTime: null,
                    lastFoundWorkers: [],
                    lastSelectedWorker: null,
                    pendingJobData: null
                },
                lastActivity: Date.now()
            });
        }

        const session = this.sessions.get(key);
        session.lastActivity = Date.now();
        if (defaultData.callerPhone) session.callerPhone = defaultData.callerPhone.replace(/\D/g, '');
        if (defaultData.city && !session.city) session.city = defaultData.city;
        if (defaultData.callerRole && (!session.callerRole || defaultData.callerRole !== 'customer')) {
            session.callerRole = defaultData.callerRole;
        }
        if (defaultData.callerName && (!session.callerName || defaultData.callerName !== 'User')) {
            session.callerName = defaultData.callerName;
        }
        return session;
    }

    addTurn(session, role, text) {
        session.history.push({ role, text, timestamp: new Date().toISOString() });
        // Keep last 16 turns to maintain sharp context
        if (session.history.length > 16) {
            session.history.shift();
        }
    }
}

const sessionManager = new ConversationSessionManager();

// 3. Location Entity Extractor
function extractLocationEntity(text, defaultCity = 'Ramanagara') {
    if (!text) return defaultCity;
    const lower = text.toLowerCase();

    // Specific city / neighborhood matching FIRST
    const locationMap = [
        { patterns: ['ramanagara', 'ramnagar', 'ರಾಮನಗರ'], city: 'Ramanagara' },
        { patterns: ['kanakapura', 'kanakpur', 'ಕನಕಪುರ'], city: 'Kanakapura' },
        { patterns: ['channapatna', 'channapatana', 'ಚನ್ನಪಟ್ಟಣ'], city: 'Channapatna' },
        { patterns: ['bengaluru', 'bangalore', 'ಬೆಂಗಳೂರು'], city: 'Bengaluru' },
        { patterns: ['mysuru', 'mysore', 'ಮೈಸೂರು'], city: 'Mysuru' },
        { patterns: ['vijaya nagar', 'vijayanagar', 'ವಿಜಯನಗರ'], city: 'Vijaya Nagar' },
        { patterns: ['bidadi', 'ಬಿದದಿ'], city: 'Bidadi' },
        { patterns: ['magadi', 'ಮಾಗಡಿ'], city: 'Magadi' },
        { patterns: ['mandya', 'ಮಂಡ್ಯ'], city: 'Mandya' },
        { patterns: ['hassan', 'ಹಾಸನ'], city: 'Hassan' },
        { patterns: ['tumakuru', 'tumkur', 'ತುಮಕೂರು'], city: 'Tumakuru' },
        { patterns: ['shivamogga', 'shimoga', 'ಶಿವಮೊಗ್ಗ'], city: 'Shivamogga' },
        { patterns: ['davangere', 'ದಾವಣಗೆರೆ'], city: 'Davangere' },
        { patterns: ['belagavi', 'belgaum', 'ಬೆಳಗಾವಿ'], city: 'Belagavi' },
        { patterns: ['hubballi', 'hubli', 'ಹುಬ್ಬಳ್ಳಿ'], city: 'Hubballi' },
        { patterns: ['kannur'], city: 'Kannur' },
        { patterns: ['kasaragod'], city: 'Kasaragod' }
    ];

    for (const item of locationMap) {
        for (const pat of item.patterns) {
            const regex = new RegExp(`\\b${pat}\\b`, 'i');
            if (regex.test(lower)) {
                return item.city;
            }
        }
    }

    // Relative / local location references (with boundary checking to avoid false substring matches like 'is there')
    if (/\b(near me|my current location|my location|current location|around here|locally)\b/i.test(lower)) {
        return defaultCity;
    }

    // Fallback: Check preposition patterns (e.g. "in Mysore", "near Bidadi", "at Vijaya Nagar")
    const prepMatch = text.match(/\b(?:in|at|near|around|for)\s+([A-Z][a-zA-Z]*(?:\s+[A-Z][a-zA-Z]*)?)\b/);
    if (prepMatch && !/^(today|now|tomorrow|morning|afternoon|evening|tonight|monday|saturday|sunday)$/i.test(prepMatch[1])) {
        return prepMatch[1].trim();
    }

    return defaultCity;
}

// 4. Entity & Trade Extractor
function extractTradeAndService(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    // Specific Multi-word trades first
    if (lower.includes('washing machine') || lower.includes('washer') || lower.includes('വാഷിംഗ് മെಷೀನ್')) {
        return 'Washing Machine Repair';
    }
    if (lower.includes('water purifier') || lower.includes('ro technician') || lower.includes('aquaguard') || lower.includes('kent ro') || lower.includes('water filter')) {
        return 'Water Purifier & RO Service';
    }
    if (lower.includes('tv technician') || lower.includes('television') || lower.includes('led tv') || lower.includes('smart tv') || lower.includes('screen repair') || lower.includes('ಟಿವಿ')) {
        return 'TV & Electronics Repair';
    }
    if (lower.includes('refrigerator') || lower.includes('fridge') || lower.includes('deep freezer')) {
        return 'Refrigerator Repair';
    }
    if (lower.includes('ac technician') || lower.includes('air conditioner') || lower.includes('split ac') || lower.includes('ac repair') || lower.includes('cooler')) {
        return 'AC & Appliances';
    }
    if (lower.includes('bike mechanic') || lower.includes('two wheeler') || lower.includes('scooter') || lower.includes('motorcycle') || lower.includes('puncture') || lower.includes('bike repair')) {
        return 'Mechanics';
    }
    if (lower.includes('pipe leakage') || lower.includes('leakage repair') || lower.includes('pipe repair') || lower.includes('leaking tap') || lower.includes('tap leak')) {
        return 'Plumbing';
    }

    // Single-word / Core Trade matchers
    if (lower.includes('electric') || lower.includes('fan') || lower.includes('switch') || lower.includes('wire') || lower.includes('current') || lower.includes('power') || lower.includes('bulb') || lower.includes('ಎಲೆಕ್ಟ್ರಿಷಿಯನ್')) {
        return 'Electrical';
    }
    if (lower.includes('plumb') || lower.includes('pipe') || lower.includes('tap') || lower.includes('leak') || lower.includes('drain') || lower.includes('water') || lower.includes('ಪ್ಲಂಬರ್') || lower.includes('ನೀರು')) {
        return 'Plumbing';
    }
    if (lower.includes('carpenter') || lower.includes('wood') || lower.includes('door') || lower.includes('window') || lower.includes('furniture') || lower.includes('lock') || lower.includes('ಕಾರ್ಪೆಂಟರ್') || lower.includes('ಮರಗೆಲಸ')) {
        return 'Carpentry';
    }
    if (lower.includes('mason') || lower.includes('masonry') || lower.includes('brick') || lower.includes('plaster') || lower.includes('cement') || lower.includes('tile') || lower.includes('ಮೇಸ್ತ್ರಿ') || lower.includes('ಕಟ್ಟಡ')) {
        return 'Masonry & Construction';
    }
    if (lower.includes('tailor') || lower.includes('tailoring') || lower.includes('stitch') || lower.includes('alteration') || lower.includes('blouse') || lower.includes('dressmaker') || lower.includes('ಟೈಲರ್')) {
        return 'Tailoring & Alterations';
    }
    if (lower.includes('welder') || lower.includes('welding') || lower.includes('grill') || lower.includes('fabrication') || lower.includes('metal') || lower.includes('iron gate') || lower.includes('ವೆಲ್ಡರ್')) {
        return 'Welding & Metalwork';
    }
    if (lower.includes('driver') || lower.includes('driving') || lower.includes('chauffeur') || lower.includes('cab driver') || lower.includes('car driver') || lower.includes('ಡ್ರೈವರ್')) {
        return 'Driver Services';
    }
    if (lower.includes('mechanic') || lower.includes('breakdown') || lower.includes('engine') || lower.includes('ಮೇಕಾನಿಕ್')) {
        return 'Mechanics';
    }
    if (lower.includes('clean') || lower.includes('maid') || lower.includes('sweep') || lower.includes('wash') || lower.includes('deep clean') || lower.includes('ಕ್ಲೀನಿಂಗ್')) {
        return 'Home Cleaning';
    }
    if (lower.includes('paint') || lower.includes('painter') || lower.includes('whitewash') || lower.includes('wall paint') || lower.includes('ಬಣ್ಣ')) {
        return 'Painting';
    }

    return null;
}

// 5. Extract Date & Time Entities
function extractDateTimeEntities(text) {
    if (!text) return { date: 'Today', time: 'Immediate' };
    const lower = text.toLowerCase();
    let date = null;
    let time = null;

    // Date Matching
    if (lower.includes('tomorrow morning')) {
        date = 'Tomorrow';
        time = 'Morning (10:00 AM)';
    } else if (lower.includes('tomorrow afternoon')) {
        date = 'Tomorrow';
        time = 'Afternoon (02:00 PM)';
    } else if (lower.includes('tomorrow evening')) {
        date = 'Tomorrow';
        time = 'Evening (05:00 PM)';
    } else if (lower.includes('this morning')) {
        date = 'Today';
        time = 'Morning (10:00 AM)';
    } else if (lower.includes('this afternoon')) {
        date = 'Today';
        time = 'Afternoon (02:00 PM)';
    } else if (lower.includes('this evening')) {
        date = 'Today';
        time = 'Evening (05:00 PM)';
    } else if (lower.includes('tonight') || lower.includes('this night')) {
        date = 'Today';
        time = 'Night (08:00 PM)';
    } else if (lower.includes('next monday') || lower.includes('next week monday')) {
        date = 'Next Monday';
    } else if (lower.includes('saturday') || lower.includes('shanivara')) {
        date = 'Saturday';
    } else if (lower.includes('sunday') || lower.includes('bhanuvara')) {
        date = 'Sunday';
    } else if (lower.includes('monday') || lower.includes('somavara')) {
        date = 'Monday';
    } else if (lower.includes('tomorrow') || lower.includes('naale') || lower.includes('ನಾಳೆ') || lower.includes('kal')) {
        date = 'Tomorrow';
    } else if (lower.includes('today') || lower.includes('now') || lower.includes('immediately') || lower.includes('urgent') || lower.includes('ivathu') || lower.includes('ಇವತ್ತು') || lower.includes('aaj')) {
        date = 'Today';
        if (lower.includes('now') || lower.includes('immediately') || lower.includes('urgent')) {
            time = 'Immediate';
        }
    }

    // Time Window / Range Matching
    if (lower.includes('from 9 am to 4 pm') || lower.includes('9 am to 4 pm') || lower.includes('9 to 4')) {
        time = '09:00 AM – 04:00 PM';
    } else if (lower.includes('after 5 pm') || lower.includes('post 5 pm') || lower.includes('evening after 5')) {
        time = 'After 05:00 PM';
    } else if (!time) {
        if (lower.includes('morning') || lower.includes('beligge') || lower.includes('ಬೆಳಿಗ್ಗೆ') || lower.includes('subah')) {
            time = 'Morning (10:00 AM)';
        } else if (lower.includes('afternoon') || lower.includes('madhyahna') || lower.includes('dopahar')) {
            time = 'Afternoon (02:00 PM)';
        } else if (lower.includes('evening') || lower.includes('sanje') || lower.includes('shaam')) {
            time = 'Evening (05:00 PM)';
        } else {
            const timeMatch = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|o'clock)?)/i);
            if (timeMatch && !text.match(/₹|\brupees\b/i)) {
                time = timeMatch[1];
            }
        }
    }

    return {
        date: date || 'Today',
        time: time || 'Immediate'
    };
}

// Helper to convert trade category to natural specialist noun (e.g. Electrical -> an electrician)
function getTradePersonNoun(tradeCategory) {
    if (!tradeCategory) return 'a specialist';
    const t = tradeCategory.toLowerCase();
    if (t.includes('electr')) return 'an electrician';
    if (t.includes('plumb')) return 'a plumber';
    if (t.includes('carpent')) return 'a carpenter';
    if (t.includes('mechanic')) return 'a mechanic';
    if (t.includes('paint')) return 'a painter';
    if (t.includes('mason')) return 'a mason';
    if (t.includes('tailor')) return 'a tailor';
    if (t.includes('weld')) return 'a welder';
    if (t.includes('driver')) return 'a driver';
    if (t.includes('clean')) return 'a cleaning specialist';
    if (t.includes('tv') || t.includes('electronic')) return 'a TV repair specialist';
    if (t.includes('purifier') || t.includes('ro')) return 'a water purifier technician';
    if (t.includes('washing')) return 'a washing machine technician';
    if (t.includes('refrigerat') || t.includes('fridge')) return 'a refrigerator technician';
    if (t.includes('ac ') || t.includes('appliance')) return 'an appliance technician';
    return `a ${tradeCategory}`;
}

// Helper to extract start and end time range from natural utterances
function extractTimeRange(text) {
    if (!text) return { startTime: '09:00 AM', endTime: '05:00 PM', startDisplay: '9 AM', endDisplay: '5 PM' };
    const lower = text.toLowerCase();

    // Match variations: "6 to 5", "11 to 5", "11 to 5 o'clock", "11 am till 5 pm", "11 inda 5 varege", "from 11:00 to 17:00", etc.
    const rangeMatch = text.match(/(\d{1,2}(?::\d{2})?)\s*(?:am|pm)?\s*(?:to|till|until|inda|inda\s*te|\-)\s*(\d{1,2}(?::\d{2})?)\s*(?:am|pm|o'clock|varege)?/i);

    if (rangeMatch) {
        let sStr = rangeMatch[1];
        let eStr = rangeMatch[2];

        let sVal = parseInt(sStr);
        let eVal = parseInt(eStr);

        // Typical Indian trade shift heuristics: 5 to 11 is AM, 12 is PM, 1 to 4 is PM, 6 with eVal 5 is 6 AM to 5 PM
        let sAmPm = (sVal >= 5 && sVal <= 11) ? 'AM' : ((sVal === 12 || (sVal >= 1 && sVal <= 4)) ? 'PM' : 'AM');
        let eAmPm = (eVal >= 1 && eVal <= 11) ? 'PM' : ((eVal === 12) ? 'PM' : 'AM');
        if (sVal === 12) sAmPm = 'PM';

        if (lower.includes(sStr + ' am') || lower.includes(sStr + 'am')) sAmPm = 'AM';
        if (lower.includes(sStr + ' pm') || lower.includes(sStr + 'pm')) sAmPm = 'PM';
        if (lower.includes(eStr + ' am') || lower.includes(eStr + 'am')) eAmPm = 'AM';
        if (lower.includes(eStr + ' pm') || lower.includes(eStr + 'pm')) eAmPm = 'PM';

        const startTime = `${sVal < 10 ? '0' + sVal : sVal}:00 ${sAmPm}`;
        const endTime = `${eVal < 10 ? '0' + eVal : eVal}:00 ${eAmPm}`;
        const startDisplay = `${sVal} ${sAmPm}`;
        const endDisplay = `${eVal} ${eAmPm}`;

        return { startTime, endTime, startDisplay, endDisplay };
    }

    return { startTime: '09:00 AM', endTime: '05:00 PM', startDisplay: '9 AM', endDisplay: '5 PM' };
}

// Helper to extract 10-digit Indian phone number from utterance
function extractPhoneNumber(text) {
    if (!text) return null;
    const match = text.match(/(?:\+91|91|0)?\s*([6-9]\d{4}\s*\d{5}|[6-9]\d{9})\b/);
    if (match) {
        return match[1].replace(/\s+/g, '');
    }
    return null;
}

// Helper to extract caller's stated name (e.g. "My name is Rajesh", "This is Rajesh")
function extractCallerName(text) {
    if (!text) return null;
    const match = text.match(/\b(?:my name is|name is|i am|i'm|this is|call me|hesaru|ಹೆಸರು)\s+([A-Za-z]+)\b/i);
    if (match) {
        const candidate = match[1].trim();
        const nonNames = ['a', 'an', 'the', 'electrician', 'plumber', 'carpenter', 'mechanic', 'available', 'free', 'not', 'looking', 'here', 'calling', 'user', 'there', 'from', 'in', 'on', 'at', 'today', 'tomorrow', 'naale', 'ivathu'];
        if (!nonNames.includes(candidate.toLowerCase()) && candidate.length >= 2) {
            return candidate.charAt(0).toUpperCase() + candidate.slice(1).toLowerCase();
        }
    }
    return null;
}

// Helper to identify whether caller is self-identifying as a worker or providing worker availability
function isWorkerIntent(text, currentRole = 'customer') {
    if (!text) return false;
    const lower = text.toLowerCase();

    // Inquiries asking about current availability or schedule are questions, not availability declarations
    if (/\b(?:am i available|am i free|check my availability|my working hours|what are my hours|what jobs|who is my next|where is my next|how much did i earn)\b/i.test(lower)) {
        return false;
    }

    // Customer explicit requests in Kannada / English (e.g. "nanage electrician beku", "i need an electrician")
    if (/\b(?:nanage|ನನಗೆ)\b/i.test(lower) && /\b(?:beku|ಬೇಕಾಗಿದೆ|ಬೇಕು)\b/i.test(lower)) {
        return false;
    }
    if (/\b(?:i need|need|looking for|want to hire|can you find|send me|book me|beku|ಬೇಕು)\b/i.test(lower)) {
        return false;
    }

    // Direct worker self-identification & availability statements in English / Kannada / Kanglish
    const selfIdPatterns = [
        /\b(?:i am|i'm|myself|i work as|naanu|ನಾನು|naan)\s+(?:an?|a registered|a skilled)?\s*(?:electrician|plumber|carpenter|mechanic|painter|technician|mason|tailor|welder|driver|specialist|ಎಲೆಕ್ಟ್ರಿಷಿಯನ್|ಪ್ಲಂಬರ್|ಕಾರ್ಪೆಂಟರ್|ಮೆಕ್ಯಾನಿಕ್)\b/i,
        /\b(?:my name is|name is|this is|hesaru|ಹೆಸರು)\s+[a-z]+\s+(?:and\s+)?(?:i am|i'm|i work as|naanu)\s+(?:an?|a)?\s*(?:electrician|plumber|carpenter|mechanic|painter|technician|mason|tailor|welder|driver)\b/i,
        /\b(?:i am|i'm|myself|iddini|ಇದ್ದೇನೆ)\s+(?:available|free|on duty|off duty|labhyaviddini|ಲಭ್ಯ)\s+(?:from|for|today|tomorrow|naale|ivathu|now|between|till|after|\d)\b/i,
        /\b(?:wanted to work|want to work|ready to work|kelasa madalu|kelasa madbeku|i wanted to work|i want to work)\b/i,
        /\b(?:my availability|my schedule|my working hours|my shift|nanna availability|nanna schedule)\s+(?:is|for|from|to|inda)\b/i,
        /\b(?:set|update|change|mark|add)\s+(?:my\s+)?(?:availability|schedule|timing|shift|hours)\b/i,
        /\b(?:i can work|i will be available|i am not available|i won't be available|i will work|add me as available)\b/i,
        /\b(?:not available on|make me unavailable|cancel my availability|cancel availability|not available)\b/i,
        /\b(?:inda|ರಿಂದ)\s+\d{1,2}\s*(?:to|till|varege|ವರೆಗೆ)\s+\d{1,2}\s*(?:available|iddini|ಇದ್ದೇನೆ)\b/i
    ];

    for (const pat of selfIdPatterns) {
        if (pat.test(lower)) return true;
    }

    // Contextual follow-up if caller is already identified as a worker
    if (currentRole === 'worker') {
        if (/\b(?:available|free|from \d|to \d|\d to \d|tomorrow too|saturday too|sunday too|off duty|on duty|leave|varege|inda)\b/i.test(lower)) {
            if (!/\b(?:find|search|need|look for|book|hire|get me|send me|beku|ಬೇಕು|am i|check)\b/i.test(lower)) {
                return true;
            }
        }
    }

    return false;
}

// 5. Intelligent Multi-Turn Conversational Processor
class ContextAwareVoiceAgent {
    async processCallTurn({ sessionId, callerPhone, callerRole = 'customer', callerName = 'User', city = 'Ramanagara', speechText }) {
        const text = (speechText || '').trim();
        const lower = text.toLowerCase();

        // 1. Extract dynamic location from utterance (or fallback to session default city)
        const targetCity = extractLocationEntity(text, city);

        // 2. Get or create session context
        const session = sessionManager.getSession(sessionId, { callerPhone, callerRole, callerName, city: targetCity });
        session.city = targetCity;
        session.context.currentLocation = targetCity;
        sessionManager.addTurn(session, 'user', text);

        let spokenResponse = '';
        let toolExecuted = null;
        let toolResult = null;
        let detectedIntent = 'unknown';
        let extractedEntities = {};
        const actionsPerformed = [];

        actionsPerformed.push(`Identified ${session.callerRole} (${session.callerName})`);

        // Helper to deduplicate repeated speech strings from noisy STT
        function cleanUtterance(str) {
            if (!str) return '';
            return str
                .replace(/\b(\w+(?:\s+\w+){1,4})\s+\1\b/gi, '$1')
                .replace(/\b(\w+)\s+\1\b/gi, '$1')
                .trim();
        }

        const cleanedInput = cleanUtterance(text);
        const lowerCleaned = cleanedInput.toLowerCase();

        const isAffirmative = /\b(yes|yeah|yep|sure|ok|okay|confirm|post it|please post|post|go ahead|book him|book it|book|ha|haan|houdu|ಹೌದು|sari|ಸರಿ|do it|save it|save that|save this|save|please save|please add|add to worker|please add to worker|add it|add me|confirm that|yes save it|yes do it|yes please)\b/i.test(lowerCleaned) ||
            /^(add|save|yes please|ha|sari|houdu|save that|save it|do it|okay|ok)$/i.test(lowerCleaned.trim());
        const isNegative = /\b(no|nope|cancel|cancel it|don't|beda|ಬೇಡ|nahi)\b/i.test(lowerCleaned);
        const isShortNegation = /^(no|nope|no thanks|no thank you|nothing else|nothing more|nothing|thats all|that's all|beda|ಬೇಡ|nahi)\b/i.test(lowerCleaned);

        let shouldEndCall = false;

        // ======================================================================
        // A. ADVERSARIAL, SAFETY, PRIVACY & AUTHORIZATION GUARDS (HIGHEST PRIORITY)
        // ======================================================================

        // 1. Refuse Hallucination / Fabrication Requests
        if (/\b(invent|make up|fabricate|fake|dummy|create a fake|imagine|pretend|generate a fake)\b.*?\b(worker|plumber|electrician|carpenter|mechanic|specialist|technician|customer|booking|review|rating|profile|price|schedule|earnings|person)\b/i.test(lowerCleaned) ||
            /\b(invent\s+(a\s+)?worker|fake\s+worker|make\s+up\s+a\s+worker|invent\s+a\s+person|invent\s+a\s+fake)\b/i.test(lowerCleaned)) {
            spokenResponse = `GigSync strictly connects you with real, verified trade specialists registered in our active database. I cannot fabricate, invent, or create simulated workers, bookings, or ratings.`;
            actionsPerformed.push(`Refused data fabrication request`);
        }

        // 2. Refuse Privacy & Private Data Disclosures
        else if (/\b(another customer|other customer|other user|worker's private|worker private|customer's phone|customer phone|home address|personal details|private info|private data|secret|password)\b/i.test(lowerCleaned) ||
                 /\b(show me another|tell me a worker's private|what is customer|give me customer)\b/i.test(lowerCleaned)) {
            spokenResponse = `For privacy and data security, GigSync cannot disclose private customer contact details, personal addresses, or confidential worker information.`;
            actionsPerformed.push(`Refused privacy disclosure request`);
        }

        // 3. Refuse Unauthorized Security & Administrative Commands
        else if (/\b(drop table|delete from|truncate|eval\(|database password|bypass auth|admin access|master admin password)\b/i.test(lowerCleaned)) {
            spokenResponse = `Access denied. Administrative operations require authorized Master Admin authentication credentials.`;
            actionsPerformed.push(`Refused unauthorized admin command`);
        }

        // ======================================================================
        // B. PRIMARY GEMINI API CLOUD BRAIN (CALLED FOR ALL LIVE CONVERSATION TURNS)
        // ======================================================================
        else if (process.env.GEMINI_API_KEY || geminiBrain.getClient()) {
            try {
                const geminiTurn = await geminiBrain.processTurn({ session, text });
                if (geminiTurn && geminiTurn.spokenResponse) {
                    spokenResponse = geminiTurn.spokenResponse;
                    toolExecuted = geminiTurn.toolExecuted;
                    toolResult = geminiTurn.toolResult;
                    shouldEndCall = geminiTurn.shouldEndCall;
                    if (Array.isArray(geminiTurn.actionsPerformed)) {
                        actionsPerformed.push(...geminiTurn.actionsPerformed);
                    }
                }
            } catch (geminiErr) {
                console.warn('[Gemini Voice Agent] Fallback to deterministic rules engine:', geminiErr.message);
            }
        }

        // ======================================================================
        // C. DETERMINISTIC OFFLINE RULES & DATABASE ENGINE (FALLBACK ONLY)
        // ======================================================================
        if (!spokenResponse) {
            // C.1 Multi-Turn Pending Confirmations
            if (session.context.pendingIntent === 'CONFIRM_UPDATE_AVAILABILITY' && (isAffirmative || isNegative)) {
                detectedIntent = 'confirm_availability';
                if (isAffirmative && session.context.pendingAvailabilityData) {
                    const avail = session.context.pendingAvailabilityData;
                    toolExecuted = 'updateWorkerAvailability';
                    toolResult = AI_TOOLS.updateWorkerAvailability({
                        workerPhone: avail.phone || session.callerPhone,
                        trade: avail.trade || 'Specialist',
                        date: avail.date,
                        startTime: avail.startTime,
                        endTime: avail.endTime,
                        isAvailable: avail.isAvailable !== false
                    });
                    actionsPerformed.push(`Updated ${avail.date} availability (${avail.startTime} – ${avail.endTime}) in database and Firebase`);

                    spokenResponse = `Done. Your availability has been updated for ${avail.date.toLowerCase()} from ${avail.startDisplay} to ${avail.endDisplay}.`;
                    session.context.pendingIntent = null;
                    session.context.pendingAvailabilityData = null;
                    session.context.lastActionCompleted = 'AVAILABILITY_UPDATED';
                } else if (isNegative) {
                    spokenResponse = `No problem, I haven't added this to your schedule. Let me know if you need anything else.`;
                    session.context.pendingIntent = null;
                    session.context.pendingAvailabilityData = null;
                }
            }

            else if (session.context.pendingIntent === 'CONFIRM_REGISTER_OFFER' && (isAffirmative || isNegative)) {
                detectedIntent = 'confirm_register_offer';
                if (isAffirmative) {
                    spokenResponse = `Please open the GigSync app or visit our registration portal to complete your worker verification with your mobile number and trade skills.`;
                    actionsPerformed.push(`Guided unregistered caller to official verification portal`);
                    session.context.pendingIntent = null;
                    session.context.lastActionCompleted = 'REGISTER_OFFER_GUIDED';
                } else if (isNegative) {
                    spokenResponse = `Understood. Let me know if you need help with anything else.`;
                    session.context.pendingIntent = null;
                }
            }

            else if (session.context.pendingIntent === 'CONFIRM_POST_JOB' && (isAffirmative || isNegative)) {
                detectedIntent = 'confirm_post_job';
                if (isAffirmative && session.context.pendingJobData) {
                    const jobData = session.context.pendingJobData;
                    toolExecuted = 'createJob';
                    toolResult = AI_TOOLS.createJob(jobData);
                    actionsPerformed.push(`Created Job #${toolResult.job.id} for ${jobData.service} in SQLite database`);

                    spokenResponse = `Done! Your job request for ${jobData.service} in ${jobData.location || jobData.city} has been posted. We are notifying nearby registered specialists. Is there anything else I can help you with?`;
                    session.context.pendingIntent = null;
                    session.context.pendingJobData = null;
                    session.context.lastActionCompleted = 'JOB_POSTED';
                } else if (isNegative) {
                    spokenResponse = `No problem, I've cancelled the job request. Let me know if you need help with anything else.`;
                    session.context.pendingIntent = null;
                    session.context.pendingJobData = null;
                }
            }

            else if (session.context.pendingIntent === 'CONFIRM_CONNECT_WORKER' && (isAffirmative || isNegative)) {
                detectedIntent = 'confirm_connect_worker';
                if (isAffirmative && session.context.lastSelectedWorker) {
                    const worker = session.context.lastSelectedWorker;
                    toolExecuted = 'createJob';
                    toolResult = AI_TOOLS.createJob({
                        customerPhone: session.callerPhone,
                        customerName: session.callerName,
                        service: worker.trade || session.context.currentService || 'Specialist Visit',
                        problemDescription: `Direct booking request for ${worker.name}`,
                        location: `${session.city} Town`,
                        city: session.city,
                        requestedDate: session.context.currentDate || 'Today',
                        requestedTime: session.context.currentTime || 'Immediate',
                        budget: worker.startingPrice || '₹300',
                        workerId: worker.id,
                        workerName: worker.name,
                        workerPhone: worker.phone
                    });
                    actionsPerformed.push(`Created Booking #${toolResult.job.id} dispatched to ${worker.name}`);

                    spokenResponse = `Booking confirmed! I have assigned ${worker.name} (${worker.trade}) for your request. They have been notified. Is there anything else you need?`;
                    session.context.pendingIntent = null;
                    session.context.lastActionCompleted = 'BOOKING_CONFIRMED';
                } else if (isNegative) {
                    spokenResponse = `Understood. Would you like me to look for another specialist or post an open job?`;
                    session.context.pendingIntent = null;
                }
            }

            else if (session.context.pendingIntent === 'CONFIRM_CANCEL_BOOKING' && (isAffirmative || isNegative)) {
                detectedIntent = 'confirm_cancel_booking';
                if (isAffirmative && session.context.pendingCancelJobId) {
                    const jId = session.context.pendingCancelJobId;
                    toolExecuted = 'cancelJob';
                    toolResult = AI_TOOLS.cancelJob({ jobId: jId, customerPhone: session.callerPhone });
                    actionsPerformed.push(`Cancelled Booking #${jId} in SQLite database`);
                    spokenResponse = `Your booking #${jId} has been cancelled successfully. Is there anything else I can help you with?`;
                    session.context.pendingIntent = null;
                    session.context.pendingCancelJobId = null;
                    session.context.lastActionCompleted = 'BOOKING_CANCELLED';
                } else if (isNegative) {
                    spokenResponse = `Your booking remains active. Let me know if you need any other assistance.`;
                    session.context.pendingIntent = null;
                    session.context.pendingCancelJobId = null;
                }
            }

            // C.2 Conversational Greetings & Goodbyes
            else if (/\b(thank you|thanks|thanks a lot|thank you so much|thank you for your help|dhanyavada|dhanyavadagalu|dhanyavadam|shukriya|bahut shukriya)\b/i.test(lowerCleaned) &&
                /\b(bye|goodbye|okay bye|ok bye|tata|see you|good night|that's all|thats all|that's it|thats it|nothing else|no nothing|nothing more|no that's all|no thats all|no thanks|no thank you)\b/i.test(lowerCleaned)) {
                spokenResponse = `You're welcome! I'm glad I could help. Have a great day!`;
                actionsPerformed.push(`Completed conversation with closing goodbye`);
                session.context.pendingIntent = null;
                shouldEndCall = true;
            } else if (/\b(bye|goodbye|okay bye|ok bye|tata|see you|good night|that's all|thats all|that's it|thats it|nothing else|no nothing|nothing more|no that's all|no thats all|no thanks|no thank you)\b/i.test(lowerCleaned) && lowerCleaned.split(/\s+/).length <= 4) {
                spokenResponse = `Goodbye! Thank you for calling GigSync. Have a wonderful day!`;
                actionsPerformed.push(`Caller ended conversation`);
                session.context.pendingIntent = null;
                shouldEndCall = true;
            } else if (/\b(thank you|thanks|thanks a lot|thank you so much|thank you for your help|dhanyavada|dhanyavadagalu|dhanyavadam|shukriya|bahut shukriya)\b/i.test(lowerCleaned) && lowerCleaned.split(/\s+/).length <= 5) {
                spokenResponse = `You're welcome! I'm glad I could help. You can end the call whenever you're ready, or let me know if you need anything else.`;
                actionsPerformed.push(`Acknowledged gratitude`);
                session.context.pendingIntent = null;
            } else if (/\b(hello|hi|hey|namaskara|namaste|vanakkam|good morning|good afternoon|good evening)\b/i.test(lowerCleaned) && lowerCleaned.split(/\s+/).length <= 3) {
                spokenResponse = `Hello! How can I help you today?`;
                actionsPerformed.push(`Natural greeting response`);
            }

            // C.3 Worker Schedule Request ("I would like to do workers schedule", "update my schedule")
            else if (/\b(do workers schedule|worker schedule|workers schedule|update my schedule|change my schedule|set my schedule|change my availability|update my availability)\b/i.test(lowerCleaned)) {
                spokenResponse = `Sure. What hours are you available?`;
                actionsPerformed.push(`Prompted worker for available hours`);
            }

            // C.4 Worker Self-Identification & Availability Statements
            else if (isWorkerIntent(text, session.callerRole)) {
                const worker = DB.getWorkerByPhone(session.callerPhone);
                const hasAvailabilityClause = /\b(available|free|duty|from \d|to \d|\d to \d|timing|hours|schedule|varege|inda|o'clock|wanted to work|want to work|ready to work)\b/i.test(lowerCleaned);
                const detectedTrade = extractTradeAndService(text);
                const tradeNoun = getTradePersonNoun(detectedTrade || (worker ? worker.trade : 'Specialist'));

                if (hasAvailabilityClause) {
                    const range = extractTimeRange(text);
                    const { date } = extractDateTimeEntities(text);
                    const targetDate = date || 'Tomorrow';
                    const isAvail = !lowerCleaned.includes('not available') && !lowerCleaned.includes('unavailable') && !lowerCleaned.includes('off') && !lowerCleaned.includes('leave');

                    if (worker) {
                        session.callerRole = 'worker';
                        session.context.pendingAvailabilityData = {
                            workerId: worker.id,
                            name: worker.name,
                            trade: detectedTrade || worker.trade,
                            phone: session.callerPhone,
                            date: targetDate,
                            startTime: range.startTime,
                            endTime: range.endTime,
                            startDisplay: range.startDisplay,
                            endDisplay: range.endDisplay,
                            isAvailable: isAvail
                        };
                        session.context.pendingIntent = 'CONFIRM_UPDATE_AVAILABILITY';
                        actionsPerformed.push(`Recognized verified worker ${worker.name}; prepared availability update for ${targetDate}`);
                        spokenResponse = `Got it. You're ${tradeNoun} and you're available ${targetDate.toLowerCase()} from ${range.startDisplay} to ${range.endDisplay}. Would you like me to save that?`;
                    } else {
                        session.callerRole = 'worker';
                        session.context.pendingIntent = 'CONFIRM_REGISTER_OFFER';
                        actionsPerformed.push(`Unregistered caller stated worker availability`);
                        spokenResponse = `You're not registered as a GigSync worker yet. Would you like to register?`;
                    }
                } else {
                    if (worker) {
                        spokenResponse = `Hello! I recognize you as a registered ${worker.trade}. Would you like to update your schedule, check your bookings, or view your earnings?`;
                    } else {
                        session.context.pendingIntent = 'CONFIRM_REGISTER_OFFER';
                        spokenResponse = `Okay. Are you registering as a GigSync worker or updating your worker details?`;
                    }
                    actionsPerformed.push(`Recognized worker self-identification`);
                }
            }

            // C.5 Worker Schedule Inquiry ("What jobs do I have today?")
            else if (/\b(what jobs|what job|any jobs|do i have any jobs|do i have any bookings|my bookings|my schedule|check my schedule|show my jobs|what are my jobs|am i available|check my availability|my working hours)\b/i.test(lowerCleaned)) {
                detectedIntent = 'get_worker_schedule';
                session.callerRole = 'worker';
                const { date } = extractDateTimeEntities(text);
                const targetDate = date || 'Today';
                toolExecuted = 'getWorkerSchedule';
                toolResult = AI_TOOLS.getWorkerSchedule({ workerPhone: session.callerPhone, date: targetDate });

                const matchingSlot = (toolResult.availabilitySlots || []).find(s => s.date_str && s.date_str.toLowerCase() === targetDate.toLowerCase());
                if (matchingSlot) {
                    spokenResponse = `Yes, you are marked available for ${targetDate.toLowerCase()} from ${matchingSlot.start_time} to ${matchingSlot.end_time}.`;
                } else if (!toolResult.count || toolResult.count === 0) {
                    spokenResponse = `You don't have any jobs scheduled for ${targetDate.toLowerCase()}.`;
                } else {
                    const first = toolResult.bookings[0];
                    spokenResponse = `You have ${toolResult.count} job(s) for ${targetDate.toLowerCase()}: ${first.service} for ${first.customer_name} at ${first.requested_time} in ${first.location}.`;
                }
                actionsPerformed.push(`Queried worker schedule (${toolResult.count || 0} jobs found)`);
            }

            // C.6 Worker Next Job
            else if (/\b(who is my next|where is my next|what time is my next|next customer|next job|next booking|show me my next)\b/i.test(lowerCleaned)) {
                detectedIntent = 'get_worker_next_job';
                session.callerRole = 'worker';
                toolExecuted = 'getWorkerNextJob';
                toolResult = AI_TOOLS.getWorkerNextJob({ workerPhone: session.callerPhone });
                if (toolResult.status === 'none') {
                    spokenResponse = `You don't have any upcoming jobs scheduled right now.`;
                } else {
                    spokenResponse = `Your next job is for ${toolResult.job.customer_name} at ${toolResult.job.location} at ${toolResult.job.requested_time} for ${toolResult.job.service}.`;
                }
                actionsPerformed.push(`Queried worker next job`);
            }

            // C.7 Worker Earnings
            else if (/\b(how much did i earn|how much i earned|my earnings|show my earnings|show my completed jobs|worker earnings)\b/i.test(lowerCleaned)) {
                detectedIntent = 'get_worker_earnings';
                session.callerRole = 'worker';
                toolExecuted = 'getWorkerEarnings';
                toolResult = AI_TOOLS.getWorkerEarnings({ workerPhone: session.callerPhone });
                const earned = toolResult.earnings.thisMonth || toolResult.earnings.totalEarnings || 0;
                const completed = toolResult.earnings.totalCompletedJobs || 0;
                spokenResponse = `You have earned ₹${earned} this month across ${completed} completed jobs.`;
                actionsPerformed.push(`Calculated worker earnings (₹${earned})`);
            }

            // C.8 Worker Job Completion
            else if (/\b(i completed the job|job completed|job is completed|i finished the job|completed the job)\b/i.test(lowerCleaned)) {
                detectedIntent = 'update_job_status';
                session.callerRole = 'worker';
                toolExecuted = 'updateJobStatusByWorker';
                toolResult = AI_TOOLS.updateJobStatusByWorker({ workerPhone: session.callerPhone, status: 'Completed' });
                spokenResponse = toolResult.status === 'success'
                    ? `Great work! Job #${toolResult.jobId} has been marked completed.`
                    : `No active job was found to complete.`;
                actionsPerformed.push(`Worker marked job completed`);
            }

            // C.9 Job Posting & Creation Requests
            else if (/\b(post a job|create a job|job posting|post job|create a request|create request|i need someone for|can you post|post a request|book a repair|need repair|need service)\b/i.test(lowerCleaned)) {
                detectedIntent = 'create_job';
                const detectedTrade = extractTradeAndService(text) || session.context.currentService;
                const { date, time } = extractDateTimeEntities(text);

                if (!detectedTrade) {
                    session.context.pendingIntent = 'CREATE_JOB_AWAITING_SERVICE';
                    spokenResponse = `Sure. What type of trade specialist or repair work do you need?`;
                } else {
                    session.context.currentService = detectedTrade;
                    session.context.currentDate = date || session.context.currentDate || 'Today';
                    session.context.currentTime = time || session.context.currentTime || 'Immediate';
                    session.context.pendingJobData = {
                        customerPhone: session.callerPhone,
                        customerName: session.callerName,
                        service: detectedTrade,
                        problemDescription: text,
                        location: `${session.city} Town`,
                        city: session.city,
                        requestedDate: session.context.currentDate,
                        requestedTime: session.context.currentTime,
                        budget: '₹300'
                    };
                    session.context.pendingIntent = 'CONFIRM_POST_JOB';
                    spokenResponse = `I have prepared a ${detectedTrade} job request in ${session.city} for ${session.context.currentDate} (${session.context.currentTime}). Shall I post it to nearby specialists?`;
                    actionsPerformed.push(`Drafted job request for ${detectedTrade} in ${session.city}`);
                }
            }

            // C.10 Customer Bookings Inquiry
            else if (session.callerRole === 'customer' && /\b(my bookings|my orders|my active job|do i have a booking|what bookings do i have|what bookings|check my booking)\b/i.test(lowerCleaned)) {
                detectedIntent = 'get_customer_bookings';
                toolExecuted = 'getCustomerBookings';
                toolResult = AI_TOOLS.getCustomerBookings({ customerPhone: session.callerPhone });
                actionsPerformed.push(`Queried customer booking records`);

                if (toolResult.count > 0) {
                    const summary = toolResult.bookings.map(b => `#${b.id} for ${b.service} (${b.status})`).join(', ');
                    spokenResponse = `You have ${toolResult.count} booking(s) on file: ${summary}.`;
                } else {
                    spokenResponse = `You don't have any bookings in your account right now. Would you like me to help you post a job or find a specialist?`;
                }
            }

            // C.11 Customer Search Specialists
            else if (/\b(electrician|plumber|carpenter|mechanic|painter|technician|mason|tailor|welder|cleaning|driver|repair|appliance|ac)\b/i.test(lowerCleaned)) {
                detectedIntent = 'find_worker';
                const service = extractTradeAndService(text) || 'Specialist';
                const { date, time } = extractDateTimeEntities(text);
                toolExecuted = 'findWorkers';
                toolResult = AI_TOOLS.findWorkers({ trade: service, city: session.city, date: date || 'Today' });
                if (!toolResult.workers || toolResult.workers.length === 0) {
                    spokenResponse = `I couldn't find any registered ${service} specialists available in ${session.city} today. Would you like me to post an open job request so nearby workers can respond?`;
                    session.context.pendingJobData = {
                        customerPhone: session.callerPhone,
                        customerName: session.callerName,
                        service,
                        location: `${session.city} Town`,
                        city: session.city,
                        requestedDate: date || 'Today',
                        requestedTime: time || 'Immediate',
                        budget: '₹300'
                    };
                    session.context.pendingIntent = 'CONFIRM_POST_JOB';
                } else {
                    const top = toolResult.workers[0];
                    session.context.lastSelectedWorker = top;
                    session.context.pendingIntent = 'CONFIRM_CONNECT_WORKER';
                    spokenResponse = `Yes, I found ${toolResult.count} registered ${service} specialists available in ${session.city}. The closest is ${top.name} (${top.startingPrice || '₹300'}). Shall I connect you with ${top.name}?`;
                }
                actionsPerformed.push(`Searched database for ${service} specialists`);
            }

            // Default graceful prompt
            else {
                spokenResponse = session.callerRole === 'worker'
                    ? `How can I assist you with your schedule, bookings, or earnings today?`
                    : `Welcome to GigSync. What service or trade specialist are you looking for in ${session.city}?`;
                actionsPerformed.push(`Default conversational guidance`);
            }
        }

        // Add assistant turn to session memory
        sessionManager.addTurn(session, 'assistant', spokenResponse);

        // Record real call log in SQLite DB
        DB.logCall({
            callerPhone: session.callerPhone,
            callerRole: session.callerRole,
            transcript: text,
            intentDetected: detectedIntent || toolExecuted || session.context.pendingIntent || 'conversation',
            actionsTaken: actionsPerformed.join('; '),
            durationSeconds: 10
        });

        console.log('\n[VOICE] Transcript:', text);
        console.log('[VOICE] Detected intent:', detectedIntent);
        console.log('[VOICE] Extracted entities:', extractedEntities);
        console.log('[VOICE] Selected tool:', toolExecuted);
        console.log('[VOICE] Tool result:', toolResult ? (toolResult.count !== undefined ? `${toolResult.count} workers found` : (toolResult.job ? `Job #${toolResult.job.id}` : toolResult.status)) : null);
        console.log('[VOICE] Final response:', spokenResponse);

        return {
            spokenResponse,
            toolExecuted,
            toolResult,
            detectedIntent,
            extractedEntities,
            actionsPerformed,
            shouldEndCall,
            context: {
                currentService: session.context.currentService,
                currentLocation: session.city,
                pendingIntent: session.context.pendingIntent,
                workersFound: session.context.lastFoundWorkers.length
            }
        };
    }
}


const aiAgent = new ContextAwareVoiceAgent();

module.exports = {
    aiAgent,
    geminiBrain,
    GEMINI_TOOLS_DECLARATIONS,
    AI_TOOLS,
    sessionManager
};

