/**
 * CLI Provider Capability Registry
 * 
 * Independent from the extension's providers.js - this registry tracks
 * CLI-specific capability metadata for the MVP providers.
 */

const MVP_PROVIDERS = [
  {
    id: 'deepseek',
    implemented: true,
    ask_supported: true,
    doctor_supported: true,
    login_required: true,
    known_risks: [],
  },
  {
    id: 'gemini',
    implemented: true,
    ask_supported: true,
    doctor_supported: true,
    login_required: true,
    known_risks: [],
  },
  {
    id: 'grok',
    implemented: true,
    ask_supported: true,
    doctor_supported: true,
    login_required: true,
    known_risks: [
      'Response-start detection may be unreliable; prefer strong signals like Stop button appearance or input field clearing',
      'Unstable response detection may require fallback timeout handling',
    ],
  },
];

const PROVIDER_BY_ID = MVP_PROVIDERS.reduce((acc, provider) => {
  acc[provider.id] = provider;
  return acc;
}, {});

function deepCopyProvider(provider) {
  return {
    id: provider.id,
    implemented: provider.implemented,
    ask_supported: provider.ask_supported,
    doctor_supported: provider.doctor_supported,
    login_required: provider.login_required,
    known_risks: [...provider.known_risks],
  };
}

function getProviderIds() {
  return MVP_PROVIDERS.map(p => p.id);
}

function getProviders() {
  return MVP_PROVIDERS.map(deepCopyProvider);
}

function getProviderById(id) {
  const provider = PROVIDER_BY_ID[id];
  return provider ? deepCopyProvider(provider) : null;
}

module.exports = {
  getProviderIds,
  getProviders,
  getProviderById,
};
