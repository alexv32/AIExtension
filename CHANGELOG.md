# Changelog

All notable changes to this project will be documented in this file.

## [1.1.0] - 2026-03-11

### Added
- **Chat History Module**: Full persistence for conversations with search capabilities and title auto-generation.
- **Custom Button Engine**: Users can now create dynamic buttons that trigger AI actions, open URLs, or execute safe scripts.
- **Document Context**: Support for PDF and DOCX uploads to provide grounding for AI responses.
- **Multi-Provider Support**: Added Anthropic (Claude) and Google (Gemini) alongside OpenAI.

### Fixed & Improved (Code Review Round)
- **Voice Lifecycle Sync**: Fixed a subtle bug where the wake word state could drift between pages by moving to a **Storage-First State** architecture. Variables are no longer cached at the module level; instead, they are read directly from `chrome.storage.local` on every access.
- **Brittle Provider Heuristic**: Removed the `detectProvider` function which relied on model name prefixes. The system now requires an explicit provider, making it future-proof against new model naming conventions.
- **Storage Resilience**: Wrapped all `chrome.storage` calls in `try/catch` blocks across `custom-buttons.js`, `history.js`, and `documents.js` to handle quota or corruption errors gracefully.
- **Dead Code Cleanup**: Removed several unused helper functions and variables (e.g., `escapeHtml`, unused `wakeWordRecognition` declarations) to keep the bundle lean.

### Architectural Decisions
- **RCE Prevention**: Implemented a "Safe Script" registry for custom buttons. Rather than allowing arbitrary string execution (eval), buttons reference hardcoded function IDs, preventing remote code execution vulnerabilities.
- **Storage-First Truth**: To avoid state drift in a multi-page extension (popup, sidebar, chat page), `chrome.storage.local` is used as the single source of truth for all reactive state (Wake Word enabled, AI Name, etc.).
- **Graceful Document Fallback**: Designed a multi-tier document parser that uses heavy libraries (`pdf.js`, `mammoth.js`) when available but falls back to basic binary/XML extraction if they fail to load, ensuring core functionality remains available.
