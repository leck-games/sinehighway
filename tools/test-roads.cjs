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
    const bank = e.loop ? 0 : Math.max(-0.07, Math.min(0.07, -PP.curv * 45)); return PP.y + s * bank;
  };
  // render grids (ground.js): vertex height rule + the two triangles per quad
  const vH = (x, z, st) => { const o = sample(x, z); return o.rdd < st * 1.5 && o.rb > 0.6 ? Math.min(o.h, o.rb - (st > 8 ? 0.9 : 0.06)) : o.h; };
  const gridH = (x, z, st) => { const i = Math.floor(x / st), j = Math.floor(z / st), u = x / st - i, v = z / st - j;
    const a = vH(i * st, j * st, st), b = vH(i * st, (j + 1) * st, st), c = vH((i + 1) * st, (j + 1) * st, st), d = vH((i + 1) * st, j * st, st);
    return u + v <= 1 ? a + (d - a) * u + (b - a) * v : c + (b - c) * (1 - u) + (d - c) * (1 - v); };
  const G = { 4: 0, 16: 0 }, GW = { 4: 0, 16: 0 }, GA = {}; let gn = 0;
  const seen = new Set(); let n = 0, poke = 0, float = 0, worst = 0, at = null, ends = 0, seams = 0;
  for (let cx = -R; cx <= R; cx += 1200) for (let cz = -R; cz <= R; cz += 1200) for (const e of pathsNear(cx, cz, 700)) {
    if (seen.has(e)) continue; seen.add(e);
    if (e.loop) { pathPoint(e, 0); const a = PP.y; pathPoint(e, 1); if (Math.abs(a - PP.y) > 0.05) seams++; }
    else { pathPoint(e, 0); const a = Math.abs(PP.y - e.a.h); pathPoint(e, 1); const b = Math.abs(PP.y - e.b.h); if (!PP.bridge && Math.max(a, b) > 0.05 && Math.min(e.a.h, e.b.h) > W.WATER + 4.6) ends++; }
    const m = Math.ceil(e.len / 6);
    for (let i = 0; i <= m; i++) { pathPoint(e, i / m); if (PP.bridge) continue; const x0 = PP.x, z0 = PP.z, nx = -PP.tz, nz = PP.tx;
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
  const pct = (100 * (poke + float) / n);
  console.log(JSON.stringify({ roads: seen.size, samples: n, poke, float, worst: +worst.toFixed(2), at, junctionSteps: ends, loopSeams: seams, badPct: +pct.toFixed(3), gridSamples: gn, gridPoke4: G[4], gridPoke16: G[16], gridWorst4: +GW[4].toFixed(2), gridWorst16: +GW[16].toFixed(2), GA }));
  const ok = pct < 0.5 && ends === 0 && seams === 0 && (G[4] + G[16]) / gn < 0.005;
  console.log(ok ? 'ROADS OK' : 'ROADS FAIL'); process.exit(ok ? 0 : 1);
})();
