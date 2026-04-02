const { makeErrorResponse } = require('../runtime/contracts.js');
const { getProviderById } = require('../providers/registry.js');

async function run({ options, positional, runtime }) {
  const providerId = options.provider;
  const prompt = options.prompt;
  
  if (!providerId) {
    return makeErrorResponse(
      'ask',
      'INTERNAL_ERROR',
      'provider option is required',
      'Use --provider <id> to specify a provider (e.g., --provider deepseek)'
    );
  }
  
  if (!prompt) {
    return makeErrorResponse(
      'ask',
      'INTERNAL_ERROR',
      'prompt option is required',
      'Use --prompt <text> to specify your question'
    );
  }
  
  const provider = getProviderById(providerId);
  if (!provider) {
    return makeErrorResponse(
      'ask',
      'PROVIDER_NOT_FOUND',
      `Unknown provider: ${providerId}`,
      'Use a supported provider: deepseek, gemini, grok'
    );
  }
  
  if (!provider.ask_supported) {
    return makeErrorResponse(
      'ask',
      'INTERNAL_ERROR',
      `Ask not supported for provider: ${providerId}`,
      'This provider does not support ask commands'
    );
  }
  
  if (runtime && typeof runtime.runAsk === 'function') {
    return runtime.runAsk(providerId, prompt, options);
  }
  
  return makeErrorResponse(
    'ask',
    'INTERNAL_ERROR',
    'Runtime connection not available',
    'Ensure Chrome is running with --remote-debugging-port=9222'
  );
}

module.exports = { run };
