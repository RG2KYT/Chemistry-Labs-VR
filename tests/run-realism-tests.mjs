// Solids without containers, solid vs liquid behaviour, real reactions and colours,
// and drinking with realistic outcomes.
// Usage: npm run build && npx vite preview --port 4173 &  then  node tests/run-realism-tests.mjs
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
    console.log(errors.filter((x) => !x.includes('404')).join('\n'));
    throw e;
  }
}
const shot = (name) => page.screenshot({ path: `${OUT}/${name}.png` });
const view = (pos, at) => page.evaluate(({ pos, at }) => {
  const app = window.lab;
  app.camera.position.set(...pos);
  app.camera.lookAt(new THREE_V(...at));
}, { pos, at });

await page.evaluate(() => {
  const app = window.lab;
  app.input.desktop.enabled = false;
  app.input.desktop.hand.active = true;
  app.input.desktop.hand.resetMotion();
  window.run = (n) => { for (let i = 0; i < n; i++) { app.renderEnabled = false; app.loop(performance.now(), null); } app.renderEnabled = true; };
  window.sub = (n) => window.labSubstances[n] || Object.values(window.labSubstances).find((s) => s.name.toLowerCase() === n.toLowerCase());
  window.clearBench = () => { for (const e of app.entities.filter((e) => e.kind === 'equipment')) e.destroy(); };
});
await step(page, 0.1);

await test('the synthesizer drops a solid onto the tray when no container is docked', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab, m = app.machine;
    window.clearBench();
    m.form = 'natural';
    m.amountIndex = 1;
    m.lastProduct = window.sub('elem:Cu');
    m.repeat();
    window.run(60 * 6);
    const pieces = app.entities.filter((e) => e.isSolidPiece && !e.removed);
    return { state: m.state, msg: m.message, n: pieces.length, name: pieces[0]?.substance.name, g: pieces[0] && pieces[0].contents.solidVolume * pieces[0].substance.density, form: pieces[0]?.mesh.geometry.type };
  });
  assert.equal(r.n, 1, JSON.stringify(r));
  assert.equal(r.name, 'Copper');
  assert.ok(Math.abs(r.g - 50) < 2, 'about 50 g: ' + r.g);
  assert.match(r.msg, /tray/);
});

await test('liquids still need a container', async () => {
  const r = await page.evaluate(() => {
    const m = window.lab.machine;
    m.lastProduct = window.sub('water');
    m.repeat();
    window.run(30);
    const out = { state: m.state, msg: m.message };
    m.cancel();
    return out;
  });
  assert.equal(r.state, 'waiting');
  assert.match(r.msg, /needs a container/);
});

await test('an ice cube on the bench melts into a puddle; dropped in a beaker it floats', async () => {
  const r = await page.evaluate(async () => {
    const app = window.lab;
    window.clearBench();
    const { variantId } = window.labPhases;
    const ice = variantId('water', 'solid');
    const cube = app.spawnEquipment('piece', new THREE_V(0.1, 0.96, -0.6));
    cube.setSubstance(ice, 20, -10);
    window.run(60);
    const v0 = cube.contents.solidVolume;
    window.run(60 * 40);
    const v1 = cube.removed ? 0 : cube.contents.solidVolume;
    const puddles = app.fluids.puddles.length;
    // second cube into a beaker of water
    const b = app.spawnEquipment('beaker250', new THREE_V(-0.2, 0.93, -0.6));
    b.addSubstance('water', 120);
    window.run(20);
    const cube2 = app.spawnEquipment('piece', b.rim().center.add(new THREE_V(0, 0.04, 0)));
    cube2.setSubstance(ice, 15, -10);
    window.run(90);
    return { v0, v1, puddles, absorbed: cube2.removed, ice: b.contents.amount(ice), floating: b.floatingIce };
  });
  assert.ok(r.v1 < r.v0 * 0.8, `melting: ${r.v0} → ${r.v1}`);
  assert.ok(r.puddles > 0, 'melt water made a puddle');
  assert.ok(r.absorbed, 'cube went into the beaker');
  assert.ok(r.ice > 5 && r.floating, `ice floats in the water: ${JSON.stringify(r)}`);
});

await test('powder poured onto the bench piles up into a heap', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    window.clearBench();
    const b = app.spawnEquipment('beaker100', new THREE_V(0, 1.15, -0.6), new window.THREE.Quaternion().setFromAxisAngle(new THREE_V(0, 0, 1), 2.2));
    b.body.setGravityScale(0, true);
    b.body.setBodyType(app.physics.R.RigidBodyType.KinematicPositionBased, true);
    b.addSubstance('elem:S', 15);
    window.run(60 * 3);
    const heaps = app.entities.filter((e) => e.isSolidPiece && !e.removed && e.substance.id === 'elem:S');
    return { left: b.contents.solidVolume, heaps: heaps.length, vol: heaps.reduce((a, h) => a + h.contents.solidVolume, 0) };
  });
  assert.ok(r.left < 10, 'sulfur poured out: ' + JSON.stringify(r));
  assert.ok(r.heaps >= 1 && r.vol > 3, 'heap of sulfur on the bench: ' + JSON.stringify(r));
  await view([0.25, 1.25, -0.25], [0, 0.93, -0.6]);
  await step(page, 0.05);
  await shot('30-sulfur-heap');
});

await test('a powder stays put at a small tilt and pours past its angle of repose', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    window.clearBench();
    const res = {};
    for (const deg of [20, 65]) {
      const b = app.spawnEquipment('beaker100', new THREE_V(deg / 200, 1.1, -0.6), new window.THREE.Quaternion().setFromAxisAngle(new THREE_V(0, 0, 1), (deg * Math.PI) / 180));
      b.body.setBodyType(app.physics.R.RigidBodyType.KinematicPositionBased, true);
      b.addSubstance('nacl', 80); // a well-filled beaker spills sooner than a nearly empty one
      window.run(60);
      res[deg] = b.contents.solidVolume;
    }
    return res;
  });
  assert.ok(r[20] > 79.9, 'no spill at 20°: ' + r[20]);
  assert.ok(r[65] < 79, 'spills at 65°: ' + r[65]);
});

await test('real reactions in a beaker: black CuO dissolves in acid to a blue solution', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    window.clearBench();
    const b = app.spawnEquipment('beaker100', new THREE_V(0, 0.93, -0.6));
    b.addSubstance('cuo', 3);
    b.addSubstance('sulfuric_acid', 30);
    b.stirring = 1;
    window.run(60 * 25);
    const look = b.contents.liquidLook();
    return { cuo: b.contents.amount('cuo'), rgb: look.color, names: b.contents.summary().map((x) => x.name) };
  });
  assert.ok(r.cuo < 0.5, 'CuO dissolved: ' + JSON.stringify(r));
  assert.ok(r.rgb[2] > r.rgb[0] + 0.15, 'solution is blue: ' + JSON.stringify(r));
  assert.ok(r.names.some((n) => /copper\(II\) sulfate solution/i.test(n)));
  await view([0, 1.08, -0.42], [0, 0.97, -0.6]);
  await step(page, 0.05);
  await shot('31-cuso4-blue');
});

await test('precipitates and colours from the ion model', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    window.clearBench();
    const out = {};
    const pairs = [['agno3_aq', 'Potassium chromate'], ['cuso4_aq', 'naoh_aq'], ['pbno32_aq', 'ki_aq'], ['Iron(III) nitrate', 'naoh_aq']];
    pairs.forEach(([a, bName], i) => {
      const b = app.spawnEquipment('beaker100', new THREE_V(-0.3 + i * 0.15, 0.93, -0.6));
      const A = window.sub(a), B = window.sub(bName);
      if (A.phase === 'solid') { b.addSubstance(A.id, 2); b.addSubstance('water', 30); } else b.addSubstance(A.id, 25);
      if (B.phase === 'solid') { b.addSubstance(B.id, 2); b.addSubstance('water', 30); } else b.addSubstance(B.id, 25);
      b.stirring = 1;
      window.run(60 * 8);
      out[a + '+' + bName] = [...b.contents.suspended.keys(), ...b.contents.items.keys()].map((id) => window.labSubstances[id].name);
    });
    return out;
  });
  const flat = JSON.stringify(r);
  assert.match(flat, /Silver chromate/, flat);
  assert.match(flat, /Copper\(II\) hydroxide/, flat);
  assert.match(flat, /Lead\(II\) iodide/, flat);
  assert.match(flat, /Iron\(III\) hydroxide/, flat);
  await view([-0.07, 1.12, -0.38], [-0.07, 0.96, -0.6]);
  await step(page, 0.05);
  await shot('32-precipitates');
});

await test('drinking verdicts follow real hazard data', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    const { variantId } = window.labPhases;
    const v = (items, T = 22) => {
      const m = new window.LabMixture();
      for (const [id, ml] of items) m.add(window.sub(id).id, ml);
      m.temperature = T;
      const out = app.drinking.verdict(m);
      return [out.sev, out.title];
    };
    return {
      water: v([['water', 20]]),
      saltWater: v([['nacl_aq', 20]]),
      sugar: v([['glucose_aq', 20]]),
      ethanol: v([['ethanol', 15]]),
      methanol: v([['methanol', 15]]),
      hcl: v([['hydrochloric_acid', 10]]),
      lye: v([['naoh_aq', 10]]),
      vinegarish: v([['water', 50], ['acetic_acid', 1]]).concat(window.lab.drinking.verdict((() => { const m = new window.LabMixture(); m.add('water', 50); m.add('acetic_acid', 1); return m; })()).text),
      hotWater: v([['water', 20]], 90),
      ln2: v([[variantId('elem:N', 'liquid'), 10]], -196),
      mercury: v([['elem:Hg', 5]]),
      cuso4: v([['cuso4_aq', 10]]),
    };
  });
  assert.equal(r.water[0], 0, JSON.stringify(r));
  assert.equal(r.saltWater[0], 1);
  assert.equal(r.sugar[0], 0);
  assert.equal(r.ethanol[0], 1);
  assert.equal(r.methanol[0], 4);
  assert.equal(r.hcl[0], 4);
  assert.equal(r.lye[0], 4);
  assert.ok(r.vinegarish[0] <= 1, 'dilute acid is just sour ' + r.vinegarish);
  assert.equal(r.hotWater[0], 2);
  assert.equal(r.ln2[0], 4);
  assert.equal(r.mercury[0], 2);
  assert.ok(r.cuso4[0] >= 2, 'copper sulfate is harmful ' + r.cuso4);
});

async function drinkFrom(id, ml) {
  return page.evaluate(({ id, ml }) => {
    const app = window.lab;
    window.clearBench();
    app.drinking.effect = null;
    const hand = app.input.desktop.hand;
    const b = app.spawnEquipment('beaker100', new THREE_V(0, 0.93, -0.5));
    b.addSubstance(window.sub(id).id, ml);
    window.run(10);
    hand.gripPosition.copy(b.object.position);
    hand.gripQuaternion.identity();
    hand.setButtons(true, true);
    app.grab.grab(hand, b, null, 'near');
    let verdict = null;
    const off = app.events.on ? null : null;
    void off;
    app.events.on('drink', (v) => { verdict = verdict || v; });
    // bring the rim to the mouth and tip it, slowly
    for (let i = 0; i < 240 && !verdict; i++) {
      const tilt = Math.min(1.9, i / 60);
      hand.gripQuaternion.setFromAxisAngle(new THREE_V(1, 0, 0), -tilt).premultiply(app.camera.getWorldQuaternion(new window.THREE.Quaternion()));
      const mouth = app.drinking.mouth(new THREE_V());
      const rim = b.rim();
      const up = rim.normal;
      const down = new THREE_V(0, -1, 0);
      const dperp = down.clone().addScaledVector(up, -down.dot(up));
      if (dperp.lengthSq() > 1e-6) dperp.normalize();
      const lip = rim.center.clone().addScaledVector(dperp, rim.radius);
      hand.gripPosition.add(mouth.sub(lip).multiplyScalar(0.5));
      app.renderEnabled = false;
      app.loop(performance.now(), null);
    }
    window.run(60);
    app.renderEnabled = true;
    return { verdict: verdict && { sev: verdict.sev, title: verdict.title, text: verdict.text }, left: b.removed ? null : b.contents.liquidVolume, effect: app.drinking.effect?.kind || null };
  }, { id, ml });
}

await test('drinking water from a beaker: gulp, nothing bad happens', async () => {
  const r = await drinkFrom('water', 40);
  assert.ok(r.verdict, 'drank something: ' + JSON.stringify(r));
  assert.equal(r.verdict.sev, 0, JSON.stringify(r));
  assert.ok(r.left === null || r.left < 40, 'water level dropped');
  await page.evaluate(() => window.lab.grab.forceRelease(window.lab.input.desktop.hand));
});

await test('drinking concentrated acid: death screen, then the whole lab resets', async () => {
  const r = await drinkFrom('hydrochloric_acid', 30);
  assert.equal(r.verdict?.sev, 4, JSON.stringify(r));
  assert.equal(r.effect, 'death');
  await step(page, 2.5);
  await shot('33-death-screen');
  const after = await page.evaluate(() => {
    window.run(60 * 9);
    const app = window.lab;
    return { effect: app.drinking.effect?.kind || null, equipment: app.entities.filter((e) => e.kind === 'equipment' && !e.removed).length };
  });
  assert.equal(after.effect, null);
  assert.equal(after.equipment, 11, 'starter set back after the reset');
});

await test('solid pieces survive undo', async () => {
  const r = await page.evaluate(() => {
    const app = window.lab;
    window.clearBench();
    const p = app.spawnEquipment('piece', new THREE_V(0.2, 0.96, -0.6));
    p.setSubstance('nacl', 10);
    window.run(30);
    app.history.record('test');
    p.destroy();
    app.history.undo();
    const back = app.entities.filter((e) => e.isSolidPiece && !e.removed);
    return { n: back.length, name: back[0]?.substance.name, vol: back[0]?.contents.solidVolume };
  });
  assert.equal(r.n, 1);
  assert.equal(r.name, 'Sodium chloride');
  assert.ok(Math.abs(r.vol - 10) < 0.5);
});

await test('gallery of solid pieces renders without errors', async () => {
  await page.evaluate(() => {
    const app = window.lab;
    window.clearBench();
    const ids = ['elem:Au', 'elem:Cu', 'elem:S', 'nacl', 'sio2', 'kmno4', 'k2cr2o7', 'Iron disulfide', 'Mercury(II) sulfide', 'Resorcinol', 'elem:C', 'naoh'];
    ids.forEach((n, i) => {
      const p = app.spawnEquipment('piece', new THREE_V(-0.5 + (i % 6) * 0.2, 0.96, -0.72 + Math.floor(i / 6) * 0.22));
      p.setSubstance(window.sub(n).id, 25);
    });
    window.run(90);
  });
  await view([0, 1.4, -0.1], [0, 0.92, -0.62]);
  await step(page, 0.05);
  await shot('34-solid-gallery');
});

const fatal = errors.filter((e) => e.startsWith('[pageerror]') || (e.startsWith('[error]') && !e.includes('favicon') && !e.includes('404')));
const appErrors = await page.evaluate(() => (window.lab.errors || []).slice());
console.log(`realism: ${passed} tests passed`);
if (fatal.length || appErrors.length) {
  console.log('Errors:\n' + [...fatal, ...appErrors].join('\n'));
  process.exitCode = 1;
}
await browser.close();
