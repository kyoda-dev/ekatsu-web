// ぱんみみさん（9/24の記事）とぺんぺんさん（9/28の記事）を1本の記事にまとめる（2026-10-03 依田「2人とも同じ記事で紹介したいからくっつけて」）
//   ・残すのは supporter-2026-09-28（2人を載せ直し、見出し画像も2人で作り直す）
//   ・supporter-2026-09-24 は、開いたら 9/28 の記事へ移るだけのページにする（もう配ったリンクが死なないように）
//   ・一覧（news.html・index.html）の 9/24 のカードを外す。Xの承認待ちも 9/28 の1本に2人で入れ直す
//   使い方: node _merge_supporter_1003.js
const fs = require("fs");
const path = require("path");
const ROOT = path.join(__dirname, "..");
const { publishSupporterNews } = require("./supporter-news");

const people = [
  { slug: "vt18", name: "ぱんみみ", displayName: "ぱんみみ", bio: "Call of Dutyを中心に配信。eスポーツが好きで、遊ぶのも観るのも楽しんでいます。", xHandle: "@pan_33_mimi" },
  { slug: "vt19", name: "ぺんぺん", displayName: "ぺんぺん", bio: "方言をうまく利用して遊びに来てくれた人はみんな友達をテーマに配信しています。 VALORANT / APEX Legends。", xHandle: "@Nissy14843663" },
];
const OLD = "supporter-2026-09-24", KEEP = "supporter-2026-09-28";

(async () => {
  // 1) 9/28 の記事と見出し画像を2人で作り直す（カードと承認待ちは「もうある」で飛ばされる）
  await publishSupporterNews(people, "2026-09-28");

  // 2) 9/24 の記事は 9/28 へ移るだけのページに
  fs.writeFileSync(path.join(ROOT, "news", OLD + ".html"), `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8" />
  <meta name="robots" content="noindex" />
  <meta http-equiv="refresh" content="0; url=${KEEP}.html" />
  <link rel="canonical" href="https://ekatsu-web.pages.dev/news/${KEEP}" />
  <title>新しいe活カジュアルサポーターのご紹介 ｜ e活</title>
</head>
<body>
  <p>この記事は <a href="${KEEP}.html">新しいe活カジュアルサポーターのご紹介（2026.09.28）</a> にまとめました。</p>
</body>
</html>
`);

  // 3) 一覧から 9/24 のカードを外す（<a class="news-card…href="news/supporter-2026-09-24.html"> 〜 </a>）
  for (const f of ["news.html", "index.html"]) {
    const p = path.join(ROOT, f);
    let s = fs.readFileSync(p, "utf8");
    const re = new RegExp('[ \\t]*<a class="news-card[^>]*href="news/' + OLD + '\\.html">[\\s\\S]*?</a>\\r?\\n');
    if (!re.test(s)) { console.log(`  ${f}: 9/24 のカードが見つからない（もう外れている）`); continue; }
    s = s.replace(re, "");
    fs.writeFileSync(p, s);
    console.log(`  ${f}: 9/24 のカードを外した`);
  }
  // トップ（index.html）はお知らせ2件。1件になったら news.html の次の1件を写す
  {
    const ip = path.join(ROOT, "index.html");
    let idx = fs.readFileSync(ip, "utf8");
    const block = idx.slice(idx.indexOf("<!-- NEWS:START -->"), idx.indexOf("<!-- NEWS:END -->"));
    const n = (block.match(/<a class="news-card/g) || []).length;
    if (n < 2) {
      const news = fs.readFileSync(path.join(ROOT, "news.html"), "utf8");
      const cards = news.slice(news.indexOf("<!-- NEWS:START -->"), news.indexOf("<!-- NEWS:END -->")).match(/[ \t]*<a class="news-card[\s\S]*?<\/a>\r?\n/g) || [];
      const next = cards.find(c => !block.includes((c.match(/href="([^"]+)"/) || [])[1]));
      if (next) {
        const card = next.replace(' reveal"', '"').replace(/ id="n-[^"]*"/, "");
        idx = idx.replace("      <!-- NEWS:END -->", card + "      <!-- NEWS:END -->");
        fs.writeFileSync(ip, idx);
        console.log("  index.html: 次のお知らせを1件足した（トップは2件）");
      }
    }
  }

  // 4) Xの承認待ち：9/24 を消し、9/28 に2人を入れる
  const pp = path.join(__dirname, "supporter_news_pending.json");
  const pend = JSON.parse(fs.readFileSync(pp, "utf8"));
  pend.articles = pend.articles.filter(a => a.slug !== OLD);
  const keep = pend.articles.find(a => a.slug === KEEP);
  if (keep) keep.people = people.map(p => ({ name: p.name, display: p.displayName, x: p.xHandle }));
  fs.writeFileSync(pp, JSON.stringify(pend, null, 2) + "\n");
  console.log("  承認待ち: 9/28 の1本に2人で入れ直した");

  // 5) 9/24 の見出し画像は使わなくなるので消す
  const img = path.join(ROOT, "assets", "img", "news", OLD + ".webp");
  if (fs.existsSync(img)) { fs.unlinkSync(img); console.log("  9/24 の見出し画像を消した"); }
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
