// screenshots: car wading through fords with steam + heat gauge (844x390) -> shots/12-*.png, shots/13-*.png
const { launch, open } = require('./lib.cjs'); const path = require('path');
(async () => {
  const h = await launch(); await open(h, 'q=med&dyn=0&wx=clear&tod=0.42');
  const F = await h.page.evaluate(() => __st.W.fordsIn(0, 40000).map(f => ({ c: f.c, coast: f.coast })));
  const picks = [[F.find(f => !f.coast), '12-water-ford-steam.png'], [F.find(f => f.coast), '13-water-coast-wash-steam.png']];
  for (const [f, name] of picks) {
    await h.page.evaluate(f => { __st.auto = false; __st.toS(f.c - 3, 3); const v = __st.veh; v.heat.temp = 117; __st.inp.brake = 1; __st.inp.gas = 0; }, f);
    await new Promise(r => setTimeout(r, 1800));
    await h.page.evaluate(() => new Promise(r => { __st.WCOOL.wade = 0.01; __st.veh.heat.temp = 117; requestAnimationFrame(() => requestAnimationFrame(() => r())); }));
    const out = path.join(__dirname, '..', 'shots', name); await h.page.screenshot({ path: out });
    console.log(out, JSON.stringify(await h.page.evaluate(() => ({ _: (__st.WCOOL.wade = 1.5),  T: __st.veh.heat.temp.toFixed(0), w: __st.water.tier, d: __st.water.depth.toFixed(2) }))));
  }
  await h.close();
})().catch(e => { console.error(e); process.exit(1); });
