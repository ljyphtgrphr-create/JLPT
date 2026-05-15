// dict.js — look up Japanese example sentences with furigana + Korean word hints
import { getExamples } from "./storage.js";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/**
 * Render sentence segments into TWO parallel HTML lines:
 *   line 1: Japanese with furigana (<ruby>) — for ex-jp display
 *   line 2: Korean word hints inline aligned to each segment — for ex-ko display
 *
 * Segment formats stored in IndexedDB:
 *   [text]                  — plain text, no annotation
 *   [text, reading]         — kanji with furigana reading
 *   [text, reading, ko]     — kanji with furigana + Korean meaning hint
 *   [text, "",      ko]     — text with Korean hint, no reading needed
 */
function renderSegments(segments, highlightWord) {
  if (!Array.isArray(segments)) return { jp: escapeHtml(String(segments)), ko: "" };

  let jpHtml = "";
  let koHtml = "";

  for (const seg of segments) {
    if (!Array.isArray(seg) || seg.length === 0) continue;
    const text = seg[0];
    const reading = seg[1] || "";
    const ko = seg[2] || "";
    const isHighlight = highlightWord && text === highlightWord;

    // Japanese line: ruby if has reading, else plain
    const openB = isHighlight ? "<b>" : "";
    const closeB = isHighlight ? "</b>" : "";
    if (reading) {
      jpHtml += `${openB}<ruby>${escapeHtml(text)}<rt>${escapeHtml(reading)}</rt></ruby>${closeB}`;
    } else {
      jpHtml += `${openB}${escapeHtml(text)}${closeB}`;
    }

    // Korean hint line: render small chips for each segment that has a Korean hint,
    // separated by visual gaps. Plain segments produce nothing.
    if (ko) {
      const cls = isHighlight ? "ko-chip ko-chip-hl" : "ko-chip";
      koHtml += `<span class="${cls}">${escapeHtml(ko)}</span>`;
    }
  }

  return { jp: jpHtml, ko: koHtml };
}

export async function lookupExamples(word) {
  const candidates = [];
  if (word.h) candidates.push(word.h);
  if (word.k) candidates.push(word.k);
  for (const orig of [...candidates]) {
    if (orig.includes("/")) {
      for (const p of orig.split("/")) {
        if (p && !candidates.includes(p)) candidates.push(p);
      }
    }
  }

  let pairs = [];
  for (const key of candidates) {
    if (pairs.length >= 3) break;
    const entry = await getExamples(key);
    if (!entry) continue;
    for (const p of entry.pairs) {
      if (pairs.length >= 3) break;
      const sig = JSON.stringify(p.jp);
      if (!pairs.find((x) => x._sig === sig)) {
        pairs.push({ ...p, _sig: sig, _matchedKey: key });
      }
    }
  }

  if (pairs.length === 0) {
    return { pairs: [], source: "예문 없음", empty: true };
  }

  pairs.sort((a, b) => {
    const lenA = Array.isArray(a.jp) ? a.jp.reduce((s, seg) => s + (seg[0]?.length || 0), 0) : 0;
    const lenB = Array.isArray(b.jp) ? b.jp.reduce((s, seg) => s + (seg[0]?.length || 0), 0) : 0;
    return lenA - lenB;
  });
  pairs = pairs.slice(0, 3);

  const formatted = pairs.map((p) => {
    const rendered = renderSegments(p.jp, p._matchedKey);
    return {
      jp: rendered.jp,
      ko: rendered.ko,
      en: escapeHtml(p.en || ""),
    };
  });

  return {
    pairs: formatted,
    source: "Tatoeba (CC BY 2.0 FR)",
  };
}
