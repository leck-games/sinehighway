// Browser test: VEHICLE → ⚙ ENGINE / POWER sub-menu (drag a node, 10000 hp, back), a 10000 hp run, and the sound editor's demo motor bench
// (NEUTRAL / DRIVE auto gearbox, pedals, numeric entry). usage: node tools/test-powerui.cjs  (server on $PORT, default 18941)
// shots: power_menu.png, power_curve_edit.png, power_10000hp_run.png, sound_finetune.png
let puppeteer; try { puppeteer = require('puppeteer-core'); } catch (e) { puppeteer = require('/workspace/scratch/ptest/node_modules/puppeteer-core'); }
const SH = require('path').join(__dirname, '..', 'shots') + '/', sleep = ms => new Promise(r => setTimeout(r, ms));
const PORT = process.env.PORT || 18941, BASE = `http://127.0.0.1:${PORT}/`;
let fail = false; const check = (ok, what, x = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + what + (x ? '  ' + x : '')); if (!ok) fail = true; };
(async () => {
  const b = await puppeteer.launch({ executablePath: '/usr/bin/google-chrome', headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
  const errs = []; const p = await b.newPage(); await p.setViewport({ width: 844, height: 390, hasTouch: false }); p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '?dyn=0'); await p.evaluate(() => localStorage.clear());
  await p.goto(BASE + '?q=med&dyn=0&wx=clear&craft=car&tod=0.4', { waitUntil: 'load' }); await sleep(4500);
  // --- menu entry
  await p.evaluate(() => __st.openMenu(true, 'vehicle')); await sleep(900);
  const btn = await p.evaluate(() => { const e = document.getElementById('vPowBtn'); return e && e.textContent; });
  check(btn && /ENGINE \/ POWER/.test(btn) && /stock/.test(btn), 'VEHICLE tab shows the ⚙ ENGINE / POWER entry', btn);
  await p.evaluate(() => document.getElementById('vPowBtn').scrollIntoView({ block: 'center' })); await sleep(300);
  await p.screenshot({ path: SH + 'power_menu.png' });
  await p.click('#vPowBtn'); await sleep(700);
  check(await p.evaluate(() => !!document.querySelector('#mVeh .pw canvas') && !document.querySelector('#mVeh .vprev') && __st.vSub === 'power'), 'sub-menu opens (car list hidden)');
  // --- drag node 2 down, then node 6 up (pointer)
  const cvb = await p.evaluate(() => { const r = document.querySelector('.pw-cv').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
  const nodeX = i => cvb.x + cvb.w * (50 + (760 - 104) * (i / 7) / 1.04) / 760; // PAD.l=50, PAD.r=54, x = rpm/(red*1.04)
  await p.mouse.move(nodeX(2), cvb.y + cvb.h * 0.4); await p.mouse.down(); await p.mouse.move(nodeX(2), cvb.y + cvb.h * 0.75, { steps: 6 }); await p.mouse.up(); await sleep(200);
  const cfgA = await p.evaluate(() => JSON.parse(localStorage.sinerally_power1 || '{}'));
  const idA = Object.keys(cfgA)[0], ca = cfgA[idA];
  check(ca && ca.preset === 'custom' && ca.nodes[2] < 0.6, 'dragging a node edits + saves the curve', ca && JSON.stringify(ca.nodes));
  // --- 10000 hp via the numeric field
  await p.evaluate(() => { const n = document.querySelector('.pw-r input[type=number]'); n.value = '10000'; n.dispatchEvent(new Event('change')); }); await sleep(400);
  const st = await p.evaluate(() => { const v = __st.veh, P = v.P, pk = __st.PWR.peakOf(P.torque, P.redline, P.torqueRpm); return { hp: v.__power && v.__power.cfg.hp, peak: Math.round(pk.hp), read: document.querySelector('.pw-read').textContent }; });
  check(st.hp === 10000 && Math.abs(st.peak - 10000) < 60 && /10,000/.test(st.read) && /7,457 kW|7457/.test(st.read.replace(/\s/g, ' ')), 'PEAK POWER 10000 hp applied to physics, readout shows hp + kW', JSON.stringify(st).slice(0, 220));
  await p.screenshot({ path: SH + 'power_curve_edit.png' });
  await p.click('.pw-h button[data-a=back]'); await sleep(500);
  const btn2 = await p.evaluate(() => { const e = document.getElementById('vPowBtn'); return e && e.textContent; });
  check(btn2 && /10,000 hp/.test(btn2), '‹ BACK returns to the car list, entry shows 10,000 hp', btn2);
  // --- 10000 hp run on a highway
  await p.evaluate(() => __st.openMenu(false)); await sleep(300);
  await p.evaluate(() => { const W = __st.W, es = W.pathsNear(0, 0, 4000).filter(e => e.type === W.HWY && !e.loop).sort((a, b) => (a.id + '').localeCompare(b.id + ''));
    for (const e of es) for (const t of [0.3, 0.4, 0.5]) { const P = W.pathPoint(e, t); if (P.bridge || P.y < 3) continue; __st.teleport(P.x, P.z, Math.atan2(P.tx, P.tz)); return; } });
  await sleep(1500); await p.keyboard.down('KeyW'); let vmax = 0, bad = false;
  for (let i = 0; i < 16; i++) { await sleep(500); const r = await p.evaluate(() => { const v = __st.veh; return { s: Math.hypot(v.v.x, v.v.z) * 3.6, ok: [v.p.x, v.p.y, v.p.z, v.v.x, v.v.y, v.v.z, v.rpm].every(Number.isFinite), spd: +document.getElementById('spd').textContent }; });
    vmax = Math.max(vmax, r.s); if (!r.ok || !Number.isFinite(r.spd)) bad = true; if (i === 15) await p.screenshot({ path: SH + 'power_10000hp_run.png' }); }
  await p.keyboard.up('KeyW');
  const spd = await p.evaluate(() => +document.getElementById('spd').textContent);
  check(!bad && vmax > 120 && vmax < 600, '10000 hp run: finite state, sane speed', `max ${vmax.toFixed(0)} km/h, readout ${spd}`);
  // --- sound editor: demo motor bench
  await p.mouse.click(420, 200); await sleep(2500); // gesture -> audio
  const ok = await p.evaluate(() => { const a = __st.audio; return a.active === 'enginesim' && !!(a.instance && a.instance.engine && a.instance.engine.motor); });
  check(ok, 'Engine Sim active with its motor model');
  await p.evaluate(() => { __st.editor.openPanel(); __st.editor.openSection('eng'); __st.editor.openSection('car'); }); await sleep(500);
  await p.evaluate(() => document.querySelector('#sndEd [data-seg=bmode][data-val=drive]').click()); await sleep(200);
  await p.keyboard.down('KeyW'); for (let i = 0; i < 40; i++) { await sleep(500); if (await p.evaluate(() => (__st.audio.test.tel || {}).gear >= 2)) break; } // headless fps: sim time runs slow
  const tb = await p.evaluate(() => { const t = __st.audio.test, o = t.tel || {}; return { mode: t.mode, gear: o.gear, kmh: Math.round(o.speedKmh || 0), rpm: Math.round(o.rpm || 0), tach: (document.querySelector('#sndEd [data-tach]') || {}).textContent, T: Math.round(__st.audio.telemetry.rpm) }; });
  check(tb.mode === 'drive' && tb.gear >= 2 && tb.kmh > 40 && tb.T === tb.rpm && /km\/h/.test(tb.tach), 'DRIVE (AUTO) bench: motor upshifts, rpm drives the sound, tach readout', JSON.stringify(tb));
  await p.evaluate(() => { document.getElementById('sndEd').scrollTop = 0; }); await sleep(300); await p.screenshot({ path: SH + 'sound_finetune.png' });
  await p.evaluate(() => { const s = document.getElementById('sndEd'); s.scrollTop = s.querySelector('details[data-sec=eng]').offsetTop - 40; }); await sleep(300); await p.screenshot({ path: SH + 'sound_finetune_sections.png' });
  await p.keyboard.up('KeyW');
  await p.keyboard.press('KeyN'); await sleep(200);
  check(await p.evaluate(() => __st.audio.test.mode === 'neutral' && __st.audio.instance.engine.motor.neutral), 'N toggles NEUTRAL REV (motor.setNeutral)');
  await p.keyboard.down('KeyW'); await sleep(2500);
  const lim = await p.evaluate(() => { const o = __st.audio.test.tel, c = __st.audio.instance.engine.config; return { rpm: Math.round(o.rpm), red: c.redline, lim: o.limiter }; });
  await p.keyboard.up('KeyW');
  check(lim.rpm > lim.red * 0.9 && lim.rpm < lim.red * 1.08, 'neutral rev hits the limiter at redline', JSON.stringify(lim));
  const num = await p.evaluate(() => { const n = document.querySelector('#sndEd [data-n=redline]'); n.value = '7777'; n.dispatchEvent(new Event('change')); return new Promise(r => setTimeout(() => r({ cfg: __st.audio.instance.getConfig().redline, range: +document.querySelector('#sndEd input[type=range][data-k=redline]').value }), 300)); });
  check(num.cfg === 7800 || num.cfg === 7777 || Math.abs(num.cfg - 7777) <= 50, 'numeric entry sets a slider value (REDLINE 7777)', JSON.stringify(num));
  await p.keyboard.press('KeyC'); await sleep(200);
  check(await p.evaluate(() => document.getElementById('sndEd').classList.contains('focus')), 'C hides the controls (demo togglePanel)');
  await p.keyboard.press('KeyC');
  await p.evaluate(() => __st.editor.close()); await sleep(300);
  check(await p.evaluate(() => !__st.audio.test.on && __st.audio.telemetry.turbo === undefined), 'closing the editor hands rpm back to the car');
  check(!errs.length, 'no page errors', errs.join(' | ').slice(0, 300));
  await b.close(); console.log(fail ? 'SOME FAILED' : 'ALL OK'); process.exit(fail ? 1 : 0);
})();
