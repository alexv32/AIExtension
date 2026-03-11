/**
 * History Module
 * Handles storage and retrieval of past chat conversations
 */
const HistoryModule = (() => {
    const STORAGE_KEY = 'chatHistory';
    const MAX_HISTORY = 50; // Limit total saved conversations

    /**
     * Get all conversations from storage
     */
    async function getAll() {
        try {
            const result = await chrome.storage.local.get(STORAGE_KEY);
            return result[STORAGE_KEY] || [];
        } catch (err) {
            console.error('[History] Failed to read from storage:', err);
            return [];
        }
    }

    /**
     * Save/Update a conversation
     * @param {Object} conversation { id, title, timestamp, messages, model, provider }
     */
    async function save(conversation) {
        let history = await getAll();
        const index = history.findIndex(h => h.id === conversation.id);

        if (index > -1) {
            // Update existing
            history[index] = { ...history[index], ...conversation, timestamp: Date.now() };
        } else {
            // Add new
            if (!conversation.id) conversation.id = 'chat_' + Date.now();
            if (!conversation.timestamp) conversation.timestamp = Date.now();

            // Generate title from first message if not provided
            if (!conversation.title && conversation.messages.length > 0) {
                const firstMsg = conversation.messages.find(m => m.role === 'user')?.content || 'New Chat';
                conversation.title = firstMsg.substring(0, 30) + (firstMsg.length > 30 ? '...' : '');
            }

            history.unshift(conversation);
        }

        // Limit history size
        if (history.length > MAX_HISTORY) {
            history = history.slice(0, MAX_HISTORY);
        }

        try {
            await chrome.storage.local.set({ [STORAGE_KEY]: history });
        } catch (err) {
            console.error('[History] Failed to save to storage:', err);
            throw new Error('Could not save chat history. Storage may be full or unavailable.');
        }
        return conversation;
    }

    /**
     * Get a specific conversation by ID
     */
    async function getById(id) {
        const history = await getAll();
        return history.find(h => h.id === id);
    }

    /**
     * Delete a conversation
     */
    async function deleteById(id) {
        let history = await getAll();
        history = history.filter(h => h.id !== id);
        try {
            await chrome.storage.local.set({ [STORAGE_KEY]: history });
        } catch (err) {
            console.error('[History] Failed to delete from storage:', err);
            throw new Error('Could not delete conversation. Storage may be unavailable.');
        }
    }

    /**
     * Clear all history
     */
    async function clearAll() {
        try {
            await chrome.storage.local.remove(STORAGE_KEY);
        } catch (err) {
            console.error('[History] Failed to clear storage:', err);
            throw new Error('Could not clear history. Storage may be unavailable.');
        }
    }

    /**
     * Search history for keywords
     */
    async function search(query) {
        const history = await getAll();
        const q = query.toLowerCase();
        return history.filter(h =>
            h.title.toLowerCase().includes(q) ||
            h.messages.some(m => m.content.toLowerCase().includes(q))
        );
    }

    return {
        getAll,
        save,
        getById,
        deleteById,
        clearAll,
        search
    };
})();
