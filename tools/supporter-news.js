/* =========================================================
   supporter-news.js
   新しく掲載したサポーターの「お知らせ記事」と、その見出し画像を作る。
   build-vtuber.js から呼ばれる（単体では使わない）。

   形は news/next-2026-06.html（今月のネクストVTuber）に合わせてある。
   ・見出し画像 1280x720（薄いグラデ／左上にe活ロゴ／大見出し／丸い顔アイコン＋名前）
   ・記事は「リード文 → 1人1行の箇条書き → 一覧ページへの導線 → 募集の一文」

   ★2026-08-29 依田の指示
     ・呼び方は「e活カジュアルサポーター」（旧「ネクストVTuber」は使わない）
     ・記事は**掲載した週ごとに1本**（月まとめではない）
     ・この記事をXでもポストする → tools/supporter_news.json に記録し、Botがそれを読む
   ========================================================= */
const fs = require("fs");
const path = require("path");
const sharp = require("sharp");

const ROOT = path.join(__dirname, "..");
const NEWS_DIR = path.join(ROOT, "news");
const NEWS_IMG_DIR = path.join(ROOT, "assets", "img", "news");
const VT_IMG_DIR = path.join(ROOT, "assets", "img", "vtuber");
const LOGO = path.join(ROOT, "assets", "img", "logo.webp");
const INDEX_JSON = path.join(__dirname, "supporter_news.json");
const SITE = "https://ekatsu-web.pages.dev";

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// 日本語が出るフォント。GitHub Actions では workflow で fonts-noto-cjk を入れている。
const FONT = "'Noto Sans JP','Noto Sans CJK JP','Yu Gothic','Meiryo','Hiragino Sans',sans-serif";

// ---- 見出し画像 -------------------------------------------------------------
// 1280x720。人数に合わせて丸アイコンの大きさと間隔を変える。
async function buildBanner(people, dateLabel, outPath) {
  const W = 1280, H = 720;
  const n = Math.max(1, people.length);
  // 3人までは大きく、増えたら小さくして1列に収める
  const d = n <= 3 ? 250 : n <= 4 ? 215 : n <= 5 ? 180 : 155;
  const gap = n <= 3 ? 80 : n <= 5 ? 50 : 34;
  const totalW = n * d + (n - 1) * gap;
  const startX = Math.round((W - totalW) / 2);
  const cy = 430;                       // 円の中心の高さ
  const top = Math.round(cy - d / 2);

  // 背景（薄いグラデ）＋見出し。文字はSVGで描く。
  // 見出しは左上のロゴにぶつからない大きさまで自動で縮める。
  //   （元にした「NEXT VTuber」は短かったが「CASUAL SUPPORTER」は長く、74pxだとロゴに当たる）
  const title = "CASUAL SUPPORTER";
  const LOGO_W = 140, LOGO_X = 76, MIN_GAP = 70;
  const logoRight = LOGO_X + LOGO_W;
  let titleSize = 74;
  // 太字の欧文はだいたい「字数 × 文字サイズ × 0.62」の幅になる
  while (titleSize > 44 && (W / 2 - (title.length * titleSize * 0.62) / 2) < logoRight + MIN_GAP) titleSize -= 2;
  const svg = `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#fbf2ff"/>
      <stop offset="45%" stop-color="#eef1ff"/>
      <stop offset="100%" stop-color="#e2f8ec"/>
    </linearGradient>
    <!-- 顔まわりをふわっと明るくする。のっぺりしないように（2026-08-29 依田「もう少し明るめ」） -->
    <radialGradient id="glow" cx="50%" cy="60%" r="62%">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.45"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <text x="${W / 2}" y="145" font-family="${FONT}" font-size="${titleSize}" font-weight="700"
        fill="#14110f" text-anchor="middle" letter-spacing="2">${esc(title)}</text>
  <text x="${W / 2}" y="205" font-family="${FONT}" font-size="27" font-weight="500"
        fill="#8c8682" text-anchor="middle">${esc(dateLabel)} ｜ e活カジュアルサポーター</text>
  ${people.map((p, i) => {
    const x = startX + i * (d + gap) + d / 2;
    // 名前が長いと隣とぶつかるので、枠に収まるまで字を小さくする
    const nm = String(p.displayName || p.name);
    const size = Math.max(17, Math.min(30, Math.floor((d + gap - 8) / (nm.length * 0.95))));
    return `<text x="${x}" y="${cy + d / 2 + 48}" font-family="${FONT}" font-size="${size}" font-weight="700"
        fill="#14110f" text-anchor="middle">${esc(nm)}</text>`;
  }).join("\n  ")}
</svg>`;

  const layers = [{ input: Buffer.from(svg), top: 0, left: 0 }];

  // 左上のe活ロゴ
  try {
    const logo = await sharp(LOGO).resize({ width: LOGO_W }).png().toBuffer();
    const lm = await sharp(logo).metadata();
    layers.push({ input: logo, top: 62, left: LOGO_X, blend: "over" });
    void lm;
  } catch (e) { console.warn("  ロゴを載せられなかった:", e.message); }

  // 丸く切り抜いた顔アイコン（白フチ付き）
  const r = Math.round(d / 2);
  const mask = Buffer.from(`<svg width="${d}" height="${d}"><circle cx="${r}" cy="${r}" r="${r}" fill="#fff"/></svg>`);
  const ring = Buffer.from(`<svg width="${d}" height="${d}"><circle cx="${r}" cy="${r}" r="${r - 3}" fill="none" stroke="#ffffff" stroke-width="6"/></svg>`);
  for (let i = 0; i < people.length; i++) {
    const icon = path.join(VT_IMG_DIR, `${people[i].slug}.webp`);
    if (!fs.existsSync(icon)) { console.warn(`  アイコンが無い: ${people[i].slug}`); continue; }
    const circ = await sharp(icon).resize(d, d, { fit: "cover" })
      .composite([{ input: mask, blend: "dest-in" }, { input: ring, blend: "over" }])
      .png().toBuffer();
    layers.push({ input: circ, top, left: startX + i * (d + gap) });
  }

  fs.mkdirSync(NEWS_IMG_DIR, { recursive: true });
  await sharp({ create: { width: W, height: H, channels: 4, background: "#ffffff" } })
    .composite(layers).webp({ quality: 90 }).toFile(outPath);
}

// ---- 記事本体 ---------------------------------------------------------------
function articleHtml({ title, iso, disp, imgFile, people }) {
  const items = people.map(p => {
    const x = String(p.xHandle || "").trim();
    const link = x ? ` <a target="_blank" rel="noopener" href="https://x.com/${x.replace(/^@/, "")}">${esc(x)}</a>` : "";
    return `          <li><strong>${esc(p.displayName)}</strong>｜${esc(p.bio)}${link}</li>`;
  }).join("\n");

  const lead = people.length === 1
    ? "e活が協賛する大会を、カジュアルに応援してくれる「e活カジュアルサポーター」に新しい仲間が加わりました。"
    : `e活が協賛する大会を、カジュアルに応援してくれる「e活カジュアルサポーター」に、新しく${people.length}名の仲間が加わりました。`;

  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />

  <title>${esc(title)} ｜ e活</title>
  <meta name="description" content="${esc(lead)}" />

  <meta property="og:type" content="article" />
  <meta property="og:title" content="${esc(title)} ｜ e活" />
  <meta property="og:description" content="${esc(lead)}" />
  <meta property="og:image" content="${SITE}/assets/img/news/${imgFile}" />

  <link rel="icon" type="image/png" sizes="32x32" href="/assets/img/favicon-32.png" />
  <link rel="icon" type="image/png" sizes="192x192" href="/assets/img/favicon-192.png" />
  <link rel="icon" type="image/png" sizes="512x512" href="/assets/img/favicon-512.png" />
  <link rel="apple-touch-icon" sizes="180x180" href="/assets/img/favicon-180.png" />

  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Noto+Sans+JP:wght@300;400;500;700&display=swap" rel="stylesheet" />

  <link rel="stylesheet" href="../assets/css/styles.css" />
</head>
<body>

  <span class="side-rail side-rail--left">A&amp;L project 株式会社</span>
  <span class="side-rail side-rail--right">eスポーツに社会的意義を</span>

  <header class="site-header" id="top">
    <nav class="nav">
      <a href="../index.html#message">ご挨拶</a>
      <a href="../works.html">協賛大会</a>
      <a href="../reports.html">協賛レポート</a>
      <a href="../sponsors.html">共同スポンサー</a>
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
        <time class="article__date" datetime="${iso}">${disp}</time>
        <h1 class="article__title">${esc(title)}</h1>
      </header>

      <div class="article__body reveal">
        <figure>
          <img src="../assets/img/news/${imgFile}" alt="${esc(title)}" width="1280" height="720" loading="lazy" />
        </figure>
        <p>${esc(lead)}</p>
        <ul>
${items}
        </ul>
        <p>プロフィールの詳細は <a href="../vtuber.html">VTuber一覧ページ</a> からご覧いただけます。応援よろしくお願いいたします！</p>
        <p><strong>■ e活カジュアルサポーターを随時募集中です！</strong> e活では、共にコミュニティ大会を応援し、シーンを盛り上げてくださる配信者様を継続して募集しております。お気軽にお問い合わせください。</p>
      </div>

      <div class="article__nav reveal">
        <a class="btn" href="../news.html">← お知らせ一覧へ戻る</a>
      </div>
    </article>
  </main>

  <footer class="site-footer">
    <img src="../assets/img/logo.webp" alt="e活 ロゴ" width="90" class="site-footer__logo" />
    <p class="site-footer__copy">&copy; A&amp;L project 株式会社</p>
  </footer>

  <script src="../assets/js/main.js"></script>
</body>
</html>
`;
}

// お知らせ一覧の先頭に1枚差し込む。index.html は先頭2件だけ残す。
function insertNewsCard({ slug, iso, disp, title, imgFile }) {
  const card = (prefix, withId) => [
    `        <a class="news-card${withId ? " reveal" : ""}"${withId ? ` id="n-${slug}"` : ""} href="${prefix}news/${slug}.html">`,
    `          <img class="news-card__thumb" src="${prefix}assets/img/news/${imgFile}" alt="" width="140" height="88" loading="lazy" />`,
    `          <div class="news-card__body">`,
    `            <time datetime="${iso}">${disp}</time>`,
    `            <p class="news-card__title">${esc(title)}</p>`,
    `          </div>`,
    `        </a>`,
  ].join("\n");

  for (const [file, withId, keep] of [["news.html", true, 0], ["index.html", false, 2]]) {
    const p = path.join(ROOT, file);
    let html = fs.readFileSync(p, "utf8");
    const start = "<!-- NEWS:START -->", end = "<!-- NEWS:END -->";
    const i = html.indexOf(start), j = html.indexOf(end);
    if (i < 0 || j < 0) { console.warn(`  ${file} に NEWS マーカーが無い`); continue; }
    let body = html.slice(i + start.length, j);
    if (body.includes(`news/${slug}.html`)) { console.log(`  ${file}: すでに載っている`); continue; }
    let next = card(file === "news.html" ? "" : "", withId) + body.replace(/^\n/, "\n");
    if (keep) {
      // トップページは先頭 keep 件だけ
      const cards = ("\n" + next).split(/\n(?=        <a class="news-card)/).filter(s => s.trim());
      next = "\n" + cards.slice(0, keep).join("\n").replace(/^\n+/, "") + "\n      ";
    } else {
      next = "\n" + next.replace(/^\n+/, "");
    }
    html = html.slice(0, i + start.length) + next + html.slice(j);
    fs.writeFileSync(p, html);
    console.log(`  ${file}: お知らせカードを追加した`);
  }
}

// ---- 入口 -------------------------------------------------------------------
// people = build-vtuber.js が作った「今回はじめて載る人」の配列
// today  = 'YYYY-MM-DD'
async function publishSupporterNews(people, today, { dry = false } = {}) {
  if (!people.length) return null;
  const [y, m, d] = today.split("-");
  const iso = today;
  const disp = `${y}.${m}.${d}`;
  const slug = `supporter-${today}`;
  const imgFile = `${slug}.webp`;
  const title = `新しいe活カジュアルサポーターのご紹介（${y}.${m}.${d}）`;

  console.log(`\n■ お知らせ記事を作る: ${title}`);
  console.log(`  紹介する人: ${people.map(p => p.displayName).join(" / ")}`);
  if (dry) { console.log("  --dry なので書き込みはしない"); return null; }

  await buildBanner(people, `${y}.${m}`, path.join(NEWS_IMG_DIR, imgFile));
  console.log(`  見出し画像: assets/img/news/${imgFile}`);

  fs.mkdirSync(NEWS_DIR, { recursive: true });
  fs.writeFileSync(path.join(NEWS_DIR, `${slug}.html`), articleHtml({ title, iso, disp, imgFile, people }));
  console.log(`  記事: news/${slug}.html`);

  insertNewsCard({ slug, iso, disp, title, imgFile });

  // Botが読む記録。ここにある記事をXでポストする。
  const idx = fs.existsSync(INDEX_JSON) ? JSON.parse(fs.readFileSync(INDEX_JSON, "utf8")) : { articles: [] };
  if (!idx.articles.some(a => a.slug === slug)) {
    idx.articles.unshift({
      slug, date: iso, title,
      url: `${SITE}/news/${slug}`,
      people: people.map(p => ({ name: p.name, display: p.displayName, x: p.xHandle || "" })),
    });
    fs.writeFileSync(INDEX_JSON, JSON.stringify(idx, null, 2) + "\n");
    console.log(`  supporter_news.json に記録した（Botがこれを読んでXに出す）`);
  }
  return { slug, title, url: `${SITE}/news/${slug}` };
}

module.exports = { publishSupporterNews, buildBanner };
