// Floating origin, rendered: drive across rebase thresholds in real frames; the camera/car must not jump, the car
// keeps its route s/d, and at 60 km from the start everything still runs in small local coordinates (no jitter).
const { launch, open, ok, done } = require('./lib.cjs');
(async () => {
  const h = await launch(); await open(h, 'q=low&dyn=0&wx=clear&tod=0.42&auto=1');
  const near = () => h.page.evaluate(() => { // place the car ~80 m before the next rebase threshold (|x| or |z| = 1080)
    const W = __st.W, s0 = __st.route.s; for (let s = s0 + 20; s < s0 + 3000; s += 2) { const p = __st.lanePoint(s); if (Math.max(Math.abs(p.x), Math.abs(p.z)) > 1000) { __st.place(p.x, p.z, p.yaw); __st.veh.v.x = Math.sin(p.yaw) * 25; __st.veh.v.z = Math.cos(p.yaw) * 25; __st.stats.camJump = 0; __st.stats.camG = null; return { s, x: p.x, z: p.z }; } } return null; });
  const watch = (n0, ms) => h.page.evaluate((n0, ms) => new Promise(res => { const t = performance.now(); let pr = [], fr = 0; (function f() {
    const v = __st.veh; if (++fr === 8) { pr = []; __st.stats.camJump = 0; } if (fr < 8) { requestAnimationFrame(f); return; } pr.push([v.p.x, v.p.z, __st.route.s, __st.stats.camG, __st.rebases]); if (__st.rebases > n0 && pr.length > 20 || performance.now() - t > ms) res({ rebases: __st.rebases - n0, camJump: __st.stats.camJump, err: __st.stats.rebaseErr || 0, d: __st.route.d, n: pr.length,
      gStep: pr.slice(1).map((p, i) => [Math.abs(p[3] - pr[i][3]), p[4] !== pr[i][4]]), sJump: Math.max(...pr.slice(1).map((p, i) => Math.abs(p[2] - pr[i][2]))) }); else requestAnimationFrame(f); })(); }), n0, ms);
  for (const [label, s] of [['start', 600], ['60 km', 60000]]) {
    await h.page.evaluate(s => { __st.toS(s); __st.auto = true; }, s);
    await new Promise(r => setTimeout(r, 1500));
    const at = await near(); const n0 = await h.page.evaluate(() => __st.rebases);
    const r = await watch(n0, 25000); const st = await h.page.evaluate(() => ({ o: __st.origin, x: __st.veh.p.x, z: __st.veh.p.z, cx: __st.scene.children.length }));
    console.log(label, JSON.stringify(at), JSON.stringify({ ...r, gStep: undefined }), JSON.stringify(st));
    ok(r.rebases >= 1, `${label}: rebased while rendering (${r.rebases}) at origin ${JSON.stringify(st.o)}`);
    const at0 = r.gStep.filter(g => g[1]).map(g => g[0]), other = r.gStep.filter(g => !g[1]).map(g => g[0]).sort((a, b) => a - b), med = other[other.length >> 1] || 0, mxo = other[other.length - 1] || 0;
    ok(at0.length && Math.max(...at0) <= Math.max(0.05, mxo * 1.05), `${label}: no camera jump on the rebase frame (camera-car distance change ${Math.max(...at0).toFixed(3)} m vs ordinary frames median ${med.toFixed(3)} / max ${mxo.toFixed(3)} m)`);
    ok(r.sJump < 8, `${label}: route s continuous across the shift (max per-frame ${r.sJump.toFixed(2)} m)`);
    ok(r.err < 0.01 && Math.abs(r.d) < 4.5, `${label}: rebase continuity error ${r.err.toExponential(1)}, lane d ${r.d.toFixed(2)}`);
    ok(Math.abs(st.x) < 1100 && Math.abs(st.z) < 1100, `${label}: local coords ${st.x.toFixed(0)}, ${st.z.toFixed(0)}`);
  }
  // precision at 60 km: global/local split keeps float32 resolution sub-millimetre near the car
  const p = await h.page.evaluate(() => { const v = __st.veh; const f = Math.fround; return { ex: Math.abs(f(v.p.x) - v.p.x), ez: Math.abs(f(v.p.z) - v.p.z), gx: Math.abs(f(v.p.x + __st.origin.x) - (v.p.x + __st.origin.x)), gz: Math.abs(f(v.p.z + __st.origin.z) - (v.p.z + __st.origin.z)) }; });
  ok(Math.max(p.ex, p.ez) < 1e-4, `float32 error in local coords ${Math.max(p.ex, p.ez).toExponential(1)} m (global would be ${Math.max(p.gx, p.gz).toExponential(1)} m)`);
  ok(!h.errors.length, 'no console errors ' + h.errors.slice(0, 3).join(' | '));
  await h.close(); done();
})().catch(e => { console.error(e); process.exit(1); });
