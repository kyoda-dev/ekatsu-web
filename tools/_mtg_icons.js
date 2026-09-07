/* 2026-09-07：主催者MTG資料に貼るサポーターのアイコンを、TEMPへ書き出すだけ。
   ★サイトのファイル（vtuber.html / index.html / assets/img/vtuber）は1つも触らない。
     既にあるアイコンはコピーして使い、無い人だけ共有ドライブから作る。
     切り方は build-vtuber.js の ensureIcon と同じ（顔＋肩に寄せて正方形）。
   ★読むのは「<活動名>/02_2Dデータ素材」だけ。個人情報のフォルダには触れない。
   使い方: node _mtg_icons.js
*/
const fs = require("fs");
const path = require("path");
const ENV_PATH = process.env.ENV_PATH || path.join(__dirname, "..", "..", "e-katsu", ".env");
require("dotenv").config({ path: ENV_PATH });
const { google } = require("googleapis");
const sharp = require("sharp");

const DRIVE_PARENT = process.env.VTUBER_DELIVERY_PARENT_ID || "1OYvATSqyoo8E-sl2WvVS4Ev9pFgwoH7U";
const ASSET_SUBFOLDER = "02_2Dデータ素材";
const IMG_DIR = path.join(__dirname, "..", "assets", "img", "vtuber");
const PUBLISHED = JSON.parse(fs.readFileSync(path.join(__dirname, "vtuber_published.json"), "utf8"));
const OUT = path.join(process.env.TEMP || "/tmp", "vticons");
const ICON = 400;
const IMG_RE = /\.(png|jpe?g|webp|gif)$/i;

// 2026-09-07の名簿（動作確認用の1件は除いてある）
const NAMES = ["まぐまぐ", "白峰凱志", "葉月こより",
  "M4gari（まがり）", "茅花まりえ", "ぱわぁぱふこだま", "夜更カシ", "犬塚イオリ",
  "neru", "NOA♪", "セレーネ", "JELOM", "月詠サキ", "バジル・セグリア", "AMEPERO"];

// 名簿とサイトの記録で表記がぶれる（「白峰　凱志」「まぐまぐです」）。空白と括弧を落として突き合わせる
const norm = s => String(s || "").replace(/[（(][^（）()]*[）)]/g, "").replace(/[\s　・･]/g, "").toLowerCase();

// ★人ごとの指定（2026-09-07に実物を見て決めた）
//   file … 自動で選ぶと変な絵になる人だけ、使う素材を名指しする
//   crop … 顔の位置に合わせて切る範囲。side/top/left は「縦の長さ」に対する割合（leftだけ横）
//   site … true にすると、サイトにアイコンがあってもDriveから作り直す（サイトの切り方が緩い人）
const FIX = {
  "まぐまぐ":   { file: "おすまし_微笑み.png", crop: { side: 0.40, top: 0.03 } },
  "夜更カシ":   { site: false, file: "IMG_0130.png", crop: { side: 0.72, top: 0.01 } },   // もう少し上を出す（2026-09-07 依田）
  "JELOM":      { file: "IMG_4934.png" },
  "月詠サキ":   { site: false, crop: { side: 0.22, top: 0.045 } },   // バストアップに（2026-09-07 依田）
  "白峰凱志":   { site: false, crop: { side: 0.80, top: 0.02 } },
};

function getDrive() {
  const a = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  a.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return google.drive({ version: "v3", auth: a });
}
async function findFolder(drive, name, parentId) {
  const q = `name = '${String(name).replace(/'/g, "\\'")}' and '${parentId}' in parents `
    + `and mimeType = 'application/vnd.google-apps.folder' and trashed = false`;
  const r = await drive.files.list({ q, fields: "files(id,name)", pageSize: 5, supportsAllDrives: true, includeItemsFromAllDrives: true });
  return (r.data.files || [])[0] || null;
}
// 名前が完全一致しない時のために、親フォルダを全部見て近いものを探す
let _folders = null;
async function folderFor(drive, name) {
  const exact = await findFolder(drive, name, DRIVE_PARENT);
  if (exact) return exact;
  if (!_folders) {
    const r = await drive.files.list({
      q: `'${DRIVE_PARENT}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id,name)", pageSize: 200, supportsAllDrives: true, includeItemsFromAllDrives: true,
    });
    _folders = r.data.files || [];
  }
  return _folders.find(f => norm(f.name) === norm(name)) || null;
}

const score = (f) => {
  const n = String(f.name);
  if (/ロゴ|logo|バナー|banner/i.test(n)) return 9;
  if (/怒|泣|驚|困|照|angry|sad|cry|surprised|annoyed|shy|blush/i.test(n)) return 5;
  if (/上半身|バストア|アイコン|icon|顔/.test(n)) return 0;
  if (/default|normal|通常|smile|笑/i.test(n)) return 1;
  if (/立ち絵|全身/.test(n)) return 2;
  return 3;
};

async function makeIcon(drive, name, dest) {
  const fix = FIX[name] || {};
  const pf = await folderFor(drive, name);
  if (!pf) return "Driveに本人のフォルダが無い";
  const assets = await findFolder(drive, ASSET_SUBFOLDER, pf.id);
  if (!assets) return `「${ASSET_SUBFOLDER}」が無い`;
  // 直下に無い人がいる（1つ下に入れている）ので、1階層だけ潜って探す
  let imgs = [];
  const list = await drive.files.list({
    q: `'${assets.id}' in parents and trashed = false`, fields: "files(id,name,mimeType)",
    pageSize: 200, supportsAllDrives: true, includeItemsFromAllDrives: true,
  });
  const kids = list.data.files || [];
  imgs = kids.filter(f => IMG_RE.test(f.name || "") || /^image\//.test(f.mimeType || ""));
  if (!imgs.length) {
    for (const sub of kids.filter(f => f.mimeType === "application/vnd.google-apps.folder")) {
      const r2 = await drive.files.list({
        q: `'${sub.id}' in parents and trashed = false`, fields: "files(id,name,mimeType)",
        pageSize: 200, supportsAllDrives: true, includeItemsFromAllDrives: true,
      });
      const got = (r2.data.files || []).filter(f => IMG_RE.test(f.name || "") || /^image\//.test(f.mimeType || ""));
      if (got.length) { imgs = got; break; }
    }
  }
  if (!imgs.length) return "素材フォルダに画像が無い";
  imgs.sort((a, b) => score(a) - score(b) || String(a.name).localeCompare(String(b.name)));
  const pick = (fix.file && imgs.find(f => f.name === fix.file)) || imgs[0];
  console.log("   [" + name + "] 候補" + imgs.length + "件 → " + pick.name + "　（ほか: " + imgs.slice(1,5).map(f=>f.name).join(", ") + "）");

  const res = await drive.files.get({ fileId: pick.id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
  const buf = Buffer.from(res.data);
  const m = await sharp(buf).metadata();
  console.log("      元のサイズ " + m.width + "x" + m.height + "（縦横比 " + (m.height/m.width).toFixed(2) + "）");
  let img = sharp(buf).flatten({ background: "#ffffff" });
  const { width: W, height: H } = m;
  const ratio = H / W;
  const c = fix.crop;
  if (c || ratio > 1.15) {   // 立ち絵は顔が上にある。顔＋肩に寄せる
    const side = Math.round(H * (c ? c.side : (ratio > 1.5 ? 0.24 : 0.42)));
    const top = Math.round(H * (c && c.top != null ? c.top : 0.05));
    const left = c && c.left != null ? Math.round(W * c.left) : Math.round((W - side) / 2);
    img = img.extract({
      left: Math.max(0, Math.min(left, W - 1)), top: Math.max(0, top),
      width: Math.min(side, W), height: Math.min(side, H - top),
    });
  } else {
    const side = Math.min(W, H);
    img = img.extract({ left: Math.round((W - side) / 2), top: Math.round((H - side) / 2), width: side, height: side });
  }
  await img.resize(ICON, ICON, { fit: "cover" }).png().toFile(dest);
  return null;
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const drive = getDrive();
  const bySlug = {};
  for (const [k, v] of Object.entries(PUBLISHED)) if (!k.startsWith("_")) bySlug[norm(k)] = v.slug;

  const made = [], reused = [], failed = [];
  for (const name of NAMES) {
    const dest = path.join(OUT, name.replace(/[\\/:*?"<>|]/g, "_") + ".png");
    const slug = bySlug[norm(name)];
    const fx = FIX[name] || {};
    const site = (fx.site === false) ? null : (slug ? path.join(IMG_DIR, slug + ".webp") : null);
    if (site && fs.existsSync(site)) {
      await sharp(site).resize(ICON, ICON, { fit: "cover" }).png().toFile(dest);
      reused.push(name); continue;
    }
    const why = await makeIcon(drive, name, dest).catch(e => e.message);
    if (why) failed.push(name + "（" + why + "）"); else made.push(name);
  }
  console.log("サイトのものを使った " + reused.length + "人: " + reused.join("／"));
  console.log("Driveから作った   " + made.length + "人: " + made.join("／"));
  console.log("作れなかった      " + failed.length + "人: " + failed.join("／"));
  console.log("置き場: " + OUT);
})().catch(e => { console.log("ERR " + e.message); process.exit(1); });
