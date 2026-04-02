const EXIT_CODE_MAP = {
  BROWSER_NOT_CONNECTED: 2,
  LOGIN_REQUIRED: 3,
  PROVIDER_NOT_FOUND: 4,
  INPUT_NOT_FOUND: 5,
  RESPONSE_TIMEOUT: 6,
  UNKNOWN_COMMAND: 1,
  UNKNOWN_TOPIC: 1,
  CHECK_FAILED: 1,
  INTERNAL_ERROR: 1,
};

const SUPPORTED_ERROR_CODES = Object.keys(EXIT_CODE_MAP);
const FALLBACK_ERROR_CODE = 'INTERNAL_ERROR';

function isSupportedErrorCode(code) {
  return SUPPORTED_ERROR_CODES.includes(code);
}

function normalizeErrorCode(code) {
  if (isSupportedErrorCode(code)) {
    return code;
  }
  return FALLBACK_ERROR_CODE;
}

function makeCanonicalError(code, message, suggestion) {
  const normalizedCode = normalizeErrorCode(code);
  return {
    code: normalizedCode,
    message,
    suggestion,
  };
}

function makeResponse(command, status, extra = {}) {
  const result = {
    command,
    status,
    json: true,
  };
  
  for (const key of Object.keys(extra)) {
    if (key !== 'command' && key !== 'status' && key !== 'json') {
      result[key] = extra[key];
    }
  }
  
  return result;
}

function makeErrorResponse(command, code, message, suggestion) {
  return makeResponse(command, 'error', {
    error: makeCanonicalError(code, message, suggestion),
  });
}

function makeAskSuccess({ provider, response, timing }) {
  const result = makeResponse('ask', 'success', {
    provider,
    response,
  });
  
  if (timing) {
    result.timing = timing;
  }
  
  return result;
}

function makeAskFailure({ provider, code, message, suggestion, partial }) {
  const result = makeErrorResponse('ask', code, message, suggestion);
  result.provider = provider;
  
  if (partial) {
    result.partial = partial;
  }
  
  return result;
}

function makeDoctorResult({ provider, healthy, checks, code, message, suggestion }) {
  if (!healthy) {
    if (!code || !message || !suggestion) {
      throw new Error('makeDoctorResult requires code, message, and suggestion when healthy=false');
    }
  }
  
  const status = healthy ? 'success' : 'error';
  const result = makeResponse('doctor', status, {
    provider,
    healthy,
    checks,
  });
  
  if (!healthy) {
    result.error = makeCanonicalError(code, message, suggestion);
  }
  
  return result;
}

function makeProvidersResult({ providers }) {
  return makeResponse('providers', 'success', {
    providers,
  });
}

function mapErrorCodeToExitCode(code) {
  if (code === null || code === undefined) {
    return 0;
  }
  return EXIT_CODE_MAP[code] ?? 1;
}

module.exports = {
  makeResponse,
  makeErrorResponse,
  makeCanonicalError,
  makeAskSuccess,
  makeAskFailure,
  makeDoctorResult,
  makeProvidersResult,
  mapErrorCodeToExitCode,
  isSupportedErrorCode,
  normalizeErrorCode,
  SUPPORTED_ERROR_CODES,
  EXIT_CODE_MAP,
  FALLBACK_ERROR_CODE,
};
