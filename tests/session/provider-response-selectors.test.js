const test = require("node:test");
const assert = require("node:assert/strict");

function extractLatestResponseFromHtml(html, selectors) {
  const nodes = Array.from(
    html.matchAll(/<(?<tag>[a-z0-9-]+)(?<attrs>[^>]*)>(?<text>[^<]*)/gi),
    (match) => {
      const attrs = match.groups.attrs || "";
      const text = (match.groups.text || "").replace(/\s+/g, " ").trim();
      return {
        tag: (match.groups.tag || "").toLowerCase(),
        className: (attrs.match(/class="([^"]*)"/i)?.[1] || "").trim(),
        dataRole: (attrs.match(/data-role="([^"]*)"/i)?.[1] || "").trim(),
        dataTestId: (attrs.match(/data-testid="([^"]*)"/i)?.[1] || "").trim(),
        text
      };
    }
  ).filter((node) => node.text);

  function matchesSelector(node, selector) {
    if (selector.startsWith(".")) {
      const required = selector.slice(1).split(".").filter(Boolean);
      return required.every((cls) => node.className.split(/\s+/).includes(cls));
    }
    const classContains = selector.match(/^\[class\*='([^']+)'\]$/);
    if (classContains) {
      return node.className.includes(classContains[1]);
    }
    const dataRoleEquals = selector.match(/^\[data-role='([^']+)'\]$/);
    if (dataRoleEquals) {
      return node.dataRole === dataRoleEquals[1];
    }
    const dataTestContains = selector.match(/^\[data-testid\*='([^']+)'\]$/);
    if (dataTestContains) {
      return node.dataTestId.includes(dataTestContains[1]);
    }
    return false;
  }

  let latest = "";
  for (const sel of selectors) {
    const matched = nodes.filter((node) => matchesSelector(node, sel));
    if (!matched.length) continue;
    const target = matched[matched.length - 1];
    if (target.text) {
      latest = target.text;
      break;
    }
  }
  return latest;
}

test("deepseek completion selectors extract the final assistant text", () => {
  const html = `
    <div class="ds-virtual-list-visible-items">
      <div class="_9663006">回归测试二：请只回复“收到”。</div>
      <div class="ds-markdown ds-markdown--block">收到</div>
    </div>
  `;

  const selectors = [
    ".ds-markdown",
    ".ds-markdown-paragraph",
    ".ds-message .ds-markdown",
    ".ds-message .ds-markdown-paragraph"
  ];

  assert.equal(extractLatestResponseFromHtml(html, selectors), "收到");
});

test("grok completion selectors extract the final assistant text", () => {
  const html = `
    <div id="last-reply-container">
      <div class="message-bubble user">回归测试二：请只回复“收到”。</div>
      <div class="relative response-content-markdown markdown">收到</div>
    </div>
  `;

  const selectors = [
    ".response-content-markdown",
    ".response-content-markdown.markdown",
    "[id^='response-'] .response-content-markdown"
  ];

  assert.equal(extractLatestResponseFromHtml(html, selectors), "收到");
});

test("grok completion selectors ignore echoed prompt bubbles without markdown response content", () => {
  const html = `
    <div id="response-123">
      <div class="message-bubble prose">回归测试二：请只回复“收到”。</div>
    </div>
  `;

  const selectors = [
    ".response-content-markdown",
    ".response-content-markdown.markdown",
    "[id^='response-'] .response-content-markdown"
  ];

  assert.equal(extractLatestResponseFromHtml(html, selectors), "");
});
