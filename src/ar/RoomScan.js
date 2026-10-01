import * as THREE from 'three';

const LABEL_COLORS = {
  floor: 0xc9b38f,
  wall: 0xe9e5dc,
  ceiling: 0xf5f4f0,
  table: 0x8d6b4b,
  desk: 0x8d6b4b,
  couch: 0x5f7fa3,
  bed: 0x9a7fb0,
  'door frame': 0x7a5a3c,
  door: 0x7a5a3c,
  'window frame': 0x9fc4e0,
  window: 0x9fc4e0,
  screen: 0x30343a,
  storage: 0xa08f7a,
  lamp: 0xf2e2a8,
  plant: 0x5f9a5a,
  other: 0xb3b9c2,
};

/**
 * Uses the headset's room scan (WebXR plane-detection + mesh-detection, i.e. Quest
 * "Space Setup") to give your real room physics — things land on your real table and
 * floor — and, in "Scanned Room" mode, renders a stylised digital copy of the room.
 */
export class RoomScan {
  constructor(app) {
    this.app = app;
    this.group = new THREE.Group();
    this.group.name = 'RoomScan';
    this.planes = new Map();
    this.meshes = new Map();
    this.digital = false;
    this.enabled = false;
    this.sawData = false;
    this.edgeMat = new THREE.LineBasicMaterial({ color: 0x7fe3ff, transparent: true, opacity: 0.35, toneMapped: false });
    this.shadowMat = new THREE.ShadowMaterial({ opacity: 0.3 });
    app.scene.add(this.group);
  }

  setMode(enabled, digital) {
    this.enabled = enabled;
    this.digital = digital;
    this.group.visible = enabled;
    for (const rec of [...this.planes.values(), ...this.meshes.values()]) this.styleRecord(rec);
    if (!enabled) this.clear();
  }

  styleRecord(rec) {
    if (!rec.mesh) return;
    if (this.digital) {
      rec.mesh.material = rec.digitalMat;
      rec.mesh.visible = true;
      if (rec.edges) rec.edges.visible = true;
    } else {
      // Passthrough: only horizontal planes catch shadows of virtual objects.
      rec.mesh.material = this.shadowMat;
      rec.mesh.visible = rec.horizontal;
      if (rec.edges) rec.edges.visible = false;
    }
  }

  update(frame, refSpace) {
    if (!this.enabled || !frame) return;
    const planes = frame.detectedPlanes;
    if (planes) {
      for (const plane of planes) {
        let rec = this.planes.get(plane);
        if (!rec || rec.time !== plane.lastChangedTime) {
          if (rec) this.disposeRecord(rec);
          rec = this.buildPlane(plane, frame, refSpace);
          if (rec) this.planes.set(plane, rec);
        }
      }
      for (const [plane, rec] of this.planes) {
        if (!planes.has(plane)) {
          this.disposeRecord(rec);
          this.planes.delete(plane);
        }
      }
    }
    const meshes = frame.detectedMeshes;
    if (meshes) {
      for (const xm of meshes) {
        let rec = this.meshes.get(xm);
        if (!rec || rec.time !== xm.lastChangedTime) {
          if (rec) this.disposeRecord(rec);
          rec = this.buildMesh(xm, frame, refSpace);
          if (rec) this.meshes.set(xm, rec);
        }
      }
      for (const [xm, rec] of this.meshes) {
        if (!meshes.has(xm)) {
          this.disposeRecord(rec);
          this.meshes.delete(xm);
        }
      }
    }
    if (this.planes.size || this.meshes.size) this.sawData = true;
  }

  digitalMaterial(label, horizontal, up) {
    const color = new THREE.Color(LABEL_COLORS[label] ?? LABEL_COLORS.other);
    if (label === 'floor' || (horizontal && up && !label)) color.setHex(LABEL_COLORS.floor);
    return new THREE.MeshStandardMaterial({ color, roughness: 0.85, flatShading: true, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: 1 });
  }

  buildPlane(plane, frame, refSpace) {
    const pose = frame.getPose(plane.planeSpace, refSpace);
    if (!pose || !plane.polygon || plane.polygon.length < 3) return null;
    const shape = new THREE.Shape(plane.polygon.map((p) => new THREE.Vector2(p.x, -p.z)));
    const geo = new THREE.ShapeGeometry(shape);
    geo.rotateX(-Math.PI / 2);
    const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
    const label = (plane.semanticLabel || '').toLowerCase();
    const normal = new THREE.Vector3(0, 1, 0).transformDirection(matrix);
    const horizontal = plane.orientation === 'horizontal' || Math.abs(normal.y) > 0.8;
    const rec = { time: plane.lastChangedTime, horizontal, label, kind: 'plane' };
    rec.digitalMat = this.digitalMaterial(label, horizontal, normal.y > 0);
    rec.mesh = new THREE.Mesh(geo, rec.digitalMat);
    rec.mesh.matrixAutoUpdate = false;
    rec.mesh.matrix.copy(matrix);
    rec.mesh.receiveShadow = true;
    rec.mesh.userData.noPick = true;
    rec.edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo), this.edgeMat);
    rec.edges.matrixAutoUpdate = false;
    rec.edges.matrix.copy(matrix);
    this.group.add(rec.mesh, rec.edges);
    this.styleRecord(rec);

    // Physics: a thin slab under the plane surface
    const pts = [];
    const v = new THREE.Vector3();
    for (const p of plane.polygon) {
      for (const y of [0, -0.04]) {
        v.set(p.x, y, p.z).applyMatrix4(matrix);
        pts.push(v.x, v.y, v.z);
      }
    }
    const P = this.app.physics;
    const desc = P.R.ColliderDesc.convexHull(new Float32Array(pts));
    if (desc) {
      rec.body = P.fixedBody({ x: 0, y: 0, z: 0 });
      P.addCollider(desc.setFriction(0.8), rec.body, { kind: label === 'floor' ? 'room' : 'static', scanned: true });
    }
    return rec;
  }

  buildMesh(xm, frame, refSpace) {
    const pose = frame.getPose(xm.meshSpace, refSpace);
    if (!pose || !xm.vertices || !xm.indices || xm.indices.length < 3) return null;
    const matrix = new THREE.Matrix4().fromArray(pose.transform.matrix);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(xm.vertices), 3));
    geo.setIndex(new THREE.BufferAttribute(new Uint32Array(xm.indices), 1));
    geo.computeVertexNormals();
    const label = (xm.semanticLabel || '').toLowerCase();
    const rec = { time: xm.lastChangedTime, horizontal: false, label, kind: 'mesh' };
    if (label === 'global mesh' || !label) {
      // Colour the whole-room mesh by surface orientation.
      const n = geo.attributes.normal;
      const colors = new Float32Array(n.count * 3);
      const floorC = new THREE.Color(LABEL_COLORS.floor), wallC = new THREE.Color(LABEL_COLORS.wall), ceilC = new THREE.Color(LABEL_COLORS.ceiling);
      const nm = new THREE.Matrix3().getNormalMatrix(matrix);
      const tmp = new THREE.Vector3();
      for (let i = 0; i < n.count; i++) {
        tmp.set(n.getX(i), n.getY(i), n.getZ(i)).applyMatrix3(nm).normalize();
        const c = tmp.y > 0.7 ? floorC : tmp.y < -0.7 ? ceilC : wallC;
        colors[i * 3] = c.r; colors[i * 3 + 1] = c.g; colors[i * 3 + 2] = c.b;
      }
      geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
      rec.digitalMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.9, flatShading: true, side: THREE.DoubleSide });
    } else {
      rec.digitalMat = this.digitalMaterial(label, false, false);
    }
    rec.mesh = new THREE.Mesh(geo, rec.digitalMat);
    rec.mesh.matrixAutoUpdate = false;
    rec.mesh.matrix.copy(matrix);
    rec.mesh.receiveShadow = true;
    rec.mesh.castShadow = false;
    rec.mesh.userData.noPick = true;
    rec.edges = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 35), this.edgeMat);
    rec.edges.matrixAutoUpdate = false;
    rec.edges.matrix.copy(matrix);
    this.group.add(rec.mesh, rec.edges);
    this.styleRecord(rec);

    // Physics: triangle mesh in world space
    const verts = new Float32Array(xm.vertices.length);
    const v = new THREE.Vector3();
    for (let i = 0; i < xm.vertices.length; i += 3) {
      v.set(xm.vertices[i], xm.vertices[i + 1], xm.vertices[i + 2]).applyMatrix4(matrix);
      verts[i] = v.x; verts[i + 1] = v.y; verts[i + 2] = v.z;
    }
    const P = this.app.physics;
    try {
      rec.body = P.fixedBody({ x: 0, y: 0, z: 0 });
      P.addCollider(P.R.ColliderDesc.trimesh(verts, new Uint32Array(xm.indices)).setFriction(0.8), rec.body, { kind: 'static', scanned: true });
    } catch (e) {
      console.warn('Room mesh collider failed', e);
    }
    return rec;
  }

  disposeRecord(rec) {
    if (rec.mesh) {
      rec.mesh.removeFromParent();
      rec.mesh.geometry.dispose();
      rec.digitalMat?.dispose();
    }
    if (rec.edges) {
      rec.edges.removeFromParent();
      rec.edges.geometry.dispose();
    }
    if (rec.body) this.app.physics.removeBody(rec.body);
  }

  clear() {
    for (const rec of [...this.planes.values(), ...this.meshes.values()]) this.disposeRecord(rec);
    this.planes.clear();
    this.meshes.clear();
    this.sawData = false;
  }

  /** Highest horizontal surface (table) in front of a point — used for layout. */
  findTable(near, maxDist = 1.5) {
    let best = null;
    for (const rec of this.planes.values()) {
      if (!rec.horizontal || rec.label === 'floor' || rec.label === 'ceiling') continue;
      const box = new THREE.Box3().setFromObject(rec.mesh);
      const c = box.getCenter(new THREE.Vector3());
      if (c.y < 0.4 || c.y > 1.3) continue;
      const d = Math.hypot(c.x - near.x, c.z - near.z);
      if (d < maxDist && (!best || d < best.d)) best = { d, center: c, box };
    }
    return best;
  }
}
