const chrome = require('./chrome');
const tabs = require('./tabs');
const { runAsk: executeAsk } = require('./ask');
const { runDoctor: executeDoctor } = require('./doctor');
const deepseek = require('../providers/deepseek');
const gemini = require('../providers/gemini');
const grok = require('../providers/grok');

const PROVIDER_ADAPTERS = {
  deepseek: {
    getAskAdapter: deepseek.getAskAdapter,
    getDoctorAdapter: deepseek.getDoctorAdapter,
  },
  gemini: {
    getAskAdapter: gemini.getAskAdapter,
    getDoctorAdapter: gemini.getDoctorAdapter,
  },
  grok: {
    getAskAdapter: grok.getAskAdapter,
    getDoctorAdapter: grok.getDoctorAdapter,
  },
};

function getProviderAdapter(providerId) {
  return PROVIDER_ADAPTERS[providerId] || null;
}

async function connect(options = {}) {
  const port = options.port || 9222;
  
  const mockCDP = {
    connect: async () => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json`);
        if (!response.ok) {
          return {
            connected: false,
            error: {
              code: 'BROWSER_NOT_CONNECTED',
              message: `Chrome not reachable on port ${port}`,
              suggestion: 'Start Chrome with --remote-debugging-port=9222',
            },
          };
        }
        const targets = await response.json();
        return { connected: true, targets };
      } catch (err) {
        return {
          connected: false,
          error: {
            code: 'BROWSER_NOT_CONNECTED',
            message: err.message,
            suggestion: 'Start Chrome with --remote-debugging-port=9222',
          },
        };
      }
    },
    createTarget: async (url) => {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/new?${encodeURIComponent(url)}`);
        if (!response.ok) {
          return null;
        }
        return await response.json();
      } catch {
        return null;
      }
    },
  };
  
  return chrome.connect({ cdp: mockCDP, port });
}

async function runAsk(providerId, prompt, options = {}) {
  const connection = await connect(options);
  
  if (!connection.connected) {
    const { makeAskFailure } = require('./contracts');
    return makeAskFailure({
      provider: providerId,
      code: 'BROWSER_NOT_CONNECTED',
      message: connection.error?.message || 'Browser not connected',
      suggestion: connection.error?.suggestion || 'Start Chrome with --remote-debugging-port=9222',
    });
  }
  
  const adapterConfig = getProviderAdapter(providerId);
  if (!adapterConfig) {
    const { makeAskFailure } = require('./contracts');
    return makeAskFailure({
      provider: providerId,
      code: 'PROVIDER_NOT_FOUND',
      message: `Unknown provider: ${providerId}`,
      suggestion: 'Use a supported provider: deepseek, gemini, grok',
    });
  }
  
  const tabResult = await tabs.resolveProviderTab(connection, providerId);
  
  if (tabResult.action === 'error') {
    const { makeAskFailure } = require('./contracts');
    return makeAskFailure({
      provider: providerId,
      code: tabResult.error.code,
      message: tabResult.error.message,
      suggestion: tabResult.error.suggestion,
    });
  }
  
  if (!tabResult.tab) {
    const { makeAskFailure } = require('./contracts');
    return makeAskFailure({
      provider: providerId,
      code: 'INTERNAL_ERROR',
      message: 'Could not resolve provider tab',
      suggestion: 'Ensure the provider page is accessible',
    });
  }
  
  const adapter = adapterConfig.getAskAdapter({ tab: tabResult.tab });
  
  return executeAsk(providerId, prompt, {
    connection,
    adapterFactory: () => adapter,
  });
}

async function runDoctor(providerId, options = {}) {
  const connection = await connect(options);
  
  if (!connection.connected) {
    const { makeDoctorResult } = require('./contracts');
    return makeDoctorResult({
      provider: providerId,
      healthy: false,
      checks: { connection: false, pageReachable: false, loginDetected: false, inputLocated: false },
      code: 'BROWSER_NOT_CONNECTED',
      message: connection.error?.message || 'Browser not connected',
      suggestion: connection.error?.suggestion || 'Start Chrome with --remote-debugging-port=9222',
    });
  }
  
  const adapterConfig = getProviderAdapter(providerId);
  if (!adapterConfig) {
    const { makeDoctorResult } = require('./contracts');
    return makeDoctorResult({
      provider: providerId,
      healthy: false,
      checks: {},
      code: 'PROVIDER_NOT_FOUND',
      message: `Unknown provider: ${providerId}`,
      suggestion: 'Use a supported provider: deepseek, gemini, grok',
    });
  }
  
  const tabResult = await tabs.resolveProviderTab(connection, providerId);
  
  if (tabResult.action === 'error') {
    const { makeDoctorResult } = require('./contracts');
    return makeDoctorResult({
      provider: providerId,
      healthy: false,
      checks: { connection: true, pageReachable: false, loginDetected: false, inputLocated: false },
      code: tabResult.error.code,
      message: tabResult.error.message,
      suggestion: tabResult.error.suggestion,
    });
  }
  
  if (!tabResult.tab) {
    const { makeDoctorResult } = require('./contracts');
    return makeDoctorResult({
      provider: providerId,
      healthy: false,
      checks: { connection: true, pageReachable: false, loginDetected: false, inputLocated: false },
      code: 'INTERNAL_ERROR',
      message: 'Could not resolve provider tab',
      suggestion: 'Ensure the provider page is accessible',
    });
  }
  
  const adapter = adapterConfig.getDoctorAdapter({ tab: tabResult.tab });
  
  return executeDoctor(providerId, {
    connection,
    adapter,
  });
}

module.exports = {
  connect,
  runAsk,
  runDoctor,
  getProviderAdapter,
};
