// Water cools the engine: fords cross the road (prairie/forest/coast), never in tunnels/on bridges; driving through stays possible;
// an overheated engine dropped into a ford cools fast (wading), grass fire under the car goes out, a submerged engine is cold at once,
// dry ground cools far slower. Rain adds a little.
const { launch, open, ok, done } = require('./lib.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const h = await launch(); await open(h, 'q=low&dyn=0&wx=clear&tod=0.42');
  const F = await h.page.evaluate(() => __st.W.fordsIn(0, 40000).map(f => ({ c: f.c, w: f.w, D: f.D, coast: f.coast, L: f.L, bad: __st.W.featuresIn(f.c - f.w - 20, f.c + f.w + 20).length })));
  console.log('fords 0-40 km:', F.length, F.slice(0, 6).map(f => (f.c / 1000).toFixed(2) + 'km' + (f.coast ? '(coast)' : '')).join(' '));
  ok(F.length >= 4, `fords exist on the route (${F.length} in 40 km)`);
  ok(F.every(f => !f.bad), 'no ford overlaps a tunnel or bridge');
  const f = F[0];
  // 1) depth on the road at the ford centre
  const dep = await h.page.evaluate(f => { __st.auto = false; __st.toS(f.c, 3); return __st.T.waterAt(__st.veh.p.x, __st.veh.p.z).depth; }, f);
  ok(dep >= 0.3 && dep < 0.6, `ford depth on the lane ${dep.toFixed(2)} m`);
  // 2) dry control: overheated, parked on dry road for 2 s
  const heat = s => h.page.evaluate(s => { __st.auto = false; const p = __st.toS(s, 3); const v = __st.veh; v.heat.temp = 128; v.heat.over = true; v.heat.cut = true; __st.inp.gas = 0; __st.inp.brake = 1; return p; }, s);
  const T = (ms) => h.page.evaluate(ms => new Promise(res => { const t0 = performance.now(), T0 = __st.veh.heat.temp; (function f() { if (performance.now() - t0 > ms) res({ T0, T: __st.veh.heat.temp, over: __st.veh.heat.over, cut: __st.veh.heat.cut, w: { ...__st.water } }); else requestAnimationFrame(f); })(); }), ms);
  await heat(f.c - 150); const dry = await T(2500);
  const ff = F.find(q => !q.coast) || f; await heat(ff.c); 
  const wet = await T(2500);
  // grass fire around a car that drives into water: douse() (called by waterCool while wet) clears burning cells within 7 m
  const [fire0, fire1] = await h.page.evaluate(() => { const v = __st.veh, T = __st.T; let fx = null;
    for (let r = 20; r < 3000 && !fx; r += 15) for (let a = 0; a < 6.28; a += 0.2) { const x = v.p.x + Math.cos(a) * r, z = v.p.z + Math.sin(a) * r; if (T.fuelAt(x, z) > 0.15) { fx = [x, z]; break; } }
    if (!fx) return [0, -1]; T.ignite(fx[0], fx[1], { radius: 3 }); const near = () => T.burningCells().filter(c => Math.hypot(c.x - fx[0], c.z - fx[1]) < 7).length; const n0 = near(); T.douse(fx[0], fx[1], 7); return [n0, near()]; });
  console.log('dry', JSON.stringify(dry), '\nwet', JSON.stringify(wet), 'fire', fire0, '->', fire1);
  ok(wet.w.tier === 'wading' && wet.w.depth > 0.25, `in the ford: tier ${wet.w.tier}, depth ${wet.w.depth.toFixed(2)} m`);
  ok(wet.T < 60, `wading cools fast: 128 -> ${wet.T.toFixed(1)} °C in 2.5 s`);
  ok(dry.T > wet.T + 30, `dry road cools far slower (${dry.T.toFixed(1)} °C)`);
  ok(!wet.over && !wet.cut, 'overheat + engine cut cleared');
  ok(fire0 > 0 && fire1 === 0, `grass fire doused by water (${fire0} burning before)`);
  // 3) drive through the ford with the autopilot (drivable)
  const thru = await h.page.evaluate(f => new Promise(res => { __st.toS(f.c - 80, 3); __st.inp.brake = 0; __st.auto = true; const t0 = performance.now(); let maxD = 0;
    (function g() { maxD = Math.max(maxD, __st.water.depth); if (__st.route.s > f.c + 40 || performance.now() - t0 > 25000) { __st.auto = false; res({ s: __st.route.s, maxD }); } else requestAnimationFrame(g); })(); }), f);
  ok(thru.s > f.c + 40, `autopilot drove through the ford (s ${thru.s.toFixed(0)} vs ford ${f.c.toFixed(0)}, max water ${thru.maxD.toFixed(2)} m)`);
  // 4) sea: find deep water off the coast road, park the car in it -> engine submerged, cold at once
  const sea = await h.page.evaluate(() => { const W = __st.W; for (let s = 2000; s < 80000; s += 40) { const g = W.segmentAt(s); if (g.name !== 'coast' && g.b !== 4) continue;
      for (let d = 30; d < 150; d += 4) for (const sd of [-1, 1]) { const p = __st.lanePoint(s, 0), x = p.x + Math.cos(p.yaw) * d * sd, z = p.z - Math.sin(p.yaw) * d * sd, w = __st.T.waterAt(x, z);
        if (w.sea && w.depth > 1.8 && w.depth < 3) return { s, d: d * sd }; } } return null; });
  ok(!!sea, 'deep coastal water found ' + JSON.stringify(sea));
  if (sea) {
    const r = await h.page.evaluate(sea => { const p = __st.toS(sea.s, 0), x = p.x + Math.cos(p.yaw) * sea.d, z = p.z - Math.sin(p.yaw) * sea.d; __st.place(x, z, p.yaw); __st.veh.heat.temp = 130; __st.waterCool(1 / 60); return { T: __st.veh.heat.temp, w: { ...__st.water }, wa: __st.T.waterAt(x, z).depth }; }, sea);
    console.log('sea', JSON.stringify(r));
    ok(r.w.sub && r.T <= 25.01, `engine under water: 130 -> ${r.T.toFixed(1)} °C at once (depth ${r.wa.toFixed(2)} m)`);
  }
  // 5) wheel splash (shallow edge) cools a little; rain adds a bit on dry ground
  const sp = await h.page.evaluate(f => { const p = __st.toS(f.c, 3); const W = __st.W; for (let k = 0; k < 400; k++) { const s = f.c + (k % 40) * 0.5 * (k & 1 ? 1 : -1), d = 3 + Math.floor(k / 40) * 4; const q = __st.lanePoint(s, d), w = __st.T.waterAt(q.x, q.z); if (w.depth > 0.03 && w.depth < 0.25) { __st.place(q.x, q.z, q.yaw); __st.veh.heat.temp = 110; __st.waterCool(0.5, false); return { T: __st.veh.heat.temp, w: { ...__st.water } }; } } return null; }, f);
  console.log('splash', JSON.stringify(sp));
  ok(sp && sp.w.tier === 'splash' && sp.T < 110 && sp.T > 80, `splash cools a bit: 110 -> ${sp && sp.T.toFixed(1)} °C in 0.5 s`);
  const rs = await h.page.evaluate(() => { __st.setWx('storm'); for (let s = 3000; s < 120000; s += 150) { const q = __st.lanePoint(s, 3); if (__st.T.rainAt(q.x, q.z) > 0.3 && !__st.T.waterAt(q.x, q.z).depth) return s; } return null; });
  ok(rs !== null, 'raining stretch found at s ' + rs);
  const rain = await h.page.evaluate(s => { __st.toS(s, 3); __st.veh.heat.temp = 110; __st.waterCool(0.5, false); const r = { T: __st.veh.heat.temp, k: __st.water.k, rain: __st.water.rain }; __st.setWx('clear'); return r; }, rs);
  console.log('rain', JSON.stringify(rain));
  ok(rain.rain > 0.3 && (rain.k > 0 && rain.k < 0.1), `rain cools slightly (rain ${rain.rain.toFixed(2)}, k ${rain.k.toFixed(3)}/s)`);
  ok(!h.errors.length, 'no console errors ' + h.errors.slice(0, 3).join(' | '));
  await h.close(); done();
})().catch(e => { console.error(e); process.exit(1); });
