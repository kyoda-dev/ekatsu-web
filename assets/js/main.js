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
