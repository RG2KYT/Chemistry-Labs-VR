// Drinking from a container: bring its rim to your mouth and tip it.
//
// What happens is decided by real data: the substance's GHS hazard statements from PubChem
// (H300 "fatal if swallowed", H314 "causes severe burns" …), the pH of the liquid, its
// temperature and how much was swallowed. Water is just water; vinegar-strength acid is
// sour; concentrated acid, lye, methanol, antifreeze, liquid nitrogen or molten metal
// mean a blackout or death — then the lab resets. Every outcome explains why, because in a
// real lab you must never eat or drink anything.

import * as THREE from 'three';
import { Mixture } from '../chem/Mixture.js';
import { SUBSTANCES } from '../chem/substances.js';
import { baseOf } from '../chem/phases.js';
import { font, wrapLines } from '../ui/canvasUtil.js';

const _v = new THREE.Vector3();
const _q = new THREE.Quaternion();

const GHS_TEXT = {
  H300: 'fatal if swallowed', H301: 'toxic if swallowed', H302: 'harmful if swallowed', H304: 'may be fatal if swallowed and enters the airways',
  H314: 'causes severe skin burns and eye damage', H318: 'causes serious eye damage', H330: 'fatal if inhaled', H331: 'toxic if inhaled',
  H340: 'may cause genetic defects', H350: 'may cause cancer', H360: 'may damage fertility or the unborn child', H370: 'causes damage to organs',
  H372: 'causes damage to organs through prolonged exposure', H290: 'may be corrosive to metals', H336: 'may cause drowsiness or dizziness',
};

// Substances everyone should recognise get a specific, accurate explanation.
const SPECIAL = {
  water: { sev: 0, title: 'Gulp!', text: 'Just water — refreshing. (Lab water is still never for drinking: glassware may be contaminated.)' },
  steam: { sev: 2, title: 'Ouch!', text: 'Steam scalds far worse than boiling water — it releases extra heat as it condenses.' },
  nacl_aq: { sev: 1, title: 'Salty!', text: 'Salt water. A sip is harmless, but drinking sea water dehydrates you — your kidneys need more water to get rid of the salt.' },
  glucose_aq: { sev: 0, title: 'Sweet!', text: 'A sugar solution — glucose is the fuel your cells burn.' },
  carbonic_acid: { sev: 0, title: 'Fizzy!', text: 'Carbonic acid — CO₂ in water, the sour tingle of soda water.' },
  glycerol: { sev: 1, title: 'Sweet and syrupy', text: 'Glycerol tastes sweet and is used in food — but large amounts upset the stomach.' },
  ethanol: { sev: 1, title: 'You feel tipsy…', text: 'Ethanol is the alcohol in drinks. Pure (96 %) ethanol burns the throat; a large amount causes alcohol poisoning.', drunk: true, fatalMl: 120 },
  methanol: { sev: 4, title: 'You died', text: 'Methanol ("wood alcohol") is turned into formic acid by your liver. About 30 mL can blind you — more is fatal. It looks and smells like ethanol.' },
  ethylene_glycol: { sev: 4, title: 'You died', text: 'Ethylene glycol (antifreeze) tastes sweet but is metabolised into oxalic acid, which destroys the kidneys.' },
  'elem:Hg': { sev: 2, title: 'You feel sick', text: 'Liquid mercury mostly passes through the gut unabsorbed — the real danger is its vapour, which poisons the brain and kidneys.' },
  'elem:Br': { sev: 4, title: 'You died', text: 'Bromine is a fuming, corrosive liquid that burns tissue on contact and poisons the lungs.' },
  bleach: { sev: 3, title: 'You blacked out', text: 'Sodium hypochlorite (bleach) burns the mouth, throat and stomach.' },
  hydrogen_peroxide: { sev: 3, title: 'You blacked out', text: 'Concentrated hydrogen peroxide releases oxygen inside the stomach and burns tissue.' },
  hydrogen_cyanide: { sev: 4, title: 'You died', text: 'Hydrogen cyanide blocks cells from using oxygen — death within minutes.' },
};

const SEV_TITLES = ['Gulp!', 'Yuck!', 'You feel very sick', 'You blacked out', 'You died'];

export class Drinking {
  constructor(app) {
    this.app = app;
    this.swallowed = new Mixture();
    this.lastSip = -1;
    this.gulpT = 0;
    this.effect = null; // { kind, t, duration }
    this.buildOverlay();
  }

  mouth(out = new THREE.Vector3()) {
    const cam = this.app.camera;
    cam.updateMatrixWorld(true);
    return out.set(0, -0.075, -0.07).applyMatrix4(cam.matrixWorld);
  }

  /** Called every frame by containers that are pouring. True = the liquid goes into your mouth. */
  intercept(container, lip, dt) {
    if (this.effect && this.effect.kind !== 'tipsy' && this.effect.kind !== 'sick') return false;
    if (!container.isHeld) return false;
    const m = this.mouth(_v);
    if (lip.distanceTo(m) > 0.07) return false;
    const lv = container.contents.liquidVolume;
    if (lv <= 0.05) return false;
    const sip = container.contents.takeLiquid(Math.min(lv, 18 * dt));
    this.swallowed.temperature = sip.temperature;
    this.swallowed.addMixture(sip);
    this.lastSip = this.app.elapsed;
    this.gulpT -= dt;
    if (this.gulpT <= 0) {
      this.gulpT = 0.45;
      this.app.audio?.play('suck', { position: m, volume: 0.35, rate: 0.6 });
    }
    // Something deadly ends it after the first real mouthful (a few mL).
    const v = this.verdict(this.swallowed);
    if (v.sev >= 4 || (v.sev >= 3 && this.swallowed.total >= 4)) this.finish(v);
    return true;
  }

  update(dt) {
    if (this.swallowed.total > 0 && this.app.elapsed - this.lastSip > 0.6) this.finish(this.verdict(this.swallowed));
    this.updateEffect(dt);
  }

  /** Judge a swallowed mixture. Returns { sev 0..4, title, text, cause }. */
  verdict(mix) {
    const ml = mix.total;
    const T = mix.temperature;
    const out = { sev: 0, title: 'Gulp!', text: 'You drank it. Nothing much happened.', ml };
    const worse = (sev, title, text, extra = {}) => {
      if (sev > out.sev || (sev === out.sev && out.text.startsWith('You drank'))) Object.assign(out, { sev, title, text, ...extra });
    };
    // Temperature
    if (T > 300) worse(4, 'You died', `It was ${Math.round(T)} °C — molten matter destroys everything it touches.`);
    else if (T > 75) worse(2, 'Ouch — burnt mouth!', `It was ${Math.round(T)} °C. Liquids above about 70 °C scald the mouth and throat.`);
    else if (T < -60) worse(4, 'You died', `It was ${Math.round(T)} °C. Cryogenic liquids like liquid nitrogen boil violently inside the body — the expanding gas ruptures the stomach.`);
    else if (T < -5) worse(2, 'Frostbite!', `It was ${Math.round(T)} °C — cold enough to freeze the lips and tongue.`);
    // Acidity / alkalinity
    const pH = mix.pH;
    if (pH !== null) {
      if (pH < 1.2) worse(ml >= 4 ? 4 : 3, ml >= 4 ? 'You died' : 'You blacked out', `pH ${pH.toFixed(1)}: a strong acid. It burns through the mouth, throat and stomach lining.`);
      else if (pH < 2) worse(2, 'Burning sour!', `pH ${pH.toFixed(1)} — very acidic. It burns the mouth and throat.`);
      else if (pH < 3.2) worse(1, 'Sour!', `pH ${pH.toFixed(1)} — about as acidic as lemon juice or vinegar.`);
      if (pH > 12.8) worse(ml >= 4 ? 4 : 3, ml >= 4 ? 'You died' : 'You blacked out', `pH ${pH.toFixed(1)}: a strong base (alkali). Alkalis are even worse than acids — they dissolve tissue deep into the throat.`);
      else if (pH > 11) worse(2, 'Soapy and burning!', `pH ${pH.toFixed(1)} — strongly alkaline; it burns and tastes like soap.`);
    }
    // Each substance by its real hazard data
    const all = new Map(mix.items);
    for (const [id, v] of mix.suspended) all.set(id, (all.get(id) || 0) + v);
    for (const [id, amt] of all) {
      if (amt < 0.05) continue;
      const s = SUBSTANCES[id];
      const base = baseOf(s) || s;
      const sp = SPECIAL[id] || SPECIAL[base.id];
      if (sp) {
        let sev = sp.sev;
        if (sp.fatalMl && amt >= sp.fatalMl) sev = 3;
        worse(sev, sev === 3 && sp.fatalMl ? 'You blacked out' : sp.title, sev === 3 && sp.fatalMl ? 'That much pure ethanol is alcohol poisoning — breathing slows until you pass out.' : sp.text, { cause: s.name, tipsy: sp.drunk && sev < 3 });
        continue;
      }
      // A solution carries its solute's hazards, diluted.
      const solute = s.solute ? SUBSTANCES[s.solute] : null;
      const ghs = new Set([...(s.ghs || []), ...(base.ghs || []), ...(solute?.ghs || [])]);
      // Corrosives depend on concentration (5 % acetic acid is vinegar); poisons on the dose.
      const conc = amt / Math.max(1e-6, ml);
      const dilute = !!(s.solution && !s.acid && !s.base) || conc < 0.1;
      const name = s.name;
      const code = (c) => `GHS ${c}: "${GHS_TEXT[c]}"`;
      if (ghs.has('H300') && amt >= 0.3) worse(dilute ? 3 : 4, dilute ? 'You blacked out' : 'You died', `${name} is ${GHS_TEXT.H300} (${code('H300')}).`, { cause: name });
      else if (ghs.has('H301') && amt >= 0.5) worse(amt >= 5 && !dilute ? 4 : 3, amt >= 5 && !dilute ? 'You died' : 'You blacked out', `${name} is poisonous — ${code('H301')}.`, { cause: name });
      else if ((ghs.has('H300') || ghs.has('H301')) && amt > 0.05) worse(2, 'You feel very sick', `Only a trace of ${name}, but it is poisonous (${code(ghs.has('H300') ? 'H300' : 'H301')}).`, { cause: name });
      else if (ghs.has('H314') && !dilute) worse(amt >= 4 ? 4 : 3, amt >= 4 ? 'You died' : 'You blacked out', `${name} is corrosive — ${code('H314')}. Swallowed, it destroys the throat and stomach.`, { cause: name });
      else if (ghs.has('H304') && s.phase === 'liquid' && !dilute) worse(3, 'You blacked out', `${name}: ${code('H304')}. Solvents like this slip into the lungs when swallowed.`, { cause: name });
      else if (ghs.has('H370') && !dilute) worse(amt >= 10 ? 3 : 2, amt >= 10 ? 'You blacked out' : 'You feel very sick', `${name} ${GHS_TEXT.H370} (${code('H370')}).`, { cause: name });
      else if (ghs.has('H302')) worse(amt >= 40 ? 3 : 2, amt >= 40 ? 'You blacked out' : 'You feel very sick', `${name} is ${GHS_TEXT.H302} (${code('H302')}).`, { cause: name });
      else if ((ghs.has('H314') || ghs.has('H318')) && dilute) worse(1, 'Sour and stinging', `Diluted ${name.toLowerCase()} — like vinegar (5 % acetic acid). Concentrated, it would burn (${code('H314')}).`, { cause: name });
      else if (ghs.has('H314') || ghs.has('H318')) worse(2, 'It burns!', `${name} irritates and burns the mouth (${code(ghs.has('H314') ? 'H314' : 'H318')}).`, { cause: name });
      else if (!s.ghs?.length && !base.ghs?.length && !solute?.ghs?.length && id !== 'water') {
        worse(1, 'Unknown taste…', `Nobody has classified ${name} as dangerous — but you should never taste a chemical you don't know.`, { cause: name });
      }
    }
    if (out.sev === 0 && out.text.startsWith('You drank')) out.text = 'Nothing happened — but never drink anything in a lab.';
    out.title = out.title || SEV_TITLES[out.sev];
    return out;
  }

  finish(v) {
    this.swallowed = new Mixture();
    this.lastSip = -1;
    this.app.events.emit('drink', v);
    const tail = ' In a real lab, never eat or drink anything.';
    if (v.sev >= 3) {
      this.app.audio?.play(v.sev === 4 ? 'error' : 'denied', { volume: 0.8 });
      this.startEffect(v.sev === 4 ? 'death' : 'blackout', v.title, v.text + tail);
    } else if (v.sev === 2) {
      this.startEffect('sick', v.title, v.text);
      this.app.toasts.show(`${v.title} ${v.text}`, '#ffb35a', 6);
    } else {
      if (v.tipsy) this.startEffect('tipsy', v.title, v.text);
      this.app.toasts.show(`${v.title} ${v.text}`, v.sev === 0 ? '#8ff0c2' : '#ffd27a', 5);
    }
  }

  // ---- Screen effects (a sphere around the head + a message card) ----------------------

  buildOverlay() {
    this.veilMat = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0, side: THREE.BackSide, depthTest: false, depthWrite: false, toneMapped: false });
    this.veil = new THREE.Mesh(new THREE.SphereGeometry(0.3, 24, 16), this.veilMat);
    this.veil.renderOrder = 998;
    this.veil.frustumCulled = false;
    this.veil.visible = false;
    this.veil.userData.noPick = true;
    this.cardCanvas = document.createElement('canvas');
    this.cardCanvas.width = 1024;
    this.cardCanvas.height = 560;
    this.cardTex = new THREE.CanvasTexture(this.cardCanvas);
    this.cardTex.colorSpace = THREE.SRGBColorSpace;
    this.card = new THREE.Mesh(new THREE.PlaneGeometry(0.36, 0.197), new THREE.MeshBasicMaterial({ map: this.cardTex, transparent: true, opacity: 0, depthTest: false, depthWrite: false, toneMapped: false }));
    this.card.renderOrder = 999;
    this.card.position.set(0, 0, -0.28);
    this.card.visible = false;
    this.card.userData.noPick = true;
    this.app.camera.add(this.veil);
    this.app.camera.add(this.card);
  }

  drawCard(title, text, color) {
    const ctx = this.cardCanvas.getContext('2d');
    const W = this.cardCanvas.width, H = this.cardCanvas.height;
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = color;
    ctx.font = font(84, 900);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.fillText(title, W / 2, 30);
    ctx.fillStyle = '#e8eef6';
    ctx.font = font(36, 500);
    const lines = wrapLines(ctx, text, W - 100).slice(0, 8);
    lines.forEach((l, i) => ctx.fillText(l, W / 2, 150 + i * 46));
    this.cardTex.needsUpdate = true;
  }

  startEffect(kind, title, text) {
    const D = { death: 9, blackout: 8, sick: 5, tipsy: 12 }[kind];
    this.effect = { kind, t: 0, duration: D, reset: kind === 'death' || kind === 'blackout', didReset: false };
    const color = kind === 'death' ? '#ff5a4a' : kind === 'blackout' ? '#c6d4ff' : '#ffd27a';
    if (kind === 'death' || kind === 'blackout') this.drawCard(title, text, color);
    this.veil.visible = true;
    // let go of everything
    if (this.effect.reset) for (const h of this.app.input.hands) if (h.held) this.app.grab.release(h, true);
  }

  updateEffect(dt) {
    const e = this.effect;
    if (!e) return;
    e.t += dt;
    const t = e.t;
    if (e.kind === 'death' || e.kind === 'blackout') {
      // red (death) or blurry grey (blackout) → black → message → reset → fade back in
      const fadeIn = Math.min(1, t / 1.6);
      const fadeOut = Math.max(0, Math.min(1, (e.duration - t) / 1.6));
      const a = Math.min(fadeIn, fadeOut);
      if (e.kind === 'death') this.veilMat.color.setRGB(Math.max(0, 0.45 - t * 0.3), 0, 0);
      else this.veilMat.color.setRGB(Math.max(0, 0.25 - t * 0.15), Math.max(0, 0.25 - t * 0.15), Math.max(0, 0.28 - t * 0.15));
      this.veilMat.opacity = a;
      this.card.visible = t > 1.4 && t < e.duration - 1;
      this.card.material.opacity = Math.min(1, (t - 1.4) * 2) * Math.min(1, (e.duration - 1 - t) * 2);
      if (!e.didReset && t > e.duration * 0.62) {
        e.didReset = true;
        this.app.resetLab(true);
        this.app.toasts.clear();
      }
    } else if (e.kind === 'sick') {
      this.veilMat.color.setRGB(0.25, 0.4, 0.05);
      this.veilMat.opacity = 0.35 * Math.sin(Math.min(1, t / e.duration) * Math.PI) * (0.75 + 0.25 * Math.sin(t * 3));
    } else if (e.kind === 'tipsy') {
      this.veilMat.color.setRGB(0.35, 0.15, 0.4);
      this.veilMat.opacity = 0.18 * Math.sin(Math.min(1, t / e.duration) * Math.PI) * (0.7 + 0.3 * Math.sin(t * 1.3));
    }
    if (t >= e.duration) {
      this.effect = null;
      this.veil.visible = false;
      this.card.visible = false;
      this.veilMat.opacity = 0;
    }
  }

  get busy() {
    return !!(this.effect && this.effect.reset);
  }
}

void _q;
