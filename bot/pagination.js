// * In-memory pagination store for scrims (and potentially other) commands.
//   Keeps lightweight ephemeral state; not persisted across restarts.

const EXPIRY_MS = 5 * 60 * 1000; // 5 minutes inactivity window

// Shape: key -> { username, userId, createdAt, updatedAt, pages: [ { matches, cursorNext? } ], currentPage }
const store = new Map();

function makeKey(messageId) {
  return messageId; // single dimension for now; could add guildId if collisions become a concern
}

export function initPagination(messageId, username, userId, firstPage) {
  const key = makeKey(messageId);
  store.set(key, {
    username,
    userId,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    pages: [firstPage],
    currentPage: 0
  });
}

export function appendPage(messageId, page) {
  const key = makeKey(messageId);
  const entry = store.get(key);
  if (!entry) return;
  entry.pages.push(page);
  entry.updatedAt = Date.now();
}

export function setCurrentPage(messageId, idx) {
  const entry = store.get(makeKey(messageId));
  if (!entry) return;
  if (idx < 0 || idx >= entry.pages.length) return;
  entry.currentPage = idx;
  entry.updatedAt = Date.now();
}

export function getEntry(messageId) {
  const entry = store.get(makeKey(messageId));
  if (!entry) return null;
  if (Date.now() - entry.updatedAt > EXPIRY_MS) {
    store.delete(makeKey(messageId));
    return null; // expired
  }
  return entry;
}

export function maybeExpire(messageId) {
  const key = makeKey(messageId);
  const entry = store.get(key);
  if (entry && Date.now() - entry.updatedAt > EXPIRY_MS) store.delete(key);
}

export function destroyPagination(messageId) {
  store.delete(makeKey(messageId));
}

export function buildDisabledState(entry) {
  if (!entry) return { prev: true, next: true };
  const { currentPage, pages } = entry;
  const isLast = currentPage === pages.length - 1;
  const lastHasMore = !!pages[pages.length - 1]?.cursorNext;
  return {
    prev: currentPage === 0,
    next: isLast ? !lastHasMore : false // only disable on last page without more data
  };
}
