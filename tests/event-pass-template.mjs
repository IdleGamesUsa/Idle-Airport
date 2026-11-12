// Event Pass template (Nov 2026 Space Pass redesign). Michael Nov 12 2026: "Use this pass format for all future events as well. Just fill in the new prizes."
// Runs the REAL pass data + pass logic blocks of game-v37-trains.html in a sandbox (stubs for the game around them) and checks:
//  - every registered event's data is valid (30 tiers, items/skins exist, preview + showcase), November totals match the approved table
//  - claims grant once, already-owned prizes pay cash, premium unlocks every reached tier (Claim all) exactly once, per-event product ids
//  - event-only and permanent income rewards, shuttle skins (Celestial Gold, Aurora legacy), October saves keep the October table
//  - a SECOND (dummy) event supplied only as data renders and grants correctly
// Run: node tests/event-pass-template.mjs
import fs from 'fs';
import vm from 'vm';
import assert from 'assert';

const J = (x) => (x === undefined ? x : JSON.parse(JSON.stringify(x)));
const deq = (a, b, m) => assert.deepStrictEqual(J(a), J(b), m); // values from the vm sandbox live in another realm

const root = fs.readFileSync(new URL('../game-v37-trains.html', import.meta.url), 'utf8');
const beta = fs.readFileSync(new URL('../beta/game-v37-trains.html', import.meta.url), 'utf8');
assert.strictEqual(root, beta, 'root and beta game HTML must stay identical');
const cut = (a, b) => { const i = root.indexOf(a), j = root.indexOf(b, i); assert.ok(i >= 0 && j > i, 'missing block ' + a); return root.slice(i, j + b.length); };
const dataSrc = cut('/* ===== EVENT PASS DATA', '/* ===== /EVENT PASS DATA ===== */');
const logicSrc = cut('/* ---------- EVENT PASS (template', '/* ===== /EVENT PASS LOGIC ===== */');
const incSrc = ['const spPermAdd=', 'const spEvAdd=', 'const spWins='].map((k) => { const i = root.indexOf(k); assert.ok(i >= 0, k); return root.slice(i, root.indexOf('\n', i)); }).join('\n');

// wiring of the income rewards into the main game (source checks; the browser screenshots exercise them for real)
assert.ok(root.includes("const globalMult=()=>1+MS_BONUS*msCount()+(S.iap?payAdd(2):0)+spPermAdd();"), 'permanent Space Pass income is part of the permanent pay bonus');
assert.ok(root.includes("+(ev2xMult()>1?payAdd(ev2xMult()):0)+spEvAdd();"), 'event Space Pass income is a temporary pay bonus');
assert.ok(root.includes("if(spPermAdd()>0)o.push(['spp',spPermAdd()]);if(spEvAdd()>0)o.push(['spe',spEvAdd()]);"), 'pay breakdown lists both');
assert.ok(root.includes('.concat(rxWins(),spWins()),globalMult())'), 'offline earnings count the event bonus until it ends');
assert.ok(root.includes("S.spPerm=Math.max(0,Math.min(1,+S.spPerm||0));"), 'save sanitiser clamps the permanent bonus');
assert.ok(root.includes("spe:'🚀 Space Pass event bonus'"), 'pay label');
assert.ok(root.includes("const SPN=FR.push({name:'Supernova'") && root.includes('return{M,TOT,FR,addChamp,SPN,CGF_BASE,'), 'animated Supernova frame registered last in PF.FR');
assert.ok(root.includes("if(fr.sf==='comet'){"), 'Comet Tail frame renderer');
assert.ok(root.includes("if(Lv.gold){c.save();c.globalCompositeOperation='multiply'"), 'Celestial Gold tint on the real shuttle renderer');
assert.ok(root.includes("+(liv?'|'+(liv.sk||'au'):'')"), 'shuttle cache key per skin');
for (const id of ['sp_passHero', 'sp_passVal', 'sp_passSkin', 'sp_passShow', 'sp_passSticky', 'sp_tiersList', 'sp_passHead', 'sp_passBar', 'sp_passFoot', 'sp_passTab'])
  assert.ok(root.includes('id="' + id + '"'), 'pass screen element ' + id);
{ const S = { spPerm: 0.05, spInc: { add: 0.2, end: Date.now() + 3600e3 } }; const b = { S, Date, Math, isFinite, PAY_FULL: 1 }; vm.runInNewContext(incSrc + '\nthis.r=[spPermAdd(),spEvAdd(),spWins()];', b);
  deq(b.r.slice(0, 2), [0.05, 0.2]); assert.strictEqual(b.r[2][0][1], 0.2);
  S.spInc.end = Date.now() - 1; S.spPerm = 9; vm.runInNewContext('this.r=[spPermAdd(),spEvAdd()];', b); deq(b.r, [1, 0], 'event bonus stops at its end; permanent is capped'); }

const LEGACY = ['cap_mooncap', 'gl_mission', 'cap_astro', 'frm_starfield', 'ttl_moonwalker', 'cap_icehood', 'gl_deepblue', 'ttl_kdreamer', 'ttl_founder', 'cap_goldmoon',
  'ttl_spcrew', 'cap_patch', 'frm_nebula', 'out_reddust', 'gl_ion', 'ttl_navigator', 'cap_comet', 'frm_orbit', 'ttl_commander'];
const START = Date.parse('2026-11-16T07:00:00-05:00'), END = Date.parse('2026-11-22T07:00:00-05:00');

function boot(o = {}) {
  const ITEMS = LEGACY.map((id) => ({ id, slot: id.startsWith('ttl') ? 'title' : id.startsWith('frm') ? 'frame' : id.startsWith('gl') ? 'glasses' : id.startsWith('out') ? 'outfit' : 'cap', name: id, r: 2 }));
  const IT = {}; ITEMS.forEach((x) => (IT[x.id] = x));
  const els = {}; const el = (id) => (els[id] = els[id] || { id, innerHTML: '', textContent: '', style: { props: {}, setProperty(k, v) { this.props[k] = v; } } });
  const sb = {
    console, Date, Math, JSON, Object, String, Number, Array, isFinite, parseInt, Promise,
    window: { _ui: false }, document: { createElement() { throw new Error('no canvas in node'); } },
    ITEMS, IT, PF: { SPN: 99 }, owned: new Set(o.owned || []), toasts: [], clock: o.now || START + 3600e3,
    ev: { id: o.eid || 'spaceport-2026-11', start: o.start || START, end: o.end || END }, phase: o.phase || 'live',
    m: { cash: 0, life: 0, tickets: 0 }, CACHE: {}, PADS: Array.from({ length: 10 }, () => ({ ship: 'x' })),
    TPRIZE: LEGACY.slice(0, 10), $s: el, els
  };
  sb.ST = o.ST || { eid: sb.ev.id, start: sb.ev.start, colony: o.colony == null ? 26000 : o.colony, claimed: {}, pass: null };
  Object.assign(sb, {
    spDef: () => sb.ev, spPh: () => sb.phase, spNow: () => sb.clock, mainS: () => sb.m, save() {}, load() {}, pilotPersist() {}, toast: (t) => sb.toasts.push(t),
    spGrant: (ids) => ids.filter((id) => !sb.owned.has(id) && sb.owned.add(id)), pName: (id) => (IT[id] ? IT[id].name : id),
    evRewardCash: (min) => min * 60 * 10, money: (v) => '$' + Math.round(v), addBoostSecs: (s) => { sb.m.boostSecs = (sb.m.boostSecs || 0) + s; },
    itemThumb: (x) => '<i data-thumb="' + x.id + '"></i>', rarCol: () => '#fff', nf: (n) => String(Math.floor(n)), shipGeo: () => ({ L: 1, R: 1, def: { liv: { a: '#000', b: '#111', reg: 'X' } } }), drawShipTop() {}
  });
  vm.runInNewContext(dataSrc + '\n' + (o.extra || '') + '\n' + logicSrc + '\nthis.api={ppEv,ppS,ppClaim,ppClaimAll,ppGrant,ppRevoke,ppProd,ppGive,ppSum,ppTier,ppFreeDone,ppSkinOn,ppSkinSet,ppSkinLiv,PASS,SPP,PASS_EVENTS,PASS_SKINS,PASS_TH,get last(){return ppLast}};', sb);
  return sb;
}

// ---------- 1. data validity for every registered event ----------
{
  const sb = boot(); const { PASS_EVENTS, PASS_SKINS, PASS_TH } = sb.api;
  deq(Object.keys(PASS_EVENTS), ['spaceport-2026-10', 'spaceport-2026-11']);
  assert.strictEqual(PASS_TH.length, 30);
  deq(PASS_TH.slice(0, 3).concat(PASS_TH.slice(-3)), [16, 40, 70, 20000, 23000, 26000], 'colonist thresholds unchanged');
  for (const E of Object.values(PASS_EVENTS)) {
    assert.strictEqual(E.F.length, 30, E.id + ' free tiers'); assert.strictEqual(E.P.length, 30, E.id + ' premium tiers');
    for (const r of E.F.concat(E.P)) if (r) {
      for (const k of Object.keys(r)) assert.ok(['leg', 'it', 'it2', 'tk', 'min', 'boost', 'inc', 'perm', 'skin', 'alt'].includes(k), E.id + ' unknown reward field ' + k);
      for (const id of [r.it, r.it2]) if (id) assert.ok(sb.IT[id], E.id + ' item exists: ' + id);
      if (r.skin) assert.ok(PASS_SKINS[r.skin], E.id + ' skin exists: ' + r.skin);
    }
    deq(E.F.map((r, i) => (r && r.leg != null ? [i, r.leg] : null)).filter(Boolean), [[0, 0], [3, 1], [6, 2], [9, 3], [11, 4], [14, 5], [17, 6], [20, 7], [23, 8], [27, 9]], E.id + ': the 10 original prizes keep their tiers');
    assert.ok(E.P.every((r) => !r || r.leg == null), 'original prizes are free-track only');
    assert.strictEqual((E.preview || []).length, 3, E.id + ' top-3 preview'); assert.ok(E.show && E.show.tier >= 1 && E.show.tier <= 30, E.id + ' showcase');
  }
  const N = PASS_EVENTS['spaceport-2026-11'];
  const f = sb.api.ppSum(N.F), p = sb.api.ppSum(N.P);
  deq([f.min, f.inc, f.perm, f.tk, f.boost, f.glam, f.newg], [765, 20, 5, 30, 30, 13, 3], 'November free totals');
  deq([p.min, p.inc, p.perm, p.tk, p.boost, p.glam], [1390, 60, 15, 25, 0, 15], 'November premium totals');
  deq(N.P[29], { skin: 'celestial', it: 'ttl_splegend' }, 'tier 30 premium = Celestial Gold Shuttle + Spaceport Legend');
  assert.ok(PASS_SKINS.celestial.gold && PASS_SKINS.nebula && PASS_SKINS.aurora);
  assert.strictEqual(sb.IT.frm_supernova.an, 99, 'Supernova frame uses the animated PF frame index');
  for (const id of ['ttl_novacrew', 'out_starlight', 'cap_neonpatch', 'cap_halo', 'frm_comet', 'gl_solar', 'gl_neon', 'out_cmdgold', 'cap_starhood', 'ttl_gtycoon', 'out_flightcrew', 'frm_supernova', 'ttl_splegend', 'cap_silvermoon', 'out_mctrl', 'ttl_spgrad'])
    assert.ok(sb.IT[id] && sb.IT[id].sp === 1 && sb.ITEMS.some((x) => x.id === id), 'registered new item ' + id);
  assert.strictEqual(sb.api.ppEv().id, 'spaceport-2026-11'); assert.strictEqual(sb.api.ppProd(), 'sp_pass_premium_2026_11', 'Premium product for November unchanged');
}

// ---------- 2. free claims, already-owned fallback, no double grant ----------
{
  const sb = boot({ colony: 700, owned: ['cap_mooncap'] }); const A = sb.api;
  assert.strictEqual(A.ppTier(), 9);
  assert.strictEqual(A.ppClaim('f', 0), true); assert.strictEqual(sb.ST.claimed[0], 1);
  assert.strictEqual(sb.m.cash, 30 * 600, 'already-owned Moon Cap pays 30 min of income as cash'); assert.match(A.last[0], /already owned/);
  assert.strictEqual(A.ppClaim('f', 0), false, 'no second claim');
  assert.strictEqual(A.ppClaim('f', 9), false, 'tier 10 not reached');
  assert.strictEqual(A.ppClaim('p', 0), false, 'premium locked without the pass');
  assert.strictEqual(A.ppClaim('f', 5), true); assert.ok(sb.owned.has('cap_silvermoon'));
  assert.strictEqual(A.ppClaim('f', 2), true); deq([sb.m.spInc.add, sb.m.spInc.end, sb.m.spInc.eid], [0.1, END, 'spaceport-2026-11'], 'event income until the event end');
  assert.strictEqual(A.ppClaim('f', 8), true); assert.strictEqual(sb.m.spPerm, 0.02, '+2% forever');
}

// ---------- 3. premium bought late: every reached tier unlocks, Claim all grants each exactly once ----------
{
  const sb = boot({ colony: 26000 }); const A = sb.api;
  assert.strictEqual(A.ppGrant('prem', { token: 'nov-token-xxxxxxxxxxxxxxxxxxxx', pid: 'sp_pass_premium_2026_12' }), true);
  assert.strictEqual(A.ppS().prem, 0, 'another event product never unlocks November');
  assert.strictEqual(A.ppGrant('prem', { token: 'nov-token-yyyyyyyyyyyyyyyyyyyy', pid: 'sp_pass_premium_2026_11' }), true);
  assert.strictEqual(A.ppS().prem, 1);
  const n = A.ppClaimAll(); assert.strictEqual(n, 60, 'all 30 free + 30 premium tiers claimed');
  assert.strictEqual(A.ppClaimAll(), 0, 'nothing twice'); assert.strictEqual(A.ppGrant('prem', { token: 'nov-token-yyyyyyyyyyyyyyyyyyyy', restore: true }), true); assert.strictEqual(A.ppClaimAll(), 0, 'restore re-grant gives nothing more');
  const N = A.PASS_EVENTS['spaceport-2026-11'], s = (L) => A.ppSum(L);
  assert.strictEqual(sb.m.tickets, 240 + s(N.F).tk + s(N.P).tk, 'the stray December payment above was paid out as the existing 240-ticket fallback'); assert.strictEqual(sb.m.cash, (s(N.F).min + s(N.P).min) * 600);
  assert.strictEqual(sb.m.spPerm, 0.2, 'free +5% and premium +15% = +20% forever'); assert.strictEqual(sb.m.spInc.add, 0.8, '+80% until the event ends');
  assert.strictEqual(sb.m.boostSecs, 30 * 60);
  for (const id of ['ttl_splegend', 'frm_supernova', 'out_cmdgold', 'ttl_spgrad']) assert.ok(sb.owned.has(id), id);
  deq(sb.m.spSkins, { nebula: 1, celestial: 1 }); assert.strictEqual(A.ppSkinOn(), 'celestial', 'newest skin goes on');
  const liv = A.ppSkinLiv('x'); assert.ok(liv.gold && liv.sk === 'celestial' && liv.reg === 'X', 'gold livery keeps the ship registration');
  assert.strictEqual(A.ppSkinSet('none'), true); assert.strictEqual(A.ppSkinLiv('x'), null); assert.strictEqual(A.ppSkinSet('aurora'), false, 'cannot wear an unowned skin');
  assert.strictEqual(A.ppRevoke('sp_pass_premium_2026_11'), true); assert.strictEqual(A.ppS().prem, 0, 'refund removes premium');
}

// ---------- 4. income reward claimed after the event ended -> cash; spFinal-style auto claim uses the right track ----------
{
  const sb = boot({ colony: 100, phase: 'claim', now: END + 3600e3 }); const A = sb.api;
  assert.strictEqual(A.ppClaim('f', 2), true); assert.strictEqual(sb.m.spInc, undefined); assert.strictEqual(sb.m.cash, 30 * 600, '+10% event income after the end = 30 min of cash');
  assert.strictEqual(A.ppGrant('prem', { token: 'late-token-xxxxxxxxxxxxxxxxx', pid: 'sp_pass_premium_2026_11' }), true); assert.strictEqual(A.ppS().prem, 1, 'a Play payment delivered during the claim window still unlocks Premium (existing rule, unchanged)');
}

// ---------- 5. October saves: carried claims are dropped only before the event opens; October table kept for October ----------
{
  const before = boot({ now: START - 3600e3, phase: 'upcoming', ST: { eid: 'spaceport-2026-11', start: START, colony: 8400, claimed: { 0: 1 }, pass: { prem: 0, eid: 'spaceport-2026-11', f: { 1: 1, 2: 1 }, p: {}, log: [] } } });
  const p = before.api.ppS(); deq([p.f, p.tv], [{}, 'sp-2026-11.1'], 'October free-claim flags cleared before the November start');
  assert.strictEqual(before.ST.claimed[0], 1, 'original-prize claims (already owned items) are kept');
  const after = boot({ now: START + 3600e3, ST: { eid: 'spaceport-2026-11', start: START, colony: 800, claimed: {}, pass: { prem: 1, eid: 'spaceport-2026-11', f: { 1: 1 }, p: { 0: 1 }, log: [['prem', START + 10]] } } });
  const q = after.api.ppS(); deq([q.f, q.p, q.tv], [{ 1: 1 }, { 0: 1 }, 'sp-2026-11.1'], 'claims made during the event are never reset (no double grant)');
  assert.strictEqual(after.api.ppClaim('f', 1), false); assert.strictEqual(after.api.ppClaim('p', 0), false);
  const oct = boot({ eid: 'spaceport-2026-10', phase: 'closed', start: Date.parse('2026-10-26T19:00:00-04:00'), end: Date.parse('2026-11-01T19:00:00-05:00') });
  assert.strictEqual(oct.api.ppEv().id, 'spaceport-2026-10'); deq(oct.api.SPP.P[23], { skin: 'aurora' }); assert.strictEqual(oct.api.ppProd(), 'sp_pass_premium');
  oct.m.spSkin = { own: 1, on: 1 }; assert.strictEqual(oct.api.ppSkinOn(), 'aurora', 'October Aurora Livery still worn');
}

// ---------- 6. a SECOND event supplied only as data ----------
const DUMMY = `passEvent({id:'spaceport-2027-01',ver:'sp-2027-01.1',name:'Frost Pass',
 theme:{accent:'#9fe8ff',accent2:'#3a86ff',hero:['#0b3a7a','#0a2350','#05101f'],lane:'#3a86ff',laneBg:['#0f2a5a','#081830']},alt:{f:20,p:40},
 items:[{id:'ttl_frostking',slot:'title',name:'Frost King',r:3,src:'Frost Pass'},{id:'out_snowsuit',slot:'outfit',name:'Snow Suit',r:2,kind:'jacket',col:'#ffffff',lap:'#cfe9ff',trim:'#3a86ff',src:'Frost Pass'}],
 skins:{icecore:{name:'Ice Core Shuttle',a:'#9fe8ff',b:'#ffffff',sub:'Frozen livery'}},
 F:Array.from({length:30},(_,i)=>[0,3,6,9,11,14,17,20,23,27].indexOf(i)>=0?{leg:[0,3,6,9,11,14,17,20,23,27].indexOf(i)}:{min:10+i}),
 P:Array.from({length:30},(_,i)=>i===29?{skin:'icecore',it:'ttl_frostking'}:i===14?{it:'out_snowsuit'}:i%5===0?{perm:1}:{min:20+i}),
 preview:[{tier:30,big:1},{tier:15},{sum:'perm'}],show:{tier:30,title:'Ice Core Shuttle',text:'+ Frost King title'}});`;
{
  const sb = boot({ eid: 'spaceport-2027-01', start: Date.parse('2027-01-11T07:00:00-05:00'), end: Date.parse('2027-01-17T07:00:00-05:00'), now: Date.parse('2027-01-12T07:00:00-05:00'), colony: 3000, extra: DUMMY });
  const A = sb.api;
  assert.strictEqual(A.ppEv().id, 'spaceport-2027-01'); assert.strictEqual(A.ppEv().name, 'Frost Pass');
  assert.strictEqual(A.ppProd(), 'sp_pass_premium_2027_01', 'product id follows the event id');
  assert.ok(sb.IT.ttl_frostking && sb.IT.out_snowsuit && A.PASS_SKINS.icecore, 'dummy items + skin registered from data');
  A.PASS.render();
  const h = sb.els.sp_passHero.innerHTML, t = sb.els.sp_tiersList.innerHTML, sh = sb.els.sp_passShow.innerHTML;
  assert.match(h, /Frost Pass <em>Premium<\/em>/); assert.strictEqual((h.match(/class="epSc/g) || []).length, 3, '3 preview pictures');
  assert.match(h, /Ice Core Shuttle/); assert.match(h, /Snow Suit/); assert.match(h, /\+6% income/); assert.match(h, /data-spbuy="prem"/);
  assert.strictEqual((t.match(/class="epRow/g) || []).length, 30, '30 two-lane rows');
  assert.strictEqual((t.match(/class="epLock"/g) || []).length, 30, 'every premium reward visible with a padlock for a free player');
  assert.match(sh, /Ice Core Shuttle/); assert.match(sh, /Premium only/);
  assert.strictEqual(sb.els.sp_passCard.style.props['--epA'], '#9fe8ff', 'theme colours from data');
  assert.match(sb.els.sp_passTab.textContent, /^Pass \(\d+\)$/);
  assert.strictEqual(A.ppGrant('prem', { token: 'nov-token-zzzzzzzzzzzzzzzzzzzz', pid: 'sp_pass_premium_2026_11' }), true); assert.strictEqual(A.ppS().prem, 0, 'a November pass never unlocks January');
  assert.strictEqual(A.ppGrant('prem', { token: 'jan-token-qqqqqqqqqqqqqqqqqqqq', pid: 'sp_pass_premium_2027_01' }), true); assert.strictEqual(A.ppS().prem, 1);
  sb.ST.colony = 26000; assert.strictEqual(A.ppClaimAll(), 60);
  assert.ok(sb.owned.has('ttl_frostking') && sb.owned.has('out_snowsuit') && sb.owned.has('cap_goldmoon'));
  assert.strictEqual(sb.m.spPerm, 0.06); assert.strictEqual(A.ppSkinOn(), 'icecore');
  A.PASS.render(); assert.strictEqual((sb.els.sp_tiersList.innerHTML.match(/class="epLock"/g) || []).length, 0, 'no padlocks with premium');
  assert.match(sb.els.sp_passSkin.innerHTML, /Ice Core Shuttle/, 'skin picker lists the new skin');
}

// ---------- 7. November render for a free player at tier 7 ----------
{
  const sb = boot({ colony: 392 }); sb.api.PASS.render(); const h = sb.els.sp_passHero.innerHTML, t = sb.els.sp_tiersList.innerHTML;
  assert.match(h, /PREMIUM PREVIEW/); assert.match(h, /Celestial Gold Shuttle/); assert.match(h, /Supernova Frame/); assert.match(h, /\+15% income/);
  assert.match(h, /\$9\.99/); assert.strictEqual((t.match(/data-spclaim=|data-spfree=/g) || []).length, 7, '7 free claims reachable');
  assert.match(sb.els.sp_passSticky.innerHTML, /7 rewards waiting/);
  assert.match(sb.els.sp_passVal.innerHTML, /12\.8 h of cash/); assert.match(sb.els.sp_passVal.innerHTML, /\+15% income forever/);
}
console.log('event-pass-template ok');
