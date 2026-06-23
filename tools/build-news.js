// =========================================================
// お知らせ詳細ページ生成ツール
//   news_data.json（Studio /info から取得した本文データ）を読み、
//   news/<slug>.html を1記事ずつ生成する。
//   実行： cd tools && node build-news.js
//   ※ news_data.json は fetch_news.js（Desktop/.xlsx-build）で更新したら
//     このフォルダにコピーして使う。
// =========================================================
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DATA = path.join(__dirname, "news_data.json");
const OUT_DIR = path.join(ROOT, "news");

// json の slug → 出力ファイル名 / OGP用サムネ の対応表（表示順は news_data.json 内の date 降順）
const META = {
  "0jqGFiu6": { file: "vitalize",       thumb: "assets/img/news/vitalize.jpg" },
  "-fqin5W2": { file: "progress",       thumb: "assets/img/news/progress.webp" },
  "_xVv3mtw": { file: "shiramine",      thumb: "assets/img/news/shiramine.webp" },
  "Jqe_jm1U": { file: "vtuber-recruit", thumb: "assets/img/news/vtuber-recruit.webp" },
  "EuGsWzHU": { file: "ekatsu-cup",     thumb: "assets/img/news/ekatsu-cup.webp" },
  "-U6C5PkP": { file: "magmag",         thumb: "assets/img/news/magmag-contract.webp" },
  "zWFaBsC-": { file: "gamespark",      thumb: "assets/img/news/gamespark.webp" },
  "sZIxQQZi": { file: "project-intro",  thumb: "assets/img/news/project-intro.webp" },
};

const esc = (s) =>
  String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Studio由来の本文HTMLを掃除して読みやすくする
function cleanBody(html) {
  let s = html;
  s = s.replace(/\s+data-(uid|time|thread|has-link)="[^"]*"/g, ""); // 内部用属性を除去
  s = s.replace(/\s+style=""/g, "");
  s = s.replace(/\s+rel=""/g, "");
  s = s.replace(/\s+(width|height)=""/g, "");                        // 空の width/height
  s = s.replace(/<figcaption>\s*<\/figcaption>/g, "");               // 空キャプション
  s = s.replace(/<img /g, '<img loading="lazy" ');                   // 画像は遅延読み込み
  s = s.replace(/<a target="_blank" href=/g, '<a target="_blank" rel="noopener" href='); // 外部リンク安全化
  s = s.replace(/<p>\s*<\/p>/g, "");                                 // 空段落
  s = s.replace(/<figure>\s*<\/figure>/g, "");                       // 空figure
  return s.trim();
}

function page({ title, excerpt, iso, date, body, thumb }) {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>${esc(title)} ｜ お知らせ ｜ e活</title>
  <meta name="description" content="${esc(excerpt)}" />

  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(title)} ｜ e活" />
  <meta property="og:description" content="${esc(excerpt)}" />
  <meta property="og:image" content="../${thumb}" />

  <link rel="icon" type="image/webp" href="../assets/img/logo.webp" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap" rel="stylesheet" />

  <link rel="stylesheet" href="../assets/css/styles.css" />
</head>
<body>

  <!-- ===== 左右の縦書き固定テキスト ===== -->
  <span class="side-rail side-rail--left">A&amp;L project 株式会社</span>
  <span class="side-rail side-rail--right">eスポーツに社会的意義を</span>

  <!-- ===== ヘッダー（ナビ＋ロゴ） ===== -->
  <header class="site-header" id="top">
    <nav class="nav">
      <a href="../index.html#message">ご挨拶</a>
      <a href="../works.html">協賛大会</a>
      <a href="../vtuber.html">VTuber</a>
      <a href="../news.html">お知らせ</a>
      <a href="../index.html#company">会社情報</a>
      <a href="../index.html#contact">お問い合わせ</a>
    </nav>
    <a href="../index.html" class="brand">
      <img src="../assets/img/logo.webp" alt="e活 ロゴ" width="120" />
    </a>
  </header>

  <main>
    <article class="article">
      <header class="article__head reveal">
        <p class="eyebrow">news</p>
        <time class="article__date" datetime="${iso}">${date}</time>
        <h1 class="article__title">${esc(title)}</h1>
      </header>

      <div class="article__body reveal">
        ${body}
      </div>

      <div class="article__nav reveal">
        <a class="btn" href="../news.html">← お知らせ一覧へ戻る</a>
      </div>
    </article>
  </main>

  <!-- ===== フッター ===== -->
  <footer class="site-footer">
    <img src="../assets/img/logo.webp" alt="e活 ロゴ" width="90" class="site-footer__logo" />
    <p class="site-footer__copy">&copy; <a href="https://alonzo.jp" target="_blank" rel="noopener">A&amp;L project 株式会社</a> / e活</p>
  </footer>

  <script src="../assets/js/main.js"></script>
</body>
</html>
`;
}

(function main() {
  const data = JSON.parse(fs.readFileSync(DATA, "utf8"));
  let n = 0;
  for (const a of data) {
    const meta = META[a.slug];
    if (!meta) {
      console.warn(`! META未定義のためスキップ: ${a.slug} (${a.title})`);
      continue;
    }
    const html = page({
      title: a.title,
      excerpt: a.excerpt,
      iso: a.iso,
      date: a.date,
      body: cleanBody(a.body),
      thumb: meta.thumb,
    });
    const dest = path.join(OUT_DIR, `${meta.file}.html`);
    fs.writeFileSync(dest, html, "utf8");
    console.log(`✓ news/${meta.file}.html  ←  ${a.title}`);
    n++;
  }
  console.log(`\n→ ${n}件の詳細ページを生成しました（news/）`);
})();
