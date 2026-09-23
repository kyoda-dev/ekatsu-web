/* =========================================================
   e活 サイト スクリプト
   - スクロールで要素を「ふわっ」と表示するだけのシンプルな処理
   ========================================================= */
(function () {
  "use strict";

  const targets = document.querySelectorAll(".reveal");
  if (!targets.length) return;

  // IntersectionObserver 非対応ブラウザでは即表示
  if (!("IntersectionObserver" in window)) {
    targets.forEach((el) => el.classList.add("is-visible"));
    return;
  }

  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target); // 一度表示したら監視解除
        }
      });
    },
    { threshold: 0.15, rootMargin: "0px 0px -8% 0px" }
  );

  targets.forEach((el) => observer.observe(el));
})();

/* =========================================================
   協賛大会（works）: 「これからの大会」の後始末だけをする。
   ★2026-09-23 依田指示で作りを変えた。
     それまではここで「未開催のカードを全部隠す」ことをしていたので、
     公開サイトに次の予定が1つも出ていなかった（HTMLには入っていたのに見えないだけ）。
     いまは build-works.js が「これから」と「これまで」の2段に分けて作る。
   ここに残すのは、作り直し（6時間ごと）とのすき間を埋めるぶんだけ：
     ・カレンダーの「今日」「過ぎた日」の印を付ける（ビルド時刻を焼き込むと日付をまたいでずれる）
     ・data-last（そのシリーズの最後の日）が過ぎたカードは隠す
     ・「これから」が空になったら、見出しごと section を消す
   ========================================================= */
(function () {
  "use strict";
  const sec = document.getElementById("worksUpcomingSec");
  if (!sec) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // カレンダーの日付に印を付ける
  const pad = (n) => String(n).padStart(2, "0");
  const todayIso = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  sec.querySelectorAll(".wcal__cell[data-d]").forEach((cell) => {
    const d = cell.getAttribute("data-d");
    if (d === todayIso) cell.classList.add("is-today");
    else if (d < todayIso) cell.classList.add("is-past");   // YYYY-MM-DD は文字のまま比べられる
  });

  const cards = sec.querySelectorAll(".work-card");
  let alive = 0;
  cards.forEach((card) => {
    const last = card.getAttribute("data-last");
    const d = last ? new Date(last) : null;
    if (d && !isNaN(d.getTime())) {
      d.setHours(0, 0, 0, 0);
      if (d.getTime() < today.getTime()) {
        card.style.display = "none"; // 終わった → 次の作り直しで「これまで」へ移る
        return;
      }
    }
    alive++;
  });

  if (!alive) sec.style.display = "none";
})();

/* =========================================================
   閲覧数カウント：現在ページを /api/hit に1回だけ通知する。
   - 計測キーは URL から算出（index.html / .html / 末尾スラッシュを除去）。
     例: /news/ekatsu-cup.html → /news/ekatsu-cup 、 / → /
   - 1ブラウザセッションにつき同一ページ1回だけ（リロード連打で増えない）。
   - 失敗しても本文表示には一切影響させない（握りつぶす）。
   ========================================================= */
(function () {
  "use strict";
  try {
    let key = location.pathname.replace(/index\.html$/, "").replace(/\.html$/, "");
    if (key.length > 1) key = key.replace(/\/$/, "");
    if (key === "") key = "/";
    if (!/^\/[a-z0-9\-/]*$/.test(key)) return; // 想定外パスは送らない

    const seen = "hv:" + key;
    if (sessionStorage.getItem(seen)) return; // このセッションでは計測済み
    sessionStorage.setItem(seen, "1");

    const body = JSON.stringify({ path: key });
    if (navigator.sendBeacon) {
      navigator.sendBeacon("/api/hit", new Blob([body], { type: "application/json" }));
    } else {
      fetch("/api/hit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body,
        keepalive: true,
      }).catch(function () {});
    }
  } catch (e) {
    /* 計測は失敗しても無視 */
  }
})();

/* =========================================================
   2026-09-07 追加：協賛企業への「送客」を数える。
   これまでは e活サイトのページが見られた回数しか無く、
   「配信を見た人が何人、協賛企業の商品ページまで行ったか」が1件も取れていなかった。
   協賛の営業でいちばん効く数字なので、ここで拾う。

   ① 外に出ていくリンクを押した数   → /out/<行き先のドメイン>
   ② QRから来た人                  → /qr/<開いたページ>
        QRの飛び先URLの末尾に「?f=qr」を付けると、そこから来た人だけ数えられる。
        付けるまでは0のまま（勝手に増えることはない）。

   決まりごと
   - 計測キーは受け口(/api/hit)が通す形だけ＝小文字・数字・ハイフン・スラッシュ
   - 1ブラウザセッションにつき同じ行き先は1回だけ（連打で増えない）
   - 自社のドメインは数えない（外へ送った数を見たいので）
   - 失敗しても本文とリンクの動作には一切影響させない
   ========================================================= */
(function () {
  "use strict";
  var OURS = /(^|\.)(ekatsu-web\.pages\.dev|alonzo\.jp)$/i;   // 自社＝送客ではない
  var slug = function (s) {
    return String(s).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  };
  var send = function (key) {
    try {
      if (!/^\/[a-z0-9\-/]*$/.test(key) || key.length > 128) return;
      var seen = "hv:" + key;
      if (sessionStorage.getItem(seen)) return;
      sessionStorage.setItem(seen, "1");
      var body = JSON.stringify({ path: key });
      if (navigator.sendBeacon) {
        navigator.sendBeacon("/api/hit", new Blob([body], { type: "application/json" }));
      } else {
        fetch("/api/hit", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(function () {});
      }
    } catch (e) { /* 無視 */ }
  };

  // ② QRから来た人（?f=qr が付いていたら）
  try {
    var p = new URLSearchParams(location.search);
    if ((p.get("f") || "").toLowerCase() === "qr") {
      var page = location.pathname.replace(/index\.html$/, "").replace(/\.html$/, "");
      if (page.length > 1) page = page.replace(/\/$/, "");
      send("/qr" + (page === "" || page === "/" ? "/top" : page));
    }
  } catch (e) { /* 無視 */ }

  // ① 外へ出ていくリンク
  document.addEventListener("click", function (ev) {
    try {
      var a = ev.target && ev.target.closest ? ev.target.closest("a[href]") : null;
      if (!a) return;
      var u = new URL(a.getAttribute("href"), location.href);
      if (u.protocol !== "http:" && u.protocol !== "https:") return;
      if (u.hostname === location.hostname || OURS.test(u.hostname)) return;
      send("/out/" + slug(u.hostname));
    } catch (e) { /* 無視 */ }
  }, true);   // 押した瞬間に拾う（ページが移る前に投げる）
})();
