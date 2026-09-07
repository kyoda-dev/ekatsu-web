/* org.html に「次の大会を申し込む」を足す（2026-09-07 依田指示）
   ・Discordの「🔁 次回大会をやる」と同じ受付を、サイトからもできるようにする
   ・依田「もらってる情報は入った状態で、その人専用」＝ゲーム名と告知URLは今の大会のものを初期値にする
*/
const fs = require('fs');
const P = '../org.html';
let s = fs.readFileSync(P, 'utf8');

if (s.includes('function nextCupBox')) { console.log('もう入っている'); process.exit(0); }

const anchor = '    function postAction(payload, said, onOk) {';
if (!s.includes(anchor)) { console.log('NG: postAction が無い'); process.exit(1); }

const box = [
  '    // ★2026-09-07：次回大会の申し込み。申請フォームを出し直す代わりに、',
  '    //   もうお預かりしている内容（ゲーム名・告知URL）を入れた状態で出す。',
  '    function nextCupBox() {',
  '      var host = document.getElementById("orgUpcomingSec").parentNode;',
  '      var old = document.getElementById("orgNextCup");',
  '      if (old) old.remove();',
  '      var base = (DATA.tournaments || []).slice().reverse()[0] || {};',
  '      var sec = el("div", "org__sec");',
  '      sec.id = "orgNextCup";',
  '      sec.appendChild(el("h2", null, "次の大会を申し込む"));',
  '      sec.appendChild(el("p", "org__lead", "続けてe活の協賛をご希望の場合は、こちらからどうぞ。申請フォームのご記入は不要です。お申し込みいただくと、新しい大会専用のお部屋をご用意します。"));',
  '',
  '      function f(label, hint, value, ph) {',
  '        var w = el("div", "org__field");',
  '        var l = el("label", null, label);',
  '        if (hint) l.appendChild(el("span", "org__hint", hint));',
  '        w.appendChild(l);',
  '        var i = document.createElement("input");',
  '        i.type = "text";',
  '        i.value = value || "";',
  '        if (ph) i.placeholder = ph;',
  '        w.appendChild(i);',
  '        w._input = i;',
  '        return w;',
  '      }',
  '      var fName = f("次回の大会名", "仮の名前でも大丈夫です。決まったら後から変更できます。", "", "例：" + String(DATA.room || "大会") + " vol.2");',
  '      var fGame = f("ゲーム名", "前回と同じならそのままで大丈夫です。", base.game || "");',
  '      var fUrl = f("大会の告知URL", "大会ページやXの投稿など。まだ無ければ空のままで大丈夫です。", base.xUrl || "");',
  '      [fName, fGame, fUrl].forEach(function (x) { sec.appendChild(x); });',
  '',
  '      var said = el("div", "org__said");',
  '      var go = el("button", "org__btn", "この内容で申し込む");',
  '      go.type = "button";',
  '      go.addEventListener("click", function () {',
  '        var name = fName._input.value.trim();',
  '        if (!name) {',
  '          said.className = "org__said is-err";',
  '          said.textContent = "次回の大会名をご入力ください。";',
  '          return;',
  '        }',
  '        go.disabled = true;',
  '        postAction({',
  '          action: "nextcup",',
  '          name: name,',
  '          game: fGame._input.value.trim(),',
  '          url: fUrl._input.value.trim(),',
  '        }, said, function () {',
  '          said.className = "org__said is-ok";',
  '          said.textContent = "「" + name + "」で承りました。専用のお部屋をご用意しますので、Discordをご確認ください。";',
  '        });',
  '      });',
  '      sec.appendChild(go);',
  '      sec.appendChild(said);',
  '      host.appendChild(sec);',
  '    }',
  '',
].join('\n');

s = s.replace(anchor, box + anchor);

const call = "      settingsBox();  // ★2026-09-07：ミラー許諾と配信の扱いもサイトへ移した";
if (!s.includes(call)) { console.log('NG: settingsBox の呼び出しが無い'); process.exit(1); }
s = s.replace(call, call + "\n      nextCupBox();   // ★2026-09-07：次回大会の申し込みもサイトから");

fs.writeFileSync(P, s);
console.log('org.html に「次の大会を申し込む」を足した');
