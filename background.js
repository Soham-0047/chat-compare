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
            // Validate platforms
            if (!platforms || platforms.length === 0) {
                sendResponse({ success: false, error: 'No platforms selected' });
                return;
            }

            console.log('Processing query for platforms:', platforms.map(p => `${p.platform} (${p.id})`));

            // Inject content scripts and send queries
            const results = await Promise.allSettled(
                platforms.map(platform => this.injectAndQuery(platform, query))
            );

            // Log results
            results.forEach((result, index) => {
                const platform = platforms[index];
                if (result.status === 'fulfilled') {
                    console.log(`✅ ${platform.platform} (${platform.id}): Success`);
                } else {
                    console.log(`❌ ${platform.platform} (${platform.id}): ${result.reason.message}`);
                }
            });

            // Check if any injections were successful
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