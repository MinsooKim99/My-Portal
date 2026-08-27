# 나만의 AI (Cloudflare Workers + Workers AI)

신용카드 없이 **무료**로 돌아가는 개인용 AI 프로젝트입니다.

- 💬 **챗봇 웹페이지** — 채팅으로 질의응답
- ✉️ **메일 답장 도구** — 받은 메일 붙여넣으면 답장 초안 작성 (+키워드 반영)
- 🤖 **디스코드 봇** — 디스코드에서 `/chat`, `/email` 명령 사용

모든 AI는 **Cloudflare Workers AI**(하루 무료 한도)로 동작합니다.

---

## 0. 미리 준비할 것

- **Node.js** 18 이상 설치 ( https://nodejs.org )
- **Cloudflare 계정** (무료, 카드 불필요) — https://dash.cloudflare.com/sign-up
- 이 프로젝트 폴더 (지금 이 폴더)

터미널(명령 프롬프트)에서 이 폴더로 이동해 시작합니다.

```bash
cd My-Portal
npm install
```

---

## 1. 로그인

```bash
npx wrangler login
```

브라우저가 열리면 Cloudflare 계정으로 로그인하고 권한을 허용합니다.

---

## 2. 배포 (웹페이지 + API)

```bash
npx wrangler deploy
```

성공하면 아래처럼 **공개 주소**가 출력됩니다.

```
https://myptl.<your-subdomain>.workers.dev
```

이 주소를 브라우저에서 열면:

- `/` (또는 `/index.html`) → 홈
- `/chat.html` → 챗봇
- `/email.html` → 메일 답장 도구
- `/bot.html` → 디스코드 봇 안내

> 처음 배포 시 Workers AI 사용에 대한 안내가 나올 수 있습니다. 그대로 진행하면 됩니다.
> 이 주소가 아래 디스코드 설정에서 쓰이니 복사해두세요.

---

## 3. 디스코드 봇 설정 (단계별)

### 3-1. 디스코드 애플리케이션 만들기
1. https://discord.com/developers/applications 접속 → 우측 상단 **New Application**
2. 이름 입력 후 생성
3. 좌측 **General Information** 화면에서
   - **APPLICATION ID** 복사 → 메모 (나중에 명령 등록에 사용)
   - **PUBLIC KEY** 복사 → 메모 (아래 3-3에서 사용)

### 3-2. 봇 토큰 발급
1. 좌측 **Bot** 메뉴 → **Reset Token**(또는 View Token) → **토큰 복사** → 메모
   - ⚠️ 토큰은 비밀번호와 같습니다. 외부에 노출하지 마세요.

### 3-3. 워커에 PUBLIC KEY 등록 (서명 검증용)
터미널에서:

```bash
npx wrangler secret put DISCORD_PUBLIC_KEY
```

붙여넣으라고 나오면 **3-1에서 복사한 PUBLIC KEY**를 붙여넣고 엔터.

그리고 다시 배포해서 반영합니다:

```bash
npx wrangler deploy
```

### 3-4. 인터랙션 주소 연결
1. 디스코드 개발자 페이지 → **General Information**
2. **INTERACTIONS ENDPOINT URL** 칸에 아래 주소 입력 후 **Save**
   ```
   https://myptl.<your-subdomain>.workers.dev/interactions
   ```
   - 저장이 성공하면 서명 검증이 정상 동작하는 것입니다. (저장 실패 시 3-3의 PUBLIC KEY와 재배포를 확인하세요.)

### 3-5. 슬래시 명령 등록
터미널에서 (앱ID·봇토큰은 앞에서 복사한 값):

**macOS / Linux**
```bash
DISCORD_APP_ID=여기_앱ID DISCORD_TOKEN=여기_봇토큰 node register-commands.mjs
```

**Windows PowerShell**
```powershell
$env:DISCORD_APP_ID="여기_앱ID"; $env:DISCORD_TOKEN="여기_봇토큰"; node register-commands.mjs
```

`✅ 슬래시 명령 등록 완료: /chat, /email` 이 뜨면 성공입니다.

### 3-6. 봇을 내 서버에 초대
1. 개발자 페이지 → **Installation**(또는 OAuth2 → URL Generator)
2. 스코프에서 **applications.commands** (그리고 필요시 **bot**) 선택
3. 생성된 초대 URL을 브라우저에서 열어 내 디스코드 서버에 추가

이제 디스코드 채팅창에서 `/chat`, `/email` 을 써보세요.

---

## 4. 로컬에서 미리 테스트 (선택)

```bash
npx wrangler dev
```

`http://localhost:8787` 에서 웹페이지를 확인할 수 있습니다.
(디스코드 인터랙션은 공개 주소가 필요하므로 배포 후 테스트하세요.)

---

## 자주 겪는 문제

- **디스코드 저장이 안 된다 (endpoint URL)** → PUBLIC KEY를 잘못 넣었거나 재배포를 안 한 경우가 많습니다.
  3-3을 다시 하고 `npx wrangler deploy` 후 저장해보세요.
- **응답이 느리다 / 명령이 오래 걸린다** → 정상입니다. 디스코드는 "생각 중..." 표시 후
  결과가 준비되면 채워지는 방식(deferred)이라 5초 넘겨도 괜찮습니다.
- **모델을 더 똑똑한 걸로 바꾸고 싶다** → `src/index.js` 상단 `TEXT_MODELS` 목록의 **맨 앞**에
  원하는 큰 모델(예: `@cf/meta/llama-3.3-70b-instruct-fp8-fast`)을 두면 됩니다. 단, 무료 한도를 더 빨리 씁니다.
- **"이 모델은 폐기됨(deprecated, 5028)" 에러가 뜬다** → Cloudflare가 그 모델을 은퇴시킨 것입니다.
  이 프로젝트는 `TEXT_MODELS` 목록을 앞에서부터 자동으로 시도해 살아있는 모델로 넘어가지만,
  목록의 모델이 모두 폐기되면 대시보드 **AI > Models** 에서 최신 텍스트 모델 ID를 확인해 목록을 교체하세요.

---

## 무료 한도 참고

Cloudflare Workers AI 무료 티어는 **하루 10,000 뉴런**(매일 리셋)입니다.
뉴런 소모량은 모델·작업에 따라 다르며, 개인 사용 수준에서는 대부분 충분합니다.
초과 시에는 해당 요청이 잠시 막히고 다음 날 다시 무료로 사용할 수 있습니다.
