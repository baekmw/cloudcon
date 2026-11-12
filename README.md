# 🎵 Cloudcon (클라우드콘)

> **클래식 애호가를 위한 스마트 공연 탐색 & 알림 플랫폼**  
> 보고 싶던 모든 무대를 한곳에서, 기다린 연주 소식을 가장 먼저 만나보세요.

---

## 📖 서비스 소개

**Cloudcon(클라우드콘)**은 예술경영지원센터 **공연예술통합전산망(KOPIS)**의 실시간 공연 데이터와 **Google Gemini AI**를 결합하여, 클래식(서양음악) 공연을 가장 스마트하게 찾고 알림을 받을 수 있도록 설계된 모던 웹 플랫폼입니다.

- **"보고 싶던 모든 무대를 한곳에서"** — 아티스트, 연주곡, 공연장 어디든 빠짐없이 찾아주는 통합 검색
- **"기다린 연주 소식을 가장 먼저"** — 관심 있는 연주자나 작곡가의 공연 등록 소식을 놓치지 않는 맞춤 알림
- **"듣고 싶은 클래식을 직접 무대 위로"** — 원하는 무대를 모으고 향후 펀딩까지 이어지는 클래식 커뮤니티

---

## ✨ 주요 기능

### 1. 🔍 다각도 스마트 클래식 검색 (Smart Search & Match)
- **통합 검색 엔진**: 아티스트(연주자·지휘자), 작곡가, 연주 프로그램(곡명), 공연장 위치, 상세 소개글까지 다각도로 분석하여 일치하는 공연을 검색합니다.
- **직관적인 매칭 사유 배지**: 검색어가 어디에서 일치했는지 사용자가 한눈에 파악할 수 있도록 배지를 제공합니다.
  - `연주 프로그램에서 찾음` / `출연진에서 찾음` / `공연 제목에서 찾음` / `공연장 위치에서 찾음` 등
- **반응형 스켈레톤 UI**: 검색 중 로딩 지연 시 레이아웃 흔들림 없는 스켈레톤 카드를 제공하여 쾌적한 탐색 경험을 보장합니다.
- **하단 고정형(Sticky) 알림 카드**: 검색 결과 하단에 원하는 조건으로 즉시 알림을 등록할 수 있는 플로팅 카드가 배치됩니다.

### 2. 🤖 Gemini AI 기반 프로그램(연주곡) 자동 추출 및 구조화
- **비정형 데이터의 구조화**: 줄글이나 서술형으로 작성된 KOPIS의 상세 소개글(`sty`, `dtguidance` 등)에서 **작곡가(Composer)**와 **곡명(Work/Piece)**을 정확하게 추출해 정형 JSON으로 변환합니다.
- **2-Tier 영속 캐싱 시스템**:
  - 디스크 캐시(`server/data/programs/programs_cache.json`)와 인메모리 맵을 통해 한 번 분석된 프로그램은 영구 보존됩니다.
- **논블로킹(Non-blocking) 비동기 렌더링**:
  - 공연 상세 페이지 진입 시 AI 분석 완료를 기다리지 않고 공연 기본 정보를 **50ms 내 즉시 렌더링**합니다.
  - 프로그램 분석 중인 경우 감성적인 전용 스켈레톤 UI가 표시되며, 백그라운드 추출 완료 시 자동으로 목록이 갱신됩니다.
- **백그라운드 사전 추출 워커**:
  - '공연예정' 상태의 클래식 공연들을 서버 기동 시 백그라운드 큐에 등록하여 API Rate Limit(RPM)을 준수하며 순차적으로 사전 분석합니다.

### 3. 🎻 정교한 아티스트 정제 및 맞춤 알림
- **아티스트명 지능형 정제**:
  - `백건우 등`, `조성진 외`, `피아노 임윤찬`, `지휘 정명훈`과 같이 부가 텍스트나 직책이 붙은 경우, 순수 아티스트명(`백건우`, `조성진`, `임윤찬`, `정명훈`)만 깔끔하게 추출하여 알림 키워드로 자동 추천합니다.
- **키워드 기반 알림 관리**:
  - 연주자, 작곡가, 공연명을 자유롭게 등록하고 로컬 스토리지를 통해 안전하게 보관 및 관리할 수 있습니다.

### 4. 📱 모던 미니멀 UI/UX 디자인
- **세련된 타이포그래피 & 부드러운 전환**: 서정적인 페이드 슬라이드 헤더 캐치프레이즈, 감각적인 칩 디자인(`추천 검색어`).
- **좌우 분할 상세 뷰**:
  - **좌측 Sticky 영역**: 포스터, 공식 예매처 바로가기 버튼, 그리고 "이 공연으로 알림 받기" 카드가 스크롤에 맞춰 편리하게 고정됩니다.
  - **우측 콘텐츠 영역**: 공연 핵심 정보(Fact Card), AI 추출 프로그램 목록, 상세 이미지 아코디언이 시원한 뷰포트로 펼쳐집니다.
- **디테일한 사용자 경험**: 텍스트 드래그(선택) 시 은은한 하늘색(`soft sky blue`) 하이라이트 효과 적용.

---

## 🛠️ 기술 스택 (Tech Stack)

### Frontend
- **Framework**: [React 19](https://react.dev/) + [Vite 8](https://vitejs.dev/)
- **Routing**: [React Router DOM v7](https://reactrouter.com/)
- **Styling**: [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons**: [Lucide React](https://lucide.dev/)
- **Code Quality**: [oxlint](https://oxc-project.github.io/)

### Backend & Middleware
- **Environment**: Node.js (ESM)
- **Vite Plugin API Middleware**: 프론트엔드 개발 서버와 단일 포트(`5173`)로 연동되는 내장 백엔드 API
- **XML Parsing**: [fast-xml-parser](https://github.com/NaturalIntelligence/fast-xml-parser) (KOPIS RESTful XML 고속 파싱)
- **AI Engine**: [Google Gen AI SDK (@google/genai)](https://www.npmjs.com/package/@google/genai) — `gemini-3.5-flash-lite`

### External APIs
- **[KOPIS (공연예술통합전산망)](https://www.kopis.or.kr/)**: 전국 클래식(`CCCA`) 공연 목록, 공연장 시설, 예매처, 포스터 및 상세정보
- **Google Gemini API**: 비정형 클래식 프로그램 텍스트의 고속 정형화

---

## 📂 프로젝트 구조 (Directory Structure)

```text
cloudcon/
├── server/                         # 백엔드 서버 및 API 플러그인
│   ├── data/
│   │   └── programs/
│   │       └── programs_cache.json # AI 추출 프로그램 디스크 캐시
│   ├── kopis.js                    # KOPIS OpenAPI 클라이언트 및 데이터 가공
│   ├── plugin.js                   # Vite 미들웨어 기반 REST API 엔드포인트
│   └── programExtractor.js         # Gemini AI 프로그램 추출기 및 백그라운드 큐
│
├── src/                            # 프론트엔드 소스코드
│   ├── components/                 # 공통 컴포넌트
│   │   ├── ui/                     # 기본 UI 컴포넌트 (Button, Card, Input 등)
│   │   ├── Navigation.jsx          # 상단 글로벌 네비게이션 바
│   │   ├── Poster.jsx              # 공연 포스터 및 대체 플레이스홀더
│   │   ├── ProgramList.jsx         # AI 프로그램 목록 및 로딩 스켈레톤
│   │   ├── SearchSkeleton.jsx      # 검색 결과 스켈레톤 카드
│   │   └── StatePill.jsx           # 공연 상태(공연중, 공연예정 등) 뱃지
│   │
│   ├── pages/                      # 라우트 페이지
│   │   ├── HomePage.jsx            # 메인 홈 (히어로 애니메이션, 검색, 결과 리스트)
│   │   ├── ConcertDetailPage.jsx   # 공연 상세 페이지 (프로그램, 예매처, 알림)
│   │   ├── ConcertsPage.jsx        # 전체 공연 목록 페이지
│   │   └── AlertsPage.jsx          # 맞춤 알림 관리 페이지
│   │
│   ├── lib/                        # 비즈니스 로직 및 유틸리티
│   │   ├── api.js                  # 클라이언트 API 요청 함수
│   │   ├── alerts.js               # 알림 키워드 스토리지 관리
│   │   ├── format.js               # 날짜, 일정, 지역 포맷터
│   │   └── match.js                # 검색 매칭 엔진 & 아티스트명 정제 로직
│   │
│   ├── App.jsx                     # 루트 컴포넌트 & 라우팅 설정
│   ├── index.css                   # Tailwind v4 설정 및 글로벌 스타일 (텍스트 하이라이트 등)
│   └── main.jsx                    # 엔트리 포인트
│
├── package.json
├── vite.config.js                  # Vite 설정 및 KOPIS API 플러그인 등록
└── README.md
```

---

## 🚀 시작하기 (Getting Started)

### 1. 필수 요구 조건
- [Node.js](https://nodejs.org/) v20.0.0 이상
- [KOPIS Open API 키](https://www.kopis.or.kr/por/cs/openapi/openApiList.do?menuId=MNU_00074)
- [Google Gemini API 키](https://aistudio.google.com/)

### 2. 환경 변수 설정
프로젝트 루트 디렉토리에 `.env` 파일을 생성하고 발급받은 API 키를 입력합니다.

```env
# KOPIS(공연예술통합전산망) OpenAPI 서비스 키
KOPIS_API_KEY=your_kopis_api_key_here

# Google Gemini API 키 (프로그램 자동 추출용)
GEMINI_API_KEY=your_gemini_api_key_here
```

### 3. 패키지 설치
```bash
npm install
```

### 4. 로컬 개발 서버 실행
```bash
npm run dev
```
실행 후 브라우저에서 `http://localhost:5173`으로 접속합니다.

### 5. 프로덕션 빌드
```bash
npm run build
npm run preview
```

---

## 🛡️ 라이선스 (License)

This project is licensed under the MIT License.
공연 데이터의 저작권은 **(재)예술경영지원센터 공연예술통합전산망(KOPIS)** 및 해당 공연 기획사에 있습니다.
