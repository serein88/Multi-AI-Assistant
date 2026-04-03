const { makeDoctorResult, makeCanonicalError } = require('./contracts.js');
const { resolveProviderTab } = require('./tabs.js');
const { normalizeCheckResult, isValidCheckResult } = require('../providers/shared.js');

function normalizeAdapterError(err, checkName) {
  return {
    passed: false,
    reason: `${checkName} check threw: ${err.message || 'Unknown error'}`,
  };
}

async function safeCheckLogin(adapter) {
  try {
    const result = await adapter.checkLogin();
    if (!isValidCheckResult(result)) {
      return normalizeCheckResult({ passed: false, reason: 'Adapter returned invalid check result shape' });
    }
    return normalizeCheckResult(result);
  } catch (err) {
    return normalizeAdapterError(err, 'Login');
  }
}

async function safeCheckInput(adapter) {
  try {
    const result = await adapter.checkInput();
    if (!isValidCheckResult(result)) {
      return normalizeCheckResult({ passed: false, reason: 'Adapter returned invalid check result shape' });
    }
    return normalizeCheckResult(result);
  } catch (err) {
    return normalizeAdapterError(err, 'Input');
  }
}

async function runDoctor(providerId, options = {}) {
  const { connection, adapter } = options;
  
  const checks = {
    connection: false,
    pageReachable: false,
    loginDetected: false,
    inputLocated: false,
  };
  
  if (!connection || !connection.connected) {
    return makeDoctorResult({
      provider: providerId,
      healthy: false,
      checks,
      code: 'BROWSER_NOT_CONNECTED',
      message: connection?.error?.message || 'Browser not connected',
      suggestion: connection?.error?.suggestion || 'Start Chrome with --remote-debugging-port=9222',
    });
  }
  
  checks.connection = true;
  
  const tabResult = await resolveProviderTab(connection, providerId);
  
  if (tabResult.action === 'error') {
    return makeDoctorResult({
      provider: providerId,
      healthy: false,
      checks,
      code: tabResult.error.code,
      message: tabResult.error.message,
      suggestion: tabResult.error.suggestion,
    });
  }
  
  if (!tabResult.tab) {
    return makeDoctorResult({
      provider: providerId,
      healthy: false,
      checks,
      code: 'INTERNAL_ERROR',
      message: 'Could not resolve provider tab',
      suggestion: 'Ensure the provider page is accessible',
    });
  }
  
  checks.pageReachable = true;
  
  if (!adapter) {
    return makeDoctorResult({
      provider: providerId,
      healthy: true,
      checks: {
        ...checks,
        loginDetected: null,
        inputLocated: null,
      },
    });
  }
  
  const loginResult = await safeCheckLogin(adapter);
  if (!loginResult.passed) {
    let code = 'LOGIN_REQUIRED';
    let suggestion = 'Log in to the provider website';
    
    if (loginResult.loginType === 'verification_required') {
      code = 'VERIFICATION_REQUIRED';
      suggestion = 'Complete the CAPTCHA or verification challenge to continue';
    } else if (loginResult.loginType === 'login_redirect') {
      code = 'LOGIN_REDIRECT';
      suggestion = 'You were redirected to the login page. Please authenticate to continue';
    } else if (loginResult.loginType === 'challenge_required') {
      code = 'CHALLENGE_REQUIRED';
      suggestion = 'Complete the challenge or verification to continue';
    }
    
    return makeDoctorResult({
      provider: providerId,
      healthy: false,
      checks: {
        ...checks,
        loginDetected: false,
        loginType: loginResult.loginType,
      },
      code,
      message: loginResult.reason || 'Login required',
      suggestion,
    });
  }
  
  checks.loginDetected = true;
  checks.loginDetails = loginResult.details;
  
  if (loginResult.unstable) {
    checks.unstable = true;
  }
  
  if (loginResult.warnings) {
    checks.warnings = loginResult.warnings;
  }
  
  if (loginResult.unstableReason) {
    checks.unstableReason = loginResult.unstableReason;
  }
  
  if (loginResult.unstableCategory) {
    checks.unstableCategory = loginResult.unstableCategory;
  }
  
  if (loginResult.rateLimited !== undefined) {
    checks.rateLimited = loginResult.rateLimited;
  }
  
  const inputResult = await safeCheckInput(adapter);
  if (!inputResult.passed) {
    return makeDoctorResult({
      provider: providerId,
      healthy: false,
      checks: {
        ...checks,
        inputLocated: false,
      },
      code: 'INPUT_NOT_FOUND',
      message: inputResult.reason || 'Input element not found',
      suggestion: 'Ensure the chat interface is loaded',
    });
  }
  
  checks.inputLocated = true;
  checks.inputSelector = inputResult.selector;
  
  return makeDoctorResult({
    provider: providerId,
    healthy: true,
    checks,
  });
}

module.exports = {
  runDoctor,
  safeCheckLogin,
  safeCheckInput,
};
