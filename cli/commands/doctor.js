const { makeErrorResponse } = require('../runtime/contracts.js');
const { getProviderById } = require('../providers/registry.js');

async function run({ options, positional, runtime }) {
  const providerId = options.provider;
  
  if (!providerId) {
    return makeErrorResponse(
      'doctor',
      'INTERNAL_ERROR',
      'provider option is required',
      'Use --provider <id> to specify a provider (e.g., --provider deepseek)'
    );
  }
  
  const provider = getProviderById(providerId);
  if (!provider) {
    return makeErrorResponse(
      'doctor',
      'PROVIDER_NOT_FOUND',
      `Unknown provider: ${providerId}`,
      'Use a supported provider: deepseek, gemini, grok'
    );
  }
  
  if (!provider.doctor_supported) {
    return makeErrorResponse(
      'doctor',
      'INTERNAL_ERROR',
      `Doctor not supported for provider: ${providerId}`,
      'This provider does not support doctor checks'
    );
  }
  
  if (runtime && typeof runtime.runDoctor === 'function') {
    return runtime.runDoctor(providerId, options);
  }
  
  return makeErrorResponse(
    'doctor',
    'INTERNAL_ERROR',
    'Runtime connection not available',
    'Ensure Chrome is running with --remote-debugging-port=9222'
  );
}

module.exports = { run };
