const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionRegistry } = require('../../session/session-registry.js');
const { SESSION_STATUS_ARCHIVED } = require('../../session/session-constants.js');

function createMemoryStorage() {
  const store = {};
  const storage = {
    async get(key) {
      return { [key]: store[key] };
    },
    async set(payload) {
      Object.assign(store, payload);
    }
  };

  return { store, storage };
}

function buildRegistry({ storage } = {}) {
  const memory = createMemoryStorage();
  return createSessionRegistry({ storage: storage ?? memory.storage });
}

function createSerialGuardStorage({ delay = 1 } = {}) {
  const store = {};
  let busy = false;

  const storage = {
    async get(key) {
      if (busy) {
        throw new Error('concurrent load detected');
      }
      busy = true;
      await new Promise((resolve) => setTimeout(resolve, delay));
      busy = false;

      const value = store[key];
      return { [key]: Array.isArray(value) ? value.slice() : value };
    },
    async set(payload) {
      Object.assign(store, payload);
    }
  };

  return { storage, store };
}

test('listSessions returns newest session first', async () => {
  const registry = buildRegistry();

  await registry.saveSession({ sessionId: 'sess_old', createdAt: '2026-04-12T10:00:00.000Z' });
  await registry.saveSession({ sessionId: 'sess_new', createdAt: '2026-04-12T11:00:00.000Z' });

  const sessions = await registry.listSessions();
  assert.deepEqual(sessions.map((item) => item.sessionId), ['sess_new', 'sess_old']);
});

test('getSession returns the requested session', async () => {
  const registry = buildRegistry();

  await registry.saveSession({ sessionId: 'sess_one', createdAt: '2026-04-12T10:00:00.000Z' });

  const session = await registry.getSession('sess_one');
  assert.equal(session.sessionId, 'sess_one');
});

test('updateSession patches the stored session via updater', async () => {
  const registry = buildRegistry();

  await registry.saveSession({ sessionId: 'sess_two', createdAt: '2026-04-12T10:00:00.000Z', name: 'initial' });

  const updated = await registry.updateSession('sess_two', (session) => ({ ...session, name: 'updated' }));
  assert.equal(updated.name, 'updated');

  const stored = await registry.getSession('sess_two');
  assert.equal(stored.name, 'updated');
});

test('touchSession updates lastActiveAt', async () => {
  const registry = buildRegistry();
  const touchedAt = '2026-04-12T12:00:00.000Z';

  await registry.saveSession({ sessionId: 'sess_touch', createdAt: '2026-04-12T10:00:00.000Z', lastActiveAt: '2026-04-12T10:00:00.000Z' });

  const touched = await registry.touchSession('sess_touch', touchedAt);
  assert.equal(touched.lastActiveAt, touchedAt);

  const stored = await registry.getSession('sess_touch');
  assert.equal(stored.lastActiveAt, touchedAt);
});

test('archiveSession marks session as archived with a timestamp', async () => {
  const registry = buildRegistry();

  await registry.saveSession({ sessionId: 'sess_archive', createdAt: '2026-04-12T10:00:00.000Z', status: 'active' });

  const archived = await registry.archiveSession('sess_archive');
  assert.equal(archived.status, SESSION_STATUS_ARCHIVED);
  assert.equal(typeof archived.archivedAt, 'string');

  const stored = await registry.getSession('sess_archive');
  assert.equal(stored.status, SESSION_STATUS_ARCHIVED);
  assert.equal(stored.archivedAt, archived.archivedAt);
});

test('concurrent updateSession calls are serialized to avoid lost updates', async () => {
  const guard = createSerialGuardStorage({ delay: 5 });
  const registry = createSessionRegistry({ storage: guard.storage });

  await registry.saveSession({
    sessionId: 'race',
    createdAt: '2026-04-12T10:00:00.000Z',
    value: 0
  });

  await Promise.all([
    registry.updateSession('race', (session) => ({ value: session.value + 1 })),
    registry.updateSession('race', (session) => ({ value: session.value + 2 }))
  ]);

  const final = await registry.getSession('race');
  assert.equal(final.value, 3);
});

test('updateSession rejects missing sessionId and derived helpers follow suit', async () => {
  const registry = buildRegistry();

  const missingIdError = /sessionId/i;
  await assert.rejects(
    () => registry.updateSession(undefined, () => ({ foo: 'bar' })),
    missingIdError
  );
  await assert.rejects(() => registry.touchSession(undefined), missingIdError);
  await assert.rejects(() => registry.archiveSession(undefined), missingIdError);
});

test('saveSession replaces existing session instead of duplicating', async () => {
  const registry = buildRegistry();

  await registry.saveSession({
    sessionId: 'dup',
    createdAt: '2026-04-12T10:00:00.000Z',
    name: 'first'
  });
  await registry.saveSession({
    sessionId: 'dup',
    createdAt: '2026-04-12T11:00:00.000Z',
    name: 'second'
  });

  const sessions = await registry.listSessions();
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0].name, 'second');
});
