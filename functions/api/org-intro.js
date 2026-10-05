/* =========================================================
   GET /api/org-intro?game=<ゲーム名>   （2026-10-06 新設）

   主催者ページ（/org）に出す「配信・概要欄でのご紹介のお願い」の文を返す。
   文の正は e活管理サイト（依田が「渡す文」のページで直す）。ここは取り次ぐだけで、文を持たない
   ＝依田が管理サイトで直すと、主催者ページの文も変わる。

   ゲームが VALORANT の大会は、募集の飛び先が e活の公式X になった文が返る
   （Riot の回答で、VALORANT の大会から e活のサイトへは飛ばせないため。出し分けは管理サイト側）。

   返すのは文だけ。主催者ごとの中身は無いので、専用リンクの確かめはしない。
   取れなかった時は ok:false を返し、ページ側は欄ごと出さない。
   ========================================================= */
const SRC = 'https://ekatsu-kanri.k-yoda.workers.dev/api/bun-text';

export async function onRequestGet({ request }) {
  const game = String(new URL(request.url).searchParams.get('game') || '').slice(0, 80);
  const head = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'public, max-age=120' };
  try {
    const r = await fetch(SRC + '?game=' + encodeURIComponent(game), { cf: { cacheTtl: 120 } });
    const j = await r.json();
    if (!r.ok || !j.ok || !j.text) throw new Error('no text');
    return new Response(JSON.stringify({ ok: true, text: String(j.text).slice(0, 3000) }), { headers: head });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false }), { status: 200, headers: { ...head, 'cache-control': 'no-store' } });
  }
}
