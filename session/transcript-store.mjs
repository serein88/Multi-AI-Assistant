"use strict";

/**
 * Transcript Store (ESM)
 *
 * Transcript data management: turn creation, deduplication, status tracking.
 */

const TRANSCRIPT_VERSION = 1;
const TRANSCRIPT_STATUS_IDLE = "idle";
const TRANSCRIPT_TURN_ROLE_USER = "user";
const TRANSCRIPT_TURN_ROLE_ASSISTANT = "assistant";
const TRANSCRIPT_TURN_STATUS_COMPLETED = "completed";
const TURN_DEDUPE_WINDOW_MS = 15000;
const TURN_MERGE_WINDOW_MS = 120000;
const LIVE_STATUS_SET = new Set([
  "idle",
  "responding",
  "completed",
  "failed",
  "interrupted"
]);

export { TRANSCRIPT_VERSION, TRANSCRIPT_STATUS_IDLE };

export function createEmptyTranscriptProvider(provider) {
  return {
    provider,
    turns: [],
    status: TRANSCRIPT_STATUS_IDLE,
    lastStatusAt: null,
    statusUpdatedAt: null,
    answerStartedAt: null,
    answerCompletedAt: null,
    lastActiveAt: null
  };
}

export function normalizeLiveStatus(status) {
  if (typeof status !== "string" || status.length === 0) {
    return TRANSCRIPT_STATUS_IDLE;
  }
  return LIVE_STATUS_SET.has(status) ? status : TRANSCRIPT_STATUS_IDLE;
}

export function normalizeTranscriptProvider(provider, existing) {
  const current = existing && typeof existing === "object" ? existing : {};
  return {
    ...current,
    provider,
    turns: Array.isArray(current.turns) ? current.turns : [],
    status: normalizeLiveStatus(current.status),
    lastStatusAt: current.lastStatusAt ?? current.statusUpdatedAt ?? null,
    statusUpdatedAt: current.statusUpdatedAt ?? null,
    answerStartedAt: current.answerStartedAt ?? null,
    answerCompletedAt: current.answerCompletedAt ?? null,
    lastActiveAt: current.lastActiveAt ?? null
  };
}

function isTranscriptProviderNormalized(provider, existing) {
  if (!existing || typeof existing !== "object") {
    return false;
  }

  if (existing.provider !== provider) {
    return false;
  }
  if (!Array.isArray(existing.turns)) {
    return false;
  }
  if (typeof existing.status !== "string" || existing.status.length === 0) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(existing, "lastStatusAt")) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(existing, "statusUpdatedAt")) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(existing, "answerStartedAt")) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(existing, "answerCompletedAt")) {
    return false;
  }
  if (!Object.prototype.hasOwnProperty.call(existing, "lastActiveAt")) {
    return false;
  }

  return true;
}

export function createTranscriptStore({ providers, now }) {
  const safeProviders = Array.isArray(providers) ? providers : [];
  const createdAt = typeof now === "string" && now ? now : new Date().toISOString();
  return {
    version: TRANSCRIPT_VERSION,
    createdAt,
    updatedAt: createdAt,
    timeline: [],
    providers: safeProviders.reduce((acc, provider) => {
      acc[provider] = createEmptyTranscriptProvider(provider);
      return acc;
    }, {})
  };
}

export function ensureSessionTranscript(session, now) {
  if (!session) {
    return session;
  }

  const providers = Array.isArray(session.providers)
    ? session.providers
    : Object.keys(session.childSessions || {});
  const timestamp = typeof now === "string" && now
    ? now
    : (session.lastActiveAt || session.createdAt || new Date().toISOString());

  const current = session.transcript && typeof session.transcript === "object"
    ? session.transcript
    : null;

  if (!current) {
    return {
      ...session,
      transcript: createTranscriptStore({ providers, now: timestamp })
    };
  }

  let changed = false;
  const currentProviders = current.providers && typeof current.providers === "object"
    ? current.providers
    : {};
  const normalizedProviders = {};
  const providerIds = Array.from(new Set([
    ...Object.keys(currentProviders),
    ...providers
  ]));

  for (const provider of providerIds) {
    const existing = currentProviders[provider];
    normalizedProviders[provider] = normalizeTranscriptProvider(provider, existing);
    if (!isTranscriptProviderNormalized(provider, existing)) {
      changed = true;
    }
  }

  const timeline = Array.isArray(current.timeline) ? current.timeline : [];
  if (!Array.isArray(current.timeline)) {
    changed = true;
  }

  if (typeof current.version !== "number") {
    changed = true;
  }
  if (typeof current.createdAt !== "string" || current.createdAt.length === 0) {
    changed = true;
  }
  if (typeof current.updatedAt !== "string" || current.updatedAt.length === 0) {
    changed = true;
  }
  if (Object.keys(currentProviders).length !== Object.keys(normalizedProviders).length) {
    changed = true;
  }

  const normalized = {
    ...current,
    version: typeof current.version === "number" ? current.version : TRANSCRIPT_VERSION,
    createdAt: current.createdAt || timestamp,
    updatedAt: changed ? timestamp : current.updatedAt,
    timeline,
    providers: normalizedProviders
  };

  if (!changed) {
    return session;
  }

  return {
    ...session,
    transcript: normalized
  };
}

export function applyProviderLiveStatus(session, { provider, status, occurredAt } = {}) {
  if (!session || typeof provider !== "string" || provider.length === 0) {
    return session;
  }

  const timestamp =
    typeof occurredAt === "string" && occurredAt
      ? occurredAt
      : new Date().toISOString();
  const nextStatus = normalizeLiveStatus(status);
  const ensured = ensureSessionTranscript(session, timestamp);
  const currentTranscript = ensured?.transcript;
  if (!currentTranscript || typeof currentTranscript !== "object") {
    return ensured;
  }

  const currentProviders =
    currentTranscript.providers && typeof currentTranscript.providers === "object"
      ? currentTranscript.providers
      : {};
  const currentProvider = normalizeTranscriptProvider(provider, currentProviders[provider]);
  const nextProvider = {
    ...currentProvider,
    status: nextStatus,
    lastStatusAt: timestamp,
    statusUpdatedAt: timestamp,
    lastActiveAt: timestamp
  };

  if (nextStatus === "responding") {
    nextProvider.answerStartedAt = timestamp;
    nextProvider.answerCompletedAt = null;
  } else if (
    nextStatus === "completed" ||
    nextStatus === "failed" ||
    nextStatus === "interrupted"
  ) {
    nextProvider.answerCompletedAt = timestamp;
  }

  const unchanged =
    currentProvider.status === nextProvider.status &&
    currentProvider.statusUpdatedAt === nextProvider.statusUpdatedAt &&
    currentProvider.answerStartedAt === nextProvider.answerStartedAt &&
    currentProvider.answerCompletedAt === nextProvider.answerCompletedAt &&
    currentProvider.lastActiveAt === nextProvider.lastActiveAt;
  if (unchanged) {
    return ensured;
  }

  const nextTranscript = {
    ...currentTranscript,
    updatedAt: timestamp,
    providers: {
      ...currentProviders,
      [provider]: nextProvider
    }
  };

  return {
    ...ensured,
    transcript: nextTranscript
  };
}

export function appendUserTurn(session, { providers, prompt, occurredAt } = {}) {
  if (!session || !Array.isArray(providers) || providers.length === 0) {
    return session;
  }

  const content = typeof prompt === "string" ? prompt.trim() : "";
  if (!content) {
    return session;
  }

  const providerIds = Array.from(new Set(
    providers.filter((provider) => typeof provider === "string" && provider.length > 0)
  ));
  if (providerIds.length === 0) {
    return session;
  }

  const timestamp =
    typeof occurredAt === "string" && occurredAt
      ? occurredAt
      : new Date().toISOString();
  const ensured = ensureSessionTranscript(session, timestamp);
  const currentTranscript = ensured?.transcript;
  if (!currentTranscript || typeof currentTranscript !== "object") {
    return ensured;
  }

  const currentProviders =
    currentTranscript.providers && typeof currentTranscript.providers === "object"
      ? currentTranscript.providers
      : {};
  const currentTimeline = Array.isArray(currentTranscript.timeline)
    ? currentTranscript.timeline
    : [];
  const nextProviders = {
    ...currentProviders
  };
  const nextTimeline = currentTimeline.slice();
  let changed = false;

  for (const provider of providerIds) {
    const currentProvider = normalizeTranscriptProvider(provider, currentProviders[provider]);
    nextProviders[provider] = {
      ...currentProvider,
      turns: [
        ...currentProvider.turns,
        {
          role: TRANSCRIPT_TURN_ROLE_USER,
          content,
          createdAt: timestamp,
          status: TRANSCRIPT_TURN_STATUS_COMPLETED
        }
      ],
      lastActiveAt: timestamp
    };
    nextTimeline.push({
      provider,
      role: TRANSCRIPT_TURN_ROLE_USER,
      content,
      createdAt: timestamp,
      status: TRANSCRIPT_TURN_STATUS_COMPLETED
    });
    changed = true;
  }

  if (!changed) {
    return ensured;
  }

  return {
    ...ensured,
    lastActiveAt: timestamp,
    transcript: {
      ...currentTranscript,
      updatedAt: timestamp,
      timeline: nextTimeline,
      providers: nextProviders
    }
  };
}

function normalizeTurnRole(role) {
  if (role === TRANSCRIPT_TURN_ROLE_USER || role === TRANSCRIPT_TURN_ROLE_ASSISTANT) {
    return role;
  }
  return "";
}

function toTimestampMs(value) {
  if (typeof value !== "string" || value.length === 0) {
    return null;
  }
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function isSameTurnContent(left, right) {
  return left.trim() === right.trim();
}

function isLikelyDuplicateTurn(lastTurn, nextRole, nextContent, nextCreatedAt) {
  if (!lastTurn || lastTurn.role !== nextRole) {
    return false;
  }

  const lastContent = typeof lastTurn.content === "string" ? lastTurn.content : "";
  if (!isSameTurnContent(lastContent, nextContent)) {
    return false;
  }

  const lastMs = toTimestampMs(lastTurn.createdAt);
  const nextMs = toTimestampMs(nextCreatedAt);
  if (lastMs !== null && nextMs !== null) {
    return Math.abs(nextMs - lastMs) <= TURN_DEDUPE_WINDOW_MS;
  }
  return lastTurn.createdAt === nextCreatedAt;
}

function isConsecutiveDuplicateTurn(lastTurn, nextRole, nextContent) {
  if (!lastTurn || lastTurn.role !== nextRole) {
    return false;
  }

  const lastContent = typeof lastTurn.content === "string" ? lastTurn.content : "";
  return isSameTurnContent(lastContent, nextContent);
}

function shouldIgnoreEchoedAssistantTurn(provider, lastTurn, nextRole, nextContent, nextCreatedAt) {
  if (
    provider !== "grok" ||
    nextRole !== TRANSCRIPT_TURN_ROLE_ASSISTANT ||
    !lastTurn ||
    lastTurn.role !== TRANSCRIPT_TURN_ROLE_USER
  ) {
    return false;
  }

  const lastContent = typeof lastTurn.content === "string" ? lastTurn.content : "";
  if (!isSameTurnContent(lastContent, nextContent)) {
    return false;
  }

  const lastMs = toTimestampMs(lastTurn.createdAt);
  const nextMs = toTimestampMs(nextCreatedAt);
  if (lastMs !== null && nextMs !== null) {
    return Math.abs(nextMs - lastMs) <= TURN_MERGE_WINDOW_MS;
  }

  return false;
}

function findRecentTurn(turns, matcher, nextCreatedAt, windowMs = TURN_DEDUPE_WINDOW_MS) {
  if (!Array.isArray(turns) || turns.length === 0 || typeof matcher !== "function") {
    return null;
  }

  const nextMs = toTimestampMs(nextCreatedAt);
  for (let index = turns.length - 1; index >= 0; index -= 1) {
    const turn = turns[index];
    if (!turn) {
      continue;
    }

    if (nextMs !== null) {
      const turnMs = toTimestampMs(turn.createdAt);
      if (turnMs !== null && Math.abs(nextMs - turnMs) > windowMs) {
        if (turnMs < nextMs) {
          break;
        }
        continue;
      }
    }

    if (matcher(turn)) {
      return turn;
    }
  }

  return null;
}

function hasRecentAssistantDuplicate(provider, turns, nextRole, nextContent, nextCreatedAt) {
  if (provider !== "grok" || nextRole !== TRANSCRIPT_TURN_ROLE_ASSISTANT) {
    return false;
  }

  return Boolean(findRecentTurn(
    turns,
    (turn) => turn.role === nextRole && isSameTurnContent(turn.content || "", nextContent),
    nextCreatedAt
  ));
}

function shouldIgnoreRecentUserEcho(provider, turns, nextRole, nextContent, nextCreatedAt) {
  if (provider !== "grok" || nextRole !== TRANSCRIPT_TURN_ROLE_ASSISTANT) {
    return false;
  }

  return Boolean(findRecentTurn(
    turns,
    (turn) => turn.role === TRANSCRIPT_TURN_ROLE_USER && isSameTurnContent(turn.content || "", nextContent),
    nextCreatedAt,
    TURN_MERGE_WINDOW_MS
  ));
}

function shouldMergeTurnContent(lastTurn, nextRole, nextContent, nextCreatedAt) {
  if (!lastTurn || nextRole !== TRANSCRIPT_TURN_ROLE_ASSISTANT || lastTurn.role !== nextRole) {
    return false;
  }

  const lastContent = typeof lastTurn.content === "string" ? lastTurn.content.trim() : "";
  if (!lastContent || isSameTurnContent(lastContent, nextContent)) {
    return false;
  }

  const lastMs = toTimestampMs(lastTurn.createdAt);
  const nextMs = toTimestampMs(nextCreatedAt);
  if (lastMs !== null && nextMs !== null && Math.abs(nextMs - lastMs) > TURN_MERGE_WINDOW_MS) {
    return false;
  }

  const normalizedNext = nextContent.trim();
  return normalizedNext.startsWith(lastContent) || lastContent.startsWith(normalizedNext);
}

export function appendProviderTurn(session, { provider, role, content, occurredAt } = {}) {
  if (!session || typeof provider !== "string" || provider.length === 0) {
    return session;
  }

  const normalizedRole = normalizeTurnRole(role);
  if (!normalizedRole) {
    return session;
  }

  const normalizedContent = typeof content === "string" ? content.trim() : "";
  if (!normalizedContent) {
    return session;
  }

  const timestamp =
    typeof occurredAt === "string" && occurredAt
      ? occurredAt
      : new Date().toISOString();
  const ensured = ensureSessionTranscript(session, timestamp);
  const currentTranscript = ensured?.transcript;
  if (!currentTranscript || typeof currentTranscript !== "object") {
    return ensured;
  }

  const currentProviders =
    currentTranscript.providers && typeof currentTranscript.providers === "object"
      ? currentTranscript.providers
      : {};
  const currentTimeline = Array.isArray(currentTranscript.timeline)
    ? currentTranscript.timeline
    : [];
  const currentProvider = normalizeTranscriptProvider(provider, currentProviders[provider]);
  const currentTurns = Array.isArray(currentProvider.turns) ? currentProvider.turns : [];
  const lastTurn = currentTurns.length > 0 ? currentTurns[currentTurns.length - 1] : null;

  if (isConsecutiveDuplicateTurn(lastTurn, normalizedRole, normalizedContent)) {
    return ensured;
  }

  if (
    shouldIgnoreEchoedAssistantTurn(provider, lastTurn, normalizedRole, normalizedContent, timestamp) ||
    shouldIgnoreRecentUserEcho(provider, currentTurns, normalizedRole, normalizedContent, timestamp) ||
    hasRecentAssistantDuplicate(provider, currentTurns, normalizedRole, normalizedContent, timestamp)
  ) {
    return ensured;
  }

  if (isLikelyDuplicateTurn(lastTurn, normalizedRole, normalizedContent, timestamp)) {
    return ensured;
  }

  let nextTurns;
  let nextTimeline;
  if (shouldMergeTurnContent(lastTurn, normalizedRole, normalizedContent, timestamp)) {
    const lastContent = typeof lastTurn.content === "string" ? lastTurn.content.trim() : "";
    const mergedContent = normalizedContent.length >= lastContent.length
      ? normalizedContent
      : lastContent;
    if (mergedContent === lastContent) {
      return ensured;
    }
    nextTurns = [
      ...currentTurns.slice(0, -1),
      {
        ...lastTurn,
        content: mergedContent
      }
    ];
    const timelineIndex = currentTimeline.findLastIndex((entry) => (
      entry &&
      entry.provider === provider &&
      entry.role === normalizedRole &&
      entry.createdAt === lastTurn.createdAt
    ));

    if (timelineIndex >= 0) {
      nextTimeline = currentTimeline.slice();
      nextTimeline[timelineIndex] = {
        ...nextTimeline[timelineIndex],
        content: mergedContent
      };
    } else {
      nextTimeline = [
        ...currentTimeline,
        {
          provider,
          role: normalizedRole,
          content: mergedContent,
          createdAt: lastTurn.createdAt || timestamp,
          status: TRANSCRIPT_TURN_STATUS_COMPLETED
        }
      ];
    }
  } else {
    nextTurns = [
      ...currentTurns,
      {
        role: normalizedRole,
        content: normalizedContent,
        createdAt: timestamp,
        status: TRANSCRIPT_TURN_STATUS_COMPLETED
      }
    ];
    nextTimeline = [
      ...currentTimeline,
      {
        provider,
        role: normalizedRole,
        content: normalizedContent,
        createdAt: timestamp,
        status: TRANSCRIPT_TURN_STATUS_COMPLETED
      }
    ];
  }

  return {
    ...ensured,
    lastActiveAt: timestamp,
    transcript: {
      ...currentTranscript,
      updatedAt: timestamp,
      timeline: nextTimeline,
      providers: {
        ...currentProviders,
        [provider]: {
          ...currentProvider,
          turns: nextTurns,
          lastActiveAt: timestamp
        }
      }
    }
  };
}

export function applyTranscriptStatus(session, { provider, status, timestamp } = {}) {
  return applyProviderLiveStatus(session, {
    provider,
    status,
    occurredAt: timestamp
  });
}
