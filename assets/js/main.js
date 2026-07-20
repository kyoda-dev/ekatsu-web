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
