/* The Trump Force — a parody run-and-gun platformer.
   All sprites, tiles and audio are generated at run time: no image or sound assets. */
(() => {
'use strict';

// ============================================================ constants
const TS = 16, LH = 24;
let GRAV = 900; const JUMP_V = 330, RUN_V = 105, MAX_FALL = 420;
const STEP = 1 / 60;

// ============================================================ utilities
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const sign = v => v < 0 ? -1 : v > 0 ? 1 : 0;
const approach = (v, t, d) => v < t ? Math.min(v + d, t) : Math.max(v - d, t);
function mulberry32(a) {
  return function () {
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}
const rr = (a, b) => a + Math.random() * (b - a);
const ri = (a, b) => Math.floor(rr(a, b + 1));
const pick = arr => arr[Math.floor(Math.random() * arr.length)];
const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
const cxOf = e => e.x + e.w / 2, cyOf = e => e.y + e.h / 2;
function shade(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const r = clamp(Math.round((n >> 16 & 255) * f), 0, 255), g = clamp(Math.round((n >> 8 & 255) * f), 0, 255), b = clamp(Math.round((n & 255) * f), 0, 255);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
function mkCanvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function flipCanvas(src) {
  const c = mkCanvas(src.width, src.height), g = c.getContext('2d');
  g.translate(src.width, 0); g.scale(-1, 1); g.drawImage(src, 0, 0); return c;
}

// ============================================================ save
// v2 launch reset (2026-11-07): progress moved to a new key so every player starts again at
// mission 1 with no passports or upgrades. Only the sound preference carries over from v1.
const SAVE_KEY = 'ttf-save-v2', OLD_SAVE_KEY = 'ttf-save-v1';
// Bump RESET_EPOCH to wipe every player's progress on their next visit (sound setting is kept).
const RESET_EPOCH = 2;
let save = { unlocked: 1, muted: false, passports: 0, up: {} };
try {
  const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
  if (s && typeof s === 'object' && s.epoch === RESET_EPOCH) save = Object.assign(save, s);
  else if (s && typeof s === 'object') save.muted = !!s.muted;
  else {
    const old = JSON.parse(localStorage.getItem(OLD_SAVE_KEY) || 'null');
    if (old && typeof old === 'object') save.muted = !!old.muted;
  }
  localStorage.removeItem(OLD_SAVE_KEY);
} catch (e) { /* storage unavailable */ }
save.epoch = RESET_EPOCH;
save.unlocked = clamp(save.unlocked | 0 || 1, 1, 40);
save.passports = Math.max(0, save.passports | 0);
persist();
if (!save.up || typeof save.up !== 'object') save.up = {};
// Shop upgrades, bought with golden passports
const UPGRADES = [
  { id: 'armour', name: 'GOLDEN ARMOUR', desc: '+1 max heart per level', costs: [15, 35, 70] },
  { id: 'gun', name: 'GOLDEN GUNS', desc: '+35% damage, faster fire, gold guns for all', costs: [20, 45, 90] },
  { id: 'bombs', name: 'GOLDEN GRENADES', desc: '+1 bomb carried, bigger blasts', costs: [25, 60] },
  { id: 'lives', name: 'EXTRA TERMS', desc: '+1 life at the start of each level', costs: [30, 80] },
  { id: 'eagle', name: 'EAGLE ESCORT', desc: 'Eagles fly in with you on every drop', costs: [50] },
];
const upLvl = id => clamp(save.up[id] | 0, 0, UPGRADES.find(u => u.id === id).costs.length);
const MAXHP = () => 3 + upLvl('armour');
const MAXG = () => 5 + upLvl('bombs');
function persist() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } }

// ============================================================ audio (WebAudio synth + original march)
const Sound = (() => {
  let ac = null, master = null, sfxGain = null, musGain = null, noiseBuf = null;
  let musicTimer = null, nextT = 0, stepI = 0;
  const lastPlay = {};
  function init() {
    if (ac) { if (ac.state === 'suspended') ac.resume().catch(() => {}); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    try { ac = new AC(); } catch (e) { ac = null; return; }
    master = ac.createGain(); master.gain.value = save.muted ? 0 : 0.6; master.connect(ac.destination);
    sfxGain = ac.createGain(); sfxGain.gain.value = 0.55; sfxGain.connect(master);
    musGain = ac.createGain(); musGain.gain.value = 0.2; musGain.connect(master);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    startMusic();
  }
  function toneAt(t, freq, dur, type, vol, slideTo, dest) {
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + dur + 0.03);
  }
  function noiseAt(t, dur, vol, filt, ftype, slide, dest) {
    const s = ac.createBufferSource(); s.buffer = noiseBuf;
    const f = ac.createBiquadFilter(); f.type = ftype || 'lowpass'; f.frequency.setValueAtTime(filt, t);
    if (slide) f.frequency.exponentialRampToValueAtTime(slide, t + dur);
    const g = ac.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(dest); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.03);
  }
  const tone = (f, d, type = 'square', v = 0.3, sl = 0, w = 0) => toneAt(ac.currentTime + w, f, d, type, v, sl, sfxGain);
  const noise = (d, v = 0.4, filt = 1200, w = 0, ft = 'lowpass', sl = 0) => noiseAt(ac.currentTime + w, d, v, filt, ft, sl, sfxGain);
  const arp = (fs, d, type, v, gap) => fs.forEach((f, i) => tone(f, d, type, v, 0, i * gap));
  const SFX = {
    pistol() { tone(900, 0.07, 'square', 0.16, 320); noise(0.04, 0.12, 3200); },
    smg() { tone(720, 0.05, 'square', 0.1, 280); noise(0.03, 0.1, 2600); },
    rifle() { tone(320, 0.16, 'sawtooth', 0.2, 60); noise(0.14, 0.32, 2200); },
    shotgun() { noise(0.24, 0.5, 1600, 0, 'lowpass', 200); tone(160, 0.12, 'square', 0.18, 50); },
    enemyShot() { tone(520, 0.06, 'square', 0.07, 200); },
    jump() { tone(300, 0.12, 'square', 0.1, 640); },
    hurt() { tone(420, 0.25, 'sawtooth', 0.22, 80); },
    tile() { noise(0.06, 0.12, 900); },
    boom() { noise(0.7, 0.75, 1400, 0, 'lowpass', 80); tone(90, 0.5, 'sine', 0.5, 30); },
    toss() { tone(500, 0.1, 'triangle', 0.15, 250); },
    pickup() { arp([660, 880, 1320], 0.09, 'square', 0.12, 0.06); },
    rescue() { arp([523, 659, 784, 1047], 0.12, 'square', 0.14, 0.08); },
    flag() { arp([392, 523, 659, 784], 0.14, 'triangle', 0.22, 0.07); },
    bark() { tone(620, 0.06, 'square', 0.1, 300); tone(520, 0.08, 'square', 0.1, 250, 0.09); },
    eagle() { tone(1800, 0.25, 'sawtooth', 0.08, 900); tone(2100, 0.2, 'square', 0.04, 1200, 0.1); },
    plane() { noise(1.8, 0.22, 500, 0, 'bandpass', 1400); tone(110, 1.6, 'sawtooth', 0.04, 160); },
    jet() { noise(1.2, 0.25, 3000, 0, 'bandpass', 600); },
    fired() { arp([784, 659, 523, 392, 523, 784, 1047], 0.16, 'square', 0.16, 0.1); },
    alert() { tone(1200, 0.08, 'square', 0.06); },
    bossHit() { tone(150, 0.06, 'square', 0.1, 100); },
    die() { arp([400, 300, 200, 120], 0.2, 'square', 0.16, 0.12); },
    win() { arp([523, 659, 784, 659, 784, 1047], 0.15, 'square', 0.15, 0.11); },
    paper() { noise(0.1, 0.12, 4000, 0, 'highpass'); },
  };
  function play(name) {
    if (!ac || save.muted) return;
    const now = ac.currentTime;
    if (lastPlay[name] && now - lastPlay[name] < 0.035) return;
    lastPlay[name] = now;
    try { SFX[name] && SFX[name](); } catch (e) { /* ignore */ }
  }
  // An original, majestic 8-bar anthem in C major (not based on any existing tune):
  // filtered-brass lead doubled an octave down, sustained chord pads, timpani, march snare and cymbals.
  const MEL = [
    67, 0, 72, 0, 72, 74, 76, 0,
    77, 0, 0, 76, 74, 0, 72, 0,
    76, 0, 79, 0, 84, 0, 0, 0,
    83, 0, 81, 79, 74, 0, 0, 0,
    76, 0, 81, 0, 81, 83, 84, 0,
    84, 0, 81, 0, 77, 0, 79, 81,
    79, 0, 0, 77, 76, 0, 74, 0,
    72, 0, 0, 0, 0, 0, 0, 0,
  ];
  const CHORDS = [[60, 64, 67], [60, 65, 69], [60, 64, 67], [59, 62, 67], [57, 60, 64], [60, 65, 69], [59, 62, 67], [60, 64, 67]];
  const BASS = [36, 41, 36, 43, 45, 41, 43, 36];
  const STEP_LEN = 60 / 100 / 2;
  const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
  function brassAt(t, freq, dur, vol) {
    const o = ac.createOscillator(), o2 = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
    o.type = 'sawtooth'; o2.type = 'sawtooth'; o.frequency.setValueAtTime(freq, t); o2.frequency.setValueAtTime(freq * 1.006, t);
    f.type = 'lowpass'; f.Q.value = 2; f.frequency.setValueAtTime(500, t); f.frequency.linearRampToValueAtTime(2600, t + 0.06); f.frequency.exponentialRampToValueAtTime(1100, t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.03); g.gain.setValueAtTime(vol * 0.8, t + dur * 0.7); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(f); o2.connect(f); f.connect(g); g.connect(musGain);
    o.start(t); o2.start(t); o.stop(t + dur + 0.05); o2.stop(t + dur + 0.05);
  }
  function padAt(t, notes, dur, vol) {
    notes.forEach(n => {
      const o = ac.createOscillator(), f = ac.createBiquadFilter(), g = ac.createGain();
      o.type = 'sawtooth'; o.frequency.setValueAtTime(mtof(n), t);
      f.type = 'lowpass'; f.frequency.setValueAtTime(900, t);
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(vol, t + 0.25); g.gain.setValueAtTime(vol, t + dur - 0.2); g.gain.linearRampToValueAtTime(0.0001, t + dur);
      o.connect(f); f.connect(g); g.connect(musGain); o.start(t); o.stop(t + dur + 0.05);
    });
  }
  function timpAt(t, vol) { toneAt(t, 95, 0.45, 'sine', vol, 52, musGain); noiseAt(t, 0.08, vol * 0.3, 400, 'lowpass', 0, musGain); }
  function playStep(s, t) {
    const bar = s >> 3, i = s & 7;
    if (MEL[s]) {
      let hold = 1; while (hold < 8 && !MEL[(s + hold) % 64] && ((s + hold) & 7) !== 0) hold++;
      const dur = hold * STEP_LEN * 0.95;
      brassAt(t, mtof(MEL[s]), dur, 0.085);
      toneAt(t, mtof(MEL[s] - 12), dur, 'triangle', 0.12, 0, musGain);
    }
    if (i === 0) { padAt(t, CHORDS[bar], STEP_LEN * 8, 0.028); toneAt(t, mtof(BASS[bar]), STEP_LEN * 3.8, 'triangle', 0.4, 0, musGain); }
    if (i === 4) toneAt(t, mtof(BASS[bar] + 7), STEP_LEN * 3.8, 'triangle', 0.32, 0, musGain);
    if (i === 0 || i === 4) timpAt(t, 0.45);
    if (bar === 7 && i >= 4) { timpAt(t, 0.3); timpAt(t + STEP_LEN / 2, 0.3); }
    if (i === 2 || i === 6) noiseAt(t, 0.12, 0.16, 2500, 'highpass', 0, musGain);
    if ((bar === 3 || bar === 7) && i >= 6) for (let k = 0; k < 4; k++) noiseAt(t + k * STEP_LEN / 4, 0.06, 0.1, 2800, 'highpass', 0, musGain);
    if (i === 0 && (bar === 0 || bar === 4)) noiseAt(t, 1.6, 0.12, 6000, 'highpass', 0, musGain);
  }
  function startMusic() {
    if (!ac || musicTimer) return;
    nextT = ac.currentTime + 0.1; stepI = 0;
    musicTimer = setInterval(() => {
      if (!ac || ac.state !== 'running') return;
      if (nextT < ac.currentTime - 0.5) nextT = ac.currentTime + 0.05;
      while (nextT < ac.currentTime + 0.15) {
        try { playStep(stepI, nextT); } catch (e) { /* ignore */ }
        nextT += STEP_LEN; stepI = (stepI + 1) % 64;
      }
    }, 40);
  }
  function setMuted(m) {
    save.muted = m; persist();
    if (master) master.gain.setTargetAtTime(m ? 0 : 0.6, ac.currentTime, 0.02);
  }
  function setMusicLevel(v) { if (musGain) musGain.gain.setTargetAtTime(v, ac.currentTime, 0.1); }
  return { init, play, setMuted, setMusicLevel };
})();

// ============================================================ input
const keys = { left: 0, right: 0, up: 0, down: 0, jump: 0, fire: 0, bomb: 0 };
const input = { left: false, right: false, up: false, down: false, jump: false, fire: false, bomb: false, jumpPressed: false, bombPressed: false };
let prevJump = false, prevBomb = false;
const KEYMAP = {
  ArrowLeft: ['left'], KeyA: ['left'], ArrowRight: ['right'], KeyD: ['right'],
  ArrowUp: ['up', 'jump'], KeyW: ['up', 'jump'], ArrowDown: ['down'], KeyS: ['down'],
  Space: ['jump'], KeyJ: ['fire'], KeyX: ['fire'], KeyK: ['bomb'], KeyC: ['bomb'],
};
const touch = { stick: null, ptrs: new Map(), left: false, right: false, up: false, down: false, jump: false, fire: false, bomb: false };
function readInput() {
  input.left = !!(keys.left || touch.left);
  input.right = !!(keys.right || touch.right);
  input.up = !!(keys.up || touch.up);
  input.down = !!(keys.down || touch.down);
  input.jump = !!(keys.jump || touch.jump);
  input.fire = !!(keys.fire || touch.fire);
  input.bomb = !!(keys.bomb || touch.bomb);
  input.jumpPressed = input.jump && !prevJump;
  input.bombPressed = input.bomb && !prevBomb;
  prevJump = input.jump; prevBomb = input.bomb;
}

// ============================================================ characters & sprites
// Weapons: rate (s), dmg, speed, tile damage, pellets, spread, life, pierce, sound
const WEAPONS = {
  pistol: { rate: 0.17, dmg: 1, speed: 340, tdmg: 1, pellets: 1, spread: 0, life: 0.9, pierce: 0, snd: 'pistol', col: '#ffd23f' },
  smg: { rate: 0.09, dmg: 1, speed: 360, tdmg: 1, pellets: 1, spread: 28, life: 0.75, pierce: 0, snd: 'smg', col: '#fff3a0' },
  rifle: { rate: 0.5, dmg: 3, speed: 520, tdmg: 2, pellets: 1, spread: 0, life: 0.9, pierce: 3, snd: 'rifle', col: '#ffffff' },
  shotgun: { rate: 0.55, dmg: 1, speed: 300, tdmg: 1, pellets: 6, spread: 120, life: 0.3, pierce: 0, snd: 'shotgun', col: '#ffcf70' },
  laser: { rate: 0.14, dmg: 1.5, speed: 620, tdmg: 1, pellets: 1, spread: 0, life: 0.6, pierce: 2, snd: 'smg', col: '#3ad0ff' },
  assault: { rate: 0.12, dmg: 1, speed: 400, tdmg: 1, pellets: 1, spread: 10, life: 0.85, pierce: 0, snd: 'smg', col: '#ffe9a0' },
};
const CHARS = {
  trump: { name: 'DONALD', skin: '#f0a35e', skinD: '#c97c3c', hair: '#e9b631', hairH: '#ffe07a', jacket: '#1f3a8a', shirt: '#ffffff', tie: '#d61f2b', pants: '#1a2f73', boots: '#141414', gun: '#ffd23f', head: 'trump', weapon: 'pistol', special: 'grenade' },
  barron: { name: 'BARRON', skin: '#f3c9a5', skinD: '#d5a07a', hair: '#7a5232', jacket: '#1b2440', shirt: '#ffffff', tie: '#2d6fd6', pants: '#161d36', boots: '#111', gun: '#5a5a5a', head: 'barron', tall: 1, weapon: 'smg', special: 'suitcase' },
  donjr: { name: 'DON JR', skin: '#efb88f', skinD: '#c98f66', hair: '#3a2a1e', beard: '#3a2a1e', jacket: '#5d6b2f', shirt: '#c9b48a', pants: '#4a4030', boots: '#3b2a1a', gun: '#7a5232', head: 'donjr', weapon: 'rifle', special: 'grenade' },
  eric: { name: 'ERIC', skin: '#f2c2a0', skinD: '#d39d78', hair: '#b58a5a', jacket: '#5a5f6b', shirt: '#ffffff', tie: '#7a1f2b', pants: '#3f434c', boots: '#111', gun: '#444', head: 'eric', weapon: 'shotgun', special: 'grenade' },
  hegseth: { name: 'PETE', skin: '#e9b48a', skinD: '#c48d63', hair: '#8a6a44', jacket: '#5b6b3a', shirt: '#4c5a30', pants: '#4f5d33', boots: '#3b2a1a', gun: '#2e2e2e', head: 'hegseth', weapon: 'assault', special: 'airstrike' },
  // bosses (caricatures — defeated comedically, never killed)
  mamdani: { skin: '#c08a5c', skinD: '#9a6a42', hair: '#1e1712', beard: '#2a211a', jacket: '#3b3f4a', shirt: '#e8e8e8', pants: '#2c2f38', boots: '#111', gun: null, head: 'mamdani' },
  harris: { skin: '#b07a52', skinD: '#8c5c38', hair: '#241a14', jacket: '#6b3fa0', shirt: '#f5efe0', pants: '#4f2c78', boots: '#111', gun: null, head: 'harris' },
  clinton: { skin: '#f1c9a8', skinD: '#d5a585', hair: '#e8c56a', hairH: '#fff0b0', jacket: '#2a7d8c', shirt: '#f0f0f0', pants: '#1f5f6b', boots: '#111', gun: null, head: 'clinton' },
  obama: { skin: '#7a4e2e', skinD: '#5e3a20', hair: '#2a2a2a', hairH: '#8a8a8a', jacket: '#c8a874', shirt: '#ffffff', tie: '#3b5aa8', pants: '#a88c5c', boots: '#3b2a1a', gun: null, head: 'obama' },
  biden: { skin: '#f1c4a4', skinD: '#d39f7e', hair: '#f4f4f4', hairH: '#ffffff', jacket: '#1e2a52', shirt: '#ffffff', tie: '#3c6fd1', pants: '#18213f', boots: '#111', gun: null, head: 'biden' },
  // henchmen
  tbot: { name: 'T-BOT', skin: '#e8e8ee', skinD: '#b0b0b8', mask: '#1a1a1e', jacket: '#f0f0f4', shirt: '#1a1a1e', pants: '#d8d8de', boots: '#333', gun: '#3ad0ff', head: 'robot', weapon: 'laser', special: 'grenade' },
  robot: { skin: '#8a8f99', skinD: '#6a6f79', mask: '#2a2e36', jacket: '#6a707a', shirt: '#c8102e', pants: '#4a4f58', boots: '#222', gun: '#ff3a3a', head: 'robot' },
  soldier: { skin: '#d9b08a', skinD: '#b48c68', hair: '#1a1a1a', mask: '#3f4a2a', jacket: '#4f5a3a', shirt: '#3a4430', pants: '#3f4830', boots: '#1a1a1a', gun: '#2a2a2a', head: 'helmet' },
  goon: { skin: '#d9a07a', skinD: '#b47c58', mask: '#26262a', jacket: '#4a5530', shirt: '#3a4426', pants: '#3a3a2a', boots: '#1a1a1a', gun: '#2a2a2a', head: 'mask' },
  rocket: { skin: '#d9a07a', skinD: '#b47c58', mask: '#3a2a1a', jacket: '#6b4a2a', shirt: '#5a3c20', pants: '#3a3020', boots: '#1a1a1a', gun: '#2a2a2a', head: 'mask', tube: 1 },
  anchorbot: { skin: '#9aa2b0', skinD: '#6a7280', mask: '#3a3f4a', jacket: '#2a3a7a', shirt: '#ffffff', tie: '#c8102e', pants: '#1a2450', boots: '#111', gun: null, head: 'tv' },
  generalissimo: { skin: '#e2b48c', skinD: '#c08e66', mask: '#3a4a2a', hair: '#2a2420', jacket: '#4a5a3a', shirt: '#e8e0c8', pants: '#3a4630', boots: '#111', gun: null, head: 'general', medals: 1 },
  agent: { skin: '#e9c4a4', skinD: '#c49c7c', hair: '#1a1a1a', jacket: '#16161a', shirt: '#ffffff', tie: '#111111', pants: '#16161a', boots: '#000', gun: null, head: 'agent' },
  heavy: { skin: '#d9a07a', skinD: '#b47c58', mask: '#2a1414', jacket: '#6a2a2a', shirt: '#4a1a1a', pants: '#2a2a30', boots: '#111', gun: '#3a3a3a', head: 'mask', heavy: 1 },
};
const FACE = [
  '.........',
  '..sssss..',
  '.sssssss.',
  '.ssssses.',
  '.dsssssss',
  '.sssssmm.',
  '..ssssss.',
  '...ddd...',
];
const HAIR = {
  trump: ['..HHHHHH.', '.HHHHHHHH', '.hhH..HHH', '.hh......', '.h.......'],
  barron: ['..hhhhh..', '.hhhhhhh.', '.hhhh.hh.', '.hh......', '.h.......'],
  donjr: ['..hhhhh..', '.hhhhhhh.', '.hhh.....', '.hh......', '.h.......', '..b.bb...', '..bbbbbb.', '...bbb...'],
  eric: ['..hhhhh..', '.hhhhHhh.', '.hhh..hh.', '.hh......', '.h.......'],
  hegseth: ['...hhhhh.', '..hhhhhhh', '.hhhhh.hh', '.hh......', '.h.......'],
  mamdani: ['..hhhhh..', '.hhhhhhh.', '.hhhhh.h.', '.hh......', '.h.......', '.b..b....', '..bbbbbb.', '...bbb...'],
  harris: ['..hhhhh..', '.hhhhhhh.', 'hhhhh.hh.', 'hhh......', 'hh.......', 'hh.......', 'hhh......', '.hh......'],
  clinton: ['..HHHHH..', '.HHHHHHH.', 'HHHHHHHH.', 'HHh......', 'HH.......', 'HH.......', '.H.......'],
  obama: ['.........', '..hhhhh..', '.hhhhhhh.', '.h.......'],
  biden: ['.........', '..hhhh...', '.hh......', '.h...GggG'],
  robot: ['..kkkkk..', '.kkkkkkk.', '.kkkkkkkk', '.kkGGGGGk', '.kkkkkkkk', '.kkkkkkk.', '..kkkkkk.'],
  helmet: ['..kkkkk..', '.kkkkkkk.', 'kkkkkkkkk', '.h.......'],
  general: ['..kkkkk..', 'kkkkGkkkk', '.kkkkkkkkk'.slice(0, 9), '.h..ggggg', '.h.......'],
  tv: ['..G...G..', 'kkkkkkkkk', 'kgggggggk', 'kgwgggwgk', 'kgggggggk', 'kggwwwggk', 'kkkkkkkkk', '...kkk...'],
  agent: ['..hhhhh..', '.hhhhhhh.', '.hh......', '.h..ggggg', '.h.......', '.g.......'],
  mask: ['..kkkkk..', '.kkkkkkk.', '.kkkkkkk.', '.kkkkwek.', '.kkkkkkkk', '.kkkkkkk.', '..kkkkkk.'],
};
function paletteFor(p) {
  return {
    s: p.skin, d: p.skinD, e: '#111111', w: '#ffffff', m: '#8a3b2b',
    h: p.hair || '#333', H: p.hairH || (p.hair ? shade(p.hair, 1.25) : '#555'),
    b: p.beard || p.hair || '#333', k: p.mask || '#222', g: '#151515', G: '#d4af37',
  };
}
function paintHead(g, p, ox, oy) {
  const pal = paletteFor(p);
  const over = HAIR[p.head] || [];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 9; x++) {
    let ch = FACE[y][x];
    const o = over[y] && over[y][x];
    if (o && o !== '.') ch = o;
    if (ch === '.') continue;
    g.fillStyle = pal[ch] || '#f0f';
    g.fillRect(ox + x, oy + y, 1, 1);
  }
}
function makeHead(p) { const c = mkCanvas(9, 8); paintHead(c.getContext('2d'), p, 0, 0); return c; }

const LEGS = {
  stand: [[5, 0], [8, 0]], run0: [[3, 0], [10, 1]], run1: [[6, 1], [8, 0]],
  run2: [[9, 0], [4, 1]], run3: [[7, 0], [6, 1]], jump: [[4, 0], [9, 2]], slide: [[6, 0], [9, 1]], hurt: [[4, 1], [9, 1]],
};
const FRAMES = Object.keys(LEGS);
function makeHuman(p, frame) {
  const tall = p.tall ? 2 : 0, wide = p.heavy ? 2 : 0;
  const torsoH = 5 + tall, legH = 4 + tall;
  const w = 18, h = 8 + torsoH + legH + 1;
  const c = mkCanvas(w, h), g = c.getContext('2d');
  const R = (x, y, ww, hh, col) => { if (!col) return; g.fillStyle = col; g.fillRect(x, y, ww, hh); };
  const ly = 8 + torsoH;
  // legs (back leg darker)
  LEGS[frame].forEach(([lx, lift], i) => {
    const col = i === 0 ? shade(p.pants, 0.75) : p.pants;
    R(lx, ly, 2 + (wide ? 1 : 0), legH - lift, col);
    R(lx, ly + legH - lift, 3 + (wide ? 1 : 0), 1, p.boots);
  });
  // rocket tube behind
  if (p.tube) { R(1, 7, 11, 3, '#4b5a3a'); R(0, 7, 1, 3, '#222'); }
  // torso
  R(4, 8, 7 + wide, torsoH, p.jacket);
  R(4, 8, 1, torsoH, shade(p.jacket, 0.75));
  R(8 + wide, 8, 2, 2, p.shirt);
  if (p.tie) R(8 + wide, 9, 1, torsoH - 2, p.tie);
  R(4, 8 + torsoH - 1, 7 + wide, 1, shade(p.jacket, 0.8));
  // arm + gun
  if (frame === 'hurt') {
    R(7, 6, 2, 3, p.jacket); R(7, 5, 2, 1, p.skin);
  } else if (p.gun) {
    R(7 + wide, 10, 4, 2, shade(p.jacket, 0.9));
    R(10 + wide, 10, 2, 2, p.skin);
    if (p.heavy) { R(10, 9, 8, 3, p.gun); R(16, 10, 2, 1, '#111'); }
    else { R(11 + wide, 9, 5, 2, p.gun); R(11 + wide, 11, 1, 1, p.gun); R(15 + wide, 9, 1, 1, shade(p.gun, 0.6)); }
  } else {
    // bosses: arm forward, empty-handed (they throw things)
    R(7, 10, 4, 2, shade(p.jacket, 0.9)); R(11, 10, 2, 2, p.skin);
  }
  if (p.tube) { R(9, 7, 6, 3, '#4b5a3a'); R(15, 7, 2, 3, '#222'); }
  if (p.medals) { R(5, 9, 1, 1, '#ffd23f'); R(6, 10, 1, 1, '#c8102e'); R(5, 11, 1, 1, '#ffd23f'); R(4, 8, 7, 1, '#d4af37'); R(9, 9, 1, 3, '#c8102e'); }
  if (p.armour) { R(4, 8, 3, 2, '#ffd23f'); R(9, 8, 2, 1, '#ffd23f'); R(4, 8 + torsoH - 1, 7 + wide, 1, '#d4af37'); if (p.armour > 2) R(5, 10, 2, 2, '#f5c400'); }
  paintHead(g, p, 3, 0);
  return c;
}
const SPR = {};
function buildCharSprites(key) {
  const p = CHARS[key], set = {};
  FRAMES.forEach(f => { const r = makeHuman(p, f); set[f] = { r, l: flipCanvas(r) }; });
  set.head = makeHead(p); set.headL = flipCanvas(set.head);
  SPR[key] = set;
}
Object.keys(CHARS).forEach(buildCharSprites);
const PLAYABLE = ['trump', 'barron', 'donjr', 'eric', 'hegseth', 'tbot'];
const BASE_GUN = {}; PLAYABLE.forEach(k => { BASE_GUN[k] = CHARS[k].gun; });
function applyUpgradeLooks() {
  PLAYABLE.forEach(k => { CHARS[k].armour = upLvl('armour'); CHARS[k].gun = upLvl('gun') ? '#ffd23f' : BASE_GUN[k]; buildCharSprites(k); });
}
applyUpgradeLooks();

function spriteFrom(w, h, fn) { const r = mkCanvas(w, h); fn(r.getContext('2d'), (x, y, ww, hh, c) => { const g = r.getContext('2d'); g.fillStyle = c; g.fillRect(x, y, ww, hh); }); return { r, l: flipCanvas(r) }; }

// dog
SPR.dog = {};
['run0', 'run1'].forEach((f, i) => {
  SPR.dog[f] = spriteFrom(15, 10, (g, R) => {
    R(2, 3, 9, 4, '#7a5a3a'); R(2, 6, 9, 1, '#5e432a');
    R(10, 1, 4, 4, '#7a5a3a'); R(13, 3, 2, 2, '#4e3520'); R(10, 0, 2, 2, '#4e3520');
    R(12, 2, 1, 1, '#000'); R(14, 3, 1, 1, '#000'); R(9, 3, 1, 4, '#c22');
    R(0, 2 + i, 2, 1, '#7a5a3a');
    if (i === 0) { R(2, 7, 2, 3, '#5e432a'); R(9, 7, 2, 3, '#5e432a'); }
    else { R(4, 7, 2, 3, '#5e432a'); R(7, 7, 2, 3, '#5e432a'); }
  });
});
SPR.dog.stand = SPR.dog.run0;
SPR.diver = { stand: spriteFrom(16, 8, (g, R) => { R(2, 2, 10, 5, '#1a1a22'); R(11, 1, 4, 5, '#1a1a22'); R(12, 2, 3, 2, '#9fd8ff'); R(0, 3, 3, 3, '#ffd23f'); R(3, 1, 4, 1, '#ffd23f'); R(9, 6, 6, 1, '#555'); R(14, 6, 2, 1, '#888'); }) };
SPR.diver.hurt = SPR.diver.stand;
// turret
SPR.turret = { stand: spriteFrom(18, 12, (g, R) => {
  R(1, 8, 14, 4, '#4a4f58'); R(1, 8, 14, 1, '#6a707a'); R(3, 3, 9, 6, '#6a707a'); R(3, 3, 9, 1, '#8a909a');
  R(11, 5, 7, 2, '#2a2a2a'); R(5, 4, 2, 1, '#ff3333'); R(2, 11, 12, 1, '#2e3238');
}) };
// eagle
SPR.eagle = {};
['up', 'down'].forEach(f => {
  SPR.eagle[f] = spriteFrom(15, 10, (g, R) => {
    R(3, 4, 7, 3, '#5a3a1e'); R(10, 3, 3, 3, '#ffffff'); R(13, 4, 2, 1, '#f5b400'); R(11, 4, 1, 1, '#000');
    R(0, 4, 3, 2, '#ffffff'); R(5, 7, 1, 2, '#f5b400'); R(8, 7, 1, 2, '#f5b400');
    if (f === 'up') { R(4, 0, 5, 4, '#4a2e16'); R(5, 0, 3, 1, '#6a4626'); }
    else { R(4, 6, 6, 3, '#4a2e16'); R(3, 8, 3, 2, '#4a2e16'); }
  });
});
// jet (Hegseth airstrike)
SPR.jet = spriteFrom(28, 9, (g, R) => {
  R(2, 4, 22, 3, '#8a95a5'); R(22, 4, 4, 2, '#8a95a5'); R(26, 5, 2, 1, '#5a6575');
  R(18, 3, 4, 2, '#9fd8ff'); R(1, 0, 4, 5, '#6a7585'); R(9, 6, 9, 2, '#6a7585'); R(0, 4, 2, 2, '#ff9a30');
  R(4, 1, 2, 1, '#c8102e'); R(4, 2, 2, 1, '#ffffff');
});
// Trump Force One
const PLANE = (() => {
  const r = mkCanvas(110, 34), g = r.getContext('2d');
  const R = (x, y, w, h, c) => { g.fillStyle = c; g.fillRect(x, y, w, h); };
  R(14, 9, 82, 9, '#f4f4f4'); R(14, 18, 82, 7, '#1c3f8f'); R(14, 17, 82, 1, '#c8102e');
  R(96, 11, 6, 13, '#f4f4f4'); R(96, 18, 6, 6, '#1c3f8f'); R(102, 14, 4, 9, '#e8e8e8'); R(102, 19, 4, 4, '#1c3f8f'); R(106, 17, 2, 5, '#cfcfcf');
  R(100, 12, 4, 3, '#2a3a5a');
  for (let x = 22; x < 92; x += 4) R(x, 12, 2, 2, '#2a3a5a');
  R(4, 0, 16, 9, '#1c3f8f'); R(6, 9, 12, 2, '#1c3f8f');
  R(7, 1, 6, 4, '#ffffff'); for (let i = 0; i < 4; i++) R(7, 1 + i, 6, 1, i % 2 ? '#ffffff' : '#c8102e'); R(7, 1, 3, 2, '#1c3f8f');
  R(2, 14, 16, 3, '#cfd5e0');
  R(44, 21, 26, 4, '#cfd5e0'); R(40, 25, 34, 3, '#b8c0cc'); R(48, 27, 10, 4, '#7a8290'); R(62, 27, 10, 4, '#7a8290');
  R(48, 30, 3, 1, '#ff9a30'); R(62, 30, 3, 1, '#ff9a30');
  R(30, 10, 40, 1, '#d4af37');
  return { r, l: flipCanvas(r) };
})();
// pickups
const PICK = {
  suitcase: spriteFrom(12, 11, (g, R) => { R(4, 0, 4, 1, '#3a2010'); R(3, 1, 1, 2, '#3a2010'); R(8, 1, 1, 2, '#3a2010'); R(0, 3, 12, 8, '#8a5228'); R(0, 3, 12, 1, '#a86a38'); R(3, 3, 1, 8, '#4a2a12'); R(8, 3, 1, 8, '#4a2a12'); R(5, 6, 2, 2, '#ffd23f'); }),
  passport: spriteFrom(10, 12, (g, R) => { R(0, 0, 10, 12, '#d4a017'); R(1, 1, 8, 10, '#f5c400'); R(3, 3, 4, 3, '#8a5a10'); R(2, 4, 1, 1, '#8a5a10'); R(7, 4, 1, 1, '#8a5a10'); R(4, 6, 2, 1, '#8a5a10'); R(2, 8, 6, 1, '#b8860b'); R(1, 1, 8, 1, '#fff6c0'); }),
  maga: spriteFrom(12, 9, (g, R) => { R(2, 1, 8, 5, '#c8102e'); R(3, 0, 6, 1, '#c8102e'); R(0, 6, 12, 2, '#a00c24'); R(8, 6, 4, 1, '#c8102e'); R(3, 2, 6, 2, '#ffffff'); R(4, 3, 1, 1, '#c8102e'); R(6, 3, 1, 1, '#c8102e'); }),
  coke: spriteFrom(7, 12, (g, R) => { R(1, 1, 5, 11, '#c8c8cc'); R(1, 0, 5, 1, '#9a9aa0'); R(1, 3, 5, 6, '#e8e8ec'); R(1, 5, 5, 2, '#c8102e'); R(2, 1, 1, 10, '#ffffff'); }),
  tariff: spriteFrom(12, 11, (g, R) => { R(0, 0, 12, 11, '#1c3f8f'); R(1, 1, 10, 9, '#f4f0d0'); R(2, 2, 8, 2, '#c8102e'); R(2, 5, 8, 1, '#555'); R(2, 7, 6, 1, '#555'); R(8, 6, 3, 3, '#c8102e'); }),
  wallkit: spriteFrom(12, 11, (g, R) => { R(0, 2, 12, 9, '#9a4a32'); for (let y = 2; y < 11; y += 3) R(0, y + 2, 12, 1, '#5a2a1a'); R(5, 2, 1, 2, '#5a2a1a'); R(2, 5, 1, 2, '#5a2a1a'); R(8, 5, 1, 2, '#5a2a1a'); R(0, 0, 12, 2, '#d4af37'); }),
  gold: spriteFrom(12, 7, (g, R) => { R(1, 2, 10, 5, '#d4a017'); R(2, 1, 8, 1, '#ffe07a'); R(2, 2, 8, 2, '#f5c400'); R(3, 2, 3, 1, '#fff6c0'); }),
  eagles: spriteFrom(12, 12, (g, R) => { R(2, 0, 8, 12, '#d4af37'); R(0, 2, 12, 8, '#d4af37'); R(1, 1, 10, 10, '#f5c400'); R(3, 4, 6, 3, '#5a3a1e'); R(7, 3, 3, 2, '#fff'); R(1, 3, 3, 2, '#5a3a1e'); R(9, 4, 2, 1, '#f08a00'); }),
  airstrike: spriteFrom(12, 12, (g, R) => { R(9, 0, 1, 4, '#222'); R(1, 3, 10, 9, '#4b5a3a'); R(1, 3, 10, 1, '#6a7a4a'); R(2, 5, 4, 4, '#2a3220'); R(7, 5, 3, 1, '#c8102e'); R(7, 7, 3, 1, '#ffffff'); R(7, 9, 3, 1, '#1c3f8f'); }),
  burger: spriteFrom(12, 10, (g, R) => { R(1, 0, 10, 3, '#d9932f'); R(0, 2, 12, 1, '#e0a040'); R(0, 3, 12, 1, '#3c9a3c'); R(0, 4, 12, 1, '#f5c400'); R(0, 5, 12, 2, '#5a3010'); R(1, 7, 10, 3, '#d9932f'); R(3, 1, 1, 1, '#fff6d0'); R(7, 1, 1, 1, '#fff6d0'); }),
  grenade: spriteFrom(10, 10, (g, R) => { R(3, 0, 4, 2, '#888'); R(6, 1, 3, 1, '#aaa'); R(1, 2, 8, 8, '#3f5a2a'); R(1, 4, 8, 1, '#2a3e1c'); R(1, 7, 8, 1, '#2a3e1c'); R(2, 3, 2, 2, '#6a8a4a'); }),
};
const GRENADE_SPR = spriteFrom(5, 5, (g, R) => { R(0, 1, 5, 4, '#3f5a2a'); R(1, 0, 3, 1, '#888'); R(1, 2, 1, 1, '#6a8a4a'); });
const SUITCASE_SPR = spriteFrom(9, 8, (g, R) => { R(3, 0, 3, 1, '#3a2010'); R(0, 2, 9, 6, '#8a5228'); R(2, 2, 1, 6, '#4a2a12'); R(6, 2, 1, 6, '#4a2a12'); R(4, 4, 1, 1, '#ffd23f'); });

// boss projectiles (all silly, non-violent props)
const PROJ = {
  notice: spriteFrom(9, 10, (g, R) => { R(0, 0, 9, 10, '#f4f4ea'); R(1, 1, 7, 2, '#c8102e'); R(1, 4, 7, 1, '#888'); R(1, 6, 6, 1, '#888'); R(1, 8, 5, 1, '#888'); }),
  coconut: spriteFrom(9, 9, (g, R) => { R(1, 0, 7, 9, '#6a4424'); R(0, 1, 9, 7, '#6a4424'); R(2, 1, 3, 2, '#8a6034'); R(3, 4, 1, 1, '#2a1a0a'); R(5, 4, 1, 1, '#2a1a0a'); R(4, 6, 1, 1, '#2a1a0a'); }),
  letter: spriteFrom(7, 8, (g, R) => { R(0, 0, 7, 8, '#ffe35a'); R(1, 1, 5, 6, '#c8102e'); R(2, 2, 3, 4, '#ffe35a'); }),
  email: spriteFrom(11, 8, (g, R) => { R(0, 0, 11, 8, '#ffffff'); R(0, 0, 11, 1, '#9aa'); R(1, 1, 2, 1, '#9aa'); R(3, 2, 2, 1, '#9aa'); R(5, 3, 1, 1, '#9aa'); R(6, 2, 2, 1, '#9aa'); R(8, 1, 2, 1, '#9aa'); R(4, 5, 3, 2, '#c8102e'); }),
  sign: spriteFrom(14, 9, (g, R) => { R(0, 0, 14, 9, '#1c3f8f'); R(1, 1, 12, 7, '#f4f4f4'); R(2, 2, 2, 5, '#c8102e'); R(5, 2, 2, 5, '#c8102e'); R(8, 2, 2, 5, '#c8102e'); R(11, 2, 1, 5, '#c8102e'); }),
  icecream: spriteFrom(8, 12, (g, R) => { R(1, 0, 6, 5, '#ffd0e0'); R(0, 1, 8, 4, '#ffb6d0'); R(2, 1, 2, 1, '#fff'); R(1, 5, 6, 2, '#d9a050'); R(2, 7, 4, 2, '#c08a40'); R(3, 9, 2, 3, '#b07a30'); }),
  shades: spriteFrom(12, 5, (g, R) => { R(0, 0, 12, 1, '#d4af37'); R(0, 1, 5, 4, '#1a1a1a'); R(7, 1, 5, 4, '#1a1a1a'); R(5, 1, 2, 1, '#d4af37'); R(1, 1, 2, 1, '#666'); R(8, 1, 2, 1, '#666'); }),
  tape: spriteFrom(16, 4, (g, R) => { R(0, 0, 16, 4, '#c8102e'); R(0, 1, 16, 1, '#ff5a5a'); R(3, 0, 1, 4, '#8a0a1e'); R(9, 0, 1, 4, '#8a0a1e'); }),
  medal: spriteFrom(7, 9, (g, R) => { R(2, 0, 3, 3, '#c8102e'); R(1, 3, 5, 5, '#d4af37'); R(2, 4, 3, 3, '#ffe07a'); }),
  fake: spriteFrom(14, 10, (g, R) => { R(0, 0, 14, 10, '#f4f4ea'); R(1, 1, 12, 3, '#111'); R(2, 2, 2, 1, '#fff'); R(5, 2, 2, 1, '#fff'); R(8, 2, 2, 1, '#fff'); R(1, 5, 5, 4, '#888'); R(7, 5, 6, 1, '#888'); R(7, 7, 6, 1, '#888'); }),
  fireball: spriteFrom(9, 9, (g, R) => { R(2, 0, 5, 9, '#ff6a20'); R(0, 2, 9, 5, '#ff6a20'); R(2, 2, 5, 5, '#ffd23f'); R(3, 3, 3, 3, '#fff6c0'); }),
  drum: spriteFrom(10, 12, (g, R) => { R(0, 0, 10, 12, '#2a2a2a'); R(0, 2, 10, 1, '#555'); R(0, 9, 10, 1, '#555'); R(1, 0, 2, 12, '#444'); R(3, 4, 4, 4, '#ffd23f'); R(4, 5, 2, 2, '#2a2a2a'); }),
  mic: spriteFrom(6, 11, (g, R) => { R(1, 0, 4, 4, '#3a3a3a'); R(2, 1, 1, 1, '#888'); R(2, 4, 2, 7, '#c8102e'); R(1, 4, 4, 1, '#d4af37'); }),
  redact: spriteFrom(14, 5, (g, R) => { R(0, 0, 14, 5, '#0a0a0a'); R(1, 1, 3, 1, '#333'); }),
  ink: spriteFrom(9, 9, (g, R) => { R(2, 0, 5, 9, '#2a1a40'); R(0, 2, 9, 5, '#2a1a40'); R(2, 2, 2, 2, '#6a4aa0'); }),
  teleprompter: spriteFrom(12, 10, (g, R) => { R(0, 0, 12, 8, '#222'); R(1, 1, 10, 6, '#3a6ab0'); R(2, 2, 8, 1, '#fff'); R(2, 4, 6, 1, '#fff'); R(5, 8, 2, 2, '#555'); }),
  rocket: spriteFrom(10, 4, (g, R) => { R(0, 1, 8, 2, '#8a8f99'); R(8, 1, 2, 2, '#c8102e'); R(0, 0, 2, 4, '#5a5f69'); }),
};

// ============================================================ themes & tiles
const T = { E: 0, DIRT: 1, STONE: 2, STEEL: 3, CRATE: 4, BARREL: 5, PLANK: 6, BRICK: 7, POLE: 8 };
const TILE_HP = [0, 2, 5, 255, 1, 1, 2, 3, 1];
const SOLID = [0, 1, 1, 1, 1, 1, 0, 1, 0];
const THEMES = {
  beach: { sky: ['#4fb8f0', '#c4f0ff'], top: '#f2d891', dirt: '#d9b56a', stone: '#8f8a80', far: '#7fb7d9', near: '#2e7f4a', bg: 'palms', sea: '#2a8fd0' },
  jungle: { sky: ['#3f8f6a', '#b9e8a8'], top: '#4caf3a', dirt: '#6b4a2b', stone: '#6d7466', far: '#2f6b45', near: '#1d4a2e', bg: 'jungle' },
  village: { sky: ['#f08a4a', '#ffdca0'], top: '#6aa83a', dirt: '#7a5636', stone: '#7d7a70', far: '#c07a50', near: '#5a3a2a', bg: 'huts' },
  desert: { sky: ['#f0a850', '#fff0c0'], top: '#f0c878', dirt: '#d29a52', stone: '#b08a62', far: '#e8b070', near: '#b8743a', bg: 'dunes' },
  fortress: { sky: ['#8a3a5a', '#f0a070'], top: '#e0b070', dirt: '#b88048', stone: '#9a7a5a', far: '#b06a5a', near: '#6a3a3a', bg: 'dunes' },
  snow: { sky: ['#8fb8e0', '#eef6ff'], top: '#f6fbff', dirt: '#7d8aa0', stone: '#9aa4b4', far: '#c8d8ec', near: '#5a7a6a', bg: 'mountains', snow: true },
  snowbase: { sky: ['#5c6a80', '#c0cad8'], top: '#eef4fa', dirt: '#6a7488', stone: '#8a94a4', far: '#9aa8bc', near: '#3a4a50', bg: 'mountains', snow: true },
  city: { sky: ['#060a22', '#262d60'], top: '#5a606c', dirt: '#3c4048', stone: '#5f6570', far: '#1a2048', near: '#0e1230', bg: 'city', stars: true },
  swamp: { sky: ['#0a1610', '#22402c'], top: '#4a7a2a', dirt: '#33402a', stone: '#4a5248', far: '#14261a', near: '#0c1810', bg: 'cave', ceiling: true },
  final: { sky: ['#24082a', '#b02a3a'], top: '#5a7a2a', dirt: '#3a2e22', stone: '#4e4a50', far: '#4a1838', near: '#1a0c18', bg: 'swampcity', stars: true, props: ['toilet', 'sign'] },
  // ---- v2 themes
  golf: { sky: ['#6cc4ff', '#d8f4ff'], top: '#5ccf4a', dirt: '#e8d498', stone: '#9a9488', far: '#8fd07a', near: '#3f9a3a', bg: 'golf', kinds: ['green', 'green'], props: ['pin', 'cart', 'toilet'] },
  tower: { sky: ['#3a6ab0', '#b8d8f8'], top: '#d4af37', dirt: '#3a3a44', stone: '#55555f', far: '#7a90b0', near: '#2a2a36', bg: 'tower', kinds: ['floors', 'floors'], props: ['toilet', 'sign'] },
  wall: { sky: ['#f0a850', '#fff0c8'], top: '#e8c070', dirt: '#c89050', stone: '#a8865e', far: '#dca868', near: '#8a7a6a', bg: 'wall', kinds: ['wallseg', 'wallseg'], props: ['crane', 'sign'] },
  studio: { sky: ['#140a2a', '#3a1a5a'], top: '#6a5a7a', dirt: '#2e2838', stone: '#4a4458', far: '#2a1a40', near: '#120a20', bg: 'studio', stars: true, kinds: ['stage', 'stage'], props: ['tv', 'tv'] },
  casino: { sky: ['#1a0630', '#5a1a5a'], top: '#c8102e', dirt: '#3a2a2a', stone: '#5a4a4a', far: '#3a1040', near: '#14061a', bg: 'casino', stars: true, kinds: ['gold'], props: ['toilet', 'sign'] },
  rally: { sky: ['#2a3a8a', '#e86a5a'], top: '#5a9a3a', dirt: '#5a4430', stone: '#7a7068', far: '#5a4a7a', near: '#22183a', bg: 'rally', kinds: ['stage', 'stage'], props: ['crowd', 'crowd', 'sign'] },
  bunker: { sky: ['#101418', '#2a3038'], top: '#5a5e66', dirt: '#3a3c42', stone: '#55585f', far: '#1c2026', near: '#0e1014', bg: 'cave', ceiling: true, props: ['tv', 'sign'] },
  sewer: { sky: ['#0a1410', '#1e3a2a'], top: '#3f6a3a', dirt: '#2e3a30', stone: '#4a5650', far: '#13241a', near: '#0a140e', bg: 'cave', ceiling: true, props: ['sign'] },
  space: { sky: ['#0a1030', '#4a6ab0'], top: '#8a929e', dirt: '#5a606a', stone: '#7a828e', far: '#2a3a6a', near: '#1a2238', bg: 'space', stars: true, kinds: ['rocketpad'], props: ['rocket', 'sign'] },
  moon: { sky: ['#000008', '#141428'], top: '#c8c8c8', dirt: '#9a9a9e', stone: '#7a7a80', far: '#3a3a44', near: '#22222a', bg: 'moon', stars: true, grav: 0.5, kinds: ['rocketpad'], props: ['rocket', 'pin'] },
  rushmore: { sky: ['#5ab0f0', '#dff2ff'], top: '#4f9a3a', dirt: '#7a6a5a', stone: '#a09a92', far: '#b8b0a6', near: '#2e6a3a', bg: 'rushmore', props: ['sign'] },
  pool: { sky: ['#5ab8f0', '#e8f8ff'], top: '#5ccf4a', dirt: '#b8b0a0', stone: '#c8c4b8', far: '#e8e4d8', near: '#3a8a3a', bg: 'lincoln', water: true, props: ['sign'] },
  giga: { sky: ['#20242c', '#4a5260'], top: '#9aa2ae', dirt: '#3a3e46', stone: '#5a606a', far: '#2a2e36', near: '#16181e', bg: 'giga', ally: 'tbot', kinds: ['floors', 'crates', 'floors'], props: ['truck', 'charger', 'robotarm'], foes: ['goon', 'goon', 'rocket', 'heavy', 'robot'] },
  korea: { sky: ['#6a7a8a', '#d8dde2'], top: '#8a8a7a', dirt: '#5a5446', stone: '#7a766a', far: '#9aa0a6', near: '#4a4a44', bg: 'korea', kinds: ['squad', 'bunker', 'squad'], props: ['banner', 'banner'], foes: ['soldier', 'soldier', 'soldier', 'soldier', 'rocket', 'heavy', 'dog'] },
  china: { sky: ['#2a0a1a', '#a03a3a'], top: '#5a5a62', dirt: '#2e2e36', stone: '#4a4a56', far: '#3a1a2a', near: '#140a12', bg: 'china', stars: true, kinds: ['floors', 'squad'], props: ['lantern', 'lantern', 'banner'], foes: ['robot', 'robot', 'robot', 'robot', 'turret', 'heavy'] },
  russia: { sky: ['#8a9ab0', '#e4ecf4'], top: '#f4f8fc', dirt: '#5a5048', stone: '#7a7068', far: '#b8c4d4', near: '#4a3a3a', bg: 'russia', snow: true, kinds: ['drums', 'drums', 'squad'], props: ['derrick', 'derrick'], foes: ['goon', 'goon', 'heavy', 'rocket', 'dog'] },
  whitehouse: { sky: ['#5ab8f0', '#e8f8ff'], top: '#5ccf4a', dirt: '#6a5038', stone: '#c8c8c0', far: '#e8e8e0', near: '#3a8a3a', bg: 'whitehouse', kinds: ['stage'], props: ['crowd', 'sign'] },
};
function buildTiles(th, seed) {
  const R = mulberry32(seed);
  const tiles = [];
  const mk = fn => { const c = mkCanvas(16, 16); const g = c.getContext('2d'); fn(g, (x, y, w, h, col) => { g.fillStyle = col; g.fillRect(x, y, w, h); }); return c; };
  const speckle = (R2, col, n) => { for (let i = 0; i < n; i++) R2(Math.floor(R() * 16), Math.floor(R() * 16), 1, 1, col); };
  tiles[T.DIRT] = mk((g, Rc) => { Rc(0, 0, 16, 16, th.dirt); speckle(Rc, shade(th.dirt, 0.8), 18); speckle(Rc, shade(th.dirt, 1.15), 10); });
  tiles.top = mk((g, Rc) => {
    Rc(0, 0, 16, 16, th.dirt); speckle(Rc, shade(th.dirt, 0.8), 14); speckle(Rc, shade(th.dirt, 1.15), 8);
    Rc(0, 0, 16, 4, th.top); Rc(0, 0, 16, 1, shade(th.top, 1.15));
    for (let x = 0; x < 16; x++) if (R() < 0.5) Rc(x, 4, 1, 1 + Math.floor(R() * 2), shade(th.top, 0.85));
  });
  tiles[T.STONE] = mk((g, Rc) => {
    Rc(0, 0, 16, 16, th.stone); Rc(0, 7, 16, 1, shade(th.stone, 0.7)); Rc(0, 15, 16, 1, shade(th.stone, 0.7));
    Rc(7, 0, 1, 7, shade(th.stone, 0.7)); Rc(3, 8, 1, 7, shade(th.stone, 0.7)); Rc(12, 8, 1, 7, shade(th.stone, 0.7));
    Rc(0, 0, 7, 1, shade(th.stone, 1.2)); Rc(8, 0, 8, 1, shade(th.stone, 1.2)); Rc(4, 8, 8, 1, shade(th.stone, 1.2));
    speckle(Rc, shade(th.stone, 0.85), 8);
  });
  tiles[T.STEEL] = mk((g, Rc) => {
    Rc(0, 0, 16, 16, '#6a7280'); Rc(0, 0, 16, 1, '#9aa2b0'); Rc(0, 0, 1, 16, '#8a92a0'); Rc(0, 15, 16, 1, '#3a404a'); Rc(15, 0, 1, 16, '#4a505a');
    [[2, 2], [12, 2], [2, 12], [12, 12]].forEach(([x, y]) => { Rc(x, y, 2, 2, '#4a505a'); Rc(x, y, 1, 1, '#b0b8c4'); });
    Rc(5, 7, 6, 1, '#5a626e');
  });
  tiles[T.CRATE] = mk((g, Rc) => {
    Rc(0, 0, 16, 16, '#a8743a'); Rc(0, 0, 16, 2, '#7a5226'); Rc(0, 14, 16, 2, '#7a5226'); Rc(0, 0, 2, 16, '#7a5226'); Rc(14, 0, 2, 16, '#7a5226');
    for (let i = 2; i < 14; i++) { Rc(i, i, 2, 1, '#7a5226'); Rc(15 - i, i, 1, 1, '#8a6030'); }
    Rc(2, 5, 12, 1, '#c08a4a'); Rc(2, 10, 12, 1, '#c08a4a');
  });
  tiles[T.BARREL] = mk((g, Rc) => {
    Rc(2, 1, 12, 15, '#c82020'); Rc(3, 0, 10, 1, '#a01818'); Rc(2, 4, 12, 1, '#901010'); Rc(2, 12, 12, 1, '#901010');
    Rc(3, 1, 2, 15, '#e84040'); Rc(6, 6, 4, 4, '#ffd23f'); Rc(7, 7, 2, 2, '#222');
  });
  tiles[T.PLANK] = mk((g, Rc) => {
    Rc(0, 0, 16, 5, '#9a6a34'); Rc(0, 0, 16, 1, '#c08a4a'); Rc(0, 4, 16, 1, '#6a4420'); Rc(5, 1, 1, 3, '#6a4420'); Rc(11, 1, 1, 3, '#6a4420');
  });
  tiles[T.BRICK] = mk((g, Rc) => {
    const b = '#9a4a32', m = '#5a2a1a';
    Rc(0, 0, 16, 16, b);
    for (let y = 0; y < 16; y += 4) { Rc(0, y + 3, 16, 1, m); const off = (y / 4) % 2 ? 4 : 0; for (let x = off; x < 16; x += 8) Rc(x, y, 1, 3, m); }
    speckle(Rc, '#b05a3e', 6);
  });
  tiles[T.POLE] = mk((g, Rc) => { Rc(6, 0, 4, 16, '#7a5226'); Rc(6, 0, 1, 16, '#9a6a34'); });
  tiles.back = mk((g, Rc) => { Rc(0, 0, 16, 16, shade(th.dirt, 0.42)); speckle(Rc, shade(th.dirt, 0.34), 14); });
  tiles.cracks = [1, 2, 3].map(n => mk((g, Rc) => {
    const col = 'rgba(0,0,0,0.45)';
    Rc(7, 3, 1, 5, col); Rc(8, 7, 1, 4, col); Rc(5, 8, 3, 1, col);
    if (n > 1) { Rc(3, 2, 1, 4, col); Rc(10, 10, 4, 1, col); Rc(12, 3, 1, 3, col); }
    if (n > 2) { Rc(2, 11, 4, 1, col); Rc(9, 13, 1, 3, col); Rc(11, 6, 3, 1, col); }
  }));
  return tiles;
}
// Parallax silhouettes, generated per theme
function buildBackdrop(th, seed, VHpx) {
  const R = mulberry32(seed ^ 0x9e3779b9);
  const W = 512, H = 220;
  const far = mkCanvas(W, H), near = mkCanvas(W, H);
  const gf = far.getContext('2d'), gn = near.getContext('2d');
  gf.fillStyle = th.far; gn.fillStyle = th.near;
  const wave = (g, base, amp, freq, col) => { g.fillStyle = col; for (let x = 0; x < W; x++) { const y = base + Math.sin(x / W * Math.PI * 2 * freq) * amp + Math.sin(x / W * Math.PI * 2 * freq * 3.1) * amp * 0.3; g.fillRect(x, Math.floor(y), 1, H - Math.floor(y)); } };
  const bg = th.bg;
  if (bg === 'palms') {
    gf.fillStyle = th.sea; gf.fillRect(0, 150, W, 70); gf.fillStyle = shade(th.sea, 1.2); for (let i = 0; i < 40; i++) gf.fillRect(Math.floor(R() * W), 152 + Math.floor(R() * 60), 6, 1);
    gf.fillStyle = th.far; for (let i = 0; i < 3; i++) { const x = R() * W, w = 40 + R() * 60; for (let k = 0; k < w; k++) gf.fillRect(Math.floor(x + k) % W, 150 - Math.floor(Math.sin(k / w * Math.PI) * 10), 1, 10); }
    for (let i = 0; i < 6; i++) { const x = Math.floor(R() * W), h = 50 + R() * 30; gn.fillStyle = th.near; for (let y = 0; y < h; y++) gn.fillRect(x + Math.floor(Math.sin(y / h * 1.4) * 8), 220 - y, 3, 1);
      const tx = x + Math.floor(Math.sin(1.4) * 8), ty = 220 - h; for (let a = 0; a < 6; a++) { const ang = a / 6 * Math.PI * 2; for (let r = 0; r < 16; r++) gn.fillRect(tx + Math.floor(Math.cos(ang) * r), ty + Math.floor(Math.sin(ang) * r * 0.5 + r * r * 0.03), 2, 2); } }
  } else if (bg === 'jungle') {
    for (let x = 0; x < W; x += 6) { const h = 90 + R() * 40; gf.fillRect(x, 220 - h, 8, h); gf.beginPath(); gf.arc(x + 4, 220 - h, 10 + R() * 8, 0, Math.PI * 2); gf.fill(); }
    for (let i = 0; i < 9; i++) { const x = Math.floor(R() * W); gn.fillRect(x, 60, 6, 160); gn.beginPath(); gn.arc(x + 3, 60, 22, 0, Math.PI * 2); gn.fill(); for (let v = 0; v < 3; v++) gn.fillRect(x - 14 + v * 12, 60, 1, 40 + R() * 40); }
  } else if (bg === 'huts') {
    wave(gf, 140, 14, 2, th.far);
    for (let i = 0; i < 6; i++) { const x = Math.floor(R() * W), w = 28 + Math.floor(R() * 14); gn.fillRect(x, 180, w, 40); gn.beginPath(); gn.moveTo(x - 6, 182); gn.lineTo(x + w / 2, 156); gn.lineTo(x + w + 6, 182); gn.fill(); gn.fillStyle = shade(th.near, 1.6); gn.fillRect(x + w / 2 - 3, 196, 6, 24); gn.fillStyle = th.near; }
  } else if (bg === 'dunes') {
    wave(gf, 150, 16, 2, th.far);
    wave(gn, 185, 10, 3, th.near);
    for (let i = 0; i < 2; i++) { const x = Math.floor(R() * W), w = 50 + R() * 30; gn.fillRect(x, 150, w, 70); gn.fillRect(x + 4, 146, w - 8, 4); }
  } else if (bg === 'mountains') {
    gf.fillStyle = th.far; for (let x = 0; x < W; x++) { const y = 80 + Math.abs(((x * 0.9) % 120) - 60) * 1.1 + Math.sin(x * 0.05) * 8; gf.fillRect(x, Math.floor(y), 1, H); if (y < 110) { gf.fillStyle = '#ffffff'; gf.fillRect(x, Math.floor(y), 1, Math.floor((110 - y) * 0.6) + 1); gf.fillStyle = th.far; } }
    for (let i = 0; i < 18; i++) { const x = Math.floor(R() * W), h = 30 + R() * 30; for (let y = 0; y < h; y++) gn.fillRect(x - Math.floor(y * 0.3), 220 - h + y, Math.floor(y * 0.6) + 2, 1); gn.fillRect(x - 1, 220 - 8, 3, 8); }
  } else if (bg === 'city' || bg === 'swampcity') {
    for (let x = 0; x < W;) { const w = 18 + Math.floor(R() * 26), h = 50 + Math.floor(R() * 90); gf.fillStyle = th.far; gf.fillRect(x, 220 - h, w, h); gf.fillStyle = '#e8d070'; for (let wy = 220 - h + 4; wy < 214; wy += 6) for (let wx = x + 3; wx < x + w - 3; wx += 5) if (R() < 0.3) gf.fillRect(wx, wy, 2, 3); x += w + 2; }
    if (bg === 'swampcity') { gn.fillStyle = th.near; gn.beginPath(); gn.arc(256, 160, 40, Math.PI, 0); gn.fill(); gn.fillRect(216, 160, 80, 60); gn.fillRect(253, 100, 6, 24); for (let i = 0; i < 6; i++) gn.fillRect(222 + i * 14, 165, 5, 55); }
    for (let x = 0; x < W;) { const w = 26 + Math.floor(R() * 30), h = 30 + Math.floor(R() * 50); if (bg === 'city' || x < 200 || x > 310) { gn.fillStyle = th.near; gn.fillRect(x, 220 - h, w, h); gn.fillStyle = '#ffe680'; for (let wy = 220 - h + 4; wy < 214; wy += 7) for (let wx = x + 3; wx < x + w - 3; wx += 6) if (R() < 0.18) gn.fillRect(wx, wy, 3, 3); } x += w + 6; }
  } else if (bg === 'golf') {
    wave(gf, 150, 12, 2, th.far);
    for (let i = 0; i < MAXG(); i++) { const x = Math.floor(R() * W); gn.fillStyle = th.near; gn.beginPath(); gn.arc(x, 200, 30 + R() * 20, 0, Math.PI * 2); gn.fill(); }
    for (let i = 0; i < 3; i++) { const x = Math.floor(R() * W); gf.fillStyle = '#ddd'; gf.fillRect(x, 120, 1, 26); gf.fillStyle = '#c8102e'; gf.fillRect(x + 1, 120, 6, 4); }
    gf.fillStyle = '#f4f0e8'; gf.fillRect(200, 112, 70, 36); gf.fillStyle = '#c86a4a'; gf.fillRect(196, 104, 78, 10); gf.fillStyle = '#7ab8e8'; for (let i = 0; i < 6; i++) gf.fillRect(206 + i * 10, 122, 5, 8);
  } else if (bg === 'tower' || bg === 'casino') {
    for (let x = 0; x < W;) { const w = 22 + Math.floor(R() * 26), h = 60 + Math.floor(R() * 90); gf.fillStyle = th.far; gf.fillRect(x, 220 - h, w, h); gf.fillStyle = bg === 'casino' ? pick2(R, ['#ff4fd8', '#4ff0ff', '#ffe14a']) : '#bcd4ee'; for (let wy = 220 - h + 4; wy < 214; wy += 6) for (let wx = x + 3; wx < x + w - 3; wx += 5) if (R() < 0.4) gf.fillRect(wx, wy, 2, 3); x += w + 3; }
    gn.fillStyle = '#1a1a22'; gn.fillRect(230, 20, 46, 200); gn.fillStyle = '#d4af37'; gn.fillRect(230, 20, 46, 3); for (let y = 30; y < 220; y += 8) gn.fillRect(234, y, 38, 1);
    gn.font = 'bold 9px monospace'; gn.fillText('TRUMP', 238, 40);
    if (bg === 'casino') { gn.fillStyle = '#ff4fd8'; gn.fillRect(80, 150, 70, 22); gn.fillStyle = '#ffe14a'; gn.fillText('JACKPOT', 88, 165); gn.fillStyle = '#4ff0ff'; gn.fillRect(360, 160, 60, 18); gn.fillStyle = '#14061a'; gn.fillText('777', 380, 173); }
  } else if (bg === 'wall') {
    wave(gf, 160, 10, 2, th.far);
    gn.fillStyle = th.near; gn.fillRect(0, 150, W, 70);
    gn.fillStyle = shade(th.near, 0.75); for (let x = 0; x < W; x += 6) gn.fillRect(x, 150, 2, 70);
    gn.fillStyle = '#d4af37'; gn.fillRect(0, 148, W, 3);
    for (let i = 0; i < 2; i++) { const x = 60 + i * 260; gf.fillStyle = '#e8b830'; gf.fillRect(x, 60, 4, 100); gf.fillRect(x, 60, 70, 4); gf.fillRect(x + 66, 64, 1, 30); }
  } else if (bg === 'studio') {
    for (let i = 0; i < 6; i++) { const x = 10 + i * 84; gf.fillStyle = '#0a0a14'; gf.fillRect(x, 70, 70, 46); gf.fillStyle = '#2a4ab0'; gf.fillRect(x + 3, 73, 64, 40); gf.fillStyle = '#c8102e'; gf.fillRect(x + 3, 101, 64, 9); gf.fillStyle = '#ffffff'; gf.font = 'bold 7px monospace'; gf.fillText('FAKE NEWS', x + 8, 108); gf.fillText('LIVE', x + 6, 82); }
    gn.fillStyle = th.near; for (let x = 0; x < W; x += 40) { gn.fillRect(x, 140, 4, 80); gn.fillRect(x - 8, 140, 20, 6); }
  } else if (bg === 'rally') {
    wave(gf, 130, 6, 1, th.far);
    for (let x = 0; x < W; x += 5) { const h = 18 + R() * 10; gn.fillStyle = th.near; gn.fillRect(x, 220 - 60 - h * 0.2, 4, 80); gn.beginPath(); gn.arc(x + 2, 160 - h * 0.2, 2.5, 0, Math.PI * 2); gn.fill(); if (R() < 0.25) { gn.fillStyle = pick2(R, ['#c8102e', '#ffffff', '#1c3f8f']); gn.fillRect(x - 3, 140 - h * 0.2, 10, 7); } }
    gf.fillStyle = '#c8102e'; gf.fillRect(160, 60, 190, 26); gf.fillStyle = '#ffffff'; gf.font = 'bold 14px monospace'; gf.fillText('MAKE IT GREAT', 196, 78);
  } else if (bg === 'space') {
    wave(gf, 175, 6, 3, th.far);
    for (let i = 0; i < 3; i++) { const x = 40 + i * 170; gn.fillStyle = '#9aa2b0'; gn.fillRect(x, 60, 12, 160); gn.fillStyle = '#ffffff'; gn.fillRect(x + 20, 80, 14, 120); gn.beginPath(); gn.moveTo(x + 20, 80); gn.lineTo(x + 27, 62); gn.lineTo(x + 34, 80); gn.fill(); gn.fillStyle = '#c8102e'; gn.fillRect(x + 20, 120, 14, 4); gn.fillStyle = '#1c3f8f'; gn.fillRect(x + 22, 96, 10, 10); }
  } else if (bg === 'moon') {
    gf.fillStyle = '#2a6ad0'; gf.beginPath(); gf.arc(380, 50, 22, 0, Math.PI * 2); gf.fill(); gf.fillStyle = '#4ab05a'; gf.fillRect(370, 40, 10, 8); gf.fillRect(384, 54, 8, 6);
    wave(gf, 170, 10, 2, th.far);
    wave(gn, 195, 6, 4, th.near); gn.fillStyle = shade(th.near, 0.6); for (let i = 0; i < 10; i++) { gn.beginPath(); gn.ellipse(R() * W, 205, 10, 3, 0, 0, Math.PI * 2); gn.fill(); }
    gn.fillStyle = '#ddd'; gn.fillRect(120, 160, 1, 30); gn.fillStyle = '#c8102e'; gn.fillRect(121, 160, 12, 8); gn.fillStyle = '#1c3f8f'; gn.fillRect(121, 160, 5, 4);
  } else if (bg === 'rushmore') {
    gf.fillStyle = th.far; gf.beginPath(); gf.moveTo(60, 220); gf.lineTo(120, 80); gf.lineTo(380, 70); gf.lineTo(450, 220); gf.fill();
    for (let i = 0; i < 5; i++) { const x = 140 + i * 48; gf.fillStyle = i === 4 ? '#d4af37' : shade(th.far, 0.85); gf.fillRect(x, 96, 30, 40); gf.fillStyle = i === 4 ? '#ffe07a' : shade(th.far, 0.7); gf.fillRect(x + 6, 108, 4, 3); gf.fillRect(x + 18, 108, 4, 3); gf.fillRect(x + 10, 124, 10, 2); if (i === 4) { gf.fillStyle = '#ffe07a'; gf.fillRect(x - 2, 90, 34, 8); } }
    for (let i = 0; i < 18; i++) { const x = Math.floor(R() * W), h = 26 + R() * 24; gn.fillStyle = th.near; for (let y = 0; y < h; y++) gn.fillRect(x - Math.floor(y * 0.3), 220 - h + y, Math.floor(y * 0.6) + 2, 1); }
  } else if (bg === 'whitehouse') {
    wave(gf, 175, 4, 2, th.near);
    gf.fillStyle = '#f4f4ee'; gf.fillRect(170, 110, 170, 60); gf.fillRect(225, 92, 60, 18); gf.beginPath(); gf.moveTo(220, 92); gf.lineTo(255, 76); gf.lineTo(290, 92); gf.fill();
    gf.fillStyle = '#d8d8d0'; for (let i = 0; i < 6; i++) gf.fillRect(230 + i * 10, 112, 4, 50); gf.fillStyle = '#8aa0b8'; for (let i = 0; i < 8; i++) { gf.fillRect(178 + i * 20, 122, 6, 9); gf.fillRect(178 + i * 20, 146, 6, 9); }
    gf.fillStyle = '#ddd'; gf.fillRect(254, 56, 1, 20); gf.fillStyle = '#c8102e'; gf.fillRect(255, 56, 10, 6);
    for (let i = 0; i < 8; i++) { const x = Math.floor(R() * W); gn.fillStyle = th.near; gn.beginPath(); gn.arc(x, 196, 14 + R() * 10, 0, Math.PI * 2); gn.fill(); }
  } else if (bg === 'lincoln') {
    gf.fillStyle = '#ece8dc'; gf.fillRect(300, 100, 150, 70); gf.fillRect(292, 92, 166, 10); gf.fillRect(296, 86, 158, 6);
    gf.fillStyle = '#d4d0c4'; for (let i = 0; i < 12; i++) gf.fillRect(304 + i * 12, 104, 5, 64);
    gf.fillStyle = '#f4f0e8'; gf.fillRect(60, 30, 14, 140); gf.beginPath(); gf.moveTo(60, 30); gf.lineTo(67, 16); gf.lineTo(74, 30); gf.fill();
    gf.fillStyle = '#4a9ad0'; gf.fillRect(0, 170, W, 50); gf.fillStyle = '#9fd0f0'; for (let i = 0; i < 30; i++) gf.fillRect(Math.floor(R() * W), 172 + Math.floor(R() * 40), 8, 1);
    for (let i = 0; i < 14; i++) { const x = Math.floor(R() * W); gn.fillStyle = th.near; gn.beginPath(); gn.arc(x, 190, 12 + R() * 8, 0, Math.PI * 2); gn.fill(); gn.fillRect(x - 1, 190, 3, 30); }
  } else if (bg === 'giga') {
    gf.fillStyle = th.far; gf.fillRect(0, 0, W, H); gf.fillStyle = '#3a3e48'; for (let x = 0; x < W; x += 64) { gf.fillRect(x, 0, 6, H); for (let y = 0; y < H; y += 24) { gf.fillRect(x, y, 64, 2); } }
    gf.fillStyle = '#e8f0ff'; for (let x = 20; x < W; x += 64) gf.fillRect(x, 8, 24, 3);
    for (let i = 0; i < 4; i++) { const x = 40 + i * 120; gn.fillStyle = '#c8102e'; gn.fillRect(x, 150, 8, 40); gn.fillRect(x, 140, 30, 8); gn.fillRect(x + 26, 140, 6, 18); gn.fillStyle = '#e8e8ee'; gn.fillRect(x + 22, 158, 14, 6); }
    gn.fillStyle = '#16181e'; gn.fillRect(0, 196, W, 24); gn.fillStyle = '#5a606a'; for (let x = 0; x < W; x += 10) gn.fillRect(x, 198, 6, 2);
  } else if (bg === 'korea') {
    wave(gf, 120, 18, 2, th.far);
    for (let i = 0; i < 3; i++) { const x = 40 + i * 170; gn.fillStyle = '#6a6a62'; gn.fillRect(x, 110, 90, 110); gn.fillStyle = '#5a5a52'; for (let k = 0; k < 6; k++) gn.fillRect(x + 6 + k * 14, 120, 6, 90); gn.fillStyle = '#c8102e'; gn.fillRect(x + 20, 80, 50, 26); gn.fillRect(x + 44, 60, 2, 20); }
    gn.fillStyle = th.near; for (let x = 0; x < W; x += 6) gn.fillRect(x, 200 + (x % 12 ? 0 : -3), 4, 20);
  } else if (bg === 'china') {
    for (let x = 0; x < W;) { const w = 18 + Math.floor(R() * 24), h = 70 + Math.floor(R() * 110); gf.fillStyle = th.far; gf.fillRect(x, 220 - h, w, h); gf.fillStyle = pick2(R, ['#ff3a6a', '#3ad0ff', '#ffd23f']); for (let wy = 220 - h + 4; wy < 214; wy += 7) if (R() < 0.5) gf.fillRect(x + 2, wy, w - 4, 1); x += w + 4; }
    for (let i = 0; i < 2; i++) { const x = 100 + i * 250; gn.fillStyle = th.near; for (let k = 0; k < 4; k++) { gn.fillRect(x + k * 4, 130 + k * 22, 60 - k * 8, 18); gn.beginPath(); gn.moveTo(x - 8 + k * 4, 130 + k * 22); gn.lineTo(x + 30, 118 + k * 22); gn.lineTo(x + 68 - k * 4, 130 + k * 22); gn.fill(); } }
    gn.fillStyle = '#3a1a1a'; wave(gn, 205, 6, 3, th.near);
  } else if (bg === 'russia') {
    wave(gf, 150, 10, 2, th.far);
    for (let i = 0; i < 5; i++) { const x = 180 + i * 26, h = 50 + (i % 2) * 20; gf.fillStyle = '#c8b8a8'; gf.fillRect(x, 190 - h, 16, h); gf.fillStyle = pick2(R, ['#c8102e', '#2a6ad0', '#3aa05a', '#d4af37']); gf.beginPath(); gf.ellipse(x + 8, 190 - h, 11, 12, 0, Math.PI, 0); gf.fill(); gf.beginPath(); gf.moveTo(x - 3, 190 - h); gf.lineTo(x + 8, 170 - h); gf.lineTo(x + 19, 190 - h); gf.fill(); }
    for (let i = 0; i < 5; i++) { const x = Math.floor(R() * W); gn.strokeStyle = '#2a2420'; gn.lineWidth = 2; gn.beginPath(); gn.moveTo(x, 220); gn.lineTo(x + 12, 130); gn.lineTo(x + 24, 220); gn.moveTo(x + 4, 190); gn.lineTo(x + 20, 190); gn.moveTo(x + 7, 160); gn.lineTo(x + 17, 160); gn.stroke(); }
  } else if (bg === 'cave') {
    gf.fillStyle = th.far; for (let x = 0; x < W; x += 4) { const h = 20 + R() * 50; gf.fillRect(x, 0, 4, h); gf.fillRect(x, 220 - (10 + R() * 40), 4, 60); }
    gn.fillStyle = th.near; for (let i = 0; i < 8; i++) { const x = Math.floor(R() * W); gn.fillRect(x, 120, 4, 100); gn.fillRect(x - 10, 140, 12, 2); gn.fillRect(x + 2, 128, 14, 2); }
  }
  return { far, near, W, H };
}

// ============================================================ levels
const LEVELS = [
  { name: 'Beachfront Property', theme: 'beach' },
  { name: 'The Art of the Jungle', theme: 'jungle', boss: 'mamdani' },
  { name: 'Make the Village Great', theme: 'village' },
  { name: 'Desert Deal', theme: 'desert' },
  { name: 'Breaking News', theme: 'fortress', boss: 'harris' },
  { name: 'Frozen Assets', theme: 'snow' },
  { name: 'Covfefe Mountain', theme: 'snowbase', boss: 'clinton' },
  { name: 'Hostile Takeover', theme: 'city', boss: 'obama' },
  { name: 'Down the Swamp Hole', theme: 'swamp' },
  { name: 'Drain the Swamp', theme: 'final', boss: 'biden' },
  // ---- World 2: The Comeback Tour
  { name: 'Hole in One', theme: 'golf' },
  { name: 'The Golden Escalator', theme: 'tower' },
  { name: 'Big Beautiful Wall', theme: 'wall' },
  { name: 'Fake News Network', theme: 'studio', boss: 'anchorbot' },
  { name: 'Boardwalk Empire State', theme: 'casino' },
  { name: 'Rally Round the Flag', theme: 'rally' },
  { name: 'Eighteen Holes of Doom', theme: 'golf' },
  { name: 'Deep State Basement', theme: 'bunker', boss: 'agent' },
  { name: 'The Nexico Wall Deal', theme: 'wall', boss: 'generalissimo' },
  { name: 'Tower of Power', theme: 'tower', boss: 'obama2' },
  // ---- World 3: Swamp Strikes Back
  { name: 'Sewer Rats', theme: 'sewer' },
  { name: 'Kraken the Code', theme: 'sewer', boss: 'kraken' },
  { name: 'Space Force Academy', theme: 'space' },
  { name: 'Fly Me to the Moon', theme: 'moon' },
  { name: 'Rushmore or Less', theme: 'rushmore' },
  { name: 'Lawn Order', theme: 'whitehouse', boss: 'harris2' },
  { name: 'Casino Royale with Cheese', theme: 'casino' },
  { name: 'Breaking More News', theme: 'studio' },
  { name: 'The Swamp Throne', theme: 'final' },
  { name: 'Swamp Emperor', theme: 'final', boss: 'emperor' },
  // ---- World 4: World Tour
  { name: 'Reflecting on Greatness', theme: 'pool' },
  { name: 'Giga Factory', theme: 'giga' },
  { name: 'Parade Ground Panic', theme: 'korea' },
  { name: 'Robot Republic', theme: 'china' },
  { name: 'Oil Drum Steppe', theme: 'russia' },
  { name: 'Deep Reflection', theme: 'pool' },
  { name: 'Gigafactory Overdrive', theme: 'giga' },
  { name: 'The Supreme Parade', theme: 'korea', boss: 'paradetank' },
  { name: 'Dragon Protocol', theme: 'china', boss: 'robodragon' },
  { name: 'The Oil Baron', theme: 'russia', boss: 'drillrig' },
];
const NLEV = LEVELS.length;
const WORLDS = [{ name: 'DRAIN THE SWAMP', from: 1 }, { name: 'THE COMEBACK TOUR', from: 11 }, { name: 'SWAMP STRIKES BACK', from: 21 }, { name: 'WORLD TOUR', from: 31 }];
// Mech-type bosses (machines can be blown up; any politician pilot climbs out and is fired)
const MECHS = {
  biden: { name: 'THE SWAMP KING (feat. JOE BIDEN)', hp: 170, heads: ['biden'], attacks: ['rockets', 'icecream', 'stomp', 'summon'], pilot: 'biden', banner: ['THE SWAMP KING', "C'MON, MAN! MEET MY MECH!"] },
  kraken: { name: 'THE SWAMP KRAKEN', hp: 190, attacks: ['ink', 'stomp', 'ink', 'summon'], kraken: true, banner: ['THE SWAMP KRAKEN', 'RELEASE THE KRAKEN! (IT WAS IN THE SEWER)'] },
  paradetank: { name: 'THE SUPREME PARADE TANK', hp: 230, attacks: ['rockets', 'stomp', 'summon', 'rockets'], fired: 'THE PARADE HAS BEEN CANCELLED', banner: ['THE SUPREME PARADE TANK', 'IT HAS NEVER LOST A PARADE. UNTIL TODAY.'] },
  robodragon: { name: 'MECHA DRAGON 9000', hp: 250, attacks: ['fireball', 'rockets', 'fireball', 'summon'], fired: 'THE DRAGON HAS BEEN RECALLED', banner: ['MECHA DRAGON 9000', 'MASS-PRODUCED. MASSIVELY ANGRY.'] },
  drillrig: { name: "THE OIL BARON'S DRILL RIG", hp: 270, attacks: ['drums', 'rockets', 'stomp', 'drums', 'summon'], fired: 'THE OIL BARON IS OUT OF BUSINESS', banner: ["THE OIL BARON'S DRILL RIG", 'DRILL, BARON, DRILL!'] },
  emperor: { name: 'THE SWAMP EMPEROR (feat. BIDEN & HARRIS)', hp: 280, heads: ['biden', 'harris'], attacks: ['rockets', 'icecream', 'coconuts', 'stomp', 'summon', 'wordsalad'], pilot: 'biden', pilot2: 'harris2', banner: ['THE SWAMP EMPEROR', 'TWO PILOTS. ZERO PLANS.'] },
};
const BOSSES = {
  mamdani: { name: 'ZOHRAN MAMDANI', hp: 55, intro: 'THE RENT IS FROZEN... AND SO ARE YOU!', taunts: ['FREE BUSES!', 'RENT FREEZE!', 'GROCERIES FOR ALL!'], attacks: ['notices', 'notices', 'summon'] },
  harris: { name: 'KAMALA HARRIS', hp: 75, intro: 'WHAT CAN BE, UNBURDENED BY WHAT HAS BEEN!', taunts: ['COCONUT TIME!', 'HA HA HA HA!', 'WORD SALAD!'], attacks: ['coconuts', 'wordsalad', 'coconuts', 'summon'] },
  clinton: { name: 'HILLARY CLINTON', hp: 95, intro: "YOU'VE GOT MAIL!", taunts: ['DELETE!', 'REPLY ALL!', 'CHECK YOUR INBOX!'], attacks: ['emails', 'emails', 'summon', 'emails'] },
  obama: { name: 'BARACK OBAMA', hp: 110, intro: 'YES WE CAN... STOP YOU!', taunts: ['HOPE!', 'CHANGE!', 'TAN SUIT DASH!'], attacks: ['signs', 'dash', 'signs', 'summon'] },
  biden: { name: 'JOE BIDEN', hp: 50, intro: "C'MON, MAN! NO MALARKEY!", taunts: ["C'MON, MAN!", 'MALARKEY!', 'ICE CREAM TIME!'], attacks: ['icecream', 'shades', 'icecream'] },
  anchorbot: { name: 'FAKE NEWS ANCHORBOT', spr: 'anchorbot', hp: 120, intro: 'THIS JUST IN: YOU ARE CANCELLED!', taunts: ['FAKE NEWS!', 'BREAKING!', 'SOURCES SAY...'], attacks: ['headlines', 'mics', 'headlines', 'summon'] },
  generalissimo: { name: 'THE GENERALISSIMO OF NEXICO', spr: 'generalissimo', hp: 150, intro: 'NEXICO WILL NEVER PAY FOR THE WALL!', taunts: ['NEVER!', 'NO DEAL!', 'MORE RED TAPE!'], attacks: ['redtape', 'medals', 'redtape', 'summon'] },
  agent: { name: 'THE DEEP STATE AGENT', spr: 'agent', hp: 135, intro: 'THIS CONVERSATION NEVER HAPPENED.', taunts: ['[REDACTED]', 'CLASSIFIED!', 'NOTHING TO SEE HERE!'], attacks: ['redact', 'dash', 'redact', 'summon'] },
  obama2: { name: 'OBAMA 2: THE SEQUEL', spr: 'obama', hp: 160, intro: 'I AM BACK... FOR A THIRD TERM OF HOPE!', taunts: ['HOPE 2!', 'MORE CHANGE!', 'TAN SUIT DASH II!'], attacks: ['signs', 'dash', 'teleprompter', 'signs', 'summon'] },
  harris2: { name: 'KAMALA HARRIS (THE REMATCH)', spr: 'harris', hp: 150, intro: 'WE DID NOT FALL OUT OF A COCONUT TREE!', taunts: ['COCONUT RAIN!', 'HA HA HA HA!', 'VENN DIAGRAM!'], attacks: ['coconuts', 'wordsalad', 'coconuts', 'summon', 'wordsalad'] },
};
const ALLY_ORDER = ['barron', 'donjr', 'eric', 'hegseth'];

function genLevel(n) {
  const L = LEVELS[n - 1], th = THEMES[L.theme];
  const R = mulberry32((0x7f4a7c15 ^ Math.imul(n, 2654435761)) >>> 0);
  const rint = (a, b) => a + Math.floor(R() * (b - a + 1));
  const rpick = arr => arr[Math.floor(R() * arr.length)];
  const W = n <= 10 ? Math.min(220, 150 + (n - 1) * 8) : Math.min(224, 168 + ((n - 11) % 10) * 6);
  const lv = {
    n, W, H: LH, name: L.name, theme: L.theme, th,
    tiles: new Uint8Array(W * LH), hp: new Uint8Array(W * LH), back: new Uint8Array(W * LH),
    surf: new Int16Array(W), pit: new Uint8Array(W), spawns: [], cages: [], flags: [], pickups: [],
    boss: L.boss || null, arena: null, extract: null, ceiling: !!th.ceiling, deco: [], props: [], grav: th.grav || 1,
  };
  const idx = (x, y) => y * W + x;
  const set = (x, y, t) => { if (x < 0 || x >= W || y < 0 || y >= LH) return; lv.tiles[idx(x, y)] = t; lv.hp[idx(x, y)] = TILE_HP[t]; };
  const surf = lv.surf, pit = lv.pit;
  const endLen = L.boss ? 30 : 18;
  const bodyEnd = W - endLen;
  let h = 17, x = 0;
  const features = [];
  const run = (len, isPit) => { for (let i = 0; i < len && x < W; i++) { surf[x] = h; if (isPit) pit[x] = 1; x++; } };
  run(16);
  const kinds = ['bunker', 'tower', 'crates', 'barrels', 'platforms', 'squad', 'bunker', 'squad'].concat(th.kinds || [], th.kinds || []);
  if (n > 10) kinds.push('gold');
  while (x < bodyEnd - 8) {
    const r = R();
    if (r < 0.22) { let dh = rint(-3, 3); if (!dh) dh = 1; h = clamp(h + dh, 12, 20); run(rint(5, 9)); }
    else if (r < 0.33) { run(rint(2, 3), true); run(rint(4, 7)); }
    else if (r < 0.41) { const len = rint(4, 6); features.push({ type: 'bridge', x, len, h }); run(len, true); run(4); }
    else { const len = rint(8, 13); features.push({ type: rpick(kinds), x, len, h }); run(len); }
  }
  // flatten approach to the end zone
  run(W - x);
  lv.water = null;
  if (th.water) {
    // Lincoln Memorial Reflecting Pool: high banks with one long pool to swim down
    h = 15; features.length = 0;
    for (let i = 0; i < W; i++) { surf[i] = 15; pit[i] = 0; }
    lv.water = new Int16Array(W);
    const p0 = 22, p1 = bodyEnd - 6;
    for (let i = p0; i <= p1; i++) { surf[i] = 21; lv.water[i] = 16; }
    for (let px = p0 + 5; px < p1 - 6; px += rint(10, 14)) features.push({ type: 'lily', x: px, len: 4, h: 15 });
    lv.poolX = [p0, p1];
  }
  const hEnd = h;
  // ceiling for cave levels
  const ceil = new Int16Array(W);
  if (lv.ceiling) { let c = 4; for (let i = 0; i < W; i++) { if (i % 6 === 0) c = clamp(c + rint(-1, 1), 2, 6); ceil[i] = Math.min(c, surf[i] - 8); } }
  // fill terrain
  for (let cx = 0; cx < W; cx++) {
    if (lv.ceiling) for (let y = 0; y < ceil[cx]; y++) set(cx, y, y === ceil[cx] - 1 ? T.DIRT : T.STONE);
    if (pit[cx]) continue;
    for (let y = surf[cx]; y < LH; y++) {
      set(cx, y, y === LH - 1 ? T.STEEL : y < surf[cx] + 4 ? T.DIRT : T.STONE);
      if (y > surf[cx]) lv.back[idx(cx, y)] = 1;
    }
  }
  // enemy helpers
  const pool = ['goon', 'goon', 'goon'];
  if (n >= 1) pool.push('dog');
  if (n >= 2) pool.push('rocket');
  if (n >= 3) pool.push('heavy', 'goon');
  if (n >= 6) pool.push('rocket', 'heavy', 'dog');
  if (n >= 11) pool.push('heavy', 'rocket', 'goon');
  if (n >= 21) pool.push('heavy', 'rocket', 'dog');
  if (th.foes) { pool.length = 0; pool.push(...th.foes); }
  const prop = (kind, tx, row) => lv.props.push({ kind, x: tx * TS, row });
  const spawn = (type, tx, row) => lv.spawns.push({ type, x: tx * TS + 3, row });
  const foes = () => rint(1, Math.min(5, 2 + Math.floor(Math.min(n, 18) / 3)));
  // features
  for (const f of features) {
    const fx = f.x + 2, fh = f.h;
    if (f.type === 'bridge') { for (let i = 0; i < f.len; i++) set(f.x + i, fh, T.PLANK); continue; }
    if (f.type === 'bunker') {
      for (let bx = fx; bx < fx + 6; bx++) for (let by = fh - 4; by < fh; by++) {
        const edge = bx === fx || bx === fx + 5 || by === fh - 4;
        const door = (bx === fx || bx === fx + 5) && by >= fh - 2;
        if (edge && !door) set(bx, by, T.BRICK);
        lv.back[idx(bx, by)] = 1;
      }
      spawn(pick2(R, pool), fx + 2, fh);
      if (n >= 3 && R() < 0.6) spawn('turret', fx + 2, fh - 4); else spawn('goon', fx + 2, fh - 4);
      if (R() < 0.5) set(fx + 7, fh - 1, T.BARREL);
    } else if (f.type === 'tower') {
      for (let by = fh - 4; by < fh; by++) { set(fx, by, T.POLE); set(fx + 3, by, T.POLE); }
      for (let bx = fx - 1; bx <= fx + 4; bx++) set(bx, fh - 5, T.PLANK);
      spawn(R() < 0.3 && n >= 2 ? 'rocket' : 'goon', fx + 1, fh - 5);
      spawn(pick2(R, pool), fx + 6, fh);
      if (R() < 0.5) set(fx + 4, fh - 6, T.CRATE);
    } else if (f.type === 'crates') {
      for (let i = 0; i < 3; i++) { const hh = rint(1, 2); for (let k = 1; k <= hh; k++) set(fx + i, fh - k, T.CRATE); }
      for (let i = 0; i < foes(); i++) spawn(pick2(R, pool), fx + 4 + i * 2, fh);
    } else if (f.type === 'barrels') {
      const nb = rint(2, 3); for (let i = 0; i < nb; i++) set(fx + 1 + i, fh - 1, T.BARREL);
      if (R() < 0.5) set(fx + 2, fh - 2, T.BARREL);
      for (let i = 0; i < foes(); i++) spawn('goon', fx + 5 + i * 2, fh);
    } else if (f.type === 'platforms') {
      const py = fh - rint(3, 4), len = rint(3, 5);
      for (let i = 0; i < len; i++) set(fx + i, py, R() < 0.5 ? T.PLANK : T.STONE);
      spawn('goon', fx + 1, py);
      if (R() < 0.45) lv.pickups.push({ type: rpick(['burger', 'grenade', 'burger']), x: (fx + 2) * TS, row: py });
      spawn(pick2(R, pool), fx + len + 2, fh);
    } else if (f.type === 'squad') {
      set(fx, fh - 1, T.DIRT); set(fx + 1, fh - 1, T.DIRT); set(fx, fh - 2, T.DIRT);
      for (let i = 0; i < foes() + 1; i++) spawn(pick2(R, pool), fx + 3 + i * 2, fh);
      if (R() < 0.4) set(fx + 2, fh - 1, T.BARREL);
    } else if (f.type === 'wallseg') {
      // a Big Beautiful Wall section: climb it (wall-jump) or blast through the brick base
      const wh = rint(5, 7);
      for (let by = fh - wh; by < fh; by++) for (let bx = fx + 2; bx < fx + 4; bx++) set(bx, by, by >= fh - 2 ? T.BRICK : T.STEEL);
      prop('crane', fx + 6, fh);
      spawn('goon', fx + 2, fh - wh); if (n >= 13) spawn('turret', fx + 3, fh - wh);
      spawn(pick2(R, pool), fx + 7, fh);
    } else if (f.type === 'floors') {
      // a gold-trimmed tower block with stacked floors
      for (let k = 1; k <= 3; k++) { const fy = fh - k * 3; for (let bx = fx; bx < fx + 7; bx++) set(bx, fy, k === 3 ? T.STEEL : T.PLANK); spawn(k === 3 && n >= 12 ? 'turret' : pick2(R, pool), fx + 2 + (k % 2) * 2, fy); }
      for (let by = fh - 9; by < fh; by++) set(fx + 7, by, T.POLE);
      prop('toilet', fx + 1, fh);
    } else if (f.type === 'green') {
      // golf green: sand trap, pin flag and a golf cart of goons
      for (let bx = fx; bx < fx + 4; bx++) set(bx, fh, T.DIRT);
      prop('pin', fx + 6, fh); prop('cart', fx + 1, fh);
      for (let i = 0; i < foes(); i++) spawn(pick2(R, pool), fx + 3 + i * 2, fh);
    } else if (f.type === 'stage') {
      // rally / studio stage with a podium and screens or crowd
      for (let bx = fx; bx < fx + 6; bx++) set(bx, fh - 2, T.PLANK);
      prop(th.bg === 'studio' ? 'tv' : 'crowd', fx + 1, fh); prop('podium', fx + 3, fh - 2);
      spawn('goon', fx + 2, fh - 2); spawn(pick2(R, pool), fx + 8, fh);
    } else if (f.type === 'gold') {
      // a stack of gold bars, guarded
      for (let i = 0; i < 3; i++) lv.pickups.push({ type: 'gold', x: (fx + i) * TS + 2, row: fh });
      set(fx + 4, fh - 1, T.CRATE); set(fx + 4, fh - 2, T.CRATE);
      for (let i = 0; i < foes(); i++) spawn(pick2(R, pool), fx + 6 + i * 2, fh);
    } else if (f.type === 'lily') {
      for (let i = 0; i < 4; i++) set(f.x + i, 15, T.PLANK);
      spawn('goon', f.x + 1, 15);
      spawn('diver', f.x + 2, 21);
      if (R() < 0.45) set(f.x + 6, 20, T.BARREL);
      if (R() < 0.3) lv.pickups.push({ type: 'passport', x: (f.x + 7) * TS, row: 19 });
    } else if (f.type === 'drums') {
      for (let i = 0; i < 4; i++) { set(fx + i, fh - 1, T.BARREL); if (i % 2 === 0) set(fx + i, fh - 2, T.BARREL); }
      prop('derrick', fx + 6, fh);
      for (let i = 0; i < foes(); i++) spawn(pick2(R, pool), fx + 8 + i * 2, fh);
    } else if (f.type === 'rocketpad') {
      for (let bx = fx; bx < fx + 5; bx++) set(bx, fh - 1, T.STEEL);
      prop('rocket', fx + 1, fh - 1); spawn('turret', fx + 4, fh - 1); spawn(pick2(R, pool), fx + 7, fh);
    }
  }
  // patrols on open ground
  for (let px = 24; px < bodyEnd - 4; px += 9) if (!pit[px] && R() < 0.3 + n * 0.025 && tileAt(lv, px, surf[px] - 1) === T.E) spawn(pick2(R, pool), px, surf[px]);
  // flat clean spot finder
  const flatSpot = (frac, w = 2) => {
    let cx = Math.floor(bodyEnd * frac);
    for (let k = 0; k < 40; k++) {
      for (const c of [cx + k, cx - k]) {
        let ok = c > 18 && c < bodyEnd - 2 && !(lv.poolX && c >= lv.poolX[0] - 1 && c <= lv.poolX[1] + 1 && c % 1 === 0 && false);
        for (let i = 0; ok && i < w; i++) if (pit[c + i] || surf[c + i] !== surf[c]) ok = false;
        if (ok) { for (let i = 0; i < w; i++) for (let y = surf[c] - 3; y < surf[c]; y++) set(c + i, y, T.E); return c; }
      }
    }
    return cx;
  };
  // cages and checkpoints
  [0.27, 0.53, 0.8].forEach((f, i) => { const c = flatSpot(f, 2); lv.cages.push({ x: c * TS - 1, row: surf[c], i }); });
  [0.38, 0.68].forEach(f => { const c = flatSpot(f, 1); lv.flags.push({ x: c * TS + 5, row: surf[c] }); });
  // pickups
  const sx = flatSpot(0.45, 1); lv.pickups.push({ type: 'suitcase', x: sx * TS + 2, row: surf[sx] });
  const ex = flatSpot(0.6, 1); lv.pickups.push({ type: 'eagles', x: ex * TS + 2, row: surf[ex] });
  if (n >= 3) { const ax = flatSpot(0.18, 1); lv.pickups.push({ type: 'airstrike', x: ax * TS + 2, row: surf[ax] }); }
  const bx2 = flatSpot(0.7, 1); lv.pickups.push({ type: 'burger', x: bx2 * TS + 2, row: surf[bx2] });
  // v2 Trump power-ups
  [0.1, 0.24, 0.42, 0.58, 0.77, 0.93].forEach(fr => { const c = flatSpot(fr, 1); lv.pickups.push({ type: 'passport', x: c * TS + 2, row: surf[c] - 2 }); });
  const pu = (type, frac) => { const c = flatSpot(frac, 1); lv.pickups.push({ type, x: c * TS + 2, row: surf[c] }); };
  pu('maga', n > 10 ? 0.32 : 0.56);
  pu('coke', 0.12);
  if (n >= 3) pu('tariff', 0.74);
  if (n >= 5 || n > 10) pu('wallkit', 0.86);
  if (n > 10) { pu('maga', 0.9); pu('gold', 0.22); pu('gold', 0.64); }
  // set-dressing props
  if (th.props) for (let px = 20; px < bodyEnd - 4; px += rint(14, 24)) if (!pit[px] && !pit[px + 1] && surf[px] === surf[px + 1] && tileAt(lv, px, surf[px] - 1) === T.E) prop(rpick(th.props), px, surf[px]);
  if (th.bg === 'tower') prop('escalator', 8, surf[8]);
  // remove enemies spawned too close to the start
  lv.spawns = lv.spawns.filter(s => s.x > 22 * TS);
  // end zone
  if (L.boss) {
    const ax0 = W - endLen + 3;
    for (let cx = ax0; cx < W; cx++) set(cx, hEnd, T.STEEL);
    for (let y = hEnd - 11; y < hEnd; y++) { set(W - 1, y, T.STEEL); set(W - 2, y, T.STEEL); }
    for (let i = 0; i < 4; i++) { set(ax0 + 5 + i, hEnd - 4, T.PLANK); set(W - 10 + i, hEnd - 4, T.PLANK); }
    if (MECHS[L.boss]) for (let i = 0; i < 4; i++) set(ax0 + 11 + i, hEnd - 7, T.PLANK);
    if (lv.ceiling) for (let cx = ax0; cx < W; cx++) for (let y = 0; y < hEnd - 12; y++) set(cx, y, T.STONE);
    lv.arena = { x0: ax0, x1: W - 2, floor: hEnd, closed: false };
    lv.spawns = lv.spawns.filter(s => s.x < (ax0 - 4) * TS);
  } else {
    lv.extract = { x0: W - 13, x1: W - 1, floor: hEnd };
    lv.deco.push({ type: 'flag', x: (W - 12) * TS, row: hEnd }, { type: 'flag', x: (W - 3) * TS, row: hEnd });
  }
  // clear spawn
  for (let cx = 1; cx < 8; cx++) for (let y = 0; y < surf[cx]; y++) if (!lv.ceiling || y >= ceil[cx]) set(cx, y, T.E);
  return lv;
}
function pick2(R, arr) { return arr[Math.floor(R() * arr.length)]; }
function tileAt(lv, tx, ty) { if (tx < 0 || tx >= lv.W || ty < 0 || ty >= LH) return T.E; return lv.tiles[ty * lv.W + tx]; }

// ============================================================ world state
let state = 'menu';            // menu | play | paused | complete | over | victory
let world = null, curLevel = 1, godMode = false, rotateBlocked = false;

function tAt(tx, ty) {
  const lv = world.lv;
  if (tx < 0 || tx >= lv.W) return T.STEEL;
  if (ty < 0) return lv.ceiling ? T.STEEL : T.E;
  if (ty >= LH) return T.E;
  return lv.tiles[ty * lv.W + tx];
}
const solidT = t => SOLID[t] === 1;
const solidPx = (px, py) => solidT(tAt(Math.floor(px / TS), Math.floor(py / TS)));

function newWorld(n) {
  const lv = genLevel(n);
  const wd = {
    lv, n, tiles: buildTiles(lv.th, n * 977), backdrop: buildBackdrop(lv.th, n * 31337),
    ents: [], bullets: [], parts: [], texts: [], queue: [], banners: [],
    splats: [], cam: { x: 0, y: 0 }, shake: 0, flash: 0, time: 0, kills: 0, rescues: 0, score: 0,
    lives: 3 + upLvl('lives'), grenades: 3 + upLvl('bombs'), passports: 0, phase: 'intro', phaseT: 0, checkpoint: { x: 3 * TS, y: (lv.surf[3] - 2) * TS },
    boss: null, plane: null, snow: [], cageAlly: 0, stars: [], hud: { levelT: 4 },
  };
  world = wd;
  for (const s of lv.spawns) addEnemy(s.type, s.x, s.row);
  lv.cages.forEach((c, i) => {
    const ally = lv.th.ally && i !== 1 ? lv.th.ally : ALLY_ORDER[((n - 1) + i) % (n >= 4 ? 4 : 3)];
    wd.ents.push({ kind: 'cage', x: c.x, y: c.row * TS - 22, w: 18, h: 22, ally, open: false, t: 0 });
  });
  lv.flags.forEach(f => wd.ents.push({ kind: 'flag', x: f.x, y: f.row * TS - 48, w: 8, h: 48, raised: false, rise: 0 }));
  lv.deco.forEach(d => wd.ents.push({ kind: 'flag', x: d.x, y: d.row * TS - 48, w: 8, h: 48, raised: true, rise: 1, deco: true }));
  lv.pickups.forEach(p => addPickup(p.type, p.x, p.row * TS - 12));
  for (let i = 0; i < 60; i++) wd.stars.push([Math.random(), Math.random() * 0.7, Math.random() < 0.2 ? 2 : 1]);
  wd.player = makePlayer('trump', 4 * TS, -40);
  wd.player.hidden = true;
  wd.plane = { mode: 'intro', x: -120, y: 10, dir: 1, dropped: false };
  wd.cam.x = 0; wd.cam.y = clamp((lv.surf[4] - 9) * TS, 0, LH * TS - VH);
  wd.plane.y = wd.cam.y + 8;
  GRAV = 900 * (lv.grav || 1);
  wd.tariff = 0; wd.truthT = rr(14, 22); wd.truth = null;
  Sound.play('plane');
  banner(`MISSION ${n}`, lv.name.toUpperCase(), 2.6);
  return wd;
}
function makePlayer(ch, x, y) {
  const tall = CHARS[ch].tall;
  return { kind: 'player', ch, x, y, w: 10, h: tall ? 19 : 15, vx: 0, vy: 0, face: 1, onGround: false, coyote: 0, jbuf: 0,
    wall: 0, wallLock: 0, wallLockDir: 0, fireCd: 0, hp: MAXHP(), inv: 0, anim: 0, dead: false, deadT: 0, drop: 0, hidden: false, burst: 0 };
}
const ENEMY = {
  robot: { w: 10, h: 15, hp: 4, speed: 26, range: 170, rate: 1.3, burst: 2 },
  soldier: { w: 10, h: 15, hp: 2, speed: 34, range: 150, rate: 1.6, burst: 1 },
  diver: { w: 14, h: 8, hp: 2, speed: 40, range: 150, rate: 2.2, burst: 1 },
  goon: { w: 10, h: 15, hp: 2, speed: 28, range: 150, rate: 1.5, burst: 1 },
  rocket: { w: 10, h: 15, hp: 3, speed: 22, range: 180, rate: 2.8, burst: 1 },
  heavy: { w: 12, h: 15, hp: 7, speed: 18, range: 150, rate: 2.4, burst: 4 },
  dog: { w: 13, h: 9, hp: 1, speed: 40, range: 120, rate: 0, burst: 0 },
  turret: { w: 14, h: 12, hp: 5, speed: 0, range: 170, rate: 1.7, burst: 2 },
};
function addEnemy(type, x, row) {
  const s = ENEMY[type];
  const e = { kind: 'enemy', type, x, y: row * TS - s.h, w: s.w, h: s.h, vx: 0, vy: 0, hp: s.hp, face: -1, state: 'patrol',
    alert: 0, lost: 0, fireCd: rr(0.6, 1.6), burstLeft: 0, burstT: 0, onGround: false, anim: rr(0, 4), flash: 0, barked: false };
  world.ents.push(e); return e;
}
function addPickup(type, x, y) { world.ents.push({ kind: 'pickup', type, x, y, w: 12, h: 11, vx: 0, vy: 0, bob: rr(0, 6), onGround: false }); }

// ============================================================ physics
function moveEnt(e, dt) {
  e.onGround = false; e.hitWall = 0;
  let nx = e.x + e.vx * dt;
  if (e.vx !== 0) {
    const edge = e.vx > 0 ? nx + e.w : nx;
    const tx = Math.floor(edge / TS);
    const y0 = Math.floor((e.y + 1) / TS), y1 = Math.floor((e.y + e.h - 1) / TS);
    for (let ty = y0; ty <= y1; ty++) if (solidT(tAt(tx, ty))) {
      nx = e.vx > 0 ? tx * TS - e.w - 0.001 : (tx + 1) * TS + 0.001; e.hitWall = sign(e.vx); e.vx = 0; break;
    }
  }
  e.x = nx;
  let ny = e.y + e.vy * dt;
  const x0 = Math.floor((e.x + 1) / TS), x1 = Math.floor((e.x + e.w - 1) / TS);
  if (e.vy > 0) {
    const ty = Math.floor((ny + e.h) / TS), prevBottom = e.y + e.h;
    for (let tx = x0; tx <= x1; tx++) {
      const t = tAt(tx, ty);
      if (solidT(t) || (t === T.PLANK && !(e.drop > 0) && prevBottom <= ty * TS + 0.5)) { ny = ty * TS - e.h; e.vy = 0; e.onGround = true; break; }
    }
  } else if (e.vy < 0) {
    const ty = Math.floor(ny / TS);
    for (let tx = x0; tx <= x1; tx++) if (solidT(tAt(tx, ty))) { ny = (ty + 1) * TS + 0.001; e.vy = 0; break; }
  }
  e.y = ny;
}
function inWater(px, py) {
  const lv = world.lv; if (!lv.water) return false;
  const tx = Math.floor(px / TS); if (tx < 0 || tx >= lv.W) return false;
  const wt = lv.water[tx]; return wt > 0 && py >= wt * TS + 2;
}
function wallAt(e, dir) {
  const px = dir > 0 ? e.x + e.w + 1 : e.x - 1;
  return solidPx(px, e.y + 3) || solidPx(px, e.y + e.h - 3);
}
function solidBox(x, y, w, h) { return solidPx(x, y) || solidPx(x + w, y) || solidPx(x, y + h) || solidPx(x + w, y + h); }
function lineOfSight(ax, ay, bx2, by) {
  const d = Math.hypot(bx2 - ax, by - ay), steps = Math.ceil(d / 8);
  for (let i = 1; i < steps; i++) { const t = i / steps; if (solidPx(ax + (bx2 - ax) * t, ay + (by - ay) * t)) return false; }
  return true;
}

// ============================================================ fx
function part(x, y, vx, vy, life, col, size = 1, grav = 0, type = 'px') {
  if (world.parts.length > 700) world.parts.shift();
  world.parts.push({ x, y, vx, vy, life, max: life, col, size, grav, type });
}
function floatText(x, y, text, col = '#ffd34d', size = 1, life = 1.3) { world.texts.push({ x, y, text, col, size, life, max: life }); }
function banner(text, sub, life = 2, col = '#ffd34d') { world.banners.push({ text, sub, life, max: life, col }); }
const TRUTHS = [
  'TRUTH: JUST BLEW UP A BUNKER. THE BEST BUNKER. SAD FOR THEM!',
  'TRUTH: RATINGS FOR THIS MISSION ARE THROUGH THE ROOF!',
  'TRUTH: THE SWAMP IS VERY NERVOUS. AS THEY SHOULD BE!',
  'TRUTH: EAGLES LOVE ME. EVERYBODY KNOWS IT.',
  'TRUTH: MY GRENADES ARE BIGGER AND BETTER. EVERYONE AGREES!',
  'TRUTH: FAKE NEWS WILL NOT REPORT THIS VICTORY. TOTALLY RIGGED!',
  'TRUTH: HAD A CHEESEBURGER. TREMENDOUS. PERFECT CALL.',
  'TRUTH: BUILDING A WALL RIGHT NOW. BIG. BEAUTIFUL.',
  'TRUTH: NOBODY DOES WALL JUMPS LIKE ME. NOBODY!',
  'TRUTH: GOLF SCORE TODAY? A HOLE IN ONE. EVERY HOLE.',
];
const QUIPS = ['TREMENDOUS!', 'BIGLY!', 'WINNING!', 'BELIEVE ME!', 'HUGE!', 'SO MUCH WINNING!'];
function quip(p) { floatText(cxOf(p), p.y - 10, pick(QUIPS), '#ffffff', 1, 1.2); }
function debris(tx, ty, t) {
  const col = t === T.DIRT ? world.lv.th.dirt : t === T.STONE ? world.lv.th.stone : t === T.CRATE ? '#a8743a' : t === T.BRICK ? '#9a4a32' : t === T.PLANK ? '#9a6a34' : '#888';
  for (let i = 0; i < 5; i++) part(tx * TS + rr(2, 14), ty * TS + rr(2, 14), rr(-70, 70), rr(-140, -20), rr(0.4, 0.9), col, ri(1, 3), 500, 'debris');
}
function smoke(x, y, n = 4, big = 1) { for (let i = 0; i < n; i++) part(x + rr(-6, 6) * big, y + rr(-6, 6) * big, rr(-20, 20), rr(-40, -5), rr(0.5, 1.1), '#777', rr(3, 6) * big, -10, 'smoke'); }

// ============================================================ destruction
function damageTile(tx, ty, dmg, explosive) {
  const lv = world.lv;
  if (tx < 0 || tx >= lv.W || ty < 0 || ty >= LH) return false;
  const i = ty * lv.W + tx, t = lv.tiles[i];
  if (!t || t === T.STEEL) return false;
  if (t === T.POLE && !explosive) return false;
  if (lv.hp[i] > dmg) { lv.hp[i] -= dmg; part(tx * TS + 8, ty * TS + 8, rr(-40, 40), rr(-60, 0), 0.3, '#ddd', 1, 300); return true; }
  lv.tiles[i] = 0; lv.hp[i] = 0;
  debris(tx, ty, t);
  if (t === T.BARREL) world.queue.push({ t: 0.1, x: tx * TS + 8, y: ty * TS + 8, r: 2.8, dmg: 5, hurtsPlayer: true });
  else if (t === T.CRATE && Math.random() < 0.3) addPickup(pick(['grenade', 'burger', 'grenade', 'suitcase']), tx * TS + 2, ty * TS + 4);
  else Sound.play('tile');
  return true;
}
function explode(x, y, r, opts = {}) {
  const rp = r * TS, dmg = opts.dmg || 5;
  const tx0 = Math.floor((x - rp) / TS), tx1 = Math.floor((x + rp) / TS), ty0 = Math.floor((y - rp) / TS), ty1 = Math.floor((y + rp) / TS);
  if (opts.tiles !== false) for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const d = Math.hypot(tx * TS + 8 - x, ty * TS + 8 - y);
    if (d < rp) damageTile(tx, ty, d < rp * 0.6 ? 5 : 2, true);
  }
  for (const e of world.ents) {
    if (e.dead) continue;
    const d = Math.hypot(cxOf(e) - x, cyOf(e) - y);
    if (d > rp + e.w / 2) continue;
    if (e.kind === 'enemy') hurtEnemy(e, dmg, sign(cxOf(e) - x) * 160, -220, true);
    else if (e.kind === 'boss') hurtBoss(e, Math.ceil(dmg * (opts.bossMul || 1)));
    else if (e.kind === 'mech') hurtBoss(e, Math.ceil(dmg * (opts.bossMul || 1)));
    else if (e.kind === 'bproj') e.dead = true;
  }
  const p = world.player;
  if (opts.hurtsPlayer && !p.dead && !p.hidden && Math.hypot(cxOf(p) - x, cyOf(p) - y) < rp * 0.75) hurtPlayer(1, sign(cxOf(p) - x));
  for (let i = 0; i < 14 * r; i++) { const a = rr(0, Math.PI * 2), s = rr(20, 140) * r / 2.5; part(x, y, Math.cos(a) * s, Math.sin(a) * s - 30, rr(0.25, 0.6), pick(['#fff3a0', '#ffb030', '#ff6a20', '#ffd23f']), rr(2, 4), -30, 'fire'); }
  smoke(x, y, 8 * r / 2.5, r / 2);
  world.shake = Math.min(10, world.shake + r * 2.2);
  world.flash = Math.max(world.flash, 0.08);
  Sound.play('boom');
}

// ============================================================ player
function hurtPlayer(dmg, dir = 0) {
  const p = world.player;
  if (p.dead || p.hidden || p.inv > 0 || p.maga > 0 || godMode || world.phase !== 'play' && world.phase !== 'boss') return;
  p.hp -= dmg; p.inv = 1.2; p.vx = dir * 120; p.vy = -150;
  Sound.play('hurt'); world.shake = Math.min(10, world.shake + 3);
  for (let i = 0; i < 10; i++) part(cxOf(p), cyOf(p), rr(-90, 90), rr(-160, -10), rr(0.5, 1), pick(['#b00018', '#d0102a', '#8a0012']), ri(1, 2), 600, 'blood');
  if (p.hp <= 0) killPlayer(false);
}
function killPlayer(fell) {
  const p = world.player;
  if (p.dead) return;
  p.dead = true; p.deadT = fell ? 0.9 : 1.6; p.vy = fell ? 0 : -260; p.vx = -p.face * 50;
  if (fell) p.hidden = true;
  floatText(cxOf(p), p.y - 12, 'SAD!', '#e8252f', 2, 1.6);
  Sound.play('die');
}
function respawn() {
  world.lives -= 1;
  if (world.lives <= 0) { gameOver(); return; }
  let cp = world.checkpoint;
  // Inside a locked boss arena the checkpoint is behind the wall: respawn in the arena instead.
  const a = world.lv.arena;
  if (a && a.closed) cp = { x: (a.x0 + 2) * TS, y: (a.floor - 3) * TS };
  const np = makePlayer('trump', cp.x, cp.y - 20);
  np.inv = 2.5; world.player = np;
  world.ents.forEach(e => { if (e.kind === 'bproj' && Math.abs(cxOf(e) - cp.x) < 60) e.dead = true; });
  world.grenades = Math.max(world.grenades, 2);
  floatText(cxOf(np), np.y - 14, 'BACK, BIGLY!', '#ffd34d', 1, 1.4);
}
function fireWeapon(p) {
  const wpn = WEAPONS[CHARS[p.ch].weapon];
  const mx = p.face > 0 ? p.x + p.w + 4 : p.x - 4, my = p.y + (CHARS[p.ch].tall ? 11 : 9);
  for (let i = 0; i < wpn.pellets; i++) {
    const vy = wpn.pellets > 1 ? (i / (wpn.pellets - 1) - 0.5) * wpn.spread : rr(-wpn.spread, wpn.spread) / 2;
    world.bullets.push({ x: mx, y: my, vx: p.face * wpn.speed * (wpn.pellets > 1 ? rr(0.85, 1.1) : 1), vy, owner: 'p', dmg: wpn.dmg * (1 + 0.35 * upLvl('gun')), tdmg: wpn.tdmg, life: wpn.life, pierce: wpn.pierce, col: wpn.col, hit: [] });
  }
  part(mx + p.face * 2, my, p.face * 30, 0, 0.06, '#fff8c0', 4, 0, 'flash');
  part(cxOf(p), my, -p.face * rr(20, 50), rr(-90, -50), 0.6, '#d4af37', 1, 500, 'debris');
  Sound.play(wpn.snd);
  return wpn.rate * (1 - 0.1 * upLvl('gun'));
}
function throwSpecial(p) {
  const sp = CHARS[p.ch].special;
  if (sp === 'airstrike') { callAirstrike(); floatText(cxOf(p), p.y - 12, 'AIRSTRIKE!', '#ffd34d'); return; }
  const suit = sp === 'suitcase';
  world.ents.push({ kind: 'grenade', suit, x: cxOf(p) - 3, y: p.y + 2, w: suit ? 9 : 5, h: suit ? 8 : 5, vx: p.face * (suit ? 200 : 170) + p.vx * 0.4, vy: input.up ? -300 : -190, fuse: suit ? 3 : 1.5, rot: 0 });
  Sound.play('toss');
}
function updatePlayer(p, dt) {
  if (p.dead) {
    p.deadT -= dt;
    if (!p.hidden) { p.vy = Math.min(p.vy + GRAV * dt, MAX_FALL); p.x += p.vx * dt; p.y += p.vy * dt; }
    if (p.deadT <= 0) respawn();
    return;
  }
  if (p.hidden) return;
  const ch = CHARS[p.ch];
  let mx = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (p.wallLock > 0) { p.wallLock -= dt; mx = p.wallLockDir; }
  const accel = p.onGround ? 1500 : 950;
  p.vx = approach(p.vx, mx * RUN_V * (p.coke > 0 ? 1.4 : 1), accel * dt);
  if (mx) p.face = mx;
  const inW = inWater(cxOf(p), cyOf(p));
  if (inW) {
    // swim mode: buoyant, slower, JUMP is a swim stroke (or a leap out at the surface)
    p.vy = Math.min(p.vy + GRAV * 0.18 * dt, 75); p.vx = clamp(p.vx, -82, 82);
    if (input.jumpPressed) { const atSurface = !inWater(cxOf(p), p.y - 5); p.vy = atSurface ? -JUMP_V * 0.92 : -170; input.jumpPressed = false; p.jbuf = 0; Sound.play('jump'); for (let i = 0; i < 4; i++) part(cxOf(p), p.y + 4, rr(-20, 20), rr(-50, -20), 0.6, '#d8f0ff', 1, -30); }
    if (Math.random() < 0.06) part(cxOf(p) + p.face * 4, p.y + 3, 0, -25, 0.8, '#d8f0ff', 1, -20);
    if (!p.wasWet) { p.wasWet = true; for (let i = 0; i < 8; i++) part(cxOf(p), p.y, rr(-50, 50), rr(-120, -40), 0.5, '#bfe6ff', 2, 400); }
  } else { p.vy = Math.min(p.vy + GRAV * dt, MAX_FALL); p.wasWet = false; }
  p.wall = 0;
  if (!p.onGround && mx !== 0 && wallAt(p, mx)) { p.wall = mx; if (p.vy > 55) p.vy = 55; if (Math.random() < 0.3) part(mx > 0 ? p.x + p.w : p.x, p.y + p.h, 0, -10, 0.3, '#ccc', 1, 0); }
  p.jbuf = input.jumpPressed ? 0.12 : p.jbuf - dt;
  p.coyote = p.onGround ? 0.1 : p.coyote - dt;
  if (p.jbuf > 0) {
    if (p.coyote > 0) { p.vy = -JUMP_V * (p.coke > 0 ? 1.12 : 1); p.jbuf = 0; p.coyote = 0; Sound.play('jump'); }
    else {
      const wd = wallAt(p, 1) ? 1 : wallAt(p, -1) ? -1 : 0;
      if (wd) {
        p.jbuf = 0; Sound.play('jump');
        if (mx === wd) { p.vy = -JUMP_V * 0.92; p.vx = -wd * 40; }          // climb
        else { p.vy = -JUMP_V * 0.95; p.vx = -wd * 150; p.wallLock = 0.14; p.wallLockDir = -wd; p.face = -wd; } // kick off
        for (let i = 0; i < 4; i++) part(wd > 0 ? p.x + p.w : p.x, p.y + p.h - 2, -wd * rr(10, 40), rr(-30, 10), 0.35, '#ddd', 2, 0, 'smoke');
      }
    }
  }
  if (!input.jump && p.vy < -130) p.vy = -130;
  p.drop = input.down && p.onGround ? 0.2 : p.drop - dt;
  const wasGround = p.onGround;
  moveEnt(p, dt);
  if (p.onGround && !wasGround) for (let i = 0; i < 3; i++) part(cxOf(p), p.y + p.h, rr(-30, 30), rr(-20, 0), 0.3, '#ccc', 2, 0, 'smoke');
  p.anim += Math.abs(p.vx) * dt * 0.12;
  if (p.inv > 0) p.inv -= dt;
  p.fireCd -= dt;
  if (input.fire && p.fireCd <= 0) p.fireCd = fireWeapon(p) * (p.maga > 0 ? 0.5 : 1);
  if (p.maga > 0) { p.maga -= dt; if (Math.random() < 0.6) part(p.x + rr(0, p.w), p.y + rr(0, p.h), 0, -20, 0.4, pick(['#ffd23f', '#ff4040', '#ffffff']), 1, 0, 'star'); if (p.maga <= 0) floatText(cxOf(p), p.y - 10, 'MAGA MODE OVER', '#ffffff', 0.8); }
  if (p.coke > 0) { p.coke -= dt; if (Math.abs(p.vx) > 50 && Math.random() < 0.5) part(cxOf(p) - p.face * 6, p.y + p.h - 3, -p.face * 20, -10, 0.3, '#9fd8ff', 2, 0, 'smoke'); }
  if (input.bombPressed) {
    if (world.grenades > 0) { world.grenades--; throwSpecial(p); }
    else floatText(cxOf(p), p.y - 10, 'NO BOMBS!', '#ff8080', 1, 0.8);
  }
  if (p.y > LH * TS + 24) killPlayer(true);
  // touch-damage from bosses / dogs
  for (const e of world.ents) {
    if (e.dead) continue;
    if ((e.kind === 'boss' && e.state === 'fight') || e.kind === 'mech' || (e.kind === 'enemy' && e.type === 'dog')) if (overlap(p, e)) hurtPlayer(1, sign(cxOf(p) - cxOf(e)));
  }
}

// ============================================================ enemies
function bleed(e, n, kx) {
  const robo = e.type === 'robot' || e.type === 'turret';
  const cols = robo ? ['#ffd23f', '#fff3a0', '#2a2a2a', '#3a3a3a'] : ['#b00018', '#d0102a', '#8a0012', '#e8203a'];
  const dir = sign(kx || 0);
  for (let i = 0; i < n; i++) part(cxOf(e) + rr(-3, 3), cyOf(e) + rr(-4, 4), dir * rr(20, 140) + rr(-60, 60), rr(-200, -20), rr(0.6, 1.4), pick(cols), ri(1, 2), 600, robo ? 'debris' : 'blood');
}
function hurtEnemy(e, dmg, kx, ky, explosive) {
  if (e.dead) return;
  e.hp -= dmg; e.flash = 0.08;
  if (e.state === 'patrol') { e.state = 'shoot'; e.face = sign(cxOf(world.player) - cxOf(e)) || e.face; }
  bleed(e, e.hp > 0 ? 5 : (explosive ? 34 : 22), kx);
  if (e.hp > 0) { e.vx += kx * 0.2; return; }
  e.dead = true;
  world.kills++; world.score += e.type === 'heavy' ? 300 : e.type === 'turret' ? 250 : 100;
  if (Math.random() < (e.type === 'heavy' || e.type === 'turret' ? 0.7 : 0.28)) addPickup('passport', cxOf(e) - 5, e.y - 4);
  if (e.type === 'turret') { world.queue.push({ t: 0.05, x: cxOf(e), y: cyOf(e), r: 1.6, dmg: 3 }); return; }
  const set = SPR[e.type === 'dog' ? 'dog' : e.type];
  const frame = set.hurt || set.stand;
  world.ents.push({ kind: 'corpse', spr: frame, face: e.face, x: e.x, y: e.y, w: e.w, h: e.h, vx: kx || -e.face * 60, vy: ky || -160, rot: 0, life: 2.2, onGround: false, sprH: frame.r.height, sprW: frame.r.width });
  for (let i = 0; i < 3; i++) part(cxOf(e), e.y + 2, rr(-30, 30), rr(-60, -20), 0.8, '#ffe14a', 1, 0, 'star');
  if (Math.random() < 0.18) quip(world.player);
  if (Math.random() < 0.06) addPickup(pick(['grenade', 'burger']), e.x, e.y);
}
function enemyFire(e, p) {
  if (world.tariff > 0) return;
  const mx = e.face > 0 ? e.x + e.w + 2 : e.x - 2, my = e.y + (e.type === 'turret' ? 5 : 9);
  const dx = cxOf(p) - mx, dy = cyOf(p) - my;
  if (e.type === 'rocket') {
    world.bullets.push({ x: mx, y: my - 2, vx: e.face * 120, vy: 0, owner: 'e', rocket: true, dmg: 1, life: 3, col: '#ff8a30', hit: [] });
    Sound.play('toss');
  } else {
    const sp = 170, vy = clamp(dy / Math.max(30, Math.abs(dx)) * sp, -70, 70);
    world.bullets.push({ x: mx, y: my, vx: e.face * sp, vy, owner: 'e', dmg: 1, life: 1.4, col: '#ff5a3a', hit: [] });
    Sound.play('enemyShot');
  }
  part(mx, my, 0, 0, 0.05, '#ffd080', 3, 0, 'flash');
}
function updateEnemy(e, dt) {
  const p = world.player, s = ENEMY[e.type];
  if (e.flash > 0) e.flash -= dt;
  const pcx = cxOf(p), pcy = cyOf(p), ecx = cxOf(e), ecy = cyOf(e);
  const dx = pcx - ecx, dy = pcy - ecy;
  // dormant if far off-screen
  if (Math.abs(dx) > 420) { if (e.type !== 'turret') { e.vy = Math.min(e.vy + GRAV * dt, MAX_FALL); e.vx = 0; moveEnt(e, dt); } return; }
  const visible = !p.dead && !p.hidden && world.phase !== 'intro';
  const sees = visible && Math.abs(dx) < s.range && Math.abs(dy) < 44 && (sign(dx) === e.face || e.state !== 'patrol' || Math.abs(dx) < 40) && lineOfSight(ecx, e.y + 5, pcx, p.y + 5);
  if (e.type === 'turret') {
    if (sees) { e.face = sign(dx) || e.face; e.fireCd -= dt; if (e.fireCd <= 0) { enemyFire(e, p); e.burstLeft = s.burst - 1; e.burstT = 0.15; e.fireCd = s.rate; } }
    if (e.burstLeft > 0 && (e.burstT -= dt) <= 0) { enemyFire(e, p); e.burstLeft--; e.burstT = 0.15; }
    if (!solidPx(ecx, e.y + e.h + 2)) { e.vy = Math.min(e.vy + GRAV * dt, MAX_FALL); moveEnt(e, dt); } else e.vy = 0;
    return;
  }
  if (e.type === 'diver') {
    if (inWater(ecx, ecy)) {
      e.face = sees ? (sign(dx) || e.face) : e.face;
      e.vx = sees ? e.face * s.speed : e.face * s.speed * 0.6;
      e.vy = approach(e.vy, sees ? clamp(dy, -40, 40) : Math.sin(world.time + e.anim) * 12, 120 * dt);
      if (wallAt(e, e.face)) e.face *= -1;
      if (sees && (e.fireCd -= dt) <= 0) { enemyFire(e, p); e.fireCd = s.rate; }
    } else e.vy = Math.min(e.vy + GRAV * dt, MAX_FALL);
    moveEnt(e, dt); e.anim += dt; return;
  }
  e.vy = Math.min(e.vy + GRAV * dt, MAX_FALL);
  const edgeAhead = () => { const fx = ecx + e.face * (e.w / 2 + 3), t = tAt(Math.floor(fx / TS), Math.floor((e.y + e.h + 2) / TS)); return !solidT(t) && t !== T.PLANK; };
  if (e.type === 'dog') {
    if (sees || e.state === 'chase') {
      if (!e.barked) { e.barked = true; Sound.play('bark'); floatText(ecx, e.y - 6, 'WOOF!', '#fff', 1, 0.8); }
      e.state = 'chase'; e.face = sign(dx) || e.face;
      e.vx = approach(e.vx, e.face * 150, 600 * dt);
      if (e.onGround && (e.hitWall || wallAt(e, e.face))) e.vy = -280;
      if (!visible || Math.abs(dx) > 260) e.state = 'patrol';
    } else {
      e.vx = e.face * s.speed;
      if (e.onGround && (wallAt(e, e.face) || edgeAhead())) e.face *= -1;
    }
  } else {
    if (e.state === 'patrol') {
      e.vx = e.face * s.speed;
      if (e.onGround && (wallAt(e, e.face) || edgeAhead())) { e.face *= -1; e.vx = 0; }
      if (sees) { e.state = 'alert'; e.alert = 0.45; e.face = sign(dx) || e.face; floatText(ecx, e.y - 8, '!', '#ff4040', 1.4, 0.6); Sound.play('alert'); }
    } else if (e.state === 'alert') {
      e.vx = 0; e.face = sign(dx) || e.face; e.alert -= dt;
      if (e.alert <= 0) { e.state = 'shoot'; e.fireCd = Math.min(e.fireCd, 0.2); }
    } else if (e.state === 'shoot') {
      e.vx = approach(e.vx, 0, 400 * dt);
      if (visible) e.face = sign(dx) || e.face;
      if (sees) { e.lost = 0; e.fireCd -= dt; if (e.fireCd <= 0) { enemyFire(e, p); e.burstLeft = s.burst - 1; e.burstT = 0.11; e.fireCd = s.rate * rr(0.85, 1.2); } }
      else if ((e.lost += dt) > 2.5) e.state = 'patrol';
      if (e.burstLeft > 0 && (e.burstT -= dt) <= 0) { enemyFire(e, p); e.burstLeft--; e.burstT = 0.11; }
    }
  }
  moveEnt(e, dt);
  e.anim += Math.abs(e.vx) * dt * 0.12;
  if (e.y > LH * TS + 40) e.dead = true;
}

// ============================================================ bullets
function updateBullets(dt) {
  const p = world.player;
  for (const b of world.bullets) {
    if (b.dead) continue;
    b.life -= dt; if (b.life <= 0) { b.dead = true; continue; }
    if (b.rocket) { b.vx += sign(b.vx) * 160 * dt; if (Math.random() < 0.6) part(b.x - sign(b.vx) * 5, b.y, 0, rr(-10, 10), 0.4, '#999', 2, -10, 'smoke'); }
    const steps = Math.max(1, Math.ceil(Math.abs(b.vx * dt) / 5));
    for (let s = 0; s < steps && !b.dead; s++) {
      b.x += b.vx * dt / steps; b.y += b.vy * dt / steps;
      const tx = Math.floor(b.x / TS), ty = Math.floor(b.y / TS);
      if (solidT(tAt(tx, ty))) {
        b.dead = true;
        if (b.rocket) explode(b.x, b.y, 1.6, { dmg: 3, hurtsPlayer: true });
        else { if (b.owner === 'p') damageTile(tx, ty, b.tdmg, false); for (let i = 0; i < 3; i++) part(b.x, b.y, -sign(b.vx) * rr(20, 80), rr(-60, 20), 0.2, '#ffe9a0', 1, 200); }
        break;
      }
      const bb = { x: b.x - 2, y: b.y - 1, w: 4, h: 3 };
      if (b.owner === 'p') {
        for (const e of world.ents) {
          if (e.dead || b.hit.includes(e)) continue;
          if (e.kind === 'enemy' && overlap(bb, e)) { hurtEnemy(e, b.dmg, sign(b.vx) * 90, -120); b.hit.push(e); Sound.play('hit'); }
          else if ((e.kind === 'boss' && e.state === 'fight' || e.kind === 'mech') && overlap(bb, e)) { hurtBoss(e, b.dmg); b.hit.push(e); }
          else if (e.kind === 'bproj' && overlap(bb, e)) { e.dead = true; world.score += 10; for (let i = 0; i < 4; i++) part(cxOf(e), cyOf(e), rr(-50, 50), rr(-50, 20), 0.3, '#fff', 1, 200); b.hit.push(e); }
          else continue;
          if (b.pierce-- <= 0) { b.dead = true; break; }
        }
      } else if (!p.dead && !p.hidden && overlap(bb, p)) {
        b.dead = true;
        if (b.rocket) explode(b.x, b.y, 1.6, { dmg: 3, hurtsPlayer: true }); else hurtPlayer(b.dmg, sign(b.vx));
      }
    }
  }
  world.bullets = world.bullets.filter(b => !b.dead);
}

// ============================================================ specials: grenades, eagles, airstrikes
function updateGrenade(g, dt) {
  g.vy = Math.min(g.vy + GRAV * dt, MAX_FALL);
  g.rot += g.vx * dt * 0.1;
  const nx = g.x + g.vx * dt;
  if (solidBox(nx, g.y, g.w, g.h)) { if (g.suit) return boomGrenade(g); g.vx = -g.vx * 0.45; } else g.x = nx;
  const ny = g.y + g.vy * dt;
  if (solidBox(g.x, ny, g.w, g.h)) { if (g.suit) return boomGrenade(g); g.vy = -g.vy * 0.4; g.vx *= 0.7; if (Math.abs(g.vy) < 40) g.vy = 0; } else g.y = ny;
  g.fuse -= dt;
  if (g.suit) for (const e of world.ents) if (!e.dead && (e.kind === 'enemy' || e.kind === 'boss' && e.state === 'fight' || e.kind === 'mech') && overlap(g, e)) return boomGrenade(g);
  if (g.fuse <= 0 || g.y > LH * TS) boomGrenade(g);
}
function boomGrenade(g) {
  g.dead = true;
  explode(cxOf(g), cyOf(g), (g.suit ? 2.4 : 2.6) + 0.4 * upLvl('bombs'), { dmg: g.suit ? 7 : 6, bossMul: 1.4 });
  if (g.suit) for (let i = 0; i < 10; i++) part(cxOf(g), cyOf(g), rr(-120, 120), rr(-200, -60), 1.2, pick(['#ffffff', '#d61f2b', '#1f3a8a', '#ffd23f']), 2, 400, 'debris');
}
function onScreenTargets() {
  const c = world.cam;
  return world.ents.filter(e => !e.dead && (e.kind === 'enemy' || (e.kind === 'boss' && e.state === 'fight') || e.kind === 'mech') && e.x > c.x - 10 && e.x < c.x + VW + 10 && e.y > c.y - 20 && e.y < c.y + VH + 20);
}
function summonEagles() {
  Sound.play('eagle');
  for (let i = 0; i < 3; i++) world.ents.push({ kind: 'eagle', x: world.cam.x - 20 - i * 24, y: world.cam.y + 10 + i * 10, w: 14, h: 9, vx: 160, vy: 0, life: 9, target: null, cool: i * 0.3, anim: 0 });
}
function updateEagle(a, dt) {
  a.life -= dt; a.anim += dt * 10; a.cool -= dt;
  if (a.life <= 0) { a.vy = -200; a.y += a.vy * dt; a.x += a.vx * dt; if (a.y < world.cam.y - 40) a.dead = true; return; }
  if (!a.target || a.target.dead || (a.target.kind === 'boss' && a.target.state !== 'fight')) {
    const ts = onScreenTargets(); a.target = ts.length ? pick(ts) : null;
  }
  let tx, ty;
  if (a.target && a.cool <= 0) { tx = cxOf(a.target); ty = cyOf(a.target); }
  else { const p = world.player; tx = cxOf(p) + Math.cos(a.anim * 0.3) * 40; ty = p.y - 50 + Math.sin(a.anim * 0.5) * 10; }
  const dx = tx - cxOf(a), dy = ty - cyOf(a), d = Math.hypot(dx, dy) || 1;
  const sp = a.target && a.cool <= 0 ? 280 : 170;
  a.vx = approach(a.vx, dx / d * sp, 900 * dt); a.vy = approach(a.vy, dy / d * sp, 900 * dt);
  a.x += a.vx * dt; a.y += a.vy * dt;
  if (a.target && a.cool <= 0 && overlap(a, a.target)) {
    if (a.target.kind === 'enemy') hurtEnemy(a.target, 4, sign(a.vx) * 120, -200); else hurtBoss(a.target, 4);
    a.cool = 0.8; a.vy = -220; Sound.play('eagle');
    for (let i = 0; i < 5; i++) part(cxOf(a), cyOf(a), rr(-60, 60), rr(-60, 20), 0.6, pick(['#4a2e16', '#ffffff']), 1, 200, 'debris');
  }
}
function callAirstrike() {
  Sound.play('jet');
  floatText(cxOf(world.player), world.player.y - 24, 'HEGSETH ON THE LINE!', '#9fe0ff', 1, 1.6);
  world.ents.push({ kind: 'jet', x: world.cam.x - 40, y: world.cam.y + 12, w: 28, h: 9, vx: 300, drops: 7, next: 0.25 });
}
function updateJet(j, dt) {
  j.x += j.vx * dt;
  j.next -= dt;
  if (j.drops > 0 && j.next <= 0 && j.x > world.cam.x + 20) { j.drops--; j.next = VW / 300 / 8; world.ents.push({ kind: 'bomb', x: j.x + 10, y: j.y + 8, w: 4, h: 6, vx: 60, vy: 40 }); }
  if (j.x > world.cam.x + VW + 60) j.dead = true;
}
function updateBomb(b, dt) {
  b.vy += GRAV * dt * 0.8; b.x += b.vx * dt; b.y += b.vy * dt;
  let hit = solidBox(b.x, b.y, b.w, b.h) || b.y > LH * TS;
  for (const e of world.ents) if (!e.dead && (e.kind === 'enemy' || e.kind === 'mech' || e.kind === 'boss' && e.state === 'fight') && overlap(b, e)) hit = true;
  if (hit) { b.dead = true; explode(b.x + 2, b.y + 3, 2.2, { dmg: 5 }); }
}

// ============================================================ pickups, cages, flags
function updatePickup(k, dt) {
  k.bob += dt * 4;
  if (!k.onGround) { k.vy = Math.min(k.vy + GRAV * dt, MAX_FALL); moveEnt(k, dt); }
  else if (!solidPx(k.x + 2, k.y + k.h + 2) && !solidPx(k.x + k.w - 2, k.y + k.h + 2) && tAt(Math.floor(cxOf(k) / TS), Math.floor((k.y + k.h + 2) / TS)) !== T.PLANK) k.onGround = false;
  if (k.y > LH * TS) k.dead = true;
  const p = world.player;
  if (!p.dead && !p.hidden && overlap(p, k)) {
    k.dead = true; Sound.play('pickup'); world.score += 50;
    const x = cxOf(p), y = p.y - 12;
    if (k.type === 'suitcase') { world.grenades = MAXG(); p.hp = Math.min(MAXHP(), p.hp + 1); floatText(x, y, "BARRON'S SUITCASE!", '#ffd34d'); floatText(x, y + 9, 'BOMBS FULL +HP', '#ffffff', 0.8); }
    else if (k.type === 'eagles') { summonEagles(); floatText(x, y, 'EAGLES INBOUND!', '#ffd34d'); }
    else if (k.type === 'airstrike') { callAirstrike(); }
    else if (k.type === 'burger') { p.hp = MAXHP(); floatText(x, y, 'CHEESEBURGER! FULL HP', '#ffd34d'); }
    else if (k.type === 'grenade') { world.grenades = Math.min(MAXG(), world.grenades + 2); floatText(x, y, '+2 BOMBS', '#ffd34d'); }
    else if (k.type === 'passport') { givePassports(1, x, y); }
    else if (k.type === 'maga') { p.maga = 8; floatText(x, y, 'MAGA MODE!', '#ff4040', 1.3); floatText(x, y + 10, 'INVINCIBLE · DOUBLE FIRE', '#ffffff', 0.8); Sound.play('fired'); }
    else if (k.type === 'coke') { p.coke = 10; floatText(x, y, 'DIET COKE! SPEED UP', '#ffd34d'); }
    else if (k.type === 'tariff') { world.tariff = 7; floatText(x, y, 'TARIFFS!', '#ffd34d', 1.3); for (const e of onScreenTargets()) if (e.kind === 'enemy') floatText(cxOf(e), e.y - 8, 'TARIFFED!', '#ff8a8a', 0.8, 1.6); }
    else if (k.type === 'wallkit') { buildWall(p); floatText(x, y, 'BIG BEAUTIFUL WALL!', '#ffd34d', 1.1); }
    else if (k.type === 'gold') { world.score += 250; floatText(x, y, 'GOLD! +250', '#ffd23f', 0.9, 0.9); }
  }
}
function givePassports(n, x, y) {
  world.passports += n; save.passports += n; persist();
  floatText(x, y, '+' + n + ' GOLDEN PASSPORT' + (n > 1 ? 'S' : ''), '#ffd23f', n > 4 ? 1.1 : 0.8, 1.2);
  Sound.play('pickup');
}
function buildWall(p) {
  const lv = world.lv, tx = Math.floor((cxOf(p) + p.face * 26) / TS), base = Math.floor((p.y + p.h - 1) / TS);
  for (let k = 0; k < 2; k++) for (let ty = base; ty > base - 3; ty--) {
    const x = tx + k * p.face; if (x < 0 || x >= lv.W || ty < 0) continue;
    const i = ty * lv.W + x; if (lv.tiles[i]) continue;
    lv.tiles[i] = T.BRICK; lv.hp[i] = 6; smoke(x * TS + 8, ty * TS + 8, 2);
  }
  world.shake = Math.min(10, world.shake + 2); Sound.play('tile');
}
function rescue(c) {
  const p = world.player;
  c.open = true; c.t = 0;
  world.rescues++; world.score += 500;
  world.lives = Math.min(9, world.lives + 1);
  world.grenades = MAXG();
  givePassports(3, cxOf(c), c.y - 22);
  const np = makePlayer(c.ally, p.x, p.y + p.h - (CHARS[c.ally].tall ? 19 : 15));
  np.face = p.face; np.vx = p.vx; np.inv = 1; np.fireCd = 0.2;
  world.player = np;
  Sound.play('rescue');
  floatText(cxOf(c), c.y - 14, `${CHARS[c.ally].name} RESCUED!`, '#ffd34d', 1.2, 1.8);
  floatText(cxOf(c), c.y - 4, '+1 LIFE · TREMENDOUS!', '#ffffff', 0.8, 1.8);
  for (let i = 0; i < 30; i++) part(cxOf(c), c.y + 4, rr(-120, 120), rr(-240, -60), 1.4, pick(['#d61f2b', '#ffffff', '#1f3a8a', '#ffd23f']), 2, 350, 'debris');
}

// ============================================================ bosses
function startBossFight() {
  const lv = world.lv, a = lv.arena;
  a.closed = true;
  for (let y = a.floor - 11; y < a.floor; y++) { const i = y * lv.W + a.x0 - 1; lv.tiles[i] = T.STEEL; lv.hp[i] = 255; }
  world.phase = 'boss';
  const bx = (a.x1 - 6) * TS;
  const md = MECHS[lv.boss];
  if (md) {
    const m = { kind: 'mech', variant: lv.boss, x: bx - 20, y: a.floor * TS - 50, w: 40, h: 50, vx: 0, vy: 0, hp: md.hp, maxHp: md.hp, face: -1, atkT: 2, pat: 0, anim: 0, flash: 0, onGround: false, name: md.name };
    world.ents.push(m); world.boss = m;
    banner(md.banner[0], md.banner[1], 2.6, '#e8252f');
  } else spawnBoss(lv.boss, bx, a.floor * TS);
  Sound.setMusicLevel(0.3);
}
function spawnBoss(id, x, floorY) {
  const d = BOSSES[id];
  const b = { kind: 'boss', id, spr: d.spr || id, x, y: floorY - 30, w: 18, h: 30, vx: 0, vy: 0, hp: d.hp, maxHp: d.hp, face: -1, state: 'fight', atkT: 1.8, pat: 0, anim: 0, flash: 0, onGround: false, name: d.name, t: 0, dash: 0 };
  world.ents.push(b); world.boss = b;
  banner(d.name, d.intro, 2.6, '#e8252f');
  floatText(cxOf(b), b.y - 12, d.intro, '#ffffff', 0.8, 2.6);
  return b;
}
function hurtBoss(b, dmg) {
  if (b.dead || (b.kind === 'boss' && b.state !== 'fight')) return;
  b.hp -= dmg; b.flash = 0.06; world.score += dmg * 10;
  Sound.play('bossHit');
  if (b.kind === 'boss' && Math.random() < 0.04) floatText(cxOf(b), b.y - 10, pick(BOSSES[b.id].taunts), '#ffffff', 0.8, 1);
  if (b.hp <= 0) {
    if (b.kind === 'mech') mechDestroyed(b); else bossDefeated(b);
  }
}
function bossDefeated(b) {
  b.state = 'dizzy'; b.t = 0; b.vx = 0; b.hp = 0;
  if (b.partner && b.partner.state === 'fight') { world.boss = b.partner; floatText(cxOf(b), b.y - 14, "YOU'RE FIRED!", '#ffd34d', 1.2, 2); Sound.play('fired'); world.score += 3000; return; }
  if (b.partner) b.partner.t = 1.7;
  world.score += 5000;
  givePassports(25, cxOf(b), b.y - 24);
  world.ents.forEach(e => { if (e.kind === 'bproj') e.dead = true; });
  banner("YOU'RE FIRED!", `${b.name} HAS BEEN FIRED`, 3, '#ffd34d');
  Sound.play('fired');
  world.shake = 6;
}
function mechDestroyed(m) {
  m.dead = true;
  world.score += 3000;
  for (let i = 0; i < 6; i++) world.queue.push({ t: i * 0.18, x: m.x + rr(0, m.w), y: m.y + rr(0, m.h), r: 1.8, dmg: 0, noTiles: true });
  const md = MECHS[m.variant] || MECHS.biden;
  if (md.pilot) {
    world.queue.push({ t: 1.2, spawnPilot: md.pilot, x: m.x + 10, y: m.y + m.h });
    if (md.pilot2) world.queue.push({ t: 1.3, spawnPilot: md.pilot2, x: m.x + 26, y: m.y + m.h, partner: true });
  } else {
    banner("YOU'RE FIRED!", md.fired || 'THE KRAKEN HAS BEEN CALAMARI-D', 3, '#ffd34d'); Sound.play('fired');
    world.queue.push({ t: 2.2, extract: true });
  }
  world.ents.forEach(e => { if (e.kind === 'bproj') e.dead = true; });
}
function bossProj(b, style, vx, vy, opts = {}) {
  const spr = PROJ[style];
  world.ents.push(Object.assign({ kind: 'bproj', style, x: cxOf(b) - spr.r.width / 2, y: b.y + 8, w: spr.r.width, h: spr.r.height, vx, vy, grav: 500, life: 4, rot: 0, spin: rr(-8, 8), bounces: 0 }, opts));
}
function bossAttack(b) {
  const p = world.player, dx = cxOf(p) - cxOf(b), dir = sign(dx) || -1;
  const list = b.kind === 'mech' ? (MECHS[b.variant] || MECHS.biden).attacks : BOSSES[b.id].attacks;
  const atk = list[b.pat++ % list.length];
  const ph2 = b.hp < b.maxHp / 2;
  const dist = Math.abs(dx);
  if (atk === 'notices') { Sound.play('paper'); for (let i = 0; i < (ph2 ? 5 : 3); i++) bossProj(b, 'notice', dir * (dist * 0.6 + rr(-40, 60)), -rr(180, 280), { grav: 380, flutter: true }); }
  else if (atk === 'coconuts') { for (let i = 0; i < (ph2 ? 4 : 3); i++) bossProj(b, 'coconut', dir * rr(70, 170), -rr(180, 300), { grav: 600, bouncy: true }); Sound.play('toss'); }
  else if (atk === 'wordsalad') { for (let i = 0; i < 6; i++) bossProj(b, 'letter', dir * rr(110, 170), rr(-90, 30), { grav: 40 }); Sound.play('paper'); floatText(cxOf(b), b.y - 10, 'WORD SALAD!', '#ffffff', 0.8, 1); }
  else if (atk === 'emails') { for (let i = 0; i < (ph2 ? 5 : 3); i++) bossProj(b, 'email', dir * 60, -80 - i * 40, { grav: 0, homing: 0.9 + i * 0.25, life: 4.5 }); Sound.play('paper'); }
  else if (atk === 'signs') { for (let i = 0; i < (ph2 ? 4 : 3); i++) bossProj(b, 'sign', dir * (150 + i * 30), -40 + i * 30 - 30, { grav: 60, spin: 12 }); Sound.play('toss'); }
  else if (atk === 'dash') { b.dash = 1.1; b.face = dir; floatText(cxOf(b), b.y - 10, 'TAN SUIT DASH!', '#ffd34d', 0.8, 1.1); }
  else if (atk === 'icecream') { for (let i = 0; i < (ph2 ? 6 : 4); i++) bossProj(b, 'icecream', dir * rr(60, 200), -rr(200, 330), { grav: 520 }); Sound.play('toss'); }
  else if (atk === 'shades') { bossProj(b, 'shades', dir * 260, -10, { grav: 0, boomerang: true, life: 2.6, spin: 0 }); Sound.play('toss'); }
  else if (atk === 'rockets') { for (let i = 0; i < 3; i++) world.bullets.push({ x: cxOf(b) + b.face * 22, y: b.y + 14 + i * 6, vx: b.face * (80 + i * 30), vy: -20 + i * 10, owner: 'e', rocket: true, dmg: 1, life: 3, col: '#ff8a30', hit: [] }); Sound.play('toss'); }
  else if (atk === 'redtape') { for (let i = 0; i < (ph2 ? 5 : 3); i++) bossProj(b, 'tape', dir * (130 + i * 25), -30 + i * 20 - 20, { grav: 30, spin: 3 }); Sound.play('paper'); floatText(cxOf(b), b.y - 10, 'RED TAPE!', '#ffffff', 0.8, 1); }
  else if (atk === 'medals') { for (let i = 0; i < (ph2 ? 6 : 4); i++) bossProj(b, 'medal', dir * rr(60, 200), -rr(200, 320), { grav: 540, bouncy: true }); Sound.play('toss'); }
  else if (atk === 'headlines') { for (let i = 0; i < (ph2 ? 5 : 3); i++) bossProj(b, 'fake', dir * rr(110, 190), -rr(60, 200), { grav: 260, spin: 6 }); Sound.play('paper'); floatText(cxOf(b), b.y - 10, 'FAKE NEWS!', '#ffffff', 0.8, 1); }
  else if (atk === 'mics') { for (let i = 0; i < (ph2 ? 4 : 3); i++) bossProj(b, 'mic', dir * (dist * 0.7 + rr(-30, 50)), -rr(220, 320), { grav: 560, spin: 14 }); Sound.play('toss'); }
  else if (atk === 'redact') { for (let i = 0; i < (ph2 ? 4 : 3); i++) bossProj(b, 'redact', dir * 90, -60 - i * 30, { grav: 0, homing: 1 + i * 0.3, life: 4, spin: 0 }); Sound.play('paper'); floatText(cxOf(b), b.y - 10, '[REDACTED]', '#ffffff', 0.8, 1); }
  else if (atk === 'teleprompter') { for (let i = 0; i < 2; i++) bossProj(b, 'teleprompter', dir * (120 + i * 60), -200, { grav: 500, bouncy: true }); Sound.play('toss'); }
  else if (atk === 'fireball') { for (let i = 0; i < (ph2 ? 6 : 4); i++) bossProj(b, 'fireball', dir * (140 + i * 15), -40 + i * 22 - 20, { grav: 40, spin: 10 }); Sound.play('boom'); }
  else if (atk === 'drums') { for (let i = 0; i < (ph2 ? 4 : 3); i++) bossProj(b, 'drum', dir * rr(70, 190), -rr(220, 320), { grav: 560, explode: true, spin: 6 }); Sound.play('toss'); floatText(cxOf(b), b.y - 10, 'DRILL, BARON, DRILL!', '#ffffff', 0.8, 1); }
  else if (atk === 'ink') { for (let i = 0; i < (ph2 ? 6 : 4); i++) bossProj(b, 'ink', dir * rr(60, 220), -rr(160, 320), { grav: 520 }); Sound.play('toss'); }
  else if (atk === 'stomp') { b.vy = -380; b.stomp = true; }
  else if (atk === 'summon') {
    const a = world.lv.arena;
    for (let i = 0; i < (ph2 ? 3 : 2); i++) { const e = addEnemy(pick((world.lv.th.foes || ['goon', 'goon', 'dog']).filter(t => t !== 'turret' && t !== 'diver')), (a.x0 + 2 + Math.random() * (a.x1 - a.x0 - 4)) * TS, a.floor - 9); e.state = 'shoot'; }
    floatText(cxOf(b), b.y - 10, 'GET HIM!', '#ffffff', 0.8, 1);
  }
}
function updateBoss(b, dt) {
  if (b.flash > 0) b.flash -= dt;
  b.vy = Math.min(b.vy + GRAV * dt, MAX_FALL);
  const p = world.player, dx = cxOf(p) - cxOf(b);
  if (b.kind === 'boss' && b.state !== 'fight') {
    b.t += dt; b.vx = 0; moveEnt(b, dt);
    if (Math.random() < 0.3) part(cxOf(b) + Math.cos(b.t * 8) * 10, b.y - 4 + Math.sin(b.t * 8) * 3, 0, 0, 0.2, '#ffe14a', 1, 0, 'star');
    if (b.state === 'dizzy' && b.t > 1.6 && !(b.partner && b.partner.state === 'fight')) {
      b.state = 'caged';
      world.ents.push({ kind: 'bcage', x: cxOf(b) - 17, y: world.cam.y - 50, w: 34, h: 40, vy: 0, landed: false, target: b });
    }
    return;
  }
  b.anim += dt;
  const ph2 = b.hp < b.maxHp / 2;
  const isMech = b.kind === 'mech';
  if (!b.dash) b.face = sign(dx) || b.face;
  const speed = (isMech ? 35 : 55) * (ph2 ? 1.35 : 1);
  if (b.dash > 0) {
    b.dash -= dt; b.vx = b.face * 260;
    if (b.dash <= 0 || b.hitWall) { b.dash = 0; b.vx = 0; }
    if (Math.random() < 0.5) part(cxOf(b), b.y + b.h, -b.face * 30, -10, 0.3, '#ccc', 2, 0, 'smoke');
  } else {
    const ad = Math.abs(dx);
    const target = ad > 120 ? sign(dx) : ad < 60 ? -sign(dx) : 0;
    b.vx = approach(b.vx, target * speed, 300 * dt);
    if (!isMech && b.onGround && Math.random() < (ph2 ? 0.012 : 0.007)) b.vy = -300;
    b.atkT -= dt;
    if (b.atkT <= 0 && b.onGround) { bossAttack(b); b.atkT = (ph2 ? 1.25 : 1.9) * (isMech ? 1.1 : 1); }
  }
  const was = b.onGround;
  moveEnt(b, dt);
  if (isMech && b.onGround && !was) {
    world.shake = Math.min(10, world.shake + (b.stomp ? 7 : 2));
    if (b.stomp) {
      b.stomp = false;
      for (const d of [-1, 1]) world.ents.push({ kind: 'wave', x: cxOf(b) - 6, y: b.y + b.h - 10, w: 12, h: 10, vx: d * 160, life: 2.2 });
      smoke(cxOf(b), b.y + b.h, 10, 1.4);
    }
  }
}
function updateBproj(k, dt) {
  k.life -= dt; if (k.life <= 0) { k.dead = true; return; }
  const p = world.player;
  k.rot += k.spin * dt;
  if (k.homing && !p.dead) {
    const dx = cxOf(p) - cxOf(k), dy = cyOf(p) - cyOf(k), d = Math.hypot(dx, dy) || 1;
    k.vx = approach(k.vx, dx / d * 120, k.homing * 120 * dt); k.vy = approach(k.vy, dy / d * 120, k.homing * 120 * dt);
  }
  if (k.boomerang) { k.vx -= sign(k.vx0 || (k.vx0 = k.vx)) * 340 * dt; }
  k.vy += k.grav * dt;
  if (k.flutter) { k.vy = Math.min(k.vy, 70); k.x += Math.sin(world.time * 8 + k.y) * 0.6; }
  k.x += k.vx * dt; k.y += k.vy * dt;
  if (solidBox(k.x + 1, k.y + 1, k.w - 2, k.h - 2)) {
    if (k.bouncy && k.bounces < 2) { k.bounces++; k.y -= k.vy * dt; k.vy = -Math.abs(k.vy) * 0.6; }
    else if (k.explode) { k.dead = true; explode(cxOf(k), cyOf(k), 1.7, { dmg: 3, hurtsPlayer: true }); }
    else if (!k.boomerang) { k.dead = true; for (let i = 0; i < 4; i++) part(cxOf(k), cyOf(k), rr(-40, 40), rr(-60, 0), 0.4, '#fff', 1, 300); }
  }
  if (!p.dead && !p.hidden && overlap(p, k)) { k.dead = true; if (k.explode) explode(cxOf(k), cyOf(k), 1.7, { dmg: 3, hurtsPlayer: true }); else hurtPlayer(1, sign(k.vx)); }
}
function updateWave(w, dt) {
  w.life -= dt; w.x += w.vx * dt;
  if (Math.random() < 0.7) part(cxOf(w), w.y + w.h, rr(-20, 20), rr(-120, -40), 0.4, world.lv.th.dirt, 2, 400, 'debris');
  if (w.life <= 0 || solidPx(w.vx > 0 ? w.x + w.w : w.x, w.y + 4)) w.dead = true;
  const p = world.player;
  if (!p.dead && overlap(p, w)) hurtPlayer(1, sign(w.vx));
}
function updateBcage(c, dt) {
  if (!c.landed) {
    c.vy = Math.min(c.vy + GRAV * dt, 500); c.y += c.vy * dt;
    const floor = c.target.y + c.target.h - c.h;
    if (c.y >= floor) { c.y = floor; c.landed = true; c.t = 0; world.shake = 6; Sound.play('boom'); smoke(cxOf(c), c.y + c.h, 10, 1.2); floatText(cxOf(c), c.y - 10, 'LOCKED UP!', '#ffd34d', 1, 1.6); }
  } else if ((c.t += dt) > 1.2 && (!world.plane || world.plane.mode === 'intro')) {
    callExtraction();
  }
}

// ============================================================ Trump Force One
function callExtraction() {
  const lv = world.lv;
  const zone = lv.arena ? { x: (lv.arena.x0 + lv.arena.x1) / 2 * TS, floor: lv.arena.floor } : { x: (lv.extract.x0 + 6) * TS, floor: lv.extract.floor };
  world.plane = { mode: 'arrive', x: world.cam.x + VW + 40, y: zone.floor * TS - 7 * TS - 60, tx: zone.x - 55, ty: zone.floor * TS - 7 * TS, dir: -1, ladder: 0, zone };
  Sound.play('plane');
  floatText(world.player.x, world.player.y - 20, 'TRUMP FORCE ONE INBOUND!', '#9fe0ff', 1, 2);
}
function updatePlane(dt) {
  const pl = world.plane; if (!pl) return;
  const p = world.player;
  if (pl.mode === 'intro') {
    pl.x += 170 * dt;
    if (!pl.dropped && pl.x + 55 > 4 * TS) {
      pl.dropped = true; p.hidden = false; p.x = pl.x + 55; p.y = pl.y + 24; p.vy = 40;
      floatText(p.x, p.y - 6, 'LET\'S GO!', '#ffd34d', 1, 1.2);
    }
    if (pl.dropped && p.onGround && world.phase === 'intro') { world.phase = 'play'; if (upLvl('eagle')) summonEagles(); }
    if (pl.x > world.cam.x + VW + 140) world.plane = null;
  } else if (pl.mode === 'arrive') {
    pl.x += (pl.tx - pl.x) * Math.min(1, dt * 1.6); pl.y += (pl.ty - pl.y) * Math.min(1, dt * 1.6);
    if (Math.abs(pl.tx - pl.x) < 2) { pl.mode = 'hover'; }
  } else if (pl.mode === 'hover') {
    pl.ladder = Math.min(1, pl.ladder + dt * 1.5);
    pl.y = pl.ty + Math.sin(world.time * 2) * 2;
    const lad = { x: pl.x + 50, y: pl.y + 30, w: 8, h: (pl.zone.floor * TS - (pl.y + 30)) * pl.ladder };
    if (pl.ladder >= 1 && !p.dead && !p.hidden && overlap(p, lad)) {
      p.hidden = true; pl.mode = 'leave'; pl.t = 0; world.phase = 'extract';
      Sound.play('win'); Sound.play('plane');
      floatText(lad.x, lad.y, 'WINNING!', '#ffd34d', 1.6, 2);
    }
  } else if (pl.mode === 'leave') {
    pl.t += dt; pl.ladder = Math.max(0, pl.ladder - dt * 2);
    pl.x += (90 + pl.t * 160) * dt; pl.y -= (20 + pl.t * 50) * dt;
    if (pl.t > 2.2) levelComplete();
  }
}

// ============================================================ main update
function update(dt) {
  const wd = world;
  wd.time += dt;
  readInput();
  const p = wd.player;
  updatePlayer(wd.player, dt);
  for (const e of wd.ents) {
    if (e.dead) continue;
    switch (e.kind) {
      case 'enemy': updateEnemy(e, dt); break;
      case 'pickup': updatePickup(e, dt); break;
      case 'grenade': updateGrenade(e, dt); break;
      case 'eagle': updateEagle(e, dt); break;
      case 'jet': updateJet(e, dt); break;
      case 'bomb': updateBomb(e, dt); break;
      case 'boss': case 'mech': updateBoss(e, dt); break;
      case 'bproj': updateBproj(e, dt); break;
      case 'wave': updateWave(e, dt); break;
      case 'bcage': updateBcage(e, dt); break;
      case 'cage':
        if (e.open) { e.t += dt; if (e.t > 3) e.dead = true; }
        else if (!wd.player.dead && !wd.player.hidden && overlap(wd.player, e)) rescue(e);
        break;
      case 'flag':
        if (!e.raised && !wd.player.dead && overlap(wd.player, { x: e.x - 4, y: e.y, w: e.w + 8, h: e.h })) {
          e.raised = true; wd.checkpoint = { x: e.x - 2, y: e.y + e.h - 2 };
          Sound.play('flag'); floatText(e.x, e.y - 6, 'CHECKPOINT!', '#ffd34d'); quip(wd.player); wd.score += 200;
        }
        if (e.raised) e.rise = Math.min(1, e.rise + dt * 1.5);
        break;
      case 'corpse':
        e.vy = Math.min(e.vy + GRAV * dt, MAX_FALL); moveEnt(e, dt);
        if (e.onGround) { e.vx *= 0.85; e.rot = approach(e.rot, Math.PI / 2, dt * 8); } else e.rot += dt * 6 * sign(e.vx || 1);
        e.life -= dt; if (e.life <= 0) { e.dead = true; smoke(cxOf(e), cyOf(e), 3); }
        break;
    }
  }
  updateBullets(dt);
  updatePlane(dt);
  // delayed explosions / events
  for (const q of wd.queue) {
    q.t -= dt;
    if (q.t <= 0 && !q.done) {
      q.done = true;
      if (q.extract) callExtraction();
      else if (q.spawnPilot) {
        const prev = world.boss;
        const b = spawnBoss(q.spawnPilot, q.x, q.y); b.vy = -300;
        if (q.partner && prev && prev.kind === 'boss') { b.partner = prev; prev.partner = b; world.boss = prev; }
        floatText(cxOf(b), b.y - 20, q.partner ? 'TAG TEAM!' : 'THE MECH IS BROKEN... MALARKEY!', '#ffffff', 0.8, 2);
      }
      else explode(q.x, q.y, q.r, { dmg: q.dmg, hurtsPlayer: q.hurtsPlayer, tiles: !q.noTiles });
    }
  }
  wd.queue = wd.queue.filter(q => !q.done);
  wd.ents = wd.ents.filter(e => !e.dead);
  // particles
  for (const pt of wd.parts) {
    pt.life -= dt; pt.vy += pt.grav * dt; pt.x += pt.vx * dt; pt.y += pt.vy * dt;
    if (pt.type === 'debris' && pt.vy > 0 && solidPx(pt.x, pt.y)) { pt.vy *= -0.3; pt.vx *= 0.6; pt.y -= 1; }
    else if (pt.type === 'blood' && solidPx(pt.x, pt.y)) { pt.life = 0; if (wd.splats.length > 500) wd.splats.shift(); wd.splats.push([Math.round(pt.x), Math.round(pt.y - 1), pt.col, ri(1, 3)]); }
  }
  wd.parts = wd.parts.filter(pt => pt.life > 0);
  for (const t of wd.texts) { t.life -= dt; t.y -= 18 * dt; }
  wd.texts = wd.texts.filter(t => t.life > 0);
  for (const b of wd.banners) b.life -= dt;
  wd.banners = wd.banners.filter(b => b.life > 0);
  if (wd.shake > 0) wd.shake = Math.max(0, wd.shake - dt * 18);
  if (wd.flash > 0) wd.flash -= dt;
  if (wd.hud.levelT > 0) wd.hud.levelT -= dt;
  if (wd.tariff > 0) wd.tariff -= dt;
  if (wd.truth) { wd.truth.life -= dt; if (wd.truth.life <= 0) wd.truth = null; }
  if ((wd.truthT -= dt) <= 0 && wd.phase === 'play') { wd.truthT = rr(24, 40); wd.truth = { text: pick(TRUTHS), life: 5 }; }
  // snow
  if (wd.lv.th.snow && wd.snow.length < 80) wd.snow.push({ x: Math.random() * (VW + 40), y: -4, vy: rr(15, 35), ph: rr(0, 6) });
  for (const s of wd.snow) { s.y += s.vy * dt; s.x += Math.sin(wd.time + s.ph) * 0.3 - 0.2; }
  wd.snow = wd.snow.filter(s => s.y < VH + 4);
  // triggers
  const pl = wd.player, lv = wd.lv;
  if (wd.phase === 'play' && !pl.dead && !pl.hidden) {
    if (lv.arena && !lv.arena.closed && pl.x > (lv.arena.x0 + 1) * TS) startBossFight();
    if (lv.extract && (!wd.plane || wd.plane.mode === 'intro') && pl.x > (lv.extract.x0 - 4) * TS) callExtraction();
  }
  updateCamera(dt);
  void p;
}
function updateCamera(dt) {
  const wd = world, p = wd.player, c = wd.cam, lv = wd.lv;
  let tx = cxOf(p) - VW / 2 + p.face * 28, ty = cyOf(p) - VH * 0.55;
  if (p.hidden && wd.plane && wd.phase !== 'extract') { tx = wd.plane.x + 55 - VW / 2; }
  let minX = 0, maxX = lv.W * TS - VW;
  if (lv.arena && lv.arena.closed) { minX = Math.min(maxX, (lv.arena.x0 - 1) * TS); }
  tx = clamp(tx, minX, Math.max(minX, maxX)); ty = clamp(ty, 0, LH * TS - VH);
  const k = 1 - Math.pow(0.0005, dt);
  c.x += (tx - c.x) * k * (wd.phase === 'intro' ? 0.5 : 1);
  c.y += (ty - c.y) * k * 0.8;
}

// ============================================================ canvas & layout
const cv = document.getElementById('game'), ctx = cv.getContext('2d');
const buf = mkCanvas(320, 208), bx = buf.getContext('2d');
let CW = 0, CH = 0, DPR = 1, SCALE = 1, VW = 320, VH = 208;
const safe = { t: 0, r: 0, b: 0, l: 0 };
const btns = { jump: { x: 0, y: 0, r: 40, label: 'JUMP' }, fire: { x: 0, y: 0, r: 40, label: 'FIRE' }, bomb: { x: 0, y: 0, r: 34, label: 'BOMB' } };
const pauseBtn = { x: 0, y: 0, s: 40 };
function resize() {
  DPR = Math.min(window.devicePixelRatio || 1, 2);
  CW = window.innerWidth; CH = window.innerHeight;
  cv.width = Math.round(CW * DPR); cv.height = Math.round(CH * DPR);
  SCALE = Math.min(cv.height / (13 * TS), cv.width / (16 * TS));
  VW = Math.ceil(cv.width / SCALE); VH = Math.min(LH * TS, Math.ceil(cv.height / SCALE));
  buf.width = VW; buf.height = VH;
  try {
    const cs = getComputedStyle(document.getElementById('safe'));
    safe.t = parseFloat(cs.paddingTop) || 0; safe.r = parseFloat(cs.paddingRight) || 0; safe.b = parseFloat(cs.paddingBottom) || 0; safe.l = parseFloat(cs.paddingLeft) || 0;
  } catch (e) { /* ignore */ }
  const R = clamp(Math.min(CW, CH) * 0.115, 30, 58);
  btns.jump.r = R; btns.fire.r = R * 0.92; btns.bomb.r = R * 0.72;
  btns.jump.x = CW - safe.r - R * 1.25; btns.jump.y = CH - safe.b - R * 1.25;
  btns.fire.x = btns.jump.x - R * 2.25; btns.fire.y = btns.jump.y + R * 0.2;
  btns.bomb.x = btns.jump.x - R * 0.55; btns.bomb.y = btns.jump.y - R * 2.05;
  pauseBtn.s = 40; pauseBtn.x = CW - safe.r - 50; pauseBtn.y = safe.t + 8;
  checkRotate();
}

// ============================================================ rendering (low-res world)
function drawSpr(set, x, y, face, scale = 1) {
  const img = face < 0 ? set.l : set.r;
  bx.drawImage(img, Math.round(x), Math.round(y), Math.round(img.width * scale), Math.round(img.height * scale));
}
function humanFrame(e) {
  if (!e.onGround) return e.wall ? 'slide' : 'jump';
  if (Math.abs(e.vx) > 8) return 'run' + (Math.floor(e.anim) % 4);
  return 'stand';
}
function drawEntityHuman(key, e, cx, cy, scale = 1) {
  const set = SPR[key], fr = set[humanFrame(e)] || set.stand;
  const w = fr.r.width * scale, h = fr.r.height * scale;
  drawSpr(fr, cxOf(e) - w / 2 + (e.face > 0 ? 1 : -1) * scale - cx, e.y + e.h - h - cy, e.face, scale);
}
function flashOverlay(e, cx, cy) {
  if (e.flash > 0) { bx.fillStyle = 'rgba(255,255,255,0.7)'; bx.fillRect(Math.round(e.x - cx), Math.round(e.y - cy), e.w, e.h); }
}
function drawFlag(x, y, rise, t) {
  bx.fillStyle = '#d9d9d9'; bx.fillRect(x, y, 2, 48); bx.fillStyle = '#ffd23f'; bx.fillRect(x - 1, y - 2, 4, 2);
  const fy = Math.round(y + 2 + (1 - rise) * 36);
  for (let c = 0; c < 14; c++) {
    const wv = Math.round(Math.sin(t * 6 + c * 0.6) * (c / 14) * 1.5);
    for (let r = 0; r < 9; r++) {
      let col = r % 2 === 0 ? '#c8102e' : '#ffffff';
      if (c < 6 && r < 5) col = (c + r) % 2 === 0 ? '#ffffff' : '#1c3f8f';
      bx.fillStyle = col; bx.fillRect(x + 2 + c, fy + r + wv, 1, 1);
    }
  }
}
function drawCage(x, y, w, h, inner, t) {
  if (inner) inner();
  bx.fillStyle = '#5a5a60'; bx.fillRect(x, y, w, 2); bx.fillRect(x, y + h - 2, w, 2);
  bx.fillStyle = '#9a9aa4'; for (let i = 0; i <= w - 2; i += 3) bx.fillRect(x + i, y + 2, 1, h - 4);
  bx.fillStyle = '#ffd23f'; bx.fillRect(x + w / 2 - 1, y - 3, 2, 3);
}
function drawKraken(m, cx, cy) {
  const x0 = Math.round(m.x - cx), y0 = Math.round(m.y - cy), t = m.anim;
  for (let i = 0; i < 6; i++) { const lx = x0 + 2 + i * 7; for (let k = 0; k < 6; k++) { const wv = Math.round(Math.sin(t * 5 + i + k * 0.7) * 2); bx.fillStyle = k % 2 ? '#3a6a3a' : '#4a8a4a'; bx.fillRect(lx + wv, y0 + 30 + k * 3, 4, 3); } }
  bx.fillStyle = '#4a8a4a'; bx.beginPath(); bx.ellipse(x0 + 20, y0 + 18, 19, 17, 0, 0, Math.PI * 2); bx.fill();
  bx.fillStyle = '#5aa05a'; bx.fillRect(x0 + 8, y0 + 4, 10, 4);
  bx.fillStyle = '#ffffff'; bx.fillRect(x0 + 10, y0 + 16, 7, 7); bx.fillRect(x0 + 23, y0 + 16, 7, 7);
  const ex = m.face > 0 ? 3 : 0; bx.fillStyle = '#111'; bx.fillRect(x0 + 11 + ex, y0 + 18, 3, 3); bx.fillRect(x0 + 24 + ex, y0 + 18, 3, 3);
  bx.fillStyle = '#2a4a2a'; bx.fillRect(x0 + 14, y0 + 27, 12, 2);
  bx.fillStyle = '#d4af37'; bx.fillRect(x0 + 6, y0 + 9, 28, 2);
  if (m.flash > 0) { bx.fillStyle = 'rgba(255,255,255,0.6)'; bx.fillRect(x0, y0, 40, 50); }
}
function drawMachine(m, cx, cy) {
  const x0 = Math.round(m.x - cx), y0 = Math.round(m.y - cy), f = m.face, t = m.anim;
  const R = (lx, ly, w, h, col) => { bx.fillStyle = col; bx.fillRect(f > 0 ? x0 + lx : x0 + 40 - lx - w, y0 + ly, w, h); };
  if (m.variant === 'paradetank') {
    R(-4, 38, 48, 12, '#2a2e22'); for (let k = 0; k < 6; k++) R(-2 + k * 8 + (Math.floor(t * 8) % 2), 42, 5, 5, '#55594a');
    R(-2, 26, 44, 13, '#5a6a3a'); R(-2, 26, 44, 2, '#7a8a5a'); R(6, 12, 26, 15, '#4f5e32'); R(6, 12, 26, 2, '#6f7e52');
    R(30, 16, 24, 5, '#3f4a2a'); R(52, 15, 4, 7, '#2a2e22'); R(12, 6, 3, 6, '#3f4a2a');
    for (let k = 0; k < 5; k++) R(4 + k * 7, 30, 4, 4, k % 2 ? '#c8102e' : '#ffd23f');
    R(14, 16, 8, 4, '#9fd8ff');
  } else if (m.variant === 'robodragon') {
    const wv = k => Math.round(Math.sin(t * 4 + k) * 2);
    for (let k = 0; k < 5; k++) R(k * 6, 26 + wv(k), 8, 10, k % 2 ? '#d4af37' : '#c8102e');
    R(4, 36, 4, 14, '#8a8f99'); R(22, 36, 4, 14, '#8a8f99'); R(2, 48, 8, 2, '#555'); R(20, 48, 8, 2, '#555');
    R(24, 6, 22, 18, '#c8102e'); R(24, 6, 22, 3, '#ff4a4a'); R(40, 20, 10, 4, '#d4af37'); R(42, 24, 8, 2, '#8a0a1e');
    R(36, 10, 4, 4, '#3ad0ff'); R(26, 2, 3, 5, '#d4af37'); R(32, 1, 3, 6, '#d4af37'); R(46, 12, 8, 1, '#d4af37'); R(46, 16, 6, 1, '#d4af37');
    R(-6, 22, 8, 4, '#d4af37');
  } else {
    R(0, 38, 40, 12, '#1a1a1a'); for (let k = 0; k < 40; k += 8) R(k, 38, 4, 12, '#ffd23f');
    R(4, 0, 3, 38, '#3a3430'); R(24, 0, 3, 38, '#3a3430'); R(4, 0, 23, 3, '#3a3430'); for (let k = 6; k < 38; k += 8) R(4, k, 23, 1, '#3a3430');
    R(28, 18, 14, 20, '#5a4a3a'); R(30, 20, 10, 6, '#9fd8ff'); R(29, 10, 12, 3, '#111'); R(31, 4, 8, 7, '#111'); R(31, 9, 8, 1, '#c8102e');
    const sp = Math.floor(t * 12) % 3; R(13 + sp, 50, 6 - sp, 4, '#8a8f99'); R(14, 54, 4, 3, '#5a5f69');
    R(-6, 24, 10, 14, '#2a2a2a'); R(-6, 28, 10, 2, '#555');
  }
  if (m.flash > 0) { bx.fillStyle = 'rgba(255,255,255,0.6)'; bx.fillRect(x0, y0, 40, 50); }
}
function drawMech(m, cx, cy) {
  if (m.variant === 'kraken') return drawKraken(m, cx, cy);
  if (m.variant === 'paradetank' || m.variant === 'robodragon' || m.variant === 'drillrig') return drawMachine(m, cx, cy);
  const x0 = Math.round(m.x - cx), y0 = Math.round(m.y - cy), f = m.face;
  const R = (lx, ly, w, h, col) => { bx.fillStyle = col; bx.fillRect(f > 0 ? x0 + lx : x0 + 40 - lx - w, y0 + ly, w, h); };
  const st = Math.abs(m.vx) > 5 ? Math.sin(m.anim * 7) * 2 : 0;
  R(6, 30 + st, 8, 16, '#3a4426'); R(26, 30 - st, 8, 16, '#3a4426');
  R(3, 46, 13, 4, '#262c1a'); R(23, 46, 13, 4, '#262c1a');
  R(5, 26, 30, 6, '#4a5532');
  R(-4, 10, 8, 12, '#4a4a50'); R(-3, 11, 2, 2, '#c8102e'); R(-3, 15, 2, 2, '#c8102e'); R(-3, 19, 2, 2, '#c8102e');
  R(2, 6, 36, 22, '#556b2f'); R(2, 22, 36, 6, '#3f4f22'); R(2, 6, 36, 2, '#6f8a3f');
  R(5, 24, 2, 5, '#6fae3a'); R(30, 24, 2, 7, '#6fae3a'); R(18, 26, 2, 4, '#6fae3a');
  R(16, 8, 16, 12, '#7fc8ef'); R(16, 8, 16, 1, '#d0f0ff');
  const md = MECHS[m.variant] || MECHS.biden;
  (md.heads || []).forEach((hk, i) => { const hs = SPR[hk]; const hx = md.heads.length > 1 ? 15 + i * 9 : 19; bx.drawImage(f > 0 ? hs.head : hs.headL, f > 0 ? x0 + hx : x0 + 40 - hx - 9, y0 + 10); });
  if (m.variant === 'emperor') { R(8, -6, 24, 5, '#f5c400'); R(8, -10, 4, 4, '#f5c400'); R(18, -12, 4, 6, '#f5c400'); R(28, -10, 4, 4, '#f5c400'); R(19, -9, 2, 2, '#1c3f8f'); R(2, 6, 36, 2, '#a0283a'); }
  R(12, 1, 16, 5, '#f5c400'); R(12, -2, 3, 3, '#f5c400'); R(18, -3, 4, 4, '#f5c400'); R(25, -2, 3, 3, '#f5c400'); R(19, 2, 2, 2, '#c8102e');
  R(34, 13, 9, 7, '#333'); R(43, 15, 5, 3, '#222');
  if (m.flash > 0) { bx.fillStyle = 'rgba(255,255,255,0.6)'; bx.fillRect(x0, y0, 40, 50); }
}
function drawProp(kind, x, y, t) {
  const R = (lx, ly, w, h, col) => { bx.fillStyle = col; bx.fillRect(x + lx, y + ly, w, h); };
  if (kind === 'pin') { R(2, -28, 1, 28, '#eee'); R(3, -28, 8, 5, '#c8102e'); R(3, -26, 8, 1, '#a00c24'); R(0, -1, 5, 1, '#2a2a2a'); }
  else if (kind === 'cart') { R(0, -10, 22, 6, '#f4f4f4'); R(2, -16, 1, 6, '#888'); R(17, -16, 1, 6, '#888'); R(1, -17, 18, 2, '#1c3f8f'); R(2, -4, 4, 4, '#222'); R(15, -4, 4, 4, '#222'); R(18, -9, 3, 2, '#ffd23f'); }
  else if (kind === 'toilet') { R(1, -14, 8, 6, '#d4af37'); R(0, -8, 12, 3, '#f5c400'); R(2, -5, 7, 5, '#d4a017'); R(2, -13, 6, 1, '#ffe07a'); R(1, -8, 10, 1, '#fff6c0'); }
  else if (kind === 'crane') { R(4, -60, 3, 60, '#e8b830'); R(4, -60, 30, 3, '#e8b830'); R(-8, -60, 12, 3, '#e8b830'); R(-8, -57, 5, 6, '#555'); R(30, -57, 1, 22, '#333'); R(26, -35, 9, 6, '#9a4a32'); for (let k = 0; k < 60; k += 6) R(5, -60 + k, 1, 3, '#8a6a20'); }
  else if (kind === 'tv') { R(0, -26, 24, 18, '#0a0a14'); R(2, -24, 20, 14, '#2a4ab0'); R(2, -14, 20, 4, '#c8102e'); R(11, -8, 2, 8, '#333'); R(6, -1, 12, 1, '#333'); if ((t * 2 | 0) % 2) R(4, -21, 4, 4, '#ffffff'); R(10, -21, 10, 1, '#ffffff'); R(10, -18, 8, 1, '#ffffff'); }
  else if (kind === 'crowd') { for (let i = 0; i < 6; i++) { const bob = Math.round(Math.sin(t * 6 + i) * 1); R(i * 5, -12 + bob, 4, 12, ['#3a3a5a', '#5a3a3a', '#3a5a3a'][i % 3]); R(i * 5 + 1, -15 + bob, 3, 3, '#e0a880'); if (i % 2 === 0) { R(i * 5 - 1, -22 + bob, 8, 5, i % 4 ? '#c8102e' : '#1c3f8f'); R(i * 5 + 1, -21 + bob, 4, 1, '#ffffff'); R(i * 5 + 2, -17 + bob, 1, 3, '#7a5226'); } } }
  else if (kind === 'podium') { R(0, -12, 12, 12, '#7a5226'); R(0, -12, 12, 2, '#9a6a34'); R(3, -8, 6, 4, '#1c3f8f'); R(5, -7, 2, 2, '#d4af37'); R(5, -16, 1, 4, '#333'); }
  else if (kind === 'escalator') { for (let k = 0; k < 6; k++) R(k * 4, -k * 4 - 4, 6, 4, k % 2 ? '#d4af37' : '#f5c400'); R(0, -28, 1, 24, '#d4af37'); R(24, -28, 1, 4, '#d4af37'); R(-2, -2, 30, 2, '#a07a20'); }
  else if (kind === 'rocket') { R(4, -30, 8, 26, '#f4f4f4'); R(5, -36, 6, 6, '#f4f4f4'); R(7, -39, 2, 3, '#c8102e'); R(4, -18, 8, 2, '#c8102e'); R(5, -26, 6, 4, '#1c3f8f'); R(1, -8, 3, 8, '#9aa2b0'); R(12, -8, 3, 8, '#9aa2b0'); R(4, -4, 8, 4, '#555'); }
  else if (kind === 'truck') { R(0, -10, 30, 7, '#c8ccd4'); R(4, -15, 18, 5, '#b8bcc4'); R(6, -14, 12, 3, '#2a2e36'); R(0, -4, 30, 1, '#8a8f99'); R(3, -4, 5, 4, '#1a1a1a'); R(22, -4, 5, 4, '#1a1a1a'); R(28, -9, 2, 2, '#ff3a3a'); R(0, -9, 2, 1, '#e8f4ff'); }
  else if (kind === 'charger') { R(2, -20, 8, 20, '#e8e8ee'); R(3, -18, 6, 6, '#c8102e'); R(4, -10, 4, 1, '#3ad0ff'); R(9, -14, 3, 1, '#333'); R(11, -14, 1, 10, '#333'); }
  else if (kind === 'robotarm') { R(0, -6, 12, 6, '#555'); R(4, -22, 4, 16, '#c8102e'); R(4, -24, 16, 4, '#c8102e'); R(18, -24, 3, 10, '#c8102e'); R(16, -14, 7, 3, '#e8e8ee'); }
  else if (kind === 'banner') { R(1, -40, 2, 40, '#888'); R(3, -38, 14, 22, '#c8102e'); R(3, -38, 14, 2, '#a00c24'); R(8, -32, 4, 4, '#ffd23f'); }
  else if (kind === 'lantern') { R(5, -34, 1, 6, '#333'); R(1, -28, 9, 10, '#e8202a'); R(0, -26, 11, 6, '#ff3a3a'); R(3, -18, 5, 2, '#ffd23f'); R(5, -16, 1, 4, '#ffd23f'); R(1, -28, 9, 1, '#ffd23f'); }
  else if (kind === 'derrick') { R(0, -2, 22, 2, '#2a2420'); R(2, -40, 2, 40, '#3a3430'); R(18, -40, 2, 40, '#3a3430'); R(2, -40, 18, 2, '#3a3430'); for (let k = 0; k < 40; k += 8) R(2, -40 + k, 18, 1, '#3a3430'); R(9, -46, 4, 6, '#3a3430'); R(6, -8, 10, 6, '#1a1a1a'); }
  else if (kind === 'sign') { R(5, -18, 2, 18, '#7a5226'); R(-2, -26, 16, 10, '#c8102e'); R(-1, -25, 14, 8, '#c8102e'); R(0, -24, 2, 6, '#fff'); R(3, -24, 3, 6, '#fff'); R(7, -24, 2, 6, '#fff'); R(10, -24, 2, 6, '#fff'); R(0, -21, 2, 1, '#c8102e'); R(4, -22, 1, 2, '#c8102e'); }
}
function drawBackground(cx, cy) {
  const th = world.lv.th;
  const g = bx.createLinearGradient(0, 0, 0, VH);
  g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
  bx.fillStyle = g; bx.fillRect(0, 0, VW, VH);
  if (th.stars) { bx.fillStyle = '#ffffff'; for (const s of world.stars) bx.fillRect(Math.floor(s[0] * VW), Math.floor(s[1] * VH), s[2] === 2 && (world.time * 2 | 0) % 3 === 0 ? 1 : s[2] === 2 ? 2 : 1, 1); }
  if (th.bg === 'palms' || th.bg === 'dunes' || th.bg === 'village') { bx.fillStyle = 'rgba(255,240,180,0.9)'; bx.beginPath(); bx.arc(VW * 0.78, 34, 14, 0, Math.PI * 2); bx.fill(); }
  if (th.bg === 'city' || th.bg === 'swampcity') { bx.fillStyle = '#f4f0d8'; bx.beginPath(); bx.arc(VW * 0.8, 30, 10, 0, Math.PI * 2); bx.fill(); }
  const bd = world.backdrop;
  const maxCY = LH * TS - VH;
  const off = (maxCY - cy);
  [[bd.far, 0.15, 0.25], [bd.near, 0.35, 0.5]].forEach(([img, px, py]) => {
    const y = VH - bd.H + Math.round(off * py * 0.5) + 20;
    let x = -Math.round(cx * px) % bd.W; if (x > 0) x -= bd.W;
    for (; x < VW; x += bd.W) bx.drawImage(img, x, y);
    if (y + bd.H < VH) { bx.fillStyle = img === bd.far ? world.lv.th.far : world.lv.th.near; bx.fillRect(0, y + bd.H, VW, VH - y - bd.H); }
  });
}
function drawTiles(cx, cy) {
  const lv = world.lv, tl = world.tiles;
  const tx0 = Math.max(0, Math.floor(cx / TS)), tx1 = Math.min(lv.W - 1, Math.floor((cx + VW) / TS));
  const ty0 = Math.max(0, Math.floor(cy / TS)), ty1 = Math.min(LH - 1, Math.floor((cy + VH) / TS));
  for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
    const i = ty * lv.W + tx, t = lv.tiles[i];
    const sx = tx * TS - cx, sy = ty * TS - cy;
    if (!t) { if (lv.back[i]) bx.drawImage(tl.back, sx, sy); continue; }
    if (lv.back[i] && (t === T.POLE || t === T.PLANK || t === T.BARREL)) bx.drawImage(tl.back, sx, sy);
    let img = tl[t];
    if (t === T.DIRT && ty > 0 && !solidT(lv.tiles[i - lv.W])) img = tl.top;
    bx.drawImage(img, sx, sy);
    const mh = TILE_HP[t];
    if (mh > 1 && mh < 255 && lv.hp[i] < mh) bx.drawImage(tl.cracks[Math.min(2, Math.floor((1 - lv.hp[i] / mh) * 3))], sx, sy);
  }
}
function render() {
  const wd = world;
  if (!wd) return;
  const sh = wd.shake;
  const cx = Math.round(wd.cam.x + (sh ? rr(-sh, sh) : 0)), cy = Math.round(wd.cam.y + (sh ? rr(-sh, sh) : 0));
  bx.imageSmoothingEnabled = false;
  drawBackground(cx, cy);
  drawTiles(cx, cy);
  for (const sp of wd.splats) { const sx = sp[0] - cx, sy = sp[1] - cy; if (sx < -4 || sx > VW + 4 || sy < -4 || sy > VH + 4) continue; if (!solidPx(sp[0], sp[1] + 1) && !solidPx(sp[0], sp[1] - 1) && !solidPx(sp[0] + 1, sp[1])) continue; bx.fillStyle = sp[2]; bx.fillRect(sx, sy, sp[3], 1); }
  const p = wd.player;
  for (const pr of wd.lv.props) { const px = pr.x - cx, py = pr.row * TS - cy; if (px > -70 && px < VW + 40 && py > -10 && py < VH + 70) drawProp(pr.kind, px, py, wd.time); }
  // entities, back to front
  for (const e of wd.ents) {
    const ex = Math.round(e.x - cx), ey = Math.round(e.y - cy);
    if (ex < -120 || ex > VW + 120 || ey < -120 || ey > VH + 120) continue;
    switch (e.kind) {
      case 'flag': drawFlag(ex, ey, e.rise, wd.time); break;
      case 'propx': break;
      case 'cage':
        if (e.open) { bx.globalAlpha = Math.max(0, 1 - e.t / 3); drawCage(ex, ey - e.t * 30, e.w, e.h); bx.globalAlpha = 1; }
        else drawCage(ex, ey, e.w, e.h, () => { const s = SPR[e.ally].stand; bx.drawImage(s.r, ex + 1, ey + e.h - 2 - s.r.height); });
        if (!e.open) { bx.fillStyle = '#ffffff'; if ((wd.time * 2 | 0) % 2) { bx.fillRect(ex + 7, ey - 9, 4, 1); bx.fillRect(ex + 8, ey - 8, 2, 2); } }
        break;
      case 'pickup': drawSpr(PICK[e.type], ex, ey - (e.onGround ? Math.abs(Math.sin(e.bob)) * 2 : 0), 1); break;
    }
  }
  for (const e of wd.ents) {
    const ex = Math.round(e.x - cx), ey = Math.round(e.y - cy);
    if (ex < -120 || ex > VW + 120 || ey < -140 || ey > VH + 120) continue;
    switch (e.kind) {
      case 'enemy':
        if (e.type === 'diver') drawSpr(SPR.diver.stand, ex - 1, ey, e.face);
        else if (e.type === 'dog') drawSpr(SPR.dog[Math.abs(e.vx) > 5 ? 'run' + (Math.floor(e.anim) % 2) : 'stand'], ex - 1, ey - 1, e.face);
        else if (e.type === 'turret') drawSpr(SPR.turret.stand, ex - 2, ey, e.face);
        else drawEntityHuman(e.type, e, cx, cy);
        flashOverlay(e, cx, cy);
        if (e.state === 'alert') { bx.fillStyle = '#ff3030'; bx.fillRect(ex + e.w / 2 - 1, ey - 9, 2, 5); bx.fillRect(ex + e.w / 2 - 1, ey - 3, 2, 1); }
        break;
      case 'corpse': {
        const img = e.face < 0 ? e.spr.l : e.spr.r;
        bx.save(); bx.globalAlpha = Math.min(1, e.life * 2); bx.translate(ex + e.w / 2, ey + e.h - 4); bx.rotate(e.rot * (e.face > 0 ? -1 : 1)); bx.drawImage(img, -img.width / 2, -img.height + 4); bx.restore();
        break;
      }
      case 'boss': {
        const sc = 1.75;
        if (e.state === 'caged') { drawEntityHuman(e.spr, Object.assign({}, e, { vx: 0, onGround: true }), cx, cy, sc); break; }
        drawEntityHuman(e.spr, e.state === 'fight' ? e : Object.assign({}, e, { vx: 0, onGround: true }), cx, cy, sc);
        flashOverlay(e, cx, cy);
        break;
      }
      case 'mech': drawMech(e, cx, cy); break;
      case 'bcage': drawCage(ex, ey, e.w, e.h); break;
      case 'grenade': {
        const s = e.suit ? SUITCASE_SPR : GRENADE_SPR;
        drawSpr(s, ex, ey, 1);
        if (!e.suit && (wd.time * 10 | 0) % 2) { bx.fillStyle = '#ff3030'; bx.fillRect(ex + 2, ey - 1, 1, 1); }
        break;
      }
      case 'bproj': {
        const img = PROJ[e.style].r;
        bx.save(); bx.translate(ex + e.w / 2, ey + e.h / 2); bx.rotate(e.rot); bx.drawImage(img, -img.width / 2, -img.height / 2); bx.restore();
        break;
      }
      case 'eagle': drawSpr(SPR.eagle[(e.anim | 0) % 2 ? 'up' : 'down'], ex, ey, sign(e.vx) || 1); break;
      case 'jet': drawSpr(SPR.jet, ex, ey, 1); break;
      case 'bomb': bx.fillStyle = '#333'; bx.fillRect(ex, ey, 4, 6); bx.fillStyle = '#888'; bx.fillRect(ex, ey, 4, 1); break;
      case 'wave': bx.fillStyle = '#d9b56a'; bx.fillRect(ex, ey + 4, e.w, 6); bx.fillStyle = '#fff3a0'; bx.fillRect(ex + 3, ey + 2, 6, 2); break;
    }
  }
  // player
  if (!p.hidden && !(p.inv > 0 && !p.dead && (wd.time * 20 | 0) % 2)) {
    if (p.dead) {
      const fr = SPR[p.ch].hurt;
      drawSpr(fr, cxOf(p) - 9 - cx, p.y + p.h - fr.r.height - cy, p.face);
    } else drawEntityHuman(p.ch, p, cx, cy);
  }
  // bullets
  for (const b of wd.bullets) {
    const x = Math.round(b.x - cx), y = Math.round(b.y - cy);
    if (b.rocket) { drawSpr(PROJ.rocket, x - 5, y - 2, sign(b.vx)); continue; }
    bx.fillStyle = b.col; bx.fillRect(x - 2, y - 1, 4, 2);
    if (b.owner === 'p') { bx.fillStyle = 'rgba(255,240,160,0.5)'; bx.fillRect(x - 2 - sign(b.vx) * 4, y - 1, 4, 2); }
  }
  // plane & ladder
  const pl = wd.plane;
  if (pl) {
    const x = Math.round(pl.x - cx), y = Math.round(pl.y - cy);
    if (pl.ladder > 0) {
      const top = y + 30, len = (pl.zone.floor * TS - (pl.y + 30)) * pl.ladder;
      bx.fillStyle = '#c8a050'; bx.fillRect(x + 50, top, 1, len); bx.fillRect(x + 57, top, 1, len);
      for (let ly = 4; ly < len; ly += 5) bx.fillRect(x + 50, top + ly, 8, 1);
    }
    bx.drawImage(pl.dir < 0 ? PLANE.l : PLANE.r, x, y);
  }
  // particles
  for (const pt of wd.parts) {
    const x = pt.x - cx, y = pt.y - cy, a = pt.life / pt.max;
    if (pt.type === 'smoke') { bx.globalAlpha = a * 0.6; bx.fillStyle = pt.col; const s = pt.size * (1.6 - a); bx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), Math.ceil(s), Math.ceil(s)); bx.globalAlpha = 1; }
    else if (pt.type === 'fire') { bx.fillStyle = a > 0.6 ? '#fff3a0' : a > 0.3 ? pt.col : '#a03010'; const s = Math.max(1, pt.size * a + 1); bx.fillRect(Math.round(x - s / 2), Math.round(y - s / 2), Math.ceil(s), Math.ceil(s)); }
    else if (pt.type === 'flash') { bx.fillStyle = pt.col; bx.fillRect(Math.round(x - pt.size / 2), Math.round(y - pt.size / 2), pt.size, pt.size); }
    else if (pt.type === 'star') { bx.fillStyle = pt.col; bx.fillRect(Math.round(x), Math.round(y) - 1, 1, 3); bx.fillRect(Math.round(x) - 1, Math.round(y), 3, 1); }
    else { bx.fillStyle = pt.col; bx.fillRect(Math.round(x), Math.round(y), pt.size, pt.size); }
  }
  if (wd.lv.water) {
    const wl = wd.lv.water, t0 = Math.max(0, Math.floor(cx / TS)), t1 = Math.min(wd.lv.W - 1, Math.floor((cx + VW) / TS));
    for (let tx = t0; tx <= t1; tx++) { const wt = wl[tx]; if (!wt) continue; const sy = wt * TS - cy, sx = tx * TS - cx;
      bx.fillStyle = 'rgba(40,130,240,0.36)'; bx.fillRect(sx, sy, TS, VH - sy);
      bx.fillStyle = 'rgba(220,245,255,0.85)'; for (let k = 0; k < TS; k += 4) bx.fillRect(sx + k, sy + Math.round(Math.sin(wd.time * 3 + (tx * TS + k) * 0.2)), 3, 1); }
  }
  if (wd.lv.th.snow) { bx.fillStyle = '#ffffff'; for (const s of wd.snow) bx.fillRect(Math.round(s.x), Math.round(s.y), 1, 1); }
  if (wd.lv.n === 9) { const gr = bx.createRadialGradient(cxOf(p) - cx, cyOf(p) - cy, 40, cxOf(p) - cx, cyOf(p) - cy, VW * 0.7); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.55)'); bx.fillStyle = gr; bx.fillRect(0, 0, VW, VH); }
  if (wd.flash > 0) { bx.fillStyle = `rgba(255,240,200,${wd.flash * 2})`; bx.fillRect(0, 0, VW, VH); }
  // blit
  ctx.imageSmoothingEnabled = false;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(buf, 0, 0, VW, VH, 0, 0, VW * SCALE, VH * SCALE);
  drawOverlay(cx, cy);
}

// ============================================================ overlay (full resolution): text, HUD, touch
const FONT = '"Press Start 2P", ui-monospace, monospace';
function outlinedText(txt, x, y, size, col, align = 'center') {
  ctx.font = `${Math.round(size)}px ${FONT}`; ctx.textAlign = align; ctx.textBaseline = 'middle';
  ctx.lineWidth = Math.max(2, size / 3.5); ctx.strokeStyle = '#000'; ctx.lineJoin = 'round';
  ctx.strokeText(txt, x, y); ctx.fillStyle = col; ctx.fillText(txt, x, y);
}
function heart(x, y, s, full) {
  const m = [' XX XX ', 'XXXXXXX', 'XXXXXXX', ' XXXXX ', '  XXX  ', '   X   '];
  ctx.fillStyle = '#000'; ctx.fillRect(x - s, y - s, 7 * s + 2 * s, 6 * s + 2 * s);
  m.forEach((row, ry) => { for (let rx = 0; rx < 7; rx++) if (row[rx] === 'X') { ctx.fillStyle = full ? (ry === 1 && rx < 3 ? '#ff8a8a' : '#e8252f') : '#444'; ctx.fillRect(x + rx * s, y + ry * s, s, s); } });
}
function drawOverlay(cx, cy) {
  const wd = world;
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  const k = SCALE / DPR; // world px -> css px
  // floating texts
  for (const t of wd.texts) {
    const a = Math.min(1, t.life / t.max * 2.5);
    ctx.globalAlpha = a;
    outlinedText(t.text, (t.x - cx) * k, (t.y - cy) * k, clamp(k * 3.2, 8, 15) * t.size, t.col);
  }
  ctx.globalAlpha = 1;
  // HUD
  const s = clamp(CH / 140, 2, 4);
  const L = safe.l + 12, Tp = safe.t + 10;
  const p = wd.player;
  const head = SPR[p.ch].head;
  ctx.fillStyle = 'rgba(0,0,20,0.45)'; ctx.fillRect(L - 6, Tp - 6, s * 46 + 12, s * 18 + 12);
  ctx.drawImage(head, L, Tp, 9 * s, 8 * s);
  outlinedText('x' + wd.lives, L + 10 * s, Tp + 4 * s, s * 4, '#ffffff', 'left');
  const mh = MAXHP(); for (let i = 0; i < mh; i++) heart(L + 22 * s + (i % 3) * 8 * s + Math.floor(i / 3) * 25 * s, Tp + 1 * s, s * 0.9, i < Math.max(0, p.hp));
  for (let i = 0; i < 5; i++) {
    const gx = L + i * 7 * s, gy = Tp + 11 * s;
    ctx.fillStyle = i < wd.grenades ? '#3f5a2a' : 'rgba(255,255,255,0.15)'; ctx.fillRect(gx, gy + s, 5 * s, 5 * s);
    ctx.fillStyle = i < wd.grenades ? '#999' : 'rgba(255,255,255,0.1)'; ctx.fillRect(gx + s, gy, 3 * s, s);
  }
  outlinedText(CHARS[p.ch].name, L + 37 * s, Tp + 14 * s, s * 2.4, '#ffd34d', 'left');
  outlinedText(String(wd.score).padStart(6, '0'), pauseBtn.x - 12, Tp + 6, s * 4, '#ffffff', 'right');
  ctx.drawImage(PICK.passport.r, pauseBtn.x - 12 - s * 22, Tp + 6 + s * 4, s * 3.3, s * 4); outlinedText('' + save.passports, pauseBtn.x - 12, Tp + 6 + s * 6, s * 3, '#ffd23f', 'right');
  // pause button
  ctx.fillStyle = 'rgba(0,0,20,0.55)'; ctx.fillRect(pauseBtn.x, pauseBtn.y, pauseBtn.s, pauseBtn.s);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(pauseBtn.x + 1, pauseBtn.y + 1, pauseBtn.s - 2, pauseBtn.s - 2);
  ctx.fillStyle = '#fff'; ctx.fillRect(pauseBtn.x + 13, pauseBtn.y + 11, 5, 18); ctx.fillRect(pauseBtn.x + 23, pauseBtn.y + 11, 5, 18);
  // boss bar
  const b = wd.boss;
  if (b && wd.phase === 'boss' && b.hp > 0 && !b.dead) {
    const bw = Math.min(CW * 0.5, 360), bxp = CW / 2 - bw / 2, byp = safe.t + 14;
    outlinedText(b.name, CW / 2, byp, clamp(CW / 90, 7, 11), '#ffffff');
    ctx.fillStyle = '#000'; ctx.fillRect(bxp - 2, byp + 10, bw + 4, 12);
    ctx.fillStyle = '#5a1020'; ctx.fillRect(bxp, byp + 12, bw, 8);
    ctx.fillStyle = '#e8252f'; ctx.fillRect(bxp, byp + 12, bw * clamp(b.hp / b.maxHp, 0, 1), 8);
    ctx.fillStyle = '#ff8a8a'; ctx.fillRect(bxp, byp + 12, bw * clamp(b.hp / b.maxHp, 0, 1), 2);
  }
  // truth post
  if (wd.truth) {
    const a = Math.min(1, wd.truth.life * 2, (5 - wd.truth.life) * 4); ctx.globalAlpha = a;
    const fs = clamp(CW / 110, 6, 10); ctx.font = `${fs}px ${FONT}`;
    const tw = Math.min(CW * 0.8, ctx.measureText(wd.truth.text).width + 24), ty = safe.t + (wd.boss && wd.phase === 'boss' ? 58 : 18);
    ctx.fillStyle = 'rgba(255,255,255,0.92)'; ctx.fillRect(CW / 2 - tw / 2, ty - fs, tw, fs * 2.2);
    ctx.fillStyle = '#1c3f8f'; ctx.fillRect(CW / 2 - tw / 2, ty - fs, 6, fs * 2.2);
    ctx.fillStyle = '#111'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(wd.truth.text, CW / 2 + 3, ty + fs * 0.1, tw - 16);
    ctx.globalAlpha = 1;
  }
  { let yy = Tp + 18 * s + 16; const tag = (txt, col) => { outlinedText(txt, L, yy, s * 2.6, col, 'left'); yy += s * 4; };
    if (p.maga > 0) tag('MAGA ' + Math.ceil(p.maga), '#ff4040');
    if (p.coke > 0) tag('COKE ' + Math.ceil(p.coke), '#9fd8ff');
    if (wd.tariff > 0) tag('TARIFF ' + Math.ceil(wd.tariff), '#ffd34d'); }
  // banners
  const bn = wd.banners[wd.banners.length - 1];
  if (bn) {
    const a = Math.min(1, bn.life * 2, (bn.max - bn.life) * 4);
    ctx.globalAlpha = a;
    const big = clamp(CW / 22, 16, 40);
    ctx.fillStyle = 'rgba(0,0,20,0.55)'; ctx.fillRect(0, CH * 0.3 - big, CW, big * 2.6);
    outlinedText(bn.text, CW / 2, CH * 0.3, big, bn.col);
    if (bn.sub) outlinedText(bn.sub, CW / 2, CH * 0.3 + big * 1.05, clamp(big * 0.36, 7, 14), '#ffffff');
    ctx.globalAlpha = 1;
  }
  // touch controls
  if (document.body.classList.contains('touch')) drawTouch();
}
function drawTouch() {
  ctx.lineWidth = 3;
  const st = touch.stick;
  if (st) {
    ctx.fillStyle = 'rgba(255,255,255,0.10)'; ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.beginPath(); ctx.arc(st.ox, st.oy, 52, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    let dx = st.x - st.ox, dy = st.y - st.oy; const d = Math.hypot(dx, dy); if (d > 46) { dx = dx / d * 46; dy = dy / d * 46; }
    ctx.fillStyle = 'rgba(255,255,255,0.45)'; ctx.beginPath(); ctx.arc(st.ox + dx, st.oy + dy, 24, 0, Math.PI * 2); ctx.fill();
  } else {
    const hx = safe.l + 90, hy = CH - safe.b - 80;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.beginPath(); ctx.arc(hx, hy, 46, 0, Math.PI * 2); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.beginPath(); ctx.arc(hx, hy, 20, 0, Math.PI * 2); ctx.fill();
  }
  for (const k of ['fire', 'jump', 'bomb']) {
    const bt = btns[k], on = touch[k];
    ctx.fillStyle = on ? 'rgba(255,211,77,0.55)' : k === 'fire' ? 'rgba(208,31,42,0.35)' : k === 'jump' ? 'rgba(31,58,138,0.4)' : 'rgba(60,90,40,0.4)';
    ctx.strokeStyle = on ? '#fff' : 'rgba(255,255,255,0.55)';
    ctx.beginPath(); ctx.arc(bt.x, bt.y, bt.r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    outlinedText(bt.label, bt.x, bt.y, clamp(bt.r * 0.27, 7, 13), '#ffffff');
    if (k === 'bomb') outlinedText('x' + world.grenades, bt.x, bt.y + bt.r * 0.45, clamp(bt.r * 0.24, 6, 11), '#ffd34d');
  }
}

// ============================================================ touch input
function isTouchUI() { return document.body.classList.contains('touch'); }
function updateTouchButtons() {
  touch.jump = touch.fire = touch.bomb = false;
  for (const ptr of touch.ptrs.values()) {
    let best = null, bd = Infinity;
    for (const k in btns) { const b = btns[k], d = Math.hypot(ptr.x - b.x, ptr.y - b.y); if (d < b.r * 1.35 && d < bd) { bd = d; best = k; } }
    if (best) touch[best] = true;
  }
}
function updateStick() {
  const st = touch.stick;
  touch.left = touch.right = touch.up = touch.down = false;
  if (!st) return;
  let dx = st.x - st.ox, dy = st.y - st.oy;
  const d = Math.hypot(dx, dy);
  if (d > 70) { st.ox = st.x - dx / d * 70; st.oy = st.y - dy / d * 70; dx = st.x - st.ox; dy = st.y - st.oy; }
  touch.left = dx < -14; touch.right = dx > 14;
  touch.down = dy > 24 && Math.abs(dy) > Math.abs(dx) * 0.7;
  touch.up = dy < -26 && Math.abs(dy) > Math.abs(dx) * 0.7;
}
cv.addEventListener('pointerdown', e => {
  Sound.init();
  if (e.pointerType === 'touch' && !isTouchUI()) document.body.classList.add('touch');
  const x = e.clientX, y = e.clientY;
  if (state === 'cutscene') { sceneTap(x, y); e.preventDefault(); return; }
  if (state === 'play' && x >= pauseBtn.x - 6 && y <= pauseBtn.y + pauseBtn.s + 6 && x <= pauseBtn.x + pauseBtn.s + 6) { pauseGame(); e.preventDefault(); return; }
  if (e.pointerType === 'mouse' || state !== 'play') return;
  try { cv.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
  if (x < CW * 0.42 && !touch.stick) { touch.stick = { id: e.pointerId, ox: x, oy: y, x, y }; updateStick(); }
  else { touch.ptrs.set(e.pointerId, { x, y }); updateTouchButtons(); }
  e.preventDefault();
}, { passive: false });
cv.addEventListener('pointermove', e => {
  if (touch.stick && touch.stick.id === e.pointerId) { touch.stick.x = e.clientX; touch.stick.y = e.clientY; updateStick(); }
  else if (touch.ptrs.has(e.pointerId)) { touch.ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); updateTouchButtons(); }
}, { passive: true });
function endPtr(e) {
  if (touch.stick && touch.stick.id === e.pointerId) { touch.stick = null; updateStick(); }
  if (touch.ptrs.delete(e.pointerId)) updateTouchButtons();
}
cv.addEventListener('pointerup', endPtr); cv.addEventListener('pointercancel', endPtr); cv.addEventListener('lostpointercapture', endPtr);
function clearTouch() { touch.stick = null; touch.ptrs.clear(); updateStick(); updateTouchButtons(); }

// keyboard
window.addEventListener('keydown', e => {
  Sound.init();
  if (state === 'cutscene') { if (!e.repeat) { if (e.code === 'Escape') sceneAdvance(true); else if (['Space', 'Enter', 'KeyJ', 'KeyX', 'ArrowRight'].includes(e.code)) sceneAdvance(false); } e.preventDefault(); return; }
  if ((e.code === 'KeyP' || e.code === 'Escape') && !e.repeat) {
    if (state === 'play') pauseGame(); else if (state === 'paused') resumeGame();
    e.preventDefault(); return;
  }
  const m = KEYMAP[e.code];
  if (m) { m.forEach(k => { keys[k] = 1; }); if (state === 'play') e.preventDefault(); }
});
window.addEventListener('keyup', e => { const m = KEYMAP[e.code]; if (m) m.forEach(k => { keys[k] = 0; }); });
window.addEventListener('blur', () => { Object.keys(keys).forEach(k => { keys[k] = 0; }); clearTouch(); if (state === 'play') pauseGame(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && state === 'play') pauseGame(); });
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 200));


// ============================================================ storyline & cutscenes
// Panel: { bg, actors: [[sprKey, xFrac, face, scale]], who, text }
const STORY = {
  intro: [
    { bg: 'oval', actors: [['trump', 0.5, 1, 3]], who: 'NARRATOR', text: 'Washington. 3:00 AM. The phone in the Oval Office will not stop ringing.' },
    { bg: 'swamp', actors: [['goon', 0.35, 1, 2.4], ['heavy', 0.55, -1, 2.4], ['goon', 0.75, -1, 2.4]], who: 'NARRATOR', text: 'Deep in the Swamp, a monstrous SWAMP KING has raised an army of goons... and dragged the whole Swamp into one last power grab.' },
    { bg: 'swamp', actors: [['barron', 0.3, 1, 2.4], ['donjr', 0.5, 1, 2.4], ['eric', 0.7, -1, 2.4]], who: 'NARRATOR', text: 'Worse: Barron, Don Jr and Eric have been captured and locked in cages across ten hostile sectors.' },
    { bg: 'oval', actors: [['trump', 0.4, 1, 3], ['hegseth', 0.68, -1, 3]], who: 'PETE', text: 'Sir. Trump Force One is fuelled, the eagles are fed, and the grenades are... very large.' },
    { bg: 'oval', actors: [['trump', 0.5, 1, 3.4]], who: 'DONALD', text: "Nobody kidnaps my family. Nobody. Assemble THE TRUMP FORCE. We're going to drain that swamp. Bigly." },
  ],
  world2: [
    { bg: 'final', actors: [['trump', 0.35, 1, 3]], who: 'NARRATOR', text: 'The Swamp King is caged. The family is free. America sleeps soundly... for exactly one night.' },
    { bg: 'studio', actors: [['anchorbot', 0.4, 1, 2.6], ['agent', 0.62, -1, 2.6]], who: 'NARRATOR', text: 'The Swamp had back-ups. Fake News is broadcasting from a secret studio. The Deep State is hiding in a basement. And Nexico refuses to pay for the wall.' },
    { bg: 'tower', actors: [['trump', 0.45, 1, 3.2], ['barron', 0.65, -1, 3]], who: 'DONALD', text: 'They want a comeback? I invented the comeback. Pack the suitcase, Barron. We are going on TOUR.' },
  ],
  world3: [
    { bg: 'sewer', actors: [['goon', 0.4, 1, 2.4], ['goon', 0.6, -1, 2.4]], who: 'NARRATOR', text: 'Driven out of Washington, the Swamp has gone underground. Into the sewers. Into orbit. Even onto the Moon.' },
    { bg: 'final', actors: [['biden', 0.4, 1, 2.8], ['harris', 0.6, -1, 2.8]], who: 'NARRATOR', text: 'And from the ruins of the Swamp King, a new tyrant has been built: the SWAMP EMPEROR. Two pilots. One mech. Zero plans.' },
    { bg: 'space', actors: [['trump', 0.32, 1, 3], ['hegseth', 0.52, 1, 3], ['donjr', 0.7, -1, 3]], who: 'PETE', text: 'Space Force is standing by, sir. Say the word.' },
    { bg: 'space', actors: [['trump', 0.5, 1, 3.4]], who: 'DONALD', text: 'The word is WINNING. Light the rockets.' },
  ],
  world4: [
    { bg: 'whitehouse', actors: [['trump', 0.5, 1, 3.2]], who: 'NARRATOR', text: 'The Swamp is drained at home. But the goons have fled abroad, and they took their worst toys with them.' },
    { bg: 'giga', actors: [['tbot', 0.4, 1, 3], ['trump', 0.62, -1, 3]], who: 'T-BOT', text: 'GREETINGS, MR PRESIDENT. THE GIGA FACTORY IS UNDER ATTACK. REQUESTING... TREMENDOUS ASSISTANCE.' },
    { bg: 'russia', actors: [['trump', 0.35, 1, 3], ['hegseth', 0.6, -1, 3]], who: 'PETE', text: 'Intel puts a parade tank in the north, a mecha dragon in the east, and an Oil Baron sitting on a mountain of drums.' },
    { bg: 'pool', actors: [['trump', 0.5, 1, 3.4]], who: 'DONALD', text: 'A World Tour. I love a tour. First stop: the Reflecting Pool. Everybody into the water. Beautiful water.' },
  ],
  ending: [
    { bg: 'final', actors: [['trump', 0.5, 1, 3.2]], who: 'NARRATOR', text: 'The Swamp Emperor lies in pieces. Its pilots sit in a very small cage, arguing about whose turn it was to steer.' },
    { bg: 'whitehouse', actors: [['barron', 0.22, 1, 3], ['donjr', 0.38, 1, 3], ['trump', 0.54, 1, 3.4], ['eric', 0.7, -1, 3], ['hegseth', 0.84, -1, 3]], who: 'NARRATOR', text: 'The Trump Force returns home. The eagles circle. The flags fly. Every last drop of the Swamp has been drained.' },
    { bg: 'whitehouse', actors: [['trump', 0.5, 1, 3.6]], who: 'DONALD', text: 'They said it could not be done. It was done. Forty missions. Perfect. Maybe the most perfect ever. Thank you, America.' },
  ],
};
const BRIEF = {
  mamdani: 'Sector 2 is run by ZOHRAN MAMDANI. Rents are frozen, buses are free, and so is the paperwork. Expect flying rent notices.',
  harris: 'KAMALA HARRIS holds the desert fortress. Intel reports coconuts. Many, many coconuts.',
  clinton: 'HILLARY CLINTON has dug in on Covfefe Mountain with a private server and endless email attachments.',
  obama: 'BARACK OBAMA has taken over the city. Beware the tan suit. It is faster than it looks.',
  biden: 'This is it: the SWAMP KING mech, piloted by JOE BIDEN himself. Aim for the cockpit. Bring ice cream.',
  anchorbot: 'The FAKE NEWS ANCHORBOT is broadcasting lies 24/7. Time to cancel the show.',
  agent: 'THE DEEP STATE AGENT does not exist. Officially. He is in the basement. Unofficially.',
  generalissimo: 'The GENERALISSIMO OF NEXICO says he will never pay for the wall. Change his mind. Bring a contract.',
  obama2: 'Bad news: OBAMA is back for the sequel, now with teleprompters. Nobody asked for this.',
  kraken: 'Something huge is moving in the sewer. Rumours say it is the SWAMP KRAKEN. Rumours are right.',
  harris2: 'KAMALA HARRIS has seized the White House lawn for a rematch. The coconuts are bigger this time.',
  paradetank: 'The SUPREME PARADE TANK has never lost a parade. It has also never been hit by a golden grenade.',
  robodragon: 'MECHA DRAGON 9000: mass-produced, breathes fire, no off switch. Find one.',
  drillrig: "The OIL BARON's drill rig throws burning oil drums. Stay mobile and do not stand near the barrels, sir.",
  emperor: 'The SWAMP EMPEROR awaits on its throne: Biden AND Harris, one mech. End this, sir.',
};
let scene = null;
function playCutscene(panels, onDone) {
  scene = { panels, i: 0, t: 0, onDone, prevState: state, bdCache: {} };
  state = 'cutscene'; clearTouch(); showScreen(null);
}
function sceneAdvance(skipAll) {
  if (!scene) return;
  const p = scene.panels[scene.i], full = p.text.length;
  if (!skipAll && scene.t * 45 < full) { scene.t = full / 45 + 0.01; return; }
  if (!skipAll && scene.i < scene.panels.length - 1) { scene.i++; scene.t = 0; Sound.play('paper'); return; }
  const done = scene.onDone; scene = null; done && done();
}
function sceneBackdrop(key) {
  if (!scene.bdCache[key]) scene.bdCache[key] = buildBackdrop(THEMES[key] || THEMES.final, 7777, VH);
  return scene.bdCache[key];
}
function drawOval() {
  const R = (x, y, w, h, c) => { bx.fillStyle = c; bx.fillRect(Math.round(x), Math.round(y), Math.round(w), Math.round(h)); };
  R(0, 0, VW, VH, '#e8e0c8'); for (let x = 0; x < VW; x += 12) R(x, 0, 2, VH * 0.72, '#ddd4b8');
  const cx = VW / 2;
  R(cx - 60, 26, 120, 80, '#8ab8e8'); R(cx - 60, 26, 120, 3, '#fff'); R(cx - 1, 26, 2, 80, '#fff'); R(cx - 60, 64, 120, 2, '#fff');
  R(cx - 84, 18, 26, 110, '#d4af37'); R(cx + 58, 18, 26, 110, '#d4af37'); R(cx - 84, 18, 168, 8, '#b8860b');
  for (const fx of [cx - 110, cx + 96]) { R(fx, 30, 2, 100, '#ddd'); for (let r = 0; r < 9; r++) R(fx + 2, 32 + r * 2, 14, 2, r % 2 ? '#fff' : '#c8102e'); R(fx + 2, 32, 6, 9, '#1c3f8f'); }
  R(0, VH * 0.72, VW, VH, '#1c3f8f');
  bx.fillStyle = '#2a4fa8'; bx.beginPath(); bx.ellipse(cx, VH * 0.86, VW * 0.42, 22, 0, 0, Math.PI * 2); bx.fill();
  bx.fillStyle = '#d4af37'; bx.beginPath(); bx.ellipse(cx, VH * 0.86, 22, 8, 0, 0, Math.PI * 2); bx.fill();
  R(cx - 70, VH * 0.42, 140, 22, '#5a3a1e'); R(cx - 70, VH * 0.42, 140, 3, '#7a5228'); R(cx - 20, VH * 0.42 + 7, 40, 10, '#4a2e16'); R(cx + 30, VH * 0.42 - 6, 10, 6, '#c8102e');
}
function renderCutscene() {
  const sc = scene; if (!sc) return;
  const p = sc.panels[sc.i];
  bx.imageSmoothingEnabled = false;
  if (p.bg === 'oval') drawOval();
  else {
    const th = THEMES[p.bg] || THEMES.final;
    const g = bx.createLinearGradient(0, 0, 0, VH); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]); bx.fillStyle = g; bx.fillRect(0, 0, VW, VH);
    const bd = sceneBackdrop(p.bg), drift = sc.t * 6;
    [[bd.far, 0.4], [bd.near, 1]].forEach(([img, k]) => { let x = -Math.round(drift * k) % bd.W; if (x > 0) x -= bd.W; for (; x < VW; x += bd.W) bx.drawImage(img, x, VH - bd.H + 10); });
    const gy = Math.min(VH * 0.83, (CH - Math.max(CH * 0.27, 90)) * DPR / SCALE - 1); bx.fillStyle = th.dirt; bx.fillRect(0, gy, VW, VH); bx.fillStyle = th.top; bx.fillRect(0, gy, VW, 4);
  }
  const boxTop = (CH - Math.max(CH * 0.27, 90)) * DPR / SCALE;
  const groundY = Math.min(VH * 0.83, boxTop - 1);
  p.actors.forEach(([k, xf, face, scl], i) => {
    const fr = SPR[k] && SPR[k].stand; if (!fr) return;
    const bob = Math.round(Math.sin(sc.t * 3 + i) * 1);
    const w = fr.r.width * scl, h = fr.r.height * scl;
    bx.drawImage(face < 0 ? fr.l : fr.r, Math.round(VW * xf - w / 2), Math.round(groundY - h + bob), Math.round(w), Math.round(h));
  });
  ctx.imageSmoothingEnabled = false; ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, cv.width, cv.height);
  ctx.drawImage(buf, 0, 0, VW, VH, 0, 0, VW * SCALE, VH * SCALE);
  ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
  // letterbox + caption
  const bar = CH * 0.12, ease = Math.min(1, sc.t * 3);
  ctx.fillStyle = '#000'; ctx.fillRect(0, 0, CW, bar * ease);
  const boxH = Math.max(CH * 0.27, 90);
  ctx.fillStyle = 'rgba(0,0,0,0.88)'; ctx.fillRect(0, CH - boxH * ease, CW, boxH);
  ctx.fillStyle = '#d4af37'; ctx.fillRect(0, CH - boxH * ease, CW, 3);
  if (ease >= 1) {
    const fs = clamp(CW / 70, 9, 16), pad = Math.max(24, safe.l + 18);
    outlinedText(p.who, pad, CH - boxH + fs * 1.3, fs * 1.05, p.who === 'NARRATOR' ? '#9fd8ff' : '#ffd34d', 'left');
    const shown = p.text.slice(0, Math.floor(sc.t * 45));
    ctx.font = fs * 0.95 + 'px ' + FONT; ctx.fillStyle = '#ffffff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    const maxW = CW - pad * 2; let line = '', y = CH - boxH + fs * 2.6;
    for (const word of shown.split(' ')) { const test = line ? line + ' ' + word : word; if (ctx.measureText(test).width > maxW && line) { ctx.fillText(line, pad, y); line = word; y += fs * 1.7; } else line = test; }
    ctx.fillText(line, pad, y);
    if (sc.t * 45 >= p.text.length && (sc.t * 2 | 0) % 2) outlinedText((isTouchUI() ? 'TAP' : 'PRESS SPACE') + ' ▶', CW - pad, CH - fs * 1.2, fs * 0.8, '#ffd34d', 'right');
  }
  outlinedText((sc.i + 1) + '/' + sc.panels.length, CW / 2, bar * 0.5, clamp(CW / 90, 7, 11), '#888');
  ctx.fillStyle = 'rgba(255,255,255,0.12)'; ctx.fillRect(CW - safe.r - 92, safe.t + 10, 80, 30); ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.strokeRect(CW - safe.r - 92, safe.t + 10, 80, 30);
  outlinedText('SKIP', CW - safe.r - 52, safe.t + 25, 11, '#ffffff');
}
function sceneTap(x, y) {
  if (x > CW - safe.r - 100 && y < safe.t + 48) sceneAdvance(true); else sceneAdvance(false);
}

// ============================================================ screens & flow
const $ = id => document.getElementById(id);
const SCREENS = ['title', 'levels', 'pause', 'complete', 'gameover', 'victory', 'shop'];
function showScreen(id) { SCREENS.forEach(s => $(s).classList.toggle('show', s === id)); }
let rotateDismissed = false;
function checkRotate() {
  const need = isTouchUI() && window.innerHeight > window.innerWidth && !rotateDismissed;
  rotateBlocked = need;
  $('rotate').classList.toggle('show', need);
}
function startLevel(n, noStory) {
  n = clamp(n, 1, NLEV);
  if (!noStory) {
    const panels = [];
    if (n === 1) panels.push(...STORY.intro);
    if (n === 11) panels.push(...STORY.world2);
    if (n === 21) panels.push(...STORY.world3);
    if (n === 31) panels.push(...STORY.world4);
    const L = LEVELS[n - 1];
    if (L.boss && BRIEF[L.boss]) {
      const bk = BOSSES[L.boss] ? BOSSES[L.boss].spr || L.boss : null;
      const actors = [['hegseth', 0.3, 1, 3]];
      if (L.boss === 'emperor') actors.push(['biden', 0.62, -1, 3], ['harris', 0.78, -1, 3]);
      else if (L.boss === 'biden') actors.push(['biden', 0.7, -1, 3]);
      else if (bk && SPR[bk]) actors.push([bk, 0.7, -1, 3.4]);
      panels.push({ bg: L.theme, actors, who: 'PETE · INTEL BRIEFING', text: BRIEF[L.boss] });
    }
    if (panels.length) { curLevel = n; playCutscene(panels, () => startLevel(n, true)); return; }
  }
  curLevel = n;
  Sound.init();
  clearTouch();
  newWorld(curLevel);
  state = 'play'; acc = 0;
  showScreen(null);
  Sound.setMusicLevel(0.2);
}
function pauseGame() { if (state !== 'play') return; state = 'paused'; clearTouch(); showScreen('pause'); }
function resumeGame() { if (state !== 'paused') return; state = 'play'; acc = 0; showScreen(null); }
function toMenu() { state = 'menu'; world = null; showScreen('title'); drawTitleArt(); }
const COMPLETE_QUOTES = [
  'That was the greatest mission in the history of missions. Maybe ever.',
  'Tremendous job. Nobody blows up bunkers like us, believe me.',
  'The swamp is draining. Bigly. Everybody is talking about it.',
  'Many people are saying it was a perfect mission. Perfect.',
  'We had the best explosions. The best. Ask anyone.',
  'Winning so much. Some people say too much. Not me.',
];
function fmtTime(t) { const m = Math.floor(t / 60), s = Math.floor(t % 60); return `${m}:${String(s).padStart(2, '0')}`; }
function levelComplete() {
  if (state !== 'play') return;
  const wd = world;
  save.unlocked = Math.max(save.unlocked, Math.min(NLEV, wd.n + 1)); persist();
  totals.kills += wd.kills; totals.rescues += wd.rescues; totals.score += wd.score;
  const stats = `KILLS <b>${wd.kills}</b> · RESCUES <b>${wd.rescues}</b><br>TIME <b>${fmtTime(wd.time)}</b> · SCORE <b>${wd.score}</b><br>PASSPORTS <b>+${wd.passports}</b> (BANK ${save.passports})`;
  if (wd.n >= NLEV) {
    state = 'victory';
    playCutscene(STORY.ending, () => { state = 'victory'; showScreen('victory'); drawVictoryArt(); });
    $('victoryStats').innerHTML = `ALL ${NLEV} MISSIONS COMPLETE<br>FINAL MISSION: ${stats}`;
    return;
    $('victoryStats').innerHTML = `ALL ${NLEV} MISSIONS COMPLETE<br>FINAL MISSION: ${stats}`;
    showScreen('victory'); drawVictoryArt();
    return;
  }
  state = 'complete';
  $('completeQuote').textContent = `"${pick(COMPLETE_QUOTES)}"`;
  $('completeStats').innerHTML = `MISSION ${wd.n}: ${wd.lv.name.toUpperCase()}<br>${stats}`;
  showScreen('complete');
}
function gameOver() { state = 'over'; showScreen('gameover'); }
const totals = { kills: 0, rescues: 0, score: 0 };

const BOSS_SHORT = { mamdani: 'MAMDANI', harris: 'HARRIS', clinton: 'CLINTON', obama: 'OBAMA', biden: 'SWAMP KING', anchorbot: 'ANCHORBOT', agent: 'DEEP STATE', generalissimo: 'GENERALISSIMO', obama2: 'OBAMA 2', kraken: 'KRAKEN', harris2: 'HARRIS 2', emperor: 'EMPEROR', paradetank: 'PARADE TANK', robodragon: 'MECHA DRAGON', drillrig: 'DRILL RIG' };
let gridWorld = -1;
function buildLevelGrid() {
  const grid = $('levelGrid'); grid.innerHTML = '';
  if (gridWorld < 0) gridWorld = clamp(Math.floor((save.unlocked - 1) / 10), 0, WORLDS.length - 1);
  let tabs = $('worldTabs');
  if (!tabs) { tabs = document.createElement('div'); tabs.id = 'worldTabs'; tabs.className = 'btns'; grid.parentNode.insertBefore(tabs, grid); }
  tabs.innerHTML = '';
  WORLDS.forEach((w, wi) => {
    const t = document.createElement('button'); t.className = 'small';
    t.textContent = `W${wi + 1}: ${w.name}`;
    if (wi === gridWorld) t.style.background = '#d01f2a';
    t.disabled = w.from > save.unlocked;
    t.addEventListener('click', () => { gridWorld = wi; buildLevelGrid(); });
    tabs.appendChild(t);
  });
  const from = WORLDS[gridWorld].from;
  LEVELS.slice(from - 1, from + 9).forEach((L, i) => {
    const n = from + i, b = document.createElement('button');
    b.innerHTML = `<span class="n">${n}</span><span>${L.name}</span>${L.boss ? `<span style="color:#ff8a8a">BOSS: ${BOSS_SHORT[L.boss]}</span>` : ''}`;
    if (L.boss) b.classList.add('boss');
    b.disabled = n > save.unlocked;
    b.addEventListener('click', () => startLevel(n));
    grid.appendChild(b);
  });
}
let shopReturn = 'title';
function openShop(from) { shopReturn = from; buildShop(); showScreen('shop'); }
function buildShop() {
  $('shopBank').innerHTML = 'GOLDEN PASSPORTS: <b>' + save.passports + '</b>';
  const list = $('shopList'); list.innerHTML = '';
  UPGRADES.forEach(u => {
    const lvl = upLvl(u.id), max = u.costs.length, cost = u.costs[lvl];
    const row = document.createElement('div'); row.className = 'shoprow';
    row.innerHTML = '<div class="si"><b>' + u.name + '</b><span>' + u.desc + '</span><i>' + '■'.repeat(lvl) + '□'.repeat(max - lvl) + '</i></div>';
    const b = document.createElement('button'); b.className = 'small';
    if (lvl >= max) { b.textContent = 'MAXED'; b.disabled = true; }
    else { b.textContent = 'BUY ' + cost; b.disabled = save.passports < cost; b.addEventListener('click', () => { if (save.passports < cost) return; save.passports -= cost; save.up[u.id] = lvl + 1; persist(); applyUpgradeLooks(); Sound.init(); Sound.play('rescue'); buildShop(); }); }
    row.appendChild(b); list.appendChild(row);
  });
}
function soundLabel() { const t = save.muted ? 'SOUND: OFF' : 'SOUND: ON'; $('btnSound').textContent = t; $('btnPauseSound').textContent = t; }
function toggleSound() { Sound.init(); Sound.setMuted(!save.muted); soundLabel(); }
$('btnShop').addEventListener('click', () => openShop('title'));
$('btnReset').addEventListener('click', () => {
  if (!window.confirm('Reset all progress? Missions, golden passports and upgrades will be wiped.')) return;
  save = { unlocked: 1, muted: save.muted, passports: 0, up: {}, epoch: RESET_EPOCH }; persist();
  applyUpgradeLooks(); gridWorld = -1; $('btnPlay').textContent = 'PLAY';
});
$('btnCompleteShop').addEventListener('click', () => openShop('complete'));
$('btnShopBack').addEventListener('click', () => showScreen(shopReturn));
$('btnPlay').addEventListener('click', () => startLevel(save.unlocked));
$('btnLevels').addEventListener('click', () => { buildLevelGrid(); showScreen('levels'); });
$('btnLevelsBack').addEventListener('click', () => showScreen('title'));
$('btnSound').addEventListener('click', toggleSound);
$('btnPauseSound').addEventListener('click', toggleSound);
$('btnResume').addEventListener('click', resumeGame);
$('btnRestart').addEventListener('click', () => startLevel(curLevel));
$('btnQuit').addEventListener('click', toMenu);
$('btnNext').addEventListener('click', () => startLevel(curLevel + 1));
$('btnCompleteMenu').addEventListener('click', toMenu);
$('btnRetry').addEventListener('click', () => startLevel(curLevel));
$('btnOverMenu').addEventListener('click', toMenu);
$('btnVictoryMenu').addEventListener('click', toMenu);
$('btnRotateAnyway').addEventListener('click', () => { rotateDismissed = true; checkRotate(); });
document.addEventListener('pointerdown', () => Sound.init(), { once: false, passive: true });
if (('ontouchstart' in window) || (window.matchMedia && window.matchMedia('(pointer: coarse)').matches)) document.body.classList.add('touch');
$('btnPlay').textContent = save.unlocked > 1 ? `PLAY (MISSION ${save.unlocked})` : 'PLAY';

// ============================================================ title & victory art
function drawTitleArt() {
  const c = $('titleArt'), g = c.getContext('2d');
  g.imageSmoothingEnabled = false; g.clearRect(0, 0, c.width, c.height);
  for (let r = 0; r < 13; r++) { g.fillStyle = r % 2 ? '#ffffff' : '#c8102e'; g.fillRect(10, 8 + r * 5, 140, 5); }
  g.fillStyle = '#1c3f8f'; g.fillRect(10, 8, 60, 35);
  g.fillStyle = '#ffffff'; for (let y = 0; y < 4; y++) for (let x = 0; x < 6; x++) g.fillRect(16 + x * 9 + (y % 2) * 4, 13 + y * 8, 2, 2);
  g.globalAlpha = 0.35; g.fillStyle = '#0b1a3a'; g.fillRect(10, 8, 140, 65); g.globalAlpha = 1;
  g.drawImage(PLANE.r, 92, 4, 66, 20);
  g.drawImage(SPR.eagle.up.r, 8, 50, 30, 20);
  g.drawImage(SPR.barron.stand.r, 14, 44, 54, 66);
  g.drawImage(SPR.trump.stand.r, 48, 38, 72, 72);
  g.drawImage(SPR.donjr.stand.l, 104, 56, 54, 54);
}
function drawVictoryArt() {
  let c = $('victoryArt');
  if (!c) { c = mkCanvas(200, 90); c.id = 'victoryArt'; c.style.cssText = 'width:min(60vw,360px);height:auto;image-rendering:pixelated;position:relative'; $('victory').insertBefore(c, $('victoryStats')); }
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, 200, 90);
  g.fillStyle = '#2a0f2e'; g.fillRect(0, 70, 200, 20);
  [10, 180].forEach(x => { g.fillStyle = '#ddd'; g.fillRect(x, 20, 2, 52); for (let r = 0; r < 9; r++) { g.fillStyle = r % 2 ? '#fff' : '#c8102e'; g.fillRect(x + 2, 20 + r, 14, 1); } g.fillStyle = '#1c3f8f'; g.fillRect(x + 2, 20, 6, 5); });
  g.drawImage(PLANE.r, 45, 0, 110, 34);
  g.drawImage(SPR.eagle.up.r, 20, 4, 15, 10); g.drawImage(SPR.eagle.down.l, 165, 8, 15, 10);
  ['barron', 'donjr', 'trump', 'eric', 'hegseth'].forEach((k, i) => g.drawImage(SPR[k].stand[i < 2 ? 'r' : 'l'], 48 + i * 22, 70 - SPR[k].stand.r.height * 1.5, 27, SPR[k].stand.r.height * 1.5));
}

// ============================================================ main loop
let acc = 0, last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (state === 'play' && !rotateBlocked && world) {
    acc += dt;
    let n = 0;
    while (acc >= STEP && n < 6) {
      try { update(STEP); } catch (err) { console.error(err); }
      acc -= STEP; n++;
      if (state !== 'play') break;
    }
  }
  if (state === 'cutscene' && scene) { scene.t += dt; try { renderCutscene(); } catch (err) { console.error(err); } }
  else if (world && state !== 'menu') { try { render(); } catch (err) { console.error(err); } }
  requestAnimationFrame(frame);
}

// ============================================================ test hook
window.__ttf = {
  get state() { return state; },
  get world() { return world; },
  levels: LEVELS,
  start: (n, story) => startLevel(n, !story),
  scene: () => scene && { i: scene.i, n: scene.panels.length },
  advance: all => sceneAdvance(all),
  complete: () => levelComplete(),
  god: (on = true) => { godMode = on; },
  unlockAll: () => { save.unlocked = NLEV; persist(); },
  step: (frames = 60) => { for (let i = 0; i < frames && state === 'play'; i++) update(STEP); render(); },
  warp: frac => { const p = world.player; const tx = Math.floor(world.lv.W * frac); p.x = tx * TS; p.y = (world.lv.surf[tx] - 3) * TS; p.vy = 0; p.hidden = false; world.phase = world.phase === 'intro' ? 'play' : world.phase; world.cam.x = p.x - VW / 2; },
  hurtBoss: dmg => { const b = world.boss; if (b) hurtBoss(b, dmg); },
  press: (k, v = true) => { keys[k] = v ? 1 : 0; },
  info: () => world && ({ level: world.n, name: world.lv.name, phase: world.phase, x: Math.round(world.player.x), y: Math.round(world.player.y), lives: world.lives, hp: world.player.hp, ch: world.player.ch, enemies: world.ents.filter(e => e.kind === 'enemy').length, cages: world.ents.filter(e => e.kind === 'cage' && !e.open).length, boss: world.boss ? { name: world.boss.name, hp: world.boss.hp, state: world.boss.state, kind: world.boss.kind } : null, plane: world.plane && world.plane.mode, width: world.lv.W, VW, VH }),
};

resize();
soundLabel();
drawTitleArt();
if (document.fonts && document.fonts.ready) document.fonts.ready.then(drawTitleArt).catch(() => {});
requestAnimationFrame(frame);
})();
