// dict.js — look up Japanese example sentences with furigana ruby rendering
import { getExamples } from "./storage.js";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

/**
 * Render a sentence's "segments" into HTML with furigana ruby annotations.
 * Each segment is either:
 *   [text]            — plain text, no ruby
 *   [text, reading]   — kanji with reading, render as <ruby>text<rt>reading</rt></ruby>
 *
 * Also highlights segments whose text matches the lookup word.
 */
function renderSegments(segments, highlightWord) {
  if (!Array.isArray(segments)) return escapeHtml(String(segments));
  let html = "";
  for (const seg of segments) {
    if (!Array.isArray(seg) || seg.length === 0) continue;
    const text = seg[0];
    const reading = seg[1];
    const isHighlight = highlightWord && text === highlightWord;
    const open = isHighlight ? "<b>" : "";
    const close = isHighlight ? "</b>" : "";
    if (reading) {
      // ruby annotation
      html += `${open}<ruby>${escapeHtml(text)}<rt>${escapeHtml(reading)}</rt></ruby>${close}`;
    } else {
      html += `${open}${escapeHtml(text)}${close}`;
    }
  }
  return html;
}

/**
 * Find example sentences for a word, trying both kanji and kana forms.
 * Each example sentence is stored as [segments, en] where segments is an array
 * of [text] or [text, reading] tuples.
 *
 * Returns { pairs: [{jp:html, en}, ...], source }
 */
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
  let highlightWord = candidates[0];

  for (const key of candidates) {
    if (pairs.length >= 3) break;
    const entry = await getExamples(key);
    if (!entry) continue;
    for (const p of entry.pairs) {
      if (pairs.length >= 3) break;
      // Avoid duplicates by checking the first segment's text or full pair
      const sigJp = JSON.stringify(p.jp);
      if (!pairs.find((x) => x._sig === sigJp)) {
        pairs.push({ ...p, _sig: sigJp, _matchedKey: key });
      }
    }
  }

  if (pairs.length === 0) {
    return { pairs: [], source: "예문 없음", empty: true };
  }

  // Sort: prefer pairs from kanji match first, then shorter sentences
  pairs.sort((a, b) => {
    // Compute total text length from segments
    const lenA = Array.isArray(a.jp) ? a.jp.reduce((s, seg) => s + (seg[0]?.length || 0), 0) : (a.jp || "").length;
    const lenB = Array.isArray(b.jp) ? b.jp.reduce((s, seg) => s + (seg[0]?.length || 0), 0) : (b.jp || "").length;
    return lenA - lenB;
  });
  pairs = pairs.slice(0, 3);

  // Format with furigana ruby + highlight
  const formatted = pairs.map((p) => ({
    jp: renderSegments(p.jp, p._matchedKey || highlightWord),
    en: escapeHtml(p.en || ""),
  }));

  return {
    pairs: formatted,
    source: "Tatoeba (CC BY 2.0 FR)",
  };
}
