// Shared utilities for content scripts
class AIUtils {
    static waitForElement(selector, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const check = () => {
                const element = document.querySelector(selector);
                if (element) {
                    resolve(element);
                    return;
                }
                
                if (Date.now() - startTime > timeout) {
                    reject(new Error(`Element ${selector} not found within ${timeout}ms`));
                    return;
                }
                
                setTimeout(check, 100);
            };
            
            check();
        });
    }

    static waitForElements(selectors, timeout = 10000) {
        return new Promise((resolve, reject) => {
            const startTime = Date.now();
            
            const check = () => {
                for (const selector of selectors) {
                    const element = document.querySelector(selector);
                    if (element) {
                        resolve({ element, selector });
                        return;
                    }
                }
                
                if (Date.now() - startTime > timeout) {
                    reject(new Error(`None of the elements found within ${timeout}ms: ${selectors.join(', ')}`));
                    return;
                }
                
                setTimeout(check, 100);
            };
            
            check();
        });
    }

    static simulateTyping(element, text, delay = 50) {
        return new Promise((resolve) => {
            element.focus();
            element.value = '';
            
            let index = 0;
            const typeChar = () => {
                if (index < text.length) {
                    element.value += text[index];
                    element.dispatchEvent(new Event('input', { bubbles: true }));
                    index++;
                    setTimeout(typeChar, delay);
                } else {
                    resolve();
                }
            };
            
            typeChar();
        });
    }

    static simulateKeyPress(element, key, options = {}) {
        const event = new KeyboardEvent('keydown', {
            key: key,
            code: key === 'Enter' ? 'Enter' : `Key${key.toUpperCase()}`,
            keyCode: key === 'Enter' ? 13 : key.charCodeAt(0),
            which: key === 'Enter' ? 13 : key.charCodeAt(0),
            bubbles: true,
            cancelable: true,
            ...options
        });
        
        element.dispatchEvent(event);
    }

    static cleanText(text) {
        return text
            .replace(/\s+/g, ' ')
            .trim()
            .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/&nbsp;/g, ' ');
    }

    static createObserver(targetNode, callback, options = {}) {
        const defaultOptions = {
            childList: true,
            subtree: true,
            attributes: false,
            attributeOldValue: false,
            characterData: false,
            characterDataOldValue: false
        };
        
        const observer = new MutationObserver(callback);
        observer.observe(targetNode, { ...defaultOptions, ...options });
        return observer;
    }

    static async retry(fn, maxAttempts = 3, delay = 1000) {
        let lastError;
        
        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
            try {
                return await fn();
            } catch (error) {
                lastError = error;
                console.log(`Attempt ${attempt} failed:`, error.message);
                
                if (attempt < maxAttempts) {
                    await new Promise(resolve => setTimeout(resolve, delay * attempt));
                }
            }
        }
        
        throw lastError;
    }

    static scrollToBottom() {
        window.scrollTo({
            top: document.documentElement.scrollHeight,
            behavior: 'smooth'
        });
    }

    static isElementVisible(element) {
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 &&
               rect.top >= 0 && rect.left >= 0 &&
               rect.bottom <= window.innerHeight &&
               rect.right <= window.innerWidth;
    }
}

// Make AIUtils available globally
window.AIUtils = AIUtils;