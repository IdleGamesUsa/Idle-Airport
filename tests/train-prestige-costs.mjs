// Train prestige scales platform unlocks and Efficiency/Popularity prices by the same ×2^level as rail income.
// Prestige 0 prices stay the pre-change rounds. Earned RT is not wiped.
// Run: node tests/train-prestige-costs.mjs
// Browser: PUPPETEER_CORE=/path TRAIN_PRESTIGE_BROWSER=1 node tests/train-prestige-costs.mjs
import assert from 'assert';
import fs from 'fs';
import { createRequire } from 'module';

const MAXLV = 20, PRMAX = 10;
const baseRate = i => 5 * 3 ** i;
const prMul = pr => { let p = Math.floor(+pr || 0); if (p < 0) p = 0; else if (p > PRMAX) p = PRMAX; return 2 ** p; };
const trCost = (x, pr) => { const y = x * prMul(pr); if (!(y > 0) || y !== y) return 0; if (y >= Number.MAX_SAFE_INTEGER) return Number.MAX_SAFE_INTEGER; return Math.round(y); };
const unlockCost = (i, pr) => i <= 0 ? 0 : trCost(60 * 3.2 ** i, pr);
const upCost = (i, lv, pr) => trCost(baseRate(i) * 8 * 1.32 ** (lv - 1), pr);
const oldUnlock = i => i === 0 ? 0 : Math.round(60 * 3.2 ** i);
const oldUp = (i, lv) => Math.round(baseRate(i) * 8 * 1.32 ** (lv - 1));
const prPrice = pr => Math.round(2e7 * 6 ** pr);
const rate = (i, bs, pop, pr, owned) => owned ? baseRate(i) * (1 + 0.15 * (bs - 1)) * (1 + 0.15 * (pop - 1)) * prMul(pr) : 0;

function ladderCost(pr) {
  let t = 0;
  for (let i = 0; i < 10; i++) {
    t += unlockCost(i, pr);
    for (let lv = 1; lv < MAXLV; lv++) t += upCost(i, lv, pr) * 2;
  }
  return t;
}
function maxIncome(pr, boost) { return [...Array(10)].reduce((s, _, i) => s + rate(i, 20, 20, pr, true), 0) * (boost || 1); }

for (let i = 0; i < 10; i++) {
  assert.strictEqual(unlockCost(i, 0), oldUnlock(i), 'pr0 unlock ' + i);
  for (const lv of [1, 2, 10, 19]) assert.strictEqual(upCost(i, lv, 0), oldUp(i, lv), 'pr0 up ' + i + '/' + lv);
}
for (const pr of [1, 2, 3, 5, 10]) {
  for (let i = 0; i < 10; i++) {
    assert.strictEqual(unlockCost(i, pr), i <= 0 ? 0 : trCost(60 * 3.2 ** i, pr));
    assert.ok(upCost(i, 1, pr) > upCost(i, 1, pr - 1));
    assert.ok(Number.isSafeInteger(upCost(i, 19, pr)), 'safe up ' + pr + '/' + i);
    assert.ok(Number.isSafeInteger(unlockCost(i, pr)));
  }
}
assert.strictEqual(prMul(0), 1);
assert.strictEqual(prMul(10), 1024);
assert.strictEqual(prMul(80), 1024, 'prestige above the cap cannot overflow the multiplier');
assert.strictEqual(prMul(-3), 1);
assert.strictEqual(unlockCost(0, 5), 0, 'platform 1 stays free');

function climb(pr, rt0, boost) {
  const un = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], bs = Array(10).fill(1), pop = Array(10).fill(1);
  let rt = rt0, t = 0;
  const income = () => [...Array(10)].reduce((s, _, i) => s + rate(i, bs[i], pop[i], pr, un[i]), 0) * (boost || 1);
  const opts = () => {
    const ops = [];
    const nx = un.indexOf(0); if (nx >= 0) ops.push(['un', nx, unlockCost(nx, pr)]);
    for (let i = 0; i < 10; i++) if (un[i]) {
      if (bs[i] < MAXLV) ops.push(['bs', i, upCost(i, bs[i], pr)]);
      if (pop[i] < MAXLV) ops.push(['pop', i, upCost(i, pop[i], pr)]);
    }
    return ops;
  };
  for (let n = 0; n < 200000; n++) {
    const done = un.every(Boolean) && bs.every(v => v === MAXLV) && pop.every(v => v === MAXLV);
    if (done && rt >= prPrice(pr) - 1e-6) return { hours: t / 60, rt, price: prPrice(pr), income: income() };
    const ops = opts();
    const aff = ops.filter(o => o[2] <= rt + 1e-6);
    if (aff.length) {
      const [k, i, c] = aff.reduce((a, b) => a[2] <= b[2] ? a : b);
      rt -= c; if (k === 'un') un[i] = 1; else if (k === 'bs') bs[i]++; else pop[i]++;
      continue;
    }
    const target = ops.length ? ops.reduce((a, b) => a[2] <= b[2] ? a : b)[2] : prPrice(pr);
    const need = Math.max(0, target - rt), inc = income();
    t += need / inc; rt += need;
  }
  throw new Error('climb did not finish');
}

const h0 = climb(0, 0, 1).hours, h1 = climb(1, 0, 1).hours, h0b = climb(0, 0, 2).hours;
assert.ok(h0 > 30 && h0 < 50, 'pr0 climb ' + h0);
assert.ok(Math.abs(h1 - h0) / h0 < 0.02, 'pr1 from zero bank takes about the same real time as pr0 ' + h1 + ' vs ' + h0);
assert.ok(Math.abs(h0b - h0 / 2) / h0 < 0.02, '2x ad boost still halves the climb');
const firstMin = upCost(0, 1, 0) / rate(0, 1, 1, 0, true);
for (const pr of [0, 1, 5, 10]) {
  const mins = upCost(0, 1, pr) / rate(0, 1, 1, pr, true);
  assert.ok(Math.abs(mins - firstMin) < 1e-6, 'first Efficiency upgrade stays the same number of minutes at pr ' + pr);
}
function frac(hours, pr) { return maxIncome(pr) * hours * 60 / ladderCost(pr); }
for (const pr of [0, 1, 2, 5, 10]) {
  assert.ok(frac(4, pr) < 0.5, '4h maxed offline cannot buy the ladder at pr ' + pr + ' frac ' + frac(4, pr));
  assert.ok(frac(12, pr) > 1, '12h is the known long-bank tradeoff at pr ' + pr);
  assert.ok(frac(24, pr) > frac(12, pr));
}
const bank4 = maxIncome(1) * 240;
const paid = climb(1, bank4, 1);
assert.ok(paid.hours > 1 && paid.hours < h1, '4h of the new maxed income does not finish the next ladder immediately ' + paid.hours);
console.log(JSON.stringify({
  formula: 'cost = round(baseCost * 2^min(max(prestige,0),10)); income uses the same multiplier; prestige 0 baseCost is unchanged',
  pr0Hours: +h0.toFixed(2), pr1Hours: +h1.toFixed(2), pr0BoostHours: +h0b.toFixed(2),
  ladderPr0: ladderCost(0),
  frac4: +frac(4, 1).toFixed(3), frac12: +frac(12, 1).toFixed(3), frac24: +frac(24, 1).toFixed(3),
  after4hHours: +paid.hours.toFixed(2), firstUpgradeMin: +firstMin.toFixed(2)
}, null, 2));

const html = fs.readFileSync('game-v37-trains.html', 'utf8');
assert.strictEqual(html, fs.readFileSync('beta/game-v37-trains.html', 'utf8'));
assert.ok(html.includes('function trCost(x){var y=x*prMul()'));
assert.ok(html.includes('prices ×'));
assert.ok(!html.includes('function prMul(){return Math.pow(2,T.pr)}'));

if (process.env.TRAIN_PRESTIGE_BROWSER === '1') await (async () => {
  const require = createRequire(import.meta.url);
  let puppeteer;
  try { puppeteer = require('puppeteer-core'); }
  catch (e) {
    if (!process.env.PUPPETEER_CORE) { console.log('browser checks skipped'); return; }
    puppeteer = require(process.env.PUPPETEER_CORE);
  }
  const http = await import('http');
  const path = await import('path');
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const server = http.createServer((req, res) => {
    const rel = decodeURIComponent((req.url || '/').split('?')[0]);
    const file = path.join(rootDir, rel === '/' ? 'game-v37-trains.html' : rel.replace(/^\/+/, ''));
    if (!file.startsWith(rootDir) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end('no'); return; }
    res.writeHead(200, { 'Content-Type': 'text/html' });
    fs.createReadStream(file).pipe(res);
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const browser = await puppeteer.launch({ executablePath: process.env.CHROME_PATH || '/usr/local/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--disable-gpu'] });
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(() => { window.__iaNetMock = async () => ({ ok: false, reason: 'offline' }); });
    await page.goto('http://127.0.0.1:' + server.address().port + '/game-v37-trains.html', { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForFunction(() => window.__trains);
    await new Promise(r => setTimeout(r, 800));
    await page.evaluate(() => { [...document.querySelectorAll('button')].forEach(b => { if (/Skip|Later/.test(b.textContent || '')) b.click(); }); });
    const bought = await page.evaluate(() => {
      const out = [];
      function setup(pr, rt, lv, view) {
        const s = window.__trains.state();
        s.unlocked = 1; s.un = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]; s.bs = Array(10).fill(lv); s.pop = Array(10).fill(lv);
        s.pr = pr; s.rt = rt; s.sel = 0; s.last = Date.now(); s.boost = 0;
        window.__game.setView(view || 'train'); window.__trains.render();
      }
      function expectBuy(pr, kind) {
        const base = kind === 'un' ? 60 * 3.2 : 5 * 8;
        const p = Math.max(0, Math.min(10, pr | 0));
        const cost = Math.round(base * 2 ** p);
        setup(pr, cost, 1, kind === 'un' ? 'trsel' : 'train');
        const btn = document.querySelector(kind === 'un' ? '[data-trp="1"]' : '[data-tru="' + kind + '"]');
        if (!btn) throw new Error('missing '+kind+' view='+window.__game.view+' html='+((document.getElementById('tpBody')||{}).innerHTML||'').slice(0,180));
        const shown = (btn.textContent || '').replace(/\s+/g, ' ');
        const can = btn.className.includes('can') || kind === 'un';
        const rt0 = window.__trains.state().rt, lv0 = window.__trains.state()[kind === 'un' ? 'un' : kind][kind === 'un' ? 1 : 0];
        window.__trains.state().last = Date.now();
        btn.click();
        const s = window.__trains.state();
        const paid = rt0 - s.rt;
        out.push({ pr, kind, cost, paid: +paid.toFixed(4), shown, can, level: kind === 'un' ? s.un[1] : s[kind][0], was: lv0 });
      }
      for (const pr of [0, 1, 3, 10]) {
        expectBuy(pr, 'bs');
        expectBuy(pr, 'pop');
        expectBuy(pr, 'un');
      }
      setup(2, Math.round(40 * 4) - 1, 1);
      window.__cfAuto = true;
      window.__game.S.tickets = 50;
      const t0 = window.__game.S.tickets;
      document.querySelector('[data-tru="pop"]').click();
      out.push({ ticket: true, spent: t0 - window.__game.S.tickets, pop: window.__trains.state().pop[0], pr: 2 });
      const pend = 424242;
      window.__game.S.pending = { rt: pend };
      setup(5, 1e12, 1);
      window.__trains.render();
      out.push({ pending: window.__game.S.pending.rt });
      const st = window.__trains.state();
      st.un = Array(10).fill(1); st.bs = Array(10).fill(20); st.pop = Array(10).fill(20); st.pr = 0; st.rt = 1e12; st.last = Date.now();
      window.__trains.render();
      const bank = st.rt;
      document.querySelector('[data-tr="prestige"]').click();
      out.push({ bankBefore: bank, bankAfter: st.rt, pr: st.pr, open: st.un.filter(Boolean).length, bs0: st.bs[0], pop0: st.pop[0] });
      st.pr = 80; st.rt = 50000; st.un = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0]; st.bs = Array(10).fill(1); st.pop = Array(10).fill(1); st.last = Date.now();
      window.__trains.render();
      const rt80 = st.rt;
      document.querySelector('[data-tru="bs"]').click();
      out.push({ clampPaid: +(rt80 - st.rt).toFixed(2), lv: st.bs[0], finite: Number.isFinite(st.rt) });
      return out;
    });
    for (const row of bought) {
      if (row.ticket) { assert.strictEqual(row.spent, 1); assert.strictEqual(row.pop, 2); continue; }
      if (row.pending != null) { assert.strictEqual(row.pending, 424242); continue; }
      if (row.bankBefore != null) {
        assert.ok(Math.abs((row.bankBefore - row.bankAfter) - 20000000) < 1, JSON.stringify(row));
        assert.strictEqual(row.pr, 1);
        assert.strictEqual(row.open, 1);
        assert.strictEqual(row.bs0, 1);
        assert.strictEqual(row.pop0, 1);
        continue;
      }
      if (row.clampPaid != null) { assert.ok(Math.abs(row.clampPaid - 40960) < 1, JSON.stringify(row)); assert.strictEqual(row.lv, 2); assert.strictEqual(row.finite, true); continue; }
      assert.ok(Math.abs(row.paid - row.cost) < 1, JSON.stringify(row));
      assert.strictEqual(row.level, row.kind === 'un' ? 1 : 2);
    }
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__trains);
    const reloaded = await page.evaluate(() => {
      const s = window.__trains.state();
      s.bs = Array(10).fill(1); s.pop = Array(10).fill(1); s.un = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0];
      s.last = Date.now(); s.rt = 40960; s.sel = 0;
      window.__game.setView('train'); window.__trains.render();
      const rt0 = s.rt;
      document.querySelector('[data-tru="bs"]').click();
      return { pr: s.pr, paid: +(rt0 - s.rt).toFixed(2), lv: s.bs[0] };
    });
    assert.strictEqual(reloaded.pr, 80);
    assert.ok(Math.abs(reloaded.paid - 40960) < 1, JSON.stringify(reloaded));
    console.log('browser checks ok', bought.length);
  } finally { await browser.close(); server.close(); }
})();
