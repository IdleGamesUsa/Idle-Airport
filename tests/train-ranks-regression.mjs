// Train Ranks must show genuine Firebase players only.
// Run: node tests/train-ranks-regression.mjs
// Optional browser pass (Chrome + puppeteer-core): TRAIN_RANKS_BROWSER=1 node tests/train-ranks-regression.mjs
import fs from 'fs';
import vm from 'vm';
import assert from 'assert';
import { createRequire } from 'module';

const files = ['game-v37-trains.html', 'beta/game-v37-trains.html'];
const stubNames = ['RailFan88', 'Conductor Kim', 'ExpressEd', 'TrackStar', 'PlatformPat', 'NightTrainNia', 'SteamySam', 'LoopLine', 'SignalSue'];

function extract(src, name) {
  const at = src.indexOf('function ' + name);
  if (at < 0) throw new Error('missing function ' + name);
  let i = src.indexOf('{', at), depth = 0, start = i;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) return src.slice(at, i + 1); }
  }
  throw new Error('unclosed ' + name);
}

const root = fs.readFileSync(files[0], 'utf8');
const beta = fs.readFileSync(files[1], 'utf8');
assert.strictEqual(root, beta, 'root and beta game HTML must match');
for (const n of stubNames) assert.ok(!root.includes(n), 'stub rival name returned: ' + n);
assert.ok(!root.includes('function lb()'), 'local train lb() stub must stay deleted');
assert.ok(root.includes("kind==='train'?{real:1"), 'train board must request real-player filter');
assert.ok(root.includes("window.__rkArea==='train'?'train'"), 'full-screen Ranks must have a train area');
assert.ok(root.includes("window.__rkArea='train'"), 'Train Station Ranks button must open the train board');
assert.ok(root.includes("['Score',fmtPts1(s)],['Passengers'"), 'pilot card stats must stay Score / Passengers / Cargo / Days');
assert.ok(!root.includes('mockPilot(r.n'), 'train rows must not build mockPilot portraits');

const ctx = { rkTrainRival: null };
vm.runInNewContext(extract(root, 'rkTrainRival') + '\nthis.rkTrainRival=rkTrainRival;', ctx);
const prof = { cfg: { g: 'm', face: 0 }, eq: { title: 'ttl_rookie', frame: 'frm_none' } };
const cases = [
  ['name-only stub', { n: 'RailFan88', s: 4e6 }, false],
  ['uid without profile', { n: 'Conductor Kim', s: 2e6, u: 'FAKEUID123' }, false],
  ['real uid, zero score', { n: 'Vesver', s: 0, u: 'uHkE9Tdf99', p: prof }, false],
  ['real weekly score', { n: 'CaptainSully', s: 26741, u: 'RXEMvXdo1234', p: prof }, true],
  ['default name, real profile', { n: 'Pilot2410', s: 50, u: 'Wpf1FKkq1234', p: { cfg: { g: 'f' } } }, true],
  ['short uid', { n: 'Short', s: 10, u: 'abc', p: prof }, false],
  ['own row is not a rival', { me: 1, n: 'You', s: 10, u: 'RXEMvXdo1234', p: prof }, false]
];
for (const [label, row, expect] of cases) {
  assert.strictEqual(ctx.rkTrainRival(row), expect, label);
}
console.log('pure checks ok', cases.length);

if (process.env.TRAIN_RANKS_BROWSER === '1') await (async () => {
  const require = createRequire(import.meta.url);
  let puppeteer;
  try { puppeteer = require('puppeteer-core'); }
  catch (e) {
    if (!process.env.PUPPETEER_CORE) { console.log('browser checks skipped (' + e.message + ')'); return; }
    puppeteer = require(process.env.PUPPETEER_CORE);
  }
  const chrome = process.env.CHROME_PATH || '/usr/local/bin/google-chrome';
  const { createServer } = await import('http');
  const path = await import('path');
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const server = createServer((req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.join(rootDir, rel === '/' ? 'game-v37-trains.html' : rel.replace(/^\/+/, ''));
    if (!file.startsWith(rootDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const port = server.address().port;
  const trainTop = [
    { n: 'CaptainSully', s: 26741, r: 1, u: 'RXEMvXdo1234', p: { cfg: { g: 'm', face: 1, skin: 2, hair: 2, hairc: 1, uni: 1, acc: 0, badge: 1 }, eq: { cap: 'cap_crew', outfit: 'out_std', glasses: 'gl_none', epa: 'epa_none', title: 'ttl_hauler', frame: 'frm_none' }, title: 'Bronze Hauler', pr: 2, gates: 12, paxL: 842, cgL: 333, created: Date.now() - 10 * 864e5 } },
    { n: 'Pilot4740', s: 0, r: 2, u: 'kFc748vs1234', p: prof },
    { n: 'RailFan88', s: 4000000, r: 3 },
    { n: 'Conductor Kim', s: 2500000, r: 4, u: 'FAKEUID12345' },
    { n: 'Pilot2410', s: 50, r: 5, u: 'Wpf1FKkq1234', p: { cfg: { g: 'f', face: 2, skin: 1, hair: 4, hairc: 3, uni: 2, acc: 0, badge: 0 }, eq: { cap: 'cap_beanie', outfit: 'out_std', glasses: 'gl_none', epa: 'epa_none', title: 'ttl_rookie', frame: 'frm_none' }, title: 'Rookie Pilot', gates: 4, paxL: 10, cgL: 0, created: Date.now() - 864e5 } }
  ];
  const paxTop = [
    { n: 'RealPax', s: 100, r: 1, u: 'RealPaxUid123', p: prof },
    { n: 'NameOnlyRival', s: 80, r: 2 },
    { n: 'ZeroPax', s: 0, r: 3, u: 'ZeroPaxUid123', p: prof }
  ];
  const browser = await puppeteer.launch({ executablePath: chrome, headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage();
    page.on('pageerror', e => console.log('PAGEERROR', e.message));
    await page.evaluateOnNewDocument((trainTop, paxTop) => {
      const d = new Date(), s = new Date(d); s.setHours(0, 0, 0, 0); s.setDate(s.getDate() - s.getDay());
      localStorage.setItem('ia_trains_v1', JSON.stringify({ unlocked: 1, un: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], bs: Array(10).fill(1), pop: Array(10).fill(1), rt: 100, pax: 20, paxWk: 12, wk: s.toISOString().slice(0, 10), last: Date.now(), boost: 0, pr: 0, sel: 0, ms: {} }));
      window.__iaNetMock = async (path, body) => {
        if (path === 'board' && body && body.board === 'trainWeek') return { ok: true, total: 5, top: trainTop, me: { rank: 3, score: 12 } };
        if (path === 'board' && body && body.board === 'paxWeek') return { ok: true, total: 3, top: paxTop, me: null };
        if (path === 'score') return { ok: true };
        return { ok: false, reason: 'offline' };
      };
    }, trainTop, paxTop);
    await page.goto('http://127.0.0.1:' + port + '/game-v37-trains.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__rkTrainRival && window.__game && window.__game.setView);
    await new Promise(r => setTimeout(r, 800));
    await page.evaluate(() => {
      const skip = [...document.querySelectorAll('button')].find(b => /Skip/.test(b.textContent || ''));
      if (skip) skip.click();
    });
    await page.evaluate(() => { window.__game.setView('trsel'); const btn = document.getElementById('tsRanks'); if (btn) btn.click(); });
    await page.waitForFunction(() => {
      const lb = document.getElementById('lb');
      const title = document.getElementById('rkAreaT');
      return lb && title && /Trains/.test(title.textContent || '') && /CaptainSully/.test(lb.innerText);
    }, { timeout: 15000 });
    const train = await page.evaluate(() => {
      const lb = document.getElementById('lb');
      return { title: document.getElementById('rkAreaT').textContent, text: lb.innerText, view: window.__game.view };
    });
    assert.strictEqual(train.view, 'rank');
    assert.ok(train.title.includes('Trains'), train.title);
    for (const keep of ['CaptainSully', 'Pilot2410']) assert.ok(train.text.includes(keep), 'missing ' + keep + '\n' + train.text);
    for (const drop of ['RailFan88', 'Conductor Kim', 'Pilot4740', 'Spring Airlift']) assert.ok(!train.text.includes(drop), 'train board showed ' + drop);
    await page.evaluate(() => [...document.querySelectorAll('#lb [data-pl]')].find(n => (n.textContent || '').includes('CaptainSully')).click());
    await page.waitForFunction(() => { const b = document.getElementById('popBox'); return b && /Frequent Flyer/.test(b.innerText) && /842/.test(b.innerText); });
    const card = await page.evaluate(() => document.getElementById('popBox').innerText);
    assert.ok(!/Spring Airlift|Night Cargo Sprint|Peak Season Rush/.test(card), 'profile card used mockPilot trophies\n' + card);
    assert.ok(/842/.test(card), 'profile card missing saved passenger count\n' + card);
    await page.evaluate(() => { window.__rkArea = 'pax'; window.__game.setView('rank'); });
    await page.waitForFunction(() => /NameOnlyRival/.test(document.getElementById('lb').innerText) && /ZeroPax/.test(document.getElementById('lb').innerText), { timeout: 10000 });
    const pax = await page.evaluate(() => document.getElementById('lb').innerText);
    assert.ok(pax.includes('RealPax') && pax.includes('NameOnlyRival') && pax.includes('ZeroPax'), 'passenger board changed\n' + pax);
    assert.ok(!/Train passengers/.test(pax), 'passenger board rendered the train board\n' + pax);
    console.log('browser checks ok');
  } finally {
    await browser.close();
    server.close();
  }
})();
