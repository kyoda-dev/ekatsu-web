/* 2026-09-07：サイトの閲覧数の「今の状況」を出すだけ（読み取り専用）。
   合言葉は .env から読むが、画面には出さない（作業ログに残さないため）。 */
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "e-katsu", ".env") });

const TOKEN = (process.env.ADMIN_TOKEN || process.env.EKATSU_ADMIN_TOKEN || "").trim();
const BASE = "https://ekatsu-web.pages.dev";

(async () => {
  if (!TOKEN) {
    console.log("合言葉(ADMIN_TOKEN)が .env に無い → 依田さんの stats のリンクが必要");
    process.exit(0);
  }
  const r = await fetch(BASE + "/api/stats?c=" + encodeURIComponent(TOKEN));
  if (!r.ok) { console.log("取れなかった: " + r.status + "（合言葉が違うかも）"); process.exit(0); }
  const j = await r.json();
  const rows = j.entries || j.pages || j.data || j;
  console.log(JSON.stringify(rows, null, 1).slice(0, 4000));
})().catch(e => console.log("ERR " + e.message));
