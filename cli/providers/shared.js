const { makeCanonicalError } = require('../runtime/contracts.js');

function normalizeCheckResult(result) {
  if (!result || typeof result !== 'object') {
    return { passed: false, reason: 'Invalid check result' };
  }
  
  const normalized = {
    passed: !!result.passed,
    reason: result.reason || null,
    details: result.details || null,
    selector: result.selector || null,
    loginType: result.loginType || null,
  };
  
  if (result.unstable !== undefined) {
    normalized.unstable = !!result.unstable;
  }
  
  if (result.warnings !== undefined) {
    normalized.warnings = result.warnings;
  }
  
  if (result.rateLimited !== undefined) {
    normalized.rateLimited = !!result.rateLimited;
  }
  
  if (result.unstableReason !== undefined) {
    normalized.unstableReason = result.unstableReason;
  }
  
  if (result.unstableCategory !== undefined) {
    normalized.unstableCategory = result.unstableCategory;
  }
  
  return normalized;
}

function isValidCheckResult(result) {
  if (!result || typeof result !== 'object') {
    return false;
  }
  if (typeof result.passed !== 'boolean') {
    return false;
  }
  return true;
}

function makeCheckError(code, message, suggestion) {
  return makeCanonicalError(code, message, suggestion);
}

async function waitForElement(page, selector, options = {}) {
  const timeout = options.timeout || 5000;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    const found = await checkElementExists(page, selector);
    if (found) {
      return { found: true, selector };
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  
  return { found: false, selector, reason: `Element ${selector} not found within ${timeout}ms` };
}

async function checkElementExists(page, selector) {
  try {
    const result = await page.evaluate((sel) => {
      const element = document.querySelector(sel);
      return element !== null;
    }, selector);
    return result;
  } catch {
    return false;
  }
}

module.exports = {
  normalizeCheckResult,
  isValidCheckResult,
  makeCheckError,
  waitForElement,
  checkElementExists,
};
