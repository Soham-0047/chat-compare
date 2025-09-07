// Fixed Content script for Grok interaction
class GrokHandler {
    constructor() {
        this.platform = 'Grok';
        this.observer = null;
        this.isProcessing = false;
        this.lastMessageCount = 0;
        this.responseTimeout = null;
        this.sentQuery = '';
        this.queryTimestamp = 0;
        
        // Updated selectors for current Grok interface
        this.selectors = {
            input: [
                'textarea[placeholder*="Ask Grok"]',
                'textarea[aria-label*="Ask Grok"]',
                '.query-bar textarea',
                'div[contenteditable="true"]',
                'textarea'
            ],
            sendButton: [
                'button[aria-label*="Send"]',
                'button[type="submit"]',
                '.query-bar button'
            ],
            messageContainer: [
                '[data-testid="conversation"]',
                '[role="main"]',
                '.conversation-container',
                'main'
            ],
            messages: [
                '[data-testid*="message"]',
                '.message-content',
                '.chat-message',
                '[role="presentation"]'
            ],
            grokResponse: [
                '[data-testid="grokMessage"]',
                '.ai-message',
                '.assistant-message',
                '[data-role="assistant"]'
            ]
        };
        
        this.init();
    }

    init() {
        this.setupMessageListener();
        console.log('🤖 Grok content script initialized');
        
        // Debug after a delay to allow page to load
        setTimeout(() => this.debugInterface(), 2000);
    }

    debugInterface() {
        console.log('=== 🔍 Grok Interface Debug ===');
        
        // Check URL
        console.log('Current URL:', window.location.href);
        
        // Find input field
        let inputFound = false;
        for (const selector of this.selectors.input) {
            const input = document.querySelector(selector);
            if (input) {
                console.log('✅ Input found with selector:', selector);
                console.log('Input details:', {
                    placeholder: input.placeholder,
                    ariaLabel: input.getAttribute('aria-label'),
                    tagName: input.tagName
                });
                inputFound = true;
                break;
            }
        }
        
        if (!inputFound) {
            console.log('❌ No input field found');
            // Log all textareas for debugging
            const allTextareas = document.querySelectorAll('textarea');
            console.log('All textareas found:', allTextareas.length);
            allTextareas.forEach((textarea, i) => {
                console.log(`Textarea ${i}:`, {
                    placeholder: textarea.placeholder,
                    ariaLabel: textarea.getAttribute('aria-label'),
                    className: textarea.className
                });
            });
        }

        // Check for conversation container
        let containerFound = false;
        for (const selector of this.selectors.messageContainer) {
            const container = document.querySelector(selector);
            if (container) {
                console.log('✅ Message container found:', selector);
                containerFound = true;
                break;
            }
        }
        
        if (!containerFound) {
            console.log('❌ No message container found');
        }

        // Check existing messages
        const allMessages = this.getAllMessages();
        console.log('📨 Existing messages found:', allMessages.length);
    }

    setupMessageListener() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            console.log('📨 Grok handler received message:', message);
            
            if (message.type === 'sendQuery') {
                this.handleQuery(message.query, sendResponse);
                return true; // Keep message channel open
            }
        });
    }

    // async handleQuery(query, sendResponse) {
    //     if (this.isProcessing) {
    //         sendResponse({ success: false, error: 'Already processing a query' });
    //         return;
    //     }

    //     this.isProcessing = true;
    //     this.sentQuery = query;
    //     this.queryTimestamp = Date.now();
        
    //     console.log('🚀 Starting Grok query processing:', query);
        
    //     try {
    //         await this.waitForPageReady();
            
    //         // Get baseline message count BEFORE sending
    //         this.lastMessageCount = this.getAllMessages().length;
    //         console.log('📊 Baseline message count:', this.lastMessageCount);
            
    //         await this.injectQuery(query);
    //         this.startResponseWatcher();
            
    //         sendResponse({ success: true });
            
    //     } catch (error) {
    //         console.error('❌ Error handling Grok query:', error);
    //         this.isProcessing = false;
    //         sendResponse({ success: false, error: error.message });
    //         this.sendError(error.message);
    //     }
    // }

    // Update the handleQuery method to store the tab ID
async handleQuery(query, sendResponse) {
    if (this.isProcessing) {
        sendResponse({ success: false, error: 'Already processing a query' });
        return;
    }

    this.isProcessing = true;
    this.sentQuery = query;
    this.queryTimestamp = Date.now();
    
    // Store the tab ID from the message
    this.currentTabId = await this.getTabIdFromBackground();
    console.log('🚀 Starting Grok query processing. Tab ID:', this.currentTabId);
    
    try {
        await this.waitForPageReady();
        
        // Get baseline message count BEFORE sending
        this.lastMessageCount = this.getAllMessages().length;
        console.log('📊 Baseline message count:', this.lastMessageCount);
        
        await this.injectQuery(query);
        this.startResponseWatcher();
        
        sendResponse({ success: true });
        
    } catch (error) {
        console.error('❌ Error handling Grok query:', error);
        this.isProcessing = false;
        sendResponse({ success: false, error: error.message });
        this.sendError(error.message);
    }
}

    async waitForPageReady() {
        console.log('⏳ Waiting for Grok interface to be ready...');
        
        // Wait for input field
        let inputElement = null;
        for (const selector of this.selectors.input) {
            try {
                inputElement = await this.waitForElement(selector, 3000);
                console.log('✅ Input element found:', selector);
                break;
            } catch (e) {
                console.log('⏭️ Trying next input selector...');
            }
        }
        
        if (!inputElement) {
            throw new Error('Could not find Grok input field');
        }
        
        // Additional wait for page stability
        await new Promise(resolve => setTimeout(resolve, 1500));
        console.log('✅ Page ready');
    }

    async waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const element = document.querySelector(selector);
            if (element) {
                resolve(element);
                return;
            }

            const observer = new MutationObserver(() => {
                const element = document.querySelector(selector);
                if (element) {
                    observer.disconnect();
                    resolve(element);
                }
            });

            observer.observe(document.body, {
                childList: true,
                subtree: true
            });

            setTimeout(() => {
                observer.disconnect();
                reject(new Error(`Element ${selector} not found within ${timeout}ms`));
            }, timeout);
        });
    }

    async injectQuery(query) {
        console.log('📝 Injecting query into Grok:', query);
        
        // Find input element
        let inputElement = null;
        for (const selector of this.selectors.input) {
            inputElement = document.querySelector(selector);
            if (inputElement) {
                console.log('✅ Using input selector:', selector);
                break;
            }
        }

        if (!inputElement) {
            throw new Error('Could not find Grok input field');
        }

        // Focus and clear
        inputElement.focus();
        await new Promise(resolve => setTimeout(resolve, 300));

        // Clear existing content
        inputElement.value = '';
        inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        await new Promise(resolve => setTimeout(resolve, 200));

        // Type the query character by character
        await this.typeText(inputElement, query);
        console.log('✅ Query typed successfully');

        // Wait before sending
        await new Promise(resolve => setTimeout(resolve, 800));

        // Try Enter key first
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });

        inputElement.dispatchEvent(enterEvent);
        console.log('⌨️ Enter key dispatched');

        // Wait and check if message was sent
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        // If input still has content, try send button
        if (inputElement.value.trim().length > 0) {
            console.log('🔄 Trying send button fallback...');
            
            for (const selector of this.selectors.sendButton) {
                const sendButton = document.querySelector(selector);
                if (sendButton && !sendButton.disabled) {
                    sendButton.click();
                    console.log('🖱️ Send button clicked:', selector);
                    break;
                }
            }
        } else {
            console.log('✅ Message appears to have been sent (input cleared)');
        }

        // Scroll to show latest messages
        this.scrollToBottom();
    }

    async typeText(element, text) {
        element.value = '';
        
        for (let i = 0; i < text.length; i++) {
            element.value += text[i];
            
            // Dispatch input event for each character
            const inputEvent = new Event('input', { 
                bubbles: true, 
                cancelable: true,
                data: text[i]
            });
            element.dispatchEvent(inputEvent);
            
            await new Promise(resolve => setTimeout(resolve, 30)); // Typing delay
        }
        
        // Final change event
        element.dispatchEvent(new Event('change', { bubbles: true }));
    }

    getAllMessages() {
        // Try multiple selectors to find messages
        let messages = [];
        
        for (const selector of this.selectors.messages) {
            const found = document.querySelectorAll(selector);
            if (found.length > 0) {
                messages = Array.from(found);
                break;
            }
        }
        
        // If no specific message selectors work, try general approach
        if (messages.length === 0) {
            // Look for common message patterns
            const possibleMessages = document.querySelectorAll([
                'div[class*="message"]',
                'div[data-testid*="message"]',
                '[role="presentation"]'
            ].join(','));
            
            messages = Array.from(possibleMessages).filter(el => {
                const text = el.textContent?.trim();
                return text && text.length > 10; // Has meaningful content
            });
        }
        
        return messages;
    }

    startResponseWatcher() {
        console.log('👀 Starting Grok response watcher...');
        
        // Find the best container to observe
        let targetNode = null;
        for (const selector of this.selectors.messageContainer) {
            targetNode = document.querySelector(selector);
            if (targetNode) {
                console.log('📦 Watching container:', selector);
                break;
            }
        }
        
        if (!targetNode) {
            targetNode = document.body;
            console.log('📦 Fallback to watching document.body');
        }

        this.observer = new MutationObserver((mutations) => {
            this.handleMutations(mutations);
        });

        this.observer.observe(targetNode, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ['data-testid', 'class']
        });

        // Set timeout for response
        this.responseTimeout = setTimeout(() => {
            console.log('⏰ Response timeout reached');
            this.handleTimeout();
        }, 90000); // 90 seconds
    }

    handleMutations(mutations) {
        if (!this.isProcessing) return;
        
        const currentMessages = this.getAllMessages();
        const currentCount = currentMessages.length;
        
        console.log('🔄 Mutation detected. Messages:', currentCount, 'Previous:', this.lastMessageCount);
        
        if (currentCount > this.lastMessageCount) {
            console.log('📈 New message detected!');
            
            // Wait for message to potentially finish loading
            setTimeout(() => {
                this.extractLatestResponse();
            }, 3000);
        }
        
        // Also check for specific Grok response indicators
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        // Check if this looks like a Grok response
                        if (this.looksLikeGrokResponse(node)) {
                            console.log('🤖 Potential Grok response detected in mutation');
                            setTimeout(() => this.extractLatestResponse(), 2000);
                        }
                    }
                });
            }
        });
    }

    looksLikeGrokResponse(element) {
        // Check for Grok-specific indicators
        const text = element.textContent || '';
        const className = element.className || '';
        const testId = element.getAttribute('data-testid') || '';
        
        return (
            testId.includes('grok') ||
            testId.includes('message') ||
            className.includes('ai-message') ||
            className.includes('assistant') ||
            (text.length > 50 && !this.isUserMessage(text))
        );
    }

    async extractLatestResponse() {
        if (!this.isProcessing) {
            console.log('⏹️ Not processing, skipping extraction');
            return;
        }

        console.log('🔍 Extracting latest Grok response...');

        try {
            const allMessages = this.getAllMessages();
            console.log('📨 Total messages found:', allMessages.length);

            if (allMessages.length === 0) {
                throw new Error('No messages found');
            }

            // Look for the newest message that's likely from Grok
            let grokResponse = null;
            
            // Start from the end and work backwards
            for (let i = allMessages.length - 1; i >= 0; i--) {
                const message = allMessages[i];
                const text = this.extractMessageText(message);
                
                console.log(`📝 Checking message ${i}:`, text.substring(0, 100) + '...');
                
                // Skip if still generating
                if (this.isMessageGenerating(message)) {
                    console.log('⏳ Message still generating, waiting...');
                    setTimeout(() => this.extractLatestResponse(), 2000);
                    return;
                }
                
                // Check if this is likely a Grok response
                if (this.isGrokResponse(message, text)) {
                    grokResponse = text;
                    console.log('✅ Found Grok response!');
                    break;
                }
            }

            if (!grokResponse) {
                throw new Error('Could not identify Grok response in messages');
            }

            if (grokResponse.length < 10) {
                throw new Error('Response too short: ' + grokResponse);
            }

            this.sendResponse(grokResponse);

        } catch (error) {
            console.error('❌ Error extracting Grok response:', error);
            
            // Try one more time after a delay
            if (error.message.includes('still generating')) {
                setTimeout(() => this.extractLatestResponse(), 3000);
            } else {
                this.sendError(error.message);
            }
        }
    }

    isGrokResponse(messageElement, text) {
        // Multiple heuristics to identify Grok responses
        
        // 1. Check data attributes
        const testId = messageElement.getAttribute('data-testid') || '';
        if (testId.includes('grok') || testId.includes('assistant')) {
            return true;
        }
        
        // 2. Check for AI-like content length and structure
        if (text.length > 100 && this.hasAICharacteristics(text)) {
            return true;
        }
        
        // 3. Check if it's NOT our sent query
        if (!this.isUserMessage(text)) {
            return true;
        }
        
        return false;
    }

    hasAICharacteristics(text) {
        // Look for patterns common in AI responses
        const aiIndicators = [
            /I can help/i,
            /Here's/i,
            /Let me/i,
            /Based on/i,
            /According to/i,
            /\d+\./,  // Numbered lists
            /\*\*/,   // Bold formatting
            /\n\n/    // Paragraphs
        ];
        
        return aiIndicators.some(pattern => pattern.test(text));
    }

    isUserMessage(text) {
        // Check if this matches our sent query (with some tolerance)
        if (!this.sentQuery) return false;
        
        const similarity = this.calculateSimilarity(
            text.toLowerCase().trim(), 
            this.sentQuery.toLowerCase().trim()
        );
        
        return similarity > 0.8; // 80% similarity threshold
    }

    calculateSimilarity(str1, str2) {
        // Simple similarity calculation
        const longer = str1.length > str2.length ? str1 : str2;
        const shorter = str1.length > str2.length ? str2 : str1;
        
        if (longer.length === 0) return 1.0;
        
        const distance = this.levenshteinDistance(longer, shorter);
        return (longer.length - distance) / longer.length;
    }

    levenshteinDistance(str1, str2) {
        const matrix = [];
        for (let i = 0; i <= str2.length; i++) {
            matrix[i] = [i];
        }
        for (let j = 0; j <= str1.length; j++) {
            matrix[0][j] = j;
        }
        for (let i = 1; i <= str2.length; i++) {
            for (let j = 1; j <= str1.length; j++) {
                if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
                    matrix[i][j] = matrix[i - 1][j - 1];
                } else {
                    matrix[i][j] = Math.min(
                        matrix[i - 1][j - 1] + 1,
                        matrix[i][j - 1] + 1,
                        matrix[i - 1][j] + 1
                    );
                }
            }
        }
        return matrix[str2.length][str1.length];
    }

    isMessageGenerating(messageElement) {
        // Check for loading indicators
        const loadingSelectors = [
            '.loading',
            '.generating',
            '.typing-indicator',
            '.spinner',
            '[data-loading="true"]'
        ];

        for (const selector of loadingSelectors) {
            if (messageElement.querySelector(selector)) {
                return true;
            }
        }

        // Check text patterns that indicate generation in progress
        const text = messageElement.textContent || '';
        return text.endsWith('...') || text.endsWith('▌') || text.length < 5;
    }

    extractMessageText(messageElement) {
        // Try multiple approaches to extract text
        const candidates = [
            messageElement.querySelector('[data-testid*="content"]'),
            messageElement.querySelector('p'),
            messageElement.querySelector('div[class*="content"]'),
            messageElement.querySelector('span'),
            messageElement
        ].filter(Boolean);

        for (const candidate of candidates) {
            let text = candidate.textContent || candidate.innerText || '';
            text = this.cleanText(text);
            
            if (text && text.length > 3) {
                return text;
            }
        }

        return '';
    }

    cleanText(text) {
        return text
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^(Grok|AI|Assistant):\s*/i, '');
    }

    scrollToBottom() {
        window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth'
        });
    }

    // async sendResponse(responseText) {
    //     console.log('✅ Sending Grok response to background script');
        
    //     try {
    //         // Get the current tab ID
    //         const tabId = await this.getCurrentTabId();
            
    //         await chrome.runtime.sendMessage({
    //             type: 'aiResponse',
    //             data: {
    //                 platform: this.platform,
    //                 platformId: tabId,
    //                 text: responseText,
    //                 timestamp: Date.now()
    //             }
    //         });
            
    //         console.log('📤 Response sent successfully');
    //     } catch (error) {
    //         console.error('❌ Error sending response:', error);
    //     }

    //     this.cleanup();
    // }

    async sendResponse(responseText) {
    console.log('✅ Sending Grok response to background script');
    
    try {
        // Get the tab ID from the message that was sent to us
        const tabId = this.currentTabId || await this.getTabIdFromBackground();
        
        await chrome.runtime.sendMessage({
            type: 'aiResponse',
            data: {
                platform: this.platform,
                platformId: tabId,
                text: responseText,
                timestamp: Date.now()
            }
        });
        
        console.log('📤 Response sent successfully');
    } catch (error) {
        console.error('❌ Error sending response:', error);
    }

    this.cleanup();
}

    // async sendError(errorMessage) {
    //     console.error('❌ Sending Grok error:', errorMessage);
        
    //     try {
    //         const tabId = await this.getCurrentTabId();
            
    //         await chrome.runtime.sendMessage({
    //             type: 'aiError',
    //             data: {
    //                 platform: this.platform,
    //                 platformId: tabId,
    //                 error: errorMessage
    //             }
    //         });
    //     } catch (error) {
    //         console.error('❌ Error sending error message:', error);
    //     }

    //     this.cleanup();
    // }

    async sendError(errorMessage) {
    console.error('❌ Sending Grok error:', errorMessage);
    
    try {
        const tabId = this.currentTabId || await this.getTabIdFromBackground();
        
        await chrome.runtime.sendMessage({
            type: 'aiError',
            data: {
                platform: this.platform,
                platformId: tabId,
                error: errorMessage
            }
        });
    } catch (error) {
        console.error('❌ Error sending error message:', error);
    }

    this.cleanup();
    }

    async getTabIdFromBackground() {
    try {
        const response = await chrome.runtime.sendMessage({ type: 'getTabId' });
        return response?.tabId || 0;
    } catch (error) {
        console.error('Failed to get tab ID from background:', error);
        return 0;
    }
}


    async getCurrentTabId() {
        // Try to get tab ID from chrome.runtime if available in content script context
        try {
            if (chrome.tabs) {
                const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
                return tabs[0]?.id || 0;
            }
        } catch (e) {
            // chrome.tabs not available in content script
        }
        
        // Alternative: Parse from URL or use window location
        return window.location.href.includes('grok.com') ? 
            Math.floor(Math.random() * 100000) : 0; // Fallback random ID
    }

    handleTimeout() {
        if (!this.isProcessing) return;
        console.log('⏰ Grok response timeout');
        this.sendError('Response timeout after 90 seconds');
    }

    cleanup() {
        console.log('🧹 Cleaning up Grok handler');
        this.isProcessing = false;
        
        if (this.observer) {
            this.observer.disconnect();
            this.observer = null;
        }
        
        if (this.responseTimeout) {
            clearTimeout(this.responseTimeout);
            this.responseTimeout = null;
        }
        
        this.sentQuery = '';
        this.queryTimestamp = 0;
    }
}

// Initialize the Grok handler
console.log('🚀 Initializing Grok handler...');
if (typeof window !== 'undefined') {
    window.grokHandler = new GrokHandler();
} else {
    new GrokHandler();
}