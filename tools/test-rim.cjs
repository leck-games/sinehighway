// RIM HIGHWAY (NASCAR banking): a car on the ring's tightest curve sits on the banked surface (physics normal = road bank, car rolled with it),
// drives along the ring with lane keeping, and the banking lets it hold a clearly higher speed than the same curve built flat
// (W.setRimBankScale(0)), at a lowered grip so the limit is reachable.  Serve repo on :18931 first.  usage: node tools/test-rim.cjs [port]
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/workspace/scratch/ptest/node_modules/puppeteer-core'); }
const sleep = ms => new Promise(r => setTimeout(r, ms)); let fail = 0; const ok = (k, v, i) => { if (!v) fail++; console.log((v ? 'PASS ' : 'FAIL ') + k, i !== undefined ? JSON.stringify(i) : ''); };
const PORT = process.argv[2] || 18931;
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 844, height: 390 }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/?q=low&dyn=0&wx=clear&tod=0.42&craft=car&handling=arcade`, { waitUntil: 'load' }); await sleep(5000);
  // tightest (most banked) station of the ring and its neighbourhood
  const C = await p.evaluate(() => { const W = __st.W, R = W.RIM; W.pathPoint(R, 0); let bi = 0; for (let i = 0; i < R.M; i++) if (Math.abs(R.bk[i]) > Math.abs(R.bk[bi])) bi = i;
    W.pathPoint(R, bi / R.M); return { bi, M: R.M, ds: R.ds, x: W.PP.x, z: W.PP.z, yaw: Math.atan2(W.PP.tx, W.PP.tz), bankDeg: Math.abs(Math.atan(W.PP.bank)) * 57.2958, R: 1 / Math.abs(W.PP.curv), hw: R.hw }; });
  ok('ring found, tight banked curve', C.bankDeg > 20 && C.bankDeg <= 33, { station: C.bi, bankDeg: +C.bankDeg.toFixed(1), radius: C.R | 0 });
  // 1) parked on the bank: ground normal tilt (physics normalAt) and car roll match the road bank; the car does not slide down
  await p.evaluate(c => __st.teleport(c.x, c.z, c.yaw), C); await sleep(2500);
  const a = await p.evaluate(() => { const v = __st.veh, n = __st.T.normalAt(v.p.x, v.p.z); return { p: [v.p.x, v.p.z], nDeg: Math.acos(Math.min(1, n[1])) * 57.2958, rollDeg: Math.acos(Math.min(1, v.up.y)) * 57.2958 }; });
  await sleep(3000); const a2 = await p.evaluate(() => [__st.veh.p.x, __st.veh.p.z]); const slide = Math.hypot(a2[0] - a.p[0], a2[1] - a.p[1]);
  ok('banked surface in physics (normal + car roll ~ bank)', Math.abs(a.nDeg - C.bankDeg) < 2.5 && Math.abs(a.rollDeg - C.bankDeg) < 4, { normalDeg: +a.nDeg.toFixed(1), carRollDeg: +a.rollDeg.toFixed(1), bankDeg: +C.bankDeg.toFixed(1) });
  ok('parked car holds on the bank', slide < 1.5, { slide: +slide.toFixed(2) });
  // 2) cornering: start 8 stations before the apex at speed V along the tangent, lane keeping (keys) + throttle for 6 s; on-road = |lateral| < hw
  async function run(scale, V, grip) {
    await p.evaluate((scale) => { __st.W.setRimBankScale(scale); }, scale);
    for (const k of ['KeyA', 'KeyD', 'KeyW']) await p.keyboard.up(k);
    const s0 = await p.evaluate((c, V, grip) => { const W = __st.W, R = W.RIM; W.pathPoint(R, (c.bi - 8) / c.M); const P = { ...W.PP }; __st.teleport(P.x, P.z, Math.atan2(P.tx, P.tz)); __st.gripTest = grip;
      return { tx: P.tx, tz: P.tz }; }, C, V, grip); await sleep(1200);
    await p.evaluate((V, t) => { const v = __st.veh; v.v.x = t.tx * V; v.v.z = t.tz * V; v.v.y = 0; for (const w of v.wheels) w.omega = V / (v.P.wheelR || 0.46); }, Math.abs(V), s0);
    await p.evaluate((hw, V) => { window.__rimV = V; // V < 0: free drive from |V| at full throttle
 const L = window.__rimLog = { n: 0, off: 0, worst: 0, vmin: 1e9, vsum: 0 }; let skip = 0;
      __st.drive = (inp) => { const W = __st.W, v = __st.veh, R = W.RIM, t = W.rimSpan(v.p.x, v.p.z, 0), tm = (t[0] + t[1]) / 2;
        W.pathPoint(R, ((tm % 1) + 1) % 1, false); const lat = -(v.p.x - W.PP.x) * W.PP.tz + (v.p.z - W.PP.z) * W.PP.tx, cross = -v.fwd.x * W.PP.tz + v.fwd.z * W.PP.tx; // heading: lateral part of fwd
        const vl = -v.v.x * W.PP.tz + v.v.z * W.PP.tx, spd = Math.hypot(v.v.x, v.v.z), V = window.__rimV; // lateral velocity (same sign as lat)
        // constant-speed skidpad: hold the speed V (direction kept, so slides still show) + free-rolling wheels, no throttle (friction circle all lateral)
        if (V > 0) { if (spd > 1) { const k = V / spd; v.v.x *= k; v.v.z *= k; } for (const w of v.wheels) w.omega = V / (v.P.wheelR || 0.46); }
        inp.gas = V > 0 ? 0 : 1; inp.brake = 0; inp.boost = 0; inp.hand = 0; inp.steer = Math.max(-1, Math.min(1, lat * 0.03 + vl * 0.05 + cross * 1.2)); // lat + = screen right of travel, steer + = left
        if (++skip % 3) return; L.n++; L.worst = Math.max(L.worst, Math.abs(lat)); if (Math.abs(lat) > hw) L.off++; L.vmin = Math.min(L.vmin, spd); L.vsum += spd; };
    }, C.hw, V);
    await sleep(5000); const L = await p.evaluate(() => { __st.drive = null; return window.__rimLog; }); const n = L.n, off = L.off, worst = L.worst, vmin = L.vmin, vsum = L.vsum;
    await p.evaluate(() => { __st.gripTest = 1; __st.W.setRimBankScale(1); });
    return { scale, V, onRoad: off === 0, offFrac: +(off / n).toFixed(2), worstLat: +worst.toFixed(1), vMin: +vmin.toFixed(1), vAvg: +(vsum / n).toFixed(1) };
  }
  await p.evaluate(() => __st.setHandling('arcade')); const fr = await run(1, -30, 1); console.log('   free drive', JSON.stringify(fr));
  ok('short drive on the ring (arcade, full throttle, lane keeping)', fr.onRoad && fr.vAvg > 30, fr);
  await p.evaluate(() => __st.setHandling('normal')); // grip-limited handling (arcade realigns velocity to the nose, so grip would not matter)
  const GRIP = 0.25, best = {};
  for (const scale of [1, 0]) { best[scale] = 0; for (const V of [60, 90, 110, 130]) { const r = await run(scale, V, GRIP); console.log("  ", JSON.stringify(r)); if (r.onRoad) best[scale] = V; else break; } }
    ok('banking allows a higher cornering speed than flat', best[1] > best[0], { grip: GRIP, banked_mps: best[1], flat_mps: best[0], neutral_mps: Math.sqrt(9.81 * C.R * Math.tan(C.bankDeg / 57.2958)) | 0 });
  ok('no page errors', !errs.length, errs); await b.close(); process.exit(fail ? 1 : 0);
})();
