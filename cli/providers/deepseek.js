const { normalizeCheckResult } = require('./shared.js');

const DEEPSEEK_INPUT_SELECTORS = [
  'textarea[id*="chat"]',
  'textarea[placeholder*="message"]',
  'textarea[placeholder*="Ask"]',
  '.chat-input textarea',
  '#chat-input',
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

module.exports = {
  checkLogin,
  checkInput,
  getDoctorAdapter,
  DEEPSEEK_INPUT_SELECTORS,
  DEEPSEEK_LOGIN_PAGE_INDICATORS,
  DEEPSEEK_AUTHENTICATED_INDICATORS,
};
