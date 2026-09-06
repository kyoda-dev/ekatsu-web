#!/usr/bin/env node
/* =========================================================
   build-calendar.js  （2026-09-06 新設・依田の指示）

   ミラー配信カレンダー（/calendar）に渡すデータを作る。
   Discordのテキストの予定表は見づらいので、ブラウザの月カレンダーに移した。

   読むもの
     ・大会スケジュール_マスター  … 大会名／日程／時間／ゲーム／本配信URL／ミラールール／見どころ
     ・参加可否シート「参加可否」  … 誰がどの大会に ○△× で答えたか
     ・参加可否シート「名簿」      … サポーターの一覧（活動名・区分）

   書き出すもの
     ・calendar-data.json （リポジトリ直下。calendar.html が読む）

   使い方:  cd tools && node build-calendar.js
   認証:   e活Bot の .env を流用（GitHub Actions では Secrets から環境変数で渡す）
   ========================================================= */
const fs = require('fs');
const path = require('path');

const ENV_PATH = process.env.ENV_PATH || path.join(__dirname, '..', '..', 'e-katsu', '.env');
require('dotenv').config({ path: ENV_PATH });
const { google } = require('googleapis');

// シートのIDは build-works.js と同じ扱いで、ここに既定値を持つ。
// （このリポジトリは公開だが、IDが分かってもシート自体は非公開なので中身は読めない。
//   鍵＝GOOGLE_REFRESH_TOKEN だけは必ず Secrets から渡す。ここには絶対に書かない）
const MASTER_ID = process.env.MASTER_SCHEDULE_ID || '1J3A9VXi72s4mEsBUVr6tpO3X_lzalCS7L6wweGj11dU';
const PART_ID = process.env.PARTICIPATION_SHEET_ID || '1GwQPo1rx6sHAQKdyoVAYlyYjTZYPmEJP7bsX0QBrTOU';
const OUT = path.join(__dirname, '..', 'calendar-data.json');

// 前後どこまで載せるか。過去は「実績として見える」ぶんだけ、先は決まっている範囲。
const MONTHS_BACK = 2;
const MONTHS_AHEAD = 4;

function getAuth() {
  const a = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  a.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return a;
}

// 「2026/09/06」「9/6」「２０２６年９月６日」などを Date に。e活Bot の parseTournamentDate と同じ考え方。
function parseDate(str) {
  if (!str) return null;
  const s = String(str)
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[／]/g, '/').replace(/[－ー]/g, '-');
  const ymd8 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymd8) {
    const d = new Date(+ymd8[1], +ymd8[2] - 1, +ymd8[3]);
    return isNaN(d.getTime()) ? null : d;
  }
  const m = s.match(/(?:(\d{4})[\/\-年])?(\d{1,2})[\/\-月](\d{1,2})/);
  if (!m) return null;
  const now = new Date();
  let year = m[1] ? +m[1] : now.getFullYear();
  if (!m[1] && +m[2] < now.getMonth() + 1) year++;
  const d = new Date(year, +m[2] - 1, +m[3]);
  return isNaN(d.getTime()) ? null : d;
}

const ymd = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const oneLine = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

(async () => {
  if (!PART_ID) throw new Error('PARTICIPATION_SHEET_ID が未設定');
  const sheets = google.sheets({ version: 'v4', auth: getAuth() });

  // --- マスター（1枚目のタブ） ---
  const meta = await sheets.spreadsheets.get({ spreadsheetId: MASTER_ID, fields: 'sheets.properties.title' });
  const tab = meta.data.sheets[0].properties.title;
  const mRows = (await sheets.spreadsheets.values.get({ spreadsheetId: MASTER_ID, range: `${tab}!A2:O` })).data.values || [];

  // --- 参加可否・名簿 ---
  const pRows = (await sheets.spreadsheets.values.get({ spreadsheetId: PART_ID, range: '参加可否!A2:D' })).data.values || [];
  const rRows = (await sheets.spreadsheets.values.get({ spreadsheetId: PART_ID, range: '名簿!A2:D' })).data.values || [];

  // 大会名 → [{name, status}]
  const part = new Map();
  for (const r of pRows) {
    const tname = (r[0] || '').trim(), who = (r[1] || '').trim(), st = (r[2] || '').trim();
    if (!tname || !who || !st) continue;
    if (!part.has(tname)) part.set(tname, new Map());
    part.get(tname).set(who, st);   // 同じ人が複数行にいたら後勝ち＝最新
  }

  const members = rRows
    .map(r => ({ name: (r[0] || '').trim(), tier: (r[1] || '').trim() }))
    .filter(m => m.name);

  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth() - MONTHS_BACK, 1);
  const to = new Date(now.getFullYear(), now.getMonth() + MONTHS_AHEAD + 1, 0);

  const events = [];
  for (const r of mRows) {
    const name = (r[0] || '').trim();
    if (!name) continue;
    const d = parseDate((r[4] || '').trim());   // E列＝日程
    if (!d || d < from || d > to) continue;
    const ans = part.get(name) || new Map();
    const pick = mark => [...ans.entries()].filter(([, s]) => s.includes(mark)).map(([n]) => n);
    events.push({
      date: ymd(d),
      name: name.replace(/\s+/g, ' '),
      game: (r[6] || '').trim(),                 // G列
      time: (r[9] || '').trim().replace(/\s+/g, '').slice(0, 5) || '',   // J列＝開始時間
      streamUrl: (r[7] || '').trim(),            // H列
      xUrl: (r[8] || '').trim(),                 // I列
      rule: oneLine(r[14], 300),                 // O列＝ミラー配信ルール
      highlight: oneLine(r[13], 300),            // N列＝見どころ
      yes: pick('○'), maybe: pick('△'), no: pick('×'),
    });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)));

  const out = { generatedAt: new Date().toISOString(), members, events };
  fs.writeFileSync(OUT, JSON.stringify(out), 'utf8');
  console.log(`calendar-data.json を書き出した … 大会 ${events.length}本 / サポーター ${members.length}名`);
})().catch(e => { console.error('エラー:', e.message); process.exit(1); });
