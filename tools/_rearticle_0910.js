// 9/10の紹介記事を作り直す（2026-09-10）。本番と同じ publishSupporterNews を使う。
//   直したいのは3つ：
//     ①芽吹さんのアイコン（切り直したのに見出し画像が古いまま）
//     ②芽吹さん・うさらいとさんのひとこと（自動生成のままで「デザイナー…」と切れていた）
//     ③うさらいとさんのXリンク（記事を作った時点ではX欄が空だった）
//   記事HTMLと見出し画像は上書き。supporter_news.json と news.html のカードは
//   すでに入っていれば触らない作りなので、二重にはならない。
const { publishSupporterNews } = require('./supporter-news');
const meta = require('./vtuber_meta.json');

const PEOPLE = [
  { name: 'バジル・セグリア', displayName: 'バジル・セグリア', slug: 'vt12', xHandle: '@baziru_ttv', bio: meta['バジル・セグリア'].bio },
  { name: '進翔芽吹', displayName: '進翔芽吹', slug: 'vt14', xHandle: '@sinsyoumebuki', bio: meta['進翔芽吹'].bio },
  { name: 'うさらいと', displayName: 'うさらいと', slug: 'vt15', xHandle: '@usa_lightow', bio: meta['うさらいと'].bio },
];
PEOPLE.forEach(p => console.log('  ' + p.displayName + ' ｜ ' + p.bio + ' ｜ ' + p.xHandle));

publishSupporterNews(PEOPLE, '2026-09-10')
  .then(r => console.log('できた: ' + (r ? r.url : '(null)')))
  .catch(e => { console.log('ERR ' + e.message); process.exit(1); });
