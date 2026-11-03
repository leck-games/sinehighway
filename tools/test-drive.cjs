// Autopilot endurance: 50+ km on the endless route without rendering (physics + autopilot + floating origin + streaming),
// then a rendered check. Asserts: stays in its lane, never stuck, rebases cleanly, local coords stay small, all biomes driven.
const { launch, open, ok, done } = require('./lib.cjs');
const KM = +(process.env.KM || 52);
(async () => {
  const h = await launch(); await open(h, 'q=low&dyn=0&wx=clear&tod=0.42&auto=1');
  const t0 = Date.now();
  const r = await h.page.evaluate((KM) => {
    __st.toS(600); __st.auto = true; const A = { offroad: 0, maxD: 0, maxLocal: 0, stuck: 0, crashes: 0, rebases: 0, tunnels: 0, bridges: 0, km: 0, minSpeed: 1e9, rebaseErr: 0, maxLive: 0, biomes: {} };
    for (let k = 0; k < 400 && A.km < KM; k++) { const r = __st.simFast(20);
      A.offroad += r.offroad; A.maxD = Math.max(A.maxD, r.maxD); A.maxLocal = Math.max(A.maxLocal, r.maxLocal); A.stuck += r.stuck; A.crashes += r.crashes; A.rebases += r.rebases; A.tunnels += r.tunnels; A.bridges += r.bridges; A.km += r.km;
      A.minSpeed = Math.min(A.minSpeed, r.minSpeed); A.rebaseErr = Math.max(A.rebaseErr, r.rebaseErr); A.maxLive = Math.max(A.maxLive, r.chunks.live); A.biomes[__st.route.biome] = 1; }
    A.s = __st.route.s; A.origin = __st.origin; A.damage = __st.veh.damage; A.local = [__st.veh.p.x, __st.veh.p.z]; return A;
  }, KM);
  console.log(JSON.stringify(r), ((Date.now() - t0) / 1000).toFixed(0) + ' s wall');
  ok(r.km >= 50, `distance ${r.km.toFixed(1)} km (route s ${(r.s / 1000).toFixed(1)} km)`);
  ok(r.offroad === 0 && r.maxD < 4.5, `stayed on the road: ${r.offroad} off-road samples, max |d| ${r.maxD.toFixed(2)} m (lane centre 3 m)`);
  ok(r.stuck === 0, `never stuck (${r.stuck} respawns)`);
  ok(r.crashes <= 2, `crashes ${r.crashes}, damage ${r.damage.toFixed(1)}`);
  ok(r.minSpeed > 12, `min speed ${r.minSpeed.toFixed(1)} m/s`);
  ok(r.rebases >= 30 && r.rebaseErr < 0.01, `floating origin: ${r.rebases} rebases, max continuity error ${r.rebaseErr.toExponential(1)}, origin ${JSON.stringify(r.origin)}`);
  ok(r.maxLocal < 1100, `local coords stay small: max ${r.maxLocal.toFixed(0)} m`);
  ok(r.tunnels > 0 && r.bridges > 0, `drove through tunnels (${r.tunnels}) and over bridges (${r.bridges}) samples`);
  ok(Object.keys(r.biomes).length === 5, 'biomes driven: ' + Object.keys(r.biomes).join(', '));
  ok(r.maxLive <= 45, `live chunks max ${r.maxLive}`);
  // rendered: a few seconds at 50+ km must render fine and keep moving on the road
  const r2 = await h.page.evaluate(() => new Promise(res => { const s0 = __st.route.s; setTimeout(() => res({ ds: __st.route.s - s0, d: __st.route.d, fps: window.__fps }), 4000); }));
  ok(r2.ds > 10 && Math.abs(r2.d) < 4.5, `rendered after ${r.km.toFixed(0)} km: moved ${r2.ds.toFixed(0)} m, d ${r2.d.toFixed(2)}, ${r2.fps.toFixed(0)} fps`);
  ok(!h.errors.length, 'no console errors ' + h.errors.slice(0, 3).join(' | '));
  await h.close(); done();
})().catch(e => { console.error(e); process.exit(1); });
