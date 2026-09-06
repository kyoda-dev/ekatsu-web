/* =========================================================
   POST /api/org-update   （2026-09-06 新設・段階2）

   主催者ページ（/org）の「大会情報」の入力を、マスタースケジュールへ書く。
   e活Botの「📝 大会情報を変更する」モーダル（scheduleHandler.updateTournamentDetails）と
   同じ列・同じ書き方にそろえてある。

   受け取るもの（JSON）
     { k: 合言葉, rows: [行番号...], fields: { time, streamUrl, highlight, rule, note } }
     fields は入っているものだけ書く（渡していない欄は触らない＝既にある値を消さない）。

   書く列
     H＝本番配信枠URL / J＝開始時間 / L＝備考 / N＝見どころ / O＝ミラー配信のルール

   絶対に書かない列
     A 大会名・E 日程（＝Discordで承る。ここで動かさない）
     B/C ミラー許諾・D 情報公開（＝許諾と公開の判断）
     G ゲーム・I 大会X（＝申請から自動転記済み）
     M 大会KV（＝段階3。画像はDriveへ入れる形にする）

   守っていること
     ・書く前に、その行の大会名がその主催者の部屋のものか毎回確かめ直す
       （行がずれても他の主催者の大会を書き換えない）
     ・依田へ新しい通知は出さない。開始時間・本番配信枠URL・見どころ・ミラールールの変更は
       Botの masterWatch が #全体連絡 へ自動で知らせる（メッセージを増やさない）

   必要なシークレット：GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
   ========================================================= */

import { accessToken, sheetValues, firstTabTitle, checkOrg, belongsToRoom } from '../_lib/orgGate.js';

const MASTER_ID = '1J3A9VXi72s4mEsBUVr6tpO3X_lzalCS7L6wweGj11dU';
const MAX_ROWS = 20;          // シリーズものでも一度に書くのはこの本数まで
const LONG_MAX = 1000;        // 見どころ・ルール・備考の上限
const URL_MAX = 300;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

// 見えない制御文字を落とす。改行とタブは残す（見どころは複数行で書かれる）
const clean = (s, max) => String(s == null ? '' : s)
  .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
  .replace(/\r\n?/g, '\n')
  .trim()
  .slice(0, max);

// 開始時間は先頭を「20:00」の形にそろえる。全角・「20時」「2000」も受ける。空は「消す」の意味。
//   ★後ろに付いた但し書き（「21:00（本配信20時半スタート）」）はそのまま残す。
//     マスターには実際にこの形の行があり、時刻だけに削ると主催者からの補足を消してしまう。
//     読む側（/api/calendar-data・Bot）は先頭5文字を見ているので、先頭さえ整っていれば困らない。
function normTime(v) {
  const raw = String(v == null ? '' : v)
    .replace(/[０-９]/g, c => String.fromCharCode(c.charCodeAt(0) - 0xFEE0))
    .replace(/[：]/g, ':')
    .replace(/[\r\n\t]/g, ' ')
    .trim();
  if (!raw) return { ok: true, value: '' };
  const head = raw.replace(/[\s　]/g, '');
  let m = head.match(/^(\d{1,2}):(\d{1,2})/) || head.match(/^(\d{1,2})時(\d{1,2})分?/);
  let len = m ? m[0].length : 0;
  if (!m) {
    const only = head.match(/^(\d{1,2})時/);
    if (only) { m = [only[0], only[1], '0']; len = only[0].length; }
  }
  if (!m) {
    const four = head.match(/^(\d{2})(\d{2})(?!\d)/);
    if (four) { m = [four[0], four[1], four[2]]; len = four[0].length; }
  }
  if (!m) return { ok: false, error: '開始時間は「20:00」の形でご入力ください' };
  const h = +m[1], mi = +m[2];
  if (h > 23 || mi > 59) return { ok: false, error: '開始時間が時刻として読めませんでした' };
  const time = String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
  const rest = head.slice(len).trim();
  return { ok: true, value: (rest ? time + '　' + rest : time).slice(0, 40) };
}

// 本番配信枠URLは http(s) だけ。空は「消す」の意味
function normUrl(v) {
  const s = clean(v, URL_MAX).replace(/\s+/g, '');
  if (!s) return { ok: true, value: '' };
  if (!/^https?:\/\/[^\s]+\.[^\s]+/i.test(s)) {
    return { ok: false, error: '本番配信枠URLは https:// から始まる形でご入力ください' };
  }
  return { ok: true, value: s };
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.GOOGLE_REFRESH_TOKEN) return json({ ok: false, error: 'まだ準備中です' }, 503);

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: '中身が読めませんでした' }, 400); }

    const key = String(body.k || '').trim();
    if (!key) return json({ ok: false, error: '専用のリンクからお入りください' }, 401);

    const gate = await checkOrg(env, request, key);
    if (!gate.ok) {
      return json({ ok: false, error: 'リンクが確かめられませんでした。お手数ですが運営までお知らせください' }, 401);
    }

    const rows = [...new Set((Array.isArray(body.rows) ? body.rows : [body.row])
      .map(n => parseInt(n, 10)).filter(n => Number.isInteger(n) && n >= 2 && n <= 5000))];
    if (!rows.length) return json({ ok: false, error: '大会が分かりませんでした' }, 400);
    if (rows.length > MAX_ROWS) return json({ ok: false, error: '一度に変更できるのは' + MAX_ROWS + '本までです' }, 400);

    // ---- 入力の点検（1つでもおかしければ何も書かない）----
    const f = body.fields && typeof body.fields === 'object' ? body.fields : {};
    const write = {};   // 列 → 値
    if ('time' in f) {
      const r = normTime(f.time);
      if (!r.ok) return json({ ok: false, error: r.error }, 400);
      write.J = r.value;
    }
    if ('streamUrl' in f) {
      const r = normUrl(f.streamUrl);
      if (!r.ok) return json({ ok: false, error: r.error }, 400);
      write.H = r.value;
    }
    if ('highlight' in f) write.N = clean(f.highlight, LONG_MAX);
    if ('rule' in f) write.O = clean(f.rule, LONG_MAX);
    if ('note' in f) write.L = clean(f.note, LONG_MAX);
    if (!Object.keys(write).length) return json({ ok: false, error: '変更するところがありませんでした' }, 400);

    const token = await accessToken(env);
    const tab = await firstTabTitle(token, MASTER_ID);

    // ---- 書く前に、その行が本当にこの主催者の大会か確かめ直す ----
    //   行番号は画面を開いた時のもの。マスターに行が足された後でも、他人の大会を書き換えないため。
    const all = await sheetValues(token, MASTER_ID, `${tab}!A2:A`);
    const target = [];
    for (const row of rows) {
      const name = String((all[row - 2] || [])[0] || '').trim();
      if (!name || !belongsToRoom(name, gate.room)) {
        return json({ ok: false, error: '大会の情報が変わっているようです。ページを開き直してからお試しください' }, 409);
      }
      target.push({ row, name });
    }

    // ---- 書き込み（値のある列だけ・1回のリクエストにまとめる）----
    const data = [];
    for (const t of target) {
      for (const col of Object.keys(write)) {
        data.push({ range: `${tab}!${col}${t.row}`, values: [[write[col]]] });
      }
    }
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

    // 画面の一覧が古いままにならないよう、この人のぶんの控えを捨てる
    try {
      const origin = new URL(request.url).origin;
      await caches.default.delete(new Request(origin + '/__orgdata/' + encodeURIComponent(key), { method: 'GET' }));
    } catch (e) { /* 消せなくても60秒で入れ替わる */ }

    return json({ ok: true, rows: target.map(t => t.row), names: target.map(t => t.name) });
  } catch (e) {
    return json({ ok: false, error: e.message || '受け付けられませんでした' }, 500);
  }
}

// GET で叩かれた時は静かに断る
export async function onRequestGet() {
  return json({ ok: false, error: 'この住所は変更の受け取り専用です' }, 405);
}
