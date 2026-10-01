import './style.css';
import * as THREE from 'three';
import { App } from './app/App.js';
import { Mixture } from './chem/Mixture.js';
import { SUBSTANCES } from './chem/substances.js';
import * as phases from './chem/phases.js';

// Handy for debugging from the console (and used by the automated tests).
window.THREE = THREE;
window.THREE_V = THREE.Vector3;
window.THREE_Q = THREE.Quaternion;
window.LabMixture = Mixture;
window.labSubstances = SUBSTANCES;
window.labPhases = phases;

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);

function showError(msg) {
  const el = $('error');
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(showError.t);
  showError.t = setTimeout(() => el.classList.add('hidden'), 9000);
}

async function installEmulator() {
  // ?emulate=1 → Meta's Immersive Web Emulation Runtime (desktop testing of the XR code
  // paths). ?emulate=1&room=living_room also loads a synthetic room for mixed reality.
  const { XRDevice, metaQuest3 } = await import('iwer');
  const device = new XRDevice(metaQuest3);
  device.installRuntime({ forceInstall: true });
  const room = params.get('room');
  if (room) {
    const { SyntheticEnvironmentModule } = await import('@iwer/sem');
    device.installSEM(SyntheticEnvironmentModule);
    device.sem.loadDefaultEnvironment(room);
  }
  window.xrDevice = device;
  return device;
}

async function main() {
  if (params.has('emulate')) {
    try {
      await installEmulator();
    } catch (e) {
      console.error(e);
      showError('Could not start the XR emulator: ' + e.message);
    }
  }

  const app = new App($('app'));
  window.lab = app;
  try {
    await app.init((t) => { $('loading-text').textContent = t; });
  } catch (e) {
    console.error(e);
    $('loading-text').textContent = 'Failed to start: ' + e.message;
    return;
  }
  $('loading').classList.add('hidden');
  $('modes').classList.remove('hidden');
  $('desktop-btn').classList.remove('hidden');

  // XR support
  const support = { vr: false, ar: false };
  if (navigator.xr) {
    try { support.vr = await navigator.xr.isSessionSupported('immersive-vr'); } catch { /* no */ }
    try { support.ar = await navigator.xr.isSessionSupported('immersive-ar'); } catch { /* no */ }
  }
  const buttons = document.querySelectorAll('.mode');
  buttons.forEach((b) => {
    const mode = b.dataset.mode;
    const ok = mode === 'lab' ? support.vr : support.ar;
    b.disabled = !ok;
    b.addEventListener('click', async () => {
      try {
        $('overlay').classList.add('hidden');
        $('desk-hud').classList.add('hidden');
        await app.startXR(mode);
      } catch (e) {
        console.error(e);
        $('overlay').classList.remove('hidden');
        showError('Could not start ' + (mode === 'lab' ? 'VR' : 'mixed reality') + ': ' + e.message);
      }
    });
  });
  const status = $('xr-status');
  if (!navigator.xr) {
    status.textContent = window.isSecureContext
      ? 'WebXR is not available in this browser. Open this page in the Meta Quest Browser to play in VR — or explore it here on screen.'
      : 'WebXR needs a secure (https://) connection. Open the https:// address of this page.';
  } else if (!support.vr && !support.ar) {
    status.textContent = 'No VR headset detected. Open this page in the Meta Quest Browser on your Quest 3 — or explore it here on screen.';
  } else if (!support.ar) {
    status.textContent = 'Mixed reality is not available on this device; the Virtual Lab works.';
  }

  const enterDesktop = () => {
    $('overlay').classList.add('hidden');
    $('desk-hud').classList.remove('hidden');
    app.audio.unlock();
    app.input.desktop.enabled = true;
  };
  $('desktop-btn').addEventListener('click', enterDesktop);
  $('menu-btn').addEventListener('click', () => {
    $('overlay').classList.remove('hidden');
    $('desk-hud').classList.add('hidden');
  });
  $('help-btn').addEventListener('click', () => $('help').classList.toggle('hidden'));
  app.events.on('sessionend', () => {
    $('overlay').classList.remove('hidden');
  });
  if (params.has('desktop')) enterDesktop();

  // Offline support / installable app
  if ('serviceWorker' in navigator && import.meta.env.PROD) {
    navigator.serviceWorker.register('./sw.js').catch(() => {});
  }
  window.dispatchEvent(new Event('lab-ready'));
}

main();
