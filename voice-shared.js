/**
 * Shared Voice Module
 * Handles cross-page wake word listening and speech engine state
 *
 * State is always read from chrome.storage.local rather than cached in memory,
 * so multiple pages never drift out of sync.
 */

const VoiceShared = (() => {
    let wakeWordRecognition = null;

    /** Read the current wake-word-enabled flag from storage (defaults to true). */
    const getWakeWordEnabled = async () => {
        try {
            const result = await chrome.storage.local.get('wakeWordEnabled');
            return result.wakeWordEnabled !== undefined ? result.wakeWordEnabled : true;
        } catch (err) {
            console.error('[VoiceShared] Failed to read wakeWordEnabled:', err);
            return true;
        }
    };

    /** Read the current AI name from storage (defaults to 'Assistant'). */
    const getAiName = async () => {
        try {
            const result = await chrome.storage.local.get('aiName');
            return result.aiName || 'Assistant';
        } catch (err) {
            console.error('[VoiceShared] Failed to read aiName:', err);
            return 'Assistant';
        }
    };

    const init = async (onDetected) => {
        const aiName = await getAiName();
        const enabled = await getWakeWordEnabled();

        const wakeWordName = document.getElementById('wakeWordName');
        const wakeToggle = document.getElementById('wakeToggle');

        if (wakeWordName) wakeWordName.textContent = aiName;

        if (wakeToggle) {
            wakeToggle.addEventListener('click', async () => {
                const current = await getWakeWordEnabled();
                const next = !current;
                await chrome.storage.local.set({ wakeWordEnabled: next });
                await updateUI();
                if (next) startListener(onDetected);
                else stopListener();
            });
        }

        await updateUI();
        if (enabled) startListener(onDetected);
    };

    const updateUI = async () => {
        const wakeWordBar = document.getElementById('wakeWordBar');
        if (wakeWordBar) {
            const enabled = await getWakeWordEnabled();
            if (enabled) wakeWordBar.classList.remove('disabled');
            else wakeWordBar.classList.add('disabled');
        }
    };

    const startListener = async (onDetected) => {
        const enabled = await getWakeWordEnabled();
        if (!enabled) return;
        if (wakeWordRecognition) return;

        const SR = window.webkitSpeechRecognition || window.SpeechRecognition;
        if (!SR) return;

        const aiName = await getAiName();

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

        wakeWordRecognition.onerror = async (event) => {
            if (event.error === 'not-allowed') {
                await chrome.storage.local.set({ wakeWordEnabled: false });
                await updateUI();
                return;
            }
            stopListener();
            setTimeout(() => startListener(onDetected), 1000);
        };

        wakeWordRecognition.onend = async () => {
            wakeWordRecognition = null;
            const stillEnabled = await getWakeWordEnabled();
            if (stillEnabled) {
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

    const isEnabled = async () => await getWakeWordEnabled();

    return { init, startListener, stopListener, isEnabled };
})();
