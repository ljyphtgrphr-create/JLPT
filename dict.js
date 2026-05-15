// dict.js — look up Japanese example sentences from local IndexedDB index
import { getExamples } from "./storage.js";

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

function highlightJp(jp, word) {
  if (!jp || !word) return escapeHtml(jp || "");
  const safe = escapeHtml(jp);
  try {
    // Escape regex specials in the headword (rare in Japanese but safe)
    const w = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = new RegExp(w, "g");
    return safe.replace(re, "<b>$&</b>");
  } catch {
    return safe;
  }
}

/**
 * Find example sentences for a word, trying both kanji and kana forms.
 * Returns { pairs: [{jp:html, en}, ...], source } or { pairs: [], source: "..." }
 */
export async function lookupExamples(word) {
  // word object: { k (kana), h (kanji or empty), ko, ... }
  const candidates = [];
  if (word.h) candidates.push(word.h);
  if (word.k) candidates.push(word.k);
  // for compound or alternates like "わるくち/わるぐち", split on /
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
      if (!pairs.find((x) => x.jp === p.jp)) pairs.push(p);
    }
  }

  if (pairs.length === 0) {
    return { pairs: [], source: "예문 없음", empty: true };
  }

  // Sort shorter first for readability
  pairs.sort((a, b) => a.jp.length - b.jp.length);
  pairs = pairs.slice(0, 3);

  // Highlight the word that we used to find these (prefer kanji match)
  const highlightTarget = candidates[0];
  const formatted = pairs.map((p) => ({
    jp: highlightJp(p.jp, highlightTarget),
    en: escapeHtml(p.en || ""),
  }));

  return {
    pairs: formatted,
    source: "Tatoeba (CC BY 2.0 FR)",
  };
}
