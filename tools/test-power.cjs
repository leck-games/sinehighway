// Node test (no browser): the per-build POWER CURVE (js/power.js) on the vendored physics.
// Checks the curve maths (peak hp exact, kW, presets, stock round-trip) and that every car at 10 000 hp, in arcade and
// normal mode, on asphalt and dirt, runs 40 s full-throttle + steering + nitro with no NaN, sane top speed and gearing.
// usage: node tools/test-power.cjs
const path = require('path'), { pathToFileURL } = require('url');
const R = f => pathToFileURL(path.join(__dirname, '..', f)).href;
let fail = false; const check = (ok, what, extra = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + what + (extra ? '  ' + extra : '')); if (!ok) fail = true; };
(async () => {
  const PH = await import(R('js/phys/physics/index.js')), VH = await import(R('js/phys/vehicles/index.js')), PW = await import(R('js/power.js'));
  // curve maths
  for (const [k, pr] of Object.entries(PW.PRESETS)) {
    const c = PW.norm(Object.assign({ hp: 10000, idle: 900, redline: 7000 }, pr)), t = PW.table(c), pk = PW.peakOf(t, c.redline);
    check(Math.abs(pk.hp - 10000) < 30, `preset ${k}: table peak = 10000 hp`, `got ${pk.hp.toFixed(0)} hp @ ${pk.rpm.toFixed(0)} rpm, ${pk.nm.toFixed(0)} Nm`);
  }
  check(Math.abs(PW.norm({ hp: 99999 }).hp - PW.HP_MAX) < 1 && PW.norm({ hp: -5 }).hp === PW.HP_MIN && PW.norm({ hp: NaN }).hp === 400, 'hp clamps to 20..10000 and rejects NaN');
  const ids = VH.listVehicles().map(v => v.id);
  for (const id of ids) {
    const d = VH.getVehicle(id), s = PH.createState(d.physics), st = PW.stockOf(s.P);
    check(st.hp > 50 && st.hp < 3000 && st.nodes.every(v => v > 0 && v <= 1), `${id}: stock curve derived`, `${st.hp} hp, idle ${st.idle}, redline ${st.redline}`);
    const t0 = JSON.stringify(s.P.torque); PW.apply(s, d, { ...st }); const pk = PW.peakOf(s.P.torque, s.P.redline).hp; PW.apply(s, d, null);
    check(Math.abs(pk - st.hp) / st.hp < 0.03 && JSON.stringify(s.P.torque) === t0, `${id}: stock curve round-trips (apply → reset restores exact params)`, `${pk.toFixed(0)} vs ${st.hp}`);
  }
  // throttle ramp: time to full pedal by hp (AUTO), custom ms, lift-off faster than apply, eased onset, binary input → progressive
  const ramp = (s, dt = 1 / 120) => { let up = 0, dn = 0, first = 0; s.__thrX = 0; for (let i = 0; i < 400; i++) { const g = PW.throttle(s, dt, 1); if (i === 2) first = g; if (g >= 1) { up = (i + 1) * dt; break; } }
    for (let i = 0; i < 400; i++) { if (PW.throttle(s, dt, 0) <= 0) { dn = (i + 1) * dt; break; } } return { up, dn, first }; };
  { const d = VH.getVehicle(ids[0]), s = PH.createState(d.physics); s.rpm = s.P.redline * 0.5; const st = PW.stockOf(s.P);
    const r0 = ramp(s); check(r0.up >= 0.08 && r0.up <= 0.16 && r0.dn < r0.up, `throttle ramp stock (${st.hp} hp): ~0.1 s apply, faster lift`, `apply ${r0.up.toFixed(3)} s, lift ${r0.dn.toFixed(3)} s`);
    let prev = 0; for (const hp of [400, 1000, 3000, 10000]) { PW.apply(s, d, Object.assign({}, st, { hp })); const r = ramp(s);
      check(r.up >= prev - 1e-9 && r.dn < r.up * 0.6 && r.first < 0.2, `throttle ramp AUTO ${hp} hp: monotonic, lift < 0.6x apply, soft onset`, `apply ${r.up.toFixed(3)} s, lift ${r.dn.toFixed(3)} s, 3rd step ${r.first.toFixed(3)}`); prev = r.up;
      if (hp === 10000) check(r.up >= 0.6 && r.up <= 0.85, '10000 hp AUTO apply in 0.6–0.85 s', r.up.toFixed(3) + ' s'); }
    PW.apply(s, d, Object.assign({}, st, { hp: 10000, resp: 250 })); const rc = ramp(s); check(Math.abs(rc.up - 0.25) < 0.03, 'custom THROTTLE RESPONSE 250 ms honoured', rc.up.toFixed(3) + ' s');
    PW.apply(s, d, null); check(PW.norm({ resp: 5000 }).resp === PW.RESP_MAX && PW.norm({ resp: -3 }).resp === 0, 'resp clamps to 0..1000 ms'); }
  // 10 000 hp drive
  const mkWorld = surf => surf === 'hills' ? { heightAt: (x, z) => 3 * Math.sin(x * 0.045) * Math.cos(z * 0.035) + 1.2 * Math.sin(z * 0.11), surfaceAt: () => 'dirt' } : { heightAt: () => 0, surfaceAt: () => surf };
  const rows = [];
  for (const id of ids) for (const mode of ['arcade', 'normal']) for (const surf of ['asphalt', 'dirt', 'hills']) for (const pre of ['na', 'turbo', 'electric']) {
    if (surf !== 'asphalt' && pre !== 'na') continue;
    const d = VH.getVehicle(id), world = mkWorld(surf), s = PH.createState(d.physics); PH.setMode(s, mode); PH.spawn(s, world, 0, 0, 0);
    const stock = PW.stockOf(s.P); PW.apply(s, d, Object.assign({}, stock, PW.PRESETS[pre], { hp: 10000 }));
    const dt = 1 / 120; let bad = 0, vmax = 0, t100 = 0, maxRpm = 0, maxOm = 0, maxGear = 1, flips = 0;
    for (let i = 0; i < 120 * 40; i++) {
      const t = i * dt, inp = { gas: 1, brake: 0, steer: t > 25 && t < 30 ? 0.35 : 0, boost: t > 12 && t < 16 ? 1 : 0, hand: 0 };
      PH.step(s, Object.assign({}, inp, { gas: PW.throttle(s, dt, inp.gas) }), dt, world); PW.tick(s, dt, inp.gas);
      const sp = Math.hypot(s.v.x, s.v.y, s.v.z);
      if (![s.p.x, s.p.y, s.p.z, s.v.x, s.v.y, s.v.z, s.w.x, s.w.y, s.w.z, s.q.w, s.rpm].every(Number.isFinite)) { bad++; break; }
      vmax = Math.max(vmax, sp); if (!t100 && sp > 27.78) t100 = t; maxRpm = Math.max(maxRpm, s.rpm); maxGear = Math.max(maxGear, s.gear);
      for (const w of s.wheels) maxOm = Math.max(maxOm, Math.abs(w.omega)); if (s.up.y < 0) flips++;
    }
    const ok = !bad && vmax > (surf === 'hills' ? 15 : 35) && vmax < 160 && t100 > 0 && maxRpm < s.P.redline + 400 && maxOm < 2000 && maxGear >= (surf === 'hills' ? 2 : 3);
    rows.push(`${id.padEnd(9)} ${mode.padEnd(6)} ${surf.padEnd(7)} ${pre.padEnd(8)} top ${(vmax * 3.6).toFixed(0).padStart(4)} km/h  0-100 ${t100.toFixed(2)} s  gear ${maxGear}  rpm ${maxRpm.toFixed(0)}  wheel ω ${maxOm.toFixed(0)}  upside-down ${(flips * dt).toFixed(1)} s`);
    check(ok, `10000 hp ${id} ${mode} ${surf} ${pre}: finite, drivable, sane top speed / gearing`, rows[rows.length - 1].replace(/^\S+\s+\S+\s+\S+\s+\S+\s+/, ''));
  }
  console.log(fail ? 'FAILED' : 'ALL OK'); process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
