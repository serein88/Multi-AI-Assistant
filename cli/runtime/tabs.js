const { makeCanonicalError } = require('./contracts.js');

const PROVIDER_URL_MAP = {
  deepseek: 'https://chat.deepseek.com/',
  gemini: 'https://gemini.google.com/app',
  grok: 'https://grok.com/',
};

function parseUrl(url) {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

const PROVIDER_URL_PREDICATES = {
  deepseek: (parsedUrl) => {
    if (!parsedUrl || parsedUrl.hostname !== 'chat.deepseek.com') {
      return false;
    }
    const pathname = parsedUrl.pathname;
    return pathname === '/' || pathname === '';
  },
  gemini: (parsedUrl) => {
    if (!parsedUrl || parsedUrl.hostname !== 'gemini.google.com') {
      return false;
    }
    const pathname = parsedUrl.pathname;
    return pathname === '/app' || pathname.startsWith('/app/');
  },
  grok: (parsedUrl) => {
    if (!parsedUrl || parsedUrl.hostname !== 'grok.com') {
      return false;
    }
    const pathname = parsedUrl.pathname;
    return pathname === '/' || pathname === '';
  },
};

function getProviderUrl(providerId) {
  return PROVIDER_URL_MAP[providerId] || null;
}

function findProviderTab(connection, providerId) {
  if (!connection || !connection.connected) {
    return null;
  }

  const predicate = PROVIDER_URL_PREDICATES[providerId];
  if (!predicate) {
    return null;
  }

  const targets = connection.targets || [];
  return targets.find(t => {
    if (t.type !== 'page' || !t.url) {
      return false;
    }
    const parsedUrl = parseUrl(t.url);
    return predicate(parsedUrl);
  }) || null;
}

function isValidHealthResult(health) {
  return health && typeof health.healthy === 'boolean';
}

async function resolveProviderTab(connection, providerId, options = {}) {
  if (!connection || !connection.connected) {
    return {
      action: 'error',
      error: connection?.error || makeCanonicalError(
        'BROWSER_NOT_CONNECTED',
        'Browser not connected',
        'Start Chrome with --remote-debugging-port=9222'
      ),
    };
  }

  const existingTab = findProviderTab(connection, providerId);
  
  if (existingTab) {
    const healthCheck = options.healthCheck;
    if (healthCheck) {
      let health;
      try {
        health = await healthCheck(existingTab);
      } catch (err) {
        return {
          action: 'error',
          error: makeCanonicalError(
            'CHECK_FAILED',
            `Health check threw: ${err.message}`,
            'Ensure healthCheck function returns { healthy: boolean }'
          ),
        };
      }
      
      if (!isValidHealthResult(health)) {
        return {
          action: 'error',
          error: makeCanonicalError(
            'CHECK_FAILED',
            'Health check returned invalid result shape',
            'Health check must return { healthy: boolean }'
          ),
        };
      }
      
      if (health.healthy) {
        return {
          action: 'reused',
          tab: existingTab,
          created: false,
        };
      }
    } else {
      return {
        action: 'reused',
        tab: existingTab,
        created: false,
      };
    }
  }

  const url = getProviderUrl(providerId);
  if (!url) {
    return {
      action: 'error',
      error: makeCanonicalError(
        'PROVIDER_NOT_FOUND',
        `Unknown provider: ${providerId}`,
        'Use a supported provider: deepseek, gemini, grok'
      ),
    };
  }

  if (connection.cdp && typeof connection.cdp.createTarget === 'function') {
    const newTab = await connection.cdp.createTarget(url);
    return {
      action: 'created',
      tab: newTab,
      created: true,
    };
  }

  return {
    action: 'error',
    error: makeCanonicalError(
      'INTERNAL_ERROR',
      'Cannot create tab: createTarget not available on connection',
      'Ensure CDP connection supports target creation'
    ),
  };
}

module.exports = {
  getProviderUrl,
  findProviderTab,
  resolveProviderTab,
  PROVIDER_URL_MAP,
  PROVIDER_URL_PREDICATES,
};
