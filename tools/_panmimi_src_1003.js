// ぱんみみさんの素材（Drive）を手元に落とす。アイコンの切り抜きを直すための確認用（2026-10-03）
//   使い方: node _panmimi_src_1003.js <出力フォルダ>
const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.join(__dirname, "..", "..", "e-katsu", ".env") });
const { google } = require("googleapis");
const a = new google.auth.OAuth2(process.env.GOOGLE_CLIENT_ID, process.env.GOOGLE_CLIENT_SECRET);
a.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const drive = google.drive({ version: "v3", auth: a });
const PARENT = process.env.VTUBER_DELIVERY_PARENT_ID || "1OYvATSqyoo8E-sl2WvVS4Ev9pFgwoH7U";
const out = process.argv[2];
const ls = async (q, fields) => (await drive.files.list({ q, fields: `files(${fields})`, pageSize: 100, supportsAllDrives: true, includeItemsFromAllDrives: true })).data.files || [];
(async () => {
  const person = (await ls(`name = 'ぱんみみ' and '${PARENT}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`, "id,name"))[0];
  const assets = (await ls(`name = '02_2Dデータ素材' and '${person.id}' in parents and trashed = false`, "id,name"))[0];
  const files = await ls(`'${assets.id}' in parents and trashed = false`, "id,name,mimeType,createdTime,imageMediaMetadata(width,height)");
  for (const f of files) {
    console.log(f.name, f.createdTime, f.imageMediaMetadata ? f.imageMediaMetadata.width + "x" + f.imageMediaMetadata.height : "");
    if (!/^image\//.test(f.mimeType || "")) continue;
    const r = await drive.files.get({ fileId: f.id, alt: "media", supportsAllDrives: true }, { responseType: "arraybuffer" });
    fs.writeFileSync(path.join(out, "pm_" + f.name), Buffer.from(r.data));
  }
})().catch(e => { console.error("ERROR:", e.message); process.exit(1); });
