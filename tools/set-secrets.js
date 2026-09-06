#!/usr/bin/env node
/* =========================================================
   set-secrets.js  （2026-09-06）

   Cloudflare Pages（ekatsu-web）へ、カレンダーの参加ボタンに要る鍵を登録する。
   wrangler のログインが切れていて対話ができなかったので、APIで直接入れる。

   読むもの : e-katsu/.env の CLOUDFLARE_API_TOKEN と GOOGLE_* 3つ
   入れる先 : Pages プロジェクトの production / preview の env_vars（type: secret_text）

   使い方: cd tools && node set-secrets.js        … 下見（今の登録状況を出すだけ）
           cd tools && node set-secrets.js --go   … 実際に入れる
   ★値は一切表示しない（長さだけ出す）。
   ========================================================= */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'e-katsu', '.env') });

const ACCOUNT_ID = 'abf6ee4f9790d97d54763380cad9d446';
const PROJECT = 'ekatsu-web';
const KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_REFRESH_TOKEN'];
const GO = process.argv.includes('--go');

const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`;
const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };

(async () => {
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN が .env に無い');

  const missing = KEYS.filter(k => !String(process.env[k] || '').trim());
  if (missing.length) throw new Error('.env に無い値: ' + missing.join(', '));
  for (const k of KEYS) console.log(`  ${k} … ${String(process.env[k]).trim().length}文字`);

  // 今の登録状況
  const cur = await fetch(base, { headers }).then(r => r.json());
  if (!cur.success) throw new Error('プロジェクトが読めない: ' + JSON.stringify(cur.errors).slice(0, 200));
  const now = (cur.result.deployment_configs && cur.result.deployment_configs.production
    && cur.result.deployment_configs.production.env_vars) || {};
  console.log('\n今 production に入っているもの: ' + (Object.keys(now).join(', ') || '（なし）'));

  if (!GO) { console.log('\n下見だけ。入れるなら --go'); return; }

  const envVars = {};
  for (const k of KEYS) envVars[k] = { type: 'secret_text', value: String(process.env[k]).trim() };

  const body = {
    deployment_configs: {
      production: { env_vars: envVars },
      preview: { env_vars: envVars },
    },
  };
  const res = await fetch(base, { method: 'PATCH', headers, body: JSON.stringify(body) }).then(r => r.json());
  if (!res.success) throw new Error('登録に失敗: ' + JSON.stringify(res.errors).slice(0, 300));

  const after = (res.result.deployment_configs && res.result.deployment_configs.production
    && res.result.deployment_configs.production.env_vars) || {};
  console.log('✅ 登録した → production: ' + Object.keys(after).join(', '));
  console.log('※ 環境変数は次のデプロイから効く。このあと1本デプロイを流すこと。');
})().catch(e => { console.error('エラー:', e.message); process.exit(1); });
