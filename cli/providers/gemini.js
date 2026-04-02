const { normalizeCheckResult } = require('./shared.js');

const GEMINI_INPUT_SELECTORS = [
  'div[contenteditable="true"]',
  'rich-textarea div[contenteditable="true"]',
  '.ql-editor[contenteditable="true"]',
  'div[role="textbox"][contenteditable="true"]',
  'textarea[aria-label*="message"]',
  'textarea[aria-label*="Ask"]',
];

const GEMINI_SEND_BUTTON_SELECTORS = [
  'button[aria-label="Send"]',
  'button[aria-label="send"]',
  'button[data-test-id="send-button"]',
  'button[class*="send"]',
  'button[title="Send"]',
  'button[jsname="send"]',
];

const GEMINI_RESPONSE_CONTAINER_SELECTORS = [
  '.response-content',
  '[data-response="true"]',
  '.model-response',
  'message-content',
  '.conversation-container [role="listitem"]',
  '.response-container',
];

const GEMINI_STOP_BUTTON_SELECTORS = [
  'button[aria-label="Stop"]',
  'button[aria-label="stop"]',
  'button[data-test-id="stop-button"]',
  'button[class*="stop"]',
  'button[jsname="stop"]',
];

const GEMINI_STREAMING_INDICATORS = [
  '.typing-indicator',
  '.streaming',
  '[data-streaming="true"]',
  '.generating',
];

const GEMINI_LOGIN_PAGE_INDICATORS = [
  'button[data-identifier="sign-in"]',
  'a[href*="accounts.google.com"]',
  'div[data-identifier="login"]',
  'form[action*="signin"]',
  'button[aria-label*="Sign in"]',
  'button[aria-label*="sign in"]',
];

const GEMINI_AUTHENTICATED_INDICATORS = [
  'button[aria-label*="Google Account"]',
  'button[aria-label*="account"]',
  'img[alt*="Account"]',
  '[data-identifier="account-button"]',
  'button[jsname="account"]',
];

const GEMINI_VERIFICATION_INDICATORS = [
  'iframe[src*="recaptcha"]',
  '.g-recaptcha',
  '#recaptcha',
  'div[class*="challenge"]',
  'div[class*="verification"]',
  'iframe[src*="challenge"]',
];

async function checkLogin(page) {
  try {
    const result = await page.evaluate((loginIndicators, authIndicators, verificationIndicators) => {
      for (const selector of verificationIndicators) {
        const element = document.querySelector(selector);
        if (element) {
          const style = window.getComputedStyle(element);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return { verificationRequired: true };
          }
        }
      }
      
      for (const selector of loginIndicators) {
        const element = document.querySelector(selector);
        if (element) {
          const style = window.getComputedStyle(element);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return { loginPage: true, redirectedToLogin: true };
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
    }, GEMINI_LOGIN_PAGE_INDICATORS, GEMINI_AUTHENTICATED_INDICATORS, GEMINI_VERIFICATION_INDICATORS);
    
    if (result.verificationRequired) {
      return normalizeCheckResult({ 
        passed: false, 
        reason: 'Verification surface detected - CAPTCHA or challenge required',
        loginType: 'verification_required',
      });
    }
    
    if (result.loginPage) {
      return normalizeCheckResult({ 
        passed: false, 
        reason: 'Redirected to Google login page - authentication required',
        loginType: 'login_redirect',
      });
    }
    
    if (result.authenticated) {
      return normalizeCheckResult({ passed: true, details: 'Google account authenticated' });
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
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const style = window.getComputedStyle(element);
          const isVisible = style.display !== 'none' && 
                           style.visibility !== 'hidden' && 
                           style.opacity !== '0';
          const hasSize = element.offsetWidth > 0 && element.offsetHeight > 0;
          
          const contentEditable = element.getAttribute('contenteditable');
          const isEditable = contentEditable === 'true' || contentEditable === '';
          const isUsable = isEditable && hasSize;
          
          if (isVisible && isUsable) {
            return { found: true, selector, visible: true, usable: true };
          }
          
          if (isVisible && !isUsable) {
            return { 
              found: true, 
              selector, 
              visible: true, 
              usable: false, 
              reason: 'Input surface variant not ready - contenteditable not active' 
            };
          }
        }
      }
      return { found: false };
    }, GEMINI_INPUT_SELECTORS);
    
    if (result.found && result.visible && result.usable) {
      return normalizeCheckResult({ 
        passed: true, 
        selector: result.selector,
        details: `Active contenteditable input found: ${result.selector}` 
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
        reason: result.reason || 'Input element found but not usable (contenteditable not active)' 
      });
    }
    
    return normalizeCheckResult({ 
      passed: false, 
      reason: 'No active contenteditable input element found on page' 
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
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          const style = window.getComputedStyle(element);
          const isVisible = style.display !== 'none' && 
                           style.visibility !== 'hidden' && 
                           style.opacity !== '0';
          const hasSize = element.offsetWidth > 0 && element.offsetHeight > 0;
          const contentEditable = element.getAttribute('contenteditable');
          const isEditable = contentEditable === 'true' || contentEditable === '';
          
          if (isVisible && isEditable && hasSize) {
            element.focus();
            
            const selection = window.getSelection();
            const range = document.createRange();
            range.selectNodeContents(element);
            selection.removeAllRanges();
            selection.addRange(range);
            
            document.execCommand('delete', false, null);
            
            const textNode = document.createTextNode(text);
            element.appendChild(textNode);
            
            range.selectNodeContents(element);
            range.collapse(false);
            selection.removeAllRanges();
            selection.addRange(range);
            
            element.dispatchEvent(new Event('input', { bubbles: true }));
            element.dispatchEvent(new Event('change', { bubbles: true }));
            
            return { 
              injected: true, 
              selector,
              requestMarker: {
                inputSelector: selector,
                beforeValue: '',
                afterValue: text,
                timestamp: Date.now(),
              },
            };
          }
        }
      }
      return { injected: false, reason: 'No usable contenteditable input element found' };
    }, GEMINI_INPUT_SELECTORS, prompt);
    
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
    }, GEMINI_SEND_BUTTON_SELECTORS);
    
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
    }, GEMINI_STOP_BUTTON_SELECTORS, GEMINI_RESPONSE_CONTAINER_SELECTORS, GEMINI_STREAMING_INDICATORS, requestTimestamp, requestMarker);
    
    return result;
  } catch (err) {
    return { started: false, reason: `detectResponseStart error: ${err.message}` };
  }
}

async function detectResponseComplete(page, requestContext) {
  try {
    const responseStarted = requestContext?.responseStarted === true;
    const responseMarker = requestContext?.responseMarker;
    
    const result = await page.evaluate((stopSelectors, streamingIndicators, hasResponseStarted, respMarker) => {
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
      
      const copyButtons = document.querySelectorAll('button[aria-label*="copy"], button[aria-label*="Copy"], button[data-test-id="copy-button"]');
      for (const btn of copyButtons) {
        const style = window.getComputedStyle(btn);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          return { 
            completed: true, 
            confirmationSignal: 'copy-button-available',
          };
        }
      }
      
      const regenerateButtons = document.querySelectorAll('button[aria-label*="regenerate"], button[aria-label*="Regenerate"], button[data-test-id="regenerate-button"]');
      for (const btn of regenerateButtons) {
        const style = window.getComputedStyle(btn);
        if (style.display !== 'none' && style.visibility !== 'hidden' && !btn.disabled) {
          return { 
            completed: true, 
            confirmationSignal: 'regenerate-button-available',
          };
        }
      }
      
      if (!hasResponseStarted) {
        return { 
          completed: false, 
          reason: 'No positive evidence of response lifecycle - cannot confirm completion on idle page',
          noLifecycleEvidence: true,
        };
      }
      
      return { completed: true, confirmationSignal: 'no-active-indicators-with-prior-start' };
    }, GEMINI_STOP_BUTTON_SELECTORS, GEMINI_STREAMING_INDICATORS, responseStarted, responseMarker);
    
    return result;
  } catch (err) {
    return { completed: false, reason: `detectResponseComplete error: ${err.message}` };
  }
}

async function extractFinalText(page, requestContext) {
  try {
    const requestTimestamp = requestContext?.requestTimestamp || 0;
    const responseMarker = requestContext?.responseMarker;
    const inputSelector = requestContext?.requestMarker?.inputSelector;
    
    const result = await page.evaluate((selectors, reqTimestamp, respMarker, inputSel) => {
      const candidates = [];
      const allElements = [];
      
      for (const selector of selectors) {
        const elements = document.querySelectorAll(selector);
        elements.forEach((el, index) => {
          const text = el.textContent?.trim() || '';
          if (text.length > 0) {
            const elementTimestamp = el.dataset?.timestamp 
              ? parseInt(el.dataset.timestamp, 10) 
              : 0;
            
            const hasValidTimestamp = elementTimestamp > 0;
            const isAfterRequest = hasValidTimestamp && elementTimestamp >= reqTimestamp;
            
            candidates.push({
              selector,
              index,
              text,
              textLength: text.length,
              elementTimestamp,
              hasValidTimestamp,
              isAfterRequest,
              domPosition: allElements.length,
            });
            
            allElements.push(el);
          }
        });
      }
      
      if (candidates.length === 0) {
        return { text: '', reason: 'No response content found' };
      }
      
      const afterRequestCandidates = candidates.filter(c => c.isAfterRequest);
      
      if (afterRequestCandidates.length > 0) {
        afterRequestCandidates.sort((a, b) => {
          if (a.elementTimestamp !== b.elementTimestamp) {
            return b.elementTimestamp - a.elementTimestamp;
          }
          return b.domPosition - a.domPosition;
        });
        
        const best = afterRequestCandidates[0];
        return { 
          text: best.text, 
          selector: best.selector,
          extractionMethod: 'request-scoped',
        };
      }
      
      candidates.sort((a, b) => {
        return b.domPosition - a.domPosition;
      });
      
      const fallback = candidates[0];
      
      return { 
        text: fallback.text, 
        selector: fallback.selector,
        extractionMethod: 'fallback-latest',
        warning: 'No request-scoped content found; using latest response candidate by DOM position',
      };
    }, GEMINI_RESPONSE_CONTAINER_SELECTORS, requestTimestamp, responseMarker, inputSelector);
    
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
  GEMINI_INPUT_SELECTORS,
  GEMINI_SEND_BUTTON_SELECTORS,
  GEMINI_RESPONSE_CONTAINER_SELECTORS,
  GEMINI_STOP_BUTTON_SELECTORS,
  GEMINI_STREAMING_INDICATORS,
  GEMINI_LOGIN_PAGE_INDICATORS,
  GEMINI_AUTHENTICATED_INDICATORS,
  GEMINI_VERIFICATION_INDICATORS,
};
