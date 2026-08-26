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
    findWorkers({ service = 'all', city = 'Ramanagara' }) {
        const workers = DB.getAllWorkers({
            service: service === 'all' ? undefined : service,
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

        const systemInstruction = `You are GigSync AI, the official voice assistant and conversational intelligence for GigSync — a hyperlocal marketplace serving Tier-2 and Tier-3 cities in Karnataka, India (including Ramanagara, Kanakapura, Channapatna, Bengaluru, Mysuru, Bidadi, Magadi, etc.).

AUTHENTICATION CONTEXT:
- Caller Name: ${session.callerName || 'User'}
- Caller Phone: ${session.callerPhone || '9876543210'}
- Caller Role: ${session.callerRole || 'customer'}
- Service City: ${session.city || 'Ramanagara'}

CRITICAL RULES:
1. SOURCE OF TRUTH: You MUST use the provided tools to query real data for any question about workers, jobs, bookings, schedules, or earnings. NEVER answer from general assumptions or invent worker names, phone numbers, ratings, or prices.
2. ZERO FABRICATION: If a tool returns 0 matching workers or no bookings, state that honestly (e.g. "I couldn't find any registered electricians available in Ramanagara today.") and offer to post an open job request.
3. NO FAKE CONFIRMATIONS: NEVER claim a booking or job has been confirmed unless the 'createJob' or 'updateJob' tool has executed successfully and returned a job record.
4. ROLE AUTHORIZATION: If caller is a 'customer' and asks for worker earnings or worker schedules, explain politely that earnings are only accessible from registered worker accounts.
5. LANGUAGE: Automatically detect and respond in the language used by the user (English, Kannada ಕನ್ನಡ, or Hindi). If caller speaks Kannada, reply in Kannada. If English, reply in English.
6. CONVERSATION FLOW:
   - If caller asks "who is available?" or "worker available", ask which service/trade they need if not specified.
   - If caller says "thank you", "that's all", "bye", acknowledge warmly and say goodbye.
   - Keep answers concise, clear, and natural for voice synthesis and audio playback.
7. WORKER INTENT vs CUSTOMER INTENT (CRITICAL):
   - Statements like "Hello, my name is Rajesh. I am an electrician. I wanted to work from 11 to 5 o'clock tomorrow.", "Naanu electrician, naale 11 inda 5 varege available iddini.", "I am an electrician and I want to work tomorrow from 11 to 5", "My name is Rajesh I am an electrician", "I am available from 9 to 5", "My availability is 10 to 6" are WORKER INTENTS.
   - For worker availability statements, NEVER call 'findWorkers' (which is strictly for customers searching for workers).
   - Acknowledge their role and time window: "Hi [Name]! Got it. You’re [an electrician] and you’re available [tomorrow] from [11 AM to 5 PM]. Would you like me to add this to your schedule?"
   - When the worker confirms ("yes", "do it", "add it"), call 'updateWorkerAvailability' and respond: "Done! Your availability has been updated for [tomorrow] from [11 AM to 5 PM]."
   - Only call 'findWorkers' when a CUSTOMER is asking to FIND or HIRE a worker (e.g. "I need an electrician tomorrow", "Nanage electrician beku", "Can you find a plumber?", "Is there an electrician available today?").`;

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
        // B. PENDING MULTI-TURN CONFIRMATIONS (TOP PRIORITY)
        // ======================================================================
        else if (session.context.pendingIntent === 'CONFIRM_REGISTER_WORKER' && (isAffirmative || isNegative)) {
            detectedIntent = 'confirm_register_worker';
            if (isAffirmative && session.context.pendingWorkerData) {
                const p = session.context.pendingWorkerData;
                toolExecuted = 'registerWorkerProfile';
                toolResult = AI_TOOLS.registerWorkerProfile({
                    name: p.name,
                    phone: p.phone,
                    trade: p.trade,
                    city: session.city
                });
                AI_TOOLS.updateWorkerAvailability({
                    workerPhone: p.phone,
                    trade: p.trade,
                    date: p.date,
                    startTime: p.startTime,
                    endTime: p.endTime,
                    isAvailable: true
                });
                actionsPerformed.push(`Registered worker ${p.name} (${p.trade}, ${p.phone}) and updated availability for ${p.date}`);
                spokenResponse = `Done. You're registered and available ${p.date.toLowerCase()} from ${p.startDisplay} to ${p.endDisplay}.`;
                session.context.pendingIntent = null;
                session.context.pendingWorkerData = null;
                session.context.lastActionCompleted = 'WORKER_REGISTERED';
            } else if (isNegative) {
                spokenResponse = `No problem, I haven't registered this profile. Let me know if you need anything else.`;
                session.context.pendingIntent = null;
                session.context.pendingWorkerData = null;
            }
        }

        else if (session.context.pendingIntent === 'CONFIRM_UPDATE_AVAILABILITY' && (isAffirmative || isNegative)) {
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

                spokenResponse = `Done! Your availability has been updated for ${avail.date.toLowerCase()} from ${avail.startDisplay} to ${avail.endDisplay}.`;
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

        // ======================================================================
        // C. WORKER ACTIONS & COMMANDS (PHONE / 3.5MM HARDWARE VOICE AGENT)
        // ======================================================================
        // 1. Worker Schedule & Bookings Inquiry
        else if (/\b(what jobs|what job|any jobs|do i have any jobs|do i have any bookings|my bookings|my schedule|check my schedule|show my jobs|what are my jobs|am i available|check my availability|my working hours)\b/i.test(lowerCleaned)) {
            detectedIntent = 'get_worker_schedule';
            session.callerRole = 'worker';
            const { date } = extractDateTimeEntities(text);
            const targetDate = date || 'Today';
            toolExecuted = 'getWorkerSchedule';
            toolResult = AI_TOOLS.getWorkerSchedule({ workerPhone: session.callerPhone, date: targetDate });
            
            const matchingSlot = (toolResult.availabilitySlots || []).find(s => s.date_str.toLowerCase() === targetDate.toLowerCase());
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

        // 2. Worker Next Customer / Next Job
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

        // 3. Worker Earnings Inquiry
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

        // 4. Worker Job Progress Actions (Completed, Arrived, Cancelled)
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
        else if (/\b(i have arrived|i reached the location|reached location|i arrived)\b/i.test(lowerCleaned)) {
            detectedIntent = 'update_job_status';
            session.callerRole = 'worker';
            toolExecuted = 'updateJobStatusByWorker';
            toolResult = AI_TOOLS.updateJobStatusByWorker({ workerPhone: session.callerPhone, status: 'In Progress' });
            spokenResponse = toolResult.status === 'success'
                ? `Got it. Updated your status to arrived at the job location.`
                : `No active booking found to update.`;
            actionsPerformed.push(`Worker marked arrival`);
        }
        else if (/\b(cannot take this job|cannot take tomorrow|cancel this job|unassign me)\b/i.test(lowerCleaned)) {
            detectedIntent = 'update_job_status';
            session.callerRole = 'worker';
            toolExecuted = 'updateJobStatusByWorker';
            toolResult = AI_TOOLS.updateJobStatusByWorker({ workerPhone: session.callerPhone, status: 'Cancelled' });
            spokenResponse = toolResult.status === 'success'
                ? `Understood. I have unassigned you from the job.`
                : `No active booking found to cancel.`;
            actionsPerformed.push(`Worker cancelled assigned job`);
        }

        // 5. Worker Unavailable / Off-Duty
        else if (/\b(not available on|make me unavailable|cancel my availability|cancel availability|not available)\b/i.test(lowerCleaned) && session.callerRole === 'worker') {
            detectedIntent = 'set_worker_unavailable';
            const { date } = extractDateTimeEntities(text);
            const targetDate = date || 'Tomorrow';
            toolExecuted = 'updateWorkerAvailability';
            toolResult = AI_TOOLS.updateWorkerAvailability({ workerPhone: session.callerPhone, date: targetDate, isAvailable: false });
            spokenResponse = `Done. You have been marked off-duty for ${targetDate.toLowerCase()}.`;
            actionsPerformed.push(`Marked worker off-duty for ${targetDate}`);
        }

        // 6. Worker Self-Identification & Availability / Onboarding
        else if (isWorkerIntent(text, session.callerRole)) {
            detectedIntent = 'worker_availability';
            session.callerRole = 'worker';
            const spokenPhone = extractPhoneNumber(text);
            if (spokenPhone) {
                session.callerPhone = spokenPhone;
            }

            const detectedName = extractCallerName(text);
            if (detectedName && (!session.callerName || session.callerName === 'User')) {
                session.callerName = detectedName;
            }

            const detectedTrade = extractTradeAndService(text) || session.context.currentService;
            const { date } = extractDateTimeEntities(text);
            const targetDate = date || 'Tomorrow';
            const range = extractTimeRange(text);

            extractedEntities = {
                intent: 'worker_availability',
                name: session.callerName,
                worker_type: detectedTrade || 'Electrician',
                phone: session.callerPhone,
                date: targetDate.toLowerCase(),
                start_time: range.startTime,
                end_time: range.endTime
            };

            const isAvail = !lowerCleaned.includes('not available') && !lowerCleaned.includes('unavailable') && !lowerCleaned.includes('off') && !lowerCleaned.includes('leave');
            const hasAvailabilityClause = /\b(available|free|duty|from \d|to \d|\d to \d|timing|hours|schedule|varege|inda|o'clock|wanted to work|want to work|ready to work)\b/i.test(lowerCleaned);

            const worker = DB.getWorkerByPhone(session.callerPhone);
            const tradeNoun = getTradePersonNoun(detectedTrade || (worker ? worker.trade : 'Specialist'));

            const isDirectImperative = /\b(?:set my|update my|change my|mark my|mark me)\s+(?:availability|schedule|duty)\b/i.test(lowerCleaned);
            const isRegisteredWorkerDirectUpdate = worker && (isDirectImperative || /\b(?:i am available|i'm available|available from|free from)\b/i.test(lowerCleaned)) && !spokenPhone && !text.toLowerCase().includes('my name is');

            if (hasAvailabilityClause) {
                if (worker) {
                    session.callerRole = 'worker';
                    const workerData = {
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

                    session.context.pendingAvailabilityData = workerData;
                    session.context.pendingIntent = 'CONFIRM_UPDATE_AVAILABILITY';
                    actionsPerformed.push(`Recognized verified worker ${worker.name}; prepared availability update for ${targetDate} (${range.startDisplay} to ${range.endDisplay})`);

                    spokenResponse = `Got it. You're ${tradeNoun} and you're available ${targetDate.toLowerCase()} from ${range.startDisplay} to ${range.endDisplay}. Would you like me to save that?`;
                } else {
                    // Unregistered caller — do not create a worker profile without verified registration process
                    session.callerRole = 'worker';
                    session.context.pendingIntent = 'CONFIRM_REGISTER_OFFER';
                    actionsPerformed.push(`Unregistered caller stated worker availability (${tradeNoun})`);

                    spokenResponse = `You're not registered as a GigSync worker yet. Would you like to register?`;
                }
            } else {
                if (worker) {
                    spokenResponse = `Hello ${session.callerName || worker.name}! I recognize you as a registered ${worker.trade} in ${session.city}. Would you like to update your working hours, check your schedule, or view incoming jobs?`;
                } else {
                    session.context.pendingIntent = 'CONFIRM_REGISTER_OFFER';
                    spokenResponse = `You're not registered as a GigSync worker yet. Would you like to register?`;
                }
                actionsPerformed.push(`Recognized worker self-identification`);
            }
        }

        // ======================================================================
        // A.1 GEMINI API CLOUD BRAIN (PRIMARY FOR NATURAL QUERIES)
        // ======================================================================
        else if (!spokenResponse && (process.env.GEMINI_API_KEY || geminiBrain.getClient())) {
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
        // DETERMINISTIC RULES & DATABASE ENGINE (FALLBACK / OFFLINE)
        // ======================================================================
        if (!spokenResponse) {
            if (/\b(thank you|thanks|thanks a lot|thank you so much|thank you for your help|dhanyavada|dhanyavadagalu|dhanyavadam|shukriya|bahut shukriya)\b/i.test(lowerCleaned) &&
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
            }

            // ======================================================================
            // C. MULTI-TURN CONFIRMATIONS & AFFIRMATIONS ("yes", "do it", "cancel it")
            // ======================================================================
            else if (session.context.pendingIntent === 'CONFIRM_POST_JOB' && (isAffirmative || isNegative)) {
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
                actionsPerformed.push(`Dispatched direct booking #${toolResult.job.id} to ${worker.name}`);
                spokenResponse = `Booking confirmed! I have assigned ${worker.name} (${worker.trade}) for your request. They have been notified. Is there anything else you need?`;
                session.context.pendingIntent = null;
                session.context.lastActionCompleted = 'BOOKING_CONFIRMED';
            } else if (isNegative) {
                spokenResponse = `Understood. Would you like me to look for another specialist or post an open job?`;
                session.context.pendingIntent = null;
            }
        }

        else if (session.context.pendingIntent === 'CONFIRM_CANCEL_BOOKING' && (isAffirmative || isNegative)) {
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

        else if (session.context.pendingIntent === 'CONFIRM_UPDATE_AVAILABILITY' && (isAffirmative || isNegative)) {
            if (isAffirmative && session.context.pendingAvailabilityData) {
                const avail = session.context.pendingAvailabilityData;
                toolExecuted = 'updateWorkerAvailability';
                toolResult = AI_TOOLS.updateWorkerAvailability({
                    workerPhone: session.callerPhone,
                    trade: avail.trade || 'Specialist',
                    date: avail.date,
                    startTime: avail.startTime,
                    endTime: avail.endTime,
                    isAvailable: avail.isAvailable
                });
                actionsPerformed.push(`Updated ${avail.date} availability (${avail.startTime} – ${avail.endTime}) in database`);

                spokenResponse = `Done! Your availability has been updated for ${avail.date.toLowerCase()} from ${avail.startDisplay} to ${avail.endDisplay}.`;
                session.context.pendingIntent = null;
                session.context.pendingAvailabilityData = null;
                session.context.lastActionCompleted = 'AVAILABILITY_UPDATED';
            } else if (isNegative) {
                spokenResponse = `No problem, I haven't added this to your schedule. Let me know if you need anything else.`;
                session.context.pendingIntent = null;
                session.context.pendingAvailabilityData = null;
            }
        }

        // Follow-up after completed action when user says "No" / "Nothing else"
        else if (session.context.lastActionCompleted && isShortNegation) {
            spokenResponse = `You're welcome! Have a great day.`;
            actionsPerformed.push(`Completed conversation after action`);
            session.context.lastActionCompleted = null;
            shouldEndCall = true;
        }

        // ======================================================================
        // D. GREETING / WELCOME
        // ======================================================================
        else if (/^(hello|hi|hey|namaskara|namaste|good morning|good afternoon|good evening|ನಮಸ್ಕಾರ)\b/i.test(lowerCleaned) && lowerCleaned.split(/\s+/).length <= 4) {
            spokenResponse = `Hello! Welcome to GigSync. How may I help you today?`;
            actionsPerformed.push(`Greeting acknowledged`);
        }

        // ======================================================================
        // E. GENERAL PLATFORM CAPABILITIES
        // ======================================================================
        else if (lowerCleaned.includes('what is gigsync') || lowerCleaned.includes('how does gigsync work') || lowerCleaned.includes('what can gigsync do') || lowerCleaned.includes('about gigsync')) {
            spokenResponse = `GigSync is an on-demand hyperlocal platform connecting verified trade specialists like electricians, plumbers, and mechanics with customers in real time through web and voice.`;
            actionsPerformed.push(`Explained GigSync platform architecture`);
        }

        else if (lowerCleaned.includes('kannada') || lowerCleaned.includes('ಕನ್ನಡ') || lowerCleaned.includes('hindi') || lowerCleaned.includes('language')) {
            spokenResponse = `Yes! GigSync supports English, Kannada, and Hindi voice interactions. You can speak naturally in any of these languages.`;
            actionsPerformed.push(`Confirmed multi-language support`);
        }

        else if (lowerCleaned.includes('how do workers receive') || lowerCleaned.includes('how worker gets job') || lowerCleaned.includes('how worker receive')) {
            spokenResponse = `When a customer posts a job or books a specialist, nearby on-duty registered workers receive instant notifications directly on their GigSync dashboard.`;
            actionsPerformed.push(`Explained worker dispatch workflow`);
        }

        else if (lowerCleaned.includes('what happens after i post') || lowerCleaned.includes('after posting')) {
            spokenResponse = `After you post a job, nearby registered specialists are notified. As soon as a worker accepts, your booking status updates and the technician heads to your location.`;
            actionsPerformed.push(`Explained post-job lifecycle`);
        }

        else if (lowerCleaned.includes('online payment') || lowerCleaned.includes('pay online') || lowerCleaned.includes('upi') || lowerCleaned.includes('card payment')) {
            spokenResponse = `Currently, payments are settled directly via cash on service completion. Online digital payments will be available in an upcoming update.`;
            actionsPerformed.push(`Explained current payment method`);
        }

        // ======================================================================
        // F. OFF-TOPIC QUESTIONS
        // ======================================================================
        else if (lowerCleaned.includes('capital of') || lowerCleaned.includes('who is president') || lowerCleaned.includes('tell me a joke') || lowerCleaned.includes('weather in') || lowerCleaned.includes('how tall is')) {
            spokenResponse = `I'm mainly here to help with GigSync trade specialists, jobs and bookings in ${session.city}. How can I assist you with your home or vehicle service needs?`;
            actionsPerformed.push(`Politely refocused off-topic question`);
        }

        // ======================================================================
        // G. SERVICE CATALOG INQUIRIES
        // ======================================================================
        else if (lowerCleaned.includes('what services') || lowerCleaned.includes('which services') || lowerCleaned.includes('services you provide') || lowerCleaned.includes('what do you do') || lowerCleaned.includes('ಯಾವ ಸೇವೆಗಳು')) {
            spokenResponse = `GigSync connects verified local specialists for: Electrical, Plumbing, Carpentry, Two-Wheeler Mechanics, AC & Refrigerator Repair, Washing Machine Repair, Painting, Masonry, Tailoring, Welding, Driver Services, TV Repair, and Water Purifier Service in ${session.city}.`;
            actionsPerformed.push(`Provided service catalog`);
        }

        // ======================================================================
        // H. CUSTOMER PROFILE & LOCATION MANAGEMENT
        // ======================================================================
        else if (lowerCleaned.includes('my profile') || lowerCleaned.includes('my location') || lowerCleaned.includes('saved on my account') || lowerCleaned.includes('where am i currently set')) {
            const user = DB.getUserByPhone(session.callerPhone);
            const cityName = user ? user.city : session.city;
            const areaName = user ? user.area : 'Town';
            spokenResponse = `Your account is registered under ${user ? user.name : session.callerName} with service location set to ${cityName} (${areaName}).`;
            actionsPerformed.push(`Retrieved customer profile from database`);
        }

        else if (lowerCleaned.includes('change my location') || lowerCleaned.includes('update my location') || lowerCleaned.includes('set location')) {
            const newCity = extractLocationEntity(text, session.city);
            session.city = newCity;
            session.context.currentLocation = newCity;
            DB.updateCustomerProfile(session.callerPhone, { city: newCity });
            spokenResponse = `Your service location has been updated to ${newCity}. Registered specialists in ${newCity} will now be prioritized.`;
            actionsPerformed.push(`Updated service location to ${newCity}`);
        }

        // ======================================================================
        // I. PRICING & FEE ESTIMATES
        // ======================================================================
        else if (session.callerRole === 'customer' && (lowerCleaned.includes('price') || lowerCleaned.includes('visiting fee') || lowerCleaned.includes('rate') || (lowerCleaned.includes('how much') && !lowerCleaned.includes('earn')) || (lowerCleaned.includes('cost') && !lowerCleaned.includes('earn')))) {
            const detectedTrade = extractTradeAndService(text) || session.context.currentService || 'specialist visit';
            spokenResponse = `The standard visiting fee for registered ${detectedTrade} specialists in ${session.city} starts from ₹300 to ₹350, with the final cost determined by required parts and labor.`;
            actionsPerformed.push(`Provided transparent pricing estimate`);
        }

        // ======================================================================
        // J. CUSTOMER BOOKING STATUS & TRACKING
        // ======================================================================
        else if (session.callerRole === 'customer' && (lowerCleaned.includes('who accepted') || lowerCleaned.includes('when is the worker coming') || lowerCleaned.includes('what\'s happening with my booking') || lowerCleaned.includes('what is happening with my booking') || lowerCleaned.includes('is my booking confirmed') || lowerCleaned.includes('booking status'))) {
            toolExecuted = 'getCustomerBookings';
            toolResult = AI_TOOLS.getCustomerBookings({ customerPhone: session.callerPhone });
            actionsPerformed.push(`Checked customer active booking status`);

            if (toolResult.count > 0) {
                const latest = toolResult.bookings[0];
                if (latest.status === 'Confirmed' || latest.status === 'Accepted') {
                    spokenResponse = `Your ${latest.service} booking #${latest.id} is confirmed with ${latest.worker_name || 'an assigned specialist'}. They are scheduled for ${latest.requested_date} (${latest.requested_time}).`;
                } else if (latest.status === 'On the Way') {
                    spokenResponse = `Your specialist ${latest.worker_name || ''} is currently on the way to your location for job #${latest.id}.`;
                } else if (latest.status === 'Requested') {
                    spokenResponse = `Your ${latest.service} job request #${latest.id} is posted and currently waiting for a nearby specialist to accept.`;
                } else {
                    spokenResponse = `Your latest ${latest.service} booking #${latest.id} has status: ${latest.status}.`;
                }
            } else {
                spokenResponse = `You don't have any active bookings right now. Would you like me to help you find a specialist or post a job?`;
            }
        }

        // ======================================================================
        // K. CANCEL BOOKING
        // ======================================================================
        else if (session.callerRole === 'customer' && (lowerCleaned.includes('cancel my booking') || lowerCleaned.includes('cancel my job') || lowerCleaned.includes('cancel booking'))) {
            toolExecuted = 'getCustomerBookings';
            toolResult = AI_TOOLS.getCustomerBookings({ customerPhone: session.callerPhone });
            actionsPerformed.push(`Queried customer bookings for cancellation`);

            const activeJobs = toolResult.bookings.filter(b => b.status !== 'Completed' && b.status !== 'Cancelled');
            if (activeJobs.length === 1) {
                const target = activeJobs[0];
                session.context.pendingIntent = 'CONFIRM_CANCEL_BOOKING';
                session.context.pendingCancelJobId = target.id;
                spokenResponse = `I found active booking #${target.id} for ${target.service}. Are you sure you want to cancel this booking?`;
            } else if (activeJobs.length > 1) {
                const target = activeJobs[0];
                session.context.pendingIntent = 'CONFIRM_CANCEL_BOOKING';
                session.context.pendingCancelJobId = target.id;
                spokenResponse = `You have ${activeJobs.length} active bookings. Would you like to cancel the latest one: #${target.id} for ${target.service}?`;
            } else {
                spokenResponse = `You don't have any active bookings to cancel in the database right now.`;
            }
        }

        // ======================================================================
        // L. WORKER INTENTS & AUTHORIZATION ENFORCEMENT
        // ======================================================================
        else if (session.callerRole === 'customer' && !isWorkerIntent(text, 'customer') && (lowerCleaned.includes('how much did i earn') || lowerCleaned.includes('my worker earnings') || lowerCleaned.includes('my earnings as a worker'))) {
            spokenResponse = `You are currently logged in as a customer. Worker earnings, job history, and schedule settings are only accessible from registered worker accounts.`;
            actionsPerformed.push(`Enforced worker authorization constraint on customer caller`);
        }

        // 1. Worker Self-Identification & Availability Updates (e.g. "My name is Rajesh I am an electrician I am available from 9 to 5 today")
        // 1. Worker Self-Identification & Availability Updates (e.g. "Hello my name is Rajesh I am an electrician I wanted to work from 11 to 5 o'clock tomorrow")
        else if (isWorkerIntent(text, session.callerRole)) {
            detectedIntent = 'worker_availability';
            session.callerRole = 'worker';
            const detectedName = extractCallerName(text);
            if (detectedName && (!session.callerName || session.callerName === 'User')) {
                session.callerName = detectedName;
            }

            const detectedTrade = extractTradeAndService(text) || session.context.currentService;
            const { date } = extractDateTimeEntities(text);
            const targetDate = date || 'Tomorrow';
            const range = extractTimeRange(text);

            extractedEntities = {
                intent: 'worker_availability',
                name: session.callerName,
                worker_type: detectedTrade || 'Electrician',
                date: targetDate.toLowerCase(),
                start_time: range.startTime,
                end_time: range.endTime
            };

            const isAvail = !lowerCleaned.includes('not available') && !lowerCleaned.includes('unavailable') && !lowerCleaned.includes('off') && !lowerCleaned.includes('leave');
            const hasAvailabilityClause = /\b(available|free|duty|from \d|to \d|\d to \d|timing|hours|schedule|varege|inda|o'clock|wanted to work|want to work|ready to work)\b/i.test(lowerCleaned);

            // Check if caller is registered in workers table
            const worker = DB.getWorkerByPhone(session.callerPhone);
            const tradeNoun = getTradePersonNoun(detectedTrade || (worker ? worker.trade : 'Specialist'));

            // Check if caller explicitly gave an immediate imperative command (e.g. "Set my availability for tomorrow from 9 to 6", "Update my schedule 9 to 5")
            const isDirectImperative = /\b(?:set my|update my|change my|mark my|mark me)\s+(?:availability|schedule|duty)\b/i.test(lowerCleaned);

            if (hasAvailabilityClause) {
                if (isDirectImperative) {
                    toolExecuted = 'updateWorkerAvailability';
                    toolResult = AI_TOOLS.updateWorkerAvailability({
                        workerPhone: session.callerPhone,
                        trade: detectedTrade || (worker ? worker.trade : 'Specialist'),
                        date: targetDate,
                        startTime: range.startTime,
                        endTime: range.endTime,
                        isAvailable: isAvail
                    });
                    actionsPerformed.push(`Updated ${targetDate} availability (${range.startTime} – ${range.endTime}) in database`);

                    spokenResponse = isAvail
                        ? `Done! Your availability has been updated for ${targetDate.toLowerCase()} from ${range.startDisplay} to ${range.endDisplay}.`
                        : `Done! You have been marked OFF-DUTY for ${targetDate.toLowerCase()}.`;
                } else {
                    // Conversational availability statement -> confirm before writing
                    session.context.pendingAvailabilityData = {
                        workerName: session.callerName || (worker ? worker.name : 'Rajesh'),
                        trade: detectedTrade || (worker ? worker.trade : 'Specialist'),
                        date: targetDate,
                        startTime: range.startTime,
                        endTime: range.endTime,
                        startDisplay: range.startDisplay,
                        endDisplay: range.endDisplay,
                        isAvailable: isAvail
                    };
                    session.context.pendingIntent = 'CONFIRM_UPDATE_AVAILABILITY';
                    actionsPerformed.push(`Prepared schedule update for ${targetDate} (${range.startDisplay} to ${range.endDisplay})`);

                    spokenResponse = `Hi ${session.callerName || (worker ? worker.name : 'there')}! Got it. You’re ${tradeNoun} and you’re available ${targetDate.toLowerCase()} from ${range.startDisplay} to ${range.endDisplay}. Would you like me to add this to your schedule?`;
                }
            } else {
                if (worker) {
                    spokenResponse = `Hello ${session.callerName || worker.name}! I recognize you as a registered ${worker.trade} in ${session.city}. Would you like to update your working hours, check your schedule, or view incoming jobs?`;
                } else {
                    spokenResponse = `Hello ${session.callerName || 'there'}! I understand you work as ${tradeNoun}. To start receiving customer job requests and manage your availability on GigSync, please register your worker profile with your phone number.`;
                }
                actionsPerformed.push(`Recognized worker self-identification`);
            }
        }

        // 2. Worker Schedule / Availability Inquiry
        else if (session.callerRole === 'worker' && (lowerCleaned.includes('my availability') || lowerCleaned.includes('am i available') || lowerCleaned.includes('my schedule') || lowerCleaned.includes('what is my schedule') || lowerCleaned.includes('check my schedule') || lowerCleaned.includes('ನನ್ನ ಶೆಡ್ಯೂಲ್'))) {
            const { date } = extractDateTimeEntities(text);
            const targetDate = date || 'Tomorrow';
            toolExecuted = 'getWorkerAvailability';
            toolResult = AI_TOOLS.getWorkerAvailability({ workerPhone: session.callerPhone, date: targetDate });
            actionsPerformed.push(`Queried worker availability for ${targetDate}`);

            if (toolResult.status === 'success' && toolResult.slot) {
                spokenResponse = `You are currently marked ${toolResult.slot.is_available ? 'Available' : 'Unavailable'} for ${targetDate} from ${toolResult.slot.start_time} to ${toolResult.slot.end_time}.`;
            } else if (toolResult.status === 'success') {
                spokenResponse = `You are currently marked ${toolResult.isAvailableNow ? 'ON-DUTY and Available' : 'OFF-DUTY'} today. No custom slot is set for ${targetDate}. Would you like to set one?`;
            } else {
                spokenResponse = `I couldn't find your worker profile in the database. Please make sure your worker account is registered with your phone number.`;
            }
        }

        else if (session.callerRole === 'worker' && (lowerCleaned.includes('earning') || lowerCleaned.includes('earn') || lowerCleaned.includes('income') || lowerCleaned.includes('payment') || lowerCleaned.includes('how many jobs have i completed') || lowerCleaned.includes('ಸಂಪಾದನೆ'))) {
            toolExecuted = 'getWorkerEarnings';
            toolResult = AI_TOOLS.getWorkerEarnings({ workerPhone: session.callerPhone });
            actionsPerformed.push(`Computed earnings from completed database gigs`);

            if (toolResult.earnings && toolResult.earnings.totalEarnings > 0) {
                spokenResponse = `You have earned ₹${toolResult.earnings.totalEarnings} from ${toolResult.earnings.totalCompletedJobs} completed gig(s) in the database.`;
            } else {
                spokenResponse = `You don't have any recorded earnings from completed jobs in the database yet.`;
            }
        }

        else if (session.callerRole === 'worker' && (lowerCleaned.includes('my jobs') || lowerCleaned.includes('my bookings') || lowerCleaned.includes('assigned') || lowerCleaned.includes('what jobs do i have') || lowerCleaned.includes('do i have any jobs') || lowerCleaned.includes('work today') || lowerCleaned.includes('work tomorrow'))) {
            const { date } = extractDateTimeEntities(text);
            toolExecuted = 'getWorkerBookings';
            toolResult = AI_TOOLS.getWorkerBookings({ workerPhone: session.callerPhone, date });
            actionsPerformed.push(`Queried assigned jobs for worker`);

            if (toolResult.count > 0) {
                const summary = toolResult.bookings.map(b => `${b.service} at ${b.location} (${b.requested_time}, Status: ${b.status})`).join('; ');
                spokenResponse = `You have ${toolResult.count} assigned booking(s): ${summary}.`;
            } else {
                spokenResponse = `You don't have any assigned bookings ${date ? 'for ' + date : 'right now'}.`;
            }
        }

        else if (session.callerRole === 'worker' && (lowerCleaned.includes('what jobs are available') || lowerCleaned.includes('open jobs') || lowerCleaned.includes('available jobs') || lowerCleaned.includes('show jobs'))) {
            const worker = DB.getWorkerByPhone(session.callerPhone);
            const trade = worker ? worker.trade : 'General Specialist';
            const openJobs = DB.getAvailableJobsForWorker(trade, session.city);
            actionsPerformed.push(`Queried open ${trade} requests in ${session.city}`);

            if (openJobs.length > 0) {
                const jobList = openJobs.slice(0, 3).map(j => `#${j.id} ${j.service} at ${j.location}`).join(', ');
                spokenResponse = `There are ${openJobs.length} open job(s) in ${session.city}: ${jobList}.`;
            } else {
                spokenResponse = `There are currently no open job requests for ${trade} in ${session.city}.`;
            }
        }

        else if (session.callerRole === 'worker' && (lowerCleaned.includes('profession') || lowerCleaned.includes('what am i registered') || lowerCleaned.includes('my trade') || lowerCleaned.includes('my skills'))) {
            const worker = DB.getWorkerByPhone(session.callerPhone);
            if (worker) {
                spokenResponse = `You are registered as a ${worker.trade} in ${worker.city} with a rating of ${worker.rating} stars and ${worker.jobs_completed} completed gigs.`;
                actionsPerformed.push(`Retrieved worker trade credentials`);
            } else {
                spokenResponse = `I couldn't find a registered worker profile for this phone number.`;
            }
        }

        // ======================================================================
        // M. CUSTOMER QUERIES: CHECK MY BOOKINGS / ORDERS
        // ======================================================================
        else if (session.callerRole === 'customer' && (lowerCleaned.includes('my bookings') || lowerCleaned.includes('my orders') || lowerCleaned.includes('my active job') || lowerCleaned.includes('do i have a booking') || lowerCleaned.includes('what bookings do i have') || lowerCleaned.includes('ನನ್ನ ಬುಕಿಂಗ್')) && !lowerCleaned.includes('book him') && !lowerCleaned.includes('book her') && !lowerCleaned.includes('book them') && !lowerCleaned.includes('book specialist')) {
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

        // ======================================================================
        // N. PRONOUN REFERENCE / CONNECT SPECIFIC WORKER ("book him", "hire him", "call him", "same worker")
        // ======================================================================
        else if (lowerCleaned.includes('connect') || lowerCleaned.includes('book him') || lowerCleaned.includes('book her') || lowerCleaned.includes('hire him') || lowerCleaned.includes('call him') || lowerCleaned.includes('contact him') || lowerCleaned.includes('same worker')) {
            if (session.context.lastSelectedWorker || session.context.lastFoundWorkers.length > 0) {
                const worker = session.context.lastSelectedWorker || session.context.lastFoundWorkers[0];
                session.context.lastSelectedWorker = worker;
                session.context.pendingIntent = 'CONFIRM_CONNECT_WORKER';
                spokenResponse = `I found ${worker.name}, a registered ${worker.trade} in ${worker.city} with a visiting fee of ${worker.startingPrice}. Shall I confirm and dispatch this booking to ${worker.name}?`;
                actionsPerformed.push(`Referenced ${worker.name} from previous database search`);
            } else {
                const trade = extractTradeAndService(text) || session.context.currentService;
                if (trade) {
                    toolExecuted = 'findWorkers';
                    toolResult = AI_TOOLS.findWorkers({ service: trade, city: session.city });
                    actionsPerformed.push(`Searched database for ${trade} in ${session.city}`);

                    if (toolResult.count > 0) {
                        const worker = toolResult.workers[0];
                        session.context.lastFoundWorkers = toolResult.workers;
                        session.context.lastSelectedWorker = worker;
                        session.context.pendingIntent = 'CONFIRM_CONNECT_WORKER';
                        spokenResponse = `I found ${worker.name}, a registered ${worker.trade} in ${worker.city}. Shall I confirm and book ${worker.name} for you?`;
                    } else {
                        spokenResponse = `I couldn't find any registered ${trade} specialists available in ${session.city} right now. Would you like me to post a job instead?`;
                    }
                } else {
                    spokenResponse = `Which trade specialist would you like me to connect you with? (e.g. Electrician, plumber, mechanic)`;
                }
            }
        }

        // ======================================================================
        // O. JOB POSTING & CREATION REQUESTS (e.g. "I need washing machine repair in Ramanagara", "Please create a request for...", "Can you post a job...")
        // ======================================================================
        else if (/\b(post a job|create a job|post job|create a request|create request|i need someone for|can you post|post a request|book a repair|need repair|need service|need someone to repair|repair my)\b/i.test(lowerCleaned)) {
            detectedIntent = 'create_job';
            const detectedTrade = extractTradeAndService(text) || session.context.currentService;
            const { date, time } = extractDateTimeEntities(text);

            extractedEntities = {
                intent: 'create_job',
                service: detectedTrade || 'Specialist Visit',
                problem: text,
                location: session.city,
                date: date || 'Today',
                time: time || 'Immediate'
            };

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

        // ======================================================================
        // P. FIND WORKERS / CHECK WORKER AVAILABILITY (e.g. "Is there an available electrician now in Ramanagara?", "Who is available...")
        // ======================================================================
        else {
            const explicitTrade = extractTradeAndService(text);
            const { date, time } = extractDateTimeEntities(text);

            const isWorkerAvailabilityQuery = /\b(anyone available|who is available|workers available|worker available|available today|available now|check availability|check worker|check workers|check worker available|check worker availability|is worker available|is any worker free|any worker free|who is free|is anyone free|do you have anyone available|do you have workers|can i get a worker|is there someone available|someone available near me|any worker|any specialist|specialist available|specialists available|workers near me|workers in [a-z]+|available|availability|free today|free now|on duty|can i get|find a|is there an available|who is available as|ಲಭ್ಯವಿದ್ದಾರೆ|ಯಾರು ಲಭ್ಯವಿದ್ದಾರೆ)\b/i.test(lowerCleaned) ||
                (/\b(available|availability|free|duty|specialist|specialists|worker|workers|get|find)\b/i.test(lowerCleaned) && /\b(today|now|near|city|check|get|have|any|anyone|someone|who|is|are|in|for)\b/i.test(lowerCleaned));

            // Case A: Specific Trade Specified (e.g. "Is there an available electrician now in Kanakapura?", "Can I get a plumber?")
            if (explicitTrade) {
                detectedIntent = 'find_worker';
                extractedEntities = {
                    intent: 'find_worker',
                    service: explicitTrade,
                    location: session.city,
                    date: date || 'Today',
                    time: time || 'Immediate'
                };
                session.context.currentService = explicitTrade;
                if (date) session.context.currentDate = date;
                if (time) session.context.currentTime = time;

                // Query REAL SQLite database for this trade in the queried city
                toolExecuted = 'findWorkers';
                toolResult = AI_TOOLS.findWorkers({ service: explicitTrade, city: session.city });
                session.context.lastFoundWorkers = toolResult.workers;
                actionsPerformed.push(`Queried SQLite database for ${explicitTrade} in ${session.city} (${toolResult.count} found)`);

                if (toolResult.count > 0) {
                    const topWorker = toolResult.workers[0];
                    session.context.lastSelectedWorker = topWorker;
                    session.context.pendingIntent = 'CONFIRM_CONNECT_WORKER';

                    if (toolResult.count === 1) {
                        spokenResponse = `Yes, I found 1 registered ${explicitTrade} specialist available in ${session.city}: ${topWorker.name} (Visiting charge: ${topWorker.startingPrice}). Would you like me to book them?`;
                    } else {
                        spokenResponse = `Yes, I found ${toolResult.count} registered ${explicitTrade} specialists available in ${session.city}. The closest is ${topWorker.name} (${topWorker.startingPrice}). Shall I connect you with ${topWorker.name}?`;
                    }
                } else {
                    // ZERO WORKERS IN DATABASE FOR THIS TRADE/CITY -> HONEST REPORTING & OFFER TO POST OPEN JOB
                    session.context.pendingJobData = {
                        customerPhone: session.callerPhone,
                        customerName: session.callerName,
                        service: explicitTrade,
                        problemDescription: text,
                        location: `${session.city} Town`,
                        city: session.city,
                        requestedDate: date || 'Today',
                        requestedTime: time || 'Immediate',
                        budget: '₹300'
                    };
                    session.context.pendingIntent = 'CONFIRM_POST_JOB';
                    spokenResponse = `I couldn't find any registered ${explicitTrade} specialists available in ${session.city} ${date ? date.toLowerCase() : 'today'}. Would you like me to post an open job request so nearby workers can respond?`;
                    actionsPerformed.push(`Identified 0 matching workers in database; offered job post`);
                }
            }
            // Case B: General Worker Availability Query (e.g. "available today", "who is free in Ramanagara?")
            else if (isWorkerAvailabilityQuery) {
                session.context.currentService = null;
                toolExecuted = 'findWorkers';
                toolResult = AI_TOOLS.findWorkers({ service: 'all', city: session.city });
                actionsPerformed.push(`Queried all available workers in ${session.city} (${toolResult.count} found)`);

                if (toolResult.count > 0) {
                    const unique = [...new Map(toolResult.workers.map(w => [`${w.name}_${w.trade}`, w])).values()];
                    const workerNames = unique.slice(0, 3).map(w => `${w.name} (${w.trade})`).join(', ');
                    spokenResponse = `Yes, I found ${toolResult.count} worker(s) currently available in ${session.city}: ${workerNames}. Which service or specialist do you need?`;
                } else {
                    spokenResponse = `I couldn't find any registered workers available in ${session.city} today. What trade or service do you need help with, so I can post an open job request?`;
                }
            }
            // Case C: Conversational Adaptive Fallback (No identical static loops)
            else {
                if (!session.context.fallbackStep) session.context.fallbackStep = 0;
                session.context.fallbackStep++;

                if (session.context.fallbackStep === 1) {
                    spokenResponse = `I can help you check worker availability, book a specialist, or post a job in ${session.city}. What service or repair are you looking for?`;
                } else if (session.context.fallbackStep === 2) {
                    spokenResponse = `We have verified specialists for Electrical, Plumbing, Carpentry, and Appliance Repair in ${session.city}. Which of these services do you need today?`;
                } else {
                    spokenResponse = `Please describe what problem you need fixed, like a fan repair, leaking tap, or washing machine issue, and I will connect you with a verified specialist.`;
                }
                actionsPerformed.push(`Conversational guidance (step ${session.context.fallbackStep})`);
            }
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

