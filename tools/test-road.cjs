// Road geometry: continuity (1 m sampling over 60 km), grade cap, terrain yields to the road, tunnels/bridges exist,
// determinism by seed, chunk disposal (bounded live chunks). Pure world.js checks inside the page.
const { launch, open, ok, done } = require('./lib.cjs');
const KM = +(process.env.KM || 60);
(async () => {
  const h = await launch(); await open(h, 'q=low&dyn=0&wx=clear&tod=0.42');
  const r = await h.page.evaluate((KM) => {
    const W = __st.W, O = W.origin(), N = KM * 1000; const q = { x: 0, z: 0, tx: 0, tz: 1, y: 0, bank: 0, curv: 0, tun: 0, bridge: false, b: 0 };
    let px = null, pz, pth, py, maxStep = 0, minStep = 9, maxTurn = 0, maxGrade = 0, maxCurv = 0, maxLive = 0, tunM = 0, brM = 0, yBuf = [], maxSurf = 0, surfN = 0, maxProj = 0;
    for (let s = 0; s <= N; s += 1) {
      if (s % 256 === 0) { W.setFocus(s); maxLive = Math.max(maxLive, W.chunkStats().live); }
      W.routePoint(s, q); const th = Math.atan2(q.tx, q.tz);
      if (px !== null) { const st = Math.hypot(q.x - px, q.z - pz); maxStep = Math.max(maxStep, st); minStep = Math.min(minStep, st); let dt = th - pth; dt = Math.atan2(Math.sin(dt), Math.cos(dt)); maxTurn = Math.max(maxTurn, Math.abs(dt)); }
      yBuf.push(q.y); if (yBuf.length > 21) yBuf.shift(); if (yBuf.length === 21) maxGrade = Math.max(maxGrade, Math.abs(yBuf[20] - yBuf[0]) / 20);
      maxCurv = Math.max(maxCurv, Math.abs(q.curv)); if (q.tun) tunM++; if (q.bridge) brM++;
      if (s % 10 === 0) { // the drivable surface under each lane is the road (terrain yields: cut, fill, tunnel floor or bridge deck)
        for (const d of [-3, 3]) { const x = q.x - q.tz * d, z = q.z + q.tx * d, ry = q.y + d * q.bank; W.setRef(ry + 0.5); const g = W.groundRef(x, z); const e = Math.abs(g - ry); if (e > maxSurf) maxSurf = e; surfN++;
          const p = W.project(x, z); maxProj = Math.max(maxProj, Math.abs(p.s - s), Math.abs(p.d - d)); }
      }
      px = q.x; pz = q.z; pth = th;
    }
    W.setRef(-1e9);
    const fp = [1234, 23456, 54321].map(s => { const p = W.routePoint(s); return [p.x + O.x, p.z + O.z, p.y].map(v => +v.toFixed(4)); });
    return { maxStep, minStep, maxTurn, maxGrade, maxCurv, maxLive, tunM, brM, maxSurf, surfN, maxProj, fp, feats: W.featuresIn(0, N).length, chunks: W.chunkStats() };
  }, KM);
  console.log(JSON.stringify(r));
  ok(r.maxStep < 1.01 && r.minStep > 0.99, `continuity: 1 m samples step ${r.minStep.toFixed(4)}..${r.maxStep.toFixed(4)} m over ${KM} km`);
  ok(r.maxTurn < 0.03, `heading continuity: max turn ${(r.maxTurn * 1000).toFixed(1)} mrad per metre`);
  ok(r.maxGrade <= 0.12, `grade cap: max ${(r.maxGrade * 100).toFixed(1)} % over 20 m (cap 12 %)`);
  ok(r.maxCurv < 1 / 40, `min curve radius ${(1 / r.maxCurv).toFixed(0)} m`);
  ok(r.maxSurf < 0.35, `terrain yields to the road: max lane surface error ${r.maxSurf.toFixed(3)} m over ${r.surfN} samples`);
  ok(r.maxProj < 0.05, `projection round-trip error ${r.maxProj.toFixed(4)} m`);
  ok(r.tunM > 0 && r.brM > 0, `tunnels ${r.tunM} m, bridges ${r.brM} m in ${KM} km (${r.feats} features)`);
  ok(r.maxLive <= 45 && r.chunks.live <= 45, `chunk disposal: max ${r.maxLive} live chunks (now ${r.chunks.live}) for ${r.chunks.starts} generated`);
  // determinism: a fresh page with the same seed gives the same route; another seed differs
  const h2 = await launch(); await open(h2, 'q=low&dyn=0&wx=clear&tod=0.42');
  const fp2 = await h2.page.evaluate(() => { const O = __st.W.origin(); return [1234, 23456, 54321].map(s => { const p = __st.W.routePoint(s); return [p.x + O.x, p.z + O.z, p.y].map(v => +v.toFixed(4)); }); });
  await open(h2, 'q=low&dyn=0&wx=clear&tod=0.42&seed=7');
  const fp3 = await h2.page.evaluate(() => { const O = __st.W.origin(); return [1234, 23456, 54321].map(s => { const p = __st.W.routePoint(s); return [p.x + O.x, p.z + O.z, p.y].map(v => +v.toFixed(4)); }); });
  ok(JSON.stringify(fp2) === JSON.stringify(r.fp), 'deterministic: same seed -> same route ' + JSON.stringify(fp2[1]));
  ok(JSON.stringify(fp3) !== JSON.stringify(r.fp), 'seed=7 -> different route ' + JSON.stringify(fp3[1]));
  ok(!h.errors.length && !h2.errors.length, 'no console errors ' + h.errors.concat(h2.errors).slice(0, 3).join(' | '));
  await h.close(); await h2.close(); done();
})().catch(e => { console.error(e); process.exit(1); });
