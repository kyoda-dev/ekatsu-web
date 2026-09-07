/* org.html に「ミラー配信の許諾」「配信の扱い」を足す（2026-09-07 依田指示・ディスコード離れ）
   ・KVと請求書はDiscordのまま。それ以外はサイトへ。
   ・書くのはBot。ここは ORGSYNC を投げて、返事を待たずに画面だけ先に変える。
*/
const fs = require('fs');
const P = '../org.html';
let s = fs.readFileSync(P, 'utf8');

if (s.includes('function settingsBox')) { console.log('もう入っている'); process.exit(0); }

// ── ① 画面を作る関数を足す（postAction のすぐ上に置く）
const anchor = '    function postAction(payload, said, onOk) {';
if (!s.includes(anchor)) { console.log('NG: postAction が無い'); process.exit(1); }

const box = [
  '    // ★2026-09-07：ミラー配信の許諾と、配信の扱い。これまでDiscordのボタンだったもの。',
  '    function settingsBox() {',
  '      var host = document.getElementById("orgUpcomingSec").parentNode;',
  '      var old = document.getElementById("orgSettings");',
  '      if (old) old.remove();',
  '      var st = DATA.settings || {};',
  '      var sec = el("div", "org__sec");',
  '      sec.id = "orgSettings";',
  '      sec.appendChild(el("h2", null, "ミラー配信の設定"));',
  '      sec.appendChild(el("p", "org__lead", "どちらも後から変えられます。変えると、応援配信するみなさまへこちらからお伝えします。"));',
  '',
  '      // ── 誰に許すか',
  '      var f1 = el("div", "org__field");',
  '      var l1 = el("label", null, "ミラー配信を許可する方");',
  '      l1.appendChild(el("span", "org__hint", "パートナーVTuber＝e活と深くご一緒している方。カジュアルサポーター＝大会を応援してくださる方。"));',
  '      f1.appendChild(l1);',
  '      var row1 = el("div", "org__btns");',
  '      var said1 = el("div", "org__said");',
  '      [["both", "両方に許可"], ["partner", "パートナーのみ"], ["next", "カジュアルのみ"], ["none", "許可しない"]]',
  '        .forEach(function (o) {',
  '          var b = el("button", "org__btn" + (st.mirror === o[0] ? "" : " org__btn--sub"), o[1]);',
  '          b.type = "button";',
  '          b.addEventListener("click", function () {',
  '            if (st.mirror === o[0]) return;',
  '            postAction({ action: "mirror", perm: o[0] }, said1, function () {',
  '              st.mirror = o[0];',
  '              said1.className = "org__said is-ok";',
  '              said1.textContent = "「" + o[1] + "」で承りました。";',
  '              settingsBox();',
  '            });',
  '          });',
  '          row1.appendChild(b);',
  '        });',
  '      f1.appendChild(row1); f1.appendChild(said1); sec.appendChild(f1);',
  '',
  '      // ── 配信の扱い（2問）',
  '      function yesno(key, label, hint, now, yesText, noText) {',
  '        var f = el("div", "org__field");',
  '        var l = el("label", null, label);',
  '        if (hint) l.appendChild(el("span", "org__hint", hint));',
  '        f.appendChild(l);',
  '        var row = el("div", "org__btns");',
  '        var said = el("div", "org__said");',
  '        [[true, yesText], [false, noText]].forEach(function (o) {',
  '          var b = el("button", "org__btn" + (now === o[0] ? "" : " org__btn--sub"), o[1]);',
  '          b.type = "button";',
  '          b.addEventListener("click", function () {',
  '            if (now === o[0]) return;',
  '            var pay = { action: "bcast" };',
  '            pay[key] = o[0];',
  '            postAction(pay, said, function () {',
  '              DATA.settings[key] = o[0];',
  '              said.className = "org__said is-ok";',
  '              said.textContent = "「" + o[1] + "」で承りました。";',
  '              settingsBox();',
  '            });',
  '          });',
  '          row.appendChild(b);',
  '        });',
  '        f.appendChild(row); f.appendChild(said);',
  '        return f;',
  '      }',
  '      sec.appendChild(yesno("closeOnResult", "結果発表のとき、ミラー配信は閉じてほしいですか",',
  '        "優勝の発表などを、大会の配信で先に見せたい場合にお使いください。", st.closeOnResult,',
  '        "閉じてほしい", "そのままでOK"));',
  '      sec.appendChild(yesno("allowMultiMirror", "他のe活協賛大会と同じ枠で一緒に流すのは大丈夫ですか",',
  '        "1つの配信枠で、複数の大会を行き来しながら応援する形です。", st.allowMultiMirror,',
  '        "一緒でOK", "この大会だけにしてほしい"));',
  '',
  '      host.insertBefore(sec, document.getElementById("orgUpcomingSec").nextSibling);',
  '    }',
  '',
].join('\n');

s = s.replace(anchor, box + anchor);

// ── ② render() から呼ぶ
const call = "      renameBar();   // ★2026-09-07：大会名の変更もここからできるようにした";
if (!s.includes(call)) { console.log('NG: renameBar の呼び出しが無い'); process.exit(1); }
s = s.replace(call, call + "\n      settingsBox();  // ★2026-09-07：ミラー許諾と配信の扱いもサイトへ移した");

// ── ③ ボタンを横に並べる見た目
const css = '  .org__sec{margin-top:34px}';
s = s.replace(css, '  .org__btns{display:flex;flex-wrap:wrap;gap:8px;margin:6px 0 4px}\n' + css);

fs.writeFileSync(P, s);
console.log('org.html に「ミラー配信の設定」を足した');
