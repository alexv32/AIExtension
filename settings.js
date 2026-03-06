/**
 * Settings Page Script
 * Handles provider/model selection, API key encryption/storage, and UI interactions
 */

const MODEL_OPTIONS = {
    openai: [
        { id: 'gpt-4o', name: 'GPT-4o' },
        { id: 'gpt-4o-mini', name: 'GPT-4o Mini' },
        { id: 'gpt-4-turbo', name: 'GPT-4 Turbo' },
        { id: 'gpt-4.1', name: 'GPT-4.1' },
        { id: 'gpt-4.1-mini', name: 'GPT-4.1 Mini' },
        { id: 'o3-mini', name: 'o3-mini' },
        { id: 'o1', name: 'o1' },
        { id: 'o1-mini', name: 'o1 Mini' },
        { id: 'custom', name: '✏️ Custom model...' }
    ],
    google: [
        { id: 'gemini-2.5-pro', name: 'Gemini 2.5 Pro' },
        { id: 'gemini-2.5-flash', name: 'Gemini 2.5 Flash' },
        { id: 'gemini-2.5-flash-lite', name: 'Gemini 2.5 Flash Lite' },
        { id: 'gemini-2.0-flash', name: 'Gemini 2.0 Flash' },
        { id: 'gemini-2.0-flash-lite', name: 'Gemini 2.0 Flash Lite' },
        { id: 'gemini-1.5-pro', name: 'Gemini 1.5 Pro' },
        { id: 'gemini-1.5-flash', name: 'Gemini 1.5 Flash' },
        { id: 'custom', name: '✏️ Custom model...' }
    ],
    anthropic: [
        { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4' },
        { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet' },
        { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet' },
        { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku' },
        { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus' },
        { id: 'custom', name: '✏️ Custom model...' }
    ]
};

document.addEventListener('DOMContentLoaded', async () => {
    const backBtn = document.getElementById('backBtn');
    const providerSelect = document.getElementById('providerSelect');
    const modelSelect = document.getElementById('modelSelect');
    const modelGroup = document.getElementById('modelGroup');
    const customModelGroup = document.getElementById('customModelGroup');
    const customModelInput = document.getElementById('customModelInput');
    const aiNameInput = document.getElementById('aiNameInput');
    const namePreview = document.getElementById('namePreview');
    const apiKeyInput = document.getElementById('apiKeyInput');
    const toggleKey = document.getElementById('toggleKey');
    const saveBtn = document.getElementById('saveBtn');
    const saveFeedback = document.getElementById('saveFeedback');

    // Initialize Voice
    VoiceShared.init();

    // Load saved settings
    const saved = await chrome.storage.local.get([
        'selectedProvider', 'selectedModelId', 'encryptedApiKey', 'aiName'
    ]);

    if (saved.selectedProvider) {
        providerSelect.value = saved.selectedProvider;
        populateModels(saved.selectedProvider);
        modelGroup.style.display = 'flex';

        if (saved.selectedModelId) {
            // Check if the saved model is in the list
            const inList = MODEL_OPTIONS[saved.selectedProvider]?.some(
                m => m.id === saved.selectedModelId
            );
            if (inList) {
                modelSelect.value = saved.selectedModelId;
            } else {
                // It's a custom model
                modelSelect.value = 'custom';
                customModelGroup.style.display = 'flex';
                customModelInput.value = saved.selectedModelId;
            }
        }
    }

    if (saved.aiName) {
        aiNameInput.value = saved.aiName;
        namePreview.textContent = saved.aiName;
    }

    if (saved.encryptedApiKey) {
        try {
            const decrypted = await CryptoModule.decrypt(saved.encryptedApiKey);
            apiKeyInput.value = decrypted;
        } catch (e) {
            console.error('Failed to decrypt saved key:', e);
        }
    }

    // Live preview of wake word
    aiNameInput.addEventListener('input', () => {
        namePreview.textContent = aiNameInput.value.trim() || 'Name';
    });

    // Provider change → populate models
    providerSelect.addEventListener('change', () => {
        const provider = providerSelect.value;
        if (provider) {
            populateModels(provider);
            modelGroup.style.display = 'flex';
            modelGroup.style.animation = 'fadeIn 0.3s ease';
        } else {
            modelGroup.style.display = 'none';
            customModelGroup.style.display = 'none';
        }
        modelSelect.value = '';
        customModelInput.value = '';
    });

    // Model change → show/hide custom input
    modelSelect.addEventListener('change', () => {
        if (modelSelect.value === 'custom') {
            customModelGroup.style.display = 'flex';
            customModelGroup.style.animation = 'fadeIn 0.3s ease';
            customModelInput.focus();
        } else {
            customModelGroup.style.display = 'none';
            customModelInput.value = '';
        }
    });

    // Back navigation
    backBtn.addEventListener('click', () => {
        window.location.href = 'popup.html';
    });

    // Toggle key visibility
    toggleKey.addEventListener('click', () => {
        const isPassword = apiKeyInput.type === 'password';
        apiKeyInput.type = isPassword ? 'text' : 'password';
        toggleKey.title = isPassword ? 'Hide' : 'Show';
    });

    // Save settings
    saveBtn.addEventListener('click', async () => {
        const provider = providerSelect.value;
        const apiKey = apiKeyInput.value.trim();

        // Determine actual model ID
        let modelId = modelSelect.value;
        if (modelId === 'custom') {
            modelId = customModelInput.value.trim();
        }

        if (!provider) {
            providerSelect.style.borderColor = 'var(--error)';
            setTimeout(() => { providerSelect.style.borderColor = ''; }, 2000);
            return;
        }
        if (!modelId) {
            const target = modelSelect.value === 'custom' ? customModelInput : modelSelect;
            target.style.borderColor = 'var(--error)';
            setTimeout(() => { target.style.borderColor = ''; }, 2000);
            return;
        }
        if (!apiKey) {
            apiKeyInput.style.borderColor = 'var(--error)';
            setTimeout(() => { apiKeyInput.style.borderColor = ''; }, 2000);
            return;
        }

        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving...';

        try {
            const encrypted = await CryptoModule.encrypt(apiKey);
            const aiName = aiNameInput.value.trim();
            await chrome.storage.local.set({
                selectedProvider: provider,
                selectedModelId: modelId,
                encryptedApiKey: encrypted,
                aiName: aiName || 'Assistant'
            });

            saveFeedback.classList.add('show');
            const savedIcon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
            savedIcon.setAttribute('width', '16');
            savedIcon.setAttribute('height', '16');
            savedIcon.setAttribute('viewBox', '0 0 24 24');
            savedIcon.setAttribute('fill', 'none');
            savedIcon.setAttribute('stroke', 'currentColor');
            savedIcon.setAttribute('stroke-width', '2');
            savedIcon.innerHTML = '<polyline points="20 6 9 17 4 12"/>';

            saveBtn.textContent = '';
            saveBtn.appendChild(savedIcon);
            saveBtn.appendChild(document.createTextNode(' Saved!'));

            setTimeout(() => {
                saveFeedback.classList.remove('show');
                saveBtn.textContent = '';
                saveBtn.appendChild(savedIcon.cloneNode(true));
                saveBtn.appendChild(document.createTextNode(' Save Settings'));
                saveBtn.disabled = false;
            }, 2500);
        } catch (e) {
            console.error('Save error:', e);
            saveBtn.textContent = 'Error saving!';
            saveBtn.style.background = 'var(--error)';
            setTimeout(() => {
                saveBtn.textContent = 'Save Settings';
                saveBtn.style.background = '';
                saveBtn.disabled = false;
            }, 2000);
        }
    });

    function populateModels(provider) {
        const models = MODEL_OPTIONS[provider] || [];
        modelSelect.textContent = '';
        const defaultOpt = document.createElement('option');
        defaultOpt.value = '';
        defaultOpt.textContent = 'Select a model...';
        modelSelect.appendChild(defaultOpt);
        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.id;
            opt.textContent = m.name;
            modelSelect.appendChild(opt);
        });
        customModelGroup.style.display = 'none';
        customModelInput.value = '';
    }
});
