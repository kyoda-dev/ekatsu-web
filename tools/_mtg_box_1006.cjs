// 2026-10-06 主催者の大会情報ページに「お打ち合わせの日程」の欄を足す（依田「主催者とのやり取りをサイトに寄せ切りたい」）
//   候補は Bot が「主催者」タブ J列へ写したもの（正は Bot）。ここで選ぶと Bot へ合図（ORGSYNC kind:'mtgpick'）が行き、
//   先取りの確認・カレンダー・部屋への確定の1通は、部屋のボタンで押した時と同じ関数がやる。サイトはカレンダーに触らない
//   1つでも当たらなければ何も書かない
const fs = require('fs');
const out = [];
const ed = (P, rep) => { const raw = fs.readFileSync(P, 'utf8'); const crlf = raw.includes('\r\n'); let s = raw.replace(/\r\n/g, '\n');
  for (const [a] of rep) if (s.split(a).length !== 2) { console.log('NG ' + P + ' ' + a.slice(0, 60)); process.exit(1); }
  for (const [a, b] of rep) s = s.split(a).join(b);
  out.push([P, crlf ? s.replace(/\n/g, '\r\n') : s]); };
ed('functions/api/org-data.js', [
  ["    sheetValues(token, PART_SHEET_ID, '主催者!A2:I'),", "    sheetValues(token, PART_SHEET_ID, '主催者!A2:J'),"],
  ["    kvSkip: !!gate.kvSkip,\n",
   "    // J列：打ち合わせの候補日（Botが書く・2026-10-06）。出すのは 日・時刻・表示の字 と、決まった日だけ\n" +
   "    mtg: (() => { try { const j = JSON.parse(String(myRow[9] || '') || '{}'); return {\n" +
   "      pool: (Array.isArray(j.pool) ? j.pool : []).slice(0, 24).map(c => ({ iso: cut(c.iso, 10), time: cut(c.time, 5), label: cut(c.label, 30) })).filter(c => /^\\d{4}-\\d{2}-\\d{2}$/.test(c.iso) && /^\\d{1,2}:\\d{2}$/.test(c.time)),\n" +
   "      confirmed: cut(j.confirmed, 30), none: !!j.none }; } catch (e) { return { pool: [], confirmed: '', none: false }; } })(),\n" +
   "    kvSkip: !!gate.kvSkip,\n"],
]);
ed('functions/api/org-action.js', [
  ["    // ───────── 次回大会の申し込み（申請フォームの代わり）\n",
   "    // ───────── お打ち合わせの日を選ぶ（2026-10-06）。決めるのは Bot（部屋のボタンと同じ関数）。ここは合図を送るだけ\n" +
   "    if (action === 'mtgpick') {\n" +
   "      if (!gate.channelId) return json({ ok: false, error: 'お部屋が分かりませんでした。運営までお知らせください' }, 409);\n" +
   "      if (body.none === true) { await tellBot(env, { kind: 'mtgpick', channelId: gate.channelId, none: true }); await dropCache(request, key); return json({ ok: true, note: 'reflect-async' }); }\n" +
   "      const iso = String(body.iso || ''), time = String(body.time || '');\n" +
   "      if (!/^\\d{4}-\\d{2}-\\d{2}$/.test(iso) || !/^\\d{1,2}:\\d{2}$/.test(time)) return json({ ok: false, error: '選び方が正しくありません' }, 400);\n" +
   "      await tellBot(env, { kind: 'mtgpick', channelId: gate.channelId, iso, time });\n" +
   "      await dropCache(request, key);\n" +
   "      return json({ ok: true, note: 'reflect-async' });\n" +
   "    }\n\n" +
   "    // ───────── 次回大会の申し込み（申請フォームの代わり）\n"],
]);
ed('org.html', [
  ["      <div class=\"org__sec\" id=\"orgKeiSec\" hidden>\n",
   "      <div class=\"org__sec\" id=\"orgMtgSec\" hidden>\n        <h2>お打ち合わせの日程</h2>\n        <div id=\"orgMtg\"></div>\n      </div>\n\n      <div class=\"org__sec\" id=\"orgKeiSec\" hidden>\n"],
  ["      keiBox();       // ★2026-10-06：契約書（締結へ進む／控えを開く）\n",
   "      keiBox();       // ★2026-10-06：契約書（締結へ進む／控えを開く）\n      mtgBox();       // ★2026-10-06：お打ち合わせの日を選ぶ（前はDiscordの部屋のボタンだけ）\n"],
  ["    function keiBox() {\n",
   "    // ---- お打ち合わせの日程（2026-10-06）。候補は Bot が出したもの。選ぶと Bot が決めて、Discordのお部屋に確定の連絡を出す ----\n" +
   "    function mtgBox() {\n" +
   "      var sec = document.getElementById('orgMtgSec'), box = document.getElementById('orgMtg');\n" +
   "      var m = DATA.mtg || {}, pool = m.pool || [];\n" +
   "      if (!m.confirmed && !pool.length) { sec.hidden = true; return; }\n" +
   "      box.textContent = '';\n" +
   "      var c = el('div', 'org__kei' + (m.confirmed ? '' : ' is-open'));\n" +
   "      if (m.confirmed) {\n" +
   "        c.appendChild(el('b', null, m.confirmed + ' に決まりました'));\n" +
   "        c.appendChild(el('small', null, '当日は、Discordのサーバーの「MTG」ボイスチャンネルにお入りください。カメラはオフのままで大丈夫です。\\n進行の記録のため、打ち合わせの音声を録音させていただいております。'));\n" +
   "        box.appendChild(c); sec.hidden = false; return;\n" +
   "      }\n" +
   "      c.appendChild(el('b', null, 'ご都合のよい日時をお選びください'));\n" +
   "      c.appendChild(el('small', null, 'オンラインで30分ほどです。先にお選びいただいた方から順に埋まります。'));\n" +
   "      var wrap = el('div'); wrap.style.display = 'flex'; wrap.style.flexWrap = 'wrap'; wrap.style.gap = '8px';\n" +
   "      var said = el('p', 'org__said', '');\n" +
   "      var send = function (payload, askText) {\n" +
   "        if (!window.confirm(askText)) return;\n" +
   "        Array.prototype.forEach.call(wrap.querySelectorAll('button'), function (b) { b.disabled = true; });\n" +
   "        said.className = 'org__said'; said.textContent = '送っています…';\n" +
   "        fetch('/api/org-action', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(Object.assign({ k: secret, action: 'mtgpick' }, payload)) })\n" +
   "          .then(function (x) { return x.json().then(function (y) { if (!x.ok || !y.ok) throw new Error(y.error || '受け付けられませんでした'); return y; }); })\n" +
   "          .then(function () { wrap.hidden = true; said.className = 'org__said is-ok'; said.textContent = payload.none ? '承知しました。別の日程を改めてご連絡いたします。' : '受け付けました。確定のご連絡を、Discordのお部屋にお送りします。'; })\n" +
   "          .catch(function (e) { said.className = 'org__said is-err'; said.textContent = e.message; Array.prototype.forEach.call(wrap.querySelectorAll('button'), function (b) { b.disabled = false; }); });\n" +
   "      };\n" +
   "      pool.forEach(function (s) {\n" +
   "        var b = el('button', 'org__btn is-primary', s.label || (s.iso + ' ' + s.time));\n" +
   "        b.type = 'button';\n" +
   "        b.addEventListener('click', function () { send({ iso: s.iso, time: s.time }, (s.label || (s.iso + ' ' + s.time)) + ' でお願いしますか？'); });\n" +
   "        wrap.appendChild(b);\n" +
   "      });\n" +
   "      var none = el('button', 'org__btn org__btn--sub', 'どれも合いません');\n" +
   "      none.type = 'button';\n" +
   "      none.addEventListener('click', function () { send({ none: true }, 'どの日時も合わない、とお伝えします。よろしいですか？'); });\n" +
   "      wrap.appendChild(none);\n" +
   "      c.appendChild(wrap); c.appendChild(said);\n" +
   "      box.appendChild(c); sec.hidden = false;\n" +
   "    }\n\n" +
   "    function keiBox() {\n"],
]);
for (const [P, s] of out) fs.writeFileSync(P, s);
console.log('直した ' + out.map(o => o[0]).join(' / '));
