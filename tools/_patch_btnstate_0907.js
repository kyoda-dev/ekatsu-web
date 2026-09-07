/* 選んだボタンをはっきり色で示す（2026-09-07 依田指示）
   ・選ばれている方を緑の塗り＋チェック印にする（白と薄いグレーの差だと分からなかった）
   ・押した直後にも色が変わるよう、DATA.settings を必ず用意してから書き換える
     （settings が無い時、書き換えが画面に反映されない作りになっていた）
*/
const fs = require('fs');
const P = '../org.html';
let s = fs.readFileSync(P, 'utf8');

// ① 見た目：選ばれている方の色
if (!s.includes('.org__btn.is-on')) {
  const a = '  .org__btn--sub{color:var(--o-muted)}';
  if (!s.includes(a)) { console.log('NG: org__btn--sub が無い'); process.exit(1); }
  const css = [
    '  /* 2026-09-07：いま選ばれている方をはっきり見せる（依田指示） */',
    '  .org__btn.is-on{background:var(--o-go);border-color:var(--o-go);color:#fff;font-weight:700}',
    '  .org__btn.is-on:hover:not(:disabled){background:#26583f;border-color:#26583f}',
    '  .org__btn.is-on::before{content:"✓ ";font-weight:700}',
    a,
  ].join('\n');
  s = s.replace(a, css);
  console.log('色の指定を足した');
}

// ② ミラー許諾のボタン
const m1 = '          var b = el("button", "org__btn" + (st.mirror === o[0] ? "" : " org__btn--sub"), o[1]);';
if (s.includes(m1)) {
  s = s.replace(m1, '          var b = el("button", "org__btn" + (st.mirror === o[0] ? " is-on" : " org__btn--sub"), o[1]);');
  console.log('ミラー許諾のボタンを直した');
}

// ③ はい／いいえのボタン
const m2 = '          var b = el("button", "org__btn" + (now === o[0] ? "" : " org__btn--sub"), o[1]);';
if (s.includes(m2)) {
  s = s.replace(m2, '          var b = el("button", "org__btn" + (now === o[0] ? " is-on" : " org__btn--sub"), o[1]);');
  console.log('はい／いいえのボタンを直した');
}

// ④ 押した直後に色が変わらない穴をふさぐ
const m3 = '      var st = DATA.settings || {};';
if (s.includes(m3)) {
  s = s.replace(m3, [
    '      // ★settings が無いと、押しても書き換え先が消えて色が変わらなかった（2026-09-07）',
    '      if (!DATA.settings) DATA.settings = {};',
    '      var st = DATA.settings;',
  ].join('\n'));
  console.log('押した後に色が変わらない穴をふさいだ');
}

fs.writeFileSync(P, s);
console.log('done');
