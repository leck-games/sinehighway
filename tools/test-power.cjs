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
      PH.step(s, inp, dt, world); PW.tick(s, dt, inp.gas);
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
