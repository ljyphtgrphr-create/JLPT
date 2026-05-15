// bootstrap.js — loads example sentences from local examples.json (same folder)
// No external download. User uploads examples.json next to index.html.
import { bulkPutExamples, examplesCount, getMeta, setMeta } from "./storage.js";

const EXAMPLES_URL = "./examples.json";  // same folder as index.html
const BOOT_FLAG = "boot.examples.done";

function concatUint8(chunks) {
  let len = 0;
  for (const c of chunks) len += c.length;
  const out = new Uint8Array(len);
  let off = 0;
  for (const c of chunks) { out.set(c, off); off += c.length; }
  return out;
}

async function downloadStream(url, onProgress, startPct, endPct) {
  onProgress({ pct: startPct, msg: "파일 읽는 중" });
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) {
    if (resp.status === 404) {
      throw new Error(
        "examples.json 파일을 찾을 수 없습니다.\n" +
        "README의 안내대로 jpn-eng-examples.zip을 받아서 압축을 풀고, " +
        "안의 JSON 파일을 examples.json으로 이름 바꿔서 같은 폴더에 올려주세요."
      );
    }
    throw new Error("HTTP " + resp.status);
  }
  const total = parseInt(resp.headers.get("content-length") || "0", 10);
  const reader = resp.body.getReader();
  const chunks = [];
  let received = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    received += value.length;
    const pctInRange = total > 0 ? received / total : 0.3;
    const pct = Math.round(startPct + (endPct - startPct) * pctInRange);
    if (total > 0) {
      onProgress({ pct, msg: `${(received / 1024 / 1024).toFixed(1)} / ${(total / 1024 / 1024).toFixed(1)} MB` });
    } else {
      onProgress({ pct, msg: `${(received / 1024 / 1024).toFixed(1)} MB` });
    }
  }
  return concatUint8(chunks);
}

async function loadExamples(onProgress) {
  let buf;
  try {
    buf = await downloadStream(EXAMPLES_URL, onProgress, 0, 55);
  } catch (e) {
    throw e;
  }

  onProgress({ pct: 58, msg: "JSON 파싱 중" });
  const text = new TextDecoder("utf-8").decode(buf);
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error("examples.json 파싱 실패: " + e.message);
  }
  if (!Array.isArray(raw)) {
    if (raw && Array.isArray(raw.sentences)) raw = raw.sentences;
    else throw new Error("예문 데이터 형식이 예상과 다릅니다");
  }

  onProgress({ pct: 62, msg: `${raw.length.toLocaleString()}개 문장 색인 중` });

  const MAX_PER_KEY = 6;
  const MAX_LEN = 80;
  const index = new Map();

  let processed = 0;
  for (const entry of raw) {
    processed++;
    if (processed % 50000 === 0) {
      onProgress({
        pct: 62 + Math.round((processed / raw.length) * 18),
        msg: `색인 ${processed.toLocaleString()} / ${raw.length.toLocaleString()}`,
      });
      await new Promise((r) => setTimeout(r, 0));
    }
    const jp = entry.japanese || entry.jp;
    const en = entry.english || entry.en;
    if (!jp || !en) continue;
    if (jp.length > MAX_LEN) continue;
    const words = entry.words || [];
    if (!Array.isArray(words) || words.length === 0) continue;

    const pair = { jp, en };
    const seenKeys = new Set();
    for (const w of words) {
      const headword = w.headword || w.h;
      const reading = w.reading || w.r;
      const surface = w.surfaceForm || w.s;
      for (const k of [headword, reading, surface]) {
        if (!k || seenKeys.has(k)) continue;
        seenKeys.add(k);
        let bucket = index.get(k);
        if (!bucket) {
          bucket = [];
          index.set(k, bucket);
        }
        if (bucket.length < MAX_PER_KEY) bucket.push(pair);
      }
    }
  }

  onProgress({ pct: 84, msg: `${index.size.toLocaleString()}개 키 저장 중` });

  const arr = [];
  for (const [word, pairs] of index.entries()) {
    arr.push({ word, pairs, fetchedAt: Date.now() });
  }
  const CHUNK = 3000;
  for (let i = 0; i < arr.length; i += CHUNK) {
    await bulkPutExamples(arr.slice(i, i + CHUNK));
    const pct = 84 + Math.round(((i + CHUNK) / arr.length) * 16);
    onProgress({
      pct: Math.min(100, pct),
      msg: `저장 ${Math.min(i + CHUNK, arr.length).toLocaleString()} / ${arr.length.toLocaleString()}`,
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

// Check if examples.json exists on the server, with a HEAD request
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
