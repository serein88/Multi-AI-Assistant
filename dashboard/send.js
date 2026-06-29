(() => {
  "use strict";

  function getState() {
    return globalThis.MultiAI || {};
  }

  // ── Target parsing & chips ───────────────────────────────────────

  function updateShortcutHint() {
    const state = getState();
    const activePanels = state.activePanels || [];
    const shortcutHint = document.getElementById("shortcutHint");
    if (!shortcutHint) return;
    const labels = activePanels.map((id, index) => {
      const provider = PROVIDER_BY_ID[id];
      const name = provider ? provider.label : id;
      return `@${index + 1} ${name}`;
    });
    const promptEl = document.getElementById("prompt");
    const text = labels.join(" / ");
    if (text && (promptEl?.value || "").includes("@")) {
      shortcutHint.textContent = text;
      shortcutHint.style.display = "block";
    } else {
      shortcutHint.textContent = "";
      shortcutHint.style.display = "none";
    }
  }

  function renderTargetChips(selectedTargets, onRemove) {
    const targetChips = document.getElementById("targetChips");
    if (!targetChips) return;
    targetChips.innerHTML = "";
    selectedTargets.forEach((providerId) => {
      const provider = PROVIDER_BY_ID[providerId];
      const chip = document.createElement("span");
      chip.className = "composer-chip";
      const code = document.createElement("code");
      code.textContent = `@${provider?.label || providerId}`;
      const remove = document.createElement("button");
      remove.type = "button";
      remove.setAttribute("aria-label", "Remove");
      remove.textContent = "×";
      remove.addEventListener("click", () => onRemove(providerId));
      chip.appendChild(code);
      chip.appendChild(remove);
      targetChips.appendChild(chip);
    });
  }

  function parseTargetsFromInput(text) {
    const state = getState();
    const activePanels = state.activePanels || [];
    const matches = text.match(/@(\d+)/g) || [];
    const targets = [];
    matches.forEach((token) => {
      const index = Number(token.slice(1));
      if (Number.isFinite(index) && index >= 1 && index <= activePanels.length) {
        targets.push(activePanels[index - 1]);
      }
    });
    return Array.from(new Set(targets));
  }

  function stripTargetTokens(text) {
    return text.replace(/@(\d+)(?=[\s:：]|$|[^0-9])/g, "").replace(/\s{2,}/g, " ").trimStart();
  }

  function parseTargetPrompt(text) {
    const state = getState();
    const activePanels = state.activePanels || [];
    const trimmed = text.trim();
    if (!trimmed.startsWith("@")) {
      return { prompt: trimmed, targets: [] };
    }

    const targets = [];
    let rest = trimmed;
    while (rest.startsWith("@")) {
      const match = rest.match(/^@(\d+)(?=[\s:：]|$|[^0-9])/);
      if (!match) break;
      const index = Number(match[1]);
      if (Number.isFinite(index) && index >= 1 && index <= activePanels.length) {
        targets.push(activePanels[index - 1]);
      }
      rest = rest.slice(match[0].length);
      if (rest.startsWith(":") || rest.startsWith("：")) {
        rest = rest.slice(1);
      }
      rest = rest.trimStart();
    }

    if (targets.length === 0) {
      return { prompt: trimmed, targets: [] };
    }

    return {
      prompt: rest,
      targets: Array.from(new Set(targets))
    };
  }

  // ── Panel iframe/badge helpers ───────────────────────────────────

  function getPanelIframe(providerId) {
    const state = getState();
    const activePanels = state.activePanels || [];
    const panelByIndex = state.panelByIndex || new Map();
    const index = activePanels.indexOf(providerId);
    if (index < 0) return null;
    const panel = panelByIndex.get(index);
    if (!panel) return null;
    return panel.querySelector("iframe");
  }

  function getPanelBadge(providerId) {
    const state = getState();
    const activePanels = state.activePanels || [];
    const panelByIndex = state.panelByIndex || new Map();
    const index = activePanels.indexOf(providerId);
    if (index < 0) return null;
    const panel = panelByIndex.get(index);
    if (!panel) return null;
    return panel.querySelector(".panel-badge");
  }

  const BADGE_STATUS_CLASSES = ["status-sending", "status-success", "status-error"];
  const sendStatusTimers = new Map();

  function setPanelBadgeStatus(providerId, status) {
    const badge = getPanelBadge(providerId);
    if (!badge) return;

    const existingTimer = sendStatusTimers.get(providerId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      sendStatusTimers.delete(providerId);
    }

    badge.classList.remove(...BADGE_STATUS_CLASSES);
    if (!status) return;

    const className = `status-${status}`;
    badge.classList.add(className);

    if (status === "success" || status === "error") {
      const timerId = setTimeout(() => {
        const latest = getPanelBadge(providerId);
        if (latest) {
          latest.classList.remove(className);
        }
        sendStatusTimers.delete(providerId);
      }, 2000);
      sendStatusTimers.set(providerId, timerId);
    }
  }

  // ── Send logic ───────────────────────────────────────────────────

  const IFRAME_BLOCKED_PROVIDERS = new Set([]);
  const SEND_TIMEOUT_MS = 15000;
  const pendingSends = new Map();
  let currentSendTargets = [];
  let completedResponses = new Set();
  let startedResponses = new Set();
  let failedResponses = new Set();
  let selectedTargets = [];
  let suppressPromptInput = false;

  function updateSendingState() {
    const state = getState();
    const sendAllBtn = document.getElementById("sendAll");
    const I18N = state.I18N || {};
    if (!currentSendTargets.length) return;
    const pending = currentSendTargets.filter((providerId) =>
      !startedResponses.has(providerId) && !failedResponses.has(providerId)
    );
    if (pending.length > 0) return;
    sendAllBtn.disabled = false;
    sendAllBtn.textContent = I18N.sendAll;
    currentSendTargets = [];
  }

  function resolvePendingSend(providerId, success) {
    const pending = pendingSends.get(providerId);
    if (!pending) return;
    clearTimeout(pending.timeoutId);
    pendingSends.delete(providerId);
    pending.resolve(Boolean(success));
  }

  function sendPromptToProvider(providerId, prompt) {
    if (!providerId || !prompt) {
      return Promise.resolve(false);
    }

    const iframe = getPanelIframe(providerId);

    return new Promise((resolve) => {
      if (pendingSends.has(providerId)) {
        resolvePendingSend(providerId, false);
      }

      const timeoutId = setTimeout(() => {
        resolvePendingSend(providerId, false);
      }, SEND_TIMEOUT_MS);

      pendingSends.set(providerId, { resolve, timeoutId });

      if (!iframe || !iframe.contentWindow || IFRAME_BLOCKED_PROVIDERS.has(providerId)) {
        var _msg = globalThis.__MAI_RuntimeMessaging;
        var sendFn = _msg && _msg.sendRuntimeMessageWithRetry
          ? _msg.sendRuntimeMessageWithRetry(
              { type: "sendPromptToProviderTab", provider: providerId, prompt },
              { timeoutMs: 35000, retries: 1 }
            )
          : chrome.runtime.sendMessage({ type: "sendPromptToProviderTab", provider: providerId, prompt });
        sendFn
          .then((res) => resolvePendingSend(providerId, res && res.ok))
          .catch((err) => {
            console.warn("[MultiAI Dashboard] sendPromptToProviderTab:", err);
            resolvePendingSend(providerId, false);
          });
        return;
      }

      try {
        iframe.contentWindow.postMessage({
          source: "multi-ai",
          type: "sendPrompt",
          provider: providerId,
          prompt
        }, "*");
      } catch (e) {
        resolvePendingSend(providerId, false);
      }
    });
  }

  async function recordSessionUserTurn(prompt, targetList) {
    const state = getState();
    const currentSessionId = state.currentSessionId || "";
    if (!currentSessionId || !prompt || !Array.isArray(targetList) || targetList.length === 0) {
      return;
    }

    const providers = Array.from(new Set(
      targetList.filter((providerId) => typeof providerId === "string" && providerId.length > 0)
    ));
    if (providers.length === 0) {
      return;
    }

    try {
      var _msg = globalThis.__MAI_RuntimeMessaging;
      const response = await (_msg && _msg.sendRuntimeMessageWithRetry
        ? _msg.sendRuntimeMessageWithRetry({
            type: "session:transcript-user-turn",
            sessionId: currentSessionId,
            prompt,
            providers,
            occurredAt: new Date().toISOString()
          }, { retries: 1 })
        : chrome.runtime.sendMessage({
            type: "session:transcript-user-turn",
            sessionId: currentSessionId,
            prompt,
            providers,
            occurredAt: new Date().toISOString()
          })
      );

      if (!response || !response.ok || !response.result || response.result.ok !== true) {
        if (state.log) state.log("Failed to persist transcript user turn", response);
        return;
      }
      if (globalThis.MultiAITranscript) globalThis.MultiAITranscript.scheduleTranscriptRefresh(150);
    } catch (error) {
      if (state.log) state.log("Failed to persist transcript user turn", error);
    }
  }

  async function sendPrompt() {
    const state = getState();
    const activePanels = state.activePanels || [];
    const promptEl = document.getElementById("prompt");
    const sendAllBtn = document.getElementById("sendAll");
    const I18N = state.I18N || {};

    const text = (promptEl?.value || "").trim();
    if (!text) {
      if (state.showMessage) state.showMessage("Please enter a prompt", "warning");
      return;
    }

    if (activePanels.length === 0) {
      if (state.showMessage) state.showMessage("No active panels", "warning");
      return;
    }

    const { prompt, targets } = parseTargetPrompt(text);
    if (!prompt) {
      if (state.showMessage) state.showMessage("Please enter a valid prompt", "warning");
      return;
    }

    if (state.log) state.log(`Preparing to send prompt: "${prompt.substring(0, 20)}..." to ${activePanels.length} panels`);

    const targetList = selectedTargets.length > 0
      ? selectedTargets
      : (targets.length > 0 ? targets : [...activePanels]);
    currentSendTargets = targetList;
    completedResponses = new Set();
    startedResponses = new Set();
    failedResponses = new Set();
    targetList.forEach((providerId) => setPanelBadgeStatus(providerId, "sending"));

    sendAllBtn.disabled = true;
    sendAllBtn.textContent = "Sending...";

    try {
      await recordSessionUserTurn(prompt, targetList);

      const promises = targetList.map((providerId) =>
        sendPromptToProvider(providerId, prompt)
      );
      const results = await Promise.all(promises);
      results.forEach((ok, index) => {
        const providerId = targetList[index];
        if (!ok) {
          failedResponses.add(providerId);
          setPanelBadgeStatus(providerId, "error");
        } else {
          setPanelBadgeStatus(providerId, "success");
        }
      });
      currentSendTargets = [];
      sendAllBtn.disabled = false;
      sendAllBtn.textContent = I18N.sendAll;
      if (targetList.length === 1) {
        const targetId = targetList[0];
        if (state.showMessage) state.showMessage(`Sent to ${PROVIDER_BY_ID[targetId]?.label || targetId}`, "success");
      } else {
        if (state.showMessage) state.showMessage(`Sent to ${targetList.length} assistants`, "success");
      }

      promptEl.value = "";
      selectedTargets = [];
      renderTargetChips(selectedTargets, removeSelectedTarget);
    } catch (error) {
      console.error("Send failed", error);
      currentSendTargets.forEach((providerId) => setPanelBadgeStatus(providerId, "error"));
      if (state.showMessage) state.showMessage("Send failed. Try again.", "error");
    } finally {
      currentSendTargets = [];
      sendAllBtn.disabled = false;
      sendAllBtn.textContent = I18N.sendAll;
    }
  }

  // ── Target management helpers ────────────────────────────────────

  function removeSelectedTarget(providerId) {
    selectedTargets = selectedTargets.filter((id) => id !== providerId);
    renderTargetChips(selectedTargets, removeSelectedTarget);
    updateSendButtonState();
  }

  function syncTargetsFromPrompt() {
    if (suppressPromptInput) return;
    const promptEl = document.getElementById("prompt");
    const text = promptEl?.value || "";
    const targets = parseTargetsFromInput(text);
    if (targets.length === 0) return;
    selectedTargets = Array.from(new Set([...selectedTargets, ...targets]));
    const stripped = stripTargetTokens(text);
    if (stripped !== text) {
      suppressPromptInput = true;
      promptEl.value = stripped;
      suppressPromptInput = false;
    }
    renderTargetChips(selectedTargets, removeSelectedTarget);
  }

  function updateSendButtonState() {
    const promptEl = document.getElementById("prompt");
    const sendAllBtn = document.getElementById("sendAll");
    const { targets } = parseTargetPrompt(promptEl?.value || "");
    const hasInlineTargets = targets.length > 0;
    const hasChips = selectedTargets.length > 0;
    if (hasInlineTargets && !hasChips) {
      sendAllBtn.classList.add("composer-send-target");
    } else {
      sendAllBtn.classList.remove("composer-send-target");
    }
    updateShortcutHint();
  }

  // ── Export API ───────────────────────────────────────────────────

  const api = {
    sendPrompt,
    sendPromptToProvider,
    resolvePendingSend,
    updateSendingState,
    setPanelBadgeStatus,
    getPanelIframe,
    getPanelBadge,
    parseTargetPrompt,
    parseTargetsFromInput,
    stripTargetTokens,
    syncTargetsFromPrompt,
    renderTargetChips: () => renderTargetChips(selectedTargets, removeSelectedTarget),
    updateSendButtonState,
    updateShortcutHint,
    recordSessionUserTurn,
    // State accessors
    get selectedTargets() { return selectedTargets; },
    set selectedTargets(v) { selectedTargets = v; },
    get currentSendTargets() { return currentSendTargets; },
    set currentSendTargets(v) { currentSendTargets = v; },
    get startedResponses() { return startedResponses; },
    get completedResponses() { return completedResponses; },
    get failedResponses() { return failedResponses; },
    get suppressPromptInput() { return suppressPromptInput; },
    set suppressPromptInput(v) { suppressPromptInput = v; },
    removeSelectedTarget,
    IFRAME_BLOCKED_PROVIDERS,
    sendStatusTimers,
    BADGE_STATUS_CLASSES,
    SEND_TIMEOUT_MS
  };

  if (typeof globalThis !== "undefined") {
    globalThis.MultiAISend = api;
  }
})();
