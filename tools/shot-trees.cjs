// Tree variety screenshots (impostor-only forest) at 844x390 MED: two car views + a low plane vista, plus triangle counts.
// usage: PORT=18941 node tools/shot-trees.cjs <suffix>  -> shots/trees_<i>_<suffix>.png
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/workspace/scratch/ptest/node_modules/puppeteer-core'); }
const SH = require('path').join(__dirname, '..', 'shots') + '/', sfx = process.argv[2] || 'now'; const sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || 18941, BASE = `http://127.0.0.1:${PORT}/`;
const VIEWS = [{ x: 640, z: -5060, yaw: 1.2 }, { x: -900, z: -4300, yaw: 2.6 }, { plane: 1, x: 300, z: 300, yaw: 2.4 }];
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const errs = [];
  const p0 = await b.newPage(); await p0.goto(BASE + '?dyn=0'); await p0.evaluate(() => localStorage.clear()); await p0.close();
  for (let i = 0; i < VIEWS.length; i++) { const v = VIEWS[i];
    const p = await b.newPage(); await p.setViewport({ width: 844, height: 390 }); p.on('pageerror', e => errs.push(e.message));
    await p.goto(BASE + '?q=med&dyn=0&wx=clear&craft=car&tod=0.42', { waitUntil: 'load' }); await sleep(4500);
    if (v.plane) { await p.evaluate(() => __st.setCraft('plane', 'cub', 'air')); await sleep(800); await p.evaluate(v => { __st.teleport(v.x, v.z, v.yaw); __st.planeCtl = { pitch: 0, roll: 0, thr: 0.7 }; }, v); }
    else await p.evaluate(v => __st.teleport(v.x, v.z, v.yaw), v);
    await sleep(4000); const tri = await p.evaluate(() => { try { return __st.rinfo.tris; } catch (e) { return null; } });
    await p.screenshot({ path: SH + `trees_${i}_${sfx}.png` }); console.log(i, 'triangles', tri); await p.close(); }
  if (errs.length) console.log('errors', errs); else console.log('ok', sfx);
  await b.close();
})();
