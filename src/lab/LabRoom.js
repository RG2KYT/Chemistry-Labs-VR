import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { roundedBox } from './materials.js';
import { font } from '../ui/canvasUtil.js';

function canvasTex(w, h, draw, repeat = null) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repeat) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat[0], repeat[1]);
  }
  return t;
}

function rng(seed) {
  let s = seed;
  return () => ((s = (s * 16807) % 2147483647) / 2147483647);
}

export const ROOM = { minX: -4.5, maxX: 4.5, minZ: -5, maxZ: 3, height: 3.2 };
export const TABLE = { x: 0, z: -0.62, w: 1.7, d: 0.82, h: 0.92 };

/**
 * The virtual chemistry lab: floor, walls, windows, benches, fume hood, shelves, sink,
 * posters and the central workbench the player stands behind.
 */
export class LabRoom {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.group.name = 'LabRoom';
    this.colliders = [];
    this.build();
  }

  build() {
    const g = this.group;
    const r = rng(7);
    const W = ROOM.maxX - ROOM.minX;
    const D = ROOM.maxZ - ROOM.minZ;
    const cx = (ROOM.maxX + ROOM.minX) / 2;
    const cz = (ROOM.maxZ + ROOM.minZ) / 2;
    const H = ROOM.height;

    // ---- Floor: speckled vinyl tiles
    const floorTex = canvasTex(1024, 1024, (ctx, w, h) => {
      const n = 4;
      const s = w / n;
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
        const v = 196 + Math.floor(r() * 14);
        ctx.fillStyle = `rgb(${v - 6},${v},${v + 4})`;
        ctx.fillRect(i * s, j * s, s, s);
        for (let k = 0; k < 900; k++) {
          const c = r() < 0.5 ? 150 + r() * 40 : 225 + r() * 30;
          ctx.fillStyle = `rgba(${c},${c},${c + 5},${0.25 + r() * 0.4})`;
          ctx.fillRect(i * s + r() * s, j * s + r() * s, 1 + r() * 2.5, 1 + r() * 2.5);
        }
        ctx.strokeStyle = 'rgba(120,125,130,0.55)';
        ctx.lineWidth = 2;
        ctx.strokeRect(i * s + 1, j * s + 1, s - 2, s - 2);
      }
    }, [W / 2.4, D / 2.4]);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.55, metalness: 0 }));
    floor.rotation.x = -Math.PI / 2;
    floor.position.set(cx, 0, cz);
    floor.receiveShadow = true;
    g.add(floor);

    // ---- Walls
    const wallMat = new THREE.MeshStandardMaterial({ color: 0xf1efe9, roughness: 0.9 });
    const dadoMat = new THREE.MeshStandardMaterial({ color: 0xc9d3dc, roughness: 0.8 });
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x5b6470, roughness: 0.6 });
    const walls = [
      { p: [cx, H / 2, ROOM.minZ], ry: 0, w: W },
      { p: [cx, H / 2, ROOM.maxZ], ry: Math.PI, w: W },
      { p: [ROOM.minX, H / 2, cz], ry: Math.PI / 2, w: D },
      { p: [ROOM.maxX, H / 2, cz], ry: -Math.PI / 2, w: D },
    ];
    for (const wl of walls) {
      const wall = new THREE.Mesh(new THREE.PlaneGeometry(wl.w, H), wallMat);
      wall.position.set(...wl.p);
      wall.rotation.y = wl.ry;
      wall.receiveShadow = true;
      g.add(wall);
      const dado = new THREE.Mesh(new THREE.PlaneGeometry(wl.w, 1.0), dadoMat);
      dado.position.set(wl.p[0], 0.5, wl.p[2]);
      dado.rotation.y = wl.ry;
      dado.translateZ(0.004);
      g.add(dado);
      const base = new THREE.Mesh(new THREE.BoxGeometry(wl.w, 0.1, 0.02), baseMat);
      base.position.set(wl.p[0], 0.05, wl.p[2]);
      base.rotation.y = wl.ry;
      base.translateZ(0.01);
      g.add(base);
    }
    // Ceiling + light panels
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W, D), new THREE.MeshStandardMaterial({ color: 0xf6f6f4, roughness: 1 }));
    ceil.rotation.x = Math.PI / 2;
    ceil.position.set(cx, H, cz);
    g.add(ceil);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfffdf6, toneMapped: false });
    const frameMat = new THREE.MeshStandardMaterial({ color: 0xd9dbde, roughness: 0.6 });
    for (let i = -1; i <= 1; i++) for (let j = 0; j < 3; j++) {
      const x = i * 2.6, z = ROOM.minZ + 1.6 + j * 2.6;
      const p = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 0.6), lightMat);
      p.rotation.x = Math.PI / 2;
      p.position.set(x, H - 0.005, z);
      g.add(p);
      const f = new THREE.Mesh(new THREE.BoxGeometry(1.26, 0.02, 0.66), frameMat);
      f.position.set(x, H - 0.012, z);
      g.add(f);
    }

    // ---- Windows on the left wall (outdoor view)
    const skyTex = canvasTex(1024, 512, (ctx, w, h) => {
      const sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#6fa8e8');
      sky.addColorStop(0.65, '#cfe4f7');
      sky.addColorStop(1, '#e8f1f6');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      for (let i = 0; i < 9; i++) {
        const x = r() * w, y = 40 + r() * h * 0.35;
        ctx.fillStyle = 'rgba(255,255,255,0.75)';
        for (let k = 0; k < 6; k++) {
          ctx.beginPath();
          ctx.ellipse(x + k * 22 - 50 + r() * 12, y + r() * 10, 40 + r() * 30, 14 + r() * 10, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
      // Hills and trees
      ctx.fillStyle = '#8fb08a';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.78);
      for (let x = 0; x <= w; x += 32) ctx.lineTo(x, h * 0.74 + Math.sin(x * 0.01) * 18 + r() * 6);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();
      for (let i = 0; i < 40; i++) {
        const x = r() * w, y = h * 0.78 + r() * h * 0.12, s = 14 + r() * 26;
        ctx.fillStyle = r() < 0.5 ? '#4f7a4c' : '#5f8b55';
        ctx.beginPath();
        ctx.ellipse(x, y - s * 0.6, s * 0.55, s, 0, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.fillStyle = '#9aa3a8';
      ctx.fillRect(0, h * 0.93, w, h * 0.07);
    });
    const winFrame = new THREE.MeshStandardMaterial({ color: 0xe9ebee, roughness: 0.4, metalness: 0.2 });
    for (const z of [-3.6, -1.6, 0.4]) {
      const view = new THREE.Mesh(new THREE.PlaneGeometry(1.5, 1.3), new THREE.MeshBasicMaterial({ map: skyTex, toneMapped: false }));
      view.position.set(ROOM.minX + 0.012, 1.85, z);
      view.rotation.y = Math.PI / 2;
      g.add(view);
      for (const [w, h, y, dz] of [[1.62, 0.07, 2.53, 0], [1.62, 0.07, 1.17, 0], [0.07, 1.42, 1.85, -0.78], [0.07, 1.42, 1.85, 0.78], [0.05, 1.3, 1.85, 0], [1.5, 0.04, 1.85, 0]]) {
        const f = new THREE.Mesh(new THREE.BoxGeometry(0.06, h, w), winFrame);
        f.position.set(ROOM.minX + 0.03, y, z + dz);
        g.add(f);
      }
      const sill = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 1.7), winFrame);
      sill.position.set(ROOM.minX + 0.09, 1.14, z);
      g.add(sill);
    }

    // ---- Back wall benches, cabinets, fume hood, shelves
    const benchTop = new THREE.MeshStandardMaterial({ color: 0x1c1f24, roughness: 0.35, metalness: 0.05 });
    const cabinet = new THREE.MeshStandardMaterial({ color: 0xdfe3e6, roughness: 0.55 });
    const handleMat = new THREE.MeshStandardMaterial({ color: 0xbfc5cc, metalness: 1, roughness: 0.25 });
    const doorMat = new THREE.MeshStandardMaterial({ color: 0xe8ecef, roughness: 0.5 });
    const addBench = (x0, x1, z, depth, facing) => {
      const w = x1 - x0;
      const xc = (x0 + x1) / 2;
      const base = new THREE.Mesh(new THREE.BoxGeometry(w, 0.86, depth - 0.04), cabinet);
      base.position.set(xc, 0.43, z);
      base.castShadow = base.receiveShadow = true;
      g.add(base);
      const top = new THREE.Mesh(roundedBox(w + 0.02, 0.04, depth, 0.01), benchTop);
      top.position.set(xc, 0.88, z);
      top.receiveShadow = true;
      g.add(top);
      const n = Math.max(1, Math.round(w / 0.6));
      for (let i = 0; i < n; i++) {
        const dx = x0 + (i + 0.5) * (w / n);
        const door = new THREE.Mesh(new THREE.BoxGeometry(w / n - 0.02, 0.7, 0.01), doorMat);
        door.position.set(dx, 0.42, z + facing * (depth / 2 - 0.015));
        g.add(door);
        const hd = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.012, 0.02), handleMat);
        hd.position.set(dx, 0.72, z + facing * (depth / 2 + 0.005));
        g.add(hd);
      }
      this.colliders.push({ c: [xc, 0.45, z], h: [w / 2, 0.45, depth / 2] });
    };
    addBench(-4.4, -1.2, ROOM.minZ + 0.35, 0.7, 1);
    addBench(1.2, 4.4, ROOM.minZ + 0.35, 0.7, 1);

    // Fume hood (centre of back wall)
    const hoodMat = new THREE.MeshStandardMaterial({ color: 0xe6e9ec, roughness: 0.45 });
    const hood = new THREE.Group();
    hood.position.set(0, 0, ROOM.minZ + 0.42);
    const hb = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.86, 0.8), cabinet);
    hb.position.y = 0.43;
    hood.add(hb);
    const ht = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.04, 0.84), benchTop);
    ht.position.y = 0.88;
    hood.add(ht);
    for (const sx of [-1, 1]) {
      const side = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.84), hoodMat);
      side.position.set(sx * 1.07, 1.65, 0);
      hood.add(side);
    }
    const hoodTop = new THREE.Mesh(new THREE.BoxGeometry(2.24, 0.5, 0.84), hoodMat);
    hoodTop.position.y = 2.55;
    hood.add(hoodTop);
    const hoodBack = new THREE.Mesh(new THREE.BoxGeometry(2.1, 1.5, 0.04), new THREE.MeshStandardMaterial({ color: 0xcfd6dc, roughness: 0.6 }));
    hoodBack.position.set(0, 1.65, -0.38);
    hood.add(hoodBack);
    const sash = new THREE.Mesh(new THREE.PlaneGeometry(2.04, 0.9), new THREE.MeshPhysicalMaterial({ color: 0xeaf6ff, transparent: true, opacity: 0.18, roughness: 0.05, clearcoat: 1, depthWrite: false }));
    sash.position.set(0, 1.95, 0.4);
    hood.add(sash);
    const sashBar = new THREE.Mesh(new THREE.BoxGeometry(2.04, 0.05, 0.05), hoodMat);
    sashBar.position.set(0, 1.5, 0.4);
    hood.add(sashBar);
    const hoodLight = new THREE.Mesh(new THREE.PlaneGeometry(1.8, 0.08), new THREE.MeshBasicMaterial({ color: 0xfff8e8, toneMapped: false }));
    hoodLight.rotation.x = Math.PI / 2;
    hoodLight.position.set(0, 2.29, 0);
    hood.add(hoodLight);
    const label = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.12), new THREE.MeshBasicMaterial({
      map: canvasTex(512, 102, (ctx, w, h) => {
        ctx.fillStyle = '#e6e9ec'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#2b5f8a'; ctx.font = font(48, 800); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText('FUME HOOD', w / 2, h / 2);
      }),
    }));
    label.position.set(0, 2.55, 0.425);
    hood.add(label);
    hood.traverse((o) => { if (o.isMesh) { o.castShadow = !o.material.transparent; o.receiveShadow = true; } });
    g.add(hood);
    this.colliders.push({ c: [0, 0.45, ROOM.minZ + 0.42], h: [1.12, 0.45, 0.42] });

    // Wall shelves with reagent bottles
    const shelfMat = new THREE.MeshStandardMaterial({ color: 0xbfa27a, roughness: 0.7 });
    const bottleGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.16, 16);
    const capGeo = new THREE.CylinderGeometry(0.016, 0.016, 0.03, 12);
    const bottleColors = [0x7a4a1c, 0x8a5a24, 0xe9f2f7, 0x3a6fb0, 0x2f7a3f, 0xb02f2f, 0xd0d0c8, 0x6b3f8a];
    const shelves = [];
    for (const [x0, x1] of [[-4.3, -1.4], [1.4, 4.3]]) for (const y of [1.45, 1.85, 2.25]) shelves.push([x0, x1, y]);
    let bottleCount = 0;
    for (const [x0, x1] of shelves) bottleCount += Math.floor((x1 - x0) / 0.11);
    const bottles = new THREE.InstancedMesh(bottleGeo, new THREE.MeshPhysicalMaterial({ roughness: 0.15, clearcoat: 1, metalness: 0 }), bottleCount);
    const caps = new THREE.InstancedMesh(capGeo, new THREE.MeshStandardMaterial({ color: 0x1d1f22, roughness: 0.6 }), bottleCount);
    let k = 0;
    const m4 = new THREE.Matrix4();
    for (const [x0, x1, y] of shelves) {
      const s = new THREE.Mesh(new THREE.BoxGeometry(x1 - x0, 0.025, 0.28), shelfMat);
      s.position.set((x0 + x1) / 2, y, ROOM.minZ + 0.15);
      s.castShadow = s.receiveShadow = true;
      g.add(s);
      for (let x = x0 + 0.07; x < x1 - 0.05 && k < bottleCount; x += 0.11) {
        if (r() < 0.18) continue;
        const sc = 0.75 + r() * 0.45;
        m4.compose(new THREE.Vector3(x, y + 0.0125 + 0.08 * sc, ROOM.minZ + 0.12 + r() * 0.06), new THREE.Quaternion(), new THREE.Vector3(1, sc, 1));
        bottles.setMatrixAt(k, m4);
        bottles.setColorAt(k, new THREE.Color(bottleColors[Math.floor(r() * bottleColors.length)]));
        m4.compose(new THREE.Vector3(x, y + 0.0125 + 0.16 * sc + 0.015, ROOM.minZ + 0.15), new THREE.Quaternion(), new THREE.Vector3(1, 1, 1));
        caps.setMatrixAt(k, m4);
        k++;
      }
    }
    bottles.count = caps.count = k;
    bottles.castShadow = true;
    g.add(bottles, caps);

    // Sink on the right-hand bench
    const sinkMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd1, metalness: 0.9, roughness: 0.3 });
    const sink = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.02, 0.4), sinkMat);
    sink.position.set(2.8, 0.905, ROOM.minZ + 0.38);
    g.add(sink);
    const tap = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.012, 8, 24, Math.PI), sinkMat);
    tap.position.set(2.8, 0.92, ROOM.minZ + 0.14);
    tap.rotation.y = Math.PI / 2;
    tap.rotation.z = 0;
    g.add(tap);

    // ---- Right wall: whiteboard + safety poster + eyewash + extinguisher
    const wb = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.2), new THREE.MeshStandardMaterial({
      roughness: 0.25,
      map: canvasTex(1600, 800, (ctx, w, h) => {
        ctx.fillStyle = '#fbfcfd'; ctx.fillRect(0, 0, w, h);
        ctx.strokeStyle = '#a8adb3'; ctx.lineWidth = 18; ctx.strokeRect(0, 0, w, h);
        ctx.fillStyle = '#1d4f91'; ctx.font = '700 64px "Comic Sans MS", "Segoe Print", cursive';
        ctx.fillText('Today: Building molecules!', 70, 120);
        ctx.fillStyle = '#222'; ctx.font = '500 56px "Comic Sans MS", "Segoe Print", cursive';
        ctx.fillText('2 H₂ + O₂  →  2 H₂O', 90, 240);
        ctx.fillText('NaOH + HCl  →  NaCl + H₂O', 90, 340);
        ctx.fillText('CH₄ : tetrahedral, 109.5°', 90, 440);
        ctx.fillStyle = '#b02a2a';
        ctx.fillText('Acids dissolve things — careful!', 90, 560);
        ctx.fillStyle = '#2a7a3a';
        ctx.fillText('pH < 7 acid · pH 7 neutral · pH > 7 base', 90, 680);
      }),
    }));
    wb.position.set(ROOM.maxX - 0.01, 1.65, -1.6);
    wb.rotation.y = -Math.PI / 2;
    g.add(wb);
    const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.95), new THREE.MeshStandardMaterial({
      roughness: 0.7,
      map: canvasTex(700, 950, (ctx, w, h) => {
        ctx.fillStyle = '#ffd400'; ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = '#111'; ctx.fillRect(30, 30, w - 60, h - 60);
        ctx.fillStyle = '#ffd400'; ctx.font = font(80, 900); ctx.textAlign = 'center';
        ctx.fillText('SAFETY', w / 2, 170); ctx.fillText('FIRST', w / 2, 260);
        ctx.font = font(40, 700); ctx.fillStyle = '#fff';
        ['Wear goggles', 'No food or drink', 'Label everything', 'Know your exits', 'Report spills'].forEach((t, i) => ctx.fillText('• ' + t, w / 2, 400 + i * 90));
      }),
    }));
    poster.position.set(ROOM.maxX - 0.01, 1.7, 0.9);
    poster.rotation.y = -Math.PI / 2;
    g.add(poster);
    const ext = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.5, 20), new THREE.MeshStandardMaterial({ color: 0xc81e1e, roughness: 0.35, metalness: 0.2 }));
    ext.position.set(ROOM.maxX - 0.12, 0.45, 2.2);
    ext.castShadow = true;
    g.add(ext);
    const extTop = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 0.08, 12), new THREE.MeshStandardMaterial({ color: 0x222222 }));
    extTop.position.set(ROOM.maxX - 0.12, 0.74, 2.2);
    g.add(extTop);

    // ---- Back of the room: door + clock
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.15, 0.05), new THREE.MeshStandardMaterial({ color: 0x8a6a4a, roughness: 0.6 }));
    door.position.set(-2.2, 1.075, ROOM.maxZ - 0.03);
    g.add(door);
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.03, 12, 8), handleMat);
    knob.position.set(-2.6, 1.05, ROOM.maxZ - 0.07);
    g.add(knob);
    this.clockCanvas = document.createElement('canvas');
    this.clockCanvas.width = this.clockCanvas.height = 256;
    this.clockTex = new THREE.CanvasTexture(this.clockCanvas);
    this.clockTex.colorSpace = THREE.SRGBColorSpace;
    const clock = new THREE.Mesh(new THREE.CircleGeometry(0.2, 40), new THREE.MeshBasicMaterial({ map: this.clockTex }));
    clock.position.set(0, 2.45, ROOM.minZ + 0.01);
    g.add(clock);
    this.drawClock();

    // ---- The player's workbench (central island)
    const T = TABLE;
    const tableGroup = new THREE.Group();
    tableGroup.position.set(T.x, 0, T.z);
    const top = new THREE.Mesh(roundedBox(T.w, 0.04, T.d, 0.012), new THREE.MeshPhysicalMaterial({ color: 0x15181c, roughness: 0.28, clearcoat: 0.6, clearcoatRoughness: 0.2 }));
    top.position.y = T.h - 0.02;
    top.receiveShadow = true;
    top.castShadow = true;
    tableGroup.add(top);
    const tbase = new THREE.Mesh(new THREE.BoxGeometry(T.w - 0.1, T.h - 0.1, T.d - 0.12), cabinet);
    tbase.position.y = (T.h - 0.1) / 2 + 0.06;
    tbase.castShadow = tbase.receiveShadow = true;
    tableGroup.add(tbase);
    const kick = new THREE.Mesh(new THREE.BoxGeometry(T.w - 0.16, 0.06, T.d - 0.18), baseMat);
    kick.position.y = 0.03;
    tableGroup.add(kick);
    for (let i = 0; i < 3; i++) {
      const dx = -T.w / 3 + i * (T.w / 3);
      for (let j = 0; j < 2; j++) {
        const drawer = new THREE.Mesh(new THREE.BoxGeometry(T.w / 3 - 0.06, 0.3, 0.012), doorMat);
        drawer.position.set(dx, 0.62 - j * 0.34, (T.d - 0.12) / 2 + 0.006);
        tableGroup.add(drawer);
        const hd = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.012, 0.02), handleMat);
        hd.position.set(dx, 0.72 - j * 0.34, (T.d - 0.12) / 2 + 0.02);
        tableGroup.add(hd);
      }
    }
    g.add(tableGroup);
    this.colliders.push({ c: [T.x, T.h / 2, T.z], h: [T.w / 2, T.h / 2, T.d / 2], table: true });

    // Room walls as colliders
    this.colliders.push({ c: [cx, -0.25, cz], h: [W, 0.25, D], floor: true });
    this.colliders.push({ c: [cx, H / 2, ROOM.minZ - 0.1], h: [W / 2, H / 2, 0.1] });
    this.colliders.push({ c: [cx, H / 2, ROOM.maxZ + 0.1], h: [W / 2, H / 2, 0.1] });
    this.colliders.push({ c: [ROOM.minX - 0.1, H / 2, cz], h: [0.1, H / 2, D / 2] });
    this.colliders.push({ c: [ROOM.maxX + 0.1, H / 2, cz], h: [0.1, H / 2, D / 2] });
    this.colliders.push({ c: [cx, H + 0.1, cz], h: [W / 2, 0.1, D / 2] });
    this.optimize();
  }

  /**
   * Merge static meshes that share a material into single draw calls (important for
   * Quest 3 performance: ~150 meshes become ~30).
   */
  optimize() {
    this.group.updateMatrixWorld(true);
    const buckets = new Map();
    this.group.traverse((o) => {
      if (!o.isMesh || o.isInstancedMesh || o.userData.keep) return;
      const m = o.material;
      if (Array.isArray(m) || m.transparent || m.map === this.clockTex) return;
      const key = m.uuid + (o.castShadow ? 'c' : '') + (o.receiveShadow ? 'r' : '');
      if (!buckets.has(key)) buckets.set(key, { material: m, meshes: [], cast: o.castShadow, receive: o.receiveShadow });
      buckets.get(key).meshes.push(o);
    });
    for (const b of buckets.values()) {
      if (b.meshes.length < 2) continue;
      const geos = b.meshes.map((o) => {
        let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone();
        g.applyMatrix4(o.matrixWorld);
        for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        return g;
      });
      const merged = mergeGeometries(geos, false);
      if (!merged) continue;
      for (const o of b.meshes) o.removeFromParent();
      const mesh = new THREE.Mesh(merged, b.material);
      mesh.castShadow = b.cast;
      mesh.receiveShadow = b.receive;
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
  }

  drawClock() {
    const ctx = this.clockCanvas.getContext('2d');
    const s = 256, c = s / 2;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath(); ctx.arc(c, c, c - 2, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 10; ctx.strokeStyle = '#2b2f36'; ctx.stroke();
    ctx.fillStyle = '#2b2f36';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      ctx.fillRect(c + Math.sin(a) * 100 - 3, c - Math.cos(a) * 100 - 3, 6, 6);
    }
    const now = new Date();
    const hand = (angle, len, width) => {
      ctx.lineWidth = width; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(c, c); ctx.lineTo(c + Math.sin(angle) * len, c - Math.cos(angle) * len); ctx.stroke();
    };
    const h = now.getHours() % 12, m = now.getMinutes();
    hand(((h + m / 60) / 12) * Math.PI * 2, 60, 9);
    hand((m / 60) * Math.PI * 2, 92, 6);
    this.clockTex.needsUpdate = true;
    this.lastMinute = m;
  }

  /** Create the static physics colliders. */
  addPhysics(physics) {
    this.bodies = [];
    for (const col of this.colliders) {
      const { body } = physics.staticBox({ x: col.c[0], y: col.c[1], z: col.c[2] }, { x: col.h[0], y: col.h[1], z: col.h[2] }, null, { kind: col.table ? 'static' : 'room', table: !!col.table });
      this.bodies.push(body);
    }
  }

  removePhysics(physics) {
    for (const b of this.bodies || []) physics.removeBody(b);
    this.bodies = [];
  }

  update() {
    if (new Date().getMinutes() !== this.lastMinute) this.drawClock();
  }
}
