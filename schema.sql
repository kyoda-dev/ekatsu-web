-- =========================================================
-- e活サイト 閲覧数カウンター用スキーマ（Cloudflare D1 / SQLite）
--   適用: npx wrangler d1 execute ekatsu-views --remote --file=./schema.sql
-- =========================================================

-- ページごとの累計閲覧数
CREATE TABLE IF NOT EXISTS page_views (
  path       TEXT PRIMARY KEY,   -- 例: /news/ekatsu-cup , / , /works
  total      INTEGER NOT NULL DEFAULT 0,
  updated_at TEXT
);

-- ページ×日ごとの閲覧数（推移グラフ用。日付はJST）
CREATE TABLE IF NOT EXISTS daily_views (
  path  TEXT NOT NULL,
  day   TEXT NOT NULL,           -- YYYY-MM-DD（JST）
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (path, day)
);

CREATE INDEX IF NOT EXISTS idx_daily_day ON daily_views (day);
