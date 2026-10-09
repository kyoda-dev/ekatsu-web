// 主催者の大会情報ページ「請求書・開催の記録」に、請求書の書き方を足す（2026-10-09 依田「このシステムごともうサイトにする」）
//   今まではDiscordの依頼文にだけ書いていた。Botの依頼は1行＋ページのリンクにするので、中身はここで読めるようにする
const fs = require('fs');
const f = 'org.html'; let s = fs.readFileSync(f, 'utf8'); const crlf = /\r\n/.test(s); if (crlf) s = s.replace(/\r\n/g, '\n');
const a = "            '大会が終わりましたら、こちらからご提出ください。請求書もここで受け付けています。'));\n";
if (s.split(a).length !== 2) { console.log('NG 当たらない'); process.exit(1); }
const add = [
  "          // ★2026-10-09：請求書の書き方（前はDiscordの依頼文にだけ書いていた）",
  "          (function () {",
  "            var how = el('div', 'org__card');",
  "            how.appendChild(el('b', null, 'ご請求書に書いていただくこと'));",
  "            var ul = document.createElement('ul');",
  "            ul.style.margin = '8px 0 0'; ul.style.paddingLeft = '1.2em'; ul.style.fontSize = '13px'; ul.style.lineHeight = '1.9';",
  "            [",
  "              '宛先：A&L Project株式会社（〒103-0007 東京都中央区日本橋浜町2-33-6 O2 NIHONBASHI BLD 1F）',",
  "              '大会名／大会日程',",
  "              'ご請求金額：協賛プランの金額＋税',",
  "              'お振込先（口座名義はカタカナ）',",
  "              'お支払い：翌月末',",
  "            ].forEach(function (t) { var li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });",
  "            how.appendChild(ul);",
  "            how.appendChild(el('p', 'org__sub', 'PDFでお願いいたします。メールでのご送付は行き違いが起きるため、お受けしておりません。'));",
  "            sec.appendChild(how);",
  "          })();",
  "",
].join('\n');
s = s.replace(a, () => a + add);
fs.writeFileSync(f, crlf ? s.replace(/\n/g, '\r\n') : s); console.log('OK');
