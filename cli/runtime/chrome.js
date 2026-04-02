const { makeCanonicalError, isSupportedErrorCode } = require('./contracts.js');

function normalizeConnectionError(error, port) {
  if (!error) {
    return makeCanonicalError(
      'BROWSER_NOT_CONNECTED',
      `Could not connect to Chrome on port ${port}`,
      'Start Chrome with --remote-debugging-port=9222'
    );
  }
  
  if (typeof error === 'object' && error.code && isSupportedErrorCode(error.code)) {
    return {
      code: error.code,
      message: error.message || 'Connection failed',
      suggestion: error.suggestion || 'Start Chrome with --remote-debugging-port=9222',
    };
  }
  
  return makeCanonicalError(
    'BROWSER_NOT_CONNECTED',
    error.message || 'Connection failed',
    error.suggestion || 'Start Chrome with --remote-debugging-port=9222'
  );
}

async function connect({ cdp, port = 9222 }) {
  try {
    const result = await cdp.connect();
    
    if (result.connected === false) {
      return {
        connected: false,
        error: normalizeConnectionError(result.error, port),
      };
    }
    
    return {
      connected: true,
      targets: result.targets || [],
      cdp,
      port,
    };
  } catch (err) {
    return {
      connected: false,
      error: normalizeConnectionError(
        { message: err.message, suggestion: err.suggestion },
        port
      ),
    };
  }
}

function getTargets(connection) {
  if (!connection || !connection.connected) {
    return [];
  }
  return connection.targets || [];
}

function getPageTargets(connection) {
  return getTargets(connection).filter(t => t.type === 'page');
}

module.exports = {
  connect,
  getTargets,
  getPageTargets,
};
