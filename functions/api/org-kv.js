/* =========================================================
   /api/org-kv   （2026-09-23 新設）

   主催者ページから「大会メイン告知画像（KV）」を受け取る。
   発端＝KVだけサイトで受けられず、Discordのお部屋のボタンでしか出せなかった。
     催促の文（Botの10日前・3日前）は「大会情報ページからご登録ください」と案内しているのに、
     ページには「KVだけはDiscordで」と書いてある。相手が迷って止まる（2026-09-23時点で
     BB's CUP・Osu! Japan Community Cup #2 が未提出のまま）。
   → ページで受け取れるようにして、Discordのボタンは新しく出さない。

   置き場＝Driveの「大会KV」フォルダ（開催記録＝請求書の月フォルダ とは別）。
     共有ドライブ「パートナーVtuber名簿」(1OYvATSqyoo8E-sl2WvVS4Ev9pFgwoH7U) の直下
       └ 大会KV (1FK2NG-1Wy56OoBNY_6lm1dDaocrmhBsD)
     ＝Botの driveDelivery.uploadTournamentKV と同じ場所。2026-09-23にマスターM列のURLから実物を確かめた。
   名前＝{部屋名}_{元のファイル名}
     ＝Botと同じ付け方。Botの findTournamentKV / kvExistsFor は「最初の _ より前」を大会名として
       照合するので、ここを崩すと「Driveに実物はあるのに未提出」と催促してしまう。

   受け取ったら マスターのM列（大会KV画像）に共有リンクを書く。
     書く先＝同じ部屋の、シリーズ基本名が同じ行すべて（Day1／Day2…）。
     既存データもその形（Ludovate Cup Day1／Day2 が同じURL）。
     「Japan REMATCH League 8/8」のように回ごとにKVが違うものは基本名が別なので巻き込まない。

   ★ファイルはこの関数を通さない。ブラウザ → Drive へ直接送る（resumable upload の送り先URLだけ発行する）。
     /api/org-record と同じやり方。Cloudflareの受け取り上限に当たらない。

   POST { k, action:'start', row, size, mime, ext, name } … 送り先URLを発行
   POST { k, action:'done',  fileId }                     … 届いたファイルを確かめ、M列へ書く／Botに合図

   守っていること
     ・Driveの既存フォルダは動かさない・消さない・作らない（「大会KV」が見つからない時は断る）
     ・書く前に、その行がこの主催者の大会か毎回確かめ直す（行がずれても他人の大会を書き換えない）
     ・シートへの書き込みは1回だけ。失敗しても入れ直さない（同じ行に二重に書かないため）
     ・依田への通知は増やさない。Botには合図だけ送り、部屋に出しっぱなしのKVボタンを
       「受領済み」に書き換えてもらう（新しいメッセージは出さない）
   ========================================================= */

import {
  accessToken, gget, sheetValues, firstTabTitle, checkOrg,
  belongsToRoom, seriesBase, PARENT_ID, KV_FOLDER,
} from '../_lib/orgGate.js';

const MASTER_ID = '1J3A9VXi72s4mEsBUVr6tpO3X_lzalCS7L6wweGj11dU';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const MAX_MB = 20;
const MAX_ROWS = 20;                                        // シリーズものでも一度に書くのはこの本数まで
const EXTS = /^(png|jpe?g|webp|gif|heic|bmp)$/i;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const q = s => String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function gateOf(env, request, key) {
  if (!env.GOOGLE_REFRESH_TOKEN) return { err: json({ ok: false, error: 'まだ準備中です' }, 503) };
  key = String(key || '').trim();
  if (!key) return { err: json({ ok: false, error: '専用のリンクからお入りください' }, 401) };
  const gate = await checkOrg(env, request, key);
  if (!gate.ok) return { err: json({ ok: false, error: 'リンクが確かめられませんでした。お手数ですが運営までお知らせください' }, 401) };
  if (!gate.channelId) return { err: json({ ok: false, error: 'お部屋が分かりませんでした。運営までお知らせください' }, 409) };
  return { gate, key };
}

// 「大会KV」フォルダを探す。★無い時は作らない（作ると同じ名前のフォルダが2つできて、
//   Bot（driveDelivery）が見ている方と食い違う）。見つからなければ断る。
async function kvFolderId(token) {
  const lq = new URLSearchParams({
    q: `name = '${q(KV_FOLDER)}' and '${PARENT_ID}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
    fields: 'files(id)', supportsAllDrives: 'true', includeItemsFromAllDrives: 'true', corpora: 'allDrives', pageSize: '2',
  });
  const hit = ((await gget(token, `${DRIVE}?${lq}`)).files || [])[0];
  if (!hit) throw new Error('保存先が見つかりませんでした。お手数ですが運営までお知らせください');
  return hit.id;
}

// 書き込む行を決める。row＝画面で選んだ大会の行番号。
//   戻り値 { rows:[行番号...], name:'その行の大会名' }。この主催者の大会でなければ null。
async function targetRows(token, gate, row) {
  const tab = await firstTabTitle(token, MASTER_ID);
  const all = await sheetValues(token, MASTER_ID, `${tab}!A2:A`);
  const name = String((all[row - 2] || [])[0] || '').trim();
  if (!name || !belongsToRoom(name, gate.room)) return null;
  const base = seriesBase(name);
  const rows = [];
  for (let i = 0; i < all.length; i++) {
    const n = String((all[i] || [])[0] || '').trim();
    if (!n || !belongsToRoom(n, gate.room)) continue;
    if (seriesBase(n) !== base) continue;
    rows.push(i + 2);
  }
  return { tab, rows: rows.slice(0, MAX_ROWS), name, base };
}

async function tellBot(env, payload) {
  if (!env.DISCORD_SYNC_WEBHOOK) return;
  try {
    await fetch(env.DISCORD_SYNC_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'ORGSYNC ' + JSON.stringify(payload), flags: 4096 }),   // 通知音は鳴らさない
    });
  } catch (e) { /* 握りつぶす。KVはDriveとマスターに入っているので、部屋のボタンが古いままになるだけ */ }
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
      const row = parseInt(body.row, 10);
      if (!Number.isInteger(row) || row < 2 || row > 5000) return json({ ok: false, error: '大会が分かりませんでした' }, 400);
      const size = Number(body.size);
      if (!Number.isFinite(size) || size <= 0) return json({ ok: false, error: 'ファイルが読めませんでした' }, 400);
      if (size > MAX_MB * 1024 * 1024) return json({ ok: false, error: MAX_MB + 'MBまでの画像でお願いいたします' }, 400);
      const mime = String(body.mime || '').slice(0, 100);
      const ext = String(body.ext || '').replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toLowerCase();
      if (!(/^image\//.test(mime) || EXTS.test(ext))) return json({ ok: false, error: '画像のファイルをお選びください' }, 400);

      const t = await targetRows(token, gate, row);
      if (!t) return json({ ok: false, error: '大会の情報が変わっているようです。ページを開き直してからお試しください' }, 409);

      const folderId = await kvFolderId(token);
      // 名前は Bot（uploadTournamentKV）と同じ形＝{部屋名}_{元のファイル名}。
      // 元の名前が無い／読めない時だけ「KV.拡張子」で補う。
      const safeRoom = String(gate.room).replace(/[　]/g, ' ').replace(/\s+/g, ' ').trim().replace(/[\/:*?"<>|\\]/g, '_');
      const orig = String(body.name || '').replace(/[\/:*?"<>|\\]/g, '_').replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 80);
      const fileName = `${safeRoom}_${orig || ('KV' + (ext ? '.' + ext : ''))}`;
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
          name: fileName,
          parents: [folderId],
          description: `大会メイン告知画像（KV）／大会：${t.name}／主催者ページから提出`,
          appProperties: { ekatsuKv: '1', ekatsuRoom: gate.channelId, ekatsuRow: String(row) },
        }),
      });
      const uploadUrl = res.headers.get('location');
      if (!res.ok || !uploadUrl) return json({ ok: false, error: '送る準備ができませんでした (' + res.status + ')。時間をおいてお試しください' }, 502);
      return json({ ok: true, uploadUrl });
    }

    // ───────── 届いたかの確認 → マスターM列へ → Botへ合図
    if (action === 'done') {
      const fileId = String(body.fileId || '').replace(/[^A-Za-z0-9_-]/g, '');
      if (!fileId) return json({ ok: false, error: '送り終わりを確かめられませんでした' }, 400);
      const f = await gget(token, `${DRIVE}/${fileId}?supportsAllDrives=true&fields=id,name,webViewLink,appProperties`);
      const ap = f.appProperties || {};
      // このファイルが「いまページを開いている主催者が、この関数を通して送ったもの」か毎回確かめる
      if (ap.ekatsuKv !== '1' || ap.ekatsuRoom !== gate.channelId) {
        return json({ ok: false, error: '送り終わりを確かめられませんでした' }, 409);
      }
      const row = parseInt(ap.ekatsuRow, 10);
      const t = await targetRows(token, gate, row);
      if (!t || !t.rows.length) return json({ ok: false, error: '大会の情報が変わっているようです。ページを開き直してからお試しください' }, 409);
      const url = f.webViewLink || '';
      if (!url) return json({ ok: false, error: '送り終わりを確かめられませんでした' }, 502);

      // ★書き込みは1回だけ。失敗しても入れ直さない（同じ行に二重に書かないため）。
      const res = await fetch(
        `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_ID}/values:batchUpdate`,
        {
          method: 'POST',
          headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
          body: JSON.stringify({
            valueInputOption: 'RAW',
            data: t.rows.map(r => ({ range: `${t.tab}!M${r}`, values: [[url]] })),
          }),
        }
      );
      if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error('受け取りましたが、記録に失敗しました (' + res.status + ')' + (detail ? ' ' + detail.slice(0, 120) : ''));
      }

      await tellBot(env, {
        kind: 'kv', channelId: gate.channelId, room: gate.room,
        tournament: t.base, url, name: f.name, rows: t.rows,
      });

      // 画面の一覧が古いままにならないよう、この人のぶんの控えを捨てる
      try {
        const origin = new URL(request.url).origin;
        await caches.default.delete(new Request(origin + '/__orgdata/' + encodeURIComponent(g.key), { method: 'GET' }));
      } catch (e) { /* 消せなくても60秒で入れ替わる */ }

      return json({ ok: true, url, rows: t.rows });
    }

    return json({ ok: false, error: '受け付けられない操作です' }, 400);
  } catch (e) {
    return json({ ok: false, error: e.message || '受け付けられませんでした' }, 500);
  }
}

// GET で叩かれた時は静かに断る（いま出ているかは /api/org-data の kv / kvInDrive で分かる）
export async function onRequestGet() {
  return json({ ok: false, error: 'この住所は提出の受け取り専用です' }, 405);
}
