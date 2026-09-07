// 直近のデプロイの状態を見るだけ
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', 'e-katsu', '.env') });
const base = 'https://api.cloudflare.com/client/v4/accounts/abf6ee4f9790d97d54763380cad9d446/pages/projects/ekatsu-web/deployments?per_page=3';
(async () => {
  const r = await fetch(base, { headers: { authorization: 'Bearer ' + process.env.CLOUDFLARE_API_TOKEN } }).then(x => x.json());
  for (const d of (r.result || [])) {
    console.log((d.latest_stage && d.latest_stage.name) + ':' + (d.latest_stage && d.latest_stage.status)
      + '  ' + (d.deployment_trigger?.metadata?.commit_message || '').split('\n')[0].slice(0, 40)
      + '  ' + d.created_on);
  }
})();
