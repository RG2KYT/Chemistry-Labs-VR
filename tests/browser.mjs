// Shared helpers for the headless-browser tests.
import { chromium } from 'playwright-core';

export const BASE = process.env.LAB_URL || 'http://localhost:4173/';

export async function launch() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium',
    args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
  });
  return browser;
}

export async function openLab(browser, query = '?desktop', size = { width: 1280, height: 800 }) {
  const page = await browser.newPage({ viewport: size });
  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') errors.push(`[${m.type()}] ${m.text()}`);
  });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message + '\n' + e.stack));
  await page.goto(BASE + query, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.lab && window.lab.machine && document.getElementById('loading').classList.contains('hidden'), null, { timeout: 120000 });
  return { page, errors };
}

/** Advance the simulation deterministically by calling the loop directly. */
export async function step(page, seconds, dt = 1 / 60) {
  await page.evaluate(({ seconds, dt }) => {
    const app = window.lab;
    app.renderer.setAnimationLoop(null);
    const n = Math.max(1, Math.round(seconds / dt));
    app.clock.getDelta = () => dt;
    for (let i = 0; i < n; i++) {
      app.renderEnabled = i === n - 1;
      app.loop(performance.now(), null);
    }
    app.renderEnabled = true;
  }, { seconds, dt });
}
