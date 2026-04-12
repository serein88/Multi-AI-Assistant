const test = require('node:test');
const assert = require('node:assert/strict');
const { createSessionRegistry } = require('../../session/session-registry.js');

function buildRegistry() {
  const store = {};
  const storage = {
    async get(key) {
      return { [key]: store[key] };
    },
    async set(payload) {
      Object.assign(store, payload);
    }
  };

  return createSessionRegistry({ storage });
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
  assert.equal(archived.status, 'archived');
  assert.equal(typeof archived.archivedAt, 'string');

  const stored = await registry.getSession('sess_archive');
  assert.equal(stored.status, 'archived');
  assert.equal(stored.archivedAt, archived.archivedAt);
});
