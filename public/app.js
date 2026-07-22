/* ===== 나의 포털 · 공통 로직 (로그인 가드 / 테마 / 설정 / 메뉴) ===== */
(function () {
  // ---- 로그인 가드: 로그인 페이지가 아니고 세션 쿠키(mp_auth)가 없으면 로그인 화면으로 ----
  var _pg = document.body && document.body.getAttribute("data-page");
  if (_pg !== "login" && !/(?:^|; )mp_auth=1(?:;|$)/.test(document.cookie)) {
    location.replace("login.html");
    return;
  }

  var LS_THEME = "mp-theme", LS_NAME = "mp-name", LS_ORG = "mp-org";
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

  function getName() { return localStorage.getItem(LS_NAME) || "민수"; }
  function getOrg() { return localStorage.getItem(LS_ORG) || "토마토시스템"; }
  function initial(n) { n = (n || "").trim(); return n ? n[0] : "민"; }

  function applyProfile() {
    var n = getName(), o = getOrg();
    document.querySelectorAll(".js-name").forEach(function (e) { e.textContent = n; });
    document.querySelectorAll(".js-org").forEach(function (e) { e.textContent = o; });
    document.querySelectorAll(".js-initial").forEach(function (e) { e.textContent = initial(n); });
    document.querySelectorAll(".js-greet").forEach(function (e) { e.textContent = "무엇을 도와드릴까요, " + n + "님?"; });
  }

  function dateLabel() {
    var d = new Date(), days = ["일", "월", "화", "수", "목", "금", "토"];
    return (d.getMonth() + 1) + "월 " + d.getDate() + "일 " + days[d.getDay()] + "요일";
  }

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
    if (setName) { setName.value = getName(); setName.setAttribute("value", getName()); setName.addEventListener("input", function () { localStorage.setItem(LS_NAME, setName.value); applyProfile(); }); }
    if (setOrg) { setOrg.value = getOrg(); setOrg.setAttribute("value", getOrg()); setOrg.addEventListener("input", function () { localStorage.setItem(LS_ORG, setOrg.value); applyProfile(); }); }

    // 로그아웃 (사이드바 유저 메뉴의 '로그아웃' 버튼)
    var logoutBtn = document.querySelector(".menu-item.muted");
    if (logoutBtn) logoutBtn.addEventListener("click", function () {
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
  });

  // expose for pages
  window.MP = { dateLabel: dateLabel };
})();
