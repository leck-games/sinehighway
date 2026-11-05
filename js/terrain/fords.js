// Shallow water sheets over the road (fords / coastal wash) from world.js fordsIn(); one small grid mesh per ford near the car.
// Vertices are built once in local coords; a floating-origin shift just moves the mesh (no rebuild).
import * as THREE from 'three';
import * as W from './world.js';
import { fordMat } from './comic.js';
const NU = 10, NV = 14;
export function createFords(scene) {
  const mat = fordMat(), live = new Map(), PPf = {};
  function build(f) {
    const pos = new Float32Array((NU + 1) * (NV + 1) * 3), dep = new Float32Array((NU + 1) * (NV + 1)), idx = [];
    for (let i = 0; i <= NU; i++) { const s = f.c - f.w + 2 * f.w * i / NU; W.routePoint(s, PPf); const nx = -PPf.tz, nz = PPf.tx, px = PPf.x, pz = PPf.z;
      for (let j = 0; j <= NV; j++) { const d = -f.lat + 2 * f.lat * j / NV, x = px + nx * d, z = pz + nz * d, [lv, dp] = W.fordSurface(f, x, z), k = i * (NV + 1) + j;
        pos[k * 3] = x; pos[k * 3 + 1] = lv + 0.02; pos[k * 3 + 2] = z; dep[k] = dp; } }
    for (let i = 0; i < NU; i++) for (let j = 0; j < NV; j++) { const a = i * (NV + 1) + j, b = a + NV + 1; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('dep', new THREE.BufferAttribute(dep, 1)); g.setIndex(idx);
    const m = new THREE.Mesh(g, mat); m.frustumCulled = false; m.userData.o = W.origin(); scene.add(m); return m;
  }
  return {
    update(sCur) {
      const want = W.fordsIn(sCur - 350, sCur + 650), keep = new Set();
      for (const f of want) { keep.add(f); if (!live.has(f)) live.set(f, build(f)); }
      const O = W.origin();
      for (const [f, m] of live) { if (!keep.has(f)) { scene.remove(m); m.geometry.dispose(); live.delete(f); continue; } m.position.set(m.userData.o.x - O.x, 0, m.userData.o.z - O.z); }
    },
    get count() { return live.size; },
  };
}
