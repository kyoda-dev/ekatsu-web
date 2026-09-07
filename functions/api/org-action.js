/* =========================================================
   POST /api/org-action   （2026-09-07 新設）

   主催者ページ（/org）から「開催日の変更」「大会の中止」「大会名の変更」を受ける。
   2026-09-07 依田指示：この3つもDiscordではなくサイトからできるようにする。

   受け取るもの（JSON）
     { k, action: 'date',   row, newDate: 'YYYY-MM-DD' }
     { k, action: 'cancel', rows: [行番号...] }
     { k, action: 'rename', newName: '◯◯ vol.2' }

   書く列
     date   … E（日程）だけ
     cancel … P（中止）だけ。★行は消さない。印を付けると
              Botの getMasterTournaments が既定で返さなくなり、
              カレンダー・催促・当日案内・X告知がまとめて止まる
     rename … ★ここでは書かない。Botの applyTournamentRename が
              マスター・部屋名・登録・人物台帳をまとめて直す（二重に持たない）

   Discordへの連絡は全部Botに任せる（参加の回答＝CALSYNC と同じ形）。
     ORGSYNC {"kind":"date",   "tournament":"…","oldDate":"…","newDate":"…"}
     ORGSYNC {"kind":"cancel", "room":"…"}
     ORGSYNC {"kind":"rename", "channelId":"…","newName":"…"}

   守っていること
     ・書く前に、その行の大会名がその主催者の部屋のものか毎回確かめ直す
     ・1つでもおかしければ何も書かない
     ・依田への通知は増やさない（masterWatch が拾う）
   ========================================================= */

import { accessToken, sheetValues, firstTabTitle, checkOrg, belongsToRoom } from '../_lib/orgGate.js';

const MASTER_ID = '1J3A9VXi72s4mEsBUVr6tpO3X_lzalCS7L6wweGj11dU';
const MAX_ROWS = 20;
const NAME_MAX = 80;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

const clean = (s, max) => String(s == null ? '' : s)
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, max);

// マスターの日程は「2026/09/20」の形で入っている。そこへそろえる
function normDate(v) {
  const m = String(v || '').trim().match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const y = +m[1], mo = +m[2], d = +m[3];
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
  return { text: `${y}/${String(mo).padStart(2, '0')}/${String(d).padStart(2, '0')}`, utc: dt.getTime() };
}
const todayUtc = () => {
  const n = new Date(Date.now() + 9 * 3600 * 1000);
  return Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate());
};

async function batchWrite(token, data) {
  const res = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${MASTER_ID}/values:batchUpdate`,
    {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ valueInputOption: 'RAW', data }),
    }
  );
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error('シートに書けませんでした (' + res.status + ')' + (detail ? ' ' + detail.slice(0, 120) : ''));
  }
}

async function tellBot(env, payload) {
  if (!env.DISCORD_SYNC_WEBHOOK) return;
  try {
    await fetch(env.DISCORD_SYNC_WEBHOOK, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'ORGSYNC ' + JSON.stringify(payload), flags: 4096 }),  // 通知音は鳴らさない
    });
  } catch (e) { /* 握りつぶす。シートは書けているので、連絡が飛ばないだけ */ }
}

// 画面が古いままにならないよう、この人のぶんの控えを捨てる
async function dropCache(request, key) {
  try {
    const origin = new URL(request.url).origin;
    await caches.default.delete(new Request(origin + '/__orgdata/' + encodeURIComponent(key), { method: 'GET' }));
    // ★門番の控えも捨てる。大会名を変えた直後にここが古いままだと、
    //   belongsToRoom（大会名が部屋名で始まるか）が外れて、本人のページから大会が消える。
    await caches.default.delete(new Request(origin + '/__orggate/' + encodeURIComponent(key), { method: 'GET' }));
  } catch (e) { /* 60秒〜5分で入れ替わる */ }
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.GOOGLE_REFRESH_TOKEN) return json({ ok: false, error: 'まだ準備中です' }, 503);

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: '中身が読めませんでした' }, 400); }

    const key = String(body.k || '').trim();
    if (!key) return json({ ok: false, error: '専用のリンクからお入りください' }, 401);
    const gate = await checkOrg(env, request, key);
    if (!gate.ok) return json({ ok: false, error: 'リンクが確かめられませんでした。お手数ですが運営までお知らせください' }, 401);

    const action = String(body.action || '').trim();
    const token = await accessToken(env);
    const tab = await firstTabTitle(token, MASTER_ID);
    const all = await sheetValues(token, MASTER_ID, `${tab}!A2:A`);

    // その行が本当にこの主催者の大会かを毎回確かめる
    const verify = (rows) => {
      const out = [];
      for (const row of rows) {
        const name = String((all[row - 2] || [])[0] || '').trim();
        if (!name || !belongsToRoom(name, gate.room)) return null;
        out.push({ row, name });
      }
      return out;
    };
    const asRows = (v) => [...new Set((Array.isArray(v) ? v : [v])
      .map(n => parseInt(n, 10)).filter(n => Number.isInteger(n) && n >= 2 && n <= 5000))];

    // ───────── 開催日の変更
    if (action === 'date') {
      const rows = asRows(body.row != null ? body.row : body.rows);
      if (rows.length !== 1) return json({ ok: false, error: '日程は1つずつ変更してください' }, 400);
      const nd = normDate(body.newDate);
      if (!nd) return json({ ok: false, error: '日付の形が違います（例：2026-09-20）' }, 400);
      if (nd.utc < todayUtc()) return json({ ok: false, error: '過ぎた日付には変更できません' }, 400);

      const t = verify(rows);
      if (!t) return json({ ok: false, error: '大会の情報が変わっているようです。ページを開き直してからお試しください' }, 409);

      const cur = await sheetValues(token, MASTER_ID, `${tab}!E${rows[0]}:E${rows[0]}`);
      const oldDate = String((cur[0] || [])[0] || '').trim();
      if (oldDate === nd.text) return json({ ok: false, error: '今と同じ日付です' }, 400);

      await batchWrite(token, [{ range: `${tab}!E${rows[0]}`, values: [[nd.text]] }]);
      await dropCache(request, key);
      await tellBot(env, { kind: 'date', tournament: t[0].name, oldDate, newDate: nd.text });
      return json({ ok: true, name: t[0].name, oldDate, newDate: nd.text });
    }

    // ───────── 大会の中止
    if (action === 'cancel') {
      const rows = asRows(body.rows != null ? body.rows : body.row);
      if (!rows.length) return json({ ok: false, error: '大会が分かりませんでした' }, 400);
      if (rows.length > MAX_ROWS) return json({ ok: false, error: '一度に中止できるのは' + MAX_ROWS + '本までです' }, 400);
      const t = verify(rows);
      if (!t) return json({ ok: false, error: '大会の情報が変わっているようです。ページを開き直してからお試しください' }, 409);

      // P列の見出しが空なら入れておく（人がシートを見た時に何の列か分かるように）
      const head = await sheetValues(token, MASTER_ID, `${tab}!P1:P1`);
      const data = [];
      if (!String((head[0] || [])[0] || '').trim()) data.push({ range: `${tab}!P1`, values: [['中止']] });
      for (const x of t) data.push({ range: `${tab}!P${x.row}`, values: [['○']] });
      await batchWrite(token, data);
      await dropCache(request, key);
      await tellBot(env, { kind: 'cancel', room: gate.room });
      return json({ ok: true, rows: t.map(x => x.row), names: t.map(x => x.name) });
    }

    // ───────── 大会名の変更（Botがマスターも部屋名も直す）
    if (action === 'rename') {
      const newName = clean(body.newName, NAME_MAX);
      if (!newName) return json({ ok: false, error: '新しい大会名をご入力ください' }, 400);
      if (newName === gate.room) return json({ ok: false, error: '今と同じ大会名です' }, 400);
      if (!gate.channelId) return json({ ok: false, error: 'お部屋が分かりませんでした。運営までお知らせください' }, 409);
      await tellBot(env, { kind: 'rename', channelId: gate.channelId, newName });
      await dropCache(request, key);
      // ★合言葉の表（主催者タブ）の大会名も、Bot側が部屋名を直したあとに揃う。
      //   ここでは触らない（同じものを2か所から書かない）。
      return json({ ok: true, oldName: gate.room, newName, note: 'reflect-async' });
    }

    // ───────── ミラー配信の許諾（誰に許すか）
    //   ★マスターB/C列を書くのはBotの updateMirrorPermissions だけ。ここでは書かない。
    //     参加カードの出し直しなど、書いたあとの段取りが全部Bot側にあるため。
    if (action === 'mirror') {
      const perm = String(body.perm || '').trim();
      if (!['both', 'partner', 'next', 'none'].includes(perm)) {
        return json({ ok: false, error: '選び方が正しくありません' }, 400);
      }
      if (!gate.channelId) return json({ ok: false, error: 'お部屋が分かりませんでした。運営までお知らせください' }, 409);
      await tellBot(env, { kind: 'mirror', channelId: gate.channelId, perm });
      await dropCache(request, key);
      return json({ ok: true, perm, note: 'reflect-async' });
    }

    // ───────── 配信の扱い（結果発表で閉じるか／他の大会と同じ枠で流してよいか）
    if (action === 'bcast') {
      const p = { kind: 'bcast', channelId: gate.channelId };
      if (typeof body.closeOnResult === 'boolean') p.closeOnResult = body.closeOnResult;
      if (typeof body.allowMultiMirror === 'boolean') p.allowMultiMirror = body.allowMultiMirror;
      if (!('closeOnResult' in p) && !('allowMultiMirror' in p)) {
        return json({ ok: false, error: '変更するところがありませんでした' }, 400);
      }
      if (!gate.channelId) return json({ ok: false, error: 'お部屋が分かりませんでした。運営までお知らせください' }, 409);
      await tellBot(env, p);
      await dropCache(request, key);
      return json({ ok: true, note: 'reflect-async' });
    }

    // ───────── 次回大会の申し込み（申請フォームの代わり）
    //   ★部屋を作る・日程の枠表を出す・契約判断を出す、は全部Botがやる（Discordのボタンと同じ関数）。
    if (action === 'nextcup') {
      const name = clean(body.name, NAME_MAX);
      if (!name) return json({ ok: false, error: '次回の大会名をご入力ください' }, 400);
      if (!gate.channelId) return json({ ok: false, error: 'お部屋が分かりませんでした。運営までお知らせください' }, 409);
      await tellBot(env, {
        kind: 'nextcup',
        channelId: gate.channelId,
        name,
        game: clean(body.game, 60),
        url: clean(body.url, 200),
      });
      return json({ ok: true, name, note: 'reflect-async' });
    }

    return json({ ok: false, error: '受け付けられない操作です' }, 400);
  } catch (e) {
    return json({ ok: false, error: e.message || '受け付けられませんでした' }, 500);
  }
}

export async function onRequestGet() {
  return json({ ok: false, error: 'この住所は変更の受け取り専用です' }, 405);
}
