// Tree HP hidden by default, toggle in ☰ → CONTROLS. Serve repo on :18931 first.
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/workspace/scratch/ptest/node_modules/puppeteer-core'); }
const sleep = ms => new Promise(r => setTimeout(r, ms)); let fail = 0; const ok = (k, v, i) => { if (!v) fail++; console.log((v ? 'PASS ' : 'FAIL ') + k, i !== undefined ? JSON.stringify(i) : ''); };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage(); await p.setViewport({ width: 844, height: 390 }); const errs = []; p.on('pageerror', e => errs.push(e.message));
  await p.goto('http://127.0.0.1:18931/?q=med&dyn=0', { waitUntil: 'load' }); await p.evaluate(() => localStorage.clear()); await p.reload({ waitUntil: 'load' }); await sleep(5000);
  const vis = () => p.evaluate(() => [...document.querySelectorAll('#labels .hp')].filter(d => d.style.display !== 'none').length);
  await p.evaluate(() => __st.toBiome && __st.toBiome('forest')); await sleep(1500);
  ok('default hidden', (await vis()) === 0, await vis());
  await p.evaluate(() => __st.openPower()); await sleep(500);
  const row = await p.evaluate(() => { const r = [...document.querySelectorAll('#mHud *')].find(e => e.textContent.trim() === 'TREE HP'); return !!r; });
  ok('toggle in CONTROLS', row);
  await p.evaluate(() => { const r = [...document.querySelectorAll('#mHud *')].find(e => e.textContent.trim() === 'TREE HP').parentElement; [...r.querySelectorAll('button')].find(x => x.textContent.trim() === 'ON').click(); }); await p.keyboard.press('Escape'); await p.evaluate(() => { const m = document.getElementById('menu'); if (m) m.style.display = 'none'; }); await sleep(2000);
  ok('on shows labels', (await vis()) > 0, await vis()); ok('persisted', await p.evaluate(() => localStorage.getItem('sinerally_treehp')) === 'on');
  ok('no page errors', !errs.length, errs); await b.close(); process.exit(fail ? 1 : 0);
})();
