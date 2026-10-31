// Sky / atmosphere screenshots: car view (day) + wide vistas from a plane (day, sunset facing the sun) at 844x390 MED.
// usage: node tools/shot-sky.cjs <suffix> [extra query]  -> shots/sky_{car,vista,sunset,sunsetcar}_<suffix>.png (server on $PORT, default 18941)
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/workspace/scratch/ptest/node_modules/puppeteer-core'); }
const SH = require('path').join(__dirname, '..', 'shots') + '/', sfx = process.argv[2] || 'now', extra = process.argv[3] || ''; const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || 18941, BASE = `http://127.0.0.1:${PORT}/`;
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  const page = async q => { const p = await b.newPage(); await p.setViewport({ width: 844, height: 390, hasTouch: false }); p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '?q=med&dyn=0&wx=clear&craft=car' + q + extra, { waitUntil: 'load' }); await sleep(4500); return p; };
  const p0 = await b.newPage(); await p0.goto(BASE + '?dyn=0'); await p0.evaluate(() => localStorage.clear()); await p0.close();
  const toRoad = p => p.evaluate(() => { const W = __st.W, es = W.pathsNear(0, 0, 4000).filter(e => e.type === W.HWY && !e.loop).sort((a, b) => (a.id + '').localeCompare(b.id + ''));
    for (const e of es) for (const t of [0.5, 0.4, 0.6]) { const P = W.pathPoint(e, t); if (P.bridge || P.y < 3) continue; __st.teleport(P.x, P.z, Math.atan2(P.tx, P.tz)); return { x: P.x, z: P.z }; } });
  for (const [name, tod, sunYaw] of [['car', 0.4, null], ['sunsetcar', 0.715, null]]) {
    const p = await page('&tod=' + tod); await toRoad(p); await sleep(3500); await p.screenshot({ path: SH + `sky_${name}_${sfx}.png` }); await p.close(); }
  for (const [name, tod, yaw] of [['vista', 0.4, 2.4], ['sunset', 0.715, Math.atan2(-0.83, 0.5)]]) {
    const p = await page('&tod=' + tod); await p.evaluate(() => __st.setCraft('plane', 'cub', 'air')); await sleep(800);
    await p.evaluate(y => { __st.teleport(300, 300, y); __st.planeCtl = { pitch: 0, roll: 0, thr: 0.7 }; }, yaw); await sleep(4000);
    await p.screenshot({ path: SH + `sky_${name}_${sfx}.png` }); await p.close(); }
  if (errs.length) console.log('errors', errs); else console.log('ok', sfx);
  await b.close();
})();
