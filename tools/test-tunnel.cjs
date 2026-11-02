// HILLS tunnels: a car driven into a tunnel portal stays on the tunnel floor (not on the hill above, not stuck in the terrain/walls)
// and comes out the other end; checks tunnel shading attribute + no page errors.  Serve repo on :18931 first.  usage: node tools/test-tunnel.cjs [port]
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/workspace/scratch/ptest/node_modules/puppeteer-core'); }
const sleep = ms => new Promise(r => setTimeout(r, ms)); let fail = 0; const ok = (k, v, i) => { if (!v) fail++; console.log((v ? 'PASS ' : 'FAIL ') + k, i !== undefined ? JSON.stringify(i) : ''); };
const PORT = process.argv[2] || 18931;
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 844, height: 390 }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto(`http://127.0.0.1:${PORT}/?q=low&dyn=0&wx=clear&tod=0.42&craft=car`, { waitUntil: 'load' }); await sleep(5000);
  // straightest long tunnels near the origin (deterministic per seed); start 30 m before a portal, facing in
  const cands = await p.evaluate(() => { const W = __st.W, out = [], seen = new Set();
    for (let x = -4200; x <= 4200; x += 1200) for (let z = -4200; z <= 4200; z += 1200) for (const e of W.pathsNear(x, z, 700)) { if (seen.has(e)) continue; seen.add(e);
      for (const t of (W.tunnelsOf(e) || [])) { if (t.s0 < 0 || t.s1 > e.len || t.s1 - t.s0 < 120) continue;
        const run = Math.min(t.s1 - t.s0, 260), fw = t.s0 > 40, sA = fw ? t.s0 - 30 : t.s1 + 30; if (!fw && sA > e.len - 5) continue;
        let turn = 0, pt = null; for (let s = fw ? t.s0 : t.s1; fw ? s < t.s0 + run : s > t.s1 - run; s += fw ? 10 : -10) { W.pathPoint(e, s / e.len); const a = Math.atan2(W.PP.tx, W.PP.tz); if (pt != null) turn += Math.abs(Math.atan2(Math.sin(a - pt), Math.cos(a - pt))); pt = a; }
        W.pathPoint(e, sA / e.len); out.push({ id: String(e.id), x: W.PP.x, z: W.PP.z, yaw: Math.atan2(fw ? W.PP.tx : -W.PP.tx, fw ? W.PP.tz : -W.PP.tz), turn, len: t.s1 - t.s0, run }); } }
    return out.sort((a, b) => a.turn - b.turn).slice(0, 2); });
  ok('tunnels found', cands.length > 0, cands.length);
  for (const c of cands) {
    await p.keyboard.up('KeyW'); await p.evaluate(c => __st.teleport(c.x, c.z, c.yaw), c); await sleep(1500);
    await p.keyboard.down('KeyW'); let lo = 9, hi = -9, inside = 0, maxSpd = 0, worstY = 0, hill = 0, prog = 0, x0 = c.x, z0 = c.z, steer = null; const t0 = Date.now();
    while (Date.now() - t0 < 22000) { await sleep(120);
      const s = await p.evaluate(() => { const v = __st.veh, ti = __st.T.tunnelAt(v.p.x, v.p.z); const r = { x: v.p.x, y: v.p.y, z: v.p.z, spd: Math.hypot(v.v.x, v.v.z), fx: v.fwd.x, fz: v.fwd.z, hill: __st.T.heightAt(v.p.x, v.p.z) };
        if (ti) Object.assign(r, { floor: ti.floor, H: ti.H, ts: ti.s, nx: ti.nx, nz: ti.nz, depth: ti.depth }); return r; });
      maxSpd = Math.max(maxSpd, s.spd); prog = Math.max(prog, Math.hypot(s.x - x0, s.z - z0));
      if (s.floor != null && s.depth > 8) { inside++; { const dy = s.y - s.floor; lo = Math.min(lo, dy); hi = Math.max(hi, dy); worstY = Math.max(worstY, Math.abs(dy - 0.6)); } if (s.y > s.floor + s.H) hill++;
        // lane keeping (keys): lateral offset along n plus heading error vs the tunnel axis
        const tx = s.nz, tz = -s.nx, dir = Math.sign(tx * s.fx + tz * s.fz) || 1, cross = s.fx * tz * dir - s.fz * tx * dir; const e = -s.ts * 0.12 * dir + cross * 2.0;
        const want = Math.abs(e) < 0.08 ? null : e > 0 ? 'KeyA' : 'KeyD'; if (want !== steer) { if (steer) await p.keyboard.up(steer); if (want) await p.keyboard.down(want); steer = want; } }
      else if (steer) { await p.keyboard.up(steer); steer = null; }
      if (inside > 0 && s.floor == null && prog > c.run * 0.6) break; }
    if (steer) await p.keyboard.up(steer);
    const st = await p.evaluate(() => { const v = __st.veh; return { x: v.p.x, z: v.p.z, spd: Math.hypot(v.v.x, v.v.z) }; });
    const r = { id: c.id, len: c.len | 0, inside, maxSpd: +maxSpd.toFixed(1), worstY: +worstY.toFixed(2), dy: [+lo.toFixed(2), +hi.toFixed(2)], onHill: hill, prog: prog | 0 };
    ok('tunnel ' + c.id + ' drive-through', inside > 5 && hill === 0 && lo > 0.5 && hi < 3.5 && maxSpd > 12 && prog > Math.min(c.run, 120), r);
  }
  const attr = await p.evaluate(() => { let n = 0; __st.scene.traverse(o => { if (o.geometry && o.geometry.attributes && o.geometry.attributes.tn) n++; }); return n; });
  ok('terrain tunnel attribute', attr > 0, attr);
  ok('no page errors', !errs.length, errs); await b.close(); process.exit(fail ? 1 : 0);
})();
