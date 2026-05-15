// bootstrap.js — loads pre-indexed example sentences from examples.json
// File is already in { headword: [[jp, en], ...], ... } format, ready for direct storage.
import { bulkPutExamples, examplesCount, getMeta, setMeta } from "./storage.js";

const EXAMPLES_URL = "./examples.json";
const BOOT_FLAG = "boot.examples.done";

async function loadExamples(onProgress) {
  onProgress({ pct: 5, msg: "examples.json 다운로드 중" });
  let resp;
  try {
    resp = await fetch(EXAMPLES_URL, { cache: "no-store" });
  } catch (e) {
    throw new Error("examples.json fetch 실패: " + e.message);
  }
  if (!resp.ok) {
    if (resp.status === 404) {
      throw new Error(
        "examples.json 파일을 찾을 수 없습니다.\n" +
        "README의 안내대로 예문 파일을 같은 폴더에 업로드해 주세요."
      );
    }
    throw new Error("HTTP " + resp.status);
  }

  // Stream download with progress
  const total = parseInt(resp.headers.get("content-length") || "0", 10);
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    if (total > 0) {
      const pct = 5 + Math.round((received / total) * 50);
      onProgress({ pct, msg: `${(received / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB` });
    }
  }

  // Combine chunks
  let len = 0;
  for (const c of chunks) len += c.length;
  const buf = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.length; }

  onProgress({ pct: 60, msg: "JSON 파싱 중" });
  const text = new TextDecoder("utf-8").decode(buf);
  let data;
  try {
    data = JSON.parse(text);
  } catch (e) {
    throw new Error("JSON 파싱 실패: " + e.message);
  }

  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error("예문 파일 형식이 잘못되었습니다 (객체여야 함)");
  }

  const entries = Object.entries(data);
  onProgress({ pct: 65, msg: `${entries.length.toLocaleString()}개 단어 저장 중` });

  // Convert to records and bulk insert
  const arr = [];
  const now = Date.now();
  for (const [word, pairList] of entries) {
    // pairList is [[jp, en], ...]; convert to [{jp, en}, ...]
    const pairs = pairList.map(([jp, en]) => ({ jp, en }));
    arr.push({ word, pairs, fetchedAt: now });
  }

  const CHUNK = 2000;
  for (let i = 0; i < arr.length; i += CHUNK) {
    await bulkPutExamples(arr.slice(i, i + CHUNK));
    const pct = 65 + Math.round(((i + CHUNK) / arr.length) * 35);
    onProgress({
      pct: Math.min(100, pct),
      msg: `${Math.min(i + CHUNK, arr.length).toLocaleString()} / ${arr.length.toLocaleString()}`,
    });
  }

  await setMeta(BOOT_FLAG, true);
  return arr.length;
}

export async function isBootstrapped() {
  const flag = await getMeta(BOOT_FLAG);
  if (!flag) return false;
  const cnt = await examplesCount();
  return cnt > 0;
}

export async function examplesFileAvailable() {
  try {
    const resp = await fetch(EXAMPLES_URL, { method: "HEAD" });
    return resp.ok;
  } catch {
    return false;
  }
}

export async function bootstrap(onProgress) {
  if (await isBootstrapped()) {
    onProgress({ pct: 100, msg: "이미 캐시됨" });
    return;
  }
  await loadExamples(onProgress);
  onProgress({ pct: 100, msg: "완료" });
}

export async function reload(onProgress) {
  await setMeta(BOOT_FLAG, false);
  await bootstrap(onProgress);
}
