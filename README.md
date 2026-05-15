# 単語 · JLPT (PWA)

JLPT N5~N1 7,568개 단어를 급수별로 학습하고, 3회 연속 맞힌 단어는 자동 숨김, 진도를 급수별로 추적하는 PWA. HSK·TOEFL 앱과 같은 구조에 일본어 특성을 입혔습니다.

## 포함된 기능

- **5지선다 퀴즈** — 한자/가나 → 한국어 뜻 선택
- **급수 필터** — N5/N4/N3/N2/N1 중 학습할 급수 선택, 칩에 남은 단어 수 표시
- **즉시 해설** — 정답·오답 직후 한국어 뜻 + 가나 읽기(한자 단어인 경우) + 일본어 예문 + 영어 번역
- **오답노트 자동 누적** — 틀린 단어 자동 저장, 횟수 카운트, 가중치 출제
- **3회 연속 정답 → 자동 숨김** — 익힌 단어는 출제 풀에서 제외, 오답 시 자동 복귀
- **진도 탭** — 급수별 익힌 단어 비율
- **streak 점 표시** — 카드에 점 3개로 진행률 시각화
- **완전 오프라인** — 첫 실행 시 색인만 한 번, 이후 영구 오프라인
- **PWA 설치** (iOS Safari, Android Chrome, 데스크톱 Chrome)

## 📌 예문 데이터 설치 (5분)

이 앱은 예문 데이터를 외부에서 다운받지 않고, **같은 폴더의 `examples.json` 파일을 읽어서** IndexedDB에 색인합니다. 한 번만 업로드하면 끝.

> 예문 파일이 없어도 앱은 정상 작동합니다 — 한국어 뜻·한자·가나는 다 표시돼요. 예문만 표시 안 될 뿐.

### 단계

1. **데이터 다운로드**:
   <https://github.com/mwhirls/tatoeba-json/releases/latest> 페이지로 가서
   **`jpn-eng-examples.zip`** (10MB) 다운로드

2. **압축 풀기** — `jpn-eng-examples.zip`을 더블클릭하면 안에 JSON 파일이 들어있어요. 보통 이런 이름:
   - `jpn_eng_examples.json` 또는 비슷한 이름

3. **이름 변경** — 그 JSON 파일을 **`examples.json`**으로 이름 변경 (정확히 이 이름이어야 함)

4. **GitHub 업로드** — `examples.json`을 PWA가 배포된 GitHub 레포에 `index.html`과 같은 위치에 업로드
   - 레포 페이지 → "Add file" → "Upload files" → 드래그앤드롭 → "Commit changes"

5. **앱 새로고침** — PWA를 다시 열면 자동으로 부트 화면이 떠서 색인 시작 (1~2분)

이후로는 인터넷 없이 예문 즉시 조회.

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
bootstrap.js           — examples.json 색인 (첫 실행 시)
sw.js                  — Service Worker
manifest.webmanifest   — PWA 매니페스트
words.json             — 단어 7,568개 (PDF 파싱)
icon-*.png             — 아이콘
examples.json          — 사용자가 직접 업로드 (선택, 위 가이드 참고)
```

## 데이터 저장 위치

모두 사용자 브라우저 로컬:
- 오답 단어 + 횟수 → IndexedDB `jpdb` / `wrong`
- 학습 진도 (streak, hidden) → IndexedDB `jpdb` / `progress`
- 예문 색인 (~50MB) → IndexedDB `jpdb` / `examples`
- 설정 → IndexedDB `jpdb` / `meta`
- 세션 통계 → localStorage `jp.stats`

## 알려진 제약

- **PDF에서 추출하다 보니 5개 정도 단어는 파싱 누락** — 한국어 뜻이 다음 줄에 넘쳤거나 슬래시 표기 변형 (전체 영향 없음)
- **예문 매칭률**: Tatoeba는 약 20만 일영 문장 페어를 보유하고, 우리 7,568개 단어 중 사용 빈도가 높은 단어는 예문이 잘 붙지만 N1 고급어휘 일부는 예문이 없을 수 있음
- **Tatoeba 데이터 갱신**: mwhirls 레포는 매주 자동 갱신. 새 `jpn-eng-examples.zip`을 받아서 `examples.json`을 교체하고 설정 → "예문 다시 색인" 클릭

## 출처

- 단어 · 한국어 뜻: 사용자 제공 PDF (N1-N5단어 통합)
- 예문 · 영어 번역: [tatoeba-json](https://github.com/mwhirls/tatoeba-json) (MIT) / 원본 [Tatoeba](https://tatoeba.org) (CC BY 2.0 FR)
