window.SYNTH_FLIGHT_JS_STARTED = true;
const canvas = document.getElementById('gameCanvas');
let ctx = canvas.getContext('2d', { alpha: false, desynchronized: true }) || canvas.getContext('2d');
const overlay = document.getElementById('overlay');
const rotateOverlay = document.getElementById('rotate-overlay');

const GAME_STORAGE_PREFIX = 'synthFlight:';
window.storage = {
  get(key) {
    let value = null;
    try { value = localStorage.getItem(GAME_STORAGE_PREFIX + key); } catch (e) { /* private mode */ }
    return Promise.resolve({ value });
  },
  set(key, value) {
    try { localStorage.setItem(GAME_STORAGE_PREFIX + key, value); } catch (e) { /* private mode */ }
    return Promise.resolve();
  }
};

function parseStoredCustom(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'object') return value;
  try { return JSON.parse(value); } catch (e) { return null; }
}

async function readCustomLevelKey(key) {
  try {
    const result = await window.storage.get(key);
    const parsed = parseStoredCustom(result && result.value);
    if (parsed) return { data: parsed, fromStorage: true };
  } catch (e) { /* missing host storage */ }
  const shipped = window.SHIPPED_CUSTOM_LEVELS && window.SHIPPED_CUSTOM_LEVELS[key];
  if (shipped) return { data: shipped, fromStorage: false };
  return { data: null, fromStorage: false };
}

let W = 860;
let H = 500;

// ---- Layout ----
let BAR_HEIGHT = 44;
let PLAY_TOP = BAR_HEIGHT;
let PLAY_BOTTOM = H - BAR_HEIGHT;
let isPortraitBlocked = false;

let hasInitializedGame = false;
let renderScale = 1;

function applyCanvasRenderScale() {
  ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
}

function currentDisplayScale() {
  const dpr = window.devicePixelRatio || 1;
  return Math.max(1, Math.min(2, dpr));
}

function sharpenCanvasContext(context) {
  if (!context) return;
  context.imageSmoothingEnabled = false;
  if ('webkitImageSmoothingEnabled' in context) context.webkitImageSmoothingEnabled = false;
  if ('mozImageSmoothingEnabled' in context) context.mozImageSmoothingEnabled = false;
  if ('msImageSmoothingEnabled' in context) context.msImageSmoothingEnabled = false;
}

function resizeCanvas() {
  W = window.innerWidth;
  H = window.innerHeight;
  // Game units stay in CSS pixels. The bitmap matches the display (up to 2x
  // on retina) so a full-screen browser is not stretching an 800px frame.
  renderScale = currentDisplayScale();
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  overlay.style.width = W + 'px';
  overlay.style.height = H + 'px';
  canvas.width = Math.max(1, Math.round(W * renderScale));
  canvas.height = Math.max(1, Math.round(H * renderScale));
  applyCanvasRenderScale();
  sharpenCanvasContext(ctx);
  BAR_HEIGHT = Math.min(50, Math.max(34, H * 0.05));
  PLAY_TOP = BAR_HEIGHT;
  PLAY_BOTTOM = H - BAR_HEIGHT;
  if (!hasInitializedGame) {
    hasInitializedGame = true;
    resetGame();
  }
}

function checkOrientation() {
  // Chromium (including Cursor's preview panel) often reports touch even on
  // desktop. Only block portrait on real mobile browsers so we can play in a
  // tall editor side panel.
  const isMobileUA = /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');
  const portrait = isMobileUA && window.innerHeight > window.innerWidth;
  isPortraitBlocked = portrait;
  rotateOverlay.classList.toggle('active', portrait);
  if (!portrait) {
    resizeCanvas();
  }
}

// ---- Physics constants (hold to rise, release to fall) ----
const GRAVITY = 0.22;
const LIFT_ACCEL = -0.4;
const MAX_FALL_SPEED = 5;
const MAX_RISE_SPEED = -5;

// wind vortex: peak oscillating force applied to ship.vy while within a
// vortex's reach, scaled by proximity. kept below LIFT_ACCEL (0.4) so the
// ship's own controls can always counter it with active input. originally
// 0.16, which testing showed was too subtle to actually feel against the
// ship's normal flight dynamics -- especially while also dodging bolts --
// so this is now comparable to or exceeding GRAVITY (0.22) at close range
const VORTEX_MAX_FORCE = 0.32;
const VORTEX_OSCILLATION_FREQ = 0.022; // radians/frame -- one full swirl cycle is ~285 frames (~4.75s)

// event-type hazards (black holes, wind vortices, cloud arcs, etc.) used to
// spawn at W + offset (screen-width-relative). Since ship.x is also
// W-relative (W * 0.28), and pattern-based hazards like bolts are NOT
// W-relative at all, this meant a hazard's position relative to nearby
// bolts could shift by 100+ distance units between different screen
// widths -- causing the editor (viewed at one width) and actual gameplay
// (at another) to disagree about whether a bolt sits inside a vortex or
// not, even with identical saved data. Spawning relative to ship.x with a
// fixed offset instead removes the width-dependence entirely, matching
// how bolts already behave.
const EVENT_SPAWN_OFFSET = 900;

// ---- World constants ----
const SCROLL_SPEED = 2.8;
const GATE_SPACING = 300;
const GATE_WIDTH = 16;
const GAP_FRACTION_START = 0.5;
const GAP_FRACTION_MIN = 0.3;
const SHIP_W = 40;
const SHIP_H = 18;
const THEME_DISTANCE = 1000;
const WARP_DURATION = 100;
const PORTAL_LEAD_DISTANCE = 80; // how far (in distance units) before the threshold the portal appears

const SHIP_TRAILS = [
  { id: 'none', name: 'NONE', hint: 'No exhaust', unlocked: () => true },
  { id: 'classic', name: 'CLASSIC', hint: 'Starter exhaust', unlocked: () => true },
  { id: 'pulse', name: 'PULSE JET', hint: 'Complete any zone', unlocked: () => completedZones.size >= 1 },
  { id: 'echo', name: 'AFTERIMAGE', hint: 'Fly 10,000m', unlocked: () => totalDistanceTraveled >= 10000 },
  { id: 'twin', name: 'TWIN THRUST', hint: 'Complete 6 zones', unlocked: () => completedZones.size >= 6 },
  { id: 'sparks', name: 'SPARK WAKE', hint: 'Clear a zone deathless', unlocked: () => deathlessZones.size >= 1 },
  { id: 'ribbon', name: 'NEON RIBBON', hint: 'Fly 50,000m', unlocked: () => totalDistanceTraveled >= 50000 },
  { id: 'helix', name: 'ION HELIX', hint: 'Fly 100,000m', unlocked: () => totalDistanceTraveled >= 100000 },
  { id: 'glitch', name: 'SIGNAL GLITCH', hint: 'Beat the game', unlocked: () => beatenDifficulties.size >= 1 },
  { id: 'rings', name: 'SHOCK RING', hint: 'Complete every zone', unlocked: () => completedZones.size >= THEMES.length },
  { id: 'overdrive', name: 'OVERDRIVE FLARE', hint: 'Beat Overdrive', unlocked: () => beatenDifficulties.has('extra') }
];

const SHIP_SKINS = [
  { id: 'classic', name: 'CLASSIC DART', hint: 'Starter hull', unlocked: () => true },
  { id: 'molten', name: 'MOLTEN CORE', hint: 'Beat Molten Core', unlocked: () => THEMES.some((th, i) => th.name === 'MOLTEN CORE' && completedZones.has(i)) },
  { id: 'storm', name: 'STORMFRONT', hint: 'Complete Storm Skies', unlocked: () => THEMES.some((th, i) => th.name === 'STORM SKIES' && completedZones.has(i)) },
  { id: 'toxic', name: 'TOXIC OOZE', hint: 'Complete Toxic Wasteland', unlocked: () => THEMES.some((th, i) => th.name === 'TOXIC WASTELAND' && completedZones.has(i)) },
  { id: 'core', name: 'CORE SPARK', hint: 'Beat Reactor Core', unlocked: () => THEMES.some((th, i) => th.miniBossVariant === 'core' && completedZones.has(i)) },
  { id: 'void', name: 'EVENT HORIZON', hint: 'Complete The Void', unlocked: () => THEMES.some((th, i) => th.name === 'THE VOID' && completedZones.has(i)) },
  { id: 'neon', name: 'NEON CITY', hint: 'Complete Neon City', unlocked: () => THEMES.some((th, i) => th.name === 'NEON CITY' && completedZones.has(i)) },
  { id: 'signal', name: 'SIGNAL SKIN', hint: 'Beat Easy', unlocked: () => beatenDifficulties.has('easy') },
  { id: 'eclipse', name: 'ECLIPSE', hint: 'Beat Normal', unlocked: () => beatenDifficulties.has('normal') },
  { id: 'gold', name: 'GILDED', hint: 'Beat Hard', unlocked: () => beatenDifficulties.has('hard') },
  { id: 'prism', name: 'RAINBOW', hint: 'Beat Overdrive', unlocked: () => beatenDifficulties.has('extra') },
  { id: 'srank', name: 'S RANK', hint: 'Earn S Rank', unlocked: () => achievedRanks.has('S') }
];

// ---- Themes ----
const THEMES = [
  {
    name: 'SYNTHWAVE',
    skyTop: '#1a0b3a', skyMid: '#2a0f4a', skyBottom: '#120523',
    accentA: '#ff2079', accentB: '#0ff0fc',
    barTop: '#3a0f5c', barBottom: '#1a0630',
    bgStyle: 'grid',
    ampMult: 1.0, freqMult: 1.0,
    gravityMult: 1.0, liftMult: 1.0,
    pulseGap: false,
    // centerFrac: vertical position (0=top of play area, 1=bottom)
    // ampFrac: oscillation size, as a fraction of the max safe swing at that position
    // freq/phase: oscillation speed/starting point -- fixed, not randomized
    // spacing: pixels until the NEXT gate in this list
    pattern: [
      { centerFrac: 0.50, ampFrac: 0.25, freq: 0.018, phase: 0.00, spacing: 300 },
      { centerFrac: 0.30, ampFrac: 0.40, freq: 0.014, phase: 1.57, spacing: 320 },
      { centerFrac: 0.70, ampFrac: 0.35, freq: 0.022, phase: 3.14, spacing: 300 },
      { centerFrac: 0.50, ampFrac: 0.55, freq: 0.016, phase: 0.78, spacing: 340 },
      { centerFrac: 0.20, ampFrac: 0.30, freq: 0.020, phase: 2.36, spacing: 300 },
      { centerFrac: 0.80, ampFrac: 0.40, freq: 0.018, phase: 4.71, spacing: 320 },
      { centerFrac: 0.45, ampFrac: 0.50, freq: 0.024, phase: 1.05, spacing: 300 },
      { centerFrac: 0.60, ampFrac: 0.28, freq: 0.015, phase: 5.50, spacing: 310 }
    ]
  },
  {
    name: 'GRAVITY WELL',
    skyTop: '#001a0d', skyMid: '#003320', skyBottom: '#000d05',
    accentA: '#00ff9d', accentB: '#00c3ff',
    barTop: '#00291a', barBottom: '#001008',
    bgStyle: 'matrix',
    ampMult: 0.15, freqMult: 1.6,
    gravityMult: 1.40, liftMult: 0.8,
    pulseGap: false, obstacleShape: 'hbar',
    // each entry is one cluster of short horizontal bars. yFrac/ampFrac are fractions of
    // play height; freq/phase drive the same oscillation math as Zone 1's gates.
    // Bars never span the full width, so there's always open sky above and/or below each one.
    pattern: [
      { spacing: 360, bars: [
        { yFrac: 0.20, ampFrac: 0.048, freq: 0.012, phase: 0.0, widthPx: 110, thicknessPx: 18 },
        { yFrac: 0.55, ampFrac: 0.06, freq: 0.009, phase: 1.5, widthPx: 130, thicknessPx: 18 },
        { yFrac: 0.85, ampFrac: 0.036, freq: 0.015, phase: 3.0, widthPx: 100, thicknessPx: 18 }
      ]},
      { spacing: 380, bars: [
        { yFrac: 0.35, ampFrac: 0.072, freq: 0.0108, phase: 0.8, widthPx: 140, thicknessPx: 20 },
        { yFrac: 0.75, ampFrac: 0.054, freq: 0.0132, phase: 2.2, widthPx: 110, thicknessPx: 18 }
      ]},
      { spacing: 350, bars: [
        { yFrac: 0.15, ampFrac: 0.042, freq: 0.012, phase: 1.0, widthPx: 100, thicknessPx: 16 },
        { yFrac: 0.50, ampFrac: 0.06, freq: 0.0096, phase: 2.6, widthPx: 120, thicknessPx: 18 },
        { yFrac: 0.82, ampFrac: 0.048, freq: 0.0144, phase: 4.0, widthPx: 110, thicknessPx: 18 }
      ]},
      { spacing: 390, bars: [
        { yFrac: 0.30, ampFrac: 0.066, freq: 0.0114, phase: 0.4, widthPx: 130, thicknessPx: 20 },
        { yFrac: 0.68, ampFrac: 0.066, freq: 0.0126, phase: 3.4, widthPx: 130, thicknessPx: 20 }
      ]},
      { spacing: 370, bars: [
        { yFrac: 0.22, ampFrac: 0.048, freq: 0.0102, phase: 2.0, widthPx: 100, thicknessPx: 16 },
        { yFrac: 0.50, ampFrac: 0.054, freq: 0.0138, phase: 0.6, widthPx: 120, thicknessPx: 18 },
        { yFrac: 0.78, ampFrac: 0.042, freq: 0.0114, phase: 3.8, widthPx: 100, thicknessPx: 16 }
      ]},
      { spacing: 340, bars: [
        { yFrac: 0.40, ampFrac: 0.078, freq: 0.009, phase: 1.2, widthPx: 140, thicknessPx: 20 },
        { yFrac: 0.80, ampFrac: 0.048, freq: 0.0156, phase: 4.5, widthPx: 110, thicknessPx: 18 }
      ]}
    ],
    // secondary layer: a spinning dust tornado, sand-colored, sweeping
    // straight across from right to left as it scrolls through with the
    // world -- no vertical movement, a clean horizontal sweep. instant
    // death on contact, same as any other solid hazard
    extraStormPattern: [
      { baseYFrac: 0.35, r: 55, interval: 480 },
      { baseYFrac: 0.65, r: 50, interval: 520 }
    ]
  },
  {
    name: 'DEEP SPACE',
    skyTop: '#050014', skyMid: '#0a0026', skyBottom: '#000010',
    accentA: '#ff8f3f', accentB: '#5aa9ff',
    barTop: '#10082e', barBottom: '#050014',
    bgStyle: 'stars',
    ampMult: 1.5, freqMult: 0.6,
    gravityMult: 0.55, liftMult: 1.15,
    pulseGap: false, obstacleShape: 'asteroid',
    // each entry is one cluster: xJitter offsets each rock from the cluster's spawn x,
    // yFrac/rFrac are fractions (0-1) mapped to actual position/radius
    pattern: [
      { spacing: 260, asteroids: [{ xJitter: -20, yFrac: 0.25, rFrac: 0.6 }, { xJitter: 10, yFrac: 0.55, rFrac: 0.8 }] },
      { spacing: 280, asteroids: [{ xJitter: -30, yFrac: 0.35, rFrac: 0.9 }, { xJitter: 0, yFrac: 0.70, rFrac: 0.6 }, { xJitter: 35, yFrac: 0.15, rFrac: 0.5 }] },
      { spacing: 250, asteroids: [{ xJitter: -10, yFrac: 0.20, rFrac: 0.5 }, { xJitter: 20, yFrac: 0.45, rFrac: 0.7 }, { xJitter: 50, yFrac: 0.75, rFrac: 0.9 }] },
      { spacing: 300, asteroids: [{ xJitter: -25, yFrac: 0.60, rFrac: 0.8 }, { xJitter: 5, yFrac: 0.30, rFrac: 0.6 }, { xJitter: 35, yFrac: 0.85, rFrac: 0.5 }] }
    ],
    // secondary: shooting stars that fly in a straight diagonal line (no
    // arc/curve) from a start height to a different end height, at varied
    // spots and paces. life is always long enough that the diagonal motion
    // continues until the star has genuinely scrolled off-screen (rather
    // than finishing early and popping out mid-flight) -- speed variety
    // comes from how much vertical distance each covers, not from
    // finishing its motion at different times. Rendered as a pure comet
    // streak with no discrete star shape, the bright head leading and the
    // tail trailing behind in the direction it came from
    extraShootingStarPattern: [
      { startYFrac: 0.9, endYFrac: 0.35, lifeFrames: 480, radiusPx: 9, interval: 230 },
      { startYFrac: 0.1, endYFrac: 0.65, lifeFrames: 450, radiusPx: 8, interval: 210 },
      { startYFrac: 0.5, endYFrac: 0.15, lifeFrames: 520, radiusPx: 10, interval: 260 },
      { startYFrac: 0.25, endYFrac: 0.75, lifeFrames: 460, radiusPx: 7, interval: 200 },
      { startYFrac: 0.7, endYFrac: 0.9, lifeFrames: 540, radiusPx: 8, interval: 250 }
    ]
  },
  {
    name: 'INFERNO',
    skyTop: '#2b0000', skyMid: '#4a0f00', skyBottom: '#1a0000',
    accentA: '#ffcc33', accentB: '#ff3300',
    barTop: '#3a0a00', barBottom: '#180400',
    bgStyle: 'embers',
    ampMult: 1.2, freqMult: 1.3,
    gravityMult: 1.0, liftMult: 1.0,
    pulseGap: false, obstacleShape: 'terrain', scrollMult: 1.5,
    gapFractionStart: 0.38, gapConstant: true,
    terrainSpacing: 34, terrainMaxDelta: 55,
    // irregular, non-symmetric cave waypoints (60 points -- long enough that the
    // loop point isn't noticeable during normal play). gapMult narrows the passage
    // at a point; fork splits the passage into two routes around an island.
    pattern: [
      { centerFrac: 0.56 }, { centerFrac: 0.24 }, { centerFrac: 0.4 },
      { centerFrac: 0.46 }, { centerFrac: 0.59 }, { centerFrac: 0.74 },
      { centerFrac: 0.74 }, { centerFrac: 0.64 }, { centerFrac: 0.75, gapMult: 0.55 },
      { centerFrac: 0.61 },
      // third fork -- the biggest/most dramatic of the four
      { centerFrac: 0.5, gapMult: 1.15, fork: { islandFrac: 0.28 } }, { centerFrac: 0.65, gapMult: 1.15, fork: { islandFrac: 0.28 } }, { centerFrac: 0.55, gapMult: 1.15, fork: { islandFrac: 0.26 } },
      { centerFrac: 0.82 }, { centerFrac: 0.73 },
      { centerFrac: 0.75 }, { centerFrac: 0.78 }, { centerFrac: 0.62 },
      { centerFrac: 0.72 }, { centerFrac: 0.63 }, { centerFrac: 0.48 },
      { centerFrac: 0.63 }, { centerFrac: 0.46, gapMult: 1.45, fork: { islandFrac: 0.15 } }, { centerFrac: 0.59, gapMult: 1.45, fork: { islandFrac: 0.15 } },
      { centerFrac: 0.73, gapMult: 1.45, fork: { islandFrac: 0.13 } },
      // tight slalom right after the fork -- quick alternating swings instead of the
      // gentle wave that was here before
      { centerFrac: 0.28 }, { centerFrac: 0.68 }, { centerFrac: 0.26 }, { centerFrac: 0.7 },
      { centerFrac: 0.3 }, { centerFrac: 0.66, gapMult: 0.7 }, { centerFrac: 0.27 }, { centerFrac: 0.65 },
      { centerFrac: 0.79 }, { centerFrac: 0.71 },
      { centerFrac: 0.85, gapMult: 1.5 }, // wide breather -- relief after the slalom
      { centerFrac: 0.73 }, { centerFrac: 0.68 }, { centerFrac: 0.6, gapMult: 0.55 },
      { centerFrac: 0.37 }, { centerFrac: 0.51 }, { centerFrac: 0.62 },
      { centerFrac: 0.8 }, { centerFrac: 0.73 },
      // gauntlet: two narrow squeezes back-to-back, no breathing room between
      { centerFrac: 0.81, gapMult: 0.5 }, { centerFrac: 0.74, gapMult: 0.5 },
      { centerFrac: 0.78 }, { centerFrac: 0.78 },
      { centerFrac: 0.61 }, { centerFrac: 0.47 }, { centerFrac: 0.34 },
      { centerFrac: 0.19 },
      // second fork -- tighter and differently-shaped than the first one
      { centerFrac: 0.29, gapMult: 1.15, fork: { islandFrac: 0.24 } }, { centerFrac: 0.36, gapMult: 1.15, fork: { islandFrac: 0.24 } }, { centerFrac: 0.3, gapMult: 1.15, fork: { islandFrac: 0.22 } },
      { centerFrac: 0.22 }, { centerFrac: 0.28 }, { centerFrac: 0.2, gapMult: 0.55 },
      { centerFrac: 0.3 }, { centerFrac: 0.54 },
      // fourth fork -- tighter and trickier than the others
      { centerFrac: 0.7, gapMult: 1.15, fork: { islandFrac: 0.28 } }, { centerFrac: 0.58, gapMult: 1.15, fork: { islandFrac: 0.28 } }, { centerFrac: 0.66, gapMult: 1.15, fork: { islandFrac: 0.26 } },
      { centerFrac: 0.4 },
      { centerFrac: 0.32 }, { centerFrac: 0.18 }, { centerFrac: 0.31 },
      { centerFrac: 0.41 }, { centerFrac: 0.26 }, { centerFrac: 0.22 },
      { centerFrac: 0.24 }, { centerFrac: 0.38 }, { centerFrac: 0.25 }
    ]
  },
  {
    // a short, single-attack-free mini boss encounter -- deliberately
    // much simpler than THE SIGNAL. uses a separate isMiniBossZone flag
    // (not isBossZone) so none of the main boss's phase/attack logic
    // applies here. same visual palette as INFERNO since it's meant to
    // feel like a continuation of that zone, not a new location
    name: 'MOLTEN CORE',
    skyTop: '#2b0000', skyMid: '#4a0f00', skyBottom: '#1a0000',
    accentA: '#ffcc33', accentB: '#ff3300',
    barTop: '#3a0a00', barBottom: '#180400',
    bgStyle: 'embers',
    gravityMult: 1.0, liftMult: 1.0,
    obstacleShape: 'none',
    isMiniBossZone: true,
    // encounter length is now driven by miniBossCyclesCompleted (concludes right
    // after 1 full cycle), not a frame-count duration -- that approach couldn't
    // reliably align with cycle boundaries that shift with screen width
    pattern: [{ spacing: 100000 }]
  },
  {
    name: 'STORM SKIES',
    skyTop: '#0d0f1a', skyMid: '#1c2138', skyBottom: '#05060c',
    accentA: '#fff59d', accentB: '#5c6bc0',
    barTop: '#1a1d33', barBottom: '#08090f',
    bgStyle: 'storm',
    gravityMult: 1.0, liftMult: 1.0,
    pulseGap: false, obstacleShape: 'lbolt',
    // wind vortex: a few hand-placed swirling gust zones. within reachR of
    // center, the ship feels an oscillating vertical force (not a constant
    // pull like a black hole) that alternates direction as it travels
    // through, scaling smoothly with proximity -- readable and counterable
    // with active input, never strong enough alone to overpower the ship's
    // own controls
    windVortexEvents: [
      { triggerDistance: 220, yFrac: 0.35, reachR: 210 },
      { triggerDistance: 480, yFrac: 0.65, reachR: 220 },
      { triggerDistance: 750, yFrac: 0.5, reachR: 230 }
    ],
    // cloud-to-cloud lightning arc: a diagonal bolt discharging between two
    // cloud silhouettes at different heights and x-positions, unlike the
    // vertical floating bolts below. span is kept well under typical visible
    // play width so both clouds are on-screen together for most of the
    // hazard's approach -- a wider span left the far cloud permanently
    // off-screen, making the line look like it extended forever with no
    // visible end. as the ship scrolls through, the arc's height at the
    // ship's current x changes gradually (slope never demands the ship
    // track faster than it can move), so the safe side of the line shifts
    // smoothly rather than snapping. blinks active/inactive on the same
    // barrierIsActive timing as bolts
    cloudArcEvents: [
      { triggerDistance: 320, y1Frac: 0.22, y2Frac: 0.68, spanPx: 280, onFrames: 70, offFrames: 90, phaseFrac: 0.3 },
      { triggerDistance: 590, y1Frac: 0.75, y2Frac: 0.3, spanPx: 260, onFrames: 65, offFrames: 95, phaseFrac: 0.6 },
      { triggerDistance: 860, y1Frac: 0.3, y2Frac: 0.72, spanPx: 300, onFrames: 75, offFrames: 85, phaseFrac: 0.1 }
    ],
    // each entry is one or more floating bolts. heightFrac is a fraction of the
    // play height (huge bolts anchor near the top or bottom edge so there's
    // always clear space on the other side). shape picks one of the hand-designed
    // silhouettes (E1/E3/E4/E5/E6) so bolts genuinely look different from each
    // other. Bolts blink active/inactive on a timer -- inactive is completely
    // safe, active means the shape is real danger.
    pattern: [
      { spacing: 260, bolts: [{ xJitter: 0, yFrac: 0.45, heightFrac: 0.75, swingWidthPx: 70, shape: 'E3', onFrames: 65, offFrames: 100, phaseFrac: 0.1 }] },
      { spacing: 240, bolts: [
        { xJitter: -20, yFrac: 0.22, heightFrac: 0.16, swingWidthPx: 34, shape: 'E4', onFrames: 80, offFrames: 70, phaseFrac: 0.4 },
        { xJitter: 30, yFrac: 0.72, heightFrac: 0.18, swingWidthPx: 30, shape: 'E6', onFrames: 75, offFrames: 80, phaseFrac: 0.7 }
      ]},
      { spacing: 270, bolts: [{ xJitter: 0, yFrac: 0.62, heightFrac: 0.7, swingWidthPx: 60, shape: 'E1', onFrames: 70, offFrames: 95, phaseFrac: 0.6 }] },
      { spacing: 250, bolts: [{ xJitter: 0, yFrac: 0.5, heightFrac: 0.4, swingWidthPx: 46, shape: 'E5', onFrames: 85, offFrames: 75, phaseFrac: 0.2 }] },
      { spacing: 240, bolts: [
        { xJitter: -25, yFrac: 0.2, heightFrac: 0.15, swingWidthPx: 28, shape: 'E6', onFrames: 90, offFrames: 65, phaseFrac: 0.5 },
        { xJitter: 15, yFrac: 0.5, heightFrac: 0.17, swingWidthPx: 32, shape: 'E4', onFrames: 70, offFrames: 85, phaseFrac: 0.8 },
        { xJitter: 50, yFrac: 0.78, heightFrac: 0.14, swingWidthPx: 26, shape: 'E6', onFrames: 80, offFrames: 75, phaseFrac: 0.15 }
      ]},
      { spacing: 280, bolts: [{ xJitter: 0, yFrac: 0.45, heightFrac: 0.8, swingWidthPx: 72, shape: 'E3', onFrames: 60, offFrames: 105, phaseFrac: 0.35 }] },
      { spacing: 260, bolts: [{ xJitter: 0, yFrac: 0.68, heightFrac: 0.45, swingWidthPx: 50, shape: 'E1', onFrames: 80, offFrames: 80, phaseFrac: 0.9 }] },
      { spacing: 250, bolts: [
        { xJitter: -20, yFrac: 0.3, heightFrac: 0.17, swingWidthPx: 32, shape: 'E4', onFrames: 75, offFrames: 80, phaseFrac: 0.25 },
        { xJitter: 25, yFrac: 0.65, heightFrac: 0.19, swingWidthPx: 30, shape: 'E6', onFrames: 85, offFrames: 70, phaseFrac: 0.55 }
      ]},
      { spacing: 270, bolts: [{ xJitter: 0, yFrac: 0.6, heightFrac: 0.72, swingWidthPx: 62, shape: 'E1', onFrames: 70, offFrames: 100, phaseFrac: 0.05 }] },
      { spacing: 250, bolts: [{ xJitter: 0, yFrac: 0.5, heightFrac: 0.2, swingWidthPx: 40, shape: 'E5', onFrames: 90, offFrames: 60, phaseFrac: 0.65 }] }
    ]
  },
  {
    name: 'ANCIENT RUINS',
    skyTop: '#1c2b38', skyMid: '#2a4150', skyBottom: '#0f1a22',
    accentA: '#4fd6ff', accentB: '#e08850',
    barTop: '#0a2030', barBottom: '#020608',
    bgStyle: 'ruins',
    gravityMult: 1.1, liftMult: 1.0,
    pulseGap: false, obstacleShape: 'pendulum',
    // each entry is a cluster of swinging pendulums. pivotSide anchors the
    // chain to the top or bottom of the play area; the bob swings around a
    // base hang distance from that pivot on a sine cycle -- a different
    // motion character (chain + bob) from anything else in the game.
    pattern: [
      { spacing: 280, pendulums: [{ xJitter: 0, pivotSide: 'top', chainLengthFrac: 0.45, ampFrac: 0.16, freq: 0.02, phase: 0, radiusPx: 22 }] },
      { spacing: 260, pendulums: [{ xJitter: -20, pivotSide: 'bottom', chainLengthFrac: 0.4, ampFrac: 0.14, freq: 0.024, phase: 1.2, radiusPx: 20 }, { xJitter: 40, pivotSide: 'top', chainLengthFrac: 0.3, ampFrac: 0.1, freq: 0.03, phase: 2.5, radiusPx: 16 }] },
      { spacing: 290, pendulums: [{ xJitter: 0, pivotSide: 'top', chainLengthFrac: 0.72, ampFrac: 0.18, freq: 0.017, phase: 0.6, radiusPx: 24 }] },
      { spacing: 270, pendulums: [{ xJitter: 0, pivotSide: 'bottom', chainLengthFrac: 0.68, ampFrac: 0.17, freq: 0.019, phase: 1.8, radiusPx: 22 }] },
      { spacing: 260, pendulums: [{ xJitter: -25, pivotSide: 'top', chainLengthFrac: 0.35, ampFrac: 0.12, freq: 0.026, phase: 0.3, radiusPx: 18 }, { xJitter: 35, pivotSide: 'bottom', chainLengthFrac: 0.32, ampFrac: 0.12, freq: 0.022, phase: 3.1, radiusPx: 18 }] },
      { spacing: 300, pendulums: [{ xJitter: 0, pivotSide: 'top', chainLengthFrac: 0.75, ampFrac: 0.15, freq: 0.015, phase: 2.0, radiusPx: 26 }] },
      { spacing: 270, pendulums: [{ xJitter: 0, pivotSide: 'bottom', chainLengthFrac: 0.7, ampFrac: 0.17, freq: 0.021, phase: 0.9, radiusPx: 20 }] },
      { spacing: 260, pendulums: [{ xJitter: -20, pivotSide: 'top', chainLengthFrac: 0.38, ampFrac: 0.13, freq: 0.025, phase: 1.5, radiusPx: 18 }, { xJitter: 40, pivotSide: 'top', chainLengthFrac: 0.5, ampFrac: 0.14, freq: 0.018, phase: 3.4, radiusPx: 20 }] }
    ],
    // secondary layer: incoming blue flame projectiles (Bowser-stage style),
    // launched from top/bottom on their own independent timer, layered on
    // top of the pendulums rather than replacing them
    // secondary layer: Bowser's fire breath (Super Mario Bros style) -- a
    // straight horizontal line at a fixed height, no bounce, launched on
    // an independent timer alongside the pendulums
    extraFireballPattern: [
      { yFrac: 0.2, rFrac: 0.5, interval: 95 },
      { yFrac: 0.75, rFrac: 0.6, interval: 85 },
      { yFrac: 0.4, rFrac: 0.4, interval: 100 },
      { yFrac: 0.6, rFrac: 0.55, interval: 90 },
      { yFrac: 0.85, rFrac: 0.45, interval: 92 },
      { yFrac: 0.15, rFrac: 0.5, interval: 88 }
    ]
  },
  {
    name: 'TOXIC WASTELAND',
    skyTop: '#0a1408', skyMid: '#1a2e12', skyBottom: '#050a04',
    accentA: '#8aff4d', accentB: '#d4c84a',
    barTop: '#14200e', barBottom: '#040803',
    bgStyle: 'toxic',
    gravityMult: 0.8, liftMult: 0.8,
    // primary: acid drips fall straight down from near the ceiling while
    // also scrolling left with the world -- a genuinely new axis of motion
    // (vertical fall) combined with the usual horizontal travel, so the
    // effective path is diagonal and varies by how far each drip has fallen
    // by the time it reaches you
    obstacleShape: 'aciddrip',
    pattern: [
      { targetFallFrac: 0.15, radiusPx: 16, spacing: 150 },
      { targetFallFrac: 0.9, radiusPx: 20, spacing: 165 },
      { targetFallFrac: 0.3, radiusPx: 14, spacing: 140 },
      { targetFallFrac: 0.75, radiusPx: 22, spacing: 175 },
      { targetFallFrac: 0.2, radiusPx: 18, spacing: 160 },
      { targetFallFrac: 0.55, radiusPx: 16, spacing: 150 },
      { targetFallFrac: 0.85, radiusPx: 20, spacing: 170 },
      { targetFallFrac: 0.4, radiusPx: 15, spacing: 145 },
      { targetFallFrac: 0.65, radiusPx: 17, spacing: 165 },
      { targetFallFrac: 0.25, radiusPx: 16, spacing: 155 }
    ],
    // secondary: floating toxic pools that also pulse in radius, scattered
    // in open space (dodge-around, like asteroids) rather than blocking a gap
    extraToxicPoolPattern: [
      { yFrac: 0.2, baseRadiusPx: 30, pulseAmpPx: 12, pulseFreq: 0.03, pulsePhase: 0, interval: 80 },
      { yFrac: 0.55, baseRadiusPx: 44, pulseAmpPx: 18, pulseFreq: 0.025, pulsePhase: 1.8, interval: 75 },
      { yFrac: 0.8, baseRadiusPx: 28, pulseAmpPx: 10, pulseFreq: 0.035, pulsePhase: 3.2, interval: 85 },
      { yFrac: 0.35, baseRadiusPx: 37, pulseAmpPx: 16, pulseFreq: 0.028, pulsePhase: 2.5, interval: 75 }
    ],
    // third layer: toxic geysers anchored to the floor or ceiling. rest
    // time is now short relative to the active cycle, so an approaching
    // ship is far more likely to actually catch one mid-eruption instead of
    // gliding past during its long idle window
    extraGeyserPattern: [
      { pivotSide: 'floor', lowHeightPx: 18, highHeightPx: 300, widthPx: 34, warningFrames: 35, riseFrames: 10, holdFrames: 42, fallFrames: 14, restFrames: 35, phaseOffset: 0, interval: 170 },
      { pivotSide: 'ceiling', lowHeightPx: 16, highHeightPx: 290, widthPx: 32, warningFrames: 30, riseFrames: 9, holdFrames: 38, fallFrames: 13, restFrames: 32, phaseOffset: 60, interval: 180 },
      { pivotSide: 'floor', lowHeightPx: 20, highHeightPx: 330, widthPx: 36, warningFrames: 32, riseFrames: 11, holdFrames: 40, fallFrames: 14, restFrames: 34, phaseOffset: 120, interval: 175 },
      { pivotSide: 'ceiling', lowHeightPx: 18, highHeightPx: 300, widthPx: 34, warningFrames: 34, riseFrames: 10, holdFrames: 40, fallFrames: 14, restFrames: 33, phaseOffset: 20, interval: 170 }
    ]
  },
  {
    name: 'DERELICT STATION',
    skyTop: '#0a0e14', skyMid: '#141d28', skyBottom: '#04060a',
    accentA: '#5ec8e8', accentB: '#e8a84a',
    barTop: '#101820', barBottom: '#030507',
    bgStyle: 'station',
    gravityMult: 0.5, liftMult: 0.5,
    // primary: tumbling metal wreckage, drifting through in true zero-g --
    // same role as asteroids but man-made, angular, and visibly spinning
    // (nothing else in the game rotates)
    obstacleShape: 'wreckage',
    pattern: [
      { spacing: 270, wreckage: [{ xJitter: -20, yFrac: 0.25, rFrac: 0.6, rotSpeed: 0.025 }, { xJitter: 15, yFrac: 0.6, rFrac: 0.8, rotSpeed: -0.018 }] },
      { spacing: 290, wreckage: [{ xJitter: -25, yFrac: 0.35, rFrac: 0.9, rotSpeed: 0.015 }, { xJitter: 10, yFrac: 0.75, rFrac: 0.55, rotSpeed: -0.03 }] },
      { spacing: 260, wreckage: [{ xJitter: -10, yFrac: 0.2, rFrac: 0.5, rotSpeed: 0.035 }, { xJitter: 25, yFrac: 0.5, rFrac: 0.7, rotSpeed: -0.02 }, { xJitter: 55, yFrac: 0.8, rFrac: 0.85, rotSpeed: 0.012 }] },
      { spacing: 310, wreckage: [{ xJitter: -30, yFrac: 0.55, rFrac: 0.8, rotSpeed: -0.022 }, { xJitter: 5, yFrac: 0.25, rFrac: 0.6, rotSpeed: 0.028 }] }
    ],
    // secondary layer 1: a solid moving door with 1-3 cut-through gaps.
    // the whole slab (and its gaps) slides up and down together, so the
    // gap positions shift while their relative spacing stays fixed --
    // you're aligning with a moving window, not waiting out a timer
    movingDoorPattern: [
      { gaps: [{ centerFrac: 0.5, heightFrac: 0.35 }], amplitudeFrac: 0.2, freq: 0.02, phase: 0, widthPx: 26, interval: 260 },
      { gaps: [{ centerFrac: 0.3, heightFrac: 0.2 }, { centerFrac: 0.7, heightFrac: 0.2 }], amplitudeFrac: 0.12, freq: 0.018, phase: 1.5, widthPx: 28, interval: 300 },
      { gaps: [{ centerFrac: 0.17, heightFrac: 0.16 }, { centerFrac: 0.5, heightFrac: 0.16 }, { centerFrac: 0.83, heightFrac: 0.16 }], amplitudeFrac: 0.08, freq: 0.022, phase: 3.0, widthPx: 30, interval: 340 }
    ],
    // exactly 3 special access-card doors, hand-placed at fixed distances
    // through the zone -- stationary, fully sealed until you collect the
    // matching key that spawns a bit before each one
    specialDoorEvents: [
      { triggerDistance: 220, keyLeadDistance: 90, keyYFrac: 0.3 },
      { triggerDistance: 520, keyLeadDistance: 86, keyYFrac: 0.45 },
      { triggerDistance: 800, keyLeadDistance: 90, keyYFrac: 0.75 }
    ],
    // third layer: a damaged reactor hub mounted on a tower extending from
    // the ceiling or floor, that charges up then fires 8 spike-ball
    // projectiles outward in fixed evenly-spaced directions. radial speed
    // comfortably exceeds the world scroll, so outward-launched
    // projectiles genuinely pull away rather than linger, and projectiles
    // now fly until they actually leave the screen in any direction
    // rather than despawning early on a fixed timer
    extraSparkHubPattern: [
      { mountSide: 'ceiling', towerLength: 90, chargeFrames: 45, restFrames: 150, projectileSpeed: 2.7, projectileR: 8, interval: 320 },
      { mountSide: 'floor', towerLength: 100, chargeFrames: 40, restFrames: 160, projectileSpeed: 2.79, projectileR: 8, interval: 340 }
    ]
  },
  {
    // a second, distinct mini boss encounter -- a corrupted station defense
    // core, positioned as a direct continuation of DERELICT STATION (same
    // visual palette/background) right before the player passes into THE
    // VOID. Uses the same isMiniBossZone framework as MOLTEN CORE, but
    // miniBossVariant distinguishes which attack set applies so this boss's
    // logic is entirely separate from the fire boss's -- no shared attack
    // code, so this can't regress MOLTEN CORE. No escape run afterward:
    // the zone just warps once the boss is defeated.
    name: 'REACTOR CORE',
    skyTop: '#0a0e14', skyMid: '#141d28', skyBottom: '#04060a',
    accentA: '#5ec8e8', accentB: '#e8a84a',
    barTop: '#101820', barBottom: '#030507',
    bgStyle: 'station',
    gravityMult: 0.5, liftMult: 0.5,
    obstacleShape: 'none',
    isMiniBossZone: true,
    miniBossVariant: 'core',
    pattern: [{ spacing: 100000 }]
  },
  {
    name: 'THE VOID',
    skyTop: '#020103', skyMid: '#050208', skyBottom: '#010001',
    accentA: '#8a5cf5', accentB: '#c9a0ff',
    barTop: '#08040c', barBottom: '#000000',
    bgStyle: 'void',
    gravityMult: 1, liftMult: 1,
    // no recurring primary hazard -- black holes are exactly 4 hand-placed
    // events (see blackHoleEvents below), not a repeating spawn pattern.
    // 'none' tells the main spawn loop to skip primary spawning entirely;
    // pattern is a harmless placeholder so shared code that expects it
    // to exist doesn't break
    obstacleShape: 'none',
    pattern: [{ spacing: 100000 }],
    blackHoleEvents: [
      { triggerDistance: 123.33333333333331, yFrac: 0.2899531637527301, coreR: 325, reachR: 510 },
      { triggerDistance: 380, yFrac: 0.94, coreR: 355, reachR: 615 },
      { triggerDistance: 591.2, yFrac: 0.48410596026490066, coreR: 195, reachR: 320 },
      { triggerDistance: 743.7333333333332, yFrac: 0.12980132450331128, coreR: 400, reachR: 660 },
      { triggerDistance: 269.0666666666667, yFrac: 0.6909676266207777, coreR: 200, reachR: 335 }
    ],
    // secondary layer: planets on a full, continuous circular orbit around
    // a free-floating point -- not tied to any black hole's position, so
    // placement is unconstrained by hole geometry. once learned, the path
    // repeats forever, so it's a fixed pattern to route around rather than
    // a one-time read
    extraOrbiterPattern: [
      { centerYFrac: 0.3, orbitRadius: 130, angularSpeed: 0.02, initialAngle: 0, bodyR: 18, color: '#e8955c', interval: 420 },
      { centerYFrac: 0.65, orbitRadius: 150, angularSpeed: -0.017, initialAngle: 2.5, bodyR: 20, color: '#5ca8e8', interval: 460 }
    ],
    // secondary layer: planets that swoop through part of a curved arc
    // then continue off in a straight line -- never repeats the same
    // loop, reads more like a one-time comet pass than an orbit
    extraArcPlanetPattern: [
      { startYFrac: 0.12, arcDropFrac: 0.45, lifeFrames: 160, bodyR: 17, color: '#c95ce8', interval: 380 },
      { startYFrac: 0.85, arcDropFrac: -0.4, lifeFrames: 150, bodyR: 19, color: '#e8c25c', interval: 400 }
    ],
    // exactly 3 gravitational lensing zones, hand-placed at fixed
    // distances -- a region of warped, rippling visual distortion (not a
    // lie about hitboxes, just genuinely confusing to look at) with a
    // small, easy-to-overlook lethal core hidden near its center. the
    // challenge is perceptual (harder to notice the danger) rather than
    // geometric
    lensingZoneEvents: [
      { triggerDistance: 218.8, yFrac: 0.4572755702722591, zoneRadius: 120, coreR: 12 },
      { triggerDistance: 508, yFrac: 0.6641059602649008, zoneRadius: 155, coreR: 52 },
      { triggerDistance: 711.4666666666667, yFrac: 0.3735099337748345, zoneRadius: 125, coreR: 12 },
      { triggerDistance: 388.1333333333333, yFrac: 0.204635761589404, zoneRadius: 120, coreR: 12 }
    ],
    // exactly 2 supernova planets, hand-placed at fixed distances --
    // large, stationary, black-hole-scale set pieces. each one sits
    // dormant (fully solid, lethal on contact) for a while, then
    // destabilizes with a visible warning buildup, detonates in a single
    // dramatic flash, and scatters into several lethal debris fragments
    // that fly outward in varied directions until they're off-screen.
    // 'timer' variant (both events below) detonates on a fixed schedule
    // since spawn. 'onscreen' variant instead starts its warning the
    // moment it crosses onto the visible screen, skipping the long
    // stable dormant approach -- a more sudden, surprising version
    supernovaEvents: [
      { triggerDistance: 350, yFrac: 0.25, planetR: 140, variant: 'timer', dormantFrames: 220, warningFrames: 100 },
      { triggerDistance: 680, yFrac: 0.7, planetR: 150, variant: 'timer', dormantFrames: 100, warningFrames: 110 },
      { triggerDistance: 525.1333333333333, yFrac: 0.2708609271523179, planetR: 140, variant: 'timer', dormantFrames: 200, warningFrames: 100 },
      { triggerDistance: 841, yFrac: 0.8245033112582784, planetR: 140, variant: 'timer', dormantFrames: 150, warningFrames: 100 },
      { triggerDistance: 243.13333333333333, yFrac: 0.4622792528165098, planetR: 260, variant: 'timer', dormantFrames: 100, warningFrames: 100 },
      { triggerDistance: 755.8666666666668, yFrac: 0.5317880794701988, planetR: 140, variant: 'timer', dormantFrames: 130, warningFrames: 100 },
      { triggerDistance: 431.3333333333333, yFrac: 0.34105960264900664, planetR: 280, variant: 'timer', dormantFrames: 80, warningFrames: 100 }
    ]
  },
  {
    name: 'NEON CITY',
    skyTop: '#0a0518', skyMid: '#160a2e', skyBottom: '#040210',
    accentA: '#ff2ec4', accentB: '#2ee8ff',
    barTop: '#140a24', barBottom: '#050208',
    bgStyle: 'stars',
    gravityMult: 1, liftMult: 1,
    obstacleShape: 'none',
    // harmless placeholder so any shared code that assumes pattern
    // exists doesn't break -- 'none' tells the actual spawn loop to
    // skip primary spawning entirely, matching the same convention
    // established for Zone 9
    pattern: [{ spacing: 100000 }],
    // exactly 2 fixed, hand-placed laser grid encounters for the whole
    // zone -- not a repeating pattern. each is a zigzag: 3 vertical
    // dividers in sequence, each with its own single gap at a different
    // height, framed by non-collidable decorative caps top and bottom.
    // no internal horizontal dividers (that's what caused the earlier
    // "impossible wall" bug -- a horizontal line not bordering the
    // single open cell stayed fully solid across every column, with no
    // way through)
    lasergridEvents: [
      { triggerDistance: 30, dividerXRels: [0, 380, 760], gapYFracs: [0.2, 0.8, 0.5], gapHeight: 150 },
      { triggerDistance: 520, dividerXRels: [0, 380, 760], gapYFracs: [0.75, 0.25, 0.7], gapHeight: 150 }
    ],
    // exactly 4 fixed drone swarm bursts for the whole zone -- not a
    // repeating pattern. spread across the zone, spaced away from the
    // laser grid encounters (200, 650) so they read as distinct moments
    droneSwarmEvents: [
      { triggerDistance: 100, formationYFracs: [0.1, 0.25, 0.4, 0.75, 0.9], speedMult: 2.2, r: 11 },
      { triggerDistance: 380, formationYFracs: [0.15, 0.3, 0.6, 0.8], speedMult: 2.4, r: 12 },
      { triggerDistance: 550, formationYFracs: [0.1, 0.25, 0.4, 0.75, 0.9], speedMult: 2.2, r: 11 },
      { triggerDistance: 910, formationYFracs: [0.15, 0.3, 0.6, 0.8], speedMult: 2.4, r: 12 }
    ],
    // exactly 3 fixed holographic billboard events for the whole zone --
    // a single large glowing panel anchored to the ceiling or floor,
    // extending partway into the play height with a clear passage on
    // the other side. a big static set-piece, unlike the fast drones or
    // the precision laser grid -- the challenge here is pure routing
    // exactly 2 (not 3) fixed holographic billboard events -- reduced
    // from the original 3 because the math genuinely doesn't allow 2
    // large laser grids (each needing ~272 distance-units of runway to
    // fully clear the screen) plus 3 billboards (each needing ~148) to
    // coexist without overlapping within a 1000-distance zone. this
    // schedule interleaves grid/billboard/grid/billboard with genuine
    // non-overlapping gaps between every consecutive pair, verified
    // directly rather than assumed
    billboardEvents: [
      { triggerDistance: 340, anchor: 'top', extendFrac: 0.62, panelWidth: 180 },
      { triggerDistance: 800, anchor: 'bottom', extendFrac: 0.58, panelWidth: 180 }
    ],
    // exactly 2 fixed automated defense turret events -- a stationary
    // mount anchored to the ceiling or floor that fires a few fast
    // projectiles horizontally at its own fixed height. the first "thing
    // that shoots something else" in this zone (drones ARE the hazard;
    // this launches a separate one). all shots from one turret travel
    // along the same horizontal line, so the ship just needs to clear
    // that one height when shots are incoming -- deliberately simple
    // geometry after the searchlight's lesson about angled hazards
    turretEvents: [
      { triggerDistance: 150, anchor: 'top', mountOffset: 70, numShots: 3, fireInterval: 80, fireAngleDeg: 0, projectileSpeed: 6.5, projectileR: 10 },
      { triggerDistance: 620, anchor: 'bottom', mountOffset: 70, numShots: 3, fireInterval: 80, fireAngleDeg: 0, projectileSpeed: 6.5, projectileR: 10 }
    ],
    // exactly 2 fixed signal corruption zone events -- a genuinely
    // different function from the lensing zone it was originally
    // modeled on: this has no lethal core and no collision at all.
    // instead, while the ship's x is anywhere within the zone's width,
    // holding and releasing are swapped. every other hazard in this
    // game is spatial avoidance; this is interference with the
    // player's own input -- a different category of challenge entirely
    signalCorruptionEvents: [
      { triggerDistance: 250, zoneWidth: 380 },
      { triggerDistance: 700, zoneWidth: 380 }
    ],
    // exactly 2 fixed EMP power surge events -- a build-up-then-release
    // rhythm, distinct from every other hazard in this zone. during the
    // charge phase (sparking, pulsing glow near the anchor) the region
    // is completely safe to fly through. only during the brief discharge
    // does the fixed region near the anchor become lethal -- the
    // challenge is having already moved clear by the time it fires,
    // not reading a gap or dodging something continuously present
    empEvents: [
      { triggerDistance: 470, anchor: 'top', reachDepth: 300, chargeFrames: 250, dischargeFrames: 45 },
      { triggerDistance: 780, anchor: 'bottom', reachDepth: 300, chargeFrames: 250, dischargeFrames: 45 }
    ],
    // DISABLED -- unresolved safety concern. The core mechanic tests
    // correctly in isolation (hovering triggers a collision at exactly
    // the delay frame; steady movement never catches its own echo), but
    // in the full combined zone a test pilot kept failing at the same
    // point regardless of how aggressively its avoidance was tuned --
    // a signature suggesting a real feedback-loop problem (avoiding the
    // echo while also reacting to other hazards can flip-flop the "safe
    // direction" and never settle), not just a test-pilot bug. Needs a
    // real investigation before re-enabling. Not spawned anywhere below
    // -- this array is inert.
    echoTrailEvents_DISABLED: [
      { triggerDistance: 150, zoneWidth: 380, delayFrames: 90, dangerThreshold: 28 },
      { triggerDistance: 850, zoneWidth: 380, delayFrames: 90, dangerThreshold: 28 }
    ],
    // exactly 2 fixed pulsing orb events -- a single obstacle anchored
    // at the vertical center of the play height, continuously growing
    // and shrinking on a slow sine cycle. designed safe by construction
    // and verified with direct math before implementation: even at
    // maximum size, both bands above and below it stay above the
    // minimum safe clearance (66px vs the 33px minimum), and the
    // fastest point in the pulse cycle only changes at ~1.4px/frame,
    // far slower than the ship's own ~5px/frame capability -- there is
    // always a valid passage, timing for the small phase just makes it
    // considerably easier rather than being strictly required
    pulsingOrbEvents: [
      { triggerDistance: 200, minR: 40, maxR: 200, period: 350 },
      { triggerDistance: 750, minR: 40, maxR: 200, period: 350 }
    ],
    // exactly 2 fixed boomerang events -- unlike every other hazard in
    // this zone (or this game), it spawns from the LEFT edge, flies
    // outward (rightward, against the normal scroll direction) past the
    // ship, then curves back and exits left again. crosses the ship's
    // fixed x-position twice -- once outbound, once on return -- at a
    // different height each time. motion is entirely self-contained
    // (independent of world scroll), driven by elapsed time since spawn
    // rather than the generic scroll loop. verified safe with direct
    // math before implementation: vertical speed at both crossings is
    // under 2px/frame (ship's own capability is ~5px/frame), and the
    // two crossings are separated by enough time to comfortably
    // reposition between the outbound and return heights
    boomerangEvents: [
      { triggerDistance: 350, xStart: -100, xMax: 600, yOutbound: 150, yReturn: 450, arcAmplitude: 50, period: 250, r: 14 },
      { triggerDistance: 870, xStart: -100, xMax: 600, yOutbound: 450, yReturn: 150, arcAmplitude: 50, period: 250, r: 14 }
    ],
    // exactly 2 fixed rooftop searchlight events -- a beam pivoting from
    // a fixed point at the ceiling, sweeping its angle back and forth
    // over time (not tied to scroll position), always reaching exactly
    // the floor regardless of angle. a moving line hazard, genuinely
    // different from every other shape in this zone. placed in the gaps
    // between grid/billboard events so nothing overlaps
    // DISABLED -- confirmed unsafe. Direct isolated testing (zero other
    // hazards, mathematically optimal pilot sampling many candidate Y
    // positions using the exact point-to-segment collision formula)
    // still failed. Even after fixing the tan()-based nonlinearity bug
    // and slowing the sweep substantially, there is apparently a moment
    // during the sweep where no position in the play height has safe
    // clearance from the beam. This needs a real redesign (e.g. capping
    // how close the beam can get to full-width coverage, or reworking
    // the geometry entirely) before re-enabling. Not currently spawned
    // anywhere in the trigger loop below -- this array is inert.
    searchlightEvents_DISABLED: [
      { triggerDistance: 310, angleMaxDeg: 50, sweepPeriod: 700, beamWidth: 14 },
      { triggerDistance: 955, angleMaxDeg: 55, sweepPeriod: 750, beamWidth: 14 }
    ]
  },
  {
    // the final zone -- not a scrolling gauntlet like every other zone,
    // but a timer-based boss survival fight. reuses Zone 1's exact sky
    // and accent colors deliberately, since the boss is the same
    // sun/orb that's been sitting in Zone 1's background the whole
    // game, now revealed as a third, active orb launching attacks.
    // obstacleShape stays 'none' and there's no THEME_DISTANCE-based
    // portal at all -- completion is entirely driven by bossDuration
    // counting down to zero, not distance
    name: 'THE SIGNAL',
    skyTop: '#1a0b3a', skyMid: '#2a0f4a', skyBottom: '#120523',
    accentA: '#ff2079', accentB: '#0ff0fc',
    phase3SkyTop: '#4a0000', phase3SkyMid: '#2a0000', phase3SkyBottom: '#0a0000',
    phase3AccentA: '#ff0000', phase3AccentB: '#3d0000',
    barTop: '#3a0f5c', barBottom: '#1a0630',
    bgStyle: 'grid',
    gravityMult: 1, liftMult: 1,
    obstacleShape: 'none',
    isBossZone: true,
    bossDuration: 11200, // TEMPORARILY EXPANDED -- phases 1-4 at 1500 each (6000), phase 5 extended to 5200 to fit all 8 charge beam shots plus the final-charge-to-explosion ending sequence, verified empirically
    pattern: [{ spacing: 100000 }]
  }
];

// ---- Game state ----
let state = 'ready'; // home, options, settings, achievements, ready, playing, paused, respawn, gameover, victory
// difficulty selected on the main menu -- 'easy' | 'normal' | 'hard' | 'extra'.
// no gameplay-affecting logic hooked up to this yet; specifics come later.
let selectedDifficulty = 'normal';
// true when playing a single zone via Zone Select -- clearing or dying in
// this zone returns to the main menu instead of continuing to the next
// zone, unlocking Overdrive, or counting toward deaths-by-zone stats
let isPracticeRun = false;
let practiceZoneIndex = 0;
// true once any dev tool (Edit Zone jump, boss-phase skips, etc.) has
// placed the player into a zone -- everything that follows this session
// is dev testing, not real play, so it must not silently mark zones as
// completed/deathless or bump lifetime stats. Cleared on a genuine fresh
// start via resetGame().
let devSessionActive = false;
// which zone tile is currently highlighted/previewed in Zone Select --
// distinct from practiceZoneIndex, which is only set once a run actually
// begins. Reset to the first unlocked zone each time the screen opens.
let zoneSelectPreviewIdx = 0;
// where the Settings screen's BACK button returns to -- 'options' when
// entered from the main Options menu, 'paused' when entered from the
// Pause menu, so it doesn't strand the player on the wrong screen
let settingsReturnState = 'options';

// unified, persisted player profile: best distance, the 4th difficulty
// unlock, and which zones have been reached (unlocking them for Zone
// Select). Migrates from the older, separate localStorage keys this game
// used before, so existing players don't lose their progress.
const PROFILE_STORAGE_KEY = 'synthFlightProfile';
const ZONE_SHOTS_KEY = 'synthFlightZoneShotsV7';
const PREVIEW_STILL_W = 640;
const PREVIEW_STILL_ASPECT = 860 / 412;
let zoneScreenshots = {};
let zoneScreenshotLive = {};

function loadZoneScreenshots() {
  try {
    const raw = localStorage.getItem(ZONE_SHOTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return {};
    const out = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v === 'string' && v.startsWith('data:image/')) out[k] = v;
    }
    return out;
  } catch (e) {
    return {};
  }
}

function saveZoneScreenshots() {
  try {
    localStorage.setItem(ZONE_SHOTS_KEY, JSON.stringify(zoneScreenshots));
  } catch (e) { /* quota/private mode -- keep the in-memory shots for this session */ }
}

function storeZoneScreenshot(themeIdx, dataUrl, fromLivePlay) {
  if (themeIdx == null || !dataUrl) return;
  if (zoneScreenshotLive[themeIdx] && !fromLivePlay) return;
  // Live play used to overwrite every zone's still with a full-window
  // snapshot. On a tall browser that produced nearly-square images, which
  // the wide Zone Select viewport then pillarboxed. Keep authored/generated
  // stills for standard and mini-boss zones; The Signal may still update
  // once the boss is actually on-screen.
  if (fromLivePlay && zoneScreenshots[themeIdx]) {
    const th = THEMES[themeIdx];
    if (!th || !th.isBossZone) {
      zoneScreenshotLive[themeIdx] = true;
      return;
    }
  }
  zoneScreenshots[themeIdx] = dataUrl;
  if (fromLivePlay) zoneScreenshotLive[themeIdx] = true;
  saveZoneScreenshots();
}

function cropPlayfieldToJpeg(srcCanvas, quality) {
  if (!srcCanvas || srcCanvas.width < 2 || srcCanvas.height < 2) return null;
  const scaleY = srcCanvas.height / Math.max(1, H);
  const playSy = Math.max(0, PLAY_TOP * scaleY);
  const playSh = Math.max(1, Math.min(srcCanvas.height - playSy, (PLAY_BOTTOM - PLAY_TOP) * scaleY));
  const playSw = srcCanvas.width;
  let sx = 0;
  let sy = playSy;
  let sw = playSw;
  let sh = playSh;
  const playAspect = sw / sh;
  if (playAspect < PREVIEW_STILL_ASPECT) {
    sh = sw / PREVIEW_STILL_ASPECT;
    const shipY = (typeof ship !== 'undefined' && ship) ? ship.y : (PLAY_TOP + PLAY_BOTTOM) / 2;
    const focusSy = shipY * scaleY;
    sy = Math.max(playSy, Math.min(playSy + playSh - sh, focusSy - sh / 2));
  } else if (playAspect > PREVIEW_STILL_ASPECT) {
    sw = sh * PREVIEW_STILL_ASPECT;
    sx = Math.max(0, (playSw - sw) / 2);
  }
  const destW = PREVIEW_STILL_W;
  const destH = Math.max(1, Math.round(destW / PREVIEW_STILL_ASPECT));
  const off = document.createElement('canvas');
  off.width = destW;
  off.height = destH;
  const octx = off.getContext('2d');
  if (!octx) return null;
  octx.imageSmoothingEnabled = true;
  octx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, destW, destH);
  try {
    return off.toDataURL('image/jpeg', quality);
  } catch (e) {
    return null;
  }
}

function maybeCaptureZoneScreenshot() {
  if (state !== 'playing') return;
  if (warpActive || bossExplosionActive || shipFlyOffActive) return;
  if (zoneScreenshotLive[themeIndex]) return;
  const th = currentTheme();
  // Live play only overwrites The Signal. Other zones already have a still,
  // but storeZoneScreenshot used to reject the JPEG without marking the
  // zone captured -- so every later frame still encoded a full-canvas
  // JPEG. That's the mid-zone hitch on Inferno and everywhere else.
  if (zoneScreenshots[themeIndex] && !(th && th.isBossZone)) {
    zoneScreenshotLive[themeIndex] = true;
    return;
  }
  if (th.isBossZone) {
    if (!boss || boss.r < boss.maxR * 0.85) return;
    if (frame - bossSpawnFrame < BOSS_ENTRANCE_DURATION) return;
    if (bossDefeated || bossFullyDefeated || bossFinalChargeActive) return;
  } else if (th.isMiniBossZone) {
    if (!miniBoss || miniBoss.r < miniBoss.maxR * 0.85) return;
    if (frame - miniBossSpawnFrame < MINI_BOSS_ENTRANCE_DURATION) return;
    if (miniBossDefeated) return;
    if (th.miniBossVariant === 'core') {
      const busy = miniBossAttackState === 'coreOrbitBarrageActive'
        || miniBossAttackState === 'coreCrossfireActive'
        || miniBossAttackState === 'coreEmpActive'
        || miniBossAttackState === 'coreLaserActive'
        || miniBossAttackState === 'coreBulkheadActive'
        || miniBossAttackState === 'coreSparkDeploy'
        || (coreOrbitProjectiles && coreOrbitProjectiles.length > 4)
        || (coreSparks && coreSparks.length > 2);
      if (!busy) return;
    }
  } else {
    const progress = distance - zoneStartDistance;
    if (progress < 35) return;
    if (gates.length === 0 && progress < 90) return;
  }
  const url = cropPlayfieldToJpeg(canvas, 0.78);
  if (url) storeZoneScreenshot(themeIndex, url, true);
}

function zonePreviewCameraWorldX(themeIdx) {
  // Inferno and Storm Skies look empty/generic at the spawn funnel; a few
  // seconds in is where the cave fork and bolt clusters actually show.
  if (themeIdx === 3) return 1550;
  if (themeIdx === 5) return 1250;
  return 300;
}

function poseZonePreviewCombatants(theme) {
  boss = null;
  miniBoss = null;
  bossFullyDefeated = false;
  bossDefeated = false;
  bossTransitioning = false;
  bossExplosionActive = false;
  bossFinalChargeActive = false;
  bossPhase = 1;
  if (theme.isBossZone) {
    const bossBaseY = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * 0.5;
    const bossMaxR = (PLAY_BOTTOM - PLAY_TOP) * 0.22;
    const bossFinalX = Math.min(ship.x + 300, W - bossMaxR - 70);
    boss = { x: bossFinalX, y: bossBaseY, baseY: bossBaseY, maxR: bossMaxR, r: bossMaxR, fragments: [] };
    bossSpawnFrame = frame - BOSS_ENTRANCE_DURATION;
  } else if (theme.isMiniBossZone) {
    const miniBaseY = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * 0.5;
    const miniBossMaxR = (PLAY_BOTTOM - PLAY_TOP) * 0.16 * 0.85;
    const miniRestX = theme.miniBossVariant === 'core'
      ? Math.min(ship.x + 588, W - 84)
      : Math.min(ship.x + 366, W - miniBossMaxR - 40);
    miniBoss = {
      x: miniRestX, restX: miniRestX, y: miniBaseY, baseY: miniBaseY,
      maxR: miniBossMaxR, r: miniBossMaxR
    };
    miniBossSpawnFrame = frame - MINI_BOSS_ENTRANCE_DURATION - 1;
    miniBossDefeated = false;
    if (theme.miniBossVariant === 'core') {
      miniBoss.x = Math.min(ship.x + CORE_SPHERE_X_OFFSET, miniRestX);
      miniBoss.r = miniBossMaxR;
      miniBossAttackState = 'coreOrbitBarrageActive';
      miniBossAttackStateStartFrame = frame - 180;
      coreBossPhase = 8;
      coreGateOpenAmount = 1;
      coreOrbitEmitAngle = 0.35;
      coreOrbitProjectiles = [];
      for (let i = 0; i < 14; i++) {
        const angle = i * 0.48 + 0.15;
        const dist = 55 + i * 26;
        coreOrbitProjectiles.push({
          angle,
          dist,
          x: miniBoss.x + Math.cos(angle) * dist,
          y: miniBoss.y + Math.sin(angle) * dist
        });
      }
      coreOrbitSpawned = 14;
      coreEyeBeamState = 'lock';
      coreEyeBeamStateStartFrame = frame;
      coreEyeBeamY = ship.y;
    } else {
      miniBossAttackState = 'floating';
    }
  }
}

function placePreviewShipClearOfHazards() {
  const pad = SHIP_H / 2 + 8;
  const clampY = (y) => Math.max(PLAY_TOP + pad, Math.min(PLAY_BOTTOM - pad, y));

  if (terrainSegments && terrainSegments.length >= 2) {
    const b = terrainBoundsAt(ship.x) || terrainBoundsAt(terrainSegments[0].x);
    if (b) {
      const hasIsland = (b.islandBottom - b.islandTop) > 4;
      if (hasIsland) {
        const upperH = b.islandTop - b.top;
        const lowerH = b.bottom - b.islandBottom;
        if (lowerH >= upperH && lowerH > pad * 2) ship.y = clampY((b.islandBottom + b.bottom) / 2);
        else if (upperH > pad * 2) ship.y = clampY((b.top + b.islandTop) / 2);
        else ship.y = clampY((b.top + b.bottom) / 2);
      } else {
        ship.y = clampY((b.top + b.bottom) / 2);
      }
      return;
    }
  }

  let bestGate = null;
  let bestDist = Infinity;
  for (const g of gates) {
    if (!g || g.type !== 'gate') continue;
    const gx = g.x + (typeof GATE_WIDTH === 'number' ? GATE_WIDTH / 2 : 0);
    const dist = Math.abs(gx - ship.x);
    if (dist < 90 && dist < bestDist) {
      bestDist = dist;
      bestGate = g;
    }
  }
  if (bestGate) ship.y = clampY(liveGateCenter(bestGate));
}

function generateAndStoreZoneStill(themeIdx) {
  if (zoneScreenshots[themeIdx] || typeof simulateZonePreview !== 'function') return zoneScreenshots[themeIdx] || null;
  const savedCtx = ctx;
  const savedGates = gates;
  const savedTerrain = terrainSegments;
  const savedTheme = themeIndex;
  const savedShip = { x: ship.x, y: ship.y, vy: ship.vy, rotation: ship.rotation };
  const savedFrame = frame;
  const savedZsf = zoneStartFrame;
  const savedWarp = warpActive;
  const savedBg = bgParticles;
  const savedPortal = portalObject;
  const savedState = state;
  const savedLayout = { W, H, BAR_HEIGHT, PLAY_TOP, PLAY_BOTTOM, renderScale };
  const savedCombat = {
    boss, miniBoss, bossSpawnFrame, bossPhase, bossFullyDefeated, bossDefeated,
    bossTransitioning, bossExplosionActive, bossFinalChargeActive,
    miniBossSpawnFrame, miniBossAttackState, miniBossAttackStateStartFrame, miniBossDefeated,
    coreBossPhase, coreOrbitProjectiles, coreOrbitSpawned, coreOrbitEmitAngle,
    coreGateOpenAmount, coreEyeBeamState, coreEyeBeamStateStartFrame, coreEyeBeamY
  };
  let url = null;
  const off = document.createElement('canvas');
  W = 860;
  H = 500;
  BAR_HEIGHT = 44;
  PLAY_TOP = 44;
  PLAY_BOTTOM = 456;
  renderScale = 1;
  off.width = W;
  off.height = H;
  const octx = off.getContext('2d', { alpha: false }) || off.getContext('2d');
  ctx = octx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  sharpenCanvasContext(ctx);
  try {
    const cam = zonePreviewCameraWorldX(themeIdx);
    const targetDistance = Math.max(220, (cam + W + 240) / 10);
    let data = null;
    try {
      data = simulateZonePreview(themeIdx, targetDistance);
    } catch (e) {
      data = null;
    }
    if (!data) return null;
    themeIndex = themeIdx;
    warpActive = false;
    portalObject = null;
    state = 'playing';
    frame = 180;
    zoneStartFrame = 0;
    ship.x = W * 0.28;
    ship.y = (PLAY_TOP + PLAY_BOTTOM) / 2;
    ship.vy = 0;
    ship.rotation = 0;
    const toScreenX = (worldX) => ship.x + (worldX - cam);
    if (data.terrainSegments) {
      terrainSegments = data.terrainSegments.map((s) => ({ ...s, x: toScreenX(s.x) }));
    }
    gates = (data.obstacles || []).map((g) => {
      const worldX = g.previewX != null ? g.previewX : g.x;
      return { ...g, x: toScreenX(worldX), x2: g.x2 != null ? toScreenX(g.x2) : g.x2 };
    });
    const theme = THEMES[themeIdx];
    poseZonePreviewCombatants(theme);
    placePreviewShipClearOfHazards();
    initBackgroundParticles(theme);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    drawBackground(theme);
    drawBoss(theme);
    drawMiniBoss(theme);
    drawMiniBossBarrage(theme);
    drawMiniBossFlameWall(theme);
    drawReactorCoreAttacks(theme);
    if (theme.obstacleShape === 'terrain') drawTerrain(theme);
    else drawGates(theme);
    if (theme.isBossZone) drawBossArenaBarrierWall(theme, boss);
    if (theme.isMiniBossZone && miniBoss && theme.miniBossVariant !== 'core') {
      drawBossArenaObsidianWall(theme, miniBoss);
    }
    drawShip(theme);
    url = cropPlayfieldToJpeg(off, 0.78);
  } catch (e) {
    /* still restore below */
  } finally {
    W = savedLayout.W;
    H = savedLayout.H;
    BAR_HEIGHT = savedLayout.BAR_HEIGHT;
    PLAY_TOP = savedLayout.PLAY_TOP;
    PLAY_BOTTOM = savedLayout.PLAY_BOTTOM;
    renderScale = savedLayout.renderScale;
    ctx = savedCtx;
    applyCanvasRenderScale();
    gates = savedGates;
    terrainSegments = savedTerrain;
    themeIndex = savedTheme;
    ship.x = savedShip.x; ship.y = savedShip.y; ship.vy = savedShip.vy; ship.rotation = savedShip.rotation;
    frame = savedFrame;
    zoneStartFrame = savedZsf;
    warpActive = savedWarp;
    bgParticles = savedBg;
    portalObject = savedPortal;
    state = savedState;
    boss = savedCombat.boss;
    miniBoss = savedCombat.miniBoss;
    bossSpawnFrame = savedCombat.bossSpawnFrame;
    bossPhase = savedCombat.bossPhase;
    bossFullyDefeated = savedCombat.bossFullyDefeated;
    bossDefeated = savedCombat.bossDefeated;
    bossTransitioning = savedCombat.bossTransitioning;
    bossExplosionActive = savedCombat.bossExplosionActive;
    bossFinalChargeActive = savedCombat.bossFinalChargeActive;
    miniBossSpawnFrame = savedCombat.miniBossSpawnFrame;
    miniBossAttackState = savedCombat.miniBossAttackState;
    miniBossAttackStateStartFrame = savedCombat.miniBossAttackStateStartFrame;
    miniBossDefeated = savedCombat.miniBossDefeated;
    coreBossPhase = savedCombat.coreBossPhase;
    coreOrbitProjectiles = savedCombat.coreOrbitProjectiles;
    coreOrbitSpawned = savedCombat.coreOrbitSpawned;
    coreOrbitEmitAngle = savedCombat.coreOrbitEmitAngle;
    coreGateOpenAmount = savedCombat.coreGateOpenAmount;
    coreEyeBeamState = savedCombat.coreEyeBeamState;
    coreEyeBeamStateStartFrame = savedCombat.coreEyeBeamStateStartFrame;
    coreEyeBeamY = savedCombat.coreEyeBeamY;
  }
  if (url) storeZoneScreenshot(themeIdx, url, false);
  return url;
}
function loadPlayerProfile() {
  try {
    const raw = localStorage.getItem(PROFILE_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        best: typeof parsed.best === 'number' ? parsed.best : 0,
        extraDifficultyUnlocked: !!parsed.extraDifficultyUnlocked,
        unlockedZones: Array.isArray(parsed.unlockedZones) ? parsed.unlockedZones : [0],
        completedZones: Array.isArray(parsed.completedZones) ? parsed.completedZones : [],
        deathlessZones: Array.isArray(parsed.deathlessZones) ? parsed.deathlessZones : [],
        beatenDifficulties: Array.isArray(parsed.beatenDifficulties) ? parsed.beatenDifficulties : [],
        totalDistanceTraveled: typeof parsed.totalDistanceTraveled === 'number' ? parsed.totalDistanceTraveled : 0,
        lifetimeDeathsByZone: Array.isArray(parsed.lifetimeDeathsByZone) ? parsed.lifetimeDeathsByZone : new Array(13).fill(0),
        zoneCompletionCounts: Array.isArray(parsed.zoneCompletionCounts) ? parsed.zoneCompletionCounts : new Array(13).fill(0),
        achievedRanks: Array.isArray(parsed.achievedRanks) ? parsed.achievedRanks : [],
        shipTrail: typeof parsed.shipTrail === 'string' ? parsed.shipTrail : 'classic',
        shipSkin: typeof parsed.shipSkin === 'string' ? parsed.shipSkin : 'classic',
      };
    }
  } catch (e) { /* corrupted profile data -- fall through to legacy keys/defaults */ }
  const legacyBest = parseInt(localStorage.getItem('synthFlightBest') || '0', 10) || 0;
  const legacyExtra = localStorage.getItem('synthFlightExtraDifficultyUnlocked') === 'true';
  return { best: legacyBest, extraDifficultyUnlocked: legacyExtra, unlockedZones: [0], completedZones: [], deathlessZones: [], beatenDifficulties: [], totalDistanceTraveled: 0, lifetimeDeathsByZone: new Array(13).fill(0), zoneCompletionCounts: new Array(13).fill(0), achievedRanks: [], shipTrail: 'classic', shipSkin: 'classic' };
}
function savePlayerProfile() {
  try {
    localStorage.setItem(PROFILE_STORAGE_KEY, JSON.stringify({
      best, extraDifficultyUnlocked, unlockedZones: Array.from(unlockedZones), completedZones: Array.from(completedZones), deathlessZones: Array.from(deathlessZones), beatenDifficulties: Array.from(beatenDifficulties), totalDistanceTraveled, lifetimeDeathsByZone, zoneCompletionCounts, achievedRanks: Array.from(achievedRanks), shipTrail: shipTrailStyle, shipSkin: shipSkinStyle
    }));
  } catch (e) { /* storage unavailable/full -- fail silently, never crash the game over this */ }
}
function resetPlayerProfile() {
  best = 0;
  extraDifficultyUnlocked = false;
  unlockedZones = new Set([0]);
  completedZones = new Set();
  deathlessZones = new Set();
  beatenDifficulties = new Set();
  totalDistanceTraveled = 0;
  lifetimeDeathsByZone = new Array(13).fill(0);
  zoneCompletionCounts = new Array(13).fill(0);
  achievedRanks = new Set();
  shipTrailStyle = 'classic';
  shipSkinStyle = 'classic';
  savePlayerProfile();
  zoneScreenshots = {};
  try {
    localStorage.removeItem('synthFlightBest');
    localStorage.removeItem('synthFlightExtraDifficultyUnlocked');
    localStorage.removeItem(ZONE_SHOTS_KEY);
  } catch (e) { /* fine if this fails -- savePlayerProfile() above already wrote the new, authoritative key */ }
}
const __loadedProfile = loadPlayerProfile();
// the 4th difficulty tier, unlocked by beating the game once on Normal or
// Hard. persisted so it stays unlocked across sessions.
let extraDifficultyUnlocked = __loadedProfile.extraDifficultyUnlocked;
// zone indices the player has reached in any difficulty, unlocking them
// for Zone Select. zone 0 is always unlocked, since every run starts there.
let unlockedZones = new Set(__loadedProfile.unlockedZones);
zoneScreenshots = loadZoneScreenshots();
// zone indices the player has actually flown all the way through and
// advanced past (or, for the final zone, defeated the boss) -- distinct
// from unlockedZones, which only requires having reached a zone's start.
// Drives the per-zone "Completed Zone <name>" achievements.
let completedZones = new Set(__loadedProfile.completedZones);
// zone indices completed without dying even once, on a non-Easy
// difficulty, during real sequential progression (not Zone Select
// practice). Drives the "DEATHLESS: ZONE <name>" achievements.
let deathlessZones = new Set(__loadedProfile.deathlessZones);
// difficulty strings ('easy'/'normal'/'hard'/'extra') the game has been
// beaten on at least once. Drives the "BEAT GAME: <difficulty>" achievements.
let beatenDifficulties = new Set(__loadedProfile.beatenDifficulties);
// end-of-run rank letters ('S'/'A'/'B'/'C') ever earned, across any
// victory -- cumulative, since earning a better rank on one run also
// implies every worse tier's requirement was met too. Drives the
// "RANK: <letter>" achievements.
let achievedRanks = new Set(__loadedProfile.achievedRanks);
let shipTrailStyle = SHIP_TRAILS.some((t) => t.id === __loadedProfile.shipTrail) ? __loadedProfile.shipTrail : 'classic';
let shipSkinStyle = SHIP_SKINS.some((s) => s.id === __loadedProfile.shipSkin) ? __loadedProfile.shipSkin : 'classic';
let shipTrailParticles = [];
let shipToxicDrips = [];
let shipToxicDripCooldown = 0;
// cumulative distance flown across every real (non-practice) run, ever --
// unlike best/maxDistanceReached, this never resets. Powers the
// Statistics screen and the upcoming lifetime-distance achievements.
let totalDistanceTraveled = __loadedProfile.totalDistanceTraveled;
// lifetime death count per zone (array index-aligned with THEMES), never
// resets. Distinct from the existing deathsByZone/totalDeaths, which are
// per-run counters that reset every resetGame() for the victory scoreboard.
let lifetimeDeathsByZone = __loadedProfile.lifetimeDeathsByZone;
// how many times each zone (array index-aligned with THEMES) has actually
// been cleared -- distinct from the boolean completedZones set, which only
// tracks whether it's ever happened at all, not how many times
let zoneCompletionCounts = __loadedProfile.zoneCompletionCounts;
// true once the player has died at least once since entering the current
// zone -- reset whenever a new zone is entered (see finishWarp/resetGame),
// checked when deciding whether this zone visit still qualifies as deathless
let diedInCurrentZone = false;
// true for the one victory screen where the 4th difficulty was just earned, so
// that specific playthrough gets a "you unlocked it" callout; cleared on reset
let justUnlockedExtraDifficulty = false;
let frame = 0;
let distance = 0;
let best = __loadedProfile.best;
let holding = false;
let lives = 3;
let totalDeaths = 0;
let deathsByZone = {}; // keyed by theme name
// real wall-clock time (not frame count) the current run began, and the
// frozen elapsed time at the moment of victory -- frame count isn't a
// reliable proxy for real elapsed time across different display refresh
// rates, so this is measured against the system clock instead
let runStartTimeMs = 0;
let clearTimeMs = 0;
// per-difficulty run parameters. invincibilityFrames: brief post-collision
// immunity (Easy and Overdrive) -- ignores hazard hits the same way ghost
// mode does, but never protects against the top/bottom boundary walls.
const DIFFICULTY_CONFIG = {
  easy: { lives: 9, continues: 3, invincibilityFrames: true },
  normal: { lives: 9, continues: 3, invincibilityFrames: false },
  hard: { lives: 9, continues: 0, invincibilityFrames: false },
  extra: { lives: 1, continues: 0, invincibilityFrames: true },
};
const INVINCIBILITY_DURATION_MS = 1500; // 1.5 real seconds -- how long a granted protection window actually lasts, measured against the system clock so it's accurate regardless of frame rate
const FREE_HIT_COOLDOWN_MS = 4000; // 4 real seconds -- how often a hazard touch can be forgiven outright (Easy / Overdrive). After a free pass is used, there's a stretch where protection has worn off but a new free pass isn't available yet -- a hit landing in that stretch costs a life.
function nowMs() { return typeof performance !== 'undefined' ? performance.now() : Date.now(); }
let MAX_LIVES = 3; // recalculated from DIFFICULTY_CONFIG each time resetGame() runs
let continuesRemaining = 0;
let invincibilityEndTime = -1; // real timestamp (ms); -1 means no active window
let freeHitCooldownEndTime = -1; // real timestamp (ms) at which a hazard touch can next be forgiven outright, rather than costing a life
let pendingRespawnMercyEligible = false; // true only when the death that caused the current respawn was a hazard death -- wall deaths are never eligible for the post-respawn mercy window
let maxDistanceReached = 0;
let zoneStartDistance = 0;
let zoneStartFrame = 0; // frame at which the current zone began -- used so frame-based oscillations (swinging gates, pulsing gaps, wind) always start at the same phase regardless of how long it took to reach this zone

let ship = { x: 0, y: 0, vy: 0, rotation: 0 };
// rolling history of the ship's own y-position, one entry per frame --
// used by echo trail zones to show/collide with the ship's own recent
// path. capped to the largest delay any echo event uses, trimmed each
// frame so it doesn't grow unbounded
let shipYHistory = [];
const SHIP_Y_HISTORY_MAX = 200;
// boss fight state (Zone 11 only) -- entirely separate from the
// distance-based progression every other zone uses. boss is null until
// spawned on zone entry; bossTimer counts DOWN from bossDuration;
// bossPhase (1/2/3) drives which attack set is active, transitioning at
// fixed fractions of the countdown; bossDefeated gates the death
// animation before victory actually triggers
let boss = null;
let bossTimer = 0;
let bossPhase = 1;
let bossDefeated = false;
let bossDefeatFrame = 0;
let bossAttackTimer = 0;
let bossVolleyTimer = 0;
let bossSpawnFrame = 0;

// mini boss fight state (MOLTEN CORE only) -- deliberately much
// simpler than the main boss above, and fully independent from it.
// miniBoss is null until spawned on zone entry; miniBossCyclesCompleted
// counts full (set 1 + set 2) cycles; miniBossDefeated gates a brief
// pause before warping to the next zone
let miniBoss = null;
let miniBossCyclesCompleted = 0; // counts full (set 1 + set 2) cycles -- robust alternative to a frame-count timer, which can't reliably align with cycle boundaries that shift with screen width
let miniBossSpawnFrame = 0;
let miniBossDefeated = false;
let miniBossDefeatFrame = 0;
const MINI_BOSS_ENTRANCE_DURATION = 60; // ~1s -- much quicker than the main boss's entrance
const MINI_BOSS_FLOAT_AMPLITUDE = 100;
const MINI_BOSS_FLOAT_PERIOD = 100; // fast, energetic bob -- speed is this boss's whole identity
const MINI_BOSS_DEFEAT_PAUSE = 90; // ~1.5s pause after the timer hits zero, before warping out

// the escape run's terrain is set up immediately once the defeat pause
// ends, but stays hidden behind the arena wall's own dark backdrop (drawn
// after the terrain, so it fully occludes whatever's behind it). The wall
// then recedes off the right edge of the screen over this duration,
// progressively revealing the already-scrolling terrain underneath as a
// genuine wipe -- no separate fade needed, no instant pop-in, and the
// wall (which the player has been staring at all fight) is what visibly
// opens up rather than the scene just cutting to something new
const MINI_BOSS_WALL_RECEDE_DURATION = 75; // ~1.25s
let miniBossWallRecedeStartFrame = -1; // -1 = not receding

// death sequence: plays once, right after the barrage/squeeze phase (the
// last phase) concludes. Three stages -- dying down, ashing over, and
// dispersing -- ~4.7s total, then the existing defeat-pause mechanism
// carries it into the warp as before
const MINI_BOSS_DEATH_DIM_DURATION = 40; // stage 1: flame dims, boss stops moving
const MINI_BOSS_DEATH_ASH_DURATION = 150; // stage 2: dark ash patches spread unevenly across the surface, flakes drift off
const MINI_BOSS_DEATH_DISPERSE_DURATION = 90; // stage 3: the ashed form shrinks away as it scatters into a dispersing cloud
const MINI_BOSS_DEATH_PATCH_COUNT = 7; // number of ash patches that spread across the surface during stage 2

// escape run: once the boss is fully gone, the zone becomes a real terrain
// run for a short stretch before the normal zone-end goal -- same visual
// feel as INFERNO (the zone right before this one), just condensed and
// with the fork/branch sections stripped out
const MINI_BOSS_ESCAPE_RUN_DISTANCE = 600;
const MINI_BOSS_ESCAPE_RUN_PATTERN = [
  { centerFrac: 0.56 }, { centerFrac: 0.24 }, { centerFrac: 0.4 }, { centerFrac: 0.46 }, { centerFrac: 0.59 }, { centerFrac: 0.74 }, { centerFrac: 0.74 }, { centerFrac: 0.64 }, { centerFrac: 0.75, gapMult: 0.55 }, { centerFrac: 0.61 }, { centerFrac: 0.82 }, { centerFrac: 0.73 }, { centerFrac: 0.75 }, { centerFrac: 0.78 }, { centerFrac: 0.62 }, { centerFrac: 0.72 }, { centerFrac: 0.63 }, { centerFrac: 0.48 }, { centerFrac: 0.63 }, { centerFrac: 0.28 }, { centerFrac: 0.68 }, { centerFrac: 0.26 }, { centerFrac: 0.7 }, { centerFrac: 0.3 }, { centerFrac: 0.66, gapMult: 0.7 }, { centerFrac: 0.27 }, { centerFrac: 0.65 }, { centerFrac: 0.79 }, { centerFrac: 0.71 }, { centerFrac: 0.85, gapMult: 1.5 }, { centerFrac: 0.73 }, { centerFrac: 0.68 }, { centerFrac: 0.6, gapMult: 0.55 }, { centerFrac: 0.37 }, { centerFrac: 0.51 }, { centerFrac: 0.62 }, { centerFrac: 0.8 }, { centerFrac: 0.73 }, { centerFrac: 0.81, gapMult: 0.5 }, { centerFrac: 0.74, gapMult: 0.5 }, { centerFrac: 0.78 }, { centerFrac: 0.78 }, { centerFrac: 0.61 }, { centerFrac: 0.47 }, { centerFrac: 0.34 }, { centerFrac: 0.19 }, { centerFrac: 0.22 }, { centerFrac: 0.28 }, { centerFrac: 0.2, gapMult: 0.55 }, { centerFrac: 0.3 }, { centerFrac: 0.54 }, { centerFrac: 0.4 }, { centerFrac: 0.32 }, { centerFrac: 0.18 }, { centerFrac: 0.31 }, { centerFrac: 0.41 }, { centerFrac: 0.26 }, { centerFrac: 0.22 }, { centerFrac: 0.24 }, { centerFrac: 0.38 }, { centerFrac: 0.25 }
];

// mini boss attack 1: exits off-screen right, waits off-screen, then
// charges across the full screen 3 times in a row at randomized
// heights (20%/50%/80%, each used exactly once), before returning to
// float normally for a beat and repeating. verified safe: even in the
// worst case (ship already sitting at the danger height when a charge
// begins), there's a ~29-frame reaction buffer before contact becomes
// possible -- see safety check in conversation history for this turn
let miniBossAttackState = 'floating'; // floating, exiting, waitingOffscreen, charging
let miniBossAttackStateStartFrame = 0;
let miniBossChargeHeights = [0.2, 0.5, 0.8];
let miniBossChargeIndex = 0;
let miniBossChargeRound = 1; // 1 = first set of 3 charges (before flame wall), 2 = second set (after flame wall, faster)
let miniBossFlameWallDriftDir = 1; // +1 = drifting down, -1 = drifting up; picked randomly for phase 4's moving flame wall
let miniBossBarrageEmbers = []; // active embers in flight during phase 5, each {x, y, vx}
let miniBossBarrageWavesLaunched = 0; // how many of the attack's waves have launched so far
let miniBossSqueezeTopY = 0; // current y of the top wall's inner edge, updated each frame during barrageActive
let miniBossSqueezeBottomY = 0; // current y of the bottom wall's inner edge
let miniBossBarragePhaseStartFrame = 0; // frame when barrageTelegraph began -- used as a fixed time base for the sway, so it's deterministic relative to the attack itself rather than the global frame count (which varies by screen width based on how long earlier phases took)
let miniBossDeathPatches = []; // seeded once when dying begins: {angle, distFrac, sizeFrac, startFrac} -- fixed dark patches that grow across the surface during the ashing-over stage
let miniBossDeathAshParticles = []; // {x, y, vx, vy, flutterPhase, flutterSpeed, size, rotation, rotSpeed, life, maxLife} -- flakes that drift off during ashing-over and dispersal
let miniBossEscapeRunActive = false; // true once the boss is fully gone and the zone becomes a real terrain run
let miniBossEscapeRunStartDistance = 0; // distance value when the escape run began, used to measure progress toward MINI_BOSS_ESCAPE_RUN_DISTANCE
let miniBossHadFirstFloat = false;
let moltenCoreIdleNodes = null;
let moltenFlameWallNodes = null;
let moltenSqueezeNodes = null;
let moltenDeathAshNodes = null;
const MINI_BOSS_PRE_ATTACK_FLOAT = 90; // ~1.5s of normal floating before each subsequent attack sequence
const MINI_BOSS_INITIAL_FLOAT = 290; // ~4.8s -- longer pause the first time it enters, before its first attack. chosen so it lands exactly centered (not mid-bob) when it flies off
const MINI_BOSS_CHARGE_SPEED = 8; // slowed further -- previous 11.9 still too fast to visually track and dodge
const MINI_BOSS_CHARGE_SPEED_ROUND2 = 9.5; // slightly faster for the second round of charges (after the flame wall)
const MINI_BOSS_OFFSCREEN_WAIT = 120; // 2s -- both before the first charge AND between each subsequent charge
const MINI_BOSS_OFFSCREEN_MARGIN = 250; // comfortably clears the corona glow (~120px beyond the core), so nothing is visible at the edge
const MINI_BOSS_CHARGE_HEIGHT_FRACS = [0.2, 0.5, 0.8];

// mini boss attack 2: charges to a fixed stop distance past the ship's
// (fixed) x position, then fires a flame wall covering everything from
// its position to the right edge of the screen, leaving one boss-diameter
// of safe space directly to its left (and, by extension, everything
// further left too). since the ship can never move horizontally in this
// game, safety here comes entirely from the calibrated stop distance
// (verified with a 60px margin beyond the minimum needed), not from the
// player dodging sideways -- the tension is the boss visibly rushing in
// close, not an actual last-second escape
let miniBossNextAttackSet = 1; // alternates 1/2 each cycle
let miniBossFloatBlendStartX = 0; // captures the boss's actual position when entering 'floating',
let miniBossFloatBlendStartY = 0; // so it can ease in smoothly instead of snapping (only needed
let miniBossFloatBlendStartFrame = -1000; // after flameWallActive, where the boss doesn't otherwise end up at its resting spot)
const MINI_BOSS_CLOSE_CHARGE_STOP_OFFSET = 281; // fixed distance PAST the ship's actual x -- not an absolute screen position, since ship.x itself scales with window width. widened from 221 for extra safety margin
const MINI_BOSS_FLAME_WALL_WINDOW_H = 290; // vertical size of the safe window during the flame wall -- 190 base + 50px expanded top/bottom for a real, skill-based hazard tied to the ship's height
const MINI_BOSS_FLAME_WALL_TELEGRAPH = 60; // ~1s -- visual wind-up before the wall becomes lethal
const MINI_BOSS_FLAME_WALL_ACTIVE = 240; // 4s -- how long the wall stays lethal
const MINI_BOSS_FLAME_WALL_DRIFT_SPEED = 0.8; // px/frame -- phase 4's moving variant. Over the 240-frame attack this travels 192px, comfortably exceeding the window's own half-height (145px) so a stationary ship WILL eventually be caught -- real tracking required, not just cosmetic movement
const MINI_BOSS_FLAME_WALL_DRIFT_RANGE = 200; // exceeds the window's own half-height (145px) so a stationary ship WILL eventually fall outside it -- the window's existing screen-edge clamp keeps it fully on-screen even as the boss drifts this far

// phase 5: ember barrage -- boss stays at its resting position (far from
// the ship; unlike the flame wall phases, it never approaches) and
// launches waves of slow embers toward the ship. Each wave fills 2 of 3
// fixed vertical lanes, always leaving exactly one lane clear -- keeps the
// dodge simple and readable (a single wave in flight at a time, one gap)
const MINI_BOSS_BARRAGE_TELEGRAPH = 60; // ~1s warning before the first wave
const MINI_BOSS_BARRAGE_WAVE_COUNT = 12;
const MINI_BOSS_BARRAGE_WAVE_INTERVAL = 145; // frames between wave launches. Must exceed the time for an ember to travel from the boss to safely past the ship: (366 + 100 margin) / 3.8 speed = ~123 frames -- 145 keeps a ~22 frame safety margin so waves still don't overlap at the ship's danger zone
const MINI_BOSS_BARRAGE_ACTIVE = MINI_BOSS_BARRAGE_WAVE_INTERVAL * MINI_BOSS_BARRAGE_WAVE_COUNT; // 1740 frames, 29s total
const MINI_BOSS_BARRAGE_EMBER_SPEED = 3.42; // px/frame -- 10% slower than 3.8, for more reaction time
const MINI_BOSS_BARRAGE_EMBER_R = 14; // collision radius per ember
const MINI_BOSS_BARRAGE_SWAY_RANGE = 40; // px the boss drifts up/down from baseY during the barrage -- a secondary layer of tracking on top of the embers themselves
const MINI_BOSS_BARRAGE_SWAY_PERIOD = 360; // frames per full sway cycle (6s) -- slow and readable
const MINI_BOSS_BARRAGE_LANE_SPACING = 90; // px between adjacent lanes, centered on the boss's current y at each wave's launch -- verified to keep the outermost lane safely clear of the boundary even at the sway's extremes

// secondary attack during the barrage: independent top/bottom walls that
// slowly close in and reopen, unrelated to the ember lanes or the boss's
// sway -- the two threats aren't coordinated, so surviving means finding a
// height that's clear of both at once
const MINI_BOSS_SQUEEZE_MIN_GAP = 430; // gap at tightest closure -- widened from 400 for more room to dodge embers
const MINI_BOSS_SQUEEZE_MAX_GAP = 490; // gap when fully open -- widened from 480, keeps a 21px margin from the boundary-death threshold even at maximum openness
const MINI_BOSS_SQUEEZE_PERIOD = 400; // frames per full open-close-open cycle (6.7s) -- deliberately not a multiple of the wave interval (145) or sway period (360), so the walls drift in and out of phase with the barrage rather than repeating a fixed combined pattern
const MINI_BOSS_SQUEEZE_WALL_THICKNESS = 16; // visual thickness of each wall bar

// ==================== REACTOR CORE (second mini boss) ====================
// a stationary defense installation -- unlike the fire boss, it never
// charges or leaves its resting position; every attack comes to the ship
// instead. Entirely separate state machine and variable namespace from the
// fire boss above, so nothing here can affect MOLTEN CORE.
let coreBossPhase = 1; // 1-5, which attack comes next from coreFloating
let coreBossHadFirstFloat = false;
const CORE_BOSS_INITIAL_FLOAT = 200; // ~3.3s before the first attack
const CORE_BOSS_PRE_ATTACK_FLOAT = 80; // ~1.3s between attacks

// phase 1: targeting laser sweep -- telegraphed full-width beams at a
// specific height, fired in sequence at varied heights
const CORE_LASER_COUNT = 3;
const CORE_LASER_TELEGRAPH = 60; // ~1s warning before each beam fires
const CORE_LASER_ACTIVE = 20; // ~0.33s lethal window
const CORE_LASER_GAP = 45; // ~0.75s between beams
const CORE_LASER_THICKNESS = 26; // vertical hit-band thickness
const CORE_LASER_HEIGHT_FRACS = [0.1, 0.35, 0.65]; // clear of the bay (0.5) and core (0.82) emplacements
let coreLaserIndex = 0;
let coreLaserHeights = [];
let coreLaserY = 0;

// phase 2 & 4: bulkhead lockdown -- a heavy door seals from top+bottom
// leaving one gap the ship must hold. phase 4 is the same mechanic with a
// drifting gap instead of a fixed one
const CORE_BULKHEAD_TELEGRAPH = 60; // ~1s as the door closes in
const CORE_BULKHEAD_ACTIVE = 240; // 4s holding position
const CORE_BULKHEAD_GAP_HEIGHT = 290; // matches the fire boss's flame wall window (same "hold position" challenge type) -- the old 150px was picked arbitrarily and was nearly half that proven size
const CORE_BULKHEAD_DRIFT_AMPLITUDE = 110; // phase 4 only
const CORE_BULKHEAD_DRIFT_PERIOD = 220; // frames per full drift cycle
let coreBulkheadX = 0;
let coreBulkheadGapCenter = 0;
let coreBulkheadIsMoving = false;
let coreBulkheadHoldNodes = null;

// phase 3: weaving spark balls -- glowing orbs that travel in a smooth,
// continuous sine-wave path (y as a deterministic function of x) rather
// than discrete boundary bounces, giving a genuinely dynamic weave that's
// still readable in advance since the path is a simple continuous curve
const CORE_SPARK_COUNT = 8;
const CORE_SPARK_SPEED_X = 3.0;
const CORE_SPARK_AMPLITUDE = 50;
const CORE_SPARK_FREQUENCY = 0.0073; // NOTE: peak vertical speed = amplitude*frequency*speedX ~= 1.1px/frame, deliberately well under the ship's 2.5 max. The original (95, 0.021) gave ~2.7px/frame -- comparable to the ship's own speed, making it mathematically impossible to reliably outrun at points in the cycle. Verified fair across all widths; re-derive this product before changing any of the three values.
const CORE_SPARK_R = 14;
const CORE_SPARK_SPAWN_INTERVAL = 65;
const CORE_SPARK_BASE_FRACS = [0.3, 0.6, 0.4, 0.55, 0.25, 0.7, 0.45, 0.65]; // varied center heights
let coreSparkSpawned = 0;
let coreSparks = []; // {x, y, spawnX, baseY, phase}
let coreSparkPhaseStartFrame = 0; // when the current spark-spawning phase began (phase 3 or phase 6), independent of which specific sub-state is active
const CORE_P6_SPARK_COUNT = 26; // sized so spawning spans crossfire's full ~1673-frame duration (6 rounds) at the same 65-frame spawn interval used in phase 3

// phase 3 beam volleys -- 2 simultaneous beams fire 3 times during the
// spark phase, reusing the crossfire slot layout (2 of 3 slots fire,
// leaving 1 safe) since that spacing is already proven fair
const CORE_P3_BEAM_TELEGRAPH = 90;
const CORE_P3_BEAM_ACTIVE = 25;
const CORE_P3_BEAM_THICKNESS = 28;
const CORE_P3_BEAM_TRIGGER_TIMES = [150, 380, 600]; // frame offsets from spark phase start
const CORE_P3_BEAM_SLOT_FRACS = [0.17, 0.5, 0.83];
let coreP3BeamVolleysFired = 0;
let coreP3BeamState = 'none'; // 'none' | 'telegraph' | 'active'
let coreP3BeamStateStartFrame = 0;
let coreP3BeamYs = [];

// phase 5: system overload finale -- EMP pulse waves (same proven lane/gap
// math as the fire boss's ember barrage, reskinned) plus slowly closing
// bulkhead walls (same proven math as the fire boss's squeeze walls)
const CORE_EMP_TELEGRAPH = 60;
const CORE_EMP_WAVE_COUNT = 6;
const CORE_EMP_WAVE_INTERVAL = 173; // recalibrated for CORE_EMP_SPEED=4.5 over the wall boss's 588px travel distance: (588+100)/4.5 = ~153 frames minimum, +20 frame margin
const CORE_EMP_ACTIVE = CORE_EMP_WAVE_INTERVAL * CORE_EMP_WAVE_COUNT;
const CORE_EMP_SPEED = 4.5; // increased from 3.42
const CORE_EMP_R = 14;
const CORE_EMP_LANE_SPACING = 90;
const CORE_SQUEEZE_MIN_GAP = 430;
const CORE_SQUEEZE_MAX_GAP = 490;
const CORE_SQUEEZE_PERIOD = 400;
let coreEmpPulses = []; // {x, y, vx}
let coreEmpWavesLaunched = 0;
let coreEmpPhaseStartFrame = 0;
let coreSqueezeTopY = 0;
let coreSqueezeBottomY = 0;

// phase 6: crossfire -- four of five fixed height zones fire simultaneous
// beams, leaving exactly one zone safe. Reuses the laser sweep's proven
// telegraph/active timing and zone-based approach, cycling through 6
// rounds with a new random safe zone each time
const CORE_CROSSFIRE_TELEGRAPH = 233; // covers worst-case travel between opposite-extreme zones (426px, wider range than the old 3-zone layout) at a realistic sustained speed
const CORE_CROSSFIRE_ACTIVE = 25;
const CORE_CROSSFIRE_GAP = 25; // reduced from 45 for faster pacing between shots
const CORE_CROSSFIRE_ROUNDS = 6;
const CORE_CROSSFIRE_THICKNESS = 28;
const CORE_CROSSFIRE_SLOT_FRACS = [0.1, 0.3, 0.5, 0.7, 0.9]; // 5 zone centers -- 4 get beams, 1 stays safe
const CORE_CROSSFIRE_SLOT_JITTER = 0.03; // reduced from 0.09 -- the tighter zone spacing (5 zones vs 3) leaves much less margin to spare
let coreCrossfireRound = 0;
let coreCrossfireBeamYs = []; // the 2 active beam y-positions for the current round
let lastCoreCrossfireVolleyFrame = -999;

// phase 8: the wall opens like a gate, revealing the original sphere-form
// boss (preserved but unused since the wall redesign), which drifts into
// position and performs one final orbiting-barrage attack before dying --
// reuses the existing sphere-shaped 'coreDying' death sequence directly
const CORE_GATE_OPEN_DURATION = 90;
const CORE_SPHERE_EMERGE_DURATION = 60;
const CORE_SPHERE_X_OFFSET = 400; // closer to the ship than the wall was, for a sense of the true boss advancing
const CORE_ORBIT_COUNT = 50;
const CORE_ORBIT_SPAWN_INTERVAL = 55; // kept at the original spacing -- shortening this to create a denser fan was tested and caused excessive concurrent density (34 projectiles), which is what actually broke fairness, not the starting-angle approach
const CORE_ORBIT_EMIT_ROTATION_SPEED = 0.019; // radians/frame -- the emission point itself sweeps around like a rotating turret, so projectiles fan out over time instead of all starting from a fixed set of angles that can align into a line
const CORE_ORBIT_TANGENTIAL_SPEED = 0.8; // px/frame -- kept constant regardless of distance (see fix note at the physics site: constant angular velocity would make tangential speed grow unboundedly with distance)
const CORE_ORBIT_OUTWARD_SPEED = 1.1; // px/frame, radial expansion -- kept modest, see fairness note at the physics site
const CORE_ORBIT_R = 12;
const CORE_ORBIT_START_DIST = 30;
const CORE_ORBIT_MAX_DIST = 750;
const CORE_ORBIT_BARRAGE_DURATION = 500;
let coreOrbitSpawned = 0;
let coreOrbitProjectiles = []; // {angle, dist, x, y}
let coreOrbitEmitAngle = 0; // current rotation angle of the emission point
let coreGateOpenAmount = 0; // 0 = closed, 1 = fully open

// eye beam -- runs simultaneously with the orbit barrage during phase 8.
// the eye tracks the ship's live position (visible reticle), then locks
// onto wherever the ship is at that moment and holds before firing, so
// the player sees the lock happen and has a clear window to move away
// rather than being punished for wherever they happened to be standing
const CORE_EYEBEAM_TRACK_DURATION = 60;
const CORE_EYEBEAM_LOCK_DURATION = 80;
const CORE_EYEBEAM_ACTIVE_DURATION = 20;
const CORE_EYEBEAM_COOLDOWN = 120;
const CORE_EYEBEAM_THICKNESS = 26;
let coreEyeBeamState = 'track'; // 'track' | 'lock' | 'active' | 'cooldown'
let coreEyeBeamStateStartFrame = 0;
let coreEyeBeamY = 0; // current tracked (or locked) target height

// tesla discharge burst -- a third parallel sub-cycle during phase 8. the
// sphere charges up, then fires a fan of small, fast spark projectiles
// simultaneously toward a spread of heights, with one slot always left
// empty as a guaranteed safe gap -- quick and chaotic, a genuine
// projectile attack distinct from the orbit barrage's spiral and the eye
// beam's single aimed shot
const CORE_TESLA_CHARGE_DURATION = 75; // telegraph
const CORE_TESLA_COOLDOWN = 110; // rest before the next burst
const CORE_TESLA_PROJECTILE_SPEED = 4.2; // px/frame -- fast, but the ship only needs to find the gap, not outrun it
const CORE_TESLA_PROJECTILE_R = 9;
const CORE_TESLA_SLOT_FRACS = [0.1, 0.25, 0.4, 0.55, 0.7, 0.85, 0.95]; // 7 target heights across the play area, one left empty each burst
let coreTeslaState = 'charging'; // 'charging' | 'cooldown' (bursts fire instantly at the charge->cooldown transition)
let coreTeslaStateStartFrame = 0;
let coreTeslaProjectiles = []; // {x, y, vx, vy}
let coreTeslaEmptySlot = 0; // first of two adjacent empty slots -- determined at charge start so it can be telegraphed, not revealed only when firing

function pickCoreTeslaEmptySlot() {
  // bias the safe gap toward wherever the ship currently is, so it's always
  // reachable within the charge window regardless of starting position --
  // pick randomly among slots near the ship's current height. leaves TWO
  // adjacent slots empty (this and the next one) for a wider margin, since
  // the ship can still get pulled away from the gap by the eye beam or
  // orbit barrage during the charge window and need room to recover
  const usableCount = CORE_TESLA_SLOT_FRACS.length - 1; // must leave room for the second empty slot after it
  const slotDists = CORE_TESLA_SLOT_FRACS.slice(0, usableCount).map((frac, i) => {
    const y = PLAY_TOP + frac * (PLAY_BOTTOM - PLAY_TOP);
    return { i, dist: Math.abs(y - ship.y) };
  });
  slotDists.sort((a, b) => a.dist - b.dist);
  const candidateSlots = slotDists.slice(0, 3);
  return candidateSlots[Math.floor(Math.random() * candidateSlots.length)].i;
}

// death sequence: power-down instead of ashing-over -- panels go dark in
// patches, then a final reactor implosion, fading cold rather than to ash
const CORE_DEATH_DIM_DURATION = 40;
const CORE_DEATH_DARKEN_DURATION = 150;
const CORE_DEATH_COLLAPSE_DURATION = 90;
const CORE_DEATH_PATCH_COUNT = 7;
let coreDeathPatches = [];
let coreDeathDebris = []; // {x, y, vx, vy, rotation, rotSpeed, size, life, maxLife}
let coreBossDefeated = false;
let coreBossDefeatFrame = 0;
const CORE_BOSS_DEFEAT_PAUSE = 90;

// circuit overload death -- the final sphere form's own death sequence,
// distinct from the wall's power-down: instead of dimming and going dark,
// the sphere builds up energy until it catastrophically overloads and
// breaks apart, arcing with electricity as it comes undone
const CORE_OVERLOAD_BUILDUP_DURATION = 100;
const CORE_OVERLOAD_FLASH_DURATION = 15;
const CORE_OVERLOAD_BREAKDOWN_DURATION = 110;
let coreOverloadArcs = []; // {angle1, angle2, life, maxLife} -- brief electrical arcs across the surface during buildup

const BOSS_ENTRANCE_DURATION = 150; // ~2.5s -- three-stage dramatic entrance before the fight begins
const BOSS_ENTRANCE_CHARGE_END = 0.4;   // stage 1: charge-up glitch/static buildup, no orb visible
const BOSS_ENTRANCE_ASSEMBLE_END = 0.85; // stage 2: fragments converge toward the center
                                          // stage 3 (remaining 0.15): snap to full size + flash + shockwave + screen shake
const BOSS_FLOAT_AMPLITUDE = 22;
const BOSS_FLOAT_AMPLITUDE_PHASE3 = 160; // increased from 120 for more ring placement variety -- verified safe, 51px margin at the extreme
const BOSS_FLOAT_PERIOD = 210; // slow, gentle bob -- ~3.5s per full cycle
let bossTransitioning = false;
let bossTransitionStartFrame = 0;
let bossTransitionTargetPhase = 3;
let bossWaitingForClear = false; // true once a phase transition's time threshold is reached but hazards are still on screen -- spawning pauses and elapsed freezes until the battlefield clears
let bossWaitingForClearTargetPhase = 3;
let bossWaitingForClearStartFrame = -1;
const BOSS_HAZARD_TYPES = ['bossattack', 'bossragepulse', 'bossdrone', 'bossvolleytelegraph', 'bossdiagonalring'];
const BOSS_PHASE5_TRANSITION_DURATION = 300; // ~5s -- extended for a bigger, more dramatic multi-stage spectacle
const BOSS_PHASE_DURATION = 1500; // ~25s per phase, fixed duration -- easy to add more phases later
const BOSS_NUM_PHASES = 5; // TEMPORARY -- currently 5, expand alongside bossDuration when adding more
let bossTransitionEndFrame = -9999;
const BOSS_TRANSITION_COMPLETE_FX_DURATION = 25; // brief flash/shockwave when the new form locks in
let bossRagePulseTimer = 0;
const BOSS_RAGE_PULSE_INTERVAL = 170; // ~2.8s between pulses
const BOSS_RAGE_PULSE_SPEED = 5; // px/frame horizontal expansion rate
// redesigned from a full expanding ring (which had an unbounded rate of
// change right as its radius crossed the ship's horizontal distance --
// the safe gap could swing from one side to the other faster than any
// finite acceleration could track) to a horizontal-only expanding wall
// at a fixed vertical band. safety is now trivial and constant no
// matter how far the wall has traveled: the band's height never
// changes, so the safe space above/below it never shrinks or moves
const BOSS_RAGE_PULSE_THICKNESS = 80; // fixed vertical band height, leaves ~226px safe space each side
const BOSS_RAGE_PULSE_MAX_R = 950; // despawn once expanded well past the play area
// phase 4: two rings expanding horizontally like the phase-3 wall, but
// each band's vertical center shifts linearly as it expands, at
// opposite slopes -- creating a diagonal "X" look (like the reference
// image) without any tan()-style blowup, since the relationship is
// purely linear. verified safe before implementation: 326px minimum
// safe gap across the full float range, far above the 33px minimum
let bossDiagonalRingTimer = 0;
const BOSS_DIAGONAL_RING_INTERVAL = 200;
const BOSS_DIAGONAL_RING_SPEED = 5;
const BOSS_DIAGONAL_RING_SLOPE = 0.5; // ~27deg
const BOSS_DIAGONAL_RING_THICKNESS = 60;
const BOSS_DIAGONAL_RING_MAX_R = 950;
// phase 4: staggered double wall. reuses the bossragepulse type
// entirely (no new collision/render code) -- just spawns two walls at
// offset heights from a shared reference y, with the second staggered
// in time. offset chosen small enough that once both walls are active
// their bands merge into one continuous danger zone (no safe middle
// gap that would trivially defeat the "commit to a side" challenge),
// verified safe: even at the float range's extreme, whichever side
// shrinks the other always has 300px+ of margin -- always exactly one
// clearly-correct side, never both squeezed simultaneously
let bossDoubleWallTimer = 0;
const BOSS_DOUBLE_WALL_INTERVAL = 220;
const BOSS_DOUBLE_WALL_OFFSET = 40;
const BOSS_DOUBLE_WALL_STAGGER = 45; // ~0.75s between wall A and wall B
// phase 4: summoned drone formation. reuses zone 10's proven
// security-drone formation pattern and rendering wholesale (a new
// 'bossdrone' type, since boss-zone hazards move via explicit vx
// rather than the generic world-scroll multiplier zone 10 uses).
// verified safe before implementation: the formation's one deliberate
// gap is 114px wide after accounting for both drone and ship radii,
// far above the 33px minimum -- clustered drones on either side leave
// no ambiguity about where the real passage is
let bossDroneFormationTimer = 0;
const BOSS_DRONE_FORMATION_INTERVAL = 120; // more frequent, was 260
const BOSS_DRONE_SPEED = 6; // faster, was 3.5
const BOSS_DRONE_R = 13;
// phase 4 exclusive: homing signal fragment. gently steers toward the
// ship's y, but its drift is CLAMPED to within BOSS_HOMING_MAX_DRIFT of
// its own spawn height -- it can never leave that band no matter how
// long it homes. this makes the safety guarantee independent of
// whether the player successfully "outruns" it: verified a 120px
// guaranteed-safe zone always exists outside the band, regardless of
// homing behavior, far above the 33px minimum this session uses.
// (an earlier unbounded-homing version was rejected after simulation
// showed it could asymptotically converge to zero separation against
// a boundary-pinned ship given enough time)
let bossHomingFragmentTimer = 0;
const BOSS_HOMING_FRAGMENT_INTERVAL = 450;
const BOSS_HOMING_FRAGMENT_VX = -3;
const BOSS_HOMING_FRAGMENT_R = 15;
const BOSS_HOMING_MAX_DRIFT = 150; // widened from 100 -- verified still safe (71px guaranteed margin) across the ship's full possible range
const BOSS_HOMING_MAX_VY = 2.4; // reduced from 3.0 for gentler pursuit, still comfortably below the ship's own 5px/frame max
const BOSS_HOMING_TURN_RATE = 0.04; // reduced from 0.06 -- smoother, less sharp direction changes

// phase 5 exclusive: charge beam laser. locks onto the ship's position
// at telegraph start (not continuously tracking, matching the proven
// volley pattern), gives a long generous warning, then fires a
// full-width lethal beam that lingers. verified safe: with the
// locked position at dead-center (worst case), realistic
// acceleration-limited ship physics needs only 18 frames to clear the
// band -- the 120-frame telegraph gives a 102-frame buffer
let bossChargeBeamTimer = 0;
let bossChargeBeamNextGap = 150; // re-rolled randomly after each shot
let bossChargeBeamCount = 0; // tracks which beam shot within phase 5 (1st, 2nd, ...) -- shots 4+ are double thickness

// the climactic ending: after shot 8 completes, the boss resumes
// normal movement for a beat, then charges one final time -- but this
// charge never fires, it just keeps building until it detonates in a
// full-screen explosion cinematic, after which the ship is shown
// flying alone and victory triggers directly (bypassing the normal
// bossTimer countdown, which is frozen throughout this whole sequence)
let bossFinalChargeActive = false;
let bossFinalChargeStartFrame = -1;
let bossExplosionActive = false;
let bossExplosionStartFrame = -1;
let bossFullyDefeated = false; // once true, the boss is permanently gone -- no rendering at all, for the downtime/fly-off/victory screen
const BOSS_FINAL_CHARGE_DELAY = 380; // resumed-movement beat before the final charge begins
const BOSS_FINAL_CHARGE_DURATION = 420; // longer than even the super beam's telegraph -- the ultimate build-up
const BOSS_EXPLOSION_DURATION = 240; // full cinematic: burst, white-out, hold, fade to reveal the ship

// after the explosion, a quiet Mega Man-style beat before the ship
// flies off screen to the right, then the victory screen appears
let postBossDowntimeActive = false;
let postBossDowntimeStartFrame = -1;
let shipFlyOffActive = false;
let shipFlyOffStartFrame = -1;
const POST_BOSS_DOWNTIME_DURATION = 120; // ~2s quiet beat
const SHIP_FLYOFF_ACCEL = 0.15; // gentle ramp-up rather than an instant dash
let bossBeamHoldBlendStartFrame = -9999; // frame the beam sequence ended, used to smoothly blend boss.y back onto its normal float rather than snapping
const BOSS_BEAM_HOLD_BLEND_DURATION = 60;
const BOSS_CHARGE_BEAM_MIN_GAP = 90; // 1.5s
const BOSS_CHARGE_BEAM_MAX_GAP = 300; // 5s

// phase 5 secondary hazard: ember knockback. small particles drift
// from the boss and, on contact, give the ship a brief involuntary
// velocity nudge -- non-lethal, no tryEndGame() call at all. disabled
// entirely once the super beam (shot 8) is active, since that phase
// should be the beam alone
let bossEmberTimer = 0;
const BOSS_EMBER_INTERVAL = 110;
const BOSS_EMBER_SPEED = 2.8;
const BOSS_EMBER_R = 5;
const BOSS_EMBER_KNOCKBACK = 5; // strengthened -- now matches the ship's own max speed for a genuinely noticeable jolt

// phase 5 tertiary hazard: thick ash cloud. a large, slow-drifting
// zone that -- like the black hole's pull -- smoothly reduces lift
// and increases gravity based on proximity to its center while the
// ship is inside. non-lethal, no tryEndGame() call. gated off
// entirely once the super beam (shot 8) is active, same as embers
let bossAshCloudTimer = 0;
const BOSS_ASH_CLOUD_INTERVAL = 260;
const BOSS_ASH_CLOUD_SPEED = 1.6;
const BOSS_ASH_CLOUD_R = 100;
const BOSS_ASH_CLOUD_LIFT_REDUCTION = 0.55;
const BOSS_ASH_CLOUD_GRAVITY_INCREASE = 0.82;
const BOSS_CHARGE_BEAM_TELEGRAPH_DURATION = 120;
const BOSS_SUPER_BEAM_TELEGRAPH_DURATION = 320; // extended further -- a long, unmistakable charge-up for the climactic 7th shot
const BOSS_CHARGE_BEAM_FIRE_DURATION = 90;
const BOSS_SUPER_BEAM_FIRE_DURATION = 150; // 1 second longer than the standard beam's fire duration
const BOSS_CHARGE_BEAM_THICKNESS = 80;
const BOSS_DRONE_FORMATION_YFRACS = [0.1, 0.25, 0.4, 0.75, 0.9];
let bossDoubleWallPendingFrame = -1; // -1 = no second wall pending
const BOSS_TRANSITION_DURATION = 180; // ~3s -- boss visibly "strains" to transform, frozen and silent
let gates = [];
let lastSpawnX = 0;
let fireballSpawnCounter = 0;
let extraFireballCounter = 0;
let extraFireballPatternIndex = 0;
let extraToxicCounter = 0;
let extraToxicPatternIndex = 0;
let extraGeyserCounter = 0;
let extraGeyserPatternIndex = 0;
let extraMovingDoorCounter = 0;
let extraMovingDoorPatternIndex = 0;
let specialEventsSpawned = [false, false, false];
let blackHoleEventsSpawned = [false, false, false, false];
let windVortexEventsSpawned = [false, false, false];
let cloudArcEventsSpawned = [false, false, false];
let lasergridEventsSpawned = [false, false];
let droneSwarmEventsSpawned = [false, false, false, false];
let billboardEventsSpawned = [false, false];
let searchlightEventsSpawned = [false, false];
let turretEventsSpawned = [false, false];
let signalCorruptionEventsSpawned = [false, false];
let empEventsSpawned = [false, false];
let echoTrailEventsSpawned = [false, false];
let pulsingOrbEventsSpawned = [false, false];
let boomerangEventsSpawned = [false, false];
let extraStormCounter = 0;
let extraStormPatternIndex = 0;
let extraOrbiterCounter = 0;
let extraOrbiterPatternIndex = 0;
let extraArcPlanetCounter = 0;
let extraArcPlanetPatternIndex = 0;
let lensingZoneEventsSpawned = [false, false, false];
let supernovaEventsSpawned = [false, false];
let specialDoorUnlocked = [false, false, false];
let extraHubCounter = 0;
let extraHubPatternIndex = 0;
let extraStarCounter = 0;
let extraStarPatternIndex = 0;
let terrainSegments = [];
let terrainSegmentsSinceEntry = 0;
let patternIndex = 0;
let terrainWaypointTarget = null;
let terrainWaypointSegLeft = 0;
let terrainWaypointGapTarget = null;
let terrainWaypointIslandTarget = 0;

let themeIndex = 0;
let themeLevelReached = 0;
let warpActive = false;
let warpTimer = 0;
let portalObject = null;
let ghostMode = false;
let bossGridFadeEnabled = true; // toggle: does the background grid fade out during the boss color transition?
let bossAshGrayVariant = true; // toggle: gray is now the default -- red kept available for comparison
let devGracePeriodEndFrame = -1; // freezes ship physics (no gravity/lift) after a dev-panel zone jump or phase skip, for a fixed window regardless of input -- prevents the ship falling into a boundary while the dev panel is being navigated, and naturally expires rather than freezing forever
const DEV_GRACE_PERIOD_DURATION = 600; // 10s at 60fps -- generous time to navigate the dev panel
const WARP_LANDING_GRACE_PERIOD = 60; // 1s -- brief safety window right as a new zone begins. Gravity/lift physics run continuously during the warp tunnel itself (a purely visual effect a player isn't expected to actively fly through), which can leave the ship sitting close to the boundary by the time the new zone is actually visible; this gives a beat to see and react rather than dying before the player's first real frame in the zone
let fireballSpeedMult = 1.6; // lowered from the initial 2.4 per feedback -- live-tunable via dev panel

function clampGhostShipToPlayfield() {
  const minY = PLAY_TOP + SHIP_H / 2 + 0.5;
  const maxY = PLAY_BOTTOM - SHIP_H / 2 - 0.5;
  if (ship.y < minY) { ship.y = minY; if (ship.vy < 0) ship.vy = 0; }
  if (ship.y > maxY) { ship.y = maxY; if (ship.vy > 0) ship.vy = 0; }
}

function tryEndGame(hazardType) {
  if (ghostMode) return;
  if (bossFinalChargeActive || bossExplosionActive || bossFullyDefeated) return; // victory is already secured -- nothing can kill the player during the boss's death sequence or the fly-off that follows
  const t = nowMs();
  if (t < invincibilityEndTime) return; // currently within an active protection window -- ignore this collision entirely
  sfxHazardImpact(hazardType);
  if (DIFFICULTY_CONFIG[selectedDifficulty]?.invincibilityFrames && t >= freeHitCooldownEndTime) {
    // forgiven hit grants a fresh protection window, then the free-pass
    // cooldown so it cannot be chained indefinitely
    invincibilityEndTime = t + INVINCIBILITY_DURATION_MS;
    freeHitCooldownEndTime = t + FREE_HIT_COOLDOWN_MS;
    return;
  }
  const moltenSpecialHit = hazardType === 'charging' || hazardType === 'chargingClose'
    || hazardType === 'coreFlame' || hazardType === 'barrageActive';
  endGame(true, moltenSpecialHit ? { playCollision: false } : undefined);
}
let nextThemeIndex = 0;
let bgParticles = [];

function currentTheme() {
  return THEMES[themeIndex];
}

function currentGapSize() {
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const th = currentTheme();
  const startFrac = (th.gapFractionStart !== undefined) ? th.gapFractionStart : GAP_FRACTION_START;
  if (th.gapConstant) {
    return playHeight * startFrac;
  }
  const minFrac = (th.gapFractionMin !== undefined) ? th.gapFractionMin : GAP_FRACTION_MIN;
  const fraction = Math.max(minFrac, startFrac - distance * 0.0006);
  return playHeight * fraction;
}

function currentGateSpacing() {
  const th = currentTheme();
  if (th.obstacleShape === 'diamond') {
    const playHeight = PLAY_BOTTOM - PLAY_TOP;
    const startFrac = (th.gapFractionStart !== undefined) ? th.gapFractionStart : GAP_FRACTION_START;
    const maxDiameter = playHeight * startFrac * (1 + (th.pulseAmpFrac || 0));
    return Math.max(GATE_SPACING, maxDiameter * 1.4);
  }
  return th.gateSpacing || GATE_SPACING;
}

function spawnGate(x) {
  const th = currentTheme();
  if (th.obstacleShape === 'asteroid') {
    return spawnAsteroidCluster(x);
  }
  if (th.obstacleShape === 'hbar') {
    return spawnHBarCluster(x);
  }
  if (th.obstacleShape === 'barrier') {
    return spawnBarrier(x);
  }
  if (th.obstacleShape === 'lbolt') {
    return spawnFloatingBoltCluster(x);
  }
  if (th.obstacleShape === 'pendulum') {
    return spawnPendulumCluster(x);
  }
  if (th.obstacleShape === 'aciddrip') {
    return spawnAcidDrip(x);
  }
  if (th.obstacleShape === 'wreckage') {
    return spawnWreckageCluster(x);
  }
  if (th.obstacleShape === 'lightning') {
    return spawnLightningBolt(x);
  }
  if (th.obstacleShape === 'fireball') {
    return 0; // fireballs spawn on their own timer, not by x-position
  }
  const gap = currentGapSize();
  const margin = 20;
  const minCenter = PLAY_TOP + gap / 2 + margin;
  const maxCenter = PLAY_BOTTOM - gap / 2 - margin;

  const entry = th.pattern[patternIndex % th.pattern.length];
  patternIndex++;

  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const baseCenter = Math.max(minCenter, Math.min(maxCenter, PLAY_TOP + entry.centerFrac * playHeight));
  const maxAmp = Math.max(0, Math.min(baseCenter - minCenter, maxCenter - baseCenter));
  gates.push({
    type: 'gate',
    x: x,
    baseCenter: baseCenter,
    amplitude: entry.ampFrac * maxAmp,
    freq: entry.freq,
    phase: entry.phase,
    pulsePhase: entry.pulsePhase || 0,
    pulseFreq: entry.pulseFreq || 0,
    passed: false
  });
  return entry.spacing;
}

function spawnLightningBolt(x) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;

  const entry = th.pattern[patternIndex % th.pattern.length];
  const seed = patternIndex; // fixed per-bolt seed, so the jagged shape is deterministic
  patternIndex++;

  // deterministic pseudo-jitter for a jagged look (no Math.random() -- same seed
  // always produces the same zigzag, keeping every playthrough identical)
  const jitter = [];
  for (let i = 0; i < 5; i++) {
    jitter.push(Math.sin(i * 12.9898 + seed * 78.233) * 0.5);
  }

  gates.push({
    type: 'lightning',
    x: x,
    span: entry.spanPx,
    thickness: entry.thicknessPx,
    y1: PLAY_TOP + entry.y1Frac * playHeight,
    y2: PLAY_TOP + entry.y2Frac * playHeight,
    jitter: jitter,
    spawnFrame: frame,
    passed: false
  });
  return entry.spacing;
}

function spawnBarrier(x) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;

  const entry = th.pattern[patternIndex % th.pattern.length];
  const seed = patternIndex; // fixed per-barrier seed for the jagged bolt silhouette
  patternIndex++;

  // deterministic jitter (no Math.random()) so each barrier's jagged shape is
  // fixed and identical across every playthrough
  const jitter = [];
  for (let i = 0; i < 6; i++) {
    jitter.push(Math.sin(i * 12.9898 + seed * 78.233) * 0.5);
  }

  const cycleLength = entry.onFrames + entry.offFrames;
  gates.push({
    type: 'barrier',
    x: x,
    width: 20,
    gapCenter: PLAY_TOP + entry.gapCenterFrac * playHeight,
    gapHeight: entry.gapFrac * playHeight,
    onFrames: entry.onFrames,
    offFrames: entry.offFrames,
    cycleLength: cycleLength,
    phaseOffset: Math.round(entry.phaseFrac * cycleLength),
    jitter: jitter,
    passed: false
  });
  return entry.spacing;
}

function barrierIsActive(g) {
  const t = (frame - zoneStartFrame + g.phaseOffset) % g.cycleLength;
  return t < g.onFrames;
}

// how many frames remain until this barrier's next state change (for the
// pre-activation warning flicker in the renderer)
function barrierFramesToToggle(g) {
  const t = (frame - zoneStartFrame + g.phaseOffset) % g.cycleLength;
  return t < g.onFrames ? (g.onFrames - t) : (g.cycleLength - t);
}

function spawnHBarCluster(x) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;

  const entry = th.pattern[patternIndex % th.pattern.length];
  patternIndex++;

  for (const b of entry.bars) {
    gates.push({
      type: 'hbar',
      x: x,
      baseCenter: PLAY_TOP + b.yFrac * playHeight,
      amplitude: b.ampFrac * playHeight,
      freq: b.freq,
      phase: b.phase,
      width: b.widthPx,
      thickness: b.thicknessPx,
      passed: false
    });
  }
  return entry.spacing;
}

// hand-picked bolt silhouettes (normalized: x as fraction of swingWidth/2,
// y as fraction of height from top), each a distinct filled icon shape
const BOLT_SHAPES = {
  E1: [[0.55, 0], [-0.45, 0.425], [0.2, 0.425], [-0.625, 1], [0.875, 0.45], [0.075, 0.45]],
  E3: [[0.8, 0], [-0.75, 0.45], [0.25, 0.45], [-0.875, 1], [1.125, 0.5], [0.2, 0.5]],
  E4: [[0.5, 0.15], [-0.45, 0.45], [0.15, 0.45], [-0.55, 0.85], [0.8, 0.525], [0.05, 0.525]],
  E5: [[0.3, 0], [-0.35, 0.55], [0.125, 0.55], [-0.4, 1], [0.55, 0.6], [0.05, 0.6]],
  E6: [[0.2, 0], [-0.2, 0.45], [0.075, 0.45], [-0.25, 1], [0.35, 0.475], [0.025, 0.475]]
};

// accurate polygon-vs-rectangle collision, used so hitboxes match the
// visible jagged bolt silhouette instead of its full bounding box (which
// is much wider than thin shapes like E5/E6 actually render)
function pointInPolygon(px, py, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const xi = poly[i][0], yi = poly[i][1];
    const xj = poly[j][0], yj = poly[j][1];
    const intersect = ((yi > py) !== (yj > py)) &&
      (px < (xj - xi) * (py - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy) {
  const d1 = (dx - cx) * (ay - cy) - (dy - cy) * (ax - cx);
  const d2 = (dx - cx) * (by - cy) - (dy - cy) * (bx - cx);
  const d3 = (bx - ax) * (cy - ay) - (by - ay) * (cx - ax);
  const d4 = (bx - ax) * (dy - ay) - (by - ay) * (dx - ax);
  return ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0));
}

function rectIntersectsPolygon(left, top, right, bottom, poly) {
  const corners = [[left, top], [right, top], [right, bottom], [left, bottom]];
  for (const [cx, cy] of corners) {
    if (pointInPolygon(cx, cy, poly)) return true;
  }
  for (const [vx, vy] of poly) {
    if (vx >= left && vx <= right && vy >= top && vy <= bottom) return true;
  }
  for (let i = 0; i < poly.length; i++) {
    const [ax, ay] = poly[i];
    const [bx, by] = poly[(i + 1) % poly.length];
    for (let j = 0; j < 4; j++) {
      const [cx, cy] = corners[j];
      const [dx, dy] = corners[(j + 1) % 4];
      if (segmentsIntersect(ax, ay, bx, by, cx, cy, dx, dy)) return true;
    }
  }
  return false;
}

function spawnPendulumCluster(x) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;

  const entry = th.pattern[patternIndex % th.pattern.length];
  patternIndex++;

  entry.pendulums.forEach((p) => {
    const pivotY = p.pivotSide === 'top' ? PLAY_TOP : PLAY_BOTTOM;
    const chainLength = p.chainLengthFrac * playHeight;
    const amplitude = p.ampFrac * playHeight;
    gates.push({
      type: 'pendulum',
      x: x + p.xJitter,
      pivotY: pivotY,
      pivotSide: p.pivotSide,
      chainLength: chainLength,
      amplitude: amplitude,
      freq: p.freq,
      phase: p.phase,
      r: p.radiusPx,
      passed: false
    });
  });
  return entry.spacing;
}

function livePendulumBobY(g) {
  const dir = g.pivotSide === 'top' ? 1 : -1;
  return g.pivotY + dir * (g.chainLength + g.amplitude * Math.sin((frame - zoneStartFrame) * g.freq + g.phase));
}

function spawnFloatingBoltCluster(x) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 28;

  const entry = th.pattern[patternIndex % th.pattern.length];
  patternIndex++;

  entry.bolts.forEach((b) => {
    const heightPx = b.heightFrac * playHeight;
    const cycleLength = b.onFrames + b.offFrames;
    gates.push({
      type: 'lbolt',
      x: x + b.xJitter,
      y: PLAY_TOP + margin + b.yFrac * Math.max(1, playHeight - margin * 2),
      height: heightPx,
      swingWidth: b.swingWidthPx,
      shape: BOLT_SHAPES[b.shape],
      onFrames: b.onFrames,
      offFrames: b.offFrames,
      cycleLength: cycleLength,
      phaseOffset: Math.round(b.phaseFrac * cycleLength),
      passed: false
    });
  });
  return entry.spacing;
}

