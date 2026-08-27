/* ==========================================================================
   GigSync — AI caller identity resolution

   Shared by the local server (backend/server.js) and the Vercel serverless
   handler (api/index.js). It lives in one file on purpose: both surfaces hand
   the resolved phone number straight to the AI's worker tools, so if the two
   ever disagreed about who the caller is, one of them would be reading and
   writing the wrong person's real record.
   ========================================================================== */

const DB = require('./database');

/* --------------------------------------------------------------------------
   Rules:

   - A verified session always wins over anything in the request body.
   - Exception: the 3.5mm voice terminal. An admin operator connects a handset on
     behalf of a worker who is physically on the line, so an ADMIN session may
     name the caller. The caller's name and role are then looked up in the
     database — the request body never supplies them.
   - With no verified session a caller is treated as an anonymous customer, and only if
     the number they gave is not a registered account. The old code fell back to a
     hardcoded '9876543210', which silently attached voice registrations and
     availability changes to a phantom account.

   Returns either an identity object or { error, statusCode }.
   -------------------------------------------------------------------------- */
function resolveAiCaller(session, body = {}) {
    const claimedPhone = (body.callerPhone || '').replace(/\D/g, '');

    // Look up whoever the phone number really belongs to.
    const describe = (phone, fallbackRole, fallbackName, fallbackCity) => {
        const worker = DB.getWorkerByPhone(phone);
        const user = DB.getUserByPhone ? DB.getUserByPhone(phone) : null;
        return {
            callerPhone: phone,
            callerRole: worker ? 'worker' : (user ? user.role : fallbackRole),
            callerName: worker ? worker.name : (user ? user.name : fallbackName),
            city: body.city || (worker && worker.city) || (user && user.city) || fallbackCity || 'Ramanagara',
            registeredWorker: Boolean(worker)
        };
    };

    // Voice Terminal / Telephony / Live Voice Mic calls are always isolated from admin web sessions
    if (body.isVoiceCall || body.portal === 'terminal') {
        if (claimedPhone.length === 10) {
            return {
                ...describe(claimedPhone, body.callerRole || 'worker', body.callerName || 'Caller', body.city || 'Ramanagara'),
                source: 'voice_call'
            };
        }
        return {
            callerPhone: null,
            callerRole: body.callerRole || 'worker',
            callerName: body.callerName || 'Caller',
            city: body.city || 'Ramanagara',
            registeredWorker: false,
            source: 'anonymous_voice_call'
        };
    }

    if (session) {
        const sessionPhone = (session.phone || '').replace(/\D/g, '');

        // Voice terminal: an admin operator hosting the 3.5mm hardware pipeline.
        // If a specific worker's 10-digit number was pre-entered/dialed, resolve them.
        // Otherwise, the person speaking on the 3.5mm line is an incoming caller!
        if (session.role === 'admin') {
            if (claimedPhone && claimedPhone !== sessionPhone && claimedPhone.length === 10) {
                return { ...describe(claimedPhone, body.callerRole || 'worker', body.callerName || 'Caller', session.city), source: 'terminal_operator' };
            }
            return {
                callerPhone: null,
                callerRole: body.callerRole || 'worker',
                callerName: 'Caller',
                city: session.city || body.city || 'Ramanagara',
                registeredWorker: false,
                source: 'terminal_incoming_call'
            };
        }

        // Verified worker or customer logged in: they are themselves.
        return { ...describe(sessionPhone, session.role || 'customer', session.name || 'User', session.city), source: 'verified_session' };
    }

    // No verified session (e.g. 3.5mm incoming telephony call, guest caller, or new worker)
    if (claimedPhone.length === 10) {
        return {
            ...describe(claimedPhone, body.callerRole || 'worker', body.callerName || 'Caller', body.city || 'Ramanagara'),
            source: 'telephony_or_web_caller'
        };
    }

    // Completely anonymous caller (caller has not yet provided or dialed a phone number)
    return {
        callerPhone: null,
        callerRole: body.callerRole || 'worker',
        callerName: body.callerName || 'Caller',
        city: body.city || 'Ramanagara',
        registeredWorker: false,
        source: 'anonymous_incoming_call'
    };
}

// Reads the bearer token off a request and returns the real session row, or null.
function getAuthSession(req) {
    const authHeader = (req.headers && req.headers['authorization']) || '';
    if (authHeader.startsWith('Bearer ')) {
        const token = authHeader.slice(7).trim();
        return DB.getSession(token);
    }
    return null;
}

module.exports = { resolveAiCaller, getAuthSession };
