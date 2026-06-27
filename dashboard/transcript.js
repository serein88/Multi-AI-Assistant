(() => {
  "use strict";

  // Access shared state from MultiAI namespace (created by dashboard.js before this script)
  function getState() {
    return globalThis.MultiAI || {};
  }

  // Localised string helper — delegates to the i18n module via shared state.
  function t(key) {
    var fn = getState().t;
    return fn ? fn.apply(null, arguments) : key;
  }

  // Transcript view mode state (module-local)
  let transcriptViewMode = localStorage.getItem("multi-ai-transcript-view") || "messages";
  let transcriptCollapsed = localStorage.getItem("multi-ai-transcript-collapsed") === "true";
  let transcriptRefreshTimeoutId = null;
  let transcriptPollIntervalId = null;
  let transcriptRequestSeq = 0;
  let transcriptProviderExpanded = new Set();

  // DOM element cache (rebuilt on ensureTranscriptScaffold)
  let _transcriptPanel = null;
  let _transcriptStatusList = null;
  let _transcriptTimeline = null;
  let _transcriptTimelineCount = null;
  let _transcriptProviderList = null;
  let _transcriptSessionMeta = null;
  let _transcriptUpdatedAt = null;
  let _transcriptRefreshBtn = null;
  let _transcriptViewModeBtn = null;
  let _transcriptDockBtn = null;
  let _workspaceLayoutEl = null;

  const TRANSCRIPT_POLL_INTERVAL_MS = 3000;

  function cacheDomRefs() {
    _transcriptPanel = document.getElementById("transcriptPanel");
    _transcriptStatusList = document.getElementById("transcriptStatusList");
    _transcriptTimeline = document.getElementById("transcriptTimeline");
    _transcriptTimelineCount = document.getElementById("transcriptTimelineCount");
    _transcriptProviderList = document.getElementById("transcriptProviderList");
    _transcriptSessionMeta = document.getElementById("transcriptSessionMeta");
    _transcriptUpdatedAt = document.getElementById("transcriptUpdatedAt");
    _transcriptRefreshBtn = document.getElementById("transcriptRefresh");
    _transcriptViewModeBtn = document.getElementById("transcriptViewMode");
    _transcriptDockBtn = document.getElementById("transcriptDock");
    _workspaceLayoutEl = document.getElementById("workspaceLayout");
  }

  // ── Transcript scaffold ──────────────────────────────────────────

  function ensureTranscriptScaffold() {
    const panelGrid = document.getElementById("panelGrid");
    if (!panelGrid) {
      return;
    }

    let workspace = document.getElementById("workspaceLayout");
    if (!workspace) {
      workspace = document.createElement("section");
      workspace.className = "workspace";
      workspace.id = "workspaceLayout";
      panelGrid.replaceWith(workspace);
      workspace.appendChild(panelGrid);
    }

    if (document.getElementById("transcriptPanel")) {
      cacheDomRefs();
      return;
    }

    const transcriptPanel = document.createElement("aside");
    transcriptPanel.className = "transcript-panel";
    transcriptPanel.id = "transcriptPanel";
    transcriptPanel.hidden = true;
    transcriptPanel.innerHTML = `
      <header class="transcript-panel-header">
        <div class="transcript-panel-heading">
          <h2 data-i18n="transcriptTitle"></h2>
          <p class="transcript-panel-meta" id="transcriptSessionMeta"></p>
        </div>
        <button id="transcriptRefresh" class="transcript-refresh-btn" type="button" data-i18n="transcriptRefresh"></button>
      </header>
      <div class="transcript-panel-body">
        <section class="transcript-section">
          <div class="transcript-section-header">
            <h3 data-i18n="transcriptStatusTitle"></h3>
            <span class="transcript-section-meta" id="transcriptUpdatedAt"></span>
          </div>
          <div class="transcript-status-list" id="transcriptStatusList"></div>
        </section>
        <section class="transcript-section">
          <div class="transcript-section-header">
            <h3 data-i18n="transcriptTimelineTitle"></h3>
            <div class="transcript-section-actions">
              <button id="transcriptViewMode" class="transcript-view-btn" type="button"></button>
              <span class="transcript-section-meta" id="transcriptTimelineCount"></span>
            </div>
          </div>
          <div class="transcript-feed" id="transcriptTimeline"></div>
        </section>
        <section class="transcript-section">
          <div class="transcript-section-header">
            <h3 data-i18n="transcriptRawTitle"></h3>
          </div>
          <div class="transcript-provider-list" id="transcriptProviderList"></div>
        </section>
      </div>
    `;
    workspace.appendChild(transcriptPanel);
    cacheDomRefs();
  }

  // ── Helper functions ─────────────────────────────────────────────

  function normalizeTranscriptViewMode(mode) {
    return mode === "dialogue" ? "dialogue" : "messages";
  }

  function getTranscriptViewModeLabel(mode) {
    var normalized = normalizeTranscriptViewMode(mode);
    return normalized === "dialogue" ? t("transcriptViewDialogue") : t("transcriptViewMessages");
  }

  function getTranscriptViewModeTitle(mode) {
    var normalized = normalizeTranscriptViewMode(mode);
    var next = normalized === "dialogue" ? "messages" : "dialogue";
    return next === "dialogue" ? t("transcriptViewToDialogue") : t("transcriptViewToMessages");
  }

  function updateTranscriptViewModeButton() {
    if (!_transcriptViewModeBtn) {
      return;
    }

    const normalized = normalizeTranscriptViewMode(transcriptViewMode);
    _transcriptViewModeBtn.dataset.mode = normalized;
    _transcriptViewModeBtn.textContent = getTranscriptViewModeLabel(normalized);
    _transcriptViewModeBtn.title = getTranscriptViewModeTitle(normalized);
  }

  function getRoleLabel(role) {
    return role === "assistant" ? t("roleAssistant") : t("roleUser");
  }

  function toProviderLabel(providerId) {
    return PROVIDER_BY_ID[providerId]?.label || providerId || "Unknown";
  }

  function getSessionProviderOrder(session) {
    const transcriptProviders = session?.transcript?.providers && typeof session.transcript.providers === "object"
      ? Object.keys(session.transcript.providers)
      : [];
    const providers = Array.isArray(session?.providers) ? session.providers : [];
    return Array.from(new Set([...providers, ...transcriptProviders]));
  }

  function formatTimestamp(value) {
    const state = getState();
    const currentLang = state.currentLang || "zh-CN";
    if (typeof value !== "string" || value.length === 0) {
      return t("timestampNone");
    }

    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return value;
    }

    return new Intl.DateTimeFormat(currentLang, {
      month: "numeric",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function formatRelativeTimestamp(value) {
    if (typeof value !== "string" || value.length === 0) {
      return t("timestampWaiting");
    }

    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp)) {
      return value;
    }

    const deltaMs = Date.now() - timestamp;
    const deltaMinutes = Math.floor(deltaMs / 60000);
    if (deltaMinutes < 1) {
      return t("timestampJustNow");
    }
    if (deltaMinutes < 60) {
      return t("timestampMinutesAgo", String(deltaMinutes));
    }
    const deltaHours = Math.floor(deltaMinutes / 60);
    if (deltaHours < 24) {
      return t("timestampHoursAgo", String(deltaHours));
    }
    const deltaDays = Math.floor(deltaHours / 24);
    if (deltaDays < 7) {
      return t("timestampDaysAgo", String(deltaDays));
    }
    return formatTimestamp(value);
  }

  function createTranscriptEmptyState(message) {
    const node = document.createElement("div");
    node.className = "transcript-empty";
    node.textContent = message;
    return node;
  }

  function createTranscriptDialogueLine(roleValue, textValue) {
    const line = document.createElement("div");
    line.className = "transcript-dialogue-line";
    line.dataset.role = roleValue;

    const lineMeta = document.createElement("div");
    lineMeta.className = "transcript-entry-meta";

    const role = document.createElement("span");
    role.className = "transcript-role-pill";
    role.dataset.role = roleValue;
    role.textContent = getRoleLabel(roleValue);
    lineMeta.appendChild(role);

    const text = document.createElement("div");
    text.className = "transcript-dialogue-text";
    text.textContent = textValue || "";

    line.appendChild(lineMeta);
    line.appendChild(text);
    return line;
  }

  function buildMergedTimelineEntries(timeline) {
    const ordered = Array.isArray(timeline)
      ? timeline
        .filter((entry) => entry && typeof entry === "object")
        .slice()
        .sort((left, right) => Date.parse(left.createdAt || 0) - Date.parse(right.createdAt || 0))
      : [];

    const merged = [];
    ordered.forEach((entry) => {
      const providerId = typeof entry.provider === "string" ? entry.provider : "";
      const lastEntry = merged.length > 0 ? merged[merged.length - 1] : null;
      if (
        lastEntry &&
        lastEntry.role === entry.role &&
        lastEntry.content === entry.content &&
        lastEntry.createdAt === entry.createdAt &&
        lastEntry.status === entry.status
      ) {
        if (providerId && !lastEntry.providers.includes(providerId)) {
          lastEntry.providers.push(providerId);
        }
        return;
      }

      merged.push({
        ...entry,
        providers: providerId ? [providerId] : []
      });
    });

    return merged.reverse();
  }

  function buildDialogueGroupsFromTurns(turns, providerId) {
    if (!Array.isArray(turns) || turns.length === 0) {
      return [];
    }

    const groups = [];
    let current = null;

    turns.forEach((turn) => {
      if (!turn || (turn.role !== "user" && turn.role !== "assistant")) {
        return;
      }

      const createdAt = typeof turn.createdAt === "string" ? turn.createdAt : "";
      if (turn.role === "user") {
        if (current) {
          groups.push(current);
        }
        current = {
          providerId,
          user: turn,
          assistants: [],
          sortAt: createdAt
        };
        return;
      }

      if (!current) {
        current = {
          providerId,
          user: null,
          assistants: [],
          sortAt: createdAt
        };
      }
      current.assistants.push(turn);
      if (createdAt) {
        current.sortAt = createdAt;
      }
    });

    if (current) {
      groups.push(current);
    }

    return groups;
  }

  function buildTranscriptDialogueGroups(session) {
    const providers = session?.transcript?.providers || {};
    const providerOrder = getSessionProviderOrder(session);
    const groups = [];

    providerOrder.forEach((providerId) => {
      const providerState = providers[providerId];
      if (!providerState) return;

      const rawTurns = Array.isArray(providerState.turns) ? providerState.turns : [];
      let visibleTurns = rawTurns;
      if (providerId === "gemini") {
        const firstUserIndex = rawTurns.findIndex((turn) => turn && turn.role === "user");
        visibleTurns = firstUserIndex === -1
          ? []
          : rawTurns.filter((turn, idx) => !(idx < firstUserIndex && turn?.role === "assistant"));
      }

      groups.push(...buildDialogueGroupsFromTurns(visibleTurns, providerId));
    });

    return groups
      .slice()
      .sort((left, right) => Date.parse(left.sortAt || 0) - Date.parse(right.sortAt || 0))
      .reverse();
  }

  function getProviderTurnCount(providerState) {
    return Array.isArray(providerState?.turns) ? providerState.turns.length : 0;
  }

  function getProviderFirstUserTimestampMs(providerState) {
    const turns = Array.isArray(providerState?.turns) ? providerState.turns : [];
    const firstUser = turns.find((turn) => turn && turn.role === "user" && typeof turn.createdAt === "string");
    const timestamp = firstUser?.createdAt ? Date.parse(firstUser.createdAt) : NaN;
    return Number.isFinite(timestamp) ? timestamp : null;
  }

  function shouldHideGeminiAssistantWelcome(session, entry) {
    if (!session?.transcript?.providers?.gemini || !entry) {
      return false;
    }

    const providers = Array.isArray(entry.providers) ? entry.providers : [];
    const isGeminiOnly = providers.length === 1 && providers[0] === "gemini";
    const providerId = typeof entry.provider === "string" ? entry.provider : "";
    const isGemini = isGeminiOnly || providerId === "gemini";
    if (!isGemini) {
      return false;
    }

    if (entry.role !== "assistant") {
      return false;
    }

    const firstUserMs = getProviderFirstUserTimestampMs(session.transcript.providers.gemini);
    if (firstUserMs === null) {
      return true;
    }

    const entryMs = typeof entry.createdAt === "string" ? Date.parse(entry.createdAt) : NaN;
    if (!Number.isFinite(entryMs)) {
      return false;
    }

    return entryMs < firstUserMs;
  }

  // ── Panel live status ────────────────────────────────────────────

  function setPanelLiveStatus(providerId, providerState) {
    const state = getState();
    const activePanels = state.activePanels || [];
    const panelByIndex = state.panelByIndex || new Map();
    const index = activePanels.indexOf(providerId);
    if (index < 0) {
      return;
    }

    const panel = panelByIndex.get(index);
    const statusEl = panel?.querySelector(".panel-live-status");
    if (!statusEl) {
      return;
    }

    const status = providerState?.status || "idle";
    statusEl.dataset.status = status;
    statusEl.textContent = getLocalizedStatusText(status, "short");
    const timeLabel = providerState?.lastStatusAt ? formatTimestamp(providerState.lastStatusAt) : "";
    statusEl.title = timeLabel
      ? `${getLocalizedStatusText(status, "long")} · ${timeLabel}`
      : getLocalizedStatusText(status, "long");
  }

  function getLocalizedStatusText(status, variant = "long") {
    var STATUS_KEYS = {
      idle:        { short: "statusIdleShort",        long: "statusIdleLong" },
      responding:  { short: "statusRespondingShort",  long: "statusRespondingLong" },
      completed:   { short: "statusCompletedShort",   long: "statusCompletedLong" },
      failed:      { short: "statusFailedShort",      long: "statusFailedLong" },
      interrupted: { short: "statusInterruptedShort", long: "statusInterruptedLong" }
    };
    var entry = STATUS_KEYS[status] || STATUS_KEYS.idle;
    return t(entry[variant] || entry.long);
  }

  function syncPanelLiveStatuses() {
    const state = getState();
    const currentSessionRecord = state.currentSessionRecord || null;
    const providers = currentSessionRecord?.transcript?.providers || {};
    const activePanels = state.activePanels || [];
    activePanels.forEach((providerId) => {
      setPanelLiveStatus(providerId, providers[providerId]);
    });
  }

  // ── Transcript rendering ─────────────────────────────────────────

  function renderTranscriptStatusList(session) {
    if (!_transcriptStatusList) {
      return;
    }

    _transcriptStatusList.innerHTML = "";
    const providers = session?.transcript?.providers || {};
    const providerOrder = getSessionProviderOrder(session);
    if (providerOrder.length === 0) {
      _transcriptStatusList.appendChild(createTranscriptEmptyState(
        t("transcriptEmptyProviders")
      ));
      return;
    }

    providerOrder.forEach((providerId) => {
      const providerState = providers[providerId] || { status: "idle", turns: [] };
      const row = document.createElement("article");
      row.className = "transcript-status-card";

      const top = document.createElement("div");
      top.className = "transcript-status-top";

      const name = document.createElement("strong");
      name.textContent = toProviderLabel(providerId);

      const pill = document.createElement("span");
      pill.className = "transcript-status-pill";
      pill.dataset.status = providerState.status || "idle";
      pill.textContent = getLocalizedStatusText(providerState.status || "idle", "long");

      top.appendChild(name);
      top.appendChild(pill);

      const meta = document.createElement("div");
      meta.className = "transcript-status-meta";
      const detailParts = [];
      if (providerState.answerStartedAt) {
        detailParts.push(t("statusStarted", formatTimestamp(providerState.answerStartedAt)));
      }
      if (providerState.answerCompletedAt) {
        detailParts.push(t("statusEnded", formatTimestamp(providerState.answerCompletedAt)));
      }
      if (providerState.lastStatusAt) {
        detailParts.push(t("statusUpdatedAt", formatRelativeTimestamp(providerState.lastStatusAt)));
      }
      detailParts.push(t("transcriptTurnCount", String(getProviderTurnCount(providerState))));
      meta.textContent = detailParts.join(" · ");

      row.appendChild(top);
      row.appendChild(meta);
      _transcriptStatusList.appendChild(row);
    });
  }

  function renderTranscriptTimeline(session) {
    if (!_transcriptTimeline || !_transcriptTimelineCount) {
      return;
    }

    _transcriptTimeline.innerHTML = "";
    if (normalizeTranscriptViewMode(transcriptViewMode) === "dialogue") {
      const groups = buildTranscriptDialogueGroups(session);
      _transcriptTimelineCount.textContent = t("transcriptTurnCount", String(groups.length));

      if (groups.length === 0) {
        _transcriptTimeline.appendChild(createTranscriptEmptyState(
          t("transcriptEmptyTimeline")
        ));
        return;
      }

      groups.forEach((group) => {
        const item = document.createElement("article");
        item.className = "transcript-entry transcript-dialogue-entry";

        const meta = document.createElement("div");
        meta.className = "transcript-entry-meta";

        const providerChip = document.createElement("span");
        providerChip.className = "transcript-provider-chip";
        providerChip.textContent = toProviderLabel(group.providerId);

        const time = document.createElement("time");
        time.className = "transcript-entry-time";
        time.dateTime = group.sortAt || "";
        time.textContent = formatTimestamp(group.sortAt);

        meta.appendChild(providerChip);
        meta.appendChild(time);

        const body = document.createElement("div");
        body.className = "transcript-dialogue-body";

        if (group.user?.content) {
          body.appendChild(createTranscriptDialogueLine("user", group.user.content));
        }
        if (Array.isArray(group.assistants) && group.assistants.length > 0) {
          group.assistants.forEach((turn) => {
            if (turn?.content) {
              body.appendChild(createTranscriptDialogueLine("assistant", turn.content));
            }
          });
        }

        item.appendChild(meta);
        item.appendChild(body);
        _transcriptTimeline.appendChild(item);
      });
      return;
    }

    const mergedTimeline = buildMergedTimelineEntries(session?.transcript?.timeline)
      .filter((entry) => !shouldHideGeminiAssistantWelcome(session, entry));
    _transcriptTimelineCount.textContent = t("transcriptTurnCount", String(mergedTimeline.length));

    if (mergedTimeline.length === 0) {
      _transcriptTimeline.appendChild(createTranscriptEmptyState(
        t("transcriptEmptyTimeline")
      ));
      return;
    }

    mergedTimeline.forEach((entry) => {
      const item = document.createElement("article");
      item.className = "transcript-entry";

      const meta = document.createElement("div");
      meta.className = "transcript-entry-meta";

      const providers = document.createElement("span");
      providers.className = "transcript-provider-chip";
      providers.textContent = entry.providers.length > 1
        ? entry.providers.map(toProviderLabel).join(", ")
        : toProviderLabel(entry.providers[0] || entry.provider);

      const role = document.createElement("span");
      role.className = "transcript-role-pill";
      role.dataset.role = entry.role || "user";
      role.textContent = getRoleLabel(entry.role);

      const time = document.createElement("time");
      time.className = "transcript-entry-time";
      time.dateTime = entry.createdAt || "";
      time.textContent = formatTimestamp(entry.createdAt);

      meta.appendChild(providers);
      meta.appendChild(role);
      meta.appendChild(time);

      const content = document.createElement("div");
      content.className = "transcript-entry-content";
      content.textContent = entry.content || "";

      item.appendChild(meta);
      item.appendChild(content);
      _transcriptTimeline.appendChild(item);
    });
  }

  function renderTranscriptProviderList(session) {
    if (!_transcriptProviderList) {
      return;
    }

    _transcriptProviderList.innerHTML = "";
    const providers = session?.transcript?.providers || {};
    const providerOrder = getSessionProviderOrder(session);
    if (providerOrder.length === 0) {
      _transcriptProviderList.appendChild(createTranscriptEmptyState(
        t("transcriptEmptyRaw")
      ));
      return;
    }

    providerOrder.forEach((providerId, index) => {
      const providerState = providers[providerId] || { turns: [], status: "idle" };
      const rawTurns = Array.isArray(providerState.turns) ? providerState.turns : [];
      let visibleTurns = rawTurns;
      if (providerId === "gemini") {
        const firstUserIndex = rawTurns.findIndex((turn) => turn && turn.role === "user");
        visibleTurns = firstUserIndex === -1
          ? []
          : rawTurns.filter((turn, idx) => !(idx < firstUserIndex && turn?.role === "assistant"));
      }
      const isDialogueView = normalizeTranscriptViewMode(transcriptViewMode) === "dialogue";
      const dialogueGroups = isDialogueView
        ? buildDialogueGroupsFromTurns(visibleTurns, providerId)
        : [];
      const details = document.createElement("details");
      details.className = "transcript-provider-card";
      const shouldDefaultOpen = transcriptProviderExpanded.size === 0 && index === 0;
      details.open = transcriptProviderExpanded.has(providerId) || shouldDefaultOpen;
      if (details.open) {
        transcriptProviderExpanded.add(providerId);
      }
      details.addEventListener("toggle", () => {
        if (details.open) {
          transcriptProviderExpanded.add(providerId);
        } else {
          transcriptProviderExpanded.delete(providerId);
        }
      });

      const summary = document.createElement("summary");
      summary.className = "transcript-provider-summary";

      const summaryTitle = document.createElement("div");
      summaryTitle.className = "transcript-provider-summary-title";

      const name = document.createElement("strong");
      name.textContent = toProviderLabel(providerId);

      const count = document.createElement("span");
      count.className = "transcript-provider-count";
      const visibleTurnCount = isDialogueView ? dialogueGroups.length : visibleTurns.length;
      count.textContent = t("transcriptTurnCount", String(visibleTurnCount));

      summaryTitle.appendChild(name);
      summaryTitle.appendChild(count);

      const summaryStatus = document.createElement("span");
      summaryStatus.className = "transcript-status-pill";
      summaryStatus.dataset.status = providerState.status || "idle";
      summaryStatus.textContent = getLocalizedStatusText(providerState.status || "idle", "long");

      summary.appendChild(summaryTitle);
      summary.appendChild(summaryStatus);
      details.appendChild(summary);

      const body = document.createElement("div");
      body.className = "transcript-provider-body";
      if (isDialogueView) {
        const groups = dialogueGroups.length > 0 ? dialogueGroups.slice().reverse() : [];
        if (groups.length === 0) {
          body.appendChild(createTranscriptEmptyState(
            t("transcriptEmptyTurns")
          ));
        } else {
          groups.forEach((group) => {
            const item = document.createElement("article");
            item.className = "transcript-turn transcript-dialogue-entry";

            const meta = document.createElement("div");
            meta.className = "transcript-entry-meta";

            const time = document.createElement("time");
            time.className = "transcript-entry-time";
            time.dateTime = group.sortAt || "";
            time.textContent = formatTimestamp(group.sortAt);
            meta.appendChild(time);

            const content = document.createElement("div");
            content.className = "transcript-dialogue-body";

            if (group.user?.content) {
              content.appendChild(createTranscriptDialogueLine("user", group.user.content));
            }
            if (Array.isArray(group.assistants) && group.assistants.length > 0) {
              group.assistants.forEach((turn) => {
                if (turn?.content) {
                  content.appendChild(createTranscriptDialogueLine("assistant", turn.content));
                }
              });
            }

            item.appendChild(meta);
            item.appendChild(content);
            body.appendChild(item);
          });
        }
      } else {
        const turns = visibleTurns.length > 0 ? visibleTurns.slice().reverse() : [];
        if (turns.length === 0) {
          body.appendChild(createTranscriptEmptyState(
            t("transcriptEmptyTurns")
          ));
        } else {
          turns.forEach((turn) => {
            const item = document.createElement("article");
            item.className = "transcript-turn";

            const meta = document.createElement("div");
            meta.className = "transcript-entry-meta";

            const role = document.createElement("span");
            role.className = "transcript-role-pill";
            role.dataset.role = turn.role || "user";
            role.textContent = getRoleLabel(turn.role);

            const time = document.createElement("time");
            time.className = "transcript-entry-time";
            time.dateTime = turn.createdAt || "";
            time.textContent = formatTimestamp(turn.createdAt);

            meta.appendChild(role);
            meta.appendChild(time);

            const content = document.createElement("div");
            content.className = "transcript-entry-content";
            content.textContent = turn.content || "";

            item.appendChild(meta);
            item.appendChild(content);
            body.appendChild(item);
          });
        }
      }

      details.appendChild(body);
      _transcriptProviderList.appendChild(details);
    });
  }

  function renderTranscriptPanel() {
    const state = getState();
    const currentSessionId = state.currentSessionId || "";
    const currentSessionRecord = state.currentSessionRecord || null;

    if (!_transcriptPanel) {
      return;
    }

    if (!currentSessionId) {
      _transcriptPanel.hidden = true;
      return;
    }

    _transcriptPanel.hidden = false;
    updateTranscriptViewModeButton();
    if (_transcriptSessionMeta) {
      _transcriptSessionMeta.textContent = t("transcriptSessionMeta", currentSessionId);
    }

    if (!currentSessionRecord?.transcript) {
      if (_transcriptUpdatedAt) {
        _transcriptUpdatedAt.textContent = t("transcriptWaitingData");
      }
      if (_transcriptTimelineCount) {
        _transcriptTimelineCount.textContent = "";
      }
      if (_transcriptStatusList) {
        _transcriptStatusList.innerHTML = "";
        _transcriptStatusList.appendChild(createTranscriptEmptyState(
          t("transcriptNotLoaded")
        ));
      }
      if (_transcriptTimeline) {
        _transcriptTimeline.innerHTML = "";
        _transcriptTimeline.appendChild(createTranscriptEmptyState(
          t("transcriptTimelineNotLoaded")
        ));
      }
      if (_transcriptProviderList) {
        _transcriptProviderList.innerHTML = "";
        _transcriptProviderList.appendChild(createTranscriptEmptyState(
          t("transcriptRawNotLoaded")
        ));
      }
      return;
    }

    if (_transcriptUpdatedAt) {
      _transcriptUpdatedAt.textContent = t("statusUpdatedAt", formatRelativeTimestamp(currentSessionRecord.transcript.updatedAt));
    }

    renderTranscriptStatusList(currentSessionRecord);
    renderTranscriptTimeline(currentSessionRecord);
    renderTranscriptProviderList(currentSessionRecord);
    syncPanelLiveStatuses();
  }

  // ── Transcript refresh & polling ─────────────────────────────────

  function scheduleTranscriptRefresh(delay = 0) {
    const state = getState();
    const currentSessionId = state.currentSessionId || "";
    if (!currentSessionId) {
      return;
    }

    if (transcriptRefreshTimeoutId) {
      clearTimeout(transcriptRefreshTimeoutId);
    }
    transcriptRefreshTimeoutId = window.setTimeout(() => {
      transcriptRefreshTimeoutId = null;
      refreshSessionTranscript({ silent: true }).catch((err) => console.warn("[MultiAI Dashboard] scheduleTranscriptRefresh:", err));
    }, delay);
  }

  async function refreshSessionTranscript({ silent = false } = {}) {
    const state = getState();
    const currentSessionId = state.currentSessionId || "";

    if (!currentSessionId) {
      renderTranscriptPanel();
      return null;
    }

    const requestId = ++transcriptRequestSeq;
    try {
      const response = await chrome.runtime.sendMessage({
        type: "session:get",
        sessionId: currentSessionId
      });

      if (requestId !== transcriptRequestSeq) {
        return null;
      }

      if (!response || !response.ok) {
        throw new Error(response?.error || "session-get-failed");
      }

      // Update shared state
      state.currentSessionRecord = response.result || null;
      renderTranscriptPanel();
      return state.currentSessionRecord;
    } catch (error) {
      if (state.log) {
        state.log("Failed to refresh session transcript", error);
      }
      if (!silent && state.showMessage) {
        state.showMessage(t("transcriptLoadFailed"), "warning");
      }
      return null;
    }
  }

  function startTranscriptPolling() {
    const state = getState();
    const currentSessionId = state.currentSessionId || "";
    if (!currentSessionId) {
      renderTranscriptPanel();
      return;
    }

    if (transcriptPollIntervalId) {
      clearInterval(transcriptPollIntervalId);
    }

    scheduleTranscriptRefresh(0);
    transcriptPollIntervalId = window.setInterval(() => {
      if (!document.hidden) {
        scheduleTranscriptRefresh(0);
      }
    }, TRANSCRIPT_POLL_INTERVAL_MS);
  }

  // ── Transcript dock & view mode ──────────────────────────────────

  function applyTranscriptCollapsed(collapsed) {
    transcriptCollapsed = collapsed;
    localStorage.setItem("multi-ai-transcript-collapsed", collapsed ? "true" : "false");
    if (!_workspaceLayoutEl) _workspaceLayoutEl = document.getElementById("workspaceLayout");
    const workspace = _workspaceLayoutEl;
    if (workspace) {
      workspace.classList.toggle("transcript-collapsed", collapsed);
    }
    if (_transcriptDockBtn) {
      _transcriptDockBtn.textContent = collapsed
        ? t("transcriptDockLabel").replace("▶", "◀")
        : t("transcriptDockLabel");
    }
  }

  function initTranscriptDock() {
    cacheDomRefs();
    if (_transcriptDockBtn) {
      _transcriptDockBtn.addEventListener("click", () => {
        applyTranscriptCollapsed(!transcriptCollapsed);
      });
    }
    applyTranscriptCollapsed(transcriptCollapsed);

    transcriptViewMode = normalizeTranscriptViewMode(transcriptViewMode);
    updateTranscriptViewModeButton();
    if (_transcriptViewModeBtn) {
      _transcriptViewModeBtn.addEventListener("click", () => {
        transcriptViewMode = transcriptViewMode === "dialogue" ? "messages" : "dialogue";
        localStorage.setItem("multi-ai-transcript-view", transcriptViewMode);
        updateTranscriptViewModeButton();
        renderTranscriptPanel();
      });
    }

    if (_transcriptRefreshBtn) {
      _transcriptRefreshBtn.addEventListener("click", () => {
        refreshSessionTranscript().catch((err) => console.warn("[MultiAI Dashboard] transcriptRefreshBtn:", err));
      });
    }
  }

  function cleanupTranscript() {
    if (transcriptPollIntervalId) {
      clearInterval(transcriptPollIntervalId);
    }
    if (transcriptRefreshTimeoutId) {
      clearTimeout(transcriptRefreshTimeoutId);
    }
  }

  // ── Export API ───────────────────────────────────────────────────

  const api = {
    ensureTranscriptScaffold,
    renderTranscriptPanel,
    scheduleTranscriptRefresh,
    refreshSessionTranscript,
    startTranscriptPolling,
    applyTranscriptCollapsed,
    initTranscriptDock,
    cleanupTranscript,
    // Helpers used by dashboard.js
    setPanelLiveStatus,
    syncPanelLiveStatuses,
    getLocalizedStatusText,
    formatTimestamp,
    formatRelativeTimestamp,
    toProviderLabel,
    normalizeTranscriptViewMode
  };

  if (typeof globalThis !== "undefined") {
    globalThis.MultiAITranscript = api;
  }
})();
