/* =========================================================
   GET /api/org-data?k=<主催者の専用リンクの文字列>   （2026-09-06 新設）

   主催者ページ（/org）が読むデータを、その場でシートから作って返す。

   何を返すか
     ・その主催者の大会の一覧（マスターの大会名が部屋名で始まる行）
     ・大会ごとの「まだ出してもらえていない情報」
     ・大会ごとの「ミラー配信をする方」（参加可否シートの○／△）

   返さないもの＝他の主催者の大会・お金・契約・連絡先。
   専用リンクが無い／名簿に無い時は、中身を一切返さない（空＋理由だけ）。

   GitHubのスケジュールは当てにならないので、静的ファイルは作らずここで直接読む
   （ミラー配信カレンダーの /api/calendar-data と同じ考え方）。
   合言葉ごとに60秒だけキャッシュする。

   必要なシークレット：GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
   ========================================================= */

import {
  accessToken, sheetValues, firstTabTitle, checkOrg,
  belongsToRoom, listTournamentKVs, kvExistsFor, missingInfo, PART_SHEET_ID,
} from '../_lib/orgGate.js';

const MASTER_ID = '1J3A9VXi72s4mEsBUVr6tpO3X_lzalCS7L6wweGj11dU';
const MONTHS_BACK = 6;
const CACHE_SEC = 60;

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...extra },
  });

// 日付の読み方は /api/calendar-data と同じ（ここを変える時は向こうも合わせる）
function parseDate(str, now) {
  if (!str) return null;
  const s = String(str)
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[／]/g, '/').replace(/[－ー]/g, '-');
  const ymd8 = s.match(/^(\d{4})(\d{2})(\d{2})$/);
  if (ymd8) return mk(+ymd8[1], +ymd8[2], +ymd8[3]);
  const m = s.match(/(?:(\d{4})[\/\-年])?(\d{1,2})[\/\-月](\d{1,2})/);
  if (!m) return null;
  let year = m[1] ? +m[1] : now.y;
  if (!m[1] && +m[2] < now.m) year++;
  return mk(year, +m[2], +m[3]);
}
// Cloudflareの時計はUTCなので、年月日だけを持つ（Dateのローカル時刻に頼らない）
function mk(y, m, d) {
  const t = Date.UTC(y, m - 1, d);
  if (isNaN(t)) return null;
  const dd = new Date(t);
  if (dd.getUTCMonth() !== m - 1) return null;
  return { y, m, d, t };
}
const ymd = x => `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`;
const cut = (s, n) => String(s || '').trim().slice(0, n);

// 動作確認用の枠（e活運営…）は主催者の画面に出さない
const isStaff = n => /^e活運営/.test(String(n || '').trim());

async function build(env, request, gate) {
  const token = await accessToken(env);
  const tab = await firstTabTitle(token, MASTER_ID);
  const [mRows, pRows, kvNames, oRows] = await Promise.all([
    sheetValues(token, MASTER_ID, `${tab}!A2:Q`),
    sheetValues(token, PART_SHEET_ID, '参加可否!A2:D'),
    listTournamentKVs(env, request, token),
    sheetValues(token, PART_SHEET_ID, '主催者!A2:H'),
  ]);

  // 大会名 → 回答（VTuber名 → ○△×）
  const answers = new Map();
  for (const r of pRows) {
    const tname = (r[0] || '').trim(), who = (r[1] || '').trim(), st = (r[2] || '').trim();
    if (!tname || !who || !st || isStaff(who)) continue;
    if (!answers.has(tname)) answers.set(tname, new Map());
    answers.get(tname).set(who, st);
  }

  // JSTの今日
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  const now = { y: nowJst.getUTCFullYear(), m: nowJst.getUTCMonth() + 1 };
  const todayT = Date.UTC(nowJst.getUTCFullYear(), nowJst.getUTCMonth(), nowJst.getUTCDate());
  const from = Date.UTC(now.y, now.m - 1 - MONTHS_BACK, 1);

  const tournaments = [];
  for (let i = 0; i < mRows.length; i++) {
    const r = mRows[i] || [];
    const name = (r[0] || '').trim();
    if (!name || !belongsToRoom(name, gate.room)) continue;
    // 日付が読めない行は「毎週土曜」等の台帳の見出し行。主催者には出さない
    const d = parseDate((r[4] || '').trim(), now);
    if (!d || d.t < from) continue;

    const ans = answers.get(name) || new Map();
    const pick = mark => [...ans.entries()].filter(([, s]) => s.includes(mark)).map(([n]) => n);
    const t = {
      row: i + 2,
      name,
      date: ymd(d),
      past: d.t < todayT,
      daysUntil: Math.round((d.t - todayT) / 86400000),
      game: cut(r[6], 80),
      time: cut(r[9], 12),
      streamUrl: cut(r[7], 400),
      xUrl: cut(r[8], 400),
      note: cut(r[11], 1200),
      kv: cut(r[12], 400),
      highlight: cut(r[13], 1200),
      rule: cut(r[14], 1200),
      publishAt: cut(r[16], 40),   // Q列：告知してよい日（2026-09-07）
      partner: String(r[1] || '').includes('○'),
      casual: String(r[2] || '').includes('○'),
      yes: pick('○'), maybe: pick('△'),
    };
    t.mirror = t.partner || t.casual;
    t.kvInDrive = !t.kv && kvExistsFor(kvNames, name);
    // 「足りないもの」はミラー配信をする大会だけ数える（Botの催促と同じ線）
    t.miss = t.mirror && !t.past
      ? missingInfo(t, { kvInDrive: t.kvInDrive, kvSkip: gate.kvSkip, seasonKv: gate.seasonKv })
      : [];
    tournaments.push(t);
  }
  tournaments.sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)));

  // ── いまの設定（ミラー許諾／配信の扱い）────────────────────
  //   許諾はマスターB/C列。これからの大会の1件目を代表にする（部屋ごとに同じ値で運用している）。
  const head = tournaments.find(t => !t.past) || tournaments[tournaments.length - 1] || null;
  const permOf = (p, n) => (p && n ? 'both' : p ? 'partner' : n ? 'next' : 'none');
  const flagOf = (v) => (String(v || '').trim() === 'はい' ? true : String(v || '').trim() === 'いいえ' ? false : null);
  const myRow = (oRows || []).find(r => String((r || [])[1] || '').trim() === String(gate.channelId || '')) || [];

  return {
    generatedAt: new Date().toISOString(),
    room: gate.room,
    settings: {
      mirror: head ? permOf(head.partner, head.casual) : '',
      closeOnResult: flagOf(myRow[6]),
      allowMultiMirror: flagOf(myRow[7]),
    },
    kvSkip: !!gate.kvSkip,
    seasonKv: !!gate.seasonKv,
    tournaments,
  };
}

export async function onRequestGet({ request, env, waitUntil }) {
  const url = new URL(request.url);
  const key = String(url.searchParams.get('k') || '').trim();
  try {
    if (!env.GOOGLE_REFRESH_TOKEN) return json({ ok: false, gated: true, reason: 'setup', tournaments: [] });
    const gate = await checkOrg(env, request, key);
    if (!gate.ok) return json({ ok: false, gated: true, reason: gate.reason, tournaments: [] });

    // 合言葉ごとに60秒だけキャッシュ（開き直しのたびにシートを読まない）
    const cache = caches.default;
    const ck = new Request(url.origin + '/__orgdata/' + encodeURIComponent(key), { method: 'GET' });
    const hit = await cache.match(ck);
    if (hit) return hit;

    const data = await build(env, request, gate);
    const res = json({ ok: true, ...data }, 200, { 'cache-control': `max-age=${CACHE_SEC}` });
    waitUntil(cache.put(ck, res.clone()));
    return res;
  } catch (e) {
    return json({ ok: false, error: e.message || '読めませんでした', tournaments: [] }, 500);
  }
}
