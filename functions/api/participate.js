/* =========================================================
   POST /api/participate   （2026-09-06 新設・依田の指示）

   カレンダーの詳細ページ（/day）から届く「ミラー配信に参加しますか？」の回答を
   参加可否シートへ書く。e活Botの recordParticipation と同じ場所・同じ書き方。

   受け取るもの（JSON）
     { k: 合言葉, tournament: 大会名, status: 'yes' | 'maybe' | 'no' }

   誰が押したか
     参加可否シートの「名簿」タブ **E列**＝合言葉。
     ここに一致する行の A列（活動名）をその人として扱う。
     Botが発行して各サポーターのお部屋へ専用リンクを配る。
     ★D列は使わない。あそこは「予定メッセージID(bot管理)」が既に入っていて、
       上書きすると各部屋のピン留め「あなたの参加予定」が全部つながらなくなる（2026-09-06に確認）。

   必要なCloudflareのシークレット（Pages → Settings → 環境変数）
     GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REFRESH_TOKEN
   ※ googleapis は Workers で動かないので、fetch でGoogleのAPIを直接叩いている。
   ========================================================= */

const PART_SHEET_ID = '1GwQPo1rx6sHAQKdyoVAYlyYjTZYPmEJP7bsX0QBrTOU';
const STATUS_MARK = { yes: '○', maybe: '△', no: '×' };

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

// リフレッシュトークンからアクセストークンを取る（1リクエストにつき1回）
async function accessToken(env) {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: 'refresh_token',
  });
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('Googleの認証に失敗しました');
  return j.access_token;
}

const sheetUrl = (range, extra = '') =>
  `https://sheets.googleapis.com/v4/spreadsheets/${PART_SHEET_ID}/values/${encodeURIComponent(range)}${extra}`;

async function getRange(token, range) {
  const r = await fetch(sheetUrl(range), { headers: { authorization: 'Bearer ' + token } });
  if (!r.ok) throw new Error('シートを読めませんでした');
  return (await r.json()).values || [];
}

export async function onRequestPost({ request, env }) {
  try {
    if (!env.GOOGLE_REFRESH_TOKEN) {
      return json({ ok: false, error: 'まだ準備中です（設定が入っていません）' }, 503);
    }

    let body;
    try { body = await request.json(); } catch { return json({ ok: false, error: '中身が読めませんでした' }, 400); }

    const key = String(body.k || '').trim();
    const tournament = String(body.tournament || '').trim();
    const status = String(body.status || '').trim();
    if (!key) return json({ ok: false, error: '専用のリンクからお入りください' }, 401);
    if (!tournament) return json({ ok: false, error: '大会が分かりませんでした' }, 400);
    if (!STATUS_MARK[status]) return json({ ok: false, error: '回答の中身が正しくありません' }, 400);

    const token = await accessToken(env);

    // ---- 合言葉から本人を引く ----
    // 名簿 A=活動名 / B=区分 / C=部屋ID / D=予定メッセージID(bot管理・触らない) / E=合言葉
    const roster = await getRange(token, '名簿!A2:E');
    let who = '';
    for (const row of roster) {
      if (String(row[4] || '').trim() && String(row[4]).trim() === key) { who = String(row[0] || '').trim(); break; }
    }
    if (!who) return json({ ok: false, error: 'リンクが正しくないようです。運営までお知らせください' }, 401);

    // ---- 既にその大会に同じ人の行があれば書き換え、無ければ足す ----
    const rows = await getRange(token, '参加可否!A2:D');
    const mark = STATUS_MARK[status];
    const stamp = new Date().toISOString();
    let target = -1;
    for (let i = 0; i < rows.length; i++) {
      if (String(rows[i][0] || '').trim() === tournament && String(rows[i][1] || '').trim() === who) { target = i; break; }
    }

    if (target >= 0) {
      const range = `参加可否!A${target + 2}:D${target + 2}`;
      const r = await fetch(sheetUrl(range, '?valueInputOption=RAW'), {
        method: 'PUT',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ values: [[tournament, who, mark, stamp]] }),
      });
      if (!r.ok) throw new Error('シートに書けませんでした');
    } else {
      const r = await fetch(sheetUrl('参加可否!A2:D', ':append?valueInputOption=RAW&insertDataOption=INSERT_ROWS'), {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ values: [[tournament, who, mark, stamp]] }),
      });
      if (!r.ok) throw new Error('シートに書けませんでした');
    }

    // ★Botへ知らせる（2026-09-06）。
    //   これが無いと、シートは新しいのにDiscordの参加可否カードが古いままになり、
    //   2つの場所で違うことを言う状態になる。Botが #カレンダー同期 を見張っていて、
    //   この1行を拾ってその人の部屋のカードとピン留めを描き直す。
    //   失敗しても回答そのものは成立させる（相手にエラーを見せない）。
    if (env.DISCORD_SYNC_WEBHOOK) {
      try {
        await fetch(env.DISCORD_SYNC_WEBHOOK, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            content: 'CALSYNC ' + JSON.stringify({ who, tournament, mark }),
            flags: 4096,   // 通知音を鳴らさない
          }),
        });
      } catch (e) { /* 握りつぶす。カードは次の描き直しで揃う */ }
    }

    return json({ ok: true, who, status });
  } catch (e) {
    return json({ ok: false, error: e.message || '受け付けられませんでした' }, 500);
  }
}

// GET で叩かれた時は静かに断る（誤って開かれても何も起きないように）
export async function onRequestGet() {
  return json({ ok: false, error: 'この住所は回答の受け取り専用です' }, 405);
}
