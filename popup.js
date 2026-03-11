/**
 * Popup Main Script
 * Handles navigation, dropdown menu, model badge, and button creation flow
 */
document.addEventListener('DOMContentLoaded', async () => {
    const menuBtn = document.getElementById('menuBtn');
    const dropdownMenu = document.getElementById('dropdownMenu');
    const settingsBtn = document.getElementById('settingsBtn');
    const chatBtn = document.getElementById('chatBtn');
    const addButtonBtn = document.getElementById('addButtonBtn');
    const addButtonModal = document.getElementById('addButtonModal');
    const closeModal = document.getElementById('closeModal');
    const cancelBtn = document.getElementById('cancelBtn');
    const createBtn = document.getElementById('createBtn');
    const modalLoading = document.getElementById('modalLoading');
    const linkModeBtn = document.getElementById('linkModeBtn');
    const aiModeBtn = document.getElementById('aiModeBtn');
    const linkFields = document.getElementById('linkFields');
    const aiFields = document.getElementById('aiFields');
    let activeMode = 'link'; // 'link' or 'ai'

    // Load current model
    await loadModelBadge();

    // Start wake word listener
    VoiceShared.init();

    // Mode Toggle Logic
    linkModeBtn.addEventListener('click', () => {
        activeMode = 'link';
        linkModeBtn.classList.add('active');
        aiModeBtn.classList.remove('active');
        linkFields.style.display = 'block';
        aiFields.style.display = 'none';
    });

    aiModeBtn.addEventListener('click', () => {
        activeMode = 'ai';
        aiModeBtn.classList.add('active');
        linkModeBtn.classList.remove('active');
        aiFields.style.display = 'block';
        linkFields.style.display = 'none';
    });

    // Load custom buttons
    await loadCustomButtons();

    // Dropdown menu toggle
    menuBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dropdownMenu.classList.toggle('show');
    });

    document.addEventListener('click', () => {
        dropdownMenu.classList.remove('show');
    });

    // Navigation
    settingsBtn.addEventListener('click', () => {
        window.location.href = 'settings.html';
    });

    chatBtn.addEventListener('click', () => {
        window.location.href = 'chat.html';
    });

    // Add button modal
    addButtonBtn.addEventListener('click', () => {
        dropdownMenu.classList.remove('show');
        addButtonModal.classList.add('show');
    });

    closeModal.addEventListener('click', closeAddModal);
    cancelBtn.addEventListener('click', closeAddModal);

    addButtonModal.addEventListener('click', (e) => {
        if (e.target === addButtonModal) closeAddModal();
    });

    // Create button
    createBtn.addEventListener('click', async () => {
        const name = document.getElementById('buttonName').value.trim();
        const url = document.getElementById('buttonUrl').value.trim();
        const description = document.getElementById('buttonDesc').value.trim();

        if (!name) {
            shakeElement(document.getElementById('buttonName'));
            return;
        }

        if (activeMode === 'link' && !url) {
            shakeElement(document.getElementById('buttonUrl'));
            return;
        }

        if (activeMode === 'ai' && !description) {
            shakeElement(document.getElementById('buttonDesc'));
            return;
        }

        const buttonData = { name };

        if (activeMode === 'link') {
            buttonData.url = url;
            buttonData.action = { action: 'openUrl', url: url };
        } else {
            buttonData.description = description;
            const settings = await chrome.storage.local.get(['selectedProvider', 'selectedModelId', 'encryptedApiKey']);
            if (!settings.selectedProvider || !settings.selectedModelId || !settings.encryptedApiKey) {
                alert('Please configure an AI model and API key in Settings first.');
                return;
            }

            modalLoading.classList.add('show');
            try {
                const apiKey = await CryptoModule.decrypt(settings.encryptedApiKey);
                const response = await chrome.runtime.sendMessage({
                    type: 'generate-button-action',
                    provider: settings.selectedProvider,
                    model: settings.selectedModelId,
                    apiKey: apiKey,
                    buttonName: name,
                    description: description
                });

                if (response.success) {
                    buttonData.action = response.action;
                } else {
                    throw new Error(response.error);
                }
            } catch (err) {
                console.error('Button generation error:', err);
                alert('AI failed to build your action: ' + err.message);
                modalLoading.classList.remove('show');
                return;
            }
            modalLoading.classList.remove('show');
        }

        const button = await CustomButtons.add(buttonData);
        const container = document.getElementById('customButtonsArea');
        CustomButtons.renderButton(button, container);
        CustomButtons.updateEmptyState();
        closeAddModal();
    });

    function closeAddModal() {
        addButtonModal.classList.remove('show');
        document.getElementById('buttonName').value = '';
        document.getElementById('buttonDesc').value = '';
        document.getElementById('buttonUrl').value = '';
        modalLoading.classList.remove('show');
        // Reset mode
        linkModeBtn.click();
    }

    function shakeElement(el) {
        el.style.animation = 'none';
        el.offsetHeight; // trigger reflow
        el.style.animation = 'shake 0.4s ease';
        el.style.borderColor = 'var(--error)';
        setTimeout(() => { el.style.borderColor = ''; }, 2000);
    }
});

async function loadModelBadge() {
    const badge = document.getElementById('modelBadge');
    const modelText = document.getElementById('currentModel');
    const result = await chrome.storage.local.get(['selectedProvider', 'selectedModelId', 'aiName']);

    // Show AI name in header
    if (result.aiName) {
        document.querySelector('.header-title h1').textContent = result.aiName;
    }

    if (result.selectedProvider && result.selectedModelId) {
        modelText.textContent = result.selectedModelId;
        badge.classList.remove('no-model');
    } else {
        modelText.textContent = 'No model selected';
        badge.classList.add('no-model');
    }
}

async function loadCustomButtons() {
    const buttons = await CustomButtons.getAll();
    const container = document.getElementById('customButtonsArea');
    buttons.forEach(btn => CustomButtons.renderButton(btn, container));
    CustomButtons.updateEmptyState();
}


// Wake word logic moved to voice-shared.js

