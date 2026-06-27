import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const ROOT = path.resolve(import.meta.dirname, "../..");
const require = createRequire(import.meta.url);

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function readSrc(relPath) {
  return fs.readFileSync(path.join(ROOT, relPath), "utf8");
}

// ── Manifest injection chain ───────────────────────────────────────

describe("manifest.json content_scripts injection order", () => {
  const manifest = loadJson(path.join(ROOT, "manifest.json"));
  const js = manifest.content_scripts[0].js;

  it("includes content/constants.js", () => {
    assert.ok(js.includes("content/constants.js"), "content/constants.js must be in content_scripts[0].js");
  });

  it("content/constants.js is the first content script", () => {
    assert.equal(js[0], "content/constants.js", "constants.js must be at index 0");
  });

  it("content/constants.js loads before all other content scripts", () => {
    const constantsIdx = js.indexOf("content/constants.js");
    const others = [
      "content/provider-configs.js",
      "content/send-handlers.js",
      "content/response-state.js",
      "content/response-detection.js",
      "content/transcript-capture.js",
      "content/content.js"
    ];
    for (const other of others) {
      const otherIdx = js.indexOf(other);
      assert.ok(otherIdx >= 0, `Missing ${other}`);
      assert.ok(constantsIdx < otherIdx, `${other} must load after constants.js`);
    }
  });
});

// ── constants.js structure ─────────────────────────────────────────

describe("content/constants.js", () => {
  const src = readSrc("content/constants.js");

  it("exposes globalThis.MultiAIContentConstants", () => {
    assert.ok(src.includes("globalThis.MultiAIContentConstants"), "Must expose MultiAIContentConstants on globalThis");
  });

  it("uses Object.freeze", () => {
    assert.ok(src.includes("Object.freeze"), "Constants must be frozen");
  });

  it("supports module.exports for Node tests", () => {
    assert.ok(src.includes("module.exports"), "Must export for Node test consumption");
  });

  it("defines all required constants", () => {
    const REQUIRED = [
      "CONFIG_READY_TIMEOUT_MS",
      "DOM_READY_SETTLE_MS",
      "SEND_INPUT_WAIT_TIMEOUT_MS",
      "CLOUDFLARE_VERIFY_INTERVAL_MS",
      "RESPONSE_STABILITY_MS_FALLBACK",
      "RESPONSE_STABILITY_MS_DEEPSEEK",
      "RESPONSE_STABILITY_MS_DOUBAO_KIMI_TONGYI",
      "RESPONSE_STABILITY_MS_DEFAULT",
      "SEND_BUTTON_DISABLED_WAIT_MS",
      "RESPONSE_START_MAX_WAIT_MS",
      "RESPONSE_START_CHECK_INTERVAL_MS",
      "RESPONSE_START_STOP_CHECK_LIMIT",
      "RESPONSE_START_META_CHECK_LIMIT",
      "RESPONSE_START_SIGNAL_DELAY_MS",
      "RESPONSE_START_FAST_POLL_MS",
      "RESPONSE_STOP_GRACE_MS",
      "RESPONSE_STOP_RECHECK_DELAY_MS",
      "RESPONSE_TEXT_STABILITY_RECHECK_MS",
      "RESPONSE_SKIP_DELAY_MS",
      "ELEMENT_WAIT_TIMEOUT_MS",
      "COPILOT_SEND_DELAY_MS",
      "GROK_SEND_SIGNAL_TIMEOUT_MS",
      "KIMI_SEND_BUTTON_ENABLE_WAIT_MS",
      "KIMI_SEND_BUTTON_POLL_MS",
      "KIMI_INPUT_SETTLE_MS",
      "TONGYI_INPUT_SETTLE_MS",
      "MANUAL_SEND_CAPTURE_WINDOW_MS",
      "MANUAL_TURN_OBSERVER_RESTART_DELAY_MS"
    ];
    for (const key of REQUIRED) {
      assert.ok(src.includes(key + ":"), `constants.js must define ${key}`);
    }
  });

  it("uses IIFE pattern (not ES module)", () => {
    assert.ok(src.startsWith("(function") || src.includes("(function initContentConstants"),
      "constants.js must use IIFE pattern");
    assert.ok(!src.match(/^import /), "constants.js must not use ES module imports");
  });
});

// ── Stability threshold tests via constants ────────────────────────

describe("response-state.js uses constants", () => {
  // Load the constants module directly for value verification
  const constants = (() => {
    const mod = require(path.join(ROOT, "content", "constants.js"));
    return mod;
  })();

  it("RESPONSE_STABILITY_MS_DEEPSEEK = 1500", () => {
    assert.equal(constants.RESPONSE_STABILITY_MS_DEEPSEEK, 1500);
  });

  it("RESPONSE_STABILITY_MS_DOUBAO_KIMI_TONGYI = 1800", () => {
    assert.equal(constants.RESPONSE_STABILITY_MS_DOUBAO_KIMI_TONGYI, 1800);
  });

  it("RESPONSE_STABILITY_MS_DEFAULT = 3500", () => {
    assert.equal(constants.RESPONSE_STABILITY_MS_DEFAULT, 3500);
  });

  it("RESPONSE_STABILITY_MS_FALLBACK = 1200", () => {
    assert.equal(constants.RESPONSE_STABILITY_MS_FALLBACK, 1200);
  });

  it("response-state.js references MultiAIContentConstants", () => {
    const src = readSrc("content/response-state.js");
    assert.ok(src.includes("MultiAIContentConstants"), "response-state.js must reference constants");
  });

  it("response-detection.js references MultiAIContentConstants", () => {
    const src = readSrc("content/response-detection.js");
    assert.ok(src.includes("MultiAIContentConstants"), "response-detection.js must reference constants");
  });

  it("response-detection.js fallback thresholds match constants", () => {
    const src = readSrc("content/response-detection.js");
    // The fallback block must reference the same constants
    assert.ok(src.includes("RESPONSE_STABILITY_MS_DEFAULT"), "response-detection.js must use RESPONSE_STABILITY_MS_DEFAULT");
    assert.ok(src.includes("RESPONSE_STABILITY_MS_DEEPSEEK"), "response-detection.js must use RESPONSE_STABILITY_MS_DEEPSEEK");
    assert.ok(src.includes("RESPONSE_STABILITY_MS_DOUBAO_KIMI_TONGYI"), "response-detection.js must use RESPONSE_STABILITY_MS_DOUBAO_KIMI_TONGYI");
  });
});

// ── Guard: no remaining raw magic numbers in replaced locations ────

describe("magic numbers replaced", () => {
  // Whitelist: numbers that are allowed to appear as raw literals
  // (CSS values, selectors, HTTP status, array indices, booleans, etc.)
  const WHITELIST_PATTERNS = [
    /color/, /background/, /font/, /width/, /height/, /px/, /em/, /rem/,
    /z-index/, /opacity/, /border/, /margin/, /padding/, /display/,
    /querySelector/, /getElementById/, /getElementsBy/, /closest/,
    /aria-/, /data-/, /role=/, /tabindex/, /type=/,
    /keyCode/, /which/, /charCode/, /button/, /key=/, /code=/,
    /status/, /http/, /port/, /host/, /origin/, /protocol/,
    /\.length/, /\.size/, /\.count/, /\.index/, /\.indexOf/,
    /Math\./, /parseInt/, /parseFloat/, /Number\./,
    /setTimeout.*, *0\)/, /setInterval.*, *0\)/, // zero delays
    /=== *[01] */, /!== *[01] */, /[><=] *[01] *[;,),&|]/, // boolean-like
    /replace\(/, /match\(/, /test\(/, // regex operations
    /\.slice\(/, /\.substring\(/, /\.split\(/,
    /console\./, /Error\(/, /throw /,
    /score/, /weight/, /priority/, /threshold/,
    /cssText/, /className/, /classList/,
    /svg/, /path/, /viewBox/, /stroke/, /fill/, /d="/,
    /doubao/, /kimi/, /tongyi/, /deepseek/, /grok/, /chatgpt/, /gemini/,
    /copilot/, /yuanbao/, /zhipu/, /ima/,
    /\.json/, /\.js/, /\.css/, /\.html/,
  ];

  function isWhitelisted(line) {
    return WHITELIST_PATTERNS.some(pat => pat.test(line));
  }

  const TARGET_NUMBERS = [5000, 3000, 2000, 1500, 1200, 30000, 800, 500, 250, 300, 100];

  // Files where these numbers should NOT appear as raw literals
  const CHECKED_FILES = [
    { path: "content/response-state.js", name: "response-state.js" },
    { path: "content/response-detection.js", name: "response-detection.js" },
    { path: "content/send-handlers.js", name: "send-handlers.js" },
    { path: "content/transcript-capture.js", name: "transcript-capture.js" },
    { path: "content/content.js", name: "content.js" }
  ];

  for (const file of CHECKED_FILES) {
    it(`${file.name} has no unwhitelisted magic numbers`, () => {
      const src = readSrc(file.path);
      const lines = src.split("\n");
      const violations = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        // Skip comments
        if (line.trim().startsWith("//") || line.trim().startsWith("*")) continue;
        for (const num of TARGET_NUMBERS) {
          // Match the number as a standalone literal (not part of a larger number)
          const regex = new RegExp(`(?<![\\d.])${num}(?![\\d.])`);
          if (regex.test(line) && !isWhitelisted(line)) {
            // Check if it's inside a fallback (C.xxx || NNN) — that's OK
            if (line.includes(`|| ${num}`)) continue;
            violations.push(`Line ${i + 1}: raw ${num} — ${line.trim()}`);
          }
        }
      }
      assert.deepEqual(violations, [], `${file.name} has unwhitelisted magic numbers`);
    });
  }
});
