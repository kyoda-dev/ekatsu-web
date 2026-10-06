// _goal_1007.cjs の続き（改行の形がファイルごとに違って止まった分）。1行ずつ当てて、改行はそのファイルの形に合わせる
const fs = require('fs');
const edit = (F, pairs) => { let s = fs.readFileSync(F, 'utf8'); const nl = s.includes('\r\n') ? '\r\n' : '\n'; for (const [a, b] of pairs) { if (s.split(a).length !== 2) throw new Error(F + ' 見つからないか2か所ある: ' + a.slice(0, 60)); s = s.replace(a, b.split('\n').join(nl)); } fs.writeFileSync(F, s); console.log('直した', F); };
edit('functions/api/calendar-data.js', [
  ["values(token, MASTER_ID, `${tab}!A2:P`)", "values(token, MASTER_ID, `${tab}!A2:V`)"],
  ["      highlight: oneLine(r[13], 300),", "      highlight: oneLine(r[13], 300),\n      goal: oneLine(r[21], 60),   // V列：大会の目標（2026-10-07）"],
]);
edit('org.html', [
  ["      dl.appendChild(row('開始時間', t.time, t.time ? null : '未登録'));",
   "      // ★2026-10-07：大会の目標。書いていない大会には行を出さない\n      if (t.goal) dl.appendChild(row('大会の目標', t.goal, null));\n      dl.appendChild(row('開始時間', t.time, t.time ? null : '未登録'));"],
  ["      var fTime = field(id + 'time', '開始時間',",
   "      // ★2026-10-07 依田指示：大会の目標をひとことで。サポーターの大会ページとアプリの一番上に大きく出す\n      var fGoal = field(id + 'goal', 'この大会の目標（ひとことで・任意）',\n        '例：「初心者が初めて大会に出られる場をつくる」。どんな大会かが一目で伝わるよう、大会ページの一番上に出します。60字まで。',\n        'text', t.goal);\n      var fTime = field(id + 'time', '開始時間',"],
  ["      [fTime, fUrl, fHl, fX, fRule, fDesc, fNote, fPub].forEach(function (f) { form.appendChild(f); });",
   "      [fGoal, fTime, fUrl, fHl, fX, fRule, fDesc, fNote, fPub].forEach(function (f) { form.appendChild(f); });"],
  ["        if (fDesc._input.value.trim() !== (t.descText || '')) fields.descText = fDesc._input.value.trim();",
   "        if (fDesc._input.value.trim() !== (t.descText || '')) fields.descText = fDesc._input.value.trim();\n        if (fGoal._input.value.trim() !== (t.goal || '')) fields.goal = fGoal._input.value.trim();"],
]);
edit('day.html', [
  ["          t.appendChild(el('h2', 'day__name', ev.name));",
   "          t.appendChild(el('h2', 'day__name', ev.name));\n          if (ev.goal) t.appendChild(el('p', 'day__goal', ev.goal));   // 大会の目標（主催者が書いたひとこと・2026-10-07）"],
  ["  .day__name{font-size:19px;font-weight:700;line-height:1.45;margin:0;text-wrap:balance}",
   "  .day__name{font-size:19px;font-weight:700;line-height:1.45;margin:0;text-wrap:balance}\n  .day__goal{margin:6px 0 0;padding:8px 10px;border-left:4px solid currentColor;font-size:15px;font-weight:700;line-height:1.5}"],
]);
