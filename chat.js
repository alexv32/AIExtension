/**
 * Chat Page Script
 * Multi-model AI chat with voice input and document context
 */
document.addEventListener('DOMContentLoaded', async () => {
    const backBtn = document.getElementById('backBtn');
    const docsMenuBtn = document.getElementById('docsMenuBtn');
    const docsDropdown = document.getElementById('docsDropdown');
    const fileUpload = document.getElementById('fileUpload');
    const docsList = document.getElementById('docsList');
    const docsEmpty = document.getElementById('docsEmpty');
    const messagesArea = document.getElementById('messagesArea');
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');
    const voiceBtn = document.getElementById('voiceBtn');
    const chatModelLabel = document.getElementById('chatModelLabel');
    const wakeWordBar = document.getElementById('wakeWordBar');
    const wakeWordName = document.getElementById('wakeWordName');
    const wakeToggle = document.getElementById('wakeToggle');
    const historyBtn = document.getElementById('historyBtn');
    const historyDrawer = document.getElementById('historyDrawer');
    const historyList = document.getElementById('historyList');
    const newChatBtn = document.getElementById('newChatBtn');
    const clearHistoryBtn = document.getElementById('clearHistoryBtn');

    let currentChatId = null;
    let conversationHistory = [];
    let currentProvider = null;
    let currentModel = null;
    let currentApiKey = null;
    let aiName = 'Assistant';
    let isProcessing = false;
    let recognition = null;
    let isRecording = false;
    let wakeWordRecognition = null;
    let wakeWordEnabled = true;

    // Initialize
    await loadSettings();
    await loadDocuments();
    await checkChatContext();
    await renderHistory();

    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('auto') === 'true') {
        // Delay slightly to ensure everything is ready
        setTimeout(() => toggleVoice(true), 500);
    } else {
        VoiceShared.init(() => toggleVoice(true));
    }

    // Back navigation
    backBtn.addEventListener('click', () => {
        window.location.href = 'popup.html';
    });

    // Documents dropdown
    docsMenuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        docsDropdown.classList.toggle('show');
    });

    document.addEventListener('click', (e) => {
        if (!docsDropdown.contains(e.target) && e.target !== docsMenuBtn) {
            docsDropdown.classList.remove('show');
        }
    });

    // File upload
    fileUpload.addEventListener('change', async (e) => {
        for (const file of e.target.files) {
            try {
                const doc = await DocumentsModule.addDocument(file);
                renderDocItem(doc);
                docsEmpty.style.display = 'none';
            } catch (err) {
                addErrorMessage(`Failed to process ${file.name}: ${err.message}`);
            }
        }
        fileUpload.value = '';
    });

    // Send message
    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    // Auto-resize textarea
    chatInput.addEventListener('input', () => {
        chatInput.style.height = 'auto';
        chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
    });

    // Voice input
    voiceBtn.addEventListener('click', toggleVoice);

    // Wake word toggle
    wakeToggle.addEventListener('click', () => {
        wakeWordEnabled = !wakeWordEnabled;
        if (wakeWordEnabled) {
            wakeWordBar.classList.remove('disabled');
            startWakeWordListener();
        } else {
            wakeWordBar.classList.add('disabled');
            stopWakeWordListener();
        }
    });

    // History toggle
    historyBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        historyDrawer.classList.toggle('show');
        if (historyDrawer.classList.contains('show')) renderHistory();
    });

    document.addEventListener('click', (e) => {
        if (!historyDrawer.contains(e.target) && e.target !== historyBtn) {
            historyDrawer.classList.remove('show');
        }
    });

    // New Chat
    newChatBtn.addEventListener('click', () => {
        startNewChat();
        historyDrawer.classList.remove('show');
    });

    // Clear History
    clearHistoryBtn.addEventListener('click', async () => {
        if (confirm('Are you sure you want to clear all chat history?')) {
            await HistoryModule.clearAll();
            renderHistory();
            startNewChat();
        }
    });

    // =================== Functions ===================

    async function loadSettings() {
        const settings = await chrome.storage.local.get(['selectedProvider', 'selectedModelId', 'encryptedApiKey', 'aiName']);

        if (settings.aiName) {
            aiName = settings.aiName;
            wakeWordName.textContent = aiName;
            document.querySelector('.chat-header-info h1').textContent = aiName;
        }

        if (settings.selectedProvider && settings.selectedModelId && settings.encryptedApiKey) {
            currentProvider = settings.selectedProvider;
            currentModel = settings.selectedModelId;
            try {
                currentApiKey = await CryptoModule.decrypt(settings.encryptedApiKey);
            } catch (e) {
                currentApiKey = null;
            }
            chatModelLabel.textContent = currentModel;
        } else {
            chatModelLabel.textContent = 'No model configured';
            addErrorMessage('Please configure an AI model and API key in Settings.');
        }
    }

    async function loadDocuments() {
        const docs = await DocumentsModule.getAll();
        if (docs.length > 0) {
            docsEmpty.style.display = 'none';
            docs.forEach(doc => renderDocItem(doc));
        }
    }

    async function checkChatContext() {
        // Check if opened with a predefined context (from custom button)
        try {
            const result = await chrome.storage.session.get('chatContext');
            if (result.chatContext) {
                const { systemPrompt, initialMessage } = result.chatContext;
                if (systemPrompt) {
                    conversationHistory.push({ role: 'system', content: systemPrompt });
                }
                if (initialMessage) {
                    // Clear welcome message and send the initial message
                    const welcome = messagesArea.querySelector('.welcome-message');
                    if (welcome) welcome.remove();
                    addMessageBubble('user', initialMessage);
                    conversationHistory.push({ role: 'user', content: initialMessage });
                    await getAIResponse();
                }
                // Clear the context so it doesn't re-trigger
                await chrome.storage.session.remove('chatContext');
            }
        } catch (e) {
            // session storage might not be available
        }
    }

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text || isProcessing) return;
        if (!currentModel || !currentApiKey || !currentProvider) {
            addErrorMessage('Please configure an AI model and API key in Settings.');
            return;
        }

        // Remove welcome message
        const welcome = messagesArea.querySelector('.welcome-message');
        if (welcome) welcome.remove();

        chatInput.value = '';
        chatInput.style.height = 'auto';
        addMessageBubble('user', text);
        conversationHistory.push({ role: 'user', content: text });
        await getAIResponse();
    }

    async function getAIResponse() {
        isProcessing = true;
        sendBtn.disabled = true;

        // Show typing indicator
        const typingEl = document.createElement('div');
        typingEl.className = 'message assistant';

        const avatarEl = document.createElement('div');
        avatarEl.className = 'message-avatar';
        avatarEl.textContent = '🤖';

        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'message-bubble';

        const indicator = document.createElement('div');
        indicator.className = 'typing-indicator';
        for (let i = 0; i < 3; i++) {
            indicator.appendChild(document.createElement('span'));
        }

        bubbleEl.appendChild(indicator);
        typingEl.appendChild(avatarEl);
        typingEl.appendChild(bubbleEl);
        messagesArea.appendChild(typingEl);
        scrollToBottom();

        try {
            // Build messages with document context
            const docs = await DocumentsModule.getAll();
            const contextText = DocumentsModule.getContextText(docs);
            const messages = [];

            // NEW: Add history summaries for awareness
            const recentHistory = await HistoryModule.getAll();
            const historySummaries = recentHistory
                .filter(h => h.id !== currentChatId)
                .slice(0, 5)
                .map(h => `- "${h.title}" (ID: ${h.id})`)
                .join('\n');

            const historyAwareness = historySummaries
                ? `\nYou are aware of these recent conversations:\n${historySummaries}\nIf the user asks about them, you can suggest they load that chat or you can try to recall details if they were in the current context.`
                : '';

            if (contextText) {
                messages.push({
                    role: 'system',
                    content: `Your name is ${aiName}. You are a helpful AI assistant. When the user addresses you, respond naturally to your name. ${contextText}${historyAwareness}`
                });
            } else {
                messages.push({
                    role: 'system',
                    content: `Your name is ${aiName}. You are a helpful AI assistant. When the user addresses you, respond naturally to your name. Be concise, clear, and helpful.${historyAwareness}`
                });
            }

            // Add any pre-existing system messages from context
            conversationHistory.forEach(msg => {
                if (msg.role === 'system' && messages.length <= 1) {
                    messages[0].content += '\n\nAdditional instructions: ' + msg.content;
                } else if (msg.role !== 'system') {
                    messages.push(msg);
                }
            });

            const response = await chrome.runtime.sendMessage({
                type: 'chat',
                provider: currentProvider,
                model: currentModel,
                messages: messages,
                apiKey: currentApiKey
            });

            // Remove typing indicator
            typingEl.remove();

            if (response.success) {
                addMessageBubble('assistant', response.message);
                conversationHistory.push({ role: 'assistant', content: response.message });
                await saveCurrentChat();
            } else {
                addErrorMessage(response.error || 'Failed to get AI response');
            }
        } catch (err) {
            typingEl.remove();
            addErrorMessage('Connection error: ' + err.message);
        }

        isProcessing = false;
        sendBtn.disabled = false;
        scrollToBottom();
    }

    function addMessageBubble(role, content) {
        const msgEl = document.createElement('div');
        msgEl.className = `message ${role}`;

        const avatarEl = document.createElement('div');
        avatarEl.className = 'message-avatar';
        avatarEl.textContent = role === 'user' ? '👤' : '🤖';

        const bubbleEl = document.createElement('div');
        bubbleEl.className = 'message-bubble';
        bubbleEl.textContent = content;

        msgEl.appendChild(avatarEl);
        msgEl.appendChild(bubbleEl);

        messagesArea.appendChild(msgEl);
        scrollToBottom();
    }

    function addErrorMessage(text) {
        const errEl = document.createElement('div');
        errEl.className = 'message-error';
        errEl.textContent = text;
        messagesArea.appendChild(errEl);
        scrollToBottom();
    }

    function scrollToBottom() {
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }

    // Voice input
    let isAutoSend = false;
    function toggleVoice(autoSend = false) {
        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
            addErrorMessage('Voice input is not supported in this browser.');
            return;
        }

        isAutoSend = autoSend;

        if (isRecording) {
            stopRecording();
            return;
        }

        const SpeechRecognition = window.webkitSpeechRecognition || window.SpeechRecognition;
        if (!SpeechRecognition) {
            addErrorMessage('Speech recognition is not supported in this browser.');
            return;
        }

        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = false; // Disable interim results to reduce network noise
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            isRecording = true;
            voiceBtn.classList.add('recording');
            chatInput.placeholder = 'Listening...';
        };

        recognition.onresult = (event) => {
            let transcript = '';
            for (let i = 0; i < event.results.length; i++) {
                transcript += event.results[i][0].transcript;
            }
            chatInput.value = transcript;
            chatInput.style.height = 'auto';
            chatInput.style.height = Math.min(chatInput.scrollHeight, 100) + 'px';
        };

        recognition.onerror = (event) => {
            console.error('Speech recognition error:', event.error);
            stopRecording();

            let message = 'Speech recognition failed.';
            if (event.error === 'not-allowed') {
                message = 'Microphone access denied. Please click the microphone icon and allow access in the browser prompt.';
            } else if (event.error === 'network') {
                message = 'Speech recognition requires an internet connection (Google STT service). Please check your network.';
            } else if (event.error === 'no-speech') {
                message = 'No speech detected. Please try again.';
            } else if (event.error === 'service-not-allowed') {
                message = 'Speech service not allowed. This can happen if the extension is in a restricted environment.';
            }

            addErrorMessage(message);
        };

        recognition.onend = () => {
            stopRecording();
        };

        recognition.start();
    }

    function stopRecording() {
        isRecording = false;
        voiceBtn.classList.remove('recording');
        chatInput.placeholder = 'Type a message...';

        const transcript = chatInput.value.trim();
        if (recognition) {
            recognition.stop();
            recognition = null;
        }

        if (isAutoSend && transcript) {
            sendMessage();
        }
        isAutoSend = false;

        // Restart wake word listener after manual recording ends
        VoiceShared.startListener(() => toggleVoice(true));
    }


    // Wake Word logic moved to voice-shared.js


    // Document rendering
    function renderDocItem(doc) {
        const item = document.createElement('div');
        item.className = 'doc-item';
        item.dataset.docId = doc.id;

        const iconSpan = document.createElement('span');
        iconSpan.className = 'doc-item-icon';
        const docIconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        docIconSvg.setAttribute('width', '16');
        docIconSvg.setAttribute('height', '16');
        docIconSvg.setAttribute('viewBox', '0 0 24 24');
        docIconSvg.setAttribute('fill', 'none');
        docIconSvg.setAttribute('stroke', 'currentColor');
        docIconSvg.setAttribute('stroke-width', '2');
        if (doc.name.endsWith('.pdf')) {
            docIconSvg.innerHTML = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>';
        } else {
            docIconSvg.innerHTML = '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>';
        }
        iconSpan.appendChild(docIconSvg);

        const nameSpan = document.createElement('span');
        nameSpan.className = 'doc-item-name';
        nameSpan.textContent = doc.name;

        const sizeSpan = document.createElement('span');
        sizeSpan.className = 'doc-item-size';
        sizeSpan.textContent = DocumentsModule.formatSize(doc.size);

        const removeBtn = document.createElement('button');
        removeBtn.className = 'doc-item-remove';
        removeBtn.title = 'Remove';
        removeBtn.textContent = '×';

        item.appendChild(iconSpan);
        item.appendChild(nameSpan);
        item.appendChild(sizeSpan);
        item.appendChild(removeBtn);

        item.querySelector('.doc-item-remove').addEventListener('click', async () => {
            await DocumentsModule.removeDocument(doc.id);
            item.style.opacity = '0';
            setTimeout(() => {
                item.remove();
                const remaining = docsList.querySelectorAll('.doc-item');
                if (remaining.length === 0) docsEmpty.style.display = 'block';
            }, 200);
        });

        docsList.appendChild(item);
    }

    // =================== History Functions ===================

    async function saveCurrentChat() {
        if (conversationHistory.length === 0) return;

        const chat = {
            id: currentChatId || 'chat_' + Date.now(),
            messages: conversationHistory,
            model: currentModel,
            provider: currentProvider
        };

        const saved = await HistoryModule.save(chat);
        currentChatId = saved.id;
        renderHistory();
    }

    async function renderHistory() {
        const history = await HistoryModule.getAll();
        historyList.textContent = '';

        if (history.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'docs-empty';
            empty.textContent = 'No past chats';
            historyList.appendChild(empty);
            return;
        }

        history.forEach(chat => {
            const item = document.createElement('div');
            item.className = `history-item ${chat.id === currentChatId ? 'active' : ''}`;

            const header = document.createElement('div');
            header.className = 'history-item-header';

            const title = document.createElement('div');
            title.className = 'history-item-title';
            title.textContent = chat.title || 'Untitled Chat';

            const recallBtn = document.createElement('button');
            recallBtn.className = 'recall-btn';
            recallBtn.title = 'Recall into current chat';

            const recallIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            recallIcon.setAttribute('width', '12');
            recallIcon.setAttribute('height', '12');
            recallIcon.setAttribute('viewBox', '0 0 24 24');
            recallIcon.setAttribute('fill', 'none');
            recallIcon.setAttribute('stroke', 'currentColor');
            recallIcon.setAttribute('stroke-width', '2');

            const recallPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            recallPath.setAttribute('d', 'M11 17l-5-5m0 0l5-5m-5 5h12');
            recallIcon.appendChild(recallPath);

            recallBtn.appendChild(recallIcon);
            header.appendChild(title);
            header.appendChild(recallBtn);

            const meta = document.createElement('div');
            meta.className = 'history-item-meta';
            const date = new Date(chat.timestamp).toLocaleDateString();
            meta.textContent = `${date} • ${chat.model}`;

            item.appendChild(header);
            item.appendChild(meta);

            item.addEventListener('click', (e) => {
                if (e.target.closest('.recall-btn')) {
                    recallChat(chat.id);
                } else {
                    loadChat(chat.id);
                }
            });
            historyList.appendChild(item);
        });
    }

    async function recallChat(id) {
        const chat = await HistoryModule.getById(id);
        if (!chat) return;

        // Append past history to current conversation as a summary/context
        const summary = chat.messages
            .filter(m => m.role !== 'system')
            .slice(-10) // last 10 messages
            .map(m => `${m.role}: ${m.content}`)
            .join('\n');

        conversationHistory.push({
            role: 'system',
            content: `User recalled previous conversation "${chat.title}":\n\n${summary}`
        });

        addMessageBubble('assistant', `I've recalled the context from "${chat.title}". How can I help with that?`);
        historyDrawer.classList.remove('show');
    }

    async function loadChat(id) {
        const chat = await HistoryModule.getById(id);
        if (!chat) return;

        currentChatId = chat.id;
        conversationHistory = chat.messages;

        // Clear current messages
        messagesArea.textContent = '';

        // Re-render bubbles
        conversationHistory.forEach(msg => {
            if (msg.role !== 'system') {
                addMessageBubble(msg.role, msg.content);
            }
        });

        historyDrawer.classList.remove('show');
        renderHistory();
    }

    function startNewChat() {
        currentChatId = null;
        conversationHistory = [];
        messagesArea.textContent = '';

        const welcome = document.createElement('div');
        welcome.className = 'welcome-message';

        const iconDiv = document.createElement('div');
        iconDiv.className = 'welcome-icon';
        const welcomeIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        welcomeIcon.setAttribute('width', '32');
        welcomeIcon.setAttribute('height', '32');
        welcomeIcon.setAttribute('viewBox', '0 0 24 24');
        welcomeIcon.setAttribute('fill', 'none');
        welcomeIcon.setAttribute('stroke', 'currentColor');
        welcomeIcon.setAttribute('stroke-width', '1.5');

        const welcomePaths = [
            'M12 2L2 7l10 5 10-5-10-5z',
            'M2 17l10 5 10-5',
            'M2 12l10 5 10-5'
        ];
        welcomePaths.forEach(d => {
            const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
            path.setAttribute('d', d);
            welcomeIcon.appendChild(path);
        });
        iconDiv.appendChild(welcomeIcon);

        const title = document.createElement('h2');
        title.textContent = 'Hello! How can I help?';

        const p = document.createElement('p');
        p.textContent = 'Ask me anything, or upload documents for context-aware assistance.';

        welcome.appendChild(iconDiv);
        welcome.appendChild(title);
        welcome.appendChild(p);

        messagesArea.appendChild(welcome);
    }
});
