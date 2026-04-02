const { describe, it } = require('node:test');
const assert = require('node:assert');

let contracts;

describe('CLI Contracts', () => {
  describe('Canonical error envelope invariant', () => {
    it('all error envelopes have exactly code, message, suggestion (no extra fields)', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const askFailure = contracts.makeAskFailure({
        provider: 'deepseek',
        code: 'BROWSER_NOT_CONNECTED',
        message: 'Could not connect',
        suggestion: 'Start Chrome with --remote-debugging-port=9222',
      });
      
      const doctorUnhealthy = contracts.makeDoctorResult({
        provider: 'gemini',
        healthy: false,
        checks: { browser_connected: true, page_reachable: true, login_detected: false, input_located: false },
        code: 'CHECK_FAILED',
        message: 'Login not detected',
        suggestion: 'Log in to Gemini',
      });
      
      const errorResponse = contracts.makeErrorResponse('test', 'UNKNOWN_COMMAND', 'msg', 'suggestion');
      
      const errorKeys = ['code', 'message', 'suggestion'];
      
      assert.deepStrictEqual(Object.keys(askFailure.error).sort(), errorKeys.sort());
      assert.deepStrictEqual(Object.keys(doctorUnhealthy.error).sort(), errorKeys.sort());
      assert.deepStrictEqual(Object.keys(errorResponse.error).sort(), errorKeys.sort());
    });

    it('error envelope fields are always strings', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const results = [
        contracts.makeAskFailure({ provider: 'x', code: 'LOGIN_REQUIRED', message: 'm', suggestion: 's' }),
        contracts.makeDoctorResult({ provider: 'x', healthy: false, checks: {}, code: 'CHECK_FAILED', message: 'm', suggestion: 's' }),
        contracts.makeErrorResponse('x', 'UNKNOWN_TOPIC', 'm', 's'),
      ];
      
      for (const result of results) {
        assert.strictEqual(typeof result.error.code, 'string');
        assert.strictEqual(typeof result.error.message, 'string');
        assert.strictEqual(typeof result.error.suggestion, 'string');
      }
    });
  });

  describe('Error code normalization', () => {
    it('normalizeErrorCode returns supported codes unchanged', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const supportedCodes = contracts.SUPPORTED_ERROR_CODES;
      
      for (const code of supportedCodes) {
        assert.strictEqual(contracts.normalizeErrorCode(code), code, `${code} should be unchanged`);
      }
    });

    it('normalizeErrorCode returns FALLBACK_ERROR_CODE for unsupported codes', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      assert.strictEqual(contracts.normalizeErrorCode('RANDOM_CODE'), contracts.FALLBACK_ERROR_CODE);
      assert.strictEqual(contracts.normalizeErrorCode('unsupported'), contracts.FALLBACK_ERROR_CODE);
      assert.strictEqual(contracts.normalizeErrorCode(''), contracts.FALLBACK_ERROR_CODE);
    });

    it('public error builders normalize unsupported codes to FALLBACK_ERROR_CODE', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const askFailure = contracts.makeAskFailure({
        provider: 'x',
        code: 'UNSUPPORTED_CODE',
        message: 'm',
        suggestion: 's',
      });
      
      const errorResponse = contracts.makeErrorResponse('x', 'ALSO_UNSUPPORTED', 'm', 's');
      
      assert.strictEqual(askFailure.error.code, contracts.FALLBACK_ERROR_CODE);
      assert.strictEqual(errorResponse.error.code, contracts.FALLBACK_ERROR_CODE);
    });

    it('supported codes pass through unchanged in public builders', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const askFailure = contracts.makeAskFailure({
        provider: 'x',
        code: 'BROWSER_NOT_CONNECTED',
        message: 'm',
        suggestion: 's',
      });
      
      const doctorResult = contracts.makeDoctorResult({
        provider: 'x',
        healthy: false,
        checks: {},
        code: 'LOGIN_REQUIRED',
        message: 'm',
        suggestion: 's',
      });
      
      assert.strictEqual(askFailure.error.code, 'BROWSER_NOT_CONNECTED');
      assert.strictEqual(doctorResult.error.code, 'LOGIN_REQUIRED');
    });
  });

  describe('Base envelope field protection', () => {
    it('makeResponse ignores attempts to override command, status, json via extra', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const result = contracts.makeResponse('original', 'success', {
        command: 'hijacked',
        status: 'hijacked',
        json: false,
        validExtra: 'kept',
      });
      
      assert.strictEqual(result.command, 'original');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
      assert.strictEqual(result.validExtra, 'kept');
    });

    it('all result builders protect base fields from override', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const askSuccess = contracts.makeAskSuccess({
        provider: 'deepseek',
        response: { text: 'hi' },
        command: 'hijacked',
        status: 'hijacked',
        json: false,
      });
      
      const askFailure = contracts.makeAskFailure({
        provider: 'deepseek',
        code: 'CHECK_FAILED',
        message: 'm',
        suggestion: 's',
        command: 'hijacked',
        status: 'hijacked',
        json: false,
      });
      
      const doctorResult = contracts.makeDoctorResult({
        provider: 'deepseek',
        healthy: true,
        checks: {},
        command: 'hijacked',
        status: 'hijacked',
        json: false,
      });
      
      const providersResult = contracts.makeProvidersResult({
        providers: [],
        command: 'hijacked',
        status: 'hijacked',
        json: false,
      });
      
      assert.strictEqual(askSuccess.command, 'ask');
      assert.strictEqual(askSuccess.status, 'success');
      assert.strictEqual(askSuccess.json, true);
      
      assert.strictEqual(askFailure.command, 'ask');
      assert.strictEqual(askFailure.status, 'error');
      assert.strictEqual(askFailure.json, true);
      
      assert.strictEqual(doctorResult.command, 'doctor');
      assert.strictEqual(doctorResult.status, 'success');
      assert.strictEqual(doctorResult.json, true);
      
      assert.strictEqual(providersResult.command, 'providers');
      assert.strictEqual(providersResult.status, 'success');
      assert.strictEqual(providersResult.json, true);
    });
  });

  describe('Exit-code mapping boundary', () => {
    it('isSupportedErrorCode returns true only for mapped codes', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      for (const code of contracts.SUPPORTED_ERROR_CODES) {
        assert.strictEqual(contracts.isSupportedErrorCode(code), true, `${code} should be supported`);
      }
      
      assert.strictEqual(contracts.isSupportedErrorCode('RANDOM_CODE'), false);
      assert.strictEqual(contracts.isSupportedErrorCode('browser_not_connected'), false);
    });

    it('SUPPORTED_ERROR_CODES list matches EXIT_CODE_MAP keys', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      assert.deepStrictEqual(
        contracts.SUPPORTED_ERROR_CODES.sort(),
        Object.keys(contracts.EXIT_CODE_MAP).sort()
      );
    });

    it('supported codes map to specific exit codes', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const specificMappings = {
        BROWSER_NOT_CONNECTED: 2,
        LOGIN_REQUIRED: 3,
        PROVIDER_NOT_FOUND: 4,
        INPUT_NOT_FOUND: 5,
        RESPONSE_TIMEOUT: 6,
      };
      
      for (const [code, expectedExit] of Object.entries(specificMappings)) {
        assert.strictEqual(contracts.mapErrorCodeToExitCode(code), expectedExit);
      }
    });

    it('generic error codes map to exit code 1', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      assert.strictEqual(contracts.mapErrorCodeToExitCode('UNKNOWN_COMMAND'), 1);
      assert.strictEqual(contracts.mapErrorCodeToExitCode('UNKNOWN_TOPIC'), 1);
      assert.strictEqual(contracts.mapErrorCodeToExitCode('CHECK_FAILED'), 1);
      assert.strictEqual(contracts.mapErrorCodeToExitCode('INTERNAL_ERROR'), 1);
    });

    it('null/undefined codes return 0 (success)', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      assert.strictEqual(contracts.mapErrorCodeToExitCode(null), 0);
      assert.strictEqual(contracts.mapErrorCodeToExitCode(undefined), 0);
    });
  });

  describe('makeAskSuccess', () => {
    it('returns success result with required fields', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const result = contracts.makeAskSuccess({
        provider: 'deepseek',
        response: { text: 'Hello, world!' },
      });
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.json, true);
      assert.strictEqual(result.provider, 'deepseek');
      assert.deepStrictEqual(result.response, { text: 'Hello, world!' });
    });

    it('includes timing metadata when provided', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const result = contracts.makeAskSuccess({
        provider: 'gemini',
        response: { text: 'Response' },
        timing: { dispatch: 100, response: 2000 },
      });
      
      assert.deepStrictEqual(result.timing, { dispatch: 100, response: 2000 });
    });
  });

  describe('makeAskFailure', () => {
    it('returns error result with canonical error envelope', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const result = contracts.makeAskFailure({
        provider: 'deepseek',
        code: 'BROWSER_NOT_CONNECTED',
        message: 'Could not connect to Chrome',
        suggestion: 'Start Chrome with --remote-debugging-port=9222',
      });
      
      assert.strictEqual(result.command, 'ask');
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.provider, 'deepseek');
      assert.strictEqual(result.error.code, 'BROWSER_NOT_CONNECTED');
      assert.strictEqual(result.error.message, 'Could not connect to Chrome');
      assert.strictEqual(result.error.suggestion, 'Start Chrome with --remote-debugging-port=9222');
    });

    it('includes partial results when available', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const result = contracts.makeAskFailure({
        provider: 'gemini',
        code: 'RESPONSE_TIMEOUT',
        message: 'Timed out',
        suggestion: 'Retry',
        partial: { text: 'Partial...' },
      });
      
      assert.deepStrictEqual(result.partial, { text: 'Partial...' });
    });
  });

  describe('makeDoctorResult', () => {
    it('returns healthy result when healthy=true', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const result = contracts.makeDoctorResult({
        provider: 'deepseek',
        healthy: true,
        checks: {
          browser_connected: true,
          page_reachable: true,
          login_detected: true,
          input_located: true,
        },
      });
      
      assert.strictEqual(result.command, 'doctor');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.healthy, true);
      assert.ok(!result.error, 'healthy result should not have error field');
    });

    it('returns unhealthy result with canonical error when healthy=false', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const result = contracts.makeDoctorResult({
        provider: 'gemini',
        healthy: false,
        checks: {
          browser_connected: true,
          page_reachable: true,
          login_detected: false,
          input_located: false,
        },
        code: 'CHECK_FAILED',
        message: 'Login not detected',
        suggestion: 'Please log in to Gemini',
      });
      
      assert.strictEqual(result.status, 'error');
      assert.strictEqual(result.healthy, false);
      assert.strictEqual(result.error.code, 'CHECK_FAILED');
      assert.strictEqual(result.error.message, 'Login not detected');
      assert.strictEqual(result.error.suggestion, 'Please log in to Gemini');
    });

    it('throws when healthy=false without required error params', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      assert.throws(
        () => contracts.makeDoctorResult({
          provider: 'grok',
          healthy: false,
          checks: { browser_connected: false },
        }),
        /makeDoctorResult requires code, message, and suggestion when healthy=false/
      );
      
      assert.throws(
        () => contracts.makeDoctorResult({
          provider: 'grok',
          healthy: false,
          checks: {},
          code: 'CHECK_FAILED',
        }),
        /makeDoctorResult requires code, message, and suggestion when healthy=false/
      );
      
      assert.throws(
        () => contracts.makeDoctorResult({
          provider: 'grok',
          healthy: false,
          checks: {},
          code: 'CHECK_FAILED',
          message: 'm',
        }),
        /makeDoctorResult requires code, message, and suggestion when healthy=false/
      );
    });
  });

  describe('makeProvidersResult', () => {
    it('returns provider list with metadata', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const result = contracts.makeProvidersResult({
        providers: [
          { id: 'deepseek', implemented: true },
          { id: 'gemini', implemented: true },
        ],
      });
      
      assert.strictEqual(result.command, 'providers');
      assert.strictEqual(result.status, 'success');
      assert.strictEqual(result.providers.length, 2);
    });
  });

  describe('JSON serialization', () => {
    it('all results are JSON-serializable', () => {
      contracts = require('../../cli/runtime/contracts.js');
      
      const results = [
        contracts.makeAskSuccess({ provider: 'x', response: {} }),
        contracts.makeAskFailure({ provider: 'x', code: 'CHECK_FAILED', message: 'm', suggestion: 's' }),
        contracts.makeDoctorResult({ provider: 'x', healthy: true, checks: {} }),
        contracts.makeDoctorResult({ provider: 'x', healthy: false, checks: {}, code: 'LOGIN_REQUIRED', message: 'm', suggestion: 's' }),
        contracts.makeProvidersResult({ providers: [] }),
        contracts.makeErrorResponse('x', 'UNKNOWN_COMMAND', 'm', 's'),
      ];
      
      for (const result of results) {
        const json = JSON.stringify(result);
        const parsed = JSON.parse(json);
        assert.strictEqual(parsed.json, true);
        assert.ok(typeof parsed.command === 'string' || parsed.command === null);
        assert.ok(typeof parsed.status === 'string');
      }
    });
  });
});
