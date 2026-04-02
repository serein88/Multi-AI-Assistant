const { makeProvidersResult } = require('../runtime/contracts.js');
const registry = require('../providers/registry.js');

function formatProviderOutput(provider) {
  return {
    id: provider.id,
    implemented: provider.implemented,
    ask_supported: provider.ask_supported,
    doctor_supported: provider.doctor_supported,
    login_required: provider.login_required,
    known_risks: provider.known_risks,
  };
}

async function run({ options, positional }) {
  const providers = registry.getProviders().map(formatProviderOutput);
  return makeProvidersResult({ providers });
}

module.exports = { run };
