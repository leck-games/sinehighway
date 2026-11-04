// Fullscreen button: visible -> tap -> fullscreen requested + hidden; portrait -> exitFullscreen + reset; external exit -> back;
// home-screen (standalone) -> hidden; iPhone-like (no element Fullscreen API) -> pseudo mode + one-time hint.
const { launch, open, ok, done, ROOT } = require('./lib.cjs');
const path = require('path'), fs = require('fs');
const MOCK = mode => `(() => {
  const M = window.__fsMock = { req: 0, exit: 0, lock: 0, el: null };
  if (${JSON.stringify(mode)} === 'iphone') {
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => false, configurable: true });
    Object.defineProperty(Document.prototype, 'webkitFullscreenEnabled', { get: () => false, configurable: true });
    Element.prototype.requestFullscreen = undefined; Element.prototype.webkitRequestFullscreen = undefined;
  } else {
    Object.defineProperty(Document.prototype, 'fullscreenEnabled', { get: () => true, configurable: true });
    Object.defineProperty(Document.prototype, 'fullscreenElement', { get: () => M.el, configurable: true });
    Element.prototype.requestFullscreen = function () { M.req++; M.el = this; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); };
    Document.prototype.exitFullscreen = function () { M.exit++; M.el = null; document.dispatchEvent(new Event('fullscreenchange')); return Promise.resolve(); };
    try { screen.orientation.lock = () => { M.lock++; return Promise.resolve(); }; } catch (e) {}
  }
  if (${JSON.stringify(mode)} === 'standalone') Object.defineProperty(Navigator.prototype, 'standalone', { get: () => true, configurable: true });
})();`;
const vis = P => P.evaluate(() => getComputedStyle(document.getElementById('tFull')).display !== 'none');
(async () => {
  const h = await launch(); const P = h.page;
  await P.evaluateOnNewDocument(MOCK('real'));
  await open(h, 'q=low&dyn=0&wx=clear&tod=0.42');
  ok(await vis(P), 'button ⛶ visible in landscape at start');
  const box = await P.evaluate(() => { const r = document.getElementById('tFull').getBoundingClientRect(); const o = ['bGas', 'bBrk', 'joy', 'route', 'gauge'].map(i => document.getElementById(i)).filter(Boolean).map(e => e.getBoundingClientRect()).filter(b => b.width && !(r.right <= b.left || r.left >= b.right || r.bottom <= b.top || r.top >= b.bottom)); return { r: [r.left, r.top, r.width, r.height].map(Math.round), overlap: o.length }; });
  ok(box.overlap === 0 && box.r[2] > 30, 'button in the top-right corner group, no overlap with pedals/steering/route strip/gauge ' + JSON.stringify(box.r));
  fs.mkdirSync(path.join(ROOT, 'shots'), { recursive: true });
  await P.screenshot({ path: path.join(ROOT, 'shots/fs_hud.png') });
  await P.click('#tFull'); await new Promise(r => setTimeout(r, 200));
  let m = await P.evaluate(() => window.__fsMock);
  ok(m.req === 1 && m.el && !(await vis(P)), 'tap → requestFullscreen called, button hidden');
  ok(m.lock === 1, 'landscape orientation lock attempted');
  await P.setViewport({ width: 390, height: 844 }); await new Promise(r => setTimeout(r, 300));
  m = await P.evaluate(() => window.__fsMock);
  ok(m.exit === 1 && !m.el, 'rotate to portrait → exitFullscreen called, state reset');
  ok(!(await vis(P)), 'button stays hidden in portrait');
  await P.setViewport({ width: 844, height: 390 }); await new Promise(r => setTimeout(r, 300));
  ok(await vis(P), 'back in landscape (not fullscreen) → button back');
  await P.click('#tFull'); await new Promise(r => setTimeout(r, 200));
  ok(!(await vis(P)), 'second tap → fullscreen again, hidden');
  await P.evaluate(() => { window.__fsMock.el = null; document.dispatchEvent(new Event('fullscreenchange')); });
  ok(await vis(P), 'fullscreen left by other means (Esc / gesture, fullscreenchange) → button back');
  ok(h.errors.length === 0, 'no console errors ' + h.errors.slice(0, 2).join(' | '));
  await h.close();

  const s = await launch(); await s.page.evaluateOnNewDocument(MOCK('standalone'));
  await open(s, 'q=low&dyn=0&wx=clear&tod=0.42');
  ok(!(await vis(s.page)) && (await s.page.evaluate(() => __st.FS.standalone)), 'home-screen app (navigator.standalone) → button hidden');
  await s.close();

  const i = await launch(); const Q = i.page; await Q.evaluateOnNewDocument(MOCK('iphone'));
  await open(i, 'q=low&dyn=0&wx=clear&tod=0.42');
  await Q.evaluate(() => localStorage.removeItem('srroute_fshint')); await open(i, 'q=low&dyn=0&wx=clear&tod=0.42');
  ok((await vis(Q)) && !(await Q.evaluate(() => __st.FS.real)), 'iPhone Safari-like (no element Fullscreen API): button shown, real fullscreen unavailable');
  await Q.click('#tFull'); await new Promise(r => setTimeout(r, 200));
  const st = await Q.evaluate(() => ({ pseudo: __st.FS.st.pseudo, hint: getComputedStyle(document.getElementById('fsHint')).display, txt: document.getElementById('fsHint').textContent, cls: document.body.classList.contains('fs-pseudo') }));
  ok(st.pseudo && st.cls && st.hint === 'flex' && /Home Screen/.test(st.txt) && !(await vis(Q)), 'tap → pseudo fullscreen, button hidden, one-time hint "' + st.txt.trim() + '"');
  await Q.click('#fsHint'); ok((await Q.evaluate(() => getComputedStyle(document.getElementById('fsHint')).display)) === 'none', 'hint dismissable by tap');
  await Q.setViewport({ width: 390, height: 844 }); await new Promise(r => setTimeout(r, 300));
  await Q.setViewport({ width: 844, height: 390 }); await new Promise(r => setTimeout(r, 300));
  ok(!(await Q.evaluate(() => __st.FS.st.pseudo)) && (await vis(Q)), 'portrait → pseudo mode off; landscape → button back');
  await Q.click('#tFull'); await new Promise(r => setTimeout(r, 200));
  ok((await Q.evaluate(() => getComputedStyle(document.getElementById('fsHint')).display)) === 'none', 'hint shown only once (saved in srroute_fshint)');
  await i.close();
  done();
})().catch(e => { console.error(e); process.exit(1); });
