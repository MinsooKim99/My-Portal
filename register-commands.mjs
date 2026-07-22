// 디스코드 슬래시 명령을 등록하는 스크립트 (최초 1회, 그리고 명령을 바꿀 때마다 실행)
//
// 사용법:
//   DISCORD_APP_ID=앱ID DISCORD_TOKEN=봇토큰 node register-commands.mjs
//
// (윈도우 PowerShell 예시)
//   $env:DISCORD_APP_ID="앱ID"; $env:DISCORD_TOKEN="봇토큰"; node register-commands.mjs

const APP_ID = process.env.DISCORD_APP_ID;
const TOKEN = process.env.DISCORD_TOKEN;

if (!APP_ID || !TOKEN) {
  console.error("환경변수 DISCORD_APP_ID 와 DISCORD_TOKEN 을 설정한 뒤 실행해주세요.");
  process.exit(1);
}

// type: 3 = 문자열(STRING) 옵션
const commands = [
  {
    name: "chat",
    description: "AI에게 질문하기",
    options: [
      { name: "message", description: "질문 내용", type: 3, required: true },
    ],
  },
  {
    name: "email",
    description: "받은 메일 내용으로 답장 초안 만들기",
    options: [
      { name: "content", description: "받은 메일 내용", type: 3, required: true },
    ],
  },
];

const url = `https://discord.com/api/v10/applications/${APP_ID}/commands`;

const res = await fetch(url, {
  method: "PUT",
  headers: {
    Authorization: `Bot ${TOKEN}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify(commands),
});

if (res.ok) {
  const data = await res.json();
  console.log("✅ 슬래시 명령 등록 완료:", data.map((c) => "/" + c.name).join(", "));
} else {
  console.error("❌ 등록 실패:", res.status, await res.text());
  process.exit(1);
}
