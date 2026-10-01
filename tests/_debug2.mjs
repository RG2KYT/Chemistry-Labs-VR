import { launch, openLab, step } from './browser.mjs';
const browser = await launch();
const { page } = await openLab(browser, '?desktop', { width: 1100, height: 700 });
await page.evaluate(() => { window.lab.input.desktop.enabled = false; window.lab.camera.quaternion.setFromEuler(new THREE.Euler(-0.05, 0, 0, 'YXZ')); window.lab.rig.position.set(0, 0, -0.35); });
await step(page, 0.05);
await page.screenshot({ path: 'test-results/10-equipment-panel.png' });
// synthesizer pouring close-up
await page.evaluate(() => {
  const app = window.lab;
  const b = app.entities.find((e) => e.catalogId === 'beaker250');
  b.teleport(app.machine.toWorld(new THREE_V(0, 0.32, 0.04)), b.object.quaternion);
  const m = app.molecules.spawnElement('Br', new THREE_V(0, 1.2, -0.3), { diatomic: true });
  window.__m = m;
});
await step(page, 0.5);
await page.evaluate(() => window.lab.machine.feed(window.__m));
await step(page, 4.6);
await page.evaluate(() => {
  const app = window.lab;
  const nozzle = app.machine.toWorld(new THREE_V(0, 0.55, 0.04));
  const front = app.machine.toWorld(new THREE_V(0, 0.75, 0.75));
  app.rig.position.set(front.x, 0, front.z);
  app.camera.position.set(0, front.y, 0);
  app.camera.lookAt(nozzle);
});
await step(page, 0.05);
await page.screenshot({ path: 'test-results/11-bromine-pour.png' });
await step(page, 3);
await page.screenshot({ path: 'test-results/12-bromine-done.png' });
await browser.close();
