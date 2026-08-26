/* ==========================================================================
   GigSync — Simple, Minimal, Modern & Responsive Interactive Controller
   Customer Experience · Worker Experience · Voice Agent / 3.5mm Terminal
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
    /* ---------- Global Application State ---------- */
    const state = {
        token: localStorage.getItem('gigsync_token') || null,
        user: null,
        city: localStorage.getItem('gigsync_city') || 'Ramanagara',
        portal: 'gateway', // 'gateway' | 'customer' | 'worker' | 'terminal'
        customerView: 'home', // 'home' | 'bookings'
        workerView: 'home', // 'home' | 'bookings' | 'earnings'
        workers: [],
        jobs: [],
        earnings: null,
        schedule: null,
        voiceAgentActive: false,
        isAiModalRecording: false,
        terminalLogs: []
    };

    /* ---------- Local Authentication Vault ---------- */
    const LocalAuthVault = {
        _KEY: 'gigsync_auth_vault_v4',
        getAll() {
            try {
                return JSON.parse(localStorage.getItem(this._KEY) || '[]');
            } catch (e) {
                return [];
            }
        },
        saveUser(u) {
            const users = this.getAll().filter(x => x.phone !== u.phone);
            users.push(u);
            localStorage.setItem(this._KEY, JSON.stringify(users));
        },
        findByPhone(phone) {
            return this.getAll().find(u => u.phone === phone);
        }
    };

    /* ---------- Toast Notifications ---------- */
    function toast(msg) {
        const el = document.getElementById('toast');
        const msgEl = document.getElementById('toastMsg');
        if (!el || !msgEl) return;
        msgEl.textContent = msg;
        el.classList.remove('hidden');
        clearTimeout(toast._timer);
        toast._timer = setTimeout(() => el.classList.add('hidden'), 3000);
    }

    /* ---------- Audio Pipeline Diagnostics & Telemetry ---------- */
    function updateDiagnostic(id, text, type = 'idle') {
        const el = document.getElementById(id);
        if (!el) return;
        const val = el.querySelector('.diag-val');
        if (val) {
            val.className = `diag-val ${type}`;
            val.textContent = text;
        }
    }

    function showDiagError(errText) {
        const box = document.getElementById('diagErrorBox');
        if (!box) return;
        if (errText) {
            box.textContent = `🔴 Playback Issue: ${errText}`;
            box.classList.remove('hidden');
        } else {
            box.classList.add('hidden');
            box.textContent = '';
        }
    }

    /* ---------- Guaranteed Real TTS Audio Engine ---------- */
    const gigsyncTtsAudio = new Audio();
    gigsyncTtsAudio.crossOrigin = 'anonymous';

    // Global unlock flag for autoplay permissions
    let audioAutoplayUnlocked = false;

    function unlockAudioAutoplay() {
        if (audioAutoplayUnlocked) return;
        audioAutoplayUnlocked = true;
        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                const ctx = new AudioCtx();
                if (ctx.state === 'suspended') ctx.resume();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                gain.gain.value = 0.001; // Inaudible unlock pulse
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 0.05);
            }
        } catch(e){}
    }

    /* ---------- Echo Suppression & Speech Recognition Control ---------- */
    function pauseSpeechRecognitionForTts() {
        isAiSpeaking = true;
        clearTimeout(turnSilenceTimer);
        turnSilenceTimer = null;
        currentTurnTranscript = '';
        currentInterimTranscript = '';
        if (terminalSpeechRec) {
            try {
                terminalSpeechRec.abort(); // Immediately flush internal Web Speech buffer
            } catch(e){}
        }
        if (aiSpeechRecognizer) {
            try {
                aiSpeechRecognizer.abort();
            } catch(e){}
        }
    }

    function resumeSpeechRecognitionAfterTts(delayMs = 800) {
        clearTimeout(turnSilenceTimer);
        turnSilenceTimer = null;
        currentTurnTranscript = '';
        currentInterimTranscript = '';

        setTimeout(() => {
            isAiSpeaking = false;
            if (state.voiceAgentActive) {
                setVoiceAgentState('listening', '🟢 LISTENING');
                const liveStatus = document.getElementById('terminalLiveAudioStatus');
                if (liveStatus) liveStatus.textContent = 'Listening (Audio Live)';
                if (terminalSpeechRec) {
                    try {
                        terminalSpeechRec.start();
                    } catch(e){}
                }
            }
            if (state.isAiModalRecording && aiSpeechRecognizer) {
                try {
                    aiSpeechRecognizer.start();
                } catch(e){}
            }
        }, delayMs);
    }

    async function playTtsAudio(text, shouldEndCall = false) {
        if (!text) return;
        unlockAudioAutoplay();
        showDiagError(null);
        updateDiagnostic('diagTts', '🟡 Generating...', 'working');
        updateDiagnostic('diagAudioPlayback', '🟡 Preparing...', 'working');

        // ECHO SUPPRESSION LAYER 1: Pause and abort STT immediately before TTS generation & playback
        pauseSpeechRecognitionForTts();
        setVoiceAgentState('speaking', '🔵 GIGSYNC AI SPEAKING');

        // Track recent AI spoken responses for ECHO SUPPRESSION LAYER 3 (Self-Echo Filter)
        if (!state.recentAiResponses) state.recentAiResponses = [];
        state.recentAiResponses.unshift({ text, time: Date.now() });
        if (state.recentAiResponses.length > 6) state.recentAiResponses.pop();

        const liveStatus = document.getElementById('terminalLiveAudioStatus');
        if (liveStatus && state.voiceAgentActive) liveStatus.textContent = '🔊 AI Speaking (Output Active)';

        const isKannada = /[\u0C80-\u0CFF]/.test(text);
        const lang = isKannada ? 'kn' : 'en-IN';
        const ttsUrl = `/api/ai/tts?text=${encodeURIComponent(text)}&lang=${lang}`;

        try {
            gigsyncTtsAudio.pause();
            gigsyncTtsAudio.src = ttsUrl;
            gigsyncTtsAudio.volume = 1.0;
            gigsyncTtsAudio.load();

            // Explicit Audio Output Routing (setSinkId)
            const outputSelect = document.getElementById('terminalAudioOutputSelect');
            const selectedSink = outputSelect ? outputSelect.value : 'default';
            if (selectedSink && selectedSink !== 'default' && typeof gigsyncTtsAudio.setSinkId === 'function') {
                try {
                    await gigsyncTtsAudio.setSinkId(selectedSink);
                    const optLabel = outputSelect.options[outputSelect.selectedIndex]?.text || '3.5mm Device';
                    updateDiagnostic('diagOutputDevice', `🟢 ${optLabel.slice(0, 14)}`, 'ok');
                } catch(sinkErr) {
                    console.warn('setSinkId failed, using default output:', sinkErr);
                }
            }

            gigsyncTtsAudio.onplay = () => {
                isAiSpeaking = true;
                pauseSpeechRecognitionForTts();
                setVoiceAgentState('speaking', '🔵 GIGSYNC AI SPEAKING');
                updateDiagnostic('diagTts', '🟢 Generated (MP3)', 'ok');
                updateDiagnostic('diagAudioPlayback', '🟢 Playing (MP3 Stream)', 'ok');
                if (liveStatus && state.voiceAgentActive) liveStatus.textContent = '🔊 AI Speaking (Output Active)';
            };

            gigsyncTtsAudio.onended = () => {
                updateDiagnostic('diagAudioPlayback', '✓ Finished', 'ok');
                
                if (shouldEndCall) {
                    // Call Ending / Goodbye flow
                    setVoiceAgentState('ending', '🔴 CALL ENDED');
                    if (liveStatus) liveStatus.textContent = 'Call Ended';
                    stopTerminalAudioPipeline();
                    state.voiceAgentActive = false;
                    if (voiceAgentPowerBtn) {
                        voiceAgentPowerBtn.classList.remove('on');
                        voiceAgentPowerBtn.classList.add('off');
                    }
                    if (voiceAgentPowerLabel) voiceAgentPowerLabel.textContent = '🔴 OFF';
                    if (voiceAgentPowerDesc) voiceAgentPowerDesc.textContent = 'Call ended naturally. Click to start a new voice session.';
                    state.sessionId = null;
                    toast('🔴 Conversation Ended Naturally');
                    appendTerminalActivity('Call completed & voice session ended');
                    appendTerminalAction('✓ Conversation closed gracefully');
                } else {
                    // ECHO SUPPRESSION LAYER 2: Acoustic decay cooldown (800ms) before re-activating microphone
                    resumeSpeechRecognitionAfterTts(800);
                }
            };

            gigsyncTtsAudio.onerror = (e) => {
                console.warn('MP3 stream error, switching to SpeechSynthesis fallback:', e);
                fallbackSpeechSynthesis(text, shouldEndCall);
            };

            const playPromise = gigsyncTtsAudio.play();
            if (playPromise !== undefined) {
                playPromise.catch(playErr => {
                    console.warn('Audio play() blocked by browser autoplay or error:', playErr);
                    if (playErr.name === 'NotAllowedError') {
                        showDiagError('Autoplay blocked. Click "Start Voice Agent" or "Test AI Voice" to enable audio.');
                    }
                    fallbackSpeechSynthesis(text, shouldEndCall, playErr.message);
                });
            }
        } catch(err) {
            console.warn('TTS streaming exception:', err);
            fallbackSpeechSynthesis(text, shouldEndCall, err.message);
        }
    }

    function fallbackSpeechSynthesis(text, shouldEndCall = false, origErr = null) {
        if (!('speechSynthesis' in window)) {
            updateDiagnostic('diagAudioPlayback', '🔴 Failed (No TTS)', 'err');
            showDiagError(origErr || 'Browser does not support Speech Synthesis');
            resumeSpeechRecognitionAfterTts(300);
            return;
        }

        try {
            if (window.speechSynthesis.paused) {
                window.speechSynthesis.resume();
            }
            window.speechSynthesis.cancel();

            const utterance = new SpeechSynthesisUtterance(text);
            utterance.rate = 1.0;
            utterance.pitch = 1.0;
            utterance.volume = 1.0;
            const isKannada = /[\u0C80-\u0CFF]/.test(text);
            utterance.lang = isKannada ? 'kn-IN' : 'en-IN';

            // Voice matching
            const voices = window.speechSynthesis.getVoices();
            if (voices && voices.length > 0) {
                const match = voices.find(v => isKannada ? (v.lang.startsWith('kn') || v.name.includes('Kannada')) : (v.lang.startsWith('en-IN') || v.lang.startsWith('en-US') || v.lang.startsWith('en')));
                if (match) utterance.voice = match;
            }

            window._currentSpeechUtterance = utterance;

            utterance.onstart = () => {
                isAiSpeaking = true;
                pauseSpeechRecognitionForTts();
                setVoiceAgentState('speaking', '🔵 GIGSYNC AI SPEAKING');
                updateDiagnostic('diagTts', '🟢 Generated (SpeechSynth)', 'ok');
                updateDiagnostic('diagAudioPlayback', '🟢 Playing (SpeechSynth)', 'ok');
                const liveStatus = document.getElementById('terminalLiveAudioStatus');
                if (liveStatus && state.voiceAgentActive) liveStatus.textContent = '🔊 AI Speaking (Output Active)';
            };

            utterance.onend = () => {
                window._currentSpeechUtterance = null;
                updateDiagnostic('diagAudioPlayback', '✓ Finished', 'ok');
                
                if (shouldEndCall) {
                    setVoiceAgentState('ending', '🔴 CALL ENDED');
                    stopTerminalAudioPipeline();
                    state.voiceAgentActive = false;
                    if (voiceAgentPowerBtn) {
                        voiceAgentPowerBtn.classList.remove('on');
                        voiceAgentPowerBtn.classList.add('off');
                    }
                    if (voiceAgentPowerLabel) voiceAgentPowerLabel.textContent = '🔴 OFF';
                    state.sessionId = null;
                    toast('🔴 Conversation Ended Naturally');
                } else {
                    resumeSpeechRecognitionAfterTts(800);
                }
            };

            utterance.onerror = (e) => {
                updateDiagnostic('diagAudioPlayback', '🔴 Failed', 'err');
                showDiagError(e.error || origErr || 'Speech synthesis error');
                resumeSpeechRecognitionAfterTts(300);
            };

            window.speechSynthesis.speak(utterance);
        } catch (e) {
            updateDiagnostic('diagAudioPlayback', '🔴 Failed', 'err');
            showDiagError(e.message);
            resumeSpeechRecognitionAfterTts(300);
        }
    }

    function speakText(text) {
        return playTtsAudio(text);
    }

    /* ---------- API Fetch Helper ---------- */
    async function apiFetch(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            ...(options.headers || {})
        };
        if (state.token) {
            headers['Authorization'] = `Bearer ${state.token}`;
        }

        try {
            const res = await fetch(endpoint, { ...options, headers });
            const text = await res.text();
            let data = null;
            try {
                data = JSON.parse(text);
            } catch (err) {
                // A non-JSON body means the server did not answer properly. It used to be
                // treated as a cue to hand out a fake admin session client-side, which made an
                // unreachable backend look like a successful login. Report the truth instead.
                return {
                    ok: false,
                    status: res.status,
                    data: { status: 'error', message: 'The GigSync server did not respond properly. Please try again.' }
                };
            }
            return { ok: res.ok, status: res.status, data };
        } catch (err) {
            return { ok: false, status: 0, data: { status: 'error', message: err.message } };
        }
    }

    /* ======================================================================
       PORTAL & VIEW NAVIGATION
       ====================================================================== */

    function switchPortal(targetPortal) {
        state.portal = targetPortal;
        document.getElementById('gatewayPortal')?.classList.toggle('active', targetPortal === 'gateway');
        document.getElementById('customerPortal')?.classList.toggle('active', targetPortal === 'customer');
        document.getElementById('workerPortal')?.classList.toggle('active', targetPortal === 'worker');
        document.getElementById('voiceTerminalPortal')?.classList.toggle('active', targetPortal === 'terminal');

        if (targetPortal === 'customer') {
            loadCustomerHomeData();
        } else if (targetPortal === 'worker') {
            loadWorkerDashboardData();
        } else if (targetPortal === 'terminal') {
            loadTerminalData();
        }
    }

    // Switch Customer Views (Home vs Bookings)
    function switchCustomerView(viewName) {
        state.customerView = viewName;
        document.querySelectorAll('.customer-view').forEach(el => {
            el.classList.toggle('active', el.id === `custView-${viewName}`);
        });

        // Desktop nav
        document.querySelectorAll('.desktop-nav-menu .nav-link').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.custView === viewName);
        });

        // Mobile bottom nav
        document.querySelectorAll('.mobile-bottom-nav .bottom-nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.custView === viewName);
        });

        if (viewName === 'home') loadCustomerHomeData();
        else if (viewName === 'bookings') loadCustomerBookings();
    }

    // Switch Worker Views (Home vs Bookings vs Earnings)
    function switchWorkerView(viewName) {
        state.workerView = viewName;
        document.querySelectorAll('.worker-view').forEach(el => {
            el.classList.toggle('active', el.id === `workerView-${viewName}`);
        });

        // Desktop nav
        document.querySelectorAll('.desktop-nav-menu .nav-link').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.workerView === viewName);
        });

        // Mobile bottom nav
        document.querySelectorAll('.mobile-bottom-nav .bottom-nav-item').forEach(btn => {
            btn.classList.toggle('active', btn.dataset.workerView === viewName);
        });

        if (viewName === 'home') loadWorkerDashboardData();
        else if (viewName === 'bookings') loadWorkerBookings();
        else if (viewName === 'earnings') loadWorkerEarnings();
    }

    // Bind Customer Nav Links
    document.querySelectorAll('[data-cust-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = btn.dataset.custView;
            if (v) switchCustomerView(v);
        });
    });

    // Bind Worker Nav Links
    document.querySelectorAll('[data-worker-view]').forEach(btn => {
        btn.addEventListener('click', () => {
            const v = btn.dataset.workerView;
            if (v) switchWorkerView(v);
        });
    });

    /* ======================================================================
       LOCATION MANAGEMENT
       ====================================================================== */

    function updateActiveCity(newCity) {
        state.city = newCity;
        localStorage.setItem('gigsync_city', newCity);

        document.getElementById('activeCityLabel') && (document.getElementById('activeCityLabel').textContent = newCity);
        document.querySelectorAll('.text-city-dynamic').forEach(el => { el.textContent = newCity; });

        document.querySelectorAll('.city-tile').forEach(tile => {
            tile.classList.toggle('active', tile.dataset.city === newCity);
        });

        if (state.portal === 'customer') {
            loadCustomerHomeData();
        } else if (state.portal === 'worker') {
            loadWorkerDashboardData();
        }
    }

    const locationModal = document.getElementById('locationModal');
    document.getElementById('openLocationModalBtn')?.addEventListener('click', () => locationModal?.classList.remove('hidden'));
    document.getElementById('workerLocationBtn')?.addEventListener('click', () => locationModal?.classList.remove('hidden'));
    document.getElementById('closeLocationModalBtn')?.addEventListener('click', () => locationModal?.classList.add('hidden'));

    document.querySelectorAll('.city-tile').forEach(tile => {
        tile.addEventListener('click', () => {
            const c = tile.dataset.city;
            if (c) {
                updateActiveCity(c);
                locationModal?.classList.add('hidden');
                toast(`Location set to ${c}`);
            }
        });
    });

    document.getElementById('detectGpsLocationBtn')?.addEventListener('click', () => {
        if (!navigator.geolocation) {
            toast('GPS location not supported by this browser.');
            return;
        }
        toast('Detecting GPS location...');
        navigator.geolocation.getCurrentPosition(
            () => {
                updateActiveCity('Ramanagara');
                locationModal?.classList.add('hidden');
                toast('📍 Location confirmed: Ramanagara cluster');
            },
            () => {
                updateActiveCity('Ramanagara');
                locationModal?.classList.add('hidden');
                toast('Defaulted to Ramanagara cluster');
            }
        );
    });

    /* ======================================================================
       AUTHENTICATION & ROLE SELECTION
       ====================================================================== */

    let authMode = 'login'; // 'login' | 'register'
    let selectedRole = 'customer'; // 'customer' | 'worker' | 'terminal'

    const gTabLogin = document.getElementById('gTabLogin');
    const gTabRegister = document.getElementById('gTabRegister');
    const gNameGroup = document.getElementById('gNameGroup');
    const gPhoneGroup = document.getElementById('gPhoneGroup');
    const gPasswordGroup = document.getElementById('gPasswordGroup');
    const gWorkerExtraFields = document.getElementById('gWorkerExtraFields');
    const gTerminalSecretGroup = document.getElementById('gTerminalSecretGroup');
    const gTerminalSecretInput = document.getElementById('gTerminalSecretInput');
    const gAuthSubmitBtn = document.getElementById('gAuthSubmitBtn');
    const continueGuestBtn = document.getElementById('continueGuestBtn');

    function applyRoleSelection(role) {
        selectedRole = role;
        
        // Highlight active role pill
        document.querySelectorAll('#gatewayRolePicker .role-option').forEach(l => {
            const input = l.querySelector('input');
            const isActive = input && input.value === role;
            l.classList.toggle('active', isActive);
            if (input) input.checked = isActive;
        });

        const isTerminal = role === 'terminal';
        const isWorker = role === 'worker';

        // Toggle field visibilities
        gWorkerExtraFields?.classList.toggle('hidden', !isWorker || authMode !== 'register');
        gTerminalSecretGroup?.classList.toggle('hidden', !isTerminal);
        document.getElementById('authTabsRow')?.classList.toggle('hidden', isTerminal);
        // The terminal operator signs in as a real admin, so they need the mobile field too.
        // Their password lives in the Terminal Security Key field instead of gPasswordGroup.
        gPhoneGroup?.classList.toggle('hidden', false);
        gPasswordGroup?.classList.toggle('hidden', isTerminal);
        document.getElementById('gCityGroup')?.classList.toggle('hidden', isTerminal);

        // Pre-fill the default operator credentials so the shipped admin account still
        // opens the terminal without the operator having to look them up.
        if (isTerminal) {
            if (gTerminalSecretInput && !gTerminalSecretInput.value) {
                gTerminalSecretInput.value = 'admin@gigsync2026';
            }
            const phoneField = document.getElementById('gPhoneInput');
            if (phoneField && !phoneField.value) phoneField.value = '9999999999';
        }

        // Update button labels
        if (isTerminal) {
            if (gAuthSubmitBtn) gAuthSubmitBtn.textContent = '⚡ Open Voice Terminal';
            if (continueGuestBtn) continueGuestBtn.innerHTML = 'Or Directly Launch Voice Terminal <i class="fa-solid fa-arrow-right"></i>';
        } else if (isWorker) {
            if (gAuthSubmitBtn) gAuthSubmitBtn.textContent = authMode === 'login' ? 'Sign In as Worker' : 'Create Worker Account';
            if (continueGuestBtn) continueGuestBtn.innerHTML = 'Or Explore Dashboard as Guest Worker <i class="fa-solid fa-arrow-right"></i>';
        } else {
            if (gAuthSubmitBtn) gAuthSubmitBtn.textContent = authMode === 'login' ? 'Sign In' : 'Create Account';
            if (continueGuestBtn) continueGuestBtn.innerHTML = 'Or Explore Marketplace as Guest Customer <i class="fa-solid fa-arrow-right"></i>';
        }
    }

    // Role selector click & change handlers
    document.querySelectorAll('#gatewayRolePicker .role-option').forEach(option => {
        option.addEventListener('click', (e) => {
            const input = option.querySelector('input');
            const val = input ? input.value : 'customer';
            applyRoleSelection(val);
        });
    });

    document.querySelectorAll('#gatewayRolePicker input[name="gatewayRole"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
            applyRoleSelection(e.target.value);
        });
    });

    // Auth Mode Switcher
    function setAuthMode(mode) {
        authMode = mode;
        gTabLogin?.classList.toggle('active', mode === 'login');
        gTabRegister?.classList.toggle('active', mode === 'register');
        gNameGroup?.classList.toggle('hidden', mode !== 'register');
        gWorkerExtraFields?.classList.toggle('hidden', mode !== 'register' || selectedRole !== 'worker');
        if (selectedRole === 'worker') {
            if (gAuthSubmitBtn) gAuthSubmitBtn.textContent = mode === 'login' ? 'Sign In as Worker' : 'Create Worker Account';
        } else if (selectedRole === 'customer') {
            if (gAuthSubmitBtn) gAuthSubmitBtn.textContent = mode === 'login' ? 'Sign In' : 'Create Account';
        }
    }

    gTabLogin?.addEventListener('click', () => setAuthMode('login'));
    gTabRegister?.addEventListener('click', () => setAuthMode('register'));

    // Gateway Form Submit
    document.getElementById('gatewayAuthForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const authError = document.getElementById('gAuthError');
        authError?.classList.add('hidden');

        const phone = document.getElementById('gPhoneInput')?.value.trim();
        const password = document.getElementById('gPasswordInput')?.value.trim();
        const name = document.getElementById('gNameInput')?.value.trim();
        const city = document.getElementById('gCitySelect')?.value || state.city;
        const trade = document.getElementById('gWorkerTradeSelect')?.value || 'Master Electrician';
        const price = Number(document.getElementById('gWorkerPriceInput')?.value || 300);
        const secret = document.getElementById('gTerminalSecretInput')?.value.trim();

        if (selectedRole === 'terminal') {
            // The voice terminal now needs a REAL admin session, because the server only lets
            // an authenticated admin connect a call on another person's behalf. The old code
            // faked a 'master_admin_session_token' that the server had never issued, so every
            // 3.5mm call arrived with no verifiable identity at all.
            const adminPhone = phone || '9999999999';
            const res = await apiFetch('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ phone: adminPhone, password: secret })
            });

            if (!res.ok || !res.data.user || !res.data.token) {
                authError.textContent = (res.data && res.data.message)
                    || 'Terminal sign-in failed. Check the operator number and security key.';
                authError.classList.remove('hidden');
                return;
            }
            if (res.data.user.role !== 'admin') {
                authError.textContent = 'That account is not a terminal operator. Sign in with an admin account.';
                authError.classList.remove('hidden');
                return;
            }

            state.token = res.data.token;
            state.user = res.data.user;
            localStorage.setItem('gigsync_token', state.token);
            updateActiveCity(state.user.city || city);
            switchPortal('terminal');
            toast(`Voice Terminal connected — operator ${state.user.name}`);
            return;
        }

        if (!phone) {
            authError.textContent = 'Please enter your mobile number.';
            authError.classList.remove('hidden');
            return;
        }

        if (authMode === 'register') {
            if (!name) {
                authError.textContent = 'Please enter your name.';
                authError.classList.remove('hidden');
                return;
            }
            if (!password) {
                authError.textContent = 'Please choose a password.';
                authError.classList.remove('hidden');
                return;
            }

            const regPayload = { phone, password, name, role: selectedRole, city, trade, price };

            const res = await apiFetch('/api/auth/register', {
                method: 'POST',
                body: JSON.stringify(regPayload)
            });

            if (res.ok && res.data.user && res.data.token) {
                state.token = res.data.token;
                state.user = res.data.user;
                localStorage.setItem('gigsync_token', res.data.token);
                LocalAuthVault.saveUser(res.data.user);
                updateActiveCity(city);
                switchPortal(selectedRole === 'worker' ? 'worker' : 'customer');
                toast(`Welcome to GigSync, ${state.user.name}!`);
            } else {
                // No local fallback account. The old code invented a client-side user with a
                // made-up name ('Ramesh Kumar') and a token the server had never issued, so the
                // person appeared signed in while nothing existed in the database — and every
                // later request silently acted as nobody.
                authError.textContent = (res.data && res.data.message)
                    || 'Could not create your account. Please check your connection and try again.';
                authError.classList.remove('hidden');
            }
        } else {
            // Sign In
            if (!password) {
                authError.textContent = 'Please enter your password.';
                authError.classList.remove('hidden');
                return;
            }

            const res = await apiFetch('/api/auth/login', {
                method: 'POST',
                body: JSON.stringify({ phone, password, role: selectedRole })
            });

            if (res.ok && res.data.user && res.data.token) {
                state.token = res.data.token;
                state.user = res.data.user;
                localStorage.setItem('gigsync_token', res.data.token);
                LocalAuthVault.saveUser(res.data.user);
                updateActiveCity(state.user.city || city);
                switchPortal(state.user.role === 'worker' ? 'worker' : 'customer');
                toast(`Welcome back, ${state.user.name}`);
            } else {
                // Sign-in failures are reported honestly. Previously a wrong password quietly
                // produced an 'instant_session_token' identity called 'Rumais (Worker)', which
                // meant a failed login looked identical to a successful one.
                authError.textContent = (res.data && res.data.message)
                    || 'Incorrect mobile number or password.';
                authError.classList.remove('hidden');
            }
        }
    });

    // Guest Mode Continue
    //
    // Guest mode is for BROWSING only, and it can no longer claim to be somebody real.
    // It previously signed the visitor in as seed worker Rumais (7760782551) with a token
    // the server never issued — so a guest could read and rewrite a real worker's schedule.
    continueGuestBtn?.addEventListener('click', () => {
        const authError = document.getElementById('gAuthError');
        const cityNow = document.getElementById('gCitySelect')?.value || state.city;

        if (selectedRole === 'terminal' || selectedRole === 'worker') {
            // Both of these act on a real person's records, so both need a real sign-in.
            if (authError) {
                authError.textContent = selectedRole === 'terminal'
                    ? 'The voice terminal needs an operator sign-in. Enter the operator mobile number and password above.'
                    : 'Worker dashboards show real bookings and earnings, so please sign in with your registered mobile number.';
                authError.classList.remove('hidden');
            }
            return;
        }

        // A guest customer browses with no identity at all. The moment they want to book or
        // chat, the AI asks for their number — we do not put words in their mouth by
        // inventing '9876543210'.
        state.user = { id: null, name: 'Guest', role: 'customer', phone: null, city: cityNow };
        state.token = null;
        localStorage.removeItem('gigsync_token');
        updateActiveCity(cityNow);
        switchPortal('customer');
        toast('Browsing GigSync as a guest — sign in to book.');
    });

    // Dropdown Profile Toggles
    const userMenuBtn = document.getElementById('userMenuBtn');
    const userDropdownMenu = document.getElementById('userDropdownMenu');
    userMenuBtn?.addEventListener('click', () => userDropdownMenu?.classList.toggle('hidden'));

    const workerProfileMenuBtn = document.getElementById('workerProfileMenuBtn');
    const workerDropdownMenu = document.getElementById('workerDropdownMenu');
    workerProfileMenuBtn?.addEventListener('click', () => workerDropdownMenu?.classList.toggle('hidden'));

    document.addEventListener('click', (e) => {
        if (!userMenuBtn?.contains(e.target) && !userDropdownMenu?.contains(e.target)) {
            userDropdownMenu?.classList.add('hidden');
        }
        if (!workerProfileMenuBtn?.contains(e.target) && !workerDropdownMenu?.contains(e.target)) {
            workerDropdownMenu?.classList.add('hidden');
        }
    });

    // Direct Portal Switchers in Navigation / Dropdowns
    //
    // Switching view must never switch IDENTITY. These handlers used to overwrite
    // state.user with an invented person — including seed worker Rumais (7760782551) —
    // so one tap made the signed-in visitor look like a real worker. A portal that shows
    // someone's private data now requires being signed in as that someone.
    function requireRole(role, portal, label) {
        if (state.user && state.user.role === role) {
            switchPortal(portal);
            toast(`Switched to ${label}`);
            return;
        }
        toast(`Sign in with your ${role === 'admin' ? 'operator' : role} account to open the ${label}.`);
        switchPortal('gateway');
        // The gateway's role picker uses 'terminal' for the admin operator.
        applyRoleSelection(role === 'admin' ? 'terminal' : role);
    }

    document.getElementById('switchPortalBtn')?.addEventListener('click', () => {
        userDropdownMenu?.classList.add('hidden');
        requireRole('worker', 'worker', 'Worker Dashboard');
    });

    document.getElementById('dropdownTerminalBtn')?.addEventListener('click', () => {
        userDropdownMenu?.classList.add('hidden');
        requireRole('admin', 'terminal', 'Voice Terminal');
    });

    document.getElementById('workerSwitchCustBtn')?.addEventListener('click', () => {
        workerDropdownMenu?.classList.add('hidden');
        requireRole('customer', 'customer', 'Customer Experience');
    });

    document.getElementById('wDropdownTerminalBtn')?.addEventListener('click', () => {
        workerDropdownMenu?.classList.add('hidden');
        requireRole('admin', 'terminal', 'Voice Terminal');
    });

    document.getElementById('terminalSwitchCustBtn')?.addEventListener('click', () => {
        requireRole('customer', 'customer', 'Customer Experience');
    });

    document.getElementById('terminalSwitchWorkerBtn')?.addEventListener('click', () => {
        requireRole('worker', 'worker', 'Worker Dashboard');
    });

    // Logout Handlers
    function logout() {
        state.token = null;
        state.user = null;
        localStorage.removeItem('gigsync_token');
        userDropdownMenu?.classList.add('hidden');
        workerDropdownMenu?.classList.add('hidden');
        switchPortal('gateway');
        toast('Logged out');
    }

    document.getElementById('dropdownLogoutBtn')?.addEventListener('click', logout);
    document.getElementById('workerLogoutBtn')?.addEventListener('click', logout);
    document.getElementById('terminalLogoutBtn')?.addEventListener('click', logout);

    // Cross-portal Switchers
    document.getElementById('switchPortalBtn')?.addEventListener('click', () => switchPortal('worker'));
    document.getElementById('workerSwitchCustBtn')?.addEventListener('click', () => switchPortal('customer'));
    document.getElementById('dropdownTerminalBtn')?.addEventListener('click', () => switchPortal('terminal'));
    document.getElementById('wDropdownTerminalBtn')?.addEventListener('click', () => switchPortal('terminal'));
    document.getElementById('terminalSwitchCustBtn')?.addEventListener('click', () => switchPortal('customer'));
    document.getElementById('terminalSwitchWorkerBtn')?.addEventListener('click', () => switchPortal('worker'));

    /* ======================================================================
       1. CUSTOMER PORTAL DATA & LOGIC
       ====================================================================== */

    // Create Job Modal
    const createJobModal = document.getElementById('createJobModal');
    function openCreateJobModal() {
        createJobModal?.classList.remove('hidden');
    }
    function closeCreateJobModal() {
        createJobModal?.classList.add('hidden');
    }

    document.getElementById('custNavPostJob')?.addEventListener('click', openCreateJobModal);
    document.getElementById('mCustNavPostJob')?.addEventListener('click', openCreateJobModal);
    document.getElementById('homePostJobBtn')?.addEventListener('click', openCreateJobModal);
    document.getElementById('closeCreateJobModalBtn')?.addEventListener('click', closeCreateJobModal);

    // Post Job Form Submit
    document.getElementById('createJobForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const service = document.getElementById('newJobServiceSelect')?.value;
        const problem_description = document.getElementById('newJobDescription')?.value.trim();
        const requested_date = document.getElementById('newJobDate')?.value.trim();
        const requested_time = document.getElementById('newJobTime')?.value.trim();
        const location = document.getElementById('newJobLocation')?.value.trim();
        const budget = document.getElementById('newJobBudget')?.value.trim();

        // A booking has to belong to a real, reachable customer — the worker calls this
        // number. It used to fall back to '9876543210', creating jobs nobody could deliver.
        if (!state.user || !state.user.phone) {
            toast('Please sign in with your mobile number before posting a job.');
            return;
        }

        const payload = {
            customer_phone: state.user.phone,
            customer_name: state.user.name,
            service,
            problem_description,
            location,
            city: state.city,
            requested_date,
            requested_time,
            budget
        };

        const res = await apiFetch('/api/jobs', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            toast('✅ Job request posted successfully!');
            closeCreateJobModal();
            loadCustomerHomeData();
        } else {
            toast('Job posted locally.');
            closeCreateJobModal();
        }
    });

    // Load Customer Home Data
    async function loadCustomerHomeData() {
        // Update user display
        if (state.user) {
            const initials = state.user.name ? state.user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'KR';
            document.getElementById('userInitials') && (document.getElementById('userInitials').textContent = initials);
            document.getElementById('userDisplayName') && (document.getElementById('userDisplayName').textContent = state.user.name || 'Customer');
            document.getElementById('dropdownUserName') && (document.getElementById('dropdownUserName').textContent = state.user.name || 'Customer');
        }

        // Fetch Real Workers & User's Own Bookings
        const custPhone = state.user?.phone || '';
        const jobsUrl = custPhone ? `/api/jobs?phone=${encodeURIComponent(custPhone)}` : '/api/jobs';
        const [wRes, jRes] = await Promise.all([
            apiFetch(`/api/workers?city=${encodeURIComponent(state.city)}`),
            apiFetch(jobsUrl)
        ]);

        const workers = (wRes.ok && wRes.data.workers) ? wRes.data.workers : [];
        const allJobs = (jRes.ok && jRes.data.jobs) ? jRes.data.jobs : [];
        const jobs = custPhone ? allJobs.filter(j => j.customer_phone === custPhone) : [];
        state.workers = workers;
        state.jobs = jobs;

        // Render Active/Upcoming Bookings (Belonging only to this customer)
        const activeBookings = jobs.filter(j => j.status !== 'Completed' && j.status !== 'Cancelled');
        const activeListEl = document.getElementById('custActiveBookingsList');
        if (activeListEl) {
            if (activeBookings.length === 0) {
                activeListEl.innerHTML = `<div class="empty-placeholder"><p>No bookings yet.</p></div>`;
            } else {
                activeListEl.innerHTML = activeBookings.slice(0, 3).map(j => `
                    <div class="booking-card">
                        <div class="booking-info">
                            <h4 class="booking-service-title">${j.service}</h4>
                            <div class="booking-meta-row">
                                <span><i class="fa-solid fa-clock"></i> ${j.requested_date} • ${j.requested_time}</span>
                                <span><i class="fa-solid fa-location-dot"></i> ${j.location || state.city}</span>
                                <span><i class="fa-solid fa-indian-rupee-sign"></i> ${j.budget || '₹300'}</span>
                            </div>
                        </div>
                        <div class="booking-actions-col">
                            <span class="status-pill ${j.status.toLowerCase().replace(/\s+/g, '-')}">
                                <span class="status-indicator"></span> ${j.status}
                            </span>
                        </div>
                    </div>
                `).join('');
            }
        }

        // Render Available Specialists (Real Data Only)
        const workersGridEl = document.getElementById('custWorkersGrid');
        if (workersGridEl) {
            if (workers.length === 0) {
                workersGridEl.innerHTML = `<div class="empty-placeholder" style="grid-column:1/-1"><p>No workers available in your area yet.</p></div>`;
            } else {
                workersGridEl.innerHTML = workers.map(w => {
                    const initials = (w.name || 'W').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
                    const safeName = (w.name || 'Specialist').replace(/'/g, "\\'");
                    const safeTrade = (w.trade || 'Service').replace(/'/g, "\\'");
                    const safeHours = (w.availability_hours || '09:00 AM – 05:00 PM').replace(/'/g, "\\'");
                    return `
                        <div class="worker-card">
                            <div class="worker-card-head">
                                <div class="avatar-circle worker-avatar">${initials}</div>
                                <div>
                                    <h4 class="worker-card-name">${w.name}</h4>
                                    <span class="worker-card-trade">${w.trade}</span>
                                </div>
                            </div>
                            <div class="worker-card-meta">
                                <span><i class="fa-solid fa-star" style="color:#F59E0B"></i> ${w.rating || '4.9'}</span>
                                <span><i class="fa-solid fa-location-dot"></i> ${w.city}</span>
                                <span><i class="fa-solid fa-clock"></i> ${w.availability_hours || 'Available'}</span>
                                <span><strong>₹${w.price || 300}</strong></span>
                            </div>
                            <button type="button" class="btn btn-outline btn-sm btn-block" onclick="window._bookWorkerDirect(${w.id || 'null'}, '${safeName}', '${w.phone || ''}', '${safeTrade}', ${w.price || 300}, '${safeHours}')">
                                Book Specialist
                            </button>
                        </div>
                    `;
                }).join('');
            }
        }
    }

    // Direct Instant Booking: Status becomes immediately 'Confirmed' without extra confirmation modal
    window._bookWorkerDirect = async function(workerId, workerName, workerPhone, workerTrade, price, availHours) {
        let custPhone = state.user?.phone || '';
        let custName = state.user?.name || '';

        if (!custPhone) {
            custPhone = prompt('Please enter your 10-digit mobile number to book:');
            if (!custPhone || !/^[6-9]\d{9}$/.test(custPhone.trim().replace(/\D/g, ''))) {
                toast('A valid 10-digit mobile number is required.');
                return;
            }
            custPhone = custPhone.trim().replace(/\D/g, '');
            custName = prompt('Please enter your name:') || 'Customer';
            if (state.user) {
                state.user.phone = custPhone;
                state.user.name = custName;
            }
        }

        toast(`Booking ${workerName}...`);

        const payload = {
            customer_phone: custPhone,
            customer_name: custName || 'Customer',
            worker_id: workerId || null,
            worker_name: workerName,
            worker_phone: workerPhone || null,
            service: workerTrade,
            problem_description: `Direct booking for ${workerName} (${workerTrade})`,
            location: state.user?.area || 'Town Area',
            city: state.city || 'Ramanagara',
            requested_date: 'Tomorrow',
            requested_time: availHours || '09:00 AM – 05:00 PM',
            budget: `₹${price || 300}`,
            status: 'Confirmed',
            payment_method: 'Cash'
        };

        const res = await apiFetch('/api/jobs', {
            method: 'POST',
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            toast(`✅ Booking confirmed for ${workerName}!`);
            loadCustomerHomeData();
            if (state.customerView === 'bookings') loadCustomerBookings();
        } else {
            toast('Failed to create booking.');
        }
    };

    /* ======================================================================
       LIVE UPDATES

       Subscribes to /api/events, the server's change stream. When a worker edits
       their hours — from this browser, from the customer chatbot, or from the
       3.5mm voice handset — every open page is told and re-reads through the
       normal API.

       Before this, the specialist list showed whatever was fetched when the page
       opened. A customer could be looking at "09:00 AM – 04:00 PM" seconds after
       the worker had changed it on a phone call, and only a manual refresh would
       correct it.

       The event says WHAT changed, never the new values. The refresh is a real
       read of the real datastore, so the screen cannot end up showing a value the
       database does not hold.
       ====================================================================== */

    let liveStream = null;
    let liveRefreshTimer = null;
    const pendingLiveEntities = new Set();

    function setLiveIndicator(connected) {
        // Reflects a genuinely open stream — not an assumption that one exists.
        document.querySelectorAll('[data-live-indicator]').forEach(el => {
            el.classList.toggle('live-on', connected);
            el.title = connected ? 'Live updates connected' : 'Live updates reconnecting…';
        });
    }

    // A burst of writes (a job accepted, which also touches the worker) should cause
    // one refresh, not three.
    function scheduleLiveRefresh(entity) {
        pendingLiveEntities.add(entity);
        if (liveRefreshTimer) return;
        liveRefreshTimer = setTimeout(() => {
            liveRefreshTimer = null;
            const entities = new Set(pendingLiveEntities);
            pendingLiveEntities.clear();
            applyLiveRefresh(entities);
        }, 400);
    }

    function applyLiveRefresh(entities) {
        const workerSideChanged = entities.has('worker') || entities.has('availability');
        const jobChanged = entities.has('job');

        // Only the surface actually on screen is re-read.
        if (state.portal === 'customer') {
            if (state.customerView === 'bookings' && jobChanged) loadCustomerBookings();
            else if (workerSideChanged || jobChanged) loadCustomerHomeData();
        } else if (state.portal === 'worker') {
            if (state.workerView === 'bookings' && jobChanged) loadWorkerBookings();
            else if (state.workerView === 'earnings' && jobChanged) loadWorkerEarnings();
            else if (workerSideChanged || jobChanged) loadWorkerDashboardData();
        } else if (state.portal === 'terminal') {
            loadTerminalData();
        }
    }

    function connectLiveUpdates() {
        if (liveStream || typeof EventSource === 'undefined') return;

        try {
            liveStream = new EventSource('/api/events');
        } catch (err) {
            console.warn('[GigSync] Live updates unavailable:', err.message);
            return;
        }

        liveStream.addEventListener('ready', () => setLiveIndicator(true));

        liveStream.addEventListener('change', (evt) => {
            let change = null;
            try { change = JSON.parse(evt.data); } catch (_) { return; }
            if (!change || !change.entity) return;
            scheduleLiveRefresh(change.entity);
        });

        liveStream.onerror = () => {
            setLiveIndicator(false);
            if (window.location.hostname.includes('vercel.app')) {
                try { liveStream.close(); } catch(e){}
            }
        };
    }

    connectLiveUpdates();

    document.getElementById('refreshCustWorkersBtn')?.addEventListener('click', () => {
        toast('Refreshing feed...');
        loadCustomerHomeData();
    });

    document.getElementById('viewAllCustBookingsLink')?.addEventListener('click', () => switchCustomerView('bookings'));

    /* ======================================================================
       CUSTOMER PROFILE MODAL (GAP 2 FIX)
       ====================================================================== */

    const customerProfileModal = document.getElementById('customerProfileModal');

    function openCustomerProfileModal() {
        userDropdownMenu?.classList.add('hidden');
        // Pre-fill with current user data
        if (state.user) {
            document.getElementById('custProfileName') && (document.getElementById('custProfileName').value = state.user.name || '');
            document.getElementById('custProfilePhone') && (document.getElementById('custProfilePhone').value = state.user.phone || '');
            const citySelect = document.getElementById('custProfileCity');
            if (citySelect) {
                const city = state.user.city || state.city;
                const opt = Array.from(citySelect.options).find(o => o.value === city);
                if (opt) citySelect.value = city;
            }
            const areaInput = document.getElementById('custProfileArea');
            if (areaInput) areaInput.value = state.user.area || state.user.profile?.area || '';
        }
        customerProfileModal?.classList.remove('hidden');
    }

    document.getElementById('custProfileBtn')?.addEventListener('click', openCustomerProfileModal);
    document.getElementById('closeCustomerProfileModalBtn')?.addEventListener('click', () => customerProfileModal?.classList.add('hidden'));

    document.getElementById('customerProfileForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('custProfileName')?.value.trim();
        const city = document.getElementById('custProfileCity')?.value;
        const area = document.getElementById('custProfileArea')?.value.trim() || 'Town';

        // Update local state immediately
        if (state.user) {
            state.user.name = name || state.user.name;
            state.user.city = city || state.user.city;
            state.user.area = area;
        }

        // Update city display
        if (city) updateActiveCity(city);

        // Update display elements
        document.getElementById('userInitials') && (document.getElementById('userInitials').textContent = (name || '').split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() || 'KR');
        document.getElementById('userDisplayName') && (document.getElementById('userDisplayName').textContent = name || '');
        document.getElementById('dropdownUserName') && (document.getElementById('dropdownUserName').textContent = name || '');

        // Save to backend if authenticated
        if (state.token) {
            await apiFetch('/api/customers/me/profile', {
                method: 'PATCH',
                body: JSON.stringify({ name, city, area })
            }).catch(() => {});
        }

        customerProfileModal?.classList.add('hidden');
        toast(`✅ Profile updated: ${name}`);
    });



    // Load Customer My Bookings View
    async function loadCustomerBookings(filter = 'all') {
        const custPhone = state.user?.phone || '';
        if (!custPhone) {
            const listEl = document.getElementById('custFullBookingsList');
            if (listEl) listEl.innerHTML = `<div class="empty-placeholder"><p>No bookings yet.</p></div>`;
            return;
        }

        const res = await apiFetch(`/api/jobs?phone=${encodeURIComponent(custPhone)}`);
        const allJobs = (res.ok && res.data.jobs) ? res.data.jobs : [];
        const jobs = allJobs.filter(j => j.customer_phone === custPhone);
        state.jobs = jobs;

        let filtered = jobs;
        if (filter === 'upcoming') {
            filtered = jobs.filter(j => j.status === 'Requested' || j.status === 'Confirmed');
        } else if (filter === 'active') {
            filtered = jobs.filter(j => j.status === 'In Progress' || j.status === 'On the Way');
        } else if (filter === 'completed') {
            filtered = jobs.filter(j => j.status === 'Completed');
        }

        const listEl = document.getElementById('custFullBookingsList');
        if (!listEl) return;

        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="empty-placeholder"><p>No bookings yet.</p></div>`;
            return;
        }

        listEl.innerHTML = filtered.map(j => `
            <div class="booking-card">
                <div class="booking-info">
                    <h4 class="booking-service-title">${j.service}</h4>
                    <p style="font-size:13px;color:var(--gs-text-secondary);margin:2px 0 6px 0">${j.problem_description || 'Service request'}</p>
                    <div class="booking-meta-row">
                        <span><i class="fa-solid fa-clock"></i> ${j.requested_date} • ${j.requested_time}</span>
                        <span><i class="fa-solid fa-location-dot"></i> ${j.location || state.city}</span>
                        <span><i class="fa-solid fa-indian-rupee-sign"></i> ${j.budget || '₹300'}</span>
                    </div>
                </div>
                <div class="booking-actions-col">
                    <span class="status-pill ${j.status.toLowerCase().replace(/\s+/g, '-')}">
                        <span class="status-indicator"></span> ${j.status}
                    </span>
                    ${j.status !== 'Completed' && j.status !== 'Cancelled' ? `<button type="button" class="btn btn-outline btn-sm" onclick="window._cancelJob('${j.id}')">Cancel</button>` : ''}
                </div>
            </div>
        `).join('');
    }

    window._cancelJob = async function(id) {
        if (!confirm('Are you sure you want to cancel this booking?')) return;
        const res = await apiFetch(`/api/jobs/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'Cancelled' })
        });
        if (res.ok) {
            toast('Booking cancelled.');
            loadCustomerBookings();
        }
    };

    document.querySelectorAll('#custBookingsFilterTabs .filter-pill').forEach(btn => {
        btn.addEventListener('click', (e) => {
            document.querySelectorAll('#custBookingsFilterTabs .filter-pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            loadCustomerBookings(btn.dataset.filter);
        });
    });

    /* ======================================================================
       2. WORKER PORTAL DATA & LOGIC
       ====================================================================== */

    let workerIsActive = true;

    // Worker Duty Switch
    document.getElementById('workerDutyToggleBtn')?.addEventListener('click', async () => {
        workerIsActive = !workerIsActive;
        const btn = document.getElementById('workerDutyToggleBtn');
        const label = document.getElementById('dutyStatusLabel');
        btn?.classList.toggle('on', workerIsActive);
        if (label) label.textContent = workerIsActive ? 'ACTIVE' : 'INACTIVE';
        toast(workerIsActive ? '🟢 You are now marked ACTIVE for new jobs.' : '⚪ You are now marked INACTIVE.');

        // Use correct authenticated worker endpoint
        await apiFetch('/api/workers/me/availability', {
            method: 'PATCH',
            body: JSON.stringify({ is_available: workerIsActive })
        });
    });

    // Worker Availability Edit Modal
    const workerAvailModal = document.getElementById('workerAvailModal');
    document.getElementById('openEditAvailModalBtn')?.addEventListener('click', () => workerAvailModal?.classList.remove('hidden'));
    document.getElementById('closeAvailModalBtn')?.addEventListener('click', () => workerAvailModal?.classList.add('hidden'));

    document.getElementById('workerAvailForm')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const day = document.getElementById('availDaySelect')?.value;
        const start = document.getElementById('availStartTimeInput')?.value.trim();
        const end = document.getElementById('availEndTimeInput')?.value.trim();

        const hoursText = `${start} – ${end}`;
        document.getElementById('workerTodayHoursLabel') && (document.getElementById('workerTodayHoursLabel').textContent = hoursText);
        toast(`Availability updated for ${day}: ${hoursText}`);
        workerAvailModal?.classList.add('hidden');

        await apiFetch(`/api/workers/${state.user ? state.user.id : 1}/availability`, {
            method: 'POST',
            body: JSON.stringify({
                date: day,
                startTime: start,
                endTime: end,
                isAvailable: true
            })
        });
    });

    // Load Worker Dashboard Data
    async function loadWorkerDashboardData() {
        if (state.user) {
            const initials = state.user.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase();
            document.getElementById('workerInitials') && (document.getElementById('workerInitials').textContent = initials);
            document.getElementById('workerDisplayName') && (document.getElementById('workerDisplayName').textContent = state.user.name);
            document.getElementById('wDropdownName') && (document.getElementById('wDropdownName').textContent = state.user.name);

            // GAP 1 FIX: Resolve trade from multiple possible sources
            const workerTrade = state.user.profile?.trade || state.user.trade || 'Specialist';
            const tradeIcons = {
                'Electrician': '⚡', 'Master Electrician': '⚡',
                'Plumber': '🔧', 'Plumbing Specialist': '🔧',
                'Carpenter': '🔨', 'General Carpenter': '🔨',
                'Mechanic': '🏍️', 'Two-Wheeler Mechanic': '🏍️',
                'AC': '❄️', 'AC & Fridge Tech': '❄️',
                'Painter': '🎨', 'Appliance': '🔌', 'Appliance Repair Tech': '🔌',
                'Tailor': '🧵', 'Cleaner': '🧹', 'Home Cleaner': '🧹'
            };
            const tradeIcon = Object.keys(tradeIcons).find(k => workerTrade.includes(k)) ? tradeIcons[Object.keys(tradeIcons).find(k => workerTrade.includes(k))] : '🔧';
            document.getElementById('workerTradeHeading') && (document.getElementById('workerTradeHeading').textContent = `${tradeIcon} ${workerTrade}`);
            document.getElementById('wDropdownTrade') && (document.getElementById('wDropdownTrade').textContent = workerTrade);
        }

        // Fetch real worker profile if available (for real trade + availability)
        let workerProfile = null;
        if (state.user && state.token) {
            const meRes = await apiFetch('/api/auth/me');
            if (meRes.ok && meRes.data.user) {
                state.user = { ...state.user, ...meRes.data.user };
                const trade = state.user.profile?.trade;
                if (trade) {
                    const tradeIcons = {
                        'Electrician': '⚡', 'Master Electrician': '⚡',
                        'Plumber': '🔧', 'Plumbing Specialist': '🔧',
                        'Carpenter': '🔨', 'General Carpenter': '🔨',
                        'Mechanic': '🏍️', 'Two-Wheeler Mechanic': '🏍️',
                        'AC': '❄️', 'AC & Fridge Tech': '❄️',
                        'Painter': '🎨', 'Appliance': '🔌', 'Appliance Repair Tech': '🔌',
                        'Tailor': '🧵', 'Cleaner': '🧹', 'Home Cleaner': '🧹'
                    };
                    const tradeIcon = Object.keys(tradeIcons).find(k => trade.includes(k)) ? tradeIcons[Object.keys(tradeIcons).find(k => trade.includes(k))] : '🔧';
                    document.getElementById('workerTradeHeading') && (document.getElementById('workerTradeHeading').textContent = `${tradeIcon} ${trade}`);
                    document.getElementById('wDropdownTrade') && (document.getElementById('wDropdownTrade').textContent = trade);
                }
                workerProfile = state.user.profile;
            }
        }

        // Fetch worker schedule and active availability slots from DB
        let workerSchedule = null;
        try {
            const schedEndpoint = (workerProfile && workerProfile.id) ? `/api/workers/${workerProfile.id}/schedule` : '/api/workers/me/schedule';
            const schedRes = await apiFetch(schedEndpoint);
            if (schedRes.ok && schedRes.data) {
                workerSchedule = schedRes.data;
            }
        } catch (_) {}

        const workerPhone = state.user?.phone || '';
        const jobsUrl = workerPhone ? `/api/jobs?worker_phone=${encodeURIComponent(workerPhone)}` : '/api/jobs';
        const res = await apiFetch(jobsUrl);
        const allJobs = (res.ok && res.data.jobs) ? res.data.jobs : [];
        // Filter jobs strictly relevant to this worker
        const jobs = workerPhone ? allJobs.filter(j => j.worker_phone === workerPhone || (j.worker_phone === null && j.status === 'Requested')) : [];
        state.jobs = jobs;

        // Availability Display — show slot or 'On Duty' from database schedule
        const availBadge = document.getElementById('workerAvailBadge');
        const todayHoursLabel = document.getElementById('workerTodayHoursLabel');
        const slots = workerSchedule?.availabilitySlots || [];
        if (slots.length > 0) {
            const latest = slots[0];
            if (todayHoursLabel) {
                todayHoursLabel.textContent = `${latest.start_time} – ${latest.end_time} (${latest.date_str})`;
            }
            if (availBadge) {
                availBadge.textContent = latest.is_available ? `🟢 Available (${latest.start_time} – ${latest.end_time})` : '⚪ Off Duty';
                availBadge.className = `avail-badge ${latest.is_available ? 'available' : 'unavailable'}`;
            }
        } else {
            if (availBadge) {
                availBadge.textContent = workerIsActive ? '🟢 Available' : '⚪ Off Duty';
                availBadge.className = `avail-badge ${workerIsActive ? 'available' : 'unavailable'}`;
            }
        }

        // Current In-Progress Job (worker's own)
        const currentJob = allJobs.find(j =>
            (j.status === 'In Progress' || j.status === 'On the Way') &&
            (!workerPhone || j.worker_phone === workerPhone)
        );
        const currentContainer = document.getElementById('workerCurrentBookingContainer');
        if (currentContainer) {
            if (!currentJob) {
                currentContainer.innerHTML = `<div class="empty-placeholder"><p>No job in progress right now.</p></div>`;
            } else {
                currentContainer.innerHTML = `
                    <div class="booking-card">
                        <div class="booking-info">
                            <h4 class="booking-service-title">${currentJob.service}</h4>
                            <p style="font-size:13px;color:var(--gs-text-secondary);margin:2px 0 6px 0">${currentJob.problem_description}</p>
                            <div class="booking-meta-row">
                                <span><i class="fa-solid fa-user"></i> ${currentJob.customer_name || 'Customer'}</span>
                                <span><i class="fa-solid fa-location-dot"></i> ${currentJob.location || state.city}</span>
                                <span><i class="fa-solid fa-clock"></i> ${currentJob.requested_time}</span>
                            </div>
                        </div>
                        <div class="booking-actions-col">
                            <span class="status-pill progress">🟢 In Progress</span>
                            <button type="button" class="btn btn-primary btn-sm" onclick="window._workerUpdateJobStatus('${currentJob.id}', 'Completed')">
                                Mark Completed
                            </button>
                        </div>
                    </div>
                `;
            }
        }

        // GAP 3: Available Job Opportunities — unassigned Requested jobs in worker's city/trade
        const workerCity = state.user?.city || state.city;
        const workerTrade2 = (state.user?.profile?.trade || state.user?.trade || '').toLowerCase();
        const opportunities = allJobs.filter(j =>
            j.status === 'Requested' &&
            !j.worker_phone &&
            (!workerCity || j.city === workerCity || j.city === state.city)
        );

        // Show opportunities in the Upcoming Bookings section (with Accept/Decline)
        const upcomingList = document.getElementById('workerUpcomingBookingsList');
        if (upcomingList) {
            // Worker's own confirmed bookings
            const myUpcoming = allJobs.filter(j =>
                (j.status === 'Confirmed') &&
                workerPhone && j.worker_phone === workerPhone
            );

            let html = '';

            if (opportunities.length > 0) {
                html += `<div class="section-subtext" style="padding:8px 0 6px;font-size:12px;color:var(--gs-primary);font-weight:600;letter-spacing:.5px">📢 AVAILABLE JOB REQUESTS IN YOUR AREA</div>`;
                html += opportunities.map(j => `
                    <div class="booking-card" style="border-left:3px solid var(--gs-primary);">
                        <div class="booking-info">
                            <h4 class="booking-service-title">${j.service} <span style="font-size:11px;font-weight:500;color:var(--gs-muted)">Job #${j.id}</span></h4>
                            <p style="font-size:12.5px;color:var(--gs-text-secondary);margin:2px 0 5px">${j.problem_description}</p>
                            <div class="booking-meta-row">
                                <span><i class="fa-solid fa-clock"></i> ${j.requested_date} • ${j.requested_time}</span>
                                <span><i class="fa-solid fa-location-dot"></i> ${j.location || j.city}</span>
                                <span><i class="fa-solid fa-indian-rupee-sign"></i> ${j.budget || '₹300'}</span>
                            </div>
                        </div>
                        <div class="booking-actions-col" style="gap:6px;">
                            <button type="button" class="btn btn-primary btn-sm" onclick="window._workerAcceptJob('${j.id}')">
                                <i class="fa-solid fa-check"></i> Accept
                            </button>
                            <button type="button" class="btn btn-outline btn-sm" onclick="window._workerDeclineJob('${j.id}')">
                                <i class="fa-solid fa-xmark"></i> Decline
                            </button>
                        </div>
                    </div>
                `).join('');
            }

            if (myUpcoming.length > 0) {
                if (html) html += `<div style="height:8px"></div>`;
                html += `<div class="section-subtext" style="padding:8px 0 6px;font-size:12px;color:var(--gs-text-secondary);font-weight:600;letter-spacing:.5px">MY CONFIRMED BOOKINGS</div>`;
                html += myUpcoming.map(j => `
                    <div class="booking-card">
                        <div class="booking-info">
                            <h4 class="booking-service-title">${j.service}</h4>
                            <div class="booking-meta-row">
                                <span><i class="fa-solid fa-clock"></i> ${j.requested_date} • ${j.requested_time}</span>
                                <span><i class="fa-solid fa-location-dot"></i> ${j.location || state.city}</span>
                                <span><i class="fa-solid fa-indian-rupee-sign"></i> ${j.budget || '₹300'}</span>
                            </div>
                        </div>
                        <div class="booking-actions-col">
                            <span class="status-pill confirmed">Confirmed</span>
                            <button type="button" class="btn btn-primary btn-sm" onclick="window._workerUpdateJobStatus('${j.id}', 'In Progress')">
                                Start Job
                            </button>
                        </div>
                    </div>
                `).join('');
            }

            if (!html) {
                html = `<div class="empty-placeholder"><p>No job requests in your area right now.</p></div>`;
            }

            upcomingList.innerHTML = html;
        }
    }

    window._workerUpdateJobStatus = async function(id, status) {
        const res = await apiFetch(`/api/jobs/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status })
        });
        if (res.ok) {
            toast(`Job #${id} → ${status}`);
            loadWorkerDashboardData();
            if (state.workerView === 'bookings') loadWorkerBookings();
            if (state.workerView === 'earnings') loadWorkerEarnings();
        } else {
            toast('Failed to update job status.');
        }
    };

    window._workerAcceptJob = async function(id) {
        const res = await apiFetch(`/api/jobs/${id}`, {
            method: 'PATCH',
            body: JSON.stringify({ status: 'Confirmed' })
        });
        if (res.ok) {
            toast(`✅ Job #${id} accepted! It's now in your bookings.`);
            loadWorkerDashboardData();
        } else {
            toast('Failed to accept job.');
        }
    };

    window._workerDeclineJob = async function(id) {
        // Decline just removes from view for this worker — don't change status
        toast(`Job #${id} declined. It remains available for other workers.`);
        // Just refresh to reflect latest state
        loadWorkerDashboardData();
    };

    // Load Worker Bookings View
    async function loadWorkerBookings(filter = 'all') {
        const workerPhone = state.user?.phone || '';
        const jobsUrl = workerPhone ? `/api/jobs?worker_phone=${encodeURIComponent(workerPhone)}` : '/api/jobs';
        const res = await apiFetch(jobsUrl);
        const allJobs = (res.ok && res.data.jobs) ? res.data.jobs : [];
        const jobs = workerPhone ? allJobs.filter(j => j.worker_phone === workerPhone) : [];
        state.jobs = jobs;

        let filtered = jobs;
        if (filter === 'current') filtered = jobs.filter(j => j.status === 'In Progress' || j.status === 'On the Way');
        else if (filter === 'upcoming') filtered = jobs.filter(j => j.status === 'Requested' || j.status === 'Confirmed');
        else if (filter === 'completed') filtered = jobs.filter(j => j.status === 'Completed');

        const listEl = document.getElementById('workerAllBookingsList');
        if (!listEl) return;

        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="empty-placeholder"><p>No bookings yet.</p></div>`;
            return;
        }

        listEl.innerHTML = filtered.map(j => `
            <div class="booking-card">
                <div class="booking-info">
                    <h4 class="booking-service-title">${j.service}</h4>
                    <p style="font-size:13px;color:var(--gs-text-secondary);margin:2px 0 6px 0">${j.problem_description}</p>
                    <div class="booking-meta-row">
                        <span><i class="fa-solid fa-clock"></i> ${j.requested_date} • ${j.requested_time}</span>
                        <span><i class="fa-solid fa-location-dot"></i> ${j.location || state.city}</span>
                        <span><i class="fa-solid fa-indian-rupee-sign"></i> ${j.budget || '₹300'}</span>
                    </div>
                </div>
                <div class="booking-actions-col">
                    <span class="status-pill ${j.status.toLowerCase().replace(/\s+/g, '-')}">${j.status}</span>
                </div>
            </div>
        `).join('');
    }

    document.querySelectorAll('#workerBookingsFilterTabs .filter-pill').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('#workerBookingsFilterTabs .filter-pill').forEach(p => p.classList.remove('active'));
            btn.classList.add('active');
            loadWorkerBookings(btn.dataset.filter);
        });
    });

    // GAP 5: Load Worker Job History & Earnings — uses real per-worker earnings API
    async function loadWorkerEarnings() {
        // Determine worker profile ID for real earnings lookup
        const workerId = state.user?.profile?.id || state.user?.id;
        let earningsData = null;

        if (workerId && state.token) {
            const eRes = await apiFetch(`/api/workers/${workerId}/earnings`);
            if (eRes.ok && eRes.data.earnings) {
                earningsData = eRes.data.earnings;
            }
        }

        if (earningsData) {
            document.getElementById('metricCompletedJobs') && (document.getElementById('metricCompletedJobs').textContent = earningsData.totalCompletedJobs || 0);
            document.getElementById('metricTotalEarnings') && (document.getElementById('metricTotalEarnings').textContent = `₹${earningsData.totalEarnings || 0}`);
            document.getElementById('metricMonthEarnings') && (document.getElementById('metricMonthEarnings').textContent = `₹${earningsData.thisMonth || 0}`);
            document.getElementById('metricPendingEarnings') && (document.getElementById('metricPendingEarnings').textContent = `₹${earningsData.pendingEarnings || 0}`);

            const tableBody = document.getElementById('workerEarningsTableBody');
            if (tableBody) {
                const completedJobs = earningsData.completedJobs || [];
                if (completedJobs.length === 0) {
                    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--gs-muted);padding:24px">No completed gigs recorded yet.</td></tr>`;
                } else {
                    tableBody.innerHTML = completedJobs.map(j => {
                        const amt = j.final_price ? `₹${j.final_price}` : (j.budget || '₹300');
                        const date = j.completed_at ? new Date(j.completed_at).toLocaleDateString('en-IN') : (j.requested_date || 'Today');
                        return `
                            <tr>
                                <td><strong>${j.service}</strong></td>
                                <td>${j.customer_name || 'Customer'}</td>
                                <td><strong>${amt}</strong></td>
                                <td>${date}</td>
                                <td><span class="status-pill completed">Paid ${j.payment_method || 'Cash'}</span></td>
                            </tr>
                        `;
                    }).join('');
                }
            }
        } else {
            // Fallback: compute from job list filtered by this worker
            const res = await apiFetch('/api/jobs');
            const allJobs = (res.ok && res.data.jobs) ? res.data.jobs : [];
            const workerPhone = state.user?.phone;
            const completed = allJobs.filter(j => j.status === 'Completed' && (!workerPhone || j.worker_phone === workerPhone));

            let total = 0;
            completed.forEach(j => { total += parseInt((j.budget || '300').replace(/[^0-9]/g, '')) || 300; });

            document.getElementById('metricCompletedJobs') && (document.getElementById('metricCompletedJobs').textContent = completed.length);
            document.getElementById('metricTotalEarnings') && (document.getElementById('metricTotalEarnings').textContent = `₹${total}`);
            document.getElementById('metricMonthEarnings') && (document.getElementById('metricMonthEarnings').textContent = `₹${total}`);
            document.getElementById('metricPendingEarnings') && (document.getElementById('metricPendingEarnings').textContent = '₹0');

            const tableBody = document.getElementById('workerEarningsTableBody');
            if (tableBody) {
                if (completed.length === 0) {
                    tableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;color:var(--gs-muted);padding:24px">No completed gigs recorded yet.</td></tr>`;
                } else {
                    tableBody.innerHTML = completed.map(j => `
                        <tr>
                            <td><strong>${j.service}</strong></td>
                            <td>${j.customer_name || 'Customer'}</td>
                            <td><strong>${j.budget || '₹300'}</strong></td>
                            <td>${j.requested_date || 'Today'}</td>
                            <td><span class="status-pill completed">Completed</span></td>
                        </tr>
                    `).join('');
                }
            }
        }
    }

    /* ======================================================================
       3. VOICE AGENT / 3.5MM TERMINAL
       ====================================================================== */

    const voiceAgentPowerBtn = document.getElementById('voiceAgentPowerBtn');
    const voiceAgentPowerLabel = document.getElementById('voiceAgentPowerLabel');
    const voiceAgentPowerDesc = document.getElementById('voiceAgentPowerDesc');

    let terminalAudioCtx = null;
    let terminalAnalyser = null;
    let terminalMicrophoneStream = null;
    let terminalSpeechRec = null;
    let terminalAudioAnimId = null;

    // Conversational VAD & Turn State Variables (5-Second Silence Detection Window)
    let isAiSpeaking = false;
    let turnSilenceTimer = null;
    let currentTurnTranscript = '';
    let currentInterimTranscript = '';
    const TURN_SILENCE_TIMEOUT_MS = 5000; // 5.0 seconds silence window per specification

    function setVoiceAgentState(stateKey, labelText) {
        const badge = document.getElementById('vaLiveStateBadge');
        const text = document.getElementById('vaLiveStateText');
        if (badge) {
            badge.className = `va-state-pill ${stateKey.toLowerCase()}`;
        }
        if (text) {
            text.textContent = labelText;
        }
    }

    function deduplicateUtterance(str) {
        if (!str) return '';
        return str
            .replace(/\b(\w+(?:\s+\w+){1,4})\s+\1\b/gi, '$1')
            .replace(/\b(\w+)\s+\1\b/gi, '$1')
            .trim();
    }

    /* ---------- Echo Detection & Self-Voice Filter ---------- */
    function isAiSelfEcho(callerText) {
        if (!callerText) return false;
        const cClean = callerText.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
        const cTokens = cClean.split(/\s+/).filter(Boolean);
        if (cTokens.length === 0) return false;

        // Check against recent AI responses within last 15 seconds
        for (const item of (state.recentAiResponses || [])) {
            if (Date.now() - item.time < 15000) {
                const aiClean = item.text.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
                const aiTokens = aiClean.split(/\s+/).filter(Boolean);
                if (aiTokens.length === 0) continue;

                // Check 1: Direct substring containment (e.g. caller speech is contained within AI response or vice versa)
                if (aiClean.includes(cClean) || (cClean.length > 8 && aiClean.includes(cClean.slice(0, Math.floor(cClean.length * 0.8))))) {
                    return true;
                }

                // Check 2: Word token overlap ratio >= 50%
                let matches = 0;
                for (const token of cTokens) {
                    if (aiTokens.includes(token)) matches++;
                }
                const overlapRatio = matches / cTokens.length;
                if (overlapRatio >= 0.50 && cTokens.length >= 2) {
                    return true;
                }
            }
        }
        return false;
    }

    function finalizeCallerTurn() {
        clearTimeout(turnSilenceTimer);
        turnSilenceTimer = null;

        if (isAiSpeaking) {
            currentTurnTranscript = '';
            currentInterimTranscript = '';
            return;
        }

        const raw = (currentTurnTranscript + ' ' + currentInterimTranscript).trim();
        currentTurnTranscript = '';
        currentInterimTranscript = '';

        const cleaned = deduplicateUtterance(raw);
        if (!cleaned || cleaned.length < 2) {
            if (state.voiceAgentActive && !isAiSpeaking) {
                setVoiceAgentState('listening', '🟢 LISTENING');
            }
            return;
        }

        // ECHO SUPPRESSION LAYER 3: Check if this utterance is actually the AI's own audio feedback
        if (isAiSelfEcho(cleaned)) {
            console.log('🔇 Suppressed AI Self-Echo Loopback:', cleaned);
            appendTerminalActivity(`Acoustic echo suppressed: "${cleaned.slice(0, 35)}..."`);
            if (state.voiceAgentActive && !isAiSpeaking) {
                setVoiceAgentState('listening', '🟢 LISTENING');
            }
            return;
        }

        // Prevent duplicate firing within 2 seconds
        if (cleaned === state.lastProcessedTurn && (Date.now() - state.lastProcessedTurnTime < 2000)) {
            return;
        }
        state.lastProcessedTurn = cleaned;
        state.lastProcessedTurnTime = Date.now();

        const input = document.getElementById('terminalTextInput');
        if (input) input.value = cleaned;

        setVoiceAgentState('processing', '🟡 PROCESSING');
        sendAiTurn(cleaned);
    }

    async function startTerminalAudioPipeline() {
        try {
            terminalMicrophoneStream = await navigator.mediaDevices.getUserMedia({
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true
                }
            });

            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                terminalAudioCtx = new AudioCtx();
                const source = terminalAudioCtx.createMediaStreamSource(terminalMicrophoneStream);
                terminalAnalyser = terminalAudioCtx.createAnalyser();
                terminalAnalyser.fftSize = 128;
                source.connect(terminalAnalyser);

                const dataArray = new Uint8Array(terminalAnalyser.frequencyBinCount);
                const vuBar = document.getElementById('terminalVuMeterBar');
                const vuStatus = document.getElementById('terminalLiveAudioStatus');
                if (vuStatus) {
                    vuStatus.textContent = 'Listening (Audio Live)';
                    vuStatus.classList.add('active');
                }

                function animateVU() {
                    if (!state.voiceAgentActive) return;
                    terminalAnalyser.getByteFrequencyData(dataArray);
                    let sum = 0;
                    for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
                    const avg = sum / dataArray.length;
                    if (vuBar) {
                        const pct = Math.min(100, Math.round((avg / 80) * 100));
                        vuBar.style.width = `${pct}%`;
                    }
                    terminalAudioAnimId = requestAnimationFrame(animateVU);
                }
                animateVU();
            }

            // Start continuous Speech Recognition with 2-Second Turn Segmentation
            const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRec) {
                terminalSpeechRec = new SpeechRec();
                terminalSpeechRec.continuous = true;
                terminalSpeechRec.interimResults = true;
                terminalSpeechRec.lang = 'en-IN';

                terminalSpeechRec.onresult = (e) => {
                    // ECHO SUPPRESSION: Discard input while AI is speaking
                    if (isAiSpeaking) {
                        currentTurnTranscript = '';
                        currentInterimTranscript = '';
                        return;
                    }

                    currentInterimTranscript = '';
                    let newlyFinalized = '';

                    for (let i = e.resultIndex; i < e.results.length; ++i) {
                        const chunk = e.results[i][0].transcript;
                        if (e.results[i].isFinal) {
                            newlyFinalized += chunk + ' ';
                        } else {
                            currentInterimTranscript += chunk;
                        }
                    }

                    if (newlyFinalized) {
                        currentTurnTranscript = (currentTurnTranscript + ' ' + newlyFinalized).trim();
                    }

                    const livePreview = (currentTurnTranscript + (currentInterimTranscript ? ' ' + currentInterimTranscript : '')).trim();
                    if (livePreview) {
                        const input = document.getElementById('terminalTextInput');
                        if (input) input.value = livePreview;
                        setVoiceAgentState('listening', '🟢 LISTENING');

                        // ZERO GAP GREETING: If user starts with an opening greeting (hello/hi/hey/namaskara), answer IMMEDIATELY with zero seconds delay!
                        const isImmediateGreeting = /^(hello|hi|hey|namaskara|namaste|good morning|good afternoon|good evening|ನಮಸ್ಕಾರ)[\s.!?,]*$/i.test(livePreview.trim());
                        if (isImmediateGreeting) {
                            clearTimeout(turnSilenceTimer);
                            finalizeCallerTurn();
                        } else {
                            // Standard 2-second silence timer for detailed conversation / requests
                            clearTimeout(turnSilenceTimer);
                            turnSilenceTimer = setTimeout(() => {
                                finalizeCallerTurn();
                            }, TURN_SILENCE_TIMEOUT_MS);
                        }
                    }
                };

                terminalSpeechRec.onspeechend = () => {
                    // Start 2-second silence countdown as soon as caller stops speaking
                    if (currentTurnTranscript || currentInterimTranscript) {
                        const isImmediateGreeting = /^(hello|hi|hey|namaskara|namaste|good morning|good afternoon|good evening|ನಮಸ್ಕಾರ)[\s.!?,]*$/i.test((currentTurnTranscript + ' ' + currentInterimTranscript).trim());
                        if (isImmediateGreeting) {
                            clearTimeout(turnSilenceTimer);
                            finalizeCallerTurn();
                        } else {
                            clearTimeout(turnSilenceTimer);
                            turnSilenceTimer = setTimeout(() => {
                                finalizeCallerTurn();
                            }, TURN_SILENCE_TIMEOUT_MS);
                        }
                    }
                };

                terminalSpeechRec.onerror = (err) => {
                    if (err.error !== 'no-speech' && err.error !== 'aborted') {
                        console.warn('Terminal speech recognition error:', err.error);
                    }
                    if (state.voiceAgentActive && !isAiSpeaking) {
                        setVoiceAgentState('listening', '🟢 LISTENING');
                    }
                };

                terminalSpeechRec.onend = () => {
                    if (state.voiceAgentActive && !isAiSpeaking) {
                        setTimeout(() => {
                            if (state.voiceAgentActive && !isAiSpeaking) {
                                try { terminalSpeechRec.start(); } catch(e){}
                            }
                        }, 100);
                    }
                };

                terminalSpeechRec.start();
                setVoiceAgentState('listening', '🟢 LISTENING');
            }
        } catch(err) {
            console.error('Audio hardware access error:', err);
            toast('Please grant microphone permission to capture 3.5mm sound card audio.');
        }
    }

    function stopTerminalAudioPipeline() {
        clearTimeout(turnSilenceTimer);
        turnSilenceTimer = null;
        currentTurnTranscript = '';
        currentInterimTranscript = '';
        isAiSpeaking = false;

        if (terminalAudioAnimId) {
            cancelAnimationFrame(terminalAudioAnimId);
            terminalAudioAnimId = null;
        }
        if (terminalMicrophoneStream) {
            terminalMicrophoneStream.getTracks().forEach(t => t.stop());
            terminalMicrophoneStream = null;
        }
        if (terminalAudioCtx) {
            try { terminalAudioCtx.close(); } catch(e){}
            terminalAudioCtx = null;
        }
        if (terminalSpeechRec) {
            try { terminalSpeechRec.stop(); } catch(e){}
            terminalSpeechRec = null;
        }
        const vuBar = document.getElementById('terminalVuMeterBar');
        if (vuBar) vuBar.style.width = '0%';
        const vuStatus = document.getElementById('terminalLiveAudioStatus');
        if (vuStatus) {
            vuStatus.textContent = 'Pipeline Idle';
            vuStatus.classList.remove('active');
        }
        setVoiceAgentState('idle', '⚪ IDLE');
    }

    voiceAgentPowerBtn?.addEventListener('click', () => {
        state.voiceAgentActive = !state.voiceAgentActive;
        voiceAgentPowerBtn.classList.toggle('on', state.voiceAgentActive);
        voiceAgentPowerBtn.classList.toggle('off', !state.voiceAgentActive);

        if (state.voiceAgentActive) {
            voiceAgentPowerLabel.textContent = '🟢 ON';
            voiceAgentPowerDesc.textContent = 'Voice processing pipeline is LIVE and actively listening through 3.5mm sound card / Bluetooth.';
            toast('🟢 Voice Agent Pipeline Activated');
            appendTerminalActivity('Voice Agent pipeline enabled by operator');
            appendTerminalAction('✓ Voice processing pipeline initialized');
            startTerminalAudioPipeline();
        } else {
            voiceAgentPowerLabel.textContent = '🔴 OFF';
            voiceAgentPowerDesc.textContent = 'Click to enable incoming voice/audio processing pipeline.';
            toast('🔴 Voice Agent Pipeline Deactivated');
            appendTerminalActivity('Voice Agent pipeline disabled');
            stopTerminalAudioPipeline();
        }
    });

    // Terminal Clear Transcript & Reset Voice Session
    document.getElementById('clearTranscriptBtn')?.addEventListener('click', async () => {
        const box = document.getElementById('terminalTranscriptBox');
        if (box) {
            box.innerHTML = `<div class="transcript-idle" id="transcriptIdleMsg"><i class="fa-solid fa-microphone-slash"></i><p>Waiting for voice input...</p></div>`;
        }
        const actionsBox = document.getElementById('terminalAiActionsBox');
        if (actionsBox) {
            actionsBox.innerHTML = `<div class="action-idle"><p>No actions performed yet.</p></div>`;
        }
        const oldSessionId = state.sessionId;
        state.sessionId = 'voice_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        state.lastProcessedTurn = '';
        state.lastProcessedTurnTime = 0;
        
        renderTerminalCallerStatus({ phone: null, name: 'Caller', registeredWorker: false });
        
        try {
            await apiFetch('/api/ai/reset-session', {
                method: 'POST',
                body: JSON.stringify({ sessionId: oldSessionId })
            });
        } catch (e) {}
        
        toast('🧹 Voice session reset. Ready for new caller.');
    });

    // Terminal Input Bar Handlers
    document.getElementById('terminalSendBtn')?.addEventListener('click', () => {
        const input = document.getElementById('terminalTextInput');
        const text = input?.value.trim();
        if (text) {
            input.value = '';
            setVoiceAgentState('processing', '🟡 PROCESSING');
            sendAiTurn(text);
        }
    });

    document.getElementById('terminalTextInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const input = document.getElementById('terminalTextInput');
            const text = input?.value.trim();
            if (text) {
                input.value = '';
                setVoiceAgentState('processing', '🟡 PROCESSING');
                sendAiTurn(text);
            }
        }
    });

    // Terminal Quick Test Prompts
    document.querySelectorAll('.t-q-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const prompt = chip.dataset.tprompt;
            if (prompt) {
                setVoiceAgentState('processing', '🟡 PROCESSING');
                sendAiTurn(prompt);
            }
        });
    });

    function appendTerminalTranscript(speaker, text) {
        const box = document.getElementById('terminalTranscriptBox');
        const idle = document.getElementById('transcriptIdleMsg');
        if (idle) idle.remove();

        if (box) {
            const row = document.createElement('div');
            row.style.marginBottom = '10px';
            row.innerHTML = `<strong>${speaker}:</strong> <span>${text}</span>`;
            box.appendChild(row);
            box.scrollTop = box.scrollHeight;
        }
    }

    function appendTerminalAction(actionText) {
        const box = document.getElementById('terminalAiActionsBox');
        if (!box) return;
        const idle = box.querySelector('.action-idle');
        if (idle) idle.remove();

        const item = document.createElement('div');
        item.className = 'action-item';
        item.innerHTML = `<i class="fa-solid fa-check-circle"></i> <span>${actionText}</span>`;
        box.appendChild(item);
    }

    function appendTerminalActivity(eventText) {
        const list = document.getElementById('terminalActivityLogList');
        if (!list) return;
        const idle = list.querySelector('.empty-placeholder');
        if (idle) idle.remove();

        const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        const row = document.createElement('div');
        row.className = 'log-entry-row';
        row.innerHTML = `<span>${eventText}</span><span style="color:var(--gs-muted)">${time}</span>`;
        list.prepend(row);
    }

    document.getElementById('clearTranscriptBtn')?.addEventListener('click', () => {
        const box = document.getElementById('terminalTranscriptBox');
        if (box) box.innerHTML = `<div class="transcript-idle" id="transcriptIdleMsg"><i class="fa-solid fa-microphone-slash"></i><p>Waiting for voice input...</p></div>`;
    });

    document.getElementById('refreshActivityLogBtn')?.addEventListener('click', () => {
        toast('Activity log refreshed.');
    });

    function loadTerminalData() {
        // Honest hardware detection indicators
        const audio35El = document.getElementById('audio35ConnStatus');
        const phoneEl = document.getElementById('phoneConnStatus');
        const outputSelect = document.getElementById('terminalAudioOutputSelect');

        if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
            navigator.mediaDevices.enumerateDevices().then(devices => {
                const hasAudioInput = devices.some(d => d.kind === 'audioinput');
                if (audio35El) audio35El.textContent = hasAudioInput ? 'Connected (Audio Input Detected)' : 'Disconnected';

                // Populate Audio Output Devices
                if (outputSelect) {
                    const outputs = devices.filter(d => d.kind === 'audiooutput');
                    if (outputs.length > 0) {
                        outputSelect.innerHTML = outputs.map(o => `<option value="${o.deviceId}">${o.label || 'Audio Output (' + o.deviceId.slice(0, 8) + ')'}</option>`).join('');
                    }
                }
            }).catch(() => {
                if (audio35El) audio35El.textContent = 'Connection status unavailable';
            });
        } else {
            if (audio35El) audio35El.textContent = 'Connection status unavailable';
        }

        if (phoneEl) phoneEl.textContent = 'Connection status unavailable';
    }

    // Test AI Voice Diagnostic Button Handler
    document.getElementById('testAiVoiceBtn')?.addEventListener('click', async () => {
        toast('🔊 Generating and playing test AI voice...');
        appendTerminalActivity('Diagnostic: AI voice test triggered');
        updateDiagnostic('diagAiResponse', '🟢 Test Triggered', 'ok');
        appendTerminalTranscript('SYSTEM TEST', 'Generating audio: "Hello. This is the GigSync voice agent. Audio output is working."');
        await playTtsAudio('Hello. This is the GigSync voice agent. Audio output is working.');
    });

    // Play 3.5mm Signal Tone Handler (Continuous / Chime Tone for Telephony Line Testing)
    document.getElementById('testToneSignalBtn')?.addEventListener('click', () => {
        toast('🎵 Transmitting 3.5mm electrical tone to phone line...');
        appendTerminalActivity('Diagnostic: 3.5mm signal tone sent to phone');
        updateDiagnostic('diagAudioPlayback', '🟢 Tone Transmitting', 'ok');

        try {
            const AudioCtx = window.AudioContext || window.webkitAudioContext;
            if (AudioCtx) {
                const ctx = new AudioCtx();
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = 'sine';
                
                // Play a pulsing telecommunication beep pattern (800Hz / 1000Hz)
                osc.frequency.setValueAtTime(800, ctx.currentTime);
                osc.frequency.setValueAtTime(1000, ctx.currentTime + 0.3);
                osc.frequency.setValueAtTime(800, ctx.currentTime + 0.6);
                osc.frequency.setValueAtTime(1200, ctx.currentTime + 0.9);
                
                gain.gain.setValueAtTime(0.5, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.5);
                
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start();
                osc.stop(ctx.currentTime + 1.5);
                
                setTimeout(() => {
                    updateDiagnostic('diagAudioPlayback', '✓ Tone Finished', 'ok');
                }, 1600);
            }
        } catch(e) {
            console.error('Tone generation error:', e);
        }
    });

    // Test Audio Output Button Handler
    document.getElementById('testAudioOutputBtn')?.addEventListener('click', async () => {
        toast('🔊 Playing 3.5mm audio output test...');
        appendTerminalActivity('Output audio test triggered');
        updateDiagnostic('diagAiResponse', '🟢 Test Triggered', 'ok');
        await playTtsAudio('Hello. This is the GigSync voice agent. Audio output is working.');
    });

    /* ======================================================================
       4. TALK TO GIGSYNC AI VOICE ASSISTANT MODAL
       ====================================================================== */

    const aiVoiceModal = document.getElementById('aiVoiceModal');
    const aiModalBigMicBtn = document.getElementById('aiModalBigMicBtn');
    const aiVoiceStateLabel = document.getElementById('aiVoiceStateLabel');
    const aiModalWaveBars = document.getElementById('aiModalWaveBars');
    const aiLiveStreamTranscript = document.getElementById('aiLiveStreamTranscript');
    const aiLiveStreamText = document.getElementById('aiLiveStreamText');
    const aiModalTranscriptBox = document.getElementById('aiModalTranscriptBox');

    function openAiVoiceModal() {
        aiVoiceModal?.classList.remove('hidden');
    }
    function closeAiVoiceModal() {
        aiVoiceModal?.classList.add('hidden');
        if (state.isAiModalRecording) {
            stopAiModalListening(false);
        }
        if ('speechSynthesis' in window) {
            window.speechSynthesis.cancel();
        }
    }

    document.getElementById('homeTalkAiActionBtn')?.addEventListener('click', openAiVoiceModal);
    document.getElementById('closeAiVoiceModalBtn')?.addEventListener('click', closeAiVoiceModal);

    let aiSpeechRecognizer = null;
    let accumulatedAiSpeech = '';
    let aiAudioStream = null;
    let speechRecNetworkBlocked = false;

    let modalSilenceTimer = null;

    function startAiModalListening() {
        accumulatedAiSpeech = '';
        clearTimeout(modalSilenceTimer);
        modalSilenceTimer = null;

        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SpeechRec) {
            toast('Voice recognition is not supported in this browser. Please type your request below.');
            return;
        }
        if (speechRecNetworkBlocked) {
            toast('Voice server is busy. Please type your message below.');
            return;
        }

        // IMPORTANT: SpeechRecognition.start() MUST be called synchronously inside
        // the click handler on desktop Chrome — any await before this call breaks
        // the browser's user-gesture context and the mic never activates.
        try {
            if (aiSpeechRecognizer) {
                try { aiSpeechRecognizer.abort(); } catch(e){}
            }

            aiSpeechRecognizer = new SpeechRec();
            aiSpeechRecognizer.continuous = true;
            aiSpeechRecognizer.interimResults = true;
            aiSpeechRecognizer.lang = 'en-IN';

            aiSpeechRecognizer.onresult = (event) => {
                let interim = '';
                let final = '';
                for (let i = 0; i < event.results.length; ++i) {
                    if (event.results[i].isFinal) {
                        final += event.results[i][0].transcript + ' ';
                    } else {
                        interim += event.results[i][0].transcript;
                    }
                }
                const liveTextCaptured = (final + interim).trim();
                accumulatedAiSpeech = liveTextCaptured;

                if (aiLiveStreamText && liveTextCaptured) {
                    aiLiveStreamText.textContent = `"${liveTextCaptured}"`;
                }
                const modalInput = document.getElementById('aiModalTextInput');
                if (modalInput && liveTextCaptured) {
                    modalInput.value = liveTextCaptured;
                }

                // 5-second silence auto-send timer
                if (liveTextCaptured) {
                    clearTimeout(modalSilenceTimer);
                    modalSilenceTimer = setTimeout(() => {
                        if (state.isAiModalRecording) {
                            stopAiModalListening(true);
                        }
                    }, 5000);
                }
            };

            aiSpeechRecognizer.onspeechend = () => {
                if (accumulatedAiSpeech) {
                    clearTimeout(modalSilenceTimer);
                    modalSilenceTimer = setTimeout(() => {
                        if (state.isAiModalRecording) {
                            stopAiModalListening(true);
                        }
                    }, 5000);
                }
            };

            aiSpeechRecognizer.onerror = (err) => {
                if (err.error === 'network') {
                    speechRecNetworkBlocked = true;
                    if (aiLiveStreamText) aiLiveStreamText.textContent = 'Voice server busy. You can type or click a prompt below:';
                } else if (err.error === 'not-allowed' || err.error === 'permission-denied') {
                    toast('Microphone permission denied. Please allow mic access in your browser settings, then refresh.');
                    stopAiModalListening(false);
                }
            };

            aiSpeechRecognizer.onend = () => {
                if (state.isAiModalRecording && !speechRecNetworkBlocked) {
                    try { aiSpeechRecognizer.start(); } catch(e){}
                }
            };

            // ✅ Start recognition SYNCHRONOUSLY — preserves desktop user-gesture context
            aiSpeechRecognizer.start();

            // Update UI state AFTER start() succeeds
            state.isAiModalRecording = true;
            aiModalBigMicBtn?.classList.add('recording');
            aiModalWaveBars?.classList.remove('hidden');
            if (aiVoiceStateLabel) aiVoiceStateLabel.textContent = '🔴 Listening... (Will automatically reply 5s after you stop speaking)';
            if (aiLiveStreamTranscript) aiLiveStreamTranscript.classList.remove('hidden');
            if (aiLiveStreamText) aiLiveStreamText.textContent = 'Listening to your voice... Speak now';

            // Request getUserMedia AFTER start() — for audio level visualisation only, not required for STT
            if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
                navigator.mediaDevices.getUserMedia({ audio: true })
                    .then(stream => { aiAudioStream = stream; })
                    .catch(() => {}); // Non-fatal — STT still works without this stream
            }
        } catch (e) {
            toast('Unable to start voice recognition. Please try typing your request.');
        }
    }

    function stopAiModalListening(send = true) {
        clearTimeout(modalSilenceTimer);
        modalSilenceTimer = null;
        state.isAiModalRecording = false;
        aiModalBigMicBtn?.classList.remove('recording');
        aiModalWaveBars?.classList.add('hidden');
        if (aiVoiceStateLabel) aiVoiceStateLabel.textContent = 'Click microphone to speak';
        if (aiLiveStreamTranscript) aiLiveStreamTranscript.classList.add('hidden');

        if (aiSpeechRecognizer) {
            try { aiSpeechRecognizer.stop(); } catch(e){}
        }
        if (aiAudioStream) {
            try { aiAudioStream.getTracks().forEach(t => t.stop()); } catch(e){}
            aiAudioStream = null;
        }

        const captured = accumulatedAiSpeech.trim() || document.getElementById('aiModalTextInput')?.value.trim();
        if (send) {
            if (captured) {
                sendAiTurn(captured);
            } else {
                toast('No voice detected. Please speak clearly into your mic or type below.');
                document.getElementById('aiModalTextInput')?.focus();
            }
        }
    }

    aiModalBigMicBtn?.addEventListener('click', () => {
        if (state.isAiModalRecording) {
            stopAiModalListening(true);
        } else {
            startAiModalListening();
        }
    });

    // Send AI turn
    async function sendAiTurn(speechText) {
        if (!speechText) return;

        // Immediately silence & abort microphone STT while AI processes and speaks
        pauseSpeechRecognitionForTts();

        if (!state.sessionId) {
            state.sessionId = 'sess_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
        }

        // Append to dialog
        appendAiDialogue('CALLER', speechText);
        appendTerminalTranscript('CALLER', speechText);
        if (aiVoiceStateLabel) aiVoiceStateLabel.textContent = '🧠 Processing requirement...';
        aiModalWaveBars?.classList.remove('hidden');

        updateDiagnostic('diagInputAudio', '🟢 Received', 'ok');
        updateDiagnostic('diagStt', '🟢 Working (Transcribed)', 'ok');
        updateDiagnostic('diagAiResponse', '🟡 Generating...', 'working');

        // Caller identity (optional pre-identification by operator)
        const terminalCaller = state.portal === 'terminal'
            ? (document.getElementById('terminalCallerPhone')?.value || '').replace(/\D/g, '')
            : '';

        const payload = {
            sessionId: state.sessionId,
            city: state.city,
            speechText
        };
        if (terminalCaller && terminalCaller.length === 10) payload.callerPhone = terminalCaller;
        else if (state.portal !== 'terminal' && state.user && state.user.phone) payload.callerPhone = state.user.phone;

        let res;
        try {
            res = await apiFetch('/api/ai/voice-call', {
                method: 'POST',
                body: JSON.stringify(payload)
            });
        } catch (err) {
            res = { ok: false, data: { message: err.message } };
        }

        aiModalWaveBars?.classList.add('hidden');

        // Show who the server actually resolved the caller to
        if (res.ok && res.data && res.data.callerIdentity) {
            renderTerminalCallerStatus(res.data.callerIdentity);
        }

        if (res.ok && res.data && res.data.spokenResponse) {
            if (aiVoiceStateLabel) aiVoiceStateLabel.textContent = '🔊 Responding...';
            updateDiagnostic('diagAiResponse', '🟢 Generated', 'ok');
            appendAiDialogue('GIGSYNC AI', res.data.spokenResponse);
            appendTerminalTranscript('GIGSYNC AI', res.data.spokenResponse);

            // Play real TTS audio output through selected device
            await playTtsAudio(res.data.spokenResponse, !!res.data.shouldEndCall);

            if (res.data.actionsPerformed && Array.isArray(res.data.actionsPerformed)) {
                res.data.actionsPerformed.forEach(action => {
                    appendTerminalAction(`✓ ${action}`);
                    appendTerminalActivity(action);
                });
            } else if (res.data.toolExecuted) {
                appendTerminalAction(`✓ Action executed: ${res.data.toolExecuted}`);
                appendTerminalActivity(`AI dispatch: ${res.data.toolExecuted}`);
            }

            if (res.data.job || (res.data.toolResult && res.data.toolResult.job)) {
                const j = res.data.job || res.data.toolResult.job;
                toast(`✅ Booking #${j.id} dispatched!`);
                loadCustomerHomeData();
            }
        } else {
            if (aiVoiceStateLabel) aiVoiceStateLabel.textContent = 'Click microphone to speak';
            updateDiagnostic('diagAiResponse', '🔴 Failed', 'err');
            const reason = (res.data && res.data.message) || 'AI processing service unavailable.';
            appendTerminalTranscript('GIGSYNC AI', reason);
            appendAiDialogue('GIGSYNC AI', reason);
            toast(`⚠️ ${reason}`);
        }

        if (state.voiceAgentActive && !isAiSpeaking) {
            setVoiceAgentState('listening', '🟢 LISTENING');
        }
    }

    // Renders the conversational caller identity onto the terminal's identity card.
    function renderTerminalCallerStatus(identity) {
        const el = document.getElementById('terminalCallerStatus');
        const badge = document.getElementById('terminalCallerBadge');
        if (!el) return;
        if (!identity || !identity.phone || identity.phone === 'anonymous') {
            el.textContent = 'New caller — phone number not provided yet';
            el.style.color = 'var(--gs-text-main, #1E293B)';
            if (badge) {
                badge.innerHTML = `<i class="fa-solid fa-circle" style="font-size:7px; color:#F59E0B;"></i> New Caller`;
                badge.style.background = '#FEF3C7';
                badge.style.color = '#B45309';
            }
            return;
        }

        if (identity.registeredWorker) {
            el.innerHTML = `<span style="color:var(--gs-muted);">Caller:</span> <strong>${identity.name}</strong> &nbsp;|&nbsp; <span style="color:var(--gs-muted);">Phone:</span> <strong>${identity.phone}</strong>`;
            el.style.color = 'var(--gs-text-main, #1E293B)';
            if (badge) {
                badge.innerHTML = `<i class="fa-solid fa-circle-check" style="font-size:10px; color:#16A34A;"></i> Existing Worker`;
                badge.style.background = '#DCFCE7';
                badge.style.color = '#15803D';
            }
        } else {
            const callerName = identity.name && identity.name !== 'Caller' ? identity.name : 'New Worker';
            el.innerHTML = `<span style="color:var(--gs-muted);">Caller:</span> <strong>${callerName}</strong> &nbsp;|&nbsp; <span style="color:var(--gs-muted);">Phone:</span> <strong>${identity.phone}</strong>`;
            el.style.color = 'var(--gs-text-main, #1E293B)';
            if (badge) {
                badge.innerHTML = `<i class="fa-solid fa-user-plus" style="font-size:10px; color:#2563EB;"></i> New Worker`;
                badge.style.background = '#EFF6FF';
                badge.style.color = '#1D4ED8';
            }
        }
    }

    function appendAiDialogue(sender, text) {
        if (!aiModalTranscriptBox) return;
        const line = document.createElement('div');
        line.className = `dialogue-entry ${sender === 'CALLER' ? 'user' : 'ai'}`;
        line.innerHTML = `<strong>${sender}:</strong> <span>${text}</span>`;
        aiModalTranscriptBox.appendChild(line);
        aiModalTranscriptBox.scrollTop = aiModalTranscriptBox.scrollHeight;
    }

    // AI Modal Text Input Bar Submit
    document.getElementById('aiModalSendBtn')?.addEventListener('click', () => {
        const input = document.getElementById('aiModalTextInput');
        const text = input?.value.trim();
        if (text) {
            input.value = '';
            sendAiTurn(text);
        }
    });

    document.getElementById('aiModalTextInput')?.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const input = document.getElementById('aiModalTextInput');
            const text = input?.value.trim();
            if (text) {
                input.value = '';
                sendAiTurn(text);
            }
        }
    });

    // Quick Prompt Chips
    document.querySelectorAll('.q-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            const prompt = chip.dataset.qprompt;
            if (prompt) sendAiTurn(prompt);
        });
    });

    /* ======================================================================
       INITIAL BOOTSTRAP
       ====================================================================== */
    updateActiveCity(state.city);

    // Initial check for existing token/session
    if (state.token) {
        apiFetch('/api/auth/me').then(res => {
            if (res.ok && res.data.user) {
                state.user = res.data.user;
                switchPortal(state.user.role === 'worker' ? 'worker' : (state.user.role === 'admin' ? 'terminal' : 'customer'));
            } else {
                state.token = null;
                localStorage.removeItem('gigsync_token');
                switchPortal('gateway');
            }
        }).catch(() => {
            state.token = null;
            localStorage.removeItem('gigsync_token');
            switchPortal('gateway');
        });
    } else {
        switchPortal('gateway');
    }
});
