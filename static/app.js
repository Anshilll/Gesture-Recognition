document.addEventListener('DOMContentLoaded', () => {
    const video = document.getElementById('webcam');
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    const gestureResult = document.getElementById('gesture-result');
    const gestureCard = document.querySelector('.gesture-card');

    // Config
    const FPS = 10;
    const intervalTime = 1000 / FPS;

    let isPredicting = false;
    let lastGesture = "";

    // Initialize webcam
    async function setupCamera() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 640, height: 480 },
                audio: false
            });
            video.srcObject = stream;

            return new Promise((resolve) => {
                video.onloadedmetadata = () => {
                    resolve(video);
                };
            });
        } catch (error) {
            console.error("Error accessing webcam:", error);
            gestureResult.innerHTML = "Camera Error";
            gestureResult.className = "gesture-text placeholder";
        }
    }

    // Function to send frame to backend
    async function predictFrame() {
        if (isPredicting || video.paused || video.ended) return;

        isPredicting = true;

        // Match canvas size to video
        if (canvas.width !== video.videoWidth) {
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
        }

        // Draw video frame to canvas
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        // Get base64 image data
        const imageData = canvas.toDataURL('image/jpeg', 0.8);

        try {
            const response = await fetch('/predict', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({ image: imageData })
            });

            if (response.ok) {
                const data = await response.json();
                updateUI(data.gesture);
            }
        } catch (error) {
            console.error("Prediction error:", error);
        } finally {
            isPredicting = false;
        }
    }

    function updateUI(gesture) {
        // Silently ignore transient backend errors
        if (!gesture || gesture.startsWith('Error')) return;

        if (gesture === "Unknown") {
            gestureResult.textContent = "Waiting...";
            gestureResult.className = "gesture-text placeholder";
            gestureCard.classList.remove('active');
            lastGesture = "";
        } else {
            gestureResult.textContent = gesture;
            gestureResult.className = "gesture-text detected";
            gestureCard.classList.add('active');

            if (gesture !== lastGesture) {
                gestureResult.classList.remove('anim-trigger');
                void gestureResult.offsetWidth;
                gestureResult.classList.add('anim-trigger');
                lastGesture = gesture;
            }
        }
    }

    // Start everything
    async function main() {
        await setupCamera();
        video.play();

        // Start prediction loop
        setInterval(predictFrame, intervalTime);
    }

    main();
});
