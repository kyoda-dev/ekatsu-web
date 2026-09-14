/* =========================================================
   /api/org-record   （2026-09-15 新設）

   主催者ページから「開催の記録」を受け取る。
     ・優勝が決まる場面の動画（20秒ほど）
     ・e活のロゴが映っている画面（画像1枚）
   発端＝社長「協賛して大会を無事開催したエビデンスを残してほしい（税務署や国からつっこまれる）」。
   URLだけでは残らない（アーカイブは消える）ので、ファイルそのものをDriveに置く。

   置き場＝請求書と同じ「A&L依田 / 03_【社長確認用】/ 請求書 / {月}」
     ＝Botの uploadInvoiceToDrive と同じ月フォルダ。月は「その部屋の、今日までで一番新しい大会の月」
       （Botの invoiceDateForRoom と同じ決め方）。税務で聞かれたら1つのフォルダを見せれば済む。
   名前＝{年}{月}月{大会名}_開催記録_優勝シーン.mp4 ／ _開催記録_ロゴ.png
     （請求書は {年}{月}月{大会名}_協賛金_e活（スポンサー）。並べると隣に来る）

   ★ファイルはこの関数を通さない。ブラウザ → Drive へ直接送る（resumable upload の送り先URLだけ発行する）。
     Cloudflareの受け取り上限に当たらず、300MBの動画でも入る。
     送り先URLは、呼んできたページのOriginを付けて発行する（Googleがそのページからの送信だけ通す）。
   ★Discordを使わない理由＝主催者サーバーはブースト0で10MBまで。20秒の動画が入らないことがある。

   GET  ?k=                                  … 対象の月と、もう届いているか
   POST { k, action:'start', kind, size, mime, ext } … 送り先URLを発行
   POST { k, action:'done',  fileId }        … 届いたファイルを確かめて、Botに合図（ORGSYNC kind:'record'）

   守っていること
     ・Driveの既存フォルダは動かさない・消さない（月フォルダが無い時だけ作る）
     ・届いたファイルがこの主催者のものか、appProperties で毎回確かめる
     ・依田への通知は増やさない（未着の時だけBotが7日後に1回）
   ========================================================= */

import { accessToken, gget, sheetValues, firstTabTitle, checkOrg, belongsToRoom } from '../_lib/orgGate.js';

const MASTER_ID = '1J3A9VXi72s4mEsBUVr6tpO3X_lzalCS7L6wweGj11dU';
const INVOICE_FOLDER_ID = '1MAR1XU4Zho40QNKbdpyLlh7y2CFkagAj';   // A&L依田 / 03_【社長確認用】/ 請求書（Botの INVOICE_FOLDER_ID と同じ）
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const LOOKBACK_DAYS = 120;   // これより前に終わった大会しか無い主催者には欄を出さない
const KINDS = {
  video: { label: '優勝シーン', mime: /^video\//, maxMb: 300, exts: /^(mp4|mov|m4v|webm|mkv|avi|wmv|flv|ts)$/i },
  logo:  { label: 'ロゴ',       mime: /^image\//, maxMb: 20,  exts: /^(png|jpe?g|webp|gif|heic|bmp)$/i },
};

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// マスターの日付（2026/09/20 など）。年が無い書き方は今年として読む
function parseDate(s) {
  const t = String(s || '').replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace(/[／]/g, '/');
  const m = t.match(/(?:(\d{4})[\/\-年])?(\d{1,2})[\/\-月](\d{1,2})/);
  if (!m) return null;
  const nowY = new Date(Date.now() + 9 * 3600 * 1000).getUTCFullYear();
  const y = m[1] ? +m[1] : nowY, mo = +m[2], d = +m[3];
  const u = Date.UTC(y, mo - 1, d);
  const dt = new Date(u);
  if (dt.getUTCMonth() !== mo - 1) return null;
  return { y, m: mo, d, u };
}

// 対象の月＝その部屋の、今日までで一番新しい大会（中止は除く）
async function targetOf(token, gate) {
  const tab = await firstTabTitle(token, MASTER_ID);
  const rows = await sheetValues(token, MASTER_ID, `${tab}!A2:P`);
  const n = new Date(Date.now() + 9 * 3600 * 1000);
  const today = Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
  let best = null;
  for (const r of rows) {
    const name = String((r || [])[0] || '').trim();
    if (!name || !belongsToRoom(name, gate.room)) continue;
    if (String((r || [])[15] || '').trim()) continue;   // P列＝中止
    const d = parseDate((r || [])[4]);
    if (!d || d.u > today) continue;
    if (!best || d.u > best.u) best = d;
  }
  if (!best || today - best.u > LOOKBACK_DAYS * 86400000) return null;
  return {
    key: `${best.y}-${String(best.m).padStart(2, '0')}`,
    folder: `${best.m}月`,
    label: `${best.y}年${best.m}月`,
    prefix: `${best.y}${best.m}月`,
    lastDate: `${best.y}-${String(best.m).padStart(2, '0')}-${String(best.d).padStart(2, '0')}`,
  };
}

const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function findOrMakeMonthFolder(token, name) {
  const lq = new URLSearchParams({
    q: `name = '${q(name)}' and '${INVOICE_FOLDER_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', corpora: 'allDrives', pageSize: '2',
  });
  const hit = ((await gget(token, `${DRIVE}?${lq}`)).files || [])[0];
  if (hit) return hit.id;
  const r = await fetch(`${DRIVE}?supportsAllDrives=true&fields=id`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ name, mimeType: 'application/vnd.google-apps.folder', parents: [INVOICE_FOLDER_ID] }),
  });
  if (!r.ok) throw new Error('保存先を用意できませんでした (' + r.status + ')');
  return (await r.json()).id;
}

// この部屋・この月で、もう届いているもの
async function received(token, channelId, key) {
  const lq = new URLSearchParams({
    q: `appProperties has { key='ekatsuRoom' and value='${q(channelId)}' } and appProperties has { key='ekatsuMonth' and value='${q(key)}' } and trashed = false`,
    fields: 'files(id,appProperties,createdTime)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', corpora: 'allDrives', pageSize: '50',
  });
  const files = (await gget(token, `${DRIVE}?${lq}`)).files || [];
  const have = {};
  for (const f of files) {
    const k = (f.appProperties || {}).ekatsuKind;
    if (KINDS[k]) have[k] = { at: f.createdTime };
  }
  return have;
}

async function tellBot(env, payload) {
  if (!env.DISCORD_SYNC_WEBHOOK) return;
  try {
    await fetch(env.DISCORD_SYNC_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'ORGSYNC ' + JSON.stringify(payload), flags: 4096 }),   // 通知音は鳴らさない
    });
  } catch (e) { /* 握りつぶす。ファイルはDriveに入っているので、Botの控えが付かないだけ */ }
}

async function gateOf(env, request, key) {
  if (!env.GOOGLE_REFRESH_TOKEN) return { err: json({ ok: false, error: 'まだ準備中です' }, 503) };
  key = String(key || '').trim();
  if (!key) return { err: json({ ok: false, error: '専用のリンクからお入りください' }, 401) };
  const gate = await checkOrg(env, request, key);
  if (!gate.ok) return { err: json({ ok: false, error: 'リンクが確かめられませんでした。お手数ですが運営までお知らせください' }, 401) };
  if (!gate.channelId) return { err: json({ ok: false, error: 'お部屋が分かりませんでした。運営までお知らせください' }, 409) };
  return { gate };
}

export async function onRequestGet({ request, env }) {
  try {
    const g = await gateOf(env, request, new URL(request.url).searchParams.get('k'));
    if (g.err) return g.err;
    const token = await accessToken(env);
    const target = await targetOf(token, g.gate);
    if (!target) return json({ ok: true, target: null });
    const have = await received(token, g.gate.channelId, target.key);
    return json({ ok: true, target: { label: target.label, lastDate: target.lastDate }, have });
  } catch (e) {
    return json({ ok: false, error: e.message || '読めませんでした' }, 500);
  }
}

export async function onRequestPost({ request, env }) {
  try {
    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: '中身が読めませんでした' }, 400); }
    const g = await gateOf(env, request, body.k);
    if (g.err) return g.err;
    const gate = g.gate;
    const token = await accessToken(env);
    const action = String(body.action || '');

    // ───────── 送り先URLの発行
    if (action === 'start') {
      const kind = KINDS[body.kind];
      if (!kind) return json({ ok: false, error: '選び方が正しくありません' }, 400);
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0) return json({ ok: false, error: 'ファイルが読めませんでした' }, 400);
      if (size > kind.maxMb * 1024 * 1024) return json({ ok: false, error: kind.maxMb + 'MBまでのファイルでお願いいたします' }, 400);
      const mime = String(body.mime || '').slice(0, 100);
      const ext = String(body.ext || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toLowerCase();
      if (!(kind.mime.test(mime) || kind.exts.test(ext))) {
        return json({ ok: false, error: body.kind === 'video' ? '動画のファイルをお選びください' : '画像のファイルをお選びください' }, 400);
      }
      const target = await targetOf(token, gate);
      if (!target) return json({ ok: false, error: '終わった大会が見つかりませんでした。運営までお知らせください' }, 409);

      const folderId = await findOrMakeMonthFolder(token, target.folder);
      const safeRoom = String(gate.room).replace(/[\/:*?"<>|\\]/g, '_');
      const name = `${target.prefix}${safeRoom}_開催記録_${kind.label}${ext ? '.' + ext : ''}`;
      const origin = request.headers.get('origin') || new URL(request.url).origin;
      const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
        method: 'POST',
        headers: {
          authorization: 'Bearer ' + token,
          'content-type': 'application/json; charset=UTF-8',
          'x-upload-content-length': String(size),
          ...(mime ? { 'x-upload-content-type': mime } : {}),
          origin,
        },
        body: JSON.stringify({
          name,
          parents: [folderId],
          description: `開催記録（${kind.label}）／大会：${gate.room}／最終開催日：${target.lastDate}／主催者ページから提出`,
          appProperties: { ekatsuRecord: '1', ekatsuRoom: gate.channelId, ekatsuMonth: target.key, ekatsuKind: body.kind },
        }),
      });
      const uploadUrl = res.headers.get('location');
      if (!res.ok || !uploadUrl) return json({ ok: false, error: '送る準備ができませんでした (' + res.status + ')。時間をおいてお試しください' }, 502);
      return json({ ok: true, uploadUrl });
    }

    // ───────── 届いたかの確認 → Botへ合図
    if (action === 'done') {
      const fileId = String(body.fileId || '').replace(/[^A-Za-z0-9_-]/g, '');
      if (!fileId) return json({ ok: false, error: '送り終わりを確かめられませんでした' }, 400);
      const f = await gget(token, `${DRIVE}/${fileId}?supportsAllDrives=true&fields=id,name,size,webViewLink,appProperties`);
      const ap = f.appProperties || {};
      if (ap.ekatsuRoom !== gate.channelId || !KINDS[ap.ekatsuKind]) return json({ ok: false, error: '送り終わりを確かめられませんでした' }, 409);
      await tellBot(env, {
        kind: 'record', channelId: gate.channelId, month: ap.ekatsuMonth, recKind: ap.ekatsuKind,
        name: f.name, url: f.webViewLink || '', size: Number(f.size || 0),
      });
      return json({ ok: true });
    }

    return json({ ok: false, error: '受け付けられない操作です' }, 400);
  } catch (e) {
    return json({ ok: false, error: e.message || '受け付けられませんでした' }, 500);
  }
}
