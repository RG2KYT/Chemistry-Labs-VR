import * as THREE from 'three';

const NOISE = /* glsl */ `
  uniform float uDissolve;
  uniform vec3 uEdgeColor;
  varying vec3 vDissPos;
  float dHash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float dNoise(vec3 x) {
    vec3 i = floor(x); vec3 f = fract(x); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(dHash(i + vec3(0,0,0)), dHash(i + vec3(1,0,0)), f.x), mix(dHash(i + vec3(0,1,0)), dHash(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(dHash(i + vec3(0,0,1)), dHash(i + vec3(1,0,1)), f.x), mix(dHash(i + vec3(0,1,1)), dHash(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float dFbm(vec3 p) { return dNoise(p) * 0.6 + dNoise(p * 2.3) * 0.3 + dNoise(p * 5.1) * 0.1; }
`;

function makeDissolvable(mat, uniforms) {
  const m = mat.clone();
  m.userData.dissolveSource = mat;
  m.transparent = mat.transparent;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uDissolve = uniforms.uDissolve;
    shader.uniforms.uEdgeColor = uniforms.uEdgeColor;
    shader.vertexShader = 'varying vec3 vDissPos;\n' + shader.vertexShader.replace(
      '#include <begin_vertex>',
      '#include <begin_vertex>\n  vDissPos = position;',
    );
    shader.fragmentShader = NOISE + shader.fragmentShader
      .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
        float dn = dFbm(vDissPos * 70.0);
        if (uDissolve > 0.0 && dn < uDissolve * 1.05) discard;
        float dEdge = uDissolve > 0.0 ? smoothstep(uDissolve * 1.05 + 0.09, uDissolve * 1.05, dn) : 0.0;`)
      .replace('#include <dithering_fragment>', `#include <dithering_fragment>
        gl_FragColor.rgb += uEdgeColor * dEdge * 2.5;
        gl_FragColor.a = max(gl_FragColor.a, dEdge);`);
  };
  m.customProgramCacheKey = () => 'dissolve-' + mat.type;
  return m;
}

/**
 * Acid damage: the object eats away with a glowing edge, disappears, and a few seconds
 * later (3–10 s) reforms exactly as it was.
 */
export class Dissolver {
  constructor(app) {
    this.app = app;
    this.active = new Map(); // entity -> state
  }

  isDissolving(entity) {
    return this.active.has(entity);
  }

  dissolve(entity, point) {
    if (!entity || entity.removed || this.active.has(entity)) return;
    if (entity.kind === 'panel' || entity.kind === 'machine') return;
    const uniforms = { uDissolve: { value: 0 }, uEdgeColor: { value: new THREE.Color(0x9cff5a) } };
    const swaps = [];
    entity.object.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh) return;
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      const repl = mats.map((m) => makeDissolvable(m, uniforms));
      swaps.push({ mesh: o, original: o.material });
      o.material = Array.isArray(o.material) ? repl : repl[0];
    });
    for (const rec of entity.holds.slice()) this.app.grab.forceRelease(rec.hand);
    const saved = {
      position: entity.object.position.clone(),
      quaternion: entity.object.quaternion.clone(),
      contents: entity.contents ? entity.contents.clone() : null,
    };
    if (entity.body) {
      saved.position.copy(entity.body.translation());
      saved.quaternion.copy(entity.body.rotation());
    }
    const state = { phase: 'out', t: 0, uniforms, swaps, saved, wait: 3 + Math.random() * 7, point: point ? point.clone() : entity.object.position.clone() };
    this.active.set(entity, state);
    if (this.app.audio?.ctx) state.sound = this.app.audio.loop('sizzle', { position: state.point, volume: 0.45 });
    this.app.events.emit('dissolve', entity);
  }

  update(dt) {
    for (const [e, s] of this.active) {
      if (e.removed) {
        this.finish(e, s);
        continue;
      }
      if (s.phase === 'out') {
        s.t += dt / 1.6;
        s.uniforms.uDissolve.value = Math.min(1, s.t);
        if (Math.random() < dt * 30) this.app.effects.smoke(e.worldBounds().getCenter(new THREE.Vector3()), 0xc8f0a0, 0.25, 0.025, 0.15);
        if (Math.random() < dt * 25) this.app.effects.bubble(s.point.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.04, 0, (Math.random() - 0.5) * 0.04)), 0xd8ffb0, 0.003, 0.1, 0.4);
        if (s.t >= 1) {
          s.phase = 'gone';
          s.t = 0;
          e.object.visible = false;
          e.disabled = true;
          if (e.body) e.body.setEnabled(false);
          if (e.tag) e.tag.visible = false;
          if (e.label) e.label.visible = false;
          if (e.surface) e.surface.visible = false;
          if (s.sound) s.sound.setVolume(0);
        }
      } else if (s.phase === 'gone') {
        s.t += dt;
        if (s.t >= s.wait) {
          s.phase = 'in';
          s.t = 0;
          s.uniforms.uEdgeColor.value.set(0x7fe3ff);
          e.object.visible = true;
          if (e.label) e.label.visible = true;
          e.teleport(s.saved.position, s.saved.quaternion);
          if (s.saved.contents && e.contents) {
            e.contents.clear();
            e.contents.addMixture(s.saved.contents);
          }
          this.app.effects.sparkle(s.saved.position, 0x7fe3ff, 26, 0.12);
          this.app.audio?.play('spawn', { position: s.saved.position, volume: 0.4 });
        }
      } else if (s.phase === 'in') {
        s.t += dt / 1.2;
        s.uniforms.uDissolve.value = Math.max(0, 1 - s.t);
        if (s.t >= 1) {
          if (e.body) {
            e.body.setEnabled(true);
            e.teleport(s.saved.position, s.saved.quaternion);
          }
          e.disabled = false;
          this.finish(e, s);
        }
      }
    }
  }

  finish(e, s) {
    for (const { mesh, original } of s.swaps) {
      const cur = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      cur.forEach((m) => m.dispose());
      mesh.material = original;
    }
    if (s.sound) s.sound.stop();
    this.active.delete(e);
  }

  clear() {
    for (const [e, s] of [...this.active]) {
      if (!e.removed) {
        e.object.visible = true;
        e.disabled = false;
        if (e.body) e.body.setEnabled(true);
      }
      this.finish(e, s);
    }
  }
}
