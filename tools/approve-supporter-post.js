#!/usr/bin/env node
/* =========================================================
   approve-supporter-post.js
   「e活カジュアルサポーターのご紹介」のXポストを、人の目で確認してから出すための道具。

   ★2026-09-14 依田の指示でできた道具。
     これまでは build-vtuber.js が記事を作ると同時に supporter_news.json に書き込み、
     Botがそれを拾って自動で #x投稿 に下書きを入れていた。
     そのため 9/13 に作った記事が、ご本人からいただいた紹介文の直しが入る前の
     9/14 19時にそのままポストされてしまった（お約束は 9/15(火) 19時）。
     今は記事を作っても supporter_news_pending.json に「承認待ち」で止まる。
     ここでOKを出したものだけが supporter_news.json（Botが読む列）に入る。

   使い方（tools フォルダの中で）
     node approve-supporter-post.js                  … 承認待ちの一覧を見る
     node approve-supporter-post.js <slug>           … 中身を出して、Botの列に入れる
     node approve-supporter-post.js <slug> --dry     … 中身を見るだけ（動かさない）
     node approve-supporter-post.js <slug> --drop    … この回はXに出さない（承認待ちから消す）
     node approve-supporter-post.js <slug> --at 2026-09-15
                                                    … 出す日を指定してBotの列に入れる（既定は今日）

   例: node approve-supporter-post.js supporter-2026-09-13
   ========================================================= */
const fs = require("fs");
const path = require("path");

const INDEX_JSON = path.join(__dirname, "supporter_news.json");
const PENDING_JSON = path.join(__dirname, "supporter_news_pending.json");
const PUBLISHED_JSON = path.join(__dirname, "vtuber_published.json");

const readJson = (f, fallback) => (fs.existsSync(f) ? JSON.parse(fs.readFileSync(f, "utf8")) : fallback);
const writeJson = (f, obj) => fs.writeFileSync(f, JSON.stringify(obj, null, 2) + "\n");

const args = process.argv.slice(2);
const DRY = args.includes("--dry");
const DROP = args.includes("--drop");
const slug = args.find(a => !a.startsWith("--"));
// --at 2026-09-15 / --at=2026-09-15 … 出す日（Botがこの日の19時に出す。省略は今日）
const atArg = (() => {
  const eq = args.find(a => a.startsWith("--at="));
  if (eq) return eq.slice(5);
  const i = args.indexOf("--at");
  return i >= 0 ? args[i + 1] : "";
})();
if (atArg && !/^\d{4}-\d{2}-\d{2}$/.test(atArg)) {
  console.error("--at は YYYY-MM-DD で書いてください（例: --at 2026-09-15）");
  process.exit(1);
}
const postAt = atArg || new Date().toISOString().slice(0, 10);

const pending = readJson(PENDING_JSON, { articles: [] });
const list = pending.articles || [];

function show(a) {
  console.log(`  ${a.slug}  ${a.title}`);
  console.log(`    URL : ${a.url}`);
  console.log(`    紹介: ${a.people.map(p => `${p.display}${p.x ? `（${p.x}）` : ""}`).join(" / ")}`);
}

// 一覧
if (!slug) {
  if (!list.length) {
    console.log("承認待ちのXポストはありません。");
  } else {
    console.log(`承認待ちのXポスト ${list.length} 件：\n`);
    list.forEach(show);
    console.log("\nOKが出たら: node approve-supporter-post.js <slug>");
    console.log("出さないなら: node approve-supporter-post.js <slug> --drop");
  }
  process.exit(0);
}

const i = list.findIndex(a => a.slug === slug);
if (i < 0) {
  console.error(`承認待ちに「${slug}」はありません。`);
  if (list.length) console.error("いま待っているのは: " + list.map(a => a.slug).join(", "));
  const already = readJson(INDEX_JSON, { articles: [] }).articles.some(a => a.slug === slug);
  if (already) console.error("（この記事は supporter_news.json にもう入っています＝承認済み）");
  process.exit(1);
}

const entry = list[i];
console.log("この内容でXに出します：\n");
show(entry);

if (DRY) { console.log("\n--dry なので何も書き込んでいません。"); process.exit(0); }

if (DROP) {
  list.splice(i, 1);
  writeJson(PENDING_JSON, pending);
  console.log(`\n承認待ちから外しました。この回はXに出しません（記事とサイトの掲載はそのままです）。`);
  process.exit(0);
}

// Botが読む列へ移す（日付の新しい順を保つ）
const idx = readJson(INDEX_JSON, { articles: [] });
if (idx.articles.some(a => a.slug === entry.slug)) {
  console.log("\nすでに supporter_news.json に入っていました。承認待ちからだけ外します。");
} else {
  const { addedAt, ...post } = entry;   // 承認待ちの内部メモは持っていかない
  void addedAt;
  post.postAt = postAt;                 // Xに出す日（記事の日付＝date とは別。出し直しのときに効く）
  idx.articles.push(post);
  idx.articles.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  writeJson(INDEX_JSON, idx);
  console.log(`\nsupporter_news.json に入れました（${postAt} にXへ出す想定）。`);
}
list.splice(i, 1);
writeJson(PENDING_JSON, pending);

// 紹介した人の記録にも「Xの紹介は出した」を残す（Bot側で二重に出さないための目印）
const published = readJson(PUBLISHED_JSON, null);
if (published) {
  let touched = 0;
  for (const p of entry.people) {
    if (published[p.name] && published[p.name].xPost !== "approved") {
      published[p.name].xPost = "approved";
      touched++;
    }
  }
  if (touched) {
    writeJson(PUBLISHED_JSON, published);
    console.log(`vtuber_published.json に「Xの紹介：承認済み」を ${touched} 件つけました。`);
  }
}

console.log("\n忘れずに git にコミットしてください（Botはリポジトリのファイルを見ています）。");
