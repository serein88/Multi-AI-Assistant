const js = require("@eslint/js");
const globals = require("globals");

module.exports = [
  js.configs.recommended,
  {
    // Default config for all JS files except providers.js
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "script",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.node,
        // Chrome MV3 service worker
        importScripts: "readonly"
      }
    },
    rules: {
      "no-unused-vars": ["warn", {
        args: "none",
        caughtErrors: "none",
        varsIgnorePattern: "^_"
      }],
      "no-console": "off",
      "no-empty": ["error", { allowEmptyCatch: true }],
      "no-constant-condition": ["error", { checkLoops: false }]
    }
  },
  {
    // ES Module files (background service worker + session modules + .mjs tests)
    files: ["*.mjs", "session/*.mjs", "tests/e2e/**/*.mjs", "tests/session/**/*.test.mjs", "tests/dashboard/**/*.test.mjs", "tests/content/**/*.test.js", "tests/i18n/**/*.test.js", "tests/*.test.mjs"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.webextensions,
        ...globals.node
      }
    }
  },
  {
    // Files that consume providers.js exports as implicit globals
    files: ["dashboard.js", "dashboard/*.js", "manage.js", "archive/legacy-popup/popup.js"],
    languageOptions: {
      globals: {
        PROVIDERS: "readonly",
        PROVIDER_BY_ID: "readonly",
        DASHBOARD_MAX_PANELS: "readonly",
        SESSION_PROVIDER_IDS: "readonly",
        normalizeProviders: "readonly",
        findProviderByToken: "readonly",
        FaviconCache: "readonly"
      }
    }
  },
  {
    files: ["tests/**/*.js"],
    languageOptions: {
      globals: {
        ...globals.node
      }
    }
  },
  {
    ignores: [
      "node_modules/**",
      ".worktrees/**",
      "tests/e2e/t-*",
      "eslint.config.js",
      "providers.js"
    ]
  }
];
