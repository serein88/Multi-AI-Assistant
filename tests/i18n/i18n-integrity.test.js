import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(import.meta.dirname, "../..");

// ── All keys that must exist in every _locales/*/messages.json ──────

const REQUIRED_KEYS = [
  "extName",
  "extDescription",
  "topbarSubtitle",
  "settings",
  "settingsTitle",
  "settingsSubtitle",
  "settingsColumns",
  "selectToggle",
  "cancel",
  "confirm",
  "sendAll",
  "composerLabel",
  "composerPlaceholder",
  "langBtn",
  "langToggleTitle",
  "refresh",
  "newTab",
  "close",
  "switch",
  "add",
  "remove",
  "panelBlocked",
  "colAuto",
  "chatroom",
  "transcriptDockLabel",
  "transcriptTitle",
  "transcriptRefresh",
  "transcriptStatusTitle",
  "transcriptTimelineTitle",
  "transcriptRawTitle",
  "transcriptViewDialogue",
  "transcriptViewMessages",
  "transcriptViewToDialogue",
  "transcriptViewToMessages",
  "statusIdleShort",
  "statusIdleLong",
  "statusRespondingShort",
  "statusRespondingLong",
  "statusCompletedShort",
  "statusCompletedLong",
  "statusFailedShort",
  "statusFailedLong",
  "statusInterruptedShort",
  "statusInterruptedLong",
  "roleAssistant",
  "roleUser",
  "timestampNone",
  "timestampWaiting",
  "timestampJustNow",
  "timestampMinutesAgo",
  "timestampHoursAgo",
  "timestampDaysAgo",
  "statusStarted",
  "statusEnded",
  "statusUpdatedAt",
  "transcriptTurnCount",
  "transcriptEmptyProviders",
  "transcriptEmptyTimeline",
  "transcriptEmptyRaw",
  "transcriptEmptyTurns",
  "transcriptSessionMeta",
  "transcriptWaitingData",
  "transcriptNotLoaded",
  "transcriptTimelineNotLoaded",
  "transcriptRawNotLoaded",
  "transcriptLoadFailed"
];

// ── Helpers ─────────────────────────────────────────────────────────

function loadJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function getLocaleKeys(locale) {
  const filePath = path.join(ROOT, "_locales", locale, "messages.json");
  return Object.keys(loadJson(filePath));
}

// ── Tests ───────────────────────────────────────────────────────────

describe("_locales integrity", () => {
  for (const locale of ["zh_CN", "en"]) {
    describe(`${locale}/messages.json`, () => {
      it("exists", () => {
        const filePath = path.join(ROOT, "_locales", locale, "messages.json");
        assert.ok(fs.existsSync(filePath), `Missing: ${filePath}`);
      });

      it("contains all required keys", () => {
        const keys = getLocaleKeys(locale);
        for (const key of REQUIRED_KEYS) {
          assert.ok(keys.includes(key), `Missing key "${key}" in ${locale}`);
        }
      });

      it("every message has a non-null 'message' property", () => {
        const data = loadJson(path.join(ROOT, "_locales", locale, "messages.json"));
        for (const [key, entry] of Object.entries(data)) {
          assert.ok(
            typeof entry === "object" && entry !== null && typeof entry.message === "string",
            `Key "${key}" in ${locale} must have a string "message" property`
          );
        }
      });

      it("zh_CN and en have the same set of keys", () => {
        const zhKeys = getLocaleKeys("zh_CN").sort();
        const enKeys = getLocaleKeys("en").sort();
        assert.deepEqual(zhKeys, enKeys, "zh_CN and en must have identical key sets");
      });
    });
  }
});

describe("dashboard/i18n.js", () => {
  const src = fs.readFileSync(path.join(ROOT, "dashboard", "i18n.js"), "utf8");

  it("does NOT embed a full copy of the dictionary", () => {
    // The i18n module must load from _locales via XHR, not embed dictionaries.
    // Heuristic: if the source contains more than 5 hard-coded message strings
    // from the same locale, it's embedding rather than loading.
    const zhPattern = /[一-鿿]/g;
    const zhMatches = src.match(zhPattern) || [];
    // Allow a few Chinese chars in comments, but not a full dictionary (~200+ chars)
    assert.ok(
      zhMatches.length < 30,
      `i18n.js contains ${zhMatches.length} Chinese chars — appears to embed dictionary instead of loading from _locales`
    );
  });

  it("loads from _locales via XHR", () => {
    assert.ok(src.includes("_locales"), "Must reference _locales path");
    assert.ok(src.includes("XMLHttpRequest"), "Must use XHR to load locale files");
  });

  it("exposes globalThis.MultiAI_I18n API", () => {
    assert.ok(src.includes("globalThis.MultiAI_I18n"), "Must expose globalThis.MultiAI_I18n");
    assert.ok(src.includes("t:"), "Must expose t function");
    assert.ok(src.includes("currentLang"), "Must expose currentLang");
    assert.ok(src.includes("messages"), "Must expose messages");
  });

  it("reads localStorage for multi-ai-lang", () => {
    assert.ok(src.includes('localStorage.getItem("multi-ai-lang")'), "Must read language from localStorage");
  });

  it("t() reads messages via live reference (not closure-captured)", () => {
    // t() should access messages through a mutable binding so that after
    // toggleLanguage() swaps messages, t() picks up the new locale.
    // It should NOT do: var messages = ...; function t() { messages[key] }
    // where messages is captured once at init.
    assert.ok(
      src.includes("get messages") || src.includes("set messages"),
      "messages must be exposed via getter/setter so t() reads the live value"
    );
  });
});

describe("shared-state.js", () => {
  const src = fs.readFileSync(path.join(ROOT, "dashboard", "shared-state.js"), "utf8");

  it("does NOT contain I18N_DATA dictionary", () => {
    assert.ok(!src.includes("I18N_DATA = {"), "shared-state.js should not embed I18N_DATA");
  });

  it("does NOT contain LIVE_STATUS_META", () => {
    assert.ok(!src.includes("LIVE_STATUS_META"), "shared-state.js should not embed LIVE_STATUS_META");
  });

  it("references MultiAI_I18n", () => {
    assert.ok(src.includes("MultiAI_I18n"), "shared-state.js must reference the i18n module");
  });

  it("exposes t() via getter on state", () => {
    assert.ok(src.includes("get t()"), "shared-state.js must expose t() getter");
  });
});

describe("dashboard.js i18n integration", () => {
  const src = fs.readFileSync(path.join(ROOT, "dashboard.js"), "utf8");

  it("does NOT contain hardcoded 'This site cannot be embedded' string", () => {
    assert.ok(
      !src.includes('"This site cannot be embedded'),
      "dashboard.js must not hardcode embed-blocked message"
    );
  });

  it("uses t() for panelBlocked", () => {
    assert.ok(src.includes('t("panelBlocked")'), "dashboard.js must use t('panelBlocked')");
  });

  it("updates MultiAI_I18n on language toggle", () => {
    assert.ok(
      src.includes("MultiAI_I18n") && src.includes("toggleLanguage"),
      "toggleLanguage must update MultiAI_I18n state"
    );
  });

  it("applyI18n supports comma-separated data-i18n-attr", () => {
    assert.ok(
      src.includes('attr.split(",")'),
      "applyI18n must split comma-separated data-i18n-attr values"
    );
  });
});

describe("HTML templates", () => {
  for (const htmlFile of ["dashboard.html", "dashboard-dev.html"]) {
    describe(htmlFile, () => {
      const src = fs.readFileSync(path.join(ROOT, htmlFile), "utf8");

      it("loads i18n.js before shared-state.js", () => {
        const i18nPos = src.indexOf("dashboard/i18n.js");
        const sharedPos = src.indexOf("dashboard/shared-state.js");
        assert.ok(i18nPos >= 0, `${htmlFile} must load dashboard/i18n.js`);
        assert.ok(sharedPos >= 0, `${htmlFile} must load dashboard/shared-state.js`);
        assert.ok(i18nPos < sharedPos, "i18n.js must load before shared-state.js");
      });

      it("does NOT contain hardcoded 'Send' in settings column label", () => {
        assert.ok(
          !src.includes("<span>Send</span>"),
          `${htmlFile} should not hardcode "Send" in column label`
        );
      });

      it("does NOT contain hardcoded '全选/全不选'", () => {
        assert.ok(
          !src.includes(">全选/全不选<"),
          `${htmlFile} should not hardcode "全选/全不选"`
        );
      });

      it("settingsColumns uses data-i18n", () => {
        assert.ok(
          src.includes('data-i18n="settingsColumns"'),
          `${htmlFile} must have data-i18n="settingsColumns"`
        );
      });

      it("selectToggle uses data-i18n", () => {
        assert.ok(
          src.includes('data-i18n="selectToggle"'),
          `${htmlFile} must have data-i18n="selectToggle"`
        );
      });
    });
  }

  describe("dashboard.html", () => {
    const src = fs.readFileSync(path.join(ROOT, "dashboard.html"), "utf8");

    it("langToggle uses data-i18n for title and aria-label", () => {
      assert.ok(
        src.includes('data-i18n="langToggleTitle"'),
        "langToggle must use data-i18n for title"
      );
      assert.ok(
        src.includes('data-i18n-attr="title,aria-label"'),
        "langToggle must set both title and aria-label via data-i18n-attr"
      );
    });

    it("does NOT contain hardcoded 'Switch Language' on langToggle", () => {
      const langToggleMatch = src.match(/id="langToggle"[^>]*/);
      if (langToggleMatch) {
        assert.ok(
          !langToggleMatch[0].includes('title="Switch Language"'),
          "langToggle must not hardcode title"
        );
      }
    });
  });

  describe("dashboard-dev.html", () => {
    const src = fs.readFileSync(path.join(ROOT, "dashboard-dev.html"), "utf8");

    it("chatroom button uses data-i18n for title and aria-label", () => {
      assert.ok(
        src.includes('data-i18n="chatroom"'),
        "chatroom button must use data-i18n"
      );
    });

    it("does NOT contain hardcoded '群聊模式' on chatroom button", () => {
      const chatroomMatch = src.match(/id="openChatroom"[^>]*/);
      if (chatroomMatch) {
        assert.ok(
          !chatroomMatch[0].includes('title="群聊模式"'),
          "chatroom button must not hardcode title"
        );
      }
    });
  });
});

describe("manifest.json", () => {
  const manifest = loadJson(path.join(ROOT, "manifest.json"));

  it("has default_locale set to zh_CN", () => {
    assert.equal(manifest.default_locale, "zh_CN");
  });

  it("uses __MSG_extName__ for name", () => {
    assert.equal(manifest.name, "__MSG_extName__");
  });

  it("uses __MSG_extDescription__ for description", () => {
    assert.equal(manifest.description, "__MSG_extDescription__");
  });
});

describe("transcript.js uses t() not inline ternaries", () => {
  const src = fs.readFileSync(path.join(ROOT, "dashboard", "transcript.js"), "utf8");

  it("defines a local t() helper", () => {
    assert.ok(src.includes("function t(key)"), "transcript.js must define a local t() helper");
  });

  it("does NOT contain inline zh-CN ternary patterns for UI text", () => {
    const lines = src.split("\n");
    const violations = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('=== "zh-CN"') && line.includes("?") && line.includes(":")) {
        violations.push(`Line ${i + 1}: ${line.trim()}`);
      }
    }
    assert.deepEqual(violations, [], "No inline zh-CN ternaries should remain");
  });

  it("uses STATUS_KEYS map with t() for status labels", () => {
    assert.ok(src.includes("STATUS_KEYS"), "Must define STATUS_KEYS map");
    assert.ok(src.includes("statusIdleShort"), "STATUS_KEYS must reference statusIdleShort");
    assert.ok(src.includes("statusRespondingShort"), "STATUS_KEYS must reference statusRespondingShort");
    assert.ok(src.includes("statusCompletedLong"), "STATUS_KEYS must reference statusCompletedLong");
  });

  it("getTranscriptViewModeTitle returns next-mode tooltip (not current-mode)", () => {
    // The tooltip for a button should describe the action: switching TO the other view.
    // When current mode is "dialogue", next should be "messages", so tooltip = "Switch to messages view".
    // Bug was: next = normalized === "dialogue" ? "dialogue" : "messages" (wrong — same as current)
    assert.ok(
      src.includes('normalized === "dialogue" ? "messages" : "dialogue"'),
      "getTranscriptViewModeTitle must compute next mode as the opposite of current"
    );
  });

  it("does NOT reference removed liveStatusMeta", () => {
    assert.ok(!src.includes("liveStatusMeta"), "Must not reference removed liveStatusMeta");
  });
});

describe("i18n switching consistency", () => {
  it("_locales keys match i18n.js LOCALE_DIRS", () => {
    const src = fs.readFileSync(path.join(ROOT, "dashboard", "i18n.js"), "utf8");
    // i18n.js must know about zh_CN and en
    assert.ok(src.includes("zh_CN"), "i18n.js must have zh_CN in LOCALE_DIRS");
    assert.ok(src.includes('"en"'), "i18n.js must have en in LOCALE_DIRS");
  });

  it("_locales JSON keys are flat message strings (Chrome format)", () => {
    for (const locale of ["zh_CN", "en"]) {
      const data = loadJson(path.join(ROOT, "_locales", locale, "messages.json"));
      for (const [key, entry] of Object.entries(data)) {
        // Chrome i18n format: { "key": { "message": "...", "description": "..." } }
        assert.ok(
          typeof entry.message === "string",
          `${locale}/${key} must have a string "message" (Chrome i18n format)`
        );
      }
    }
  });
});
