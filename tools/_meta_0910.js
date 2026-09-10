// 進翔芽吹・うさらいと の meta を足す（2026-09-10）。
//   芽吹＝既定の切り方（全身立ち絵→H*0.24）だと顔が枠いっぱいになるので、バストアップに寄せる。
//   元画像 1205x2021 に対して side=860 / top=0 / left=176 を割合に直したもの。
const fs = require('fs');
const P = __dirname + '/vtuber_meta.json';
const m = JSON.parse(fs.readFileSync(P, 'utf8'));

m['進翔芽吹'] = {
  _crop理由: '2026-09-10 既定の切り方だと顔が丸いっぱいになり、帽子とあごが縁で切れていた。他の人と同じバストアップに合わせた',
  crop: { side: 0.4256, top: 0, left: 0.1461 },
  slug: 'vt14',
  bio: 'デザイナー兼VTuber。リスナーと物語を紡ぐ、距離感の近い配信。APEX / モンスト / プロスピ。',
};
m['うさらいと'] = {
  slug: 'vt15',
  bio: '雑談しながらのFPS配信が得意。大会の主催・運営・実況もこなす。オーバーウォッチ。',
};

fs.writeFileSync(P, JSON.stringify(m, null, 2) + '\n');
console.log('meta を更新した');
