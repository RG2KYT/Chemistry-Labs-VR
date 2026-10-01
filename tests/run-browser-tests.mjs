// End-to-end scenario tests in headless Chromium (software WebGL).
// Usage: npm run build && npx vite preview --port 4173 &  then  node tests/run-browser-tests.mjs
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { launch, openLab, step } from './browser.mjs';

const OUT = 'test-results';
fs.mkdirSync(OUT, { recursive: true });
const only = process.argv[2] || '';

const browser = await launch();
const { page, errors } = await openLab(browser, '?desktop', { width: 1100, height: 700 });
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
const look = (yaw, pitch, pos) => page.evaluate(({ yaw, pitch, pos }) => {
  const d = window.lab.input.desktop;
  d.yaw = yaw;
  d.pitch = pitch;
  window.lab.camera.quaternion.setFromEuler(new window.THREE.Euler(pitch, yaw, 0, 'YXZ'));
  if (pos) window.lab.rig.position.set(pos[0], pos[1], pos[2]);
}, { yaw, pitch, pos });

// The tests drive the "mouse hand" directly, so switch off real mouse/keyboard input.
await page.evaluate(() => { window.lab.input.desktop.enabled = false; window.lab.input.desktop.hand.active = true; window.lab.input.desktop.hand.resetMotion(); });

await test('build water atom by atom and identify it', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const ms = app.molecules;
    const h2 = ms.spawnElement('H', new THREE_V(0.9, 1.3, -0.5), { diatomic: true });
    const o = ms.spawnElement('O', new THREE_V(0.7, 1.3, -0.5));
    const h2Name = h2.identity.substance.name;
    const hFree = ms.breakBetween(h2, h2.atoms[0], h2.atoms[1]);
    const first = h2.atoms[0];
    ms.bondAtoms(o, o.atoms[0], h2, first);
    ms.bondAtoms(o, o.atoms[0], hFree, hFree.atoms[0]);
    for (let i = 0; i < 120; i++) o.update(1 / 60);
    const a = o.atoms;
    const O = a.find((x) => x.el.symbol === 'O');
    const Hs = a.filter((x) => x.el.symbol === 'H');
    const v1 = Hs[0].local.clone().sub(O.local), v2 = Hs[1].local.clone().sub(O.local);
    window.__water = o;
    return { h2Name, name: o.identity.substance?.name, formula: o.identity.formula, angle: (v1.angleTo(v2) * 180) / Math.PI, count: ms.molecules.length };
  });
  assert.equal(r.h2Name, 'Hydrogen');
  assert.equal(r.name, 'Water');
  assert.equal(r.formula, 'H2O');
  assert.ok(Math.abs(r.angle - 104.5) < 3, 'bent water, angle ' + r.angle);
  assert.equal(r.count, 1);
  await look(-0.95, -0.1);
  await step(page, 0.2);
  await shot('01-water-molecule');
});

await test('grab with the mouse hand and bond by proximity', async () => {
  // Spawn C and four H, drag each H onto the carbon using the real interaction path.
  const r = await page.evaluate(() => {
    const app = window.lab;
    const ms = app.molecules;
    const c = ms.spawnElement('C', new THREE_V(0.4, 1.35, -0.25));
    const hs = [0, 1, 2, 3].map((i) => ms.spawnElement('H', new THREE_V(0.15 + i * 0.12, 1.15, -0.3)));
    const c0 = c.atoms[0];
    const hand = app.input.desktop.hand;
    const grab = app.grab;
    const results = [];
    for (const h of hs) {
      hand.gripPosition.copy(h.object.position);
      hand.gripQuaternion.identity();
      hand.setButtons(true, true);
      grab.grab(hand, h, h.atoms[0], 'near');
      const cm = ms.molecules.find((m) => m.atoms.includes(c0));
      const cPos = cm.atomWorldPosition(c0);
      // Approach the carbon from a free direction
      const dir = new THREE_V(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).normalize();
      for (let k = 0; k < 40; k++) {
        const target = cPos.clone().addScaledVector(dir, 0.3 - k * 0.006);
        hand.gripPosition.copy(target);
        hand.setButtons(true, true);
        app.clock.getDelta = () => 1 / 60;
        app.renderEnabled = false;
        app.loop(performance.now(), null);
        if (h.removed || h.atoms.includes(c0)) break;
      }
      hand.setButtons(false, false);
      app.loop(performance.now(), null);
      results.push(ms.molecules.find((m) => m.atoms.includes(c0)).atoms.length);
    }
    app.renderEnabled = true;
    const mol = ms.molecules.find((m) => m.atoms.includes(c0));
    for (let i = 0; i < 90; i++) mol.update(1 / 60);
    window.__methane = mol;
    return { merged: results, name: mol.identity.substance?.name, held: !!hand.held };
  });
  assert.deepEqual(r.merged, [2, 3, 4, 5], 'all hydrogens bonded');
  assert.equal(r.name, 'Methane');
  assert.equal(r.held, false);
  await step(page, 0.1);
  await shot('02-methane');
});

await test('pull an atom out with two hands (shift-drag path)', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const m = window.__methane;
    const hand = app.input.desktop.hand;
    const anchor = app.input.desktop.anchor;
    const h = m.atoms.find((a) => a.el.symbol === 'H');
    const other = m.farthestAtomFrom(h);
    anchor.active = true;
    anchor.gripPosition.copy(m.atomWorldPosition(other));
    anchor.gripQuaternion.copy(m.object.quaternion);
    anchor.setButtons(true, false);
    app.grab.grab(anchor, m, other, 'near');
    hand.gripPosition.copy(m.atomWorldPosition(h));
    hand.setButtons(true, true);
    app.grab.grab(hand, m, h, 'near');
    const start = hand.gripPosition.clone();
    const dir = start.clone().sub(m.object.position).normalize();
    let split = false;
    for (let k = 0; k < 60; k++) {
      hand.gripPosition.copy(start).addScaledVector(dir, k * 0.004);
      app.renderEnabled = false;
      app.clock.getDelta = () => 1 / 60;
      app.loop(performance.now(), null);
      if (m.atoms.length === 4) { split = true; break; }
    }
    hand.setButtons(false, false);
    anchor.setButtons(false, false);
    app.loop(performance.now(), null);
    app.renderEnabled = true;
    return { split, formula: m.identity.formula, open: m.identity.ok, heldAfter: !!hand.held || !!anchor.held, n: app.molecules.molecules.length };
  });
  assert.ok(r.split, 'bond broke');
  assert.equal(r.formula, 'CH3');
  assert.equal(r.open, false);
  assert.equal(r.heldAfter, false);
});

await test('synthesizer turns water into a beaker of water (pours from the tube)', async () => {
  await page.evaluate(() => {
    const app = window.lab;
    const beaker = app.entities.find((e) => e.catalogId === 'beaker250');
    const pad = app.machine.toWorld(new THREE_V(0, 0.32, 0.04));
    beaker.teleport(pad, beaker.object.quaternion);
    window.__beaker = beaker;
  });
  await step(page, 0.6);
  const docked = await page.evaluate(() => window.lab.machine.docked === window.__beaker);
  assert.ok(docked, 'beaker docked');
  await page.evaluate(() => window.lab.machine.feed(window.__water));
  await step(page, 4.2);
  const mid = await page.evaluate(() => ({ state: window.lab.machine.state, water: window.__beaker.contents.amount('water') }));
  await look(1.05, -0.25, [-0.55, 0, -0.35]);
  await step(page, 0.05);
  await shot('03-synth-pouring');
  assert.ok(['flowing', 'pouring', 'drain', 'done'].includes(mid.state), 'machine state ' + mid.state);
  await step(page, 3);
  const end = await page.evaluate(() => ({ state: window.lab.machine.state, water: window.__beaker.contents.amount('water') }));
  assert.ok(Math.abs(end.water - 100) < 2, 'got ' + end.water + ' mL of water');
  await step(page, 1.5);
  await shot('04-synth-done');
});

await test('incomplete molecule is rejected and ejected', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const ch3 = app.molecules.molecules.find((m) => m.identity.formula === 'CH3');
    app.machine.feed(ch3);
    return true;
  });
  assert.ok(r);
  await step(page, 2.5);
  const s = await page.evaluate(() => ({ state: window.lab.machine.state, msg: window.lab.machine.message, ejected: window.lab.molecules.molecules.some((m) => m.identity.formula === 'CH3') }));
  assert.equal(s.state, 'rejected');
  assert.match(s.msg, /free bond/);
  assert.ok(s.ejected, 'molecule spat back out');
});

await test('pouring between beakers transfers liquid', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const src = window.__beaker;
    // Hold the beaker with the mouse hand and tilt it over another beaker.
    const dst = app.spawnEquipment('beaker600', new THREE_V(0.0, 0.925, -0.45));
    const hand = app.input.desktop.hand;
    for (let i = 0; i < 30; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    src.teleport(new THREE_V(0.12, 1.12, -0.45));
    hand.gripPosition.copy(src.object.position);
    hand.gripQuaternion.identity();
    hand.setButtons(true, true);
    app.grab.grab(hand, src, null, 'near');
    const axis = new THREE_V(0, 0, 1);
    for (let i = 0; i < 180; i++) {
      const ang = Math.min(Math.PI * 0.62, i * 0.02);
      hand.gripQuaternion.setFromAxisAngle(axis, ang);
      app.renderEnabled = false;
      app.clock.getDelta = () => 1 / 60;
      app.loop(performance.now(), null);
    }
    window.__dst = dst;
    return { src: src.contents.amount('water'), dst: dst.contents.amount('water'), streams: app.fluids.streams.size };
  });
  await look(0, -0.6, [0, 0, 0]);
  await step(page, 0.03);
  await shot('05-pouring');
  await page.evaluate(() => {
    const hand = window.lab.input.desktop.hand;
    hand.setButtons(false, false);
    window.lab.loop(performance.now(), null);
  });
  assert.ok(r.dst > 50, 'received ' + r.dst);
  assert.ok(r.src < 40, 'source left ' + r.src);
});

await test('acid dissolves what it is poured on, which reforms', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const target = app.entities.find((e) => e.catalogId === 'washbottle');
    const top = target.worldBounds().max.y;
    const above = target.object.position.clone();
    above.y = top + 0.25;
    let stream = null;
    let dissolving = false;
    for (let i = 0; i < 90; i++) {
      const portion = new window.LabMixture();
      portion.add('hydrochloric_acid', 2);
      stream = app.fluids.pour(null, stream, above, new THREE_V(0, -0.1, 0), portion, 40);
      app.renderEnabled = false;
      app.clock.getDelta = () => 1 / 60;
      app.loop(performance.now(), null);
      if (app.dissolver.isDissolving(target)) dissolving = true;
    }
    app.fluids.stop(stream);
    window.__target = target;
    return { dissolving };
  });
  assert.ok(r.dissolving, 'wash bottle started dissolving');
  await step(page, 0.05);
  await shot('06-acid');
  await step(page, 12);
  const after = await page.evaluate(() => ({ disabled: window.__target.disabled, removed: window.__target.removed, visible: window.__target.object.visible, active: window.lab.dissolver.isDissolving(window.__target) }));
  assert.equal(after.removed, false);
  assert.equal(after.visible, true);
  assert.equal(after.disabled, false, 'restored');
  assert.equal(after.active, false);
});

await test('glass dropped from height shatters and disappears', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const b = app.spawnEquipment('beaker100', new THREE_V(0.4, 2.6, 0.25));
    b.body.setLinvel({ x: 0, y: -3, z: 0 }, true);
    let removed = false;
    for (let i = 0; i < 120; i++) {
      app.renderEnabled = false;
      app.clock.getDelta = () => 1 / 60;
      app.loop(performance.now(), null);
      if (b.removed) { removed = true; break; }
    }
    return { removed, shards: app.effects.shards.items.length };
  });
  assert.ok(r.removed, 'beaker broke');
  assert.ok(r.shards > 10, 'shards flew');
  // A gentle drop does not break it
  const r2 = await page.evaluate(() => {
    const app = window.lab;
    const b = app.spawnEquipment('beaker100', new THREE_V(0.4, 0.4, 0.3));
    for (let i = 0; i < 90; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    const ok = !b.removed;
    b.destroy();
    return ok;
  });
  assert.ok(r2, 'survives a small drop');
});

await test('panels: carry by a handle, rotate to portrait, no throwing', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const panel = app.periodicPanel;
    const hand = app.input.desktop.hand;
    const seg = panel.handleSegments[0];
    panel.handleGroup.updateWorldMatrix(true, false);
    const handlePoint = seg.a.clone().lerp(seg.b, 0.5).applyMatrix4(panel.handleGroup.matrixWorld);
    hand.gripPosition.copy(handlePoint);
    hand.gripQuaternion.copy(panel.object.quaternion);
    const q0 = hand.gripQuaternion.clone();
    hand.setButtons(true, true);
    app.grab.grab(hand, panel, 'top', 'near');
    const p0 = panel.object.position.clone();
    // Move it and roll it 90 degrees
    const fwd = new THREE_V(0, 0, 1).applyQuaternion(panel.object.quaternion);
    for (let i = 0; i <= 60; i++) {
      hand.gripPosition.copy(handlePoint).add(new THREE_V(-0.2 * i / 60, 0, 0));
      hand.gripQuaternion.copy(q0).premultiply(new THREE_Q().setFromAxisAngle(fwd, (Math.PI / 2) * (i / 60)));
      hand.velocity.set(25, 0, 0); // fake a violent throw at release
      app.renderEnabled = false;
      app.loop(performance.now(), null);
    }
    const whileHeld = { k: panel.k, layoutPortrait: panel.layoutPortrait };
    hand.setButtons(false, false);
    hand.recordMotion = () => {}; // keep the fake velocity
    app.loop(performance.now(), null);
    const atRelease = panel.object.position.clone();
    for (let i = 0; i < 60; i++) { app.loop(performance.now(), null); }
    delete hand.recordMotion;
    hand.resetMotion();
    const moved = panel.object.position.distanceTo(atRelease);
    const up = new THREE_V(0, 1, 0).applyQuaternion(panel.object.quaternion);
    return { whileHeld, portrait: panel.portrait, k: panel.k, moved, upY: up.y, displaced: p0.distanceTo(atRelease) };
  });
  assert.equal(r.whileHeld.layoutPortrait, true, 'content switched to portrait while rolled');
  assert.equal(r.portrait, true, 'stays portrait after release');
  assert.equal(r.k, 0);
  assert.ok(r.moved < 0.02, 'panel did not fly away: ' + r.moved);
  assert.ok(r.upY > 0.95, 'upright after release');
  assert.ok(r.displaced > 0.1, 'was carried');
  await look(-0.9, -0.05, [0, 0, 0]);
  await step(page, 0.4);
  await shot('07-panel-portrait');
});

await test('panel upside down flips back', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const panel = app.equipmentPanel;
    const hand = app.input.desktop.hand;
    const seg = panel.handleSegments[1];
    panel.handleGroup.updateWorldMatrix(true, false);
    const pt = seg.a.clone().lerp(seg.b, 0.5).applyMatrix4(panel.handleGroup.matrixWorld);
    hand.gripPosition.copy(pt);
    hand.gripQuaternion.copy(panel.object.quaternion);
    const q0 = hand.gripQuaternion.clone();
    hand.setButtons(true, true);
    app.grab.grab(hand, panel, 'bottom', 'near');
    const fwd = new THREE_V(0, 0, 1).applyQuaternion(panel.object.quaternion);
    for (let i = 0; i <= 60; i++) {
      hand.gripQuaternion.copy(q0).premultiply(new THREE_Q().setFromAxisAngle(fwd, Math.PI * (i / 60)));
      app.renderEnabled = false;
      app.loop(performance.now(), null);
    }
    const k = panel.k;
    hand.setButtons(false, false);
    for (let i = 0; i < 40; i++) app.loop(performance.now(), null);
    const up = new THREE_V(0, 1, 0).applyQuaternion(panel.object.quaternion);
    return { kWhileHeld: k, portrait: panel.portrait, upY: up.y };
  });
  assert.equal(r.kWhileHeld, 2);
  assert.equal(r.portrait, false);
  assert.ok(r.upY > 0.95);
});

await test('periodic table click spawns atoms through the UI', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const panel = app.periodicPanel;
    const before = app.molecules.molecules.length;
    const btn = panel.buttons.find((b) => b.id === 'el-Na');
    const hand = app.input.desktop.hand;
    panel.down(hand, { px: btn.x + btn.w / 2, py: btn.y + btn.h / 2, point: panel.object.position });
    panel.update(0);
    const spawn = panel.buttons.find((b) => b.id === 'spawn-atom');
    panel.down(hand, { px: spawn.x + 5, py: spawn.y + 5, point: panel.object.position });
    const after = app.molecules.molecules.length;
    return { selected: panel.selected.symbol, before, after };
  });
  assert.equal(r.selected, 'Na');
  assert.equal(r.after, r.before + 1);
});

await test('equipment list spawns onto the table', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const panel = app.equipmentPanel;
    panel.update(0);
    const btn = panel.buttons.find((b) => b.id === 'item-burner') || panel.buttons.find((b) => b.id.startsWith('item-'));
    const before = app.entities.filter((e) => e.kind === 'equipment').length;
    panel.down(app.input.desktop.hand, { px: btn.x + 10, py: btn.y + 10, point: panel.object.position });
    for (let i = 0; i < 60; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    app.renderEnabled = true;
    const list = app.entities.filter((e) => e.kind === 'equipment');
    const last = list[list.length - 1];
    return { before, after: list.length, y: last.object.position.y };
  });
  assert.equal(r.after, r.before + 1);
  assert.ok(r.y > 0.85 && r.y < 1.0, 'resting on the table at y=' + r.y);
});

await test('heating water to boiling with the burner', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const burner = app.entities.find((e) => e.catalogId === 'burner');
    const tripod = app.entities.find((e) => e.catalogId === 'tripod');
    const b = app.spawnEquipment('beaker100', tripod.object.position.clone().add(new THREE_V(0, 0.2, 0)));
    b.addSubstance('water', 40);
    burner.toggle(true);
    let t = 0;
    for (let i = 0; i < 60 * 40 && b.contents.temperature < 99.5; i++) {
      app.renderEnabled = false;
      app.clock.getDelta = () => 1 / 30;
      app.loop(performance.now(), null);
      t += 1 / 30;
    }
    window.__hot = b;
    return { temp: b.contents.temperature, t, heat: b.heatRate };
  });
  assert.ok(r.temp > 99, 'reached ' + r.temp + ' after ' + r.t + 's');
  await look(-0.45, -0.55, [0.25, 0, -0.1]);
  await step(page, 0.05, 1 / 30);
  await shot('08-boiling');
});

await test('physical form on top of the machine turns back into atoms', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const m = app.machine;
    m.cancel();
    const b = app.spawnEquipment('beaker100', m.toWorld(new THREE_V(0, 1.6, 0)));
    b.addSubstance('nacl_aq', 40);
    const before = new Set(app.molecules.molecules);
    let sawDecompose = false;
    for (let i = 0; i < 60 * 5; i++) {
      app.renderEnabled = false;
      app.clock.getDelta = () => 1 / 60;
      app.loop(performance.now(), null);
      if (m.state === 'decomposing') sawDecompose = true;
    }
    app.renderEnabled = true;
    const made = app.molecules.molecules.filter((x) => !before.has(x)).map((x) => x.displayFormula).sort();
    window.__topBeaker = b;
    return { sawDecompose, made, left: b.contents.total, state: m.state };
  });
  assert.ok(r.sawDecompose, 'machine broke it down');
  assert.deepEqual(r.made, ['H2O', 'NaCl'], 'salt water → NaCl + H2O, got ' + r.made);
  assert.ok(r.left < 0.01, 'container emptied');
  await page.evaluate(() => {
    const app = window.lab;
    const front = app.machine.toWorld(new THREE_V(0, 1.0, 0.95));
    app.rig.position.set(front.x, 0, front.z);
    app.camera.position.set(0, front.y, 0);
    app.camera.lookAt(app.machine.toWorld(new THREE_V(0, 0.75, 0)));
  });
  await step(page, 0.05);
  await shot('13-reverse-to-atoms');
  await page.evaluate(() => { window.lab.camera.position.set(0, 1.6, 0); window.__topBeaker.destroy(); });
});

await test('holding a container against another combines the physical forms', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const hand = app.input.desktop.hand;
    const a = app.spawnEquipment('beaker250', new THREE_V(-0.2, 0.93, -0.5));
    const b = app.spawnEquipment('beaker250', new THREE_V(0.0, 0.93, -0.5));
    a.addSubstance('elem:H', 250);
    b.addSubstance('elem:O', 200);
    for (let i = 0; i < 20; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    hand.gripPosition.copy(a.object.position);
    hand.gripQuaternion.identity();
    hand.setButtons(true, true);
    app.grab.grab(hand, a, null, 'near');
    // Bring A's rim against B's rim
    const target = b.object.position.clone().add(new THREE_V(-0.04, 0.0, 0));
    let combined = false;
    app.events.on('combine', () => { combined = true; });
    for (let i = 0; i < 90 && !combined; i++) {
      hand.gripPosition.lerp(target, 0.15);
      app.renderEnabled = false;
      app.loop(performance.now(), null);
    }
    hand.setButtons(false, false);
    app.loop(performance.now(), null);
    app.renderEnabled = true;
    const summary = b.contents.summary().map((x) => x.name);
    window.__a = a; window.__b = b;
    return { combined, aEmpty: a.contents.isEmpty, water: b.contents.amount('water'), summary, broken: b.removed };
  });
  assert.ok(r.combined, 'combined');
  assert.ok(r.aEmpty, 'source emptied');
  assert.ok(r.water > 1, 'hydrogen + oxygen made water: ' + JSON.stringify(r));
  await step(page, 0.05);
  await shot('14-combined');
});

await test('undo steps back through actions', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const ms = app.molecules;
    const n0 = ms.molecules.length;
    const h = ms.spawnElement('H', new THREE_V(-0.3, 1.3, -0.4));
    const o = ms.spawnElement('O', new THREE_V(-0.15, 1.3, -0.4));
    ms.bondAtoms(o, o.atoms[0], h, h.atoms[0]);
    const afterBond = ms.molecules.length;
    app.history.undo(); // undo the bond
    const afterUndo1 = ms.molecules.length;
    app.history.undo(); // undo adding O
    const afterUndo2 = ms.molecules.length;
    // Undo the combine from the previous test: the hydrogen comes back
    return { n0, afterBond, afterUndo1, afterUndo2, label: app.history.lastLabel };
  });
  assert.equal(r.afterBond, r.n0 + 1);
  assert.equal(r.afterUndo1, r.n0 + 2, 'bond undone');
  assert.equal(r.afterUndo2, r.n0 + 1, 'add undone');
  const r2 = await page.evaluate(() => {
    const app = window.lab;
    while (app.history.lastLabel && app.history.lastLabel !== 'Combine') app.history.undo();
    app.history.undo();
    const beakers = app.entities.filter((e) => e.catalogId === 'beaker250');
    return beakers.map((b) => b.contents.amount('elem:H'));
  });
  assert.ok(r2.some((v) => v > 100), 'combine undone: ' + r2);
});

await test('labels: formula on atoms, name on physical forms', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const w = app.molecules.spawnElement('H', new THREE_V(0.2, 1.4, -0.4), { diatomic: true });
    const b = app.entities.find((e) => e.isContainer && !e.contents.isEmpty);
    b.update(0.016);
    return { formula: w.identity.formula, tagVisible: b.tag.visible, name: b.contents.summary()[0].name };
  });
  assert.equal(r.formula, 'H2');
  assert.ok(r.tagVisible, 'container name tag shown');
  assert.ok(r.name && !/\d/.test(r.name), 'physical form labelled by name: ' + r.name);
  await look(-0.2, -0.35, [0, 0, 0]);
  await step(page, 0.1);
  await shot('15-labels');
});

await test('reset removes everything and restores the lab', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    app.resetLab();
    for (let i = 0; i < 30; i++) { app.renderEnabled = false; app.loop(performance.now(), null); }
    app.renderEnabled = true;
    return {
      molecules: app.molecules.molecules.length,
      equipment: app.entities.filter((e) => e.kind === 'equipment').length,
      machine: app.machine.state,
      portrait: app.periodicPanel.portrait,
    };
  });
  assert.equal(r.molecules, 0);
  assert.equal(r.equipment, 11);
  assert.equal(r.machine, 'idle');
  assert.equal(r.portrait, false);
  await look(0, -0.2, [0, 0, 0]);
  await step(page, 0.1);
  await shot('09-after-reset');
});

const fatal = errors.filter((e) => e.startsWith('[pageerror]') || (e.startsWith('[error]') && !e.includes('favicon')));
console.log(`browser: ${passed} tests passed`);
if (fatal.length) {
  console.log('Console errors:\n' + fatal.join('\n'));
  process.exitCode = 1;
}
await browser.close();
