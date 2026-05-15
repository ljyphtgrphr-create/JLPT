# 単語 · JLPT (PWA)

JLPT N5~N1 7,568개 단어를 급수별로 학습하고, 3회 연속 맞힌 단어는 자동 숨김, 진도를 급수별로 추적하는 PWA. HSK 앱과 같은 구조에 일본어 특성을 입혔습니다.

## 포함된 기능

- **5지선다 퀴즈** — 한자/가나 → 한국어 뜻 선택
- **급수 필터** — N5/N4/N3/N2/N1 중 학습할 급수 선택, 칩에 남은 단어 수 표시
- **즉시 해설** — 정답·오답 직후 한국어 뜻 + 가나 읽기(한자 단어인 경우) + 일본어 예문 + 영어 번역
- **오답노트 자동 누적** — 틀린 단어 자동 저장, 횟수 카운트, 가중치 출제
- **3회 연속 정답 → 자동 숨김** — 익힌 단어는 출제 풀에서 제외, 오답 시 자동 복귀
- **진도 탭** — 급수별 익힌 단어 비율
- **streak 점 표시** — 카드에 점 3개로 진행률 시각화
- **완전 오프라인** — 첫 실행 시 예문 데이터를 한 번만 받으면 영구 오프라인
- **PWA 설치** (iOS Safari, Android Chrome, 데스크톱 Chrome)

## ⚠️ 예문 데이터 셋업 (Tatoeba CORS 우회)

이 부분이 다른 앱과 좀 달라요. **Tatoeba 예문 JSON은 GitHub releases에 있는데, GitHub releases는 CORS를 막아서** 브라우저에서 직접 다운받을 수 없어요. 그래서 **Cloudflare Worker로 CORS 프록시를 띄워야** 합니다 (5분, 무료).

예문 없이도 학습은 가능합니다 (한국어 뜻·가나·한자는 다 표시됨). 예문이 필요하시면 아래 가이드를 따라하세요.

### Cloudflare Worker 프록시 셋업 (5분)

1. <https://dash.cloudflare.com> 가입 (무료)
2. Workers & Pages → Create → "Start with Hello World!" → Get started
3. 워커 이름 정하기 (예: `jp-tatoeba-proxy`) → Deploy
4. "Edit code" 누르고 기본 코드 다 지우고 아래 붙여넣기 → 우측 상단 Deploy

```js
export default {
  async fetch(req) {
    const url = new URL(req.url);
    const target = url.searchParams.get("u");
    if (!target) return new Response("missing ?u=URL", { status: 400 });
    // Only allow github.com to prevent abuse
    if (!target.startsWith("https://github.com/")) {
      return new Response("only github.com URLs allowed", { status: 403 });
    }
    const resp = await fetch(target, { redirect: "follow" });
    const body = await resp.arrayBuffer();
    return new Response(body, {
      status: resp.status,
      headers: {
        "Content-Type": resp.headers.get("content-type") || "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=86400"
      }
    });
  }
};
```

5. 배포된 URL 복사 (예: `https://jp-tatoeba-proxy.당신.workers.dev`)
6. 앱 → 설정 → "예문 데이터 (Tatoeba)" → 프록시 URL 칸에 붙여넣고 저장
7. "예문 다운로드" 버튼 클릭 → 부트 화면에서 30~50MB 다운로드 (한 번만)

이후로는 인터넷 없이 예문을 즉시 조회할 수 있어요.

> 무료 Cloudflare Worker는 하루 100,000 요청. 예문 다운로드는 단어당 1회 + 갱신만 하므로 충분.

## 학습 진도 동작 방식

- 정답 → `correctStreak` +1
- 오답 → `correctStreak` = 0, 오답노트에 추가
- `correctStreak` ≥ 3 → 자동 **숨김** (출제 풀에서 제외)
- 오답 시 자동으로 숨김 해제 + streak 리셋
- 진도 탭에서 N5~N1 별 익힌 단어 / 총 단어 비율 막대그래프

## 배포 방법

HTTPS 환경에서만 PWA 설치 가능.

### GitHub Pages
폴더를 레포 루트에 push → Settings → Pages → main branch / root.

### Cloudflare Pages / Netlify / Vercel
폴더 드래그앤드롭.

### 로컬 테스트
```bash
cd jppwa
python3 -m http.server 8000
```

## 홈 화면에 추가
- **iOS Safari**: 공유 → 홈 화면에 추가
- **Android Chrome**: 메뉴 → 앱 설치
- **데스크톱 Chrome / Edge**: 주소창 오른쪽 설치 아이콘

## 파일 구성

```
index.html             — 진입점
styles.css             — 스타일
app.js                 — 컨트롤러
storage.js             — IndexedDB (오답, 예문, 진도)
dict.js                — 예문 로컬 조회
bootstrap.js           — 첫 실행 시 예문 다운로드 (프록시 경유)
sw.js                  — Service Worker
manifest.webmanifest   — PWA 매니페스트
words.json             — 단어 7,568개 (PDF 파싱)
icon-*.png             — 아이콘
```

## 데이터 저장 위치

모두 사용자 브라우저 로컬:
- 오답 단어 + 횟수 → IndexedDB `jpdb` / `wrong`
- 학습 진도 (streak, hidden) → IndexedDB `jpdb` / `progress`
- 예문 색인 (~50MB) → IndexedDB `jpdb` / `examples`
- 설정·프록시 URL → IndexedDB `jpdb` / `meta`
- 세션 통계 → localStorage `jp.stats`

## 알려진 제약

- **PDF에서 추출하다 보니 5개 정도 단어는 파싱 누락** — 한국어 뜻이 다음 줄에 넘쳤거나 슬래시 표기 변형 (전체 영향 없음)
- **예문 매칭률**: Tatoeba는 약 20만 일영 문장 페어를 보유하고, 우리 7,568개 단어 중 사용 빈도가 높은 단어는 예문이 잘 붙지만 N1 고급어휘 일부는 예문이 없을 수 있음
- **Tatoeba 데이터 갱신**: mwhirls 레포는 매주 자동 갱신. 설정 → "예문 다시 받기"로 최신 데이터 갱신 가능

## 출처

- 단어 · 한국어 뜻: 사용자 제공 PDF (N1-N5단어 통합)
- 예문 · 영어 번역: [tatoeba-json](https://github.com/mwhirls/tatoeba-json) (MIT) / 원본 [Tatoeba](https://tatoeba.org) (CC BY 2.0 FR)
