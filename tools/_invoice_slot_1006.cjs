// 2026-10-06 主催者の大会情報ページの「開催の記録」に、請求書（PDF）の枠を足す（依田「主催者とのやり取りをサイトに寄せ切りたい」）
//   名前は Bot が部屋で受けた時と同じ形（{年}{月}月{部屋名}_協賛金_e活（スポンサー）.pdf）＝Botの「届いているか」の見方にそのまま当たる
//   1つでも当たらなければ何も書かない
const fs = require('fs');
const out = [];
const ed = (P, rep) => { const raw = fs.readFileSync(P, 'utf8'); const crlf = raw.includes('\r\n'); let s = raw.replace(/\r\n/g, '\n');
  for (const [a] of rep) if (s.split(a).length !== 2) { console.log('NG ' + P + ' ' + a.slice(0, 60)); process.exit(1); }
  for (const [a, b] of rep) s = s.split(a).join(b);
  out.push([P, crlf ? s.replace(/\n/g, '\r\n') : s]); };
ed('functions/api/org-record.js', [
  ["  logo:  { label: 'ロゴ',       mime: /^image\\//, maxMb: 20,  exts: /^(png|jpe?g|webp|gif|heic|bmp)$/i },\n",
   "  logo:  { label: 'ロゴ',       mime: /^image\\//, maxMb: 20,  exts: /^(png|jpe?g|webp|gif|heic|bmp)$/i },\n  // ★2026-10-06：請求書もこのページから。名前は Bot が部屋で受けた時と同じ形＝Botの「届いているか」の見方（月フォルダに、名前に部屋名を含むPDFがあるか）にそのまま当たる\n  invoice: { label: '請求書',   mime: /^application\\/pdf$/, maxMb: 20, exts: /^pdf$/i, wrong: 'PDFのファイルをお選びください' },\n"],
  ["        return json({ ok: false, error: body.kind === 'video' ? '動画のファイルをお選びください' : '画像のファイルをお選びください' }, 400);",
   "        return json({ ok: false, error: kind.wrong || (body.kind === 'video' ? '動画のファイルをお選びください' : '画像のファイルをお選びください') }, 400);"],
  ["      const name = `${target.prefix}${safeRoom}_開催記録_${kind.label}${ext ? '.' + ext : ''}`;",
   "      const name = body.kind === 'invoice' ? `${target.prefix}${safeRoom}_協賛金_e活（スポンサー）.pdf` : `${target.prefix}${safeRoom}_開催記録_${kind.label}${ext ? '.' + ext : ''}`;"],
  ["          description: `開催記録（${kind.label}）／", "          description: `${body.kind === 'invoice' ? '請求書' : '開催記録（' + kind.label + '）'}／"],
]);
ed('org.html', [
  ["            '大会が終わりましたら、請求書と同じタイミングでご提出ください。協賛の記録として保管いたします。'));",
   "            '大会が終わりましたら、こちらからご提出ください。請求書もここで受け付けています。'));"],
  ["            ['video', '優勝が決まる場面の動画', '20秒ほど。動画ファイル（300MBまで）', 'video/*'],\n",
   "            ['invoice', '請求書', 'PDF（20MBまで）', 'application/pdf'],   // ★2026-10-06：請求書もこのページから（前はDiscordの部屋のボタン）\n            ['video', '優勝が決まる場面の動画', '20秒ほど。動画ファイル（300MBまで）', 'video/*'],\n"],
  ["          sec.appendChild(el('h2', null, '開催の記録'));", "          sec.appendChild(el('h2', null, '請求書・開催の記録'));"],
]);
for (const [P, s] of out) fs.writeFileSync(P, s);
console.log('直した ' + out.map(o => o[0]).join(' / '));
