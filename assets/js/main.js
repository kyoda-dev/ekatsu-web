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
   協賛大会（works）: まだ開催されていない大会カードは非表示にする。
   各カードの <time datetime="YYYY-MM-DD"> を見て、開催日が「今日」より後なら隠す。
   → 日付が過ぎれば次回アクセス時に自動的に表示される（再ビルド不要）。
   ※ 日付なし（毎週・定期開催）のカードは常に表示。
   ========================================================= */
(function () {
  "use strict";
  const cards = document.querySelectorAll(".work-card");
  if (!cards.length) return;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  cards.forEach((card) => {
    const t = card.querySelector("time[datetime]");
    if (!t) return; // 日付なし（毎週/定期）は常に表示
    const d = new Date(t.getAttribute("datetime"));
    if (isNaN(d.getTime())) return;
    d.setHours(0, 0, 0, 0);
    if (d.getTime() > today.getTime()) {
      card.style.display = "none"; // 未開催 → 非表示
    }
  });
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
