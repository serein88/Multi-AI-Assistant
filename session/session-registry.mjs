"use strict";

/**
 * Session Registry (ESM)
 *
 * Async CRUD for session records in chrome.storage.local.
 */

import {
  SESSION_STATUS_ARCHIVED,
  SESSION_STORAGE_KEY
} from "./session-constants.mjs";

export function createSessionRegistry({ storage }) {
  let pending = Promise.resolve();

  function enqueueWork(task) {
    const run = pending.then(() => task());
    pending = run.catch(() => {});
    return run;
  }

  async function loadAll() {
    const result = await storage.get(SESSION_STORAGE_KEY);
    const sessions = result?.[SESSION_STORAGE_KEY];
    return Array.isArray(sessions) ? sessions : [];
  }

  async function saveAll(sessions) {
    await storage.set({ [SESSION_STORAGE_KEY]: sessions });
  }

  async function persistSession(session) {
    return enqueueWork(async () => {
      const sessions = await loadAll();
      const next = sessions.filter((item) => item.sessionId !== session.sessionId);
      next.push(session);
      await saveAll(next);
      return session;
    });
  }

  async function updateSession(sessionId, updater) {
    if (!sessionId) {
      throw new Error("sessionId is required");
    }

    return enqueueWork(async () => {
      const sessions = await loadAll();
      const index = sessions.findIndex((item) => item.sessionId === sessionId);
      if (index === -1) {
        throw new Error(`Session not found: ${sessionId}`);
      }

      const existing = sessions[index];
      const patched = updater(existing);
      const merged = {
        ...existing,
        ...patched,
        sessionId: existing.sessionId
      };

      sessions[index] = merged;
      await saveAll(sessions);
      return merged;
    });
  }

  async function touchSession(sessionId, timestamp) {
    const lastActiveAt = timestamp ?? new Date().toISOString();
    return updateSession(sessionId, (session) => ({ ...session, lastActiveAt }));
  }

  async function archiveSession(sessionId, options = {}) {
    const archivedAt = options.archivedAt ?? new Date().toISOString();
    return updateSession(sessionId, (session) => ({
      ...session,
      status: SESSION_STATUS_ARCHIVED,
      archivedAt
    }));
  }

  async function getSession(sessionId) {
    const sessions = await loadAll();
    return sessions.find((item) => item.sessionId === sessionId);
  }

  return {
    async listSessions() {
      const sessions = await loadAll();
      return sessions
        .slice()
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
    },
    async saveSession(session) {
      return persistSession(session);
    },
    getSession,
    updateSession,
    touchSession,
    archiveSession
  };
}
