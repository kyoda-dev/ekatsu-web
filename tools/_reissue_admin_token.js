#!/usr/bin/env node
/* =========================================================
   _reissue_admin_token.js （2026-09-07）

   閲覧数レポート（stats.html）の依田用の合言葉 ADMIN_TOKEN を作り直す。

   なぜ作り直すか
     Cloudflare のシークレットは一度入れると中身を二度と表示しない。
     名前が登録されているのは確認できるが、値は取り出せない＝探しても出てこない。
     依田の手元にもリンクが残っていなかったので、新しく発行して .env に控える。

   やること
     ① 新しい合言葉を作る（64文字）
     ② Cloudflare Pages の production / preview へ入れる（他の変数は消さない＝PATCHは足し算）
     ③ e-katsu/.env の ADMIN_TOKEN を書き換える（無ければ足す）
     ★値は画面に出さない。長さだけ出す。

   使い方: node _reissue_admin_token.js        … 下見
           node _reissue_admin_token.js --go   … 実行
   ========================================================= */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ENV_PATH = path.join(__dirname, '..', '..', 'e-katsu', '.env');
require('dotenv').config({ path: ENV_PATH });

const ACCOUNT_ID = 'abf6ee4f9790d97d54763380cad9d446';
const PROJECT = 'ekatsu-web';
const GO = process.argv.includes('--go');

const cfToken = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`;
const headers = { authorization: 'Bearer ' + cfToken, 'content-type': 'application/json' };

(async () => {
  if (!cfToken) throw new Error('CLOUDFLARE_API_TOKEN が .env に無い');

  const cur = await fetch(base, { headers }).then(r => r.json());
  if (!cur.success) throw new Error('プロジェクトが読めない: ' + JSON.stringify(cur.errors).slice(0, 200));
  const before = Object.keys((cur.result.deployment_configs?.production?.env_vars) || {});
  console.log('今 production に入っているもの: ' + (before.join(', ') || '（なし）'));

  const fresh = crypto.randomBytes(32).toString('hex');   // 64文字
  console.log('新しい合言葉を作った（' + fresh.length + '文字）');

  if (!GO) { console.log('\n下見だけ。入れるなら --go'); return; }

  // ② Cloudflare へ（ADMIN_TOKEN だけ送る＝他の変数はそのまま残る）
  const body = {
    deployment_configs: {
      production: { env_vars: { ADMIN_TOKEN: { type: 'secret_text', value: fresh } } },
      preview: { env_vars: { ADMIN_TOKEN: { type: 'secret_text', value: fresh } } },
    },
  };
  const res = await fetch(base, { method: 'PATCH', headers, body: JSON.stringify(body) }).then(r => r.json());
  if (!res.success) throw new Error('登録に失敗: ' + JSON.stringify(res.errors).slice(0, 300));
  const after = Object.keys((res.result.deployment_configs?.production?.env_vars) || {});
  console.log('✅ Cloudflareへ登録 → production: ' + after.join(', '));
  const lost = before.filter(k => !after.includes(k));
  if (lost.length) console.log('⚠️ 消えた変数がある: ' + lost.join(', ') + '（要復旧）');

  // ③ .env へ控える
  let env = fs.readFileSync(ENV_PATH, 'utf8');
  const line = 'ADMIN_TOKEN=' + fresh;
  if (/^ADMIN_TOKEN=.*$/m.test(env)) env = env.replace(/^ADMIN_TOKEN=.*$/m, line);
  else env = env.replace(/\s*$/, '\n') + '\n# stats.html の依田用の合言葉（2026-09-07 発行し直し）\n' + line + '\n';
  fs.writeFileSync(ENV_PATH, env);
  console.log('✅ e-katsu/.env に控えた');
  console.log('※ 環境変数は次のデプロイから効く。このあとサイトを1本デプロイすること。');
})().catch(e => { console.error('エラー:', e.message); process.exit(1); });
