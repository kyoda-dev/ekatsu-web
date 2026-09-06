/* =========================================================
   GET /api/me?k=<専用リンクの文字列>   （2026-09-06 新設）

   専用リンクから開いた人が誰かを返すだけ。
   これがあるので、カレンダー側でお名前を選ばせなくてよくなった
   （依田の指摘「あなた（選んでください）これいる？この機能わかりずらい」）。

   返すのは活動名・ランク・素材が届いているか（ready）。メールも部屋IDも返さない。
   判定の中身は functions/_lib/gate.js（3つのAPIで共通）。
   ========================================================= */
import { checkAccess } from '../_lib/gate.js';

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
  });

export async function onRequestGet({ request, env }) {
  try {
    const key = String(new URL(request.url).searchParams.get('k') || '').trim();
    if (!key) return json({ ok: false, error: 'リンクが正しくありません' }, 400);
    if (!env.GOOGLE_REFRESH_TOKEN) return json({ ok: false, error: 'まだ準備中です' }, 503);
    const g = await checkAccess(env, request, key);
    if (g.reason === 'badkey') return json({ ok: false, error: 'リンクが見つかりませんでした' }, 401);
    return json({ ok: true, who: g.who, tier: g.tier, ready: !!g.ready });
  } catch (e) {
    return json({ ok: false, error: e.message || '読めませんでした' }, 500);
  }
}
