// WebXR tests using Meta's Immersive Web Emulation Runtime (an emulated Quest 3 with
// Touch Plus controllers / tracked hands, plus a synthetic room for mixed reality).
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { launch, BASE } from './browser.mjs';

const OUT = 'test-results';
fs.mkdirSync(OUT, { recursive: true });
const browser = await launch();
let passed = 0;

async function open(query) {
  const page = await browser.newPage({ viewport: { width: 1000, height: 640 } });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  await page.goto(BASE + query, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.lab && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 180000 });
  return { page, errors };
}

async function test(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    passed++;
    console.log(`  ✓ ${name} (${((Date.now() - t0) / 1000).toFixed(1)}s)`);
  } catch (e) {
    console.log(`  ✗ ${name}`);
    throw e;
  }
}

// Let the emulated XR frame loop run for a while.
const frames = (page, n) => page.evaluate((n) => new Promise((resolve) => {
  const session = window.lab.renderer.xr.getSession();
  let k = 0;
  const tick = () => { if (++k >= n) resolve(); else session.requestAnimationFrame(tick); };
  session.requestAnimationFrame(tick);
}), n);

{
  const { page, errors } = await open('?emulate=1');

  await test('emulated Quest 3 enters the Virtual Lab', async () => {
    const enabled = await page.evaluate(() => !document.querySelector('.mode[data-mode="lab"]').disabled);
    assert.ok(enabled, 'VR button enabled');
    await page.click('.mode[data-mode="lab"]');
    await page.waitForFunction(() => window.lab.inXR, null, { timeout: 60000 });
    await frames(page, 20);
    const r = await page.evaluate(() => ({
      hands: window.lab.input.xrHands.map((h) => ({ active: h.active, kind: h.kind, side: h.handedness })),
      equipment: window.lab.entities.filter((e) => e.kind === 'equipment').length,
    }));
    assert.ok(r.hands.every((h) => h.active && h.kind === 'controller'), JSON.stringify(r.hands));
    assert.equal(r.equipment, 11);
  });

  await test('controller grip grabs a beaker, lifts and releases it', async () => {
    const start = await page.evaluate(() => {
      const app = window.lab;
      const beaker = app.entities.find((e) => e.catalogId === 'beaker250');
      window.__b = beaker;
      const c = window.xrDevice.controllers.right;
      // Put the controller's grab point at the beaker (grip offset ≈ 3.5 cm forward).
      const p = beaker.worldBounds().getCenter(new THREE_V());
      c.position.set(p.x, p.y + 0.01, p.z + 0.035);
      c.quaternion.set(0, 0, 0, 1);
      return p.y;
    });
    await frames(page, 6);
    await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('squeeze', 1));
    await frames(page, 6);
    const held = await page.evaluate(() => window.lab.input.xrHands.find((h) => h.handedness === 'right').held?.entity === window.__b);
    assert.ok(held, 'beaker is held');
    await page.evaluate(() => { const c = window.xrDevice.controllers.right; c.position.y += 0.3; });
    await frames(page, 10);
    const lifted = await page.evaluate(() => window.__b.object.position.y);
    assert.ok(lifted > start + 0.2, 'lifted to ' + lifted);
    await page.screenshot({ path: `${OUT}/xr-01-holding.png` });
    await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('squeeze', 0));
    await frames(page, 60);
    const fell = await page.evaluate(() => ({ y: window.__b.object.position.y, removed: window.__b.removed }));
    assert.ok(fell.removed || fell.y < lifted - 0.1, 'fell after release');
  });

  await test('controller tip pokes the periodic table', async () => {
    await page.evaluate(() => {
      const app = window.lab;
      const panel = app.periodicPanel;
      const btn = panel.buttons.find((b) => b.id === 'el-O');
      const local = panel.pxToLocal(btn.x + btn.w / 2, btn.y + btn.h / 2, new THREE_V());
      panel.screen.updateWorldMatrix(true, false);
      const n = new THREE_V(0, 0, 1).applyQuaternion(panel.screen.getWorldQuaternion(new THREE_Q()));
      window.__pokeTarget = panel.screen.localToWorld(local.clone());
      window.__pokeNormal = n;
      // Aim the controller straight at the tile from 6 cm in front of it.
      const c = window.xrDevice.controllers.left;
      const from = window.__pokeTarget.clone().addScaledVector(n, 0.06);
      c.position.set(from.x, from.y, from.z);
      const q = new THREE_Q().setFromUnitVectors(new THREE_V(0, 0, -1), n.clone().negate());
      c.quaternion.set(q.x, q.y, q.z, q.w);
    });
    await frames(page, 6);
    // Push it through the screen
    for (let i = 0; i < 8; i++) {
      await page.evaluate(() => {
        const c = window.xrDevice.controllers.left;
        const n = window.__pokeNormal;
        c.position.set(c.position.x - n.x * 0.01, c.position.y - n.y * 0.01, c.position.z - n.z * 0.01);
      });
      await frames(page, 2);
    }
    const sel = await page.evaluate(() => window.lab.periodicPanel.selected.symbol);
    assert.equal(sel, 'O');
  });

  await test('trigger + laser taps the equipment list from a distance', async () => {
    const before = await page.evaluate(() => {
      const app = window.lab;
      const panel = app.equipmentPanel;
      const btn = panel.buttons.find((b) => b.id.startsWith('item-'));
      const local = panel.pxToLocal(btn.x + btn.w / 2, btn.y + btn.h / 2, new THREE_V());
      panel.screen.updateWorldMatrix(true, false);
      const target = panel.screen.localToWorld(local.clone());
      const c = window.xrDevice.controllers.right;
      const from = new THREE_V(0.15, 1.2, -0.1);
      c.position.set(from.x, from.y, from.z);
      const q = new THREE_Q().setFromUnitVectors(new THREE_V(0, 0, -1), target.clone().sub(from).normalize());
      c.quaternion.set(q.x, q.y, q.z, q.w);
      return app.entities.filter((e) => e.kind === 'equipment').length;
    });
    await frames(page, 6);
    await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('trigger', 1));
    await frames(page, 4);
    await page.screenshot({ path: `${OUT}/xr-02-laser.png` });
    await page.evaluate(() => window.xrDevice.controllers.right.updateButtonValue('trigger', 0));
    await frames(page, 4);
    const after = await page.evaluate(() => window.lab.entities.filter((e) => e.kind === 'equipment').length);
    assert.equal(after, before + 1);
  });

  await test('two controllers grab both panel handles and turn it', async () => {
    const r = await page.evaluate(() => {
      const app = window.lab;
      const panel = app.equipmentPanel;
      panel.handleGroup.updateWorldMatrix(true, false);
      const [top, bottom] = panel.handleSegments.map((s) => s.a.clone().lerp(s.b, 0.5).applyMatrix4(panel.handleGroup.matrixWorld));
      const L = window.xrDevice.controllers.left, R = window.xrDevice.controllers.right;
      // grab point is 3.5 cm in front of the controller along -Z
      R.quaternion.set(0, 0, 0, 1); L.quaternion.set(0, 0, 0, 1);
      R.position.set(top.x, top.y + 0.01, top.z + 0.035);
      L.position.set(bottom.x, bottom.y + 0.01, bottom.z + 0.035);
      window.__top = top; window.__bottom = bottom;
      return true;
    });
    assert.ok(r);
    await frames(page, 6);
    await page.evaluate(() => { window.xrDevice.controllers.right.updateButtonValue('squeeze', 1); window.xrDevice.controllers.left.updateButtonValue('squeeze', 1); });
    await frames(page, 6);
    const holds = await page.evaluate(() => window.lab.equipmentPanel.holds.length);
    assert.equal(holds, 2, 'both handles held');
    // Rotate the hands around the panel centre by 90° (top hand goes right, bottom goes left)
    await page.evaluate(() => {
      const c = window.__top.clone().add(window.__bottom).multiplyScalar(0.5);
      const half = window.__top.distanceTo(window.__bottom) / 2;
      const R = window.xrDevice.controllers.right, L = window.xrDevice.controllers.left;
      R.position.set(c.x + half, c.y + 0.01, c.z + 0.035);
      L.position.set(c.x - half, c.y + 0.01, c.z + 0.035);
    });
    await frames(page, 10);
    const mid = await page.evaluate(() => ({ k: window.lab.equipmentPanel.k, lp: window.lab.equipmentPanel.layoutPortrait }));
    await page.screenshot({ path: `${OUT}/xr-03-two-hand.png` });
    await page.evaluate(() => { window.xrDevice.controllers.right.updateButtonValue('squeeze', 0); window.xrDevice.controllers.left.updateButtonValue('squeeze', 0); });
    await frames(page, 30);
    const end = await page.evaluate(() => ({ portrait: window.lab.equipmentPanel.portrait, holds: window.lab.equipmentPanel.holds.length }));
    assert.equal(mid.lp, true, 'portrait while turned ' + JSON.stringify(mid));
    assert.equal(end.portrait, true);
    assert.equal(end.holds, 0);
  });

  await test('hand tracking: pinch grabs an atom', async () => {
    await page.evaluate(() => {
      window.xrDevice.primaryInputMode = 'hand';
    });
    await frames(page, 10);
    const kinds = await page.evaluate(() => window.lab.input.xrHands.map((h) => h.kind));
    assert.ok(kinds.every((k) => k === 'hand'), 'hands active: ' + kinds);
    // Spawn an atom right at the right hand's pinch point
    await page.evaluate(() => {
      const h = window.lab.input.xrHands.find((x) => x.handedness === 'right');
      window.__atom = window.lab.molecules.spawnElement('C', h.gripPosition.clone());
    });
    await frames(page, 3);
    await page.evaluate(() => window.xrDevice.hands.right.updatePinchValue(1));
    await frames(page, 6);
    const held = await page.evaluate(() => window.lab.input.xrHands.find((x) => x.handedness === 'right').held?.entity === window.__atom);
    await page.evaluate(() => window.xrDevice.hands.right.updatePinchValue(0));
    await frames(page, 4);
    assert.ok(held, 'atom pinched');
  });

  const fatal = errors.filter((e) => !/favicon|404/.test(e));
  if (fatal.length) console.log('errors:\n' + fatal.join('\n'));
  await page.close();
}

{
  const { page } = await open('?emulate=1&room=living_room');
  await test('mixed reality: room scan → physics + digital room', async () => {
    await page.click('.mode[data-mode="digital"]');
    await page.waitForFunction(() => window.lab.inXR, null, { timeout: 60000 });
    await frames(page, 90);
    const r = await page.evaluate(() => ({
      mode: window.lab.mode,
      planes: window.lab.roomScan.planes.size,
      meshes: window.lab.roomScan.meshes.size,
      labVisible: window.lab.labRoom.group.visible,
    }));
    await page.screenshot({ path: `${OUT}/xr-04-scanned-room.png` });
    assert.equal(r.mode, 'digital');
    assert.equal(r.labVisible, false);
    assert.ok(r.planes + r.meshes > 0, 'room data: ' + JSON.stringify(r));
  });
  await page.close();
}

console.log(`xr: ${passed} tests passed`);
await browser.close();
