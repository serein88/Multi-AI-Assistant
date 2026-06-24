"use strict";

/**
 * Session Model (ESM)
 *
 * Pure functions for creating and updating session records.
 */

import {
  SESSION_STATUS_ACTIVE,
  SESSION_MODE_FOREGROUND
} from "./session-constants.mjs";

function createEmptyChildSession(provider) {
  return {
    provider,
    tabId: null,
    url: "",
    title: "",
    lastActiveAt: null,
    recoverable: false
  };
}

export function createSessionRecord({ sessionId, providers, mode, now }) {
  return {
    sessionId,
    name: `Session ${now}`,
    windowId: null,
    status: SESSION_STATUS_ACTIVE,
    mode: mode || SESSION_MODE_FOREGROUND,
    createdAt: now,
    lastActiveAt: now,
    providers: providers.slice(),
    childSessions: providers.reduce((acc, provider) => {
      acc[provider] = createEmptyChildSession(provider);
      return acc;
    }, {})
  };
}

export function updateChildSessionRecord(session, provider, patch) {
  if (!Object.prototype.hasOwnProperty.call(session.childSessions, provider)) {
    throw new Error(`Unknown provider "${provider}"`);
  }
  return {
    ...session,
    lastActiveAt: patch.lastActiveAt ?? session.lastActiveAt,
    childSessions: {
      ...session.childSessions,
      [provider]: {
        ...session.childSessions[provider],
        ...patch,
        provider
      }
    }
  };
}
