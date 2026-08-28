#!/usr/bin/env node
/* =========================================================
   build-vtuber.js
   「公開用プロフィール一覧」スプレッドシートを読み取り、
   vtuber.html のプロフィールカードと index.html の顔ぶれを自動生成する。

   使い方:  cd tools && node build-vtuber.js
            cd tools && node build-vtuber.js --dry   （書き込まずに結果だけ出す）

   ■ 載せる条件（ここが肝）
     素材（2Dデータ or 写真）が無い人は載せない。
     素材＝共有ドライブの「<活動名>/02_2Dデータ素材」に画像が1枚でもあること。
     一度サイトに載せた人は assets/img/vtuber/<slug>.webp が残るので、
     あとで素材フォルダを片付けても消えない。

   ■ 文面
     カードのひとことは tools/vtuber_meta.json で上書きできる。
     上書きが無ければ配信スタイルの1文目から作る（粗いので後で直す前提）。

   ■ 出力
     vtuber.html … VT_PARTNER / VT_CASUAL マーカーの間
     index.html  … VT_LINEUP マーカーの間
     tools/vtuber_published.json … 誰をいつ初めて載せたかの記録（X紹介ポストが読む）

   - 認証: e活Bot の .env（GOOGLE_CLIENT_ID / SECRET / REFRESH_TOKEN）を流用
           （既定: ../../e-katsu/.env。環境変数 ENV_PATH で変更可）
   ========================================================= */
const fs = require("fs");
const path = require("path");

const ENV_PATH = process.env.ENV_PATH || path.join(__dirname, "..", "..", "e-katsu", ".env");
require("dotenv").config({ path: ENV_PATH });
const { google } = require("googleapis");
const sharp = require("sharp");

const DRY = process.argv.includes("--dry");

const PROFILE_ID = process.env.PUBLIC_PROFILE_SHEET_ID || "1byI6JCSV1rPTyZwCp9ospUmXbJm1GJ6g9wdtqGPZPvg";
const PROFILE_TAB = "プロフィール一覧";
// VTuberごとのフォルダが並んでいる親フォルダ（e活Botと同じもの）
const DRIVE_PARENT = process.env.VTUBER_DELIVERY_PARENT_ID || "1OYvATSqyoo8E-sl2WvVS4Ev9pFgwoH7U";
const ASSET_SUBFOLDER = "02_2Dデータ素材";

const ROOT = path.join(__dirname, "..");
const VT_HTML = path.join(ROOT, "vtuber.html");
const INDEX_HTML = path.join(ROOT, "index.html");
const IMG_DIR = path.join(ROOT, "assets", "img", "vtuber");
const META_PATH = path.join(__dirname, "vtuber_meta.json");
const PUBLISHED_PATH = path.join(__dirname, "vtuber_published.json");

const ICON_SIZE = 400;                       // 出力アイコンの一辺
const IMG_RE = /\.(png|jpe?g|webp|gif)$/i;   // 素材として使える拡張子（psd/ai等は読めないので除く）

function getAuth() {
  const a = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  a.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return a;
}

const esc = (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const norm = (s) => String(s || "").replace(/[\s　]/g, "").toLowerCase();

// 枠の表記ゆれを2つに寄せる。「ネクスト」は2026-08-21に「カジュアルサポーター」へ改名した旧称。
function tierOf(raw) {
  const s = String(raw || "");
  if (/パートナー/.test(s)) return "partner";
  if (/ネクスト|カジュアル/.test(s)) return "casual";
  return "";
}

// X欄の表記ゆれ（URL / @handle / handle）を1つのURLに寄せる。?s=11 などの追跡パラメータは落とす。
function xUrlOf(raw) {
  const s = String(raw || "").trim();
  if (!s) return "";
  const m = s.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]{1,15})/);
  if (m) return `https://x.com/${m[1]}`;
  const h = s.match(/^@?([A-Za-z0-9_]{1,15})$/);
  return h ? `https://x.com/${h[1]}` : "";
}
function xHandleOf(raw) {
  const u = xUrlOf(raw);
  return u ? "@" + u.split("/").pop() : "";
}

// チャンネルURLからサービス名を当てる。プラットフォーム欄より URL のほうが当てになる。
function serviceOf(url, fallback) {
  const s = String(url || "");
  if (/youtube\.com|youtu\.be/.test(s)) return "YouTube";
  if (/twitch\.tv/.test(s)) return "Twitch";
  if (/tiktok\.com/.test(s)) return "TikTok";
  if (/twitcasting/.test(s)) return "ツイキャス";
  return String(fallback || "").trim() || "配信ページ";
}
// %エンコードされたURL（YouTubeの日本語ハンドル等）はそのまま使う。href では有効。
function cleanUrl(u) {
  const s = String(u || "").trim();
  if (!/^https?:\/\//.test(s)) return "";
  return s.replace(/[?&](si|s|tt_content|tt_medium)=[^&]*/g, "").replace(/\?$/, "");
}

// 配信スタイルの自由記述からカード用のひとことを作る。
// フォームの回答は数百字になることがあるので、1文目だけ取って詰める。
function autoBio(style, game) {
  let s = String(style || "").replace(/\s+/g, " ").trim();
  const cut = s.search(/[。！!？?]/);
  if (cut > 0) s = s.slice(0, cut + 1);
  if (s.length > 46) s = s.slice(0, 45) + "…";
  const g = String(game || "").split(/[,、\/]/).map(x => x.trim()).filter(Boolean).slice(0, 3).join(" / ");
  return [s, g && g + "。"].filter(Boolean).join(" ");
}

// ---- 素材（アイコン）の用意 -------------------------------------------------
// すでに assets/img/vtuber/<slug>.webp があればそれを使う（一度載せた人は消えない）。
// 無ければ共有ドライブの「<活動名>/02_2Dデータ素材」から1枚取ってきて正方形に切る。
async function findFolder(drive, name, parentId) {
  if (!parentId) return null;
  const q = `name = '${String(name).replace(/'/g, "\\'")}' and '${parentId}' in parents `
    + `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const res = await drive.files.list({ q, fields: "files(id,name)", pageSize: 5, supportsAllDrives: true, includeItemsFromAllDrives: true });
  return (res.data.files || [])[0] || null;
}

async function ensureIcon(drive, name, slug, crop) {
  const dest = path.join(IMG_DIR, `${slug}.webp`);
  if (fs.existsSync(dest)) return { ok: true, reused: true };
  if (!DRIVE_PARENT) return { ok: false, why: "共有ドライブの親フォルダIDが未設定" };

  const personFolder = await findFolder(drive, name, DRIVE_PARENT);
  if (!personFolder) return { ok: false, why: "Driveに本人のフォルダが無い" };
  const assets = await findFolder(drive, ASSET_SUBFOLDER, personFolder.id);
  if (!assets) return { ok: false, why: `「${ASSET_SUBFOLDER}」フォルダが無い` };

  const list = await drive.files.list({
    q: `'${assets.id}' in parents and trashed = false`,
    fields: "files(id,name,mimeType,size)", pageSize: 100,
    supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  const imgs = (list.data.files || []).filter(f => IMG_RE.test(f.name || "") || /^image\//.test(f.mimeType || ""));
  if (!imgs.length) return { ok: false, why: "素材フォルダが空（画像なし）" };

  // どれを使うかは名前で決める。差分（表情違い）を何枚も置く人がいるので、
  // 「怒り」「驚き」などの表情ではなく、通常顔・上半身を選ぶ。ロゴは人物ではないので最後。
  const score = (f) => {
    const n = String(f.name);
    if (/ロゴ|logo|バナー|banner/i.test(n)) return 9;
    if (/怒|泣|驚|困|照|angry|sad|cry|surprised|annoyed|shy|blush/i.test(n)) return 5;
    if (/上半身|バストア|アイコン|icon|顔/.test(n)) return 0;
    if (/default|normal|通常|smile|笑/i.test(n)) return 1;
    if (/立ち絵|全身/.test(n)) return 2;
    return 3;
  };
  imgs.sort((a, b) => score(a) - score(b) || String(a.name).localeCompare(String(b.name)));
  const pick = imgs[0];

  const res = await drive.files.get({ fileId: pick.id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
  const buf = Buffer.from(res.data);

  // 立ち絵は縦長で顔が上のほうにある。そのまま正方形に切ると全身が入って顔が豆粒になるので、
  // 縦長さに応じて「顔＋肩」くらいの範囲に寄せる。他のアイコンと大きさの見え方を揃えるため。
  //   crop で明示指定もできる（vtuber_meta.json の crop: {side, top, left} ＝ 縦の長さに対する割合）。
  const meta = await sharp(buf).metadata();
  const img = sharp(buf).flatten({ background: "#ffffff" });
  const { width: W, height: H } = meta;
  const ratio = H / W;
  if (crop || ratio > 1.15) {
    let side, top, left;
    if (crop) {
      side = Math.round(H * crop.side);
      top = Math.round(H * (crop.top ?? 0.05));
      left = crop.left != null ? Math.round(W * crop.left) : Math.round((W - side) / 2);
    } else if (ratio > 1.5) {          // 全身の立ち絵
      side = Math.round(H * 0.24);
      top = Math.round(H * 0.05);
      left = Math.round((W - side) / 2);
    } else {                            // 少し縦長（バストアップ寄り）
      side = Math.round(H * 0.62);
      top = Math.round(H * 0.04);
      left = Math.round((W - side) / 2);
    }
    side = Math.max(32, Math.min(side, W, H));
    left = Math.max(0, Math.min(left, W - side));
    top = Math.max(0, Math.min(top, H - side));
    img.extract({ left, top, width: side, height: side });
  }
  if (DRY) return { ok: true, picked: pick.name, dry: true };
  fs.mkdirSync(IMG_DIR, { recursive: true });
  await img.resize(ICON_SIZE, ICON_SIZE, { fit: "cover" }).webp({ quality: 88 }).toFile(dest);
  return { ok: true, picked: pick.name };
}

// ---- HTML の組み立て --------------------------------------------------------
function cardHtml(p, lazy) {
  const links = p.links.map(l => `            <a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join("\n");
  return [
    `        <article class="vt-card">`,
    `          <img class="vt-card__photo" src="assets/img/vtuber/${p.slug}.webp" alt="${esc(p.displayName)}" width="200" height="200"${lazy ? ' loading="lazy"' : ""} />`,
    `          <h3 class="vt-card__name">${esc(p.displayName)}</h3>`,
    `          <p class="vt-card__bio">${esc(p.bio)}</p>`,
    `          <div class="vt-card__links">`,
    links,
    `          </div>`,
    `        </article>`,
  ].join("\n");
}

function lineupHtml(people) {
  return people.map(p => [
    `        <span class="vt-lineup__item">`,
    `          <img src="assets/img/vtuber/${p.slug}.webp" alt="${esc(p.displayName)}" width="120" height="120" loading="lazy" />`,
    `          <span class="vt-lineup__name">${esc(p.lineupName)}</span>`,
    `        </span>`,
  ].join("\n")).join("\n");
}

// マーカーの間だけ差し替える。マーカーが無ければ止める（黙って全部を壊さない）。
function replaceBlock(html, marker, body, file) {
  const start = `<!-- ${marker}:START -->`;
  const end = `<!-- ${marker}:END -->`;
  const i = html.indexOf(start), j = html.indexOf(end);
  if (i < 0 || j < 0 || j < i) throw new Error(`${file} に ${marker} のマーカーが見つかりません`);
  return html.slice(0, i + start.length) + "\n" + body + "\n" + html.slice(j);
}

// ---- 本体 -------------------------------------------------------------------
(async () => {
  const meta = JSON.parse(fs.readFileSync(META_PATH, "utf8"));
  const published = fs.existsSync(PUBLISHED_PATH) ? JSON.parse(fs.readFileSync(PUBLISHED_PATH, "utf8")) : {};

  const auth = getAuth();
  const sheets = google.sheets({ version: "v4", auth });
  const drive = google.drive({ version: "v3", auth });

  const res = await sheets.spreadsheets.values.get({ spreadsheetId: PROFILE_ID, range: `'${PROFILE_TAB}'!A2:H` });
  const rows = (res.data.values || []).filter(r => r && String(r[1] || "").trim());
  console.log(`公開用プロフィール一覧: ${rows.length} 名`);

  const people = [];
  const skipped = [];

  for (const r of rows) {
    const name = String(r[1]).trim();
    const tier = tierOf(r[0]);
    if (!tier) { skipped.push({ name, why: `枠が読めない（${r[0]}）` }); continue; }

    const m = meta[name] || {};
    if (m.hide) { skipped.push({ name, why: "meta で hide 指定" }); continue; }

    const slug = m.slug || norm(name).replace(/[^a-z0-9]/g, "") || `vt${people.length + 1}`;
    const icon = await ensureIcon(drive, name, slug, m.crop);
    if (!icon.ok) { skipped.push({ name, why: icon.why }); continue; }

    const xUrl = xUrlOf(r[2]);
    const chUrl = cleanUrl(r[4]);
    const links = m.links || [
      xUrl && { label: "X", url: xUrl },
      chUrl && { label: serviceOf(chUrl, r[3]), url: chUrl },
    ].filter(Boolean);

    const displayName = m.displayName || name;
    people.push({
      name, tier, slug, displayName,
      lineupName: m.lineupName || displayName,
      bio: m.bio || autoBio(r[6], r[5]),
      links,
      order: typeof m.order === "number" ? m.order : 999,
      xHandle: xHandleOf(r[2]),
      autoBio: !m.bio,
      isNew: !published[name],
    });
    console.log(`  ${tier === "partner" ? "パートナー" : "カジュアル"} ${name}` +
      `${icon.reused ? "（既存アイコン）" : `（素材から作成: ${icon.picked}）`}${published[name] ? "" : "  ★新規"}`);
  }

  people.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, "ja"));
  const partners = people.filter(p => p.tier === "partner");
  const casuals = people.filter(p => p.tier === "casual");

  console.log(`\n載せる: パートナー ${partners.length} 名 / カジュアルサポーター ${casuals.length} 名`);
  if (skipped.length) {
    console.log(`\n載せない（${skipped.length} 名）＝素材待ちなど:`);
    skipped.forEach(s => console.log(`  ・${s.name} … ${s.why}`));
  }
  const rough = people.filter(p => p.autoBio);
  if (rough.length) {
    console.log(`\n⚠ ひとことを自動生成した（vtuber_meta.json で直すと良い）:`);
    rough.forEach(p => console.log(`  ・${p.displayName}「${p.bio}」`));
  }

  const newcomers = people.filter(p => p.isNew);
  if (newcomers.length) {
    console.log(`\n★ 今回はじめて載る人 ${newcomers.length} 名: ` + newcomers.map(p => p.displayName).join(" / "));
  }

  if (DRY) { console.log("\n--dry なので書き込みはしていない。"); return; }

  // vtuber.html
  let vt = fs.readFileSync(VT_HTML, "utf8");
  vt = replaceBlock(vt, "VT_PARTNER", partners.map((p, i) => cardHtml(p, i >= 3)).join("\n\n"), "vtuber.html");
  vt = replaceBlock(vt, "VT_CASUAL", casuals.map((p, i) => cardHtml(p, i >= 1)).join("\n\n"), "vtuber.html");
  fs.writeFileSync(VT_HTML, vt);

  // index.html の顔ぶれ（トップは最大8名まで。パートナー優先）
  let idx = fs.readFileSync(INDEX_HTML, "utf8");
  idx = replaceBlock(idx, "VT_LINEUP", lineupHtml([...partners, ...casuals].slice(0, 8)), "index.html");
  fs.writeFileSync(INDEX_HTML, idx);

  // 初掲載の記録。X紹介ポストはこれを見て「今週の新顔」を決める。
  const today = new Date().toISOString().slice(0, 10);
  let added = 0;
  for (const p of people) if (!published[p.name]) { published[p.name] = { firstPublished: today, slug: p.slug, x: p.xHandle, tier: p.tier }; added++; }
  fs.writeFileSync(PUBLISHED_PATH, JSON.stringify(published, null, 2) + "\n");

  console.log(`\n書き込み完了。vtuber.html / index.html を更新、初掲載の記録を ${added} 件追加した。`);

  // ★2026-08-29 依田の指示：カードを足すだけでなく、掲載した週ごとに「お知らせ記事」も出す。
  //   その記事をXでもポストする（Botが supporter_news.json を読む）。
  if (newcomers.length) {
    const { publishSupporterNews } = require("./supporter-news");
    await publishSupporterNews(newcomers, today, { dry: DRY });
  }
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
