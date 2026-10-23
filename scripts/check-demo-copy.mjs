#!/usr/bin/env node
// Checks the sample-data copy of the Ops Hub after it is deployed (the one App Review opens):
//   node scripts/check-demo-copy.mjs https://demo-ops.thebtxfoundation.org
// It must show the banner, carry no database address or key anywhere in its JavaScript, refuse the push and cron endpoints,
// and say noindex. Exit 1 on any failure. Reads pages only (plus two refused probes); sends nothing real.
const base = (process.argv[2] ?? '').replace(/\/+$/, '');
if (!/^(https:\/\/[^/]+|http:\/\/localhost:\d+)$/.test(base)) {
  console.error('Usage: node scripts/check-demo-copy.mjs https://demo-ops.thebtxfoundation.org');
  process.exit(2);
}
const BANNER = 'Sample data for App Review. No real information.';
const FORBIDDEN = ['supabase.co', 'awiaebtqalcmfafvktwh', 'sb_publishable_9K1'];
let failed = 0;
const check = (ok, what) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${what}`);
  if (!ok) failed += 1;
};

const home = await fetch(`${base}/`, { redirect: 'manual' });
const html = await home.text();
check(home.status === 200, `home answers 200 (got ${home.status}; a redirect to /sign-in means the demo is NOT in sample-data mode)`);
check(html.includes(BANNER), 'home shows the sample-data banner');
check(/noindex/i.test(home.headers.get('x-robots-tag') ?? ''), 'home says noindex in its headers');

const scripts = [...new Set([...html.matchAll(/\/_next\/static\/[^"')\s]+\.js/g)].map((m) => m[0]))];
let bad = 0;
for (const s of scripts) {
  const body = await (await fetch(`${base}${s}`)).text();
  for (const f of FORBIDDEN) {
    if (body.includes(f)) {
      bad += 1;
      console.log(`      found "${f}" in ${s}`);
    }
  }
}
check(scripts.length > 0, `found the page's scripts (${scripts.length})`);
check(bad === 0, 'no database address or key in any of them');

const signIn = await (await fetch(`${base}/sign-in`)).text();
check(signIn.includes(BANNER), 'the sign-in page shows the banner too');

const push = await fetch(`${base}/api/push/register`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'ab'.repeat(32) }) });
check(push.status === 401, `push register refuses (got ${push.status})`);
const cron = await fetch(`${base}/api/cron/interview-emails?kind=prep`);
check(cron.status === 401, `the cron refuses without its secret (got ${cron.status})`);

console.log(failed ? `\n${failed} check(s) FAILED` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
