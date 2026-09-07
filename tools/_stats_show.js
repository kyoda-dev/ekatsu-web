// 今の閲覧数を読みやすく出す（読み取り専用）。合言葉は .env から読み、画面には出さない。
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'e-katsu', '.env') });
const TOKEN = String(process.env.ADMIN_TOKEN || '').trim();
(async () => {
  const r = await fetch('https://ekatsu-web.pages.dev/api/stats?c=' + encodeURIComponent(TOKEN));
  if (!r.ok) { console.log('取れなかった: ' + r.status); return; }
  const j = await r.json();
  const days = j.days || [];
  console.log('直近の集計期間: ' + days[0] + ' 〜 ' + days[days.length - 1] + '（' + days.length + '日）\n');
  const items = (j.items || []).slice().sort((a, b) => b.total - a.total);
  const grp = (p) => p.startsWith('/out/') ? '送客（購入サイト等へ）'
    : p.startsWith('/qr') ? 'QRから来た人'
    : 'ページを見た人';
  const bucket = {};
  for (const it of items) (bucket[grp(it.path)] = bucket[grp(it.path)] || []).push(it);
  for (const g of ['ページを見た人', 'QRから来た人', '送客（購入サイト等へ）']) {
    console.log('■ ' + g);
    const list = bucket[g] || [];
    if (!list.length) { console.log('   （まだ0件）\n'); continue; }
    for (const it of list) {
      console.log('   ' + String(it.path).padEnd(28) + ' 累計 ' + String(it.total).padStart(5)
        + '　直近14日 ' + String(it.recent).padStart(4));
    }
    console.log('');
  }
})();
