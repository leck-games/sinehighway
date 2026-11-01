// Roads-over-terrain screenshots: car parked on roads near known crossings / steep cuts at 844x390 MED.
// usage: PORT=18941 node tools/shot-roads.cjs <suffix>  -> shots/roads_<i>_<suffix>.png
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/workspace/scratch/ptest/node_modules/puppeteer-core'); }
const SH = require('path').join(__dirname, '..', 'shots') + '/', sfx = process.argv[2] || 'now'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || 18941, BASE = `http://127.0.0.1:${PORT}/`;
// [x, z, road id to stand on, metres back from the nearest point, extra yaw]
const SPOTS = [[709, -5040, 99989992, 70, 0], [709, -5040, 'L0,-2', 80, 0], [-950, -4151, 'L-1,-2', 70, 0]];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  const p0 = await b.newPage(); await p0.goto(BASE + '?dyn=0'); await p0.evaluate(() => localStorage.clear()); await p0.close();
  for (let i = 0; i < SPOTS.length; i++) {
    const p = await b.newPage(); await p.setViewport({ width: 844, height: 390 }); p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '?q=med&dyn=0&wx=clear&craft=car&tod=0.4', { waitUntil: 'load' }); await sleep(4500);
    const r = await p.evaluate(([x, z, id, back, yaw]) => { const W = __st.W, e = W.pathsNear(x, z, 60).find(e => String(e.id) === String(id)); if (!e) return 'no road';
      let bt = 0, bd = 1e9; for (let k = 0; k <= 4000; k++) { const P = W.pathPoint(e, k / 4000, false); const d = Math.hypot(P.x - x, P.z - z); if (d < bd) { bd = d; bt = k / 4000; } }
      const len = e.len || 1000, t = bt - back / len, P = W.pathPoint(e, (t + 1) % 1); __st.teleport(P.x, P.z, Math.atan2(P.tx, P.tz) + yaw); return [P.x | 0, P.z | 0]; }, SPOTS[i]);
    await sleep(3500); await p.screenshot({ path: SH + `roads_${i}_${sfx}.png` }); console.log(i, r); await p.close();
  }
  if (errs.length) console.log('errors', errs); else console.log('ok', sfx);
  await b.close();
})();
