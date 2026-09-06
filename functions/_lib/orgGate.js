/* =========================================================
   主催者ページの入口の門番（2026-09-06 新設）

   専用リンクの文字列（k）から
     ・どの主催者部屋か（参加可否シート「主催者」タブ）
     ・その部屋の大会はどれか（マスターの大会名が部屋名で始まる行）
   を返す。/api/org-data と /api/org-update の2つがここを通る。

   サポーター側の gate.js とは別。あちらは「素材が届いているか」を見るが、
   主催者にその判定は無い（相手なので、開けたら必ず中身が出る）。

   ★大会と部屋の結び付けは e活Bot の preEventRules.findRoomByTournamentName と同じ規則。
     「大会名 === 部屋名」または「大会名 が 部屋名+空白 で始まる」（例：部屋「英雄王杯」→「英雄王杯 Day1」）。
     ここだけは全角空白・連続空白を1つに均してから比べる。
     部屋名に末尾の空白が入っているもの（「NOBORI Season1 」）が実際にあるため。

   5分だけ Cloudflare のキャッシュに置く（シートの読み過ぎを防ぐ）。
   ========================================================= */

const PART_SHEET_ID = '1GwQPo1rx6sHAQKdyoVAYlyYjTZYPmEJP7bsX0QBrTOU';
const ORG_TAB = '主催者';
const PARENT_ID = '1OYvATSqyoo8E-sl2WvVS4Ev9pFgwoH7U';   // 共有ドライブ「VTuber納品」の親（Botと同じ既定値）
const KV_FOLDER = '大会KV';
const CACHE_SEC = 300;
const KV_CACHE_SEC = 600;

export async function accessToken(env) {
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

export async function gget(token, url) {
  const r = await fetch(url, { headers: { authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Googleを読めませんでした (' + r.status + ')');
  return r.json();
}

export const sheetValues = async (token, id, range) =>
  (await gget(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}/values/${encodeURIComponent(range)}`)).values || [];

// マスターの1枚目のタブ名（Botも calendar-data.js も同じ取り方をしている）
export async function firstTabTitle(token, id) {
  const meta = await gget(token, `https://sheets.googleapis.com/v4/spreadsheets/${id}?fields=sheets.properties.title`);
  return meta.sheets[0].properties.title;
}

// ---- 大会名と部屋名の結び付け（Botと同じ規則） ----
const spaceNorm = s => String(s || '').replace(/[　]/g, ' ').replace(/\s+/g, ' ').trim();
export function belongsToRoom(tournamentName, roomName) {
  const a = spaceNorm(tournamentName).toLowerCase();
  const b = spaceNorm(roomName).toLowerCase();
  if (!a || !b) return false;
  return a === b || a.startsWith(b + ' ');
}

// ---- 「主催者」タブ ----
// A:大会名（部屋名） B:部屋チャンネルID C:合言葉(bot管理) D:KVは聞かない E:シーズン共通KV F:発行日
export async function orgByKey(token, key) {
  let rows;
  try {
    rows = await sheetValues(token, PART_SHEET_ID, `${ORG_TAB}!A2:F`);
  } catch (e) {
    throw new Error('主催者の名簿を読めませんでした');
  }
  for (const row of rows) {
    const k = String(row[2] || '').trim();
    if (k && k === key) {
      return {
        room: String(row[0] || '').trim(),
        channelId: String(row[1] || '').trim(),
        kvSkip: String(row[3] || '').includes('○'),
        seasonKv: String(row[4] || '').includes('○'),
      };
    }
  }
  return null;
}

// 入口の判定。戻り値 { ok, reason, room, channelId, kvSkip, seasonKv }
//   reason: 'nokey'（リンク無し）/ 'badkey'（名簿に無い）/ ''（通してよい）
export async function checkOrg(env, request, key) {
  key = String(key || '').trim();
  if (!key) return { ok: false, reason: 'nokey' };
  const origin = new URL(request.url).origin;
  const cache = caches.default;
  const ck = new Request(origin + '/__orggate/' + encodeURIComponent(key), { method: 'GET' });
  const hit = await cache.match(ck);
  if (hit) return hit.json();

  const token = await accessToken(env);
  const p = await orgByKey(token, key);
  const out = p ? { ok: true, reason: '', ...p } : { ok: false, reason: 'badkey' };
  const res = new Response(JSON.stringify(out), {
    headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CACHE_SEC}` },
  });
  try { await cache.put(ck, res.clone()); } catch (e) { /* キャッシュに置けなくても答えは返す */ }
  return out;
}

// ---- Driveの「大会KV」フォルダにある画像のファイル名 ----
//   マスターのM列が空でも、主催者が部屋やボタンで出したKVはここに入っている。
//   欄が空なだけで「未提出」と言わないため（2026-09-06 依田「催促は事実と照らし合わせてから」）。
//   Botの driveDelivery.listTournamentKVs / kvExistsFor と同じ照合にそろえてある。
export async function listTournamentKVs(env, request, token) {
  const origin = new URL(request.url).origin;
  const cache = caches.default;
  const ck = new Request(origin + '/__orgkv/list', { method: 'GET' });
  const hit = await cache.match(ck);
  if (hit) return hit.json();

  let names = [];
  try {
    const fq = new URLSearchParams({
      q: `name = '${KV_FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and '${PARENT_ID}' in parents and trashed = false`,
      fields: 'files(id,name)', corpora: 'allDrives', includeItemsFromAllDrives: 'true', supportsAllDrives: 'true', pageSize: '5',
    });
    const folders = (await gget(token, 'https://www.googleapis.com/drive/v3/files?' + fq)).files || [];
    if (folders.length) {
      const lq = new URLSearchParams({
        q: `'${folders[0].id}' in parents and trashed = false and mimeType contains 'image/'`,
        fields: 'files(name)', corpora: 'allDrives', includeItemsFromAllDrives: 'true', supportsAllDrives: 'true', pageSize: '200',
      });
      names = ((await gget(token, 'https://www.googleapis.com/drive/v3/files?' + lq)).files || []).map(f => f.name);
    }
  } catch (e) {
    // 読めない時は空で返す。KVの有無はマスターのM列だけで見る（止めるより通すほうが害が小さい）
    return [];
  }
  const res = new Response(JSON.stringify(names), {
    headers: { 'content-type': 'application/json', 'cache-control': `max-age=${KV_CACHE_SEC}` },
  });
  try { await cache.put(ck, res.clone()); } catch (e) { /* 置けなくても答えは返す */ }
  return names;
}

export function kvExistsFor(names, tournamentName) {
  const n = s => String(s).replace(/\s+/g, '').toLowerCase();
  const nt = n(tournamentName);
  if (!nt) return false;
  return (names || []).some(f => {
    const base = String(f).split('_')[0];
    return (base && nt.startsWith(n(base))) || n(f).includes(nt);
  });
}

// ---- まだ出してもらえていない情報 ----
//   Botの handlers/preEventRules.js の missingTournamentInfo と同じ並び・同じ判定にそろえてある。
//   ★向こうを直したらここも直す（片方だけ直すと、部屋の催促とこのページで言うことが食い違う）。
export function missingInfo(t, opts) {
  const o = opts || {};
  const miss = [];
  if (!t.time) miss.push({ key: 'time', label: '開始時間' });
  if (!t.streamUrl) miss.push({ key: 'streamUrl', label: '本番配信枠URL' });
  if (!t.highlight) miss.push({ key: 'highlight', label: '見どころ' });
  if (!t.rule) miss.push({ key: 'rule', label: 'ミラー配信のルール・条件' });
  const kvCovered = !!t.kv || !!o.kvInDrive || !!o.kvSkip || !!o.seasonKv;
  if (!kvCovered) miss.push({ key: 'kv', label: '大会メイン告知画像（KV）' });
  return miss;
}

export { PART_SHEET_ID, ORG_TAB };
