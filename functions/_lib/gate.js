/* =========================================================
   カレンダーの入口の門番（2026-09-06 依田「まだ素材を提出していない人に大会情報を与えない」）

   専用リンクの文字列（k）から
     ・誰か（名簿 A列）／ランク（B列）
     ・素材が届いているか（共有ドライブ「<活動名>/02_2Dデータ素材」に画像等が1つでもあるか）
   を返す。/api/me・/api/calendar-data・/api/participate の3つがこれを通る。

   「素材が届いているか」の基準は、サイト掲載（tools/build-vtuber.js）や
   Botの素材受け取り（assetIntake.js）と同じ場所・同じ拡張子。別の基準を作らない。

   5分だけ Cloudflare のキャッシュに置く（ドライブとシートの読み過ぎを防ぐ）。
   ドライブが読めなかった時は「届いている」扱いで通す（止めるより通すほうが害が小さい）。
   ========================================================= */

const PART_SHEET_ID = '1GwQPo1rx6sHAQKdyoVAYlyYjTZYPmEJP7bsX0QBrTOU';
const PARENT_ID = '1OYvATSqyoo8E-sl2WvVS4Ev9pFgwoH7U';   // 共有ドライブ「VTuber納品」の親（assetIntake.js と同じ既定値）
const ASSETS_SUBFOLDER = '02_2Dデータ素材';
const ASSET_EXT = /\.(png|jpe?g|gif|webp|psd|clip|ai|svg|zip)$/i;
const CACHE_SEC = 300;

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

async function gget(token, url) {
  const r = await fetch(url, { headers: { authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('Googleを読めませんでした (' + r.status + ')');
  return r.json();
}

const norm = s => String(s || '').toLowerCase().replace(/[\s　]/g, '');

async function driveList(token, q, pageSize = 100) {
  const u = 'https://www.googleapis.com/drive/v3/files?' + new URLSearchParams({
    q, fields: 'files(id,name,mimeType)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', pageSize: String(pageSize),
  });
  return (await gget(token, u)).files || [];
}

const isFolder = f => String(f.mimeType || '') === 'application/vnd.google-apps.folder';

// 共有ドライブ「<活動名>/02_2Dデータ素材」に素材が1つでもあるか。
//   1つ下のフォルダ（「表情差分」「live2D」など）に入れている人もいるので、そこまで見る（2026-09-06 白峰凱志・バジルで確認）
export async function hasMaterials(token, name) {
  const folders = await driveList(token, `'${PARENT_ID}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`, 200);
  const hit = folders.find(f => norm(f.name) === norm(name));
  if (!hit) return false;
  const subs = await driveList(token, `'${hit.id}' in parents and name='${ASSETS_SUBFOLDER}' and trashed=false`);
  if (!subs.length) return false;
  const files = await driveList(token, `'${subs[0].id}' in parents and trashed=false`, 100);
  if (files.some(f => !isFolder(f) && ASSET_EXT.test(f.name || ''))) return true;
  for (const d of files.filter(isFolder).slice(0, 10)) {
    const inner = await driveList(token, `'${d.id}' in parents and trashed=false`, 100);
    if (inner.some(f => !isFolder(f) && ASSET_EXT.test(f.name || ''))) return true;
  }
  return false;
}

// 名簿から k の持ち主を引く。無ければ null
export async function whoIs(token, key) {
  const j = await gget(token, `https://sheets.googleapis.com/v4/spreadsheets/${PART_SHEET_ID}/values/${encodeURIComponent('名簿!A2:E')}`);
  for (const row of (j.values || [])) {
    if (String(row[4] || '').trim() && String(row[4]).trim() === key) {
      return { who: String(row[0] || '').trim(), tier: String(row[1] || '').trim() };
    }
  }
  return null;
}

// 入口の判定。戻り値 { ok, reason, who, tier, ready }
//   reason: 'nokey'（リンク無し）/ 'badkey'（名簿に無い）/ 'notready'（素材がまだ）/ ''（通してよい）
export async function checkAccess(env, request, key) {
  key = String(key || '').trim();
  if (!key) return { ok: false, reason: 'nokey' };
  const origin = new URL(request.url).origin;
  const cache = caches.default;
  const ck = new Request(origin + '/__gate/' + encodeURIComponent(key), { method: 'GET' });
  const hit = await cache.match(ck);
  if (hit) return hit.json();

  const token = await accessToken(env);
  const p = await whoIs(token, key);
  let out;
  if (!p) out = { ok: false, reason: 'badkey' };
  else {
    // 運営の動作確認用の枠（e活運営…）は素材が無くても通す
    let ready = true;
    if (!/^e活運営/.test(p.who)) {
      try { ready = await hasMaterials(token, p.who); }
      catch (e) { ready = true; out = { driveError: e.message }; }
    }
    out = { ...(out || {}), ok: ready, reason: ready ? '' : 'notready', who: p.who, tier: p.tier, ready };
  }
  const res = new Response(JSON.stringify(out), { headers: { 'content-type': 'application/json', 'cache-control': `max-age=${CACHE_SEC}` } });
  try { await cache.put(ck, res.clone()); } catch (e) { /* キャッシュに置けなくても答えは返す */ }
  return out;
}
