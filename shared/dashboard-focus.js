(() => {
  const DEFAULT_RESTORE_DELAYS_MS = [0, 80, 250];

  function normalizeElements(elements) {
    if (!Array.isArray(elements)) {
      return [];
    }
    return elements.filter(Boolean);
  }

  function isPromptFocused(promptEl, documentRef) {
    return Boolean(promptEl && documentRef && documentRef.activeElement === promptEl);
  }

  function isIframeElement(element) {
    if (!element) {
      return false;
    }
    if (element.tagName === "IFRAME") {
      return true;
    }
    return Boolean(element.classList && element.classList.contains("panel-frame"));
  }

  function setFrameFocusShielded(frame, shielded) {
    if (!frame) {
      return false;
    }

    const dataset = frame.dataset || {};
    if (shielded) {
      if (dataset.multiAiFocusShielded !== "true") {
        dataset.multiAiHadPreviousTabindex = frame.hasAttribute && frame.hasAttribute("tabindex") ? "true" : "false";
        dataset.multiAiPreviousTabindex = frame.getAttribute && frame.getAttribute("tabindex") !== null
          ? frame.getAttribute("tabindex")
          : "";
      }
      dataset.multiAiFocusShielded = "true";
      // Use inert to prevent focus stealing - keeps iframe visible but non-interactive
      frame.inert = true;
      if (typeof frame.setAttribute === "function") {
        frame.setAttribute("tabindex", "-1");
      }
      return true;
    }

    frame.inert = false;
    if (dataset.multiAiHadPreviousTabindex === "true") {
      if (typeof frame.setAttribute === "function") {
        frame.setAttribute("tabindex", dataset.multiAiPreviousTabindex || "");
      }
    } else if (typeof frame.removeAttribute === "function") {
      frame.removeAttribute("tabindex");
    }
    delete dataset.multiAiFocusShielded;
    delete dataset.multiAiHadPreviousTabindex;
    delete dataset.multiAiPreviousTabindex;
    return true;
  }

  function createPromptFocusGuard({
    promptEl,
    documentRef = typeof document !== "undefined" ? document : null,
    windowRef = typeof window !== "undefined" ? window : null,
    now = () => Date.now(),
    recentPromptMs = 5000,
    restoreDelaysMs = DEFAULT_RESTORE_DELAYS_MS
  } = {}) {
    let shouldRestore = false;
    let lastPromptInteractionAt = Number.NEGATIVE_INFINITY;
    let programmaticFocusBlocked = false;
    const allowedActiveElements = new Set();

    function getNow() {
      return typeof now === "function" ? now() : Date.now();
    }

    function addAllowedActiveElements(elements) {
      normalizeElements(elements).forEach((element) => allowedActiveElements.add(element));
    }

    function hasRecentPromptInteraction() {
      return getNow() - lastPromptInteractionAt <= recentPromptMs;
    }

    function canRestoreFromCurrentFocus() {
      if (!shouldRestore || !promptEl || !documentRef) {
        return false;
      }

      const activeElement = documentRef.activeElement;
      if (!activeElement || activeElement === documentRef.body || activeElement === documentRef.documentElement) {
        return true;
      }
      if (activeElement === promptEl) {
        return true;
      }
      if (allowedActiveElements.has(activeElement)) {
        return true;
      }
      return isIframeElement(activeElement);
    }

    function focusPrompt() {
      if (programmaticFocusBlocked) {
        return false;
      }
      if (!promptEl || typeof promptEl.focus !== "function") {
        return false;
      }
      promptEl.focus({ preventScroll: true });
      shouldRestore = true;
      lastPromptInteractionAt = getNow();
      return true;
    }

    function notePromptInteraction() {
      shouldRestore = true;
      lastPromptInteractionAt = getNow();
    }

    function setProgrammaticFocusBlocked(blocked) {
      programmaticFocusBlocked = Boolean(blocked);
    }

    function captureIfPromptFocused({ allowedActiveElements: elements = [] } = {}) {
      shouldRestore = isPromptFocused(promptEl, documentRef);
      if (shouldRestore) {
        lastPromptInteractionAt = getNow();
      }
      allowedActiveElements.clear();
      addAllowedActiveElements(elements);
      return shouldRestore;
    }

    function restoreNow() {
      if (!canRestoreFromCurrentFocus()) {
        return false;
      }
      if (documentRef.activeElement === promptEl) {
        return true;
      }
      return focusPrompt();
    }

    function scheduleRestore({ allowedActiveElements: elements = [] } = {}) {
      addAllowedActiveElements(elements);
      if (!shouldRestore) {
        return false;
      }

      const setTimer = windowRef && typeof windowRef.setTimeout === "function"
        ? windowRef.setTimeout.bind(windowRef)
        : typeof setTimeout === "function"
          ? setTimeout
          : null;

      if (!setTimer) {
        return restoreNow();
      }

      restoreDelaysMs.forEach((delayMs) => {
        setTimer(() => {
          restoreNow();
        }, delayMs);
      });
      return true;
    }

    function restoreIfFocusMovedToIframe({ allowedActiveElements: elements = [] } = {}) {
      addAllowedActiveElements(elements);
      if (!documentRef || !hasRecentPromptInteraction()) {
        return false;
      }

      const activeElement = documentRef.activeElement;
      if (!isIframeElement(activeElement) && !allowedActiveElements.has(activeElement)) {
        return false;
      }

      shouldRestore = true;
      return scheduleRestore({ allowedActiveElements: elements });
    }

    return {
      captureIfPromptFocused,
      focusPrompt,
      notePromptInteraction,
      restoreNow,
      restoreIfFocusMovedToIframe,
      setProgrammaticFocusBlocked,
      scheduleRestore
    };
  }

  const api = {
    createPromptFocusGuard,
    isPromptFocused,
    setFrameFocusShielded
  };

  if (typeof globalThis !== "undefined") {
    globalThis.MultiAIDashboardFocus = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
