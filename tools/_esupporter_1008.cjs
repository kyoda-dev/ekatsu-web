// 公開サイト：呼び方を「e活サポーター」1つにそろえる（2026-10-08。10/7 夜にサポーターへ「パートナーVTuberの枠をなくし、全員 e活サポーター」と知らせたため）
//   node tools/_esupporter_1008.cjs
//   ① vtuber.html：2段（パートナーVTuber／カジュアルサポーター）を1段に。目印は VT_ALL の1つ（並びは今までどおり＝前のパートナーの3人 → そのあと古い順）
//      上の「パートナーVTuberになると／特典を見る」の枠を外す。下の募集を「e活サポーター募集中」に
//   ② index.html：募集の見出しと文・顔ぶれの上の文
//   ③ tools/build-vtuber.js：目印を VT_ALL に（自動の作り直しが同じ形で作る）
//   ★過去のお知らせ（news/）は当時の呼び方のまま残す。partner.html（特典のページ）は消さないが、ここからの入口は外す
//   ★行が一字も同じ時だけ差し替える。当たらなければ止まる
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
let n = 0;
function patch(file, fn) {
  const F = path.join(ROOT, file);
  const raw = fs.readFileSync(F, 'utf8');
  const NL = raw.includes('\r\n') ? '\r\n' : '\n';
  const out = fn(raw.split(NL), NL);
  fs.writeFileSync(F, out.join(NL));
}
const must = (ok, what) => { if (!ok) { console.log('★当たらない: ' + what); process.exit(1); } n++; };
const idx = (L, s, from = 0) => L.findIndex((l, i) => i >= from && l.trim() === s);
const sub = (L, old, neu) => { const i = L.findIndex(l => l.includes(old)); must(i >= 0, old); L[i] = L[i].replace(old, neu); };

patch('vtuber.html', L => {
  // 上の「特典」の枠を外す
  const a = idx(L, '<!-- ===== パートナー特典ページへの導線（一覧トップ） ===== -->');
  const b = idx(L, '<h2 class="vt-group-title reveal">パートナーVTuber</h2>');
  must(a > 0 && b > a && b - a < 20, '特典の枠');
  L.splice(a, b - a);
  // 1段目の見出しと文
  sub(L, '<h2 class="vt-group-title reveal">パートナーVTuber</h2>', '<h2 class="vt-group-title reveal">e活サポーター</h2>');
  sub(L, 'e活と一緒に活動してくれている公式パートナーVTuberです。e活の協賛大会をミラー配信で応援します。', 'e活と一緒に活動してくれているサポーターです。e活の協賛大会をミラー配信で応援します。');
  // 2段を1段に：パートナーの終わり 〜 カジュアルの始まり（見出し・文・入れ物）を抜く
  const p0 = idx(L, '<!-- VT_PARTNER:START -->'), p1 = idx(L, '<!-- VT_PARTNER:END -->');
  const c0 = idx(L, '<!-- VT_CASUAL:START -->'), c1 = idx(L, '<!-- VT_CASUAL:END -->');
  must(p0 > 0 && p1 > p0 && c0 > p1 && c1 > c0 && c0 - p1 < 10, '目印');
  L[c1] = L[c1].replace('VT_CASUAL:END', 'VT_ALL:END');
  L.splice(p1, c0 - p1 + 1, '');            // 終わりの目印・</div>・見出し・文・<div>・始まりの目印 を抜き、カードの間に空行を1つ
  L[p0] = L[p0].replace('VT_PARTNER:START', 'VT_ALL:START');
  // 下の募集
  sub(L, '<!-- ===== パートナーVTuber募集 ===== -->', '<!-- ===== e活サポーター募集 ===== -->');
  sub(L, '<h2 class="vt-recruit__title">パートナーVTuber募集中</h2>', '<h2 class="vt-recruit__title">e活サポーター募集中</h2>');
  sub(L, 'e活では、一緒に活動してくれるパートナーVTuberを随時募集しています。<br>', 'e活では、一緒に活動してくれるe活サポーターを随時募集しています。<br>');
  sub(L, '>パートナー申請はこちら</a>', '>応募はこちら</a>');
  const k = L.findIndex(l => l.trim() === '<a class="btn" href="partner.html">特典・支援例を見る</a>');
  must(k > 0, '特典のボタン'); L.splice(k, 1);
  return L;
});

patch('index.html', L => {
  sub(L, '<span class="acc__teaser">パートナーVTuberを募集しています</span>', '<span class="acc__teaser">e活サポーターを募集しています</span>');
  sub(L, '普段から活動している個人VTuber様へ、e活パートナーVTuberを募集しています。', '普段から活動している個人VTuber様へ、e活サポーターを募集しています。');
  const i = L.findIndex(l => l.includes('他にも、歌ってみたのイラスト制作費の負担や、自主大会への実況解説アテンドなど、一人ひとりの「やりたいこと」に合わせた支援も行っています。活動の幅を狭めるような事項や契約内容はないのでお気軽にご相談ください。'));
  must(i > 0, '支援の文');
  L[i] = L[i].replace('他にも、歌ってみたのイラスト制作費の負担や、自主大会への実況解説アテンドなど、一人ひとりの「やりたいこと」に合わせた支援も行っています。', '');
  sub(L, '<a class="btn" href="partner.html">パートナー特典・支援の実例を見る</a>', '<a class="btn" href="vtuber.html">e活サポーターの一覧を見る</a>');
  sub(L, '<br>公式パートナーVTuberがいます。</p>', '<br>e活サポーターがいます。</p>');
  sub(L, 'パートナーVTuberが、e活の協賛大会をミラー配信で応援。<br>', 'e活サポーターが、e活の協賛大会をミラー配信で応援。<br>');
  return L;
});

patch('tools/build-vtuber.js', L => {
  const a = L.findIndex(l => l.includes('vt = replaceBlock(vt, "VT_PARTNER", partners.map((p, i) => cardHtml(p, i >= 3)).join("\\n\\n"), "vtuber.html");'));
  const b = L.findIndex(l => l.includes('vt = replaceBlock(vt, "VT_CASUAL", casuals.map((p, i) => cardHtml(p, i >= 1)).join("\\n\\n"), "vtuber.html");'));
  must(a > 0 && b === a + 1, 'build の2行');
  L.splice(a, 2,
    '  // ★2026-10-08：枠を1つにした（全員「e活サポーター」）。並びは今までどおり＝前のパートナーの3人 → そのあと古い順',
    '  vt = replaceBlock(vt, "VT_ALL", [...partners, ...casuals].map((p, i) => cardHtml(p, i >= 3)).join("\\n\\n"), "vtuber.html");');
  sub(L, 'console.log(`\\n載せる: パートナー ${partners.length} 名 / カジュアルサポーター ${casuals.length} 名`);', 'console.log(`\\n載せる: e活サポーター ${partners.length + casuals.length} 名（うち前のパートナー ${partners.length} 名）`);');
  return L;
});
console.log('直した ' + n + 'か所');
