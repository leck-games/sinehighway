// Screenshots -> shots/ (gitignored): one per biome, a biome transition, HUD (+ menu), tunnel, bridge.
const { launch, open } = require('./lib.cjs'); const fs = require('fs'), path = require('path');
const OUT = path.join(__dirname, '..', 'shots'); fs.mkdirSync(OUT, { recursive: true });
(async () => {
  const h = await launch({ w: 1266, h: 585 }); await open(h, 'q=high&dyn=0&wx=clear&tod=0.4&auto=1');
  const P = h.page, wait = ms => new Promise(r => setTimeout(r, ms));
  const info = await P.evaluate(() => { const W = __st.W, out = {}; let s = 0; for (let k = 0; k < 20 && Object.keys(out).length < 5; k++) { const g = W.segmentAt(s); if (!(g.name in out)) out[g.name] = (g.s0 + g.s1) / 2; s = g.s1 + 1; }
    const B = W.boundaries(0, 60000), F = W.featuresIn(1000, 60000); return { mids: out, B, tun: (F.find(f => f.type === 'tun') || {}).s0, br: (F.find(f => f.type === 'br') || {}).s0 }; });
  const shot = async (name, s, ms = 6000) => { await P.evaluate(s => { __st.toS(s); __st.auto = true; }, s); await wait(ms);
    const r = await P.evaluate(() => __st.route); await P.screenshot({ path: path.join(OUT, name + '.png') }); console.log(name, (r.s / 1000).toFixed(2) + ' km', r.biome, JSON.stringify(r.weights.map(w => +w.toFixed(2)))); };
  let i = 1; for (const [b, s0] of Object.entries(info.mids)) { const s = await P.evaluate(s => { const W = __st.W; for (let k = 0; k < 20; k++, s += 150) { if (!W.featuresIn(s - 50, s + 250).length) return s; } return s; }, s0); await shot(`0${i++}-biome-${b}`, s); } // open road, not inside a tunnel
  const b = info.B.find(x => x.s > 9000) || info.B[0]; await shot('06-transition-' + ['prairie', 'desert', 'forest', 'mountains', 'coast'][b.prev] + '-to-' + ['prairie', 'desert', 'forest', 'mountains', 'coast'][b.b], b.s - 70, 5000);
  await shot('07-hud-route-strip', info.B[0].s - 900, 6000);
  if (info.tun) await shot('08-tunnel', info.tun - 140, 5000);
  if (info.br) await shot('09-bridge', info.br - 130, 5000);
  await P.evaluate(() => document.getElementById('tMenu').click()); await wait(1500); await P.screenshot({ path: path.join(OUT, '10-hud-menu.png') });
  console.log('errors', h.errors.length, h.errors.slice(0, 3)); await h.close();
})().catch(e => { console.error(e); process.exit(1); });
