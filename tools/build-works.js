#!/usr/bin/env node
/* =========================================================
   build-works.js
   「大会スケジュール_マスター」スプレッドシートを読み取り、
   works.html の活動実績カードを自動生成する。

   使い方:  cd tools && node build-works.js

   - 2026-09-23：「これからの大会」と「これまでの大会」の2段に分けた（依田指示）。
     それまでは未開催のカードを main.js が隠していたので、公開サイトに次の予定が1つも出ていなかった。
     ・これから＝同じシリーズを1枚にまとめる（Day1〜Day14 が14行並ばないように）
     ・主催者が「告知OK日」（Q列）を入れている大会は、その日が来るまで出さない
       （空＝欄の説明どおり「こちらの都合のよいときに発表します」なので出してよい）

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

// 「UnderGroundREMATCH Day1」「… Day14」→「UnderGroundREMATCH」
// ★functions/_lib/orgGate.js の seriesBase と同じ式。片方だけ直すと主催者ページと食い違う。
function seriesBase(n) {
  return String(n || "").replace(/[　\s]*(?:Day\s*\d+|D\d+|第?\s*\d+\s*日目?)\s*$/i, "").trim() || String(n || "");
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

// works-hidden.json = 「マスターには残すが、サイトには出さない」大会のリスト。
// マスターの行を消すと下の行の行番号がズレて、Discordに残った参加カードのボタンが
// 別の大会を指してしまうため、行は消さずにサイト側だけで隠す。
// 書式: [{ "name": "大会名", "date": "2026/07/20", "why": "理由" }]  ※date 省略時は同名を全部隠す
function loadHidden() {
  const p = path.join(__dirname, "works-hidden.json");
  if (!fs.existsSync(p)) return [];
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")).filter((h) => String(h.name || "").trim());
  } catch (e) {
    console.warn(`  works-hidden.json が読めない: ${e.message} → 非表示指定なしで続行`);
    return [];
  }
}

function isHidden(hidden, name, date) {
  const n = String(name || "").trim();
  const iso = parseDate(date).iso;
  return hidden.some((h) => String(h.name).trim() === n && (!h.date || parseDate(h.date).iso === iso));
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

// これからの大会のカレンダー（2026-09-23 依田指示）。カードと同じ元データを月表にする。
// ★「今日」「過ぎた日」の印はここでは付けない。作り直しは6時間ごとなので、
//   ビルドした時刻の「今日」を焼き込むと日付をまたいだときにずれる。印は main.js が実行時に付ける。
// ★狭い画面では名前が読めないので、CSS側で印（棒）だけにしてある（名前は下のカードで読める）。
// ev = [{ iso, name, link }]
function calendarHtml(ev) {
  if (!ev.length) return "";
  const DOW = ["日", "月", "火", "水", "木", "金", "土"];
  const SHOW = 2;                     // 1日に出す大会は2つまで。あとは「＋N」
  const MONTHS = 4;                   // 出す月数の上限（今月から）
  const key = (y, m) => y * 12 + m;

  const byDay = new Map();
  for (const e of ev) {
    if (!byDay.has(e.iso)) byDay.set(e.iso, []);
    byDay.get(e.iso).push(e);
  }

  const now = new Date();
  const from = key(now.getFullYear(), now.getMonth());
  let last = from;
  for (const e of ev) last = Math.max(last, key(+e.iso.slice(0, 4), +e.iso.slice(5, 7) - 1));
  last = Math.min(last, from + MONTHS - 1);

  const out = [];
  for (let k = from; k <= last; k++) {
    const y = Math.floor(k / 12);
    const m = k % 12;
    const offset = new Date(y, m, 1).getDay();       // その月の1日の曜日（日曜=0）
    const days = new Date(y, m + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < offset; i++) cells.push(`          <div class="wcal__cell is-blank"></div>`);
    for (let d = 1; d <= days; d++) {
      const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
      const here = byDay.get(iso) || [];
      const chips = here.slice(0, SHOW).map((e) => {
        const target = e.link && e.link !== "#" ? ' target="_blank" rel="noopener"' : "";
        return `\n            <a class="wcal__ev" href="${esc(e.link || "#")}"${target} title="${esc(e.name)}">${esc(e.name)}</a>`;
      }).join("");
      const more = here.length > SHOW ? `\n            <span class="wcal__more">＋${here.length - SHOW}</span>` : "";
      cells.push(`          <div class="wcal__cell" data-d="${iso}">\n            <span class="wcal__num">${d}</span>${chips}${more}\n          </div>`);
    }
    // ★2026-09-23 依田指示：出すのは1か月だけ。次の月は「→」で行く。
    //   月は全部作っておいて、表示の切り替えは main.js がやる（is-on が付いた月だけ見える）。
    //   ここで先頭に is-on を付けておくのは、JSが動かなくても今月が見えるようにするため。
    out.push(`        <div class="wcal${out.length ? "" : " is-on"}" data-m="${y}-${String(m + 1).padStart(2, "0")}">
          <div class="wcal__bar">
            <button type="button" class="wcal__nav" data-step="-1" aria-label="前の月">←</button>
            <p class="wcal__mon">${y}年${m + 1}月</p>
            <button type="button" class="wcal__nav" data-step="1" aria-label="次の月">→</button>
          </div>
          <div class="wcal__dow">${DOW.map((x) => `<span>${x}</span>`).join("")}</div>
          <div class="wcal__grid">
${cells.join("\n")}
          </div>
        </div>`);
  }
  return out.join("\n\n");
}

// これからの大会のカード。シリーズは1枚にまとめて、日付を並べて出す。
// data-last ＝ そのシリーズの最後の日付。ビルドとビルドの間（6時間）に日が過ぎたら main.js が隠す。
function upcomingCardHtml(t) {
  const link = t.link || "#";
  const target = link !== "#" ? ' target="_blank" rel="noopener"' : "";
  const SHOW = 8;
  const md = (d) => (d.iso ? `${+d.iso.slice(5, 7)}/${+d.iso.slice(8, 10)}` : d.disp);
  const rest = t.dates.length - SHOW;
  const dates = t.dates.length > 1
    ? `\n          <p class="work-card__dates">${esc(t.dates.slice(0, SHOW).map(md).join("・"))}${rest > 0 ? ` ほか${rest}日` : ""}</p>`
    : "";
  return `        <a class="work-card reveal" href="${esc(link)}"${target} data-last="${esc(t.last.iso)}">
          <img class="work-card__thumb" src="${esc(t.img)}" alt="${esc(t.name)}" width="320" height="180" loading="lazy" />
          <div class="work-card__meta">
            ${t.first.iso ? `<time datetime="${esc(t.first.iso)}">${esc(t.first.disp)}</time>` : `<span>${esc(t.first.disp)}</span>`}
            ${t.game ? `<span class="work-card__cat">${esc(t.game)}</span>` : ""}
          </div>
          <h2 class="work-card__title">${esc(t.name)}</h2>${dates}
          <p class="work-card__excerpt">${esc(t.excerpt)}</p>
        </a>`;
}

async function main() {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const drive = google.drive({ version: "v3", auth: getAuth() });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: MASTER_ID, fields: "sheets.properties.title" });
  const tab = meta.data.sheets[0].properties.title;
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: MASTER_ID, range: `${tab}!A2:R` });
  const rows = res.data.values || [];
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todayT = today.getTime();

  // 大会名がある行はすべて掲載（情報公開フラグでの絞り込みは廃止）。
  // ※「情報公開」列(D)は残してあるが現在は不問。将来は主催者側の掲載可否選択などに転用予定。
  // ただし works-hidden.json に載っている大会だけはサイトに出さない。
  const hidden = loadHidden();
  // ★2026-09-07：中止（P列）にした大会はサイトの実績に出さない。
  //   中止したのに「協賛大会」として残ると、こちらが嘘をつくことになる。
  const named = rows.filter((r) => (r[0] || "").trim() && !String(r[15] || "").trim());
  const pub = named.filter((r) => !isHidden(hidden, r[0], r[4]));
  console.log(`掲載対象: ${pub.length} 件（全件・情報公開フラグは不問）`);
  for (const r of named.filter((r) => isHidden(hidden, r[0], r[4]))) {
    console.log(`  非表示: ${String(r[0]).trim()}（works-hidden.json の指定）`);
  }

  // ※ 備考(L列)は協賛依頼文・担当名・社内数値などの内部情報なので公開しない
  // リンクは配信URL(H)優先→大会X(I)。複数URL混在に備え最初のURLだけ抽出
  const firstUrl = (s) => (String(s || "").match(/https?:\/\/[^\s"'<>]+/) || [])[0] || "";

  // ---- これから／これまで に分ける（2026-09-23）----
  //   ★これからの分は「告知OK日」(Q列)を見る。日付が入っていて、その日がまだ来ていなければ出さない。
  //     空＝欄の説明どおり「こちらの都合のよいときに発表します」なので出してよい。
  //     ここで外すと、その大会名はHTMLに入らない（表示だけ隠す作りにはしない）。
  const past = [];
  const soon = [];
  for (const r of pub) {
    const d = parseDate(r[4]);
    if (d.t && d.t >= todayT) {
      const ok = parseDate(r[16]);
      if (ok.t && ok.t > todayT) {
        console.log(`  これからに出さない: ${String(r[0]).trim()}（告知OK日 ${ok.disp} がまだ）`);
        continue;
      }
      soon.push(r);
    } else {
      past.push(r);   // 日付なし（毎週・定期開催）もこれまで側に置く（今までと同じ扱い）
    }
  }

  const items = [];
  for (const r of past) {
    const name = (r[0] || "").trim();
    const date = parseDate(r[4]);
    const game = (r[6] || "").trim();
    const link = firstUrl(r[7]) || firstUrl(r[8]) || "#";
    const slug = `${date.iso || "x"}-${asciiSlug(name, "tour")}`.slice(0, 60);
    const img = await fetchImage(drive, r[12], slug);
    const excerpt = "e活が協賛・ミラー配信でサポートしたコミュニティ大会です。";
    items.push({ name, date, game, link, img, excerpt });
  }

  // ---- これからの大会：同じシリーズは1枚にまとめる ----
  //   Day1〜Day14 が14行並ぶと、他の大会が見えなくなるため。
  const groups = new Map();
  for (const r of soon) {
    const base = seriesBase((r[0] || "").trim());
    if (!groups.get(base)) groups.set(base, []);
    groups.get(base).push(r);
  }
  const upcoming = [];
  for (const [base, rs] of groups) {
    rs.sort((a, b) => parseDate(a[4]).t - parseDate(b[4]).t);
    const dates = rs.map((r) => parseDate(r[4]));
    const head = rs[0];
    const slug = `${dates[0].iso || "x"}-${asciiSlug(base, "tour")}`.slice(0, 60);
    // KV画像は、そのシリーズで最初に入っている行のものを使う（Day1に無くてDay2にあることがある）
    const kvRow = rs.find((r) => String(r[12] || "").trim());
    const img = await fetchImage(drive, kvRow ? kvRow[12] : "", slug);
    upcoming.push({
      name: base,
      first: dates[0],
      last: dates[dates.length - 1],
      dates,
      game: String((rs.find((r) => (r[6] || "").trim()) || [])[6] || "").trim(),
      link: firstUrl((rs.find((r) => firstUrl(r[7])) || [])[7]) || firstUrl((rs.find((r) => firstUrl(r[8])) || [])[8]) || "#",
      img,
      excerpt: "e活が協賛・ミラー配信でサポートするコミュニティ大会です。",
    });
  }
  upcoming.sort((a, b) => a.first.t - b.first.t);   // 近い順

  // カレンダー用。日程1本＝1件（カードはシリーズでまとめるが、こちらは日ごとに置く）
  const calEvents = [];
  for (const u of upcoming) {
    for (const d of u.dates) {
      if (d.iso) calEvents.push({ iso: d.iso, name: u.name, link: u.link });
    }
  }
  calEvents.sort((a, b) => a.iso.localeCompare(b.iso) || a.name.localeCompare(b.name));
  console.log(`これからの大会: ${upcoming.length} 件（日程 ${soon.length} 本）／これまでの大会: ${past.length} 件`);

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
  // これからの大会が0件のときは何も入れない。見出しごと消すのは main.js（ビルド後に日が過ぎた分も同じ扱いにするため）
  const soonCards = upcoming.map(upcomingCardHtml).join("\n\n");

  let html = fs.readFileSync(HTML_PATH, "utf8");
  // マーカーの間を入れ替える。正規表現は使わない（テンプレート文字列の中で
  // バックスラッシュが食われて [sS] になる事故があったため・2026-09-23）。
  const put = (marker, body) => {
    const head = `<!-- ${marker}:START -->`;
    const tail = `<!-- ${marker}:END -->`;
    const i = html.indexOf(head);
    const j = html.indexOf(tail);
    if (i < 0 || j < 0 || j < i) { console.error(`works.html に ${marker}:START/END マーカーが見つかりません`); process.exit(1); }
    html = html.slice(0, i + head.length) + (body ? `\n${body}\n        ` : `\n        `) + html.slice(j);
  };
  put("WORKS:CAL", calendarHtml(calEvents));
  put("WORKS:UPCOMING", soonCards);
  put("WORKS", cards);
  fs.writeFileSync(HTML_PATH, html);
  console.log(`works.html を更新しました（これから ${upcoming.length} 件／これまで ${items.length} 件）`);
}

main().catch((e) => { console.error("❌", e.message); process.exit(1); });
