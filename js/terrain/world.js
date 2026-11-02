// Pure-math world: every height, surface, river, road and tree is a function of (x,z).
// No heightmaps are stored; only small per-road height profiles are cached (derived from the same functions).
export const WATER = 0, WORLD = 10000; // drivable +-10 km (20x20 km)
const S = Math.sin, C = Math.cos, A = Math.abs, mn = Math.min, mx = Math.max, fl = Math.floor;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sst = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const smin = (a, b, k) => { const h = mx(k - A(a - b), 0) / k; return mn(a, b) - h * h * k * 0.25; };
function hash(i, j, k = 0) { const s = S(i * 127.1 + j * 311.7 + k * 74.7) * 43758.5453; return s - fl(s); }
export function hash2(i, j, k) { return hash(i, j, k); }

// ---------------- surfaces ----------------
export const SURF = { ASPHALT: 0, DIRT: 1, GRASS: 2, SAND: 3, ROCK: 4, SNOW: 5, MUD: 6 };
export const SURF_NAMES = ['asphalt', 'dirt', 'grass', 'sand', 'rock', 'snow', 'mud'];
// mu = peak friction, roll = rolling resistance coeff, bs = tyre stiffness scale (loose = lower)
export const SURF_PARAMS = [
  { mu: 1.10, roll: 0.012, bs: 1.00 }, // asphalt
  { mu: 0.84, roll: 0.028, bs: 0.75 }, // dirt
  { mu: 0.74, roll: 0.045, bs: 0.70 }, // grass
  { mu: 0.68, roll: 0.10, bs: 0.55 },  // sand
  { mu: 0.92, roll: 0.020, bs: 0.90 }, // rock
  { mu: 0.50, roll: 0.050, bs: 0.60 }, // snow
  { mu: 0.52, roll: 0.15, bs: 0.50 },  // mud
];

// ---------------- macro regions (low-frequency selector field) ----------------
export const REG = { HILLS: 0, PLAINS: 1, DUNES: 2, CANYON: 3, ALPINE: 4 };
export const REG_NAMES = ['hills', 'plains', 'dunes', 'canyon', 'alpine'];
const RC = [[0, 0], [0.62, 0.05], [-0.05, 0.62], [-0.62, -0.05], [0.05, -0.62]];
const RW = new Float32Array(5);
function selector(x, z) { // fills RW with normalised region weights
  const wx = x + 420 * S(z * 0.00071 + 1.3), wz = z + 420 * C(x * 0.00067 - 0.6);
  const a = 0.78 * S(wx * 0.00093 + 0.9) * C(wz * 0.00081 - 1.1) + 0.32 * S((wx - wz) * 0.00057 + 2.0);
  const b = 0.78 * C(wx * 0.00077 - 2.2) * S(wz * 0.00098 + 0.3) + 0.32 * C((wx + wz) * 0.00061 - 0.7);
  let s = 0;
  for (let i = 0; i < 5; i++) { const dx = a - RC[i][0], dz = b - RC[i][1], e = Math.exp(-16 * (dx * dx + dz * dz)); RW[i] = e; s += e; }
  let s2 = 0;
  for (let i = 0; i < 5; i++) { let w = RW[i] / s; w = w < 0.02 ? 0 : w; RW[i] = w; s2 += w; }
  for (let i = 0; i < 5; i++) RW[i] /= s2;
}
export function regionWeights(x, z, out) { selector(x, z); for (let i = 0; i < 5; i++) out[i] = RW[i]; return out; }

function base(x, z) { return 20 + 25 * S(x * 0.00023 + 1) * C(z * 0.00019 - 0.4) + 12 * S((x + z) * 0.00041); }
// rolling hills: 5 octaves of rotated sine*cosine with domain warp + escarpment cliffs
const OCT = [];
for (let i = 0; i < 5; i++) { const a = i * 1.27 + 0.3; OCT.push([34 / Math.pow(2.05, i), 0.0019 * Math.pow(2.03, i), C(a), S(a), i * 2.1]); }
function hHills(x, z, wx, wz, b) {
  let h = b;
  for (let i = 0; i < 5; i++) { const o = OCT[i], u = (wx * o[2] + wz * o[3]) * o[1], v = (wz * o[2] - wx * o[3]) * o[1]; h += o[0] * S(u + o[4]) * C(v * 0.83 - o[4]); }
  // escarpments: step function of a low-frequency field -> cliffs
  const e = S(x * 0.0011 + 0.3 * S(z * 0.003)) * C(z * 0.0009 + 1.7);
  h += 16 * sst(-0.04, 0.04, e) * sst(0.1, 0.5, S(x * 0.0005 - z * 0.0004 + 2));
  return h;
}
function hPlains(x, z, wx, wz, b) {
  let h = 4 + 0.25 * b + 4 * S(wx * 0.0031) * C(wz * 0.0027) + 1.5 * S(wx * 0.011 + 1) * C(wz * 0.009) + 0.6 * S(wx * 0.031) * C(wz * 0.027);
  // lakes: blobs where a slow sine product peaks
  h -= 16 * sst(0.42, 0.8, S(x * 0.0013 + 0.7) * C(z * 0.0011 + 2.1) + 0.3 * S(wx * 0.004));
  return h;
}
function hDunes(x, z, wx, wz, b) { // ridged anisotropic sine dunes
  const th = 0.6 + 0.35 * S(x * 0.0003 + z * 0.0002), ct = C(th), stt = S(th);
  const u = x * ct + z * stt, v = -x * stt + z * ct;
  const r = 1 - A(S(u * 0.021 + 1.6 * S(v * 0.0061) + 0.7 * S(v * 0.013 + 1)));
  const r2 = 1 - A(S(u * 0.05 + v * 0.021 + 2 * S(v * 0.011 + 3)));
  return 5 + 0.3 * b + 15 * Math.pow(r, 1.7) * (0.65 + 0.35 * S(v * 0.0041)) + 4 * r2 * r2 + 0.4 * S(u * 0.4) * S(v * 0.05);
}
function hCanyon(x, z, wx, wz, b) { // terraced mesas + canyon channels
  const n = 0.6 * b + 38 + 46 * S(wx * 0.0021) * C(wz * 0.0018) + 20 * S(wx * 0.0051 + 1) * C(wz * 0.0047) + 7 * S(wx * 0.013) * C(wz * 0.011 + 2);
  const step = 13, t = n / step, f = t - fl(t);
  let h = (fl(t) + sst(0.62, 0.92, f)) * step + f * 2.5; // flat tops, steep risers
  const c = A(S(wx * 0.0029 + 2.2 * S(wz * 0.0016 + 0.4)) + 0.25 * S(wz * 0.007));
  const floor = 6 + 0.15 * b + 2 * S(wx * 0.01) * C(wz * 0.012);
  h = floor + (h - floor) * sst(0.07, 0.24, c);
  return h;
}
function hAlpine(x, z, wx, wz, b) { // ridged multi-octave mountains
  let h = b + 22, a = 120, f = 0.0021;
  for (let i = 0; i < 4; i++) {
    const ang = i * 1.9 + 0.4, ca = C(ang), sa = S(ang), u = (wx * ca + wz * sa) * f, v = (wz * ca - wx * sa) * f;
    const r = 1 - A(S(u + i) * C(v * 0.9 - i));
    h += a * r * r; a *= 0.46; f *= 2.13;
  }
  return h - 30;
}
const HF = [hHills, hPlains, hDunes, hCanyon, hAlpine];
const BANK = [0.35, 0.13, 0.28, 2.2, 0.8]; // river bank slope per region (canyon = gorge)

// ---------------- rivers: distance to meandering sine curves, carved into the height ----------------
const RIV = { d: 1e9, hw: 0, p: 0 };
function river(x, z) {
  let best = 1e9, hw = 10, pres = 0;
  { // east-west family
    const k = Math.round(z / 3100), zc = k * 3100 + 400 * (hash(k, 1) - 0.5) + 220 * S(x * 0.0013 + k * 1.7) + 80 * S(x * 0.0037 + k),
      d1 = 220 * 0.0013 * C(x * 0.0013 + k * 1.7) + 80 * 0.0037 * C(x * 0.0037 + k), d = A(z - zc) / Math.sqrt(1 + d1 * d1);
    const p = sst(-0.35, 0.1, S(x * 0.00042 + k * 2.3));
    if (p > 0) { best = d; pres = p; hw = 9 + 5 * S(x * 0.002 + k); }
  }
  { // north-south family
    const k = Math.round((x - 1500) / 4300), xc = 1500 + k * 4300 + 500 * (hash(k, 2) - 0.5) + 260 * S(z * 0.0011 + k * 2.9) + 90 * S(z * 0.0033 - k),
      d1 = 260 * 0.0011 * C(z * 0.0011 + k * 2.9) + 90 * 0.0033 * C(z * 0.0033 - k), d = A(x - xc) / Math.sqrt(1 + d1 * d1);
    const p = sst(-0.35, 0.1, S(z * 0.00039 + k * 1.1 + 1));
    if (p > 0 && d + 1000 * (1 - p) < best + 1000 * (1 - pres)) { best = d; pres = p; hw = 8 + 5 * S(z * 0.0023 - k); }
  }
  RIV.d = best; RIV.hw = hw; RIV.p = pres;
}

// natural terrain (regions + rivers), no roads. Fills NAT.
const NAT = { h: 0, dom: 0, riv: 1e9 };
function natural(x, z) {
  selector(x, z);
  const wx = x + 60 * S(z * 0.0023 + 0.7), wz = z + 60 * C(x * 0.0019 - 0.3), b = base(x, z);
  let h = 0, bank = 0, dom = 0, dw = 0;
  for (let i = 0; i < 5; i++) { const w = RW[i]; if (w > 0) { h += w * HF[i](x, z, wx, wz, b); bank += w * BANK[i]; if (w > dw) { dw = w; dom = i; } } }
  river(x, z);
  let rd = 1e9;
  if (RIV.p > 0) {
    rd = RIV.d - RIV.hw;
    const bed = -2.6 + (1 - RIV.p) * 400; // channel bottom below water level; fades out where the river "ends"
    const q = rd < 0 ? rd / RIV.hw + 1 : 1;
    const hr = bed + mx(0, rd) * bank + 0.8 * q * q;
    h = smin(h, hr, 5);
  }
  NAT.h = h; NAT.dom = dom; NAT.riv = rd;
  return h;
}
export function naturalHeight(x, z) { return natural(x, z); }

// ---------------- road network: graph on a coarse jittered grid, sine-curve edges ----------------
const RG = 1400, HWY = 1, TRAIL = 2, LOOP = 3;
// road half-widths (m). v2 widening: paved highways 6 -> 12 (2x), dirt trails 3.6 -> 5.4 and dirt race loops 8 -> 12 (1.5x).
// Every mask (trees, rocks, grass, fuel, bridges, grade blend, shoulders) derives from e.hw, so they follow automatically.
export const ROAD_HW = { hwy: 12, trail: 5.4, loop: 12 }, ROAD_HW_V1 = { hwy: 6, trail: 3.6, loop: 8 };

// ---------------- RIM HIGHWAY (local): one closed 2x2-lane ring just inside the world rim ----------------
// Polar squircle r(th) = A / (|cos|^6 + |sin|^6)^(1/6) (rounded corners, R >= ~2.4 km) with three small meanders; arc-length
// parametrised (t = s / len) through lookup tables. Treated as a closed (loop) path of type HWY with the top crossing priority (id 'RIM'),
// so every road that meets it is graded to its surface. NASCAR banking: per-station superelevation e.bk (slope, + = left side up) from
// the design speed, smoothed into spiral transitions and faded to ~0 at junctions, bridges and tunnels; real geometry in the bed (sample)
// and the ribbon (roads.js), so the physics feels it through heightAt/normalAt.
export const RIM_HW = 16, RIM_A = 9380, RIM_V = 115, RIM_BANK_MIN = 3, RIM_BANK_MAX = 33, RIM_IN = 7900; // RIM_V: design speed (m/s) for the bank angle
function rimR(th) { const c = C(th), s = S(th), c2 = c * c, s2 = s * s;
  return RIM_A * Math.pow(c2 * c2 * c2 + s2 * s2 * s2, -1 / 6) * (1 + 0.012 * S(7 * th + 0.9) + 0.006 * S(12 * th + 2.1) + 0.003 * S(19 * th + 0.3)); }
const RIM_N = 8192, RIM_TH = new Float32Array(RIM_N + 1), RIM_TS = new Float32Array(RIM_N + 1); let RIM_LEN = 0;
{ const NI = 131072, h = 6.283185307179586 / NI, cum = new Float64Array(NI + 1);
  for (let k = 0; k < NI; k++) { const a = k * h, r = rimR(a + h / 2), dr = (rimR(a + h) - rimR(a)) / h; cum[k + 1] = cum[k] + Math.hypot(r, dr) * h; }
  RIM_LEN = cum[NI];
  for (let k = 0; k <= RIM_N; k++) RIM_TS[k] = cum[k * NI / RIM_N] / RIM_LEN; // t at th = 2pi k/N
  let j = 0; for (let k = 0; k <= RIM_N; k++) { const s = k / RIM_N * RIM_LEN; while (j < NI - 1 && cum[j + 1] < s) j++; RIM_TH[k] = (j + (s - cum[j]) / mx(1e-9, cum[j + 1] - cum[j])) * h; } }
const wrap1 = t => t - fl(t);
function rimTh(t) { const f = wrap1(t) * RIM_N, i = mn(RIM_N - 1, fl(f)); return RIM_TH[i] + (RIM_TH[i + 1] - RIM_TH[i]) * (f - i); }
function rimT(th) { th = th / 6.283185307179586; const f = wrap1(th) * RIM_N, i = mn(RIM_N - 1, fl(f)); return RIM_TS[i] + (RIM_TS[i + 1] - RIM_TS[i]) * (f - i); }
function rimK(th) { const h = 2e-3, r = rimR(th), a = rimR(th - h), b = rimR(th + h), r1 = (b - a) / (2 * h), r2 = (b - 2 * r + a) / (h * h);
  return (r * r + 2 * r1 * r1 - r * r2) / Math.pow(r * r + r1 * r1, 1.5); } // signed curvature (+ = bends left = towards the centre)
const RIM = { id: 'RIM', name: 'RIM HIGHWAY', rim: true, loop: true, type: HWY, hw: RIM_HW, k: 0, amp: 0, len: RIM_LEN, trk: { cx: 0, cz: 0, R: RIM_A } };
// junction nodes: grid nodes within RIM_SNAP of the ring (or outside it) snap onto it; only highways connect (trails to them are dropped)
const RIM_SNAP = 150;
function nodeXZ(i, j) { return [(i + 0.5 + 0.55 * (hash(i, j, 11) - 0.5)) * RG, (j + 0.5 + 0.55 * (hash(i, j, 12) - 0.5)) * RG]; }
function rimOuter(x, z) { return mx(A(x), A(z)) > RIM_IN - 400 && Math.hypot(x, z) > rimR(Math.atan2(z, x)) - RIM_SNAP; }
let rimJ = null;
export function rimJunctions() { baseProfile(RIM); return RIM.J; } // [{t, i, j, x, z, h}] where a highway meets the ring
function rimNodes() { // outer grid nodes with a highway edge to an inner node (radial foot on the ring; placement refined in rimPlaceJunctions)
  if (rimJ) return rimJ; rimJ = [];
  const R = Math.ceil(WORLD / RG) + 2;
  for (let i = -R; i < R; i++) for (let j = -R; j < R; j++) {
    const [x, z] = nodeXZ(i, j); if (!rimOuter(x, z)) continue;
    let hw = false; for (const [a, b, d] of [[i, j, 0], [i - 1, j, 0], [i, j, 1], [i, j - 1, 1]]) {
      if (edgeType(a, b, d) !== HWY) continue; const [ox, oz] = d ? (b === j ? nodeXZ(i, j + 1) : nodeXZ(i, j - 1)) : (a === i ? nodeXZ(i + 1, j) : nodeXZ(i - 1, j)); if (!rimOuter(ox, oz)) hw = true; }
    if (!hw) continue; const th = Math.atan2(z, x); rimJ.push({ t: rimT(th < 0 ? th + 6.283185307179586 : th), i, j });
  }
  rimJ.sort((a, b) => a.t - b.t); return rimJ;
}
// slide each junction along the ring (<= 750 m) to the nearest station that is open road: no tunnel / bridge within 120 m,
// ground close to the road (no deep cut / high fill), so the joining highway arrives on an at-grade, flat (unbanked) stretch
function rimPlaceJunctions(e, M, ds) {
  const J = [], bad = i => { if (e.br[pmod(i, M)]) return true; const s = pmod(i, M) * ds; return e.tn && e.tn.some(t => s > t.s0 - 120 && s < t.s1 + 120) || (e.tn && e.tn.some(t => s + e.len > t.s0 - 120 && s + e.len < t.s1 + 120)); };
  for (const q of rimNodes()) {
    const i0 = Math.round(q.t * M); let best = null;
    for (let k = -70; k <= 70; k++) { const i = pmod(i0 + k, M); let ok = true; for (let m = -4; m <= 4; m++) if (bad(i + m)) { ok = false; break; } if (!ok || J.some(q => A(pmod(Math.round(q.t * M) - i + M / 2, M) - M / 2) < 20)) continue; // keep 600 m between junctions
      pathPoint(e, i / M, false); const c = A(natural(PP.x, PP.z) - e.prof[i]), sc = A(k) * ds / 150 + mx(0, A(k) - 25) * ds / 60 + mx(0, c - 1.5) * 2;
      if (!best || sc < best.sc) best = { sc, i }; }
    const i = best ? best.i : i0; pathPoint(e, i / M, false); J.push({ t: i / M, i: q.i, j: q.j, x: PP.x, z: PP.z, h: e.prof[i] });
  }
  e.J = J; e.jst = J.map(q => Math.round(q.t * M));
}
export function rimSpan(x, z, r) { // t window of the ring within ~r of (x,z) (null: ring not near). Used by meshes / maps (a 69 km path is never walked whole)
  if (mx(A(x), A(z)) + r < RIM_IN) return null; const th = Math.atan2(z, x), t = rimT(th < 0 ? th + 6.283185307179586 : th), w = (r + 400) / RIM_LEN * 1.6;
  return w >= 0.5 ? [0, 1] : [t - w, t + w];
}
const nodes = new Map();
function nodeAt(i, j) {
  const key = (i + 5000) * 10000 + (j + 5000); let n = nodes.get(key);
  if (!n) {
    let [x, z] = nodeXZ(i, j);
    if (rimOuter(x, z)) { const q = rimJunctions().find(q => q.i === i && q.j === j); // junction node: its spot on the ring (or a dead outer node: radial foot)
      if (q) n = { i, j, x: q.x, z: q.z, h: q.h, rim: true }; else { const th = Math.atan2(z, x), r = rimR(th); n = { i, j, x: r * C(th), z: r * S(th), h: 0, rim: true }; }
      nodes.set(key, n); return n; }
    let h = 0; for (const [ox, oz] of [[0, 0], [40, 0], [-40, 0], [0, 40], [0, -40]]) h += natural(x + ox, z + oz) / 5;
    h = mx(h, WATER + 2.5);
    // ROADS OVER TERRAIN (local): a junction sitting on a race loop takes the loop's bed height, so the roads meeting there do not dam/bury it
    const lp = nearTrack(x, z).path; if (pathDist(lp, x, z) && PD.d < lp.hw + 140) { baseProfile(lp); const y = profY(lp, PD.t); h = PD.d < lp.hw + 70 ? y : h + (y - h) * sst(lp.hw + 140, lp.hw + 70, PD.d); }
    n = { i, j, x, z, h }; nodes.set(key, n);
  }
  return n;
}
const pmod = (a, m) => ((a % m) + m) % m;
function edgeType(i, j, dir) { // dir 0: (i,j)->(i+1,j) ; 1: (i,j)->(i,j+1)
  if (dir === 0) { if (pmod(j, 4) === 1) return HWY; return hash(i, j, 21) < 0.55 ? TRAIL : 0; }
  if (pmod(i, 5) === 2) return HWY; return hash(i, j, 22) < 0.5 ? TRAIL : 0;
}
const edges = new Map();
function edgeAt(i, j, dir) {
  const key = ((i + 5000) * 10000 + (j + 5000)) * 2 + dir; if (edges.has(key)) return edges.get(key);
  const type = edgeType(i, j, dir); let e = null;
  if (type) {
    const a = nodeAt(i, j), b = dir ? nodeAt(i, j + 1) : nodeAt(i + 1, j);
    if ((a.rim && b.rim) || ((a.rim || b.rim) && type !== HWY)) { edges.set(key, null); return null; } // RIM: nothing runs along / dead-ends on the ring but highways
    const dx = b.x - a.x, dz = b.z - a.z, L = Math.hypot(dx, dz), k = 1 + fl(hash(i, j, 23 + dir) * (type === HWY ? 2 : 3));
    const nearRim = rimOuter(a.x * 1.06, a.z * 1.06) || rimOuter(b.x * 1.06, b.z * 1.06); // edges close to the ring run straight (no meander into its shoulder)
    const amp = nearRim ? 0 : (hash(i, j, 25 + dir) - 0.5) * 2 * (type === HWY ? 0.18 : 0.26) * L / (Math.PI * k);
    e = { id: key, type, a, b, ax: a.x, az: a.z, L, dx: dx / L, dz: dz / L, nx: -dz / L, nz: dx / L, amp, k, hw: type === HWY ? ROAD_HW.hwy : ROAD_HW.trail, loop: false };
    e.len = L; // profile is built lazily on first height query (crossing pins need the other roads' profiles)
  }
  edges.set(key, e); return e;
}
// path point: t in [0,1]; fills PP {x,z,tx,tz,y,curv,bridge}
const PP = { x: 0, z: 0, tx: 0, tz: 0, y: 0, curv: 0, bridge: 0, tun: 0, bank: 0 }; // bank: cross slope (+ = left side up) // tun: metres inside a tunnel (0 = open road)
function pathPoint(e, t, wantY = true) {
  if (wantY && !e.pinned) buildProfile(e); // lazy build first: it reuses PP
  if (e.rim) {
    const th = rimTh(t), r = rimR(th), dr = (rimR(th + 1e-4) - rimR(th - 1e-4)) / 2e-4;
    PP.x = r * C(th); PP.z = r * S(th);
    const tx = dr * C(th) - r * S(th), tz = dr * S(th) + r * C(th), l = Math.hypot(tx, tz); PP.tx = tx / l; PP.tz = tz / l;
    if (e.bk) { const f = wrap1(t) * e.M, i = mn(e.M - 1, fl(f)), u = f - i; PP.bank = e.bk[i] + (e.bk[i + 1] - e.bk[i]) * u; PP.curv = e.kv[i] + (e.kv[i + 1] - e.kv[i]) * u; } else { PP.bank = 0; PP.curv = 0; }
  } else if (e.loop) {
    const th = t * 6.283185307, r = trackR(e.trk, th), dr = trackDR(e.trk, th);
    PP.x = e.trk.cx + r * C(th); PP.z = e.trk.cz + r * S(th);
    const tx = dr * C(th) - r * S(th), tz = dr * S(th) + r * C(th), l = Math.hypot(tx, tz); PP.tx = tx / l; PP.tz = tz / l; PP.curv = 0; PP.bank = 0;
  } else {
    const w = Math.PI * e.k, o = e.amp * S(w * t), o1 = e.amp * w * C(w * t) / e.L, o2 = -e.amp * w * w * S(w * t) / (e.L * e.L);
    PP.x = e.ax + e.dx * t * e.L + e.nx * o; PP.z = e.az + e.dz * t * e.L + e.nz * o;
    const l = Math.sqrt(1 + o1 * o1); PP.tx = (e.dx + e.nx * o1) / l; PP.tz = (e.dz + e.nz * o1) / l; PP.curv = o2 / (l * l * l); PP.bank = clamp(-PP.curv * 45, -0.07, 0.07);
  }
  if (wantY) { if (e.rim) t = wrap1(t); const f = clamp(t, 0, 1) * e.M, i = mn(e.M - 1, fl(f)), u = f - i; PP.y = e.prof[i] + (e.prof[i + 1] - e.prof[i]) * u; PP.bridge = e.br[u < 0.5 ? i : i + 1];
    if (e.pins) PP.y += pinAt(e, t); PP.tun = e.tn ? tunAt(e, clamp(t, 0, 1) * e.len) : 0; }
  return PP;
}
function profY(e, t) { if (e.rim) t = wrap1(t); const f = clamp(t, 0, 1) * e.M, i = mn(e.M - 1, fl(f)), u = f - i; return e.prof[i] + (e.prof[i + 1] - e.prof[i]) * u; }
function buildProfile(e) { baseProfile(e); if (!e.pinned) { e.pinned = true; e.pins = crossPins(e); } }
function baseProfile(e) {
  if (e.prof) return;
  const len = e.rim ? RIM_LEN : e.loop ? 6.283 * e.trk.R * 1.1 : e.L, M = e.M = mx(8, Math.ceil(len / 30)), ds = len / M;
  const p = new Float32Array(M + 1), wet = new Uint8Array(M + 1);
  for (let i = 0; i <= M; i++) { pathPoint(e, i / M, false); p[i] = natural(PP.x, PP.z); wet[i] = p[i] < WATER + 0.6 ? 1 : 0; }
  // narrow rivers fall between 30 m profile samples -> probe 4 sub-samples per segment so grade crossings get a bridge instead of a dam
  for (let i = 0; i < M; i++) for (let k = 1; k < 5; k++) { pathPoint(e, (i + k / 5) / M, false); if (natural(PP.x, PP.z) < WATER + 0.6) { wet[k < 3 ? i : i + 1] = 1; } }
  // wide roads: a river can run under one edge only -> also probe both road edges (+-hw) at every sub-sample
  for (let i = 0; i <= M; i++) for (let k = 0; k < 5 && i + k / 5 <= M; k++) { pathPoint(e, (i + k / 5) / M, false); const nx = -PP.tz * e.hw, nz = PP.tx * e.hw;
    if (natural(PP.x + nx, PP.z + nz) < WATER + 0.6 || natural(PP.x - nx, PP.z - nz) < WATER + 0.6) wet[k < 3 ? i : mn(M, i + 1)] = 1; }
  if (!e.loop) { p[0] = e.a.h; p[M] = e.b.h; }
  const q = new Float32Array(M + 1);
  for (let pass = 0; pass < 14; pass++) {
    for (let i = 0; i <= M; i++) {
      if (e.loop) { const a = p[(i + M - 1) % M], c = p[(i + 1) % M]; q[i] = 0.25 * a + 0.5 * p[i] + 0.25 * c; }
      else q[i] = i === 0 || i === M ? p[i] : 0.25 * p[i - 1] + 0.5 * p[i] + 0.25 * p[i + 1];
    }
    p.set(q); if (e.loop) p[M] = p[0];
  }
  for (let i = 0; i <= M; i++) p[i] = mx(p[i], WATER + 2.5);
  const g = (e.type === HWY ? 0.09 : 0.15) * ds;
  for (let i = 1; i <= M; i++) p[i] = clamp(p[i], p[i - 1] - g, p[i - 1] + g);
  for (let i = M - 1; i >= 0; i--) p[i] = clamp(p[i], p[i + 1] - g, p[i + 1] + g);
  // ROADS OVER TERRAIN (local): the grade clamp could drag an edge's ends off its junction nodes (up to ~70 m steps where a steep edge
  // could not reach the node within the grade limit) -> spread the residual linearly so every edge meets its nodes exactly
  if (e.loop) { const err = p[M] - p[0]; for (let i = 0; i <= M; i++) p[i] -= err * i / M; } // closed seam (the grade passes could leave a step at t=0/1)
  if (!e.loop) { const e0 = p[0] - e.a.h, e1 = p[M] - e.b.h; for (let i = 0; i <= M; i++) p[i] -= e0 * (1 - i / M) + e1 * (i / M); }
  if (!e.loop && (e.a.rim || e.b.rim)) rimLanding(e, p, M, ds);
  hills(e, p, wet, M, ds);
  // bridges over short wet runs (rivers); long wet runs become causeways
  const br = new Uint8Array(M + 1);
  if (!e.loop || e.rim) for (let i = 0; i <= M;) {
    if (!wet[i]) { i++; continue; } let j = i; while (j <= M && wet[j]) j++;
    if ((j - i) * ds < 340) { const s = mx(0, i - 1), t2 = mn(M, j); for (let k = s; k <= t2; k++) { br[k] = 1; p[k] = mx(p[k], WATER + 4.5); } }
    i = j;
  }
  if (e.rim) { // RIM: viaducts where the graded ring would float on a high embankment (dry gorges, over-the-top ramps)
    const nl = new Float32Array(M + 1); for (let i = 0; i <= M; i++) { pathPoint(e, i / M, false); nl[i] = mn(natural(PP.x, PP.z), natural(PP.x - PP.tz * e.hw, PP.z + PP.tx * e.hw), natural(PP.x + PP.tz * e.hw, PP.z - PP.tx * e.hw)); }
    const tunS = i => e.tn && e.tn.some(t => i * ds > t.s0 - 40 && i * ds < t.s1 + 40);
    const hi = i => p[i] - nl[i] > FILL_MAX + 4 && !tunS(i);
    for (let i = 0; i <= M; i++) if (hi(i)) for (let k = -1; k <= 1; k++) { const j = pmod(i + k, M); if (!tunS(j)) br[j] = 1; }
    br[M] = br[0];
  }
  e.prof = p; e.br = br; e.ds = ds; e.len = len;
  if (e.rim) { rimPlaceJunctions(e, M, ds); rimBank(e, M, ds); }
}
// RIM junctions: a highway arriving at the ring lands flat at the node height over the ring's width (+ a margin), then its profile
// continues compressed into the remaining length (smooth corner) -> no step where a graded highway overlaps the flat ring pavement
const RIM_LAND = RIM_HW + 26;
function rimLanding(e, p, M, ds) {
  const L = M * ds, sp = (v, k) => k * Math.log1p(Math.exp(v / k)); // softplus corner (~10 m)
  const land = (n, o) => { if (!n.rim) return 0; const dx = o.x - n.x, dz = o.z - n.z, l = Math.hypot(dx, dz); pathDist(RIM, n.x, n.z); pathPoint(RIM, PD.t, false);
    const sn = A(dx * PP.tz - dz * PP.tx) / l; return mn(0.4 * L, (RIM_HW + e.hw + 14) / mx(0.2, sn)); }; // grazing approach -> longer landing (whole overlap)
  const la = land(e.a, e.b), lb = land(e.b, e.a), src = Float32Array.from(p);
  for (let i = 0; i <= M; i++) { // station i reads the old profile at m(s): 0 over the landing at a / L over the landing at b, linear between
    const s = i * ds, a = la ? sp(s - la, 10) - sp(-la, 10) : s, b = lb ? sp(L - s - lb, 10) - sp(-lb, 10) : L - s;
    const m = clamp(a / mx(1e-6, a + b) * L, 0, L), f = m / ds, k = mn(M - 1, fl(f)); p[i] = src[k] + (src[k + 1] - src[k]) * (f - k); }
  // over the landing the highway follows the ring surface under it (the ring may climb along a grazing overlap), easing back over 90 m
  const rimY = (x, z) => { if (!pathDist(RIM, x, z)) return null; const s = PD.s; pathPoint(RIM, PD.t); return PP.y + clamp(s, -RIM_HW, RIM_HW) * PP.bank; };
  for (const [l, end] of [[la, 0], [lb, 1]]) { if (!l) continue; let off = 0;
    for (let i = 0; i <= M; i++) { const s = end ? L - i * ds : i * ds; if (s > l + 90) continue; pathPoint(e, i / M, false); const y = rimY(PP.x, PP.z);
      if (s <= l) { if (y != null) p[i] = y; } else { const sl = l; pathPoint(e, (end ? L - sl : sl) / L, false); const y0 = rimY(PP.x, PP.z); off = y0 == null ? 0 : y0 - (end ? e.b.h : e.a.h); p[i] += off * sst(l + 90, l, s); } } }
  p[0] = e.a.h; p[M] = e.b.h;
  e.land = [la ? Math.ceil(la / ds) : 0, lb ? Math.ceil(lb / ds) : 0];
}
// RIM banking: theta = atan(V^2 k / g) at the design speed, clamped to [MIN, MAX] deg, smoothed (spiral transitions), x fade
// (~0 within 150 m of a junction / on bridges / in tunnels, full again ~450 m away). Stored as slope tan(theta), sign = -sign(k) (outer edge up).
let RIM_BANK_SCALE = 1; export function setRimBankScale(k) { RIM_BANK_SCALE = k; if (RIM.bk) { RIM.prof = null; RIM.pinned = false; RIM.bk = null; baseProfile(RIM); } } // tests: 0 = flat ring
function rimBank(e, M, ds) {
  const kv = new Float32Array(M + 1), tb = new Float32Array(M + 1), q = new Float32Array(M + 1), fd = new Float32Array(M + 1), D = Math.PI / 180;
  for (let i = 0; i <= M; i++) kv[i] = rimK(rimTh(i / M));
  for (let i = 0; i <= M; i++) { const ang = clamp(Math.atan(RIM_V * RIM_V * A(kv[i]) / 9.81), RIM_BANK_MIN * D, RIM_BANK_MAX * D); tb[i] = -Math.sign(kv[i] || 1) * Math.tan(ang); }
  const W = 8, box = a => { for (let i = 0; i < M; i++) { let s = 0; for (let k = -W; k <= W; k++) s += a[pmod(i + k, M)]; q[i] = s / (2 * W + 1); } q[M] = q[0]; a.set(q); };
  box(tb); box(tb); box(tb);
  // distance (m) to the nearest flat-forced station (junction, bridge, tunnel), circular
  const flat = new Uint8Array(M); for (const j of e.jst || []) flat[pmod(j, M)] = 1;
  for (let i = 0; i < M; i++) if (e.br[i]) flat[i] = 1;
  if (e.tn) for (const t of e.tn) for (let j = Math.floor(t.s0 / ds); j <= Math.ceil(t.s1 / ds); j++) if (j >= 0 && j < M) flat[j] = 1;
  for (let i = 0; i < M; i++) fd[i] = flat[i] ? 0 : 1e9;
  for (let r = 0; r < 2; r++) { for (let k = 1; k < 2 * M; k++) { const i = k % M, j = (k - 1) % M; fd[i] = mn(fd[i], fd[j] + ds); } for (let k = 2 * M - 2; k >= 0; k--) { const i = k % M, j = (k + 1) % M; fd[i] = mn(fd[i], fd[j] + ds); } }
  for (let i = 0; i < M; i++) tb[i] *= RIM_BANK_SCALE * (fd[i] > 1e8 ? 1 : sst(150, 450, fd[i])); tb[M] = tb[0];
  const W2 = 2; for (let i = 0; i < M; i++) { let s = 0; for (let k = -W2; k <= W2; k++) s += tb[pmod(i + k, M)]; q[i] = s / (2 * W2 + 1); } q[M] = q[0];
  for (let i = 0; i <= M; i++) if (fd[i % M] < 1) q[i] = 0; // exactly flat on bridges / tunnel floors / junction nodes
  e.bk = Float32Array.from(q); e.kv = kv;
}
// ---------------- HILLS (local): no canyon cuts. The smoothed/grade-clamped profile used to slice up to ~40 m deep through ridges,
// so big hills read as walled roads. Cuts are capped at CUT_MAX and fills at FILL_MAX (vs. lightly smoothed natural ground);
// a deeper cut run is either re-graded OVER THE TOP (raise-only envelope, grade <= 12% hwy / 15% trail+loop) or, when it is long
// and deep (or going over would need a big fill), becomes a TUNNEL: the road keeps its level profile, the hill stays intact above it.
// Deterministic per seed (pure function of the edge). Tunnels: e.tn = [{s0, s1}] in metres along the edge (portal to portal).
export const CUT_MAX = 6.5, FILL_MAX = 12, OT_GRADE = { [HWY]: 0.12, [TRAIL]: 0.15, [LOOP]: 0.15 }, TUN_LEN = 60, TUN_CUT = 18, TUN_FILL = 10, TUN_END = 45, TUN_MIN = 50, TUN_GAP = 70, TUN_W = 2.6; // TUN_W: tube half width beyond the road edge (walls)
export const TUN_H = { [HWY]: 7.5, [TRAIL]: 6, [LOOP]: 7.5 }; // tunnel clear height above the road
function envelope(v, M, loop, g, up) { // v[i] = max_j(v[j] - g|i-j|) (up) / min_j(v[j] + g|i-j|) (down), circular on loops
  const n = loop ? M : M + 1, R = loop ? 2 : 1;
  for (let k = 1; k < n * R; k++) { const i = k % n, j = (k - 1) % n; v[i] = up ? mx(v[i], v[j] - g) : mn(v[i], v[j] + g); }
  for (let k = n * R - 2; k >= 0; k--) { const i = k % n, j = (k + 1) % n; v[i] = up ? mx(v[i], v[j] - g) : mn(v[i], v[j] + g); }
  if (loop) v[M] = v[0];
}
function hills(e, p, wet, M, ds) {
  const loop = !!e.loop, n = loop ? M : M + 1, at = i => loop ? pmod(i, M) : i;
  // natural ground per station: highest (cuts) / lowest (fills) of 7 samples across the station's 30 m slice -> narrow ridges between stations count
  const ns = new Float32Array(M + 1), nl = new Float32Array(M + 1), q = new Float32Array(M + 1);
  for (let i = 0; i <= M; i++) { let hi = -1e9, lo = 1e9; for (let k = -3; k <= 3; k++) { const t = (i + k / 7) / M; if (t < 0 || t > 1) continue; pathPoint(e, loop ? t - fl(t) : t, false); const h = natural(PP.x, PP.z); hi = mx(hi, h); lo = mn(lo, h); } ns[i] = hi; nl[i] = lo; }
  const wn = new Uint8Array(M + 1); for (let i = 0; i <= M; i++) if (wet[i]) for (let k = -2; k <= 2; k++) { const j = at(i + k); if (j >= 0 && j <= M) wn[j] = 1; }
  const G = OT_GRADE[e.type] * ds, pin = new Uint8Array(M + 1), cone = new Float32Array(M + 1);
  if (!loop) pin[0] = pin[M] = 1; // junction nodes keep their exact height
  if (e.land) { for (let i = 0; i <= e.land[0]; i++) pin[i] = 1; for (let i = 0; i <= e.land[1]; i++) pin[M - i] = 1; } // RIM landings stay flat
  const reach = (up) => { // cone of heights reachable from the pinned stations at grade G (up: lowest allowed top / down: highest allowed bottom)
    for (let i = 0; i <= M; i++) cone[i] = pin[i] ? p[i] : up ? 1e9 : -1e9; envelope(cone, M, loop, G, !up); return cone; };
  // 1. fill cap (embankments): lower-only envelope from natural + FILL_MAX; bridges / wet stations keep their height
  const ub = new Float32Array(M + 1); for (let i = 0; i <= M; i++) ub[i] = wn[i] ? 1e9 : nl[i] + FILL_MAX;
  envelope(ub, M, loop, G, false); reach(false); for (let i = 0; i <= M; i++) if (!pin[i]) p[i] = mn(p[i], mx(ub[i], cone[i]));
  // 2. cut runs deeper than CUT_MAX
  const cut = i => !wet[i] && ns[i] - p[i] > CUT_MAX; let k0 = 0;
  if (loop) { while (k0 < M && cut(k0)) k0++; if (k0 >= M) return; }
  const runs = []; let r = null;
  for (let k = 0; k <= n; k++) { const i = at(k0 + k); if (k < n && cut(i)) { if (!r) r = { a: k0 + k, b: k0 + k, mc: 0 }; r.b = k0 + k; r.mc = mx(r.mc, ns[i] - p[i]); } else if (r) { runs.push(r); r = null; } }
  const lb = new Float32Array(M + 1), tn = [];
  for (const r of runs) {
    // over-the-top candidate: how high would the re-graded road float over the ground around this run?
    lb.fill(-1e9); for (let k = r.a; k <= r.b; k++) lb[at(k)] = ns[at(k)] - CUT_MAX + 0.5; envelope(lb, M, loop, G, true);
    let fo = 0; for (let i = 0; i <= M; i++) if (lb[i] > p[i] && !wn[i]) fo = mx(fo, lb[i] - nl[i]);
    if (!loop) { const ke = Math.ceil(TUN_END / ds), kr = Math.ceil((TUN_END + RIM_HW + 75) / ds); r.ta = mx(r.a, e.a.rim ? kr : ke); r.tb = mn(r.b, M - (e.b.rim ? kr : ke)); } else { r.ta = r.a; r.tb = r.b; } // portals stay clear of junctions (RIM ends: wider, the hill kept over a bore must not bury the ring)
    const L = (r.tb - r.ta + 1) * ds;
    r.tun = r.tb >= r.ta && ((L >= TUN_LEN && r.mc > TUN_CUT) || fo > TUN_FILL);
    if (r.tun) { const ra = r.a, rb = r.b; r.a = r.ta; r.b = r.tb; // portals where the cut crosses CUT_MAX (interpolated between stations)
      const cA = ns[at(r.a - 1)] - p[at(r.a - 1)], cB = ns[at(r.a)] - p[at(r.a)], cC = ns[at(r.b)] - p[at(r.b)], cD = ns[at(r.b + 1)] - p[at(r.b + 1)];
      const s0 = (r.a - 1 + clamp((CUT_MAX - cA) / mx(1e-3, cB - cA), 0, 1)) * ds, s1 = (r.b + clamp((cC - CUT_MAX) / mx(1e-3, cC - cD), 0, 1)) * ds;
      const ex = mx(0, TUN_MIN - (s1 - s0)) / 2; tn.push({ s0: s0 - ex, s1: s1 + ex }); for (let k = r.a - 1 - Math.ceil(ex / ds); k <= r.b + 1 + Math.ceil(ex / ds); k++) pin[at(k)] = 1; // tunnel floor keeps its level profile
      r.a = ra; r.b = rb; r.tA = r.ta - 1 - Math.ceil(ex / ds); r.tB = r.tb + 1 + Math.ceil(ex / ds);
    }
  }
  const dry = (a, b) => { for (let j = fl(a / ds); j <= Math.ceil(b / ds); j++) if (wet[at(j)]) return false; return true; };
  for (let k = 1; k < tn.length; k++) if (tn[k].s0 - tn[k - 1].s1 < TUN_GAP && dry(tn[k - 1].s1, tn[k].s0)) { // short daylight gaps between bores -> one tunnel
    for (let j = fl(tn[k - 1].s1 / ds); j <= Math.ceil(tn[k].s0 / ds); j++) pin[at(j)] = 1; tn[k - 1].s1 = tn[k].s1; tn.splice(k--, 1); }
  for (let k = 0; k < tn.length; k++) { const t = tn[k], mid = (t.s0 + t.s1) / 2; // never overlap a bridge (wet station): bridges stay bridges
    for (let j = Math.ceil(t.s0 / ds) - 1; j <= fl(t.s1 / ds) + 1; j++) if (wet[at(j - 1)] || wet[at(j)] || wet[at(j + 1)]) { if (j * ds < mid) t.s0 = mx(t.s0, (j + 0.6) * ds); else t.s1 = mn(t.s1, (j - 0.6) * ds); }
    if (t.s1 - t.s0 < 20) tn.splice(k--, 1); }
  // 3. over the top: raise-only envelope from (natural - CUT_MAX) over the remaining cut stations, limited to what the pinned stations
  // (junction nodes, tunnel floors) can reach at the grade cap; crests rounded once, then a final exact pass
  const p0 = Float32Array.from(p);
  for (let pass = 0; pass < 2; pass++) {
    lb.fill(-1e9); let any = false; for (let i = 0; i <= M; i++) if (!pin[i] && !wet[i] && ns[i] - p[i] > CUT_MAX - 0.3) { lb[i] = ns[i] - CUT_MAX + (pass ? 0.1 : 0.8); any = true; }
    if (!any) break;
    envelope(lb, M, loop, G, true); reach(true); for (let i = 0; i <= M; i++) if (!pin[i]) p[i] = mx(p[i], mn(lb[i], cone[i]));
    if (!pass) for (let r = 0; r < 2; r++) { for (let i = 0; i <= M; i++) q[i] = pin[i] || (!loop && (i === 0 || i === M)) ? p[i] : 0.25 * p[at(i - 1)] + 0.5 * p[i] + 0.25 * p[at(i + 1)]; p.set(q); if (loop) p[M] = p[0]; }
  }
  e.otg = 0; for (let i = 0; i < M; i++) if (p[i] - p0[i] > 0.05 && p[i + 1] - p0[i + 1] > 0.05) e.otg = mx(e.otg, A(p[i + 1] - p[i]) / ds); // over-top grade (tests)
  if (tn.length) { const L = loop ? M * ds : 0; e.tn = loop ? tn.flatMap(t => [t, { s0: t.s0 - L, s1: t.s1 - L }, { s0: t.s0 + L, s1: t.s1 + L }]) : tn; }
}
// tunnel at arc length s: 0 = open road, else distance (m) inside from the nearest portal
function tunAt(e, s) { const T = e.tn; if (!T) return 0; for (const t of T) if (s > t.s0 && s < t.s1) return mn(s - t.s0, t.s1 - s); return 0; }
// ROADS OVER TERRAIN (local): level crossings. Where two roads overlap, the lower-priority one (trail < loop < highway, then id) gets a smooth
// additive bump (plateau over the overlap, ramps at <= ~7% extra grade) so its centre-line meets the other road's surface: no road is buried
// in the other's embankment or left floating over its cutting. Priority is a strict order, so lazy profile builds never recurse in a cycle.
const RANK = { [HWY]: 3, [LOOP]: 2, [TRAIL]: 1 };
const junc = (o, e) => !o.loop && !e.loop && (o.a === e.a || o.a === e.b || o.b === e.a || o.b === e.b); // junction neighbours already share the node height
const above = (o, e) => junc(o, e) ? false : RANK[o.type] !== RANK[e.type] ? RANK[o.type] > RANK[e.type] : String(o.id) > String(e.id);
function pinAt(e, t) { // piecewise: plateau at each crossing, smooth blend between neighbouring crossings, smooth decay elsewhere
  const P = e.pins, s = t * e.len; let L = null, R = null;
  for (const q of P) { if (q.s <= s) L = q; else { R = q; break; } }
  let v;
  if (L && s - L.s <= L.P) v = L.d; else if (R && R.s - s <= R.P) v = R.d;
  else { const a = L ? L.s + L.P : 0, b = R ? R.s - R.P : 0;
    if (L && R && b - a < L.R + R.R) v = L.d + (R.d - L.d) * sst(a, b, s);
    else v = (L ? L.d * sst(a + L.R, a, s) : 0) + (R ? R.d * sst(b - R.R, b, s) : 0); }
  if (!e.loop) v *= sst(0, 15, mn(t, 1 - t) * e.len); // junction nodes keep their shared height (nodes near a loop already snap to it)
  return v;
}
function crossPins(e) {
  if (e.rim) return null; // top priority: every other road meets the ring
  const len = e.len, n = Math.ceil(len / 5), pins = [];
  pathPoint(e, 0.5, false); const cx = PP.x, cz = PP.z;
  const rad = e.loop ? e.trk.R * 1.4 + 60 : len / 2 + A(e.amp) + 60;
  for (const o of pathsNear(cx, cz, rad)) {
    if (o === e || !above(o, e)) continue;
    const lim = o.hw + e.hw + 2; let best = null;
    const flush = () => { if (best) { pins.push(best); best = null; } };
    for (let i = 0; i <= n; i++) {
      const t = i / n; pathPoint(e, t, false); const x = PP.x, z = PP.z, tx = PP.tx, tz = PP.tz;
      if (!pathDist(o, x, z) || PD.d > lim) { flush(); continue; }
      if (!best || PD.d < best.dd) best = { t, dd: PD.d, ot: PD.t, os: PD.s, x, z, tx, tz };
    }
    flush();
  }
  const out = [];
  for (const b of pins) {
    // re-find the road this pin belongs to (closest above-priority road at the point)
    let tgt = null, bd = 1e9;
    for (const r of pathsNear(b.x, b.z, 60)) { if (r === e || !above(r, e) || !pathDist(r, b.x, b.z)) continue; if (PD.d < bd) { bd = PD.d; tgt = { r, t: PD.t, s: PD.s }; } }
    if (!tgt) continue;
    pathPoint(tgt.r, tgt.t); if (PP.bridge || PP.tun) continue; // HILLS: no level crossing with a road inside its tunnel (it passes under)
    const bank = PP.bank, ho = PP.y + clamp(tgt.s, -tgt.r.hw, tgt.r.hw) * bank;
    const sn = A(b.tx * PP.tz - b.tz * PP.tx), cs = A(b.tx * PP.tx + b.tz * PP.tz);
    const f = b.t * e.M, i = mn(e.M - 1, fl(f)), u = f - i, he = e.prof[i] + (e.prof[i + 1] - e.prof[i]) * u;
    if (e.br[u < 0.5 ? i : i + 1] || (e.tn && tunAt(e, b.t * len))) continue;
    const d = ho - he; if (A(d) < 0.03) continue;
    out.push({ t: b.t, d, P: mn(45, (tgt.r.hw + e.hw * cs + 2) / mx(0.3, sn)), R: mx(30, 1.5 * A(d) / 0.08) });
  }
  if (!out.length) return null;
  for (const q of out) q.s = q.t * len;
  if (e.loop) for (const q of out.slice()) out.push({ ...q, s: q.s - len }, { ...q, s: q.s + len }); // circular neighbours
  out.sort((p, q) => p.s - q.s); return out;
}
// ---------------- race loops: one closed polar sine curve per 3 km lattice cell (kept from v1) ----------------
const CELL = 3000;
export function trackOf(ci, cj) {
  let cx = (ci + 0.5) * CELL + (hash(ci, cj, 1) - 0.5) * 900, cz = (cj + 0.5) * CELL + (hash(ci, cj, 2) - 0.5) * 900;
  if (A(cx) > 9000) cx = Math.sign(cx) * 14000; if (A(cz) > 9000) cz = Math.sign(cz) * 14000; // RIM: race loops of the edge cells would cut the ring -> out in the wall (never reached)
  return { id: ci + ',' + cj, cx, cz, R: 280 + hash(ci, cj, 3) * 300, p1: hash(ci, cj, 4) * 6.28, p2: hash(ci, cj, 5) * 6.28, k: 2 + fl(hash(ci, cj, 6) * 3) };
}
export function trackR(t, th) { return t.R * (1 + 0.22 * S(t.k * th + t.p1) + 0.12 * S((t.k + 1) * th + t.p2)); }
function trackDR(t, th) { return t.R * (0.22 * t.k * C(t.k * th + t.p1) + 0.12 * (t.k + 1) * C((t.k + 1) * th + t.p2)); }
export function trackPoint(t, th) { const r = trackR(t, th); return [t.cx + r * C(th), t.cz + r * S(th)]; }
const tcache = new Map();
export function nearTrack(x, z) {
  const ci = fl(x / CELL), cj = fl(z / CELL), key = ci * 100000 + cj;
  let t = tcache.get(key);
  if (!t) { t = trackOf(ci, cj); t.path = { id: 'L' + t.id, loop: true, trk: t, type: LOOP, hw: ROAD_HW.loop, k: 0, amp: 0, len: 6.283 * t.R * 1.1 }; tcache.set(key, t); }
  return t;
}
// candidate edges per road cell (cached)
const cellCache = new Map(), REACH = 90;
function cellEdges(ci, cj) {
  const key = (ci + 5000) * 10000 + (cj + 5000); let l = cellCache.get(key); if (l) return l;
  l = []; const x0 = ci * RG - REACH, x1 = (ci + 1) * RG + REACH, z0 = cj * RG - REACH, z1 = (cj + 1) * RG + REACH;
  for (let i = ci - 2; i <= ci + 1; i++) for (let j = cj - 2; j <= cj + 1; j++) for (let d = 0; d < 2; d++) {
    const e = edgeAt(i, j, d); if (!e) continue;
    const pad = A(e.amp) + 10;
    if (mx(e.a.x, e.b.x) + pad < x0 || mn(e.a.x, e.b.x) - pad > x1 || mx(e.a.z, e.b.z) + pad < z0 || mn(e.a.z, e.b.z) - pad > z1) continue;
    l.push(e);
  }
  cellCache.set(key, l); return l;
}
// distance from (x,z) to path e -> fills PD {d (unsigned), s (signed lateral, + = normal side), t}
const PD = { d: 1e9, s: 0, t: 0 };
function pathDist(e, x, z) { // loops: radial offset scaled to the perpendicular distance, so the drivable width matches the mesh ribbon
  if (e.rim) {
    if (mx(A(x), A(z)) < RIM_IN - 150) return false;
    const th = Math.atan2(z, x), r = rimR(th), rr = Math.hypot(x, z); if (A(rr - r) > 260) return false;
    PD.s = r - rr; PD.d = A(PD.s); PD.t = rimT(th < 0 ? th + 6.283185307179586 : th);
    if (PD.d < e.hw + CORE + 62) footRefine(e, x, z); return true;
  }
  if (e.loop) {
    const T = e.trk, dx = x - T.cx, dz = z - T.cz, th = Math.atan2(dz, dx), r = trackR(T, th), rr = Math.hypot(dx, dz);
    PD.s = (rr - r) * r / Math.hypot(r, trackDR(T, th)); PD.d = A(PD.s); PD.t = (th < 0 ? th + 6.283185307 : th) / 6.283185307;
    if (PD.d < e.hw + CORE + 62) footRefine(e, x, z); return true;
  }
  const rx = x - e.ax, rz = z - e.az, proj = rx * e.dx + rz * e.dz, perp = rx * e.nx + rz * e.nz;
  if (proj < -REACH || proj > e.L + REACH || A(perp) > A(e.amp) + REACH) return false;
  const w = Math.PI * e.k; let t = clamp(proj / e.L, 0, 1);
  let o = e.amp * S(w * t); const o1 = e.amp * w * C(w * t) / e.L;
  t = clamp(t + (perp - o) * o1 / (1 + o1 * o1) / e.L, 0, 1); // one Newton step along the tangent
  o = e.amp * S(w * t); const ax = proj - t * e.L, ap = perp - o;
  PD.d = Math.hypot(ax, ap); PD.s = ap; PD.t = t;
  if (PD.d < e.hw + CORE + 62) footRefine(e, x, z); return true;
}
// ROADS OVER TERRAIN (local): exact foot of the perpendicular onto the centre-line, so the terrain bed under every point of the road ribbon
// uses the same profile station + lateral offset the ribbon (roads.js) uses -> the ground can neither poke through nor drop under the road edges.
// (polar angle on loops / one Newton step on sine edges left the bed up to ~1 m off the ribbon on graded curves)
function footRefine(e, x, z) {
  let t = PD.t;
  for (let k = 0; k < 4; k++) {
    pathPoint(e, t, false); const px = PP.x, pz = PP.z, tx = PP.tx, tz = PP.tz;
    pathPoint(e, t + 1e-5, false); const sp = Math.hypot(PP.x - px, PP.z - pz) / 1e-5;
    const dt = ((x - px) * tx + (z - pz) * tz) / sp;
    t += dt; if (e.loop) t -= Math.floor(t); else t = clamp(t, 0, 1);
    if (A(dt * sp) < 0.005) break;
  }
  pathPoint(e, t, false);
  const rx = x - PP.x, rz = z - PP.z; PD.t = t; PD.s = -rx * PP.tz + rz * PP.tx; PD.d = Math.hypot(rx, rz);
}
// ---------------- full sample: natural terrain + road beds/banking + bridge decks ----------------
export const OUT = { h: 0, hn: 0, deck: -1e9, road: 0, rtype: 0, dom: 0, riv: 1e9, rd: 1e9, bg: 0, bs: 0, bf: 0, rb: 0, rdd: 1e9, tun: -1e9, ttype: 0, ts: 0, thw: 0, tdep: 0, tnx: 0, tnz: 0, tH: 0 };
// ---- biome layer (terrain module): pure sine fields over the region selector -> dry grassland / savanna / forest weights ----
export const BIOME = { GRASSLAND: 0, SAVANNA: 1, FOREST: 2, DESERT: 3, CANYON: 4, ALPINE: 5 };
export const BIOME_NAMES = ['grassland', 'savanna', 'forest', 'desert', 'canyon', 'alpine'];
export function moisture(x, z) { return 0.5 + 0.5 * (0.62 * S(x * 0.0013 + 1.1 * S(z * 0.0009 + 0.4)) * C(z * 0.0012 - 0.9 * S(x * 0.0007)) + 0.38 * S((x + z) * 0.00085 + 2.3)); }
export function heat(x, z) { return 0.5 + 0.5 * (0.7 * S(x * 0.0009 - 0.7 + C(z * 0.0011)) * C(z * 0.0008 + 1.9) + 0.3 * S((x - z) * 0.0013)); }
export function clump(x, z) { return 0.5 + 0.5 * S(x * 0.0071 + C(z * 0.0053) * 2) * C(z * 0.0083 + S(x * 0.0047)); } // forest clearings
const BW = new Float32Array(6);
function biomeFromRW(x, z) { // RW must hold selector(x,z)
  const m = moisture(x, z), fM = sst(0.52, 0.58, m), temp = RW[0] + RW[1];
  const f = (temp + RW[4]) * fM, dry = temp * (1 - fM), sv = dry * sst(0.42, 0.58, heat(x, z));
  BW[0] = dry - sv; BW[1] = sv; BW[2] = f; BW[3] = RW[2]; BW[4] = RW[3]; BW[5] = RW[4] * (1 - fM);
  return BW;
}
export function biomeWeights(x, z, out = BW) { selector(x, z); biomeFromRW(x, z); if (out !== BW) for (let i = 0; i < 6; i++) out[i] = BW[i]; return out; }
export function biomeOf(o) { // dominant biome of a sample
  const d = o.dom, w = [o.bg, o.bs, o.bf]; let b = w[0] >= w[1] && w[0] >= w[2] ? 0 : w[1] >= w[2] ? 1 : 2;
  const t = o.bg + o.bs + o.bf; if (t < 0.5) b = d === REG.DUNES ? 3 : d === REG.CANYON ? 4 : d === REG.ALPINE ? 5 : b;
  return b;
}
const CORE = 1.5;
export function sample(x, z, o = OUT) {
  const hn = natural(x, z); biomeFromRW(x, z); o.bg = BW[0]; o.bs = BW[1]; o.bf = BW[2]; let h = hn, deck = -1e9, rw = 0, rtype = 0, rdmin = 1e9, bestW = 0, bestH = hn, rdd = 1e9, rb = 0, tun = -1e9, tsd = 1e9, cover = -1e9;
  const list = cellEdges(fl(x / RG), fl(z / RG));
  const tk = nearTrack(x, z);
  const rimOn = mx(A(x), A(z)) > RIM_IN - 150;
  for (let n = rimOn ? -2 : -1; n < list.length; n++) {
    const e = n === -2 ? RIM : n < 0 ? tk.path : list[n];
    if (!pathDist(e, x, z)) continue;
    const d = PD.d; if (d > e.hw + CORE + 62) continue;
    pathPoint(e, PD.t);
    const bank = PP.bank;
    const hb = PP.y + clamp(PD.s, -e.hw, e.hw) * bank;
    if (PP.tun > 0) { // HILLS: tunnel bore -> no bed carve / road flag; the hill is kept (and topped up) over the tube
      const F = e.hw + TUN_W, cov = PP.y + TUN_H[e.type] + 1.8;
      if (d < F && (tun < -1e8 || d < tsd)) { tun = hb; tsd = d; o.ttype = e.type; o.ts = PD.s; o.thw = e.hw; o.tdep = PP.tun; o.tnx = -PP.tz; o.tnz = PP.tx; o.tH = TUN_H[e.type]; }
      if (cov > hn && d < F + 12) cover = mx(cover, d < F + 1.5 ? cov : hn + (cov - hn) * sst(F + 12, F + 1.5, d));
      continue;
    }
    const span = PP.bridge && hn < hb; // ROADS OVER TERRAIN (local): a bridge station only floats over ground that is lower than its deck; at abutments/banks the bed is carved like any road
    if (!span && d - e.hw < rdd) { rdd = d - e.hw; rb = e.rim ? hb : PP.y - A(e.hw * bank); } // lowest edge of the nearest bed (render grids keep under it)
    const core = e.hw + CORE, blend = mn(60, 8 + 1.3 * A(hn - hb));
    if (d > core + blend) continue;
    let w = d < core ? 1 : sst(core + blend, core, d);
    if (d < e.hw + 0.8 && d - e.hw < rdmin) { rdmin = d - e.hw; rtype = e.type; }
    if (d < e.hw + 0.5) rw = 1; else rw = mx(rw, sst(e.hw + 2.5, e.hw + 0.5, d));
    if (PP.bridge) { if (d < e.hw + 1.2) deck = mx(deck, hb); if (span) w = 0; }
    if (w > bestW || (w === 1 && bestW === 1 && d < e.hw + 0.5 && hb > bestH)) { bestW = w; bestH = hb; }
  }
  if (bestW > 0) h = hn + (bestH - hn) * bestW;
  if (cover > h) h = cover;
  if (AF.length) { AO.h = h; AO.road = rw; AO.rtype = rtype; AO.rd = rdmin; if (airMod(x, z, hn)) { h = AO.h; rw = AO.road; rtype = AO.rtype; rdmin = AO.rd; } }
  const edge = mx(A(x), A(z)) - WORLD; if (edge > 0) h += edge * 0.6; // world rim
  o.h = h; o.hn = hn; o.deck = deck; o.road = rw; o.rtype = rtype; o.dom = NAT.dom; o.riv = NAT.riv; o.rd = rdmin; o.rb = rb; o.rdd = rdd; o.tun = tun;
  return o;
}
export function height(x, z) { return sample(x, z).h; }
export function ground(x, z) { sample(x, z); return OUT.deck > OUT.h ? OUT.deck : OUT.h; } // includes bridge decks (scenery: the hill top over tunnels)
// HILLS: tunnels make the ground two-layered. The game sets the reference height (vehicle / camera y) once per frame; a query inside a
// tunnel footprint below the tube roof gets the tunnel floor, anything else the terrain (= ground()).
let REFY = 1e9; export function setRef(y) { REFY = y; }
export const inTunnel = o => o.tun > -1e8 && REFY < o.tun + o.tH + 1.5;
export function groundRef(x, z) { sample(x, z); return inTunnel(OUT) ? OUT.tun : OUT.deck > OUT.h ? OUT.deck : OUT.h; }
export function heightRef(x, z) { sample(x, z); return inTunnel(OUT) ? OUT.tun : OUT.h; }
export function roadGround(x, z) { sample(x, z); return OUT.tun > -1e8 ? OUT.tun : OUT.deck > OUT.h ? OUT.deck : OUT.h; } // race props / pickups: on the road, in tunnels too
export function tunnelsOf(e) { if (!e.prof) buildProfile(e); return e.tn ? e.tn.filter(t => t.s1 > 0 && t.s0 < e.len) : null; }
export function trackW(x, z) { // 1 on race loop, smooth falloff (kept for scenery/compat)
  const t = nearTrack(x, z), hw = t.path.hw; pathDist(t.path, x, z); return PD.d < hw + 1 ? 1 : PD.d > hw + 14 ? 0 : sst(hw + 14, hw + 1, PD.d);
}
export function normal(x, z, out, fn = height) {
  const e = 1.0, hx = fn(x + e, z) - fn(x - e, z), hz = fn(x, z + e) - fn(x, z - e);
  const l = Math.hypot(hx, 2 * e, hz); out[0] = -hx / l; out[1] = 2 * e / l; out[2] = -hz / l; return out;
}
// surface type from a sample (+ slope)
export function snowLine(x, z) { return 135 + 25 * S(x * 0.002) * C(z * 0.0023); }
export function patch(x, z) { return 0.5 + 0.5 * S(x * 0.013 + 1.7 * C(z * 0.011)) * C(z * 0.017 + 0.8 * S(x * 0.007)); }
export function surfaceOf(x, z, o, ny) {
  if (o.road > 0.5) return o.rtype === HWY ? SURF.ASPHALT : SURF.DIRT;
  const h = o.h;
  if (o.riv < 7 && h < 2.5) return SURF.MUD;
  if (h < WATER + 0.3) return SURF.MUD;
  switch (o.dom) {
    case REG.DUNES: return ny < 0.55 ? SURF.ROCK : SURF.SAND;
    case REG.CANYON: return ny > 0.9 ? SURF.DIRT : SURF.ROCK;
    case REG.ALPINE: return h > snowLine(x, z) && ny > 0.55 ? SURF.SNOW : ny < 0.78 ? SURF.ROCK : SURF.GRASS;
    default:
      if (h < 1.6) return SURF.SAND;
      if (ny < 0.72) return SURF.ROCK;
      return patch(x, z) > 0.82 ? SURF.DIRT : SURF.GRASS;
  }
}
export function surfaceAt(x, z, ny) { sample(x, z); return surfaceOf(x, z, OUT, ny); }
// grass density 0..1 (drives instanced grass)
export function grassDensity(x, z, o, ny, surf) {
  if (surf !== SURF.GRASS) return surf === SURF.DIRT && o.road < 0.5 ? 0.25 : 0;
  return (0.35 + 0.65 * sst(0.25, 0.7, patch(x * 1.7 + 300, z * 1.7))) * sst(0.74, 0.86, ny) * (1 - o.road) * (o.dom === REG.ALPINE ? 0.7 : 1) * (1 - 0.55 * o.bf) * (1 + 0.25 * o.bg);
}
// biome colour
export function colourOf(x, z, o, ny, surf, out) {
  const v = 0.5 + 0.5 * S(x * 0.004 + C(z * 0.003) * 2) * C(z * 0.0045), p = patch(x, z);
  let r, g, b;
  switch (surf) {
    case SURF.ASPHALT: r = .28; g = .28; b = .3; break;
    case SURF.DIRT: if (o.dom === REG.CANYON) { r = .78; g = .5; b = .33; } else { r = .66 + .1 * o.bs; g = .5 - .06 * o.bs; b = .34 - .06 * o.bs; } break;
    case SURF.GRASS: {
      if (o.dom === REG.ALPINE) { r = .3 + .1 * v; g = .58 + .08 * v; b = .3; }
      else { r = .33 + .22 * v; g = .66 + .1 * v; b = .22 + .05 * p; }
      const t = o.bg + o.bs + o.bf + 1e-6, fg = o.bg / t, fs = o.bs / t, ff = o.bf / t, wn = 1 - sst(4, 40, o.riv) * 0.7; // greener near rivers
      const gr = .74 + .1 * v, gg = .7 + .05 * v, gb = .36, sr = .86 + .05 * p, sg = .66 + .06 * v, sb = .3, fr = .2 + .08 * v, fgc = .44 + .08 * v, fb = .18;
      const k = mn(1, t) * (1 - wn * 0.0);
      const rr = gr * fg + sr * fs + fr * ff, gg2 = gg * fg + sg * fs + fgc * ff, bb = gb * fg + sb * fs + fb * ff;
      const wet = sst(40, 5, o.riv) * 0.6;
      r = r + (rr - r) * k; g = g + (gg2 - g) * k; b = b + (bb - b) * k;
      r += (.3 - r) * wet; g += (.62 - g) * wet; b += (.24 - b) * wet; break; }
    case SURF.SAND: if (o.dom === REG.DUNES) { r = .95; g = .78 + .05 * v; b = .5; } else { r = .93; g = .85; b = .6; } break;
    case SURF.ROCK:
      if (o.dom === REG.CANYON || o.dom === REG.DUNES) { const s = 0.5 + 0.5 * S(o.h * 0.9 + S(x * 0.01) * 1.5); r = .7 + .15 * s; g = .38 + .1 * s; b = .26 + .05 * s; }
      else { r = .55 + .06 * v; g = .53 + .05 * v; b = .58; } break;
    case SURF.SNOW: r = .95; g = .97; b = 1; break;
    default: r = .42; g = .33; b = .24; // mud
  }
  out[0] = r; out[1] = g; out[2] = b; return out;
}
export function colour(x, z, y, ny, out) { sample(x, z); return colourOf(x, z, OUT, ny, surfaceOf(x, z, OUT, ny), out); }
// paths (road edges + race loops) within radius r of (x,z) — used by road meshes / minimap
export function pathsNear(x, z, r) {
  const res = new Set(), c0 = fl((x - r) / RG), c1 = fl((x + r) / RG), d0 = fl((z - r) / RG), d1 = fl((z + r) / RG);
  for (let i = c0; i <= c1; i++) for (let j = d0; j <= d1; j++) for (const e of cellEdges(i, j)) res.add(e);
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) res.add(nearTrack(x + i * CELL, z + j * CELL).path);
  if (mx(A(x), A(z)) + r > RIM_IN - 150) res.add(RIM);
  return [...res];
}
export { pathPoint, PP, HWY, TRAIL, LOOP, RIM, rimR };
export function trackSD(x, z) { // signed radial distance to nearest race-loop centre-line (graphics-branch compat)
  const t = nearTrack(x, z), dx = x - t.cx, dz = z - t.cz;
  return Math.hypot(dx, dz) - trackR(t, Math.atan2(dz, dx));
}

// ---------------- airfields: deterministic flat sites near the spawn loop (planes) ----------------
// Each airfield flattens the terrain to its runway elevation (cut/fill blend like road beds), marks the runway as
// road (paved -> asphalt surface, strip -> dirt) and keeps a clear zone (no trees / rocks) around runway + approaches.
export const AF = [];
const AO = { h: 0, road: 0, rtype: 0, rd: 1e9 };
function airMod(x, z, hn) {
  let hit = false;
  for (let i = 0; i < AF.length; i++) {
    const a = AF[i], rx = x - a.x, rz = z - a.z; if (A(rx) > a.R || A(rz) > a.R) continue;
    const s = rx * a.dx + rz * a.dz, t = rx * a.dz - rz * a.dx, as = A(s), at = A(t);
    const dd = Math.hypot(mx(0, as - a.L - 30), mx(0, at - a.W - 16)), blend = mn(90, 14 + 1.4 * A(hn - a.h));
    if (dd < blend) { const w = dd <= 0 ? 1 : sst(blend, 0, dd); AO.h += (a.h - AO.h) * w; hit = true; }
    if (as < a.L && at < a.W) { AO.road = 1; AO.rtype = a.paved ? HWY : TRAIL; AO.rd = -mn(a.W - at, a.L - as); hit = true; }
    else if (as < a.L + 170 && at < a.W + 55) { AO.road = mx(AO.road, 0.06); hit = true; }
  }
  return hit;
}
function afCost(cx, cz, a, L, W, full) {
  const dx = S(a), dz = C(a); let lo = 1e9, hi = -1e9, sum = 0, n = 0;
  const nj = full ? 1 : 0;
  for (let i = -4; i <= 4; i++) for (let j = -nj; j <= nj; j++) {
    const s = i / 4 * L, t = j * (W + 10), h = natural(cx + dx * s + dz * t, cz + dz * s - dx * t);
    if (NAT.riv < W + 30) return 1e9; lo = mn(lo, h); hi = mx(hi, h); sum += h; n++;
  }
  const h0 = sum / n; if (lo < WATER + 4) return 1e9;
  let obs = 0;
  if (full) for (const sg of [-1, 1]) for (let k = 1; k <= 3; k++) { const s = sg * (L + k * 140); obs += mx(0, natural(cx + dx * s, cz + dz * s) - h0 - 6 - k * 12); }
  return (hi - lo) + obs * 0.6;
}
function afRoadClear(cx, cz, a, L, W) {
  const dx = S(a), dz = C(a), paths = pathsNear(cx, cz, L + 400);
  for (const e of paths) for (let s = -L - 120; s <= L + 120; s += 20) {
    const x = cx + dx * s, z = cz + dz * s; if (!pathDist(e, x, z)) continue;
    if (PD.d < e.hw + W + 110) return false;
  }
  return true;
}
function siteAirfields() {
  const t0 = nearTrack(0, 0), [sx, sz] = trackPoint(t0, 0);
  const KIND = [
    { id: 'main', name: 'SINE FIELD', L: 500, W: 20, paved: true },
    { id: 'bush', name: 'BUSH STRIP', L: 230, W: 12, paved: false },
    { id: 'ridge', name: 'RIDGE STRIP', L: 330, W: 15, paved: false }];
  const H = 8, STEP = 230, N = 16;
  for (const k of KIND) {
    const cand = [];
    for (let i = -N; i <= N; i++) for (let j = -N; j <= N; j++) {
      const cx = sx + i * STEP + 37, cz = sz + j * STEP - 53, r = Math.hypot(cx - sx, cz - sz);
      if (r < 380 || r > 3700) continue;
      if (AF.some(o => Math.hypot(o.x - cx, o.z - cz) < o.L + k.L + 600)) continue;
      const hc = natural(cx, cz); if (hc < WATER + 5 || NAT.riv < 60) continue;
      for (let q = 0; q < H; q++) { const a = q * Math.PI / H, c = afCost(cx, cz, a, k.L, k.W, false); if (c < 40) cand.push([c + r * 0.0015, cx, cz, a]); }
    }
    cand.sort((p, q) => p[0] - q[0]);
    let best = null;
    for (const [, cx, cz, a] of cand.slice(0, 40)) {
      const c = afCost(cx, cz, a, k.L, k.W, true) + Math.hypot(cx - sx, cz - sz) * 0.0015;
      if (best && c >= best[0]) continue;
      if (!afRoadClear(cx, cz, a, k.L, k.W)) continue;
      best = [c, cx, cz, a];
    }
    if (!best) continue;
    const [, cx, cz, a] = best, dx = S(a), dz = C(a); let sum = 0, n = 0;
    for (let i = -6; i <= 6; i++) for (let j = -1; j <= 1; j++) { const s = i / 6 * k.L, t = j * k.W; sum += natural(cx + dx * s + dz * t, cz + dz * s - dx * t); n++; }
    AF.push({ ...k, x: cx, z: cz, a, dx, dz, h: sum / n + 0.4, R: k.L + 320 });
  }
}
siteAirfields();
export function nearestAirfield(x, z) { let b = null, bd = 1e18; for (const a of AF) { const d = (a.x - x) ** 2 + (a.z - z) ** 2; if (d < bd) { bd = d; b = a; } } return b; }
