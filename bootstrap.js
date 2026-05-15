// bootstrap.js — downloads Japanese-English Tatoeba sentences via CORS proxy
import { bulkPutExamples, examplesCount, getMeta, setMeta } from "./storage.js";

// mwhirls/tatoeba-json release v0.0.52 (last stable, June 2024)
// GitHub releases assets don't support CORS, so we need a user-provided proxy.
const TATOEBA_RELEASE_URL =
  "https://github.com/mwhirls/tatoeba-json/releases/download/v0.0.52/sentences.json";

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
  onProgress({ pct: startPct, msg: "다운로드 시작" });
  const resp = await fetch(url, { cache: "no-store" });
  if (!resp.ok) throw new Error("HTTP " + resp.status);

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

async function downloadExamples(onProgress) {
  const proxy = await getMeta("tatoeba_proxy");
  if (!proxy || !proxy.trim()) {
    throw new Error(
      "예문 데이터 다운로드를 위해 CORS 프록시 URL이 필요합니다.\n" +
      "설정에서 Cloudflare Worker URL을 등록해 주세요 (README의 5분 가이드 참고)."
    );
  }
  // Proxy forwards to TATOEBA_RELEASE_URL. Pass target as query param ?u=...
  const proxyBase = proxy.trim().replace(/\/$/, "");
  const url = `${proxyBase}?u=${encodeURIComponent(TATOEBA_RELEASE_URL)}`;

  let buf;
  try {
    buf = await downloadStream(url, onProgress, 0, 55);
  } catch (e) {
    throw new Error(
      "예문 다운로드 실패: " + e.message + "\n" +
      "프록시 URL이 정확한지, Cloudflare Worker가 작동 중인지 확인해 주세요."
    );
  }

  onProgress({ pct: 58, msg: "JSON 파싱 중" });
  const text = new TextDecoder("utf-8").decode(buf);
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (e) {
    throw new Error("예문 JSON 파싱 실패: " + e.message);
  }
  if (!Array.isArray(raw)) {
    if (raw && Array.isArray(raw.sentences)) raw = raw.sentences;
    else throw new Error("예문 데이터 형식이 예상과 다릅니다");
  }

  onProgress({ pct: 62, msg: `${raw.length.toLocaleString()}개 문장 색인 중` });

  // Build index: headword/reading → [{jp, en}, ...]
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

export async function hasProxy() {
  const p = await getMeta("tatoeba_proxy");
  return !!(p && p.trim());
}

export async function bootstrap(onProgress) {
  if (await isBootstrapped()) {
    onProgress({ pct: 100, msg: "이미 캐시됨" });
    return;
  }
  await downloadExamples(onProgress);
  onProgress({ pct: 100, msg: "완료" });
}

export async function redownload(onProgress) {
  await setMeta(BOOT_FLAG, false);
  await bootstrap(onProgress);
}
