const { normalizeCheckResult } = require('./shared.js');

const DEEPSEEK_INPUT_SELECTORS = [
  'textarea[id*="chat"]',
  'textarea[placeholder*="message"]',
  'textarea[placeholder*="Ask"]',
  '.chat-input textarea',
  '#chat-input',
];

const DEEPSEEK_SEND_BUTTON_SELECTORS = [
  'button[type="submit"]',
  'button[aria-label*="Send"]',
  'button[aria-label*="send"]',
  'button[class*="send"]',
  'button[class*="submit"]',
  '[data-testid="send-button"]',
];

const DEEPSEEK_RESPONSE_CONTAINER_SELECTORS = [
  '[class*="assistant-message"]',
  '[data-testid="assistant-response"]',
  '[class*="response-content"]',
  '.markdown.prose',
  '[class*="message-content"]',
];

const DEEPSEEK_STOP_BUTTON_SELECTORS = [
  'button[aria-label*="Stop"]',
  'button[aria-label*="stop"]',
  'button[class*="stop-generating"]',
  '[data-testid="stop-button"]',
];

const DEEPSEEK_STREAMING_INDICATORS = [
  '[class*="typing"]',
  '[class*="streaming"]',
  '[class*="generating"]',
  '[data-testid="streaming-indicator"]',
];

const DEEPSEEK_LOGIN_PAGE_INDICATORS = [
  'button[class*="login"]',
  'button[class*="sign-in"]',
  'a[href*="login"]',
  'a[href*="signin"]',
  '[class*="login-button"]',
  '[class*="signin-button"]',
  'form[action*="login"]',
];

const DEEPSEEK_AUTHENTICATED_INDICATORS = [
  '[class*="user-menu"]',
  '[class*="user-profile"]',
  '[data-testid="user-menu"]',
  'button[aria-label*="account"]',
  'button[aria-label*="profile"]',
];

async function checkLogin(page) {
  try {
    const result = await page.evaluate((loginIndicators, authIndicators) => {
      for (const selector of loginIndicators) {
        const element = document.querySelector(selector);
        if (element) {
          const style = window.getComputedStyle(element);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return { loginPage: true };
          }
        }
      }
      
      for (const selector of authIndicators) {
        const element = document.querySelector(selector);
        if (element) {
          const style = window.getComputedStyle(element);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return { authenticated: true };
          }
        }
      }
      
      return { loginPage: false, authenticated: false };
    }, DEEPSEEK_LOGIN_PAGE_INDICATORS, DEEPSEEK_AUTHENTICATED_INDICATORS);
    
    if (result.loginPage) {
      return normalizeCheckResult({ 
        passed: false, 
        reason: 'Login page detected - sign-in button visible' 
      });
    }
    
    if (result.authenticated) {
      return normalizeCheckResult({ passed: true, details: 'User authenticated' });
    }
    
    return normalizeCheckResult({ 
      passed: false, 
      reason: 'No authenticated user indicators found and no login page detected' 
    });
  } catch (err) {
    return normalizeCheckResult({ 
      passed: false, 
      reason: `Login check failed: ${err.message}` 
    });
  }
}

async function checkInput(page) {
  try {
    const result = await page.evaluate((selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          const style = window.getComputedStyle(element);
          const isVisible = style.display !== 'none' && 
                           style.visibility !== 'hidden' && 
                           style.opacity !== '0';
          const isUsable = !element.disabled && 
                          !element.hasAttribute('readonly') &&
                          element.offsetWidth > 0 && 
                          element.offsetHeight > 0;
          
          if (isVisible && isUsable) {
            return { found: true, selector, visible: true, usable: true };
          }
        }
      }
      return { found: false };
    }, DEEPSEEK_INPUT_SELECTORS);
    
    if (result.found && result.visible && result.usable) {
      return normalizeCheckResult({ 
        passed: true, 
        selector: result.selector,
        details: `Active chat input found: ${result.selector}` 
      });
    }
    
    if (result.found && !result.visible) {
      return normalizeCheckResult({ 
        passed: false, 
        reason: 'Input element found but not visible' 
      });
    }
    
    if (result.found && !result.usable) {
      return normalizeCheckResult({ 
        passed: false, 
        reason: 'Input element found but not usable (disabled or readonly)' 
      });
    }
    
    return normalizeCheckResult({ 
      passed: false, 
      reason: 'No active chat input element found on page' 
    });
  } catch (err) {
    return normalizeCheckResult({ 
      passed: false, 
      reason: `Input check failed: ${err.message}` 
    });
  }
}

function getDoctorAdapter({ page }) {
  return {
    checkLogin: () => checkLogin(page),
    checkInput: () => checkInput(page),
  };
}

async function injectPrompt(page, prompt) {
  try {
    const result = await page.evaluate((selectors, text) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          const style = window.getComputedStyle(element);
          const isVisible = style.display !== 'none' && 
                           style.visibility !== 'hidden' && 
                           style.opacity !== '0';
          const isUsable = !element.disabled && 
                          !element.hasAttribute('readonly') &&
                          element.offsetWidth > 0 && 
                          element.offsetHeight > 0;
          
          if (isVisible && isUsable) {
            const beforeState = {
              value: element.value,
              selectionStart: element.selectionStart,
              selectionEnd: element.selectionEnd,
            };
            
            element.focus();
            element.value = '';
            document.execCommand('insertText', false, text);
            
            const afterState = {
              value: element.value,
              timestamp: Date.now(),
            };
            
            return { 
              injected: true, 
              selector,
              requestMarker: {
                inputSelector: selector,
                beforeValue: beforeState.value,
                afterValue: afterState.value,
                timestamp: afterState.timestamp,
              },
            };
          }
        }
      }
      return { injected: false, reason: 'No usable input element found' };
    }, DEEPSEEK_INPUT_SELECTORS, prompt);
    
    if (result.injected) {
      return { 
        success: true, 
        selector: result.selector,
        requestMarker: result.requestMarker,
      };
    }
    
    return { success: false, reason: result.reason };
  } catch (err) {
    return { success: false, reason: `injectPrompt error: ${err.message}` };
  }
}

async function triggerSend(page) {
  try {
    const result = await page.evaluate((selectors) => {
      for (const selector of selectors) {
        const element = document.querySelector(selector);
        if (element) {
          const style = window.getComputedStyle(element);
          const isVisible = style.display !== 'none' && 
                           style.visibility !== 'hidden';
          const isEnabled = !element.disabled;
          
          if (isVisible && isEnabled) {
            element.click();
            return { clicked: true, selector, timestamp: Date.now() };
          }
        }
      }
      return { clicked: false, reason: 'No clickable send button found' };
    }, DEEPSEEK_SEND_BUTTON_SELECTORS);
    
    if (result.clicked) {
      return { success: true, selector: result.selector, timestamp: result.timestamp };
    }
    
    return { success: false, reason: result.reason };
  } catch (err) {
    return { success: false, reason: `triggerSend error: ${err.message}` };
  }
}

async function detectResponseStart(page, requestContext) {
  try {
    const requestTimestamp = requestContext?.requestTimestamp || 0;
    const requestMarker = requestContext?.requestMarker;
    
    const result = await page.evaluate((stopSelectors, responseSelectors, streamingIndicators, reqTimestamp, reqMarker) => {
      for (const selector of stopSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const style = window.getComputedStyle(element);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return { 
              started: true, 
              indicator: 'stop-button',
              responseMarker: { type: 'stop-button-visible', timestamp: Date.now() },
            };
          }
        }
      }
      
      for (const selector of streamingIndicators) {
        const element = document.querySelector(selector);
        if (element) {
          const style = window.getComputedStyle(element);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return { 
              started: true, 
              indicator: 'streaming-indicator',
              responseMarker: { type: 'streaming', timestamp: Date.now() },
            };
          }
        }
      }
      
      const responseElements = [];
      for (const selector of responseSelectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          const text = el.textContent?.trim() || '';
          if (text.length > 0) {
            responseElements.push({
              selector,
              text: text.substring(0, 100),
              textLength: text.length,
              element: el,
            });
          }
        });
      }
      
      if (responseElements.length > 0) {
        const lastElement = responseElements[responseElements.length - 1];
        
        if (reqTimestamp > 0) {
          const elementTimestamp = lastElement.element?.dataset?.timestamp 
            ? parseInt(lastElement.element.dataset.timestamp, 10) 
            : 0;
          
          if (elementTimestamp > 0 && elementTimestamp < reqTimestamp) {
            return { 
              started: false, 
              reason: 'Response content exists but predates request (stale content)',
              staleContentDetected: true,
            };
          }
        }
        
        return { 
          started: true, 
          indicator: 'response-content',
          responseMarker: {
            type: 'content-detected',
            selector: lastElement.selector,
            textLength: lastElement.textLength,
            timestamp: Date.now(),
          },
        };
      }
      
      return { started: false, reason: 'No response start indicators found' };
    }, DEEPSEEK_STOP_BUTTON_SELECTORS, DEEPSEEK_RESPONSE_CONTAINER_SELECTORS, DEEPSEEK_STREAMING_INDICATORS, requestTimestamp, requestMarker);
    
    return result;
  } catch (err) {
    return { started: false, reason: `detectResponseStart error: ${err.message}` };
  }
}

async function detectResponseComplete(page, requestContext) {
  try {
    const result = await page.evaluate((stopSelectors, streamingIndicators) => {
      for (const selector of stopSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const style = window.getComputedStyle(element);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return { completed: false, reason: 'Stop button still visible - response in progress' };
          }
        }
      }
      
      for (const selector of streamingIndicators) {
        const element = document.querySelector(selector);
        if (element) {
          const style = window.getComputedStyle(element);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return { completed: false, reason: 'Streaming indicator still visible - response in progress' };
          }
        }
      }
      
      const regenerateButtons = document.querySelectorAll('button[aria-label*="regenerate"], button[aria-label*="Regenerate"], button[class*="regenerate"]');
      for (const btn of regenerateButtons) {
        const style = window.getComputedStyle(btn);
        if (style.display !== 'none' && style.visibility !== 'hidden' && !btn.disabled) {
          return { 
            completed: true, 
            confirmationSignal: 'regenerate-button-available',
          };
        }
      }
      
      const copyButtons = document.querySelectorAll('button[aria-label*="copy"], button[aria-label*="Copy"], button[class*="copy"]');
      const visibleCopyButtons = Array.from(copyButtons).filter(btn => {
        const style = window.getComputedStyle(btn);
        return style.display !== 'none' && style.visibility !== 'hidden';
      });
      
      if (visibleCopyButtons.length > 0) {
        return { 
          completed: true, 
          confirmationSignal: 'copy-button-available',
        };
      }
      
      return { completed: true, confirmationSignal: 'no-active-indicators' };
    }, DEEPSEEK_STOP_BUTTON_SELECTORS, DEEPSEEK_STREAMING_INDICATORS);
    
    return result;
  } catch (err) {
    return { completed: false, reason: `detectResponseComplete error: ${err.message}` };
  }
}

async function extractFinalText(page, requestContext) {
  try {
    const requestTimestamp = requestContext?.requestTimestamp || 0;
    const responseMarker = requestContext?.responseMarker;
    
    const result = await page.evaluate((selectors, reqTimestamp, respMarker) => {
      const candidates = [];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el, index) => {
          const text = el.textContent?.trim() || '';
          if (text.length > 0) {
            const elementTimestamp = el.dataset?.timestamp 
              ? parseInt(el.dataset.timestamp, 10) 
              : 0;
            
            candidates.push({
              selector,
              index,
              text,
              textLength: text.length,
              elementTimestamp,
              isAfterRequest: elementTimestamp === 0 || elementTimestamp >= reqTimestamp,
            });
          }
        });
      }
      
      if (candidates.length === 0) {
        return { text: '', reason: 'No response content found' };
      }
      
      const afterRequestCandidates = candidates.filter(c => c.isAfterRequest);
      
      if (afterRequestCandidates.length > 0) {
        afterRequestCandidates.sort((a, b) => {
          if (a.elementTimestamp !== b.elementTimestamp && a.elementTimestamp > 0 && b.elementTimestamp > 0) {
            return b.elementTimestamp - a.elementTimestamp;
          }
          return b.textLength - a.textLength;
        });
        
        const best = afterRequestCandidates[0];
        return { 
          text: best.text, 
          selector: best.selector,
          extractionMethod: 'request-scoped',
        };
      }
      
      candidates.sort((a, b) => b.textLength - a.textLength);
      const fallback = candidates[0];
      
      return { 
        text: fallback.text, 
        selector: fallback.selector,
        extractionMethod: 'fallback-newest',
        warning: 'Could not definitively identify request-scoped response; using heuristics',
      };
    }, DEEPSEEK_RESPONSE_CONTAINER_SELECTORS, requestTimestamp, responseMarker);
    
    return result;
  } catch (err) {
    return { text: '', reason: `extractFinalText error: ${err.message}` };
  }
}

function getAskAdapter({ page, tab }) {
  const pageInstance = page || tab?.page;
  
  if (!pageInstance) {
    throw new Error('getAskAdapter requires either page or tab with page property');
  }
  
  return {
    injectPrompt: (prompt) => injectPrompt(pageInstance, prompt),
    triggerSend: () => triggerSend(pageInstance),
    detectResponseStart: (requestContext) => detectResponseStart(pageInstance, requestContext),
    detectResponseComplete: (requestContext) => detectResponseComplete(pageInstance, requestContext),
    extractFinalText: (requestContext) => extractFinalText(pageInstance, requestContext),
  };
}

module.exports = {
  checkLogin,
  checkInput,
  getDoctorAdapter,
  getAskAdapter,
  injectPrompt,
  triggerSend,
  detectResponseStart,
  detectResponseComplete,
  extractFinalText,
  DEEPSEEK_INPUT_SELECTORS,
  DEEPSEEK_SEND_BUTTON_SELECTORS,
  DEEPSEEK_RESPONSE_CONTAINER_SELECTORS,
  DEEPSEEK_STOP_BUTTON_SELECTORS,
  DEEPSEEK_STREAMING_INDICATORS,
  DEEPSEEK_LOGIN_PAGE_INDICATORS,
  DEEPSEEK_AUTHENTICATED_INDICATORS,
};
