#!/usr/bin/env node
/* =========================================================
   build-works.js
   「大会スケジュール_マスター」スプレッドシートを読み取り、
   works.html の活動実績カードを自動生成する。

   使い方:  cd tools && node build-works.js

   - 掲載対象: マスターの「情報公開」列(D) が ○ の大会のみ
   - リンク: 配信URL(H) 優先、無ければ 大会X(I)
   - 画像: 大会KV画像(M) があれば assets/img/works/ に取得して使用、
           無ければ assets/img/works/placeholder.svg
   - 認証: e活Bot の .env（GOOGLE_CLIENT_ID / SECRET / REFRESH_TOKEN）を流用
           （既定: ../../e-katsu/.env。環境変数 ENV_PATH で変更可）
   ========================================================= */
const fs = require("fs");
const path = require("path");

const ENV_PATH = process.env.ENV_PATH || path.join(__dirname, "..", "..", "e-katsu", ".env");
require("dotenv").config({ path: ENV_PATH });
const { google } = require("googleapis");

const MASTER_ID = process.env.MASTER_SCHEDULE_ID || "1J3A9VXi72s4mEsBUVr6tpO3X_lzalCS7L6wweGj11dU";
const ROOT = path.join(__dirname, "..");
const HTML_PATH = path.join(ROOT, "works.html");
const IMG_DIR = path.join(ROOT, "assets", "img", "works");
const PLACEHOLDER = "assets/img/works/placeholder.svg";

function getAuth() {
  const a = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  a.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return a;
}

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// "2026/03/02" / "2026/4/15" → {disp:"2026.03.02", iso:"2026-03-02", t:Date}
function parseDate(s) {
  const m = String(s || "").match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!m) return { disp: String(s || "").trim(), iso: "", t: 0 };
  const [, y, mo, d] = m;
  const pad = (n) => String(n).padStart(2, "0");
  return { disp: `${y}.${pad(mo)}.${pad(d)}`, iso: `${y}-${pad(mo)}-${pad(d)}`, t: new Date(+y, +mo - 1, +d).getTime() };
}

function asciiSlug(name, fallback) {
  const s = String(name || "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase();
  return s || fallback;
}

// 既に assets/img/works/ に置かれているローカル画像（<slug>.<ext>）を探す。
// スプレッドシートのM列が空でも、手動で用意したKV画像を使えるようにする。無ければ placeholder。
function localOrPlaceholder(slug) {
  for (const ext of ["webp", "jpg", "jpeg", "png"]) {
    const file = `${slug}.${ext}`;
    if (fs.existsSync(path.join(IMG_DIR, file))) return `assets/img/works/${file}`;
  }
  return PLACEHOLDER;
}

// M列の画像（Drive リンク or http URL）を assets/img/works/ に取得。
// M列が空 or 取得失敗時は、ローカルの <slug>.<ext> → placeholder の順でフォールバック。
async function fetchImage(drive, cell, slug) {
  const val = String(cell || "").trim();
  if (!val) return localOrPlaceholder(slug);
  try {
    let buf, ext = "jpg";
    const driveId = (val.match(/\/file\/d\/([A-Za-z0-9_-]+)/) || val.match(/[?&]id=([A-Za-z0-9_-]+)/) || [])[1];
    if (driveId) {
      const meta = await drive.files.get({ fileId: driveId, fields: "name,mimeType", supportsAllDrives: true });
      ext = (meta.data.mimeType || "").split("/")[1] || "jpg";
      const res = await drive.files.get({ fileId: driveId, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
      buf = Buffer.from(res.data);
    } else if (/^https?:\/\//.test(val)) {
      const res = await fetch(val);
      if (!res.ok) return PLACEHOLDER;
      ext = (res.headers.get("content-type") || "").split("/")[1] || "jpg";
      buf = Buffer.from(await res.arrayBuffer());
    } else {
      return PLACEHOLDER;
    }
    ext = ext.replace("jpeg", "jpg").replace(/[^a-z0-9]/gi, "") || "jpg";
    const file = `${slug}.${ext}`;
    fs.mkdirSync(IMG_DIR, { recursive: true });
    fs.writeFileSync(path.join(IMG_DIR, file), buf);
    return `assets/img/works/${file}`;
  } catch (e) {
    console.warn(`  画像取得失敗 (${slug}): ${e.message} → ローカル画像 or プレースホルダー`);
    return localOrPlaceholder(slug);
  }
}

function cardHtml(t) {
  const link = t.link || "#";
  const target = link !== "#" ? ' target="_blank" rel="noopener"' : "";
  return `        <a class="work-card reveal" href="${esc(link)}"${target}>
          <img class="work-card__thumb" src="${esc(t.img)}" alt="${esc(t.name)}" width="320" height="180" loading="lazy" />
          <div class="work-card__meta">
            ${t.date.iso ? `<time datetime="${esc(t.date.iso)}">${esc(t.date.disp)}</time>` : `<span>${esc(t.date.disp)}</span>`}
            ${t.game ? `<span class="work-card__cat">${esc(t.game)}</span>` : ""}
          </div>
          <h2 class="work-card__title">${esc(t.name)}</h2>
          ${t.excerpt ? `<p class="work-card__excerpt">${esc(t.excerpt)}</p>` : ""}
        </a>`;
}

async function main() {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const drive = google.drive({ version: "v3", auth: getAuth() });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: MASTER_ID, fields: "sheets.properties.title" });
  const tab = meta.data.sheets[0].properties.title;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: MASTER_ID, range: `${tab}!A2:M` });
  const rows = res.data.values || [];

  // 大会名がある行はすべて掲載（情報公開フラグでの絞り込みは廃止）。
  // ※「情報公開」列(D)は残してあるが現在は不問。将来は主催者側の掲載可否選択などに転用予定。
  const pub = rows.filter((r) => (r[0] || "").trim());
  console.log(`掲載対象: ${pub.length} 件（全件・情報公開フラグは不問）`);

  const items = [];
  for (const r of pub) {
    const name = (r[0] || "").trim();
    const date = parseDate(r[4]);
    const game = (r[6] || "").trim();
    // ※ 備考(L列)は協賛依頼文・担当名・社内数値などの内部情報なので公開しない
    // リンクは配信URL(H)優先→大会X(I)。複数URL混在に備え最初のURLだけ抽出
    const firstUrl = (s) => (String(s || "").match(/https?:\/\/[^\s"'<>]+/) || [])[0] || "";
    const link = firstUrl(r[7]) || firstUrl(r[8]) || "#";
    const slug = `${date.iso || "x"}-${asciiSlug(name, "tour")}`.slice(0, 60);
    const img = await fetchImage(drive, r[12], slug);
    const excerpt = "e活が協賛・ミラー配信でサポートしたコミュニティ大会です。";
    items.push({ name, date, game, link, img, excerpt });
  }

  // Web掲載専用の追加分（マスターに無い過去大会など）を extra-works.json から合成。
  // ※ Botも使うマスターに行を足さずに、サイトだけに載せたい実績を管理するため。
  const EXTRA_PATH = path.join(__dirname, "extra-works.json");
  if (fs.existsSync(EXTRA_PATH)) {
    const extras = JSON.parse(fs.readFileSync(EXTRA_PATH, "utf8"));
    for (const e of extras) {
      const name = (e.name || "").trim();
      if (!name) continue;
      const date = parseDate(e.date);
      const slug = `${date.iso || "x"}-${asciiSlug(name, "tour")}`.slice(0, 60);
      const img = e.img || localOrPlaceholder(slug); // 画像は assets/img/works/<slug>.<ext> を自動利用
      items.push({
        name,
        date,
        game: (e.game || "").trim(),
        link: (e.link || "").trim() || "#",
        img,
        excerpt: e.excerpt || "e活が協賛・ミラー配信でサポートしたコミュニティ大会です。",
      });
    }
    console.log(`追加分（extra-works.json）: ${extras.length} 件`);
  }

  // 並び順: KV画像があるもの（＝見せたい実績）を優先して上に。各グループ内は日付の新しい順。
  // 画像未設定（placeholder）の大会は後ろにまとめる。
  const hasImg = (x) => x.img && !x.img.includes("placeholder");
  items.sort((a, b) => (hasImg(b) - hasImg(a)) || (b.date.t - a.date.t));

  const cards = items.length ? items.map(cardHtml).join("\n\n") : `        <p class="works__empty">公開中の活動はまだありません。</p>`;

  let html = fs.readFileSync(HTML_PATH, "utf8");
  const re = /(<!-- WORKS:START -->)[\s\S]*?(<!-- WORKS:END -->)/;
  if (!re.test(html)) { console.error("works.html に WORKS:START/END マーカーが見つかりません"); process.exit(1); }
  html = html.replace(re, `$1\n${cards}\n        $2`);
  fs.writeFileSync(HTML_PATH, html);
  console.log(`works.html を更新しました（カード ${items.length} 件）`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
