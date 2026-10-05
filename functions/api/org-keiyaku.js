/* =========================================================
   GET /api/org-keiyaku?k=<主催者の専用リンクの文字列>   （2026-10-06 新設）

   主催者ページ（/org）に出す「契約書」の欄の中身を返す。
   契約書の締結は e活管理サイトの締結ページで行う（名称・住所・氏名を入れて締結 → PDFになる）。
   ここは、その主催者の契約書のリンクと状態（まだ／締結済み）を取り次ぐだけで、契約書そのものは持たない。

   k が名簿に無い・契約書がまだ無い時は list が空で返り、ページ側は欄ごと出さない。
   ========================================================= */
const SRC = 'https://ekatsu-kanri.k-yoda.workers.dev/api/org-keiyaku';

export async function onRequestGet({ request }) {
  const k = String(new URL(request.url).searchParams.get('k') || '').slice(0, 80);
  const head = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' };
  try {
    if (!k) return new Response(JSON.stringify({ ok: true, list: [] }), { headers: head });
    const r = await fetch(SRC + '?k=' + encodeURIComponent(k));
    const j = await r.json();
    const list = (j && Array.isArray(j.list) ? j.list : []).slice(0, 10).map(x => ({
      url: /^https:\/\/ekatsu-kanri\.k-yoda\.workers\.dev\/keiyaku\//.test(String(x.url)) ? String(x.url) : '',
      docs: (x.docs || []).slice(0, 4).map(d => ({ taikai: String(d.taikai || '').slice(0, 120), plan: String(d.plan || '').slice(0, 20) })),
      signed: !!x.signed, when: String(x.when || '').slice(0, 20),
    })).filter(x => x.url);
    return new Response(JSON.stringify({ ok: true, list }), { headers: head });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, list: [] }), { headers: head });
  }
}
