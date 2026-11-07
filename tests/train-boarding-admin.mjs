// Train admin metrics + popularity boarding lock.
// Browser (Chrome): TRAIN_BOARD_BROWSER=1 node tests/train-boarding-admin.mjs
import fs from 'fs';
import assert from 'assert';
import { createRequire } from 'module';

const root = new URL('../game-v37-trains.html', import.meta.url);
const beta = new URL('../beta/game-v37-trains.html', import.meta.url);
const rootTxt = fs.readFileSync(root, 'utf8');
const betaTxt = fs.readFileSync(beta, 'utf8');
assert.strictEqual(rootTxt, betaTxt, 'root and beta game HTML diverged');
assert.ok(rootTxt.includes('TRAIN / RAIL'), 'admin is missing the train section');
assert.ok(!rootTxt.includes('if(STG.i===i)STG.cyc=-1'), 'popularity still invalidates the live cycle');
assert.ok(!rootTxt.includes('STG.selN'), 're-entering a platform still mints a new boarding clock');
assert.ok(rootTxt.includes('RN.pop=T.pop[i]|0'), 'next cycle does not latch the purchased popularity');
assert.ok(rootTxt.includes('tPlan(c,i,RN.pop)'), 'the live plan is not built from the latched popularity');
assert.ok(rootTxt.includes('STG.hold'), 'leaving a platform drops its consist');
const trMul = rootTxt.includes('function prMul(){var p=Math.floor(+T.pr||0);if(p<0)p=0;else if(p>PRMAX)p=PRMAX;return Math.pow(2,p)}');
assert.ok(trMul, 'prestige income multiplier changed');
assert.ok(rootTxt.includes('function trCost(x){var y=x*prMul()'), 'prestige price scaling changed');
assert.ok(rootTxt.includes('function rkTrainRival'), 'train ranks filter missing');
console.log('source checks ok');

if (process.env.TRAIN_BOARD_BROWSER === '1') await (async () => {
  const require = createRequire(import.meta.url);
  const puppeteer = require(process.env.PUPPETEER_CORE || '/tmp/pup/node_modules/puppeteer-core');
  const { createServer } = await import('http');
  const path = await import('path');
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const outDir = process.env.TRAIN_BOARD_OUT || '/tmp/train-board-evidence';
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
    protocolTimeout: 180000,
    args: ['--no-sandbox', '--disable-gpu']
  });
  const SNAP = `(() => {
    const S = window.__trainsStage();
    const T = window.__trains.state();
    const i = T.sel | 0;
    const RN = S.run && S.run[i];
    const P = S.L && S.L.cars[0] && S.L.cars[0].plan;
    const o = { i, pop: T.pop[i], bs: T.bs[i], pax: T.pax, rt: T.rt, pr: T.pr | 0 };
    if (!RN || !P) return o;
    const now = S.vt[i];
    const ph = (now - RN.s) / RN.c;
    return Object.assign(o, { ph, n: RN.n, N: P.N, c: RN.c, latched: RN.pop, built: RN.built, cars: S.L.cars.length });
  })()`;
  const d = new Date(), wkD = new Date(d); wkD.setHours(0, 0, 0, 0); wkD.setDate(wkD.getDate() - wkD.getDay());
  const train = {
    unlocked: 1, un: [1, 1, 1, 1, 1, 1, 0, 0, 0, 0],
    bs: Array(10).fill(1), pop: Array(10).fill(1),
    rt: 1e12, pax: 1000, paxWk: 42, wk: wkD.toISOString().slice(0, 10),
    last: Date.now(), boost: 0, pr: 2, sel: 0, ms: {}
  };
  const page = await browser.newPage();
  page.on('pageerror', e => console.log('PAGEERROR', e.message));
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
  await page.evaluateOnNewDocument(train => {
    if (sessionStorage.getItem('ia_keep')) return;
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

  // Admin, phone width, cargo unlocked so the block sits where the report showed it missing.
  const admin = await page.evaluate(() => {
    const S = window.__game.S;
    S.cash = 1.39e23;
    S.cgP = S.cgP || {};
    Object.assign(S.cgP, { unlocked: 1, cc: 5.27e16, tons: 3.77e7, last: Date.now(), un: [1, 1, 1, 1, 1, 0, 0, 0, 0, 0], h: Array(10).fill(4), d: Array(10).fill(4), wildEnd: 0 });
    window.__b3Bridge.openAdmin();
    const body = document.getElementById('admBody');
    const lb = document.getElementById('admLb');
    const secs = [...body.querySelectorAll('.admSec')].map(e => e.textContent.trim());
    const cards = [...body.querySelectorAll('.admCard')].map(e => e.innerText.replace(/\s+/g, ' ').trim());
    const train = [...body.querySelectorAll('.admSec')].find(e => /TRAIN/.test(e.textContent));
    const cargo = [...body.querySelectorAll('.admSec')].find(e => e.textContent.trim() === 'CARGO');
    const tr = train.getBoundingClientRect();
    const cg = cargo.getBoundingClientRect();
    const lr = lb.getBoundingClientRect();
    return { secs, cards, trainAboveLb: tr.bottom <= lr.top + 2, cargoAboveTrain: cg.bottom <= tr.top + 2, text: body.innerText };
  });
  assert.deepStrictEqual(admin.secs, ['PASSENGER', 'CARGO', 'TRAIN / RAIL']);
  assert.ok(admin.cargoAboveTrain && admin.trainAboveLb, 'train block is not between cargo and the pilot-score board');
  for (const label of ['RAIL TOKENS', 'RT/MIN', 'PAX (LIFETIME)', 'PAX THIS WEEK', 'PLATFORMS', 'TRAIN BOOST', 'RAIL PRESTIGE']) {
    assert.ok(admin.cards.some(c => c.startsWith(label)), 'missing admin card ' + label + '\n' + admin.cards.join(' | '));
  }
  assert.ok(/PLATFORMS\n6\/10/.test(admin.text) && /RAIL PRESTIGE\n2\/10/.test(admin.text) && /52\.7Qa CC/.test(admin.text), admin.text);
  await page.evaluate(() => document.querySelectorAll('#iaToast, [data-k="popClose"]').forEach(n => n.remove()));
  await page.screenshot({ path: path.join(outDir, 'admin-mobile.png') });
  const trainShot = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.admSec')].find(e => /TRAIN/.test(e.textContent));
    el.scrollIntoView({ block: 'center' });
    return true;
  });
  assert.ok(trainShot);
  await page.screenshot({ path: path.join(outDir, 'admin-mobile-train.png') });
  console.log('admin mobile ok', admin.cards.filter(c => /RAIL|PAX|PLATFORM|TRAIN|RT/.test(c)).join(' || '));

  await page.setViewport({ width: 1280, height: 900, deviceScaleFactor: 1 });
  await page.evaluate(() => { window.scrollTo(0, 0); window.__b3Bridge.openAdmin(); });
  await page.screenshot({ path: path.join(outDir, 'admin-desktop.png'), fullPage: true });
  const wide = await page.evaluate(() => [...document.querySelectorAll('#admBody .admSec')].map(e => e.textContent.trim()).join(','));
  assert.strictEqual(wide, 'PASSENGER,CARGO,TRAIN / RAIL');

  // Locked trains still get a row, in the same place.
  const locked = await page.evaluate(() => {
    const T = window.__trains.state();
    const prev = T.unlocked;
    T.unlocked = 0;
    window.__b3Bridge.renderAdmin();
    const text = document.getElementById('admBody').innerText;
    T.unlocked = prev;
    window.__b3Bridge.renderAdmin();
    return text;
  });
  assert.ok(/TRAIN \/ RAIL/.test(locked) && /Locked/.test(locked) && !/RAIL TOKENS/.test(locked), locked);
  await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 1 });

  async function openTrain() {
    await page.evaluate(() => {
      const g = window.__game;
      if (!g.setView._wrapped) {
        const orig = g.setView.bind(g);
        const wrapped = function (v) {
          (window.__setViewLog = window.__setViewLog || []).push(String(v) + ' ' + (new Error().stack || '').split('\n').slice(2, 5).join(' << '));
          return orig(v);
        };
        wrapped._wrapped = 1;
        g.setView = wrapped;
      }
      window.__setViewLog = [];
      g.setView('train');
      window.__trains.render();
    });
    await page.waitForFunction(() => {
      const S = window.__trainsStage();
      const i = window.__trains.state().sel | 0;
      return S.run && S.run[i] && S.L && S.L.cars[0].plan && S.cv && S.cv.isConnected;
    });
    await new Promise(r => setTimeout(r, 200));
  }
  async function snap() { return page.evaluate(src => eval(src), SNAP); }
  async function seek(target) {
    await page.evaluate(async target => {
      const S = window.__trainsStage();
      const i = window.__trains.state().sel | 0;
      const RN = S.run[i];
      const n0 = RN.n;
      for (let k = 0; k < 5000; k++) {
        const ph = (S.vt[i] - RN.s) / RN.c;
        if (RN.n !== n0) break;
        if (ph >= target && ph < target + 0.06) break;
        S.vt[i] += 0.1;
        await new Promise(r => requestAnimationFrame(r));
      }
    }, target);
  }
  async function clickPop() {
    return page.evaluate(async snapSrc => {
      const snap = () => eval(snapSrc);
      const T = window.__trains.state();
      T.last = Date.now();
      const before = snap();
      const b = document.querySelector('button[data-tru="pop"]');
      if (!b || b.disabled) return { err: 'no pop button', text: b && b.innerText, before };
      const label = b.innerText;
      b.click();
      const mid = snap();
      for (let k = 0; k < 8; k++) await new Promise(r => requestAnimationFrame(r));
      return { label, before, mid, after: snap() };
    }, SNAP);
  }
  function assertHeld(hit, label) {
    assert.ok(!hit.err, label + ' ' + JSON.stringify(hit));
    const a = hit.before, b = hit.mid;
    assert.strictEqual(b.pop, a.pop + 1, label + ' pop');
    assert.strictEqual(b.N, a.N, label + ' headcount changed mid-boarding ' + a.N + '->' + b.N);
    assert.strictEqual(b.n, a.n, label + ' cycle rolled on the click');
    assert.strictEqual(b.latched, a.latched, label + ' latched popularity changed');
    assert.ok(Math.abs(b.c - a.c) < 1e-6, label + ' cycle length changed ' + a.c + '->' + b.c);
    assert.ok(b.ph >= a.ph - 0.01 && b.ph < a.ph + 0.08, label + ' phase ' + a.ph + '->' + b.ph);
    assert.ok(b.ph < 0.92 || a.ph >= 0.9, label + ' departed early at ' + b.ph);
    const dpax = b.pax - a.pax;
    const drt = a.rt - b.rt;
    assert.ok(dpax >= -0.01 && dpax < 1, label + ' passenger income jumped by ' + dpax);
    assert.ok(drt > 0 && drt < 1e7, label + ' RT change ' + drt + ' (expected one upgrade, not a second charge)');
    console.log(label, 'ph', a.ph.toFixed(3), '->', b.ph.toFixed(3), 'N', a.N, 'pop', a.pop, '->', b.pop, 'spent', drt.toFixed(1), 'dpax', dpax.toFixed(4));
  }

  await openTrain();
  // The map boot redirects once, about 350ms after the bridge starts. Let it land, then open the train again so the boarding loop is actually running.
  await new Promise(r => setTimeout(r, 600));
  await openTrain();
  const live = await page.evaluate(() => ({ view: window.__game.view, hide: document.getElementById('vTrain').className, raf: window.__trainsStage().raf ? 1 : 0 }));
  assert.strictEqual(live.view, 'train', JSON.stringify(live));
  assert.ok(!/\bhide\b/.test(live.hide), JSON.stringify(live));
  assert.strictEqual(live.raf, 1, JSON.stringify(live));
  const opened = await snap();
  assert.ok(opened.ph >= 0 && opened.ph < 0.12, 'a new platform should start at the beginning, ph=' + opened.ph);
  assert.strictEqual(opened.N, 6);
  assert.strictEqual(opened.latched, 1);

  await seek(0.15);
  const early = await clickPop();
  assertHeld(early, 'early');
  await page.screenshot({ path: path.join(outDir, 'board-early.png') });
  await seek(0.48);
  const mid = await clickPop();
  assertHeld(mid, 'mid');
  await page.screenshot({ path: path.join(outDir, 'board-mid.png') });
  await seek(0.75);
  const late = await clickPop();
  assertHeld(late, 'late');
  await page.screenshot({ path: path.join(outDir, 'board-late.png') });

  const burst = await page.evaluate(async snapSrc => {
    const snap = () => eval(snapSrc);
    const T = window.__trains.state();
    T.last = Date.now();
    const before = snap();
    const spent = [];
    for (let k = 0; k < 5; k++) {
      const rt0 = T.rt;
      const b = document.querySelector('button[data-tru="pop"]');
      if (!b || b.disabled) break;
      b.click();
      spent.push(rt0 - T.rt);
      await new Promise(r => requestAnimationFrame(r));
    }
    return { before, after: snap(), spent };
  }, SNAP);
  assert.strictEqual(burst.after.N, burst.before.N, 'repeated upgrades changed the current consist');
  assert.strictEqual(burst.after.n, burst.before.n);
  assert.strictEqual(burst.after.pop, burst.before.pop + burst.spent.length);
  assert.ok(burst.spent.every(x => x > 0));
  const uniq = new Set(burst.spent.map(x => Math.round(x)));
  assert.strictEqual(uniq.size, burst.spent.length, 'repeated clicks charged the same price twice ' + burst.spent.join(','));
  console.log('repeat', burst.spent.map(x => Math.round(x)).join(','), 'N', burst.after.N, 'pop', burst.after.pop);

  const rerender = await page.evaluate(async snapSrc => {
    const snap = () => eval(snapSrc);
    const before = snap();
    window.__trains.render();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    return { before, after: snap() };
  }, SNAP);
  assert.strictEqual(rerender.after.N, rerender.before.N);
  assert.strictEqual(rerender.after.n, rerender.before.n);
  assert.ok(Math.abs(rerender.after.ph - rerender.before.ph) < 0.05, 'rerender moved phase ' + rerender.before.ph + '->' + rerender.after.ph);

  const swapped = await page.evaluate(async snapSrc => {
    const snap = () => eval(snapSrc);
    const waitSnap = async () => {
      let s = null;
      for (let k = 0; k < 40; k++) {
        await new Promise(r => requestAnimationFrame(r));
        s = snap();
        if (s && s.ph != null && s.N) return s;
      }
      return s;
    };
    const before = snap();
    const trainEl = document.getElementById('vTrain');
    const cls0 = trainEl.className;
    document.getElementById('tpNext').click();
    const cls1 = trainEl.className;
    const away = await waitSnap();
    document.getElementById('tpPrev').click();
    const back = await waitSnap();
    const S = window.__trainsStage();
    const T = window.__trains.state();
    return { before, away, back, debug: { cls0, cls1, cls2: trainEl.className, view: window.__game.view, sel: T.sel, stgI: S.i, raf: S.raf ? 1 : 0 } };
  }, SNAP);
  assert.notStrictEqual(swapped.away.i, swapped.before.i);
  assert.strictEqual(swapped.back.i, swapped.before.i);
  assert.strictEqual(swapped.back.N, swapped.before.N, 'returning rebuilt the consist ' + swapped.before.N + '->' + swapped.back.N);
  assert.strictEqual(swapped.back.n, swapped.before.n);
  assert.strictEqual(swapped.back.latched, swapped.before.latched);
  assert.ok(Math.abs(swapped.back.ph - swapped.before.ph) < 0.05, 'return jumped phase ' + swapped.before.ph + '->' + swapped.back.ph);
  assert.ok(Math.abs(swapped.back.c - swapped.before.c) < 1e-6);
  const viewLog = await page.evaluate(() => window.__setViewLog);
  console.log('switch debug', JSON.stringify(swapped.debug), 'setView', JSON.stringify(viewLog));
  await page.screenshot({ path: path.join(outDir, 'board-switch-back.png') });

  // High efficiency, ad boost, already-prestiged save: still the same cycle.
  await page.evaluate(() => {
    const T = window.__trains.state();
    T.bs[0] = 16; T.boost = Date.now() + 600000; T.pr = 4; T.rt = 1e14;
    window.__trains.render();
  });
  const boosted = await clickPop();
  assertHeld(boosted, 'boost-hieff-pr4');

  // Roll to the next departure. The purchased popularity applies here, once.
  const rolled = await page.evaluate(async snapSrc => {
    const snap = () => eval(snapSrc);
    window.__game.setView('train');
    window.__trains.render();
    const before = snap();
    const S = window.__trainsStage();
    const i = before.i;
    const n0 = S.run[i].n;
    for (let k = 0; k < 2500 && S.run[i].n === n0; k++) {
      S.vt[i] += 0.1;
      await new Promise(r => requestAnimationFrame(r));
    }
    await new Promise(r => requestAnimationFrame(r));
    return { before, after: snap(), view: window.__game.view, hide: document.getElementById('vTrain').className };
  }, SNAP);
  assert.ok(rolled.after.n === rolled.before.n + 1, 'cycle did not roll ' + JSON.stringify(rolled));
  assert.ok(rolled.after.ph >= 0 && rolled.after.ph < 0.25, 'next cycle phase ' + rolled.after.ph);
  assert.ok(rolled.after.N > rolled.before.N, 'new headcount did not apply on the next cycle ' + rolled.before.N + '->' + rolled.after.N);
  assert.strictEqual(rolled.after.latched, rolled.after.pop);
  console.log('roll', 'N', rolled.before.N, '->', rolled.after.N, 'pop', rolled.after.pop, 'ph', rolled.after.ph.toFixed(3));

  // 5-car consist, same rule.
  await page.evaluate(() => {
    const T = window.__trains.state();
    T.sel = 5; T.pop[5] = 1; T.bs[5] = 1; T.rt = 1e14;
    window.__game.setView('train'); window.__trains.render();
  });
  await page.waitForFunction(() => window.__trains.state().sel === 5 && window.__trainsStage().L && window.__trainsStage().L.cars.length === 5 && window.__trainsStage().L.cars[0].plan);
  const five = await clickPop();
  assertHeld(five, '5car');
  assert.strictEqual(five.before.cars, 5);
  await page.screenshot({ path: path.join(outDir, 'board-5car.png') });

  // Reload keeps the purchase and does not charge it again.
  const savedPop = await page.evaluate(() => { sessionStorage.setItem('ia_keep', '1'); const T = window.__trains.state(); T.sel = 0; return T.pop[0]; });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__trains && window.__game);
  await new Promise(r => setTimeout(r, 800));
  await page.evaluate(() => document.querySelectorAll('button').forEach(b => { if (/Skip|Later|Close/i.test(b.textContent || '')) b.click(); }));
  const kept = await page.evaluate(() => { const T = window.__trains.state(); T.sel = 0; return T.pop[0]; });
  assert.strictEqual(kept, savedPop, 'reload lost popularity');
  await openTrain();
  const re = await snap();
  assert.strictEqual(re.i, 0);
  assert.strictEqual(re.latched, kept);
  assert.ok(re.ph < 0.12, 'reload resumed mid-departure ph=' + re.ph);
  console.log('reload pop', kept, 'fresh ph', re.ph.toFixed(3), 'N', re.N);

  // Prestige still deducts once, resets levels, and the cached consist is not the old full train.
  await page.evaluate(() => {
    const T = window.__trains.state();
    T.rt = 20000000; T.pr = 0;
    window.__trainsDebug.maxAll();
    T.sel = 9;
    window.__game.setView('train');
    window.__trains.render();
  });
  await page.waitForFunction(() => {
    const S = window.__trainsStage();
    return window.__trains.state().sel === 9 && S.run && S.run[9] && S.L && S.L.cars[0].plan;
  });
  const full = await snap();
  assert.strictEqual(full.i, 9);
  assert.ok(full.N > 20, 'maxed popularity should fill the car, N=' + full.N);
  const prestiged = await page.evaluate(async snapSrc => {
    const T = window.__trains.state();
    T.last = Date.now();
    const rt0 = T.rt, pr0 = T.pr | 0;
    const b = document.querySelector('button[data-tr="prestige"]');
    if (!b || b.disabled) return { err: 'not ready', text: b && b.innerText, rt: T.rt, pr: T.pr };
    b.click();
    const T2 = window.__trains.state();
    let after = null;
    for (let k = 0; k < 30; k++) {
      await new Promise(r => requestAnimationFrame(r));
      after = eval(snapSrc);
      if (after && after.N) break;
    }
    return { rt0, pr0, rt1: T2.rt, pr1: T2.pr | 0, pop: T2.pop[0], open: T2.un.filter(Boolean).length, after };
  }, SNAP);
  assert.ok(!prestiged.err, JSON.stringify(prestiged));
  assert.strictEqual(prestiged.pr1, prestiged.pr0 + 1);
  assert.strictEqual(prestiged.pop, 1);
  assert.strictEqual(prestiged.open, 1);
  assert.ok(Math.abs((prestiged.rt0 - prestiged.rt1) - 20000000) < 8000, 'prestige RT delta ' + (prestiged.rt0 - prestiged.rt1));
  assert.ok(prestiged.after.N < 10, 'old full consist still boarding, N=' + prestiged.after.N);
  assert.strictEqual(prestiged.after.latched, 1);
  console.log('prestige', prestiged.pr0, '->', prestiged.pr1, 'N', full.N, '->', prestiged.after.N, 'spent', prestiged.rt0 - prestiged.rt1);

  await browser.close();
  server.close();
  console.log('browser checks ok', outDir);
})();
