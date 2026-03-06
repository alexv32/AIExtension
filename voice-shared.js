/**
 * Shared Voice Module
 * Handles cross-page wake word listening and speech engine state
 */

const VoiceShared = (() => {
    let wakeWordRecognition = null;
    let wakeWordEnabled = true;
    let aiName = 'Assistant';

    const init = async (onDetected) => {
        const settings = await chrome.storage.local.get(['aiName', 'wakeWordEnabled']);
        if (settings.aiName) aiName = settings.aiName;
        if (settings.wakeWordEnabled !== undefined) wakeWordEnabled = settings.wakeWordEnabled;

        const wakeWordBar = document.getElementById('wakeWordBar');
        const wakeWordName = document.getElementById('wakeWordName');
        const wakeToggle = document.getElementById('wakeToggle');

        if (wakeWordName) wakeWordName.textContent = aiName;

        if (wakeToggle) {
            wakeToggle.addEventListener('click', () => {
                wakeWordEnabled = !wakeWordEnabled;
                chrome.storage.local.set({ wakeWordEnabled });
                updateUI();
                if (wakeWordEnabled) startListener(onDetected);
                else stopListener();
            });
        }

        updateUI();
        if (wakeWordEnabled) startListener(onDetected);
    };

    const updateUI = () => {
        const wakeWordBar = document.getElementById('wakeWordBar');
        if (wakeWordBar) {
            if (wakeWordEnabled) wakeWordBar.classList.remove('disabled');
            else wakeWordBar.classList.add('disabled');
        }
    };

    const startListener = (onDetected) => {
        if (!wakeWordEnabled) return;
        if (wakeWordRecognition) return;

        const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
        if (!SR) return;

        wakeWordRecognition = new SR();
        wakeWordRecognition.continuous = true;
        wakeWordRecognition.interimResults = true;
        wakeWordRecognition.lang = 'en-US';

        wakeWordRecognition.onresult = (event) => {
            for (let i = event.resultIndex; i < event.results.length; i++) {
                const transcript = event.results[i][0].transcript.toLowerCase().trim();
                const wakePhrase = `hey ${aiName.toLowerCase()}`;

                if (transcript.includes(wakePhrase)) {
                    console.log('[VoiceShared] Wake phrase detected!');

                    const wakeWordBar = document.getElementById('wakeWordBar');
                    if (wakeWordBar) wakeWordBar.classList.add('listening');

                    // If we have an onDetected callback (like in chat.js), use it for transition
                    if (onDetected) {
                        wakeWordRecognition.onend = () => {
                            wakeWordRecognition = null;
                            if (wakeWordBar) wakeWordBar.classList.remove('listening');
                            onDetected();
                        };
                        wakeWordRecognition.stop();
                    } else {
                        // Default behavior: redirect to chat with auto-send
                        window.location.href = 'chat.html?auto=true';
                    }
                    return;
                }
            }
        };

        wakeWordRecognition.onerror = (event) => {
            if (event.error === 'not-allowed') {
                wakeWordEnabled = false;
                updateUI();
                return;
            }
            stopListener();
            setTimeout(() => startListener(onDetected), 1000);
        };

        wakeWordRecognition.onend = () => {
            wakeWordRecognition = null;
            if (wakeWordEnabled) {
                setTimeout(() => startListener(onDetected), 300);
            }
        };

        try { wakeWordRecognition.start(); } catch (e) { wakeWordRecognition = null; }
    };

    const stopListener = () => {
        if (wakeWordRecognition) {
            wakeWordRecognition.onend = null;
            try { wakeWordRecognition.stop(); } catch (e) { }
            wakeWordRecognition = null;
        }
    };

    const isEnabled = () => wakeWordEnabled;

    return { init, startListener, stopListener, isEnabled };
})();
