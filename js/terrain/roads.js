// Road meshes: ribbons generated along the same math paths used by world.height() (road graph edges + race loops).
// Asphalt highways get edge lines + dashed centre line, dirt trails/loops get wheel ruts; bridges get a deck slab, rails and pillars.
import * as THREE from 'three';
import { pathsNear, pathPoint, PP, HWY, LOOP, WATER, TUN_H, TUN_W, rimSpan } from './world.js';
import { asphaltHD, dirtHD } from './roadhd.js';

function canvasTex(draw) {
  const c = document.createElement('canvas'); c.width = 64; c.height = 256; const g = c.getContext('2d'); draw(g);
  const t = new THREE.CanvasTexture(c); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4; t.colorSpace = THREE.SRGBColorSpace; return t;
}
function noise(g, base, amp, n = 900) { g.fillStyle = base; g.fillRect(0, 0, 64, 256); for (let i = 0; i < n; i++) { const v = (Math.random() - 0.5) * amp; g.fillStyle = `rgba(${v > 0 ? '255,255,255' : '0,0,0'},${Math.abs(v)})`; g.fillRect(Math.random() * 64, Math.random() * 256, 2, 2); } }
export function createRoads(scene, mk) { // mk(kind:'asphalt'|'dirt'|'bridge', tex) -> material (comic shaders from main.js)
  const asphaltTex = canvasTex(g => {
    noise(g, '#45464b', 0.25);
    g.fillStyle = '#eee'; g.fillRect(3, 0, 3, 256); g.fillRect(58, 0, 3, 256);
    g.fillStyle = '#f2c230'; g.fillRect(30.5, 0, 3, 140);
    g.fillStyle = 'rgba(238,238,238,0.85)'; g.fillRect(16, 0, 2, 90); g.fillRect(46, 0, 2, 90); // lane dashes: the 24 m highway reads as 2 lanes each way
  });
  const dirtTex = canvasTex(g => {
    noise(g, '#9a7652', 0.3, 1400);
    const gr = g.createLinearGradient(0, 0, 64, 0);
    gr.addColorStop(0, 'rgba(110,140,60,0.9)'); gr.addColorStop(0.1, 'rgba(110,140,60,0)'); gr.addColorStop(0.9, 'rgba(110,140,60,0)'); gr.addColorStop(1, 'rgba(110,140,60,0.9)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 256);
    g.fillStyle = 'rgba(70,50,32,0.55)'; g.fillRect(14, 0, 7, 256); g.fillRect(43, 0, 7, 256); // ruts
    g.fillStyle = 'rgba(120,150,70,0.35)'; g.fillRect(29, 0, 6, 256); // centre grass strip
  });
  // asphalt sits higher and gets a stronger depth offset than dirt, so trails never draw over the highway at crossings
  const matA = mk('asphalt', asphaltTex), matD = mk('dirt', dirtTex), matB = mk('bridge', null), matT = mk('tunnel', null);
  const meshes = [new THREE.Mesh(new THREE.BufferGeometry(), matA), new THREE.Mesh(new THREE.BufferGeometry(), matD), new THREE.Mesh(new THREE.BufferGeometry(), matB), new THREE.Mesh(new THREE.BufferGeometry(), matT)];
  meshes.forEach(m => { m.frustumCulled = false; scene.add(m); });
  meshes[1].renderOrder = 1; meshes[0].renderOrder = 2; // trails first, asphalt last (wins ties at crossings)
  let lx = 1e9, lz = 1e9; const RAD = 650, STEP = 5;
  function build(px, pz) {
    const buf = [{ p: [], uv: [], idx: [], nr: [] }, { p: [], uv: [], idx: [], nr: [] }, { p: [], n: [], idx: [] }, { p: [], c: [], idx: [] }];
    const paths = pathsNear(px, pz, RAD);
    for (const e of paths) {
      const len = e.len, n = Math.ceil(len / STEP), b = buf[e.type === HWY ? 0 : 1], hw = e.hw;
      // RIM HIGHWAY (69 km): only its t-window around the player is walked (streamed with the rest of the roads, no upfront mesh)
      const sp = e.rim ? rimSpan(px, pz, RAD) : null, i0 = sp ? Math.floor(sp[0] * n) : 0, i1 = sp ? Math.ceil(sp[1] * n) : n;
      let run = -1, vlen = sp ? i0 * len / n : 0, prev = null, tprev = null;
      for (let i = i0; i <= i1; i++) {
        const t = sp ? ((i / n) % 1 + 1) % 1 : i / n; pathPoint(e, t);
        const dx = PP.x - px, dz = PP.z - pz, inside = dx * dx + dz * dz < RAD * RAD;
        if (!inside) { run = -1; prev = null; continue; }
        const bank = PP.bank; // cross slope from world.js (RIM: NASCAR superelevation up to ~26 deg, edges: gentle crown)
        const nx = -PP.tz, nz = PP.tx, y = PP.y + (e.type === HWY ? 0.16 : 0.08); // normal (left)
        const base = b.p.length / 3;
        b.p.push(PP.x + nx * hw, y + hw * bank, PP.z + nz * hw, PP.x - nx * hw, y - hw * bank, PP.z - nz * hw);
        vlen += prev ? Math.hypot(PP.x - prev[0], PP.z - prev[1]) : 0; prev = [PP.x, PP.z];
        b.uv.push(0, vlen / 14, 1, vlen / 14);
        const il = 1 / Math.hypot(1, bank); b.nr.push(-nx * bank * il, il, -nz * bank * il, -nx * bank * il, il, -nz * bank * il); // tilted normal on the banked RIM
        if (run >= 0) b.idx.push(base - 2, base, base - 1, base - 1, base, base + 1);
        run = base;
        if (PP.bridge) addBridge(buf[2], e, t, len / n, hw, nx, nz, PP.x, PP.y, PP.z, i);
        if ((PP.tun > 0) !== !!tprev && e.tn) { // tube enters/leaves between the previous and this station: put a ring exactly at the portal
          const s1 = (t || (sp ? 1 : 0)) * len, s0 = s1 - len / n, tt = e.tn.find(q => (q.s0 > s0 - 1e-6 && q.s0 <= s1) || (q.s1 >= s0 && q.s1 < s1 + 1e-6));
          if (tt) { const sP = tt.s0 > s0 - 1e-6 && tt.s0 <= s1 ? tt.s0 : tt.s1; pathPoint(e, sP / len); PP.tun = Math.max(PP.tun, 0.01); tprev = addTube(buf[3], e, hw, -PP.tz, PP.tx, tprev, vlen); pathPoint(e, t); if (!(PP.tun > 0)) tprev = null; }
        }
        if (PP.tun > 0) tprev = addTube(buf[3], e, hw, nx, nz, tprev, vlen); else tprev = null;
      }
      if (e.tn) for (const tt of e.tn) for (const sP of [tt.s0, tt.s1]) if (sP >= 0 && sP <= len) { pathPoint(e, sP / len); if ((PP.x - px) ** 2 + (PP.z - pz) ** 2 < RAD * RAD) addPortal(buf[3], e, sP); }
    }
    for (let k = 0; k < 2; k++) {
      const g = new THREE.BufferGeometry(), b = buf[k];
      g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(b.uv, 2));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(b.nr, 3));
      g.setIndex(b.idx); meshes[k].geometry.dispose(); meshes[k].geometry = g;
    }
    let g = new THREE.BufferGeometry(); const b = buf[2];
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3)); g.setIndex(b.idx); g = g.toNonIndexed(); g.computeVertexNormals(); // flat-shaded boxes for crisp ink edges
    meshes[2].geometry.dispose(); meshes[2].geometry = g;
    g = new THREE.BufferGeometry(); const bt = buf[3];
    g.setAttribute('position', new THREE.Float32BufferAttribute(bt.p, 3)); g.setAttribute('tc', new THREE.Float32BufferAttribute(bt.c, 4)); g.setIndex(bt.idx); g = g.toNonIndexed(); g.computeVertexNormals();
    meshes[3].geometry.dispose(); meshes[3].geometry = g;
  }
  // bridge pieces: slab under the deck, side rails, a pillar every ~25 m
  function box(b, cx, cy, cz, ax, az, hx, hy, hz) { // oriented box: (ax,az) = forward dir
    const lx = -az, lz = ax, base = b.p.length / 3;
    for (const sy of [-1, 1]) for (const sl of [-1, 1]) for (const sf of [-1, 1]) b.p.push(cx + lx * sl * hx + ax * sf * hz, cy + sy * hy, cz + lz * sl * hx + az * sf * hz);
    const F = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]];
    for (const f of F) b.idx.push(base + f[0], base + f[1], base + f[2], base + f[0], base + f[2], base + f[3]);
  }
  // HILLS: tunnel tube (one merged mesh): chamfered box section, darker towards the middle, a yellow light strip every ~20 m,
  // concrete portal headwalls (hide the terrain seam at the mouth). Returns the ring for the next station.
  const TUBE = (W, H) => [[W, -1.2], [W, H - 1.6], [W - 1.6, H], [1.6 - W, H], [-W, H - 1.6], [-W, -1.2]];
  function quad(b, a, c, d, f, col, em) { const base = b.p.length / 3; b.p.push(...a, ...c, ...d, ...f); for (let k = 0; k < 4; k++) b.c.push(col[0], col[1], col[2], em); b.idx.push(base, base + 1, base + 2, base, base + 2, base + 3); }
  function addTube(b, e, hw, nx, nz, prev, vlen) {
    const H = TUN_H[e.type], W = hw + TUN_W - 0.2, y = PP.y, dk = 1 - 0.45 * Math.min(1, PP.tun / 30);
    const ring = TUBE(W, H).map(([l, v]) => [PP.x + nx * l, y + v, PP.z + nz * l]);
    const col = [0.56 * dk, 0.54 * dk, 0.5 * dk], roof = [0.36 * dk, 0.35 * dk, 0.34 * dk];
    if (prev) {
      for (let k = 0; k < 5; k++) quad(b, prev.ring[k], ring[k], ring[k + 1], prev.ring[k + 1], k === 2 ? roof : col, 0);
      if (fl(vlen / 20) !== fl(prev.vlen / 20)) { // light strip under the roof
        const fx = PP.tx * 1.6, fz = PP.tz * 1.6, w = 0.35, yy = y + H - 0.08;
        quad(b, [PP.x + nx * w - fx, yy, PP.z + nz * w - fz], [PP.x + nx * w + fx, yy, PP.z + nz * w + fz], [PP.x - nx * w + fx, yy, PP.z - nz * w + fz], [PP.x - nx * w - fx, yy, PP.z - nz * w - fz], [1, 0.86, 0.45], 1);
      }
    }
    return { ring, vlen };
  }
  function addPortal(b, e, sP) { // concrete headwall + hazard stripe at a tunnel mouth
    pathPoint(e, sP / e.len); const nx = -PP.tz, nz = PP.tx, H = TUN_H[e.type], W = e.hw + TUN_W - 0.2, y = PP.y;
      const box2 = (l0, l1, v0, v1, col, th = 0.6) => { const P = (l, v, f) => [PP.x + nx * l + PP.tx * f, y + v, PP.z + nz * l + PP.tz * f];
        quad(b, P(l0, v0, -th), P(l1, v0, -th), P(l1, v1, -th), P(l0, v1, -th), col, 0); quad(b, P(l0, v0, th), P(l0, v1, th), P(l1, v1, th), P(l1, v0, th), col, 0);
        quad(b, P(l0, v1, -th), P(l1, v1, -th), P(l1, v1, th), P(l0, v1, th), col, 0); quad(b, P(l0, v0, -th), P(l0, v1, -th), P(l0, v1, th), P(l0, v0, th), col, 0); quad(b, P(l1, v0, -th), P(l1, v1, -th), P(l1, v1, th), P(l1, v0, th), col, 0); };
      const cc = [0.78, 0.74, 0.66], st = [0.95, 0.72, 0.15];
      box2(W, W + 4.5, -3, H + 2.2, cc); box2(-W - 4.5, -W, -3, H + 2.2, cc); box2(-W, W, H, H + 2.2, cc); box2(-W - 0.02, W + 0.02, H - 0.05, H + 0.7, st, 0.68);
      }
  const fl = Math.floor;
  function addBridge(b, e, t, ds, hw, nx, nz, x, y, z, i) {
    const ax = nz, az = -nx; // forward = tangent
    box(b, x, y - 0.6, z, PP.tx, PP.tz, hw + 0.6, 0.55, ds * 0.5 + 0.05);
    box(b, x + nx * (hw + 0.4), y + 0.6, z + nz * (hw + 0.4), PP.tx, PP.tz, 0.15, 0.5, ds * 0.5 + 0.05);
    box(b, x - nx * (hw + 0.4), y + 0.6, z - nz * (hw + 0.4), PP.tx, PP.tz, 0.15, 0.5, ds * 0.5 + 0.05);
    if (i % 5 === 0) { const bot = WATER - 4, h = (y - 1.1 - bot) / 2; if (h > 0.5) box(b, x, bot + h, z, PP.tx, PP.tz, hw * 0.7, h, 0.8); }
  }
  // graphics detail: 0 = classic 64x256 canvases (LOW/MED), 1 = HIGH (512x1024), 2 = ULTRA (1024x2048) + normal/roughness maps, max anisotropy, mipmaps
  const hd = {}; let detail = 0;
  function dataTex(d, colour, aniso) { const t = new THREE.DataTexture(colour ? d.col : d.nrm, d.w, d.h, THREE.RGBAFormat); t.wrapS = THREE.ClampToEdgeWrapping; t.wrapT = THREE.RepeatWrapping;
    t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearMipmapLinearFilter; t.generateMipmaps = true; t.anisotropy = aniso; t.colorSpace = colour ? THREE.SRGBColorSpace : THREE.NoColorSpace; t.needsUpdate = true; return t; } // colour in sRGB like the classic canvases
  function setDetail(level, aniso = 4) {
    level = Math.max(0, Math.min(2, level | 0)); if (level === detail && (level === 0 || hd[level])) { for (const t of [asphaltTex, dirtTex]) t.anisotropy = level ? aniso : 4; return detail; }
    for (const k of Object.keys(hd)) if (+k !== level) { for (const t of hd[k].tex) t.dispose(); delete hd[k]; } // keep only the active level in VRAM
    if (level && !hd[level]) { const t0 = performance.now(), W = level === 2 ? 1024 : 512, a = asphaltHD(W, W * 2), d = dirtHD(W, W * 2);
      hd[level] = { a, d, tex: [dataTex(a, 1, aniso), dataTex(a, 0, aniso), dataTex(d, 1, aniso), dataTex(d, 0, aniso)], ms: performance.now() - t0 }; }
    detail = level; const h = hd[level];
    for (const t of [asphaltTex, dirtTex]) { t.anisotropy = level ? aniso : 4; t.needsUpdate = true; }
    const set = (m, map, nmap, vs) => { m.uniforms.map.value = map; m.uniforms.nmap.value = nmap; m.uniforms.uHD.value = nmap ? 1 : 0; m.uniforms.uVS.value = vs; };
    if (!h) { set(matA, asphaltTex, null, 1); set(matD, dirtTex, null, 1); }
    else { set(matA, h.tex[0], h.tex[1], 14 / 48); set(matD, h.tex[2], h.tex[3], h.d.vs); }
    return detail;
  }
  return {
    meshes, setDetail, get detail() { return detail; }, get hdStats() { const h = hd[detail]; return h ? { level: detail, size: h.a.w + 'x' + h.a.h, genMs: Math.round(h.ms) } : { level: 0 }; },
    update(px, pz, force) { if (!force && Math.hypot(px - lx, pz - lz) < 140) return; lx = px; lz = pz; build(px, pz); },
  };
}
