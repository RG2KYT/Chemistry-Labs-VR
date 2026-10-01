import * as THREE from 'three';
import { Equipment } from './Equipment.js';
import { Mixture } from '../chem/Mixture.js';
import { react } from '../chem/reactions.js';
import { SUBSTANCES } from '../chem/substances.js';
import { glowFor } from '../chem/phases.js';
import { cavityFillGeometry, volumeTable, radiusAt } from './materials.js';
import { font, roundRect } from '../ui/canvasUtil.js';

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _down = new THREE.Vector3(0, -1, 0);
const _up = new THREE.Vector3(0, 1, 0);
const DISC = new THREE.CircleGeometry(1, 48).rotateX(-Math.PI / 2);
const CRYSTAL_GEOS = {
  cubic: new THREE.BoxGeometry(1, 1, 1),
  crystals: new THREE.OctahedronGeometry(0.7, 0),
  pellets: new THREE.SphereGeometry(0.6, 10, 6).scale(1, 0.45, 1),
  metal: new THREE.IcosahedronGeometry(0.6, 0),
  chunk: new THREE.DodecahedronGeometry(0.6, 0),
  ice: new THREE.BoxGeometry(1, 0.9, 1),
  needles: new THREE.CylinderGeometry(0.16, 0.16, 1.7, 6),
  flakes: new THREE.BoxGeometry(1.1, 0.12, 0.8),
  glassy: new THREE.DodecahedronGeometry(0.6, 0),
};
const THERMAL_LIMIT = { glass: 600, plastic: 160, porcelain: 1650 };

/**
 * Glassware that holds substances. Liquids are rendered with a world-space clipping plane
 * so the surface always stays level when the vessel tilts; tilt it past the rim and it pours.
 */
export class Container extends Equipment {
  constructor(app, def) {
    super(app, def);
    this.isContainer = true;
    this.contents = new Mixture();
    this.cavity = def.cavity; // [[r, y]] inner profile, bottom -> rim (local coords)
    this.table = volumeTable(this.cavity);
    this.capacity = def.capacity ?? Math.round(this.table.capacity);
    this.rimY = this.cavity[this.cavity.length - 1][1];
    this.rimR = this.cavity[this.cavity.length - 1][0];
    this.bottomY = this.cavity[0][1];
    this.stirring = 0;
    this.heatRate = 0;
    this.flameContact = false;
    this.pouring = null;
    this.solidPouring = null;
    this.lastVersion = -1;
    this.labelT = 0;
    this.etch = 0;
    this.fx = { fizz: 0, boil: 0, steam: 0, smoke: 0 };
    this.fxLoops = {};
    this.buildContentMeshes();
  }

  buildContentMeshes() {
    // Liquid: cavity solid clipped by a horizontal world plane.
    this.clipPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    this.liquidMat = new THREE.MeshPhysicalMaterial({
      color: 0xd6ecff, transparent: true, opacity: 0.3, roughness: 0.06, metalness: 0,
      clearcoat: 0.15, depthWrite: false, clippingPlanes: [this.clipPlane], side: THREE.FrontSide, envMapIntensity: 0.9,
    });
    this.liquid = new THREE.Mesh(cavityFillGeometry(this.cavity, 0.0007, 36), this.liquidMat);
    this.liquid.renderOrder = 1;
    this.liquid.userData.noPick = true;
    this.liquid.userData.noHighlight = true;
    this.liquid.visible = false;
    this.surfaceMat = this.liquidMat.clone();
    this.surfaceMat.clippingPlanes = [];
    this.surfaceMat.side = THREE.DoubleSide;
    this.surface = new THREE.Mesh(DISC, this.surfaceMat);
    this.surface.renderOrder = 1;
    this.surface.userData.noPick = true;
    this.surface.userData.noHighlight = true;
    this.surface.visible = false;

    // Solids: cavity solid clipped by a plane that moves with the vessel.
    this.solidPlane = new THREE.Plane(new THREE.Vector3(0, -1, 0), 0);
    this.solidMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, clippingPlanes: [this.solidPlane] });
    this.solid = new THREE.Mesh(cavityFillGeometry(this.cavity, 0.0009, 36), this.solidMat);
    this.solid.userData.noPick = true;
    this.solid.userData.noHighlight = true;
    this.solid.visible = false;
    this.solidTopMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
    this.solidTop = new THREE.Mesh(DISC, this.solidTopMat);
    this.solidTop.userData.noPick = true;
    this.solidTop.userData.noHighlight = true;
    this.solidTop.visible = false;
    this.solidTop.scale.setScalar(0.001);
    this.crystals = null;

    // Gas: tinted volume
    this.gasMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, toneMapped: false });
    this.gas = new THREE.Mesh(cavityFillGeometry(this.cavity, 0.001, 24), this.gasMat);
    this.gas.renderOrder = 2;
    this.gas.userData.noPick = true;
    this.gas.userData.noHighlight = true;
    this.gas.visible = false;

    // Foam
    this.foamMat = new THREE.MeshStandardMaterial({ color: 0xfbfbf6, roughness: 1 });
    this.foamMesh = new THREE.Mesh(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), this.foamMat);
    this.foamMesh.userData.noPick = true;
    this.foamMesh.userData.noHighlight = true;
    this.foamMesh.visible = false;
    this.foamMesh.scale.setScalar(0.001);

    this.object.add(this.liquid, this.solid, this.solidTop, this.gas, this.foamMesh);
    // The surface disc lives in world space (it is always horizontal).
    this.app.scene.add(this.surface);

    // Contents tag
    this.tagCanvas = document.createElement('canvas');
    this.tagCanvas.width = 512;
    this.tagCanvas.height = 200;
    this.tag = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(this.tagCanvas), transparent: true, depthWrite: false, toneMapped: false }));
    this.tag.material.map.colorSpace = THREE.SRGBColorSpace;
    this.tag.renderOrder = 6;
    this.tag.visible = false;
    this.tag.userData.noPick = true;
    this.app.scene.add(this.tag);
  }

  // ------------------------------------------------------------------------------------
  // Contents

  /** Add a whole Mixture (pouring, machine output). Returns the amount accepted. */
  receive(mix) {
    this.contents.addMixture(mix);
    this.labelT = 3;
    return mix.total;
  }

  addSubstance(id, ml) {
    const s = SUBSTANCES[id];
    if (!s) return;
    if (s.phase === 'gas') this.contents.add(id, Math.min(ml, this.capacity * 1.2));
    else this.contents.add(id, ml);
    this.labelT = 3;
  }

  get freeVolume() {
    return Math.max(0, this.capacity - this.contents.total);
  }

  /** World-space rim centre / radius / normal. */
  rim(out = {}) {
    this.object.updateWorldMatrix(true, false);
    out.center = (out.center || new THREE.Vector3()).set(0, this.rimY, 0).applyMatrix4(this.object.matrixWorld);
    out.normal = (out.normal || new THREE.Vector3()).set(0, 1, 0).applyQuaternion(this.object.quaternion);
    out.radius = this.rimR * this.object.scale.x;
    return out;
  }

  /** Height (local) of the solid layer and of the liquid top (upright reference). */
  levels() {
    const sv = this.contents.solidVolume;
    const lv = this.contents.liquidVolume;
    const hs = this.table.heightFor(sv);
    const hl = this.table.heightFor(sv + lv);
    return { hs, hl, sv, lv };
  }

  /** World Y of the liquid surface and a world point on it (on the vessel axis). */
  liquidSurfacePoint(out = new THREE.Vector3()) {
    const { hl } = this.levels();
    this.object.updateWorldMatrix(true, false);
    return out.set(0, hl, 0).applyMatrix4(this.object.matrixWorld);
  }

  /** Is a world point inside the liquid of this container? */
  pointInLiquid(p) {
    this.object.updateWorldMatrix(true, false);
    const local = this.object.worldToLocal(_v.copy(p));
    const { hl, lv, sv } = this.levels();
    if (lv + sv < 0.3) return false;
    if (local.y < this.bottomY - 0.003 || local.y > this.rimY) return false;
    const r = radiusAt(this.cavity, local.y);
    if (Math.hypot(local.x, local.z) > r) return false;
    const surfaceY = this.liquidSurfacePoint(_v2).y;
    return p.y <= surfaceY + 0.002 && local.y <= hl + 0.02;
  }

  pointInSolid(p) {
    this.object.updateWorldMatrix(true, false);
    const local = this.object.worldToLocal(_v.copy(p));
    const { hs, sv } = this.levels();
    if (sv < 0.05) return false;
    const r = radiusAt(this.cavity, local.y);
    return local.y <= hs + 0.008 && local.y >= this.bottomY - 0.005 && Math.hypot(local.x, local.z) <= r;
  }

  pointInside(p) {
    this.object.updateWorldMatrix(true, false);
    const local = this.object.worldToLocal(_v.copy(p));
    if (local.y < this.bottomY - 0.003 || local.y > this.rimY + 0.005) return false;
    return Math.hypot(local.x, local.z) <= radiusAt(this.cavity, local.y) + 0.002;
  }

  // ------------------------------------------------------------------------------------

  update(dt) {
    super.update(dt);
    if (this.disabled) {
      this.hideContents();
      return;
    }
    this.stirring = Math.max(0, this.stirring - dt * 1.5);
    this.updateHeat();

    // Chemistry
    const events = this.contents.isEmpty && !this.contents.burning ? [] : react(this.contents, dt, {
      heatRate: this.heatRate,
      flame: this.flameContact,
      stirring: this.stirring,
      envTemp: this.envTemp ?? undefined,
    });
    this.handleEvents(events, dt);
    this.checkThermalShock();
    if (this.contents.foam > 0) this.updateFoamOverflow(dt);

    this.updatePouring(dt);
    this.updateEtching(dt);
    this.updateVisuals(dt);
    this.updateTag(dt);
  }

  updateHeat() {
    let rate = 0;
    let flame = false;
    let env = null;
    for (const src of this.app.heatSources) {
      if (src.removed || src === this) continue;
      const h = src.heatFor(this);
      if (h) {
        rate += h.rate || 0;
        flame = flame || !!h.flame;
        if (h.env !== undefined) env = env === null ? h.env : Math.min(env, h.env);
      }
    }
    this.heatRate = rate;
    this.flameContact = flame;
    this.envTemp = env;
  }

  handleEvents(events, dt) {
    const fx = this.app.effects;
    const sp = this.liquidSurfacePoint(new THREE.Vector3());
    const r = radiusAt(this.cavity, this.levels().hl) * 0.8;
    const rnd = () => sp.clone().add(new THREE.Vector3((Math.random() - 0.5) * r * 1.6, 0, (Math.random() - 0.5) * r * 1.6));
    let fizz = 0, boil = 0, burning = null;
    for (const e of events) {
      switch (e.type) {
        case 'fizz':
        case 'dissolve':
          fizz = Math.max(fizz, e.type === 'fizz' ? e.intensity : e.intensity * 0.3);
          break;
        case 'boil':
          boil = Math.max(boil, e.intensity);
          break;
        case 'steam':
          if (Math.random() < e.intensity * dt * 30) fx.steam(rnd(), 1.5);
          break;
        case 'smoke':
          if (Math.random() < e.intensity * dt * 20) fx.smoke(rnd(), e.color, 0.35, 0.03, 0.18);
          break;
        case 'sparks':
          if (Math.random() < dt * 25 * e.intensity) fx.spark(rnd(), e.color, 3, 0.6);
          break;
        case 'surfaceFlame':
          if (Math.random() < dt * 30) fx.glow.emit(rnd(), new THREE.Vector3(0, 0.25, 0), e.color, 0.8, 0.02, 0.35, { grow: 0.02 });
          if (Math.random() < dt * 4) this.app.audio?.play('pop', { position: sp, volume: 0.35 });
          break;
        case 'explode':
          fx.flash(sp, 0xffe0a0, 0.4);
          fx.spark(sp, 0xffc070, 30, 2.5);
          this.app.audio?.play('bang', { position: sp, volume: 1 });
          setTimeout(() => !this.removed && this.shatter(), 30);
          return;
        case 'precipitate':
          if (!this._pptSound || performance.now() - this._pptSound > 1500) {
            this._pptSound = performance.now();
            this.labelT = 3;
          }
          break;
        case 'foam':
          fizz = Math.max(fizz, 0.6);
          break;
        case 'ignite':
          fx.flash(sp, 0xffb25a, 0.15);
          this.app.audio?.play('whoosh', { position: sp, volume: 0.7 });
          break;
        case 'burning':
          burning = e.color;
          break;
        case 'pop':
          this.app.audio?.play('pop', { position: sp, volume: 0.8 });
          fx.flash(this.rim().center, 0xffd27a, 0.08);
          break;
        case 'bang':
          this.app.audio?.play('bang', { position: sp, volume: 1 });
          fx.flash(this.rim().center, 0xffe6a0, 0.3);
          break;
        case 'flash':
          fx.flash(sp, e.color, 0.25);
          break;
        case 'neutralize':
          if (Math.random() < dt * 8) fx.bubble(rnd(), 0xffffff, 0.003, 0.05, 0.4);
          break;
        default:
          break;
      }
    }
    // Bubbles
    if (fizz > 0 && this.contents.liquidVolume > 0.5) {
      const n = fizz * 60 * dt;
      for (let i = 0; i < n || Math.random() < n; i++) {
        const b = sp.clone().add(new THREE.Vector3((Math.random() - 0.5) * r * 1.6, -Math.random() * 0.03, (Math.random() - 0.5) * r * 1.6));
        fx.bubble(b, 0xffffff, 0.002 + Math.random() * 0.003, 0.06 + Math.random() * 0.06, 0.35);
        if (i > 6) break;
      }
    }
    if (boil > 0) {
      for (let i = 0; i < 3; i++) if (Math.random() < boil * dt * 40) fx.bubble(rnd().add(new THREE.Vector3(0, -0.01, 0)), 0xffffff, 0.004, 0.12, 0.25);
      if (Math.random() < boil * dt * 12) fx.steam(rnd());
    }
    this.setLoop('fizz', fizz * 0.6, sp);
    this.setLoop('boil', boil * 0.7, sp);
    this.setLoop('flame', burning ? 0.5 : 0, sp);
    if (burning) {
      if (Math.random() < dt * 40) fx.glow.emit(rnd(), new THREE.Vector3((Math.random() - 0.5) * 0.05, 0.35, (Math.random() - 0.5) * 0.05), burning, 0.75, 0.025, 0.4, { grow: 0.03 });
      if (Math.random() < dt * 6) fx.smoke(sp.clone().add(new THREE.Vector3(0, 0.12, 0)), 0x777777, 0.15, 0.03);
    }
    this.burningColor = burning;
  }

  /** Glass cracks when it gets far too hot (molten metals belong in a crucible). */
  checkThermalShock() {
    const limit = THERMAL_LIMIT[this.material];
    if (!limit || this.removed) return;
    if (this.contents.temperature > limit && !this.contents.isEmpty) {
      const msg = this.material === 'plastic'
        ? `The plastic melted at ${Math.round(this.contents.temperature)} °C!`
        : `The ${this.name.toLowerCase()} cracked from the heat (${Math.round(this.contents.temperature)} °C). Use a crucible for molten metal.`;
      this.app.toasts.show(msg, '#ffb35a', 3.5);
      this.shatter();
    }
  }

  setLoop(name, vol, pos) {
    let h = this.fxLoops[name];
    if (vol > 0.01) {
      if (!h && this.app.audio?.ctx) h = this.fxLoops[name] = this.app.audio.loop(name, { position: pos, volume: 0 });
      if (h) { h.setVolume(vol); h.setPosition(pos); }
    } else if (h) {
      h.setVolume(0);
      if (!h._stopTimer) h._stopTimer = setTimeout(() => { h.stop(); if (this.fxLoops[name] === h) delete this.fxLoops[name]; }, 600);
    }
    if (h && vol > 0.01 && h._stopTimer) { clearTimeout(h._stopTimer); h._stopTimer = null; }
  }

  updateFoamOverflow(dt) {
    const { hl } = this.levels();
    const foamH = this.contents.foam / (Math.PI * this.rimR * this.rimR * 1e6);
    const over = hl + foamH - this.rimY;
    if (over > 0) {
      const rim = this.rim();
      for (let i = 0; i < Math.min(6, over * 400 * dt + Math.random()); i++) {
        const a = Math.random() * Math.PI * 2;
        const p = rim.center.clone().add(new THREE.Vector3(Math.cos(a) * rim.radius, 0.005, Math.sin(a) * rim.radius));
        const v = new THREE.Vector3(Math.cos(a) * 0.08, 0.05 + Math.random() * 0.1, Math.sin(a) * 0.08);
        this.app.effects.soft.emit(p, v, 0xfbfbf6, 0.95, 0.012 + Math.random() * 0.01, 1.4, { gravity: 1.5, drag: 0.8, floorY: this.app.effects.floorBelow(p) });
      }
      this.contents.foam = Math.max(0, this.contents.foam - over * 1e6 * Math.PI * this.rimR * this.rimR * 0.5 * dt);
    }
  }

  updateEtching(dt) {
    if (this.material !== 'glass' || !this.contents.etchesGlass) return;
    this.etch += dt / 18;
    this.labelT = 2;
    for (const m of this.highlightMaterials) {
      if (m.transparent && m.opacity < 0.5) {
        m.roughness = 0.04 + this.etch * 0.8;
        m.opacity = 0.2 + this.etch * 0.35;
      }
    }
    if (this.etch >= 1) {
      this.app.events.emit('toast', 'Hydrofluoric acid ate through the glass! Use a plastic beaker for HF.');
      this.shatter();
    }
  }

  // ------------------------------------------------------------------------------------
  // Pouring

  updatePouring(dt) {
    const c = this.contents;
    const up = this.upVector(_v2);
    const rim = this.rim();
    const lv = c.liquidVolume;
    let rate = 0;
    let lip = null;
    // Lowest point of the rim (direction of "down" projected onto the rim plane)
    const dperp = _down.clone().addScaledVector(up, -_down.dot(up));
    const sinTilt = dperp.length();
    if (sinTilt > 1e-3) dperp.divideScalar(sinTilt);
    else dperp.set(1, 0, 0);
    const lowest = rim.center.clone().addScaledVector(dperp, rim.radius);

    if (lv > 0.05) {
      const surfaceY = this.liquidSurfacePoint(_v).y;
      let overflow = surfaceY - lowest.y;
      if (up.y < 0.05) overflow = Math.max(overflow, 0.05);
      if (overflow > 0) {
        rate = Math.min(500, Math.max(4, 2.2e7 * rim.radius * rim.radius * overflow));
        lip = lowest;
      }
    }
    if (rate > 0 && lip) {
      if (!this.pouring) this.app.history?.record('Pour', { debounce: 4 });
      const ml = Math.min(lv, rate * dt);
      const portion = c.takeLiquid(ml);
      const out = dperp.clone();
      out.y = 0;
      if (out.lengthSq() < 1e-6) out.set(1, 0, 0);
      out.normalize();
      const origin = lip.clone().addScaledVector(out, 0.003);
      const vel = out.multiplyScalar(0.12 + Math.min(0.5, rate / 900)).add(new THREE.Vector3(0, -0.05, 0));
      if (this.body) {
        const bv = this.body.linvel();
        vel.add(_v.set(bv.x, bv.y, bv.z).multiplyScalar(0.5));
      }
      this.pouring = this.app.fluids.pour(this, this.pouring, origin, vel, portion, rate);
    } else if (this.pouring) {
      this.app.fluids.stop(this.pouring);
      this.pouring = null;
    }

    // Solids slide out when the vessel is turned past horizontal.
    const sv = c.solidVolume;
    if (sv > 0.02 && up.y < -0.15) {
      const srate = 25 * Math.min(1, -up.y * 2);
      const portion = c.takeSolid(Math.min(sv, srate * dt));
      const origin = rim.center.clone().addScaledVector(dperp, rim.radius * 0.6);
      this.solidPouring = this.app.fluids.pour(this, this.solidPouring, origin, new THREE.Vector3(0, -0.2, 0), portion, srate, true);
    } else if (this.solidPouring) {
      this.app.fluids.stop(this.solidPouring);
      this.solidPouring = null;
    }
  }

  // ------------------------------------------------------------------------------------
  // Visuals

  hideContents() {
    this.liquid.visible = this.surface.visible = this.solid.visible = this.solidTop.visible = this.gas.visible = this.foamMesh.visible = false;
    if (this.crystals) this.crystals.visible = false;
    this.tag.visible = false;
  }

  updateVisuals() {
    const c = this.contents;
    const { hs, hl, sv, lv } = this.levels();
    this.object.updateWorldMatrix(true, false);
    const up = this.upVector(_v2);

    // Solid layer
    const showSolid = sv > 0.02;
    this.solid.visible = this.solidTop.visible = showSolid;
    if (showSolid) {
      const s = c.dominant('solid');
      this.solidMat.color.set(s.color);
      this.solidMat.metalness = s.metalness || 0;
      this.solidMat.roughness = s.form === 'powder' ? Math.max(0.6, s.roughness) : s.roughness;
      this.solidTopMat.color.copy(this.solidMat.color);
      this.solidTopMat.metalness = this.solidMat.metalness;
      this.solidTopMat.roughness = this.solidMat.roughness;
      const glow = glowFor(c.temperature);
      if (glow) {
        this.solidMat.emissive.setRGB(glow.r, glow.g, glow.b);
        this.solidMat.emissiveIntensity = glow.intensity;
      } else if (s.emissive) {
        this.solidMat.emissive.set(s.emissive);
        this.solidMat.emissiveIntensity = s.emissiveIntensity;
      } else {
        this.solidMat.emissive.setHex(0);
      }
      this.solidTopMat.emissive.copy(this.solidMat.emissive);
      this.solidTopMat.emissiveIntensity = this.solidMat.emissiveIntensity;
      const translucent = !!s.translucent;
      if (this.solidMat.transparent !== translucent) {
        for (const mm of [this.solidMat, this.solidTopMat]) { mm.transparent = translucent; mm.needsUpdate = true; }
      }
      this.solidMat.opacity = this.solidTopMat.opacity = translucent ? 0.72 : 1;
      // Ice floats: cubes bob at the liquid surface instead of lying on the bottom.
      this.floatingIce = s.form === 'ice' && lv > 0.5;
      this.solid.visible = this.solidTop.visible = !this.floatingIce;
      const p = _v.set(0, hs, 0).applyMatrix4(this.object.matrixWorld);
      this.solidPlane.normal.copy(up).negate();
      this.solidPlane.constant = -this.solidPlane.normal.dot(p);
      const rTop = radiusAt(this.cavity, hs) - 0.0009;
      this.solidTop.position.set(0, hs, 0);
      this.solidTop.scale.set(rTop, 1, rTop);
      this.updateCrystals(s, this.floatingIce ? hl - 0.004 : hs, this.floatingIce ? radiusAt(this.cavity, Math.min(hl, this.rimY)) - 0.002 : rTop, sv, glow);
    } else if (this.crystals) {
      this.crystals.visible = false;
    }

    // Liquid
    const showLiquid = lv > 0.05;
    this.liquid.visible = this.surface.visible = showLiquid;
    if (showLiquid) {
      const look = c.liquidLook();
      if (look) {
        this.liquidMat.color.setRGB(look.color[0], look.color[1], look.color[2], THREE.SRGBColorSpace);
        this.liquidMat.opacity = Math.min(0.96, look.opacity);
        this.liquidMat.metalness = look.metalness;
        this.liquidMat.roughness = look.metalness > 0.5 ? 0.08 : 0.05;
        // Dark, opaque liquids (bromine, permanganate…) should not be washed out by reflections.
        const lum = 0.2126 * look.color[0] + 0.7152 * look.color[1] + 0.0722 * look.color[2];
        this.liquidMat.envMapIntensity = look.metalness > 0.5 ? 1.4 : look.opacity > 0.6 ? 0.25 + lum * 0.6 : 0.9;
        this.surfaceMat.envMapIntensity = this.liquidMat.envMapIntensity;
        const lg = glowFor(c.temperature);
        if (lg) {
          this.liquidMat.emissive.setRGB(lg.r, lg.g, lg.b);
          this.liquidMat.emissiveIntensity = lg.intensity;
          this.liquidMat.opacity = Math.max(this.liquidMat.opacity, 0.9);
        } else {
          this.liquidMat.emissive.setHex(0);
        }
        this.surfaceMat.emissive.copy(this.liquidMat.emissive);
        this.surfaceMat.emissiveIntensity = this.liquidMat.emissiveIntensity;
        this.surfaceMat.color.copy(this.liquidMat.color);
        this.surfaceMat.opacity = Math.min(0.97, look.opacity * 1.25 + 0.05);
        this.surfaceMat.metalness = look.metalness;
      }
      const surf = _v.set(0, hl, 0).applyMatrix4(this.object.matrixWorld);
      // Pouring keeps the surface at the rim.
      const rim = this.rim();
      const dperp = _down.clone().addScaledVector(up, -_down.dot(up));
      const sinT = dperp.length();
      if (sinT > 1e-3) dperp.divideScalar(sinT);
      const lowY = rim.center.y + dperp.y * rim.radius;
      const levelY = Math.min(surf.y, Math.max(lowY, surf.y - 0.5));
      this.clipPlane.constant = levelY;
      // Surface ellipse (exact for cylinders): radius r, stretched by 1/cos(tilt).
      const r = radiusAt(this.cavity, Math.min(hl, this.rimY)) - 0.0008;
      const cosT = Math.max(0.12, Math.abs(up.y));
      const axisPoint = surf.clone();
      if (levelY < surf.y && Math.abs(up.y) > 1e-3) axisPoint.addScaledVector(up, (levelY - surf.y) / up.y);
      this.surface.position.copy(axisPoint);
      this.surface.position.y = levelY;
      const yaw = Math.atan2(up.x, up.z);
      this.surface.rotation.set(0, yaw, 0);
      // The ellipse is exact while the surface only touches the side wall; near the bottom
      // (little liquid, steep tilt) limit the stretch so it stays inside the glass.
      const tanT = Math.sqrt(Math.max(0, 1 - cosT * cosT)) / cosT;
      const room = Math.max(0, hl - this.bottomY);
      const stretch = Math.min(1 / cosT, 1 + room / Math.max(1e-3, r * Math.max(1e-3, tanT)) * (1 / cosT - 1));
      this.surface.scale.set(r, 1, r * Math.max(1, stretch));
      this.surface.visible = up.y > 0.05 && lv > 0.3;
    }

    // Gas
    const gl = c.gasLook();
    this.gas.visible = !!gl && gl.opacity * gl.volume > 0.5;
    if (this.gas.visible) {
      this.gasMat.color.setRGB(gl.color[0], gl.color[1], gl.color[2], THREE.SRGBColorSpace);
      this.gasMat.opacity = Math.min(0.75, gl.opacity * Math.min(1.5, gl.volume / (this.capacity * 0.6)));
    }

    // Foam
    this.foamMesh.visible = c.foam > 0.5;
    if (this.foamMesh.visible) {
      const r = radiusAt(this.cavity, Math.min(hl, this.rimY));
      const h = Math.min(0.08, c.foam / (Math.PI * r * r * 1e6));
      this.foamMesh.position.set(0, Math.min(hl, this.rimY), 0);
      this.foamMesh.scale.set(r * 1.02, Math.max(0.003, h), r * 1.02);
    }
  }

  updateCrystals(s, hs, rTop, sv, glow = null) {
    const kind = s.cubic ? 'cubic' : s.form;
    const geo = CRYSTAL_GEOS[kind];
    if (!geo) {
      if (this.crystals) this.crystals.visible = false;
      return;
    }
    if (!this.crystals || this.crystals.userData.kind !== kind) {
      if (this.crystals) this.object.remove(this.crystals);
      const mat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, roughness: 0.2, metalness: 0, clearcoat: 0.6 });
      this.crystals = new THREE.InstancedMesh(geo, mat, 14);
      this.crystals.userData.kind = kind;
      this.crystals.userData.noPick = true;
      this.crystals.userData.noHighlight = true;
      this.crystals.castShadow = true;
      this.object.add(this.crystals);
      this.crystalSeeds = Array.from({ length: 14 }, () => [Math.random(), Math.random(), Math.random(), Math.random()]);
    }
    this.crystals.visible = true;
    const mat = this.crystals.material;
    mat.color.set(s.color);
    mat.metalness = s.metalness || 0;
    mat.roughness = Math.min(0.5, s.roughness);
    if (mat.transparent !== !!s.translucent) { mat.transparent = !!s.translucent; mat.needsUpdate = true; }
    mat.opacity = s.translucent ? 0.8 : 1;
    if (glow) { mat.emissive.setRGB(glow.r, glow.g, glow.b); mat.emissiveIntensity = glow.intensity; } else mat.emissive.setHex(0);
    const n = kind === 'ice' ? Math.max(1, Math.min(8, Math.round(sv / 3))) : Math.max(3, Math.min(14, Math.round(sv * 1.5)));
    this.crystals.count = n;
    const size = kind === 'ice' ? Math.min(0.016, rTop * 0.55) : Math.min(0.006, rTop * 0.22) * (kind === 'metal' || kind === 'chunk' ? 1.6 : kind === 'needles' ? 1.3 : 1);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const [a, b, c2, d] = this.crystalSeeds[i];
      const rr = Math.sqrt(a) * rTop * 0.8;
      const ang = b * Math.PI * 2;
      _q.setFromEuler(new THREE.Euler(c2 * 6, d * 6, a * 6));
      m.compose(new THREE.Vector3(Math.cos(ang) * rr, hs + size * 0.25, Math.sin(ang) * rr), _q, new THREE.Vector3(size, size, size).multiplyScalar(0.7 + d * 0.6));
      this.crystals.setMatrixAt(i, m);
    }
    this.crystals.instanceMatrix.needsUpdate = true;
  }

  // ------------------------------------------------------------------------------------
  // Contents tag (shown while held / hovered / just changed)

  /**
   * Name tag of the physical form ("Water", "Salt water", "Bromine" …) floating above the
   * container whenever it holds something. The atoms form is labelled by formula instead.
   */
  updateTag(dt) {
    this.labelT = Math.max(0, this.labelT - dt);
    const show = !this.contents.isEmpty && !this.disabled;
    this.tag.visible = show;
    if (!show) return;
    const detailed = this.isHeld || this.highlighted || this.labelT > 0;
    const now = performance.now();
    const key = this.contents.version + (detailed ? 'd' : '');
    if ((key !== this.lastVersion && (!this._tagTime || now - this._tagTime > 250)) || this._tagDetailed !== detailed) {
      this._tagTime = now;
      this.lastVersion = key;
      this._tagDetailed = detailed;
      this.drawTag(detailed);
    }
    const b = this.worldBounds(new THREE.Box3());
    this.tag.position.set((b.min.x + b.max.x) / 2, b.max.y + 0.045, (b.min.z + b.max.z) / 2);
    const dist = this.tag.position.distanceTo(this.app.headPosition());
    this.tag.material.opacity = THREE.MathUtils.clamp(3.2 - dist, 0.2, 1);
  }

  drawTag(detailed) {
    const ctx = this.tagCanvas.getContext('2d');
    const W = this.tagCanvas.width, H = this.tagCanvas.height;
    ctx.clearRect(0, 0, W, H);
    const items = this.contents.summary();
    if (!items.length) return;
    let name = items[0].name;
    if (items.length === 2) name += ' + ' + items[1].name;
    else if (items.length > 2) name += ` + ${items.length - 1} more`;
    ctx.font = font(50, 800);
    let size = 50;
    while (size > 26 && ctx.measureText(name).width > W - 60) { size -= 2; ctx.font = font(size, 800); }
    const nameW = ctx.measureText(name).width;
    let detail = '';
    if (detailed) {
      const parts = items.slice(0, 2).map((it) => `${it.amount >= 10 ? Math.round(it.amount) : it.amount.toFixed(1)} ${it.unit}`);
      const pH = this.contents.pH;
      detail = parts.join(' + ') + `  ·  ${Math.round(this.contents.temperature)} °C` + (pH !== null ? `  ·  pH ${pH.toFixed(1)}` : '') + (this.etch > 0 ? '  ·  etching glass!' : '');
    }
    ctx.font = font(26, 600);
    const dW = detail ? ctx.measureText(detail).width : 0;
    const bw = Math.min(W - 8, Math.max(nameW, dW) + 50);
    const bh = detail ? H - 12 : 96;
    const x = (W - bw) / 2, y = detail ? 6 : H - 6 - bh;
    roundRect(ctx, x, y, bw, bh, 26);
    ctx.fillStyle = 'rgba(8,14,24,0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(127,227,255,0.65)';
    ctx.lineWidth = 3;
    ctx.stroke();
    const dot = items[0].s;
    ctx.fillStyle = dot.phase === 'gas' && dot.opacity < 0.1 ? '#e6eef7' : dot.color;
    ctx.beginPath();
    ctx.arc(x + 24, y + (detail ? 52 : bh / 2), 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = font(size, 800);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(name, W / 2 + 10, y + (detail ? 54 : bh / 2 + 2));
    if (detail) {
      ctx.fillStyle = '#ffd27a';
      ctx.font = font(26, 600);
      ctx.fillText(detail, W / 2, y + bh - 42);
    }
    this.tag.material.map.needsUpdate = true;
    this.tag.scale.set(0.2, 0.2 * (H / W), 1);
  }

  onBreak(pos) {
    const c = this.contents;
    if (c.liquidVolume > 1) this.app.fluids.splash(pos, c.takeLiquid(c.liquidVolume), null);
    if (c.solidVolume > 0.2) this.app.fluids.splash(pos, c.takeSolid(c.solidVolume), null, true);
  }

  destroy() {
    if (this.pouring) this.app.fluids.stop(this.pouring);
    if (this.solidPouring) this.app.fluids.stop(this.solidPouring);
    for (const h of Object.values(this.fxLoops)) h.stop();
    this.surface.removeFromParent();
    this.tag.removeFromParent();
    this.tag.material.map.dispose();
    super.destroy();
  }
}
