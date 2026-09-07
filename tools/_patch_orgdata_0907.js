/* org-data に「いまの設定」を足す（2026-09-07 依田指示・ディスコード離れ）
     settings.mirror           … ミラー配信の許諾（マスターB/C列から。both/partner/next/none）
     settings.closeOnResult    … 結果発表でミラーを閉じるか（主催者タブG列・Botが書いた写し）
     settings.allowMultiMirror … 他の大会と同じ枠で流してよいか（主催者タブH列）
   ★正はBot側。ここは画面に出すために読むだけ。
*/
const fs = require('fs');
const P = '../functions/api/org-data.js';
let s = fs.readFileSync(P, 'utf8');

if (s.includes('settings: {')) { console.log('もう入っている'); process.exit(0); }

const a = `  const [mRows, pRows, kvNames] = await Promise.all([
    sheetValues(token, MASTER_ID, \`\${tab}!A2:Q\`),
    sheetValues(token, PART_SHEET_ID, '参加可否!A2:D'),
    listTournamentKVs(env, request, token),
  ]);`;
const b = `  const [mRows, pRows, kvNames, oRows] = await Promise.all([
    sheetValues(token, MASTER_ID, \`\${tab}!A2:Q\`),
    sheetValues(token, PART_SHEET_ID, '参加可否!A2:D'),
    listTournamentKVs(env, request, token),
    sheetValues(token, PART_SHEET_ID, '主催者!A2:H'),
  ]);`;
if (!s.includes(a)) { console.log('NG: 読み込みのアンカーが無い'); process.exit(1); }
s = s.replace(a, b);

const c = `  return {
    generatedAt: new Date().toISOString(),
    room: gate.room,`;
const d = `  // ── いまの設定（ミラー許諾／配信の扱い）────────────────────
  //   許諾はマスターB/C列。これからの大会の1件目を代表にする（部屋ごとに同じ値で運用している）。
  const head = tournaments.find(t => !t.past) || tournaments[tournaments.length - 1] || null;
  const permOf = (p, n) => (p && n ? 'both' : p ? 'partner' : n ? 'next' : 'none');
  const flagOf = (v) => (String(v || '').trim() === 'はい' ? true : String(v || '').trim() === 'いいえ' ? false : null);
  const myRow = (oRows || []).find(r => String((r || [])[1] || '').trim() === String(gate.channelId || '')) || [];

  return {
    generatedAt: new Date().toISOString(),
    room: gate.room,
    settings: {
      mirror: head ? permOf(head.mirrorPartner, head.mirrorNext) : '',
      closeOnResult: flagOf(myRow[6]),
      allowMultiMirror: flagOf(myRow[7]),
    },`;
if (!s.includes(c)) { console.log('NG: returnのアンカーが無い'); process.exit(1); }
s = s.replace(c, d);
fs.writeFileSync(P, s);
console.log('org-data に settings を足した');
