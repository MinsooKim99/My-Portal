// Cloudflare Worker
//  - 웹페이지(챗봇, 메일 답장 도구)는 public/ 정적파일이 담당
//  - 이 워커는 /api/* 와 디스코드 /interactions 요청을 처리
//  - AI 는 Cloudflare Workers AI (env.AI) 로 무료 호출
//
// ⚠️ 모델 ID는 시간이 지나면 바뀔 수 있습니다.
//    Cloudflare 대시보드 > AI > Models 에서 최신 ID를 확인하고 필요하면 아래를 교체하세요.

// 텍스트 모델 후보 목록 — 앞에서부터 시도하고, 폐기(deprecated)/오류면 자동으로 다음 모델로 넘어감.
// 맨 앞이 기본(품질 우선). 무료 뉴런을 아끼려면 작은 모델을 위로 올리면 됨.
// ⚠️ Cloudflare가 모델을 은퇴시켜도 이 목록만 최신 ID로 바꾸면 됩니다. (대시보드 AI > Models 에서 확인)
const TEXT_MODELS = [
  "@cf/meta/llama-3.3-70b-instruct-fp8-fast", // 똑똑한 플래그십 (기본 = 품질 우선)
  "@cf/meta/llama-4-scout-17b-16e-instruct",  // 최신 세대 (대체 1)
  "@cf/meta/llama-3.1-8b-instruct-fast",      // 8B 빠른 변형 (대체 2)
  "@cf/meta/llama-3.2-3b-instruct",           // 작은 모델 (최후 대체)
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

// 여러 텍스트 모델을 순서대로 시도하고, 폐기/미존재 오류면 다음 모델로 자동 대체한다.
// 무료 한도 초과 같은 "정상적인" 오류는 그대로 위로 던져서 사용자에게 알린다.
async function runText(env, messages, maxTokens = 1024) {
  let lastErr = "";
  for (const model of TEXT_MODELS) {
    try {
      const r = await env.AI.run(model, { messages, max_tokens: maxTokens });
      const text = (r && r.response) || "";
      // 일부 폐기 모델은 에러를 응답 본문에 담아 돌려주기도 함 → 다음 모델로
      if (/deprecat|retired|no longer available|\b5028\b/i.test(text)) {
        lastErr = text;
        continue;
      }
      if (text) return text;
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

// ---------- 진입점 ----------
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    try {
      if (request.method === "POST" && path === "/api/chat") return await handleChat(request, env);
      if (request.method === "POST" && path === "/api/email-reply") return await handleEmailReply(request, env);
      if (request.method === "POST" && path === "/interactions") return await handleDiscord(request, env, ctx);
    } catch (err) {
      return json({ error: String((err && err.message) || err) }, 500);
    }

    // API가 아니면 정적 파일(웹페이지)로
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
    { role: "system", content: "너는 친절한 한국어 AI 비서다. 사용자의 질문에 정확하고 간결하게 답한다." },
    ...msgs,
  ];
  const answer = await runText(env, withSystem, 1024);
  return json({ answer });
}

// ---------- 메일 답장 초안 ----------
async function handleEmailReply(request, env) {
  const { email, keywords, tone } = await request.json();
  if (!email) return json({ error: "메일 내용이 필요합니다." }, 400);

  const sys =
    "너는 한국어 이메일 답장 작성 도우미다. 받은 메일을 이해하고 예의 바르고 자연스러운 답장 초안을 작성한다. " +
    "확실하지 않아 사용자가 직접 채워야 하는 부분은 [대괄호]로 표시한다.";
  let user = "다음은 내가 받은 메일이야:\n\n" + email + "\n\n이 메일에 대한 답장 초안을 작성해줘.";
  if (keywords && keywords.trim()) user += "\n\n답장에 아래 내용/키워드를 반드시 반영해줘:\n" + keywords;
  if (tone && tone.trim()) user += "\n\n말투/톤: " + tone;

  const draft = await runText(
    env,
    [
      { role: "system", content: sys },
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
      const answer = await runText(
        env,
        [
          { role: "system", content: "너는 친절한 한국어 AI 비서다. 간결하게 답한다." },
          { role: "user", content: opts.message || "" },
        ],
        800
      );
      await patchFollowup(followupUrl, { content: (answer || "(빈 응답)").slice(0, 1900) });
    } else if (name === "email") {
      const answer = await runText(
        env,
        [
          { role: "system", content: "너는 한국어 이메일 답장 도우미다. 예의 바른 답장 초안을 작성한다." },
          { role: "user", content: "다음 메일에 대한 답장 초안을 써줘:\n\n" + (opts.content || "") },
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
