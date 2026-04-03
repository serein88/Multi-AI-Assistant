const { normalizeCheckResult } = require('./shared.js');

const GROK_INPUT_SELECTORS = [
  'textarea[placeholder*="Ask"]',
  'textarea[placeholder*="ask"]',
  'textarea[placeholder*="message"]',
  'textarea[id*="grok"]',
  'textarea[class*="input"]',
  '.grok-input textarea',
  'textarea',
];

const GROK_SEND_BUTTON_SELECTORS = [
  'button[type="submit"]',
  'button[aria-label*="Send"]',
  'button[aria-label*="send"]',
  'button[class*="send"]',
  'button[class*="submit"]',
  '[data-testid="send-button"]',
];

const GROK_RESPONSE_CONTAINER_SELECTORS = [
  '[class*="response-content"]',
  '[class*="grok-response"]',
  '[class*="message-content"]',
  '.markdown.prose',
  '[class*="assistant-message"]',
];

const GROK_STOP_BUTTON_SELECTORS = [
  'button[aria-label*="Stop"]',
  'button[aria-label*="stop"]',
  'button[class*="stop"]',
  'button[class*="abort"]',
  '[data-testid="stop-button"]',
];

const GROK_STREAMING_INDICATORS = [
  '[class*="typing"]',
  '[class*="streaming"]',
  '[class*="generating"]',
  '[data-testid="streaming-indicator"]',
];

const GROK_LOGIN_PAGE_INDICATORS = [
  'button[class*="login"]',
  'button[class*="sign-in"]',
  'a[href*="login"]',
  'a[href*="signin"]',
  '[class*="login-button"]',
  'form[action*="login"]',
];

const GROK_AUTHENTICATED_INDICATORS = [
  '[class*="user-menu"]',
  '[class*="user-profile"]',
  '[data-testid="user-menu"]',
  'button[aria-label*="account"]',
  'button[aria-label*="profile"]',
  '[class*="avatar"]',
];

const GROK_CHALLENGE_INDICATORS = [
  '[class*="challenge"]',
  '[class*="verification"]',
  '[class*="captcha"]',
  'iframe[src*="captcha"]',
  '[class*="rate-limit"]',
  '[class*="ratelimit"]',
];

const GROK_UNSTABLE_INDICATORS = [
  '[class*="rate-limit"]',
  '[class*="ratelimit"]',
  '[class*="throttle"]',
  '[class*="slow-mode"]',
  '[class*="queue"]',
];

async function checkLogin(page) {
  try {
    const result = await page.evaluate((loginIndicators, authIndicators, challengeIndicators, unstableIndicators) => {
      for (const selector of challengeIndicators) {
        const element = document.querySelector(selector);
        if (element) {
          const style = window.getComputedStyle(element);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            return { challengeRequired: true };
          }
        }
      }
      
      let unstableDetected = false;
      let rateLimited = false;
      
      for (const selector of unstableIndicators) {
        const element = document.querySelector(selector);
        if (element) {
          const style = window.getComputedStyle(element);
          if (style.display !== 'none' && style.visibility !== 'hidden') {
            unstableDetected = true;
            rateLimited = true;
            break;
          }
        }
      }
      
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
            return { authenticated: true, unstableDetected, rateLimited };
          }
        }
      }
      
      return { loginPage: false, authenticated: false, unstableDetected, rateLimited };
    }, GROK_LOGIN_PAGE_INDICATORS, GROK_AUTHENTICATED_INDICATORS, GROK_CHALLENGE_INDICATORS, GROK_UNSTABLE_INDICATORS);
    
    if (result.challengeRequired) {
      return normalizeCheckResult({ 
        passed: false, 
        reason: 'Challenge surface detected - verification required',
        loginType: 'challenge_required',
      });
    }
    
    if (result.loginPage) {
      return normalizeCheckResult({ 
        passed: false, 
        reason: 'Login page detected - X/Twitter authentication required' 
      });
    }
    
    if (result.authenticated) {
      const checkResult = normalizeCheckResult({ 
        passed: true, 
        details: 'X/Twitter account authenticated' 
      });
      
      if (result.unstableDetected || result.rateLimited) {
        checkResult.unstable = true;
        checkResult.rateLimited = result.rateLimited;
        checkResult.unstableReason = result.rateLimited ? 'rate-limiting' : 'unstable-conditions';
        checkResult.unstableCategory = result.rateLimited ? 'rate-limit' : 'instability';
        checkResult.warnings = ['Rate limiting or unstable conditions detected'];
      }
      
      return checkResult;
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
          
          if (isVisible && !isUsable) {
            return { 
              found: true, 
              selector, 
              visible: true, 
              usable: false, 
              reason: 'Input not ready - still loading or disabled' 
            };
          }
        }
      }
      return { found: false };
    }, GROK_INPUT_SELECTORS);
    
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
        reason: result.reason || 'Input element found but not usable (disabled or readonly)' 
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
    }, GROK_INPUT_SELECTORS, prompt);
    
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
    }, GROK_SEND_BUTTON_SELECTORS);
    
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
    const inputSelector = requestMarker?.inputSelector;
    
    const result = await page.evaluate((stopSelectors, responseSelectors, streamingIndicators, reqTimestamp, reqMarker, inputSel) => {
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
      
      const hasProofOfNonEmptyToEmptyTransition = 
        inputSel && 
        reqMarker && 
        reqMarker.afterValue && 
        reqMarker.afterValue.length > 0;
      
      if (hasProofOfNonEmptyToEmptyTransition) {
        const inputElement = document.querySelector(inputSel);
        if (inputElement && inputElement.value === '') {
          return { 
            started: true, 
            indicator: 'input-cleared',
            responseMarker: { type: 'input-cleared', timestamp: Date.now() },
          };
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
    }, GROK_STOP_BUTTON_SELECTORS, GROK_RESPONSE_CONTAINER_SELECTORS, GROK_STREAMING_INDICATORS, requestTimestamp, requestMarker, inputSelector);
    
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
      
      const regenerateButtons = document.querySelectorAll('button[aria-label*="regenerate"], button[aria-label*="Regenerate"], button[class*="regenerate"]');
      for (const btn of regenerateButtons) {
        const style = window.getComputedStyle(btn);
        if (style.display !== 'none' && style.visibility !== 'hidden' && !btn.disabled) {
          if (!hasResponseStarted) {
            return { 
              completed: false, 
              reason: 'Regenerate button found but no prior response lifecycle evidence - cannot confirm completion',
              noLifecycleEvidence: true,
            };
          }
          return { 
            completed: true, 
            confirmationSignal: 'regenerate-button-available',
          };
        }
      }
      
      const copyButtons = document.querySelectorAll('button[aria-label*="copy"], button[aria-label*="Copy"], button[class*="copy"]');
      for (const btn of copyButtons) {
        const style = window.getComputedStyle(btn);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          if (!hasResponseStarted) {
            return { 
              completed: false, 
              reason: 'Copy button found but no prior response lifecycle evidence - cannot confirm completion',
              noLifecycleEvidence: true,
            };
          }
          return { 
            completed: true, 
            confirmationSignal: 'copy-button-available',
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
    }, GROK_STOP_BUTTON_SELECTORS, GROK_STREAMING_INDICATORS, responseStarted, responseMarker);
    
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
        confidence: 'low',
        warning: 'No request-scoped content found; using latest response candidate by DOM position',
        fallbackReason: 'no-request-scoped-evidence',
      };
    }, GROK_RESPONSE_CONTAINER_SELECTORS, requestTimestamp, responseMarker, inputSelector);
    
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
  GROK_INPUT_SELECTORS,
  GROK_SEND_BUTTON_SELECTORS,
  GROK_RESPONSE_CONTAINER_SELECTORS,
  GROK_STOP_BUTTON_SELECTORS,
  GROK_STREAMING_INDICATORS,
  GROK_LOGIN_PAGE_INDICATORS,
  GROK_AUTHENTICATED_INDICATORS,
  GROK_CHALLENGE_INDICATORS,
  GROK_UNSTABLE_INDICATORS,
};
