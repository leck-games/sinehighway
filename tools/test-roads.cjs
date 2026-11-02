// ROADS OVER TERRAIN: every visible point of every road ribbon (as roads.js builds it) must sit on the terrain bed:
// terrain never above the top-most road surface (poke-through), and the top road never floating over the terrain.
// Also checks junction ends meet their nodes and loops close without a seam step.  usage: node tools/test-roads.cjs [radius_m]
const path = require('path');
(async () => {
  const W = await import(path.join(__dirname, '../js/terrain/world.js'));
  const { pathsNear, pathPoint, PP, HWY, sample } = W;
  const R = +(process.argv[2] || 4200), lift = e => e.type === HWY ? 0.16 : 0.08;
  const surf = (e, x, z) => { // road surface at (x,z) if inside e's ribbon (foot of perpendicular, like the ribbon)
    let best = null, bd = 1e9; const n = Math.ceil(e.len / 10);
    for (let i = 0; i <= n; i++) { pathPoint(e, i / n, false); const d = Math.hypot(PP.x - x, PP.z - z); if (d < bd) { bd = d; best = i / n; } }
    if (bd > e.hw + 12) return null;
    let t = best; for (let k = 0; k < 6; k++) { pathPoint(e, t, false); const px = PP.x, pz = PP.z, tx = PP.tx, tz = PP.tz; pathPoint(e, t + 1e-5, false); const sp = Math.hypot(PP.x - px, PP.z - pz) / 1e-5; t += ((x - px) * tx + (z - pz) * tz) / sp; t = e.loop ? t - Math.floor(t) : Math.max(0, Math.min(1, t)); }
    pathPoint(e, t); const s = -(x - PP.x) * PP.tz + (z - PP.z) * PP.tx, d = Math.hypot(x - PP.x, z - PP.z); if (d > e.hw - 0.05 || PP.bridge) return null;
    return PP.y + s * PP.bank; // cross slope (edges: gentle crown, loops flat, RIM: NASCAR banking)
  };
  // render grids (ground.js): vertex height rule + the two triangles per quad
  const vH = (x, z, st) => { const o = sample(x, z); return o.rdd < st * 1.5 && o.rb > 0.6 ? Math.min(o.h, o.rb - (st > 8 ? 0.9 : 0.06)) : o.h; };
  const vT = (x, z) => { const o = sample(x, z); return o.tun > -1e8 ? [1, o.tun, o.tH] : [0, 0, 0]; }; // tunnel attribute (portal hole: comic.js discards)
  const gridH = (x, z, st) => { const i = Math.floor(x / st), j = Math.floor(z / st), u = x / st - i, v = z / st - j;
    const a = vH(i * st, j * st, st), b = vH(i * st, (j + 1) * st, st), c = vH((i + 1) * st, (j + 1) * st, st), d = vH((i + 1) * st, j * st, st);
    const h = u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v);
    const A = vT(i * st, j * st), B = vT(i * st, (j + 1) * st), Cc = vT((i + 1) * st, (j + 1) * st), D = vT((i + 1) * st, j * st);
    const T = [0, 1, 2].map(k => u + v <= 1 ? A[k] + (D[k] - A[k]) * u + (B[k] - A[k]) * v : Cc[k] + (B[k] - Cc[k]) * (1 - u) + (D[k] - Cc[k]) * (1 - v));
    if (T[0] > 0.02 && h > T[1] / T[0] - 0.4 && h < T[1] / T[0] + T[2] / T[0]) return -1e9; // discarded fragment
    return h; };
  const nearPortal = (e, s, r) => e.tn && e.tn.some(t => Math.abs(s - t.s0) < r || Math.abs(s - t.s1) < r);
  const G = { 4: 0, 16: 0 }, GW = { 4: 0, 16: 0 }, GA = {}; let gn = 0;
  const seen = new Set(); let n = 0, poke = 0, float = 0, worst = 0, at = null, ends = 0, seams = 0;
  for (let cx = -R; cx <= R; cx += 1200) for (let cz = -R; cz <= R; cz += 1200) for (const e of pathsNear(cx, cz, 700)) {
    if (seen.has(e)) continue; seen.add(e);
    if (e.loop) { pathPoint(e, 0); const a = PP.y; pathPoint(e, 1); if (Math.abs(a - PP.y) > 0.05) seams++; }
    else { pathPoint(e, 0); const a = Math.abs(PP.y - e.a.h); pathPoint(e, 1); const b = Math.abs(PP.y - e.b.h); if (!PP.bridge && Math.max(a, b) > 0.05 && Math.min(e.a.h, e.b.h) > W.WATER + 4.6) ends++; }
    const m = Math.ceil(e.len / 6);
    for (let i = 0; i <= m; i++) { pathPoint(e, i / m); if (PP.bridge || PP.tun > 0 || nearPortal(e, i / m * e.len, e.hw)) continue; /* tunnels run under the (kept) hill; the mouth is hidden by the headwall */ const x0 = PP.x, z0 = PP.z, nx = -PP.tz, nz = PP.tx;
      for (const f of [-0.97, -0.5, 0, 0.5, 0.97]) {
        const x = x0 + nx * e.hw * f, z = z0 + nz * e.hw * f; if (Math.max(Math.abs(x), Math.abs(z)) > 9000) continue;
        const my = surf(e, x, z); if (my == null) continue; n++;
        let top = my, topE = e; for (const o of pathsNear(x, z, 40)) { if (o === e) continue; const y = surf(o, x, z); if (y != null && y + lift(o) > top + lift(topE)) { top = y; topE = o; } }
        const s = sample(x, z), dz = s.h - top; // bridge decks over a road are grade separations, not terrain
        if (dz > 0.05) { poke++; if (dz > worst) { worst = dz; at = [x | 0, z | 0, e.id]; } }
        if ((n % 3) === 0) { gn++; for (const st of [4, 16]) { const gz = gridH(x, z, st) - (top + lift(topE)); if (gz > 0.02) { G[st]++; if (gz > GW[st]) { GW[st] = gz; GA[st] = [x | 0, z | 0, e.id, f]; } } } }
        if (topE === e && dz < -0.3) { float++; if (-dz > worst) { worst = -dz; at = [x | 0, z | 0, e.id, 'float']; } }
      } }
  }
  // HILLS: cut limit (natural ground vs. road centre on open road; junction nodes / portals excluded), over-the-top grade cap, tunnels
  const CAP = { [W.HWY]: 0.12, [W.TRAIL]: 0.15, [W.LOOP]: 0.15 }; let hn = 0, cut8 = 0, maxCut = 0, cutAt = null, otgBad = 0, otgMax = 0, tuns = 0;
  for (const e of seen) { W.tunnelsOf(e); if (e.tn) tuns += e.tn.filter(t => t.s0 >= 0 && t.s1 <= e.len + 1).length;
    if (e.otg > CAP[e.type] * 1.1) otgBad++; otgMax = Math.max(otgMax, e.otg / CAP[e.type]);
    const m = Math.ceil(e.len / 10); for (let i = 0; i <= m; i++) { const s = i / m * e.len; if (!e.loop && (s < 50 || s > e.len - 50)) continue;
      pathPoint(e, i / m); if (PP.bridge || PP.tun > 0 || nearPortal(e, s, 60) || Math.max(Math.abs(PP.x), Math.abs(PP.z)) > 9000) continue;
      hn++; const c = W.naturalHeight(PP.x, PP.z) - PP.y; if (c > 8) cut8++; if (c > maxCut) { maxCut = c; cutAt = [PP.x | 0, PP.z | 0, e.id]; } } }
  console.log(JSON.stringify({ hills: { stations: hn, cutOver8: cut8, maxCut: +maxCut.toFixed(2), cutAt, overTopGradeMaxOfCap: +otgMax.toFixed(3), overTopBad: otgBad, tunnels: tuns } }));
  const hillsOk = cut8 / hn < 0.001 && maxCut < 12 && otgBad === 0 && tuns > 5;
  // RIM HIGHWAY: closed ring inside the world bounds (road + shoulder before the rim wall), >= 4 junctions that meet their edges, grade cap,
  // cut limit, NASCAR bank range (flat at junctions / bridges / tunnels), surface = banked plane, smooth junction areas
  const rim = (() => { const E = W.RIM; pathPoint(E, 0); const M = E.M, ds = E.ds, y0 = PP.y, b0 = PP.bank; pathPoint(E, 1); const seam = Math.max(Math.abs(PP.y - y0), Math.abs(PP.bank - b0) * 10);
    let mxc = 0, mxg = 0, mxb = 0, cut8 = 0, mxcut = 0, st = 0, sn = 0, sBad = 0, sW = 0;
    for (let i = 0; i < M; i++) { pathPoint(E, i / M); mxc = Math.max(mxc, Math.abs(PP.x) + Math.abs(PP.tz) * (E.hw + 8), Math.abs(PP.z) + Math.abs(PP.tx) * (E.hw + 8)); mxb = Math.max(mxb, Math.abs(Math.atan(PP.bank)) * 57.2958);
      mxg = Math.max(mxg, Math.abs(E.prof[i + 1] - E.prof[i]) / ds); const s = i * ds;
      if (PP.bridge || PP.tun > 0 || nearPortal(E, s, 60) || nearPortal(E, s + E.len, 60)) continue; st++; const c = W.naturalHeight(PP.x, PP.z) - PP.y; if (c > 8) cut8++; mxcut = Math.max(mxcut, c);
      if (i % 3 === 0) { const P = { ...PP }; for (const f of [-0.9, -0.45, 0, 0.45, 0.9]) { const x = P.x - P.tz * E.hw * f, z = P.z + P.tx * E.hw * f, o = sample(x, z), y = P.y + E.hw * f * P.bank; sn++;
        const d = Math.abs(o.h - y); if (d > 0.08 && !(o.deck > -1e8)) { sBad++; sW = Math.max(sW, d); } } } }
    const J = W.rimJunctions(); let jBank = 0, jSlope = 0, jEnds = 0;
    for (const j of J) { pathPoint(E, j.t); jBank = Math.max(jBank, Math.abs(PP.bank));
      for (let dx = -60; dx <= 60; dx += 3) for (let dz = -60; dz <= 60; dz += 3) { const a = sample(j.x + dx, j.z + dz); if (a.road < 0.5) continue; const h0 = a.h; jSlope = Math.max(jSlope, Math.abs(sample(j.x + dx + 2, j.z + dz).h - h0) / 2, Math.abs(sample(j.x + dx, j.z + dz + 2).h - h0) / 2); }
      for (const e of pathsNear(j.x, j.z, 30)) if (!e.rim && !e.loop) { pathPoint(e, 0); const a = e.a.rim ? Math.abs(PP.y - e.a.h) : 0; pathPoint(e, 1); const b = e.b.rim ? Math.abs(PP.y - e.b.h) : 0; if (Math.max(a, b) > 0.05) jEnds++; } }
    const tn = (W.tunnelsOf(E) || []).length; let br = 0; for (let i = 0; i < M; i++) if (E.br[i] && !E.br[(i + M - 1) % M]) br++;
    const r = { lenKm: +(E.len / 1000).toFixed(2), width: E.hw * 2, seam: +seam.toFixed(3), maxCoordWithShoulder: Math.round(mxc), maxGrade: +mxg.toFixed(3), cutOver8: cut8, maxCut: +mxcut.toFixed(2), bankMaxDeg: +mxb.toFixed(1),
      junctions: J.length, junctionBank: +jBank.toFixed(4), junctionMaxSlope: +jSlope.toFixed(2), junctionEndSteps: jEnds, tunnels: tn, bridges: br, surfSamples: sn, surfBad: sBad, surfWorst: +sW.toFixed(2) };
    console.log(JSON.stringify({ rim: r }));
    return r.seam < 0.01 && mxc < W.WORLD && mxg <= 0.12 * 1.02 && cut8 / st < 0.002 && mxcut < 12 && mxb > 20 && mxb <= 33 && J.length >= 4 && jBank < 1e-3 && jSlope < 1 && jEnds === 0 && tn > 0 && br > 0 && sBad / sn < 0.01; })();
  const pct = (100 * (poke + float) / n);
  console.log(JSON.stringify({ roads: seen.size, samples: n, poke, float, worst: +worst.toFixed(2), at, junctionSteps: ends, loopSeams: seams, badPct: +pct.toFixed(3), gridSamples: gn, gridPoke4: G[4], gridPoke16: G[16], gridWorst4: +GW[4].toFixed(2), gridWorst16: +GW[16].toFixed(2), GA }));
  const ok = hillsOk && rim && pct < 0.5 && ends === 0 && seams === 0 && (G[4] + G[16]) / gn < 0.005;
  console.log(ok ? 'ROADS OK' : 'ROADS FAIL'); process.exit(ok ? 0 : 1);
})();
