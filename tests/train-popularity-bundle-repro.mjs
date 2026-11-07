// Reproduce the Popularity skip on the vc18 bundled game.html (pre cycle lock).
// The file is not in this repo. Point TRAIN_POP_BUNDLE at www/game.html from the
// sanitized bundle, then: node tests/train-popularity-bundle-repro.mjs
// This expects the OLD bug. The fixed game is covered by tests/train-boarding-admin.mjs.
import fs from 'fs';
import assert from 'assert';
import { createRequire } from 'module';
import { createServer } from 'http';
import path from 'path';

const bundle = process.env.TRAIN_POP_BUNDLE;
if (!bundle) {
  console.log('bundle repro skipped (set TRAIN_POP_BUNDLE to the vc18 game.html)');
  process.exit(0);
}
const bytes = fs.readFileSync(bundle);
assert.strictEqual(bytes.length, 2384095, 'unexpected bundle size ' + bytes.length);
const { createHash } = await import('crypto');
assert.strictEqual(createHash('sha256').update(bytes).digest('hex'), 'fdcf614423806b74f9447ed34b7f6ff95bb74de1ce6581ea8f89915636217322');
const text = bytes.toString('utf8');
assert.ok(text.includes('if(STG.i===i)STG.cyc=-1'), 'this file does not have the pre-lock popularity reset');
assert.ok(!text.includes('STG.selN'), 'this file already has the later cycle lock');

const require = createRequire(import.meta.url);
const puppeteer = require(process.env.PUPPETEER_CORE || '/tmp/pup/node_modules/puppeteer-core');
const outDir = process.env.TRAIN_POP_OUT || '/tmp/pop-repro';
fs.mkdirSync(outDir, { recursive: true });
const root = path.dirname(path.resolve(bundle));
const server = createServer((req, res) => {
  const rel = decodeURIComponent((req.url || '/').split('?')[0]);
  if (rel.endsWith('idle-native.js')) { res.writeHead(200, { 'Content-Type': 'text/javascript' }); res.end('window.IdleNative={installGameHooks(){}}'); return; }
  const file = rel === '/' || rel.endsWith('game.html') ? path.resolve(bundle) : path.join(root, rel.replace(/^\/+/, ''));
  if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('no'); return; }
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
  fs.createReadStream(file).pipe(res);
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  const wkD = new Date(); wkD.setHours(0, 0, 0, 0); wkD.setDate(wkD.getDate() - wkD.getDay());
  await page.evaluateOnNewDocument(wk => {
    localStorage.setItem('ia_trains_v1', JSON.stringify({
      unlocked: 1, un: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0], bs: Array(10).fill(1), pop: Array(10).fill(1),
      rt: 1e9, pax: 1000, paxWk: 10, wk, last: Date.now(), boost: 0, pr: 0, sel: 0, ms: {}
    }));
    window.__iaNetMock = async () => ({ ok: false, reason: 'offline' });
  }, wkD.toISOString().slice(0, 10));
  await page.goto('http://127.0.0.1:' + server.address().port + '/game.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__trains && window.__game && window.__trainsStage);
  await new Promise(r => setTimeout(r, 900));
  const dismiss = () => page.evaluate(() => {
    document.querySelectorAll('button').forEach(b => {
      const label = (b.textContent || '').trim();
      if (/^Skip/i.test(label) || /^(Later|No thanks|Not now)$/i.test(label)) b.click();
    });
  });
  await dismiss();
  await page.evaluate(() => { window.__game.setView('train'); window.__trains.render(); });
  await page.waitForFunction(() => {
    const S = window.__trainsStage();
    return S.L && S.L.cars[0].plan && S.vt && S.vt[window.__trains.state().sel | 0] != null;
  });
  await new Promise(r => setTimeout(r, 700));
  await dismiss();
  await page.evaluate(() => { window.__game.setView('train'); window.__trains.render(); });
  await new Promise(r => setTimeout(r, 250));
  await page.evaluate(() => {
    const S = window.__trainsStage();
    const T = window.__trains.state();
    const i = T.sel | 0;
    const base = 60 / (0.6 + 0.08 * T.bs[i]);
    const cyc = Math.min(base, S.tb[i] / 0.84);
    const now = S.vt[i];
    S.vt[i] = now - (now % cyc) + cyc * 0.45;
  });
  const snap = () => page.evaluate(() => {
    const S = window.__trainsStage();
    const T = window.__trains.state();
    const i = T.sel | 0;
    const now = S.vt[i];
    const base = 60 / (0.6 + 0.08 * T.bs[i]);
    const cyc = Math.min(base, S.tb[i] / 0.84);
    const P = S.L.cars[0].plan;
    return { ph: (now % cyc) / cyc, cyc, N: P.N, pop: T.pop[i], rt: T.rt, pax: T.pax, hasRun: !!(S.run && S.run[i]) };
  });
  const before = await snap();
  assert.strictEqual(before.hasRun, false, 'bundle unexpectedly has the cycle lock');
  assert.ok(before.ph > 0.3 && before.ph < 0.6, 'not mid-cycle ' + before.ph);
  const hit = await page.evaluate(() => {
    const T = window.__trains.state();
    T.last = Date.now();
    const rt0 = T.rt, pax0 = T.pax;
    const b = document.querySelector('button[data-tru="pop"]');
    b.click();
    return { spent: rt0 - T.rt, dpax: T.pax - pax0, label: b.innerText };
  });
  await new Promise(r => setTimeout(r, 50));
  const after = await snap();
  assert.strictEqual(after.pop, before.pop + 1);
  assert.ok(Math.abs(hit.spent - 40) < 1, 'RT not charged once: ' + hit.spent);
  assert.ok(Math.abs(hit.dpax) < 1, 'passenger credit jumped ' + hit.dpax);
  assert.notStrictEqual(after.N, before.N, 'bundle did not apply the new headcount immediately');
  assert.ok(Math.abs(after.ph - before.ph) > 0.12, 'bundle phase did not jump ' + before.ph + ' -> ' + after.ph);
  assert.notStrictEqual(Math.round(after.cyc), Math.round(before.cyc));
  console.log('bundle skip reproduced', 'ph', before.ph.toFixed(3), '->', after.ph.toFixed(3), 'N', before.N, '->', after.N, 'cyc', before.cyc.toFixed(2), '->', after.cyc.toFixed(2), 'spent', hit.spent, 'dpax', hit.dpax);
} finally {
  await browser.close();
  server.close();
}
