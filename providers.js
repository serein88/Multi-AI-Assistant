const DASHBOARD_MAX_PANELS = 6;

const SESSION_PROVIDER_IDS = ["deepseek", "gemini", "grok"];
if (typeof globalThis !== "undefined") {
  globalThis.SESSION_PROVIDER_IDS = SESSION_PROVIDER_IDS;
}

const PROVIDERS = [
  { id: "chatgpt", label: "ChatGPT", url: "https://chatgpt.com/" },
  { id: "claude", label: "Claude", url: "https://claude.ai/" },
  { id: "grok", label: "Grok", url: "https://grok.com/" },
  { id: "gemini", label: "Gemini", url: "https://gemini.google.com/" },
  { id: "copilot", label: "Copilot", url: "https://copilot.microsoft.com/" },
  { id: "doubao", label: "豆包", url: "https://www.doubao.com/" },
  { id: "kimi", label: "Kimi", url: "https://www.kimi.com/" },
  { id: "deepseek", label: "DeepSeek", url: "https://chat.deepseek.com/" },
  { id: "tongyi", label: "通义千问", url: "https://www.qianwen.com/" },
  { id: "yuanbao", label: "元宝", url: "https://yuanbao.tencent.com/" },
  { id: "zhipu", label: "智谱AI", url: "https://chatglm.cn/" },
  { id: "you", label: "You.com", url: "https://you.com/" },
  { id: "ima", label: "ima", url: "https://ima.qq.com/" }
];

const PROVIDER_BY_ID = PROVIDERS.reduce((acc, provider) => {
  acc[provider.id] = provider;
  return acc;
}, {});

function normalizeProviders(list, maxCount) {
  const seen = new Set();
  const result = [];

  for (const item of list || []) {
    if (!PROVIDER_BY_ID[item]) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    result.push(item);
    if (result.length >= maxCount) break;
  }

  return result;
}

function findProviderByToken(token) {
  if (!token) return null;
  const lowered = token.toLowerCase();
  const byId = PROVIDER_BY_ID[lowered];
  if (byId) return byId;

  return PROVIDERS.find((provider) => provider.label.toLowerCase() === lowered) || null;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    DASHBOARD_MAX_PANELS,
    SESSION_PROVIDER_IDS,
    PROVIDERS,
    PROVIDER_BY_ID,
    normalizeProviders,
    findProviderByToken
  };
}

