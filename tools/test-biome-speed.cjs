// Biome switching at hypercar speed: ghost-drive the hyper car down the route at 300 m/s (1080 km/h) in real rendered frames
// across 3+ biome boundaries. HUD biome / ENTERING msg / sky / trees must track the biome of the route distance with no
// stalls (first-sight shader compiles are prewarmed at load), no stuck tree rebuilds and no console errors.
const { launch, open, ok, done } = require('./lib.cjs');
const V = 300, S0 = 2900, S1 = 14200;
(async () => {
  const h = await launch(); await open(h, 'q=low&dyn=0&wx=clear&tod=0.42');
  const pre = await h.page.evaluate(() => ({ ms: __st.stats.prewarmMs, n: __st.stats.prewarmPrograms }));
  ok(pre.ms > 0 && pre.n > 10, `shaders prewarmed at load (${pre.n} programs, ${pre.ms.toFixed(0)} ms)`);
  const r = await h.page.evaluate((V, S0, S1) => new Promise(res => {
    __st.useVehicle('hyper'); __st.toS(S0, 3);
    const W = __st.W, log = [], bounds = []; let s = S0, t = performance.now(), fr = 0, simT = 0, pendT = 0, maxPend = 0, maxGap = 0, gapAt = 0, bad = [];
    for (let q = S0; q < S1;) { const g = W.segmentAt(q); if (g.s1 < S1) bounds.push({ s: g.s1, to: W.segmentAt(g.s1 + 1).title.toUpperCase() }); q = g.s1 + 0.01; }
    (function f() {
      const now = performance.now(), gap = now - t, dt = Math.min(0.1, gap / 1000); t = now; fr++;
      if (fr > 20 && gap > maxGap) { maxGap = gap; gapAt = s; }
      const R = __st.route, exp = W.segmentAt(R.s).name, ts = __st.T.stats().trees, m = __st.msgText;
      if (fr > 3) { if (R.biome !== exp || Math.abs(R.s - s) > 40) bad.push([s | 0, R.s | 0, R.biome, exp]);
        pendT = ts.pending ? pendT + dt : 0; maxPend = Math.max(maxPend, pendT);
        for (const b of bounds) { if (b.tCross == null && R.s > b.s) b.tCross = simT;
          if (b.seen == null && R.s > b.s && m === 'ENTERING ' + b.to) b.seen = simT - b.tCross;
          if (b.hzA == null && R.s > b.s - 260) b.hzA = __st.U.uHorizon.value.clone();
          if (b.hzB == null && R.s > b.s + 520) b.hzB = __st.U.uHorizon.value.clone(); } }
      simT += dt; s += V * dt; const p = __st.lanePoint(s, 3); __st.place(p.x, p.z, p.yaw); __st.veh.v.x = Math.sin(p.yaw) * V; __st.veh.v.z = Math.cos(p.yaw) * V;
      if (s < S1) requestAnimationFrame(f);
      else res({ fr, bad: bad.slice(0, 5), nBad: bad.length, maxPend, maxGap, gapAt: gapAt | 0, rebases: __st.rebases, chunks: W.chunkStats(),
        bounds: bounds.map(b => ({ s: b.s | 0, to: b.to, seen: b.seen, dHz: b.hzA && b.hzB ? Math.abs(b.hzA.r - b.hzB.r) + Math.abs(b.hzA.g - b.hzB.g) + Math.abs(b.hzA.b - b.hzB.b) : -1 })) });
    })();
  }), V, S0, S1);
  console.log(JSON.stringify(r));
  ok(r.bounds.length >= 3, `crossed ${r.bounds.length} biome boundaries at ${V * 3.6} km/h (${r.fr} frames, ${r.rebases} rebases)`);
  ok(r.nBad === 0, `HUD biome = biome of route s on every frame, car tracked (mismatches ${r.nBad} ${JSON.stringify(r.bad)})`);
  for (const b of r.bounds) {
    ok(b.seen != null && b.seen < 0.5, `s ${b.s}: "ENTERING ${b.to}" shown ${b.seen == null ? 'never' : b.seen.toFixed(2) + ' s'} after crossing`);
    ok(b.dHz > 0.02, `s ${b.s}: sky moved to the new biome across the blend (Δhorizon ${b.dHz.toFixed(3)})`);
  }
  ok(r.maxPend < 1, `tree rebuild never stuck pending (longest ${r.maxPend.toFixed(2)} s)`);
  ok(r.maxGap < 300, `no frame stall at speed (worst frame ${r.maxGap.toFixed(0)} ms at s ${r.gapAt})`);
  ok(r.chunks.live < 40, `chunk window bounded (${JSON.stringify(r.chunks)})`);
  ok(!h.errors.length, 'no console errors ' + h.errors.slice(0, 3).join(' | '));
  await h.close(); done();
})().catch(e => { console.error(e); process.exit(1); });
