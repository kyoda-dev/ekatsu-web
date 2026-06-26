#!/usr/bin/env node
/* マスタースケジュールの全行を読み出して一覧表示（公開/非公開問わず）。
   使い方: cd tools && node dump-master.js
   build-works.js と同じ認証・スプレッドシートを使う。 */
const path = require("path");
const ENV_PATH = process.env.ENV_PATH || path.join(__dirname, "..", "..", "e-katsu", ".env");
require("dotenv").config({ path: ENV_PATH });
const { google } = require("googleapis");

const MASTER_ID = process.env.MASTER_SCHEDULE_ID || "1J3A9VXi72s4mEsBUVr6tpO3X_lzalCS7L6wweGj11dU";

function getAuth() {
  const a = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
  a.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
  return a;
}
const firstUrl = (s) => (String(s || "").match(/https?:\/\/[^\s"'<>]+/) || [])[0] || "";

(async () => {
  const sheets = google.sheets({ version: "v4", auth: getAuth() });
  const meta = await sheets.spreadsheets.get({ spreadsheetId: MASTER_ID, fields: "sheets.properties.title" });
  const tab = meta.data.sheets[0].properties.title;
  console.log(`シート名: ${tab}`);
  const res = await sheets.spreadsheets.values.get({ spreadsheetId: MASTER_ID, range: `${tab}!A1:M` });
  const rows = res.data.values || [];
  const header = rows[0] || [];
  console.log("ヘッダー:", header.map((h, i) => `${String.fromCharCode(65 + i)}:${h}`).join(" | "));
  console.log("―".repeat(40));
  let pub = 0, total = 0;
  rows.slice(1).forEach((r) => {
    const name = (r[0] || "").trim();
    if (!name) return;
    total++;
    const flag = (r[3] || "").trim();
    if (flag === "○") pub++;
    const date = (r[4] || "").trim();
    const game = (r[6] || "").trim();
    const link = firstUrl(r[7]) || firstUrl(r[8]);
    const kv = (r[12] || "").trim() ? "KV有" : "KV無";
    console.log(`${flag === "○" ? "●公開" : "○非公開"} | ${date || "(日付なし)"} | ${name} | ${game || "-"} | ${kv} | ${link ? "link有" : "link無"}`);
  });
  console.log("―".repeat(40));
  console.log(`合計 ${total} 件 / 公開(○) ${pub} 件 / 非公開 ${total - pub} 件`);
})().catch((e) => { console.error("❌", e.message); process.exit(1); });
