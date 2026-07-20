// =========================================================
// 閲覧数カウントAPI（Cloudflare Pages Function）
//   POST /api/hit  { "path": "/news/ekatsu-cup" }
//   - page_views（累計）と daily_views（日別）を +1
//   - 各ページの main.js から1セッション1回だけ叩かれる
// =========================================================

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// 受け付ける計測キーの形式: 先頭 "/" ＋ 英小文字/数字/ハイフン/スラッシュのみ、128字以内
const isValidPath = (p) =>
  typeof p === "string" && p.length > 0 && p.length <= 128 && /^\/[a-z0-9\-/]*$/.test(p);

// JSTの今日（YYYY-MM-DD）
function jstDay() {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export async function onRequest({ request, env }) {
  if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);
  if (!env.DB) return json({ ok: false, error: "no-db" }, 500);

  let path;
  try {
    ({ path } = await request.json());
  } catch {
    return json({ ok: false, error: "bad-json" }, 400);
  }
  if (!isValidPath(path)) return json({ ok: false, error: "bad-path" }, 400);

  const now = new Date().toISOString();
  const day = jstDay();

  try {
    await env.DB.batch([
      env.DB.prepare(
        `INSERT INTO page_views (path, total, updated_at) VALUES (?, 1, ?)
         ON CONFLICT(path) DO UPDATE SET total = total + 1, updated_at = ?`
      ).bind(path, now, now),
      env.DB.prepare(
        `INSERT INTO daily_views (path, day, count) VALUES (?, ?, 1)
         ON CONFLICT(path, day) DO UPDATE SET count = count + 1`
      ).bind(path, day),
    ]);
  } catch (e) {
    return json({ ok: false, error: "db" }, 500);
  }

  return json({ ok: true });
}
