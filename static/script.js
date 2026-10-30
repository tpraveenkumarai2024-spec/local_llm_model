/**
 * ============================================================================
 * Local Open-Source LLM Chatbot PRO - Advanced Frontend Engine
 * ============================================================================
 * Features:
 * - 5-Theme visual switcher with instant persistence (localStorage)
 * - Real-Time Server-Sent Events (SSE) Token Streaming with AbortController
 * - Performance Telemetry: tokens/second, total tokens, evaluation duration
 * - AI Personas: General, Senior Architect, Technical Educator, Concise, Creative
 * - Chat Sessions & History Drawer (Save, load, and delete multiple chats)
 * - Voice Input (Speech-to-Text via Web Speech API)
 * - Text-to-Speech (Read Aloud via Web SpeechSynthesis)
 * - In-app Local Model Manager (Download Ollama models directly from the UI)
 * - Export Conversation (Markdown, Plain Text, JSON)
 * - Rich Markdown parsing with functional syntax-styled code copy
 * ============================================================================
 */

document.addEventListener('DOMContentLoaded', () => {
    // ------------------------------------------------------------------------
    // DOM Element References
    // ------------------------------------------------------------------------
    // Layout & Sidebar
    const appSidebar = document.getElementById('app-sidebar');
    const sidebarToggleBtn = document.getElementById('sidebar-toggle-btn');
    const sidebarBackdrop = document.getElementById('sidebar-backdrop');
    const newChatBtn = document.getElementById('new-chat-btn');
    const sidebarSessions = document.getElementById('sidebar-sessions');

    // Header Controls
    const statusIndicator = document.getElementById('status-indicator');
    const statusText = document.getElementById('status-text');
    const refreshStatusBtn = document.getElementById('refresh-status-btn');
    const modelSelect = document.getElementById('model-select');
    const themeSelect = document.getElementById('theme-select');
    const exportChatBtn = document.getElementById('export-chat-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const headerPersonaTag = document.getElementById('header-persona-tag');

    // Main Chat
    const chatContainer = document.getElementById('chat-container');
    const chatMessages = document.getElementById('chat-messages');
    const welcomeScreen = document.getElementById('welcome-screen');
    const loadingIndicator = document.getElementById('loading-indicator');
    const loadingStatusText = document.getElementById('loading-status-text');
    const errorBanner = document.getElementById('error-banner');
    const errorMessage = document.getElementById('error-message');
    const dismissErrorBtn = document.getElementById('dismiss-error-btn');

    // Input & Tools
    const chatForm = document.getElementById('chat-form');
    const userInput = document.getElementById('user-input');
    const sendBtn = document.getElementById('send-btn');
    const stopBtn = document.getElementById('stop-btn');
    const voiceBtn = document.getElementById('voice-btn');
    const metaTempLabel = document.getElementById('meta-temp-label');
    const metaStreamLabel = document.getElementById('meta-stream-label');
    const suggestionCards = document.querySelectorAll('.suggestion-card');

    // Modals
    const settingsModal = document.getElementById('settings-modal');
    const openSettingsBtn = document.getElementById('open-settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const personaSelect = document.getElementById('persona-select');
    const temperatureSlider = document.getElementById('temperature-slider');
    const tempDisplay = document.getElementById('temp-display');
    const streamingToggle = document.getElementById('streaming-toggle');

    const modelsModal = document.getElementById('models-modal');
    const openModelsBtn = document.getElementById('open-models-btn');
    const closeModelsBtn = document.getElementById('close-models-btn');
    const pullModelBtn = document.getElementById('pull-model-btn');
    const newModelName = document.getElementById('new-model-name');
    const pullProgressBox = document.getElementById('pull-progress-box');
    const pullProgressBar = document.getElementById('pull-progress-bar');
    const pullStatusLabel = document.getElementById('pull-status-label');
    const pullLog = document.getElementById('pull-log');
    const installedModelsList = document.getElementById('installed-models-list');
    const presetChips = document.querySelectorAll('.preset-chip');

    const exportModal = document.getElementById('export-modal');
    const closeExportBtn = document.getElementById('close-export-btn');
    const exportMdBtn = document.getElementById('export-md-btn');
    const exportTxtBtn = document.getElementById('export-txt-btn');
    const exportJsonBtn = document.getElementById('export-json-btn');

    // ------------------------------------------------------------------------
    // Application State
    // ------------------------------------------------------------------------
    let sessions = JSON.parse(localStorage.getItem('local_llm_sessions') || '[]');
    let currentSessionId = localStorage.getItem('local_llm_active_session') || null;
    let conversationHistory = []; // Active session messages
    let isGenerating = false;
    let abortController = null;

    // Configurable Settings
    let currentTheme = localStorage.getItem('local_llm_theme') || 'nebula';
    let currentPersona = localStorage.getItem('local_llm_persona') || 'general';
    let currentTemp = parseFloat(localStorage.getItem('local_llm_temp') || '0.7');
    let isStreamingEnabled = localStorage.getItem('local_llm_stream') !== 'false';

    // ------------------------------------------------------------------------
    // 1. Theme Engine
    // ------------------------------------------------------------------------
    function applyTheme(themeName) {
        document.documentElement.setAttribute('data-theme', themeName);
        themeSelect.value = themeName;
        localStorage.setItem('local_llm_theme', themeName);
        currentTheme = themeName;
    }

    themeSelect.addEventListener('change', (e) => {
        applyTheme(e.target.value);
    });

    applyTheme(currentTheme);

    // ------------------------------------------------------------------------
    // 2. Settings & Persona Manager
    // ------------------------------------------------------------------------
    const PERSONA_LABELS = {
        general: 'Persona: General AI',
        coder: 'Persona: Code Architect',
        explainer: 'Persona: Tech Educator',
        concise: 'Persona: Ultra-Concise',
        creative: 'Persona: Storyteller'
    };

    function updatePersonaUI() {
        headerPersonaTag.textContent = PERSONA_LABELS[currentPersona] || 'Persona: General AI';
        personaSelect.value = currentPersona;
        metaTempLabel.textContent = `Temp: ${currentTemp}`;
        metaStreamLabel.textContent = `Streaming: ${isStreamingEnabled ? 'ON' : 'OFF'}`;
    }

    temperatureSlider.addEventListener('input', (e) => {
        tempDisplay.textContent = e.target.value;
    });

    openSettingsBtn.addEventListener('click', () => {
        personaSelect.value = currentPersona;
        temperatureSlider.value = currentTemp;
        tempDisplay.textContent = currentTemp;
        streamingToggle.checked = isStreamingEnabled;
        settingsModal.classList.remove('hidden');
    });

    closeSettingsBtn.addEventListener('click', () => settingsModal.classList.add('hidden'));

    saveSettingsBtn.addEventListener('click', () => {
        currentPersona = personaSelect.value;
        currentTemp = parseFloat(temperatureSlider.value);
        isStreamingEnabled = streamingToggle.checked;

        localStorage.setItem('local_llm_persona', currentPersona);
        localStorage.setItem('local_llm_temp', currentTemp.toString());
        localStorage.setItem('local_llm_stream', isStreamingEnabled ? 'true' : 'false');

        updatePersonaUI();
        settingsModal.classList.add('hidden');
    });

    updatePersonaUI();

    // ------------------------------------------------------------------------
    // 3. Chat Sessions & History Storage (localStorage)
    // ------------------------------------------------------------------------
    function generateId() {
        return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
    }

    function renderSidebarSessions() {
        sidebarSessions.innerHTML = '';
        if (sessions.length === 0) {
            sidebarSessions.innerHTML = '<div style="padding: 10px; font-size: 0.78rem; color: var(--text-muted);">No saved chats yet.</div>';
            return;
        }

        sessions.slice().reverse().forEach(session => {
            const item = document.createElement('div');
            item.className = `session-item ${session.id === currentSessionId ? 'active' : ''}`;
            item.setAttribute('data-id', session.id);

            const titleSpan = document.createElement('span');
            titleSpan.className = 'session-title';
            titleSpan.textContent = session.title || 'Untitled Chat';

            const delBtn = document.createElement('button');
            delBtn.className = 'session-delete-btn';
            delBtn.title = 'Delete chat';
            delBtn.innerHTML = '&times;';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                deleteSession(session.id);
            });

            item.appendChild(titleSpan);
            item.appendChild(delBtn);

            item.addEventListener('click', () => {
                switchSession(session.id);
            });

            sidebarSessions.appendChild(item);
        });
    }

    function switchSession(sessionId) {
        const found = sessions.find(s => s.id === sessionId);
        if (!found) return;

        currentSessionId = sessionId;
        localStorage.setItem('local_llm_active_session', sessionId);
        conversationHistory = found.messages || [];

        renderChatMessages();
        renderSidebarSessions();
        closeSidebarOnMobile();
    }

    function saveCurrentSession() {
        if (conversationHistory.length === 0) return;

        const firstUserMsg = conversationHistory.find(m => m.role === 'user');
        const title = firstUserMsg ? firstUserMsg.content.substring(0, 32) + (firstUserMsg.content.length > 32 ? '...' : '') : 'New Chat';

        let existing = sessions.find(s => s.id === currentSessionId);
        if (existing) {
            existing.messages = conversationHistory;
            existing.title = title;
            existing.updatedAt = Date.now();
        } else {
            const newSession = {
                id: currentSessionId || generateId(),
                title: title,
                messages: conversationHistory,
                createdAt: Date.now(),
                updatedAt: Date.now()
            };
            currentSessionId = newSession.id;
            localStorage.setItem('local_llm_active_session', currentSessionId);
            sessions.push(newSession);
        }

        localStorage.setItem('local_llm_sessions', JSON.stringify(sessions));
        renderSidebarSessions();
    }

    function deleteSession(sessionId) {
        sessions = sessions.filter(s => s.id !== sessionId);
        localStorage.setItem('local_llm_sessions', JSON.stringify(sessions));

        if (currentSessionId === sessionId) {
            startNewChat();
        } else {
            renderSidebarSessions();
        }
    }

    function startNewChat() {
        currentSessionId = generateId();
        localStorage.setItem('local_llm_active_session', currentSessionId);
        conversationHistory = [];
        renderChatMessages();
        renderSidebarSessions();
        userInput.focus();
    }

    newChatBtn.addEventListener('click', startNewChat);

    // Sidebar Mobile Toggle
    sidebarToggleBtn.addEventListener('click', () => {
        appSidebar.classList.toggle('open');
        appSidebar.classList.toggle('collapsed');
        sidebarBackdrop.classList.toggle('active');
    });

    sidebarBackdrop.addEventListener('click', closeSidebarOnMobile);

    function closeSidebarOnMobile() {
        appSidebar.classList.remove('open');
        sidebarBackdrop.classList.remove('active');
    }

    // ------------------------------------------------------------------------
    // 4. Ollama Status & Model Discovery
    // ------------------------------------------------------------------------
    async function checkOllamaStatus() {
        statusIndicator.className = 'status-pill checking';
        statusText.textContent = 'Checking...';

        try {
            const res = await fetch('/api/status');
            const data = await res.json();

            if (data.status === 'online') {
                statusIndicator.className = 'status-pill online';
                statusText.textContent = 'Ollama Online';
                hideErrorBanner();

                if (data.models && data.models.length > 0) {
                    populateModelDropdown(data.models, data.default_model);
                    renderInstalledModelsList(data.models);
                } else {
                    showErrorBanner('Ollama is running, but no models found. Download one using Model Manager!');
                }
            } else {
                statusIndicator.className = 'status-pill offline';
                statusText.textContent = 'Ollama Offline';
                showErrorBanner(data.message || 'Cannot reach local Ollama on port 11434.');
            }
        } catch (err) {
            statusIndicator.className = 'status-pill offline';
            statusText.textContent = 'Ollama Offline';
            showErrorBanner('Cannot connect to Ollama. Make sure the Ollama application is active.');
        }
    }

    function populateModelDropdown(models, defaultModel) {
        const cur = modelSelect.value;
        modelSelect.innerHTML = '';

        models.forEach(m => {
            const opt = document.createElement('option');
            opt.value = m.name;
            opt.textContent = `${m.name} ${m.parameter_size ? '(' + m.parameter_size + ')' : ''}`;
            if (m.name === cur || (!cur && m.name.startsWith(defaultModel))) {
                opt.selected = true;
            }
            modelSelect.appendChild(opt);
        });

        if (!modelSelect.value && models.length > 0) {
            modelSelect.selectedIndex = 0;
        }
    }

    refreshStatusBtn.addEventListener('click', checkOllamaStatus);

    function showErrorBanner(msg) {
        errorMessage.textContent = msg;
        errorBanner.classList.remove('hidden');
    }

    function hideErrorBanner() {
        errorBanner.classList.add('hidden');
    }

    dismissErrorBtn.addEventListener('click', hideErrorBanner);

    // ------------------------------------------------------------------------
    // 5. Input Auto-Resize & Keyboard
    // ------------------------------------------------------------------------
    function autoResizeInput() {
        userInput.style.height = 'auto';
        const h = Math.min(userInput.scrollHeight, 180);
        userInput.style.height = `${h}px`;
        sendBtn.disabled = !userInput.value.trim().length || isGenerating;
    }

    userInput.addEventListener('input', autoResizeInput);

    userInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            if (!sendBtn.disabled) handleSendMessage();
        }
    });

    chatForm.addEventListener('submit', (e) => {
        e.preventDefault();
        if (!sendBtn.disabled) handleSendMessage();
    });

    // ------------------------------------------------------------------------
    // 6. Voice Input (Speech-to-Text)
    // ------------------------------------------------------------------------
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    let recognition = null;

    if (SpeechRecognition) {
        recognition = new SpeechRecognition();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.lang = 'en-US';

        recognition.onstart = () => {
            voiceBtn.classList.add('listening');
            voiceBtn.title = 'Listening... Speak into your microphone';
        };

        recognition.onresult = (e) => {
            let transcript = '';
            for (let i = e.resultIndex; i < e.results.length; i++) {
                transcript += e.results[i][0].transcript;
            }
            userInput.value = transcript;
            autoResizeInput();
        };

        recognition.onerror = () => {
            voiceBtn.classList.remove('listening');
        };

        recognition.onend = () => {
            voiceBtn.classList.remove('listening');
            voiceBtn.title = 'Speak to type (Voice Input)';
        };

        voiceBtn.addEventListener('click', () => {
            if (voiceBtn.classList.contains('listening')) {
                recognition.stop();
            } else {
                recognition.start();
            }
        });
    } else {
        voiceBtn.title = 'Speech-to-Text not supported in this browser';
        voiceBtn.style.opacity = '0.3';
    }

    // ------------------------------------------------------------------------
    // 7. Markdown Parser & Code Block Formatter
    // ------------------------------------------------------------------------
    function escapeHTML(str) {
        return str
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function formatMarkdown(text) {
        if (!text) return '';

        // Extract code blocks
        const codeBlocks = [];
        let parsed = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
            const index = codeBlocks.length;
            const language = lang.trim() || 'code';
            const escapedCode = escapeHTML(code.trimEnd());
            const lineCount = escapedCode.split('\n').length;
            codeBlocks.push(`
                <div class="code-block-wrapper">
                    <div class="code-header">
                        <span>${escapeHTML(language)} (${lineCount} lines)</span>
                        <button class="copy-code-btn" type="button" onclick="window.copyToClipboard(this)">Copy</button>
                    </div>
                    <pre><code class="language-${escapeHTML(language)}">${escapedCode}</code></pre>
                </div>
            `);
            return `__CODE_BLOCK_${index}__`;
        });

        parsed = escapeHTML(parsed);
        parsed = parsed.replace(/`([^`]+)`/g, '<code>$1</code>');
        parsed = parsed.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        parsed = parsed.replace(/(?<!\*)\*([^*]+)\*(?!\*)/g, '<em>$1</em>');
        parsed = parsed.replace(/^>(.*)$/gm, '<blockquote>$1</blockquote>');
        parsed = parsed.replace(/^\s*[-*]\s+(.*)$/gm, '<li>$1</li>');
        parsed = parsed.replace(/(<li>[\s\S]*?<\/li>)/g, '<ul>$1</ul>');
        parsed = parsed.replace(/<\/ul>\s*<ul>/g, '');

        const paragraphs = parsed.split(/\n{2,}/);
        parsed = paragraphs.map(p => {
            p = p.trim();
            if (!p) return '';
            if (p.startsWith('__CODE_BLOCK_') || p.startsWith('<ul>') || p.startsWith('<blockquote>')) {
                return p;
            }
            return `<p>${p.replace(/\n/g, '<br>')}</p>`;
        }).join('');

        codeBlocks.forEach((blockHtml, i) => {
            parsed = parsed.replace(`__CODE_BLOCK_${i}__`, blockHtml);
        });

        return parsed;
    }

    // ------------------------------------------------------------------------
    // 8. Message Rendering & Telemetry Bar
    // ------------------------------------------------------------------------
    function renderChatMessages() {
        chatMessages.innerHTML = '';
        if (conversationHistory.length === 0) {
            welcomeScreen.classList.remove('hidden');
            return;
        }

        welcomeScreen.classList.add('hidden');
        conversationHistory.forEach(msg => {
            appendMessageToDOM(msg.role, msg.content, msg.stats, false);
        });
        scrollToBottom();
    }

    function appendMessageToDOM(role, text, stats = null, isStreaming = false) {
        welcomeScreen.classList.add('hidden');

        const row = document.createElement('div');
        row.className = `message-row ${role === 'user' ? 'user-row' : 'assistant-row'}`;

        const wrapper = document.createElement('div');
        wrapper.className = 'message-bubble-wrapper';

        if (role === 'assistant') {
            const avatar = document.createElement('div');
            avatar.className = 'avatar-icon ai-avatar';
            avatar.textContent = 'AI';
            row.appendChild(avatar);

            const bubble = document.createElement('div');
            bubble.className = 'message-bubble assistant-bubble';
            if (isStreaming) {
                bubble.innerHTML = formatMarkdown(text) + '<span class="streaming-cursor"></span>';
            } else {
                bubble.innerHTML = formatMarkdown(text);
            }
            wrapper.appendChild(bubble);

            // Telemetry & Action Bar
            const bar = document.createElement('div');
            bar.className = 'telemetry-bar';

            if (stats) {
                bar.innerHTML = `
                    <span class="telemetry-item" title="Speed">⚡ <strong>${stats.tok_per_sec || 0}</strong> tok/s</span>
                    <span>&bull;</span>
                    <span class="telemetry-item">${stats.eval_count || 0} tokens</span>
                    <span>&bull;</span>
                    <span class="telemetry-item">${stats.eval_duration || stats.total_duration || 0}s</span>
                `;
            }

            const actions = document.createElement('div');
            actions.className = 'bubble-actions';

            // Copy text button
            const copyBtn = document.createElement('button');
            copyBtn.className = 'bubble-action-btn';
            copyBtn.innerHTML = '📋 Copy';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(text);
                copyBtn.textContent = 'Copied!';
                setTimeout(() => copyBtn.innerHTML = '📋 Copy', 2000);
            };
            actions.appendChild(copyBtn);

            // Read aloud button
            if (window.speechSynthesis) {
                const speakBtn = document.createElement('button');
                speakBtn.className = 'bubble-action-btn';
                speakBtn.innerHTML = '🔊 Speak';
                speakBtn.onclick = () => toggleSpeech(text, speakBtn);
                actions.appendChild(speakBtn);
            }

            bar.appendChild(actions);
            wrapper.appendChild(bar);
        } else {
            const bubble = document.createElement('div');
            bubble.className = 'message-bubble user-bubble';
            bubble.textContent = text;
            wrapper.appendChild(bubble);

            const avatar = document.createElement('div');
            avatar.className = 'avatar-icon user-avatar';
            avatar.textContent = 'You';
            row.appendChild(wrapper);
            row.appendChild(avatar);
            chatMessages.appendChild(row);
            scrollToBottom();
            return;
        }

        row.appendChild(wrapper);
        chatMessages.appendChild(row);
        scrollToBottom();
        return { row, wrapper };
    }

    function scrollToBottom() {
        chatContainer.scrollTop = chatContainer.scrollHeight;
    }

    // ------------------------------------------------------------------------
    // 9. Text-to-Speech (Read Aloud)
    // ------------------------------------------------------------------------
    let activeUtterance = null;
    function toggleSpeech(text, btn) {
        if (!window.speechSynthesis) return;

        if (window.speechSynthesis.speaking) {
            window.speechSynthesis.cancel();
            btn.innerHTML = '🔊 Speak';
            return;
        }

        const cleanText = text.replace(/```[\s\S]*?```/g, 'Code block omitted.');
        const utterance = new SpeechSynthesisUtterance(cleanText);
        utterance.rate = 1.0;
        utterance.onend = () => { btn.innerHTML = '🔊 Speak'; };
        utterance.onerror = () => { btn.innerHTML = '🔊 Speak'; };

        btn.innerHTML = '⏹ Stop';
        window.speechSynthesis.speak(utterance);
    }

    // ------------------------------------------------------------------------
    // 10. Sending Messages: Streaming & Standard Modes
    // ------------------------------------------------------------------------
    async function handleSendMessage() {
        const text = userInput.value.trim();
        if (!text || isGenerating) return;

        userInput.value = '';
        autoResizeInput();

        // Append user prompt
        appendMessageToDOM('user', text);
        conversationHistory.push({ role: 'user', content: text });
        saveCurrentSession();

        isGenerating = true;
        sendBtn.disabled = true;
        stopBtn.classList.remove('hidden');

        if (isStreamingEnabled) {
            await handleStreamingChat(text);
        } else {
            await handleStandardChat(text);
        }

        isGenerating = false;
        stopBtn.classList.add('hidden');
        sendBtn.disabled = !userInput.value.trim().length;
        userInput.focus();
    }

    // Real-Time Token Streaming (SSE)
    async function handleStreamingChat(promptText) {
        abortController = new AbortController();

        // Create initial placeholder assistant bubble
        const row = document.createElement('div');
        row.className = 'message-row assistant-row';

        const avatar = document.createElement('div');
        avatar.className = 'avatar-icon ai-avatar';
        avatar.textContent = 'AI';
        row.appendChild(avatar);

        const wrapper = document.createElement('div');
        wrapper.className = 'message-bubble-wrapper';

        const bubble = document.createElement('div');
        bubble.className = 'message-bubble assistant-bubble';
        bubble.innerHTML = '<span class="streaming-cursor"></span>';
        wrapper.appendChild(bubble);

        row.appendChild(wrapper);
        chatMessages.appendChild(row);
        scrollToBottom();

        let accumulatedContent = '';
        let finalStats = null;

        try {
            const res = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: promptText,
                    history: conversationHistory.slice(0, -1),
                    model: modelSelect.value,
                    persona: currentPersona,
                    temperature: currentTemp
                }),
                signal: abortController.signal
            });

            if (!res.ok) throw new Error(`HTTP ${res.status}`);

            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // keep last incomplete line

                for (const line of lines) {
                    const trimmed = line.trim();
                    if (!trimmed.startsWith('data:')) continue;

                    const jsonStr = trimmed.replace(/^data:\s*/, '');
                    if (!jsonStr) continue;

                    try {
                        const eventData = JSON.parse(jsonStr);

                        if (eventData.error) {
                            accumulatedContent += `\n⚠️ **Error:** ${eventData.error}`;
                            bubble.innerHTML = formatMarkdown(accumulatedContent);
                            showErrorBanner(eventData.error);
                            break;
                        }

                        if (eventData.content) {
                            accumulatedContent += eventData.content;
                            bubble.innerHTML = formatMarkdown(accumulatedContent) + '<span class="streaming-cursor"></span>';
                            scrollToBottom();
                        }

                        if (eventData.done) {
                            finalStats = eventData.stats;
                        }
                    } catch (e) {
                        // ignore malformed line
                    }
                }
            }

        } catch (err) {
            if (err.name === 'AbortError') {
                accumulatedContent += ' *(Generation stopped by user)*';
            } else {
                accumulatedContent += `\n⚠️ **Connection Error:** ${err.message}`;
                showErrorBanner(err.message);
            }
        } finally {
            // Render final clean markdown and telemetry bar
            bubble.innerHTML = formatMarkdown(accumulatedContent);

            const bar = document.createElement('div');
            bar.className = 'telemetry-bar';

            if (finalStats) {
                bar.innerHTML = `
                    <span class="telemetry-item" title="Speed">⚡ <strong>${finalStats.tok_per_sec || 0}</strong> tok/s</span>
                    <span>&bull;</span>
                    <span class="telemetry-item">${finalStats.eval_count || 0} tokens</span>
                    <span>&bull;</span>
                    <span class="telemetry-item">${finalStats.eval_duration || 0}s</span>
                `;
            }

            const actions = document.createElement('div');
            actions.className = 'bubble-actions';

            const copyBtn = document.createElement('button');
            copyBtn.className = 'bubble-action-btn';
            copyBtn.innerHTML = '📋 Copy';
            copyBtn.onclick = () => {
                navigator.clipboard.writeText(accumulatedContent);
                copyBtn.textContent = 'Copied!';
                setTimeout(() => copyBtn.innerHTML = '📋 Copy', 2000);
            };
            actions.appendChild(copyBtn);

            if (window.speechSynthesis) {
                const speakBtn = document.createElement('button');
                speakBtn.className = 'bubble-action-btn';
                speakBtn.innerHTML = '🔊 Speak';
                speakBtn.onclick = () => toggleSpeech(accumulatedContent, speakBtn);
                actions.appendChild(speakBtn);
            }

            bar.appendChild(actions);
            wrapper.appendChild(bar);

            conversationHistory.push({
                role: 'assistant',
                content: accumulatedContent,
                stats: finalStats
            });
            saveCurrentSession();
            scrollToBottom();
        }
    }

    // Non-Streaming Fallback
    async function handleStandardChat(promptText) {
        loadingIndicator.classList.remove('hidden');
        loadingStatusText.textContent = `Thinking using ${modelSelect.value}...`;
        scrollToBottom();

        try {
            const res = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: promptText,
                    history: conversationHistory.slice(0, -1),
                    model: modelSelect.value,
                    persona: currentPersona,
                    temperature: currentTemp
                })
            });

            const data = await res.json();
            loadingIndicator.classList.add('hidden');

            if (res.ok && data.response) {
                appendMessageToDOM('assistant', data.response, data.stats);
                conversationHistory.push({
                    role: 'assistant',
                    content: data.response,
                    stats: data.stats
                });
                saveCurrentSession();
            } else {
                const err = data.error || 'Failed to generate response.';
                appendMessageToDOM('assistant', `⚠️ **Error:** ${err}`);
                showErrorBanner(err);
            }
        } catch (e) {
            loadingIndicator.classList.add('hidden');
            appendMessageToDOM('assistant', `⚠️ **Network Error:** ${e.message}`);
        }
    }

    // Stop Generation Button
    stopBtn.addEventListener('click', () => {
        if (abortController) {
            abortController.abort();
        }
    });

    // ------------------------------------------------------------------------
    // 11. Clear & New Conversation
    // ------------------------------------------------------------------------
    clearChatBtn.addEventListener('click', () => {
        if (conversationHistory.length === 0) return;
        if (confirm('Clear the current conversation?')) {
            startNewChat();
        }
    });

    // Suggestion Cards
    suggestionCards.forEach(card => {
        card.addEventListener('click', () => {
            const prompt = card.getAttribute('data-prompt');
            if (prompt) {
                userInput.value = prompt;
                autoResizeInput();
                handleSendMessage();
            }
        });
    });

    // ------------------------------------------------------------------------
    // 12. Model Manager Modal (In-App Model Pulling)
    // ------------------------------------------------------------------------
    openModelsBtn.addEventListener('click', () => {
        modelsModal.classList.remove('hidden');
    });

    closeModelsBtn.addEventListener('click', () => {
        modelsModal.classList.add('hidden');
    });

    presetChips.forEach(chip => {
        chip.addEventListener('click', () => {
            newModelName.value = chip.getAttribute('data-model');
            pullModel();
        });
    });

    pullModelBtn.addEventListener('click', pullModel);

    async function pullModel() {
        const name = newModelName.value.trim();
        if (!name) return;

        pullProgressBox.classList.remove('hidden');
        pullStatusLabel.textContent = `Downloading ${name}...`;
        pullProgressBar.style.width = '0%';
        pullLog.textContent = '';
        pullModelBtn.disabled = true;

        try {
            const res = await fetch('/api/models/pull', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: name })
            });

            const reader = res.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop();

                for (const line of lines) {
                    if (!line.startsWith('data:')) continue;
                    try {
                        const d = JSON.parse(line.replace('data:', '').trim());
                        if (d.status) {
                            pullStatusLabel.textContent = d.status;
                            pullLog.textContent += `${d.status}\n`;
                            pullLog.scrollTop = pullLog.scrollHeight;
                        }
                        if (d.total && d.completed) {
                            const pct = Math.round((d.completed / d.total) * 100);
                            pullProgressBar.style.width = `${pct}%`;
                        }
                    } catch (e) {}
                }
            }

            pullStatusLabel.textContent = `✅ Successfully pulled ${name}!`;
            pullProgressBar.style.width = '100%';
            checkOllamaStatus();
        } catch (e) {
            pullStatusLabel.textContent = `⚠️ Error: ${e.message}`;
        } finally {
            pullModelBtn.disabled = false;
        }
    }

    function renderInstalledModelsList(models) {
        installedModelsList.innerHTML = '';
        models.forEach(m => {
            const li = document.createElement('li');
            li.className = 'installed-model-item';
            const sizeMB = (m.size / (1024 * 1024 * 1024)).toFixed(1);
            li.innerHTML = `
                <span><strong>${m.name}</strong> (${m.parameter_size || 'Unknown'})</span>
                <span style="color: var(--text-muted);">${sizeMB} GB</span>
            `;
            installedModelsList.appendChild(li);
        });
    }

    // ------------------------------------------------------------------------
    // 13. Export Conversation (Markdown, Text, JSON)
    // ------------------------------------------------------------------------
    exportChatBtn.addEventListener('click', () => {
        if (conversationHistory.length === 0) {
            alert('No messages to export.');
            return;
        }
        exportModal.classList.remove('hidden');
    });

    closeExportBtn.addEventListener('click', () => exportModal.classList.add('hidden'));

    function downloadFile(content, fileName, mimeType) {
        const blob = new Blob([content], { type: mimeType });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        exportModal.classList.add('hidden');
    }

    exportMdBtn.addEventListener('click', () => {
        let md = `# Local LLM Chat Export\n*Generated on ${new Date().toLocaleString()}*\n*Model: ${modelSelect.value}*\n\n---\n\n`;
        conversationHistory.forEach(m => {
            md += `### ${m.role === 'user' ? '👤 User' : '🤖 Assistant'}\n${m.content}\n\n`;
            if (m.stats) {
                md += `> *Speed: ${m.stats.tok_per_sec} tok/s | Tokens: ${m.stats.eval_count}*\n\n`;
            }
        });
        downloadFile(md, `chat-export-${Date.now()}.md`, 'text/markdown');
    });

    exportTxtBtn.addEventListener('click', () => {
        let txt = `LOCAL LLM CHAT LOG - ${new Date().toLocaleString()}\n\n`;
        conversationHistory.forEach(m => {
            txt += `[${m.role.toUpperCase()}]:\n${m.content}\n\n`;
        });
        downloadFile(txt, `chat-export-${Date.now()}.txt`, 'text/plain');
    });

    exportJsonBtn.addEventListener('click', () => {
        const json = JSON.stringify({
            exportedAt: new Date().toISOString(),
            model: modelSelect.value,
            messages: conversationHistory
        }, null, 2);
        downloadFile(json, `chat-export-${Date.now()}.json`, 'application/json');
    });

    // ------------------------------------------------------------------------
    // 14. Global Copy Helper
    // ------------------------------------------------------------------------
    window.copyToClipboard = function(btn) {
        const code = btn.closest('.code-block-wrapper').querySelector('code');
        if (!code) return;
        navigator.clipboard.writeText(code.innerText).then(() => {
            const original = btn.textContent;
            btn.textContent = 'Copied!';
            btn.style.color = 'var(--status-online)';
            setTimeout(() => {
                btn.textContent = original;
                btn.style.color = '';
            }, 2000);
        });
    };

    // ------------------------------------------------------------------------
    // 15. Initial Initialization
    // ------------------------------------------------------------------------
    if (sessions.length > 0 && currentSessionId) {
        const existing = sessions.find(s => s.id === currentSessionId);
        if (existing) {
            conversationHistory = existing.messages || [];
        } else {
            currentSessionId = sessions[0].id;
            conversationHistory = sessions[0].messages || [];
        }
    } else {
        currentSessionId = generateId();
    }

    renderSidebarSessions();
    renderChatMessages();
    checkOllamaStatus();
    userInput.focus();
});
