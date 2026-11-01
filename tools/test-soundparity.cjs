// Static parity check: every control of the Engine Sim demo (/workspace/engine-sim/js/ui.js, or plugins/enginesim/demo-ui.js fallback)
// exists in the game's sound editor (js/sound-editor.js) with the same range, plus the demo's bench features (mode, pedals, keys, tach viz).
// usage: node tools/test-soundparity.cjs [path/to/demo/ui.js]
const fs = require('fs'), path = require('path');
const demoPath = process.argv[2] || '/workspace/engine-sim/js/ui.js';
if (!fs.existsSync(demoPath)) { console.log('SKIP demo source not found:', demoPath); process.exit(0); }
const demo = fs.readFileSync(demoPath, 'utf8'), game = fs.readFileSync(path.join(__dirname, '..', 'js', 'sound-editor.js'), 'utf8');
const audio = fs.readFileSync(path.join(__dirname, '..', 'js', 'engine-audio.js'), 'utf8');
let fail = false; const check = (ok, what, x = '') => { console.log((ok ? 'OK   ' : 'FAIL ') + what + (x ? '  ' + x : '')); if (!ok) fail = true; };
// demo sliders: this.slider('Label', value, min, max, step, fmt, (v) => lv('key'|setCyl('key'|live({ car: ... { key: v
const dS = [...demo.matchAll(/this\.slider\((`[^`]*`|'[^']*'),[^,]+,\s*(-?[\d.]+),\s*(-?[\d.]+|c\.cycle - 1),\s*([\d.]+),[^\n]*?(?:lv\('(\w+)'|setCyl\('(\w+)'|\{\s*(\w+):\s*v\s*\}\)|visualOffset = v)/g)]
  .map(m => ({ label: m[1].trim(), min: +m[2], max: m[3] === 'c.cycle - 1' ? 'cyc' : +m[3], step: +m[4], key: m[5] || (m[6] && 'c.' + m[6]) || (m[7] && 'car.' + m[7]) || 'visualOffset' }));
const gS = new Map([...game.matchAll(/sl\('([\w.]+)',\s*[^,]+,\s*(-?[\d.]+),\s*(?:cyc - 1|(-?[\d.]+)),\s*([\d.]+)/g)].map(m => [m[1], { min: +m[2], max: m[3] === undefined ? 'cyc' : +m[3], step: +m[4] }]));
check(dS.length >= 24, `parsed ${dS.length} demo sliders`);
for (const s of dS) { const g = gS.get(s.key);
  const same = g && g.min === s.min && (g.max === s.max || g.max === 'cyc') && g.step === s.step;
  check(same, `slider ${s.key} (${s.label}) ${s.min}..${s.max}/${s.step}`, g ? `game ${g.min}..${g.max}/${g.step}` : 'MISSING'); }
// demo selects / segmented buttons: config keys passed to apply({ key: ...
const dK = new Set([...demo.matchAll(/this\.apply\(\{\s*(\w+):/g)].map(m => m[1]).filter(k => !/^(cyl|firingOrder|manualFire)$/.test(k)));
for (const k of dK) check(new RegExp(`(sel|seg)\\('${k}'`).test(game) || new RegExp(`sl\\('${k}'`).test(game), `control ${k}`);
check(/sel\('layout'/.test(game) && /this\.select\('Layout'/.test(demo), 'control layout');
for (const k of ['shape']) check(game.includes(`sel('c.${k}'`), `per-cylinder ${k}`);
// buttons / features
const feats = [['preset picker', /data-preset/], ['firing order text + DEFAULT ORDER + RECOMPUTE', /data-fo[\s\S]*deforder[\s\S]*recompute/], ['APPLY TO ALL + CLEAR MISFIRES', /cylall[\s\S]*nomis/],
  ['EXPORT / IMPORT JSON', /data-act="export"[\s\S]*data-act="import"/], ['RENDER 6 s WAV', /RENDER 6 s WAV/], ['tap a cylinder in the diagram', /viz\.hits/],
  ['bench MODE NEUTRAL REV / DRIVE (AUTO)', /bmode[\s\S]*NEUTRAL REV[\s\S]*DRIVE \(AUTO\)/], ['GAS / BRAKE / NITRO pedals', /data-hold="rev">GAS[\s\S]*data-hold="brake"[\s\S]*data-hold="nitro"/],
  ['keys W/S/Shift/Space, N, C', /KeyW[\s\S]*Space[\s\S]*KeyN[\s\S]*KeyC/], ['full viz: diagram + tach + dial + nitro', /viz\.draw\(/], ['numeric entry on every slider', /data-n="\$\{k\}"/],
  ['collapsible sections', /<details data-sec/]];
for (const [n, re] of feats) check(re.test(game), n);
check(/motor\.step\(dt, \{ gas:[\s\S]*brake:[\s\S]*nitro/.test(audio) && /setNeutral/.test(audio), 'bench drives the demo MotorModel (engine-audio.js)');
// rotary: same counts as cylinder engines (engine-config countsFor)
(async () => { const cfgm = await import(path.join(__dirname, '..', 'plugins', 'enginesim', 'engine-config.js'));
  const c = cfgm.countsFor || (cfgm.configSchema && cfgm.configSchema.countsFor); if (c) { const r = c('rotary'), i = c('inline'); const all = [...new Set(['inline', 'v', 'boxer'].flatMap(l => c(l)))]; check(all.every(v => r.includes(v)) && Math.max(...r) === Math.max(...all), 'rotary allows the same counts as cylinder engines (1–16)', `rotary ${r.join(',')}`); }
  console.log(fail ? 'SOME FAILED' : 'ALL OK'); process.exit(fail ? 1 : 0); })();
