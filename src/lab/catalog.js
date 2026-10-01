import * as THREE from 'three';
import { Container } from './Container.js';
import { Equipment } from './Equipment.js';
import { M, vesselGeometry, graduationTexture, lathe, volumeTable } from './materials.js';
import {
  BunsenBurner, HotPlate, Thermometer, PHMeter, Balance, Dropper, WashBottle, StirringRod, Spatula, Funnel,
  TestTubeRack, Tripod, Tongs,
} from './tools.js';
import { PortableFreezer, Matchstick, Matchbox } from './coldfire.js';

function mesh(geo, mat, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, mat);
  m.position.set(x, y, z);
  return m;
}

/** Convex hull points from an outer [r, y] profile. */
function hullFromProfile(profile, segs = 12) {
  const pts = [];
  for (const [r, y] of profile) {
    for (let i = 0; i < segs; i++) {
      const a = (i / segs) * Math.PI * 2;
      pts.push(Math.cos(a) * r, y, Math.sin(a) * r);
    }
  }
  return new Float32Array(pts);
}

/**
 * Hollow collider for an open vessel: a floor disk plus a ring of thin slabs along every
 * segment of the inside profile, so thermometers, stirring rods, matches … really go
 * inside (a solid collider would shove the vessel away instead).
 */
function hollowColliders(cavity, t = 0.0018) {
  const tw = Math.max(0.0008, t / 2 + 0.0003); // half thickness (≈ the glass wall)
  // Merge nearly collinear segments to keep the collider count down.
  const segs = [];
  for (let i = 1; i < cavity.length; i++) {
    const a = cavity[i - 1], b = cavity[i];
    const L = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (L < 1e-4) continue;
    const last = segs[segs.length - 1];
    if (last) {
      const d0 = [(last.b[0] - last.a[0]) / last.L, (last.b[1] - last.a[1]) / last.L];
      if (d0[0] * (b[0] - a[0]) / L + d0[1] * (b[1] - a[1]) / L > Math.cos((14 * Math.PI) / 180)) {
        last.b = b;
        last.L = Math.hypot(b[0] - last.a[0], b[1] - last.a[1]);
        continue;
      }
    }
    segs.push({ a, b, L });
  }
  const rMax = Math.max(...cavity.map((p) => p[0]));
  const N = Math.max(10, Math.min(18, Math.round((2 * Math.PI * rMax) / 0.012)));
  const out = [];
  const m = new THREE.Matrix4();
  const er = new THREE.Vector3(), et = new THREE.Vector3(), D = new THREE.Vector3(), Nn = new THREE.Vector3();
  for (const sg of segs) {
    const dx = (sg.b[0] - sg.a[0]) / sg.L, dy = (sg.b[1] - sg.a[1]) / sg.L;
    if (sg.a[0] < 0.002 && Math.abs(dy) < 0.35) {
      // Floor
      const y0 = Math.min(sg.a[1], sg.b[1]);
      const hh = Math.max(y0 / 2, 0.0015);
      out.push({ type: 'cylinder', hh, r: Math.max(sg.a[0], sg.b[0]) + tw, pos: [0, y0 - hh, 0] });
      continue;
    }
    const rm = (sg.a[0] + sg.b[0]) / 2, ym = (sg.a[1] + sg.b[1]) / 2;
    const rOut = Math.max(sg.a[0], sg.b[0]) + 2 * tw;
    const hx = rOut * Math.tan(Math.PI / N) * 1.08;
    for (let k = 0; k < N; k++) {
      const th = (k / N) * Math.PI * 2;
      er.set(Math.cos(th), 0, Math.sin(th));
      et.set(Math.sin(th), 0, -Math.cos(th)); // = −tangent, keeps the basis right-handed
      D.copy(er).multiplyScalar(dx).add(new THREE.Vector3(0, dy, 0));
      Nn.copy(er).multiplyScalar(dy).add(new THREE.Vector3(0, -dx, 0)); // outward normal
      m.makeBasis(et, D, Nn);
      const rot = new THREE.Quaternion().setFromRotationMatrix(m);
      const c = er.clone().multiplyScalar(rm).add(new THREE.Vector3(0, ym, 0)).addScaledVector(Nn, tw);
      out.push({ type: 'box', hx, hy: sg.L / 2 + tw * 0.5, hz: tw, pos: [c.x, c.y, c.z], rot: { x: rot.x, y: rot.y, z: rot.z, w: rot.w } });
    }
  }
  return out;
}

function cylinderCavity(r, bottom, top, fillet = 0.002) {
  return [[0, bottom], [r - fillet, bottom], [r, bottom + fillet], [r, top]];
}

function roundBottomCavity(r, bottom, top) {
  const pts = [[0, bottom]];
  for (let i = 1; i <= 6; i++) {
    const a = (i / 6) * (Math.PI / 2);
    pts.push([Math.sin(a) * r, bottom + r - Math.cos(a) * r]);
  }
  pts.push([r, top]);
  return pts;
}

/**
 * Glass vessel factory. opts: { cavity, t, material, marks, label, extra(model), colliders, mass }
 */
class Vessel extends Container {
  constructor(app, def) {
    super(app, def);
    const mat = def.material === 'porcelain' ? M.porcelain() : def.material === 'plastic' ? M.plasticTranslucent()
      : def.amber ? M.amberGlass() : M.glass();
    const shell = mesh(vesselGeometry(def.cavity, def.t ?? 0.0018, 40, def.lip !== false), mat);
    shell.renderOrder = def.material === 'porcelain' ? 0 : 3;
    this.model.add(shell);
    if (def.marks) {
      const top = def.cavity[def.cavity.length - 1][1];
      const bottom = def.cavity[0][1];
      const table = volumeTable(def.cavity);
      const R = def.cavity[def.cavity.length - 1][0] + (def.t ?? 0.0018) + 0.0004;
      const y0 = bottom + (top - bottom) * 0.06;
      const y1 = top - (top - bottom) * 0.04;
      const marks = [];
      for (const m of def.marks) {
        const h = table.heightFor(m.ml);
        if (h > y1 || h < y0) continue;
        marks.push({ v: (h - y0) / (y1 - y0), major: m.major, text: m.text });
      }
      const tex = graduationTexture(def.label, marks, { color: def.markColor });
      const decal = mesh(new THREE.CylinderGeometry(R, R, y1 - y0, 40, 1, true), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false }), 0, (y0 + y1) / 2, 0);
      decal.renderOrder = 4;
      decal.userData.noHighlight = true;
      this.model.add(decal);
    }
    def.extra?.(this.model, this);
    // Open vessels get hollow colliders; `keep` lists solid extras (feet, cork rings) to keep.
    this.colliderSpecs = def.hollow === false ? def.colliders
      : [...(def.keep || []).map((i) => def.colliders[i]), ...hollowColliders(def.cavity, def.t ?? 0.0018)];
    this.finalize();
  }
}

const glassMarks = (step, max, labelEvery) => {
  const out = [];
  for (let v = step; v <= max + 1e-6; v += step) out.push({ ml: v, major: v % labelEvery === 0, text: v % labelEvery === 0 ? String(v) : '' });
  return out;
};

function beakerDef(id, name, rIn, h, capacity, markStep, labelEvery, mass) {
  const cavity = cylinderCavity(rIn, 0.0025, h);
  return {
    id, name, category: 'Glassware', cls: Vessel, mass, capacity,
    desc: `${capacity} mL borosilicate beaker with a pouring lip.`,
    cavity, t: 0.0018,
    marks: glassMarks(markStep, capacity, labelEvery), label: `${capacity} mL`,
    colliders: [{ type: 'cylinder', hh: h / 2, r: rIn + 0.002, pos: [0, h / 2, 0] }],
  };
}

export const CATALOG = [
  beakerDef('beaker100', 'Beaker 100 mL', 0.0245, 0.07, 100, 10, 50, 0.06),
  beakerDef('beaker250', 'Beaker 250 mL', 0.0335, 0.095, 250, 25, 50, 0.11),
  beakerDef('beaker600', 'Beaker 600 mL', 0.044, 0.125, 600, 50, 100, 0.2),
  {
    ...beakerDef('plastic250', 'Plastic beaker (PP)', 0.034, 0.095, 250, 50, 50, 0.04),
    material: 'plastic', markColor: 'rgba(40,90,170,0.9)',
    desc: 'Polypropylene beaker. Unlike glass it resists hydrofluoric acid.',
  },
  {
    id: 'erlenmeyer250', name: 'Erlenmeyer flask', category: 'Glassware', cls: Vessel, mass: 0.12, capacity: 250,
    desc: 'Conical flask — swirl without spilling.',
    cavity: [[0, 0.0025], [0.038, 0.0025], [0.040, 0.007], [0.0385, 0.022], [0.016, 0.098], [0.0145, 0.104], [0.0145, 0.138]],
    marks: [{ ml: 50, text: '50', major: true }, { ml: 100, text: '100', major: true }, { ml: 150, text: '150', major: true }, { ml: 200, text: '200', major: true }],
    colliders: [{ type: 'hull', points: hullFromProfile([[0.042, 0], [0.042, 0.022], [0.0175, 0.1], [0.0175, 0.14]]) }],
  },
  {
    id: 'roundflask', name: 'Round-bottom flask', category: 'Glassware', cls: Vessel, mass: 0.12, capacity: 250,
    desc: 'Spherical flask sitting in a cork ring — ideal for even heating.',
    cavity: (() => {
      const R = 0.04, cy = 0.044, neck = 0.0125;
      const pts = [[0, cy - R]];
      for (let i = 1; i <= 14; i++) {
        const a = (i / 14) * (Math.PI - Math.asin(neck / R));
        pts.push([Math.sin(a) * R, cy - Math.cos(a) * R]);
      }
      pts.push([neck, 0.14]);
      return pts;
    })(),
    extra: (model) => {
      const ring = mesh(new THREE.TorusGeometry(0.026, 0.0085, 10, 28), M.cork(), 0, 0.007, 0);
      ring.rotation.x = Math.PI / 2;
      model.add(ring);
    },
    keep: [1],
    colliders: [
      { type: 'ball', r: 0.042, pos: [0, 0.044, 0] },
      { type: 'cylinder', hh: 0.008, r: 0.034, pos: [0, 0.008, 0] },
      { type: 'cylinder', hh: 0.03, r: 0.014, pos: [0, 0.11, 0] },
    ],
  },
  {
    id: 'volumetric100', name: 'Volumetric flask', category: 'Measuring', cls: Vessel, mass: 0.09, capacity: 110,
    desc: 'Precisely 100 mL at the etched line on its neck.',
    cavity: [[0, 0.0025], [0.03, 0.0025], [0.032, 0.008], [0.031, 0.04], [0.02, 0.066], [0.0065, 0.08], [0.0065, 0.2]],
    extra: (model) => {
      const line = mesh(new THREE.TorusGeometry(0.0085, 0.0005, 6, 24), new THREE.MeshBasicMaterial({ color: 0xffffff }), 0, 0.165, 0);
      line.rotation.x = Math.PI / 2;
      model.add(line);
    },
    colliders: [
      { type: 'hull', points: hullFromProfile([[0.034, 0], [0.034, 0.04], [0.022, 0.066], [0.008, 0.08]]) },
      { type: 'cylinder', hh: 0.06, r: 0.0085, pos: [0, 0.14, 0] },
    ],
  },
  {
    id: 'testtube', name: 'Test tube', category: 'Glassware', cls: Vessel, mass: 0.015, capacity: 25,
    desc: 'Small tube for quick reactions. Pop it in the rack.',
    cavity: roundBottomCavity(0.0075, 0.0015, 0.15), t: 0.0011,
    colliders: [{ type: 'capsule', hh: 0.067, r: 0.0088, pos: [0, 0.0758, 0] }],
  },
  {
    id: 'cylinder100', name: 'Graduated cylinder', category: 'Measuring', cls: Vessel, mass: 0.16, capacity: 110,
    desc: '100 mL measuring cylinder with fine graduations.',
    cavity: cylinderCavity(0.0135, 0.013, 0.26, 0.001), t: 0.0016,
    marks: glassMarks(5, 100, 20), label: '100 mL',
    extra: (model) => {
      const foot = mesh(new THREE.CylinderGeometry(0.04, 0.042, 0.011, 6), M.plasticBlue(), 0, 0.0055, 0);
      model.add(foot);
    },
    keep: [0],
    colliders: [
      { type: 'cylinder', hh: 0.0055, r: 0.04, pos: [0, 0.0055, 0] },
      { type: 'cylinder', hh: 0.124, r: 0.0155, pos: [0, 0.135, 0] },
    ],
  },
  {
    id: 'petri', name: 'Petri dish', category: 'Glassware', cls: Vessel, mass: 0.04, capacity: 40,
    desc: 'Shallow dish for crystals and small samples.',
    cavity: cylinderCavity(0.044, 0.0015, 0.014, 0.0015), t: 0.0012,
    colliders: [{ type: 'cylinder', hh: 0.007, r: 0.0455, pos: [0, 0.007, 0] }],
  },
  {
    id: 'watchglass', name: 'Watch glass', category: 'Glassware', cls: Vessel, mass: 0.03, capacity: 15,
    desc: 'Curved glass to evaporate small amounts or cover a beaker.',
    cavity: [[0, 0.0015], [0.02, 0.0035], [0.035, 0.0085], [0.045, 0.014]], t: 0.0012, lip: false,
    colliders: [{ type: 'hull', points: hullFromProfile([[0.006, 0], [0.025, 0.003], [0.047, 0.015]]) }],
  },
  {
    id: 'evapdish', name: 'Evaporating dish', category: 'Heat & cold', cls: Vessel, material: 'porcelain', mass: 0.12, capacity: 60,
    desc: 'Glazed porcelain dish — boil a solution away and crystals remain.',
    cavity: [[0, 0.004], [0.02, 0.0055], [0.036, 0.014], [0.046, 0.03]], t: 0.0028,
    colliders: [{ type: 'hull', points: hullFromProfile([[0.018, 0], [0.038, 0.012], [0.05, 0.031]]) }],
  },
  {
    id: 'crucible', name: 'Crucible', category: 'Heat & cold', cls: Vessel, material: 'porcelain', mass: 0.05, capacity: 12,
    desc: 'Heat-proof porcelain cup for very hot reactions.',
    cavity: [[0, 0.004], [0.011, 0.0045], [0.0185, 0.04]], t: 0.0025,
    colliders: [{ type: 'hull', points: hullFromProfile([[0.013, 0], [0.021, 0.041]]) }],
  },
  {
    id: 'mortar', name: 'Mortar', category: 'Tools', cls: Vessel, material: 'porcelain', mass: 0.35, capacity: 60,
    desc: 'Porcelain bowl to grind crystals with the stirring rod or a spatula.',
    cavity: [[0, 0.012], [0.02, 0.014], [0.036, 0.026], [0.043, 0.045]], t: 0.006,
    colliders: [{ type: 'hull', points: hullFromProfile([[0.03, 0], [0.045, 0.02], [0.05, 0.047]]) }],
  },
  {
    id: 'bottle', name: 'Reagent bottle', category: 'Glassware', cls: Vessel, amber: true, mass: 0.22, capacity: 250,
    desc: 'Amber glass bottle that protects light-sensitive chemicals.',
    cavity: [[0, 0.004], [0.031, 0.004], [0.033, 0.008], [0.033, 0.11], [0.027, 0.125], [0.012, 0.135], [0.012, 0.155]], t: 0.0025,
    colliders: [
      { type: 'cylinder', hh: 0.065, r: 0.036, pos: [0, 0.065, 0] },
      { type: 'cylinder', hh: 0.015, r: 0.015, pos: [0, 0.14, 0] },
    ],
  },
  { id: 'funnel', name: 'Funnel', category: 'Glassware', cls: Funnel, desc: 'Pour into narrow necks without spilling.' },
  { id: 'burner', name: 'Bunsen burner', category: 'Heat & cold', cls: BunsenBurner, desc: 'Press the red valve to light it. Hold samples in the flame for flame tests.' },
  { id: 'tripod', name: 'Tripod & gauze', category: 'Heat & cold', cls: Tripod, desc: 'Stand a beaker over the burner flame.' },
  { id: 'hotplate', name: 'Hot plate', category: 'Heat & cold', cls: HotPlate, desc: 'Flameless heating. Press the knob to switch on.' },
  { id: 'freezer', name: 'Portable freezer', category: 'Heat & cold', cls: PortableFreezer, desc: 'Fan-forced −30 °C cool box. Put a beaker inside to freeze it (water → ice). Blue = lid, green = power.' },
  { id: 'matches', name: 'Matchbox', category: 'Heat & cold', cls: Matchbox, desc: 'Press the red dot to take a match.' },
  { id: 'match', name: 'Matchstick', category: 'Heat & cold', cls: Matchstick, desc: 'Strike it quickly along the table (or pull the trigger) to light it. Lights flammable liquids and pops hydrogen.' },
  { id: 'thermometer', name: 'Thermometer', category: 'Measuring', cls: Thermometer, desc: 'Dip the bulb into a liquid to read its temperature.' },
  { id: 'phmeter', name: 'pH meter', category: 'Measuring', cls: PHMeter, desc: 'Dip the probe to measure acidity.' },
  { id: 'balance', name: 'Digital balance', category: 'Measuring', cls: Balance, desc: 'Weighs whatever rests on the pan. Blue button = tare.' },
  { id: 'dropper', name: 'Dropper', category: 'Tools', cls: Dropper, desc: 'Squeeze the bulb in a liquid to fill, squeeze again to release drops.' },
  { id: 'washbottle', name: 'Wash bottle', category: 'Tools', cls: WashBottle, desc: 'Distilled water. Squeeze (poke the blue band or pull the trigger) to squirt.' },
  { id: 'stirrod', name: 'Stirring rod', category: 'Tools', cls: StirringRod, desc: 'Stir to dissolve solids faster.' },
  { id: 'spatula', name: 'Spatula', category: 'Tools', cls: Spatula, desc: 'Scoop powders; tip it over to drop them. Hold a scoop in the flame for a flame test.' },
  { id: 'tongs', name: 'Crucible tongs', category: 'Tools', cls: Tongs, desc: 'For handling hot things.' },
  { id: 'rack', name: 'Test tube rack', category: 'Tools', cls: TestTubeRack, desc: 'Holds six test tubes upright.' },
];

export const CATALOG_BY_ID = Object.fromEntries(CATALOG.map((d) => [d.id, d]));
export const CATEGORIES = ['All', 'Glassware', 'Heat & cold', 'Measuring', 'Tools'];

/** Instantiate an item (not yet placed in the world). */
export function createEquipment(app, id) {
  const def = CATALOG_BY_ID[id];
  if (!def) throw new Error('Unknown equipment ' + id);
  const e = new def.cls(app, def);
  e.catalogId = id;
  return e;
}

export { Equipment };
