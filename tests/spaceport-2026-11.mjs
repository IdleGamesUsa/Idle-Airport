// November 2026 Spaceport window.
// The shipped client (game-v37-trains.html) decides the phase in spDef()/spPh().
// GitHub Pages remote-config.json "spaceport" overrides SP_BUNDLED. No HTML edit:
// a changed game file would no longer match the signed version.json sha256.
// Run: node tests/spaceport-2026-11.mjs
import fs from 'fs';
import vm from 'vm';
import assert from 'assert';

const START = 1794830400000; // 2026-11-16 07:00 America/New_York (EST, UTC-5)
const END = 1795348800000; // 2026-11-22 07:00 EST, 6 days later
const CLAIM_END = 1795435200000; // 2026-11-23 07:00 EST, 24-hour claim window
const ID = 'spaceport-2026-11';

const root = fs.readFileSync(new URL('../game-v37-trains.html', import.meta.url), 'utf8');
const beta = fs.readFileSync(new URL('../beta/game-v37-trains.html', import.meta.url), 'utf8');
const rc = JSON.parse(fs.readFileSync(new URL('../remote-config.json', import.meta.url), 'utf8'));

assert.strictEqual(root, beta, 'root and beta game HTML must stay identical');
assert.ok(root.includes('window.__SP_EVENT_LIVE=true'), '__SP_EVENT_LIVE must stay true');
assert.ok(
  root.includes("const SP_BUNDLED={id:'spaceport-2026-10',start:'2026-10-26T19:00:00-04:00',end:'2026-11-01T19:00:00-05:00',claimHours:24}"),
  'bundled fallback stays the ended October window (remote-config overrides it)'
);
assert.ok(root.includes("id:'cargo-2026-10-10',type:'cargo'"), 'cargo bundled event must be unchanged');
assert.ok(!root.includes('spaceport-2026-11'), 'the new id is remote-config only, not baked into the OTA file');

assert.deepStrictEqual(rc.frames, {
  beta: { end: '2026-10-26T17:30:00-04:00' },
  week1: { end: '2026-10-26T17:30:00-04:00' }
}, 'commemorative frame windows stay as published');
assert.ok(!Object.prototype.hasOwnProperty.call(rc, 'events'), 'do not override cargo/income2x; those stay on api/cfg');
assert.deepStrictEqual(rc.spaceport, {
  id: ID,
  start: '2026-11-16T07:00:00-05:00',
  end: '2026-11-22T07:00:00-05:00',
  claimHours: 24
});
assert.strictEqual(Date.parse(rc.spaceport.start), START);
assert.strictEqual(Date.parse(rc.spaceport.end), END);
assert.strictEqual(Date.parse(rc.spaceport.end) + rc.spaceport.claimHours * 3600e3, CLAIM_END);
assert.strictEqual(END - START, 6 * 864e5);
assert.strictEqual(CLAIM_END - END, 864e5);

function extractFn(src, signature) {
  const at = src.indexOf(signature);
  if (at < 0) throw new Error('missing ' + signature);
  let i = src.indexOf('{', at), depth = 0;
  for (; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(at, i + 1);
    }
  }
  throw new Error('unclosed ' + signature);
}

const schedSrc = root.slice(
  root.indexOf('const EVENT_LIVE=!!window.__SP_EVENT_LIVE'),
  root.indexOf('const SW=400,TY=154')
);
const defSrc = extractFn(root, 'function def(){const d=spDef()');
const loadSrc = extractFn(root, 'function load(){const m=mainS()');
const ppSSrc = extractFn(root, 'function ppS(){');
const ppGrantSrc = extractFn(root, 'function ppGrant(kind,opt)');

function boot() {
  const store = new Map();
  const sandbox = {
    window: { __SP_EVENT_LIVE: true },
    localStorage: {
      getItem: (k) => (store.has(k) ? store.get(k) : null),
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: (k) => store.delete(k)
    },
    SCHED: {
      src: 'server',
      list: [{ id: 'cargo-2026-10-10', type: 'cargo', start: '2026-10-10T09:00:00-04:00', end: '2026-10-13T09:00:00-04:00', claimHours: 24 }]
    },
    PADS: Array.from({ length: 10 }, () => ({ open: 0 })),
    clock: 0,
    saveObj: null,
    console,
    Date,
    Math,
    JSON,
    Object,
    isFinite,
    parseInt,
    String,
    Number
  };
  sandbox.evNow = () => sandbox.clock;
  sandbox.mainS = () => sandbox.saveObj;
  sandbox.save = () => {};
  sandbox.PASS = { render() {} };
  sandbox.toast = () => {};
  vm.runInNewContext(
    `${schedSrc}\n${defSrc}\n${loadSrc}\nfunction ppMain(){return mainS()||{}}\n${ppSSrc}\n${ppGrantSrc}\n` +
      'this.api={spDef,spPh,spOk,spNorm,apply:window.__spRc,load,ppS,ppGrant,get ST(){return ST},BUNDLED:SP_BUNDLED};',
    sandbox
  );
  return sandbox;
}

function phaseAt(sandbox, now) {
  sandbox.clock = now;
  return { phase: sandbox.api.spPh(now), ok: sandbox.api.spOk(), def: sandbox.api.spDef() };
}

const live = boot();
live.api.apply(rc);
const before = phaseAt(live, START - 1);
assert.strictEqual(before.def.id, ID);
assert.strictEqual(before.def.start, START);
assert.strictEqual(before.def.end, END);
assert.strictEqual(before.def.claimEnd, CLAIM_END);
assert.strictEqual(before.def.src, 'remote-config');
// Before 7:00 AM ET Nov 16 the Spaceport cannot be entered. spPh() calls that
// "upcoming" (locked "Starts in" card). The string "closed" is only after claimEnd.
// With the shipped October fallback and no remote-config yet, the same instant is "closed".
assert.strictEqual(before.phase, 'upcoming', 'new window is not open before the start');
assert.strictEqual(before.ok, false, 'Spaceport stays locked before the start');
assert.notStrictEqual(before.phase, 'live');
assert.notStrictEqual(before.phase, 'claim');

assert.deepStrictEqual(phaseAt(live, START), { phase: 'live', ok: true, def: before.def });
assert.strictEqual(phaseAt(live, END - 1).phase, 'live');
assert.deepStrictEqual(
  ((s) => ({ phase: s.phase, ok: s.ok }))(phaseAt(live, END)),
  { phase: 'claim', ok: true }
);
assert.strictEqual(phaseAt(live, CLAIM_END - 1).phase, 'claim');
assert.deepStrictEqual(
  ((s) => ({ phase: s.phase, ok: s.ok }))(phaseAt(live, CLAIM_END)),
  { phase: 'closed', ok: false }
);
assert.strictEqual(phaseAt(live, Date.parse('2026-11-09T12:00:00-05:00')).phase, 'upcoming');

const bundled = boot();
bundled.SCHED.src = 'bundled';
bundled.SCHED.list = [
  { id: 'cargo-2026-10-10', type: 'cargo', start: '2026-10-10T09:00:00-04:00', end: '2026-10-13T09:00:00-04:00', claimHours: 24 },
  { id: 'spaceport-2026-10', type: 'spaceport', start: '2026-10-26T19:00:00-04:00', end: '2026-11-01T19:00:00-05:00', claimHours: 24 }
];
const bundledBefore = phaseAt(bundled, START - 1);
assert.strictEqual(bundledBefore.def.id, 'spaceport-2026-10');
assert.strictEqual(bundledBefore.def.src, 'bundled');
assert.strictEqual(bundledBefore.phase, 'closed', 'before remote-config, Nov 16 still reads as the ended October event');
assert.strictEqual(bundledBefore.ok, false);
assert.strictEqual(phaseAt(bundled, Date.parse('2026-11-09T07:00:00-05:00')).phase, 'closed');

// A non-bundled schedule entry outranks remote-config. api/cfg must keep omitting spaceport
// (normEvents already drops it) unless that entry IS spaceport-2026-11.
const override = boot();
override.api.apply(rc);
override.SCHED.src = 'server';
override.SCHED.list = [{ id: 'spaceport-2026-10', type: 'spaceport', start: '2026-10-26T19:00:00-04:00', end: '2026-11-01T19:00:00-05:00', claimHours: 24 }];
assert.strictEqual(phaseAt(override, START).def.id, 'spaceport-2026-10');
assert.strictEqual(phaseAt(override, START).phase, 'closed');

function pads() {
  return Array.from({ length: 10 }, (_, i) => ({ u: i === 0, ph: 'arrive', t: 0, bd: 0, trips: 0 }));
}

function freshSave(sp) {
  const box = boot();
  box.api.apply(rc);
  box.clock = START;
  box.saveObj = { sp, sph: [], spTok: ['old-play-token'], tickets: 0 };
  return box;
}

// Finalized October run: new event id gets a new colony and empty free + premium tracks.
const done = freshSave({
  v: 3, eid: 'spaceport-2026-10', colony: 8400, fin: 1, sel: 3,
  claimed: { 0: 1, 3: 1 },
  pass: { prem: 1, f: { 2: 1 }, p: { 1: 1 }, log: [['prem', 1]], tok: 'old-play-token' },
  pads: pads()
});
done.api.load();
const reset = done.api.ST;
assert.strictEqual(reset.eid, ID);
assert.strictEqual(reset.colony, 0);
assert.strictEqual(reset.fin, undefined);
assert.strictEqual(JSON.stringify(reset.claimed), '{}');
assert.strictEqual(reset.pass.prem, 0);
assert.strictEqual(JSON.stringify(reset.pass.f), '{}');
assert.strictEqual(JSON.stringify(reset.pass.p), '{}');
assert.strictEqual(JSON.stringify(done.saveObj.sph), JSON.stringify([{ id: 'spaceport-2026-10', colony: 8400 }]));
assert.strictEqual(done.api.ppGrant('prem', { token: 'old-play-token' }), true, 'old Play token is acknowledged');
assert.strictEqual(reset.pass.prem, 0, 'an earlier Space Pass purchase does not unlock the new event');
done.clock = START + 1000;
assert.strictEqual(done.api.ppGrant('prem', { token: 'new-play-token' }), true);
assert.strictEqual(reset.pass.prem, 1, 'a new purchase during the live window keys premium to this event only');

// Same id keeps the tracks (a reload mid-event is not a reset).
const mid = freshSave({
  v: 3, eid: ID, colony: 120, fin: 0, sel: 0, claimed: { 0: 1 },
  pass: { prem: 1, f: { 1: 1 }, p: {}, log: [] }, pads: pads()
});
mid.api.load();
assert.strictEqual(mid.api.ST.colony, 120);
assert.strictEqual(mid.api.ST.pass.prem, 1);
assert.strictEqual(mid.api.ST.pass.f[1], 1);
assert.strictEqual(mid.api.ST.claimed[0], 1);

// Shipped rule: an unfinished save adopts the new id and KEEPS colony and both tracks.
// spFinal() only runs while the phase is "closed", so a player who never opened the app
// after the October claim window will not have fin set once this remote-config is live.
const carried = freshSave({
  v: 3, eid: 'spaceport-2026-10', colony: 8400, sel: 0, claimed: { 0: 1 },
  pass: { prem: 1, f: {}, p: { 4: 1 }, log: [] }, pads: pads()
});
carried.api.load();
assert.strictEqual(carried.api.ST.eid, ID);
assert.strictEqual(carried.api.ST.colony, 8400, 'unfinalized October colony is kept by the shipped client');
assert.strictEqual(carried.api.ST.pass.prem, 1, 'unfinalized premium flag is kept by the shipped client');
assert.strictEqual(carried.api.ST.pass.p[4], 1);

// Server contract the deployed function must enforce. Source of api/ is not in this repo.
// Score posts are accepted only inside [start, claimEnd). Ranks and finalize must still
// recognize both ids so October rows and a post-end finalize keep working.
const SP_EVENTS = [
  { id: 'spaceport-2026-10', start: Date.parse('2026-10-26T19:00:00-04:00'), end: Date.parse('2026-11-01T19:00:00-05:00'), claimHours: 24 },
  { id: ID, start: START, end: END, claimHours: 24 }
];
function serverEvent(id) {
  return SP_EVENTS.find((e) => e.id === id) || null;
}
function serverPhase(id, now) {
  const e = serverEvent(id);
  if (!e) return 'rejected';
  const claimEnd = e.end + e.claimHours * 3600e3;
  if (now < e.start) return 'upcoming';
  if (now < e.end) return 'live';
  if (now < claimEnd) return 'claim';
  return 'closed';
}
function acceptScore(id, now) {
  const p = serverPhase(id, now);
  return p === 'live' || p === 'claim';
}
assert.strictEqual(acceptScore(ID, START - 1), false);
assert.strictEqual(acceptScore(ID, START), true);
assert.strictEqual(acceptScore(ID, END - 1), true);
assert.strictEqual(acceptScore(ID, END), true);
assert.strictEqual(acceptScore(ID, CLAIM_END - 1), true);
assert.strictEqual(acceptScore(ID, CLAIM_END), false);
assert.strictEqual(acceptScore('spaceport-2026-10', Date.parse('2026-10-26T19:00:00-04:00')), true);
assert.strictEqual(acceptScore('spaceport-2026-10', START), false);
assert.strictEqual(serverPhase('spaceport-2026-10', Date.parse('2026-11-01T19:00:00-05:00') + 24 * 3600e3 - 1), 'claim');
assert.strictEqual(serverEvent('spaceport-2099'), null);
assert.strictEqual(serverPhase('nope', START), 'rejected');
assert.ok(serverEvent('spaceport-2026-10') && serverEvent(ID), 'old and new windows both stay valid');

console.log('spaceport-2026-11 ok', {
  before: before.phase,
  atStart: 'live',
  atEnd: 'claim',
  atClaimEnd: 'closed',
  bundledBeforeStart: 'closed'
});
