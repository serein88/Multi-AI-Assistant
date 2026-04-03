const { makeAskSuccess, makeAskFailure, makeCanonicalError } = require('./contracts.js');
const { resolveProviderTab } = require('./tabs.js');

function isValidInjectResult(result) {
  return result && typeof result.success === 'boolean';
}

function isValidSendResult(result) {
  return result && typeof result.success === 'boolean';
}

function isValidResponseStartResult(result) {
  return result && typeof result.started === 'boolean';
}

function isValidResponseCompleteResult(result) {
  return result && typeof result.completed === 'boolean';
}

function isValidTextResult(result) {
  return result && typeof result.text === 'string';
}

function normalizeAdapterError(err, phase) {
  return {
    success: false,
    reason: `${phase} threw: ${err.message || 'Unknown error'}`,
  };
}

async function safeInjectPrompt(adapter, prompt) {
  try {
    const result = await adapter.injectPrompt(prompt);
    if (!isValidInjectResult(result)) {
      return { success: false, reason: 'injectPrompt returned invalid result shape' };
    }
    return result;
  } catch (err) {
    return normalizeAdapterError(err, 'injectPrompt');
  }
}

async function safeTriggerSend(adapter) {
  try {
    const result = await adapter.triggerSend();
    if (!isValidSendResult(result)) {
      return { success: false, reason: 'triggerSend returned invalid result shape' };
    }
    return result;
  } catch (err) {
    return normalizeAdapterError(err, 'triggerSend');
  }
}

async function safeDetectResponseStart(adapter, requestContext) {
  try {
    const result = await adapter.detectResponseStart(requestContext);
    if (!isValidResponseStartResult(result)) {
      return { started: false, reason: 'detectResponseStart returned invalid result shape' };
    }
    return result;
  } catch (err) {
    return { started: false, reason: `detectResponseStart threw: ${err.message}` };
  }
}

async function safeDetectResponseComplete(adapter, requestContext) {
  try {
    const result = await adapter.detectResponseComplete(requestContext);
    if (!isValidResponseCompleteResult(result)) {
      return { completed: false, reason: 'detectResponseComplete returned invalid result shape' };
    }
    return result;
  } catch (err) {
    return { completed: false, reason: `detectResponseComplete threw: ${err.message}` };
  }
}

async function safeExtractFinalText(adapter, requestContext) {
  try {
    const result = await adapter.extractFinalText(requestContext);
    if (!isValidTextResult(result)) {
      return { text: '', extractionFailed: true, reason: 'extractFinalText returned invalid result shape' };
    }
    
    const safeResult = { 
      text: result.text || '', 
      extractionFailed: result.extractionFailed === true,
      reason: result.reason || null,
      extractionMethod: result.extractionMethod || null,
    };
    
    if (result.confidence !== undefined) {
      safeResult.confidence = result.confidence;
    }
    
    if (result.warning !== undefined) {
      safeResult.warning = result.warning;
    }
    
    if (result.fallbackReason !== undefined) {
      safeResult.fallbackReason = result.fallbackReason;
    }
    
    return safeResult;
  } catch (err) {
    return { text: '', extractionFailed: true, reason: `extractFinalText threw: ${err.message}` };
  }
}

async function runAsk(providerId, prompt, options = {}) {
  const { connection, adapterFactory } = options;
  
  const phases = {
    dispatch: false,
    responseStarted: false,
    responseCompleted: false,
  };
  
  if (!connection || !connection.connected) {
    return makeAskFailure({
      provider: providerId,
      code: 'BROWSER_NOT_CONNECTED',
      message: connection?.error?.message || 'Browser not connected',
      suggestion: connection?.error?.suggestion || 'Start Chrome with --remote-debugging-port=9222',
    });
  }
  
  if (!adapterFactory || typeof adapterFactory !== 'function') {
    return makeAskFailure({
      provider: providerId,
      code: 'INTERNAL_ERROR',
      message: 'No adapter factory provided',
      suggestion: 'Ensure adapter factory is configured for the provider',
    });
  }
  
  const tabResult = await resolveProviderTab(connection, providerId);
  
  if (tabResult.action === 'error') {
    return makeAskFailure({
      provider: providerId,
      code: tabResult.error.code,
      message: tabResult.error.message,
      suggestion: tabResult.error.suggestion,
    });
  }
  
  if (!tabResult.tab) {
    return makeAskFailure({
      provider: providerId,
      code: 'INTERNAL_ERROR',
      message: 'Could not resolve provider tab',
      suggestion: 'Ensure the provider page is accessible',
    });
  }
  
  const adapter = adapterFactory({ tab: tabResult.tab });
  
  if (!adapter || typeof adapter.injectPrompt !== 'function') {
    return makeAskFailure({
      provider: providerId,
      code: 'INTERNAL_ERROR',
      message: 'Adapter factory returned invalid adapter',
      suggestion: 'Ensure adapter factory returns an object with required methods',
    });
  }
  
  const requestContext = {
    requestTimestamp: Date.now(),
    promptText: prompt,
  };
  
  const injectResult = await safeInjectPrompt(adapter, prompt);
  if (!injectResult.success) {
    return makeAskFailure({
      provider: providerId,
      code: 'DISPATCH_FAILED',
      message: injectResult.reason || 'Failed to inject prompt',
      suggestion: 'Ensure the chat input is available and visible',
      phases,
    });
  }
  
  if (injectResult.requestMarker) {
    requestContext.requestMarker = injectResult.requestMarker;
  }
  
  const sendResult = await safeTriggerSend(adapter);
  if (!sendResult.success) {
    return makeAskFailure({
      provider: providerId,
      code: 'DISPATCH_FAILED',
      message: sendResult.reason || 'Failed to trigger send',
      suggestion: 'Ensure the send button is available and clickable',
      phases,
    });
  }
  
  phases.dispatch = true;
  
  const startResult = await safeDetectResponseStart(adapter, requestContext);
  if (!startResult.started) {
    return makeAskFailure({
      provider: providerId,
      code: 'RESPONSE_TIMEOUT',
      message: startResult.reason || 'Response did not start within timeout',
      suggestion: 'The AI may be slow to respond. Try again or check your network connection.',
      phases,
    });
  }
  
  phases.responseStarted = true;
  
  if (startResult.responseMarker) {
    requestContext.responseMarker = startResult.responseMarker;
  }
  
  requestContext.responseStarted = true;
  
  const completeResult = await safeDetectResponseComplete(adapter, requestContext);
  if (!completeResult.completed) {
    const partialResult = await safeExtractFinalText(adapter, requestContext);
    
    const partial = {
      text: partialResult.text,
      extractionFailed: partialResult.extractionFailed || false,
    };
    
    if (partialResult.reason) {
      partial.extractionReason = partialResult.reason;
    }
    
    if (partialResult.confidence) {
      partial.confidence = partialResult.confidence;
    }
    
    if (partialResult.warning) {
      partial.warning = partialResult.warning;
    }
    
    if (partialResult.fallbackReason) {
      partial.fallbackReason = partialResult.fallbackReason;
    }
    
    if (partialResult.extractionMethod) {
      partial.extractionMethod = partialResult.extractionMethod;
    }
    
    return makeAskFailure({
      provider: providerId,
      code: 'RESPONSE_INCOMPLETE',
      message: completeResult.reason || 'Response did not complete',
      suggestion: 'The response was interrupted. Try again or check for errors.',
      partial,
      phases,
    });
  }
  
  phases.responseCompleted = true;
  
  const textResult = await safeExtractFinalText(adapter, requestContext);
  
  if (textResult.extractionFailed) {
    return makeAskFailure({
      provider: providerId,
      code: 'TEXT_EXTRACTION_FAILED',
      message: textResult.reason || 'Failed to extract response text',
      suggestion: 'The response completed but text could not be extracted.',
      phases,
    });
  }
  
  const response = { text: textResult.text };
  
  if (textResult.confidence) {
    response.confidence = textResult.confidence;
  }
  
  if (textResult.warning) {
    response.warning = textResult.warning;
  }
  
  if (textResult.fallbackReason) {
    response.fallbackReason = textResult.fallbackReason;
  }
  
  if (textResult.extractionMethod) {
    response.extractionMethod = textResult.extractionMethod;
  }
  
  return makeAskSuccess({
    provider: providerId,
    response,
    phases,
  });
}

module.exports = {
  runAsk,
  safeInjectPrompt,
  safeTriggerSend,
  safeDetectResponseStart,
  safeDetectResponseComplete,
  safeExtractFinalText,
};
