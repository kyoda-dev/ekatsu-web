#!/usr/bin/env node
/* =========================================================
   set-webhook-secret.js （2026-09-06）

   カレンダーからの回答をBotへ伝えるための Discord ウェブフックURLを、
   Cloudflare Pages のシークレット（DISCORD_SYNC_WEBHOOK）として入れる。

   ★既に入っている他のシークレットは消さない（PATCHで足すだけ。実測で確認済み）。
   ★URLは表示しない（長さだけ出す）。

   使い方: node set-webhook-secret.js "<ウェブフックURL>"        … 下見
           node set-webhook-secret.js "<ウェブフックURL>" --go   … 実際に入れる
   ========================================================= */
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'e-katsu', '.env') });

const ACCOUNT_ID = 'abf6ee4f9790d97d54763380cad9d446';
const PROJECT = 'ekatsu-web';
const GO = process.argv.includes('--go');
const url = (process.argv[2] || '').trim();

const token = String(process.env.CLOUDFLARE_API_TOKEN || '').trim();
const base = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/pages/projects/${PROJECT}`;
const headers = { authorization: 'Bearer ' + token, 'content-type': 'application/json' };

(async () => {
  if (!token) throw new Error('CLOUDFLARE_API_TOKEN が .env に無い');
  if (!/^https:\/\/discord\.com\/api\/webhooks\//.test(url)) {
    throw new Error('DiscordのウェブフックURLを渡してください（第1引数）');
  }
  console.log('入れるURLの長さ: ' + url.length + '文字');

  const cur = await fetch(base, { headers }).then(r => r.json());
  if (!cur.success) throw new Error('プロジェクトが読めない');
  const now = (cur.result.deployment_configs?.production?.env_vars) || {};
  console.log('今 production に入っているもの: ' + Object.keys(now).join(', '));

  if (!GO) { console.log('\n下見だけ。入れるなら --go'); return; }

  const one = { DISCORD_SYNC_WEBHOOK: { type: 'secret_text', value: url } };
  const res = await fetch(base, {
    method: 'PATCH', headers,
    body: JSON.stringify({ deployment_configs: { production: { env_vars: one }, preview: { env_vars: one } } }),
  }).then(r => r.json());
  if (!res.success) throw new Error('登録に失敗: ' + JSON.stringify(res.errors).slice(0, 300));

  const after = (res.result.deployment_configs?.production?.env_vars) || {};
  console.log('✅ 登録した → production: ' + Object.keys(after).join(', '));
})().catch(e => { console.error('エラー:', e.message); process.exit(1); });
