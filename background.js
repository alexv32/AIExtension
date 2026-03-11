/**
 * Background Service Worker
 * Handles all AI API calls to avoid CORS issues
 */

// Configure sidebar to open on action click
chrome.sidePanel
    .setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error(error));

// Keyboard shortcut listener
chrome.commands.onCommand.addListener((command) => {
    if (command === "open-sidebar") {
        chrome.windows.getCurrent({ populate: true }, (window) => {
            chrome.sidePanel.open({ windowId: window.id });
        });
    }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'chat') {
        handleChatRequest(message).then(sendResponse).catch(err => {
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }

    if (message.type === 'generate-button-action') {
        handleButtonGeneration(message).then(sendResponse).catch(err => {
            sendResponse({ success: false, error: err.message });
        });
        return true;
    }
});

async function handleChatRequest({ provider, model, messages, apiKey }) {
    if (!provider) {
        return { success: false, error: 'Missing provider. Please select a provider in Settings.' };
    }
    const modelId = model;
    switch (provider) {
        case 'openai':
            return await callOpenAI(apiKey, messages, modelId);
        case 'google':
            return await callGemini(apiKey, messages, modelId);
        case 'anthropic':
            return await callClaude(apiKey, messages, modelId);
        default:
            return { success: false, error: `Unknown provider: ${provider}` };
    }
}

async function callOpenAI(apiKey, messages, modelId) {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
            model: modelId || 'gpt-4o',
            messages: messages,
            max_tokens: 4096
        })
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const status = response.status;
        const msg = errData.error?.message || `Status ${status}`;
        console.error(`OpenAI Error (${status}):`, errData);
        throw new Error(`OpenAI API Error: ${msg}`);
    }

    const data = await response.json();
    return { success: true, message: data.choices[0].message.content };
}

async function callGemini(apiKey, messages, modelId) {
    const contents = [];
    let systemInstruction = null;

    for (const msg of messages) {
        if (msg.role === 'system') {
            systemInstruction = msg.content;
        } else {
            contents.push({
                role: msg.role === 'assistant' ? 'model' : 'user',
                parts: [{ text: msg.content }]
            });
        }
    }

    const body = { contents };
    if (systemInstruction) {
        body.system_instruction = { parts: [{ text: systemInstruction }] };
    }

    const geminiModel = modelId || 'gemini-2.0-flash';
    // Force v1beta because system_instruction is not reliably supported in v1 REST endpoint yet
    const endpoint = 'v1beta';

    console.log(`Calling Gemini API: ${geminiModel} (Endpoint: ${endpoint})`);

    const response = await fetch(
        `https://generativelanguage.googleapis.com/${endpoint}/models/${geminiModel}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }
    );

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const status = response.status;
        const msg = errData.error?.message || (Array.isArray(errData) ? errData[0]?.error?.message : null) || `Status ${status}`;
        console.error(`Gemini Error (${status}):`, errData);
        throw new Error(`Gemini API Error: ${msg}`);
    }

    const data = await response.json();
    const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!text) throw new Error('No response from Gemini');
    return { success: true, message: text };
}

async function callClaude(apiKey, messages, modelId) {
    let systemPrompt = '';
    const claudeMessages = [];

    for (const msg of messages) {
        if (msg.role === 'system') {
            systemPrompt = msg.content;
        } else {
            claudeMessages.push({ role: msg.role, content: msg.content });
        }
    }

    const body = {
        model: modelId || 'claude-3-5-sonnet-20241022',
        max_tokens: 4096,
        messages: claudeMessages
    };
    if (systemPrompt) body.system = systemPrompt;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify(body)
    });

    if (!response.ok) {
        const errData = await response.json().catch(() => ({}));
        const status = response.status;
        const msg = errData.error?.message || `Status ${status}`;
        console.error(`Claude Error (${status}):`, errData);
        throw new Error(`Claude API Error: ${msg}`);
    }

    const data = await response.json();
    return { success: true, message: data.content[0].text };
}

async function handleButtonGeneration({ description, provider, model, apiKey, buttonName }) {
    const messages = [
        {
            role: 'system',
            content: `You are a Senior Chrome Extension Architect. Your task is to generate a JSON configuration for a custom button action.
The user will provide a description of the functionality they want. You must design a robust, efficient solution.

Available Action Types:
1. { "action": "openUrl", "url": "https://..." } - Opens a specific URL.
2. { "action": "openChat", "systemPrompt": "...", "initialMessage": "..." } - Opens the AI chat with specific context.
3. { "action": "safeScript", "scriptId": "...", "params": {...} } - Executes a predefined safe task (IDs: 'summarizePage', 'extractLinks', 'toggleTheme').
4. { "action": "menu", "items": [{ "name": "...", "action": {...} }, ...] } - Renders a sub-menu of actions.
5. { "action": "composite", "steps": [...] } - Executes multiple actions in sequence.

Architectural Guidelines:
- For multi-step tasks, use "composite".
- For grouping related features (like media controls), use "menu".
- Ensure scripts are self-contained and handle errors gracefully.
- If the request is vague, default to a helpful "openChat" configuration.

OUTPUT: Return ONLY the JSON object. No markdown, no explanation, no backticks.`
        },
        {
            role: 'user',
            content: `Architect a solution for a button named "${buttonName}" with this objective: ${description}`
        }
    ];

    const result = await handleChatRequest({ provider, model, messages, apiKey });
    if (!result.success) return result;

    try {
        // Robust JSON extraction: look for the first '{' and last '}'
        const firstBrace = result.message.indexOf('{');
        const lastBrace = result.message.lastIndexOf('}');

        if (firstBrace === -1 || lastBrace === -1) {
            throw new Error('No JSON object found in AI response');
        }

        const jsonStr = result.message.substring(firstBrace, lastBrace + 1);
        const action = JSON.parse(jsonStr);
        return { success: true, action };
    } catch (e) {
        console.error('Action parsing error:', e, 'Raw message:', result.message);
        return { success: false, error: 'AI generated an invalid configuration: ' + e.message };
    }
}
