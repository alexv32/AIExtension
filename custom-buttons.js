/**
 * Custom Buttons Module
 * Handles storage, rendering, and execution of user-created dynamic buttons
 */
const CustomButtons = (() => {
    const STORAGE_KEY = 'customButtons';

    async function getAll() {
        try {
            const result = await chrome.storage.local.get(STORAGE_KEY);
            return result[STORAGE_KEY] || [];
        } catch (err) {
            console.error('[CustomButtons] Failed to read from storage:', err);
            return [];
        }
    }

    async function save(buttons) {
        try {
            await chrome.storage.local.set({ [STORAGE_KEY]: buttons });
        } catch (err) {
            console.error('[CustomButtons] Failed to save to storage:', err);
            throw new Error('Could not save buttons. Storage may be full or unavailable.');
        }
    }

    async function add(button) {
        const buttons = await getAll();
        button.id = Date.now().toString(36) + Math.random().toString(36).substr(2, 5);
        buttons.push(button);
        await save(buttons);
        return button;
    }

    async function remove(id) {
        const buttons = await getAll();
        const filtered = buttons.filter(b => b.id !== id);
        await save(filtered);
    }

    async function executeAction(action) {
        if (!action) return;

        switch (action.action) {
            case 'openUrl':
                chrome.tabs.create({ url: action.url });
                break;

            case 'openChat':
                // Store the chat context and open chat page
                await chrome.storage.session.set({
                    chatContext: {
                        systemPrompt: action.systemPrompt || '',
                        initialMessage: action.initialMessage || ''
                    }
                });
                window.location.href = 'chat.html';
                break;

            case 'safeScript':
                await executeSafeScript(action.scriptId, action.params);
                break;

            case 'menu':
                renderSubMenu(action.items);
                break;

            case 'composite':
                if (action.steps) {
                    for (const step of action.steps) {
                        await executeAction(step);
                    }
                }
                break;
        }
    }

    function renderSubMenu(items) {
        // Create a modal-like overlay for the sub-menu
        const overlay = document.createElement('div');
        overlay.className = 'modal-overlay show sub-menu-overlay';

        const modal = document.createElement('div');
        modal.className = 'modal sub-menu-modal';

        const header = document.createElement('div');
        header.className = 'modal-header';

        const title = document.createElement('h2');
        title.textContent = 'Select Action';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn-icon close-sub-menu';
        closeBtn.textContent = '×';

        header.appendChild(title);
        header.appendChild(closeBtn);

        const list = document.createElement('div');
        list.className = 'sub-menu-list';

        items.forEach(item => {
            const btn = document.createElement('button');
            btn.className = 'dropdown-item sub-menu-item';
            btn.textContent = item.name;
            btn.addEventListener('click', () => {
                executeAction(item.action);
                overlay.remove();
            });
            list.appendChild(btn);
        });

        modal.appendChild(header);
        modal.appendChild(list);
        overlay.appendChild(modal);

        closeBtn.addEventListener('click', () => overlay.remove());
        overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });

        document.body.appendChild(overlay);
    }

    function renderButton(button, container) {
        const wrapper = document.createElement('div');
        wrapper.className = 'custom-btn-wrapper';
        wrapper.dataset.buttonId = button.id;

        const mainBtn = document.createElement('button');
        mainBtn.className = 'main-btn custom-btn';

        const iconDiv = document.createElement('div');
        iconDiv.className = 'main-btn-icon';
        const iconSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        iconSvg.setAttribute('width', '20');
        iconSvg.setAttribute('height', '20');
        iconSvg.setAttribute('viewBox', '0 0 24 24');
        iconSvg.setAttribute('fill', 'none');
        iconSvg.setAttribute('stroke', 'currentColor');
        iconSvg.setAttribute('stroke-width', '2');

        if (button.url) {
            iconSvg.innerHTML = '<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>';
        } else {
            iconSvg.innerHTML = '<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>';
        }
        iconDiv.appendChild(iconSvg);

        const contentDiv = document.createElement('div');
        contentDiv.className = 'main-btn-content';

        const titleSpan = document.createElement('span');
        titleSpan.className = 'main-btn-title';
        titleSpan.textContent = button.name;

        const descSpan = document.createElement('span');
        descSpan.className = 'main-btn-desc';
        descSpan.textContent = button.description || button.url || 'Custom action';

        contentDiv.appendChild(titleSpan);
        contentDiv.appendChild(descSpan);

        const arrowSvg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        arrowSvg.setAttribute('class', 'main-btn-arrow');
        arrowSvg.setAttribute('width', '16');
        arrowSvg.setAttribute('height', '16');
        arrowSvg.setAttribute('viewBox', '0 0 24 24');
        arrowSvg.setAttribute('fill', 'none');
        arrowSvg.setAttribute('stroke', 'currentColor');
        arrowSvg.setAttribute('stroke-width', '2');
        const arrowPoly = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        arrowPoly.setAttribute('points', '9 18 15 12 9 6');
        arrowSvg.appendChild(arrowPoly);

        mainBtn.appendChild(iconDiv);
        mainBtn.appendChild(contentDiv);
        mainBtn.appendChild(arrowSvg);

        const deleteBtn = document.createElement('button');
        deleteBtn.className = 'custom-btn-delete';
        deleteBtn.title = 'Delete button';
        deleteBtn.textContent = '×';

        wrapper.appendChild(mainBtn);
        wrapper.appendChild(deleteBtn);

        // Click handler for the button
        mainBtn.addEventListener('click', () => {
            if (button.url && !button.action) {
                chrome.tabs.create({ url: button.url });
            } else if (button.action) {
                executeAction(button.action);
            }
        });

        // Delete handler
        deleteBtn.addEventListener('click', async (e) => {
            e.stopPropagation();
            wrapper.style.opacity = '0';
            wrapper.style.transform = 'translateX(20px)';
            wrapper.style.transition = 'all 0.3s ease';
            setTimeout(async () => {
                await remove(button.id);
                wrapper.remove();
                updateEmptyState();
            }, 300);
        });

        container.appendChild(wrapper);
    }

    function updateEmptyState() {
        const area = document.getElementById('customButtonsArea');
        const hint = document.getElementById('emptyHint');
        if (hint) {
            hint.style.display = area && area.children.length > 0 ? 'none' : 'block';
        }
    }

    async function executeSafeScript(id, params) {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (!tab) return;

        const SAFE_SCRIPTS = {
            'summarizePage': () => {
                const text = document.body.innerText.substring(0, 5000);
                chrome.runtime.sendMessage({ type: 'start-chat-with-text', text: "Summarize this page: " + text });
            },
            'extractLinks': () => {
                const links = Array.from(document.querySelectorAll('a')).map(a => a.href).slice(0, 20);
                console.log('Extracted links:', links);
                alert('Extracted ' + links.length + ' links. See console.');
            },
            'toggleTheme': () => {
                const current = document.documentElement.getAttribute('data-theme');
                document.documentElement.setAttribute('data-theme', current === 'dark' ? 'light' : 'dark');
            }
        };

        if (SAFE_SCRIPTS[id]) {
            await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                func: SAFE_SCRIPTS[id],
                args: [params]
            });
        } else {
            console.error('Unknown or unsafe script ID:', id);
        }
    }

    return { getAll, add, remove, executeAction, renderButton, updateEmptyState };
})();
