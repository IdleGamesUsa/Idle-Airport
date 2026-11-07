// Train station purchases and Efficiency/Popularity levels use the Cargo pilot-score weights.
// Browser: TRAIN_SCORE_BROWSER=1 node tests/train-pilot-score.mjs
import fs from 'fs';
import assert from 'assert';
import { createRequire } from 'module';

const root = new URL('../game-v37-trains.html', import.meta.url);
const beta = new URL('../beta/game-v37-trains.html', import.meta.url);
const rootTxt = fs.readFileSync(root, 'utf8');
const betaTxt = fs.readFileSync(beta, 'utf8');
assert.strictEqual(rootTxt, betaTxt, 'root and beta game HTML diverged');
assert.ok(rootTxt.includes('const PSC_TR={area:500,plat:100,lv:40,lm:300,cyc:8000,prBase:2500,prStep:500}'));
assert.ok(rootTxt.includes('function scTrUpd()'));
assert.ok(rootTxt.includes('c.tr=tr'));
assert.ok(rootTxt.includes('Train: Train station 5'));
assert.ok(rootTxt.includes('try{window.__scUpd&&window.__scUpd()}catch(e){}'));
assert.ok(rootTxt.includes('function stFresh') && rootTxt.includes('STG.hold'));
assert.ok(!rootTxt.includes('if(STG.i===i)STG.cyc=-1'));
assert.ok(rootTxt.includes('function trCost(x){var y=x*prMul()'));
assert.ok(rootTxt.includes('function rkTrainRival'));
console.log('source checks ok');

const PSC = { area: 500, plat: 100, lv: 40, lm: 300, cyc: 8000, prBase: 2500, prStep: 500 };
function cyc(T) {
  if (!T || !T.unlocked) return 0;
  let p = PSC.area;
  for (let i = 0; i < 10; i++) {
    if (!T.un[i]) continue;
    if (i > 0) p += PSC.plat;
    const e = Math.max(1, Math.min(20, (T.bs[i] | 0) || 1));
    const q = Math.max(1, Math.min(20, (T.pop[i] | 0) || 1));
    p += (e - 1 + q - 1) * PSC.lv;
    if (e >= 20) p += PSC.lm;
    if (q >= 20) p += PSC.lm;
  }
  return p;
}
function bonus(pr) { let b = 0; for (let p = 1; p <= pr; p++) b += PSC.prBase + PSC.prStep * p; return b; }
const full = cyc({ unlocked: 1, un: Array(10).fill(1), bs: Array(10).fill(20), pop: Array(10).fill(20) });
assert.strictEqual(full, 22600, 'a maxed train cycle must match a maxed cargo cycle');
assert.strictEqual(bonus(1), 3000);
assert.strictEqual(PSC.cyc, 8000);
console.log('weights ok', { station: PSC.area, platform: PSC.plat, level: PSC.lv, maxed: PSC.lm, full, prestige1: bonus(1), migration: PSC.cyc });

if (process.env.TRAIN_SCORE_BROWSER === '1') await (async () => {
  const require = createRequire(import.meta.url);
  const puppeteer = require(process.env.PUPPETEER_CORE || '/tmp/pup/node_modules/puppeteer-core');
  const { createServer } = await import('http');
  const path = await import('path');
  const rootDir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
  const outDir = process.env.TRAIN_SCORE_OUT || '/tmp/train-score-evidence';
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
  const blank = { unlocked: 0, un: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], bs: Array(10).fill(1), pop: Array(10).fill(1), rt: 0, pax: 0, paxWk: 0, wk: '', last: Date.now(), boost: 0, pr: 0, sel: 0, ms: {} };
  async function boot(train, tag) {
    const page = await browser.newPage();
    page.on('pageerror', e => console.log('PAGEERROR', tag, e.stack || e.message));
    await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    await page.evaluateOnNewDocument(train => {
      window.__iaNetMock = async () => ({ ok: false, reason: 'offline' });
      if (sessionStorage.getItem('ia_keep')) return;
      localStorage.clear();
      localStorage.setItem('ia_trains_v1', JSON.stringify(train));
    }, train);
    await page.goto('http://127.0.0.1:' + port + '/game-v37-trains.html', { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForFunction(() => window.__game && window.__trains && window.__scUpd);
    await new Promise(r => setTimeout(r, 900));
    await page.evaluate(() => {
      document.querySelectorAll('button').forEach(b => { if (/^(Skip|Later|No thanks|Not now)$/.test((b.textContent || '').trim())) b.click(); });
      const pop = document.getElementById('popup'); if (pop) pop.classList.add('hide');
    });
    return page;
  }
  function snapSrc() {
    const S = window.__game.S;
    const sc = window.__scUpd();
    const c = S.scC;
    const rest = { bank: S.scBank | 0, hi: S.scHi | 0, cg: c.cg | 0, ms: c.ms | 0, rx: c.rx | 0, pr: c.pr | 0, gates: c.g | 0, ghe: c.ghe | 0 };
    return { sc, tr: c.tr | 0, shown: (Math.floor(sc) / 100).toFixed(1), trBank: S.scTrBank | 0, trHi: S.scTrHi | 0, trPr: S.scTrPr | 0, trV: S.scTrV | 0, rest, nonTrain: sc - (c.tr | 0) };
  }
  const log = [];
  const page = await boot(blank, 'live');
  const bought = await page.evaluate(() => {
    const S = window.__game.S;
    const before = window.__scUpd();
    const rest = () => ({ bank: S.scBank | 0, hi: S.scHi | 0, cg: S.scC.cg | 0, ms: S.scC.ms | 0, rx: S.scC.rx | 0, pr: S.scC.pr | 0 });
    const rest0 = rest();
    if (S.scC.tr !== 0) return { err: 'locked station scored ' + S.scC.tr };
    S.cash = 1e15;
    const cargo = window.__cargoBridge.ensure();
    cargo.cc = 1e15;
    window.__trains.open();
    const btn = document.querySelector('button[data-tr="unlock"]');
    if (!btn || btn.disabled) return { err: 'unlock button missing', disabled: !!(btn && btn.disabled), cash: S.cash, cc: cargo.cc };
    btn.click();
    const station = window.__scUpd();
    const station2 = window.__scUpd();
    const T = window.__trains.state();
    T.rt = 0;
    document.querySelector('button[data-trp="1"]').click();
    const denied = { un: T.un[1] | 0, sc: window.__scUpd(), tr: S.scC.tr | 0 };
    T.rt = 1e15;
    document.querySelector('button[data-trp="1"]').click();
    const plat = window.__scUpd();
    T.sel = 0;
    window.__game.setView('train');
    window.__trains.render();
    const rtE = T.rt;
    document.querySelector('button[data-tru="bs"]').click();
    const eff = window.__scUpd();
    const spentE = rtE - T.rt;
    const rtP = T.rt;
    document.querySelector('button[data-tru="pop"]').click();
    const popSc = window.__scUpd();
    const spentP = rtP - T.rt;
    window.__b3Bridge.openAdmin();
    const lb = document.getElementById('admLb');
    const you = (lb.innerText || '').split('\n').find(l => l.startsWith('you:')) || '';
    const note = lb.innerHTML.includes('Train station 5');
    const det = lb.querySelector('details'); if (det) det.open = true;
    return {
      before, station, station2, plat, eff, popSc, rest0, rest1: rest(),
      unlocked: T.unlocked | 0, un1: T.un[1] | 0, bs: T.bs[0] | 0, pop: T.pop[0] | 0,
      denied, spentE, spentP, you, note,
      tr: { station: 500, plat: S.scC.tr }
    };
  });
  if (bought.err) throw new Error(bought.err);
  assert.strictEqual(bought.unlocked, 1);
  assert.strictEqual(bought.station, bought.before + 500);
  assert.strictEqual(bought.station2, bought.station);
  assert.strictEqual(bought.denied.un, 0);
  assert.strictEqual(bought.denied.sc, bought.station);
  assert.strictEqual(bought.denied.tr, 500);
  assert.strictEqual(bought.un1, 1);
  assert.strictEqual(bought.plat, bought.station + 100);
  assert.strictEqual(bought.bs, 2);
  assert.ok(bought.spentE > 0);
  assert.strictEqual(bought.eff, bought.plat + 40);
  assert.strictEqual(bought.pop, 2);
  assert.ok(bought.spentP > 0);
  assert.strictEqual(bought.popSc, bought.eff + 40);
  assert.strictEqual(bought.tr.plat, 680);
  assert.deepStrictEqual(bought.rest1, bought.rest0, 'train purchases changed passenger or cargo score');
  assert.ok(bought.you.includes((bought.popSc / 100).toFixed(1)), bought.you);
  assert.strictEqual(bought.note, true);
  log.push(['locked', bought.before, 0, (bought.before / 100).toFixed(1)]);
  log.push(['station', bought.station, 500, (bought.station / 100).toFixed(1)]);
  log.push(['platform denied then bought', bought.denied.sc, bought.plat]);
  log.push(['efficiency', bought.eff, 'spent', bought.spentE]);
  log.push(['popularity', bought.popSc, 680, bought.you]);
  await page.evaluate(() => {
    document.querySelectorAll('#iaToast').forEach(n => n.remove());
    const det = document.querySelector('#admLb details');
    if (det) { det.open = true; det.scrollIntoView({ block: 'center' }); }
  });
  await page.screenshot({ path: path.join(outDir, 'score-after-popularity.png') });

  const broke = await page.evaluate(() => {
    const T = window.__trains.state();
    const rt = T.rt, tickets = window.__game.S.tickets | 0, popLv = T.pop[0], bs = T.bs[0];
    T.rt = 0;
    window.__game.S.tickets = 0;
    window.__game.setView('train');
    window.__trains.render();
    const before = window.__scUpd();
    document.querySelector('button[data-tru="pop"]').click();
    document.querySelector('button[data-tru="bs"]').click();
    const after = window.__scUpd();
    const lv = { pop: T.pop[0], bs: T.bs[0] };
    T.rt = rt;
    window.__game.S.tickets = tickets;
    return { before, after, lv, popLv, bs };
  });
  assert.strictEqual(broke.after, broke.before, 'an unaffordable click scored points');
  assert.strictEqual(broke.lv.pop, broke.popLv);
  assert.strictEqual(broke.lv.bs, broke.bs);
  log.push(['unaffordable click', broke.before, broke.after]);

  const closed = await page.evaluate(() => {
    const T = window.__trains.state();
    const before = window.__scUpd();
    T.bs[5] = 20;
    T.pop[5] = 20;
    const after = window.__scUpd();
    T.bs[5] = 1;
    T.pop[5] = 1;
    return { before, after, un: T.un[5] | 0 };
  });
  assert.strictEqual(closed.un, 0);
  assert.strictEqual(closed.after, closed.before, 'a closed platform scored its levels');
  log.push(['closed platform levels', closed.before, closed.after]);

  const restored = await page.evaluate(snapSrc);
  assert.strictEqual(restored.tr, 680);
  assert.strictEqual(restored.nonTrain, bought.before, 'train purchases changed the non-train score');

  await page.evaluate(() => { sessionStorage.setItem('ia_keep', '1'); window.__game.save(); window.__trains.render(); });
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__scUpd && window.__trains);
  await new Promise(r => setTimeout(r, 900));
  const reloaded = await page.evaluate(() => {
    const a = window.__scUpd();
    const b = window.__scUpd();
    const S = window.__game.S;
    return { a, b, tr: S.scC.tr, bank: S.scTrBank, hi: S.scTrHi, v: S.scTrV, pop: window.__trains.state().pop[0], bs: window.__trains.state().bs[0], un: window.__trains.state().un[1] };
  });
  assert.strictEqual(reloaded.a, restored.sc);
  assert.strictEqual(reloaded.b, restored.sc, 'reload scored the same upgrades again');
  assert.strictEqual(reloaded.tr, 680);
  assert.strictEqual(reloaded.pop, 2);
  assert.strictEqual(reloaded.bs, 2);
  assert.strictEqual(reloaded.un, 1);
  log.push(['reload', reloaded.a, reloaded.tr]);
  await page.close();

  const oldTrain = {
    unlocked: 1, un: [1, 1, 0, 0, 0, 0, 0, 0, 0, 0],
    bs: [5, 1, 1, 1, 1, 1, 1, 1, 1, 1], pop: [1, 3, 1, 1, 1, 1, 1, 1, 1, 1],
    rt: 5000, pax: 100, paxWk: 0, wk: '', last: Date.now(), boost: 0, pr: 1, sel: 0, ms: { a: 1 }
  };
  const expectHi = cyc(oldTrain);
  const oldPage = await boot(oldTrain, 'old');
  const migrated = await oldPage.evaluate(() => {
    const S = window.__game.S;
    const a = window.__scUpd();
    const b = window.__scUpd();
    S.scTrV = 0;
    const remigrate = window.__scUpd();
    const c = window.__scUpd();
    return { a, b, remigrate, c, bank: S.scTrBank, hi: S.scTrHi, pr: S.scTrPr, v: S.scTrV, tr: S.scC.tr };
  });
  assert.strictEqual(migrated.bank, 8000, 'a finished prestige was rebuilt as a full ladder');
  assert.strictEqual(migrated.hi, expectHi);
  assert.strictEqual(migrated.tr, 8000 + expectHi + 3000);
  assert.strictEqual(migrated.b, migrated.a);
  assert.strictEqual(migrated.remigrate, migrated.a, 'clearing the migration flag and scoring again double-credited');
  assert.strictEqual(migrated.c, migrated.a);
  log.push(['old save pr1', migrated.a, migrated.tr, 'hi', expectHi, 'bank', 8000]);
  await oldPage.close();

  const maxTrain = {
    unlocked: 1, un: Array(10).fill(1), bs: Array(10).fill(20), pop: Array(10).fill(20),
    rt: 2e7, pax: 0, paxWk: 0, wk: '', last: Date.now(), boost: 0, pr: 0, sel: 0, ms: {}
  };
  const prPage = await boot(maxTrain, 'prestige');
  const prestiged = await prPage.evaluate(() => {
    const T = window.__trains.state();
    const S = window.__game.S;
    const non = () => window.__scUpd() - (S.scC.tr | 0);
    T.un[9] = 0;
    window.__game.setView('train');
    window.__trains.render();
    const held = window.__scUpd();
    const heldPr = T.pr | 0;
    const blocked = document.querySelector('button[data-tr="prestige"]');
    if (blocked) blocked.click();
    const prBlocked = T.pr | 0;
    const still = window.__scUpd();
    T.un[9] = 1;
    T.last = Date.now();
    window.__trains.render();
    const before = window.__scUpd();
    const non0 = before - (S.scC.tr | 0);
    const btn = document.querySelector('button[data-tr="prestige"]');
    const rt0 = T.rt;
    if (btn) btn.click();
    const after = window.__scUpd();
    const again = window.__scUpd();
    return {
      held, still, heldPr, prAfterBlock: prBlocked, blocked: !!(blocked && blocked.disabled),
      before, after, again, non0, non1: non(), pr: T.pr | 0, spent: rt0 - T.rt,
      un: T.un.slice(), pop: T.pop[0] | 0, bs: T.bs[0] | 0,
      bank: S.scTrBank | 0, hi: S.scTrHi | 0, tr: S.scC.tr | 0,
      enabled: !!(btn && !btn.disabled)
    };
  });
  assert.strictEqual(prestiged.heldPr, 0);
  assert.strictEqual(prestiged.prAfterBlock, 0, 'a checklist that is not finished prestiged anyway');
  assert.strictEqual(prestiged.still, prestiged.held);
  assert.strictEqual(prestiged.enabled, true);
  assert.strictEqual(prestiged.pr, 1);
  assert.strictEqual(prestiged.before - prestiged.non0, 22600);
  assert.strictEqual(prestiged.bank, 22600);
  assert.strictEqual(prestiged.hi, 500);
  assert.strictEqual(prestiged.tr, 22600 + 500 + 3000);
  assert.strictEqual(prestiged.after, prestiged.before + 500 + 3000);
  assert.strictEqual(prestiged.again, prestiged.after, 'prestige scored twice');
  assert.strictEqual(prestiged.non1, prestiged.non0, 'train prestige changed the passenger or cargo score');
  assert.ok(prestiged.spent <= 20000000 && prestiged.spent > 20000000 - 100000, 'spent ' + prestiged.spent);
  assert.strictEqual(prestiged.pop, 1);
  assert.strictEqual(prestiged.bs, 1);
  assert.strictEqual(prestiged.un[1], 0);
  log.push(['prestige blocked', prestiged.held, prestiged.still]);
  log.push(['prestige', prestiged.before, '->', prestiged.after, 'spent', prestiged.spent, 'bank', prestiged.bank]);
  await prPage.evaluate(() => document.querySelectorAll('#iaToast').forEach(n => n.remove()));
  await prPage.screenshot({ path: path.join(outDir, 'score-after-prestige.png') });
  await prPage.close();

  const capTrain = {
    unlocked: 1, un: [1, 0, 0, 0, 0, 0, 0, 0, 0, 0], bs: Array(10).fill(1), pop: Array(10).fill(1),
    rt: 1e15, pax: 0, paxWk: 0, wk: '', last: Date.now(), boost: 0, pr: 0, sel: 0, ms: {}
  };
  capTrain.bs[0] = 19;
  capTrain.pop[0] = 19;
  const capPage = await boot(capTrain, 'cap');
  const capped = await capPage.evaluate(() => {
    const T = window.__trains.state();
    window.__game.setView('train');
    window.__trains.render();
    const before = window.__scUpd();
    document.querySelector('button[data-tru="bs"]').click();
    document.querySelector('button[data-tru="pop"]').click();
    const mid = window.__scUpd();
    const again = window.__scUpd();
    document.querySelector('button[data-tru="bs"]').click();
    document.querySelector('button[data-tru="pop"]').click();
    const after = window.__scUpd();
    return { before, mid, again, after, bs: T.bs[0], pop: T.pop[0], tr: window.__game.S.scC.tr };
  });
  assert.strictEqual(capped.bs, 20);
  assert.strictEqual(capped.pop, 20);
  assert.strictEqual(capped.mid, capped.before + 40 + 300 + 40 + 300);
  assert.strictEqual(capped.again, capped.mid);
  assert.strictEqual(capped.after, capped.mid, 'a level-20 click scored more points');
  log.push(['level 19 to 20', capped.before, '->', capped.mid, 'extra click', capped.after]);
  await capPage.close();
  await browser.close();
  server.close();
  console.log(JSON.stringify(log, null, 2));
})();
