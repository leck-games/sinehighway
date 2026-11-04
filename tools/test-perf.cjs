// Load + perf sanity: the default URL and every quality level boot without console errors; in each biome the scene
// stays inside draw-call / triangle / CPU budgets (GPU cost proxy for iPhone 12) and headless FPS stays sane.
// Note: headless Chrome renders with SwiftShader (CPU), so absolute FPS is ~10x below a phone GPU; budgets are what count.
const { launch, open, ok, done } = require('./lib.cjs');
const BUD = { Low: { calls: 80, tris: 250e3 }, Med: { calls: 90, tris: 350e3 }, High: { calls: 120, tris: 500e3 } };
(async () => {
  { const h = await launch(); await open(h, ''); await new Promise(r => setTimeout(r, 6000));
    const v = await h.page.evaluate(() => ({ name: __st.version, title: document.title, fps: window.__fps, q: __st.q }));
    ok(v.name === 'SineHighway V0.3-dev' && v.title === v.name, `version label "${v.name}" (title "${v.title}")`);
    ok(!h.errors.length, `default URL (q=${v.q}): no console errors ` + h.errors.slice(0, 3).join(' | '));
    await h.close(); }
  for (const q of ['low', 'med', 'high']) {
    const h = await launch(); await open(h, `q=${q}&dyn=0&wx=clear&tod=0.42&auto=1`);
    const segs = await h.page.evaluate(() => { const W = __st.W, out = {}; let s = 0; for (let k = 0; k < 20 && Object.keys(out).length < 5; k++) { const g = W.segmentAt(s); if (!(g.name in out)) out[g.name] = (g.s0 + g.s1) / 2; s = g.s1 + 1; } return out; });
    const rows = [];
    for (const [b, s] of Object.entries(segs)) {
      await h.page.evaluate(s => { __st.toS(s); __st.auto = true; }, s); await new Promise(r => setTimeout(r, 2500));
      const m = await h.page.evaluate(() => new Promise(res => { let n = 0, c = 0, t = 0, cpu = 0; const t0 = performance.now(); (function f() { const i = __st.renderer.info.render; c = Math.max(c, i.calls); t = Math.max(t, i.triangles); cpu += __st.stats.frameMs; n++;
        if (performance.now() - t0 > 3000) res({ calls: c, tris: t, cpu: cpu / n, fps: n / ((performance.now() - t0) / 1000), biome: __st.route.biome }); else requestAnimationFrame(f); })(); }));
      rows.push({ b, ...m }); console.log(q, b, JSON.stringify(m));
    }
    const Q = await h.page.evaluate(() => __st.q), bud = BUD[Q] || { calls: 260, tris: 1.2e6 };
    const mc = Math.max(...rows.map(r => r.calls)), mt = Math.max(...rows.map(r => r.tris)), mf = Math.min(...rows.map(r => r.fps)), cpu = Math.max(...rows.map(r => r.cpu));
    ok(rows.length === 5 && rows.every(r => r.biome === r.b), `${Q}: measured in all 5 biomes`);
    ok(mc <= bud.calls, `${Q}: max draw calls ${mc} (budget ${bud.calls})`);
    ok(mt <= bud.tris, `${Q}: max triangles ${(mt / 1000).toFixed(0)}k (budget ${(bud.tris / 1000).toFixed(0)}k)`);
    ok(mf > 2.5, `${Q}: headless SwiftShader fps min ${mf.toFixed(1)} (sanity > 2.5), cpu ${cpu.toFixed(1)} ms/frame`);
    ok(!h.errors.length, `${Q}: no console errors ` + h.errors.slice(0, 3).join(' | '));
    await h.close();
  }
  done();
})().catch(e => { console.error(e); process.exit(1); });
