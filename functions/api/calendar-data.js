/* =========================================================
   GET /api/calendar-data   （2026-09-06 新設）

   カレンダー（/calendar・/day）が読む大会データを、その場でシートから作って返す。

   なぜ作ったか
     もともとは GitHub Actions が毎時 calendar-data.json を作り直す設計だったが、
     GitHubのスケジュールは新しく足した日に一度も鳴らなかった（16:05〜18:05で0回）。
     works.html の更新も「6時間ごと」の設定で実際は日に4回程度。
     新しい大会が主催者側で決まってからカレンダーに出るまで何時間も空くのは困るので、
     ここで直接読む形にした。Claudeにも GitHub の気まぐれにも頼らない。

   中身は tools/build-calendar.js と同じ形（events / members）。
     ・KV画像のパスだけは、静的な calendar-data.json（build-calendar.js が作るもの）から引き写す。
       画像はリポジトリのファイルなので、ここからは有無が分からないため。
     ・2分だけ Cloudflare のキャッシュに置く。シートの読み過ぎを防ぐ。

   必要なシークレット：GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
   ========================================================= */

const MASTER_ID = '1J3A9VXi72s4mEsBUVr6tpO3X_lzalCS7L6wweGj11dU';
const PART_ID = '1GwQPo1rx6sHAQKdyoVAYlyYjTZYPmEJP7bsX0QBrTOU';
const MONTHS_BACK = 2;
const MONTHS_AHEAD = 4;
const CACHE_SEC = 120;

const json = (obj, status = 200, extra = {}) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });

async function accessToken(env) {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body,
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('Googleの認証に失敗しました');
  return j.access_token;
}

async function gget(token, url) {
  const r = await fetch(url, { headers: { authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('シートを読めませんでした (' + r.status + ')');
  return r.json();
}

const values = async (token, id, range) =>
  (await gget(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`)).values || [];

// tools/build-calendar.js の parseDate と同じ（ここを変える時は向こうも合わせる）
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
// 日付は「年月日」だけを持つ（Cloudflareの時計はUTCなので Date のローカル時刻に頼らない）
function mk(y, m, d) {
  const t = Date.UTC(y, m - 1, d);
  if (isNaN(t)) return null;
  const dd = new Date(t);
  if (dd.getUTCMonth() !== m - 1) return null;   // 2/30 などを弾く
  return { y, m, d, t };
}
const ymd = x => `${x.y}-${String(x.m).padStart(2, '0')}-${String(x.d).padStart(2, '0')}`;
const oneLine = (s, n) => String(s || '').replace(/\s+/g, ' ').trim().slice(0, n);

async function build(env, origin) {
  const token = await accessToken(env);
  const meta = await gget(token, `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_ID}?fields=sheets.properties.title`);
  const tab = meta.sheets[0].properties.title;
  const [mRows, pRows, rRows] = await Promise.all([
    values(token, MASTER_ID, `${tab}!A2:O`),
    values(token, PART_ID, '参加可否!A2:D'),
    values(token, PART_ID, '名簿!A2:D'),
  ]);

  // KV画像の場所は静的ファイルから引き写す（無ければ空）
  const kvByName = new Map();
  try {
    const st = await fetch(origin + '/calendar-data.json', { cf: { cacheTtl: 600 } }).then(r => r.json());
    for (const e of st.events || []) if (e.kv) kvByName.set(e.name, e.kv);
  } catch (e) { /* 静的ファイルが無いだけ。画像なしで出す */ }

  const part = new Map();
  for (const r of pRows) {
    const tname = (r[0] || '').trim(), who = (r[1] || '').trim(), st = (r[2] || '').trim();
    if (!tname || !who || !st) continue;
    if (!part.has(tname)) part.set(tname, new Map());
    part.get(tname).set(who, st);
  }
  const members = rRows.map(r => ({ name: (r[0] || '').trim(), tier: (r[1] || '').trim() })).filter(m => m.name);

  // JSTの今日
  const nowJst = new Date(Date.now() + 9 * 3600 * 1000);
  const now = { y: nowJst.getUTCFullYear(), m: nowJst.getUTCMonth() + 1 };
  const from = Date.UTC(now.y, now.m - 1 - MONTHS_BACK, 1);
  const to = Date.UTC(now.y, now.m - 1 + MONTHS_AHEAD + 1, 0);

  const events = [];
  for (const r of mRows) {
    const name = (r[0] || '').trim();
    if (!name) continue;
    const d = parseDate((r[4] || '').trim(), now);
    if (!d || d.t < from || d.t > to) continue;
    const ans = part.get(name) || new Map();
    const pick = mark => [...ans.entries()].filter(([, s]) => s.includes(mark)).map(([n]) => n);
    const cleanName = name.replace(/\s+/g, ' ');
    events.push({
      date: ymd(d),
      name: cleanName,
      partner: String(r[1] || '').includes('○'),
      casual: String(r[2] || '').includes('○'),
      kv: kvByName.get(cleanName) || '',
      game: (r[6] || '').trim(),
      time: (r[9] || '').trim().replace(/\s+/g, '').slice(0, 5) || '',
      streamUrl: (r[7] || '').trim(),
      xUrl: (r[8] || '').trim(),
      rule: oneLine(r[14], 300),
      highlight: oneLine(r[13], 300),
      yes: pick('○'), maybe: pick('△'), no: pick('×'),
    });
  }
  events.sort((a, b) => a.date.localeCompare(b.date) || String(a.time).localeCompare(String(b.time)));
  return { generatedAt: new Date().toISOString(), source: 'live', members, events };
}

export async function onRequestGet({ request, env, waitUntil }) {
  const origin = new URL(request.url).origin;
  const cache = caches.default;
  const cacheKey = new Request(origin + '/api/calendar-data', { method: 'GET' });
  const hit = await cache.match(cacheKey);
  if (hit) return hit;
  try {
    if (!env.GOOGLE_REFRESH_TOKEN) throw new Error('設定が入っていません');
    const data = await build(env, origin);
    const res = json(data, 200, { 'cache-control': `public, max-age=${CACHE_SEC}` });
    waitUntil(cache.put(cacheKey, res.clone()));
    return res;
  } catch (e) {
    // 読めない時は静的ファイルをそのまま返す（ページを真っ白にしない）
    try {
      const st = await fetch(origin + '/calendar-data.json').then(r => r.json());
      st.source = 'static';
      st.liveError = e.message;
      return json(st, 200, { 'cache-control': 'no-store' });
    } catch { return json({ ok: false, error: e.message }, 500); }
  }
}
