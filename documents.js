/**
 * Documents Module
 * Handles PDF and DOCX file parsing and storage for AI context
 * Uses pdf.js for PDFs and mammoth.js for DOCX files
 */
const DocumentsModule = (() => {
    // Configure pdf.js worker (moved from chat.html to avoid CSP violation)
    if (typeof pdfjsLib !== 'undefined') {
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';
    }

    const STORAGE_KEY = 'uploadedDocuments';

    async function getAll() {
        try {
            const result = await chrome.storage.local.get(STORAGE_KEY);
            return result[STORAGE_KEY] || [];
        } catch (err) {
            console.error('[Documents] Failed to read from storage:', err);
            return [];
        }
    }

    async function save(docs) {
        try {
            await chrome.storage.local.set({ [STORAGE_KEY]: docs });
        } catch (err) {
            console.error('[Documents] Failed to save to storage:', err);
            throw new Error('Could not save documents. Storage may be full or unavailable.');
        }
    }

    async function addDocument(file) {
        const text = await parseFile(file);
        if (!text || text.trim().length === 0) {
            throw new Error('Could not extract text from file');
        }

        const doc = {
            id: Date.now().toString(36),
            name: file.name,
            size: file.size,
            type: file.type,
            text: text.substring(0, 50000), // Limit to ~50K chars
            addedAt: Date.now()
        };

        const docs = await getAll();
        docs.push(doc);
        await save(docs);
        return doc;
    }

    async function removeDocument(id) {
        const docs = await getAll();
        await save(docs.filter(d => d.id !== id));
    }

    async function parseFile(file) {
        const ext = file.name.split('.').pop().toLowerCase();
        if (ext === 'pdf') return await parsePDF(file);
        if (ext === 'docx') return await parseDOCX(file);
        throw new Error(`Unsupported file type: .${ext}`);
    }

    async function parsePDF(file) {
        // Use pdf.js if available, otherwise fallback to basic extraction
        if (typeof pdfjsLib !== 'undefined') {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const content = await page.getTextContent();
                const pageText = content.items.map(item => item.str).join(' ');
                fullText += pageText + '\n\n';
            }
            return fullText;
        }

        // Fallback: basic text extraction from PDF binary
        return await extractTextFallback(file);
    }

    async function parseDOCX(file) {
        // Use mammoth.js if available
        if (typeof mammoth !== 'undefined') {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            return result.value;
        }

        // Fallback: extract text from DOCX XML
        return await extractDOCXFallback(file);
    }

    async function extractTextFallback(file) {
        // Basic text extraction by reading the file as text and filtering.
        // NOTE: This only extracts ASCII printable characters (bytes 32–126).
        // Non-Latin scripts (Hebrew, Russian, CJK, etc.) will be silently dropped.
        // For proper multilingual support, ensure pdf.js is loaded.
        const buffer = await file.arrayBuffer();
        const bytes = new Uint8Array(buffer);
        let text = '';
        let inText = false;
        let current = '';

        for (let i = 0; i < bytes.length; i++) {
            const byte = bytes[i];
            if (byte >= 32 && byte <= 126) {
                current += String.fromCharCode(byte);
            } else {
                if (current.length > 4) {
                    text += current + ' ';
                }
                current = '';
            }
        }

        return text.replace(/\s+/g, ' ').trim();
    }

    async function extractDOCXFallback(file) {
        // DOCX is a ZIP file containing XML
        // Use basic extraction from the XML content
        try {
            const buffer = await file.arrayBuffer();
            const text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
            // Extract text between XML tags
            const matches = text.match(/<w:t[^>]*>([^<]+)<\/w:t>/g);
            if (matches) {
                return matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ');
            }
        } catch (e) { /* fallback failed */ }
        return '';
    }

    function getContextText(docs) {
        if (!docs || docs.length === 0) return '';
        let context = 'The user has provided the following reference documents:\n\n';
        docs.forEach((doc, i) => {
            context += `--- Document: ${doc.name} ---\n${doc.text}\n\n`;
        });
        return context;
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    return { getAll, addDocument, removeDocument, getContextText, formatSize };
})();
