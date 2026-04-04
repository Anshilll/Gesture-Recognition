document.addEventListener('DOMContentLoaded', () => {
    // ─── DOM Elements ────────────────────────────────
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const gestureResult = document.getElementById('gesture-result');
    const gestureCard = document.getElementById('gesture-card');
    const gestureOverlay = document.getElementById('gesture-overlay');
    const gestureOverlayText = document.getElementById('gesture-overlay-text');
    const gestureHistory = document.getElementById('gesture-history');
    const clearGestureHistoryBtn = document.getElementById('clear-gesture-history');

    // Config
    const FPS = 10;
    const intervalTime = 1000 / FPS;
    let isPredicting = false;
    let lastGesture = "";
    let gestureHistoryItems = [];

    // ─── Text-to-Speech for Gestures ─────────────────
    let lastSpokenGesture = "";
    let ttsLastSpokeAt = 0;
    const TTS_COOLDOWN_MS = 2000; // minimum gap between spoken gestures

    function speakGesture(text) {
        if (!window.speechSynthesis) return;
        const now = Date.now();
        if (text === lastSpokenGesture && now - ttsLastSpokeAt < TTS_COOLDOWN_MS) return;

        // Cancel any in-progress utterance
        window.speechSynthesis.cancel();

        const utterance = new SpeechSynthesisUtterance(text);
        utterance.rate = 1.1;
        utterance.pitch = 1;
        utterance.volume = 1;
        utterance.lang = 'en-US';
        window.speechSynthesis.speak(utterance);

        lastSpokenGesture = text;
        ttsLastSpokeAt = now;
    }

    // ─── Voice Commands ──────────────────────────────
    const VOICE_COMMANDS = {
        'youtube':   'https://www.youtube.com',
        'twitter':   'https://www.twitter.com',
        'x':         'https://www.x.com',
        'google':    'https://www.google.com',
        'github':    'https://www.github.com',
        'instagram': 'https://www.instagram.com',
        'facebook':  'https://www.facebook.com',
        'linkedin':  'https://www.linkedin.com',
        'reddit':    'https://www.reddit.com',
        'gmail':     'https://mail.google.com',
        'chatgpt':   'https://chat.openai.com',
        'wikipedia': 'https://www.wikipedia.org',
        'whatsapp':  'https://web.whatsapp.com',
        'amazon':    'https://www.amazon.com',
        'netflix':   'https://www.netflix.com',
        'spotify':   'https://open.spotify.com',
    };

    function handleVoiceCommand(text) {
        const lower = text.toLowerCase().trim();
        // Match "open <site>" pattern
        const match = lower.match(/^(?:open|go to|launch|visit|show)\s+(.+)$/);
        if (!match) return false;

        const target = match[1].replace(/\s+/g, '').replace(/\.com|\.org|\.in/g, '');
        for (const [key, url] of Object.entries(VOICE_COMMANDS)) {
            if (target.includes(key)) {
                window.open(url, '_blank');
                showToast(`Opening ${key.charAt(0).toUpperCase() + key.slice(1)}...`, 'open_in_new');
                return true;
            }
        }
        return false;
    }

    // ─── Toast Notifications ─────────────────────────
    function showToast(message, icon = 'check_circle') {
        const container = document.getElementById('toast-container');
        if (!container) return;

        const toast = document.createElement('div');
        toast.className = 'toast-notification';
        toast.innerHTML = `
            <span class="material-symbols-rounded toast-icon">${icon}</span>
            <span class="toast-message">${message}</span>
        `;
        container.appendChild(toast);

        // Trigger slide-in
        requestAnimationFrame(() => toast.classList.add('visible'));

        // Auto-dismiss after 3s
        setTimeout(() => {
            toast.classList.remove('visible');
            toast.addEventListener('transitionend', () => toast.remove());
        }, 3000);
    }

    // ─── Particle Background ─────────────────────────
    const particlesCanvas = document.getElementById('particles-canvas');
    const pCtx = particlesCanvas.getContext('2d');
    let particles = [];

    function initParticles() {
        particlesCanvas.width = window.innerWidth;
        particlesCanvas.height = window.innerHeight;
        particles = [];
        const count = Math.min(80, Math.floor(window.innerWidth * window.innerHeight / 15000));
        for (let i = 0; i < count; i++) {
            particles.push({
                x: Math.random() * particlesCanvas.width,
                y: Math.random() * particlesCanvas.height,
                vx: (Math.random() - 0.5) * 0.4,
                vy: (Math.random() - 0.5) * 0.4,
                radius: Math.random() * 2 + 0.5,
                opacity: Math.random() * 0.4 + 0.1,
                color: Math.random() > 0.5 ? '0, 229, 255' : '178, 75, 255'
            });
        }
    }

    function animateParticles() {
        pCtx.clearRect(0, 0, particlesCanvas.width, particlesCanvas.height);
        particles.forEach((p, idx) => {
            p.x += p.vx;
            p.y += p.vy;
            if (p.x < 0) p.x = particlesCanvas.width;
            if (p.x > particlesCanvas.width) p.x = 0;
            if (p.y < 0) p.y = particlesCanvas.height;
            if (p.y > particlesCanvas.height) p.y = 0;

            pCtx.beginPath();
            pCtx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
            pCtx.fillStyle = `rgba(${p.color}, ${p.opacity})`;
            pCtx.fill();

            // Draw connections
            for (let j = idx + 1; j < particles.length; j++) {
                const q = particles[j];
                const dist = Math.sqrt((p.x - q.x) ** 2 + (p.y - q.y) ** 2);
                if (dist < 120) {
                    pCtx.beginPath();
                    pCtx.moveTo(p.x, p.y);
                    pCtx.lineTo(q.x, q.y);
                    pCtx.strokeStyle = `rgba(${p.color}, ${0.06 * (1 - dist / 120)})`;
                    pCtx.lineWidth = 0.5;
                    pCtx.stroke();
                }
            }
        });
        requestAnimationFrame(animateParticles);
    }

    initParticles();
    animateParticles();
    window.addEventListener('resize', initParticles);

    // ─── Webcam Setup ────────────────────────────────
    async function setupCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 },
                audio: false
            });
            video.srcObject = stream;
            return new Promise((resolve) => {
                video.onloadedmetadata = () => resolve(video);
            });
        } catch (error) {
            console.error("Error accessing webcam:", error);
            gestureResult.innerHTML = "Camera Error";
            gestureResult.className = "result-text gesture-text placeholder";
        }
    }

    // ─── Gesture Prediction ──────────────────────────
    async function predictFrame() {
        if (isPredicting || video.paused || video.ended) return;
        isPredicting = true;

        if (canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const imageData = canvas.toDataURL('image/jpeg', 0.8);

        try {
            const response = await fetch('/predict', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image: imageData })
            });

            if (response.ok) {
                const data = await response.json();
                updateGestureUI(data.gesture);
            }
        } catch (error) {
            console.error("Prediction error:", error);
        } finally {
            isPredicting = false;
        }
    }

    // ─── Gesture UI Update ───────────────────────────
    function updateGestureUI(gesture) {
        if (!gesture || gesture.startsWith('Error')) return;

        if (gesture === "Unknown") {
            gestureResult.textContent = "Waiting...";
            gestureResult.className = "result-text gesture-text placeholder";
            gestureCard.classList.remove('active');
            gestureOverlay.classList.remove('visible');
            lastGesture = "";
        } else {
            gestureResult.textContent = gesture;
            gestureResult.className = "result-text gesture-text detected";
            gestureCard.classList.add('active');

            // Overlay on video
            gestureOverlayText.textContent = gesture;
            gestureOverlay.classList.add('visible');

            // Highlight matching gesture chip
            highlightGestureChip(gesture);

            if (gesture !== lastGesture) {
                gestureResult.classList.remove('anim-trigger');
                void gestureResult.offsetWidth;
                gestureResult.classList.add('anim-trigger');
                addGestureToHistory(gesture);
                lastGesture = gesture;

                // Speak the gesture aloud
                speakGesture(gesture);
            }

            // Update confidence bar
            const confidenceFill = document.querySelector('.confidence-fill');
            if (confidenceFill) {
                confidenceFill.style.width = '85%';
            }
        }
    }

    function highlightGestureChip(gesture) {
        document.querySelectorAll('.gesture-chip').forEach(chip => {
            chip.classList.toggle('highlight', chip.dataset.gesture === gesture);
        });
    }

    function addGestureToHistory(gesture) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        gestureHistoryItems.unshift({ gesture, time: timeStr });
        if (gestureHistoryItems.length > 20) gestureHistoryItems.pop();
        renderGestureHistory();
    }

    function renderGestureHistory() {
        if (gestureHistoryItems.length === 0) {
            gestureHistory.innerHTML = '<div class="history-empty">No gestures detected yet</div>';
            return;
        }
        gestureHistory.innerHTML = gestureHistoryItems.map(item =>
            `<div class="history-item">
                <div class="history-dot" data-gesture="${item.gesture}"></div>
                <span class="history-gesture">${item.gesture}</span>
                <span class="history-time">${item.time}</span>
            </div>`
        ).join('');
    }

    clearGestureHistoryBtn.addEventListener('click', () => {
        gestureHistoryItems = [];
        renderGestureHistory();
    });

    // ─── Speech Recognition ──────────────────────────
    const micBtn = document.getElementById('mic-btn');
    const micIcon = document.getElementById('mic-icon');
    const micOffIcon = document.getElementById('mic-off-icon');
    const speechResult = document.getElementById('speech-result');
    const speechCard = document.getElementById('speech-card');
    const listeningIndicator = document.getElementById('listening-indicator');
    const transcriptEntries = document.getElementById('transcript-entries');
    const clearTranscriptBtn = document.getElementById('clear-transcript');

    let recognition = null;
    let isListening = false;
    let lastSpeechText = "";
    let speechTimeout = null;
    let transcriptItems = [];

    function initSpeechRecognition() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

        if (!SpeechRecognition) {
            micBtn.disabled = true;
            micBtn.title = "Speech recognition not supported in this browser";
            speechResult.textContent = "Not supported";
            speechResult.className = "result-text speech-text error";
            return;
        }

        recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = 'en-US';
        recognition.maxAlternatives = 1;

        recognition.onresult = (event) => {
            let interimTranscript = '';
            let finalTranscript = '';

            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript.trim();

                if (event.results[i].isFinal) {
                    finalTranscript += transcript + ' ';
                } else {
                    interimTranscript += transcript;
                }
            }

            // Display the FULL recognized text (not just keywords)
            if (finalTranscript.trim()) {
                // Check for voice commands first
                const wasCommand = handleVoiceCommand(finalTranscript.trim());
                updateSpeechUI(finalTranscript.trim(), true);
                addTranscriptEntry(finalTranscript.trim(), wasCommand);
            } else if (interimTranscript) {
                updateSpeechUI(interimTranscript, false);
            }
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            if (event.error === 'not-allowed') {
                speechResult.textContent = "Mic blocked";
                speechResult.className = "result-text speech-text error";
                stopListening();
            }
        };

        recognition.onend = () => {
            if (isListening) {
                try { recognition.start(); } catch (e) { /* ignore */ }
            }
        };
    }

    function updateSpeechUI(text, isFinal) {
        speechCard.classList.add('active');

        if (isFinal) {
            speechResult.textContent = text;
            speechResult.className = "result-text speech-text detected";
        } else {
            speechResult.textContent = text;
            speechResult.className = "result-text speech-text interim";
        }

        if (text !== lastSpeechText && isFinal) {
            speechResult.classList.remove('anim-trigger');
            void speechResult.offsetWidth;
            speechResult.classList.add('anim-trigger');
            lastSpeechText = text;
        }

        // Reset after 4 seconds of no new detection
        clearTimeout(speechTimeout);
        speechTimeout = setTimeout(() => {
            if (isListening) {
                speechResult.textContent = "Listening...";
                speechResult.className = "result-text speech-text placeholder listening";
                speechCard.classList.remove('active');
                lastSpeechText = "";
            }
        }, 4000);
    }

    function addTranscriptEntry(text, isCommand = false) {
        const now = new Date();
        const timeStr = now.toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        
        transcriptItems.push({ text, time: timeStr, isCommand });
        if (transcriptItems.length > 50) transcriptItems.shift();
        renderTranscript();
    }

    function renderTranscript() {
        if (transcriptItems.length === 0) {
            transcriptEntries.innerHTML = '<div class="transcript-empty">Transcript will appear here...</div>';
            return;
        }
        transcriptEntries.innerHTML = transcriptItems.map(item =>
            `<div class="transcript-entry${item.isCommand ? ' command-entry' : ''}">
                <span class="transcript-time">${item.time}</span>
                ${item.isCommand ? '<span class="material-symbols-rounded command-icon">open_in_new</span>' : ''}
                <span class="transcript-text">${item.text}</span>
            </div>`
        ).join('');
        // Auto-scroll to bottom
        transcriptEntries.scrollTop = transcriptEntries.scrollHeight;
    }

    clearTranscriptBtn.addEventListener('click', () => {
        transcriptItems = [];
        renderTranscript();
    });

    function startListening() {
        if (!recognition) return;
        try {
            recognition.start();
            isListening = true;
            micBtn.classList.add('active');
            micIcon.classList.add('hidden');
            micOffIcon.classList.remove('hidden');
            speechResult.textContent = "Listening...";
            speechResult.className = "result-text speech-text placeholder listening";
            listeningIndicator.classList.remove('hidden');
        } catch (e) {
            console.error('Could not start speech recognition:', e);
        }
    }

    function stopListening() {
        if (!recognition) return;
        isListening = false;
        try { recognition.stop(); } catch (e) { /* ignore */ }
        clearTimeout(speechTimeout);
        micBtn.classList.remove('active');
        micIcon.classList.remove('hidden');
        micOffIcon.classList.add('hidden');
        speechResult.textContent = "Click mic to start";
        speechResult.className = "result-text speech-text placeholder";
        speechCard.classList.remove('active');
        listeningIndicator.classList.add('hidden');
        lastSpeechText = "";
    }

    micBtn.addEventListener('click', () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    });

    initSpeechRecognition();

    // ─── Start Everything ────────────────────────────
    async function main() {
        await setupCamera();
        video.play();
        setInterval(predictFrame, intervalTime);
    }

    main();
});
