/* 「Xで公開する用の文言」を主催者ページで受け取れるようにする（2026-09-07 依田指示）
     依田「Xで公開する用の文言もここに追加。そうすれば確認がいらなくなる」
   ・マスターR列「X用の文」に入れる
   ・入っていれば、Botの告知はその文をそのまま使う（主催者が書いた＝確認が要らない）
*/
const fs = require('fs');

// ── ① org-data：R列を返す
let p = '../functions/api/org-data.js';
let s = fs.readFileSync(p, 'utf8');
if (!s.includes('xText:')) {
  s = s.replace('`${tab}!A2:Q`', '`${tab}!A2:R`');
  const a = "      publishAt: cut(r[16], 40),   // Q列：告知してよい日（2026-09-07）";
  if (!s.includes(a)) { console.log('NG: publishAt の行が無い'); process.exit(1); }
  s = s.replace(a, a + "\n      xText: cut(r[17], 600),      // R列：Xで出す文（主催者が書いたもの・2026-09-07）");
  fs.writeFileSync(p, s);
  console.log('org-data: R列を返すようにした');
} else { console.log('org-data: もう入っている'); }

// ── ② org-update：R列を書ける
p = '../functions/api/org-update.js';
s = fs.readFileSync(p, 'utf8');
if (!s.includes("'xText' in f")) {
  const a = "    if ('note' in f) write.L = clean(f.note, LONG_MAX);";
  if (!s.includes(a)) { console.log('NG: note の行が無い'); process.exit(1); }
  s = s.replace(a, a + "\n    if ('xText' in f) write.R = clean(f.xText, 600);   // Xで出す文（2026-09-07）");
  fs.writeFileSync(p, s);
  console.log('org-update: R列を書けるようにした');
} else { console.log('org-update: もう入っている'); }

// ── ③ org.html：入力欄を足す／次回大会は別ページへ
p = '../org.html';
s = fs.readFileSync(p, 'utf8');

if (!s.includes("id + 'xtext'")) {
  const a = "      var fPub = field(id + 'pub', '告知してよい日',";
  if (!s.includes(a)) { console.log('NG: 告知してよい日の欄が無い'); process.exit(1); }
  const add = [
    "      var fX = field(id + 'xtext', 'Xで出す文（任意）',",
    "        'e活の公式Xで紹介するときの文です。ご記入いただいた文は、そのまま出します。空のままなら、こちらで用意した文でお出しします。',",
    "        'text', t.xText);",
    "",
  ].join('\n');
  s = s.replace(a, add + a);
  s = s.replace("      [fTime, fUrl, fHl, fRule, fNote, fPub].forEach", "      [fTime, fUrl, fHl, fRule, fNote, fPub, fX].forEach");
  const b = "        if (fPub._input.value !== (t.publishAt || '')) fields.publishAt = fPub._input.value;";
  if (!s.includes(b)) { console.log('NG: publishAt の送信が無い'); process.exit(1); }
  s = s.replace(b, b + "\n        if (fX._input.value.trim() !== (t.xText || '')) fields.xText = fX._input.value.trim();");
  console.log('org.html: Xで出す文の欄を足した');
}

// 次回大会は別ページへ（この画面からはリンクだけ）
if (s.includes('function nextCupBox')) {
  const i1 = s.indexOf('    // ★2026-09-07：次回大会の申し込み。申請フォームを出し直す代わりに、');
  const i2 = s.indexOf('    function postAction(payload, said, onOk) {');
  if (i1 < 0 || i2 < 0 || i2 < i1) { console.log('NG: nextCupBox の範囲が取れない'); process.exit(1); }
  const link = [
    '    // ★2026-09-07 依田「次の大会を申し込むは別リンクにしよう」',
    '    //   同じ画面に置くと、大会情報の入力と間違えて押されるため別のページにした。',
    '    function nextCupBox() {',
    '      var host = document.getElementById("orgUpcomingSec").parentNode;',
    '      var old = document.getElementById("orgNextCup");',
    '      if (old) old.remove();',
    '      var sec = el("div", "org__sec");',
    '      sec.id = "orgNextCup";',
    '      sec.appendChild(el("h2", null, "次の大会を申し込む"));',
    '      sec.appendChild(el("p", "org__lead", "続けてe活の協賛をご希望の場合は、こちらからどうぞ。申請フォームのご記入は不要です。"));',
    '      var a = document.createElement("a");',
    '      a.className = "org__btn";',
    '      a.href = "/orgnext?k=" + encodeURIComponent(secret);',
    '      a.textContent = "次の大会の申し込みへ";',
    '      sec.appendChild(a);',
    '      host.appendChild(sec);',
    '    }',
    '',
  ].join('\n');
  s = s.slice(0, i1) + link + s.slice(i2);
  console.log('org.html: 次回大会を別ページへのリンクにした');
}

fs.writeFileSync(p, s);
console.log('done');
