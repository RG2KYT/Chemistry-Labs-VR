// Solid / liquid / gas, portable freezer, matches and carrying a loaded test-tube rack.
// Usage: npm run build && npx vite preview --port 4173 &  then  node tests/run-states-tests.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { launch, openLab, step } from './browser.mjs';

const OUT = 'test-results';
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2] || '';

const browser = await launch();
const { page, errors } = await openLab(browser, '?desktop', { width: 1100, height: 700 });
// Relay PubChem requests through Node's fetch (which trusts this machine's CA setup, e.g.
// behind a TLS-inspecting proxy that headless Chromium does not know about).
await page.route('https://pubchem.ncbi.nlm.nih.gov/**', async (route) => {
  try {
    const res = await fetch(route.request().url());
    await route.fulfill({ status: res.status, headers: { 'content-type': res.headers.get('content-type') || 'application/json', 'access-control-allow-origin': '*' }, body: Buffer.from(await res.arrayBuffer()) });
  } catch {
    await route.abort();
  }
});
let passed = 0;

async function test(name, fn) {
  if (only && !name.includes(only)) return;
  const t0 = Date.now();
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    console.log(`  ✗ ${name}`);
    await page.screenshot({ path: `${OUT}/FAIL-${name.replace(/\W+/g, '_')}.png` }).catch(() => {});
    console.log(errors.join('\n'));
    throw e;
  }
}

const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const view = (pos, at) => page.evaluate(({ pos, at }) => {
  const app = window.lab;
  app.rig.position.set(0, 0, 0);
  app.camera.position.set(...pos);
  app.camera.lookAt(new THREE_V(...at));
}, { pos, at });

await page.evaluate(() => { window.lab.input.desktop.enabled = false; window.lab.input.desktop.hand.active = true; window.lab.input.desktop.hand.resetMotion(); });
await step(page, 0.1); // fixes the simulation step at 1/60 s for the inline loops below

await test('synthesizer form selector: water as ice, liquid nitrogen, steam', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const m = app.machine;
    const S = window.labSubstances;
    const out = {};
    for (const [form, id] of [['solid', 'water'], ['gas', 'water'], ['liquid', 'elem:N'], ['solid', 'carbon_dioxide'], ['liquid', 'elem:Fe'], ['natural', 'water']]) {
      m.form = form;
      const p = m.productFor(S[id]);
      out[form + ':' + id] = { name: p.substance.name, phase: p.substance.phase, T: Math.round(p.temperature) };
    }
    m.form = 'natural';
    return out;
  });
  assert.equal(r['solid:water'].name, 'Ice');
  assert.ok(r['solid:water'].T < 0);
  assert.equal(r['gas:water'].name, 'Steam');
  assert.equal(r['liquid:elem:N'].name, 'Liquid nitrogen');
  assert.ok(r['liquid:elem:N'].T < -195);
  assert.equal(r['solid:carbon_dioxide'].name, 'Dry ice');
  assert.equal(r['liquid:elem:Fe'].phase, 'liquid');
  assert.ok(r['liquid:elem:Fe'].T > 1538);
  assert.equal(r['natural:water'].name, 'Water');
});

await test('synthesizer pours ice into a docked beaker', async () => {
  const r = await page.evaluate(async () => {
    const app = window.lab;
    const m = app.machine;
    const beaker = app.spawnEquipment('beaker250', m.toWorld(new THREE_V(0, 0.32, 0.04)));
    window.__iceBeaker = beaker;
    for (let i = 0; i < 40; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    m.form = 'solid';
    m.amountIndex = 1; // 50 g
    m.lastProduct = window.labSubstances.water;
    m.repeat();
    for (let i = 0; i < 60 * 9; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    app.renderEnabled = true;
    m.form = 'natural';
    return { docked: m.docked === beaker, ice: beaker.contents.amount('water@solid'), water: beaker.contents.amount('water'), T: beaker.contents.temperature, state: m.state, summary: beaker.contents.summary().map((x) => x.name) };
  });
  assert.ok(r.docked, 'beaker docked');
  assert.ok(r.ice > 40, 'ice delivered: ' + JSON.stringify(r));
  assert.ok(r.T < 0.5, 'ice is cold: ' + r.T);
  assert.ok(r.summary.includes('Ice'), 'named Ice: ' + r.summary);
  await view([-0.25, 1.35, 0.2], [-0.62, 0.85, -0.3]);
  await step(page, 0.05);
  await shot('20-ice-from-synth');
});

await test('portable freezer freezes water into ice', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const fz = app.spawnEquipment('freezer', new THREE_V(0.35, 0.93, -0.45));
    window.__freezer = fz;
    for (let i = 0; i < 30; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    const floorY = fz.object.position.y + 0.03;
    const b = app.spawnEquipment('beaker100', new THREE_V(0.35, floorY, -0.45));
    b.addSubstance('water', 60);
    window.__fzBeaker = b;
    for (let i = 0; i < 30; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    fz.toggleLid(false);
    const t = [];
    for (let s = 0; s < 75; s++) {
      for (let i = 0; i < 60; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
      t.push(Math.round(b.contents.temperature));
    }
    app.renderEnabled = true;
    return { inside: fz.inside(b.object.position), lidClosed: !fz.lidOpen, collider: !!fz.lidCollider, ice: b.contents.amount('water@solid'), water: b.contents.amount('water'), temps: t.filter((_, i) => i % 5 === 0), display: fz.display.last };
  });
  assert.ok(r.inside, 'beaker inside');
  assert.ok(r.lidClosed && r.collider, 'lid closed with collider');
  assert.ok(r.ice > 50, 'water froze: ' + JSON.stringify(r));
  await page.evaluate(() => window.__freezer.toggleLid(true));
  await view([0.35, 1.45, 0.05], [0.35, 0.95, -0.45]);
  await step(page, 0.8);
  await shot('21-freezer-ice');
});

await test('carrying the freezer carries the beaker inside', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const fz = window.__freezer, b = window.__fzBeaker;
    const hand = app.input.desktop.hand;
    hand.gripPosition.copy(fz.object.position).add(new THREE_V(0, 0.1, 0));
    hand.gripQuaternion.identity();
    hand.setButtons(true, true);
    app.grab.grab(hand, fz, null, 'near');
    const rel0 = b.object.position.clone().sub(fz.object.position);
    for (let i = 0; i < 120; i++) {
      hand.gripPosition.x += Math.sin(i / 6) * 0.03;
      hand.gripPosition.y += Math.cos(i / 5) * 0.012;
      app.renderEnabled = false;
      app.loop(performance.now(), null);
    }
    const rel1 = b.object.position.clone().sub(fz.object.position);
    hand.setButtons(false, false);
    app.grab.forceRelease(hand);
    for (let i = 0; i < 120; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    app.renderEnabled = true;
    return { drift: rel0.distanceTo(rel1), removed: b.removed, dynamic: b.body.isDynamic(), inside: fz.inside(b.object.position), errors: (app.errors || []).length };
  });
  assert.ok(r.drift < 0.01, 'beaker stayed in place: ' + r.drift);
  assert.ok(!r.removed && r.dynamic && r.inside, JSON.stringify(r));
  assert.equal(r.errors, 0);
});

await test('test-tube rack with tubes can be swung around without breaking anything', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const rack = app.spawnEquipment('rack', new THREE_V(-0.25, 0.93, -0.45));
    for (let i = 0; i < 20; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    const tubes = rack.slots.slice(0, 4).map((x) => {
      const t = app.spawnEquipment('testtube', rack.object.position.clone().add(new THREE_V(x, 0.03, 0)));
      t.addSubstance('water', 8);
      return t;
    });
    for (let i = 0; i < 90; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    const hand = app.input.desktop.hand;
    hand.gripPosition.copy(rack.object.position).add(new THREE_V(0, 0.05, 0));
    hand.gripQuaternion.identity();
    hand.setButtons(true, true);
    app.grab.grab(hand, rack, null, 'near');
    const carried = rack.cargo.length;
    const breaks = [];
    for (const t of tubes) {
      const oi = t.onImpact.bind(t);
      t.onImpact = (sp, other) => { if (sp > 3) breaks.push([app.elapsed.toFixed(2), +sp.toFixed(2), other?.name || String(other), t.carriedBy ? 'carried' : 'free', t.body?.isDynamic()]); return oi(sp, other); };
    }
    // Violent swinging, including a NaN glitch in tracking
    for (let i = 0; i < 240; i++) {
      hand.gripPosition.x = -0.25 + Math.sin(i / 3) * 0.35;
      hand.gripPosition.y = 1.4 + Math.cos(i / 4) * 0.15; // violent, but clear of the bench
      hand.gripQuaternion.setFromEuler(new window.THREE.Euler(Math.sin(i / 5) * 0.4, i / 10, 0));
      if (i === 100) hand.gripPosition.x = NaN;
      if (i === 101) hand.gripPosition.x = 0;
      app.renderEnabled = false;
      app.loop(performance.now(), null);
    }
    hand.setButtons(false, false);
    app.grab.forceRelease(hand);
    for (let i = 0; i < 180; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    app.renderEnabled = true;
    const bad = [rack, ...tubes].some((e) => !e.removed && !Number.isFinite(e.object.position.x));
    return { breaks, carried, broken: tubes.filter((t) => t.removed).length, bad, errors: (app.errors || []).slice(), y: rack.object.position.y };
  });
  assert.equal(r.carried, 4, 'all tubes carried');
  assert.equal(r.broken, 0, 'no tube broke ' + JSON.stringify(r));
  assert.ok(!r.bad, 'no NaN positions');
  assert.deepEqual(r.errors, []);
});

await test('strike a match on the table and light ethanol with it', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const match = app.spawnEquipment('match', new THREE_V(0.0, 0.95, -0.3));
    const hand = app.input.desktop.hand;
    for (let i = 0; i < 20; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    hand.gripPosition.copy(match.object.position);
    hand.gripQuaternion.identity();
    hand.setButtons(true, true);
    app.grab.grab(hand, match, null, 'near');
    // Point the head down at the table top and rub it along quickly
    hand.gripQuaternion.setFromAxisAngle(new THREE_V(1, 0, 0), Math.PI * 0.8);
    const table = app.physics.raycast(new THREE_V(0, 1.2, -0.3), new THREE_V(0, -1, 0), 1).point.y;
    let lit = -1;
    for (let i = 0; i < 120 && lit < 0; i++) {
      const head = match.headPoint(new THREE_V());
      // follow whatever surface is under the head (table, or anything lying on it)
      const under = app.physics.raycast(new THREE_V(head.x, 1.3, head.z), new THREE_V(0, -1, 0), 1, match.body)?.point.y ?? table;
      hand.gripPosition.y += under + 0.003 - head.y;
      hand.gripPosition.x = -0.15 + (i % 30) * 0.012;
      app.renderEnabled = false;
      app.loop(performance.now(), null);
      if (match.state === 'burning') lit = i;
    }
    // Hold it at the mouth of a beaker of ethanol
    const b = app.spawnEquipment('beaker100', new THREE_V(0.2, 0.93, -0.3));
    b.addSubstance('ethanol', 40);
    for (let i = 0; i < 20; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    // Turn the match upright again, calmly
    const q0 = hand.gripQuaternion.clone();
    for (let i = 1; i <= 40; i++) {
      hand.gripQuaternion.slerpQuaternions(q0, new window.THREE.Quaternion(), i / 40);
      hand.gripPosition.y += 0.002;
      app.renderEnabled = false;
      app.loop(performance.now(), null);
    }
    const stillLit = match.state === 'burning';
    let ignited = false;
    app.events.on('react', () => {});
    let dist = 0, flame = null;
    const rim0 = b.rim().center.clone();
    const head0 = match.flamePoint(new THREE_V());
    const path = [
      new THREE_V(head0.x, rim0.y + 0.1, head0.z),
      new THREE_V(rim0.x, rim0.y + 0.1, rim0.z),
      new THREE_V(rim0.x, rim0.y + 0.012, rim0.z),
    ];
    for (let i = 0; i < 400 && !ignited; i++) {
      const head = match.flamePoint(new THREE_V());
      while (path.length > 1 && head.distanceTo(path[0]) < 0.006) path.shift();
      const d = path[0].clone().sub(head);
      if (d.length() > 0.012) d.setLength(0.012); // ~0.7 m/s, a calm hand
      hand.gripPosition.add(d);
      app.renderEnabled = false;
      app.loop(performance.now(), null);
      ignited = b.contents.burning > 0;
      dist = match.flamePoint(new THREE_V()).distanceTo(b.rim().center);
      flame = b.flameContact;
    }
    window.__match = match;
    window.__ethanol = b;
    return { lit, stillLit, state: match.state, ignited, table, dist, flame, bpos: b.object.position.toArray() };
  });
  assert.ok(r.lit >= 0, 'match lit by striking: ' + JSON.stringify(r));
  assert.ok(r.stillLit, 'turning it upright calmly keeps it lit');
  assert.ok(r.ignited, 'ethanol caught fire: ' + JSON.stringify(r));
  await view([0.05, 1.25, 0.05], [0.15, 0.95, -0.3]);
  await step(page, 0.3);
  await shot('22-match-ethanol');
});

await test('a match goes out in water and burns out by itself', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const hand = app.input.desktop.hand;
    hand.setButtons(false, false);
    app.grab.forceRelease(hand);
    const m2 = app.spawnEquipment('match', new THREE_V(-0.1, 1.1, -0.8), null, { stasis: true });
    m2.ignite();
    const w = app.spawnEquipment('beaker100', new THREE_V(-0.1, 0.93, -0.8));
    w.addSubstance('water', 80);
    for (let i = 0; i < 20; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    // dunk it
    m2.teleport(w.object.position.clone().add(new THREE_V(0, 0.095, 0)), new window.THREE.Quaternion().setFromAxisAngle(new THREE_V(1, 0, 0), Math.PI));
    for (let i = 0; i < 5; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    const dunked = m2.state;
    const m3 = app.spawnEquipment('match', new THREE_V(0.3, 1.1, -0.8), null, { stasis: true });
    m3.ignite();
    for (let i = 0; i < 60 * 27; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    app.renderEnabled = true;
    return { dunked, burnedOut: m3.state };
  });
  assert.equal(r.dunked, 'spent');
  assert.equal(r.burnedOut, 'spent');
});

await test('matchbox hands out matches; undo restores', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const box = app.spawnEquipment('matches', new THREE_V(-0.4, 0.93, -0.8));
    for (let i = 0; i < 10; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    const n0 = app.entities.filter((e) => e.catalogId === 'match' && !e.removed).length;
    box.dispense();
    const n1 = app.entities.filter((e) => e.catalogId === 'match' && !e.removed).length;
    app.history.undo();
    const n2 = app.entities.filter((e) => e.catalogId === 'match' && !e.removed).length;
    return { n0, n1, n2 };
  });
  assert.equal(r.n1, r.n0 + 1);
  assert.equal(r.n2, r.n0);
});

await test('equipment list shows the freezer and matches', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    return ['freezer', 'matches', 'match'].map((id) => !!app.thumbnails?.get?.(id));
  });
  assert.deepEqual(r, [true, true, true]);
  await page.evaluate(() => {
    const app = window.lab;
    const p = app.equipmentPanel;
    app.camera.position.copy(p.object.position).add(new THREE_V(0, 0, 0.9).applyQuaternion(p.object.quaternion));
    app.camera.lookAt(p.object.position);
  });
  await step(page, 0.05);
  await shot('23-equipment-list');
});

await test('molecules not in the library are named live from PubChem', async () => {
  const online = await page.evaluate(() => fetch('https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/cid/962/property/Title/JSON').then((r) => r.ok).catch(() => false));
  if (!online) { console.log('    (offline — skipped)'); return; }
  const r = await page.evaluate(async () => {
    const app = window.lab;
    const VAL = { C: 4, O: 2, F: 1, N: 3 };
    const make = (heavy, links, pos) => {
      const symbols = heavy.slice();
      const bonds = links.map(([i, j]) => [i, j, 1]);
      const deg = heavy.map((_, i) => links.filter(([a, b]) => a === i || b === i).length);
      heavy.forEach((sym, i) => { for (let k = deg[i]; k < VAL[sym]; k++) { symbols.push('H'); bonds.push([i, symbols.length - 1, 1]); } });
      return app.molecules.spawnMolecule({ symbols, bonds }, pos, { stasis: true });
    };
    // 1-heptanol: C7H16O (not in the offline library)
    const hept = make(['C', 'C', 'C', 'C', 'C', 'C', 'C', 'O'], [[0, 1], [1, 2], [2, 3], [3, 4], [4, 5], [5, 6], [6, 7]], new THREE_V(-0.3, 1.3, -0.6));
    // C(OONH2)4: every bond valid, but nobody has ever recorded it (F–O6–F, oddly, is in PubChem)
    const weird = make(['C', 'O', 'O', 'N', 'O', 'O', 'N', 'O', 'O', 'N', 'O', 'O', 'N'], [[0, 1], [1, 2], [2, 3], [0, 4], [4, 5], [5, 6], [0, 7], [7, 8], [8, 9], [0, 10], [10, 11], [11, 12]], new THREE_V(0.3, 1.3, -0.6));
    const first = hept.identity.substance.name;
    const t0 = performance.now();
    while ((hept.identity.substance.pending || weird.identity.substance.pending) && performance.now() - t0 < 30000) await new Promise((res) => setTimeout(res, 200));
    const h = hept.identity.substance, w = weird.identity.substance;
    return { first, hept: [h.name, h.phase, h.bp, h.cid], weird: [w.name, w.undiscovered], label: hept.displayFormula };
  });
  assert.equal(r.first, 'Identifying…');
  assert.match(r.hept[0], /heptan/i, 'heptanol named: ' + JSON.stringify(r));
  assert.equal(r.hept[1], 'liquid');
  assert.ok(r.hept[2] > 150 && r.hept[2] < 200, 'real boiling point ' + r.hept[2]);
  assert.equal(r.weird[0], 'Undiscovered compound');
  assert.ok(r.weird[1]);
});

await test('offline library: real compounds identified without internet', async () => {
  const r = await page.evaluate(() => {
    const S = window.labSubstances;
    const lib = Object.values(S).filter((s) => s.pubchem);
    const pick = (q) => lib.find((s) => s.name.toLowerCase() === q);
    return {
      count: lib.length,
      caffeine: pick('caffeine') && [pick('caffeine').phase, pick('caffeine').formula],
      kmno4: S.kmno4 ? null : null,
      citric: pick('citric acid') && [pick('citric acid').phase, pick('citric acid').form, pick('citric acid').mp],
      acetone: Object.values(S).find((s) => s.name === 'Acetone')?.bp,
    };
  });
  assert.ok(r.count > 250, 'library size ' + r.count);
  assert.deepEqual(r.caffeine, ['solid', 'C8H10N4O2']);
  assert.equal(r.citric[0], 'solid');
});

const fatal = errors.filter((e) => e.startsWith('[pageerror]') || (e.startsWith('[error]') && !e.includes('favicon')));
const appErrors = await page.evaluate(() => (window.lab.errors || []).slice());
console.log(`states: ${passed} tests passed`);
if (fatal.length || appErrors.length) {
  console.log('Errors:\n' + [...fatal, ...appErrors].join('\n'));
  process.exitCode = 1;
}
await browser.close();
