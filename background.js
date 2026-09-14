// Background service worker for AI Chat Comparator
class BackgroundService {
    constructor() {
        this.activeQueries = new Map();
        this.responseHandlers = new Map();
        
        this.init();
    }

    init() {
        this.setupMessageListener();
        this.setupTabListeners();
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('Background received message:', message.type, message);
            
            if (message.type === 'sendQuery') {
                this.handleSendQuery(message, sendResponse);
                return true; // Keep message channel open for async response
            } else if (message.type === 'sendQueryApi') {
                this.handleDirectApiQuery(message, sendResponse);
                return true;
            } else if (message.type === 'aiResponse' || message.type === 'aiError') {
                this.relayToPopup(message);
                return false;
            } else if (message.type === 'getTabId') {
                // Handle tab ID requests from content scripts
                sendResponse({ tabId: sender.tab?.id || 0 });
                return false;
            }
        });
    }

    setupTabListeners() {
        // Clean up when tabs are closed
        chrome.tabs.onRemoved.addListener((tabId) => {
            this.activeQueries.delete(tabId);
            this.responseHandlers.delete(tabId);
        });
    }

    async handleSendQuery(message, sendResponse) {
        const { query, platforms } = message;
        
        try {
            if (!platforms || platforms.length === 0) {
                sendResponse({ success: false, error: 'No platforms selected' });
                return;
            }

            console.log('Processing query for platforms:', platforms.map(p => `${p.platform} (${p.id})`));

            const results = await Promise.allSettled(
                platforms.map(platform => this.injectAndQuery(platform, query))
            );

            results.forEach((result, index) => {
                const platform = platforms[index];
                if (result.status === 'fulfilled') {
                    console.log(`✅ ${platform.platform} (${platform.id}): Success`);
                } else {
                    console.log(`❌ ${platform.platform} (${platform.id}): ${result.reason.message}`);
                }
            });

            const successful = results.filter(r => r.status === 'fulfilled').length;
            
            if (successful === 0) {
                const errors = results.map(r => r.reason?.message || 'Unknown error').join('; ');
                sendResponse({ success: false, error: `Failed to inject scripts: ${errors}` });
                return;
            }

            sendResponse({ success: true, injected: successful, total: platforms.length });

        } catch (error) {
            console.error('Error in handleSendQuery:', error);
            sendResponse({ success: false, error: error.message });
        }
    }

    async handleDirectApiQuery(message, sendResponse) {
        const { query, provider, model, apiKey, baseUrl } = message;

        if (!query || !query.trim()) {
            sendResponse({ success: false, error: 'Query is empty' });
            return;
        }

        if (!apiKey || !apiKey.trim()) {
            sendResponse({ success: false, error: 'API key is required for Direct API mode.' });
            return;
        }

        try {
            const answer = await this.callLlmApi({
                provider,
                model,
                apiKey,
                baseUrl,
                query
            });

            sendResponse({
                success: true,
                platform: this.getProviderDisplayName(provider),
                data: answer
            });
        } catch (error) {
            console.error('Direct API call failed:', error);
            sendResponse({ success: false, error: error.message || 'Direct API request failed' });
        }
    }

    getProviderDisplayName(provider) {
        const labels = {
            openai: 'OpenAI',
            openrouter: 'OpenRouter',
            groq: 'Groq',
            anthropic: 'Anthropic',
            custom: 'Custom API'
        };
        return labels[provider] || 'Direct API';
    }

    async callLlmApi({ provider, model, apiKey, baseUrl, query }) {
        const providerName = provider || 'openai';
        const finalModel = model || 'gpt-4o-mini';
        const base = baseUrl || 'https://api.openai.com/v1';
        const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;

        let requestBody;
        let headers = {
            'Content-Type': 'application/json'
        };
        let endpoint = `${normalizedBase}/chat/completions`;

        if (providerName === 'anthropic') {
            endpoint = `${normalizedBase.replace(/\/$/, '')}/v1/messages`;
            headers = {
                'Content-Type': 'application/json',
                'x-api-key': apiKey,
                'anthropic-version': '2023-06-01'
            };
            requestBody = {
                model: finalModel,
                max_tokens: 1024,
                messages: [{ role: 'user', content: query }]
            };
        } else if (providerName === 'openrouter') {
            endpoint = `${normalizedBase.replace(/\/$/, '')}/chat/completions`;
            headers['Authorization'] = `Bearer ${apiKey}`;
            headers['HTTP-Referer'] = 'https://github.com';
            headers['X-Title'] = 'AI Chat Comparator';
            requestBody = {
                model: finalModel,
                messages: [{ role: 'user', content: query }]
            };
        } else if (providerName === 'groq') {
            endpoint = `${normalizedBase.replace(/\/$/, '')}/chat/completions`;
            headers['Authorization'] = `Bearer ${apiKey}`;
            requestBody = {
                model: finalModel,
                messages: [{ role: 'user', content: query }],
                temperature: 0.7
            };
        } else if (providerName === 'custom') {
            endpoint = `${normalizedBase.replace(/\/$/, '')}/chat/completions`;
            headers['Authorization'] = `Bearer ${apiKey}`;
            requestBody = {
                model: finalModel,
                messages: [{ role: 'user', content: query }],
                temperature: 0.7
            };
        } else {
            endpoint = `${normalizedBase.replace(/\/$/, '')}/chat/completions`;
            headers['Authorization'] = `Bearer ${apiKey}`;
            requestBody = {
                model: finalModel,
                messages: [{ role: 'user', content: query }],
                temperature: 0.7
            };
        }

        const response = await fetch(endpoint, {
            method: 'POST',
            headers,
            body: JSON.stringify(requestBody)
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed (${response.status}): ${errorText}`);
        }

        const data = await response.json();

        if (providerName === 'anthropic') {
            const text = data?.content?.[0]?.text;
            if (!text) {
                throw new Error('Anthropic returned an empty response.');
            }
            return text;
        }

        const text = data?.choices?.[0]?.message?.content;
        if (!text || (Array.isArray(text) && text.length === 0)) {
            throw new Error('LLM returned no usable content.');
        }

        if (Array.isArray(text)) {
            return text.map(item => item?.text || '').join('\n');
        }

        return typeof text === 'string' ? text : JSON.stringify(text);
    }

    async injectAndQuery(platform, query) {
        const { id: tabId, platform: platformName } = platform;

        try {
            // Check if tab still exists
            const tab = await chrome.tabs.get(tabId);
            console.log(`Injecting into ${platformName} tab:`, tab.url);

            // Determine which content script to inject
            const scriptFile = platformName === 'ChatGPT' ? 'content-chatgpt.js' : 'content-grok.js';

            // Inject the utils script first
            await chrome.scripting.executeScript({
                target: { tabId },
                files: ['utils.js']
            });

            console.log(`Utils injected into ${platformName}`);

            // Then inject the platform-specific script
            await chrome.scripting.executeScript({
                target: { tabId },
                files: [scriptFile]
            });

            console.log(`${scriptFile} injected into ${platformName}`);

            // Wait a moment for scripts to initialize
            await new Promise(resolve => setTimeout(resolve, 1000));

            // Send the query to the injected script with tab ID
            const response = await chrome.tabs.sendMessage(tabId, {
                type: 'sendQuery',
                query: query,
                platform: platformName,
                tabId: tabId // Pass tab ID explicitly
            });

            console.log(`Query sent to ${platformName}:`, response);

            this.activeQueries.set(tabId, { 
                platform: platformName, 
                query, 
                startTime: Date.now() 
            });

            return response;

        } catch (error) {
            console.error(`Error injecting script for ${platformName} (${tabId}):`, error);
            
            // Send error to popup
            this.relayToPopup({
                type: 'aiError',
                data: {
                    platform: platformName,
                    platformId: tabId,
                    error: `Failed to inject script: ${error.message}`
                }
            });
            
            throw error;
        }
    }

    relayToPopup(message) {
        // Forward messages to popup
        console.log('Relaying to popup:', message.type, message.data?.platform);
        
        chrome.runtime.sendMessage(message).catch(error => {
            // Popup might be closed, that's okay
            console.log('Popup not available for message relay:', error.message);
        });
    }
}

// Initialize background service
console.log('Initializing background service...');
new BackgroundService();