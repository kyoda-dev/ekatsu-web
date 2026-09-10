// 9/10の紹介記事の見出し画像を作り直す（2026-09-10）。
//   芽吹さんのアイコンを切り直したのに、記事の見出し画像は先に作られていたので古いままだった。
//   記事本文は正しいので触らない。画像だけ本番と同じ buildBanner で作り直す。
//   ついでに supporter_news.json の うさらいと の X（後から埋めた分）を反映する。
const fs = require('fs');
const path = require('path');
const { buildBanner } = require('./supporter-news');

const OUT = path.join(__dirname, '..', 'assets', 'img', 'news', 'supporter-2026-09-10.webp');
const IDX = path.join(__dirname, 'supporter_news.json');
const PEOPLE = [
  { name: 'バジル・セグリア', displayName: 'バジル・セグリア', slug: 'vt12' },
  { name: '進翔芽吹', displayName: '進翔芽吹', slug: 'vt14' },
  { name: 'うさらいと', displayName: 'うさらいと', slug: 'vt15' },
];

(async () => {
  await buildBanner(PEOPLE, '2026.09', OUT);
  console.log('見出し画像を作り直した: ' + OUT + ' (' + fs.statSync(OUT).size + 'B)');

  const idx = JSON.parse(fs.readFileSync(IDX, 'utf8'));
  const art = (idx.articles || []).find(a => a.slug === 'supporter-2026-09-10');
  if (art) {
    const u = art.people.find(p => p.name === 'うさらいと');
    if (u && !u.x) { u.x = '@usa_lightow'; fs.writeFileSync(IDX, JSON.stringify(idx, null, 2) + '\n'); console.log('うさらいとのXを入れた: @usa_lightow'); }
    else console.log('うさらいとのX: ' + (u ? u.x : '行なし') + '（触っていない）');
  }
})().catch(e => { console.log('ERR ' + e.message); process.exit(1); });
