// Biomes: 5 kinds along the route, segments of a few km, ~200 m blends (weights sum to 1), and a rendered crossing of a
// boundary: 'biome' event, ENTERING message, HUD route strip title, sky colour shift.
const { launch, open, ok, done } = require('./lib.cjs');
(async () => {
  const h = await launch(); await open(h, 'q=low&dyn=0&wx=clear&tod=0.42&auto=1');
  const r = await h.page.evaluate(() => {
    const W = __st.W, B = W.boundaries(0, 80000), seen = new Set([W.segmentAt(0).b]), lens = []; let prev = 0, same = 0, maxSum = 0, minMid = 1, maxFar = 0;
    for (const b of B) { seen.add(b.b); lens.push(b.s - prev); prev = b.s; if (b.b === b.prev) same++; }
    for (let s = 0; s < 80000; s += 7) { const w = W.biomeAtS(s); let t = 0; for (let i = 0; i < W.NB; i++) t += w[i]; maxSum = Math.max(maxSum, Math.abs(t - 1)); }
    for (const b of B) { const wm = W.biomeAtS(b.s); minMid = Math.min(minMid, Math.min(wm[b.b], wm[b.prev])); // at the boundary both are ~0.5
      for (const o of [-W.BLEND - 20, W.BLEND + 20]) { const w = W.biomeAtS(b.s + o), dom = o < 0 ? b.prev : b.b; maxFar = Math.max(maxFar, 1 - w[dom]); } }
    const first = B.slice(0, 12).map(b => W.BIOME_NAMES[b.b] + '@' + (b.s / 1000).toFixed(1));
    return { n: B.length, kinds: [...seen].map(i => W.BIOME_NAMES[i]), minLen: Math.min(...lens.slice(1)), maxLen: Math.max(...lens), same, maxSum, minMid, maxFar, first, b1: B[0] && B[0].s, BLEND: W.BLEND };
  });
  console.log(JSON.stringify(r));
  ok(r.kinds.length === 5, 'all 5 biomes on the first 80 km: ' + r.kinds.join(', '));
  ok(r.minLen >= 1500 && r.maxLen <= 9000, `segment lengths ${(r.minLen / 1000).toFixed(1)}..${(r.maxLen / 1000).toFixed(1)} km (${r.n} boundaries)`);
  ok(r.same === 0, 'consecutive segments always change biome');
  ok(r.maxSum < 1e-4, `blend weights sum to 1 (max error ${r.maxSum.toExponential(1)})`);
  ok(r.minMid > 0.35, `boundary is a blend: min weight of either side at the boundary ${r.minMid.toFixed(2)}`);
  ok(r.maxFar < 0.01, `pure biome ${r.BLEND + 20} m from a boundary (max foreign weight ${r.maxFar.toFixed(3)})`);
  // rendered crossing: start 350 m before the first boundary on autopilot
  const c = await h.page.evaluate((s) => new Promise(res => { const ev = []; SR.on('biome', e => ev.push(e)); __st.toS(s - 350); __st.auto = true;
    const t0 = performance.now(), U = __st.U, h0 = U.uHorizon.value.clone(), b0 = __st.route.biome; let msgs = new Set(), hMax = 0;
    (function f() { msgs.add(__st.msgText); hMax = Math.max(hMax, Math.abs(U.uHorizon.value.r - h0.r) + Math.abs(U.uHorizon.value.g - h0.g) + Math.abs(U.uHorizon.value.b - h0.b));
      if (__st.route.s > s + 300 || performance.now() - t0 > 60000) res({ ev, b0, b1: __st.route.biome, title: __st.route.title, next: __st.route.next, msgs: [...msgs].filter(Boolean), hMax, s: __st.route.s }); else requestAnimationFrame(f); })(); }), r.b1);
  console.log(JSON.stringify(c));
  ok(c.b0 !== c.b1, `crossed ${c.b0} -> ${c.b1} at ${(r.b1 / 1000).toFixed(2)} km`);
  ok(c.ev.some(e => e.biome === c.b1), `'biome' event fired (${c.ev.map(e => e.biome).join(', ')})`);
  ok(c.msgs.some(m => /^ENTERING /.test(m) && m.includes(c.title.toUpperCase())), 'HUD message: ' + c.msgs.join(' | '));
  ok(c.hMax > 0.03, `sky horizon colour shifted through the blend (Δ ${c.hMax.toFixed(3)})`);
  ok(!h.errors.length, 'no console errors ' + h.errors.slice(0, 3).join(' | '));
  await h.close(); done();
})().catch(e => { console.error(e); process.exit(1); });
