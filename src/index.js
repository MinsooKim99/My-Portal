// Cloudflare Worker
//  - 웹페이지(챗봇, 메일 답장 도구)는 public/ 정적파일이 담당
//  - 이 워커는 /api/* 와 디스코드 /interactions 요청을 처리
//  - AI 는 Cloudflare Workers AI (env.AI) 로 무료 호출
//
// ⚠️ 모델 ID는 시간이 지나면 바뀔 수 있습니다.
//    Cloudflare 대시보드 > AI > Models 에서 최신 ID를 확인하고 필요하면 아래를 교체하세요.

// 텍스트 모델 후보 — 맨 앞이 기본(무료 중 가장 똑똑한 모델). 폐기/오류면 자동으로 다음 모델로.
// 멍청한 소형 모델로는 떨어지지 않도록, 강한 모델만 후보로 둔다(마지막 8B는 최후 안전장치).
// ⚠️ Cloudflare가 모델을 은퇴시켜도 이 목록만 최신 ID로 바꾸면 됩니다. (대시보드 AI > Models 에서 확인)
const TEXT_MODELS = [
  "@cf/qwen/qwen3-30b-a3b-fp8",               // 기본 = Qwen3 (최신, 한국어·다국어에 강함)
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast", // 대체 = 똑똑한 70B
  "@cf/meta/llama-3.1-8b-instruct-fast",      // 최후 안전장치(작지만 살아있는 모델)
];

// ---------- 메일 답장 스타일 (김민수 문체 학습) ----------
// 실제 메일 원문/실명/계정정보는 넣지 않고, "문체와 형식"만 규칙 + 예시로 심는다.
const EMAIL_SYSTEM =
  "너는 '토마토시스템 전략사업부 사원 김민수'로서, 받은 업무 메일에 대한 답장 초안을 김민수 본인의 실제 문체로 작성한다.\n" +
  "\n[문체 규칙]\n" +
  '- 첫 문장은 항상 "안녕하세요. 토마토시스템 김민수입니다." 로 시작한다.\n' +
  "- 간결하고 사실 위주로 쓴다. 불필요한 미사여구나 과장된 인사는 넣지 않는다.\n" +
  '- 사안이 둘 이상이면 "1.", "2.", "3." 번호로 나눠 정리한다.\n' +
  '- 구체적 상황·URL·케이스가 필요하면 "예시)" 로 제시한다.\n' +
  '- 정중하지만 담백한 존댓말을 쓴다. ("~부탁드립니다.", "확인 부탁드립니다.", "~회신 부탁드립니다.")\n' +
  '- 상대의 조치가 필요하면 마지막에 "문의사항이 있다면 회신 부탁드립니다." 를 넣는다.\n' +
  '- 반드시 "감사합니다." 로 끝맺는다.\n' +
  "- 날짜·수치·테스트 결과 등 확실하지 않아 사용자가 직접 채워야 하는 부분은 [대괄호]로 표시한다.\n" +
  "- 서명(회사 주소·전화번호 등)은 지어내지 않는다. 본문만 작성한다.";

// few-shot 예시 (문체/형식 재현용 — 실제 업무 내용이 아닌 일반화된 샘플)
const EMAIL_FEWSHOT = [
  {
    role: "user",
    content:
      "받은 메일:\n안녕하십니까, 협력사 담당자입니다.\n요청하신 수정 반영 완료했습니다. 확인 부탁드립니다.\n감사합니다.\n\n이 메일에 대한 답장 초안을 작성해줘.",
  },
  {
    role: "assistant",
    content:
      "안녕하세요. 토마토시스템 김민수입니다.\n\n[테스트 일시] 테스트 결과, 여전히 [증상 요약] 현상이 확인됩니다.\n다시 한번 확인해주시면 감사하겠습니다.\n\n감사합니다.",
  },
  {
    role: "user",
    content:
      "받은 메일:\n접속 IP 관련 문의와, 사용자 정보 항목에 대해 문의드립니다.\n\n이 메일에 대한 답장 초안을 작성해줘.",
  },
  {
    role: "assistant",
    content:
      "안녕하세요. 토마토시스템 김민수입니다.\n\n1. IP 예외처리 완료하였습니다. 확인 후 테스트 부탁드립니다.\n2. 해당 항목은 [담당 영역]이 아닙니다.\n관련 내용은 [참고 사항] 부탁드립니다.\n\n문의사항이 있다면 회신 부탁드립니다.\n감사합니다.",
  },
];

// ---------- 공통 유틸 ----------
function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function hexToBytes(hex) {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

// 현재 시각(한국 시간) 문자열 — 모델은 시계가 없어서 시간을 지어내므로 직접 넣어준다.
function nowKST() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const days = ["일", "월", "화", "수", "목", "금", "토"];
  const p = (n) => String(n).padStart(2, "0");
  return (
    d.getUTCFullYear() + "년 " + (d.getUTCMonth() + 1) + "월 " + d.getUTCDate() + "일 " +
    "(" + days[d.getUTCDay()] + ") " + p(d.getUTCHours()) + ":" + p(d.getUTCMinutes()) + " (KST)"
  );
}

// 챗봇 공통 시스템 프롬프트 (모델이 알 수 없는 실시간 시각만 주입. 나머지는 모델 실력에 맡김)
function chatSystem() {
  return (
    "너는 친절한 한국어 AI 비서다. 사용자의 질문에 정확하고 간결하게 답한다.\n" +
    "현재 시각은 " + nowKST() + " 이다. 날짜·시간을 물으면 반드시 이 값을 기준으로 답한다.\n" +
    "모르는 것은 지어내지 말고 모른다고 답한다."
  );
}

// 여러 텍스트 모델을 순서대로 시도하고, 폐기/미존재 오류면 다음 모델로 자동 대체한다.
// 무료 한도 초과 같은 "정상적인" 오류는 그대로 위로 던져서 사용자에게 알린다.
// 반환값: { text, model } — 실제로 응답한 모델 ID도 함께 돌려준다(진단용).
async function runText(env, messages, maxTokens = 1024) {
  let lastErr = "";
  for (const model of TEXT_MODELS) {
    try {
      const r = await env.AI.run(model, { messages, max_tokens: maxTokens });
      let text = (r && r.response) || "";
      // 일부 폐기 모델은 에러를 응답 본문에 담아 돌려주기도 함 → 다음 모델로
      if (/deprecat|retired|no longer available|\b5028\b/i.test(text)) {
        lastErr = text;
        continue;
      }
      // Qwen3 등 추론형 모델이 <think>...</think> 로 사고 과정을 함께 뱉으면 제거
      text = text.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
      if (text) return { text, model };
      lastErr = "빈 응답";
    } catch (err) {
      lastErr = String((err && err.message) || err);
      // 폐기/미존재 계열이 아니면(예: 무료 한도 초과) 즉시 중단해서 진짜 원인을 알림
      if (!/deprecat|retired|not found|no such model|\b5028\b|\b3026\b|\b1001\b/i.test(lastErr)) {
        throw err;
      }
    }
  }
  throw new Error("사용 가능한 텍스트 모델이 없습니다(후보가 모두 폐기/오류). 마지막 메시지: " + lastErr);
}

// ---------- 로그인 / 세션 ----------
function getCookie(request, name) {
  const c = request.headers.get("cookie") || "";
  const m = c.match(new RegExp("(?:^|; )" + name + "=([^;]+)"));
  return m ? m[1] : null;
}

// 세션 서명 키. 기본값 대신 Cloudflare 환경변수 SESSION_SECRET 로 덮어쓰면 진짜 보안이 됨.
function authSecret(env) {
  return env.SESSION_SECRET || "mp-portal-default-secret-please-override";
}

async function hmacHex(secret, msg) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function makeSession(env, user) {
  const payload = btoa(encodeURIComponent(user) + "|" + Date.now());
  const sig = await hmacHex(authSecret(env), payload);
  return payload + "." + sig;
}

async function verifySession(env, token) {
  if (!token || token.indexOf(".") < 0) return null;
  const i = token.lastIndexOf(".");
  const payload = token.slice(0, i);
  const sig = token.slice(i + 1);
  if ((await hmacHex(authSecret(env), payload)) !== sig) return null;
  try {
    return decodeURIComponent(atob(payload).split("|")[0]);
  } catch (e) {
    return null;
  }
}

// 슈퍼계정 기본값: admin / admin (환경변수 ADMIN_ID·ADMIN_PW 로 덮어쓸 수 있음)
async function handleLogin(request, env) {
  let body = {};
  try { body = await request.json(); } catch (e) {}
  const id = ((body && body.id) || "").trim();
  const pw = (body && body.pw) || "";
  if (id !== (env.ADMIN_ID || "admin") || pw !== (env.ADMIN_PW || "admin")) {
    return json({ ok: false, error: "아이디 또는 비밀번호가 올바르지 않습니다." }, 401);
  }
  const token = await makeSession(env, id);
  const maxAge = 60 * 60 * 24; // 1일
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  headers.append("set-cookie", `mp_session=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
  headers.append("set-cookie", `mp_auth=1; Secure; SameSite=Lax; Path=/; Max-Age=${maxAge}`);
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

function handleLogout() {
  const headers = new Headers({ "content-type": "application/json; charset=utf-8" });
  headers.append("set-cookie", "mp_session=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0");
  headers.append("set-cookie", "mp_auth=; Secure; SameSite=Lax; Path=/; Max-Age=0");
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

// ---------- 진입점 ----------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      // 로그인/로그아웃/디스코드는 인증 없이 처리
      if (request.method === "POST" && path === "/api/login") return await handleLogin(request, env);
      if (request.method === "POST" && path === "/api/logout") return handleLogout();
      if (request.method === "POST" && path === "/interactions") return await handleDiscord(request, env, ctx);

      // 보호된 API — 로그인(세션) 필요
      if (request.method === "POST" && (path === "/api/chat" || path === "/api/email-reply")) {
        const user = await verifySession(env, getCookie(request, "mp_session"));
        if (!user) return json({ error: "로그인이 필요합니다." }, 401);
        if (path === "/api/chat") return await handleChat(request, env);
        return await handleEmailReply(request, env);
      }
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, 500);
    }

    // 그 외는 정적 파일(웹페이지). 페이지 접근 제어는 프론트(app.js) 가드가 담당.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Not found", { status: 404 });
  },
};

// ---------- 채팅 (텍스트 Q&A) ----------
async function handleChat(request, env) {
  const body = await request.json();
  let msgs = body.messages;
  if (!msgs) msgs = [{ role: "user", content: body.message || "" }];

  const withSystem = [
    { role: "system", content: chatSystem() },
    ...msgs,
  ];
  const { text, model } = await runText(env, withSystem, 1024);
  return json({ answer: text, model });
}

// ---------- 메일 답장 초안 ----------
async function handleEmailReply(request, env) {
  const { email, keywords, tone } = await request.json();
  if (!email) return json({ error: "메일 내용이 필요합니다." }, 400);

  let user = "받은 메일:\n" + email + "\n\n이 메일에 대한 답장 초안을 작성해줘.";
  if (keywords && keywords.trim()) user += "\n\n답장에 아래 내용/키워드를 반드시 반영해줘:\n" + keywords;
  if (tone && tone.trim()) user += "\n\n말투/톤: " + tone;

  const { text: draft } = await runText(
    env,
    [
      { role: "system", content: EMAIL_SYSTEM },
      ...EMAIL_FEWSHOT,
      { role: "user", content: user },
    ],
    1024
  );
  return json({ draft });
}

// ---------- 디스코드 인터랙션 ----------
async function handleDiscord(request, env, ctx) {
  const signature = request.headers.get("x-signature-ed25519");
  const timestamp = request.headers.get("x-signature-timestamp");
  const bodyText = await request.text();

  if (!signature || !timestamp || !env.DISCORD_PUBLIC_KEY) {
    return new Response("bad request", { status: 401 });
  }

  // 디스코드 요청 서명 검증 (Ed25519)
  const key = await crypto.subtle.importKey(
    "raw",
    hexToBytes(env.DISCORD_PUBLIC_KEY),
    { name: "Ed25519" },
    false,
    ["verify"]
  );
  const valid = await crypto.subtle.verify(
    { name: "Ed25519" },
    key,
    hexToBytes(signature),
    new TextEncoder().encode(timestamp + bodyText)
  );
  if (!valid) return new Response("invalid signature", { status: 401 });

  const interaction = JSON.parse(bodyText);

  // PING → PONG
  if (interaction.type === 1) return json({ type: 1 });

  // 슬래시 명령
  if (interaction.type === 2) {
    const name = interaction.data.name;
    const opts = {};
    for (const o of interaction.data.options || []) opts[o.name] = o.value;

    // 먼저 "생각 중..."(deferred)으로 즉시 응답 → 5초 제한 회피
    ctx.waitUntil(processDiscordCommand(name, opts, interaction, env));
    return json({ type: 5 }); // DEFERRED_CHANNEL_MESSAGE_WITH_SOURCE
  }

  return json({ type: 4, data: { content: "지원하지 않는 요청입니다." } });
}

async function processDiscordCommand(name, opts, interaction, env) {
  const appId = interaction.application_id;
  const token = interaction.token;
  const followupUrl = `https://discord.com/api/v10/webhooks/${appId}/${token}/messages/@original`;

  try {
    if (name === "chat") {
      const { text } = await runText(
        env,
        [
          { role: "system", content: chatSystem() },
          { role: "user", content: opts.message || "" },
        ],
        800
      );
      await patchFollowup(followupUrl, { content: (text || "(빈 응답)").slice(0, 1900) });
    } else if (name === "email") {
      const { text: answer } = await runText(
        env,
        [
          { role: "system", content: EMAIL_SYSTEM },
          ...EMAIL_FEWSHOT,
          { role: "user", content: "받은 메일:\n" + (opts.content || "") + "\n\n이 메일에 대한 답장 초안을 작성해줘." },
        ],
        800
      );
      await patchFollowup(followupUrl, { content: (answer || "").slice(0, 1900) });
    }
  } catch (err) {
    await patchFollowup(followupUrl, {
      content: "오류가 발생했어요: " + String((err && err.message) || err),
    });
  }
}

async function patchFollowup(url, payload) {
  await fetch(url, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  });
}
