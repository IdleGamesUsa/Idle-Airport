// Admin Train/Rail still renders on the popularity-boarding release.
// Browser: TRAIN_ADMIN_BROWSER=1 node tests/train-admin-panel.mjs
import fs from 'fs';
import assert from 'assert';
import { createRequire } from 'module';

const FILE_ID = '202611121300';
const rootUrl = new URL('../game-v37-trains.html', import.meta.url);
const betaUrl = new URL('../beta/game-v37-trains.html', import.meta.url);
const rootTxt = fs.readFileSync(rootUrl, 'utf8');
const betaTxt = fs.readFileSync(betaUrl, 'utf8');
assert.strictEqual(rootTxt, betaTxt, 'root and beta game HTML diverged');
assert.strictEqual(rootTxt.split('Loaded file ' + FILE_ID).length - 1, 1, 'loaded-file label');
assert.ok(rootTxt.includes('TRAIN / RAIL'), 'train section missing');
assert.ok(rootTxt.includes("catch(e){bits+=card('TRAIN','Locked')}"), 'rail cards can still abort Admin');
assert.ok(!rootTxt.includes('STG.selN'), 'platform re-entry still mints a new boarding clock');
for (const boarding of ['function stFresh', 'STG.hold', 'RN.pop', 'tPlan(c,i,RN.pop)']) {
  assert.ok(rootTxt.includes(boarding), 'boarding latch missing: ' + boarding);
}
assert.ok(rootTxt.includes('function prMul(){var p=Math.floor(+T.pr||0);if(p<0)p=0;else if(p>PRMAX)p=PRMAX;return Math.pow(2,p)}'), 'prestige multiplier changed');
assert.ok(rootTxt.includes('function rkTrainRival'), 'ranks filter missing');
assert.ok(rootTxt.includes('const GAME_BUILD=202611020954'), 'settings game-build constant was retargeted');
console.log('source checks ok', FILE_ID);

if (process.env.TRAIN_ADMIN_BROWSER === '1') await (async () => {
  const require = createRequire(import.meta.url);
  const puppeteer = require(process.env.PUPPETEER_CORE || '/tmp/pup/node_modules/puppeteer-core');
  const { createServer } = await import('http');
  const path = await import('path');
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const outDir = process.env.TRAIN_ADMIN_OUT || '/tmp/train-admin-evidence';
  fs.mkdirSync(outDir, { recursive: true });
  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.join(rootDir, rel === '/' ? 'game-v37-trains.html' : rel.replace(/^\/+/, ''));
    if (!file.startsWith(rootDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const browser = await puppeteer.launch({
    executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome',
    headless: 'new',
    args: ['--no-sandbox', '--disable-gpu']
  });
  const d = new Date(), wk = new Date(d); wk.setHours(0, 0, 0, 0); wk.setDate(wk.getDate() - wk.getDay());
  const train = {
    unlocked: 1, un: [1, 1, 1, 1, 1, 0, 0, 0, 0, 0],
    bs: Array(10).fill(1), pop: [6, 1, 1, 1, 1, 1, 1, 1, 1, 1],
    rt: 5.27e16, pax: 3.77e7, paxWk: 789, wk: wk.toISOString().slice(0, 10),
    last: Date.now(), boost: Date.now() + 90e3, pr: 2, sel: 0, ms: {}
  };
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(train => {
    localStorage.setItem('ia_trains_v1', JSON.stringify(train));
    window.__iaNetMock = async () => ({ ok: false, reason: 'offline' });
  }, train);
  await page.goto('http://127.0.0.1:' + port + '/game-v37-trains.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
  await page.waitForFunction(() => window.__game && window.__trains && window.__b3Bridge);
  await new Promise(r => setTimeout(r, 900));
  await page.evaluate(() => {
    document.querySelectorAll('button').forEach(b => { if (/Skip|Later|No thanks|Not now|Close/i.test(b.textContent || '')) b.click(); });
    document.querySelectorAll('[data-k="popClose"]').forEach(b => b.click());
  });
  const admin = await page.evaluate(() => {
    const S = window.__game.S;
    S.cash = 1.39e23;
    S.cgP = Object.assign(S.cgP || {}, { unlocked: 1, cc: 5.27e16, tons: 3.77e7, last: Date.now(), un: [1, 1, 1, 1, 1, 0, 0, 0, 0, 0], h: Array(10).fill(4), d: Array(10).fill(4), wildEnd: 0 });
    window.__b3Bridge.openAdmin();
    const file = document.getElementById('admFile');
    const body = document.getElementById('admBody');
    const lb = document.getElementById('admLb');
    const secs = [...body.querySelectorAll('.admSec')].map(e => e.textContent.trim());
    const cards = [...body.querySelectorAll('.admCard')].map(e => e.innerText.replace(/\s+/g, ' ').trim());
    const trainEl = [...body.querySelectorAll('.admSec')].find(e => /TRAIN/.test(e.textContent));
    const cargoEl = [...body.querySelectorAll('.admSec')].find(e => e.textContent.trim() === 'CARGO');
    const fr = file.getBoundingClientRect();
    const tr = trainEl.getBoundingClientRect();
    const cg = cargoEl.getBoundingClientRect();
    const lr = lb.getBoundingClientRect();
    return {
      file: file.textContent.trim(),
      fileAboveCards: fr.bottom <= cg.top + 2,
      secs, cards,
      cargoAboveTrain: cg.bottom <= tr.top + 2,
      trainAboveLb: tr.bottom <= lr.top + 2,
      settingsBuild: String(window.__game.GAME_BUILD)
    };
  });
  assert.strictEqual(admin.file, 'Loaded file ' + FILE_ID);
  assert.strictEqual(admin.settingsBuild, '202611020954', 'settings build was changed; that line is not the OTA id');
  assert.ok(admin.fileAboveCards, 'file id is not on the Admin header');
  assert.deepStrictEqual(admin.secs, ['PASSENGER', 'CARGO', 'TRAIN / RAIL']);
  assert.ok(admin.cargoAboveTrain && admin.trainAboveLb, 'train block is not between cargo and the leaderboard');
  for (const label of ['RAIL TOKENS', 'RT/MIN', 'PAX (LIFETIME)', 'PAX THIS WEEK', 'PLATFORMS', 'TRAIN BOOST', 'RAIL PRESTIGE']) {
    assert.ok(admin.cards.some(c => c.startsWith(label)), 'missing ' + label);
  }
  assert.ok(admin.cards.some(c => c.startsWith('PLATFORMS') && c.includes('5/10')));
  assert.ok(admin.cards.some(c => c.startsWith('RAIL PRESTIGE') && c.includes('2/10')));
  await page.evaluate(() => document.querySelectorAll('#iaToast').forEach(n => n.remove()));
  await page.screenshot({ path: path.join(outDir, 'admin-mobile.png') });
  await page.evaluate(() => document.getElementById('admFile').scrollIntoView({ block: 'start' }));
  await page.screenshot({ path: path.join(outDir, 'admin-mobile-top.png') });
  await page.evaluate(() => [...document.querySelectorAll('.admSec')].find(e => /TRAIN/.test(e.textContent)).scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: path.join(outDir, 'admin-mobile-train.png') });

  const locked = await page.evaluate(() => {
    window.__trains.state().unlocked = 0;
    window.__b3Bridge.renderAdmin();
    window.scrollTo(0, 0);
    return { text: document.getElementById('admBody').innerText, file: document.getElementById('admFile').textContent.trim() };
  });
  assert.strictEqual(locked.file, 'Loaded file ' + FILE_ID);
  assert.ok(/TRAIN \/ RAIL/.test(locked.text) && /Locked/.test(locked.text) && !/RAIL TOKENS/.test(locked.text), locked.text);
  await page.screenshot({ path: path.join(outDir, 'admin-locked.png'), fullPage: true });
  await page.evaluate(() => { window.__trains.state().unlocked = 1; window.__b3Bridge.renderAdmin(); });

  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluate(() => { window.scrollTo(0, 0); window.__b3Bridge.openAdmin(); });
  const wide = await page.evaluate(() => ({
    secs: [...document.querySelectorAll('#admBody .admSec')].map(e => e.textContent.trim()).join(','),
    file: document.getElementById('admFile').textContent.trim()
  }));
  assert.strictEqual(wide.secs, 'PASSENGER,CARGO,TRAIN / RAIL');
  assert.strictEqual(wide.file, 'Loaded file ' + FILE_ID);
  await page.screenshot({ path: path.join(outDir, 'admin-desktop.png'), fullPage: true });
  console.log('browser checks ok', admin.cards.filter(c => /RAIL|PAX|PLATFORM|TRAIN|RT/.test(c)).join(' || '));
  await browser.close();
  server.close();
})();
