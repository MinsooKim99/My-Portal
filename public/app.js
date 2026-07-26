/* ===== 나의 포털 · 공통 로직 (로그인 가드 / 테마 / 설정 / 메뉴) ===== */
(function () {
  // ---- 로그인 가드: 로그인 페이지가 아니고 세션 쿠키(mp_auth)가 없으면 로그인 화면으로 ----
  var _pg = document.body && document.body.getAttribute("data-page");
  if (_pg !== "login" && !/(?:^|; )mp_auth=1(?:;|$)/.test(document.cookie)) {
    location.replace("login.html");
    return;
  }

  var LS_THEME = "mp-theme", LS_NAME = "mp-name", LS_ORG = "mp-org", LS_ROLE = "mp-role", LS_ID = "mp-id";

  /* ---------- 간단한 마크다운 → HTML (외부 라이브러리 없음) ----------
     AI 응답에 HTML 이 섞여 있어도 안전하도록 먼저 escape 한 뒤 변환한다. */
  function escHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }
  function mdToHtml(src) {
    var text = String(src == null ? "" : src);

    // 1) 코드블록은 내용 변환 없이 먼저 분리
    var blocks = [];
    text = text.replace(/```[a-zA-Z0-9_+#.-]*\n?([\s\S]*?)```/g, function (m, code) {
      blocks.push('<pre class="md-pre"><code>' + escHtml(code.replace(/\n$/, "")) + "</code></pre>");
      return "\u0000B" + (blocks.length - 1) + "\u0000";
    });

    // 2) 남은 본문 escape
    text = escHtml(text);

    // 3) 인라인 코드 분리
    var inline = [];
    text = text.replace(/`([^`\n]+)`/g, function (m, c) {
      inline.push('<code class="md-code">' + c + "</code>");
      return "\u0000I" + (inline.length - 1) + "\u0000";
    });

    // 4) 링크 → 굵게 → 기울임
    text = text.replace(/\[([^\]\n]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    text = text.replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
    text = text.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");

    // 5) 줄 단위: 헤딩 / 목록 / 인용 / 단락
    var lines = text.split("\n"), out = [], listType = null;
    function closeList() { if (listType) { out.push(listType === "ul" ? "</ul>" : "</ol>"); listType = null; } }
    lines.forEach(function (ln) {
      var t = ln.trim(), m;
      if (!t) { closeList(); return; }
      if (/^\u0000B\d+\u0000$/.test(t)) { closeList(); out.push(t); return; }   // 코드블록 자리
      if ((m = t.match(/^(#{1,4})\s+(.*)$/))) { closeList(); out.push('<div class="md-h">' + m[2] + "</div>"); return; }
      if ((m = t.match(/^[-*]\s+(.*)$/))) {
        if (listType !== "ul") { closeList(); out.push('<ul class="md-list">'); listType = "ul"; }
        out.push("<li>" + m[1] + "</li>"); return;
      }
      if ((m = t.match(/^\d+\.\s+(.*)$/))) {
        if (listType !== "ol") { closeList(); out.push('<ol class="md-list">'); listType = "ol"; }
        out.push("<li>" + m[1] + "</li>"); return;
      }
      if ((m = t.match(/^&gt;\s?(.*)$/))) { closeList(); out.push('<blockquote class="md-q">' + m[1] + "</blockquote>"); return; }
      closeList();
      out.push('<p class="md-p">' + ln + "</p>");
    });
    closeList();

    // 6) 자리표시자 복원
    var html = out.join("");
    html = html.replace(/\u0000I(\d+)\u0000/g, function (m, i) { return inline[+i]; });
    html = html.replace(/\u0000B(\d+)\u0000/g, function (m, i) { return blocks[+i]; });
    return html;
  }
  var mq = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function pref() {
    var p = localStorage.getItem(LS_THEME);
    return (p === "light" || p === "dark" || p === "system") ? p : "system";
  }
  function resolved() {
    var p = pref();
    if (p === "system") return (mq && mq.matches) ? "dark" : "light";
    return p;
  }
  function applyTheme() {
    document.documentElement.setAttribute("data-theme", resolved());
    var p = pref();
    document.querySelectorAll(".seg-btn[data-set]").forEach(function (b) {
      b.classList.toggle("active", b.getAttribute("data-set") === p);
    });
  }
  function setTheme(p) { localStorage.setItem(LS_THEME, p); applyTheme(); }

  function getName() { return localStorage.getItem(LS_NAME) || "사용자"; }
  function getOrg() { return localStorage.getItem(LS_ORG) || ""; }
  function initial(n) { n = (n || "").trim(); return n ? n[0] : "U"; }

  function applyProfile() {
    var n = getName(), o = getOrg();
    document.querySelectorAll(".js-name").forEach(function (e) { e.textContent = n; });
    document.querySelectorAll(".js-org").forEach(function (e) { e.textContent = o; });
    document.querySelectorAll(".js-initial").forEach(function (e) { e.textContent = initial(n); });
    document.querySelectorAll(".js-greet").forEach(function (e) { e.textContent = "무엇을 도와드릴까요, " + n + "님?"; });
  }

  // 프로필을 서버(계정)에 저장 (계정 귀속). 입력 중엔 디바운스.
  var saveT;
  function saveProfile() {
    clearTimeout(saveT);
    saveT = setTimeout(function () {
      fetch("/api/profile", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: getName(), org: getOrg() }) });
    }, 500);
  }

  // 관리자 전용 '사용자 관리' 메뉴 추가
  function injectAdminNav() {
    var nav = document.querySelector(".nav");
    if (!nav || nav.querySelector('[data-nav="admin"]')) return;
    var a = document.createElement("a");
    a.className = "nav-item";
    a.setAttribute("data-nav", "admin");
    a.href = "admin.html";
    a.innerHTML = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 4 5v6c0 5 3.4 8.3 8 10 4.6-1.7 8-5 8-10V5l-8-3Z"></path><path d="M9.2 12.1l1.9 1.9 3.7-3.9"></path></svg><span>사용자 관리</span>';
    nav.appendChild(a);
    if (document.body.getAttribute("data-page") === "admin") a.classList.add("active");
  }
  function removeAdminNav() {
    var a = document.querySelector('.nav-item[data-nav="admin"]');
    if (a) a.remove();
  }

  // 설정창에 '비밀번호 변경' 섹션 추가 (관리자 비번은 환경변수라 제외)
  function injectPasswordSection(role) {
    var body = document.querySelector("#settingsModal .modal-body");
    if (!body || document.getElementById("pwSection") || role === "admin") return;
    var sec = document.createElement("section");
    sec.id = "pwSection";
    sec.innerHTML =
      '<div class="set-title">비밀번호 변경</div>' +
      '<div class="set-fields">' +
      '<div><label>현재 비밀번호</label><input id="curPw" type="password" class="set-input" placeholder="현재 비밀번호"></div>' +
      '<div><label>새 비밀번호</label><input id="newPw" type="password" class="set-input" placeholder="4자 이상"></div>' +
      "</div>" +
      '<div style="display:flex;align-items:center;gap:10px;margin-top:12px">' +
      '<button id="pwBtn" class="btn btn-primary" style="padding:9px 16px;font-size:13.5px">변경</button>' +
      '<span id="pwMsg" style="font-size:13px;color:var(--muted2)"></span></div>';
    body.appendChild(sec);

    document.getElementById("pwBtn").addEventListener("click", function () {
      var cur = document.getElementById("curPw"), nw = document.getElementById("newPw");
      var msg = document.getElementById("pwMsg"), btn = this;
      if (!nw.value || nw.value.length < 4) { msg.textContent = "새 비밀번호는 4자 이상이어야 합니다."; return; }
      btn.disabled = true; msg.textContent = "변경 중…";
      fetch("/api/password", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ currentPw: cur.value, newPw: nw.value }),
      }).then(function (r) { return r.json(); }).then(function (d) {
        if (d && d.ok) { msg.textContent = "변경되었습니다 ✓"; cur.value = ""; nw.value = ""; }
        else msg.textContent = (d && d.error) || "변경 실패";
      }).catch(function (e) { msg.textContent = "오류: " + e.message; })
        .finally(function () { btn.disabled = false; });
    });
  }

  // 서버에서 내 계정 정보(이름·소속·역할) 로드
  function loadMe() {
    fetch("/api/me").then(function (r) {
      if (r.status === 401) { location.replace("login.html"); return null; }
      return r.json();
    }).then(function (d) {
      if (!d) return;
      if (d.name != null) localStorage.setItem(LS_NAME, d.name);
      if (d.org != null) localStorage.setItem(LS_ORG, d.org);
      applyProfile();
      var sn = document.getElementById("setName"), so = document.getElementById("setOrg");
      if (sn) sn.value = getName();
      if (so) so.value = getOrg();
      // 역할·계정ID를 캐시 (역할: 메뉴 깜박임 방지 / ID: 기기 내 계정별 대화 분리)
      try {
        localStorage.setItem(LS_ROLE, d.role || "user");
        if (d.id) localStorage.setItem(LS_ID, d.id);
      } catch (e) {}
      if (d.role === "admin") injectAdminNav(); else removeAdminNav();
      injectPasswordSection(d.role);
      window.MP.me = d;
    }).catch(function () {});
  }

  function dateLabel() {
    var d = new Date(), days = ["일", "월", "화", "수", "목", "금", "토"];
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + days[d.getDay()] + "요일";
  }

  // 캐시된 역할이 관리자면 즉시(첫 렌더에) 메뉴를 넣는다 → 뒤늦게 나타나 깜박이는 현상 방지.
  // app.js 는 </body> 직전에 로드되므로 이 시점에 .nav 가 이미 존재한다.
  try { if (localStorage.getItem(LS_ROLE) === "admin") injectAdminNav(); } catch (e) {}

  document.addEventListener("DOMContentLoaded", function () {
    applyTheme();
    applyProfile();
    if (mq && mq.addEventListener) mq.addEventListener("change", function () { if (pref() === "system") applyTheme(); });

    var dl = document.querySelector(".js-date");
    if (dl) dl.textContent = dateLabel();

    // theme segmented (sidebar + modal)
    document.querySelectorAll(".seg-btn[data-set]").forEach(function (b) {
      b.addEventListener("click", function () { setTheme(b.getAttribute("data-set")); });
    });

    // active nav
    var page = document.body.getAttribute("data-page");
    document.querySelectorAll(".nav-item[data-nav]").forEach(function (a) {
      a.classList.toggle("active", a.getAttribute("data-nav") === page);
    });

    // user menu
    var wrap = document.querySelector(".user-wrap");
    var btn = document.getElementById("userBtn");
    var menu = document.getElementById("userMenu");
    if (btn && menu) {
      btn.addEventListener("click", function (e) { e.stopPropagation(); menu.classList.toggle("hidden"); });
      document.addEventListener("click", function (e) {
        if (wrap && !wrap.contains(e.target)) menu.classList.add("hidden");
      });
    }

    // settings modal
    var modal = document.getElementById("settingsModal");
    var open = document.getElementById("openSettings");
    var closes = document.querySelectorAll(".js-close-settings");
    function openModal() { if (menu) menu.classList.add("hidden"); if (modal) modal.classList.remove("hidden"); }
    function closeModal() { if (modal) modal.classList.add("hidden"); }
    if (open) open.addEventListener("click", openModal);
    closes.forEach(function (c) { c.addEventListener("click", closeModal); });
    if (modal) modal.addEventListener("click", function (e) { if (e.target === modal) closeModal(); });

    var setName = document.getElementById("setName"), setOrg = document.getElementById("setOrg");
    if (setName) { setName.value = getName(); setName.addEventListener("input", function () { localStorage.setItem(LS_NAME, setName.value); applyProfile(); saveProfile(); }); }
    if (setOrg) { setOrg.value = getOrg(); setOrg.addEventListener("input", function () { localStorage.setItem(LS_ORG, setOrg.value); applyProfile(); saveProfile(); }); }

    // 로그아웃 (사이드바 유저 메뉴의 '로그아웃' 버튼)
    var logoutBtn = document.querySelector(".menu-item.muted");
    if (logoutBtn) logoutBtn.addEventListener("click", function () {
      try { localStorage.removeItem(LS_ROLE); } catch (e) {}
      fetch("/api/logout", { method: "POST" }).finally(function () { location.href = "login.html"; });
    });

    // 모바일 사이드바 토글 (사이드바가 있는 페이지에서만)
    if (document.querySelector(".side")) {
      var navToggle = document.createElement("button");
      navToggle.className = "nav-toggle";
      navToggle.setAttribute("aria-label", "메뉴");
      navToggle.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 6h16M4 12h16M4 18h16"></path></svg>';
      var backdrop = document.createElement("div");
      backdrop.className = "nav-backdrop";
      document.body.appendChild(navToggle);
      document.body.appendChild(backdrop);
      function closeNav() { document.body.classList.remove("nav-open"); }
      navToggle.addEventListener("click", function () { document.body.classList.toggle("nav-open"); });
      backdrop.addEventListener("click", closeNav);
      document.querySelectorAll(".nav-item").forEach(function (a) { a.addEventListener("click", closeNav); });
    }

    // 로그인 페이지가 아니면 서버에서 계정 정보 로드
    if (_pg !== "login") loadMe();
  });

  // expose for pages
  window.MP = {
    dateLabel: dateLabel,
    md: mdToHtml,                                                   // 마크다운 → HTML
    accountId: function () { return localStorage.getItem(LS_ID) || "guest"; },
  };
})();
