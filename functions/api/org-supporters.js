/* =========================================================
   GET /api/org-supporters?k=<主催者の専用リンクの文字列>   （2026-10-06 新設）

   主催者ページ（/org）の「e活のサポーター」の欄に出す、「これまでにミラー配信した大会の数」を返す。
   数の正は e活管理サイト（見回りの記録）。ここは取り次ぐだけ。返すのは名前と大会の数だけ。
   プロフィール（画像・名前・ひとこと・リンク）は、ページ側が公開済みのサポーター紹介（/vtuber）をそのまま読む。
   ========================================================= */
const SRC = 'https://ekatsu-kanri.k-yoda.workers.dev/api/org-supporters';

export async function onRequestGet({ request }) {
  const k = String(new URL(request.url).searchParams.get('k') || '').slice(0, 80);
  const head = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  try {
    if (!k) return new Response(JSON.stringify({ ok: true, list: [] }), { headers: head });
    const j = await (await fetch(SRC + '?k=' + encodeURIComponent(k))).json();
    const list = (j && Array.isArray(j.list) ? j.list : []).slice(0, 200).map(x => ({ name: String(x.name || '').slice(0, 60), count: Math.max(0, Math.min(999, Number(x.count) || 0)) })).filter(x => x.name);
    return new Response(JSON.stringify({ ok: true, list }), { headers: head });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, list: [] }), { headers: head });
  }
}
