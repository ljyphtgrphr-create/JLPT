// app.js — JP quiz app main controller
import {
  getAllWrong, bumpWrong, removeWrong, clearWrong,
  bumpSessionStat, getSessionStats, resetSessionStats,
  getSelectedLevels, setSelectedLevels,
  getMeta, setMeta,
  recordCorrect, recordWrong, getAllProgress,
  unhideAll, clearProgress,
  getHideEnabled, setHideEnabled,
} from "./storage.js";
import { lookupExamples } from "./dict.js";
import { isBootstrapped, hasProxy, bootstrap, redownload } from "./bootstrap.js";

const appEl = document.getElementById("app");

const HIDE_AT_STREAK = 3;
let WORDS = [];

const LEVELS = [
  { code: "n5", name: "N5" },
  { code: "n4", name: "N4" },
  { code: "n3", name: "N3" },
  { code: "n2", name: "N2" },
  { code: "n1", name: "N1" },
];

let state = {
  tab: "quiz",
  mode: "all",
  selectedLevels: ["n5", "n4", "n3"],
  hideEnabled: true,
  current: null,
  choices: [],
  answered: false,
  selectedIdx: -1,
  exData: null,
  exLoading: false,
  _wrongMap: new Map(),
  _progressMap: new Map(),
};

// ---- helpers ----
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function flash(msg) {
  const el = document.createElement("div");
  el.className = "flash";
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 1900);
}
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function levelName(code) {
  const l = LEVELS.find((x) => x.code === code);
  return l ? l.name : code;
}

function poolByLevels() {
  if (state.selectedLevels.length === 0) return [];
  const set = new Set(state.selectedLevels);
  return WORDS.filter((w) => {
    if (!set.has(w.l)) return false;
    if (state.hideEnabled) {
      const p = state._progressMap.get(w.id);
      if (p && p.hidden) return false;
    }
    return true;
  });
}

async function pickNext() {
  let pool;
  if (state.mode === "wrong-only") {
    const wrong = await getAllWrong();
    if (wrong.length === 0) { state.current = null; return; }
    const byId = new Map(WORDS.map((w) => [w.id, w]));
    const weighted = [];
    for (const w of wrong) {
      const full = byId.get(w.id) || w;
      if (state.selectedLevels.length > 0 && !state.selectedLevels.includes(full.l)) continue;
      const wt = Math.max(1, w.wrongCount);
      for (let i = 0; i < wt; i++) weighted.push(full);
    }
    pool = weighted;
  } else {
    pool = poolByLevels();
  }

  if (pool.length === 0) { state.current = null; return; }
  const picked = pool[Math.floor(Math.random() * pool.length)];

  // 4 distractors: prefer same level so meanings feel comparable
  const sameLevel = WORDS.filter((w) => w.l === picked.l && w.id !== picked.id);
  const distractorSource = sameLevel.length >= 20 ? sameLevel : WORDS;
  const distractors = shuffle(distractorSource.filter((w) => w.id !== picked.id)).slice(0, 4);

  state.current = picked;
  state.choices = shuffle([picked, ...distractors]);
  state.answered = false;
  state.selectedIdx = -1;
  state.exData = null;
  state.exLoading = false;
}

async function onSelect(idx) {
  if (state.answered) return;
  state.answered = true;
  state.selectedIdx = idx;
  const chosen = state.choices[idx];
  const target = state.current;
  const correct = chosen.id === target.id;
  bumpSessionStat("seen");
  if (correct) {
    bumpSessionStat("correct");
    const p = await recordCorrect(target.id, HIDE_AT_STREAK);
    state._progressMap.set(target.id, p);
    if (p.hidden) flash(`正解 — ${HIDE_AT_STREAK}회 연속! 숨김 처리`);
    else flash(`正解 (${p.correctStreak}/${HIDE_AT_STREAK})`);
  } else {
    bumpSessionStat("wrong");
    await bumpWrong(target);
    const p = await recordWrong(target.id);
    state._progressMap.set(target.id, p);
    flash("오답 — 오답노트에 저장됨");
  }
  render();
  loadReveal();
}

async function loadReveal() {
  const wId = state.current?.id;
  if (!wId) return;
  state.exLoading = true;
  render();
  try {
    const ex = await lookupExamples(state.current);
    if (state.current?.id !== wId) return;
    state.exData = ex;
  } catch (e) {
    if (state.current?.id !== wId) return;
    state.exData = { pairs: [], source: "예문 조회 실패", empty: true };
  }
  state.exLoading = false;
  render();
}

async function nextQuestion() {
  await pickNext();
  render();
}

// ---- rendering ----

function renderHeader() {
  const stats = getSessionStats();
  return `
    <header class="hdr">
      <div class="hdr-title">単語 <span class="seal">JLPT</span></div>
      <div class="hdr-meta">${stats.correct}/${stats.seen}</div>
    </header>
  `;
}

async function renderTabs() {
  const wrong = await getAllWrong();
  return `
    <nav class="tabs">
      <button class="tab ${state.tab === "quiz" ? "active" : ""}" data-tab="quiz">학습</button>
      <button class="tab ${state.tab === "progress" ? "active" : ""}" data-tab="progress">진도</button>
      <button class="tab ${state.tab === "wrong" ? "active" : ""}" data-tab="wrong">
        오답<span class="count">${wrong.length}</span>
      </button>
      <button class="tab ${state.tab === "settings" ? "active" : ""}" data-tab="settings">설정</button>
    </nav>
  `;
}

function renderStreakDots(streak, total = HIDE_AT_STREAK) {
  let html = '<span class="streak-indicator">';
  for (let i = 0; i < total; i++) {
    html += `<span class="streak-dot ${i < streak ? "on" : ""}"></span>`;
  }
  html += '</span>';
  return html;
}

function renderQuizCard() {
  if (!state.current) {
    const reason = state.mode === "wrong-only"
      ? "선택한 급수의 오답이 없습니다."
      : (state.selectedLevels.length === 0
          ? "급수를 하나 이상 선택해 주세요."
          : (state.hideEnabled
              ? "선택한 급수의 모든 단어를 익혔습니다 🎉<br><small style='font-size:13px'>설정에서 '숨김 모드'를 끄면 다시 출제됩니다.</small>"
              : "단어 데이터가 비어 있습니다."));
    return `<div class="empty"><span class="em">·</span>${reason}</div>`;
  }

  const w = state.current;
  const wrongRecord = state._wrongMap?.get(w.id);
  const progress = state._progressMap.get(w.id);
  const streak = progress?.correctStreak || 0;

  const choicesHtml = state.choices.map((c, i) => {
    const isCorrect = c.id === w.id;
    const isPicked = state.selectedIdx === i;
    let cls = "choice";
    if (state.answered) {
      if (isCorrect) cls += " correct";
      else if (isPicked) cls += " wrong";
      else cls += " dim";
    }
    const letter = String.fromCharCode(65 + i);
    return `
      <button class="${cls}" data-choice="${i}" ${state.answered ? "disabled" : ""}>
        <span class="letter">${letter}</span>${escapeHtml(c.ko)}
      </button>`;
  }).join("");

  const revealHtml = state.answered ? renderReveal(w) : "";

  // Display logic: if word has kanji, show kanji big + kana on top (after reveal).
  // If kana-only, show kana big.
  const displayMain = w.h || w.k;
  const isKanaOnly = !w.h;
  const showKana = state.answered && w.h && w.k && w.h !== w.k;

  return `
    <div class="card">
      <div class="eyebrow">
        <span class="seq">№ ${String(w.id).padStart(5, "0")}</span>
        <span class="lvl">${levelName(w.l)}</span>
      </div>
      <div class="word-kana ${showKana ? "visible" : ""}">${escapeHtml(showKana ? w.k : "")}</div>
      <h1 class="word ${isKanaOnly ? "kana-only" : ""}">${escapeHtml(displayMain)}</h1>
      <div class="word-meta">
        ${renderStreakDots(streak)}
        ${wrongRecord ? `<span class="wrong-badge">오답 ${wrongRecord.wrongCount}회</span>` : ""}
      </div>
      <div class="choices">${choicesHtml}</div>
      ${revealHtml}
    </div>
  `;
}

function renderReveal(w) {
  const ex = state.exData;

  let exHtml = "";
  if (state.exLoading) {
    exHtml = `
      <div class="reveal-section">
        <div class="reveal-label">예문 · 例文</div>
        <div class="loading-line">예문 찾는 중</div>
      </div>`;
  } else if (ex && !ex.empty && ex.pairs.length > 0) {
    const items = ex.pairs.map((p) => `
      <li>
        <div class="ex-jp">${p.jp}</div>
        <div class="ex-en">${p.en}</div>
      </li>`).join("");
    exHtml = `
      <div class="reveal-section">
        <div class="reveal-label">
          <span>예문 · 例文</span>
          <span class="src">Tatoeba · CC BY 2.0 FR</span>
        </div>
        <ul class="examples">${items}</ul>
      </div>`;
  } else if (ex) {
    exHtml = `
      <div class="reveal-section">
        <div class="reveal-label">예문 · 例文</div>
        <div class="reveal-ko muted" style="font-size:13px;">${escapeHtml(ex.source || "예문을 찾지 못했습니다")}</div>
      </div>`;
  }

  return `
    <div class="reveal">
      <div class="reveal-section">
        <div class="reveal-label">뜻 · 意味</div>
        <div class="reveal-ko">${escapeHtml(w.ko)}</div>
      </div>
      ${exHtml}
    </div>
  `;
}

function renderActions() {
  const showNext = state.answered;
  return `
    <div class="actions">
      <div class="actions-inner">
        <button class="btn ghost" id="skip-btn">${state.answered ? "건너뛰기" : "넘기기"}</button>
        <button class="btn primary" id="next-btn" ${!state.current ? "disabled" : ""}>
          ${showNext ? "다음 단어 →" : "패스 →"}
        </button>
      </div>
    </div>
  `;
}

async function renderQuizTab() {
  const wrong = await getAllWrong();
  state._wrongMap = new Map(wrong.map((w) => [w.id, w]));
  const allProgress = await getAllProgress();
  state._progressMap = new Map(allProgress.map((p) => [p.id, p]));

  // Count per level (remaining = total - hidden)
  const totalByLevel = {};
  const remainByLevel = {};
  for (const w of WORDS) {
    totalByLevel[w.l] = (totalByLevel[w.l] || 0) + 1;
    if (state.hideEnabled) {
      const p = state._progressMap.get(w.id);
      if (p && p.hidden) continue;
    }
    remainByLevel[w.l] = (remainByLevel[w.l] || 0) + 1;
  }

  const levelChips = LEVELS.map((l) => {
    const on = state.selectedLevels.includes(l.code);
    const remain = remainByLevel[l.code] || 0;
    return `<button class="level-chip ${on ? "on" : ""}" data-level="${l.code}">
      ${l.name}<span class="lvl-cnt">${remain}</span>
    </button>`;
  }).join("");

  const modeRow = `
    <div class="mode-row">
      <button class="mode-chip ${state.mode === "all" ? "on" : ""}" data-mode="all">전체</button>
      <button class="mode-chip ${state.mode === "wrong-only" ? "on" : ""}" data-mode="wrong-only">오답만</button>
    </div>
  `;
  const levelRow = `<div class="level-row">${levelChips}</div>`;

  return modeRow + levelRow + renderQuizCard() + renderActions();
}

async function renderProgressTab() {
  const allProgress = await getAllProgress();
  const progById = new Map(allProgress.map((p) => [p.id, p]));

  const byLevel = {};
  for (const l of LEVELS) byLevel[l.code] = { total: 0, mastered: 0 };
  for (const w of WORDS) {
    const slot = byLevel[w.l];
    if (!slot) continue;
    slot.total += 1;
    const p = progById.get(w.id);
    if (p && (p.hidden || p.correctStreak >= HIDE_AT_STREAK)) slot.mastered += 1;
  }

  let totalSel = 0, masteredSel = 0;
  for (const code of state.selectedLevels) {
    const s = byLevel[code];
    if (!s) continue;
    totalSel += s.total;
    masteredSel += s.mastered;
  }
  const overallPct = totalSel === 0 ? 0 : Math.round((masteredSel / totalSel) * 100);

  let total = 0, mastered = 0;
  for (const l of LEVELS) { total += byLevel[l.code].total; mastered += byLevel[l.code].mastered; }

  const statsBlock = `
    <div class="stats-grid">
      <div class="stat">
        <div class="stat-val">${overallPct}%</div>
        <div class="stat-lbl">선택 급수</div>
      </div>
      <div class="stat">
        <div class="stat-val">${masteredSel}</div>
        <div class="stat-lbl">익힌 단어</div>
      </div>
      <div class="stat">
        <div class="stat-val">${totalSel.toLocaleString()}</div>
        <div class="stat-lbl">선택 범위</div>
      </div>
    </div>
  `;

  const rows = LEVELS.map((l) => {
    const slot = byLevel[l.code];
    const pct = slot.total === 0 ? 0 : Math.round((slot.mastered / slot.total) * 100);
    const isMastered = slot.mastered === slot.total && slot.total > 0;
    return `
      <div class="progress-row">
        <span class="progress-label">${l.name}</span>
        <div class="progress-bar">
          <div class="progress-bar-fill ${isMastered ? "mastered" : ""}" style="width:${pct}%;"></div>
        </div>
        <span class="progress-stats">${slot.mastered}/${slot.total}</span>
        <span class="progress-pct">${pct}%</span>
      </div>
    `;
  }).join("");

  const helper = `
    <div class="settings-section" style="margin-top: 20px;">
      <h3 style="font-size:14px;">진도 계산 방식</h3>
      <p style="font-size: 12px;">
        한 단어를 ${HIDE_AT_STREAK}회 연속으로 맞히면 '익힌 단어'로 분류되고 출제 풀에서 자동 제외됩니다.
        오답이 나오면 streak가 0으로 리셋되고 다시 출제 대상이 돼요.<br><br>
        숨김 모드를 끄고 싶으면 설정 탭으로.
      </p>
    </div>
  `;

  return statsBlock + `<div class="progress-section">${rows}</div>` + helper;
}

async function renderWrongTab() {
  const wrong = await getAllWrong();
  wrong.sort((a, b) => b.wrongCount - a.wrongCount || b.lastWrongAt - a.lastWrongAt);
  const stats = getSessionStats();

  const statsBlock = `
    <div class="stats-grid">
      <div class="stat"><div class="stat-val">${wrong.length}</div><div class="stat-lbl">오답 단어</div></div>
      <div class="stat"><div class="stat-val">${stats.correct}</div><div class="stat-lbl">맞춤</div></div>
      <div class="stat"><div class="stat-val">${stats.seen}</div><div class="stat-lbl">푼 문제</div></div>
    </div>
  `;

  if (wrong.length === 0) {
    return statsBlock + `<div class="empty"><span class="em">·</span>아직 오답이 없습니다.</div>`;
  }

  const listHtml = wrong.map((w, i) => {
    const main = w.h || w.k;
    const showKana = w.h && w.k && w.h !== w.k;
    return `
    <li class="wrong-item">
      <span class="wrong-num">${String(i + 1).padStart(2, "0")}</span>
      <span class="wrong-lvl">${levelName(w.l)}</span>
      <span class="wrong-word">
        <span class="wrong-jp">${escapeHtml(main)}</span>
        ${showKana ? `<span class="wrong-kana">${escapeHtml(w.k)}</span>` : ""}
      </span>
      <span class="wrong-count">×${w.wrongCount}</span>
      <button class="wrong-remove" data-remove="${w.id}" title="삭제">×</button>
    </li>
  `;
  }).join("");

  const reviewBtn = `
    <button class="btn primary" id="review-btn" style="width: 100%; margin-bottom: 18px;">
      오답만 모아 복습하기 →
    </button>
  `;

  return statsBlock + reviewBtn + `<ul class="wrong-list">${listHtml}</ul>`;
}

async function renderSettingsTab() {
  const allProgress = await getAllProgress();
  const hiddenCount = allProgress.filter((p) => p.hidden).length;
  const proxy = (await getMeta("tatoeba_proxy")) || "";
  const boot = await isBootstrapped();

  return `
    <div class="settings-section">
      <h3>학습 진도 설정</h3>
      <div class="toggle-row">
        <label>${HIDE_AT_STREAK}회 연속 맞히면 단어 숨기기</label>
        <div class="switch ${state.hideEnabled ? "on" : ""}" id="hide-toggle"></div>
      </div>
      <p style="font-size: 12px; margin-top: 10px;">
        현재 ${hiddenCount.toLocaleString()}개 단어가 숨김 처리되어 있습니다.
        오답이 나오면 자동으로 숨김이 해제돼요.
      </p>
      <button class="btn ghost" id="unhide-all-btn" style="margin-top: 8px;">모든 숨김 해제</button>
      <button class="btn ghost" id="reset-progress-btn" style="margin-top: 8px; margin-left: 6px;">진도 초기화</button>
    </div>

    <div class="settings-section">
      <h3>예문 데이터 (Tatoeba)</h3>
      <p>
        ${boot
          ? "예문 데이터가 캐시되어 있습니다."
          : "예문 다운로드를 위해 CORS 프록시 URL이 필요합니다 (README의 5분 가이드 참고)."}
      </p>
      <p>현재 프록시: <code>${escapeHtml(proxy || "(미설정)")}</code></p>
      <input type="text" id="proxy-input"
        placeholder="https://your-worker.workers.dev"
        value="${escapeHtml(proxy)}"
        style="width:100%; padding:10px 12px; border:1px solid var(--rule); border-radius:4px; font-family:var(--font-mono); font-size:12px; background:var(--paper-2); margin-bottom:8px;" />
      <button class="btn ghost" id="save-proxy-btn">프록시 저장</button>
      ${proxy ? `<button class="btn ghost" id="download-examples-btn" style="margin-left: 6px;">${boot ? "예문 다시 받기" : "예문 다운로드"}</button>` : ""}
    </div>

    <div class="settings-section">
      <h3>세션 통계 초기화</h3>
      <p>맞춘/푼 문제 카운트만 0으로 되돌립니다. 오답·진도는 유지됩니다.</p>
      <button class="btn ghost" id="reset-stats-btn">통계 초기화</button>
    </div>

    <div class="settings-section">
      <h3>오답 단어 전체 삭제</h3>
      <p>오답노트의 모든 단어를 영구 삭제합니다.</p>
      <button class="btn ghost" id="clear-wrong-btn">오답 전체 삭제</button>
    </div>

    <div class="settings-section">
      <h3>홈 화면에 추가</h3>
      <p>
        iOS Safari: 공유 → 홈 화면에 추가<br>
        Android Chrome: 메뉴 → 앱 설치 / 홈 화면에 추가<br>
        데스크톱: 주소창 오른쪽 설치 아이콘
      </p>
    </div>

    <div class="settings-section">
      <h3>정보</h3>
      <p>
        총 ${WORDS.length.toLocaleString()}개 단어 · N5~N1<br>
        모든 데이터는 로컬(IndexedDB)에 저장됩니다.<br><br>
        <strong>출처</strong><br>
        · 단어·한국어 뜻: 사용자 제공 PDF<br>
        · 예문: <a href="https://github.com/mwhirls/tatoeba-json" target="_blank">tatoeba-json</a> by mwhirls / <a href="https://tatoeba.org" target="_blank">Tatoeba</a> (CC BY 2.0 FR)
      </p>
    </div>
  `;
}

async function render() {
  let body = "";
  if (state.tab === "quiz") body = await renderQuizTab();
  else if (state.tab === "progress") body = await renderProgressTab();
  else if (state.tab === "wrong") body = await renderWrongTab();
  else if (state.tab === "settings") body = await renderSettingsTab();
  appEl.innerHTML = renderHeader() + (await renderTabs()) + body;
  bindEvents();
}

function bindEvents() {
  appEl.querySelectorAll(".tab").forEach((el) => {
    el.addEventListener("click", () => {
      state.tab = el.dataset.tab;
      render();
    });
  });

  appEl.querySelectorAll(".mode-chip").forEach((el) => {
    el.addEventListener("click", async () => {
      const m = el.dataset.mode;
      if (m === state.mode) return;
      state.mode = m;
      await pickNext();
      render();
    });
  });

  appEl.querySelectorAll(".level-chip").forEach((el) => {
    el.addEventListener("click", async () => {
      const code = el.dataset.level;
      const idx = state.selectedLevels.indexOf(code);
      if (idx >= 0) state.selectedLevels.splice(idx, 1);
      else state.selectedLevels.push(code);
      await setSelectedLevels(state.selectedLevels);
      await pickNext();
      render();
    });
  });

  appEl.querySelectorAll(".choice").forEach((el) => {
    el.addEventListener("click", () => onSelect(parseInt(el.dataset.choice, 10)));
  });

  const nextBtn = document.getElementById("next-btn");
  if (nextBtn) nextBtn.addEventListener("click", nextQuestion);
  const skipBtn = document.getElementById("skip-btn");
  if (skipBtn) skipBtn.addEventListener("click", nextQuestion);

  appEl.querySelectorAll("[data-remove]").forEach((el) => {
    el.addEventListener("click", async () => {
      await removeWrong(parseInt(el.dataset.remove, 10));
      render();
    });
  });

  const reviewBtn = document.getElementById("review-btn");
  if (reviewBtn) reviewBtn.addEventListener("click", async () => {
    state.mode = "wrong-only";
    state.tab = "quiz";
    await pickNext();
    render();
  });

  const hideToggle = document.getElementById("hide-toggle");
  if (hideToggle) hideToggle.addEventListener("click", async () => {
    state.hideEnabled = !state.hideEnabled;
    await setHideEnabled(state.hideEnabled);
    flash(state.hideEnabled ? "숨김 모드 ON" : "숨김 모드 OFF");
    render();
  });

  const unhideAllBtn = document.getElementById("unhide-all-btn");
  if (unhideAllBtn) unhideAllBtn.addEventListener("click", async () => {
    if (!confirm("숨김 처리된 모든 단어를 다시 출제 대상에 포함할까요?")) return;
    await unhideAll();
    const all = await getAllProgress();
    state._progressMap = new Map(all.map((p) => [p.id, p]));
    flash("숨김 해제됨");
    render();
  });

  const resetProgressBtn = document.getElementById("reset-progress-btn");
  if (resetProgressBtn) resetProgressBtn.addEventListener("click", async () => {
    if (!confirm("학습 진도를 모두 초기화할까요? 오답노트는 그대로 유지됩니다.")) return;
    await clearProgress();
    state._progressMap.clear();
    flash("진도 초기화됨");
    render();
  });

  const saveProxyBtn = document.getElementById("save-proxy-btn");
  if (saveProxyBtn) saveProxyBtn.addEventListener("click", async () => {
    const v = document.getElementById("proxy-input").value.trim();
    await setMeta("tatoeba_proxy", v);
    flash(v ? "프록시 저장됨" : "프록시 해제됨");
    render();
  });

  const downloadExamplesBtn = document.getElementById("download-examples-btn");
  if (downloadExamplesBtn) downloadExamplesBtn.addEventListener("click", async () => {
    if (!confirm("예문 데이터를 다운로드할까요? 인터넷 연결 + 시간 소요 (약 30~50MB 다운로드 후 IndexedDB에 색인)")) return;
    await runBootstrapUI(true);
  });

  const resetStatsBtn = document.getElementById("reset-stats-btn");
  if (resetStatsBtn) resetStatsBtn.addEventListener("click", () => {
    if (confirm("세션 통계를 초기화할까요?")) {
      resetSessionStats();
      render();
    }
  });

  const clearWrongBtn = document.getElementById("clear-wrong-btn");
  if (clearWrongBtn) clearWrongBtn.addEventListener("click", async () => {
    if (confirm("오답 단어를 모두 삭제할까요? 되돌릴 수 없습니다.")) {
      await clearWrong();
      render();
    }
  });
}

// ---- boot UI ----

function renderBootScreen({ pct = 0, msg = "", error = null, skipPossible = false }) {
  appEl.innerHTML = `
    <header class="hdr">
      <div class="hdr-title">単語 <span class="seal">JLPT</span></div>
    </header>
    <div class="boot">
      <div class="boot-mark">語</div>
      <div class="boot-title">예문 데이터 준비 중</div>
      <div class="boot-msg">
        Tatoeba 일영 예문 데이터를 한 번만 받습니다.<br>
        이후로는 인터넷 없이도 작동해요. (약 30~50MB)
      </div>
      <div class="boot-progress"><div class="boot-bar" style="width:${pct}%"></div></div>
      <div class="boot-pct">${pct}% · ${escapeHtml(msg)}</div>
      ${error ? `<div class="boot-error">${escapeHtml(error)}</div>` : ""}
      <div style="margin-top:16px; display:flex; gap:8px; justify-content:center; flex-wrap:wrap;">
        ${error ? `<button class="btn primary" id="retry-btn" style="flex:initial; padding:10px 20px;">다시 시도</button>` : ""}
        ${skipPossible ? `<button class="btn ghost" id="skip-boot-btn" style="flex:initial; padding:10px 20px;">예문 없이 시작</button>` : ""}
      </div>
    </div>
  `;
  document.getElementById("retry-btn")?.addEventListener("click", () => runBootstrapUI(true));
  document.getElementById("skip-boot-btn")?.addEventListener("click", async () => {
    // Skip bootstrap — proceed to main app
    const allProgress = await getAllProgress();
    state._progressMap = new Map(allProgress.map((p) => [p.id, p]));
    await pickNext();
    render();
  });
}

async function runBootstrapUI(force = false) {
  renderBootScreen({ pct: 0, msg: "시작 중", skipPossible: true });
  try {
    if (force) await redownload((p) => renderBootScreen({ ...p, skipPossible: false }));
    else await bootstrap((p) => renderBootScreen({ ...p, skipPossible: false }));
    const allProgress = await getAllProgress();
    state._progressMap = new Map(allProgress.map((p) => [p.id, p]));
    await pickNext();
    render();
  } catch (e) {
    console.error(e);
    renderBootScreen({ pct: 0, msg: "오류", error: e.message || String(e), skipPossible: true });
  }
}

// ---- main ----
async function boot() {
  const res = await fetch("words.json");
  WORDS = await res.json();

  state.selectedLevels = await getSelectedLevels();
  state.hideEnabled = await getHideEnabled();

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("sw.js").catch((e) => console.warn("SW:", e));
  }

  // If examples already cached, go straight to main.
  // If not, check whether user has set up a proxy. If yes, kick off bootstrap.
  // If no proxy yet, just start the app (examples will simply be empty).
  if (await isBootstrapped()) {
    const allProgress = await getAllProgress();
    state._progressMap = new Map(allProgress.map((p) => [p.id, p]));
    await pickNext();
    render();
  } else if (await hasProxy()) {
    runBootstrapUI(false);
  } else {
    // No proxy yet — start app without examples; user can set up later in settings
    const allProgress = await getAllProgress();
    state._progressMap = new Map(allProgress.map((p) => [p.id, p]));
    await pickNext();
    render();
    // Light flash to suggest they set up examples
    setTimeout(() => flash("예문 보려면 설정 → 프록시 등록"), 800);
  }
}

boot();
