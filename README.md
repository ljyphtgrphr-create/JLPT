# 単語 · JLPT (PWA)

JLPT N5~N1 7,568개 단어를 급수별로 학습하고, 3회 연속 맞힌 단어는 자동 숨김, 진도를 급수별로 추적하는 PWA. HSK·TOEFL 앱과 같은 구조에 일본어 특성을 입혔습니다.

## 포함된 기능

- **5지선다 퀴즈** — 한자/가나 → 한국어 뜻 선택
- **급수 필터** — N5/N4/N3/N2/N1 중 학습할 급수 선택, 칩에 남은 단어 수 표시
- **즉시 해설** — 정답·오답 직후 한국어 뜻 + 가나 읽기 + **후리가나 달린 일본어 예문** + 영어 번역
- **후리가나 표시** — 예문의 한자 위에 가나 읽기가 작게 자동 표시 (Tatoeba 단어 정보 기반)
- **오답노트 자동 누적** — 틀린 단어 자동 저장, 횟수 카운트, 가중치 출제
- **3회 연속 정답 → 자동 숨김** — 익힌 단어는 출제 풀에서 제외, 오답 시 자동 복귀
- **진도 탭** — 급수별 익힌 단어 비율
- **streak 점 표시** — 카드에 점 3개로 진행률 시각화
- **완전 오프라인** — 첫 실행 시 한 번만 색인, 이후 영구 오프라인
- **PWA 설치** (iOS Safari, Android Chrome, 데스크톱 Chrome)

## 예문 데이터

**zip에 사전 색인된 `examples.json` (약 5MB)이 포함되어 있어요.** 7,568개 단어 중 86%가 예문을 가지고 있습니다 (Tatoeba 일영 페어, 단어당 최대 6개). 별도 다운로드 불필요.

첫 실행 시 PWA가 examples.json을 한 번 받아서 IndexedDB에 저장 (~10초). 이후 완전 오프라인.

> 예문 데이터는 [mwhirls/tatoeba-json](https://github.com/mwhirls/tatoeba-json)의 v0.0.52 (Jun 2024) 기반으로, 우리 JLPT 단어에 맞춰 미리 색인된 슬림 버전이에요. 최신 데이터로 갱신하고 싶으면 위 레포에서 받아 직접 색인하시면 됩니다.

## 학습 진도 동작 방식

- 정답 → `correctStreak` +1
- 오답 → `correctStreak` = 0, 오답노트에 추가
- `correctStreak` ≥ 3 → 자동 **숨김** (출제 풀에서 제외)
- 오답 시 자동으로 숨김 해제 + streak 리셋
- 진도 탭에서 N5~N1 별 익힌 단어 / 총 단어 비율 막대그래프

## 배포 방법

HTTPS 환경에서만 PWA 설치 가능.

### GitHub Pages
zip의 모든 파일을 레포 루트에 push → Settings → Pages → main branch / root.

> `examples.json`은 5MB로 GitHub 웹 UI 25MB 제한 안에 들어갑니다. 웹에서 그냥 드래그앤드롭해서 업로드 가능.

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
bootstrap.js           — examples.json 저장 (첫 실행 시)
sw.js                  — Service Worker
manifest.webmanifest   — PWA 매니페스트
words.json             — 단어 7,568개
examples.json          — 예문 색인 (사전 가공, ~5MB)
icon-*.png             — 아이콘
```

## 데이터 저장 위치

모두 사용자 브라우저 로컬:
- 오답 단어 + 횟수 → IndexedDB `jpdb` / `wrong`
- 학습 진도 (streak, hidden) → IndexedDB `jpdb` / `progress`
- 예문 → IndexedDB `jpdb` / `examples`
- 설정 → IndexedDB `jpdb` / `meta`
- 세션 통계 → localStorage `jp.stats`

## 출처

- 단어 · 한국어 뜻: 사용자 제공 PDF (N1-N5단어 통합)
- 예문 · 영어 번역: [tatoeba-json](https://github.com/mwhirls/tatoeba-json) (MIT) / 원본 [Tatoeba](https://tatoeba.org) (CC BY 2.0 FR)
