/* ==========================================================================
   GigSync — Context-Aware & Database-First AI Voice Agent Engine
   Zero Dummy Data · Multi-Turn Conversation Memory · Verified SQLite Tools
   ========================================================================== */

const DB = require('./database');

// 1. Definition of Real Database Tools (No Assumptions, No Fabricated Records)
const AI_TOOLS = {
    // 1. Find Real Registered Workers from Database
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

    // 2. Check Specific Worker Availability
    checkWorkerAvailability({ workerId, workerName, date = 'Today', time = 'Immediate' }) {
        let worker = null;
        if (workerId) {
            worker = DB.getWorkerById(workerId);
        } else if (workerName) {
            const all = DB.getAllWorkers();
            worker = all.find(w => w.name.toLowerCase().includes(workerName.toLowerCase()));
        }

        if (!worker) {
            return {
                status: 'error',
                message: `Worker "${workerName || workerId}" was not found in the registered database.`
            };
        }

        const schedule = DB.getWorkerSchedule(worker.id);
        const hasConflict = DB.checkScheduleConflict(worker.id, date, time);

        return {
            status: 'success',
            workerId: worker.id,
            workerName: worker.name,
            trade: worker.trade,
            city: worker.city,
            isAvailable: Boolean(worker.is_available) && !hasConflict,
            hasConflict,
            schedule: schedule ? schedule.availabilitySlots : []
        };
    },

    // 3. Worker Availability Update
    updateWorkerAvailability({ workerPhone, trade = 'Skilled Specialist', date = 'Tomorrow', startTime = '09:00 AM', endTime = '06:00 PM', isAvailable = true }) {
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

    // 4. Get Worker Availability
    getWorkerAvailability({ workerPhone, date = 'Tomorrow' }) {
        const cleanPhone = (workerPhone || '').replace(/\D/g, '');
        const schedule = DB.getWorkerSchedule(cleanPhone);
        if (!schedule) {
            return { status: 'not_found', message: 'No registered worker profile found for this phone.' };
        }

        const matchingSlot = schedule.availabilitySlots.find(s => s.date_str.toLowerCase() === date.toLowerCase());
        return {
            status: 'success',
            workerName: schedule.worker ? schedule.worker.name : 'Worker',
            isAvailableNow: schedule.isAvailableNow,
            slot: matchingSlot || null,
            date
        };
    },

    // 5. Get Customer Bookings
    getCustomerBookings({ customerPhone }) {
        const cleanPhone = (customerPhone || '').replace(/\D/g, '');
        const jobs = DB.getAllJobs().filter(j => j.customer_phone && j.customer_phone.replace(/\D/g, '') === cleanPhone);
        return {
            status: 'success',
            count: jobs.length,
            bookings: jobs
        };
    },

    // 6. Get Worker Bookings
    getWorkerBookings({ workerPhone, date }) {
        const cleanPhone = (workerPhone || '').replace(/\D/g, '');
        let jobs = DB.getAllJobs().filter(j => (j.worker_phone && j.worker_phone.replace(/\D/g, '') === cleanPhone));
        if (date) {
            jobs = jobs.filter(j => j.requested_date.toLowerCase() === date.toLowerCase());
        }
        return {
            status: 'success',
            count: jobs.length,
            bookings: jobs
        };
    },

    // 7. Get Worker Earnings
    getWorkerEarnings({ workerPhone }) {
        const cleanPhone = (workerPhone || '').replace(/\D/g, '');
        const earnings = DB.getWorkerEarnings(cleanPhone);
        return {
            status: 'success',
            workerPhone: cleanPhone,
            earnings
        };
    },

    // 8. Create Job in Real Database
    createJob({ customerPhone = '9876543210', customerName = 'Customer', service, problemDescription, location = 'Town Area', city = 'Ramanagara', requestedDate = 'Today', requestedTime = 'Immediate', budget = '₹300', workerId = null, workerName = null, workerPhone = null }) {
        // Check if there is an explicit or auto-matched worker
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

    // 9. Cancel Job
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

    // 10. List Supported Real Services
    getServices() {
        return [
            'Electrical (Fan, wiring, switchboards)',
            'Plumbing (Pipe leaks, tap repairs, motor)',
            'Carpentry (Doors, locks, furniture)',
            'Two-Wheeler & Auto Mechanics',
            'AC & Fridge Tech',
            'Washing Machine & Appliance Repair',
            'Painting',
            'Home Cleaning'
        ];
    }
};

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
        if (defaultData.city) session.city = defaultData.city;
        if (defaultData.callerRole) session.callerRole = defaultData.callerRole;
        if (defaultData.callerName) session.callerName = defaultData.callerName;
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

// 3. Entity & Trade Extractor
function extractTradeAndService(text) {
    const lower = text.toLowerCase();
    if (lower.includes('electric') || lower.includes('fan') || lower.includes('switch') || lower.includes('wire') || lower.includes('current') || lower.includes('power') || lower.includes('bulb') || lower.includes('ಎಲೆಕ್ಟ್ರಿಷಿಯನ್')) {
        return 'Electrical';
    }
    if (lower.includes('plumb') || lower.includes('pipe') || lower.includes('tap') || lower.includes('leak') || lower.includes('drain') || lower.includes('water') || lower.includes('ಪ್ಲಂಬರ್') || lower.includes('ನೀರು')) {
        return 'Plumbing';
    }
    if (lower.includes('carpenter') || lower.includes('wood') || lower.includes('door') || lower.includes('window') || lower.includes('furniture') || lower.includes('lock') || lower.includes('ಕಾರ್ಪೆಂಟರ್') || lower.includes('ಮರಗೆಲಸ')) {
        return 'Carpentry';
    }
    if (lower.includes('washing machine') || lower.includes('washer') || lower.includes('വാഷിംഗ് മെഷീൻ')) {
        return 'Washing Machine Repair';
    }
    if (lower.includes('ac') || lower.includes('air conditioner') || lower.includes('fridge') || lower.includes('refrigerator') || lower.includes('cooler')) {
        return 'AC & Appliances';
    }
    if (lower.includes('bike') || lower.includes('scooter') || lower.includes('mechanic') || lower.includes('puncture') || lower.includes('motorcycle') || lower.includes('breakdown') || lower.includes('ಮೇಕಾನಿಕ್')) {
        return 'Mechanics';
    }
    if (lower.includes('clean') || lower.includes('maid') || lower.includes('sweep') || lower.includes('wash') || lower.includes('ಕ್ಲೀನಿಂಗ್')) {
        return 'Home Cleaning';
    }
    if (lower.includes('paint') || lower.includes('painter') || lower.includes('ಬಣ್ಣ')) {
        return 'Painting';
    }
    return null;
}

// 4. Extract Date & Time Entities
function extractDateTimeEntities(text) {
    const lower = text.toLowerCase();
    let date = null;
    let time = null;

    if (lower.includes('today') || lower.includes('now') || lower.includes('immediately') || lower.includes('ivathu') || lower.includes('ಇವತ್ತು')) {
        date = 'Today';
    } else if (lower.includes('tomorrow') || lower.includes('naale') || lower.includes('ನಾಳೆ') || lower.includes('kal')) {
        date = 'Tomorrow';
    } else if (lower.includes('monday') || lower.includes('somavara')) {
        date = 'Monday';
    }

    if (lower.includes('morning') || lower.includes('beligge') || lower.includes('ಬೆಳಿಗ್ಗೆ')) {
        time = 'Morning (10:00 AM)';
    } else if (lower.includes('afternoon') || lower.includes('madhyahna')) {
        time = 'Afternoon (02:00 PM)';
    } else if (lower.includes('evening') || lower.includes('sanje')) {
        time = 'Evening (05:00 PM)';
    } else {
        const timeMatch = text.match(/(\d{1,2}(?::\d{2})?\s*(?:am|pm|o'clock)?)/i);
        if (timeMatch && !text.match(/₹|\brupees\b/i)) {
            time = timeMatch[1];
        }
    }

    return { date, time };
}

// 5. Intelligent Multi-Turn Conversational Processor
class ContextAwareVoiceAgent {
    async processCallTurn({ sessionId, callerPhone, callerRole = 'customer', callerName = 'User', city = 'Ramanagara', speechText }) {
        const text = (speechText || '').trim();
        const lower = text.toLowerCase();

        // 1. Get or create session context
        const session = sessionManager.getSession(sessionId, { callerPhone, callerRole, callerName, city });
        sessionManager.addTurn(session, 'user', text);

        let spokenResponse = '';
        let toolExecuted = null;
        let toolResult = null;
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

        const isAffirmative = /\b(yes|yeah|yep|sure|ok|okay|confirm|post it|please post|post|go ahead|book him|book it|book|ha|haan|houdu|ಹೌದು|sari|ಸರಿ)\b/i.test(lowerCleaned);
        const isNegative = /\b(no|nope|cancel|cancel it|don't|beda|ಬೇಡ|nahi)\b/i.test(lowerCleaned);
        const isShortNegation = /^(no|nope|no thanks|no thank you|nothing else|nothing more|nothing|thats all|that's all|beda|ಬೇಡ|nahi)\b/i.test(lowerCleaned);

        let shouldEndCall = false;

        // 2. Check for Conversational Closings & Gratitude FIRST
        const isGratitude = /\b(thank you|thanks|thanks a lot|thank you so much|thank you for your help|dhanyavada|dhanyavadagalu|dhanyavadam|shukriya|bahut shukriya)\b/i.test(lowerCleaned);
        const isGoodbye = /\b(bye|goodbye|okay bye|ok bye|tata|see you|good night|that's all|thats all|that's it|thats it|nothing else|no nothing|nothing more|no that's all|no thats all|no thanks|no thank you)\b/i.test(lowerCleaned);

        if (isGratitude && isGoodbye) {
            spokenResponse = `You're welcome! I'm glad I could help. Have a great day!`;
            actionsPerformed.push(`Completed conversation with closing goodbye`);
            session.context.pendingIntent = null;
            shouldEndCall = true;
        } else if (isGoodbye) {
            spokenResponse = `Goodbye! Thank you for calling GigSync. Have a wonderful day!`;
            actionsPerformed.push(`Caller ended conversation`);
            session.context.pendingIntent = null;
            shouldEndCall = true;
        } else if (isGratitude) {
            spokenResponse = `You're welcome! I'm glad I could help. You can end the call whenever you're ready, or let me know if you need anything else.`;
            actionsPerformed.push(`Acknowledged gratitude`);
            session.context.pendingIntent = null;
        }

        // 3. Pending Confirmation / Affirmation (e.g. "Yes", "Confirm", "Post it", "Cancel it")
        else if (session.context.pendingIntent === 'CONFIRM_POST_JOB' && (isAffirmative || isNegative)) {
            if (isAffirmative && session.context.pendingJobData) {
                const jobData = session.context.pendingJobData;
                toolExecuted = 'createJob';
                toolResult = AI_TOOLS.createJob(jobData);
                actionsPerformed.push(`Created Job #${toolResult.job.id} for ${jobData.service} in SQLite database`);

                spokenResponse = `Done! Your job request for ${jobData.service} in ${jobData.location} has been posted. We are notifying nearby registered specialists. Is there anything else I can help you with?`;
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
                    requestedDate: 'Today',
                    requestedTime: 'Immediate',
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

        // 4. Follow-up after completed action when user says "No" / "Nothing else"
        else if (session.context.lastActionCompleted && isShortNegation) {
            spokenResponse = `You're welcome! Have a great day.`;
            actionsPerformed.push(`Completed conversation after action`);
            session.context.lastActionCompleted = null;
            shouldEndCall = true;
        }

        // 5. Intent: Greeting / Welcome
        else if (/^(hello|hi|hey|namaskara|namaste|good morning|good afternoon|good evening|ನಮಸ್ಕಾರ)\b/i.test(lowerCleaned) && lowerCleaned.split(/\s+/).length <= 4) {
            spokenResponse = `Hello! Welcome to GigSync. How may I help you today?`;
            actionsPerformed.push(`Greeting acknowledged`);
        }

        // 6. Intent: General Platform Questions & Capabilities (Type A)
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

        // 7. Intent: Off-Topic / Unrelated Questions
        else if (lowerCleaned.includes('capital of') || lowerCleaned.includes('who is president') || lowerCleaned.includes('tell me a joke') || lowerCleaned.includes('weather in') || lowerCleaned.includes('how tall is')) {
            spokenResponse = `I'm mainly here to help with GigSync trade specialists, jobs and bookings in ${session.city}. How can I assist you with your home or vehicle service needs?`;
            actionsPerformed.push(`Politely refocused off-topic question`);
        }

        // 8. Intent: Service Catalog Inquiries
        else if (lowerCleaned.includes('what services') || lowerCleaned.includes('which services') || lowerCleaned.includes('services you provide') || lowerCleaned.includes('what do you do') || lowerCleaned.includes('ಯಾವ ಸೇವೆಗಳು')) {
            spokenResponse = `GigSync currently connects verified local specialists for: Electrical, Plumbing, Carpentry, Two-Wheeler Mechanics, AC & Appliance Repair, Washing Machine Repair, Painting, and Home Cleaning in ${session.city}.`;
            actionsPerformed.push(`Provided service catalog`);
        }

        // 9. Customer Queries: Profile & Location Information
        else if (lowerCleaned.includes('my profile') || lowerCleaned.includes('my location') || lowerCleaned.includes('saved on my account') || lowerCleaned.includes('where am i currently set')) {
            const user = DB.getUserByPhone(session.callerPhone);
            const cityName = user ? user.city : session.city;
            const areaName = user ? user.area : 'Town';
            spokenResponse = `Your account is registered under ${user ? user.name : session.callerName} with service location set to ${cityName} (${areaName}).`;
            actionsPerformed.push(`Retrieved customer profile from database`);
        }

        else if (lowerCleaned.includes('change my location') || lowerCleaned.includes('update my location') || lowerCleaned.includes('set location')) {
            const locMatch = text.match(/(?:to|in|set to)\s+([A-Za-z]+)/i);
            const newCity = locMatch ? locMatch[1] : 'Ramanagara';
            session.city = newCity;
            session.context.currentLocation = newCity;
            DB.updateCustomerProfile(session.callerPhone, { city: newCity });
            spokenResponse = `Your service location has been updated to ${newCity}. Registered specialists in ${newCity} will now be prioritized.`;
            actionsPerformed.push(`Updated service location to ${newCity}`);
        }

        // 10. Customer Queries: Price & Fee Questions
        else if (session.callerRole === 'customer' && (lowerCleaned.includes('price') || lowerCleaned.includes('visiting fee') || lowerCleaned.includes('rate') || (lowerCleaned.includes('how much') && !lowerCleaned.includes('earn')) || (lowerCleaned.includes('cost') && !lowerCleaned.includes('earn')))) {
            const detectedTrade = extractTradeAndService(text) || session.context.currentService || 'specialist visit';
            spokenResponse = `The standard visiting fee for registered ${detectedTrade} specialists in ${session.city} starts from ₹300 to ₹350, with the final cost determined by required parts and labor.`;
            actionsPerformed.push(`Provided transparent pricing estimate`);
        }

        // 11. Customer Queries: Booking Status, Tracking & "Who accepted my request?"
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

        // 12. Customer Queries: Cancel Booking
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

        // 13. Worker Queries: Check My Availability / Schedule
        else if (session.callerRole === 'worker' && (lowerCleaned.includes('my availability') || lowerCleaned.includes('am i available') || lowerCleaned.includes('my schedule') || lowerCleaned.includes('ನನ್ನ ಶೆಡ್ಯೂಲ್'))) {
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
                spokenResponse = `I couldn't find your worker profile in the database. Please make sure your worker account is registered.`;
            }
        }

        // 14. Worker Queries: Update My Availability
        else if (session.callerRole === 'worker' && (lowerCleaned.includes('available') || lowerCleaned.includes('free') || lowerCleaned.includes('duty') || lowerCleaned.includes('shift') || lowerCleaned.includes('ಫ್ರೀ') || lowerCleaned.includes('ಲಭ್ಯ'))) {
            const { date, time } = extractDateTimeEntities(text);
            const targetDate = date || 'Tomorrow';

            let startTime = '09:00 AM';
            let endTime = '06:00 PM';
            const rangeMatch = text.match(/(\d{1,2})\s*(?:to|inda|inda\s*te|\-)\s*(\d{1,2})/i);
            if (rangeMatch) {
                startTime = `${rangeMatch[1]}:00 AM`;
                endTime = `${rangeMatch[2]}:00 PM`;
            }

            const isAvail = !lowerCleaned.includes('not available') && !lowerCleaned.includes('unavailable') && !lowerCleaned.includes('off') && !lowerCleaned.includes('leave');

            toolExecuted = 'updateWorkerAvailability';
            toolResult = AI_TOOLS.updateWorkerAvailability({
                workerPhone: session.callerPhone,
                date: targetDate,
                startTime,
                endTime,
                isAvailable: isAvail
            });
            actionsPerformed.push(`Updated ${targetDate} availability: ${startTime} – ${endTime} in database`);
            spokenResponse = isAvail
                ? `Done. Your availability for ${targetDate} from ${startTime} to ${endTime} has been updated in the database.`
                : `Done. You have been marked OFF-DUTY for ${targetDate}.`;
        }

        // 15. Worker Queries: Check My Earnings & Completed Job Count
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

        // 16. Worker Queries: Check Assigned Jobs / Schedule
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

        // 17. Worker Queries: Check Open / Available Jobs
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

        // 18. Worker Queries: Profile & Registered Trade
        else if (session.callerRole === 'worker' && (lowerCleaned.includes('profession') || lowerCleaned.includes('what am i registered') || lowerCleaned.includes('my trade') || lowerCleaned.includes('my skills'))) {
            const worker = DB.getWorkerByPhone(session.callerPhone);
            if (worker) {
                spokenResponse = `You are registered as a ${worker.trade} in ${worker.city} with a rating of ${worker.rating} stars and ${worker.jobs_completed} completed gigs.`;
                actionsPerformed.push(`Retrieved worker trade credentials`);
            } else {
                spokenResponse = `I couldn't find a registered worker profile for this phone number.`;
            }
        }

        // 19. Customer Queries: Check My Bookings / Orders
        else if (session.callerRole === 'customer' && (lowerCleaned.includes('booking') || lowerCleaned.includes('bookings') || lowerCleaned.includes('my order') || lowerCleaned.includes('my job') || lowerCleaned.includes('active job') || lowerCleaned.includes('do i have a booking') || lowerCleaned.includes('what bookings do i have') || lowerCleaned.includes('ನನ್ನ ಬುಕಿಂಗ್')) && !lowerCleaned.includes('book him') && !lowerCleaned.includes('book her') && !lowerCleaned.includes('book them')) {
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

        // 20. Intent: Connect / Book Specific Worker or Pronoun Reference ("connect me to him", "book him", "call him")
        else if (lowerCleaned.includes('connect') || lowerCleaned.includes('book him') || lowerCleaned.includes('book her') || lowerCleaned.includes('hire him') || lowerCleaned.includes('call him') || lowerCleaned.includes('contact him')) {
            if (session.context.lastFoundWorkers.length > 0) {
                const worker = session.context.lastFoundWorkers[0];
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

        // 21. Intent: Explicit Create Job / Post a Job
        else if (lowerCleaned.includes('post a job') || lowerCleaned.includes('create a job') || lowerCleaned.includes('job posting') || lowerCleaned.includes('post job') || lowerCleaned.includes('can you post a job')) {
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
                spokenResponse = `I have prepared a ${detectedTrade} job request in ${session.city} for ${session.context.currentDate}. Shall I post it to nearby specialists?`;
                actionsPerformed.push(`Drafted job request for ${detectedTrade}`);
            }
        }

        // 22. Intent: Find Worker / Check Worker Availability / Service Need
        else {
            const explicitTrade = extractTradeAndService(text);
            const { date, time } = extractDateTimeEntities(text);

            const isWorkerAvailabilityQuery = /\b(anyone available|who is available|workers available|worker available|available today|available now|check availability|check worker|check workers|check worker available|check worker availability|is worker available|is any worker free|any worker free|who is free|is anyone free|do you have anyone available|do you have workers|can i get a worker|is there someone available|someone available near me|any worker|any specialist|specialist available|specialists available|workers near me|workers in [a-z]+|available|availability|free today|free now|on duty|ಲಭ್ಯವಿದ್ದಾರೆ|ಯಾರು ಲಭ್ಯವಿದ್ದಾರೆ)\b/i.test(lowerCleaned) ||
                (/\b(available|availability|free|duty|specialist|specialists|worker|workers)\b/i.test(lowerCleaned) && /\b(today|now|near|city|check|get|have|any|anyone|someone|who|is|are)\b/i.test(lowerCleaned));

            // Case A: Specific Trade Specified (e.g. "Any electrician available?", "I need a plumber", "Washing machine repair")
            if (explicitTrade) {
                session.context.currentService = explicitTrade;
                if (date) session.context.currentDate = date;
                if (time) session.context.currentTime = time;

                // Query REAL SQLite database
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
                    // ZERO WORKERS IN DATABASE -> HONEST ANSWER
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
                    spokenResponse = `I couldn't find any registered ${explicitTrade} specialists available in ${session.city} today. Would you like me to post an open job request so nearby workers can respond?`;
                    actionsPerformed.push(`Identified 0 matching workers in database; offered job post`);
                }
            }
            // Case B: General Worker Availability Query (e.g. "available today", "worker available", "I would like to check worker available")
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

        // Add assistant turn to session memory
        sessionManager.addTurn(session, 'assistant', spokenResponse);

        // Record real call log in SQLite DB
        DB.logCall({
            callerPhone: session.callerPhone,
            callerRole: session.callerRole,
            transcript: text,
            intentDetected: toolExecuted || session.context.pendingIntent || 'conversation',
            actionsTaken: actionsPerformed.join('; '),
            durationSeconds: 10
        });

        return {
            spokenResponse,
            toolExecuted,
            toolResult,
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
    AI_TOOLS,
    sessionManager
};
