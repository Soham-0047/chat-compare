// Content script for ChatGPT interaction
class ChatGPTHandler {
    constructor() {
        this.platform = 'ChatGPT';
        this.observer = null;
        this.isProcessing = false;
        this.lastMessageCount = 0;
        this.responseTimeout = null;
        this.sentQuery = '';
        this.queryTimestamp = 0;
        this.currentTabId = null;
        
        // Updated selectors for current ChatGPT interface
        this.selectors = {
            input: [
                'textarea[data-id="root"]',
                'textarea[placeholder*="Message"]',
                'textarea[placeholder*="Send a message"]',
                '#prompt-textarea',
                'div[contenteditable="true"]',
                'textarea'
            ],
            sendButton: [
                'button[data-testid="send-button"]',
                'button[aria-label*="Send"]',
                '[data-testid="send-button"]',
                'button[type="submit"]'
            ],
            messageContainer: [
                '[data-testid="conversation-turn"]',
                '.conversation-turn',
                '[role="main"]',
                '.chat-container',
                'main'
            ],
            messages: [
                '[data-message-author-role="assistant"]',
                '[data-message-author-role="user"]',
                '.group.w-full.text-token-text-primary',
                '.markdown.prose',
                '[role="presentation"]'
            ],
            assistantMessages: [
                '[data-message-author-role="assistant"]',
                '.group.w-full.text-token-text-primary:has(.markdown)',
                '.ai-message',
                '.assistant-message'
            ]
        };
        
        this.init();
    }

    init() {
        this.setupMessageListener();
        console.log('🤖 ChatGPT content script initialized');
        
        // Debug after a delay to allow page to load
        setTimeout(() => this.debugInterface(), 2000);
    }

    debugInterface() {
        console.log('=== 🔍 ChatGPT Interface Debug ===');
        
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
                    tagName: input.tagName,
                    dataId: input.getAttribute('data-id')
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
                    className: textarea.className,
                    dataId: textarea.getAttribute('data-id')
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
            console.log('📨 ChatGPT handler received message:', message);
            
            if (message.type === 'sendQuery') {
                this.handleQuery(message.query, sendResponse);
                return true; // Keep message channel open
            } else if (message.type === 'ping') {
                sendResponse({ status: 'ready' });
            }
        });
    }

    async handleQuery(query, sendResponse) {
        if (this.isProcessing) {
            sendResponse({ success: false, error: 'Already processing a query' });
            return;
        }

        this.isProcessing = true;
        this.sentQuery = query;
        this.queryTimestamp = Date.now();
        
        // Store the tab ID from the background
        this.currentTabId = await this.getTabIdFromBackground();
        console.log('🚀 Starting ChatGPT query processing. Tab ID:', this.currentTabId);
        
        try {
            await this.waitForPageReady();
            
            // Get baseline message count BEFORE sending
            this.lastMessageCount = this.getAllMessages().length;
            console.log('📊 Baseline message count:', this.lastMessageCount);
            
            await this.injectQuery(query);
            this.startResponseWatcher();
            
            sendResponse({ success: true });
            
        } catch (error) {
            console.error('❌ Error handling ChatGPT query:', error);
            this.isProcessing = false;
            sendResponse({ success: false, error: error.message });
            this.sendError(error.message);
        }
    }

    async waitForPageReady() {
        console.log('⏳ Waiting for ChatGPT interface to be ready...');
        
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
            throw new Error('Could not find ChatGPT input field. Please make sure you are on the chat page and logged in.');
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
        console.log('📝 Injecting query into ChatGPT:', query);
        
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
            throw new Error('Could not find ChatGPT input field');
        }

        // Focus and clear
        inputElement.focus();
        await new Promise(resolve => setTimeout(resolve, 300));

        // Clear existing content
        if (inputElement.tagName.toLowerCase() === 'textarea') {
            inputElement.value = '';
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        } else {
            // For contenteditable div
            inputElement.textContent = '';
            inputElement.dispatchEvent(new Event('input', { bubbles: true }));
        }
        
        await new Promise(resolve => setTimeout(resolve, 200));

        // Type the query
        await this.typeText(inputElement, query);
        console.log('✅ Query typed successfully');

        // Wait before sending
        await new Promise(resolve => setTimeout(resolve, 800));

        // Try to send the message
        await this.sendMessage(inputElement);

        // Scroll to show latest messages
        this.scrollToBottom();
    }

    async typeText(element, text) {
        if (element.tagName.toLowerCase() === 'textarea') {
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
                
                await new Promise(resolve => setTimeout(resolve, 20)); // Typing delay
            }
            
            // Final change event
            element.dispatchEvent(new Event('change', { bubbles: true }));
        } else {
            // For contenteditable elements
            element.textContent = text;
            element.dispatchEvent(new Event('input', { bubbles: true }));
        }
    }

    async sendMessage(inputElement) {
        // Method 1: Try send button
        for (const selector of this.selectors.sendButton) {
            const sendButton = document.querySelector(selector);
            if (sendButton && !sendButton.disabled) {
                console.log('🖱️ Clicking send button:', selector);
                sendButton.click();
                
                // Wait and check if message was sent
                await new Promise(resolve => setTimeout(resolve, 1000));
                
                const currentValue = inputElement.value || inputElement.textContent || '';
                if (currentValue.trim().length === 0) {
                    console.log('✅ Message sent via button');
                    return;
                }
            }
        }

        // Method 2: Try Enter key
        console.log('⌨️ Trying Enter key...');
        const enterEvent = new KeyboardEvent('keydown', {
            key: 'Enter',
            keyCode: 13,
            which: 13,
            bubbles: true,
            cancelable: true
        });

        inputElement.dispatchEvent(enterEvent);
        
        // Wait and verify
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        const currentValue = inputElement.value || inputElement.textContent || '';
        if (currentValue.trim().length === 0) {
            console.log('✅ Message sent via Enter key');
            return;
        }

        console.log('⚠️ Message may not have been sent');
    }

    getAllMessages() {
        // Try multiple selectors to find all messages
        let messages = [];
        
        for (const selector of this.selectors.messages) {
            const found = document.querySelectorAll(selector);
            if (found.length > 0) {
                messages = Array.from(found);
                break;
            }
        }
        
        // If no specific selectors work, try general approach
        if (messages.length === 0) {
            const possibleMessages = document.querySelectorAll([
                'div[class*="group"]',
                'div[data-message-author-role]',
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
        console.log('👀 Starting ChatGPT response watcher...');
        
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
            attributeFilter: ['data-message-author-role', 'class']
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
        
        // Also check for specific ChatGPT response indicators
        mutations.forEach(mutation => {
            if (mutation.type === 'childList') {
                mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                        // Check if this looks like a ChatGPT response
                        if (this.looksChatGPTResponse(node)) {
                            console.log('🤖 Potential ChatGPT response detected in mutation');
                            setTimeout(() => this.extractLatestResponse(), 2000);
                        }
                    }
                });
            }
        });
    }

    looksChatGPTResponse(element) {
        // Check for ChatGPT-specific indicators
        const authorRole = element.getAttribute('data-message-author-role');
        const className = element.className || '';
        const text = element.textContent || '';
        
        return (
            authorRole === 'assistant' ||
            className.includes('markdown') ||
            className.includes('prose') ||
            (text.length > 50 && !this.isUserMessage(text))
        );
    }

    async extractLatestResponse() {
        if (!this.isProcessing) {
            console.log('⏹️ Not processing, skipping extraction');
            return;
        }

        console.log('🔍 Extracting latest ChatGPT response...');

        try {
            // Get all assistant messages specifically
            let assistantMessages = [];
            
            for (const selector of this.selectors.assistantMessages) {
                assistantMessages = document.querySelectorAll(selector);
                if (assistantMessages.length > 0) {
                    console.log('✅ Found assistant messages with selector:', selector);
                    break;
                }
            }
            
            if (assistantMessages.length === 0) {
                throw new Error('No assistant messages found');
            }

            // Get the last assistant message
            const lastMessage = assistantMessages[assistantMessages.length - 1];
            console.log('📝 Checking last assistant message');
            
            // Check if the message is still being generated
            if (this.isMessageGenerating(lastMessage)) {
                console.log('⏳ Message still generating, waiting...');
                setTimeout(() => this.extractLatestResponse(), 2000);
                return;
            }
            
            // Extract the complete response text
            const responseText = this.extractMessageText(lastMessage);
            
            if (!responseText || responseText.length < 10) {
                throw new Error('Response too short: ' + responseText);
            }

            // Verify this isn't our sent query
            if (this.isUserMessage(responseText)) {
                throw new Error('Found user message instead of assistant response');
            }

            this.sendResponse(responseText);

        } catch (error) {
            console.error('❌ Error extracting ChatGPT response:', error);
            
            // Try one more time after a delay
            if (error.message.includes('still generating')) {
                setTimeout(() => this.extractLatestResponse(), 3000);
            } else {
                this.sendError(error.message);
            }
        }
    }

    isMessageGenerating(messageElement) {
        // Check for loading/generation indicators
        const loadingSelectors = [
            '.result-streaming',
            '.generating',
            '.typing-indicator',
            '[data-streaming="true"]',
            '.loading',
            '.spinner'
        ];

        for (const selector of loadingSelectors) {
            if (messageElement.querySelector(selector)) {
                return true;
            }
        }

        // Check text patterns that indicate generation in progress
        const text = messageElement.textContent || '';
        return text.endsWith('▌') || text.endsWith('|') || text.endsWith('...');
    }

    extractMessageText(messageElement) {
        // Try multiple approaches to extract clean text
        const candidates = [
            messageElement.querySelector('.markdown'),
            messageElement.querySelector('[data-message-text]'),
            messageElement.querySelector('.prose'),
            messageElement.querySelector('div > div > div'),
            messageElement
        ].filter(Boolean);

        for (const candidate of candidates) {
            let text = candidate.textContent || candidate.innerText || '';
            text = this.cleanText(text);
            
            if (text && text.length > 5) {
                return text;
            }
        }

        return '';
    }

    cleanText(text) {
        return text
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/^(ChatGPT|AI|Assistant):\s*/i, '');
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

    scrollToBottom() {
        window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth'
        });
    }

    async sendResponse(responseText) {
        console.log('✅ Sending ChatGPT response to background script');
        
        try {
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

    async sendError(errorMessage) {
        console.error('❌ Sending ChatGPT error:', errorMessage);
        
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

    handleTimeout() {
        if (!this.isProcessing) return;
        console.log('⏰ ChatGPT response timeout');
        this.sendError('Response timeout after 90 seconds');
    }

    cleanup() {
        console.log('🧹 Cleaning up ChatGPT handler');
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
        this.currentTabId = null;
    }
}

// Initialize the ChatGPT handler
console.log('🚀 Initializing ChatGPT handler...');
if (typeof window !== 'undefined') {
    window.chatGPTHandler = new ChatGPTHandler();
} else {
    new ChatGPTHandler();
}