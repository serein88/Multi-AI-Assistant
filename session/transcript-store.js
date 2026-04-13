(() => {
  const TRANSCRIPT_VERSION = 1;
  const TRANSCRIPT_STATUS_IDLE = "idle";

  function createEmptyTranscriptProvider(provider) {
    return {
      provider,
      turns: [],
      status: TRANSCRIPT_STATUS_IDLE,
      answerStartedAt: null,
      answerCompletedAt: null,
      lastActiveAt: null
    };
  }

  function normalizeTranscriptProvider(provider, existing) {
    const current = existing && typeof existing === "object" ? existing : {};
    return {
      ...current,
      provider,
      turns: Array.isArray(current.turns) ? current.turns : [],
      status: typeof current.status === "string" && current.status ? current.status : TRANSCRIPT_STATUS_IDLE,
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

  function createTranscriptStore({ providers, now }) {
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

  function ensureSessionTranscript(session, now) {
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

  const api = {
    TRANSCRIPT_VERSION,
    TRANSCRIPT_STATUS_IDLE,
    createEmptyTranscriptProvider,
    normalizeTranscriptProvider,
    ensureSessionTranscript,
    createTranscriptStore
  };

  if (typeof globalThis !== "undefined") {
    globalThis.MultiAISessionTranscriptStore = api;
  }

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }
})();
