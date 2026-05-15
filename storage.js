// storage.js — IndexedDB for wrong-answers, dict cache, examples, progress
const DB_NAME = "jpdb";
const DB_VER = 1;

let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VER);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("wrong")) {
        db.createObjectStore("wrong", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("examples")) {
        // key: headword (kanji or kana). value: { word, pairs: [{jp, en}, ...] }
        db.createObjectStore("examples", { keyPath: "word" });
      }
      if (!db.objectStoreNames.contains("progress")) {
        db.createObjectStore("progress", { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains("meta")) {
        db.createObjectStore("meta", { keyPath: "key" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx(store, mode = "readonly") {
  return open().then((db) => db.transaction(store, mode).objectStore(store));
}

function reqAsPromise(req) {
  return new Promise((res, rej) => {
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

// --- wrong answers ---
export async function getAllWrong() {
  const store = await tx("wrong");
  return reqAsPromise(store.getAll());
}
export async function bumpWrong(word) {
  const store = await tx("wrong", "readwrite");
  const existing = await reqAsPromise(store.get(word.id));
  const next = existing
    ? { ...existing, wrongCount: existing.wrongCount + 1, lastWrongAt: Date.now() }
    : {
        id: word.id, k: word.k, h: word.h, l: word.l, ko: word.ko,
        wrongCount: 1, lastWrongAt: Date.now(),
      };
  await reqAsPromise(store.put(next));
  return next;
}
export async function removeWrong(id) {
  const store = await tx("wrong", "readwrite");
  await reqAsPromise(store.delete(id));
}
export async function clearWrong() {
  const store = await tx("wrong", "readwrite");
  await reqAsPromise(store.clear());
}

// --- progress ---
export async function getProgress(id) {
  const store = await tx("progress");
  return reqAsPromise(store.get(id));
}
export async function getAllProgress() {
  const store = await tx("progress");
  return reqAsPromise(store.getAll());
}
export async function recordCorrect(wordId, hideAtStreak = 3) {
  const store = await tx("progress", "readwrite");
  const existing = await reqAsPromise(store.get(wordId));
  const next = existing
    ? {
        ...existing,
        correctStreak: existing.correctStreak + 1,
        totalCorrect: (existing.totalCorrect || 0) + 1,
        totalSeen: (existing.totalSeen || 0) + 1,
        lastSeenAt: Date.now(),
      }
    : {
        id: wordId, correctStreak: 1, totalCorrect: 1, totalSeen: 1,
        lastSeenAt: Date.now(), hidden: false,
      };
  if (next.correctStreak >= hideAtStreak) next.hidden = true;
  await reqAsPromise(store.put(next));
  return next;
}
export async function recordWrong(wordId) {
  const store = await tx("progress", "readwrite");
  const existing = await reqAsPromise(store.get(wordId));
  const next = existing
    ? {
        ...existing,
        correctStreak: 0,
        totalSeen: (existing.totalSeen || 0) + 1,
        lastSeenAt: Date.now(),
        hidden: false,
      }
    : {
        id: wordId, correctStreak: 0, totalCorrect: 0, totalSeen: 1,
        lastSeenAt: Date.now(), hidden: false,
      };
  await reqAsPromise(store.put(next));
  return next;
}
export async function unhideAll() {
  const all = await getAllProgress();
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction("progress", "readwrite");
    const s = t.objectStore("progress");
    for (const p of all) {
      if (p.hidden) s.put({ ...p, hidden: false, correctStreak: 0 });
    }
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
export async function clearProgress() {
  const store = await tx("progress", "readwrite");
  await reqAsPromise(store.clear());
}

// --- examples cache (Tatoeba JP-EN) ---
export async function getExamples(word) {
  const store = await tx("examples");
  return reqAsPromise(store.get(word));
}
export async function bulkPutExamples(entries) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction("examples", "readwrite");
    const s = t.objectStore("examples");
    for (const e of entries) s.put(e);
    t.oncomplete = () => resolve();
    t.onerror = () => reject(t.error);
  });
}
export async function examplesCount() {
  const store = await tx("examples");
  return reqAsPromise(store.count());
}
export async function clearExamples() {
  const store = await tx("examples", "readwrite");
  await reqAsPromise(store.clear());
}

// --- meta ---
export async function getMeta(key) {
  const store = await tx("meta");
  const r = await reqAsPromise(store.get(key));
  return r ? r.value : null;
}
export async function setMeta(key, value) {
  const store = await tx("meta", "readwrite");
  await reqAsPromise(store.put({ key, value }));
}

// --- session stats ---
export function bumpSessionStat(field) {
  const k = "jp.stats";
  const raw = localStorage.getItem(k);
  const obj = raw ? JSON.parse(raw) : { seen: 0, correct: 0, wrong: 0 };
  obj[field] = (obj[field] || 0) + 1;
  localStorage.setItem(k, JSON.stringify(obj));
  return obj;
}
export function getSessionStats() {
  const raw = localStorage.getItem("jp.stats");
  return raw ? JSON.parse(raw) : { seen: 0, correct: 0, wrong: 0 };
}
export function resetSessionStats() { localStorage.removeItem("jp.stats"); }

// --- settings ---
export async function getSelectedLevels() {
  const v = await getMeta("levels");
  return v || ["n5", "n4", "n3"];   // default: beginner range
}
export async function setSelectedLevels(levels) {
  await setMeta("levels", levels);
}
export async function getHideEnabled() {
  const v = await getMeta("hide_enabled");
  return v === null || v === undefined ? true : v;
}
export async function setHideEnabled(v) {
  await setMeta("hide_enabled", !!v);
}
