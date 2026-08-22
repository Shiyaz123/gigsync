/* ==========================================================================
   GigSync — AI-Powered Hyperlocal Gig Marketplace for Tier-2 & Tier-3 Cities
   Main Application Logic & State Machine
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    const AUTH_USERS_KEY = 'gigsync_users';
    const AUTH_SESSION_KEY = 'gigsync_session';
    const DEMO_PASSWORD = 'gigsync123';

    /* ---------- Services / Trades Dataset ---------- */
    const SERVICES = [
        { id: 'electrical', name: 'Electrical', desc: 'House wiring, fans, inverters, switches', icon: 'fa-bolt', avgPrice: '₹300–₹500' },
        { id: 'plumbing', name: 'Plumbing', desc: 'Pipes, taps, motor pumps, leak repair', icon: 'fa-wrench', avgPrice: '₹250–₹450' },
        { id: 'carpentry', name: 'Carpentry', desc: 'Door locks, furniture, wooden fittings', icon: 'fa-hammer', avgPrice: '₹350–₹600' },
        { id: 'mechanics', name: 'Two-Wheeler & Auto', desc: 'Bike breakdown, engine tuning, tyre fix', icon: 'fa-motorcycle', avgPrice: '₹200–₹400' },
        { id: 'ac', name: 'AC & Appliances', desc: 'Refrigerators, washing machines, cooler repair', icon: 'fa-snowflake', avgPrice: '₹400–₹700' },
        { id: 'welding', name: 'Welding & Fabrication', desc: 'Gates, metal grills, emergency welding', icon: 'fa-fire-burner', avgPrice: '₹400–₹800' },
        { id: 'mason', name: 'Masonry & Construction', desc: 'Wall repair, plastering, tile touch-ups', icon: 'fa-trowel-bricks', avgPrice: '₹500–₹900' },
        { id: 'painting', name: 'Painting & Distemper', desc: 'Homes, shops, water-proofing coating', icon: 'fa-paint-roller', avgPrice: '₹450–₹800' },
        { id: 'tailoring', name: 'Tailoring & Alterations', desc: 'Stitching, suit fitting, alterations', icon: 'fa-scissors', avgPrice: '₹150–₹350' },
        { id: 'cleaning', name: 'Local Cleaning', desc: 'Water tanks, shops, post-work debris', icon: 'fa-broom', avgPrice: '₹300–₹600' }
    ];

    const AVATAR_COLORS = ['#2563EB', '#4F46E5', '#059669', '#D97706', '#0284C7', '#7C3AED', '#DC2626', '#0D9488'];

    /* ---------- Realistic Tier-2/3 Workers Dataset ---------- */
    let WORKERS = [
        {
            id: 1,
            name: 'Ramesh Kumar',
            trade: 'Master Electrician',
            service: 'electrical',
            rating: 4.8,
            km: 1.2,
            jobs: 126,
            years: 5,
            price: 300,
            avail: true,
            verified: true,
            tools: 'Digital Multimeter, Impact Drill, Wire Stripper Kit, Safety Gloves',
            initials: 'RK',
            city: 'Ramanagara',
            area: 'Vijaya Nagar',
            about: 'Ramesh has been serving households and retail shops across Ramanagara and Channapatna for 5 years. Expert in house wiring, inverter battery systems, ceiling fans, and fuse boards.'
        },
        {
            id: 2,
            name: 'Suresh Gowda',
            trade: 'Plumbing & Motor Specialist',
            service: 'plumbing',
            rating: 4.7,
            km: 1.8,
            jobs: 98,
            years: 7,
            price: 280,
            avail: true,
            verified: true,
            tools: 'Heavy Pipe Wrench, Thread Sealer, Pipe Cutter, Motor Pressure Tester',
            initials: 'SG',
            city: 'Ramanagara',
            area: 'Town Market Ward',
            about: 'Specialist in bathroom fixtures, overhead water tank piping, and submersible pump repairs across Ramanagara.'
        },
        {
            id: 3,
            name: 'Anil Prasad',
            trade: 'General Carpenter',
            service: 'carpentry',
            rating: 4.6,
            km: 3.1,
            jobs: 74,
            years: 4,
            price: 350,
            avail: false,
            verified: true,
            tools: 'Circular Saw, Wood Chisels, Router, Hand Plane, Drill Kit',
            initials: 'AP',
            city: 'Ramanagara',
            area: 'Channapatna Link',
            about: 'Custom door fittings, lock replacements, window framing, and modular kitchen repair for homes and village houses.'
        },
        {
            id: 4,
            name: 'Manoj N.',
            trade: 'AC & Refrigerator Tech',
            service: 'ac',
            rating: 4.9,
            km: 2.4,
            jobs: 151,
            years: 8,
            price: 450,
            avail: true,
            verified: true,
            tools: 'Gas Pressure Gauge, Vacuum Pump, Flaring Tool, Refrigerant Canister',
            initials: 'MN',
            city: 'Ramanagara',
            area: 'Station Road',
            about: 'Certified technician for home refrigerators, washing machines, and split/window AC installation and gas charging.'
        },
        {
            id: 5,
            name: 'Imran Khan',
            trade: 'Two-Wheeler & Auto Mechanic',
            service: 'mechanics',
            rating: 4.8,
            km: 1.5,
            jobs: 112,
            years: 6,
            price: 250,
            avail: true,
            verified: true,
            tools: 'Spanner Toolkit, Spark Plug Tester, Tyre Lever, Battery Jump Kit',
            initials: 'IK',
            city: 'Ramanagara',
            area: 'MG Road',
            about: 'On-site motorcycle, scooter, and auto-rickshaw emergency repair. Fast doorstep breakdown assistance.'
        },
        {
            id: 6,
            name: 'Manjunath K.',
            trade: 'Welder & Fabricator',
            service: 'welding',
            rating: 4.7,
            km: 3.8,
            jobs: 67,
            years: 9,
            price: 400,
            avail: true,
            verified: true,
            tools: 'Portable Arc Welding Machine, Angle Grinder, Safety Mask, Clamp Set',
            initials: 'MK',
            city: 'Ramanagara',
            area: 'Bidadi Gate',
            about: 'Expert in MS gate repairs, window safety grills, agricultural equipment welding, and roofing frame fabrication.'
        },
        {
            id: 7,
            name: 'Lakshmi R.',
            trade: 'Master Tailor',
            service: 'tailoring',
            rating: 4.9,
            km: 0.9,
            jobs: 210,
            years: 10,
            price: 150,
            avail: true,
            verified: true,
            tools: 'Industrial Sewing Machine, Overlock Machine, Fabric Scissors, Measuring Kit',
            initials: 'LR',
            city: 'Ramanagara',
            area: 'Gandhi Nagar',
            about: 'Doorstep blouse stitching, dress alterations, curtain hemming, and uniform fittings.'
        },
        {
            id: 8,
            name: 'Basavaraj T.',
            trade: 'Mason & Tile Worker',
            service: 'mason',
            rating: 4.5,
            km: 4.2,
            jobs: 54,
            years: 12,
            price: 500,
            avail: false,
            verified: true,
            tools: 'Trowel, Tile Cutter, Spirit Level, Plumb Bob, Concrete Float',
            initials: 'BT',
            city: 'Ramanagara',
            area: 'Kootagal Village Link',
            about: 'Floor tile replacements, compound wall touchups, bathroom water-proofing, and masonry construction.'
        },
        {
            id: 9,
            name: 'Harish M.',
            trade: 'Painter & Distemper Tech',
            service: 'painting',
            rating: 4.4,
            km: 5.5,
            jobs: 41,
            years: 3,
            price: 450,
            avail: true,
            verified: true,
            tools: 'Paint Sprayer, Rollers, Scrapers, Sanding Machine, Step Ladder',
            initials: 'HM',
            city: 'Ramanagara',
            area: 'Channapatna Town',
            about: 'Interior wall painting, shop exterior coatings, and damp-proof distemper application.'
        }
    ];

    /* ---------- Customer & Worker Bookings Dataset ---------- */
    const JOBS = {
        active: [
            { id: 'GS-1082', service: 'Electrical Repair · Ceiling Fan', worker: 'Ramesh Kumar', loc: 'Vijaya Nagar, Ramanagara', date: 'Tomorrow', time: '10:00 AM', status: 'Confirmed', price: '₹350' }
        ],
        upcoming: [
            { id: 'GS-1079', service: 'Inverter Battery Check', worker: 'Ramesh Kumar', loc: 'Vijaya Nagar', date: '24 Aug', time: '11:00 AM', status: 'Accepted', price: '₹400' }
        ],
        completed: [
            { id: 'GS-1055', service: 'Kitchen Tap Leak & Valve Fix', worker: 'Suresh Gowda', loc: 'Town Market', date: '18 Aug', time: '4:15 PM', status: 'Completed', price: '₹320' }
        ],
        cancelled: [
            { id: 'GS-1021', service: 'Furniture Polish', worker: 'Anil Prasad', loc: 'Channapatna', date: '12 Aug', time: '2:00 PM', status: 'Cancelled', price: '₹0' }
        ]
    };

    let WJOBS = {
        new: [
            { id: 1, customer: 'Kavya Rao', service: 'Electrical Repair · Ceiling Fan buzzing & not spinning', loc: 'Vijaya Nagar, Ramanagara', date: 'Today', time: '4:00 PM', pay: '₹350–₹500', km: '1.1 km', status: 'Requested' },
            { id: 2, customer: 'Pradeep Gowda', service: 'Inverter Setup & Battery Distribution Line', loc: 'Station Road, Ramanagara', date: 'Tomorrow', time: '10:00 AM', pay: '₹600–₹850', km: '2.4 km', status: 'Requested' }
        ],
        accepted: [
            { id: 3, customer: 'Ananya S.', service: 'Main Distribution Fuse Box Replacement', loc: 'Bidadi Link', date: 'Tomorrow', time: '11:30 AM', pay: '₹450', km: '1.8 km', status: 'Accepted' }
        ],
        ongoing: [
            { id: 4, customer: 'Shree Krishna Store', service: 'Emergency Shop Lighting Circuit Repair', loc: 'Town Market', date: 'Today', time: 'Right Now', pay: '₹650', km: '0.8 km', status: 'In Progress' }
        ],
        done: [
            { id: 5, customer: 'Prakash M.', service: 'Exhaust Fan & Switch Fitting', loc: 'Vijaya Nagar', date: '20 Aug', time: '5:30 PM', pay: '₹400', km: '1.2 km', status: 'Completed' }
        ]
    };

    /* ---------- Application State ---------- */
    const state = {
        view: 'home',
        mode: 'customer', // 'customer' | 'worker' | 'admin'
        selectedRole: 'customer', // 'customer' | 'worker' | 'admin'
        city: 'Ramanagara, Karnataka',
        lang: 'en',
        sort: 'rec',
        serviceFilter: 'electrical',
        selectedWorker: 1,
        jobTab: 'active',
        wJobTab: 'new',
        workerAvailable: true,
        voiceListening: false
    };

    /* ---------- Auth Subsystem ---------- */
    function normalizeIdentifier(raw) {
        const value = (raw || '').trim().toLowerCase();
        const digits = value.replace(/\D/g, '');
        if (value.includes('@')) return { type: 'email', key: value };
        if (digits.length >= 10) return { type: 'phone', key: digits.slice(-10) };
        return { type: 'unknown', key: value };
    }

    async function hashPassword(password) {
        const data = new TextEncoder().encode(password);
        const buf = await crypto.subtle.digest('SHA-256', data);
        return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    }

    function loadUsers() {
        try { return JSON.parse(localStorage.getItem(AUTH_USERS_KEY) || '[]'); } catch { return []; }
    }
    function saveUsers(users) { localStorage.setItem(AUTH_USERS_KEY, JSON.stringify(users)); }

    function getSession() {
        try { return JSON.parse(localStorage.getItem(AUTH_SESSION_KEY) || 'null'); } catch { return null; }
    }
    function setSession(user) {
        localStorage.setItem(AUTH_SESSION_KEY, JSON.stringify({
            email: user.email || '',
            phone: user.phone || '9876543210',
            role: user.role || state.selectedRole || 'customer',
            loggedInAt: Date.now()
        }));
    }

    function unlockApp() {
        document.body.classList.remove('auth-locked');
        document.getElementById('loginScreen').classList.add('hidden');
    }

    function lockApp() {
        document.body.classList.add('auth-locked');
        document.getElementById('loginScreen').classList.remove('hidden');
        document.getElementById('authForm').reset();
        document.getElementById('authError').classList.add('hidden');
        closeMenus();
    }

    let authMode = 'login'; // 'login' | 'signup'

    function updateRoleSelection(role) {
        state.selectedRole = role;
        const isCustomer = role === 'customer';
        const isWorker = role === 'worker';
        const isAdmin = role === 'admin';

        // Toggle card active classes
        document.getElementById('roleCardCustomer')?.classList.toggle('active', isCustomer);
        document.getElementById('roleCardWorker')?.classList.toggle('active', isWorker);
        document.getElementById('roleCardAdmin')?.classList.toggle('active', isAdmin);

        // Update card indicators
        const cCheck = document.querySelector('#roleCardCustomer .role-check-indicator i');
        const wCheck = document.querySelector('#roleCardWorker .role-check-indicator i');
        const aCheck = document.querySelector('#roleCardAdmin .role-check-indicator i');
        if (cCheck) cCheck.className = isCustomer ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle';
        if (wCheck) wCheck.className = isWorker ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle';
        if (aCheck) aCheck.className = isAdmin ? 'fa-solid fa-circle-check' : 'fa-regular fa-circle';

        const statusEl = document.getElementById('roleSelectedLabel');
        if (statusEl) {
            if (isCustomer) statusEl.textContent = 'Customer Mode Selected';
            else if (isWorker) statusEl.textContent = 'Worker Mode Selected';
            else statusEl.textContent = 'Admin & 3.5mm Gateway Selected';
        }

        const titleEl = document.getElementById('dynamicAuthTitle');
        const subEl = document.getElementById('dynamicAuthSub');
        const submitBtn = document.getElementById('authSubmitBtn');
        const voiceCallout = document.getElementById('workerVoiceCallout');

        if (isCustomer) {
            if (titleEl) titleEl.textContent = authMode === 'login' ? 'Sign in as a Customer' : 'Create Customer Account';
            if (subEl) subEl.textContent = 'Find and book trusted local professionals near you.';
            if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Continue as Customer';
            if (voiceCallout) voiceCallout.classList.add('hidden');
        } else if (isWorker) {
            if (titleEl) titleEl.textContent = authMode === 'login' ? 'Sign in as a Worker' : 'Create Worker Account';
            if (subEl) subEl.textContent = 'Find nearby jobs, set voice availability and track digital earnings.';
            if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-right-to-bracket"></i> Continue as Worker';
            if (voiceCallout) voiceCallout.classList.remove('hidden');
        } else {
            if (titleEl) titleEl.textContent = 'Cluster Admin & 3.5mm Gateway';
            if (subEl) subEl.textContent = 'Manage hyperlocal clusters, 3.5mm cellular hardware bridge & AI telemetry.';
            if (submitBtn) submitBtn.innerHTML = '<i class="fa-solid fa-shield-halved"></i> Enter Admin & 3.5mm Console';
            if (voiceCallout) voiceCallout.classList.add('hidden');
        }
    }

    // Role Card Clicks
    document.getElementById('roleCardCustomer')?.addEventListener('click', () => updateRoleSelection('customer'));
    document.getElementById('roleCardWorker')?.addEventListener('click', () => updateRoleSelection('worker'));
    document.getElementById('roleCardAdmin')?.addEventListener('click', () => updateRoleSelection('admin'));

    // Auth Tabs
    document.getElementById('loginTabBtn').onclick = () => {
        authMode = 'login';
        document.getElementById('loginTabBtn').classList.add('active');
        document.getElementById('signupTabBtn').classList.remove('active');
        updateRoleSelection(state.selectedRole);
    };
    document.getElementById('signupTabBtn').onclick = () => {
        authMode = 'signup';
        document.getElementById('signupTabBtn').classList.add('active');
        document.getElementById('loginTabBtn').classList.remove('active');
        updateRoleSelection(state.selectedRole);
    };

    // Worker Voice-First Auth Button
    document.getElementById('authVoiceOnboardBtn')?.addEventListener('click', () => {
        setSession({ email: 'voice.worker@gigsync.app', phone: '9845011223', role: 'worker' });
        unlockApp();
        setMode('worker');
        showView('onboard');
        toast('Starting AI Voice Onboarding for Worker!');
    });

    document.getElementById('togglePasswordBtn').onclick = () => {
        const input = document.getElementById('authPassword');
        const isPass = input.type === 'password';
        input.type = isPass ? 'text' : 'password';
        document.getElementById('togglePasswordBtn').innerHTML = isPass ? '<i class="fa-solid fa-eye-slash"></i>' : '<i class="fa-solid fa-eye"></i>';
    };

    // 1-Click Guest Buttons
    document.getElementById('guestBtn').onclick = () => {
        setSession({ email: 'guest.customer@gigsync.local', phone: '9876543210', role: 'customer' });
        unlockApp();
        setMode('customer');
        showView('home');
        toast('Logged in as Guest Customer');
    };

    document.getElementById('guestWorkerBtn')?.addEventListener('click', () => {
        setSession({ email: 'guest.worker@gigsync.local', phone: '9845011223', role: 'worker' });
        unlockApp();
        setMode('worker');
        showView('worker-home');
        toast('Logged in as Guest Worker (Workspace Active)');
    });

    document.getElementById('guestAdminBtn')?.addEventListener('click', () => {
        setSession({ email: 'admin@gigsync.app', phone: '9999999999', role: 'admin' });
        unlockApp();
        setMode('admin');
        showView('admin');
        toast('Logged in as Cluster Admin (3.5mm Hardware Console Active)');
    });

    document.getElementById('authForm').addEventListener('submit', async (e) => {
        e.preventDefault();
        const err = document.getElementById('authError');
        err.classList.add('hidden');
        const identifier = document.getElementById('authIdentifier').value.trim();
        const password = document.getElementById('authPassword').value;
        const parsed = normalizeIdentifier(identifier);

        if (parsed.type === 'unknown' || !parsed.key) {
            err.textContent = 'Please enter a valid 10-digit Indian mobile number or email.';
            err.classList.remove('hidden');
            return;
        }

        const users = loadUsers();
        const passwordHash = await hashPassword(password);
        const selectedRole = state.selectedRole;

        const findUser = (id, list) => {
            const p = normalizeIdentifier(id);
            if (p.type === 'email') return list.find(u => u.email === p.key);
            if (p.type === 'phone') return list.find(u => u.phone === p.key);
            return null;
        };

        if (authMode === 'signup') {
            if (findUser(identifier, users)) {
                err.textContent = 'An account with this number/email already exists. Please login.';
                err.classList.remove('hidden');
                return;
            }
            const newUser = {
                email: parsed.type === 'email' ? parsed.key : '',
                phone: parsed.type === 'phone' ? parsed.key : '',
                role: selectedRole,
                passwordHash
            };
            users.push(newUser);
            saveUsers(users);
            setSession(newUser);
            unlockApp();

            if (selectedRole === 'admin') {
                setMode('admin');
                showView('admin');
                toast('Admin account created! Welcome to 3.5mm Gateway Console.');
            } else if (selectedRole === 'worker') {
                setMode('worker');
                showView('worker-home');
                toast('Worker account created! Welcome to your Workspace.');
            } else {
                setMode('customer');
                showView('home');
                toast('Customer account created! Welcome to GigSync.');
            }
            return;
        }

        const user = findUser(identifier, users);
        if (!user || user.passwordHash !== passwordHash) {
            err.textContent = 'Incorrect mobile number/email or password.';
            err.classList.remove('hidden');
            return;
        }

        const activeRole = user.role || selectedRole;
        setSession({ ...user, role: activeRole });
        unlockApp();

        if (activeRole === 'admin') {
            setMode('admin');
            showView('admin');
            toast('Welcome back to Cluster Admin & 3.5mm Gateway!');
        } else if (activeRole === 'worker') {
            setMode('worker');
            showView('worker-home');
            toast('Welcome back to your Worker Workspace!');
        } else {
            setMode('customer');
            showView('home');
            toast('Welcome back to GigSync!');
        }
    });

    document.getElementById('logoutBtn').onclick = () => {
        localStorage.removeItem(AUTH_SESSION_KEY);
        lockApp();
        toast('Logged out successfully');
    };

    (async () => {
        const users = loadUsers();
        if (!users.some(u => u.phone === '9876543210' || u.email === 'demo@gigsync.app')) {
            users.push({
                email: 'demo@gigsync.app',
                phone: '9876543210',
                role: 'customer',
                passwordHash: await hashPassword(DEMO_PASSWORD)
            });
            users.push({
                email: 'worker@gigsync.app',
                phone: '9845011223',
                role: 'worker',
                passwordHash: await hashPassword(DEMO_PASSWORD)
            });
            users.push({
                email: 'admin@gigsync.app',
                phone: '9999999999',
                role: 'admin',
                passwordHash: await hashPassword(DEMO_PASSWORD)
            });
            saveUsers(users);
        }

        const session = getSession();
        if (session) {
            unlockApp();
            if (session.role === 'admin') {
                setMode('admin');
                showView('admin');
            } else if (session.role === 'worker') {
                setMode('worker');
                showView('worker-home');
            } else {
                setMode('customer');
                showView('home');
            }
        }
    })();

    /* ---------- UI Helpers & Toast ---------- */
    function toast(msg) {
        const el = document.getElementById('toast');
        el.innerHTML = `<i class="fa-solid fa-circle-check" style="color:#34D399"></i> <span>${msg}</span>`;
        el.classList.remove('hidden');
        clearTimeout(toast._t);
        toast._t = setTimeout(() => el.classList.add('hidden'), 2800);
    }

    function closeMenus() {
        ['profileMenu', 'notifMenu', 'locMenu', 'langMenu'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.classList.add('hidden');
        });
    }

    function getAvatarColor(i) {
        return AVATAR_COLORS[i % AVATAR_COLORS.length];
    }

    function statusPill(status) {
        const map = {
            'Confirmed': 'pill-green',
            'Completed': 'pill-green',
            'Accepted': 'pill-blue',
            'On the Way': 'pill-blue',
            'In Progress': 'pill-amber',
            'Requested': 'pill-amber',
            'Cancelled': 'pill-gray'
        };
        const cls = map[status] || 'pill-gray';
        return `<span class="pill ${cls}">${status}</span>`;
    }

    /* ---------- Render Functions ---------- */

    function serviceCardTemplate(s) {
        return `
            <button class="service-card" data-view="find" data-service="${s.name}">
                <div class="svc-icon"><i class="fa-solid ${s.icon}"></i></div>
                <h3>${s.name}</h3>
                <p>${s.desc}</p>
                <div style="margin-top:auto;font-size:11.5px;font-weight:750;color:var(--gs-indigo)">${s.avgPrice}</div>
            </button>
        `;
    }

    function workerCardTemplate(w, i) {
        return `
            <article class="card worker-card">
                <div>
                    <div class="worker-top">
                        <div class="w-avatar" style="background:${getAvatarColor(w.id)}">${w.initials}</div>
                        <div>
                            <h3 class="h3" style="font-size:17px">${w.name}</h3>
                            <p class="w-trade">${w.trade}</p>
                        </div>
                    </div>
                    <div class="worker-meta-line">
                        <span>⭐ <b>${w.rating}</b> (${w.jobs})</span>
                        <span>📍 <b>${w.km} km</b> away</span>
                        ${w.avail ? '<span class="pill pill-green" style="padding:2px 8px;font-size:11px">Available Now</span>' : '<span class="pill pill-gray" style="padding:2px 8px;font-size:11px">Later Today</span>'}
                    </div>
                    <div class="worker-tools-chip">
                        <i class="fa-solid fa-toolbox" style="color:var(--gs-indigo)"></i> ${w.tools.split(',').slice(0, 2).join(', ')}
                    </div>
                </div>
                <div class="worker-card-footer">
                    <div>
                        <small style="color:var(--gs-muted);display:block;font-size:11px">Starting at</small>
                        <span class="worker-price">₹${w.price}</span>
                    </div>
                    <div style="display:flex;gap:6px">
                        <button class="btn btn-ghost btn-sm" data-profile="${w.id}">Details</button>
                        <button class="btn btn-primary btn-sm" data-request-worker="${w.id}"><i class="fa-solid fa-paper-plane"></i> Request</button>
                    </div>
                </div>
            </article>
        `;
    }

    function resultRowTemplate(w, i) {
        return `
            <article class="result-card">
                <div class="w-avatar" style="background:${getAvatarColor(w.id)};width:64px;height:64px;font-size:22px">${w.initials}</div>
                <div class="result-info">
                    <div style="display:flex;align-items:center;gap:8px">
                        <h3>${w.name}</h3>
                        ${w.verified ? '<span class="pill pill-blue" style="font-size:11px;padding:2px 8px"><i class="fa-solid fa-shield-check"></i> Verified</span>' : ''}
                        ${w.avail ? '<span class="pill pill-green" style="font-size:11px;padding:2px 8px">Available Now</span>' : ''}
                    </div>
                    <p style="color:var(--gs-indigo);font-weight:750;font-size:14px">${w.trade} · ${w.area || 'Ramanagara'}</p>
                    <div class="result-meta">
                        <span>⭐ <b>${w.rating}</b></span>
                        <span>📍 <b>${w.km} km</b> away</span>
                        <span>🛠️ <b>${w.years} yrs</b> experience</span>
                        <span>📜 <b>${w.jobs}</b> completed jobs</span>
                    </div>
                    <div class="result-tools">
                        <i class="fa-solid fa-toolbox" style="color:var(--gs-indigo)"></i>
                        <span>Equipped with: <b>${w.tools}</b></span>
                    </div>
                </div>
                <div class="result-actions">
                    <div>
                        <span style="font-size:12px;color:var(--gs-muted)">Estimated from</span>
                        <div class="worker-price" style="font-size:20px">₹${w.price}</div>
                    </div>
                    <div style="display:flex;gap:8px">
                        <button class="btn btn-ghost btn-sm" data-profile="${w.id}">View Profile</button>
                        <button class="btn btn-primary btn-sm" data-request-worker="${w.id}"><i class="fa-solid fa-calendar-plus"></i> Request Worker</button>
                    </div>
                </div>
            </article>
        `;
    }

    function renderHome() {
        const svcGrid = document.getElementById('homeServices');
        if (svcGrid) svcGrid.innerHTML = SERVICES.map(serviceCardTemplate).join('');

        const workersGrid = document.getElementById('homeWorkers');
        if (workersGrid) workersGrid.innerHTML = WORKERS.slice(0, 4).map(workerCardTemplate).join('');
    }

    function getFilteredWorkers() {
        let list = [...WORKERS];
        const svcSelect = document.getElementById('filterService');
        const svc = (svcSelect ? svcSelect.value : state.serviceFilter || '').toLowerCase();

        if (svc && svc !== 'all' && svc !== 'all trades') {
            const cleanSvc = svc.replace(' trade', '').replace(' repair', '').trim();
            list = list.filter(w =>
                w.trade.toLowerCase().includes(cleanSvc) ||
                w.service.toLowerCase().includes(cleanSvc)
            );
            if (!list.length) list = [...WORKERS];
        }

        const maxDist = Number(document.getElementById('filterDist')?.value || 25);
        list = list.filter(w => w.km <= maxDist);

        if (document.getElementById('filterNow')?.checked) {
            list = list.filter(w => w.avail);
        }

        if (document.getElementById('filterVerified')?.checked) {
            list = list.filter(w => w.verified);
        }

        const minRating = Number(document.getElementById('filterRating')?.value || 0);
        if (minRating > 0) {
            list = list.filter(w => w.rating >= minRating);
        }

        const maxPrice = document.getElementById('filterPrice')?.value;
        if (maxPrice && maxPrice !== 'all') {
            list = list.filter(w => w.price <= Number(maxPrice));
        }

        if (state.sort === 'dist') list.sort((a, b) => a.km - b.km);
        else if (state.sort === 'rating') list.sort((a, b) => b.rating - a.rating);
        else if (state.sort === 'price') list.sort((a, b) => a.price - b.price);
        else {
            // 'rec': weighted composite score of rating, distance & availability
            list.sort((a, b) => {
                const scoreA = (a.rating * 2) - (a.km * 0.5) + (a.avail ? 2 : 0);
                const scoreB = (b.rating * 2) - (b.km * 0.5) + (b.avail ? 2 : 0);
                return scoreB - scoreA;
            });
        }

        return list;
    }

    function renderFind() {
        const sel = document.getElementById('filterService');
        if (sel && !sel.options.length) {
            sel.innerHTML = '<option value="all">All Skilled Trades</option>' + SERVICES.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
            if (state.serviceFilter) {
                const match = SERVICES.find(s => s.name.toLowerCase() === state.serviceFilter.toLowerCase() || s.id === state.serviceFilter);
                if (match) sel.value = match.id;
            }
        }

        const list = getFilteredWorkers();
        const resEl = document.getElementById('resultList');
        const countEl = document.getElementById('resultCount');
        const titleEl = document.getElementById('findTitle');

        if (resEl) {
            if (list.length === 0) {
                resEl.innerHTML = `
                    <div class="card" style="padding:40px;text-align:center">
                        <i class="fa-solid fa-users-slash" style="font-size:36px;color:var(--gs-muted);margin-bottom:12px"></i>
                        <h3>No matching workers found in this distance radius</h3>
                        <p class="lede" style="margin:6px auto 16px">Try increasing distance to 15–20 km or resetting filters.</p>
                        <button class="btn btn-primary btn-sm" id="emptyResetBtn">Reset Filters</button>
                    </div>
                `;
                document.getElementById('emptyResetBtn')?.addEventListener('click', () => {
                    document.getElementById('resetFiltersBtn')?.click();
                });
            } else {
                resEl.innerHTML = list.map(resultRowTemplate).join('');
            }
        }

        if (countEl) countEl.innerHTML = `Showing <b>${list.length}</b> verified workers in ${state.city.split(',')[0]}`;
        if (titleEl) {
            const tradeName = sel && sel.value !== 'all' ? sel.options[sel.selectedIndex]?.text : 'Skilled Workers';
            titleEl.textContent = `${tradeName} near ${state.city.split(',')[0]}`;
        }
    }

    function openProfile(id) {
        const w = WORKERS.find(x => x.id === Number(id)) || WORKERS[0];
        state.selectedWorker = w.id;

        document.getElementById('pName').textContent = w.name;
        document.getElementById('pTrade').textContent = `⚡ ${w.trade} (${w.area || 'Ramanagara'})`;
        document.getElementById('pPhoto').textContent = w.initials;
        document.getElementById('pPhoto').style.background = getAvatarColor(w.id);
        document.getElementById('pAbout').textContent = w.about;
        document.getElementById('pJobsCount').textContent = w.jobs;

        document.getElementById('pMeta').innerHTML = `
            <span>⭐ <b>${w.rating}</b></span>
            <span>📍 <b>${w.km} km</b> away</span>
            <span>📜 <b>${w.jobs}</b> completed jobs</span>
            <span>🛠️ <b>${w.years}</b> years in trade</span>
        `;

        const skills = [w.trade, 'Emergency visits', 'House calls', 'Diagnostic testing', 'Own tools'];
        document.getElementById('pSkills').innerHTML = skills.map(s => `<span class="chip">${s}</span>`).join('');

        const tools = w.tools ? w.tools.split(',').map(t => t.trim()) : ['Standard Tool Kit', 'Safety Gear', 'Testing Pen'];
        document.getElementById('pTools').innerHTML = tools.map(t => `<span class="chip"><i class="fa-solid fa-wrench" style="font-size:11px"></i> ${t}</span>`).join('');

        document.getElementById('profileRequestBtn').onclick = () => {
            toast(`Direct request dispatched to ${w.name}!`);
        };

        showView('profile');
    }

    function renderJobs() {
        const rows = JOBS[state.jobTab] || [];
        const table = document.getElementById('jobsTable');
        if (!table) return;

        if (rows.length === 0) {
            table.innerHTML = `<tbody><tr><td colspan="8" style="text-align:center;padding:32px;color:var(--gs-muted)">No ${state.jobTab} bookings right now.</td></tr></tbody>`;
            return;
        }

        table.innerHTML = `
            <thead>
                <tr>
                    <th>Job ID &amp; Service</th>
                    <th>Assigned Worker</th>
                    <th>Location / Ward</th>
                    <th>Date &amp; Time</th>
                    <th>Status</th>
                    <th>Rate</th>
                    <th>Actions</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map(j => `
                    <tr>
                        <td><b>${j.service}</b><br><small style="color:var(--gs-muted)">${j.id || 'GS-9901'}</small></td>
                        <td><i class="fa-solid fa-user-check" style="color:var(--gs-blue)"></i> ${j.worker}</td>
                        <td>${j.loc}</td>
                        <td>${j.date} · ${j.time}</td>
                        <td>${statusPill(j.status)}</td>
                        <td style="font-weight:750">${j.price}</td>
                        <td>
                            <div style="display:flex;gap:6px">
                                <button class="btn btn-ghost btn-sm" data-toast="Job details: ${j.service} with ${j.worker}">View</button>
                                <button class="btn btn-primary btn-sm" data-toast="Calling ${j.worker}..."><i class="fa-solid fa-phone"></i></button>
                            </div>
                        </td>
                    </tr>
                `).join('')}
            </tbody>
        `;
    }

    function renderWJobs() {
        const listEl = document.getElementById('wJobList');
        if (!listEl) return;
        const rows = WJOBS[state.wJobTab] || [];

        if (rows.length === 0) {
            listEl.innerHTML = `
                <div class="card" style="padding:40px;text-align:center">
                    <i class="fa-solid fa-folder-open" style="font-size:32px;color:var(--gs-muted);margin-bottom:10px"></i>
                    <h3>No jobs in "${state.wJobTab}" tab</h3>
                    <p class="lede" style="margin:4px auto 0">New alerts from Ramanagara customers will appear here automatically.</p>
                </div>
            `;
            return;
        }

        listEl.innerHTML = rows.map(j => `
            <div class="card" style="padding:22px;display:flex;justify-content:space-between;gap:20px;align-items:center">
                <div>
                    <div style="display:flex;align-items:center;gap:10px;margin-bottom:4px">
                        <h3 class="h3" style="font-size:17px">${j.service}</h3>
                        ${statusPill(j.status)}
                    </div>
                    <p class="meta" style="margin:4px 0">
                        <span><i class="fa-solid fa-user"></i> Customer: <b>${j.customer}</b></span>
                        <span><i class="fa-solid fa-location-dot"></i> ${j.loc} (<b>${j.km}</b> away)</span>
                        <span><i class="fa-solid fa-calendar"></i> ${j.date} · ${j.time}</span>
                    </p>
                    <div style="font-size:13.5px;color:var(--gs-green-dark);font-weight:750;margin-top:6px">
                        <i class="fa-solid fa-indian-rupee-sign"></i> Estimated Income: ${j.pay}
                    </div>
                </div>
                <div style="display:flex;gap:8px;flex-shrink:0">
                    ${state.wJobTab === 'new' ? `
                        <button class="btn btn-success" data-accept-job="${j.id}"><i class="fa-solid fa-check"></i> Accept</button>
                        <button class="btn btn-danger" data-reject-job="${j.id}"><i class="fa-solid fa-xmark"></i> Reject</button>
                    ` : ''}
                    ${state.wJobTab === 'accepted' ? `
                        <button class="btn btn-primary" data-toast="Job #${j.id} marked In Progress!"><i class="fa-solid fa-person-running"></i> Start Work</button>
                        <button class="btn btn-ghost" data-toast="Calling ${j.customer}..."><i class="fa-solid fa-phone"></i> Call Customer</button>
                    ` : ''}
                    ${state.wJobTab === 'ongoing' ? `
                        <button class="btn btn-success" data-complete-job="${j.id}"><i class="fa-solid fa-circle-check"></i> Complete &amp; Collect Pay</button>
                        <button class="btn btn-ghost" data-toast="Directions opened in Maps"><i class="fa-solid fa-map-location-dot"></i> Route</button>
                    ` : ''}
                    ${state.wJobTab === 'done' ? `
                        <button class="btn btn-ghost btn-sm" data-toast="Receipt downloaded for ${j.customer}"><i class="fa-solid fa-file-invoice"></i> View Record</button>
                    ` : ''}
                </div>
            </div>
        `).join('');
    }

    function renderWeek() {
        const days = [
            ['Monday', '8:30 AM – 6:30 PM', 'Active'],
            ['Tuesday', '8:30 AM – 6:30 PM', 'Active'],
            ['Wednesday', '10:00 AM – 2:00 PM', 'Half Day'],
            ['Thursday', '8:30 AM – 6:30 PM', 'Active'],
            ['Friday', '8:30 AM – 6:30 PM', 'Active'],
            ['Saturday', '8:30 AM – 7:00 PM', 'Active'],
            ['Sunday', 'Emergency calls only', 'On-Call']
        ];
        const el = document.getElementById('weekList');
        if (el) {
            el.innerHTML = days.map(([d, h, s]) => `
                <div class="card day-row">
                    <strong>${d}</strong>
                    <div>
                        <span style="font-weight:600;color:var(--gs-ink)">${h}</span>
                        <span class="pill ${s === 'Active' ? 'pill-green' : 'pill-amber'}" style="margin-left:8px;font-size:11px">${s}</span>
                    </div>
                    <button class="btn btn-ghost btn-sm" data-toast="Editing slot for ${d}">Edit Slot</button>
                </div>
            `).join('');
        }
    }

    function renderBars(id, heights) {
        const el = document.getElementById(id);
        if (el) {
            el.innerHTML = heights.map(h => `<div class="bar" style="height:${h}%" title="${h}%"></div>`).join('');
        }
    }

    /* ---------- Navigation & Mode Switcher ---------- */
    const customerViews = new Set(['home', 'find', 'post-job', 'jobs', 'voice', 'profile']);
    const workerViews = new Set(['worker-home', 'worker-jobs', 'worker-availability', 'worker-earnings', 'worker-profile', 'onboard']);

    function setMode(mode) {
        state.mode = mode;
        document.body.classList.toggle('mode-worker', mode === 'worker');
        document.body.classList.toggle('mode-admin', mode === 'admin');

        document.getElementById('customerNav')?.classList.toggle('hidden', mode !== 'customer');
        document.getElementById('workerNav')?.classList.toggle('hidden', mode !== 'worker');
        document.getElementById('adminNav')?.classList.toggle('hidden', mode !== 'admin');

        const roleBadge = document.getElementById('navRoleBadge');
        if (roleBadge) {
            roleBadge.textContent = mode === 'worker' ? 'Worker Mode' : mode === 'admin' ? 'Admin' : 'Customer';
        }

        const modeBarLabel = document.getElementById('modeBarLabel');
        if (modeBarLabel) {
            modeBarLabel.textContent = mode === 'admin' ? 'Tier-2/3 Cluster Admin' : 'Worker Workspace';
        }

        closeMenus();
    }

    function showView(name) {
        state.view = name;

        if (workerViews.has(name) && name !== 'onboard') setMode('worker');
        if (customerViews.has(name)) {
            if (state.mode === 'admin') setMode('customer');
            if (state.mode === 'worker' && name !== 'voice') setMode('customer');
        }
        if (name === 'admin') setMode('admin');

        document.querySelectorAll('.view').forEach(v => v.classList.toggle('active', v.id === 'view-' + name));
        document.querySelectorAll('.nav-link').forEach(b => b.classList.toggle('active', b.dataset.view === name));

        if (name === 'home') renderHome();
        if (name === 'find') renderFind();
        if (name === 'jobs') renderJobs();
        if (name === 'worker-jobs') renderWJobs();
        if (name === 'worker-availability') renderWeek();

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    /* ---------- Event Delegation & Interactions ---------- */
    document.body.addEventListener('click', (e) => {
        // Generic Toast Triggers
        const toastBtn = e.target.closest('[data-toast]');
        if (toastBtn) {
            toast(toastBtn.dataset.toast);
        }

        // Profile Modal / View
        const profileBtn = e.target.closest('[data-profile]');
        if (profileBtn) {
            openProfile(profileBtn.dataset.profile);
            return;
        }

        // Direct Request Worker Trigger
        const reqWorkerBtn = e.target.closest('[data-request-worker]');
        if (reqWorkerBtn) {
            const wId = reqWorkerBtn.dataset.requestWorker;
            const w = WORKERS.find(x => x.id === Number(wId)) || WORKERS[0];
            toast(`Job request sent directly to ${w.name} (${w.trade})!`);
            return;
        }

        // Navigation View Links
        const viewBtn = e.target.closest('[data-view]');
        if (viewBtn) {
            if (viewBtn.dataset.service) {
                state.serviceFilter = viewBtn.dataset.service;
                const sel = document.getElementById('filterService');
                if (sel) sel.value = viewBtn.dataset.service.toLowerCase();
            }
            showView(viewBtn.dataset.view);
            return;
        }

        // Worker Accept Job in Dashboard / Jobs View
        const acceptJobBtn = e.target.closest('[data-accept-job]');
        if (acceptJobBtn) {
            const jId = Number(acceptJobBtn.dataset.acceptJob);
            const jobIndex = WJOBS.new.findIndex(j => j.id === jId);
            if (jobIndex > -1) {
                const accepted = WJOBS.new.splice(jobIndex, 1)[0];
                accepted.status = 'Accepted';
                WJOBS.accepted.push(accepted);
            }
            const cardEl = document.getElementById(`jobReqCard${jId}`);
            if (cardEl) {
                cardEl.style.transition = 'all .3s';
                cardEl.style.opacity = '0';
                setTimeout(() => cardEl.remove(), 300);
            }
            toast(`Job #${jId} ACCEPTED! Added to your schedule.`);
            renderWJobs();
            return;
        }

        // Worker Reject Job
        const rejectJobBtn = e.target.closest('[data-reject-job]');
        if (rejectJobBtn) {
            const jId = Number(rejectJobBtn.dataset.rejectJob);
            const jobIndex = WJOBS.new.findIndex(j => j.id === jId);
            if (jobIndex > -1) {
                WJOBS.new.splice(jobIndex, 1);
            }
            const cardEl = document.getElementById(`jobReqCard${jId}`);
            if (cardEl) {
                cardEl.style.transition = 'all .3s';
                cardEl.style.opacity = '0';
                setTimeout(() => cardEl.remove(), 300);
            }
            toast(`Job #${jId} rejected.`);
            renderWJobs();
            return;
        }

        // Complete Job
        const completeJobBtn = e.target.closest('[data-complete-job]');
        if (completeJobBtn) {
            const jId = Number(completeJobBtn.dataset.completeJob);
            const idx = WJOBS.ongoing.findIndex(j => j.id === jId);
            if (idx > -1) {
                const done = WJOBS.ongoing.splice(idx, 1)[0];
                done.status = 'Completed';
                WJOBS.done.push(done);
            }
            toast(`Job #${jId} completed & added to Digital Work Record!`);
            renderWJobs();
            return;
        }

        // Sample Prompts from Hero
        const sampleBtn = e.target.closest('.sample-prompt-btn');
        if (sampleBtn) {
            const prompt = sampleBtn.dataset.prompt;
            const input = document.getElementById('homeSearch');
            if (input) input.value = prompt;
            showView('voice');
            runVoiceScenario(prompt);
            return;
        }

        // Preset Voice Scenarios in Voice Studio
        const presetBtn = e.target.closest('.preset-btn');
        if (presetBtn) {
            const type = presetBtn.dataset.vscenario;
            runPresetScenario(type);
            return;
        }
    });

    /* ---------- Search Stage Actions ---------- */
    const homeSearchInput = document.getElementById('homeSearch');
    const homeSearchBtn = document.getElementById('homeSearchBtn');

    function executeHomeSearch() {
        const query = (homeSearchInput?.value || '').trim();
        if (query) {
            state.serviceFilter = query;
            showView('find');
        } else {
            showView('find');
        }
    }

    homeSearchInput?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') executeHomeSearch();
    });
    homeSearchBtn?.addEventListener('click', executeHomeSearch);

    /* ---------- Filter Listeners ---------- */
    document.getElementById('filterService')?.addEventListener('change', renderFind);
    document.getElementById('filterDist')?.addEventListener('input', (e) => {
        document.getElementById('distVal').textContent = e.target.value;
        renderFind();
    });
    document.getElementById('filterNow')?.addEventListener('change', renderFind);
    document.getElementById('filterToday')?.addEventListener('change', renderFind);
    document.getElementById('filterVerified')?.addEventListener('change', renderFind);
    document.getElementById('filterTools')?.addEventListener('change', renderFind);
    document.getElementById('filterRating')?.addEventListener('change', renderFind);
    document.getElementById('filterPrice')?.addEventListener('change', renderFind);

    document.getElementById('resetFiltersBtn')?.addEventListener('click', () => {
        const sel = document.getElementById('filterService');
        if (sel) sel.value = 'all';
        const dist = document.getElementById('filterDist');
        if (dist) { dist.value = 10; document.getElementById('distVal').textContent = '10'; }
        if (document.getElementById('filterNow')) document.getElementById('filterNow').checked = false;
        if (document.getElementById('filterToday')) document.getElementById('filterToday').checked = true;
        if (document.getElementById('filterVerified')) document.getElementById('filterVerified').checked = true;
        if (document.getElementById('filterTools')) document.getElementById('filterTools').checked = true;
        if (document.getElementById('filterRating')) document.getElementById('filterRating').value = '4.5';
        if (document.getElementById('filterPrice')) document.getElementById('filterPrice').value = 'all';
        renderFind();
        toast('Filters reset to default');
    });

    // Sorting Bar
    document.querySelectorAll('.sort-buttons .sort-btn').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.sort-buttons .sort-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            state.sort = btn.dataset.sort;
            renderFind();
        };
    });

    // Tabs
    document.getElementById('jobTabs')?.addEventListener('click', (e) => {
        const t = e.target.closest('.tab');
        if (!t) return;
        document.querySelectorAll('#jobTabs .tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        state.jobTab = t.dataset.tab;
        renderJobs();
    });

    document.getElementById('wJobTabs')?.addEventListener('click', (e) => {
        const t = e.target.closest('.tab');
        if (!t) return;
        document.querySelectorAll('#wJobTabs .tab').forEach(x => x.classList.remove('active'));
        t.classList.add('active');
        state.wJobTab = t.dataset.wtab;
        renderWJobs();
    });

    /* ---------- Header Dropdowns ---------- */
    document.getElementById('profileBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenus();
        document.getElementById('profileMenu')?.classList.toggle('hidden');
    });
    document.getElementById('notifBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenus();
        document.getElementById('notifMenu')?.classList.toggle('hidden');
    });
    document.getElementById('locBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenus();
        document.getElementById('locMenu')?.classList.toggle('hidden');
    });
    document.getElementById('langBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        closeMenus();
        document.getElementById('langMenu')?.classList.toggle('hidden');
    });
    document.getElementById('changeLocLink')?.addEventListener('click', () => {
        document.getElementById('locBtn')?.click();
    });

    document.getElementById('locMenu')?.addEventListener('click', (e) => {
        const item = e.target.closest('[data-loc]');
        if (!item) return;
        document.querySelectorAll('#locMenu .loc-item').forEach(x => x.classList.remove('active'));
        item.classList.add('active');
        const loc = item.dataset.loc;
        state.city = loc;
        const cityName = loc.split(',')[0];
        document.getElementById('locLabel').textContent = cityName;
        document.querySelectorAll('.loc-text').forEach(el => el.textContent = loc);
        closeMenus();
        toast(`Location switched to ${cityName}`);
        renderFind();
    });

    document.getElementById('langMenu')?.addEventListener('click', (e) => {
        const item = e.target.closest('[data-lang]');
        if (!item) return;
        document.querySelectorAll('#langMenu .dropdown-item').forEach(x => x.classList.remove('active'));
        item.classList.add('active');
        const lang = item.dataset.lang;
        state.lang = lang;
        const labelMap = { en: 'English', kn: 'ಕನ್ನಡ (Kannada)', hi: 'हिन्दी (Hindi)', ta: 'தமிழ்', te: 'తెలుగు' };
        document.getElementById('langLabel').textContent = labelMap[lang] || 'English';
        closeMenus();
        toast(`Voice & UI dialect set to ${labelMap[lang]}`);
    });

    document.addEventListener('click', closeMenus);

    // Mode Buttons in Menu
    document.getElementById('menuCustomerBtn')?.addEventListener('click', () => {
        setMode('customer');
        showView('home');
    });
    document.getElementById('switchWorkerBtn')?.addEventListener('click', () => {
        setMode('worker');
        showView('worker-home');
        toast('Switched to Worker Workspace');
    });
    document.getElementById('heroWorkerBtn')?.addEventListener('click', () => {
        setMode('worker');
        showView('worker-home');
        toast('Switched to Worker Workspace');
    });
    document.getElementById('switchAdminBtn')?.addEventListener('click', () => {
        setMode('admin');
        showView('admin');
        toast('Cluster Admin dashboard active');
    });
    document.getElementById('onboardBtn')?.addEventListener('click', () => {
        setMode('worker');
        showView('onboard');
    });
    document.getElementById('exitModeBtn')?.addEventListener('click', () => {
        setMode('customer');
        showView('home');
        toast('Back to Customer View');
    });

    // Worker Availability Toggle
    document.getElementById('availToggle')?.addEventListener('change', (e) => {
        const isChecked = e.target.checked;
        state.workerAvailable = isChecked;
        document.getElementById('availTag').textContent = isChecked ? '🟢 AVAILABLE FOR WORK' : '⚪ UNAVAILABLE (OFF-DUTY)';
        document.getElementById('availTag').style.color = isChecked ? 'var(--gs-green-dark)' : 'var(--gs-muted)';
        document.getElementById('availLabelText').textContent = isChecked ? 'Accepting Jobs' : 'Off-Duty';
        toast(isChecked ? 'You are now visible to nearby customers in Ramanagara!' : 'You are now off-duty. No new jobs dispatched.');
    });

    /* ---------- AI Voice Assistant Engine ---------- */
    const micBtn = document.getElementById('micBtn');
    const micStatus = document.getElementById('micStatus');
    const micWaveform = document.getElementById('micWaveform');
    const transcript = document.getElementById('transcript');
    const matchedBox = document.getElementById('aiMatchedWorkerBox');

    function resetVoiceSlots() {
        ['exService', 'exProblem', 'exWhen', 'exUrgency', 'exTools'].forEach(id => {
            const el = document.getElementById(id);
            if (el) el.textContent = '—';
        });
        if (matchedBox) matchedBox.classList.add('hidden');
    }

    document.getElementById('resetVoice')?.addEventListener('click', () => {
        if (transcript) {
            transcript.innerHTML = `
                <div class="bubble ai">
                    <div class="bubble-speaker"><i class="fa-solid fa-robot"></i> GigSync AI</div>
                    <div class="bubble-content">Namaskara / Hello! What can I help you with today in Ramanagara?</div>
                </div>
            `;
        }
        resetVoiceSlots();
        if (micStatus) micStatus.textContent = 'Click the microphone and speak your request.';
    });

    function runVoiceScenario(text) {
        if (!micBtn) return;
        micBtn.classList.add('listening');
        micWaveform?.classList.remove('hidden');
        if (micStatus) micStatus.textContent = 'GigSync AI is listening and understanding intent...';

        setTimeout(() => {
            transcript.insertAdjacentHTML('beforeend', `
                <div class="bubble user">
                    <div class="bubble-speaker"><i class="fa-solid fa-user"></i> You (Spoken)</div>
                    <div class="bubble-content">“${text}”</div>
                </div>
            `);
            transcript.scrollTop = transcript.scrollHeight;
        }, 600);

        setTimeout(() => {
            // NLU Extraction logic
            const lower = text.toLowerCase();
            let trade = 'Electrical';
            let problem = 'General repair';
            let tools = 'Testing gear';
            let workerId = 1;

            if (lower.includes('plumb') || lower.includes('pipe') || lower.includes('tap') || lower.includes('leak') || lower.includes('water')) {
                trade = 'Plumbing';
                problem = 'Pipe leak / Tap fitting';
                tools = 'Pipe wrench, thread tape, pressure tester';
                workerId = 2;
            } else if (lower.includes('fan') || lower.includes('electric') || lower.includes('wiring') || lower.includes('switch')) {
                trade = 'Electrical';
                problem = 'Ceiling fan & wiring diagnosis';
                tools = 'Multimeter, impact drill, safety gloves';
                workerId = 1;
            } else if (lower.includes('bike') || lower.includes('scooter') || lower.includes('mechanic') || lower.includes('start')) {
                trade = 'Two-Wheeler Mechanic';
                problem = 'Ignition / Engine tuning';
                tools = 'Spanners, spark plug tester';
                workerId = 5;
            } else if (lower.includes('door') || lower.includes('lock') || lower.includes('carpenter')) {
                trade = 'Carpentry';
                problem = 'Door lock & alignment';
                tools = 'Chisels, wood saw, drill kit';
                workerId = 3;
            }

            document.getElementById('exService').textContent = trade;
            document.getElementById('exProblem').textContent = problem;
            document.getElementById('exWhen').textContent = lower.includes('urgent') || lower.includes('today') ? 'Today (Urgent)' : 'Tomorrow Morning (10 AM)';
            document.getElementById('exUrgency').textContent = lower.includes('urgent') ? 'High (Immediate Dispatch)' : 'Scheduled';
            document.getElementById('exTools').textContent = tools;

            const matchedWorker = WORKERS.find(w => w.id === workerId) || WORKERS[0];

            transcript.insertAdjacentHTML('beforeend', `
                <div class="bubble ai">
                    <div class="bubble-speaker"><i class="fa-solid fa-sparkles"></i> GigSync AI</div>
                    <div class="bubble-content">I understood your request: <b>${trade}</b> for <b>${problem}</b>. I found <b>${matchedWorker.name}</b> (${matchedWorker.trade}) available <b>${matchedWorker.km} km away</b> with <b>${tools}</b>.</div>
                </div>
            `);
            transcript.scrollTop = transcript.scrollHeight;

            if (matchedBox) {
                matchedBox.classList.remove('hidden');
                document.getElementById('matchAvatar').textContent = matchedWorker.initials;
                document.getElementById('matchAvatar').style.background = getAvatarColor(matchedWorker.id);
                document.getElementById('matchName').textContent = matchedWorker.name;
                document.getElementById('matchTrade').textContent = matchedWorker.trade;
                document.getElementById('matchMeta').textContent = `📍 ${matchedWorker.km} km · ⭐ ${matchedWorker.rating} (${matchedWorker.jobs} jobs) · Has required tools`;
                document.getElementById('bookMatchedWorkerBtn').textContent = `Book ${matchedWorker.name} (₹${matchedWorker.price}+)`;
                document.getElementById('bookMatchedWorkerBtn').onclick = () => {
                    toast(`Booking confirmed with ${matchedWorker.name}! Added to My Jobs.`);
                    showView('jobs');
                };
            }

            micBtn.classList.remove('listening');
            micWaveform?.classList.add('hidden');
            if (micStatus) micStatus.textContent = 'Worker matched! Click book to dispatch or ask another requirement.';
        }, 1600);
    }

    function runPresetScenario(type) {
        const scenarios = {
            electrical: "I need an electrician tomorrow morning. My ceiling fan isn't working.",
            plumbing: "My bathroom pipe is leaking and I need a plumber today urgently.",
            mechanic: "Scooter won't kick start near station road, need mechanic nearby.",
            carpentry: "Need a carpenter to fix bedroom door lock and window frame."
        };
        runVoiceScenario(scenarios[type] || scenarios.electrical);
    }

    micBtn?.addEventListener('click', () => {
        runVoiceScenario("I need an electrician tomorrow at 10 AM. Fan is not working.");
    });

    /* ---------- Worker Voice Availability & Onboarding ---------- */
    document.getElementById('voiceAvailBtn')?.addEventListener('click', () => {
        const extract = document.getElementById('availExtract');
        if (extract) {
            extract.classList.remove('hidden');
            toast('AI heard and confirmed your availability: Tomorrow 10 AM – 2 PM!');
        }
    });

    const obSteps = [
        { q: 'What work do you do?', hint: 'Example: “I am a plumber.”', sample: 'I am a plumber and water pump technician.' },
        { q: 'Which areas do you work in?', hint: 'Example: “Ramanagara and nearby village clusters.”', sample: 'Ramanagara, Channapatna and surrounding villages within 15 km.' },
        { q: 'Do you have your own tools and equipment?', hint: 'Example: “Yes, heavy pipe wrench, drill and testing kit.”', sample: 'Yes, I have pipe wrenches, drilling machine, pressure tester and safety kit.' },
        { q: 'When are you available for jobs?', hint: 'Example: “Every day from 9 AM to 6 PM.”', sample: 'Monday to Saturday, 9:00 AM to 6:00 PM.' }
    ];
    let obIndex = 0;
    const obAnswers = [];

    function renderOnboardingStep() {
        const step = obSteps[obIndex];
        document.getElementById('obStepNum').textContent = `Step ${obIndex + 1} of ${obSteps.length}`;
        document.getElementById('obQ').textContent = step.q;
        document.getElementById('obHint').textContent = step.hint;
        document.getElementById('obInput').value = '';
        document.querySelectorAll('#obDots span').forEach((s, i) => s.classList.toggle('on', i === obIndex));
    }

    document.getElementById('obMic')?.addEventListener('click', () => {
        document.getElementById('obInput').value = obSteps[obIndex].sample;
        toast('Voice recognized: “' + obSteps[obIndex].sample + '”');
    });

    document.getElementById('obNext')?.addEventListener('click', () => {
        const val = document.getElementById('obInput').value.trim() || obSteps[obIndex].sample;
        obAnswers[obIndex] = val;

        if (obIndex < obSteps.length - 1) {
            obIndex += 1;
            renderOnboardingStep();
            return;
        }

        const summary = document.getElementById('obSummary');
        if (summary) {
            summary.classList.remove('hidden');
            summary.innerHTML = `
                <div class="confirm-head"><i class="fa-solid fa-circle-check text-green"></i> <b>AI Synthesized Your Digital Profile</b></div>
                <div style="margin:12px 0;line-height:1.6;font-size:14px">
                    <p><b>Profession / Trade:</b> ${obAnswers[0] || 'Plumber & Pump Specialist'}</p>
                    <p><b>Service Area:</b> ${obAnswers[1] || 'Ramanagara & nearby'}</p>
                    <p><b>Tools Owned:</b> ${obAnswers[2] || 'Pipe wrench, drill, testing kit'}</p>
                    <p><b>Working Hours:</b> ${obAnswers[3] || '9 AM – 6 PM daily'}</p>
                </div>
                <p class="text-green font-bold">Profile published to Ramanagara cluster directory!</p>
                <div style="margin-top:16px;display:flex;gap:10px">
                    <button class="btn btn-primary" id="obFinishBtn"><i class="fa-solid fa-briefcase"></i> Open Worker Workspace</button>
                </div>
            `;
            document.getElementById('obFinishBtn')?.addEventListener('click', () => {
                setMode('worker');
                showView('worker-home');
                toast('Welcome to GigSync Worker Workspace!');
            });
            toast('AI converted your spoken answers into a digital worker profile!');
        }
    });

    /* ---------- Post a Job Form ---------- */
    document.getElementById('jobDescVoiceBtn')?.addEventListener('click', () => {
        document.getElementById('jobDescInput').value = 'My submersible water pump motor is making a humming sound and not pumping water to the overhead tank. Need someone with testing tools today.';
        toast('Voice filled problem description');
    });

    document.getElementById('postJobForm')?.addEventListener('submit', (e) => {
        e.preventDefault();
        const desc = document.getElementById('jobDescInput').value;
        const trade = document.getElementById('jobTradeSelect').options[document.getElementById('jobTradeSelect').selectedIndex].text;
        const loc = document.getElementById('jobLocInput').value;
        const when = document.getElementById('jobWhenSelect').options[document.getElementById('jobWhenSelect').selectedIndex].text;
        const budget = document.getElementById('jobBudgetInput').value;

        // Add to active jobs and to worker queue
        const newJob = {
            id: 'GS-' + Math.floor(1000 + Math.random() * 9000),
            service: `${trade} · ${desc.slice(0, 40)}...`,
            worker: 'Broadcasted to 4 nearby workers',
            loc,
            date: when,
            time: 'As Requested',
            status: 'Requested',
            price: budget
        };
        JOBS.active.unshift(newJob);

        // Also add to Worker requests
        WJOBS.new.unshift({
            id: Date.now(),
            customer: 'You (Posted Job)',
            service: `${trade} · ${desc}`,
            loc,
            date: 'Today',
            time: 'Immediate',
            pay: budget,
            km: '1.2 km',
            status: 'Requested'
        });

        toast('Job broadcasted! 4 nearby workers in Ramanagara have been notified.');
        showView('jobs');
    });

    /* ---------- Digital Work Record Download Statement ---------- */
    document.getElementById('downloadStatementBtn')?.addEventListener('click', () => {
        const statement = `
============================================================
              GIGSYNC VERIFIED DIGITAL WORK RECORD
============================================================
Worker Name: Ramesh Kumar
Primary Trade: Master Electrician
Cluster: Ramanagara, Karnataka (Tier-2/3 Regional Hub)
Aadhaar Verification: Verified (Govt UIDAI)
Total Completed Jobs: 126
Overall Customer Rating: 4.8 / 5.0
Lifetime Earnings: INR 2,48,500
Month (Aug 2026): INR 28,600 (23 Jobs)
Equipped Tools: Digital Multimeter, Impact Drill, Wire Stripper Kit

RECENT VERIFIED LOGS:
- 21 Aug 2026: Fan wiring repair (Ananya S.) -> ₹450 [PAID]
- 20 Aug 2026: Inverter battery setup (Prakash M.) -> ₹800 [PAID]
- 19 Aug 2026: Emergency fuse repair (Laxmi Store) -> ₹300 [PAID]
- 17 Aug 2026: Kitchen heavy power line (Kavya R.) -> ₹650 [PAID]

This document serves as a digital record of professional 
activity and earnings generated via the GigSync platform.
============================================================
        `.trim();

        const blob = new Blob([statement], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `GigSync_Work_Record_RameshKumar.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        toast('Digital Work & Earning Statement downloaded!');
    });

    /* ---------- Admin Sidebar Tabs ---------- */
    document.getElementById('adminSide')?.addEventListener('click', (e) => {
        const b = e.target.closest('button');
        if (!b) return;
        document.querySelectorAll('#adminSide button').forEach(x => x.classList.remove('active'));
        b.classList.add('active');
        toast(`Admin: Filtered by ${b.textContent.trim()}`);
    });

    /* ---------- Initial Setup & Chart Rendering ---------- */
    renderHome();
    renderFind();
    renderJobs();
    renderWJobs();
    renderWeek();

    renderBars('weekBars', [35, 50, 30, 75, 60, 90, 45]);
    renderBars('monthBars', [25, 40, 48, 55, 62, 78, 85, 95]);
    renderBars('adminJobBars', [45, 52, 60, 58, 75, 82, 90]);
    renderBars('adminAiBars', [30, 42, 65, 70, 85, 92, 88]);

    /* ======================================================================
       AI VOICE TELEPHONY & LIVE CALLING CONTROLLER
       ====================================================================== */
    const phoneModal = document.getElementById('phoneCallModal');
    const navPhoneBtn = document.getElementById('navPhoneCallBtn');
    const closePhoneBtn = document.getElementById('closePhoneModalBtn');
    const phoneTimerEl = document.getElementById('phoneTimer');
    const callerSpeechEl = document.getElementById('callerSpeechText');
    const aiSpeechEl = document.getElementById('aiSpeechText');
    const toolExecBadge = document.getElementById('toolExecBadge');
    const toolJsonBox = document.getElementById('toolInspectionJson');
    const callerRoleTag = document.getElementById('callerRoleTag');
    const phoneMicBtn = document.getElementById('phoneMicBtn');
    const phoneMuteBtn = document.getElementById('phoneMuteBtn');
    const phoneEndCallBtn = document.getElementById('phoneEndCallBtn');
    const customSpeechForm = document.getElementById('customCallSpeechForm');
    const customSpeechInput = document.getElementById('customSpeechInput');

    let callTimerInterval = null;
    let callSeconds = 0;
    let isCallActive = false;
    let isPhoneRecording = false;
    let speechRecognizer = null;
    let lastSpokenResponse = "Namaskara! I have updated your availability as Electrician for Tomorrow from 10:00 AM to 02:00 PM. Your status is now active in Ramanagara.";

    // Open Phone Calling Modal
    function openPhoneModal() {
        if (phoneModal) {
            phoneModal.classList.remove('hidden');
            startCallSession();
        }
    }

    function closePhoneModal() {
        if (phoneModal) {
            phoneModal.classList.add('hidden');
            endCallSession();
        }
    }

    navPhoneBtn?.addEventListener('click', openPhoneModal);
    closePhoneBtn?.addEventListener('click', closePhoneModal);

    function startCallSession() {
        isCallActive = true;
        callSeconds = 0;
        clearInterval(callTimerInterval);
        callTimerInterval = setInterval(() => {
            callSeconds++;
            const mins = String(Math.floor(callSeconds / 60)).padStart(2, '0');
            const secs = String(callSeconds % 60).padStart(2, '0');
            if (phoneTimerEl) phoneTimerEl.textContent = `${mins}:${secs}`;
        }, 1000);
    }

    function endCallSession() {
        isCallActive = false;
        clearInterval(callTimerInterval);
        if (phoneTimerEl) phoneTimerEl.textContent = '00:00';
        if (isPhoneRecording && speechRecognizer) {
            speechRecognizer.stop();
            isPhoneRecording = false;
            phoneMicBtn?.classList.remove('recording');
        }
        window.speechSynthesis?.cancel();
    }

    // Play synthesized voice output
    function speakText(text) {
        if (!('speechSynthesis' in window)) return;
        window.speechSynthesis.cancel();
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.0;
        utterance.pitch = 1.0;
        const voices = window.speechSynthesis.getVoices();
        const inVoice = voices.find(v => v.lang === 'en-IN' || v.lang.includes('IN')) || voices[0];
        if (inVoice) utterance.voice = inVoice;
        window.speechSynthesis.speak(utterance);
    }

    phoneMuteBtn?.addEventListener('click', () => {
        if (lastSpokenResponse) speakText(lastSpokenResponse);
    });

    phoneEndCallBtn?.addEventListener('click', () => {
        toast('Call disconnected.');
        endCallSession();
        setTimeout(startCallSession, 800);
    });

    // Execute Voice Turn via Backend Telephony API
    async function executeVoiceCallTurn(speechText, role = 'worker') {
        const callerPhone = role === 'worker' ? '9845011223' : '9876543210';
        if (callerSpeechEl) callerSpeechEl.textContent = `"${speechText}"`;

        try {
            const res = await fetch('http://localhost:8089/api/ai/voice-call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    callerPhone,
                    callerRole: role,
                    speechText
                })
            });

            const data = await res.json();
            if (data.status === 'success') {
                lastSpokenResponse = data.spokenResponse;
                if (aiSpeechEl) aiSpeechEl.textContent = `"${data.spokenResponse}"`;
                if (toolExecBadge) toolExecBadge.textContent = data.toolExecuted;
                if (toolJsonBox) {
                    toolJsonBox.textContent = JSON.stringify({
                        toolExecuted: data.toolExecuted,
                        toolArgs: data.toolArgs,
                        toolResult: data.toolResult,
                        db: 'gigsync.db (SQLite Database)'
                    }, null, 2);
                }

                // Speak response out loud
                speakText(data.spokenResponse);

                // Update UI data structures in real-time
                if (data.toolExecuted === 'updateWorkerAvailability') {
                    toast('⚡ SQLite Database Updated: Worker availability synced!');
                    state.workerAvailable = Boolean(data.toolArgs.isAvailable);
                    const toggle = document.getElementById('workerAvailToggle');
                    if (toggle) toggle.checked = state.workerAvailable;
                } else if (data.toolExecuted === 'createJob') {
                    toast(`🔧 SQLite Database Updated: Job ${data.toolResult.job.jobId} created!`);
                    if (JOBS.active) {
                        JOBS.active.unshift({
                            id: data.toolResult.job.jobId,
                            service: data.toolResult.job.service,
                            worker: 'Nearby Verified Technicians',
                            loc: data.toolResult.job.location,
                            date: 'Tomorrow',
                            time: '10:00 AM',
                            status: 'Confirmed',
                            price: '₹350'
                        });
                        renderJobs();
                    }
                }
            }
        } catch (err) {
            console.error('Call Turn Error:', err);
        }
    }

    // Bind Preset Chips
    document.querySelectorAll('.call-prompt-chip').forEach(btn => {
        btn.addEventListener('click', () => {
            const speech = btn.getAttribute('data-speech');
            const role = btn.getAttribute('data-role') || 'worker';
            if (role === 'worker') {
                const radio = document.getElementById('callRoleWorkerRadio');
                if (radio) radio.checked = true;
                if (callerRoleTag) callerRoleTag.textContent = 'Worker Caller';
            } else {
                const radio = document.getElementById('callRoleCustomerRadio');
                if (radio) radio.checked = true;
                if (callerRoleTag) callerRoleTag.textContent = 'Customer Caller';
            }
            executeVoiceCallTurn(speech, role);
        });
    });

    // Custom Speech Form
    customSpeechForm?.addEventListener('submit', (e) => {
        e.preventDefault();
        const text = customSpeechInput.value.trim();
        if (!text) return;
        const isWorker = document.getElementById('callRoleWorkerRadio')?.checked;
        const role = isWorker ? 'worker' : 'customer';
        executeVoiceCallTurn(text, role);
        customSpeechInput.value = '';
    });

    // Role radio change
    document.querySelectorAll('input[name="callerIdentity"]').forEach(radio => {
        radio.addEventListener('change', () => {
            const isWorker = radio.value === 'worker';
            if (callerRoleTag) callerRoleTag.textContent = isWorker ? 'Worker Caller' : 'Customer Caller';
        });
    });

    // Live Web Speech Recognition (Microphone Live Audio)
    // Continuous Line Monitor Toggle (Method 1 Hardware Bridge)
    const phoneAutoLineBtn = document.getElementById('phoneAutoLineBtn');
    const autoLineLabel = document.getElementById('autoLineLabel');
    const lineMonitorBanner = document.getElementById('lineMonitorBanner');
    let isLineMonitorActive = false;

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
        speechRecognizer = new SpeechRecognition();
        speechRecognizer.continuous = false;
        speechRecognizer.interimResults = false;
        speechRecognizer.lang = 'en-IN';

        speechRecognizer.onstart = () => {
            isPhoneRecording = true;
            phoneMicBtn?.classList.add('recording');
            if (!isLineMonitorActive) toast('🎙️ Listening to caller speech via microphone...');
        };

        speechRecognizer.onresult = (e) => {
            const transcript = e.results[0][0].transcript;
            const isWorker = document.getElementById('callRoleWorkerRadio')?.checked;
            executeVoiceCallTurn(transcript, isWorker ? 'worker' : 'customer');
        };

        speechRecognizer.onerror = (e) => {
            console.warn('Speech Recognition notice:', e.error);
            isPhoneRecording = false;
            phoneMicBtn?.classList.remove('recording');
        };

        speechRecognizer.onend = () => {
            isPhoneRecording = false;
            phoneMicBtn?.classList.remove('recording');
            // If Continuous Line Monitor is ON, automatically re-arm the listener
            if (isLineMonitorActive && isCallActive) {
                setTimeout(() => {
                    try {
                        speechRecognizer.start();
                    } catch (err) {
                        // Already started or busy
                    }
                }, 400);
            }
        };
    }

    phoneMicBtn?.addEventListener('click', () => {
        if (!speechRecognizer) {
            toast('Speech recognition not supported in this browser. Use preset chips or type speech.');
            return;
        }
        if (isPhoneRecording) {
            speechRecognizer.stop();
        } else {
            speechRecognizer.start();
        }
    });

    phoneAutoLineBtn?.addEventListener('click', () => {
        if (!speechRecognizer) {
            toast('Speech recognition not supported in this browser.');
            return;
        }
        isLineMonitorActive = !isLineMonitorActive;
        if (isLineMonitorActive) {
            phoneAutoLineBtn.style.background = '#DC2626';
            if (autoLineLabel) autoLineLabel.textContent = 'Stop Monitor';
            if (lineMonitorBanner) lineMonitorBanner.classList.remove('hidden');
            toast('🎧 Method 1 Active: Auto-listening to connected phone splitter line!');
            try { speechRecognizer.start(); } catch (err) {}
        } else {
            phoneAutoLineBtn.style.background = '#059669';
            if (autoLineLabel) autoLineLabel.textContent = 'Line Monitor';
            if (lineMonitorBanner) lineMonitorBanner.classList.add('hidden');
            toast('Line monitor stopped.');
            try { speechRecognizer.stop(); } catch (err) {}
        }
    });

    /* ======================================================================
       ADMIN 3.5MM CELLULAR HARDWARE HUB & REAL-TIME LOGS
       ====================================================================== */
    const adminStartLineBtn = document.getElementById('adminStartLineBtn');
    const adminOpenHandsetBtn = document.getElementById('adminOpenHandsetBtn');
    const refreshCallLogsBtn = document.getElementById('refreshCallLogsBtn');
    const adminLineStatusText = document.getElementById('adminLineStatusText');
    const adminCallLogsBody = document.getElementById('adminCallLogsBody');

    adminOpenHandsetBtn?.addEventListener('click', openPhoneModal);

    adminStartLineBtn?.addEventListener('click', () => {
        if (!speechRecognizer) {
            toast('Speech recognition not supported in this browser.');
            return;
        }
        isLineMonitorActive = !isLineMonitorActive;
        if (isLineMonitorActive) {
            adminStartLineBtn.innerHTML = '<i class="fa-solid fa-pause"></i> <span>Stop 3.5mm Monitor</span>';
            adminStartLineBtn.style.background = '#DC2626';
            if (adminLineStatusText) adminLineStatusText.innerHTML = '🟢 <strong>3.5mm Cellular Line Active:</strong> Listening to Phone Audio Jack on this laptop...';
            toast('🎧 3.5mm Cellular Audio Gateway LIVE on this laptop!');
            try { speechRecognizer.start(); } catch (err) {}
        } else {
            adminStartLineBtn.innerHTML = '<i class="fa-solid fa-microphone"></i> <span>Start 3.5mm Line Monitor</span>';
            adminStartLineBtn.style.background = '#D97706';
            if (adminLineStatusText) adminLineStatusText.textContent = '3.5mm Hardware Monitor Standby · Ready to process calls on any laptop';
            toast('3.5mm Line Monitor paused.');
            try { speechRecognizer.stop(); } catch (err) {}
        }
    });

    async function fetchAndRenderCallLogs() {
        if (!adminCallLogsBody) return;
        try {
            const res = await fetch('http://localhost:8089/api/call-logs');
            const data = await res.json();
            if (data.status === 'success' && data.logs && data.logs.length > 0) {
                adminCallLogsBody.innerHTML = data.logs.map(l => `
                    <tr style="border-bottom:1px solid var(--gs-line)">
                        <td style="padding:10px"><b>+91 ${l.caller_phone}</b><br><span class="pill ${l.caller_role === 'worker' ? 'pill-blue' : 'pill-green'}" style="font-size:10px">${l.caller_role}</span></td>
                        <td style="padding:10px;max-width:320px">${l.transcript}</td>
                        <td style="padding:10px"><span class="pill pill-amber">${l.intent_detected || 'Tool Executed'}</span></td>
                        <td style="padding:10px">${l.duration_seconds || 24}s</td>
                        <td style="padding:10px"><span class="pill pill-green">${l.status || 'Completed'}</span></td>
                    </tr>
                `).join('');
            }
        } catch (err) {
            console.warn('Call logs fetch:', err.message);
        }
    }

    refreshCallLogsBtn?.addEventListener('click', () => {
        fetchAndRenderCallLogs();
        toast('Call logs updated from SQLite database!');
    });

    // Auto-fetch logs when in admin mode
    if (state.mode === 'admin') {
        fetchAndRenderCallLogs();
    }
});

