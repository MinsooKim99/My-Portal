# 프로젝트 인수인계 — "나만의 AI"

> 이 문서 하나로 클로드코드(CLI)에서 작업을 그대로 이어갈 수 있게 정리한 것입니다.
> 목표 → 결정사항 → 제약 → 현재 상태 → 남은 일 → 바로 붙여넣을 프롬프트 순서입니다.

---

## 0. 클로드코드에서 이어하는 법

1. 받은 `my-ai-worker.zip` 을 풀기
2. 터미널에서 그 폴더로 이동: `cd my-ai-worker`
3. `claude` 실행
4. 아래 **[6. 시작 프롬프트]** 를 복사해서 붙여넣기

---

## 1. 내가 하려는 것 (목표)

신용카드 없이 **무료로** 돌아가는 개인용 AI를 만든다. 세 가지 기능을 한 프로젝트에 합친다.

1. **나만의 챗봇 페이지** — 다른 AI 서비스처럼 채팅으로 질의응답. 이미지 생성/편집도 가능하면 좋음.
2. **메신저 봇** — (디스코드로 결정) 메신저에서 바로 AI 사용. 설정 방법까지 다 안내되어야 함.
3. **텍스트 도구** — 메일 내용을 붙여넣으면 답장 초안 작성, 키워드를 입력하면 그 내용을 답장에 반영.

핵심 취향: 돈 안 들이고, 나만 쓰더라도 실제로 굴러가는 걸 만들고 싶다.

---

## 2. 정한 것들 (기술 결정 + 이유)

- **호스팅/실행: Cloudflare Workers** — 무료 티어가 잠들지 않고(하루 10만 요청), 카드 불필요. 가벼운 API·웹페이지에 적합.
- **AI: Cloudflare Workers AI** — 클플이 자기 GPU에 올려둔 오픈모델(Llama, Qwen, FLUX 등)을 API로 호출. **하루 10,000 뉴런 무료**. 내가 서버·GPU를 직접 안 굴려도 됨. (클로드 API는 구독과 별개로 유료라 이번엔 제외.)
- **메신저: 디스코드로 결정** (원래 카카오톡 고려했으나 아래 이유로 변경)
  - 카카오톡: 챗봇이 무료로 바뀌긴 했으나 ①카카오 i 오픈빌더 승인 절차 ②스킬서버 5초 응답 제한(이미지 생성과 충돌)이 걸림돌.
  - 디스코드: 승인 절차 없음 + "먼저 응답 예약(deferred) 후 결과 채우기" 방식이라 5초 제한 문제 없음 → **이미지 생성도 메신저 안에서 됨.**
- **DB는 당장 안 씀** — 세 기능 모두 상태 저장이 필요 없어서. (나중에 대화 기록 저장하려면 Cloudflare KV/D1 무료 티어 사용.)

### 참고로 검토했다가 접은 것
- 맥미니 사서 로컬 LLM(Ollama) 돌리기 → 돈 문제로 보류.
- Render + Neon 백엔드 → 지금 목표엔 Workers가 더 가벼워서 보류(무료 Render DB는 30일 후 삭제되는 점도 있음).
- OpenClaw, Ollama 같은 "상시 데몬" 앱은 Workers(서버리스)에 못 올림 → 진짜 컴퓨터/VPS 필요. 이번 범위 밖.

---

## 3. 무료 제약 / 주의사항

- **Workers AI 무료 = 하루 10,000 뉴런** (매일 UTC 0시 리셋). 모델별 소모량이 달라서, 큰 모델일수록 빨리 닳음. 개인용은 대체로 충분.
- **모델 ID는 바뀔 수 있음** → 대시보드 **AI > Models** 에서 최신 ID 확인 후 `src/index.js` 상단 상수 교체.
- **이미지 편집(img2img)은 실험적** → 무료 티어에서 결과 품질이 들쭉날쭉할 수 있음.
- **이 클라우드 워크스페이스(작업대)는 임시** → 세션 끝나거나 오래 방치하면 회수됨. 소스는 zip/GitHub/컴퓨터 폴더로, 서비스는 Cloudflare 배포로 영구화해야 함.

---

## 4. 현재까지 만들어진 것 (프로젝트 구조)

빌드 검증(`wrangler deploy --dry-run`)까지 통과한 상태. 코드는 완성돼 있고 **배포만 남음.**

```
my-ai-worker/
├─ wrangler.toml           # Workers 설정: Workers AI 바인딩(env.AI) + 정적파일(public) 서빙
├─ package.json            # scripts: dev / deploy / register
├─ register-commands.mjs   # 디스코드 슬래시 명령(/chat /image /email) 등록 스크립트
├─ README.md               # 처음부터 따라하는 배포·디스코드 설정 안내
├─ src/
│  └─ index.js             # 워커 본체
│     • GET  /               → 웹페이지(정적파일)
│     • POST /api/chat       → 텍스트 Q&A         (모델: @cf/meta/llama-3.1-8b-instruct)
│     • POST /api/image      → 이미지 생성        (모델: @cf/black-forest-labs/flux-1-schnell)
│     • POST /api/image-edit → 이미지 편집(img2img)(모델: @cf/runwayml/stable-diffusion-v1-5-img2img)
│     • POST /api/email-reply→ 메일 답장 초안
│     • POST /interactions   → 디스코드 봇(서명검증 + deferred 응답)
└─ public/
   ├─ index.html           # 챗봇 + 이미지 생성 + 이미지 편집 (탭 UI)
   └─ email.html           # 메일 답장 도구
```

---

## 5. 남은 일 (다음 단계)

### A. 배포 (필수)
```bash
npm install
npx wrangler login          # 브라우저 로그인 (또는 CLOUDFLARE_API_TOKEN 환경변수 사용)
npx wrangler deploy         # → https://my-ai-worker.<서브도메인>.workers.dev 출력
```
배포되면 웹페이지 3종(`/`, `/email.html`)이 바로 동작.

### B. 디스코드 봇 연결 (README 3장에 상세)
1. https://discord.com/developers/applications 에서 앱 생성 → **APPLICATION ID**, **PUBLIC KEY**, **Bot 토큰** 확보
2. 워커에 공개키 등록: `npx wrangler secret put DISCORD_PUBLIC_KEY` → 재배포
3. 디스코드 **Interactions Endpoint URL** 에 `https://<배포주소>/interactions` 저장
4. 슬래시 명령 등록: `DISCORD_APP_ID=... DISCORD_TOKEN=... node register-commands.mjs`
5. 봇을 내 서버에 초대 (scope: `applications.commands`)

### C. 나중에 하면 좋을 개선 (선택)
- 챗봇 대화 기록 저장 (Cloudflare KV/D1 무료 티어)
- 나만 쓰도록 웹페이지에 간단한 비밀번호/접근 제한
- 더 똑똑한 모델로 교체 (`TEXT_MODEL` 을 `@cf/meta/llama-3.3-70b-instruct-fp8-fast` 등으로)
- 커스텀 도메인 연결
- 소스 GitHub에 올려 자동배포(CI/CD) 구성

---

## 6. 시작 프롬프트 (클로드코드에 그대로 붙여넣기)

```
이 폴더는 Cloudflare Workers + Workers AI 로 만든 개인용 AI 프로젝트야.
HANDOFF.md 와 README.md 를 먼저 읽고 현재 상태를 파악해줘.

목표: 무료로 돌아가는 (1) 챗봇+이미지 웹페이지, (2) 디스코드 봇(/chat /image /email),
(3) 메일 답장 초안 도구 를 완성해서 배포하는 것.

코드는 이미 완성돼 있고 빌드 검증도 통과했어. 지금 내가 하고 싶은 건 [ 배포 / 기능 수정 / 개선 ]
중에 (골라서) 진행하는 거야. 다음 단계를 안내하면서 같이 진행해줘.
막히면 임의로 처리하지 말고 나한테 확인받고 진행해줘.
```

---

*이 문서는 지금까지의 대화(목표·결정·구현 상태)를 요약한 인수인계용입니다. 프로젝트 코드 전체는 같은 폴더 안에 들어 있습니다.*
