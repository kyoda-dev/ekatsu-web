/* =========================================================
   GET /api/me?k=<専用リンクの文字列>   （2026-09-06 新設）

   専用リンクから開いた人が誰かを返すだけ。
   これがあるので、カレンダー側でお名前を選ばせなくてよくなった
   （依田の指摘「あなた（選んでください）これいる？この機能わかりずらい」）。

   返すのは活動名だけ。メールも部屋IDも返さない。
   ========================================================= */

const PART_SHEET_ID = '1GwQPo1rx6sHAQKdyoVAYlyYjTZYPmEJP7bsX0QBrTOU';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

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

export async function onRequestGet({ request, env }) {
  try {
    const key = String(new URL(request.url).searchParams.get('k') || '').trim();
    if (!key) return json({ ok: false, error: 'リンクが正しくありません' }, 400);
    if (!env.GOOGLE_REFRESH_TOKEN) return json({ ok: false, error: 'まだ準備中です' }, 503);

    const token = await accessToken(env);
    // 名簿 A=活動名 / B=区分 / C=部屋ID / D=予定メッセージID(bot管理・触らない) / E=専用リンクの文字列
    const r = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${PART_SHEET_ID}/values/${encodeURIComponent('名簿!A2:E')}`,
      { headers: { authorization: 'Bearer ' + token } },
    );
    if (!r.ok) throw new Error('名簿を読めませんでした');
    const rows = (await r.json()).values || [];
    for (const row of rows) {
      if (String(row[4] || '').trim() && String(row[4]).trim() === key) {
        return json({ ok: true, who: String(row[0] || '').trim(), tier: String(row[1] || '').trim() });
      }
    }
    return json({ ok: false, error: 'リンクが見つかりませんでした' }, 401);
  } catch (e) {
    return json({ ok: false, error: e.message || '読めませんでした' }, 500);
  }
}
