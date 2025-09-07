class AIComparator {
    constructor() {
        this.availablePlatforms = [];
        this.selectedPlatforms = [];
        this.currentQuery = '';
        this.responses = [];
        this.isProcessing = false;
        this.responseListener = null;
        this.responseTimeout = null;
        
        this.init();
    }

    init() {
        this.bindEvents();
        this.loadSettings();
        this.detectTabs();
        this.setupResponseListener();
    }

    setupResponseListener() {
        if (this.responseListener) {
            chrome.runtime.onMessage.removeListener(this.responseListener);
        }

        this.responseListener = (message, sender, sendResponse) => {
            console.log('Popup received message:', message);
            
            if (message.type === 'aiResponse') {
                this.handleAIResponse(message.data);
            } else if (message.type === 'aiError') {
                this.handleAIError(message.data);
            }
        };

        chrome.runtime.onMessage.addListener(this.responseListener);
        console.log('Response listener setup complete');
    }

    bindEvents() {
        document.getElementById('queryInput').addEventListener('input', (e) => {
            this.currentQuery = e.target.value;
            this.updateSendButtonState();
        });

        document.getElementById('detectTabs').addEventListener('click', () => {
            this.detectTabs();
        });

        document.getElementById('sendQuery').addEventListener('click', () => {
            this.handleSendQuery();
        });

        document.getElementById('allowConsent').addEventListener('click', () => {
            this.hideConsent();
            this.sendQueryToAIs();
        });

        document.getElementById('denyConsent').addEventListener('click', () => {
            this.hideConsent();
        });

        document.getElementById('clearHistory').addEventListener('click', () => {
            this.clearResponses();
        });

        document.getElementById('retryQuery').addEventListener('click', () => {
            this.retryQuery();
        });

        document.getElementById('saveHistory').addEventListener('change', () => {
            this.saveSettings();
        });
    }

    async detectTabs() {
        console.log('Detecting AI tabs...');
        
        try {
            const tabs = await chrome.tabs.query({
                url: [
                    'https://chatgpt.com/*',
                    'https://grok.com/*',
                    'https://chat.openai.com/*'
                ]
            });

            console.log('Found tabs:', tabs);

            this.availablePlatforms = tabs.map(tab => ({
                id: tab.id,
                platform: this.detectPlatformFromUrl(tab.url),
                url: tab.url,
                title: tab.title,
                active: true
            }));

            console.log('Available platforms:', this.availablePlatforms);

            this.renderPlatforms();
            this.updateSendButtonState();
        } catch (error) {
            console.error('Error detecting tabs:', error);
            this.showError('Failed to detect AI tabs. Please refresh and try again.');
        }
    }

    detectPlatformFromUrl(url) {
        if (url.includes('chatgpt.com') || url.includes('chat.openai.com')) return 'ChatGPT';
        if (url.includes('grok.com')) return 'Grok';
        return 'Unknown';
    }

    renderPlatforms() {
        const container = document.getElementById('aiPlatforms');
        
        if (this.availablePlatforms.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No AI tabs detected. Open ChatGPT (chatgpt.com) or Grok (grok.com) in new tabs first.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = this.availablePlatforms.map(platform => `
            <div class="platform-item">
                <div class="platform-info">
                    <div class="platform-status ${platform.active ? '' : 'inactive'}"></div>
                    <span>${platform.platform}</span>
                </div>
                <input 
                    type="checkbox" 
                    class="platform-checkbox" 
                    data-platform-id="${platform.id}"
                    ${this.selectedPlatforms.includes(platform.id) ? 'checked' : ''}
                />
            </div>
        `).join('');

        // Bind checkbox events
        container.querySelectorAll('.platform-checkbox').forEach(checkbox => {
            checkbox.addEventListener('change', (e) => {
                const platformId = parseInt(e.target.dataset.platformId);
                if (e.target.checked) {
                    if (!this.selectedPlatforms.includes(platformId)) {
                        this.selectedPlatforms.push(platformId);
                    }
                } else {
                    this.selectedPlatforms = this.selectedPlatforms.filter(id => id !== platformId);
                }
                console.log('Selected platforms:', this.selectedPlatforms);
                this.updateSendButtonState();
            });
        });
    }

    updateSendButtonState() {
        const sendBtn = document.getElementById('sendQuery');
        const hasQuery = this.currentQuery.trim().length > 0;
        const hasSelectedPlatforms = this.selectedPlatforms.length > 0;
        
        sendBtn.disabled = !hasQuery || !hasSelectedPlatforms || this.isProcessing;
    }

    handleSendQuery() {
        if (!this.currentQuery.trim()) {
            this.showError('Please enter a query first.');
            return;
        }

        if (this.selectedPlatforms.length === 0) {
            this.showError('Please select at least one AI platform.');
            return;
        }

        this.showConsent();
    }

    showConsent() {
        document.getElementById('consentSection').style.display = 'flex';
    }

    hideConsent() {
        document.getElementById('consentSection').style.display = 'none';
    }

    async sendQueryToAIs() {
        this.isProcessing = true;
        this.updateSendButtonState();
        
        // Clear previous responses
        this.responses = [];
        this.renderResponses();

        // Show loading states
        this.showLoadingStates();

        try {
            console.log('Sending query to background script:', {
                query: this.currentQuery,
                platforms: this.selectedPlatforms.map(id => 
                    this.availablePlatforms.find(p => p.id === id)
                )
            });

            // Send query to background script (restore original approach)
            const response = await chrome.runtime.sendMessage({
                type: 'sendQuery',
                query: this.currentQuery,
                platforms: this.selectedPlatforms.map(id => 
                    this.availablePlatforms.find(p => p.id === id)
                )
            });

            console.log('Background script response:', response);

            if (response && response.success) {
                console.log('Query sent successfully, waiting for responses...');
                this.startResponseTimeout();
            } else {
                this.showError(response?.error || 'Failed to send query');
                this.isProcessing = false;
                this.updateSendButtonState();
            }
        } catch (error) {
            console.error('Error sending query:', error);
            this.showError('Failed to send query. Please try again.');
            this.isProcessing = false;
            this.updateSendButtonState();
        }
    }

    startResponseTimeout() {
        // Clear any existing timeout
        if (this.responseTimeout) {
            clearTimeout(this.responseTimeout);
        }

        // Set timeout for all responses
        this.responseTimeout = setTimeout(() => {
            console.log('Response timeout occurred');
            this.handleResponseTimeout();
        }, 120000); // 2 minutes
    }

    handleResponseTimeout() {
        // Handle platforms that haven't responded yet
        this.selectedPlatforms.forEach(platformId => {
            if (!this.responses.find(r => r.platformId === platformId)) {
                const platform = this.availablePlatforms.find(p => p.id === platformId);
                this.handleAIError({
                    platform: platform?.platform || 'Unknown',
                    platformId: platformId,
                    error: 'Response timeout after 2 minutes'
                });
            }
        });
    }

    showLoadingStates() {
        const container = document.getElementById('responsesContainer');
        container.innerHTML = this.selectedPlatforms.map(id => {
            const platform = this.availablePlatforms.find(p => p.id === id);
            return `
                <div class="response-card" data-platform-id="${id}">
                    <div class="response-header">
                        <div class="response-ai-name">${platform.platform}</div>
                        <div class="response-timestamp">Waiting for response...</div>
                    </div>
                    <div class="loading-spinner">
                        <div class="spinner"></div>
                        <p>Processing your query...</p>
                    </div>
                </div>
            `;
        }).join('');
    }

    // handleAIResponse(data) {
    //     console.log('Handling AI response:', data);
        
    //     // Find the corresponding tab ID
    //     let platformId = data.platformId;
    //     if (!platformId) {
    //         // Try to find the platform by name if platformId is missing
    //         const platform = this.availablePlatforms.find(p => p.platform === data.platform);
    //         if (platform) {
    //             platformId = platform.id;
    //         }
    //     }
        
    //     const response = {
    //         platform: data.platform,
    //         platformId: platformId,
    //         text: data.text,
    //         timestamp: data.timestamp || Date.now()
    //     };

    //     // Update or add response
    //     const existingIndex = this.responses.findIndex(r => r.platformId === platformId);
    //     if (existingIndex !== -1) {
    //         this.responses[existingIndex] = response;
    //     } else {
    //         this.responses.push(response);
    //     }

    //     this.updateResponseCard(response);
    //     this.checkAllResponsesReceived();
    // }

handleAIResponse(data) {
    console.log('Handling AI response:', data);
    
    // Prevent duplicate processing of the same response
    const responseKey = `${data.platform}-${data.timestamp}`;
    if (this.processedResponses && this.processedResponses.has(responseKey)) {
        console.log('Duplicate response detected, ignoring:', responseKey);
        return;
    }
    
    // Initialize processed responses tracker if not exists
    if (!this.processedResponses) {
        this.processedResponses = new Set();
    }
    this.processedResponses.add(responseKey);
    
    // Find platform card by name since IDs don't match
    const platformCard = this.findPlatformCardByName(data.platform);
    if (!platformCard) {
        console.error('Could not find platform card for:', data.platform);
        return;
    }
    
    const actualPlatformId = parseInt(platformCard.dataset.platformId);
    console.log('Updating card with platform ID:', actualPlatformId);
    
    const response = {
        platform: data.platform,
        platformId: actualPlatformId,
        text: data.text,
        timestamp: data.timestamp || Date.now()
    };

    // Update or add response - use platform name as key to prevent duplicates
    const existingIndex = this.responses.findIndex(r => r.platform === data.platform);
    if (existingIndex !== -1) {
        this.responses[existingIndex] = response;
        console.log('Updated existing response for', data.platform);
    } else {
        this.responses.push(response);
        console.log('Added new response for', data.platform);
    }

    // Force update the response card
    this.forceUpdateResponseCard(response, platformCard);
    this.checkAllResponsesReceived();
}

// Add this helper method to find platform cards by name
findPlatformCardByName(platformName) {
    const cards = document.querySelectorAll('.response-card');
    for (const card of cards) {
        const nameElement = card.querySelector('.response-ai-name');
        if (nameElement && nameElement.textContent.trim() === platformName) {
            return card;
        }
    }
    return null;
}

// Add this method to force update the card content
forceUpdateResponseCard(response, card) {
    if (!card) {
        console.error('No card provided for update');
        return;
    }

    console.log('Force updating response card with text:', response.text.substring(0, 100) + '...');
    
    const timestamp = new Date(response.timestamp).toLocaleTimeString();
    
    if (response.error) {
        card.innerHTML = `
            <div class="response-header">
                <div class="response-ai-name">${response.platform}</div>
                <div class="response-timestamp">${timestamp}</div>
            </div>
            <div class="response-content">
                <div class="error-message">
                    <strong>Error:</strong> ${response.error}
                </div>
            </div>
            <div class="response-actions-bar">
                <button class="retry-btn" onclick="aiComparator.retryPlatform(${response.platformId})">
                    🔄 Retry
                </button>
            </div>
        `;
    } else {
        // Make sure we have text content
        const formattedText = this.formatResponse(response.text || 'No response text received');
        
        card.innerHTML = `
            <div class="response-header">
                <div class="response-ai-name">${response.platform}</div>
                <div class="response-timestamp">${timestamp}</div>
            </div>
            <div class="response-content">
                <div class="response-text">${formattedText}</div>
            </div>
            <div class="response-actions-bar">
                <button class="copy-btn" onclick="aiComparator.copyResponse('${response.platformId}')">
                    📋 Copy
                </button>
            </div>
        `;
    }
    
    console.log('Card updated successfully for', response.platform);
}

// Also add this method to clear processed responses when starting new queries
clearProcessedResponses() {
    if (this.processedResponses) {
        this.processedResponses.clear();
    }
}


// Add this helper method
findPlatformCardByName(platformName) {
    const cards = document.querySelectorAll('.response-card');
    for (const card of cards) {
        const nameElement = card.querySelector('.response-ai-name');
        if (nameElement && nameElement.textContent.trim() === platformName) {
            return card;
        }
    }
    return null;
}

// Also update the updateResponseCard method to be more robust
updateResponseCard(response) {
    // Find card by platform name first
    let card = this.findPlatformCardByName(response.platform);
    
    // Fallback to platform ID
    if (!card) {
        card = document.querySelector(`[data-platform-id="${response.platformId}"]`);
    }
    
    if (!card) {
        console.error('Could not find response card for:', response);
        // Create a new card if none exists
        this.createResponseCard(response);
        return;
    }

    console.log('Updating response card for:', response.platform);
    
    const timestamp = new Date(response.timestamp).toLocaleTimeString();
    
    if (response.error) {
        card.innerHTML = `
            <div class="response-header">
                <div class="response-ai-name">${response.platform}</div>
                <div class="response-timestamp">${timestamp}</div>
            </div>
            <div class="response-content">
                <div class="error-message">
                    <strong>Error:</strong> ${response.error}
                </div>
            </div>
            <div class="response-actions-bar">
                <button class="retry-btn" onclick="aiComparator.retryPlatform(${response.platformId})">
                    🔄 Retry
                </button>
            </div>
        `;
    } else {
        card.innerHTML = `
            <div class="response-header">
                <div class="response-ai-name">${response.platform}</div>
                <div class="response-timestamp">${timestamp}</div>
            </div>
            <div class="response-content">${this.formatResponse(response.text)}</div>
            <div class="response-actions-bar">
                <button class="copy-btn" onclick="aiComparator.copyResponse('${response.platformId}')">
                    📋 Copy
                </button>
            </div>
        `;
    }
}

// Add this method to create a response card if it doesn't exist
createResponseCard(response) {
    const container = document.getElementById('responsesContainer');
    const timestamp = new Date(response.timestamp).toLocaleTimeString();
    
    const cardHtml = `
        <div class="response-card" data-platform-id="${response.platformId}">
            <div class="response-header">
                <div class="response-ai-name">${response.platform}</div>
                <div class="response-timestamp">${timestamp}</div>
            </div>
            <div class="response-content">${this.formatResponse(response.text)}</div>
            <div class="response-actions-bar">
                <button class="copy-btn" onclick="aiComparator.copyResponse('${response.platformId}')">
                    📋 Copy
                </button>
            </div>
        </div>
    `;
    
    container.insertAdjacentHTML('beforeend', cardHtml);
}

    handleAIError(data) {
        console.log('Handling AI error:', data);
        
        // Find the corresponding platform/tab by platform name
        const platform = this.availablePlatforms.find(p => p.platform === data.platform);
        const actualPlatformId = platform ? platform.id : data.platformId;
        
        console.log('Mapping error:', {
            receivedPlatformId: data.platformId,
            actualPlatformId: actualPlatformId,
            platform: data.platform
        });
        
        const errorResponse = {
            platform: data.platform,
            platformId: actualPlatformId,
            error: data.error,
            timestamp: Date.now()
        };

        const existingIndex = this.responses.findIndex(r => r.platformId === actualPlatformId);
        if (existingIndex !== -1) {
            this.responses[existingIndex] = errorResponse;
        } else {
            this.responses.push(errorResponse);
        }

        this.updateResponseCard(errorResponse);
        this.checkAllResponsesReceived();
    }

    checkAllResponsesReceived() {
        console.log('Checking responses:', this.responses.length, '/', this.selectedPlatforms.length);
        
        if (this.responses.length >= this.selectedPlatforms.length) {
            console.log('All responses received');
            this.handleAllResponsesReceived();
        }
    }

    updateResponseCard(response) {
        const card = document.querySelector(`[data-platform-id="${response.platformId}"]`);
        if (!card) {
            console.error('Could not find response card for platform ID:', response.platformId);
            return;
        }

        const timestamp = new Date(response.timestamp).toLocaleTimeString();
        
        if (response.error) {
            card.innerHTML = `
                <div class="response-header">
                    <div class="response-ai-name">${response.platform}</div>
                    <div class="response-timestamp">${timestamp}</div>
                </div>
                <div class="response-content">
                    <div class="error-message">
                        <strong>Error:</strong> ${response.error}
                    </div>
                </div>
                <div class="response-actions-bar">
                    <button class="retry-btn" onclick="aiComparator.retryPlatform(${response.platformId})">
                        🔄 Retry
                    </button>
                </div>
            `;
        } else {
            card.innerHTML = `
                <div class="response-header">
                    <div class="response-ai-name">${response.platform}</div>
                    <div class="response-timestamp">${timestamp}</div>
                </div>
                <div class="response-content">${this.formatResponse(response.text)}</div>
                <div class="response-actions-bar">
                    <button class="copy-btn" onclick="aiComparator.copyResponse('${response.platformId}')">
                        📋 Copy
                    </button>
                </div>
            `;
        }
    }

    formatResponse(text) {
        if (!text) return '';
        
        // Basic markdown-like formatting and HTML escaping
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.*?)\*/g, '<em>$1</em>')
            .replace(/`(.*?)`/g, '<code>$1</code>')
            .replace(/\n/g, '<br>');
    }

    handleAllResponsesReceived() {
        console.log('All responses received - cleaning up');
        
        this.isProcessing = false;
        this.updateSendButtonState();
        document.getElementById('retryQuery').style.display = 'inline-block';
        
        // Clear the timeout
        if (this.responseTimeout) {
            clearTimeout(this.responseTimeout);
            this.responseTimeout = null;
        }
        
        if (document.getElementById('saveHistory').checked) {
            this.saveQueryToHistory();
        }
    }

    copyResponse(platformId) {
        const response = this.responses.find(r => r.platformId === parseInt(platformId));
        if (response && response.text) {
            navigator.clipboard.writeText(response.text).then(() => {
                const btn = document.querySelector(`[data-platform-id="${platformId}"] .copy-btn`);
                if (btn) {
                    const originalText = btn.innerHTML;
                    btn.innerHTML = '✅ Copied!';
                    setTimeout(() => {
                        btn.innerHTML = originalText;
                    }, 2000);
                }
            }).catch(err => {
                console.error('Failed to copy text:', err);
            });
        }
    }

    retryPlatform(platformId) {
        // Remove any existing response for this platform
        this.responses = this.responses.filter(r => r.platformId !== platformId);
        
        // Reset to only this platform
        this.selectedPlatforms = [platformId];
        
        // Update UI to show only this platform is selected
        document.querySelectorAll('.platform-checkbox').forEach(cb => {
            cb.checked = parseInt(cb.dataset.platformId) === platformId;
        });
        
        // Resend the query
        this.sendQueryToAIs();
    }

    retryQuery() {
        this.responses = [];
        this.sendQueryToAIs();
    }

    clearResponses() {
        this.responses = [];
        this.renderResponses();
        document.getElementById('retryQuery').style.display = 'none';
        this.isProcessing = false;
        this.updateSendButtonState();
        
        if (this.responseTimeout) {
            clearTimeout(this.responseTimeout);
            this.responseTimeout = null;
        }
    }

    renderResponses() {
        const container = document.getElementById('responsesContainer');
        if (this.responses.length === 0) {
            container.innerHTML = `
                <div class="empty-state">
                    <p>No responses yet. Enter a query and click "Send Query" to get started.</p>
                </div>
            `;
        }
    }

    showError(message) {
        const container = document.getElementById('responsesContainer');
        container.innerHTML = `
            <div class="error-message">
                <strong>Error:</strong> ${message}
            </div>
        `;
        this.isProcessing = false;
        this.updateSendButtonState();
    }

    async saveQueryToHistory() {
        try {
            const history = await this.getStorageData('queryHistory') || [];
            
            const queryEntry = {
                query: this.currentQuery,
                responses: this.responses.filter(r => !r.error),
                timestamp: Date.now()
            };

            history.unshift(queryEntry);
            
            if (history.length > 5) {
                history.splice(5);
            }

            await chrome.storage.local.set({ queryHistory: history });
        } catch (error) {
            console.error('Error saving query to history:', error);
        }
    }

    // Add this method to your AIComparator class

async ensureContentScriptLoaded(tabId, platform) {
    try {
        // Test if content script is already loaded
        const testResponse = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
        console.log('Content script already loaded for', platform);
        return true;
    } catch (error) {
        console.log('Content script not loaded for', platform, '- injecting...');
        
        try {
            // Inject the appropriate content script
            const scriptFile = platform === 'Grok' ? 'content-grok.js' : 'content-chatgpt.js';
            
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: [scriptFile]
            });
            
            // Also inject utils if needed
            await chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['utils.js']
            });
            
            console.log('Content script injected successfully for', platform);
            
            // Wait a moment for initialization
            await new Promise(resolve => setTimeout(resolve, 1000));
            
            return true;
        } catch (injectionError) {
            console.error('Failed to inject content script:', injectionError);
            return false;
        }
    }
}

// Update your sendQueryToAIs method to use this
async sendQueryToAIs() {
    this.clearProcessedResponses();
    this.isProcessing = true;
    this.updateSendButtonState();
    
    // Clear previous responses
    this.responses = [];
    this.renderResponses();
    this.showLoadingStates();

    try {
        console.log('Ensuring content scripts are loaded...');
        
        // Ensure content scripts are loaded for all selected platforms
        for (const platformId of this.selectedPlatforms) {
            const platform = this.availablePlatforms.find(p => p.id === platformId);
            if (platform) {
                const loaded = await this.ensureContentScriptLoaded(platformId, platform.platform);
                if (!loaded) {
                    throw new Error(`Failed to load content script for ${platform.platform}`);
                }
            }
        }
        
        console.log('All content scripts ready, sending query...');
        
        // Original query sending logic
        const response = await chrome.runtime.sendMessage({
            type: 'sendQuery',
            query: this.currentQuery,
            platforms: this.selectedPlatforms.map(id => 
                this.availablePlatforms.find(p => p.id === id)
            )
        });

        if (response && response.success) {
            console.log('Query sent successfully, waiting for responses...');
            this.startResponseTimeout();
        } else {
            this.showError(response?.error || 'Failed to send query');
            this.isProcessing = false;
            this.updateSendButtonState();
        }
        
    } catch (error) {
        console.error('Error sending query:', error);
        this.showError('Failed to send query: ' + error.message);
        this.isProcessing = false;
        this.updateSendButtonState();
    }
}

    async loadSettings() {
        try {
            const settings = await this.getStorageData('settings') || {};
            document.getElementById('saveHistory').checked = settings.saveHistory || false;
        } catch (error) {
            console.error('Error loading settings:', error);
        }
    }

    async saveSettings() {
        try {
            const settings = {
                saveHistory: document.getElementById('saveHistory').checked
            };
            await chrome.storage.local.set({ settings });
        } catch (error) {
            console.error('Error saving settings:', error);
        }
    }

    async getStorageData(key) {
        return new Promise((resolve) => {
            chrome.storage.local.get([key], (result) => {
                resolve(result[key]);
            });
        });
    }

    destroy() {
        if (this.responseListener) {
            chrome.runtime.onMessage.removeListener(this.responseListener);
        }
        
        if (this.responseTimeout) {
            clearTimeout(this.responseTimeout);
        }
    }
}

// Initialize the comparator when popup loads
let aiComparator;
document.addEventListener('DOMContentLoaded', () => {
    console.log('Popup DOM loaded, initializing comparator...');
    aiComparator = new AIComparator();
});

// Clean up when popup unloads
window.addEventListener('beforeunload', () => {
    if (aiComparator) {
        aiComparator.destroy();
    }
});