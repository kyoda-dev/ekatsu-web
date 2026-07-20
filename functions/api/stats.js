// =========================================================
// 閲覧数レポートAPI（Cloudflare Pages Function）
//   GET /api/stats?c=<トークン>
//   - トークンが企業設定にあれば、その企業のページ分だけ返す
//   - トークンが ADMIN_TOKEN なら全ページ返す（依田用）
//   - 無効トークンは 404（存在を漏らさない）
// =========================================================
import { findCompanyByToken, isAdminToken } from "../_lib/companies.js";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

// 直近 N 日の JST 日付配列（古い→新しい）
function lastDays(n) {
  const out = [];
  const base = Date.now() + 9 * 60 * 60 * 1000; // JST
  for (let i = n - 1; i >= 0; i--) {
    out.push(new Date(base - i * 86400000).toISOString().slice(0, 10));
  }
  return out;
}

export async function onRequest({ request, env }) {
  if (request.method !== "GET") return json({ error: "method" }, 405);
  if (!env.DB) return json({ error: "no-db" }, 500);

  const token = new URL(request.url).searchParams.get("c") || "";
  const isAdmin = isAdminToken(env, token);
  const company = isAdmin ? null : findCompanyByToken(env, token);
  if (!isAdmin && !company) return json({ error: "not-found" }, 404);

  const DAYS = 14;
  const days = lastDays(DAYS);
  const since = days[0];

  // 対象パスと表示ラベル
  let entries; // [{path,label}]
  if (isAdmin) {
    const rows = (await env.DB.prepare(
      "SELECT path FROM page_views ORDER BY total DESC"
    ).all()).results || [];
    entries = rows.map((r) => ({ path: r.path, label: r.path }));
  } else {
    entries = company.entries;
  }

  const paths = entries.map((e) => e.path);
  if (!paths.length) {
    return json({ name: isAdmin ? "（管理）全ページ" : company.name, days, items: [] });
  }

  const ph = paths.map(() => "?").join(",");

  const totalsRows =
    (await env.DB.prepare(`SELECT path, total, updated_at FROM page_views WHERE path IN (${ph})`)
      .bind(...paths)
      .all()).results || [];
  const totals = Object.fromEntries(totalsRows.map((r) => [r.path, r]));

  const dailyRows =
    (await env.DB.prepare(
      `SELECT path, day, count FROM daily_views WHERE day >= ? AND path IN (${ph})`
    )
      .bind(since, ...paths)
      .all()).results || [];
  const dailyMap = {}; // path -> {day: count}
  for (const r of dailyRows) {
    (dailyMap[r.path] ||= {})[r.day] = r.count;
  }

  const items = entries.map((e) => {
    const t = totals[e.path];
    const perDay = days.map((d) => (dailyMap[e.path] && dailyMap[e.path][d]) || 0);
    const last = perDay.reduce((a, b) => a + b, 0);
    return {
      path: e.path,
      label: e.label,
      total: t ? t.total : 0,
      updated_at: t ? t.updated_at : null,
      recent: last, // 直近14日合計
      trend: perDay, // 直近14日の日別
    };
  });

  return json({
    name: isAdmin ? "（管理）全ページ" : company.name,
    days,
    items,
  });
}
