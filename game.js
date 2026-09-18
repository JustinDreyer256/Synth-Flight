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

function spawnBlackHoleEvent(eventIndex) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 15;
  const entry = th.blackHoleEvents[eventIndex];

  const holeX = ship.x + EVENT_SPAWN_OFFSET + entry.reachR;
  const holeY = PLAY_TOP + margin + entry.yFrac * Math.max(1, playHeight - margin * 2);

  gates.push({
    type: 'blackhole',
    x: holeX,
    y: holeY,
    coreR: entry.coreR,
    reachR: entry.reachR,
    rotSeed: eventIndex * 7.3,
    passed: false
  });
}

function spawnWindVortexEvent(eventIndex) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 15;
  const entry = th.windVortexEvents[eventIndex];

  const vx = ship.x + EVENT_SPAWN_OFFSET + entry.reachR;
  const vy = PLAY_TOP + margin + entry.yFrac * Math.max(1, playHeight - margin * 2);

  gates.push({
    type: 'windvortex',
    x: vx,
    y: vy,
    reachR: entry.reachR,
    rotSeed: eventIndex * 5.1,
    passed: false
  });
}

function spawnCloudArcEvent(eventIndex) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 20;
  const entry = th.cloudArcEvents[eventIndex];

  const x1 = ship.x + EVENT_SPAWN_OFFSET + entry.spanPx;
  const x2 = x1 + entry.spanPx;
  const y1 = PLAY_TOP + margin + entry.y1Frac * Math.max(1, playHeight - margin * 2);
  const y2 = PLAY_TOP + margin + entry.y2Frac * Math.max(1, playHeight - margin * 2);
  const cycleLength = entry.onFrames + entry.offFrames;
  const jitter = [];
  for (let i = 0; i < 7; i++) jitter.push((Math.random() - 0.5) * 2);
  // a single secondary fork branching off the main line, like real lightning --
  // fixed at spawn so it's consistent frame to frame, not regenerated
  const branchT = 0.35 + Math.random() * 0.3; // where along the main line it forks off
  const branchSide = Math.random() < 0.5 ? -1 : 1;
  const branchLen = 40 + Math.random() * 30;
  const branchAngleJitter = (Math.random() - 0.5) * 0.6;

  gates.push({
    type: 'cloudarc',
    x: x1, y: y1, x2: x2, y2: y2,
    onFrames: entry.onFrames,
    offFrames: entry.offFrames,
    cycleLength: cycleLength,
    phaseOffset: Math.round(entry.phaseFrac * cycleLength),
    jitter: jitter,
    branchT, branchSide, branchLen, branchAngleJitter,
    passed: false
  });
}

function spawnDroneSwarmEvent(eventIndex) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 20;
  const entry = th.droneSwarmEvents[eventIndex];
  const n = entry.formationYFracs.length;
  const portalX = predictedPortalX();
  const maxX = portalX != null ? portalX - 48 - entry.r : Infinity;

  entry.formationYFracs.forEach((yFrac, i) => {
    const y = PLAY_TOP + margin + yFrac * Math.max(1, playHeight - margin * 2);
    let spawnX = ship.x + EVENT_SPAWN_OFFSET + i * 35;
    if (spawnX > maxX) spawnX = maxX - (n - 1 - i) * 28;
    gates.push({
      type: 'securitydrone',
      x: spawnX,
      y: y,
      r: entry.r,
      speedMult: entry.speedMult,
      rotSeed: i * 2.7,
      passed: false
    });
  });
}

function spawnBillboardEvent(eventIndex) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const entry = th.billboardEvents[eventIndex];
  const panelHeight = playHeight * entry.extendFrac;

  gates.push({
    type: 'billboard',
    x: ship.x + EVENT_SPAWN_OFFSET + entry.panelWidth,
    anchor: entry.anchor,
    panelWidth: entry.panelWidth,
    panelHeight: panelHeight,
    rotSeed: eventIndex * 3.3,
    passed: false
  });
}

function spawnTurretEvent(eventIndex) {
  const th = currentTheme();
  const entry = th.turretEvents[eventIndex];
  const y = entry.anchor === 'top' ? PLAY_TOP + entry.mountOffset : PLAY_BOTTOM - entry.mountOffset;
  gates.push({
    type: 'turret',
    x: ship.x + EVENT_SPAWN_OFFSET,
    anchor: entry.anchor,
    y: y,
    numShots: entry.numShots,
    fireInterval: entry.fireInterval,
    fireAngleDeg: entry.fireAngleDeg || 0,
    projectileSpeed: entry.projectileSpeed,
    projectileR: entry.projectileR,
    spawnFrame: frame,
    shotsFired: 0,
    passed: false
  });
}

function spawnSearchlightEvent(eventIndex) {
  const th = currentTheme();
  const entry = th.searchlightEvents[eventIndex];
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const angleMaxRad = entry.angleMaxDeg * Math.PI / 180;
  gates.push({
    type: 'searchlight',
    x: ship.x + EVENT_SPAWN_OFFSET,
    maxOffset: playHeight * Math.tan(angleMaxRad),
    sweepPeriod: entry.sweepPeriod,
    beamWidth: entry.beamWidth,
    spawnFrame: frame,
    passed: false
  });
}

function liveSearchlightEndpoint(g) {
  const elapsed = frame - g.spawnFrame;
  const offset = g.maxOffset * Math.sin(2 * Math.PI * elapsed / g.sweepPeriod);
  return { x: g.x + offset, y: PLAY_BOTTOM };
}

function pointToSegmentDist(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1, dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const closestX = x1 + t * dx, closestY = y1 + t * dy;
  return Math.hypot(px - closestX, py - closestY);
}

function spawnZone2Storm() {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 40;

  const entry = th.extraStormPattern[extraStormPatternIndex % th.extraStormPattern.length];
  extraStormPatternIndex++;

  const baseY = PLAY_TOP + margin + entry.baseYFrac * Math.max(1, playHeight - margin * 2);
  gates.push({
    type: 'zone2storm',
    x: W + entry.r + 40,
    baseY: baseY,
    spawnFrame: frame,
    r: entry.r,
    rotSeed: extraStormPatternIndex * 2.3,
    passed: false
  });
  return entry.interval;
}

function liveStormY(g) {
  // pure horizontal sweep -- no vertical drift, matching the "sweeps
  // right to left only" design
  return g.baseY;
}

function zoneEndRemainingDistance() {
  if (miniBossEscapeRunActive) {
    return (miniBossEscapeRunStartDistance + MINI_BOSS_ESCAPE_RUN_DISTANCE) - distance;
  }
  const th = currentTheme();
  if (th.isBossZone || th.isMiniBossZone) return Infinity;
  if (themeLevelReached >= 999999) return Infinity;
  return THEME_DISTANCE - (distance - zoneStartDistance);
}

function predictedPortalX() {
  if (portalObject) return portalObject.x;
  const remaining = zoneEndRemainingDistance();
  if (!isFinite(remaining) || remaining <= 0) return null;
  return ship.x + remaining * 10;
}

function spawnWouldHitPortal(spawnX, forwardExtent) {
  const portalX = predictedPortalX();
  if (portalX == null) return false;
  return spawnX + forwardExtent >= portalX - 40;
}

function gateClearsPortal(g, portalSafeX) {
  if (g.type === 'shootingstar') return g.x + g.r * 9 * 1.2 < portalSafeX;
  if (g.type === 'fireball') return g.x + g.r * 8.5 < portalSafeX;
  if (g.type === 'asteroid' || g.type === 'pendulum' || g.type === 'aciddrip' || g.type === 'wreckage') return g.x + g.r < portalSafeX;
  if (g.type === 'zone2storm') return g.x + g.r < portalSafeX;
  if (g.type === 'securitydrone') return g.x + g.r < portalSafeX;
  if (g.type === 'turretshot') return g.x + g.r < portalSafeX;
  if (g.type === 'turret') return g.x + 22 < portalSafeX;
  if (g.type === 'blackhole') return g.x + g.reachR < portalSafeX;
  if (g.type === 'windvortex') return g.x + g.reachR < portalSafeX;
  if (g.type === 'cloudarc') return g.x2 < portalSafeX;
  if (g.type === 'orbiter') return g.x + g.orbitRadius + g.r < portalSafeX;
  if (g.type === 'arcplanet') return g.x + g.r < portalSafeX;
  if (g.type === 'lensingzone') return g.x + g.zoneRadius < portalSafeX;
  if (g.type === 'signalcorruption') return g.x + g.zoneWidth / 2 < portalSafeX;
  if (g.type === 'supernova') return g.x + g.planetR < portalSafeX;
  if (g.type === 'toxicpool') return g.x + g.baseR + g.pulseAmp < portalSafeX;
  if (g.type === 'geyser' || g.type === 'movingdoor' || g.type === 'specialdoor') return g.x + g.width / 2 < portalSafeX;
  if (g.type === 'sparkhub') return g.x < portalSafeX;
  if (g.type === 'sparkprojectile') return g.x < portalSafeX;
  if (g.type === 'supernovadebris') return g.x < portalSafeX;
  if (g.type === 'accesskey') return g.x + g.r < portalSafeX;
  if (g.type === 'hbar') return g.x + g.width / 2 < portalSafeX;
  if (g.type === 'billboard') return g.x + g.panelWidth / 2 < portalSafeX;
  if (g.type === 'emp') return g.x + 30 < portalSafeX;
  if (g.type === 'echotrail') return g.x + g.zoneWidth / 2 < portalSafeX;
  if (g.type === 'pulsingorb') {
    const keep = g.x + g.maxR < portalSafeX;
    if (!keep) stopPulsingOrbSound(g);
    return keep;
  }
  if (g.type === 'boomerang') {
    const keep = !boomerangDone(g);
    if (!keep) stopBoomerangSound(g);
    return keep;
  }
  if (g.type === 'searchlight') return g.x + 880 < portalSafeX;
  if (g.type === 'lasergrid') return g.x + g.gridWidth < portalSafeX;
  if (g.type === 'lbolt') return g.x + g.swingWidth / 2 < portalSafeX;
  if (g.type === 'barrier') return g.x + g.width / 2 < portalSafeX;
  if (g.type === 'lightning') return g.x + g.span / 2 < portalSafeX;
  return g.x + GATE_WIDTH < portalSafeX;
}

function spawnExtraOrbiter() {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;

  const entry = th.extraOrbiterPattern[extraOrbiterPatternIndex % th.extraOrbiterPattern.length];
  extraOrbiterPatternIndex++;

  const centerY = PLAY_TOP + entry.centerYFrac * playHeight;
  const spawnBuffer = entry.orbitRadius + entry.bodyR + 40;

  gates.push({
    type: 'orbiter',
    x: W + spawnBuffer,
    centerY: centerY,
    orbitRadius: entry.orbitRadius,
    angularSpeed: entry.angularSpeed,
    initialAngle: entry.initialAngle,
    r: entry.bodyR,
    color: entry.color,
    spawnFrame: frame,
    rotSeed: extraOrbiterPatternIndex * 3.7,
    passed: false
  });
  return entry.interval;
}

function spawnExtraArcPlanet() {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 30;

  const entry = th.extraArcPlanetPattern[extraArcPlanetPatternIndex % th.extraArcPlanetPattern.length];
  extraArcPlanetPatternIndex++;

  const startY = PLAY_TOP + margin + entry.startYFrac * Math.max(1, playHeight - margin * 2);

  // guarantee the swoop continues (never freezes) until the planet has
  // actually scrolled off-screen -- same fix already proven for shooting
  // stars, computed dynamically rather than assuming one screen size
  const effScroll = SCROLL_SPEED * (th.scrollMult || 1);
  const spawnX = W + 60;
  const minLifeForOffscreen = (spawnX + 80 + entry.bodyR) / effScroll;
  const life = Math.max(entry.lifeFrames, minLifeForOffscreen);

  gates.push({
    type: 'arcplanet',
    x: spawnX,
    spawnFrame: frame,
    startY: startY,
    arcDrop: entry.arcDropFrac * playHeight,
    life: life,
    r: entry.bodyR,
    color: entry.color,
    passed: false
  });
  return entry.interval;
}

function liveArcPlanetY(g) {
  const t = Math.min(1, (frame - g.spawnFrame) / g.life);
  return g.startY + g.arcDrop * Math.sin(Math.PI * t);
}

function arcPlanetDone(g) {
  return (frame - g.spawnFrame) >= g.life;
}

function spawnSignalCorruptionEvent(eventIndex) {
  const th = currentTheme();
  const entry = th.signalCorruptionEvents[eventIndex];
  gates.push({
    type: 'signalcorruption',
    x: ship.x + EVENT_SPAWN_OFFSET + entry.zoneWidth / 2,
    zoneWidth: entry.zoneWidth,
    rotSeed: eventIndex * 5.1,
    passed: false
  });
}

function spawnEmpEvent(eventIndex) {
  const th = currentTheme();
  const entry = th.empEvents[eventIndex];
  gates.push({
    type: 'emp',
    x: ship.x + EVENT_SPAWN_OFFSET,
    anchor: entry.anchor,
    reachDepth: entry.reachDepth,
    chargeFrames: entry.chargeFrames,
    dischargeFrames: entry.dischargeFrames,
    spawnFrame: frame,
    passed: false
  });
}

function spawnPulsingOrbEvent(eventIndex) {
  const th = currentTheme();
  const entry = th.pulsingOrbEvents[eventIndex];
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  gates.push({
    type: 'pulsingorb',
    x: ship.x + EVENT_SPAWN_OFFSET + entry.maxR,
    y: PLAY_TOP + playHeight / 2,
    minR: entry.minR,
    maxR: entry.maxR,
    period: entry.period,
    spawnFrame: frame,
    rotSeed: eventIndex * 3.7,
    passed: false
  });
}

function livePulsingOrbRadius(g) {
  const elapsed = frame - g.spawnFrame;
  const midR = (g.minR + g.maxR) / 2, ampR = (g.maxR - g.minR) / 2;
  return midR + ampR * Math.sin(2 * Math.PI * elapsed / g.period);
}

function stopPulsingOrbSound(g) {
  if (!g || !g.orbSfx) return;
  const nodes = g.orbSfx;
  g.orbSfx = null;
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  try {
    nodes.out.gain.cancelScheduledValues(now);
    nodes.out.gain.setValueAtTime(Math.max(0.0001, nodes.out.gain.value), now);
    nodes.out.gain.linearRampToValueAtTime(0.0001, now + 0.08);
  } catch (e) { /* already stopped */ }
  nodes.sources.forEach((node) => {
    try { node.stop(now + 0.1); } catch (e) { /* already stopped */ }
  });
}

function stopAllPulsingOrbSounds() {
  for (const g of gates) {
    if (g.type === 'pulsingorb') stopPulsingOrbSound(g);
  }
}

function playPulsingOrbBloom(prox = 1) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted) return;
  if (!sfxHazardRateOk('orbBloom', 220)) return;
  const t0 = audioCtx.currentTime;
  const vol = 0.14 * Math.max(0.35, prox);
  playNoiseBurst({
    duration: 0.28, filterFreq: 280, filterEnd: 2100, filterType: 'lowpass', filterQ: 0.55,
    volume: vol, delaySend: 0.16, when: t0,
  });
  playSynth({
    type: 'sine', freq: 72, freqEnd: 168, duration: 0.26,
    attack: 0.02, decay: 0.08, sustain: 0.45, release: 0.1,
    volume: vol * 0.7, filterFreq: 700, delaySend: 0.12, when: t0,
  });
  playSynth({
    type: 'triangle', freq: 140, freqEnd: 280, duration: 0.22,
    attack: 0.03, decay: 0.07, sustain: 0.28, release: 0.1,
    volume: vol * 0.28, filterFreq: 1600, delaySend: 0.22, when: t0 + 0.04,
  });
}

function startPulsingOrbSound(g) {
  if (!g || g.orbSfx || !audioUnlocked || !audioCtx || audioSettings.muted) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.connect(sfxGain);

  const drone = audioCtx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = 70;
  const dGain = audioCtx.createGain();
  dGain.gain.value = 0.11;
  drone.connect(dGain);
  dGain.connect(out);

  const bloom = audioCtx.createOscillator();
  bloom.type = 'triangle';
  bloom.frequency.value = 130;
  const bFilt = audioCtx.createBiquadFilter();
  bFilt.type = 'lowpass';
  bFilt.frequency.value = 520;
  bFilt.Q.value = 0.8;
  const bGain = audioCtx.createGain();
  bGain.gain.value = 0.045;
  bloom.connect(bFilt);
  bFilt.connect(bGain);
  bGain.connect(out);

  const noise = createGlowDangerNoise();
  const nFilt = audioCtx.createBiquadFilter();
  nFilt.type = 'bandpass';
  nFilt.frequency.value = 360;
  nFilt.Q.value = 1.15;
  const nGain = audioCtx.createGain();
  nGain.gain.value = 0.05;
  noise.connect(nFilt);
  nFilt.connect(nGain);
  nGain.connect(out);

  drone.start(now);
  bloom.start(now);
  noise.start(now);
  g.orbSfx = { out, drone, bloom, bFilt, nFilt, nGain, sources: [drone, bloom, noise] };
  g.orbSfxWasExpanding = false;
}

function updatePulsingOrbSound(g) {
  if (!g.orbSfx || !audioCtx) return;
  const t = Math.max(0, Math.min(1, (livePulsingOrbRadius(g) - g.minR) / Math.max(1, g.maxR - g.minR)));
  const elapsed = frame - g.spawnFrame;
  const expanding = Math.cos(2 * Math.PI * elapsed / g.period) > 0.04;
  const now = audioCtx.currentTime;
  const distX = Math.abs(g.x - ship.x);
  const prox = Math.max(0.12, Math.min(1, 1 - distX / Math.max(220, W * 0.85)));
  const onScreen = g.x + g.maxR > -20 && g.x - g.maxR < W + 20;
  const swell = expanding ? 1 : 0.48;
  g.orbSfx.out.gain.setTargetAtTime((0.04 + t * 0.16) * prox * swell * (onScreen ? 1 : 0.28), now, 0.07);
  g.orbSfx.drone.frequency.setTargetAtTime(58 + t * 108, now, 0.06);
  g.orbSfx.bloom.frequency.setTargetAtTime(108 + t * 175, now, 0.06);
  g.orbSfx.bFilt.frequency.setTargetAtTime(360 + t * 1500, now, 0.08);
  g.orbSfx.nFilt.frequency.setTargetAtTime(260 + t * 980, now, 0.08);
  g.orbSfx.nGain.gain.setTargetAtTime(0.028 + t * 0.11, now, 0.08);
  if (expanding && !g.orbSfxWasExpanding && elapsed > 4 && onScreen && prox > 0.28) {
    playPulsingOrbBloom(prox);
  }
  g.orbSfxWasExpanding = expanding;
}

function syncPulsingOrbSounds() {
  if (typeof previewLoopId === 'string' && previewLoopId.startsWith('hzPulseOrb')) return;
  if (state !== 'playing' || ghostMode) {
    stopAllPulsingOrbSounds();
    return;
  }
  for (const g of gates) {
    if (g.type !== 'pulsingorb') continue;
    startPulsingOrbSound(g);
    updatePulsingOrbSound(g);
  }
}

function spawnBoomerangEvent(eventIndex) {
  const th = currentTheme();
  const entry = th.boomerangEvents[eventIndex];
  const g = {
    type: 'boomerang',
    x: entry.xStart,
    xStart: entry.xStart,
    xMax: entry.xMax,
    yOutbound: entry.yOutbound,
    yReturn: entry.yReturn,
    arcAmplitude: entry.arcAmplitude,
    period: entry.period,
    r: entry.r,
    spawnFrame: frame,
    passed: false
  };
  gates.push(g);
  startBoomerangSound(g);
}

function liveBoomerangPos(g) {
  const elapsed = frame - g.spawnFrame;
  const t = Math.min(1, elapsed / g.period);
  const x = g.xStart + (g.xMax - g.xStart) * Math.sin(Math.PI * t);
  const smoothT = t * t * (3 - 2 * t);
  const y = g.yOutbound + (g.yReturn - g.yOutbound) * smoothT + g.arcAmplitude * Math.sin(Math.PI * t);
  return { x: x, y: y };
}

function boomerangDone(g) {
  return (frame - g.spawnFrame) >= g.period;
}

function stopBoomerangSound(g) {
  if (!g || !g.boomSfx) return;
  const nodes = g.boomSfx;
  g.boomSfx = null;
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  try {
    nodes.out.gain.cancelScheduledValues(now);
    nodes.out.gain.setValueAtTime(Math.max(0.0001, nodes.out.gain.value), now);
    nodes.out.gain.linearRampToValueAtTime(0.0001, now + 0.12);
  } catch (e) { /* already stopped */ }
  nodes.sources.forEach((node) => {
    try { node.stop(now + 0.14); } catch (e) { /* already stopped */ }
  });
}

function stopAllBoomerangSounds() {
  for (const g of gates) {
    if (g.type === 'boomerang') stopBoomerangSound(g);
  }
}

function startBoomerangSound(g) {
  if (!g || g.boomSfxStarted) return;
  if (!audioUnlocked || !audioCtx || audioSettings.muted) return;
  playBoomerangPass();
  g.boomSfxStarted = true;
}

function updateBoomerangSound(g) {
}

function syncBoomerangSounds() {
  if (typeof previewLoopId === 'string' && previewLoopId === 'hzBoomerang') return;
  if (state !== 'playing' || ghostMode) return;
  for (const g of gates) {
    if (g.type !== 'boomerang') continue;
    if (boomerangDone(g)) continue;
    startBoomerangSound(g);
    updateBoomerangSound(g);
  }
}

let boomerangPassStyle = 'chop';

function beginBoomerangPassBus() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted) return null;
  const t0 = audioCtx.currentTime;
  const dur = 2.55;
  const halt = t0 + dur + 0.05;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.08, t0);
  out.gain.linearRampToValueAtTime(0.22, t0 + 0.45);
  out.gain.linearRampToValueAtTime(0.72, t0 + 1.05);
  out.gain.linearRampToValueAtTime(0.86, t0 + 1.22);
  out.gain.linearRampToValueAtTime(0.5, t0 + 1.55);
  out.gain.linearRampToValueAtTime(0.16, t0 + 2.15);
  out.gain.linearRampToValueAtTime(0.0001, t0 + dur);
  if (typeof audioCtx.createStereoPanner === 'function') {
    const pan = audioCtx.createStereoPanner();
    pan.pan.setValueAtTime(-0.9, t0);
    pan.pan.linearRampToValueAtTime(0.15, t0 + 1.15);
    pan.pan.linearRampToValueAtTime(-0.85, t0 + dur);
    out.connect(pan);
    pan.connect(sfxGain);
  } else {
    out.connect(sfxGain);
  }
  return { t0, dur, halt, out };
}

function startStopBoomerangNodes(nodes, t0, halt) {
  nodes.forEach((node) => {
    node.start(t0);
    node.stop(halt);
  });
}

function playBoomerangPassBlade() {
  const bus = beginBoomerangPassBus();
  if (!bus) return;
  const { t0, dur, halt, out } = bus;
  const noise = createGlowDangerNoise();
  const nFilt = audioCtx.createBiquadFilter();
  nFilt.type = 'bandpass';
  nFilt.Q.value = 1.8;
  nFilt.frequency.setValueAtTime(480, t0);
  nFilt.frequency.linearRampToValueAtTime(2200, t0 + 1.18);
  nFilt.frequency.linearRampToValueAtTime(520, t0 + dur);
  const nGain = audioCtx.createGain();
  nGain.gain.value = 0.55;
  noise.connect(nFilt);
  nFilt.connect(nGain);
  nGain.connect(out);

  const blade = audioCtx.createOscillator();
  blade.type = 'sawtooth';
  blade.frequency.setValueAtTime(150, t0);
  blade.frequency.linearRampToValueAtTime(410, t0 + 1.18);
  blade.frequency.linearRampToValueAtTime(160, t0 + dur);
  const bladeFilt = audioCtx.createBiquadFilter();
  bladeFilt.type = 'bandpass';
  bladeFilt.Q.value = 4.2;
  bladeFilt.frequency.setValueAtTime(400, t0);
  bladeFilt.frequency.linearRampToValueAtTime(1200, t0 + 1.18);
  bladeFilt.frequency.linearRampToValueAtTime(420, t0 + dur);
  const bladeGain = audioCtx.createGain();
  bladeGain.gain.value = 0.3;
  blade.connect(bladeFilt);
  bladeFilt.connect(bladeGain);
  bladeGain.connect(out);

  const hum = audioCtx.createOscillator();
  hum.type = 'triangle';
  hum.frequency.setValueAtTime(80, t0);
  hum.frequency.linearRampToValueAtTime(155, t0 + 1.18);
  hum.frequency.linearRampToValueAtTime(82, t0 + dur);
  const humGain = audioCtx.createGain();
  humGain.gain.value = 0.18;
  hum.connect(humGain);
  humGain.connect(out);

  const lfo = audioCtx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.setValueAtTime(7, t0);
  lfo.frequency.linearRampToValueAtTime(22, t0 + 1.2);
  lfo.frequency.linearRampToValueAtTime(8, t0 + dur);
  const lfoDepth = audioCtx.createGain();
  lfoDepth.gain.value = 0.4;
  lfo.connect(lfoDepth);
  lfoDepth.connect(nGain.gain);
  startStopBoomerangNodes([noise, blade, hum, lfo], t0, halt);
}

function playBoomerangPassWood() {
  const bus = beginBoomerangPassBus();
  if (!bus) return;
  const { t0, dur, halt, out } = bus;
  const air = createGlowDangerNoise();
  const airFilt = audioCtx.createBiquadFilter();
  airFilt.type = 'bandpass';
  airFilt.Q.value = 0.9;
  airFilt.frequency.setValueAtTime(280, t0);
  airFilt.frequency.linearRampToValueAtTime(1400, t0 + 1.18);
  airFilt.frequency.linearRampToValueAtTime(300, t0 + dur);
  const airGain = audioCtx.createGain();
  airGain.gain.value = 0.72;
  air.connect(airFilt);
  airFilt.connect(airGain);
  airGain.connect(out);

  const wood = audioCtx.createOscillator();
  wood.type = 'triangle';
  wood.frequency.setValueAtTime(92, t0);
  wood.frequency.linearRampToValueAtTime(210, t0 + 1.18);
  wood.frequency.linearRampToValueAtTime(96, t0 + dur);
  const woodGain = audioCtx.createGain();
  woodGain.gain.value = 0.34;
  wood.connect(woodGain);
  woodGain.connect(out);

  const flutter = audioCtx.createOscillator();
  flutter.type = 'sine';
  flutter.frequency.setValueAtTime(5, t0);
  flutter.frequency.linearRampToValueAtTime(16, t0 + 1.15);
  flutter.frequency.linearRampToValueAtTime(6, t0 + dur);
  const flutterDepth = audioCtx.createGain();
  flutterDepth.gain.value = 0.5;
  flutter.connect(flutterDepth);
  flutterDepth.connect(airGain.gain);
  startStopBoomerangNodes([air, wood, flutter], t0, halt);
}

function playBoomerangPassNeon() {
  const bus = beginBoomerangPassBus();
  if (!bus) return;
  const { t0, dur, halt, out } = bus;
  const disc = audioCtx.createOscillator();
  disc.type = 'square';
  disc.frequency.setValueAtTime(220, t0);
  disc.frequency.linearRampToValueAtTime(640, t0 + 1.18);
  disc.frequency.linearRampToValueAtTime(240, t0 + dur);
  const discFilt = audioCtx.createBiquadFilter();
  discFilt.type = 'lowpass';
  discFilt.Q.value = 1.8;
  discFilt.frequency.setValueAtTime(900, t0);
  discFilt.frequency.linearRampToValueAtTime(2800, t0 + 1.18);
  discFilt.frequency.linearRampToValueAtTime(1000, t0 + dur);
  const discGain = audioCtx.createGain();
  discGain.gain.value = 0.16;
  disc.connect(discFilt);
  discFilt.connect(discGain);
  discGain.connect(out);

  const sheen = audioCtx.createOscillator();
  sheen.type = 'sine';
  sheen.frequency.setValueAtTime(880, t0);
  sheen.frequency.linearRampToValueAtTime(1760, t0 + 1.18);
  sheen.frequency.linearRampToValueAtTime(920, t0 + dur);
  const sheenGain = audioCtx.createGain();
  sheenGain.gain.value = 0.09;
  sheen.connect(sheenGain);
  sheenGain.connect(out);

  const hiss = createGlowDangerNoise();
  const hissFilt = audioCtx.createBiquadFilter();
  hissFilt.type = 'highpass';
  hissFilt.frequency.setValueAtTime(1800, t0);
  hissFilt.frequency.linearRampToValueAtTime(4200, t0 + 1.18);
  hissFilt.frequency.linearRampToValueAtTime(1900, t0 + dur);
  const hissGain = audioCtx.createGain();
  hissGain.gain.value = 0.12;
  hiss.connect(hissFilt);
  hissFilt.connect(hissGain);
  hissGain.connect(out);
  if (delayInput) {
    const send = audioCtx.createGain();
    send.gain.value = 0.22;
    discGain.connect(send);
    sheenGain.connect(send);
    send.connect(delayInput);
  }
  startStopBoomerangNodes([disc, sheen, hiss], t0, halt);
}

function playBoomerangPassChop() {
  const bus = beginBoomerangPassBus();
  if (!bus) return;
  const { t0, dur, halt, out } = bus;
  const blade = audioCtx.createOscillator();
  blade.type = 'sawtooth';
  blade.frequency.setValueAtTime(180, t0);
  blade.frequency.linearRampToValueAtTime(480, t0 + 1.18);
  blade.frequency.linearRampToValueAtTime(190, t0 + dur);
  const bladeFilt = audioCtx.createBiquadFilter();
  bladeFilt.type = 'bandpass';
  bladeFilt.Q.value = 3.2;
  bladeFilt.frequency.setValueAtTime(500, t0);
  bladeFilt.frequency.linearRampToValueAtTime(1600, t0 + 1.18);
  bladeFilt.frequency.linearRampToValueAtTime(520, t0 + dur);
  const chop = audioCtx.createGain();
  chop.gain.value = 0.28;
  blade.connect(bladeFilt);
  bladeFilt.connect(chop);
  chop.connect(out);

  const spin = audioCtx.createOscillator();
  spin.type = 'square';
  spin.frequency.setValueAtTime(9, t0);
  spin.frequency.linearRampToValueAtTime(28, t0 + 1.18);
  spin.frequency.linearRampToValueAtTime(10, t0 + dur);
  const spinDepth = audioCtx.createGain();
  spinDepth.gain.value = 0.22;
  spin.connect(spinDepth);
  spinDepth.connect(chop.gain);

  const air = createGlowDangerNoise();
  const airFilt = audioCtx.createBiquadFilter();
  airFilt.type = 'bandpass';
  airFilt.Q.value = 1.3;
  airFilt.frequency.setValueAtTime(400, t0);
  airFilt.frequency.linearRampToValueAtTime(2000, t0 + 1.18);
  airFilt.frequency.linearRampToValueAtTime(440, t0 + dur);
  const airGain = audioCtx.createGain();
  airGain.gain.value = 0.28;
  air.connect(airFilt);
  airFilt.connect(airGain);
  airGain.connect(out);
  startStopBoomerangNodes([blade, spin, air], t0, halt);
}

function playBoomerangPassDoppler() {
  const bus = beginBoomerangPassBus();
  if (!bus) return;
  const { t0, dur, halt, out } = bus;
  const a = audioCtx.createOscillator();
  a.type = 'sine';
  a.frequency.setValueAtTime(140, t0);
  a.frequency.linearRampToValueAtTime(420, t0 + 1.18);
  a.frequency.linearRampToValueAtTime(150, t0 + dur);
  const aGain = audioCtx.createGain();
  aGain.gain.value = 0.42;
  a.connect(aGain);
  aGain.connect(out);

  const b = audioCtx.createOscillator();
  b.type = 'sine';
  b.frequency.setValueAtTime(148, t0);
  b.frequency.linearRampToValueAtTime(445, t0 + 1.18);
  b.frequency.linearRampToValueAtTime(158, t0 + dur);
  const bGain = audioCtx.createGain();
  bGain.gain.value = 0.28;
  b.connect(bGain);
  bGain.connect(out);

  const sub = audioCtx.createOscillator();
  sub.type = 'triangle';
  sub.frequency.setValueAtTime(58, t0);
  sub.frequency.linearRampToValueAtTime(110, t0 + 1.18);
  sub.frequency.linearRampToValueAtTime(60, t0 + dur);
  const subGain = audioCtx.createGain();
  subGain.gain.value = 0.22;
  sub.connect(subGain);
  subGain.connect(out);

  const air = createGlowDangerNoise();
  const airFilt = audioCtx.createBiquadFilter();
  airFilt.type = 'lowpass';
  airFilt.frequency.setValueAtTime(500, t0);
  airFilt.frequency.linearRampToValueAtTime(1800, t0 + 1.18);
  airFilt.frequency.linearRampToValueAtTime(520, t0 + dur);
  const airGain = audioCtx.createGain();
  airGain.gain.value = 0.16;
  air.connect(airFilt);
  airFilt.connect(airGain);
  airGain.connect(out);
  startStopBoomerangNodes([a, b, sub, air], t0, halt);
}

function playBoomerangPassRing() {
  const bus = beginBoomerangPassBus();
  if (!bus) return;
  const { t0, dur, halt, out } = bus;
  const ring = audioCtx.createOscillator();
  ring.type = 'sine';
  ring.frequency.setValueAtTime(620, t0);
  ring.frequency.linearRampToValueAtTime(1680, t0 + 1.18);
  ring.frequency.linearRampToValueAtTime(680, t0 + dur);
  const ringFilt = audioCtx.createBiquadFilter();
  ringFilt.type = 'bandpass';
  ringFilt.Q.value = 8;
  ringFilt.frequency.setValueAtTime(700, t0);
  ringFilt.frequency.linearRampToValueAtTime(1900, t0 + 1.18);
  ringFilt.frequency.linearRampToValueAtTime(740, t0 + dur);
  const ringGain = audioCtx.createGain();
  ringGain.gain.value = 0.18;
  ring.connect(ringFilt);
  ringFilt.connect(ringGain);
  ringGain.connect(out);

  const blade = audioCtx.createOscillator();
  blade.type = 'triangle';
  blade.frequency.setValueAtTime(310, t0);
  blade.frequency.linearRampToValueAtTime(840, t0 + 1.18);
  blade.frequency.linearRampToValueAtTime(330, t0 + dur);
  const bladeGain = audioCtx.createGain();
  bladeGain.gain.value = 0.14;
  blade.connect(bladeGain);
  bladeGain.connect(out);

  const air = createGlowDangerNoise();
  const airFilt = audioCtx.createBiquadFilter();
  airFilt.type = 'bandpass';
  airFilt.Q.value = 2.4;
  airFilt.frequency.setValueAtTime(900, t0);
  airFilt.frequency.linearRampToValueAtTime(2600, t0 + 1.18);
  airFilt.frequency.linearRampToValueAtTime(960, t0 + dur);
  const airGain = audioCtx.createGain();
  airGain.gain.value = 0.2;
  air.connect(airFilt);
  airFilt.connect(airGain);
  airGain.connect(out);
  if (delayInput) {
    const send = audioCtx.createGain();
    send.gain.value = 0.28;
    ringGain.connect(send);
    send.connect(delayInput);
  }
  startStopBoomerangNodes([ring, blade, air], t0, halt);
}

function playBoomerangPass() {
  if (boomerangPassStyle === 'wood') return playBoomerangPassWood();
  if (boomerangPassStyle === 'neon') return playBoomerangPassNeon();
  if (boomerangPassStyle === 'chop') return playBoomerangPassChop();
  if (boomerangPassStyle === 'doppler') return playBoomerangPassDoppler();
  if (boomerangPassStyle === 'ring') return playBoomerangPassRing();
  return playBoomerangPassBlade();
}

function playBoomerangPassPreview() {
  playBoomerangPass();
}

// Stage 1 validation attack: a fan-spread burst of projectiles, aimed
// generally toward the ship's side of the screen. Reuses the exact
// vx/vy directional movement pattern already proven with turretshot --
// deliberately not inventing new physics for the very first boss attack.
function spawnBossBurst() {
  if (!boss) return;
  const numProjectiles = 6;
  const spreadDeg = 100; // widened from 70 -- more room between projectiles per request
  const baseAngleDeg = 180; // straight left, toward the ship's fixed x
  const speed = 3.2805; // 3.645 * 0.9 -- another 10% slower per request (was 4.5, then 4.05, then 3.645, now 3.2805)
  for (let i = 0; i < numProjectiles; i++) {
    const angleOffsetDeg = (i / (numProjectiles - 1) - 0.5) * spreadDeg;
    const angleRad = (baseAngleDeg + angleOffsetDeg) * Math.PI / 180;
    gates.push({
      type: 'bossattack',
      x: boss.x,
      y: boss.y,
      r: 10,
      vx: speed * Math.cos(angleRad),
      vy: speed * Math.sin(angleRad),
      passed: false
    });
  }
  sfxHazardFire('bossattack');
}

// Phase 2 attack: a lock-on telegraph (the boss aims at the ship)
// then a small, fast volley at that locked-in position. Non-homing
// once fired -- moving during the telegraph is the counterplay.
function spawnBossVolleyTelegraph() {
  if (!boss) return;
  gates.push({
    type: 'bossvolleytelegraph',
    spawnFrame: frame,
    warningFrames: 90,
    passed: false
  });
  sfxHazardFire('bossvolleytelegraph');
}

function fireBossVolley(lockedY) {
  if (!boss) return;
  const numProjectiles = 3;
  const speed = 6.5;
  const dx = ship.x - boss.x, dy = lockedY - boss.y; // straight-line toward the locked target
  const dist = Math.hypot(dx, dy) || 1;
  for (let i = 0; i < numProjectiles; i++) {
    const spreadOffset = (i - 1) * 18; // small parallel spread, not angular fan
    gates.push({
      type: 'bossattack',
      x: boss.x,
      y: boss.y + spreadOffset,
      r: 9,
      vx: (dx / dist) * speed,
      vy: (dy / dist) * speed,
      passed: false
    });
  }
  sfxHazardFire('bossvolley');
}

function spawnBossAshCloud() {
  if (!boss) return;
  const yFrac = 0.15 + Math.random() * 0.7;
  const y = PLAY_TOP + yFrac * (PLAY_BOTTOM - PLAY_TOP);
  gates.push({
    type: 'bossashcloud',
    x: W + BOSS_ASH_CLOUD_R,
    y: y,
    r: BOSS_ASH_CLOUD_R,
    vx: -BOSS_ASH_CLOUD_SPEED,
    rotSeed: Math.random() * 100,
    passed: false
  });
  sfxHazardFire('bossashcloud');
}

function shuffleArray(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function spawnBossEmber() {
  if (!boss) return;
  const vyDrift = (Math.random() - 0.5) * 1.6;
  gates.push({
    type: 'bossember',
    x: boss.x,
    y: boss.y + (Math.random() - 0.5) * boss.maxR * 0.6,
    r: BOSS_EMBER_R,
    vx: -BOSS_EMBER_SPEED,
    vy: vyDrift,
    rotSeed: Math.random() * 100,
    passed: false
  });
  sfxHazardFire('bossember');
}

function spawnBossChargeBeamTelegraph() {
  if (!boss) return;
  bossChargeBeamCount++;
  const isSuperBeam = bossChargeBeamCount === 8;
  let effThickness;
  if (isSuperBeam) {
    // 56.4% of play height, then 3% more open gap on each side (6% thinner)
    effThickness = (PLAY_BOTTOM - PLAY_TOP) * (0.6 * 0.94 - 0.06);
  } else if (bossChargeBeamCount >= 6) {
    effThickness = BOSS_CHARGE_BEAM_THICKNESS * 4; // shots 6 and 7 -- same, quadruple size
  } else if (bossChargeBeamCount >= 4) {
    effThickness = BOSS_CHARGE_BEAM_THICKNESS * 2;
  } else {
    effThickness = BOSS_CHARGE_BEAM_THICKNESS;
  }
  const targetY = isSuperBeam ? (PLAY_TOP + PLAY_BOTTOM) / 2 : ship.y;
  const warningFrames = isSuperBeam ? BOSS_SUPER_BEAM_TELEGRAPH_DURATION : BOSS_CHARGE_BEAM_TELEGRAPH_DURATION;
  gates.push({
    type: 'bosschargebeamtelegraph',
    lockedY: targetY,
    spawnFrame: frame,
    warningFrames: warningFrames,
    resolved: false,
    thickness: effThickness,
    isSuperBeam: isSuperBeam,
    passed: false
  });
  lastBossChargeBeamSfx = {
    duration: framesToSeconds(warningFrames),
    size: effThickness / BOSS_CHARGE_BEAM_THICKNESS,
    isSuperBeam,
  };
  sfxHazardFire('bosschargebeamtelegraph');
}

function fireBossChargeBeam(lockedY, thickness, isSuperBeam) {
  if (!boss) return;
  stopMegaManCharge(0.03);
  gates.push({
    type: 'bosschargebeam',
    lockedY: lockedY,
    thickness: thickness,
    isSuperBeam: !!isSuperBeam,
    fireDuration: isSuperBeam ? BOSS_SUPER_BEAM_FIRE_DURATION : BOSS_CHARGE_BEAM_FIRE_DURATION,
    spawnFrame: frame,
    passed: false
  });
  lastBossChargeBeamSfx = {
    duration: framesToSeconds(isSuperBeam ? BOSS_SUPER_BEAM_FIRE_DURATION : BOSS_CHARGE_BEAM_FIRE_DURATION),
    size: (thickness || BOSS_CHARGE_BEAM_THICKNESS) / BOSS_CHARGE_BEAM_THICKNESS,
    isSuperBeam: !!isSuperBeam,
  };
  sfxHazardFire('bosschargebeam');
}

// Phase 3 rage pulse: a thin ring of energy expands outward from the
// boss's position at the moment it fires. Center is fixed at spawn
// time rather than tracking the boss's ongoing float -- a shockwave
// detaches from its source. Verified safe with direct math before
// implementation: even at the worst-case radius (where the ring's two
// intersection points with the ship's vertical line merge into one
// band), the remaining safe gap is at least 123px, far above the 33px
// minimum, and the tightest window is preceded by ~1.7s of visible
// telegraph as the ring visibly grows from nothing
function spawnBossRagePulse() {
  if (!boss) return;
  gates.push({
    type: 'bossragepulse', // horizontal-only expanding wall, not a full ring
    x: boss.x,
    y: boss.y, // fixed at the exact moment it originates from the boss -- does not track further boss movement
    spawnFrame: frame,
    passed: false
  });
  sfxHazardFire('bossragepulse');
}

// the wall visually and functionally originates from wherever the
// boss currently is, tracking its live float position rather than
// freezing at spawn time -- otherwise, since the boss floats a large
// ±160px range, a wall could visually drift far from the boss by the
// time it's fully expanded, looking disconnected. the float rate is
// slow and bounded (~4.8px/frame max), so this doesn't reintroduce
// any of the unbounded-rate safety issues from earlier ring designs
function liveRagePulseRadius(g) {
  return (frame - g.spawnFrame) * BOSS_RAGE_PULSE_SPEED;
}

function spawnBossDiagonalRings() {
  if (!boss) return;
  gates.push({
    type: 'bossdiagonalring',
    x: boss.x,
    y: boss.y,
    spawnFrame: frame,
    passed: false
  });
  sfxHazardFire('bossdiagonalring');
}

function liveDiagonalRingRadius(g) {
  return (frame - g.spawnFrame) * BOSS_DIAGONAL_RING_SPEED;
}

function spawnBossDoubleWall() {
  if (!boss) return;
  gates.push({ type: 'bossragepulse', x: boss.x, y: boss.y - BOSS_DOUBLE_WALL_OFFSET, spawnFrame: frame, passed: false });
  bossDoubleWallPendingFrame = frame + BOSS_DOUBLE_WALL_STAGGER;
  sfxHazardFire('bossragepulse');
}

let bossDroneCycleIndex = 0;
function spawnBossDrone() {
  if (!boss) return;
  const yFrac = BOSS_DRONE_FORMATION_YFRACS[bossDroneCycleIndex % BOSS_DRONE_FORMATION_YFRACS.length];
  bossDroneCycleIndex++;
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 20;
  const y = PLAY_TOP + margin + yFrac * Math.max(1, playHeight - margin * 2);
  gates.push({ type: 'bossdrone', x: W + 60, y: y, r: BOSS_DRONE_R, vx: -BOSS_DRONE_SPEED, rotSeed: bossDroneCycleIndex * 2.7, passed: false });
  sfxHazardFire('bossdrone');
}

function spawnBossHomingFragment() {
  if (!boss) return;
  const spawnY = ship.y; // anchored to the ship, not the boss -- otherwise the clamp range could be centered far from wherever the player actually is, making the fragment appear to not track at all
  gates.push({
    type: 'bossdrone',
    x: W + 60,
    y: spawnY,
    spawnY: spawnY,
    r: BOSS_HOMING_FRAGMENT_R,
    vx: BOSS_HOMING_FRAGMENT_VX,
    vy: 0,
    homing: true,
    rotSeed: frame * 0.7,
    passed: false
  });
  sfxHazardFire('bossdrone');
}

function spawnEchoTrailEvent(eventIndex) {
  const th = currentTheme();
  const entry = th.echoTrailEvents[eventIndex];
  gates.push({
    type: 'echotrail',
    x: ship.x + EVENT_SPAWN_OFFSET + entry.zoneWidth / 2,
    zoneWidth: entry.zoneWidth,
    delayFrames: entry.delayFrames,
    dangerThreshold: entry.dangerThreshold,
    rotSeed: eventIndex * 4.4,
    passed: false
  });
}

function empPhaseElapsed(g) {
  return frame - g.spawnFrame;
}

function empIsDischarging(g) {
  const t = empPhaseElapsed(g);
  return t >= g.chargeFrames && t < g.chargeFrames + g.dischargeFrames;
}

function spawnLensingZoneEvent(eventIndex) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 30;
  const entry = th.lensingZoneEvents[eventIndex];

  const y = PLAY_TOP + margin + entry.yFrac * Math.max(1, playHeight - margin * 2);
  gates.push({
    type: 'lensingzone',
    x: ship.x + EVENT_SPAWN_OFFSET + entry.zoneRadius,
    y: y,
    zoneRadius: entry.zoneRadius,
    coreR: entry.coreR,
    rotSeed: eventIndex * 5.1,
    passed: false
  });
}

function spawnSupernovaEvent(eventIndex) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 30;
  const entry = th.supernovaEvents[eventIndex];

  const y = PLAY_TOP + margin + entry.yFrac * Math.max(1, playHeight - margin * 2);
  gates.push({
    type: 'supernova',
    x: ship.x + EVENT_SPAWN_OFFSET + entry.planetR,
    y: y,
    planetR: entry.planetR,
    variant: entry.variant || 'timer',
    dormantFrames: entry.dormantFrames,
    warningFrames: entry.warningFrames,
    spawnFrame: frame,
    onscreenFrame: null,
    detonated: false,
    detonationFrame: null,
    rotSeed: eventIndex * 4.3,
    passed: false
  });
}

function supernovaEffectiveDormant(g) {
  // onscreen variant has no time-based dormant period -- the moment it
  // crosses onto screen IS the trigger, warning starts immediately
  return g.variant === 'onscreen' ? 0 : g.dormantFrames;
}

function supernovaPhaseElapsed(g) {
  if (g.variant === 'onscreen') {
    // hasn't crossed onto screen yet -- treat as not-yet-triggered
    if (g.onscreenFrame === null || g.onscreenFrame === undefined) return -1;
    return frame - g.onscreenFrame;
  }
  return frame - g.spawnFrame;
}

function supernovaIsWarning(g) {
  const t = supernovaPhaseElapsed(g);
  if (t < 0) return false;
  const dormant = supernovaEffectiveDormant(g);
  return t >= dormant && t < dormant + g.warningFrames;
}

function spawnSupernovaDebris(planet) {
  // varied (not perfectly even) angles and speeds for a chaotic explosion
  // feel rather than a clean geometric burst, but still fully authored --
  // no Math.random() in obstacle generation
  const angles = [0.2, 0.9, 1.7, 2.6, 3.4, 4.3, 5.5];
  const speeds = [3.2, 3.4, 3.8, 3.3, 3.5, 3.6, 3.1];
  const sizes = [14, 11, 16, 12, 15, 10, 13];
  for (let i = 0; i < angles.length; i++) {
    gates.push({
      type: 'supernovadebris',
      x: planet.x,
      baseY: planet.y,
      spawnFrame: frame,
      angle: angles[i],
      speed: speeds[i],
      r: sizes[i],
      passed: false
    });
  }
  sfxHazardFire('supernova');
}


function spawnWreckageCluster(x) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const minR = 16, maxR = 30;
  const margin = 28;

  const entry = th.pattern[patternIndex % th.pattern.length];
  patternIndex++;

  for (const w of entry.wreckage) {
    const wx = x + w.xJitter;
    // skip this piece if a door or key already exists nearby -- wreckage
    // spawns continuously and independently, so it needs to check for
    // existing doors/keys itself rather than relying only on the
    // door/key side to check for wreckage
    if (th.movingDoorPattern && gates.some(g => (g.type === 'movingdoor' || g.type === 'specialdoor' || g.type === 'accesskey') && Math.abs(g.x - wx) < 65)) {
      continue;
    }
    gates.push({
      type: 'wreckage',
      x: wx,
      y: PLAY_TOP + margin + w.yFrac * Math.max(1, playHeight - margin * 2),
      r: minR + w.rFrac * (maxR - minR),
      rotSeed: w.xJitter,
      spin: w.rotSpeed,
      passed: false
    });
  }
  return entry.spacing;
}

function spawnLaserGridEvent(eventIndex) {
  const th = currentTheme();
  const entry = th.lasergridEvents[eventIndex];

  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const dividerXRels = entry.dividerXRels;
  const gapYFracs = entry.gapYFracs;
  const gapHeight = entry.gapHeight;
  const gridWidth = dividerXRels[dividerXRels.length - 1] + 40;

  const segments = [];
  const gapInfo = [];
  for (let i = 0; i < dividerXRels.length; i++) {
    const xRel = dividerXRels[i];
    const gapCenterY = PLAY_TOP + gapYFracs[i] * playHeight;
    const gapTop = gapCenterY - gapHeight / 2;
    const gapBottom = gapCenterY + gapHeight / 2;
    if (gapTop > PLAY_TOP) segments.push({ type: 'v', xRel: xRel, y1: PLAY_TOP, y2: gapTop });
    if (gapBottom < PLAY_BOTTOM) segments.push({ type: 'v', xRel: xRel, y1: gapBottom, y2: PLAY_BOTTOM });
    gapInfo.push({ xRel: xRel, gapTop: gapTop, gapBottom: gapBottom });
  }
  // decorative top/bottom caps, framing the structure as a "grid" --
  // explicitly non-collidable (not just carefully positioned) so they
  // can never cause a false wall the way the old horizontal dividers did
  segments.push({ type: 'h', xRel1: 0, xRel2: gridWidth, y: PLAY_TOP + 2, decorative: true });
  segments.push({ type: 'h', xRel1: 0, xRel2: gridWidth, y: PLAY_BOTTOM - 2, decorative: true });

  gates.push({
    type: 'lasergrid',
    x: ship.x + EVENT_SPAWN_OFFSET + gridWidth,
    gridWidth: gridWidth,
    segments: segments,
    gapInfo: gapInfo,
    rotSeed: eventIndex * 5.1,
    passed: false
  });
}

function spawnAsteroidCluster(x) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const minR = 15, maxR = 32;
  const margin = 28;

  const entry = th.pattern[patternIndex % th.pattern.length];
  patternIndex++;

  for (const a of entry.asteroids) {
    gates.push({
      type: 'asteroid',
      x: x + a.xJitter,
      y: PLAY_TOP + margin + a.yFrac * Math.max(1, playHeight - margin * 2),
      r: minR + a.rFrac * (maxR - minR),
      rotSeed: a.xJitter,
      spin: 0.015,
      passed: false
    });
  }
  return entry.spacing;
}

function spawnFireball() {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 24;

  const entry = th.pattern[patternIndex % th.pattern.length];
  patternIndex++;

  const baseY = PLAY_TOP + margin + entry.yFrac * Math.max(1, playHeight - margin * 2);
  gates.push({
    type: 'fireball',
    x: W + 50,
    baseY: baseY,
    r: 10 + entry.rFrac * 12,
    passed: false
  });
  return entry.interval;
}

function spawnExtraFireball() {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 24;

  const entry = th.extraFireballPattern[extraFireballPatternIndex % th.extraFireballPattern.length];
  extraFireballPatternIndex++;

  const baseY = PLAY_TOP + margin + entry.yFrac * Math.max(1, playHeight - margin * 2);
  gates.push({
    type: 'fireball',
    x: W + 50,
    baseY: baseY,
    r: 10 + entry.rFrac * 12,
    passed: false
  });
  return entry.interval;
}

function liveFireballY(g) {
  // straight horizontal line, fixed height -- matches Bowser's fire breath
  // (not the bouncing floor-fire enemy, which is a different thing)
  return g.baseY;
}

function spawnExtraToxicPool() {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 28;

  const entry = th.extraToxicPoolPattern[extraToxicPatternIndex % th.extraToxicPoolPattern.length];
  extraToxicPatternIndex++;

  gates.push({
    type: 'toxicpool',
    x: W + 50,
    y: PLAY_TOP + margin + entry.yFrac * Math.max(1, playHeight - margin * 2),
    baseR: entry.baseRadiusPx,
    pulseAmp: entry.pulseAmpPx,
    pulseFreq: entry.pulseFreq,
    pulsePhase: entry.pulsePhase,
    passed: false
  });
  return entry.interval;
}

function liveToxicPoolRadius(g) {
  return Math.max(4, g.baseR + g.pulseAmp * Math.sin((frame - zoneStartFrame) * g.pulseFreq + g.pulsePhase));
}

function spawnExtraGeyser() {
  const th = currentTheme();

  const entry = th.extraGeyserPattern[extraGeyserPatternIndex % th.extraGeyserPattern.length];
  extraGeyserPatternIndex++;

  gates.push({
    type: 'geyser',
    x: W + 50,
    spawnFrame: frame,
    pivotSide: entry.pivotSide,
    lowHeight: entry.lowHeightPx,
    highHeight: entry.highHeightPx,
    width: entry.widthPx,
    warningFrames: entry.warningFrames,
    riseFrames: entry.riseFrames,
    holdFrames: entry.holdFrames,
    fallFrames: entry.fallFrames,
    restFrames: entry.restFrames,
    phaseOffset: entry.phaseOffset,
    passed: false
  });
  return entry.interval;
}

function geyserCycleLength(g) {
  return g.warningFrames + g.riseFrames + g.holdFrames + g.fallFrames + g.restFrames;
}

function geyserPhase(g) {
  const cycle = geyserCycleLength(g);
  return ((frame - g.spawnFrame + g.phaseOffset) % cycle + cycle) % cycle;
}

function liveGeyserHeight(g) {
  const phase = geyserPhase(g);
  let t = phase;
  if (t < g.warningFrames) return g.lowHeight;
  t -= g.warningFrames;
  if (t < g.riseFrames) return g.lowHeight + (g.highHeight - g.lowHeight) * (t / g.riseFrames);
  t -= g.riseFrames;
  if (t < g.holdFrames) return g.highHeight;
  t -= g.holdFrames;
  if (t < g.fallFrames) return g.highHeight - (g.highHeight - g.lowHeight) * (t / g.fallFrames);
  return g.lowHeight;
}

function geyserIsWarning(g) {
  return geyserPhase(g) < g.warningFrames;
}

function spawnExtraMovingDoor() {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 20;

  const entry = th.movingDoorPattern[extraMovingDoorPatternIndex % th.movingDoorPattern.length];
  extraMovingDoorPatternIndex++;

  const doorX = W + 60;

  // clear any wreckage that already spawned too close to where the door
  // is about to appear -- purely cosmetic (keeps floating rocks from
  // ending up visually on top of the door), done here instead of as a
  // spawn-delaying check so the door's own timing stays deterministic
  gates = gates.filter(g => g.type !== 'wreckage' || Math.abs(g.x - doorX) >= g.r + 45);

  gates.push({
    type: 'movingdoor',
    x: doorX,
    spawnFrame: frame,
    gaps: entry.gaps,
    amplitude: entry.amplitudeFrac * playHeight,
    freq: entry.freq,
    phase: entry.phase,
    width: entry.widthPx,
    margin: margin,
    passed: false
  });
  return entry.interval;
}

function liveDoorOffset(g) {
  return g.amplitude * Math.sin((frame - g.spawnFrame) * g.freq + g.phase);
}

function liveDoorGapRanges(g) {
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const offset = liveDoorOffset(g);
  return g.gaps.map(gap => {
    const centerY = PLAY_TOP + gap.centerFrac * playHeight + offset;
    const halfH = (gap.heightFrac * playHeight) / 2;
    return { top: centerY - halfH, bottom: centerY + halfH };
  });
}

function spawnExtraSparkHub() {
  const th = currentTheme();

  const entry = th.extraSparkHubPattern[extraHubPatternIndex % th.extraSparkHubPattern.length];
  extraHubPatternIndex++;

  const y = entry.mountSide === 'ceiling'
    ? PLAY_TOP + entry.towerLength
    : PLAY_BOTTOM - entry.towerLength;

  gates.push({
    type: 'sparkhub',
    x: W + 60,
    y: y,
    mountSide: entry.mountSide,
    towerLength: entry.towerLength,
    spawnFrame: frame,
    chargeFrames: entry.chargeFrames,
    restFrames: entry.restFrames,
    projectileSpeed: entry.projectileSpeed,
    projectileR: entry.projectileR,
    hasFiredThisCycle: false,
    passed: false
  });
  return entry.interval;
}

function sparkHubCycleLength(g) {
  return g.chargeFrames + g.restFrames;
}

function sparkHubPhase(g) {
  const cycle = sparkHubCycleLength(g);
  return ((frame - g.spawnFrame) % cycle + cycle) % cycle;
}

function sparkHubIsCharging(g) {
  return sparkHubPhase(g) < g.chargeFrames;
}

function fireSparkBurst(hub) {
  const numSpikes = 8;
  for (let i = 0; i < numSpikes; i++) {
    const angle = (i * Math.PI) / 4;
    gates.push({
      type: 'sparkprojectile',
      x: hub.x,
      baseY: hub.y,
      spawnFrame: frame,
      angle: angle,
      speed: hub.projectileSpeed,
      r: hub.projectileR,
      passed: false
    });
  }
  sfxHazardFire('sparkprojectile');
}

function liveProjectilePos(g) {
  const elapsed = frame - g.spawnFrame;
  const radialDist = g.speed * elapsed;
  return {
    x: g.x + Math.cos(g.angle) * radialDist,
    y: g.baseY + Math.sin(g.angle) * radialDist
  };
}

function liveOrbiterPos(g) {
  const elapsed = frame - g.spawnFrame;
  const angle = g.initialAngle + g.angularSpeed * elapsed;
  return {
    x: g.x + Math.cos(angle) * g.orbitRadius,
    y: g.centerY + Math.sin(angle) * g.orbitRadius
  };
}

function spawnKeyAndDoor(eventIndex) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const entry = th.specialDoorEvents[eventIndex];
  const margin = 30;

  const keyX = ship.x + EVENT_SPAWN_OFFSET;
  const keyY = PLAY_TOP + margin + entry.keyYFrac * Math.max(1, playHeight - margin * 2);
  const keyR = 16;
  const doorX = ship.x + EVENT_SPAWN_OFFSET + 500;

  // remove any wreckage that already spawned too close to where the key or
  // door is about to appear -- wreckage generates proactively ahead of the
  // ship, independent of when this event's distance trigger fires, so it
  // can end up sitting on this exact spot before the key ever exists to
  // check against
  gates = gates.filter(g => {
    if (g.type !== 'wreckage') return true;
    const distToKey = Math.hypot(g.x - keyX, g.y - keyY);
    if (distToKey < g.r + keyR + 20) return false;
    if (Math.abs(g.x - doorX) < g.r + 40) return false;
    return true;
  });

  gates.push({
    type: 'accesskey',
    x: keyX,
    y: keyY,
    r: keyR,
    eventIndex: eventIndex,
    passed: false
  });

  gates.push({
    type: 'specialdoor',
    x: doorX,
    width: 34,
    eventIndex: eventIndex,
    passed: false
  });
}

function spawnExtraShootingStar() {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const margin = 30;

  const entry = th.extraShootingStarPattern[extraStarPatternIndex % th.extraShootingStarPattern.length];
  extraStarPatternIndex++;

  const startY = PLAY_TOP + margin + entry.startYFrac * Math.max(1, playHeight - margin * 2);
  const endY = PLAY_TOP + margin + entry.endYFrac * Math.max(1, playHeight - margin * 2);

  // guarantee the diagonal motion continues until the star has actually
  // scrolled off-screen (never pops out mid-flight), regardless of the
  // current viewport width -- computed dynamically rather than relying on
  // pattern data being tuned for one assumed screen size
  const effScroll = SCROLL_SPEED * (th.scrollMult || 1);
  const spawnX = W + 60;
  const minLifeForOffscreen = (spawnX + 80 + entry.radiusPx) / effScroll;
  const life = Math.max(entry.lifeFrames, minLifeForOffscreen);

  gates.push({
    type: 'shootingstar',
    x: spawnX,
    spawnFrame: frame,
    startY: startY,
    endY: endY,
    life: life,
    r: entry.radiusPx,
    passed: false
  });
  return entry.interval;
}

function liveShootingStarY(g) {
  const t = Math.min(1, (frame - g.spawnFrame) / g.life);
  // pure straight-line diagonal, no arc/curve
  return g.startY + (g.endY - g.startY) * t;
}

function shootingStarDone(g) {
  return (frame - g.spawnFrame) >= g.life;
}

function spawnAcidDrip(x) {
  const th = currentTheme();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;

  const entry = th.pattern[patternIndex % th.pattern.length];
  patternIndex++;

  // fall speed is derived from how far this drip actually needs to travel
  // to reach the ship, not a fixed value -- this guarantees it's still
  // genuinely mid-fall (not already culled) by the time it arrives,
  // regardless of exactly where along the spacing chain it happened to spawn
  const effScroll = SCROLL_SPEED * (th.scrollMult || 1);
  const distanceToShip = Math.max(100, x - ship.x);
  const framesToReachShip = distanceToShip / effScroll;
  const fallSpeed = (playHeight * entry.targetFallFrac) / framesToReachShip;

  gates.push({
    type: 'aciddrip',
    x: x,
    startY: PLAY_TOP,
    spawnFrame: frame,
    fallSpeed: fallSpeed,
    r: entry.radiusPx,
    passed: false
  });
  return entry.spacing;
}

function liveAcidDripY(g) {
  return g.startY + g.fallSpeed * (frame - g.spawnFrame);
}

const EDITOR_LEVEL_LENGTH = 3200;
const EDITOR_SAMPLE_SPACING = 20;
const EDITOR_MIN_GAP_FRAC = 0.12;

let customTerrainZone2 = null;
let useCustomTerrain = false;
let terrainLevelX = 0;

function defaultCustomTerrain() {
  const n = Math.floor(EDITOR_LEVEL_LENGTH / EDITOR_SAMPLE_SPACING) + 1;
  const arr = [];
  for (let i = 0; i < n; i++) arr.push({ topFrac: 0.2, bottomFrac: 0.8 });
  return arr;
}

async function loadCustomTerrain() {
  try {
    const result = await window.storage.get('zone4-terrain-custom');
    if (result && result.value) {
      customTerrainZone2 = JSON.parse(result.value);
      useCustomTerrain = true;
    } else {
      customTerrainZone2 = defaultCustomTerrain();
      useCustomTerrain = false;
    }
  } catch (e) {
    customTerrainZone2 = defaultCustomTerrain();
    useCustomTerrain = false;
  }
}

async function saveCustomTerrain() {
  try {
    await window.storage.set('zone4-terrain-custom', JSON.stringify(customTerrainZone2));
    useCustomTerrain = true;
    return true;
  } catch (e) {
    return false;
  }
}

function sampleCustomTerrain(levelX) {
  const n = customTerrainZone2.length;
  const idxF = (levelX / EDITOR_SAMPLE_SPACING) % (n - 1);
  const i0 = Math.floor(idxF);
  const i1 = (i0 + 1) % n;
  const t = idxF - i0;
  const a = customTerrainZone2[i0], b = customTerrainZone2[i1];
  return {
    topFrac: a.topFrac + (b.topFrac - a.topFrac) * t,
    bottomFrac: a.bottomFrac + (b.bottomFrac - a.bottomFrac) * t
  };
}

function initTerrain() {
  const th = currentTheme();
  const spacing = th.terrainSpacing || 34;
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  // start fully open no matter where the ship enters vertically -- the existing
  // entry ramp (see addTerrainSegment) then funnels this down to the real cave width
  const wideGap = playHeight * 0.9;
  const minCenter = PLAY_TOP + wideGap / 2;
  const maxCenter = PLAY_BOTTOM - wideGap / 2;
  const startCenter = Math.max(minCenter, Math.min(maxCenter, ship.y));
  const startTop = startCenter - wideGap / 2;
  const startBottom = startCenter + wideGap / 2;

  terrainSegments = [];
  terrainSegmentsSinceEntry = 0;
  patternIndex = 0;
  terrainLevelX = 0;
  terrainWaypointTarget = null;
  terrainWaypointSegLeft = 0;
  terrainWaypointGapTarget = null;
  terrainWaypointIslandTarget = 0;
  for (let x = -spacing; x <= W + spacing; x += spacing) {
    terrainSegments.push({ x, topY: startTop, bottomY: startBottom, islandTop: startCenter, islandBottom: startCenter });
    terrainSegmentsSinceEntry++;
  }
}

function addTerrainSegment() {
  const th = currentTheme();
  const spacing = th.terrainSpacing || 34;
  const last = terrainSegments[terrainSegments.length - 1];
  const margin = 20;
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  terrainSegmentsSinceEntry++;
  terrainLevelX += spacing;

  // flat, fully-open runway for the first few segments after entering the zone,
  // then ramp toward the target shape over the following segments
  const rampFactor = Math.max(0, Math.min(1, (terrainSegmentsSinceEntry - 4) / 11));

  let targetTop, targetBottom, targetIslandTop, targetIslandBottom;
  if (useCustomTerrain && th.obstacleShape === 'terrain' && customTerrainZone2) {
    const loopX = terrainLevelX % EDITOR_LEVEL_LENGTH;
    const sample = sampleCustomTerrain(loopX);
    targetTop = PLAY_TOP + sample.topFrac * playHeight;
    targetBottom = PLAY_TOP + sample.bottomFrac * playHeight;
    targetIslandTop = (targetTop + targetBottom) / 2;
    targetIslandBottom = targetIslandTop; // custom hand-drawn levels don't support forks yet
  } else {
    const baseGap = currentGapSize();

    if (portalObject) {
      // funnel wide open for a clean run into the portal, instead of
      // continuing to generate normal (possibly tight) cave shape
      const wideGap = playHeight * 0.9;
      const lastCenter = (last.topY + last.bottomY) / 2;
      const minCenter = PLAY_TOP + wideGap / 2;
      const maxCenter = PLAY_BOTTOM - wideGap / 2;
      const target = Math.max(minCenter, Math.min(maxCenter, lastCenter));
      const nextCenter = lastCenter + (target - lastCenter) * 0.35;
      targetTop = nextCenter - wideGap / 2;
      targetBottom = nextCenter + wideGap / 2;
      targetIslandTop = nextCenter;
      targetIslandBottom = nextCenter;
    } else {

    // pathing analysis: figure out how fast the ship can actually climb/dive
    // (in px per segment, at this theme's physics and scroll speed), then spread
    // each waypoint transition across enough segments to stay within that limit
    const effScroll = SCROLL_SPEED * (th.scrollMult || 1);
    const framesPerSegment = spacing / effScroll;
    const maxClimbSpeed = Math.abs(MAX_RISE_SPEED * th.liftMult);
    const maxDiveSpeed = MAX_FALL_SPEED * th.gravityMult;
    const safetyFactor = 0.55; // leave headroom for reaction time, not just raw capability
    const maxDeltaPerSegment = Math.min(maxClimbSpeed, maxDiveSpeed) * framesPerSegment * safetyFactor;

    if (terrainWaypointSegLeft <= 0) {
      const entry = th.pattern[patternIndex % th.pattern.length];
      patternIndex++;

      const gapMult = entry.gapMult !== undefined ? entry.gapMult : 1;
      const entryGap = baseGap * gapMult;
      const minCenter = PLAY_TOP + entryGap / 2 + margin;
      const maxCenter = PLAY_BOTTOM - entryGap / 2 - margin;
      const rawTarget = PLAY_TOP + entry.centerFrac * playHeight;
      terrainWaypointTarget = Math.max(minCenter, Math.min(maxCenter, rawTarget));
      terrainWaypointGapTarget = entryGap;

      if (entry.fork) {
        // island thickness as a fraction of THIS waypoint's gap, capped so both
        // resulting paths always keep a comfortable, independently-flyable width
        const islandFrac = Math.min(0.45, entry.fork.islandFrac || 0.3);
        terrainWaypointIslandTarget = Math.max(0, entryGap * islandFrac - SHIP_H * 2);
      } else {
        terrainWaypointIslandTarget = 0;
      }

      const lastCenter = (last.topY + last.bottomY) / 2;
      const fullDelta = Math.abs(terrainWaypointTarget - lastCenter);
      terrainWaypointSegLeft = Math.max(1, Math.ceil(fullDelta / Math.max(1, maxDeltaPerSegment)));
    }

    const lastCenter = (last.topY + last.bottomY) / 2;
    const lastGap = last.bottomY - last.topY;
    const lastIsland = last.islandBottom - last.islandTop;

    const centerStep = (terrainWaypointTarget - lastCenter) / terrainWaypointSegLeft;
    const gapStep = (terrainWaypointGapTarget - lastGap) / terrainWaypointSegLeft;
    const islandStep = (terrainWaypointIslandTarget - lastIsland) / terrainWaypointSegLeft;

    const nextCenter = lastCenter + centerStep;
    const nextGap = lastGap + gapStep;
    const nextIsland = Math.max(0, lastIsland + islandStep);
    terrainWaypointSegLeft--;

    targetTop = nextCenter - nextGap / 2;
    targetBottom = nextCenter + nextGap / 2;
    targetIslandTop = nextCenter - nextIsland / 2;
    targetIslandBottom = nextCenter + nextIsland / 2;
    }
  }

  // safety clamp: keep a minimum gap and stay within the play area
  const minGapPx = EDITOR_MIN_GAP_FRAC * playHeight;
  if (targetBottom - targetTop < minGapPx) {
    const mid = (targetTop + targetBottom) / 2;
    targetTop = mid - minGapPx / 2;
    targetBottom = mid + minGapPx / 2;
  }
  targetTop = Math.max(PLAY_TOP + margin, targetTop);
  targetBottom = Math.min(PLAY_BOTTOM - margin, targetBottom);

  // safety clamp: if a fork's island would leave either path too narrow to fly, shrink the island
  const minPathPx = minGapPx * 1.1;
  if (targetIslandBottom > targetIslandTop) {
    const upperPath = targetIslandTop - targetTop;
    const lowerPath = targetBottom - targetIslandBottom;
    if (upperPath < minPathPx || lowerPath < minPathPx) {
      const islandCenter = (targetIslandTop + targetIslandBottom) / 2;
      const maxIslandHeight = Math.max(0, (targetBottom - targetTop) - minPathPx * 2);
      const halfIsland = maxIslandHeight / 2;
      targetIslandTop = islandCenter - halfIsland;
      targetIslandBottom = islandCenter + halfIsland;
    }
  }

  const nextTop = last.topY + (targetTop - last.topY) * rampFactor;
  const nextBottom = last.bottomY + (targetBottom - last.bottomY) * rampFactor;
  const lastIslandCenter = (last.islandTop + last.islandBottom) / 2;
  const nextIslandTop = lastIslandCenter + (targetIslandTop - lastIslandCenter) * rampFactor;
  const nextIslandBottom = lastIslandCenter + (targetIslandBottom - lastIslandCenter) * rampFactor;
  terrainSegments.push({
    x: last.x + spacing,
    topY: nextTop,
    bottomY: nextBottom,
    islandTop: nextIslandTop,
    islandBottom: nextIslandBottom
  });
}

function terrainBoundsAt(x) {
  for (let i = 0; i < terrainSegments.length - 1; i++) {
    const a = terrainSegments[i], b = terrainSegments[i + 1];
    if (x >= a.x && x <= b.x) {
      const t = (x - a.x) / (b.x - a.x);
      return {
        top: a.topY + (b.topY - a.topY) * t,
        bottom: a.bottomY + (b.bottomY - a.bottomY) * t,
        islandTop: a.islandTop + (b.islandTop - a.islandTop) * t,
        islandBottom: a.islandBottom + (b.islandBottom - a.islandBottom) * t
      };
    }
  }
  return null;
}

function liveGateGap(gate) {
  const theme = currentTheme();
  const baseGap = currentGapSize();
  if (!theme.pulseGap) return baseGap;
  const amp = baseGap * theme.pulseAmpFrac;
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const minGap = Math.max(50, baseGap * (1 - theme.pulseAmpFrac));
  const maxGap = Math.min(playHeight - 40, baseGap * (1 + theme.pulseAmpFrac));
  let g = baseGap + amp * Math.sin((frame - zoneStartFrame) * gate.pulseFreq + gate.pulsePhase);
  return Math.max(minGap, Math.min(maxGap, g));
}

function diamondGeometry(gate) {
  const radius = liveGateGap(gate) / 2;
  const centerX = gate.x + GATE_WIDTH / 2;
  const centerY = liveGateCenter(gate);
  return { radius, centerX, centerY };
}

function liveGateCenter(gate) {
  const gap = liveGateGap(gate);
  const margin = 20;
  const minCenter = PLAY_TOP + gap / 2 + margin;
  const maxCenter = PLAY_BOTTOM - gap / 2 - margin;
  let c = gate.baseCenter + gate.amplitude * Math.sin((frame - zoneStartFrame) * gate.freq + gate.phase);
  return Math.max(minCenter, Math.min(maxCenter, c));
}

function initBackgroundParticles(theme) {
  bgParticles = [];
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  if (theme.bgStyle === 'matrix') {
    for (let i = 0; i < 50; i++) {
      bgParticles.push({
        x: Math.random() * W,
        y: PLAY_TOP + Math.random() * playHeight,
        speed: 1.5 + Math.random() * 3.5,
        len: 20 + Math.random() * 50,
        alpha: 0.3 + Math.random() * 0.6
      });
    }
  } else if (theme.bgStyle === 'stars') {
    for (let i = 0; i < 90; i++) {
      bgParticles.push({
        x: Math.random() * W,
        y: PLAY_TOP + Math.random() * playHeight,
        r: 0.6 + Math.random() * 1.8,
        alpha: 0.3 + Math.random() * 0.7,
        speed: 0.3 + Math.random() * 1.4
      });
    }
  } else if (theme.bgStyle === 'embers') {
    for (let i = 0; i < 60; i++) {
      bgParticles.push({
        x: Math.random() * W,
        y: PLAY_TOP + Math.random() * playHeight,
        r: 1 + Math.random() * 2.2,
        alpha: 0.3 + Math.random() * 0.6,
        speed: 0.4 + Math.random() * 1.2,
        drift: (Math.random() - 0.5) * 0.6
      });
    }
  } else if (theme.bgStyle === 'ruins') {
    for (let i = 0; i < 45; i++) {
      bgParticles.push({
        x: Math.random() * W,
        y: PLAY_TOP + Math.random() * playHeight,
        r: 0.8 + Math.random() * 1.8,
        alpha: 0.2 + Math.random() * 0.4,
        speed: 0.15 + Math.random() * 0.4,
        drift: (Math.random() - 0.5) * 0.3
      });
    }
  } else if (theme.bgStyle === 'toxic') {
    for (let i = 0; i < 50; i++) {
      bgParticles.push({
        x: Math.random() * W,
        y: PLAY_TOP + Math.random() * playHeight,
        r: 1 + Math.random() * 2.5,
        alpha: 0.2 + Math.random() * 0.35,
        speed: 0.2 + Math.random() * 0.5,
        drift: (Math.random() - 0.5) * 0.4
      });
    }
  } else if (theme.bgStyle === 'station') {
    for (let i = 0; i < 40; i++) {
      bgParticles.push({
        x: Math.random() * W,
        y: PLAY_TOP + Math.random() * playHeight,
        r: 0.6 + Math.random() * 1.6,
        alpha: 0.15 + Math.random() * 0.3,
        speed: 0.1 + Math.random() * 0.3,
        drift: (Math.random() - 0.5) * 0.5
      });
    }
  } else if (theme.bgStyle === 'void') {
    for (let i = 0; i < 22; i++) {
      bgParticles.push({
        x: Math.random() * W,
        y: PLAY_TOP + Math.random() * playHeight,
        r: 0.4 + Math.random() * 1.0,
        alpha: 0.08 + Math.random() * 0.18,
        speed: 0.05 + Math.random() * 0.15,
        drift: 0
      });
    }
  } else if (theme.bgStyle === 'storm') {
    for (let i = 0; i < 70; i++) {
      bgParticles.push({
        x: Math.random() * W,
        y: PLAY_TOP + Math.random() * playHeight,
        speed: 5 + Math.random() * 6,
        len: 15 + Math.random() * 20,
        alpha: 0.2 + Math.random() * 0.4
      });
    }
  }
}

function reseedZoneObstacles(startX) {
  gates = [];
  shipYHistory = [];
  patternIndex = 0;
  fireballSpawnCounter = 0;
  extraFireballCounter = 0;
  extraFireballPatternIndex = 0;
  extraToxicCounter = 0;
  extraToxicPatternIndex = 0;
  extraGeyserCounter = 0;
  extraGeyserPatternIndex = 0;
  extraStarCounter = 0;
  extraStarPatternIndex = 0;
  extraMovingDoorCounter = 0;
  extraMovingDoorPatternIndex = 0;
  specialEventsSpawned = [false, false, false];
  specialDoorUnlocked = [false, false, false];
  blackHoleEventsSpawned = currentTheme().blackHoleEvents ? currentTheme().blackHoleEvents.map(() => false) : [];
  windVortexEventsSpawned = currentTheme().windVortexEvents ? currentTheme().windVortexEvents.map(() => false) : [];
  cloudArcEventsSpawned = currentTheme().cloudArcEvents ? currentTheme().cloudArcEvents.map(() => false) : [];
  lasergridEventsSpawned = currentTheme().lasergridEvents ? currentTheme().lasergridEvents.map(() => false) : [];
  droneSwarmEventsSpawned = currentTheme().droneSwarmEvents ? currentTheme().droneSwarmEvents.map(() => false) : [];
  billboardEventsSpawned = currentTheme().billboardEvents ? currentTheme().billboardEvents.map(() => false) : [];
  searchlightEventsSpawned = currentTheme().searchlightEvents ? currentTheme().searchlightEvents.map(() => false) : [];
  turretEventsSpawned = currentTheme().turretEvents ? currentTheme().turretEvents.map(() => false) : [];
  signalCorruptionEventsSpawned = currentTheme().signalCorruptionEvents ? currentTheme().signalCorruptionEvents.map(() => false) : [];
  empEventsSpawned = currentTheme().empEvents ? currentTheme().empEvents.map(() => false) : [];
  echoTrailEventsSpawned = currentTheme().echoTrailEvents ? currentTheme().echoTrailEvents.map(() => false) : [];
  pulsingOrbEventsSpawned = currentTheme().pulsingOrbEvents ? currentTheme().pulsingOrbEvents.map(() => false) : [];
  boomerangEventsSpawned = currentTheme().boomerangEvents ? currentTheme().boomerangEvents.map(() => false) : [];
  extraStormCounter = 0;
  extraStormPatternIndex = 0;
  extraOrbiterCounter = 0;
  extraOrbiterPatternIndex = 0;
  extraArcPlanetCounter = 0;
  extraArcPlanetPatternIndex = 0;
  lensingZoneEventsSpawned = currentTheme().lensingZoneEvents ? currentTheme().lensingZoneEvents.map(() => false) : [];
  supernovaEventsSpawned = currentTheme().supernovaEvents ? currentTheme().supernovaEvents.map(() => false) : [];
  extraHubCounter = 0;
  extraHubPatternIndex = 0;
  if (currentTheme().obstacleShape === 'terrain') {
    initTerrain();
  } else if (currentTheme().obstacleShape !== 'none') {
    let x = startX;
    for (let i = 0; i < 6; i++) {
      if (i > 0) {
        const th0 = currentTheme();
        x += th0.pattern[patternIndex % th0.pattern.length].spacing || GATE_SPACING;
      }
      spawnGate(x);
      lastSpawnX = x;
    }
  }
  if (currentTheme().isBossZone) {
    miniBoss = null;
    const bossBaseY = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * 0.5;
    const bossMaxR = (PLAY_BOTTOM - PLAY_TOP) * 0.22;
    // fixed distance from the ship, calibrated to match Claude's preview
    // width -- not a proportion of W, which would grow the gap on wider
    // screens. clamped so narrower windows can't push the boss's sphere
    // off the right edge of the screen
    const bossFinalX = Math.min(ship.x + 415, W - bossMaxR - 40);
    const fragmentCount = 8;
    const fragments = [];
    for (let i = 0; i < fragmentCount; i++) {
      const angle = (i / fragmentCount) * Math.PI * 2;
      const dist = 280 + 60 * Math.sin(i * 2.7); // deterministic variation, not random
      fragments.push({
        startX: bossFinalX + Math.cos(angle) * dist,
        startY: bossBaseY + Math.sin(angle) * dist,
        size: 8 + 4 * Math.sin(i * 1.9)
      });
    }
    boss = {
      x: bossFinalX,
      y: bossBaseY,
      baseY: bossBaseY,
      maxR: bossMaxR,
      r: 0,
      fragments: fragments
    };
    bossSpawnFrame = frame;
    bossTimer = currentTheme().bossDuration;
    bossPhase = 1;
    bossDefeated = false;
    bossDefeatFrame = 0;
    bossAttackTimer = 0;
    bossVolleyTimer = 0;
    bossTransitioning = false;
    bossTransitionStartFrame = 0;
    bossTransitionEndFrame = -9999;
    bossWaitingForClear = false;
    bossWaitingForClearStartFrame = -1;
    bossRagePulseTimer = 0;
    bossDiagonalRingTimer = 0;
    bossDoubleWallTimer = 0;
    bossDoubleWallPendingFrame = -1;
    bossDroneFormationTimer = 0;
    bossHomingFragmentTimer = 0;
    bossChargeBeamTimer = 0;
    bossChargeBeamNextGap = BOSS_CHARGE_BEAM_MIN_GAP + Math.floor(Math.random() * (BOSS_CHARGE_BEAM_MAX_GAP - BOSS_CHARGE_BEAM_MIN_GAP + 1));
    bossChargeBeamCount = 0;
    bossEmberTimer = 0;
    bossAshCloudTimer = 0;
    bossBeamHoldBlendStartFrame = -9999;
    bossFinalChargeActive = false;
    bossFinalChargeStartFrame = -1;
    bossExplosionActive = false;
    bossExplosionStartFrame = -1;
    postBossDowntimeActive = false;
    postBossDowntimeStartFrame = -1;
    shipFlyOffActive = false;
    shipFlyOffStartFrame = -1;
    bossFullyDefeated = false;
  } else if (currentTheme().isMiniBossZone) {
    boss = null;
    // undo any escape-run mutations left over from a previous playthrough
    // in this session (theme objects persist across resetGame calls)
    const th = currentTheme();
    th.obstacleShape = 'none';
    th.pattern = [{ spacing: 100000 }];
    delete th.scrollMult;
    delete th.ampMult;
    delete th.freqMult;
    delete th.pulseGap;
    delete th.gapFractionStart;
    delete th.gapConstant;
    delete th.terrainSpacing;
    delete th.terrainMaxDelta;
    const miniBaseY = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * 0.5;
    const miniBossMaxR = (PLAY_BOTTOM - PLAY_TOP) * 0.16 * 0.85; // 15% smaller
    // fixed distance from the ship, calibrated to match Claude's preview
    // width -- not a proportion of W, which would grow the gap on wider
    // screens (same issue as the main boss). clamped so narrow windows
    // can't push it off the right edge
    const miniRestX = th.miniBossVariant === 'core'
      ? Math.min(ship.x + 588, W - 84) // wall boss sits at the arena edge, not mid-arena
      : Math.min(ship.x + 366, W - miniBossMaxR - 40);
    miniBoss = {
      x: W + 120, // starts off-screen, flies in during the entrance
      restX: miniRestX,
      y: miniBaseY,
      baseY: miniBaseY,
      maxR: miniBossMaxR,
      r: 0
    };
    miniBossSpawnFrame = frame;
    miniBossDefeated = false;
    miniBossDefeatFrame = 0;
    miniBossWallRecedeStartFrame = -1;
    miniBossAttackState = th.miniBossVariant === 'core' ? 'coreFloating' : 'floating';
    miniBossAttackStateStartFrame = 0;
    miniBossChargeHeights = [0.2, 0.5, 0.8];
    miniBossChargeIndex = 0;
    miniBossChargeRound = 1;
    miniBossHadFirstFloat = false;
    miniBossNextAttackSet = 1;
    miniBossCyclesCompleted = 0;
    miniBossBarrageEmbers = [];
    miniBossBarrageWavesLaunched = 0;
    miniBossDeathPatches = [];
    miniBossDeathAshParticles = [];
    miniBossWallCracks = [];
    coreWallPanels = [];
    coreWallSensors = [];
    miniBossEscapeRunActive = false;
    coreBossPhase = 1;
    coreBossHadFirstFloat = false;
    coreBossDefeated = false;
    coreBossDefeatFrame = 0;
    coreSparks = [];
    coreEmpPulses = [];
    coreCrossfireRound = 0;
    coreCrossfireBeamYs = [];
    lastCoreCrossfireVolleyFrame = -999;
    coreOrbitSpawned = 0;
    coreOrbitProjectiles = [];
    coreOrbitEmitAngle = 0;
    coreEyeBeamState = 'track';
    coreEyeBeamStateStartFrame = 0;
    coreTeslaState = 'charging';
    coreTeslaStateStartFrame = 0;
    coreTeslaProjectiles = [];
    coreGateOpenAmount = 0;
    coreDeathPatches = [];
    coreDeathDebris = [];
  } else {
    boss = null;
    miniBoss = null;
  }
}

// maps a death count to its rank tier letter -- shared by the
// achievement-granting logic below and the victory screen's own display
function rankTierForDeaths(deaths) {
  if (deaths <= 3) return 'S';
  if (deaths <= 9) return 'A';
  if (deaths <= 14) return 'B+';
  if (deaths <= 18) return 'B';
  return 'C';
}
const RANK_TIER_ORDER = ['S', 'A', 'B+', 'B', 'C']; // best to worst
const RANK_TIER_HINTS = {
  S: '0-3 deaths',
  A: '4-9 deaths',
  'B+': '10-14 deaths',
  B: '15-18 deaths',
  C: '19+ deaths'
};

function triggerVictory() {
  if (isPracticeRun) {
    endPracticeRun();
    return;
  }
  stopLiftSound();
  stopGlowDangerSound();
  stopFireballBreathSound();
  stopToxicHazardSounds();
  stopDustStormSound();
  stopMeteorStreakSound();
  stopStormSkiesHazardSounds();
  stopMovingDoorSound();
  stopBlackHoleSound();
  sfxVictory();
  state = 'victory';
  clearTimeMs = nowMs() - runStartTimeMs;
  if (devSessionActive) return; // dev preview only -- screen still displays, nothing gets recorded
  let profileChanged = false;
  if (!completedZones.has(themeIndex)) {
    completedZones.add(themeIndex);
    profileChanged = true;
  }
  zoneCompletionCounts[themeIndex] = (zoneCompletionCounts[themeIndex] || 0) + 1;
  profileChanged = true;
  if (selectedDifficulty !== 'easy' && !diedInCurrentZone && !deathlessZones.has(themeIndex)) {
    deathlessZones.add(themeIndex);
    profileChanged = true;
  }
  if (!beatenDifficulties.has(selectedDifficulty)) {
    beatenDifficulties.add(selectedDifficulty);
    profileChanged = true;
  }
  // earning a given rank tier also grants every tier below it (e.g. B
  // Rank also unlocks the C Rank achievement), since a better rank always
  // satisfies a worse tier's requirement too
  const earnedTierIdx = RANK_TIER_ORDER.indexOf(rankTierForDeaths(totalDeaths));
  for (let i = earnedTierIdx; i < RANK_TIER_ORDER.length; i++) {
    const tier = RANK_TIER_ORDER[i];
    if (!achievedRanks.has(tier)) {
      achievedRanks.add(tier);
      profileChanged = true;
    }
  }
  if ((selectedDifficulty === 'normal' || selectedDifficulty === 'hard') && !extraDifficultyUnlocked) {
    extraDifficultyUnlocked = true;
    justUnlockedExtraDifficulty = true;
    profileChanged = true;
  }
  if (profileChanged) savePlayerProfile();
  if (justUnlockedExtraDifficulty) sfxOverdriveUnlock();
}

function resetGame() {
  ship = { x: W * 0.28, y: H / 2, vy: 0, rotation: 0 };
  distance = 0;
  frame = 0;
  holding = false;
  stopLiftSound();
  stopGlowDangerSound();
  stopFireballBreathSound();
  stopToxicHazardSounds();
  stopDustStormSound();
  stopMeteorStreakSound();
  stopStormSkiesHazardSounds();
  stopMovingDoorSound();
  stopBlackHoleSound();
  stopMoltenCoreIdleSound();
  stopMoltenFlameWallSound();
  stopMoltenSqueezeSound();
  stopMoltenDeathAshSound();
  stopCoreBulkheadHoldSound();
  stopAllPulsingOrbSounds();
  stopAllBoomerangSounds();
  stopMegaManCharge(0.02);
  stopSignalFinalCharge(0.02);
  stopCoreOverload(0.02);
  stopSignalPhase(0.04);
  state = 'ready';
  themeIndex = 0;
  themeLevelReached = 0;
  warpActive = false;
  warpTimer = 0;
  const diffConfig = DIFFICULTY_CONFIG[selectedDifficulty] || DIFFICULTY_CONFIG.normal;
  MAX_LIVES = diffConfig.lives;
  continuesRemaining = diffConfig.continues;
  invincibilityEndTime = -1;
  freeHitCooldownEndTime = -1;
  pendingRespawnMercyEligible = false;
  diedInCurrentZone = false;
  lives = MAX_LIVES;
  maxDistanceReached = 0;
  zoneStartDistance = 0;
  zoneStartFrame = 0;
  portalObject = null;
  totalDeaths = 0;
  deathsByZone = {};
  runStartTimeMs = nowMs();
  clearTimeMs = 0;
  justUnlockedExtraDifficulty = false;
  isPracticeRun = false;
  devSessionActive = false;
  bossFinalChargeActive = false;
  bossFinalChargeStartFrame = -1;
  bossExplosionActive = false;
  bossExplosionStartFrame = -1;
  postBossDowntimeActive = false;
  postBossDowntimeStartFrame = -1;
  shipFlyOffActive = false;
  shipFlyOffStartFrame = -1;
  bossFullyDefeated = false;
  bossDefeated = false;
  miniBossEscapeRunActive = false;
  shipTrailParticles = [];
  shipToxicDrips = [];
  shipToxicDripCooldown = 0;

  initBackgroundParticles(currentTheme());
  reseedZoneObstacles(ship.x + 420);
}

function respawnInZone(opts) {
  ship = { x: W * 0.28, y: H / 2, vy: 0, rotation: 0 };
  distance = zoneStartDistance;
  holding = false;
  stopLiftSound();
  stopGlowDangerSound();
  stopFireballBreathSound();
  stopToxicHazardSounds();
  stopDustStormSound();
  stopMeteorStreakSound();
  stopStormSkiesHazardSounds();
  stopMovingDoorSound();
  stopBlackHoleSound();
  if (!opts || opts.playLifeLost !== false) sfxLifeLost();
  state = 'respawn';
  portalObject = null;
  invincibilityEndTime = -1;
  freeHitCooldownEndTime = -1;
  initBackgroundParticles(currentTheme());
  reseedZoneObstacles(ship.x + 420);
}

function beginRunFromOptions() {
  resetGame(); // locks in MAX_LIVES/continuesRemaining for the chosen difficulty
  sfxStart();
  holding = false;
  beginWarp(0);
  state = 'playing';
  lastRenderedOverlayState = null;
  updateOverlay();
}

function startPress() {
  if (state === 'home') {
    state = 'options';
    updateOverlay();
  } else if (state === 'options') {
    beginRunFromOptions();
  } else if (state === 'ready') {
    state = 'playing';
  } else if (state === 'respawn') {
    sfxRespawn();
    state = 'playing';
    if (pendingRespawnMercyEligible && DIFFICULTY_CONFIG[selectedDifficulty]?.invincibilityFrames) {
      invincibilityEndTime = nowMs() + INVINCIBILITY_DURATION_MS;
    }
    pendingRespawnMercyEligible = false;
  } else if (state === 'gameover' || state === 'victory') {
    resetGame();
    state = 'home';
    return;
  }
  holding = true;
}

function endPress() {
  holding = false;
}

// cycles the selected difficulty in either direction, skipping over the
// 4th tier while it's still locked so it can never be landed on by cycling
function cycleDifficulty(direction) {
  const order = ['easy', 'normal', 'hard', 'extra'];
  let idx = order.indexOf(selectedDifficulty);
  do {
    idx = (idx + direction + order.length) % order.length;
  } while (order[idx] === 'extra' && !extraDifficultyUnlocked);
  selectedDifficulty = order[idx];
  updateOverlay();
}

// pause/resume: deliberately kept off the normal hold-to-fly input (mouse
// click, space, touch) so a misclick or accidental tap during play can
// never trigger it -- only the dedicated pause button or the Escape key
function pauseGame() {
  if (state !== 'playing') return;
  state = 'paused';
  holding = false; // don't carry a stale "still holding" into the pause screen
  stopLiftSound();
  stopGlowDangerSound();
  sfxPause();
}

function resumeGame() {
  if (state !== 'paused') return;
  state = 'playing';
}

function quitToHome() {
  if (isPracticeRun) {
    endPracticeRun();
    return;
  }
  resetGame();
  state = 'home';
  savePlayerProfile();
}

function endPracticeRun() {
  const returnZone = practiceZoneIndex;
  isPracticeRun = false;
  resetGame();
  zoneSelectPreviewIdx = unlockedZones.has(returnZone) ? returnZone : 0;
  state = 'zone-select';
  lastRenderedOverlayState = null;
  updateOverlay();
}

function startPracticeZone(zoneIndex) {
  if (!unlockedZones.has(zoneIndex)) return; // shouldn't be reachable via the UI anyway, since locked zones aren't clickable
  resetGame(); // sets isPracticeRun=false, lives/continues based on selectedDifficulty
  isPracticeRun = true;
  practiceZoneIndex = zoneIndex;
  distance = 0;
  themeLevelReached = 0;
  sfxStart();
  beginWarp(zoneIndex);
  state = 'playing';
}

// continue-prompt: consumes a continue, resets lives, and respawns in
// place -- distance/zone/theme progress is deliberately preserved, since
// that's what distinguishes a continue from starting a fresh run
function useContinue() {
  if (state !== 'continue-prompt' || continuesRemaining <= 0) return;
  continuesRemaining--;
  lives = MAX_LIVES;
  sfxContinueUsed();
  respawnInZone({ playLifeLost: false }); // sets state to 'respawn' for the usual "click to continue" beat
}

// options screen: difficulty cycling and navigating to/from the Settings
// and Achievements sub-screens. Event delegation since this content is
// re-created via innerHTML each time updateOverlay() renders.
// Uses pointerup rather than click -- pointer events unify mouse, touch,
// and pen handling and don't depend on the browser synthesizing a 'click'
// event afterward, which has had reliability quirks on some mobile
// browsers/webviews, especially combined with CSS transitions on the target.
function handleOverlayActivate(e) {
  if (e && e.type === 'click' && performance.now() < overlayNavLockUntil) return;
  if (e && e.type !== 'click' && e.pointerType === 'mouse' && e.button !== 0) return;
  if (state === 'home') {
    unlockAudio();
    try { sfxUiClick(); } catch (err) { /* audio must never block the menu */ }
    overlayNavLockUntil = performance.now() + 400;
    state = 'options';
    updateOverlay();
    return;
  }
  if (state === 'respawn' || state === 'ready' || state === 'gameover' || state === 'victory') {
    startPress();
    updateOverlay();
    return;
  }
  const actionEl = e.target.closest('[data-action]');
  if (!actionEl) return;
  unlockAudio();
  try { sfxUiClick(); } catch (err) { /* audio must never block the menu */ }
  const action = actionEl.dataset.action;
  overlayNavLockUntil = performance.now() + 400;
  if (state === 'options') {
    if (action === 'diff-prev') cycleDifficulty(-1);
    else if (action === 'diff-next') cycleDifficulty(1);
    else if (action === 'open-settings') { settingsReturnState = 'options'; state = 'settings'; }
    else if (action === 'open-achievements') state = 'achievements';
    else if (action === 'open-statistics') state = 'statistics';
    else if (action === 'open-zone-select') { zoneSelectPreviewIdx = 0; state = 'zone-select'; }
    else if (action === 'start-game') beginRunFromOptions();
  } else if (state === 'settings') {
    if (action === 'back-to-options') state = settingsReturnState;
    else if (action === 'toggle-sfx') toggleSfxEnabled();
    else if (action === 'toggle-bgm') toggleBgmEnabled();
    else if (action === 'trail-prev') cycleShipTrail(-1);
    else if (action === 'trail-next') cycleShipTrail(1);
    else if (action === 'skin-prev') cycleShipSkin(-1);
    else if (action === 'skin-next') cycleShipSkin(1);
  } else if ((state === 'achievements' || state === 'zone-select' || state === 'statistics') && action === 'back-to-options') {
    state = 'options';
  } else if (state === 'statistics' && action === 'confirm-reset-stats') {
    state = 'confirm-reset-stats';
  } else if (state === 'confirm-reset-stats') {
    if (action === 'cancel-reset-stats') {
      state = 'statistics';
    } else if (action === 'reset-stats-confirmed') {
      resetPlayerProfile();
      state = 'statistics';
    }
  } else if (state === 'zone-select') {
    if (action === 'preview-zone') {
      const idx = parseInt(actionEl.dataset.zoneIdx, 10);
      if (!isNaN(idx) && unlockedZones.has(idx)) {
        zoneSelectPreviewIdx = idx;
        updateOverlay();
      }
    } else if (action === 'warp-to-zone' && unlockedZones.has(zoneSelectPreviewIdx)) {
      startPracticeZone(zoneSelectPreviewIdx);
    }
  } else if (state === 'paused') {
    if (action === 'resume-game') resumeGame();
    else if (action === 'quit-to-home') quitToHome();
    else if (action === 'open-pause-options') { settingsReturnState = 'paused'; state = 'settings'; }
  } else if (state === 'continue-prompt') {
    if (action === 'use-continue') useContinue();
    else if (action === 'quit-to-home') quitToHome();
  }
  updateOverlay();
}
let overlayNavLockUntil = 0;
overlay.addEventListener('pointerup', handleOverlayActivate);
overlay.addEventListener('click', handleOverlayActivate);

// Input
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    unlockAudio();
    if (!e.repeat) startPress();
  } else if (e.code === 'Escape' && !e.repeat) {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space' || e.code === 'ArrowUp') {
    e.preventDefault();
    endPress();
  }
});
// canvas mouse/touch presses go through this wrapper rather than calling
// startPress() directly -- the home->options transition is deliberately
// excluded here (it only happens via the explicit "CLICK TO START" button
// or keyboard) since letting it fire on mousedown/touchstart re-renders
// the DOM to the Options screen mid-click, and the same press's release
// can then land on a real Options button underneath the cursor
function canvasStartPress() {
  unlockAudio();
  if (state === 'home') return;
  startPress();
}
canvas.addEventListener('mousedown', canvasStartPress);
canvas.addEventListener('mouseup', endPress);
canvas.addEventListener('mouseleave', endPress);
canvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  canvasStartPress();
}, { passive: false });
canvas.addEventListener('touchend', (e) => {
  e.preventDefault();
  endPress();
}, { passive: false });

const pauseToggleBtn = document.getElementById('pause-toggle');
pauseToggleBtn.addEventListener('pointerup', () => {
  if (state === 'playing') pauseGame();
  else if (state === 'paused') resumeGame();
});

function updateBackgroundParticles(theme) {
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  if (theme.bgStyle === 'matrix') {
    for (let p of bgParticles) {
      p.y += p.speed;
      if (p.y - p.len > PLAY_BOTTOM) {
        p.y = PLAY_TOP - p.len;
        p.x = Math.random() * W;
      }
    }
  } else if (theme.bgStyle === 'stars') {
    for (let p of bgParticles) {
      p.x -= p.speed;
      if (p.x < 0) {
        p.x = W;
        p.y = PLAY_TOP + Math.random() * playHeight;
      }
    }
  } else if (theme.bgStyle === 'embers') {
    for (let p of bgParticles) {
      p.y -= p.speed;
      p.x += p.drift;
      if (p.y < PLAY_TOP) {
        p.y = PLAY_BOTTOM;
        p.x = Math.random() * W;
      }
    }
  } else if (theme.bgStyle === 'ruins') {
    for (let p of bgParticles) {
      p.y -= p.speed;
      p.x += p.drift;
      if (p.y < PLAY_TOP) {
        p.y = PLAY_BOTTOM;
        p.x = Math.random() * W;
      }
    }
  } else if (theme.bgStyle === 'toxic') {
    for (let p of bgParticles) {
      p.y -= p.speed;
      p.x += p.drift;
      if (p.y < PLAY_TOP) {
        p.y = PLAY_BOTTOM;
        p.x = Math.random() * W;
      }
    }
  } else if (theme.bgStyle === 'station') {
    for (let p of bgParticles) {
      p.x -= p.speed;
      p.y += Math.sin(frame * 0.01 + p.x * 0.02) * 0.15;
      if (p.x < 0) {
        p.x = W;
        p.y = PLAY_TOP + Math.random() * playHeight;
      }
    }
  } else if (theme.bgStyle === 'void') {
    for (let p of bgParticles) {
      p.x -= p.speed;
      if (p.x < 0) {
        p.x = W;
        p.y = PLAY_TOP + Math.random() * playHeight;
      }
    }
  } else if (theme.bgStyle === 'storm') {
    for (let p of bgParticles) {
      p.y += p.speed;
      p.x -= p.speed * 0.35; // rain falls at an angle
      if (p.y - p.len > PLAY_BOTTOM || p.x < -20) {
        p.y = PLAY_TOP - p.len;
        p.x = Math.random() * W;
      }
    }
  }
}

function beginWarp(targetIndex) {
  if (isPracticeRun && typeof targetIndex !== 'number') {
    // practice runs only ever play the one selected zone -- any attempt to
    // sequentially advance to "the next zone" ends the run instead
    endPracticeRun();
    return;
  }
  if (typeof targetIndex !== 'number' && !devSessionActive) {
    // normal, sequential advance (not a dev jump, a dev-session zone that's
    // still being auto-scrolled through, or the initial jump into a
    // practice zone -- all of which either pass an explicit targetIndex or
    // set devSessionActive) means the zone being left has just been
    // successfully flown all the way through, for real
    let profileChanged = false;
    if (!completedZones.has(themeIndex)) {
      completedZones.add(themeIndex);
      profileChanged = true;
    }
    zoneCompletionCounts[themeIndex] = (zoneCompletionCounts[themeIndex] || 0) + 1;
    profileChanged = true;
    // deathless additionally requires a non-Easy difficulty and no death
    // during this specific zone visit -- Easy mode's forgiveness mechanics
    // would otherwise trivialize what's meant to be a real challenge
    if (selectedDifficulty !== 'easy' && !diedInCurrentZone && !deathlessZones.has(themeIndex)) {
      deathlessZones.add(themeIndex);
      profileChanged = true;
    }
    if (profileChanged) savePlayerProfile();
  }
  warpActive = true;
  sfxWarp();
  warpTimer = WARP_DURATION;
  nextThemeIndex = (typeof targetIndex === 'number') ? targetIndex : (themeIndex + 1) % THEMES.length;
  stopAllBoomerangSounds();
  gates = [];
  portalObject = null;
  // distance keeps accumulating even through long boss/mini-boss zones,
  // where the normal distance-based zone-advance check is intentionally
  // paused -- without this sync, the resulting gap between distance and
  // themeLevelReached would immediately fire that check again on the very
  // first frame of the new zone, skipping straight past it
  themeLevelReached = Math.max(themeLevelReached, Math.floor(distance / THEME_DISTANCE));
}

function finishWarp() {
  warpActive = false;
  themeIndex = nextThemeIndex;
  zoneStartDistance = distance;
  zoneStartFrame = frame;
  ship.y = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) / 2;
  ship.vy = 0;
  devGracePeriodEndFrame = Math.max(devGracePeriodEndFrame, frame + WARP_LANDING_GRACE_PERIOD);
  diedInCurrentZone = false;
  initBackgroundParticles(currentTheme());
  reseedZoneObstacles(ship.x + 420);
  if (!unlockedZones.has(themeIndex)) {
    unlockedZones.add(themeIndex);
    savePlayerProfile();
  }
}

function spawnMiniBossDeathAshParticle() {
  if (!miniBoss) return;
  const a = Math.random() * Math.PI * 2;
  const dist = miniBoss.maxR * (0.3 + Math.random() * 0.7);
  miniBossDeathAshParticles.push({
    x: miniBoss.x + Math.cos(a) * dist,
    y: miniBoss.y + Math.sin(a) * dist,
    vx: -(0.5 + Math.random() * 1.5), // drifts left, matching the game's own scroll direction
    vy: (Math.random() - 0.5) * 0.6,
    flutterPhase: Math.random() * Math.PI * 2,
    flutterSpeed: 0.05 + Math.random() * 0.05,
    size: 2 + Math.random() * 3,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.1,
    life: 0,
    maxLife: 60 + Math.random() * 60
  });
}

function spawnCoreDeathDebris() {
  if (!miniBoss) return;
  const a = Math.random() * Math.PI * 2;
  const dist = miniBoss.maxR * (0.3 + Math.random() * 0.7);
  coreDeathDebris.push({
    x: miniBoss.x + Math.cos(a) * dist,
    y: miniBoss.y + Math.sin(a) * dist,
    vx: -(0.5 + Math.random() * 1.5), // drifts left, matching the game's scroll direction
    vy: (Math.random() - 0.5) * 0.8,
    rotation: Math.random() * Math.PI * 2,
    rotSpeed: (Math.random() - 0.5) * 0.15,
    size: 3 + Math.random() * 4,
    life: 0,
    maxLife: 60 + Math.random() * 60
  });
}

// ==================== REACTOR CORE boss state machine ====================
// entirely separate from the fire boss above -- own states (all prefixed
// 'core'), own variables, own collision checks done inline rather than
// through the shared gates array. Stays at its resting position the whole
// fight (never charges), cycling through 5 attacks then a power-down death.
function computeCrossfireBeamYs(safeSlot) {
  return CORE_CROSSFIRE_SLOT_FRACS.map((frac, i) => i).filter(i => i !== safeSlot).map(i => {
    const jitter = (Math.random() * 2 - 1) * CORE_CROSSFIRE_SLOT_JITTER;
    return PLAY_TOP + (CORE_CROSSFIRE_SLOT_FRACS[i] + jitter) * (PLAY_BOTTOM - PLAY_TOP);
  });
}

function updateCoreSparks(phaseStartFrame, targetCount, shipTop, shipBottom, shipR) {
  const elapsed = frame - phaseStartFrame;
  if (coreSparkSpawned < targetCount && elapsed >= coreSparkSpawned * CORE_SPARK_SPAWN_INTERVAL) {
    const baseFrac = CORE_SPARK_BASE_FRACS[coreSparkSpawned % CORE_SPARK_BASE_FRACS.length];
    const baseY = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * baseFrac;
    coreSparks.push({
      x: miniBoss.x,
      spawnX: miniBoss.x,
      baseY: baseY,
      y: baseY,
      phase: (coreSparkSpawned % 2) * Math.PI // alternate starting phase for variety
    });
    coreSparkSpawned++;
    sfxHazardFire('corespark');
  }
  for (let i = coreSparks.length - 1; i >= 0; i--) {
    const s = coreSparks[i];
    s.x -= CORE_SPARK_SPEED_X;
    const travelled = s.spawnX - s.x;
    s.y = s.baseY + CORE_SPARK_AMPLITUDE * Math.sin(CORE_SPARK_FREQUENCY * travelled + s.phase);
    s.y = Math.max(PLAY_TOP + CORE_SPARK_R, Math.min(PLAY_BOTTOM - CORE_SPARK_R, s.y));
    const dx = ship.x - s.x, dy = ship.y - s.y;
    if (Math.sqrt(dx * dx + dy * dy) < shipR + CORE_SPARK_R) {
      tryEndGame('corespark');
      break;
    }
    if (s.x < -50) coreSparks.splice(i, 1);
  }
}

function updateReactorCoreBoss() {
  if (coreBossDefeated) {
    if (!shipFlyOffActive && frame - coreBossDefeatFrame >= CORE_BOSS_DEFEAT_PAUSE) {
      shipFlyOffActive = true;
      ship.vx = 0;
    }
    if (shipFlyOffActive && ship.x > W + 60) {
      shipFlyOffActive = false;
      miniBoss = null;
      ship.x = W * 0.28;
      ship.vx = 0;
      beginWarp(); // no escape run for this boss
    }
    return;
  }

  const stateElapsed = frame - miniBossAttackStateStartFrame;
  const shipTop = ship.y - SHIP_H / 2, shipBottom = ship.y + SHIP_H / 2;
  const shipR = SHIP_W * 0.4;

  if (coreBossPhase === 6 && (miniBossAttackState === 'coreCrossfireTelegraph' ||
      miniBossAttackState === 'coreCrossfireActive' || miniBossAttackState === 'coreCrossfireGap')) {
    updateCoreSparks(coreSparkPhaseStartFrame, CORE_P6_SPARK_COUNT, shipTop, shipBottom, shipR);
  }

  if (miniBossAttackState === 'coreFloating') {
    miniBoss.x = miniBoss.restX;
    miniBoss.y = miniBoss.baseY; // static wall -- no floating bob

    if (coreBossPhase >= 9) {
      miniBossAttackState = 'coreDying';
      miniBossAttackStateStartFrame = frame;
      sfxCoreDying();
      coreDeathPatches = [];
      for (let i = 0; i < CORE_DEATH_PATCH_COUNT; i++) {
        coreDeathPatches.push({
          angle: Math.random() * Math.PI * 2,
          distFrac: 0.15 + Math.random() * 0.55,
          sizeFrac: 0.35 + Math.random() * 0.35,
          startFrac: (i / CORE_DEATH_PATCH_COUNT) * 0.5 + Math.random() * 0.15
        });
      }
      coreDeathDebris = [];
      return;
    }

    const floatDuration = !coreBossHadFirstFloat ? CORE_BOSS_INITIAL_FLOAT : (coreBossPhase === 3 ? 35 : CORE_BOSS_PRE_ATTACK_FLOAT);
    if (stateElapsed >= floatDuration) {
      coreBossHadFirstFloat = true;
      if (coreBossPhase === 1) {
        miniBossAttackState = 'coreLaserTelegraph';
        coreLaserIndex = 0;
        coreLaserHeights = shuffleArray(CORE_LASER_HEIGHT_FRACS);
        coreLaserY = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * coreLaserHeights[0];
        sfxHazardFire('coreLaserTelegraph');
      } else if (coreBossPhase === 2) {
        miniBossAttackState = 'coreBulkheadTelegraph';
        coreBulkheadIsMoving = false;
        coreBulkheadX = ship.x + 150; // well clear of the boss (which sits around ship.x+366), so the wall reads as a distinct obstacle between ship and boss, not overlapping it
        coreBulkheadGapCenter = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * 0.5;
      } else if (coreBossPhase === 3) {
        miniBossAttackState = 'coreSparkDeploy';
        coreSparkSpawned = 0;
        coreSparks = [];
        coreSparkPhaseStartFrame = frame;
        coreP3BeamVolleysFired = 0;
        coreP3BeamState = 'none';
        coreP3BeamYs = [];
      } else if (coreBossPhase === 4) {
        miniBossAttackState = 'coreBulkheadTelegraph';
        coreBulkheadIsMoving = true;
        coreBulkheadX = ship.x + 150; // well clear of the boss (which sits around ship.x+366), so the wall reads as a distinct obstacle between ship and boss, not overlapping it
      } else if (coreBossPhase === 5) {
        miniBossAttackState = 'coreEmpTelegraph';
        coreEmpPulses = [];
        coreEmpWavesLaunched = 0;
        miniBoss.y = miniBoss.baseY; // pin to center -- otherwise it's frozen wherever the floating bob happened to be, misaligning EMP lanes against the (always-centered) squeeze walls
      } else if (coreBossPhase === 6) {
        miniBossAttackState = 'coreCrossfireTelegraph';
        coreCrossfireRound = 0;
        const safeSlot = Math.floor(Math.random() * CORE_CROSSFIRE_SLOT_FRACS.length);
        coreCrossfireBeamYs = computeCrossfireBeamYs(safeSlot);
        coreSparkSpawned = 0;
        coreSparks = [];
        coreSparkPhaseStartFrame = frame;
      } else if (coreBossPhase === 7) {
        miniBossAttackState = 'coreBulkheadTelegraph';
        coreBulkheadIsMoving = true;
        coreBulkheadX = ship.x + 150; // well clear of the boss (which sits around ship.x+366), so the wall reads as a distinct obstacle between ship and boss, not overlapping it
      } else if (coreBossPhase === 8) {
        miniBossAttackState = 'coreGateOpen';
        coreGateOpenAmount = 0;
        coreOrbitSpawned = 0;
        coreOrbitProjectiles = [];
        coreOrbitEmitAngle = 0;
        sfxCoreGateOpen();
      }
      miniBossAttackStateStartFrame = frame;
      if (miniBossAttackState === 'coreBulkheadTelegraph') sfxCoreBulkheadTelegraph();
      if (miniBossAttackState === 'coreEmpTelegraph') sfxCoreEmpTelegraph();
    }
  } else if (miniBossAttackState === 'coreLaserTelegraph') {
    if (stateElapsed >= CORE_LASER_TELEGRAPH) {
      miniBossAttackState = 'coreLaserActive';
      miniBossAttackStateStartFrame = frame;
      sfxHazardFire('coreLaserActive');
    }
  } else if (miniBossAttackState === 'coreLaserActive') {
    if (shipTop < coreLaserY + CORE_LASER_THICKNESS / 2 && shipBottom > coreLaserY - CORE_LASER_THICKNESS / 2) {
      tryEndGame('coreLaserActive');
    }
    if (stateElapsed >= CORE_LASER_ACTIVE) {
      coreLaserIndex++;
      if (coreLaserIndex >= CORE_LASER_COUNT) {
        coreBossPhase = 2;
        miniBossAttackState = 'coreFloating';
        miniBossAttackStateStartFrame = frame;
      } else {
        miniBossAttackState = 'coreLaserGap';
        miniBossAttackStateStartFrame = frame;
      }
    }
  } else if (miniBossAttackState === 'coreLaserGap') {
    if (stateElapsed >= CORE_LASER_GAP) {
      coreLaserY = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * coreLaserHeights[coreLaserIndex];
      miniBossAttackState = 'coreLaserTelegraph';
      miniBossAttackStateStartFrame = frame;
      sfxHazardFire('coreLaserTelegraph');
    }
  } else if (miniBossAttackState === 'coreBulkheadTelegraph') {
    if (stateElapsed >= CORE_BULKHEAD_TELEGRAPH) {
      miniBossAttackState = 'coreBulkheadActive';
      miniBossAttackStateStartFrame = frame;
      sfxCoreBulkheadLock();
      startCoreBulkheadHoldSound();
    }
  } else if (miniBossAttackState === 'coreBulkheadActive') {
    let gapCenter = coreBulkheadGapCenter;
    if (coreBulkheadIsMoving) {
      gapCenter = (PLAY_TOP + PLAY_BOTTOM) / 2 + CORE_BULKHEAD_DRIFT_AMPLITUDE * Math.sin(stateElapsed * (2 * Math.PI / CORE_BULKHEAD_DRIFT_PERIOD));
    }
    const gapTop = gapCenter - CORE_BULKHEAD_GAP_HEIGHT / 2;
    const gapBottom = gapCenter + CORE_BULKHEAD_GAP_HEIGHT / 2;
    if (shipTop < gapTop || shipBottom > gapBottom) {
      tryEndGame('coreBulkheadActive');
    }
    if (stateElapsed >= CORE_BULKHEAD_ACTIVE) {
      coreBossPhase = coreBossPhase + 1;
      miniBossAttackState = 'coreFloating';
      miniBossAttackStateStartFrame = frame;
    }
  } else if (miniBossAttackState === 'coreSparkDeploy') {
    updateCoreSparks(coreSparkPhaseStartFrame, CORE_SPARK_COUNT, shipTop, shipBottom, shipR);
    // beam volleys, firing simultaneously alongside the weaving sparks
    if (coreP3BeamState === 'none' && coreP3BeamVolleysFired < CORE_P3_BEAM_TRIGGER_TIMES.length &&
        stateElapsed >= CORE_P3_BEAM_TRIGGER_TIMES[coreP3BeamVolleysFired]) {
      coreP3BeamState = 'telegraph';
      coreP3BeamStateStartFrame = frame;
      const safeSlot = Math.floor(Math.random() * CORE_P3_BEAM_SLOT_FRACS.length);
      coreP3BeamYs = CORE_P3_BEAM_SLOT_FRACS.map((f, i) => i).filter(i => i !== safeSlot)
        .map(i => PLAY_TOP + CORE_P3_BEAM_SLOT_FRACS[i] * (PLAY_BOTTOM - PLAY_TOP));
    } else if (coreP3BeamState === 'telegraph' && frame - coreP3BeamStateStartFrame >= CORE_P3_BEAM_TELEGRAPH) {
      coreP3BeamState = 'active';
      coreP3BeamStateStartFrame = frame;
      sfxCoreCrossfireVolley();
    } else if (coreP3BeamState === 'active') {
      for (const by of coreP3BeamYs) {
        if (shipTop < by + CORE_P3_BEAM_THICKNESS / 2 && shipBottom > by - CORE_P3_BEAM_THICKNESS / 2) {
          tryEndGame('coreLaserActive');
          break;
        }
      }
      if (frame - coreP3BeamStateStartFrame >= CORE_P3_BEAM_ACTIVE) {
        coreP3BeamState = 'none';
        coreP3BeamYs = [];
        coreP3BeamVolleysFired++;
      }
    }
    if (coreSparkSpawned >= CORE_SPARK_COUNT && coreSparks.length === 0 &&
        coreP3BeamVolleysFired >= CORE_P3_BEAM_TRIGGER_TIMES.length && coreP3BeamState === 'none') {
      coreBossPhase = 4;
      miniBossAttackState = 'coreFloating';
      miniBossAttackStateStartFrame = frame;
    }
  } else if (miniBossAttackState === 'coreEmpTelegraph') {
    if (stateElapsed >= CORE_EMP_TELEGRAPH) {
      miniBossAttackState = 'coreEmpActive';
      miniBossAttackStateStartFrame = frame;
      coreEmpPhaseStartFrame = frame;
    }
  } else if (miniBossAttackState === 'coreEmpActive') {
    const squeezeCenter = (PLAY_TOP + PLAY_BOTTOM) / 2;
    const cyclePos = ((frame - coreEmpPhaseStartFrame) % CORE_SQUEEZE_PERIOD) / CORE_SQUEEZE_PERIOD;
    const squeezeFrac = (1 - Math.cos(cyclePos * 2 * Math.PI)) / 2;
    const squeezeGap = CORE_SQUEEZE_MAX_GAP - (CORE_SQUEEZE_MAX_GAP - CORE_SQUEEZE_MIN_GAP) * squeezeFrac;
    coreSqueezeTopY = squeezeCenter - squeezeGap / 2;
    coreSqueezeBottomY = squeezeCenter + squeezeGap / 2;
    if (shipTop <= coreSqueezeTopY || shipBottom >= coreSqueezeBottomY) {
      tryEndGame('coreEmpActive');
    }

    const waveElapsed = frame - coreEmpPhaseStartFrame;
    if (coreEmpWavesLaunched < CORE_EMP_WAVE_COUNT && waveElapsed >= coreEmpWavesLaunched * CORE_EMP_WAVE_INTERVAL) {
      const safeLane = Math.floor(Math.random() * 3);
      for (let lane = 0; lane < 3; lane++) {
        if (lane === safeLane) continue;
        coreEmpPulses.push({
          x: miniBoss.x,
          y: miniBoss.y + (lane - 1) * CORE_EMP_LANE_SPACING,
          vx: -CORE_EMP_SPEED
        });
      }
      coreEmpWavesLaunched++;
      sfxHazardFire('coreEmpPulse');
    }
    for (let i = coreEmpPulses.length - 1; i >= 0; i--) {
      const e = coreEmpPulses[i];
      e.x += e.vx;
      const dx = ship.x - e.x, dy = ship.y - e.y;
      if (Math.sqrt(dx * dx + dy * dy) < shipR + CORE_EMP_R) {
        tryEndGame('coreEmpPulse');
        break;
      }
      if (e.x < -100) coreEmpPulses.splice(i, 1);
    }

    if (stateElapsed >= CORE_EMP_ACTIVE) {
      coreBossPhase = 6;
      miniBossAttackState = 'coreFloating';
      miniBossAttackStateStartFrame = frame;
    }
  } else if (miniBossAttackState === 'coreCrossfireTelegraph') {
    if (stateElapsed >= CORE_CROSSFIRE_TELEGRAPH) {
      miniBossAttackState = 'coreCrossfireActive';
      miniBossAttackStateStartFrame = frame;
      sfxCoreCrossfireVolley();
    }
  } else if (miniBossAttackState === 'coreCrossfireActive') {
    for (const by of coreCrossfireBeamYs) {
      if (shipTop < by + CORE_CROSSFIRE_THICKNESS / 2 && shipBottom > by - CORE_CROSSFIRE_THICKNESS / 2) {
        tryEndGame('coreCrossfireActive');
        break;
      }
    }
    if (stateElapsed >= CORE_CROSSFIRE_ACTIVE) {
      coreCrossfireRound++;
      if (coreCrossfireRound >= CORE_CROSSFIRE_ROUNDS) {
        coreBossPhase = 7;
        miniBossAttackState = 'coreFloating';
        miniBossAttackStateStartFrame = frame;
      } else {
        miniBossAttackState = 'coreCrossfireGap';
        miniBossAttackStateStartFrame = frame;
      }
    }
  } else if (miniBossAttackState === 'coreCrossfireGap') {
    if (stateElapsed >= CORE_CROSSFIRE_GAP) {
      const safeSlot = Math.floor(Math.random() * CORE_CROSSFIRE_SLOT_FRACS.length);
      coreCrossfireBeamYs = computeCrossfireBeamYs(safeSlot);
      miniBossAttackState = 'coreCrossfireTelegraph';
      miniBossAttackStateStartFrame = frame;
    }
  } else if (miniBossAttackState === 'coreGateOpen') {
    coreGateOpenAmount = Math.min(1, stateElapsed / CORE_GATE_OPEN_DURATION);
    if (stateElapsed >= CORE_GATE_OPEN_DURATION) {
      miniBossAttackState = 'coreSphereEmerge';
      miniBossAttackStateStartFrame = frame;
      miniBoss.x = miniBoss.restX;
      miniBoss.y = miniBoss.baseY;
      miniBoss.r = miniBoss.maxR;
      sfxCoreEmerge();
    }
  } else if (miniBossAttackState === 'coreSphereEmerge') {
    const emergeT = Math.min(1, stateElapsed / CORE_SPHERE_EMERGE_DURATION);
    const startX = miniBoss.restX, targetX = Math.min(ship.x + CORE_SPHERE_X_OFFSET, miniBoss.restX);
    miniBoss.x = startX + (targetX - startX) * emergeT;
    miniBoss.y = miniBoss.baseY;
    if (stateElapsed >= CORE_SPHERE_EMERGE_DURATION) {
      miniBossAttackState = 'coreOrbitBarrageActive';
      miniBossAttackStateStartFrame = frame;
      coreEyeBeamState = 'track';
      coreEyeBeamStateStartFrame = frame;
      coreEyeBeamY = ship.y;
      sfxCoreEyeBeamTrack();
      coreTeslaState = 'charging';
      coreTeslaStateStartFrame = frame;
      coreTeslaProjectiles = [];
      coreTeslaEmptySlot = pickCoreTeslaEmptySlot();
    }
  } else if (miniBossAttackState === 'coreOrbitBarrageActive') {
    miniBoss.x = Math.min(ship.x + CORE_SPHERE_X_OFFSET, miniBoss.restX);
    miniBoss.y = miniBoss.baseY;
    coreOrbitEmitAngle += CORE_ORBIT_EMIT_ROTATION_SPEED;

    if (coreOrbitSpawned < CORE_ORBIT_COUNT && stateElapsed >= coreOrbitSpawned * CORE_ORBIT_SPAWN_INTERVAL) {
      coreOrbitProjectiles.push({ angle: coreOrbitEmitAngle, dist: CORE_ORBIT_START_DIST, x: 0, y: 0 });
      coreOrbitSpawned++;
      sfxHazardFire('coreOrbit');
    }
    for (let i = coreOrbitProjectiles.length - 1; i >= 0; i--) {
      const p = coreOrbitProjectiles[i];
      p.angle += CORE_ORBIT_TANGENTIAL_SPEED / p.dist;
      p.dist += CORE_ORBIT_OUTWARD_SPEED;
      p.x = miniBoss.x + Math.cos(p.angle) * p.dist;
      p.y = miniBoss.y + Math.sin(p.angle) * p.dist;
      const dx = ship.x - p.x, dy = ship.y - p.y;
      if (Math.sqrt(dx * dx + dy * dy) < shipR + CORE_ORBIT_R) {
        tryEndGame('coreOrbit');
        break;
      }
      if (p.dist > CORE_ORBIT_MAX_DIST) coreOrbitProjectiles.splice(i, 1);
    }

    // eye beam sub-cycle, running simultaneously with the orbit barrage
    if (coreEyeBeamState === 'track') {
      coreEyeBeamY = ship.y;
      if (frame - coreEyeBeamStateStartFrame >= CORE_EYEBEAM_TRACK_DURATION) {
        coreEyeBeamState = 'lock';
        coreEyeBeamStateStartFrame = frame;
        sfxCoreEyeBeamLock();
      }
    } else if (coreEyeBeamState === 'lock') {
      if (frame - coreEyeBeamStateStartFrame >= CORE_EYEBEAM_LOCK_DURATION) {
        coreEyeBeamState = 'active';
        coreEyeBeamStateStartFrame = frame;
        sfxCoreEyeBeamFire();
      }
    } else if (coreEyeBeamState === 'active') {
      if (shipTop < coreEyeBeamY + CORE_EYEBEAM_THICKNESS / 2 && shipBottom > coreEyeBeamY - CORE_EYEBEAM_THICKNESS / 2) {
        tryEndGame('coreEyeBeam');
      }
      if (frame - coreEyeBeamStateStartFrame >= CORE_EYEBEAM_ACTIVE_DURATION) {
        coreEyeBeamState = 'cooldown';
        coreEyeBeamStateStartFrame = frame;
      }
    } else if (coreEyeBeamState === 'cooldown') {
      if (frame - coreEyeBeamStateStartFrame >= CORE_EYEBEAM_COOLDOWN) {
        coreEyeBeamState = 'track';
        coreEyeBeamStateStartFrame = frame;
        sfxCoreEyeBeamTrack();
      }
    }

    // tesla discharge burst sub-cycle, running simultaneously with the orbit barrage and eye beam
    if (coreTeslaState === 'charging') {
      const teslaElapsed = frame - coreTeslaStateStartFrame;
      const teslaLockWindow = 20; // final frames before firing -- gap position freezes here for a stable telegraph
      if (teslaElapsed < CORE_TESLA_CHARGE_DURATION - teslaLockWindow) {
        coreTeslaEmptySlot = pickCoreTeslaEmptySlot(); // keep tracking the ship's position
      }
      if (teslaElapsed >= CORE_TESLA_CHARGE_DURATION) {
        for (let i = 0; i < CORE_TESLA_SLOT_FRACS.length; i++) {
          if (i === coreTeslaEmptySlot || i === coreTeslaEmptySlot + 1) continue;
          const targetY = PLAY_TOP + CORE_TESLA_SLOT_FRACS[i] * (PLAY_BOTTOM - PLAY_TOP);
          const dx = ship.x - miniBoss.x, dy = targetY - miniBoss.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          coreTeslaProjectiles.push({
            x: miniBoss.x, y: miniBoss.y,
            vx: (dx / dist) * CORE_TESLA_PROJECTILE_SPEED,
            vy: (dy / dist) * CORE_TESLA_PROJECTILE_SPEED
          });
        }
        coreTeslaState = 'cooldown';
        coreTeslaStateStartFrame = frame;
        sfxHazardFire('coreTesla');
      }
    } else if (coreTeslaState === 'cooldown') {
      if (frame - coreTeslaStateStartFrame >= CORE_TESLA_COOLDOWN) {
        coreTeslaState = 'charging';
        coreTeslaStateStartFrame = frame;
        coreTeslaEmptySlot = pickCoreTeslaEmptySlot();
      }
    }
    for (let i = coreTeslaProjectiles.length - 1; i >= 0; i--) {
      const p = coreTeslaProjectiles[i];
      p.x += p.vx;
      p.y += p.vy;
      const dx = ship.x - p.x, dy = ship.y - p.y;
      if (Math.sqrt(dx * dx + dy * dy) < shipR + CORE_TESLA_PROJECTILE_R) {
        tryEndGame('coreTesla');
        break;
      }
      if (p.x < -50 || p.y < PLAY_TOP - 100 || p.y > PLAY_BOTTOM + 100) {
        coreTeslaProjectiles.splice(i, 1);
      }
    }

    if (stateElapsed >= CORE_ORBIT_BARRAGE_DURATION && coreOrbitSpawned >= CORE_ORBIT_COUNT && coreOrbitProjectiles.length === 0) {
      miniBossAttackState = 'coreOverloadDying';
      miniBossAttackStateStartFrame = frame;
      coreOverloadArcs = [];
      coreDeathDebris = [];
      sfxCoreOverload();
    }
  } else if (miniBossAttackState === 'coreDying') {
    const dimEnd = CORE_DEATH_DIM_DURATION;
    const darkenEnd = dimEnd + CORE_DEATH_DARKEN_DURATION;
    const collapseEnd = darkenEnd + CORE_DEATH_COLLAPSE_DURATION;
    const darkenProgress = Math.max(0, Math.min(1, (stateElapsed - dimEnd) / CORE_DEATH_DARKEN_DURATION));

    if (stateElapsed >= dimEnd && stateElapsed < darkenEnd && stateElapsed % 9 === 0) {
      spawnCoreDeathDebris();
    } else if (stateElapsed >= darkenEnd && stateElapsed < collapseEnd) {
      spawnCoreDeathDebris();
      if (frame % 2 === 0) spawnCoreDeathDebris();
    }
    if (stateElapsed === dimEnd) {
      playElectricCrackles({ count: 8, spacing: 0.018, volume: 0.24 });
      playSynth({ type: 'square', freq: 2200, freqEnd: 240, duration: 0.08, attack: 0.001, decay: 0.02, sustain: 0.12, release: 0.03, volume: 0.08, filterType: 'highpass', filterFreq: 1000, delaySend: 0.05 });
    }
    if (stateElapsed === darkenEnd) sfxCoreDyingCollapse();

    for (let i = coreDeathDebris.length - 1; i >= 0; i--) {
      const p = coreDeathDebris[i];
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotSpeed;
      p.life++;
      if (p.life >= p.maxLife) coreDeathDebris.splice(i, 1);
    }

    if (stateElapsed >= collapseEnd) {
      coreBossDefeated = true;
      coreBossDefeatFrame = frame;
    }
  } else if (miniBossAttackState === 'coreOverloadDying') {
    const buildupEnd = CORE_OVERLOAD_BUILDUP_DURATION;
    const flashEnd = buildupEnd + CORE_OVERLOAD_FLASH_DURATION;
    const breakdownEnd = flashEnd + CORE_OVERLOAD_BREAKDOWN_DURATION;

    if (stateElapsed < buildupEnd) {
      // increasing frequency of electrical arcs across the surface as the overload builds
      const buildupProgress = stateElapsed / buildupEnd;
      const arcChance = 0.1 + buildupProgress * 0.5;
      if (Math.random() < arcChance) {
        coreOverloadArcs.push({
          angle1: Math.random() * Math.PI * 2,
          angle2: Math.random() * Math.PI * 2,
          life: 0,
          maxLife: 8 + Math.random() * 8
        });
      }
    } else if (stateElapsed === buildupEnd) {
      sfxCoreOverloadFlash();
    } else if (stateElapsed === flashEnd) {
      sfxCoreOverloadBreakdown();
    } else if (stateElapsed >= flashEnd && stateElapsed < breakdownEnd) {
      spawnCoreDeathDebris();
      if (frame % 2 === 0) spawnCoreDeathDebris();
    }

    for (let i = coreOverloadArcs.length - 1; i >= 0; i--) {
      const a = coreOverloadArcs[i];
      a.life++;
      if (a.life >= a.maxLife) coreOverloadArcs.splice(i, 1);
    }

    for (let i = coreDeathDebris.length - 1; i >= 0; i--) {
      const p = coreDeathDebris[i];
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotSpeed;
      p.life++;
      if (p.life >= p.maxLife) coreDeathDebris.splice(i, 1);
    }

    if (stateElapsed >= breakdownEnd) {
      coreBossDefeated = true;
      coreBossDefeatFrame = frame;
      coreDeathDebris = [];
      coreOverloadArcs = [];
    }
  }
}

function update() {
  noteFrameTime();
  syncGlowDangerSound();
  syncFireballBreathSound();
  syncToxicHazardSounds();
  syncDustStormSound();
  syncMeteorStreakSound();
  syncWindVortexSound();
  syncStormCloudSound();
  syncMovingDoorSound();
  syncBlackHoleSound();
  syncPulsingOrbSounds();
  syncBoomerangSounds();
  syncMoltenCoreIdleSound();
  syncMoltenFlameWallSound();
  syncMoltenSqueezeSound();
  syncMoltenDeathAshSound();
  syncCoreBulkheadHoldSound();
  if (state === 'playing') {
    frame++;
    shipYHistory.push(ship.y);
    if (shipYHistory.length > SHIP_Y_HISTORY_MAX) shipYHistory.shift();
    updateShipTrailParticles();
    updateShipToxicDrips();
    const th = currentTheme();
    const effScroll = SCROLL_SPEED * (th.scrollMult || 1);
    distance += effScroll * 0.1;
    maxDistanceReached = Math.max(maxDistanceReached, distance);
    if (!isPracticeRun) totalDistanceTraveled += effScroll * 0.1;

    // black hole pull: within a hole's reach, lift gets weaker and fall
    // gets faster, scaling smoothly with proximity to its center. outside
    // any hole's reach this has no effect at all
    let pullStrength = 0;
    if (!ghostMode) {
      for (const g of gates) {
        if (g.type === 'blackhole') {
          const dx = ship.x - g.x, dy = ship.y - g.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < g.reachR) {
            const s = 1 - dist / g.reachR;
            pullStrength = Math.max(pullStrength, s);
          }
        }
      }
    }
    const effLiftMult = th.liftMult * (1 - pullStrength * 0.45);
    const effGravityMult = th.gravityMult * (1 + pullStrength * 0.7);

    // thick ash cloud: smoothly reduces lift and increases gravity
    // while inside, same falloff pattern as the black hole above but
    // gentler -- a secondary, non-lethal drag rather than a hazard
    let ashCloudStrength = 0;
    for (const g of gates) {
      if (g.type === 'bossashcloud') {
        const dx = ship.x - g.x, dy = ship.y - g.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < g.r) {
          const s = 1 - dist / g.r;
          ashCloudStrength = Math.max(ashCloudStrength, s);
        }
      }
    }
    const effLiftMult2 = effLiftMult * (1 - ashCloudStrength * BOSS_ASH_CLOUD_LIFT_REDUCTION);
    const effGravityMult2 = effGravityMult * (1 + ashCloudStrength * BOSS_ASH_CLOUD_GRAVITY_INCREASE);

    // signal corruption zones invert hold/release for their entire
    // width -- a genuinely different function from anything else in
    // this game (every other hazard is spatial avoidance; this is
    // interference with the player's own input)
    let effectiveHolding = holding;
    for (const g of gates) {
      if (g.type === 'signalcorruption' && Math.abs(ship.x - g.x) < g.zoneWidth / 2) {
        effectiveHolding = !holding;
        break;
      }
    }

    if (frame < devGracePeriodEndFrame && effectiveHolding) {
      devGracePeriodEndFrame = frame; // player has started providing real input -- end the grace period early
    }
    const inGracePeriod = frame < devGracePeriodEndFrame;
    // once the final boss commits to its death sequence, the ship is held
    // steady rather than left under player control -- covers the final
    // charge build-up, the explosion white-out (player can't see to
    // navigate anyway), the quiet downtime beat after, and the fly-off
    // itself, so the ship holds its exact height and flies off purely
    // horizontally instead of gravity dragging it down mid-sequence
    const bossDeathSequenceHold = bossFinalChargeActive || bossExplosionActive || bossFullyDefeated;

    if (inGracePeriod || bossDeathSequenceHold || warpActive) {
      ship.vy = 0; // held perfectly still, immune to gravity
    } else if (effectiveHolding) {
      ship.vy += LIFT_ACCEL * effLiftMult2;
      if (ship.vy < MAX_RISE_SPEED * effLiftMult2) ship.vy = MAX_RISE_SPEED * effLiftMult2;
    } else {
      ship.vy += GRAVITY * effGravityMult2;
      if (ship.vy > MAX_FALL_SPEED * effGravityMult2) ship.vy = MAX_FALL_SPEED * effGravityMult2;
    }

    // thrust SFX is intentionally off during play -- holding to fly would
    // retrigger constantly and get noisy. The loop still exists in SOUND TEST.

    // wind vortex: oscillating force scaling with proximity to any active
    // vortex's center, alternating direction as the ship passes through --
    // capped at the same zone speed limits so it's always counterable
    if (!ghostMode && !inGracePeriod && !bossDeathSequenceHold) {
      let vortexForce = 0;
      for (const g of gates) {
        if (g.type === 'windvortex') {
          const dx = ship.x - g.x, dy = ship.y - g.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < g.reachR) {
            const proximity = 1 - dist / g.reachR;
            vortexForce += VORTEX_MAX_FORCE * proximity * Math.sin(frame * VORTEX_OSCILLATION_FREQ + g.rotSeed);
          }
        }
      }
      if (vortexForce !== 0) {
        ship.vy += vortexForce;
        const capFall = MAX_FALL_SPEED * th.gravityMult;
        const capRise = MAX_RISE_SPEED * th.liftMult;
        if (ship.vy > capFall) ship.vy = capFall;
        if (ship.vy < capRise) ship.vy = capRise;
      }
    }

    ship.y += ship.vy;
    ship.rotation = Math.max(-15, Math.min(20, ship.vy * 3));

    if (shipFlyOffActive) {
      ship.vx = (ship.vx || 0) + SHIP_FLYOFF_ACCEL;
      ship.x += ship.vx;
      ship.rotation = Math.max(ship.rotation, 8); // nose tilts up triumphantly as it accelerates away
    }

    updateBackgroundParticles(currentTheme());

    const newLevel = Math.floor(distance / THEME_DISTANCE);
    const zoneElapsed = distance - zoneStartDistance;
    // Zone length is always THEME_DISTANCE from the moment this zone
    // started. A long mini-boss fight (Reactor Core) can push the global
    // `distance` clock near the next 1000-boundary; using that global grid
    // here would spawn the portal immediately on The Void (and any other
    // zone that follows a boss). Capture sim pins themeLevelReached high
    // so this check never ends the preview run.
    if (!warpActive && !th.isBossZone && !th.isMiniBossZone && themeLevelReached < 999999 && zoneElapsed >= THEME_DISTANCE) {
      themeLevelReached = Math.max(themeLevelReached + 1, newLevel);
      beginWarp();
    }
    if (miniBossEscapeRunActive && !warpActive && (distance - miniBossEscapeRunStartDistance) >= MINI_BOSS_ESCAPE_RUN_DISTANCE) {
      miniBossEscapeRunActive = false;
      beginWarp();
    }

    if (th.isBossZone && boss) {
      const entranceElapsed = frame - bossSpawnFrame;
      const entranceComplete = entranceElapsed >= BOSS_ENTRANCE_DURATION;

      if (!entranceComplete) {
        // stages 1-2 (charge-up, then fragments assembling): the solid
        // orb itself stays invisible -- drawBoss renders the glitch
        // buildup and converging fragments instead. stage 3: snap to
        // full size instantly rather than continuing to scale, for the
        // dramatic "materialize" beat
        const entranceProgress = Math.min(1, entranceElapsed / BOSS_ENTRANCE_DURATION);
        if (entranceElapsed === 1) sfxSignalEntranceGlitch();
        const prevEntrance = Math.min(1, (entranceElapsed - 1) / BOSS_ENTRANCE_DURATION);
        if (prevEntrance < BOSS_ENTRANCE_CHARGE_END && entranceProgress >= BOSS_ENTRANCE_CHARGE_END) sfxSignalEntranceAssemble();
        if (prevEntrance < BOSS_ENTRANCE_ASSEMBLE_END && entranceProgress >= BOSS_ENTRANCE_ASSEMBLE_END) sfxSignalEntranceSnap();
        boss.r = entranceProgress >= BOSS_ENTRANCE_ASSEMBLE_END ? boss.maxR : 0;
        boss.y = boss.baseY;
      } else if (!bossDefeated) {
        if (bossTransitioning) {
          // frozen mid-transform: no movement, no attacks, no timer
          // countdown -- visibly "straining" to change forms.
          // snapping to center is only appropriate for the 2->3
          // transition, where the float range is small (22px) so it's
          // barely noticeable. by phase 3-4 the float range is much
          // wider (160px), so snapping here for the 4->5 transition
          // would teleport the boss from wherever it was floating
          // straight to center -- instead, freeze it in place
          boss.r = boss.maxR;
          if (bossTransitionTargetPhase !== 5) {
            boss.y = boss.baseY;
          }
          const effTransitionDuration = bossTransitionTargetPhase === 5 ? BOSS_PHASE5_TRANSITION_DURATION : BOSS_TRANSITION_DURATION;
          if (frame - bossTransitionStartFrame >= effTransitionDuration) {
            bossTransitioning = false;
            bossTransitionEndFrame = frame;
            bossPhase = bossTransitionTargetPhase;
            if (bossTransitionTargetPhase === 5) {
              // the boss froze wherever it happened to be, not at
              // center -- ease into the resumed float from there
              // instead of snapping to baseY on the very next frame
              bossBeamHoldBlendStartFrame = frame;
            }
          }
        } else {
          boss.r = boss.maxR;
          const effFloatAmplitude = bossPhase >= 3 ? BOSS_FLOAT_AMPLITUDE_PHASE3 : BOSS_FLOAT_AMPLITUDE;
          // the float wave's phase origin resets the moment phase 3
          // begins (bossTransitionEndFrame), so the oscillation starts
          // fresh from sin(0)=0 -- i.e. exactly boss.baseY, which is
          // where the boss was already sitting through the frozen
          // transition. this avoids a discontinuous jump: instead of
          // the larger amplitude suddenly applying to whatever phase
          // angle the original (pre-transition) wave happened to be
          // at, the range of motion grows outward smoothly from rest
          const floatPhaseOrigin = bossPhase >= 3 ? bossTransitionEndFrame : (bossSpawnFrame + BOSS_ENTRANCE_DURATION);
          const normalFloatY = boss.baseY + effFloatAmplitude * Math.sin((frame - floatPhaseOrigin) * (2 * Math.PI / BOSS_FLOAT_PERIOD));

          const activeBeamGate = gates.find(g => (g.type === 'bosschargebeamtelegraph' && !g.resolved) || g.type === 'bosschargebeam');
          const holdTargetY = activeBeamGate ? activeBeamGate.lockedY : ((bossFinalChargeActive || bossExplosionActive) ? (PLAY_TOP + PLAY_BOTTOM) / 2 : null);
          if (holdTargetY !== null) {
            // "can't move and shoot at the same time" -- eases toward
            // the locked target height and holds there, so the beam
            // visually originates from the boss's own center
            boss.y += (holdTargetY - boss.y) * 0.06;
            bossBeamHoldBlendStartFrame = frame;
          } else if (frame - bossBeamHoldBlendStartFrame < BOSS_BEAM_HOLD_BLEND_DURATION) {
            // brief blend back onto the normal float after the beam
            // ends, rather than snapping straight to the sine wave
            const blendProgress = (frame - bossBeamHoldBlendStartFrame) / BOSS_BEAM_HOLD_BLEND_DURATION;
            boss.y += (normalFloatY - boss.y) * (0.04 + blendProgress * 0.3);
          } else {
            boss.y = normalFloatY;
          }

          if (!bossWaitingForClear && !bossFinalChargeActive && !bossExplosionActive) {
            bossTimer--;
          }
          const elapsed = th.bossDuration - bossTimer;
          const phaseByTime = Math.min(BOSS_NUM_PHASES, Math.floor(elapsed / BOSS_PHASE_DURATION) + 1);

          // telegraphs must resolve even while waiting for a phase change.
          // the clear-wait pauses spawning, and these used to live only in
          // the spawn branch -- an unfinished volley aim-line then stayed
          // in gates forever and the fight deadlocked in phase 2.
          for (const g of gates) {
            if (g.type === 'bossvolleytelegraph' && !g.resolved && (frame - g.spawnFrame) >= g.warningFrames) {
              fireBossVolley(ship.y);
              g.resolved = true;
            }
          }
          for (const g of gates) {
            if (g.type === 'bosschargebeamtelegraph' && !g.resolved && (frame - g.spawnFrame) >= g.warningFrames) {
              fireBossChargeBeam(g.lockedY, g.thickness, g.isSuperBeam);
              g.resolved = true;
            }
          }

          if (bossWaitingForClear) {
            // a phase transition's time threshold has been reached,
            // but wait for every boss hazard to clear the screen
            // before starting the dramatic transformation -- nothing
            // new spawns during this wait (we're in this branch, not
            // the attack-spawning one below), and elapsed is frozen
            // since bossTimer isn't decrementing above
            let hazardsRemaining = gates.some(g => BOSS_HAZARD_TYPES.includes(g.type));
            if (hazardsRemaining && bossWaitingForClearStartFrame >= 0 && (frame - bossWaitingForClearStartFrame) > 480) {
              gates = gates.filter(g => !BOSS_HAZARD_TYPES.includes(g.type));
              hazardsRemaining = false;
            }
            if (!hazardsRemaining) {
              bossWaitingForClear = false;
              bossWaitingForClearStartFrame = -1;
              bossTransitioning = true;
              bossTransitionStartFrame = frame;
              bossTransitionTargetPhase = bossWaitingForClearTargetPhase;
              sfxSignalPhase();
            }
          } else if (phaseByTime === 5 && bossPhase === 4) {
            bossWaitingForClear = true;
            bossWaitingForClearStartFrame = frame;
            bossWaitingForClearTargetPhase = 5;
          } else if (phaseByTime === 3 && bossPhase === 2) {
            bossWaitingForClear = true;
            bossWaitingForClearStartFrame = frame;
            bossWaitingForClearTargetPhase = 3;
          } else if (phaseByTime > bossPhase) {
            bossPhase = phaseByTime; // 1->2 and 3->4: instant, no transformation sequence
          } else {
            // TEMPORARY: burst and volley disabled in phase 3 for
            // step-by-step testing -- phase 3 currently has only the
            // rage pulse active. re-enable once phase 3's full attack
            // set is being assembled.
            if (bossPhase < 3) {
              const burstInterval = 100;
              const volleyInterval = 130;

              bossAttackTimer++;
              if (bossAttackTimer >= burstInterval) {
                spawnBossBurst();
                bossAttackTimer = 0;
              }
              if (bossPhase >= 2) {
                bossVolleyTimer++;
                if (bossVolleyTimer >= volleyInterval) {
                  spawnBossVolleyTelegraph();
                  bossVolleyTimer = 0;
                }
              }
            }
            if (bossPhase === 3 || bossPhase === 4) {
              bossRagePulseTimer++;
              if (bossRagePulseTimer >= BOSS_RAGE_PULSE_INTERVAL) {
                spawnBossRagePulse();
                bossRagePulseTimer = 0;
              }
            }
            // Diagonal ring and double-wall code are left intact
            // above in case either is worth revisiting later; phase 4
            // now uses individual drones, one at a time.
            if (bossPhase === 3 || bossPhase === 4) {
              bossDroneFormationTimer++;
              if (bossDroneFormationTimer >= BOSS_DRONE_FORMATION_INTERVAL) {
                spawnBossDrone();
                bossDroneFormationTimer = 0;
              }
            }
            // phase 4's own addition: an occasional homing fragment
            if (bossPhase === 4) {
              bossHomingFragmentTimer++;
              if (bossHomingFragmentTimer >= BOSS_HOMING_FRAGMENT_INTERVAL) {
                spawnBossHomingFragment();
                bossHomingFragmentTimer = 0;
              }
            }
            // phase 5: charge beam laser -- gap between shots is
            // randomized (1.5-4s) and only starts counting once the
            // previous beam has fully cleared, so shots can never
            // overlap regardless of how short the roll is
            if (bossPhase === 5 && bossChargeBeamCount < 8) {
              const hasActiveBeamGate = gates.some(g => g.type === 'bosschargebeamtelegraph' || g.type === 'bosschargebeam');
              if (!hasActiveBeamGate) {
                bossChargeBeamTimer++;
                if (bossChargeBeamTimer >= bossChargeBeamNextGap) {
                  spawnBossChargeBeamTelegraph();
                  bossChargeBeamTimer = 0;
                  bossChargeBeamNextGap = BOSS_CHARGE_BEAM_MIN_GAP + Math.floor(Math.random() * (BOSS_CHARGE_BEAM_MAX_GAP - BOSS_CHARGE_BEAM_MIN_GAP + 1));
                }
              }
              // ember knockback -- runs on its own independent timer,
              // not tied to whether a beam is currently active. shut
              // off entirely once shot 8 (the super beam) begins
              bossEmberTimer++;
              if (bossEmberTimer >= BOSS_EMBER_INTERVAL) {
                spawnBossEmber();
                bossEmberTimer = 0;
              }
              // thick ash cloud -- same independent-timer pattern
              bossAshCloudTimer++;
              if (bossAshCloudTimer >= BOSS_ASH_CLOUD_INTERVAL) {
                spawnBossAshCloud();
                bossAshCloudTimer = 0;
              }
            }
            // the climactic finale: once shot 8 has fully cleared,
            // resume normal movement for a beat, then begin the final
            // charge that builds to the explosion ending
            if (bossPhase === 5 && bossChargeBeamCount >= 8 && !bossFinalChargeActive && !bossExplosionActive && !bossFullyDefeated) {
              const hasActiveBeamGate = gates.some(g => g.type === 'bosschargebeamtelegraph' || g.type === 'bosschargebeam');
              if (!hasActiveBeamGate) {
                bossChargeBeamTimer++;
                if (bossChargeBeamTimer >= BOSS_FINAL_CHARGE_DELAY) {
                  bossFinalChargeActive = true;
                  bossFinalChargeStartFrame = frame;
                  gates = gates.filter(g => g.type !== 'bossember' && g.type !== 'bossashcloud'); // clean screen for the boss death sequence
                  sfxSignalFinalCharge();
                }
              }
            }
            // fire the staggered second wall once its scheduled frame arrives
            if (bossDoubleWallPendingFrame >= 0 && frame >= bossDoubleWallPendingFrame) {
              gates.push({ type: 'bossragepulse', x: boss.x, y: boss.y + BOSS_DOUBLE_WALL_OFFSET, spawnFrame: frame, passed: false });
              bossDoubleWallPendingFrame = -1;
            }
            // final charge builds for BOSS_FINAL_CHARGE_DURATION, then detonates
            if (bossFinalChargeActive && (frame - bossFinalChargeStartFrame) >= BOSS_FINAL_CHARGE_DURATION) {
              bossFinalChargeActive = false;
              bossExplosionActive = true;
              bossExplosionStartFrame = frame;
              sfxSignalExplosion();
            }
          }

          if (bossTimer <= 0) {
            bossDefeated = true;
            bossDefeatFrame = frame;
          }
          if (bossExplosionActive && (frame - bossExplosionStartFrame) >= BOSS_EXPLOSION_DURATION) {
            bossExplosionActive = false;
            bossFullyDefeated = true;
            postBossDowntimeActive = true;
            postBossDowntimeStartFrame = frame;
            sfxSignalSilenced();
          }
          if (postBossDowntimeActive && (frame - postBossDowntimeStartFrame) >= POST_BOSS_DOWNTIME_DURATION) {
            postBossDowntimeActive = false;
            shipFlyOffActive = true;
            shipFlyOffStartFrame = frame;
            ship.vx = 0;
          }
          if (shipFlyOffActive && ship.x > W + 60) {
            shipFlyOffActive = false;
            triggerVictory();
          }
        }
      } else if (frame - bossDefeatFrame >= 90) {
        triggerVictory();
      }
    } else if (th.isMiniBossZone && miniBoss) {
      const entranceElapsed = frame - miniBossSpawnFrame;
      const entranceComplete = entranceElapsed >= MINI_BOSS_ENTRANCE_DURATION;
      if (!entranceComplete) {
        const entranceProgress = Math.min(1, entranceElapsed / MINI_BOSS_ENTRANCE_DURATION);
        const eased = 1 - Math.pow(1 - entranceProgress, 3); // ease-out cubic -- fast start, smooth settle
        miniBoss.r = miniBoss.maxR;
        miniBoss.x = (W + MINI_BOSS_OFFSCREEN_MARGIN) + (miniBoss.restX - (W + MINI_BOSS_OFFSCREEN_MARGIN)) * eased;
        miniBoss.y = miniBoss.baseY;
        if (entranceElapsed + 1 >= MINI_BOSS_ENTRANCE_DURATION) {
          miniBossFloatBlendStartX = miniBoss.x;
          miniBossFloatBlendStartY = miniBoss.y;
          miniBossFloatBlendStartFrame = frame;
          miniBossAttackState = th.miniBossVariant === 'core' ? 'coreFloating' : 'floating';
          miniBossAttackStateStartFrame = frame;
        }
      } else {
        miniBoss.r = miniBoss.maxR;
        if (th.miniBossVariant === 'core') {
          updateReactorCoreBoss();
        } else if (!miniBossDefeated) {
          const stateElapsed = frame - miniBossAttackStateStartFrame;
          if (miniBossCyclesCompleted >= 1 && miniBossAttackState === 'floating') {
            miniBossDefeated = true;
            miniBossDefeatFrame = frame;
          } else {
            if (miniBossAttackState === 'floating') {
              const blendDuration = 30;
              const blendElapsed = frame - miniBossFloatBlendStartFrame;
              const targetX = miniBoss.restX;
              const targetY = miniBoss.baseY + MINI_BOSS_FLOAT_AMPLITUDE * Math.sin((frame - miniBossSpawnFrame) * (2 * Math.PI / MINI_BOSS_FLOAT_PERIOD));
              if (blendElapsed >= 0 && blendElapsed < blendDuration) {
                // ease smoothly from wherever the boss actually was (e.g. right
                // after the flame wall's close-charge position) instead of
                // snapping instantly to its resting spot
                const t = blendElapsed / blendDuration;
                const eased = 1 - Math.pow(1 - t, 3);
                miniBoss.x = miniBossFloatBlendStartX + (targetX - miniBossFloatBlendStartX) * eased;
                miniBoss.y = miniBossFloatBlendStartY + (targetY - miniBossFloatBlendStartY) * eased;
              } else {
                miniBoss.x = targetX;
                miniBoss.y = targetY;
              }
              // long float duration for the very first entrance AND
              // specifically before attack set 2 (matches the same pause
              // length as the opening beat); short duration otherwise
              const floatDuration = (miniBossNextAttackSet === 2 || !miniBossHadFirstFloat) ? MINI_BOSS_INITIAL_FLOAT : MINI_BOSS_PRE_ATTACK_FLOAT;
              if (stateElapsed >= floatDuration) {
                if (miniBossNextAttackSet === 2 || miniBossNextAttackSet === 4) {
                  miniBossAttackState = 'chargingClose';
                  sfxFireBossChargeDash({ close: true });
                  if (miniBossNextAttackSet === 4) {
                    miniBossFlameWallDriftDir = Math.random() < 0.5 ? 1 : -1;
                  }
                } else if (miniBossNextAttackSet === 5) {
                  miniBossAttackState = 'barrageTelegraph';
                  miniBossBarrageEmbers = [];
                  miniBossBarrageWavesLaunched = 0;
                  miniBossBarragePhaseStartFrame = frame;
                  sfxFireBossBarrageTelegraph();
                } else {
                  miniBossAttackState = 'exiting';
                  miniBossChargeRound = miniBossNextAttackSet === 3 ? 2 : 1;
                  sfxFireBossExit();
                }
                miniBossAttackStateStartFrame = frame;
                miniBossHadFirstFloat = true;
              }
            } else if (miniBossAttackState === 'exiting') {
              miniBoss.x += MINI_BOSS_CHARGE_SPEED;
              miniBoss.y = miniBoss.baseY;
              if (miniBoss.x > W + MINI_BOSS_OFFSCREEN_MARGIN) {
                miniBossAttackState = 'waitingOffscreen';
                miniBossAttackStateStartFrame = frame;
                miniBossChargeHeights = shuffleArray(MINI_BOSS_CHARGE_HEIGHT_FRACS);
                miniBossChargeIndex = 0;
              }
            } else if (miniBossAttackState === 'waitingOffscreen') {
              if (stateElapsed >= MINI_BOSS_OFFSCREEN_WAIT) {
                miniBossAttackState = 'charging';
                miniBossAttackStateStartFrame = frame;
                const enterFromRight = miniBossChargeIndex % 2 === 0;
                // left-entering spawn is matched to the SAME travel distance as a
                // right-entering charge (not just a mirrored margin) -- since the
                // ship sits close to the left edge, mirroring the margin would give
                // barely half the reaction time. this keeps reaction time equal
                // regardless of direction.
                const rightwardTravelDistance = (W + MINI_BOSS_OFFSCREEN_MARGIN) - ship.x;
                miniBoss.x = enterFromRight ? (W + MINI_BOSS_OFFSCREEN_MARGIN) : (ship.x - rightwardTravelDistance);
                miniBoss.y = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * miniBossChargeHeights[miniBossChargeIndex];
                sfxFireBossChargeDash();
              }
            } else if (miniBossAttackState === 'waitingBetweenCharges') {
              if (stateElapsed >= MINI_BOSS_OFFSCREEN_WAIT) {
                miniBossAttackState = 'charging';
                miniBossAttackStateStartFrame = frame;
                const enterFromRight = miniBossChargeIndex % 2 === 0;
                // left-entering spawn is matched to the SAME travel distance as a
                // right-entering charge (not just a mirrored margin) -- since the
                // ship sits close to the left edge, mirroring the margin would give
                // barely half the reaction time. this keeps reaction time equal
                // regardless of direction.
                const rightwardTravelDistance = (W + MINI_BOSS_OFFSCREEN_MARGIN) - ship.x;
                miniBoss.x = enterFromRight ? (W + MINI_BOSS_OFFSCREEN_MARGIN) : (ship.x - rightwardTravelDistance);
                miniBoss.y = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * miniBossChargeHeights[miniBossChargeIndex];
                sfxFireBossChargeDash();
              }
            } else if (miniBossAttackState === 'charging') {
              // alternates direction each charge: index 0 and 2 move right-to-left
              // (entering from the right), index 1 moves left-to-right (entering
              // from the left) -- so the sequence is R->L, L->R, R->L
              const movingLeft = miniBossChargeIndex % 2 === 0;
              const chargeSpeed = miniBossChargeRound === 2 ? MINI_BOSS_CHARGE_SPEED_ROUND2 : MINI_BOSS_CHARGE_SPEED;
              miniBoss.x += movingLeft ? -chargeSpeed : chargeSpeed;
              const dx = ship.x - miniBoss.x, dy = ship.y - miniBoss.y;
              if (Math.sqrt(dx * dx + dy * dy) < SHIP_W * 0.4 + miniBoss.r) {
                tryEndGame('charging');
              }
              const exitedOffscreen = movingLeft ? (miniBoss.x < -MINI_BOSS_OFFSCREEN_MARGIN) : (miniBoss.x > W + MINI_BOSS_OFFSCREEN_MARGIN);
              if (exitedOffscreen) {
                miniBossChargeIndex++;
                if (miniBossChargeIndex < 3) {
                  miniBossAttackState = 'waitingBetweenCharges';
                  miniBossAttackStateStartFrame = frame;
                } else {
                  // this charge round is complete -- the 3rd charge (index 2)
                  // always exits to the left under this alternation, so flying
                  // back in from the right is still correct here regardless
                  // of which round just finished
                  miniBossAttackState = 'returning';
                  miniBossAttackStateStartFrame = frame;
                  miniBoss.x = W + MINI_BOSS_OFFSCREEN_MARGIN;
                  sfxMiniBossReturn();
                  if (miniBossChargeRound === 1) {
                    miniBossNextAttackSet = 2; // leads into the flame wall
                  } else {
                    miniBossNextAttackSet = 4; // leads into phase 4 -- the moving flame wall variant
                  }
                }
              }
            } else if (miniBossAttackState === 'returning') {
              const progress = Math.min(1, stateElapsed / MINI_BOSS_ENTRANCE_DURATION);
              const eased = 1 - Math.pow(1 - progress, 3);
              miniBoss.x = (W + MINI_BOSS_OFFSCREEN_MARGIN) + (miniBoss.restX - (W + MINI_BOSS_OFFSCREEN_MARGIN)) * eased;
              miniBoss.y = miniBoss.baseY;
              if (stateElapsed + 1 >= MINI_BOSS_ENTRANCE_DURATION) {
                miniBossFloatBlendStartX = miniBoss.x;
                miniBossFloatBlendStartY = miniBoss.y;
                miniBossFloatBlendStartFrame = frame;
                miniBossAttackState = 'floating';
                miniBossAttackStateStartFrame = frame;
              }
            } else if (miniBossAttackState === 'chargingClose') {
              miniBoss.y = miniBoss.baseY;
              const stopX = ship.x + MINI_BOSS_CLOSE_CHARGE_STOP_OFFSET;
              miniBoss.x = Math.max(stopX, miniBoss.x - MINI_BOSS_CHARGE_SPEED);
              if (miniBoss.x <= stopX) {
                miniBossAttackState = 'flameWallTelegraph';
                miniBossAttackStateStartFrame = frame;
                sfxFireBossFlameWallTelegraph();
              }
            } else if (miniBossAttackState === 'flameWallTelegraph') {
              miniBoss.y = miniBoss.baseY;
              if (stateElapsed >= MINI_BOSS_FLAME_WALL_TELEGRAPH) {
                miniBossAttackState = 'flameWallActive';
                miniBossAttackStateStartFrame = frame;
                startMoltenFlameWallSound();
              }
            } else if (miniBossAttackState === 'flameWallActive') {
              // phase 4 variant: the boss (and therefore the safe window,
              // which already derives from miniBoss.y below) slowly drifts
              // vertically instead of staying fixed -- clamped so it never
              // drifts the window off-screen
              const isMovingVariant = miniBossNextAttackSet === 4;
              if (isMovingVariant) {
                const minY = miniBoss.baseY - MINI_BOSS_FLAME_WALL_DRIFT_RANGE;
                const maxY = miniBoss.baseY + MINI_BOSS_FLAME_WALL_DRIFT_RANGE;
                miniBoss.y = Math.max(minY, Math.min(maxY, miniBoss.y + miniBossFlameWallDriftDir * MINI_BOSS_FLAME_WALL_DRIFT_SPEED));
              } else {
                miniBoss.y = miniBoss.baseY;
              }
              // lethal from one boss-diameter left of the boss all the way
              // to the right edge of the screen -- but since the ship's x
              // never changes in this game, that alone can never actually
              // threaten it. the real hazard is vertical: the ship must
              // also stay within the safe window's height, matching the
              // visual exactly (same shared constant used by both)
              const safeBoundary = miniBoss.x - miniBoss.r * 2;
              const windowH = MINI_BOSS_FLAME_WALL_WINDOW_H;
              const windowTop = Math.max(PLAY_TOP, Math.min(PLAY_BOTTOM - windowH, miniBoss.y - windowH / 2));
              const windowBottom = windowTop + windowH;
              const outsideSafeWindow = ship.y < windowTop || ship.y > windowBottom;
              if (ship.x >= safeBoundary || outsideSafeWindow) {
                tryEndGame('flameWallActive');
              }
              if (stateElapsed >= MINI_BOSS_FLAME_WALL_ACTIVE) {
                miniBossFloatBlendStartX = miniBoss.x;
                miniBossFloatBlendStartY = miniBoss.y;
                miniBossFloatBlendStartFrame = frame;
                miniBossAttackState = 'floating';
                miniBossAttackStateStartFrame = frame;
                if (isMovingVariant) {
                  miniBossNextAttackSet = 5; // leads into phase 5 -- the ember barrage
                } else {
                  miniBossNextAttackSet = 3; // leads into the second (faster) round of charges
                }
              }
            } else if (miniBossAttackState === 'barrageTelegraph') {
              miniBoss.x = miniBoss.restX;
              miniBoss.y = miniBoss.baseY + MINI_BOSS_BARRAGE_SWAY_RANGE * Math.sin((frame - miniBossBarragePhaseStartFrame) * (2 * Math.PI / MINI_BOSS_BARRAGE_SWAY_PERIOD));
              if (stateElapsed >= MINI_BOSS_BARRAGE_TELEGRAPH) {
                miniBossAttackState = 'barrageActive';
                miniBossAttackStateStartFrame = frame;
                startMoltenSqueezeSound();
              }
            } else if (miniBossAttackState === 'barrageActive') {
              // boss stays at its resting x for this entire attack -- only
              // the flame wall phases approach the ship -- but sways
              // vertically, so the player must track its current height to
              // know where each new wave's safe lane will be
              miniBoss.x = miniBoss.restX;
              miniBoss.y = miniBoss.baseY + MINI_BOSS_BARRAGE_SWAY_RANGE * Math.sin((frame - miniBossBarragePhaseStartFrame) * (2 * Math.PI / MINI_BOSS_BARRAGE_SWAY_PERIOD));

              // squeeze walls: an independent top/bottom pressure that
              // breathes in and out on its own schedule, unrelated to the
              // ember lanes -- surviving means finding a height clear of
              // both threats at once
              const squeezeGap = MINI_BOSS_SQUEEZE_MIN_GAP + (MINI_BOSS_SQUEEZE_MAX_GAP - MINI_BOSS_SQUEEZE_MIN_GAP) * (0.5 + 0.5 * Math.cos(stateElapsed * (2 * Math.PI / MINI_BOSS_SQUEEZE_PERIOD)));
              const squeezeCenter = (PLAY_TOP + PLAY_BOTTOM) / 2;
              miniBossSqueezeTopY = squeezeCenter - squeezeGap / 2;
              miniBossSqueezeBottomY = squeezeCenter + squeezeGap / 2;
              if (ship.y - SHIP_H / 2 <= miniBossSqueezeTopY || ship.y + SHIP_H / 2 >= miniBossSqueezeBottomY) {
                tryEndGame('barrageActive');
              }

              // launch a new wave when its scheduled time arrives -- 2 of 3
              // lanes (centered on the boss's CURRENT y) get an ember, the
              // third is always left clear
              const nextWaveDue = miniBossBarrageWavesLaunched * MINI_BOSS_BARRAGE_WAVE_INTERVAL;
              if (miniBossBarrageWavesLaunched < MINI_BOSS_BARRAGE_WAVE_COUNT && stateElapsed >= nextWaveDue) {
                const laneOffsets = [-MINI_BOSS_BARRAGE_LANE_SPACING, 0, MINI_BOSS_BARRAGE_LANE_SPACING];
                const safeLane = Math.floor(Math.random() * 3);
                for (let lane = 0; lane < 3; lane++) {
                  if (lane === safeLane) continue;
                  miniBossBarrageEmbers.push({
                    x: miniBoss.x,
                    y: miniBoss.y + laneOffsets[lane],
                    vx: -MINI_BOSS_BARRAGE_EMBER_SPEED
                  });
                }
                miniBossBarrageWavesLaunched++;
                sfxFireBossEmberLaunch();
              }

              // advance embers, check collision, and drop any that have
              // travelled well past the ship. Captures a local reference
              // since tryEndGame() can reentrantly trigger a respawn that
              // reassigns the global embers array (reseedZoneObstacles()
              // runs on every death) -- without this, the loop would end
              // up indexing into a brand new array mid-iteration
              const activeEmbers = miniBossBarrageEmbers;
              for (let i = activeEmbers.length - 1; i >= 0; i--) {
                const e = activeEmbers[i];
                e.x += e.vx;
                const dx = ship.x - e.x, dy = ship.y - e.y;
                if (Math.sqrt(dx * dx + dy * dy) < SHIP_W * 0.4 + MINI_BOSS_BARRAGE_EMBER_R) {
                  tryEndGame('coreFlame');
                  break; // ship has died (or ghost mode absorbed it) -- stop, a reentrant respawn may have already reset boss state
                }
                if (e.x < -100) {
                  activeEmbers.splice(i, 1);
                }
              }

              if (stateElapsed >= MINI_BOSS_BARRAGE_ACTIVE) {
                miniBossBarrageEmbers = [];
                miniBossAttackState = 'dying';
                miniBossAttackStateStartFrame = frame;
                miniBossDeathAshParticles = [];
                miniBossDeathPatches = [];
                sfxFireBossDeath();
                for (let i = 0; i < MINI_BOSS_DEATH_PATCH_COUNT; i++) {
                  miniBossDeathPatches.push({
                    angle: Math.random() * Math.PI * 2,
                    distFrac: 0.15 + Math.random() * 0.55,
                    sizeFrac: 0.35 + Math.random() * 0.35,
                    startFrac: (i / MINI_BOSS_DEATH_PATCH_COUNT) * 0.5 + Math.random() * 0.15
                  });
                }
              }
            } else if (miniBossAttackState === 'dying') {
              const dimEnd = MINI_BOSS_DEATH_DIM_DURATION;
              const ashEnd = dimEnd + MINI_BOSS_DEATH_ASH_DURATION;
              const disperseEnd = ashEnd + MINI_BOSS_DEATH_DISPERSE_DURATION;
              const ashProgress = Math.max(0, Math.min(1, (stateElapsed - dimEnd) / MINI_BOSS_DEATH_ASH_DURATION));
              const disperseProgress = Math.max(0, Math.min(1, (stateElapsed - ashEnd) / MINI_BOSS_DEATH_DISPERSE_DURATION));

              // slow trickle of ash flakes during the ashing-over stage,
              // ramping up into a heavier scatter during dispersal
              if (stateElapsed >= dimEnd && stateElapsed < ashEnd && stateElapsed % 8 === 0) {
                spawnMiniBossDeathAshParticle();
              } else if (stateElapsed >= ashEnd && stateElapsed < disperseEnd) {
                spawnMiniBossDeathAshParticle();
                if (frame % 2 === 0) spawnMiniBossDeathAshParticle();
              }
              if (stateElapsed === dimEnd) sfxFireBossAsh();
              if (stateElapsed === ashEnd) {
                stopMoltenDeathAshSound();
                sfxFireBossDisperse();
              }

              // advance existing particles regardless of sub-stage, so
              // ones spawned late in dispersal keep drifting/fading
              // through the defeat pause that follows
              for (let i = miniBossDeathAshParticles.length - 1; i >= 0; i--) {
                const p = miniBossDeathAshParticles[i];
                p.x += p.vx;
                p.y += p.vy + Math.sin(p.flutterPhase + frame * p.flutterSpeed) * 0.3;
                p.rotation += p.rotSpeed;
                p.life++;
                if (p.life >= p.maxLife) miniBossDeathAshParticles.splice(i, 1);
              }

              if (stateElapsed >= disperseEnd) {
                miniBossDefeated = true;
                miniBossDefeatFrame = frame;
              }
            }
          }
        } else if (miniBossWallRecedeStartFrame === -1 && frame - miniBossDefeatFrame >= MINI_BOSS_DEFEAT_PAUSE) {
          // the fight is over -- turn the zone into a real terrain run for
          // a short stretch, matching INFERNO's feel (same speed, wave
          // shape, and pattern DNA) but with the fork/branch sections
          // stripped out, before the normal zone-end goal. Set up right
          // away rather than waiting -- miniBoss stays alive so the arena
          // wall keeps drawing normally, and its own dark backdrop (drawn
          // after the terrain) hides the new terrain until the wall recedes
          th.obstacleShape = 'terrain';
          th.scrollMult = 1.5;
          th.ampMult = 1.2;
          th.freqMult = 1.3;
          th.pulseGap = false;
          th.gapFractionStart = 0.38;
          th.gapConstant = true;
          th.terrainSpacing = 34;
          th.terrainMaxDelta = 55;
          th.pattern = MINI_BOSS_ESCAPE_RUN_PATTERN;
          initTerrain();
          miniBossEscapeRunActive = true;
          miniBossEscapeRunStartDistance = distance;
          miniBossWallRecedeStartFrame = frame;
        } else if (miniBossWallRecedeStartFrame !== -1) {
          if (frame - miniBossWallRecedeStartFrame >= MINI_BOSS_WALL_RECEDE_DURATION) {
            miniBoss = null;
            miniBossWallRecedeStartFrame = -1;
          }
        }
      }
    }

    // portal ring: a visual marker that appears as the player approaches the
    // zone-end threshold, positioned so it lines up exactly with the moment
    // the warp triggers (both track the same effScroll each frame, so they
    // stay in sync without needing separate collision logic)
    if (!warpActive && (miniBossEscapeRunActive || (!th.isBossZone && !th.isMiniBossZone))) {
      const remaining = zoneEndRemainingDistance();
      if (!portalObject && remaining > 0 && remaining <= PORTAL_LEAD_DISTANCE) {
        portalObject = { x: ship.x + remaining * 10, forLevel: themeLevelReached };
        // nothing should exist beyond the portal -- clear out anything that
        // was already pre-spawned further out than where the portal now sits.
        // the portal ring itself is rendered with a halfWidth (oscillating
        // ~30-38px) extending backward from its center, so the safe boundary
        // is that far before portalObject.x, not the center point itself --
        // otherwise an object can pass this check while still visually
        // poking into the rendered ring. every type's own forward extent
        // (radius/half-width) must clear that boundary, not just its
        // center point -- otherwise a wide object centered just before it
        // can still have its edge poking past it. types with a rendered
        // tail get extra margin on top of that, since they scroll at the
        // same rate as the portal and any overlap at this exact moment
        // would persist for as long as both exist
        const portalSafeX = portalObject.x - 40;
        gates = gates.filter(g => gateClearsPortal(g, portalSafeX));
        if (terrainSegments.length) {
          terrainSegments = terrainSegments.filter(s => s.x < portalObject.x);
          if (terrainSegments.length < 2) {
            // keep at least the trailing edge so interpolation has something to work with
            terrainSegments.push({ x: portalObject.x, topY: terrainSegments[0] ? terrainSegments[0].topY : PLAY_TOP + 20, bottomY: terrainSegments[0] ? terrainSegments[0].bottomY : PLAY_BOTTOM - 20, islandTop: 0, islandBottom: 0 });
          }
        }
      }
      if (portalObject) {
        portalObject.x -= effScroll;
      }
    }

    if (warpActive) {
      warpTimer--;
      if (warpTimer <= 0) {
        finishWarp();
      }
    } else if (th.obstacleShape === 'terrain') {
      for (let s of terrainSegments) s.x -= effScroll;
      const spacing = th.terrainSpacing || 34;
      while (terrainSegments[terrainSegments.length - 1].x < W + spacing) {
        addTerrainSegment();
      }
      terrainSegments = terrainSegments.filter(s => s.x > -spacing * 2);

      const shipTop = ship.y - SHIP_H / 2;
      const shipBottom = ship.y + SHIP_H / 2;

      if (shipTop <= PLAY_TOP || shipBottom >= PLAY_BOTTOM) {
        if (ghostMode) clampGhostShipToPlayfield();
        else endGame();
      }

      const bounds = terrainBoundsAt(ship.x);
      if (bounds) {
        if (shipTop <= bounds.top || shipBottom >= bounds.bottom) {
          tryEndGame('terrain');
        }
        // fork/island: a solid obstruction in the middle splitting the path in two
        if (bounds.islandBottom > bounds.islandTop) {
          if (shipBottom > bounds.islandTop && shipTop < bounds.islandBottom) {
            tryEndGame('terrain');
          }
        }
      }
    } else {
      for (let g of gates) {
        if (g.type === 'turretshot') continue; // moved separately below via vx/vy
        if (g.type === 'boomerang') continue; // position is computed live from elapsed time, not scrolled
        if (g.type === 'bossattack') continue; // moved separately below via vx/vy
        if (g.type === 'bossragepulse') continue; // stationary at its spawn position, only its radius grows
        if (g.type === 'bossdiagonalring') continue; // stationary at its spawn position, only its radius grows
        if (g.type === 'bossdrone') continue; // moved separately below via vx
        if (g.type === 'bossember') continue; // moved separately below via vx/vy
        if (g.type === 'bossashcloud') continue; // moved separately below via vx
        g.x -= (g.type === 'fireball' ? effScroll * fireballSpeedMult : (g.type === 'zone2storm' ? effScroll * 1.4 : (g.type === 'securitydrone' ? effScroll * g.speedMult : effScroll)));
        if (g.type === 'cloudarc') g.x2 -= effScroll; // second endpoint isn't covered by the g.x update above
      }
      for (const g of gates) {
        if (g.type === 'turretshot') { g.x += g.vx; g.y += g.vy; }
        if (g.type === 'bossattack') { g.x += g.vx; g.y += g.vy; }
        if (g.type === 'bossember') { g.x += g.vx; g.y += g.vy; }
        if (g.type === 'bossashcloud') { g.x += g.vx; }
        if (g.type === 'bossdrone') {
          g.x += g.vx;
          if (g.homing) {
            const clampedTargetY = Math.max(g.spawnY - BOSS_HOMING_MAX_DRIFT, Math.min(g.spawnY + BOSS_HOMING_MAX_DRIFT, ship.y));
            const dy = clampedTargetY - g.y;
            g.vy = Math.max(-BOSS_HOMING_MAX_VY, Math.min(BOSS_HOMING_MAX_VY, dy * BOSS_HOMING_TURN_RATE));
            g.y += g.vy;
          }
        }
      }
      // faster hazards (Gravity Well tornados at 1.4x scroll) can catch the
      // portal from the right after it appears -- keep culling so nothing
      // pops into the ring and then gets deleted a beat later
      if (portalObject) {
        const portalSafeX = portalObject.x - 40;
        gates = gates.filter(g => gateClearsPortal(g, portalSafeX));
      }

      if (th.obstacleShape === 'fireball') {
        if (!portalObject) {
          fireballSpawnCounter++;
          const nextInterval = th.pattern[patternIndex % th.pattern.length].interval;
          if (fireballSpawnCounter >= nextInterval) {
            spawnFireball();
            fireballSpawnCounter = 0;
          }
        }
      } else if (th.obstacleShape !== 'none') {
        lastSpawnX -= effScroll;
        if (!portalObject && (gates.length === 0 || lastSpawnX < W + 150)) {
          const nextSpacing = th.pattern[patternIndex % th.pattern.length].spacing;
          const nextX = (gates.length ? lastSpawnX : W + 150) + nextSpacing;
          if (!spawnWouldHitPortal(nextX, 180)) {
            spawnGate(nextX);
            lastSpawnX = nextX;
          }
        }
      }

      // secondary obstacle layer (e.g. Zone 6's incoming flame projectiles) --
      // an independent timer running alongside the primary obstacle system,
      // not replacing it
      if (th.extraFireballPattern && !portalObject) {
        extraFireballCounter++;
        const nextInterval = th.extraFireballPattern[extraFireballPatternIndex % th.extraFireballPattern.length].interval;
        if (extraFireballCounter >= nextInterval) {
          spawnExtraFireball();
          extraFireballCounter = 0;
        }
      }
      if (th.extraToxicPoolPattern && !portalObject) {
        extraToxicCounter++;
        const nextInterval = th.extraToxicPoolPattern[extraToxicPatternIndex % th.extraToxicPoolPattern.length].interval;
        if (extraToxicCounter >= nextInterval) {
          spawnExtraToxicPool();
          extraToxicCounter = 0;
        }
      }
      if (th.extraGeyserPattern && !portalObject) {
        extraGeyserCounter++;
        const nextInterval = th.extraGeyserPattern[extraGeyserPatternIndex % th.extraGeyserPattern.length].interval;
        if (extraGeyserCounter >= nextInterval) {
          spawnExtraGeyser();
          extraGeyserCounter = 0;
        }
      }
      if (th.extraShootingStarPattern && !portalObject) {
        extraStarCounter++;
        const nextInterval = th.extraShootingStarPattern[extraStarPatternIndex % th.extraShootingStarPattern.length].interval;
        if (extraStarCounter >= nextInterval) {
          spawnExtraShootingStar();
          extraStarCounter = 0;
        }
      }
      if (th.movingDoorPattern && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        // only the last special door event gets protected -- that was the
        // one specific spot that looked bad; the earlier events are left
        // alone since the original unrestricted timing felt right there
        const lastEvent = th.specialDoorEvents && th.specialDoorEvents.length
          ? th.specialDoorEvents[th.specialDoorEvents.length - 1] : null;
        const nearLastEvent = lastEvent &&
          zoneProgress >= lastEvent.triggerDistance - lastEvent.keyLeadDistance - 40 &&
          zoneProgress <= lastEvent.triggerDistance + 40;
        if (!nearLastEvent) {
          extraMovingDoorCounter++;
          const nextInterval = th.movingDoorPattern[extraMovingDoorPatternIndex % th.movingDoorPattern.length].interval;
          if (extraMovingDoorCounter >= nextInterval) {
            spawnExtraMovingDoor();
            extraMovingDoorCounter = 0;
          }
        }
      }
      if (th.blackHoleEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.blackHoleEvents.forEach((event, i) => {
          if (!blackHoleEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnBlackHoleEvent(i);
            blackHoleEventsSpawned[i] = true;
          }
        });
      }
      if (th.windVortexEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.windVortexEvents.forEach((event, i) => {
          if (!windVortexEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnWindVortexEvent(i);
            windVortexEventsSpawned[i] = true;
          }
        });
      }
      if (th.cloudArcEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.cloudArcEvents.forEach((event, i) => {
          if (!cloudArcEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnCloudArcEvent(i);
            cloudArcEventsSpawned[i] = true;
          }
        });
      }
      if (th.lasergridEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.lasergridEvents.forEach((event, i) => {
          if (!lasergridEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnLaserGridEvent(i);
            lasergridEventsSpawned[i] = true;
          }
        });
      }
      if (th.droneSwarmEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.droneSwarmEvents.forEach((event, i) => {
          if (!droneSwarmEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnDroneSwarmEvent(i);
            droneSwarmEventsSpawned[i] = true;
          }
        });
      }
      if (th.billboardEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.billboardEvents.forEach((event, i) => {
          if (!billboardEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnBillboardEvent(i);
            billboardEventsSpawned[i] = true;
          }
        });
      }
      if (th.searchlightEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.searchlightEvents.forEach((event, i) => {
          if (!searchlightEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnSearchlightEvent(i);
            searchlightEventsSpawned[i] = true;
          }
        });
      }
      if (th.turretEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.turretEvents.forEach((event, i) => {
          if (!turretEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnTurretEvent(i);
            turretEventsSpawned[i] = true;
          }
        });
      }
      if (th.signalCorruptionEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.signalCorruptionEvents.forEach((event, i) => {
          if (!signalCorruptionEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnSignalCorruptionEvent(i);
            signalCorruptionEventsSpawned[i] = true;
          }
        });
      }
      if (th.empEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.empEvents.forEach((event, i) => {
          if (!empEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnEmpEvent(i);
            empEventsSpawned[i] = true;
          }
        });
      }
      if (th.pulsingOrbEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.pulsingOrbEvents.forEach((event, i) => {
          if (!pulsingOrbEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnPulsingOrbEvent(i);
            pulsingOrbEventsSpawned[i] = true;
          }
        });
      }
      if (th.boomerangEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.boomerangEvents.forEach((event, i) => {
          if (!boomerangEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnBoomerangEvent(i);
            boomerangEventsSpawned[i] = true;
          }
        });
      }
      if (th.echoTrailEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.echoTrailEvents.forEach((event, i) => {
          if (!echoTrailEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnEchoTrailEvent(i);
            echoTrailEventsSpawned[i] = true;
          }
        });
      }
      if (th.extraStormPattern && !portalObject) {
        extraStormCounter++;
        const nextStorm = th.extraStormPattern[extraStormPatternIndex % th.extraStormPattern.length];
        const nextInterval = nextStorm.interval;
        if (extraStormCounter >= nextInterval) {
          if (spawnWouldHitPortal(W + nextStorm.r + 40, nextStorm.r)) {
            extraStormCounter = nextInterval;
          } else {
            spawnZone2Storm();
            extraStormCounter = 0;
          }
        }
      }
      if (th.extraOrbiterPattern && !portalObject) {
        extraOrbiterCounter++;
        const nextInterval = th.extraOrbiterPattern[extraOrbiterPatternIndex % th.extraOrbiterPattern.length].interval;
        if (extraOrbiterCounter >= nextInterval) {
          spawnExtraOrbiter();
          extraOrbiterCounter = 0;
        }
      }
      if (th.extraArcPlanetPattern && !portalObject) {
        extraArcPlanetCounter++;
        const nextInterval = th.extraArcPlanetPattern[extraArcPlanetPatternIndex % th.extraArcPlanetPattern.length].interval;
        if (extraArcPlanetCounter >= nextInterval) {
          spawnExtraArcPlanet();
          extraArcPlanetCounter = 0;
        }
      }
      if (th.lensingZoneEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.lensingZoneEvents.forEach((event, i) => {
          if (!lensingZoneEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnLensingZoneEvent(i);
            lensingZoneEventsSpawned[i] = true;
          }
        });
      }
      if (th.supernovaEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.supernovaEvents.forEach((event, i) => {
          if (!supernovaEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnSupernovaEvent(i);
            supernovaEventsSpawned[i] = true;
          }
        });
      }
      // check existing supernova planets for the moment their warning
      // period completes -- detonates once, scattering into debris
      for (const g of gates) {
        if (g.type === 'supernova' && !g.detonated) {
          if (g.variant === 'onscreen' && g.onscreenFrame === null && g.x <= W) {
            g.onscreenFrame = frame;
          }
          const t = supernovaPhaseElapsed(g);
          if (t >= 0 && t >= supernovaEffectiveDormant(g) + g.warningFrames) {
            g.detonated = true;
            g.detonationFrame = frame;
            spawnSupernovaDebris(g);
          }
        }
      }
      // check existing turrets for the moment each successive shot is
      // due, firing a fast projectile from the turret's current position
      for (const g of gates) {
        if (g.type === 'turret' && g.shotsFired < g.numShots) {
          const elapsed = frame - g.spawnFrame;
          const nextShotTime = g.shotsFired * g.fireInterval;
          if (elapsed >= nextShotTime) {
            const angleRad = g.fireAngleDeg * Math.PI / 180;
            gates.push({
              type: 'turretshot',
              x: g.x,
              y: g.y,
              r: g.projectileR,
              vx: -g.projectileSpeed * Math.cos(angleRad),
              vy: g.projectileSpeed * Math.sin(angleRad),
              passed: false
            });
            g.shotsFired++;
            sfxHazardFire('turretshot');
          }
        }
      }
      if (th.specialDoorEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.specialDoorEvents.forEach((event, i) => {
          if (!specialEventsSpawned[i] && zoneProgress >= event.triggerDistance - event.keyLeadDistance) {
            spawnKeyAndDoor(i);
            specialEventsSpawned[i] = true;
          }
        });
      }
      if (th.extraSparkHubPattern && !portalObject) {
        extraHubCounter++;
        const nextInterval = th.extraSparkHubPattern[extraHubPatternIndex % th.extraSparkHubPattern.length].interval;
        if (extraHubCounter >= nextInterval) {
          spawnExtraSparkHub();
          extraHubCounter = 0;
        }
      }
      // check existing hubs for the moment charging completes -- fires a
      // one-time burst of 8 projectiles, then waits for the next cycle
      for (const g of gates) {
        if (g.type === 'sparkhub') {
          if (sparkHubIsCharging(g)) {
            g.hasFiredThisCycle = false;
          } else if (!g.hasFiredThisCycle) {
            fireSparkBurst(g);
            g.hasFiredThisCycle = true;
          }
        }
      }

      gates = gates.filter(g => {
        if (g.type === 'asteroid' || g.type === 'fireball' || g.type === 'pendulum' || g.type === 'wreckage') return g.x + g.r > -80;
        if (g.type === 'zone2storm') return g.x + g.r > -80;
        if (g.type === 'securitydrone') return g.x + g.r > -80;
        if (g.type === 'turretshot') return g.x + g.r > -80;
        if (g.type === 'bossattack') return g.x + g.r > -80 && g.y + g.r > -80 && g.y - g.r < H + 80;
        if (g.type === 'bossember') return !g.hit && g.x + g.r > -80 && g.y + g.r > -80 && g.y - g.r < H + 80;
        if (g.type === 'bossashcloud') return g.x + g.r > -80;
        if (g.type === 'bossragepulse') return liveRagePulseRadius(g) < BOSS_RAGE_PULSE_MAX_R;
        if (g.type === 'bossdiagonalring') return liveDiagonalRingRadius(g) < BOSS_DIAGONAL_RING_MAX_R;
        if (g.type === 'bossdrone') return g.x + g.r > -80;
        if (g.type === 'bossvolleytelegraph') return !g.resolved;
        if (g.type === 'bosschargebeamtelegraph') return !g.resolved;
        if (g.type === 'bosschargebeam') return (frame - g.spawnFrame) < (g.fireDuration || BOSS_CHARGE_BEAM_FIRE_DURATION);
        if (g.type === 'turret') return g.x + 22 > -80;
        if (g.type === 'blackhole') return g.x + g.reachR > -80;
        if (g.type === 'windvortex') return g.x + g.reachR > -80;
        if (g.type === 'cloudarc') return g.x2 > -80;
        if (g.type === 'orbiter') return g.x + g.orbitRadius + g.r > -80;
        if (g.type === 'arcplanet') return g.x + g.r > -80;
        if (g.type === 'lensingzone') return g.x + g.zoneRadius > -80;
        if (g.type === 'signalcorruption') return g.x + g.zoneWidth / 2 > -80;
        if (g.type === 'supernova') {
          if (g.detonated) return (frame - g.detonationFrame) < 20;
          return g.x + g.planetR > -80;
        }
        if (g.type === 'toxicpool') return g.x + g.baseR + g.pulseAmp > -80;
        if (g.type === 'aciddrip') return liveAcidDripY(g) < PLAY_BOTTOM + g.r && g.x + g.r > -80;
        if (g.type === 'geyser') return g.x + g.width / 2 > -80;
        if (g.type === 'shootingstar') return !shootingStarDone(g) && g.x + g.r > -80;
        if (g.type === 'movingdoor' || g.type === 'specialdoor') return g.x + g.width / 2 > -80;
        if (g.type === 'accesskey') return !g.collected && g.x + g.r > -80;
        if (g.type === 'sparkhub') return g.x > -120;
        if (g.type === 'sparkprojectile' || g.type === 'supernovadebris') {
          const pos = liveProjectilePos(g);
          const onScreen = pos.x > -80 && pos.x < W + 150 && pos.y > PLAY_TOP - 100 && pos.y < PLAY_BOTTOM + 100;
          // safety net: most directions clear the screen within ~450
          // frames naturally, but a couple of fixed angles can end up with
          // near-zero net horizontal velocity once combined with the
          // scroll, which would otherwise take an enormous number of
          // frames to exit and accumulate across bursts
          const withinSafetyNet = (frame - g.spawnFrame) < 500;
          return onScreen && withinSafetyNet;
        }
        if (g.type === 'hbar') return g.x + g.width / 2 > -80;
        if (g.type === 'billboard') return g.x + g.panelWidth / 2 > -80;
        if (g.type === 'emp') return g.x + 30 > -80;
        if (g.type === 'echotrail') return g.x + g.zoneWidth / 2 > -80;
        if (g.type === 'pulsingorb') {
          const keep = g.x + g.maxR > -80;
          if (!keep) stopPulsingOrbSound(g);
          return keep;
        }
        if (g.type === 'boomerang') {
          const keep = !boomerangDone(g);
          if (!keep) stopBoomerangSound(g);
          return keep;
        }
        if (g.type === 'searchlight') return g.x > -880;
        if (g.type === 'lasergrid') return g.x + g.gridWidth > -80;
        if (g.type === 'lbolt') return g.x + g.swingWidth / 2 > -80;
        if (g.type === 'barrier') return g.x + g.width / 2 > -50;
        if (g.type === 'lightning') return g.x + g.span / 2 > -50;
        return g.x + GATE_WIDTH > -50;
      });

      for (let g of gates) {
        if (!g.passed && g.x < ship.x) {
          g.passed = true;
        }
      }

      const shipLeft = ship.x - SHIP_W / 2;
      const shipRight = ship.x + SHIP_W / 2;
      const shipTop = ship.y - SHIP_H / 2;
      const shipBottom = ship.y + SHIP_H / 2;
      const shipR = SHIP_W * 0.4;

      for (const g of gates) {
        if (g.type === 'pendulum') {
          const bobY = livePendulumBobY(g);
          const prev = g._prevBobY;
          g._prevBobY = bobY;
          const onScreen = g.x > -40 && g.x < W + 40;
          const nearMissX = Math.abs(g.x - ship.x) < SHIP_W / 2 + g.r + 28;
          if (prev != null && onScreen && nearMissX && (prev - ship.y) * (bobY - ship.y) <= 0 && Math.abs(bobY - prev) > 1.2) {
            if (sfxHazardRateOk('pendulumwhoosh', 200)) playPendulumSwoosh();
          }
        } else if (g.type === 'emp') {
          const discharging = empIsDischarging(g);
          const was = g._wasDischarging;
          g._wasDischarging = discharging;
          if (was === false && discharging && g.x > -60 && g.x < W + 80) {
            if (sfxHazardRateOk('empdischarge', 140)) playEmpDischarge();
          }
        }
      }

      if (shipTop <= PLAY_TOP || shipBottom >= PLAY_BOTTOM) {
        if (ghostMode) clampGhostShipToPlayfield();
        else endGame();
      }

      for (let g of gates) {
        if (g.type === 'asteroid' || g.type === 'fireball' || g.type === 'pendulum' || g.type === 'aciddrip' || g.type === 'shootingstar' || g.type === 'wreckage' || g.type === 'zone2storm' || g.type === 'securitydrone' || g.type === 'turretshot' || g.type === 'bossdrone') {
          const gy = g.type === 'fireball' ? liveFireballY(g) : (g.type === 'pendulum' ? livePendulumBobY(g) : (g.type === 'aciddrip' ? liveAcidDripY(g) : (g.type === 'shootingstar' ? liveShootingStarY(g) : (g.type === 'zone2storm' ? liveStormY(g) : g.y))));
          const dx = ship.x - g.x;
          const dy = ship.y - gy;
          if (Math.sqrt(dx * dx + dy * dy) < shipR + g.r) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'blackhole') {
          // only the small lethal core kills on contact -- the much
          // larger reach radius has no collision of its own, it only
          // affects gravity/lift (handled earlier in the physics step)
          const dx = ship.x - g.x;
          const dy = ship.y - g.y;
          if (Math.sqrt(dx * dx + dy * dy) < shipR + g.coreR) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'lensingzone') {
          // same split as a black hole: only the small core is lethal,
          // the surrounding distortion field is purely visual -- the
          // challenge is that the visual noise makes the core harder to
          // spot, not that the hitbox differs from what's shown
          const dx = ship.x - g.x;
          const dy = ship.y - g.y;
          if (Math.sqrt(dx * dx + dy * dy) < shipR + g.coreR) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'supernova') {
          // solid and lethal for its whole dormant + warning lifetime;
          // once detonated it has no collision of its own (debris takes
          // over as separate objects)
          if (!g.detonated) {
            const dx = ship.x - g.x;
            const dy = ship.y - g.y;
            if (Math.sqrt(dx * dx + dy * dy) < shipR + g.planetR) {
              tryEndGame(g.type);
            }
          }
        } else if (g.type === 'supernovadebris') {
          const pos = liveProjectilePos(g);
          const dx = ship.x - pos.x, dy = ship.y - pos.y;
          if (Math.sqrt(dx * dx + dy * dy) < shipR + g.r) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'toxicpool') {
          const liveR = liveToxicPoolRadius(g);
          const dx = ship.x - g.x;
          const dy = ship.y - g.y;
          if (Math.sqrt(dx * dx + dy * dy) < shipR + liveR) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'geyser') {
          const h = liveGeyserHeight(g);
          const left = g.x - g.width / 2;
          const right = g.x + g.width / 2;
          const spikeTop = g.pivotSide === 'floor' ? PLAY_BOTTOM - h : PLAY_TOP;
          const spikeBottom = g.pivotSide === 'floor' ? PLAY_BOTTOM : PLAY_TOP + h;
          if (shipRight > left && shipLeft < right && shipBottom > spikeTop && shipTop < spikeBottom) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'hbar') {
          const barY = liveGateCenter(g);
          const barLeft = g.x - g.width / 2;
          const barRight = g.x + g.width / 2;
          const barTop = barY - g.thickness / 2;
          const barBottom = barY + g.thickness / 2;
          if (shipRight > barLeft && shipLeft < barRight && shipBottom > barTop && shipTop < barBottom) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'billboard') {
          const panelLeft = g.x - g.panelWidth / 2;
          const panelRight = g.x + g.panelWidth / 2;
          const panelTop = g.anchor === 'top' ? PLAY_TOP : PLAY_BOTTOM - g.panelHeight;
          const panelBottom = g.anchor === 'top' ? PLAY_TOP + g.panelHeight : PLAY_BOTTOM;
          if (shipRight > panelLeft && shipLeft < panelRight && shipBottom > panelTop && shipTop < panelBottom) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'emp') {
          if (empIsDischarging(g)) {
            const empLeft = g.x - 30, empRight = g.x + 30;
            const empTop = g.anchor === 'top' ? PLAY_TOP : PLAY_BOTTOM - g.reachDepth;
            const empBottom = g.anchor === 'top' ? PLAY_TOP + g.reachDepth : PLAY_BOTTOM;
            if (shipRight > empLeft && shipLeft < empRight && shipBottom > empTop && shipTop < empBottom) {
              tryEndGame(g.type);
            }
          }
        } else if (g.type === 'echotrail') {
          if (Math.abs(ship.x - g.x) < g.zoneWidth / 2) {
            const histIdx = shipYHistory.length - 1 - g.delayFrames;
            if (histIdx >= 0) {
              const historicalY = shipYHistory[histIdx];
              if (Math.abs(ship.y - historicalY) < g.dangerThreshold) {
                tryEndGame(g.type);
              }
            }
          }
        } else if (g.type === 'pulsingorb') {
          const liveR = livePulsingOrbRadius(g);
          const dx = ship.x - g.x, dy = ship.y - g.y;
          if (Math.sqrt(dx * dx + dy * dy) < shipR + liveR) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'boomerang') {
          const pos = liveBoomerangPos(g);
          const dx = ship.x - pos.x, dy = ship.y - pos.y;
          if (Math.sqrt(dx * dx + dy * dy) < shipR + g.r) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'bossattack') {
          const dx = ship.x - g.x, dy = ship.y - g.y;
          if (Math.sqrt(dx * dx + dy * dy) < shipR + g.r) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'bossember') {
          const dx = ship.x - g.x, dy = ship.y - g.y;
          if (!g.hit && Math.sqrt(dx * dx + dy * dy) < shipR + g.r) {
            // non-lethal -- a brief involuntary nudge, not a life loss
            const direction = Math.random() < 0.5 ? -1 : 1;
            ship.vy += direction * BOSS_EMBER_KNOCKBACK;
            ship.vy = Math.max(MAX_RISE_SPEED, Math.min(MAX_FALL_SPEED, ship.vy));
            g.hit = true;
          }
        } else if (g.type === 'bossragepulse') {
          const liveR = liveRagePulseRadius(g);
          const wallX = g.x - liveR; // expanding leftward, toward the ship
          const withinVerticalBand = Math.abs(ship.y - g.y) < BOSS_RAGE_PULSE_THICKNESS / 2 + shipR;
          const withinSweptRegion = ship.x <= g.x + shipR && ship.x >= wallX - shipR; // entire visual is lethal, not just the leading edge
          if (withinVerticalBand && withinSweptRegion) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'bosschargebeam') {
          const withinBeamBand = Math.abs(ship.y - g.lockedY) < (g.thickness || BOSS_CHARGE_BEAM_THICKNESS) / 2 + shipR;
          if (withinBeamBand) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'bossdiagonalring') {
          const liveR = liveDiagonalRingRadius(g);
          const wallX = g.x - liveR;
          const withinWallWidth = Math.abs(ship.x - wallX) < 15 + shipR;
          if (withinWallWidth) {
            const center1 = g.y + BOSS_DIAGONAL_RING_SLOPE * liveR;
            const center2 = g.y - BOSS_DIAGONAL_RING_SLOPE * liveR;
            const inBand1 = Math.abs(ship.y - center1) < BOSS_DIAGONAL_RING_THICKNESS / 2 + shipR;
            const inBand2 = Math.abs(ship.y - center2) < BOSS_DIAGONAL_RING_THICKNESS / 2 + shipR;
            if (inBand1 || inBand2) {
              tryEndGame(g.type);
            }
          }
        } else if (g.type === 'turret') {
          const mountLeft = g.x - 22, mountRight = g.x + 22;
          const mountTop = g.anchor === 'top' ? PLAY_TOP : g.y - 4;
          const mountBottom = g.anchor === 'top' ? g.y + 4 : PLAY_BOTTOM;
          if (shipRight > mountLeft && shipLeft < mountRight && shipBottom > mountTop && shipTop < mountBottom) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'searchlight') {
          const ep = liveSearchlightEndpoint(g);
          const dist = pointToSegmentDist(ship.x, ship.y, g.x, PLAY_TOP, ep.x, ep.y);
          if (dist < shipR + g.beamWidth / 2) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'lasergrid') {
          const halfThick = 4;
          for (const seg of g.segments) {
            if (seg.decorative) continue;
            let segLeft, segRight, segTop, segBottom;
            if (seg.type === 'h') {
              segLeft = g.x + seg.xRel1; segRight = g.x + seg.xRel2;
              segTop = seg.y - halfThick; segBottom = seg.y + halfThick;
            } else {
              segLeft = g.x + seg.xRel - halfThick; segRight = g.x + seg.xRel + halfThick;
              segTop = seg.y1; segBottom = seg.y2;
            }
            if (shipRight > segLeft && shipLeft < segRight && shipBottom > segTop && shipTop < segBottom) {
              tryEndGame(g.type);
              break;
            }
          }
        } else if (g.type === 'lbolt') {
          if (barrierIsActive(g)) {
            // quick bounding-box reject before the more expensive polygon
            // test, then check the actual rendered silhouette so the
            // hitbox matches what the player sees (thin shapes like E5/E6
            // are much narrower than their full bounding box)
            const bLeft = g.x - g.swingWidth / 2;
            const bRight = g.x + g.swingWidth / 2;
            const bTop = g.y - g.height / 2;
            const bBottom = g.y + g.height / 2;
            if (shipRight > bLeft && shipLeft < bRight && shipBottom > bTop && shipTop < bBottom) {
              const topY = g.y - g.height / 2;
              const poly = g.shape.map(([nx, ny]) => [g.x + nx * g.swingWidth / 2, topY + ny * g.height]);
              if (rectIntersectsPolygon(shipLeft, shipTop, shipRight, shipBottom, poly)) {
                tryEndGame(g.type);
              }
            }
          }
        } else if (g.type === 'cloudarc') {
          if (barrierIsActive(g) && shipRight > g.x && shipLeft < g.x2) {
            const shipCenterX = (shipLeft + shipRight) / 2;
            const t = Math.max(0, Math.min(1, (shipCenterX - g.x) / (g.x2 - g.x)));
            const arcY = g.y + (g.y2 - g.y) * t;
            const halfThick = 9;
            if (shipBottom > arcY - halfThick && shipTop < arcY + halfThick) {
              tryEndGame(g.type);
            }
          }
        } else if (g.type === 'barrier') {
          if (barrierIsActive(g) && shipRight > g.x - g.width / 2 && shipLeft < g.x + g.width / 2) {
            const gTop = g.gapCenter - g.gapHeight / 2;
            const gBottom = g.gapCenter + g.gapHeight / 2;
            if (shipTop <= gTop || shipBottom >= gBottom) {
              tryEndGame(g.type);
            }
          }
        } else if (g.type === 'movingdoor') {
          if (shipRight > g.x - g.width / 2 && shipLeft < g.x + g.width / 2) {
            const ranges = liveDoorGapRanges(g);
            const safe = ranges.some(r => shipTop > r.top && shipBottom < r.bottom);
            if (!safe) {
              tryEndGame(g.type);
            }
          }
        } else if (g.type === 'accesskey') {
          const dx = ship.x - g.x;
          const dy = ship.y - g.y;
          if (Math.sqrt(dx * dx + dy * dy) < shipR + g.r) {
            specialDoorUnlocked[g.eventIndex] = true;
            g.collected = true;
            sfxHazardFire('accesskey');
          }
        } else if (g.type === 'specialdoor') {
          if (!specialDoorUnlocked[g.eventIndex] && shipRight > g.x - g.width / 2 && shipLeft < g.x + g.width / 2) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'sparkprojectile') {
          const pos = liveProjectilePos(g);
          const dx = ship.x - pos.x, dy = ship.y - pos.y;
          if (Math.sqrt(dx * dx + dy * dy) < shipR + g.r) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'orbiter') {
          const pos = liveOrbiterPos(g);
          const dx = ship.x - pos.x, dy = ship.y - pos.y;
          if (Math.sqrt(dx * dx + dy * dy) < shipR + g.r) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'arcplanet') {
          const gy = liveArcPlanetY(g);
          const dx = ship.x - g.x, dy = ship.y - gy;
          if (Math.sqrt(dx * dx + dy * dy) < shipR + g.r) {
            tryEndGame(g.type);
          }
        } else if (g.type === 'lightning') {
          const left = g.x - g.span / 2;
          const right = g.x + g.span / 2;
          if (shipRight > left && shipLeft < right) {
            const t = Math.max(0, Math.min(1, (ship.x - left) / g.span));
            const boltY = g.y1 + (g.y2 - g.y1) * t;
            const dTop = boltY - g.thickness / 2;
            const dBottom = boltY + g.thickness / 2;
            if (shipBottom > dTop && shipTop < dBottom) {
              tryEndGame(g.type);
            }
          }
        } else if (shipRight > g.x && shipLeft < g.x + GATE_WIDTH) {
          const center = liveGateCenter(g);
          const gap = liveGateGap(g);
          const gTop = center - gap / 2;
          const gBottom = center + gap / 2;
          if (shipTop <= gTop || shipBottom >= gBottom) {
            tryEndGame(g.type);
          }
        }
      }
    }

    // keep ship well clear of the boundaries during warp too (soft clamp,
    // no death) -- gravity/lift keep running through the entire tunnel
    // effect even though there's nothing to see or react to, so this needs
    // a real margin, not just enough to avoid dying mid-tunnel
    if (warpActive) {
      const warpMargin = 130;
      const minY = PLAY_TOP + warpMargin;
      const maxY = PLAY_BOTTOM - warpMargin;
      if (ship.y < minY) { ship.y = minY; ship.vy = 0; }
      if (ship.y > maxY) { ship.y = maxY; ship.vy = 0; }
    }
  } else if (state === 'victory') {
    // keep the background alive behind the scoreboard rather than
    // freezing on whatever frame the ship flew off at
    frame++;
    updateBackgroundParticles(currentTheme());
  }
}

function endGame(mercyEligible, opts) {
  if (state !== 'playing') return; // already dying/dead/not in a run
  if (ghostMode) {
    clampGhostShipToPlayfield();
    return;
  }
  if (bossFinalChargeActive || bossExplosionActive || bossFullyDefeated) return; // victory is already secured -- wall collisions are normally unconditional instant death, but not during the boss's death sequence or the fly-off that follows
  if (!opts || opts.playCollision !== false) sfxCollision();
  stopLiftSound();
  stopGlowDangerSound();
  stopFireballBreathSound();
  stopToxicHazardSounds();
  stopDustStormSound();
  stopMeteorStreakSound();
  stopStormSkiesHazardSounds();
  stopMovingDoorSound();
  stopBlackHoleSound();
  stopMoltenCoreIdleSound();
  stopMoltenFlameWallSound();
  stopMoltenSqueezeSound();
  stopMoltenDeathAshSound();
  stopCoreBulkheadHoldSound();
  stopCoreOverload(0.03);
  stopMegaManCharge(0.03);
  if (!isPracticeRun) {
    totalDeaths++;
    const zoneName = currentTheme().name;
    deathsByZone[zoneName] = (deathsByZone[zoneName] || 0) + 1;
    lifetimeDeathsByZone[themeIndex] = (lifetimeDeathsByZone[themeIndex] || 0) + 1;
    savePlayerProfile();
  }
  lives--;
  diedInCurrentZone = true;
  if (lives > 0) {
    respawnInZone();
    // note: the post-respawn protection window itself is granted when the
    // player actually resumes play (see startPress), not here -- using
    // real time now means granting it at this exact moment could waste
    // most or all of it while they're still looking at the "Life Lost"
    // screen. Only remember whether this specific death is even eligible:
    // a hazard death (forgiven or not) can grant it, but a wall death
    // never can, regardless of difficulty or what state the ship was in
    // right before hitting the wall.
    pendingRespawnMercyEligible = !!mercyEligible;
  } else if (continuesRemaining > 0) {
    state = 'continue-prompt';
  } else if (isPracticeRun) {
    endPracticeRun();
  } else {
    state = 'gameover';
    sfxGameOver();
    const distInt = Math.floor(maxDistanceReached);
    if (distInt > best) {
      best = distInt;
      savePlayerProfile();
      sfxNewBest();
    }
  }
}

function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.substring(0, 2), 16),
    g: parseInt(h.substring(2, 4), 16),
    b: parseInt(h.substring(4, 6), 16)
  };
}

function lerpColor(hexA, hexB, t) {
  const a = hexToRgb(hexA), b = hexToRgb(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return `rgb(${r},${g},${bl})`;
}

// ---- Audio ----
// SFX: SNES / Mega Man X -- round triangle+sine blips, echo, punchy hits.
// BGM: slow space pads (not SNES stage themes).
// No sample files. AudioContext is unlocked on the first pointer/key gesture.
let audioCtx = null;
let masterGain = null;
let sfxGain = null;
let bgmGain = null;
let delayInput = null;
let audioUnlocked = false;

const AUDIO_SETTINGS_STORAGE_KEY = 'synthFlightAudioSettings';
function loadAudioSettings() {
  try {
    const raw = localStorage.getItem(AUDIO_SETTINGS_STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        sfxEnabled: typeof parsed.sfxEnabled === 'boolean' ? parsed.sfxEnabled : true,
        bgmEnabled: typeof parsed.bgmEnabled === 'boolean' ? parsed.bgmEnabled : true,
        chargeTelegraph: typeof parsed.chargeTelegraph === 'string' && parsed.chargeTelegraph !== 'xCharge'
          ? parsed.chargeTelegraph
          : 'static',
        glowDanger: typeof parsed.glowDanger === 'string' ? parsed.glowDanger : 'siren',
        lifeLost: typeof parsed.lifeLost === 'string' ? parsed.lifeLost : 'lifeChip',
        respawn: typeof parsed.respawn === 'string' ? parsed.respawn : 'systemsOn',
      };
    }
  } catch (e) { /* corrupted/missing data -- fall through to defaults */ }
  return { sfxEnabled: true, bgmEnabled: true, chargeTelegraph: 'static', glowDanger: 'siren', lifeLost: 'lifeChip', respawn: 'systemsOn' };
}
function saveAudioSettings() {
  try {
    localStorage.setItem(AUDIO_SETTINGS_STORAGE_KEY, JSON.stringify({
      sfxEnabled: audioSettings.sfxEnabled,
      bgmEnabled: audioSettings.bgmEnabled,
      chargeTelegraph: audioSettings.chargeTelegraph,
      glowDanger: audioSettings.glowDanger,
      lifeLost: audioSettings.lifeLost,
      respawn: audioSettings.respawn,
    }));
  } catch (e) { /* storage unavailable -- fail silently, never crash the game over a preference */ }
}
const __loadedAudioSettings = loadAudioSettings();

const audioSettings = {
  masterVolume: 1.0,
  sfxVolume: 0.58,
  bgmVolume: 0.3,
  muted: false,
  sfxEnabled: __loadedAudioSettings.sfxEnabled,
  bgmEnabled: __loadedAudioSettings.bgmEnabled,
  chargeTelegraph: __loadedAudioSettings.chargeTelegraph,
  glowDanger: __loadedAudioSettings.glowDanger || 'siren',
  lifeLost: __loadedAudioSettings.lifeLost || 'lifeChip',
  respawn: __loadedAudioSettings.respawn || 'systemsOn',
};

// recomputes the live gain node values from current settings -- called on
// init and whenever a Settings-screen toggle changes
function applyAudioSettings() {
  if (!audioCtx) return;
  masterGain.gain.value = audioSettings.muted ? 0 : audioSettings.masterVolume;
  sfxGain.gain.value = audioSettings.sfxEnabled ? audioSettings.sfxVolume : 0;
  bgmGain.gain.value = audioSettings.bgmEnabled ? audioSettings.bgmVolume : 0;
}

function toggleSfxEnabled() {
  audioSettings.sfxEnabled = !audioSettings.sfxEnabled;
  saveAudioSettings();
  applyAudioSettings();
  if (audioSettings.sfxEnabled) sfxUiClick(); // audible confirmation only when turning it back on
}
function toggleBgmEnabled() {
  audioSettings.bgmEnabled = !audioSettings.bgmEnabled;
  saveAudioSettings();
  applyAudioSettings();
  if (!audioSettings.bgmEnabled) stopBgm(); // silence immediately rather than waiting for the next scheduled step
}

function initAudio() {
  if (audioCtx) return;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return; // no Web Audio support -- game still works, just silently
  audioCtx = new AC();
  masterGain = audioCtx.createGain();
  const compressor = audioCtx.createDynamicsCompressor();
  compressor.threshold.value = -16;
  compressor.knee.value = 10;
  compressor.ratio.value = 2.8;
  compressor.attack.value = 0.008;
  compressor.release.value = 0.18;
  masterGain.connect(compressor);
  compressor.connect(audioCtx.destination);

  sfxGain = audioCtx.createGain();
  sfxGain.connect(masterGain);
  bgmGain = audioCtx.createGain();
  bgmGain.connect(masterGain);

  const delay = audioCtx.createDelay(0.8);
  delay.delayTime.value = 0.46;
  const delayFeedback = audioCtx.createGain();
  delayFeedback.gain.value = 0.42;
  const delayWet = audioCtx.createGain();
  delayWet.gain.value = 0.38;
  delayInput = audioCtx.createGain();
  delayInput.connect(delay);
  delay.connect(delayFeedback);
  delayFeedback.connect(delay);
  delay.connect(delayWet);
  delayWet.connect(masterGain);

  applyAudioSettings();
}

function unlockAudio() {
  if (audioUnlocked) return;
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  audioUnlocked = true;
}

function playSynth({
  type = 'sawtooth',
  freq = 440,
  freqEnd = null,
  when = null,
  duration = 0.2,
  attack = 0.01,
  decay = 0.08,
  sustain = 0.45,
  release = 0.12,
  volume = 0.2,
  filterType = 'lowpass',
  filterFreq = 2400,
  filterQ = 1.1,
  filterEnd = null,
  detune = 0,
  dest = sfxGain,
  delaySend = 0,
} = {}) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !dest) return;
  const t0 = when != null ? when : audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(Math.max(20, freq), t0);
  if (freqEnd != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), t0 + duration);
  if (detune) osc.detune.setValueAtTime(detune, t0);
  const filter = audioCtx.createBiquadFilter();
  filter.type = filterType;
  filter.Q.value = filterQ;
  filter.frequency.setValueAtTime(Math.max(60, filterFreq), t0);
  if (filterEnd != null) filter.frequency.exponentialRampToValueAtTime(Math.max(60, filterEnd), t0 + duration);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.linearRampToValueAtTime(volume, t0 + Math.max(0.001, attack));
  gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume * sustain), t0 + attack + decay);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration + release);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  if (delaySend > 0 && delayInput) {
    const send = audioCtx.createGain();
    send.gain.value = delaySend;
    gain.connect(send);
    send.connect(delayInput);
  }
  osc.start(t0);
  osc.stop(t0 + duration + release + 0.03);
}

function playNoiseBurst({
  duration = 0.2,
  filterFreq = 1200,
  filterType = 'lowpass',
  filterEnd = null,
  filterQ = 0.8,
  volume = 1,
  when = null,
  dest = sfxGain,
  delaySend = 0,
} = {}) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !dest) return;
  const t0 = when != null ? when : audioCtx.currentTime;
  const bufferSize = Math.max(1, Math.floor(audioCtx.sampleRate * duration));
  const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) data[i] = Math.random() * 2 - 1;
  const noise = audioCtx.createBufferSource();
  noise.buffer = buffer;
  const filter = audioCtx.createBiquadFilter();
  filter.type = filterType;
  filter.Q.value = filterQ;
  filter.frequency.setValueAtTime(filterFreq, t0);
  if (filterEnd != null) filter.frequency.exponentialRampToValueAtTime(Math.max(80, filterEnd), t0 + duration);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(Math.max(0.0001, volume), t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  noise.connect(filter);
  filter.connect(gain);
  gain.connect(dest);
  if (delaySend > 0 && delayInput) {
    const send = audioCtx.createGain();
    send.gain.value = delaySend;
    gain.connect(send);
    send.connect(delayInput);
  }
  noise.start(t0);
  noise.stop(t0 + duration);
}

// SNES / Mega Man X-style tone: triangle+sine (sample-like), lowpass, short
// echo. dutyCycle only sets brightness now -- 0.125 dark, 0.25 mid, 0.5 bright.
function playPulseTone({
  freq = 440,
  dutyCycle = 0.25,
  freqSteps = null,
  duration = 0.15,
  attack = 0.006,
  decay = 0.04,
  sustain = 0.55,
  release = 0.08,
  volume = 1,
  dest = sfxGain,
  delaySend = 0,
} = {}) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !dest) return;
  const now = audioCtx.currentTime;
  const brightness = dutyCycle <= 0.15 ? 1600 : dutyCycle <= 0.3 ? 2400 : 3400;
  const stopAt = now + duration + release + 0.03;

  const makeVoice = (type, volMul, detuneCents) => {
    const osc = audioCtx.createOscillator();
    osc.type = type;
    if (detuneCents) osc.detune.setValueAtTime(detuneCents, now);
    if (freqSteps) {
      let t = now;
      for (const step of freqSteps) {
        osc.frequency.setValueAtTime(Math.max(20, step.freq), t);
        t += step.time;
      }
    } else {
      osc.frequency.setValueAtTime(Math.max(20, freq), now);
    }
    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = brightness;
    filter.Q.value = 0.8;
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.linearRampToValueAtTime(volume * volMul, now + Math.max(0.001, attack));
    gain.gain.linearRampToValueAtTime(Math.max(0.0001, volume * volMul * sustain), now + attack + decay);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration + release);
    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);
    if (delayInput) {
      const send = audioCtx.createGain();
      send.gain.value = delaySend > 0 ? delaySend : 0.22;
      gain.connect(send);
      send.connect(delayInput);
    }
    osc.start(now);
    osc.stop(stopAt);
  };

  makeVoice('triangle', 1, 0);
  makeVoice('sine', 0.5, 6);
}

// ---- SFX (SNES / Mega Man X: punchy blips, echo, no harsh NES squares) ----
function sfxUiClick() {
  playPulseTone({
    dutyCycle: 0.25,
    freqSteps: [{ freq: 1046.5, time: 0.035 }, { freq: 1568, time: 0.04 }],
    duration: 0.07, attack: 0.002, decay: 0.012, sustain: 0.65, release: 0.02, volume: 0.42,
  });
}

function sfxCollision() {
  playNoiseBurst({ duration: 0.22, filterFreq: 900, filterEnd: 180, filterType: 'lowpass', filterQ: 0.55, volume: 0.48 });
  playNoiseBurst({ duration: 0.07, filterFreq: 3200, filterType: 'highpass', volume: 0.22 });
  playSynth({ type: 'sine', freq: 92, freqEnd: 32, duration: 0.24, attack: 0.002, decay: 0.06, sustain: 0.35, release: 0.1, volume: 0.3, filterFreq: 220, delaySend: 0 });
}

function sfxGhostHit() {
  playNoiseBurst({ duration: 0.05, filterFreq: 4200, filterType: 'highpass', volume: 0.18 });
  playSynth({ type: 'sine', freq: 1680, freqEnd: 620, duration: 0.08, attack: 0.001, decay: 0.02, sustain: 0.2, release: 0.04, volume: 0.16, filterFreq: 2800, delaySend: 0.12 });
}

const HAZARD_FAMILY = {
  gate: 'rock', lightning: 'electric', barrier: 'rock', hbar: 'rock', pendulum: 'whoosh',
  lbolt: 'electric', blackhole: 'gravity', windvortex: 'whoosh', cloudarc: 'whoosh',
  securitydrone: 'drone', billboard: 'rock', turret: 'metal', turretshot: 'laser',
  searchlight: 'laser', zone2storm: 'whoosh', orbiter: 'plasma', arcplanet: 'plasma',
  signalcorruption: 'electric', emp: 'electric', pulsingorb: 'plasma', boomerang: 'whoosh',
  echotrail: 'echo', lensingzone: 'gravity', supernova: 'nova', supernovadebris: 'nova',
  wreckage: 'rock', lasergrid: 'laser', asteroid: 'rock', fireball: 'fire',
  toxicpool: 'drip', geyser: 'fire', movingdoor: 'metal', sparkhub: 'electric',
  sparkprojectile: 'electric', accesskey: 'key', specialdoor: 'metal', shootingstar: 'whoosh',
  aciddrip: 'drip', terrain: 'rock',
  bossattack: 'plasma', bossvolleytelegraph: 'laser', bossember: 'fire', bossashcloud: 'whoosh',
  bosschargebeamtelegraph: 'laser', bosschargebeam: 'laser', bossragepulse: 'bossHeavy',
  bossdiagonalring: 'bossHeavy', bossdrone: 'fire',
  corespark: 'electric', coreLaser: 'laser', coreLaserActive: 'laser', coreLaserTelegraph: 'laser',
  coreBulkhead: 'metal', coreBulkheadActive: 'metal', coreBulkheadTelegraph: 'metal',
  coreEmp: 'electric', coreEmpActive: 'electric', coreEmpTelegraph: 'electric', coreEmpPulse: 'electric',
  coreCrossfire: 'laser', coreCrossfireActive: 'laser', coreCrossfireTelegraph: 'laser',
  coreOrbit: 'plasma', coreEyeBeam: 'laser', coreTesla: 'electric',
  coreSparkDeploy: 'electric', coreFlame: 'fire', flameWallActive: 'fire', flameWallTelegraph: 'fire',
  barrageActive: 'fire', barrageTelegraph: 'fire', charging: 'fire', chargingClose: 'fire',
  generic: 'generic',
};

function hazardFamily(type) {
  if (!type) return 'generic';
  if (HAZARD_FAMILY[type]) return HAZARD_FAMILY[type];
  const key = Object.keys(HAZARD_FAMILY).find((k) => type.startsWith(k) || type.includes(k));
  return key ? HAZARD_FAMILY[key] : 'generic';
}

const lastHazardSfxAt = {};
function sfxHazardRateOk(key, minMs) {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (lastHazardSfxAt[key] && now - lastHazardSfxAt[key] < minMs) return false;
  lastHazardSfxAt[key] = now;
  return true;
}

function playElectricCrackles({ count = 5, spacing = 0.013, volume = 0.24, when = null } = {}) {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = when != null ? when : audioCtx.currentTime;
  for (let i = 0; i < count; i++) {
    playNoiseBurst({
      duration: 0.016 + (i % 3) * 0.008,
      filterFreq: 2800 + (i % 4) * 700,
      filterType: i % 2 ? 'highpass' : 'bandpass',
      filterQ: 3.2,
      volume: volume * (1 - i * 0.11),
      when: t0 + i * spacing,
      delaySend: 0.06,
    });
  }
}

function isHazardTelegraph(type) {
  return /telegraph/i.test(type || '');
}

function isChargeBeamType(type) {
  return /chargebeam|coreLaser|crossfire|eyeBeam|searchlight|lasergrid/i.test(type || '');
}

let lastUpdateTimeMs = 0;
let smoothedFrameSec = 1 / 60;
function noteFrameTime() {
  const now = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (lastUpdateTimeMs > 0) {
    const dt = (now - lastUpdateTimeMs) / 1000;
    if (dt > 0.004 && dt < 0.08) smoothedFrameSec = smoothedFrameSec * 0.85 + dt * 0.15;
  }
  lastUpdateTimeMs = now;
}
function framesToSeconds(frames) {
  return Math.max(0.05, (frames || 0) * smoothedFrameSec);
}

let lastBossChargeBeamSfx = { duration: 2, size: 1, isSuperBeam: false };
let megaManChargeCtl = null;

const CHARGE_TELEGRAPH_OPTIONS = [
  { id: 'xCharge', name: 'X CHARGE' },
  { id: 'sweep', name: 'SWEEP WHINE' },
  { id: 'heartbeat', name: 'HEARTBEAT' },
  { id: 'static', name: 'STATIC BUILD' },
];

function currentChargeTelegraphId() {
  const id = audioSettings.chargeTelegraph;
  return CHARGE_TELEGRAPH_OPTIONS.some((o) => o.id === id) ? id : 'static';
}

function currentChargeTelegraphLabel() {
  return CHARGE_TELEGRAPH_OPTIONS.find((o) => o.id === currentChargeTelegraphId()).name;
}

function cycleChargeTelegraph(dir) {
  const ids = CHARGE_TELEGRAPH_OPTIONS.map((o) => o.id);
  const i = Math.max(0, ids.indexOf(currentChargeTelegraphId()));
  audioSettings.chargeTelegraph = ids[(i + dir + ids.length) % ids.length];
  saveAudioSettings();
  playChargeTelegraph({ duration: framesToSeconds(BOSS_CHARGE_BEAM_TELEGRAPH_DURATION), size: 1 });
}

const GLOW_DANGER_OPTIONS = [
  { id: 'siren', name: 'SIREN PULSE' },
  { id: 'overheat', name: 'OVERHEAT' },
  { id: 'klaxon', name: 'RED ALERT' },
  { id: 'meltdown', name: 'MELTDOWN' },
];

function currentGlowDangerId() {
  const id = audioSettings.glowDanger;
  return GLOW_DANGER_OPTIONS.some((o) => o.id === id) ? id : 'siren';
}

function currentGlowDangerLabel() {
  return GLOW_DANGER_OPTIONS.find((o) => o.id === currentGlowDangerId()).name;
}

function cycleGlowDanger(dir) {
  const ids = GLOW_DANGER_OPTIONS.map((o) => o.id);
  const i = Math.max(0, ids.indexOf(currentGlowDangerId()));
  audioSettings.glowDanger = ids[(i + dir + ids.length) % ids.length];
  saveAudioSettings();
  refreshSfxGlowDangerUi();
  if (typeof isGlowDangerTesterLoop === 'function' && isGlowDangerTesterLoop()) {
    glowDangerPreviewUrgency = 0.85;
    stopGlowDangerSound();
    startGlowDangerSound();
    updateGlowDangerUrgency();
    return;
  }
  previewGlowDangerSound();
}

function stopMegaManCharge(fadeSec = 0.04) {
  if (!megaManChargeCtl || !audioCtx) return;
  const ctl = megaManChargeCtl;
  megaManChargeCtl = null;
  const t = audioCtx.currentTime;
  const fade = Math.max(0.01, fadeSec);
  try {
    ctl.master.gain.cancelScheduledValues(t);
    ctl.master.gain.setValueAtTime(Math.max(0.0001, ctl.master.gain.value), t);
    ctl.master.gain.linearRampToValueAtTime(0.0001, t + fade);
  } catch (e) { /* already stopped */ }
  const halt = t + fade + 0.02;
  for (const node of ctl.nodes) {
    try { node.stop(halt); } catch (e) { /* already stopped */ }
  }
}

function playMegaManCharge({ duration = 2, size = 1, isSuperBeam = false } = {}) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted) return;
  stopMegaManCharge(0.02);
  const now = audioCtx.currentTime;
  const dur = Math.max(0.12, duration);
  const s = Math.min(6, Math.max(1, size));
  const vol = (0.055 + s * 0.022) * (isSuperBeam ? 1.25 : 1);

  const master = audioCtx.createGain();
  master.gain.setValueAtTime(1, now);
  if (dur > 0.06) master.gain.setValueAtTime(1, now + dur - 0.05);
  master.gain.linearRampToValueAtTime(0.0001, now + dur);
  master.connect(sfxGain);

  const osc = audioCtx.createOscillator();
  osc.type = 'square';
  osc.frequency.setValueAtTime(200, now);
  osc.frequency.exponentialRampToValueAtTime(isSuperBeam ? 880 : 720, now + dur);

  const harm = audioCtx.createOscillator();
  harm.type = 'sine';
  harm.frequency.setValueAtTime(400, now);
  harm.frequency.exponentialRampToValueAtTime(isSuperBeam ? 1760 : 1440, now + dur);

  const filt = audioCtx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.Q.value = 0.9;
  filt.frequency.setValueAtTime(900, now);
  filt.frequency.exponentialRampToValueAtTime(2800, now + dur);

  const amp = audioCtx.createGain();
  amp.gain.setValueAtTime(vol * 0.5, now);

  const pulse = audioCtx.createOscillator();
  pulse.type = 'square';
  pulse.frequency.setValueAtTime(5.5, now);
  pulse.frequency.exponentialRampToValueAtTime(isSuperBeam ? 22 : 16, now + dur * 0.85);

  const pulseDepth = audioCtx.createGain();
  pulseDepth.gain.value = vol * 0.5;
  pulse.connect(pulseDepth);
  pulseDepth.connect(amp.gain);

  osc.connect(filt);
  harm.connect(filt);
  filt.connect(amp);
  amp.connect(master);

  const stopAt = now + dur + 0.04;
  osc.start(now);
  harm.start(now);
  pulse.start(now);
  osc.stop(stopAt);
  harm.stop(stopAt);
  pulse.stop(stopAt);

  megaManChargeCtl = { master, nodes: [osc, harm, pulse] };
}

function playChargeSweep({ duration = 2, size = 1, isSuperBeam = false } = {}) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted) return;
  stopMegaManCharge(0.02);
  const now = audioCtx.currentTime;
  const dur = Math.max(0.12, duration);
  const s = Math.min(6, Math.max(1, size));
  const vol = (0.08 + s * 0.028) * (isSuperBeam ? 1.2 : 1);
  const top = isSuperBeam ? 980 : 760;

  const master = audioCtx.createGain();
  master.gain.setValueAtTime(1, now);
  if (dur > 0.06) master.gain.setValueAtTime(1, now + dur - 0.05);
  master.gain.linearRampToValueAtTime(0.0001, now + dur);
  master.connect(sfxGain);

  const saw = audioCtx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.setValueAtTime(140, now);
  saw.frequency.exponentialRampToValueAtTime(top, now + dur);
  const sFilt = audioCtx.createBiquadFilter();
  sFilt.type = 'lowpass';
  sFilt.Q.value = 0.8;
  sFilt.frequency.setValueAtTime(500, now);
  sFilt.frequency.exponentialRampToValueAtTime(3200, now + dur);
  const sGain = audioCtx.createGain();
  sGain.gain.setValueAtTime(vol * 0.35, now);
  sGain.gain.linearRampToValueAtTime(vol, now + dur);
  saw.connect(sFilt);
  sFilt.connect(sGain);
  sGain.connect(master);

  const sine = audioCtx.createOscillator();
  sine.type = 'sine';
  sine.frequency.setValueAtTime(280, now);
  sine.frequency.exponentialRampToValueAtTime(top * 2, now + dur);
  const nGain = audioCtx.createGain();
  nGain.gain.setValueAtTime(vol * 0.25, now);
  nGain.gain.linearRampToValueAtTime(vol * 0.7, now + dur);
  sine.connect(nGain);
  nGain.connect(master);

  const stopAt = now + dur + 0.04;
  saw.start(now);
  sine.start(now);
  saw.stop(stopAt);
  sine.stop(stopAt);
  megaManChargeCtl = { master, nodes: [saw, sine] };
}

function playChargeHeartbeat({ duration = 2, size = 1, isSuperBeam = false } = {}) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted) return;
  stopMegaManCharge(0.02);
  const now = audioCtx.currentTime;
  const dur = Math.max(0.12, duration);
  const s = Math.min(6, Math.max(1, size));
  const vol = (0.07 + s * 0.026) * (isSuperBeam ? 1.25 : 1);

  const master = audioCtx.createGain();
  master.gain.setValueAtTime(1, now);
  if (dur > 0.06) master.gain.setValueAtTime(1, now + dur - 0.05);
  master.gain.linearRampToValueAtTime(0.0001, now + dur);
  master.connect(sfxGain);

  const osc = audioCtx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(90, now);
  osc.frequency.exponentialRampToValueAtTime(isSuperBeam ? 420 : 320, now + dur);
  const oGain = audioCtx.createGain();
  oGain.gain.setValueAtTime(vol * 0.4, now);
  osc.connect(oGain);
  oGain.connect(master);

  const body = audioCtx.createOscillator();
  body.type = 'triangle';
  body.frequency.setValueAtTime(180, now);
  body.frequency.exponentialRampToValueAtTime(isSuperBeam ? 840 : 640, now + dur);
  const bGain = audioCtx.createGain();
  bGain.gain.setValueAtTime(vol * 0.35, now);
  body.connect(bGain);
  bGain.connect(master);

  const pulse = audioCtx.createOscillator();
  pulse.type = 'sine';
  pulse.frequency.setValueAtTime(2.4, now);
  pulse.frequency.exponentialRampToValueAtTime(isSuperBeam ? 18 : 14, now + dur * 0.9);
  const pulseDepth = audioCtx.createGain();
  pulseDepth.gain.setValueAtTime(vol * 0.35, now);
  pulseDepth.gain.linearRampToValueAtTime(vol * 0.85, now + dur);
  pulse.connect(pulseDepth);
  pulseDepth.connect(oGain.gain);

  const stopAt = now + dur + 0.04;
  osc.start(now);
  body.start(now);
  pulse.start(now);
  osc.stop(stopAt);
  body.stop(stopAt);
  pulse.stop(stopAt);
  megaManChargeCtl = { master, nodes: [osc, body, pulse] };
}

function playChargeStatic({ duration = 2, size = 1, isSuperBeam = false } = {}) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted) return;
  stopMegaManCharge(0.02);
  const now = audioCtx.currentTime;
  const dur = Math.max(0.12, duration);
  const s = Math.min(6, Math.max(1, size));
  const vol = (0.07 + s * 0.024) * (isSuperBeam ? 1.2 : 1);

  const master = audioCtx.createGain();
  master.gain.setValueAtTime(1, now);
  if (dur > 0.06) master.gain.setValueAtTime(1, now + dur - 0.05);
  master.gain.linearRampToValueAtTime(0.0001, now + dur);
  master.connect(sfxGain);

  const nBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
  const nData = nBuf.getChannelData(0);
  for (let i = 0; i < nData.length; i++) nData[i] = Math.random() * 2 - 1;
  const noise = audioCtx.createBufferSource();
  noise.buffer = nBuf;
  noise.loop = true;
  const nFilt = audioCtx.createBiquadFilter();
  nFilt.type = 'bandpass';
  nFilt.Q.value = 1.4;
  nFilt.frequency.setValueAtTime(380, now);
  nFilt.frequency.exponentialRampToValueAtTime(isSuperBeam ? 2800 : 2200, now + dur);
  const nGain = audioCtx.createGain();
  nGain.gain.setValueAtTime(vol * 0.25, now);
  nGain.gain.linearRampToValueAtTime(vol * 0.9, now + dur);
  noise.connect(nFilt);
  nFilt.connect(nGain);
  nGain.connect(master);

  const tone = audioCtx.createOscillator();
  tone.type = 'sine';
  tone.frequency.setValueAtTime(160, now);
  tone.frequency.exponentialRampToValueAtTime(isSuperBeam ? 880 : 680, now + dur);
  const tGain = audioCtx.createGain();
  tGain.gain.setValueAtTime(vol * 0.2, now);
  tGain.gain.linearRampToValueAtTime(vol * 0.65, now + dur);
  tone.connect(tGain);
  tGain.connect(master);

  const stopAt = now + dur + 0.04;
  noise.start(now);
  tone.start(now);
  noise.stop(stopAt);
  tone.stop(stopAt);
  megaManChargeCtl = { master, nodes: [noise, tone] };
}

function playChargeTelegraph(opts) {
  const id = currentChargeTelegraphId();
  if (id === 'sweep') playChargeSweep(opts);
  else if (id === 'heartbeat') playChargeHeartbeat(opts);
  else if (id === 'static') playChargeStatic(opts);
  else playMegaManCharge(opts);
}

function playChargeWhine() {
  playChargeTelegraph({ duration: framesToSeconds(CORE_LASER_TELEGRAPH), size: 1 });
}

function playChargeBeamFire({ size = 1, isSuperBeam = false, duration = 1.5 } = {}) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted) return;
  const now = audioCtx.currentTime;
  const s = Math.min(6, Math.max(1, size));
  const dur = Math.max(0.12, duration);
  const peak = (0.34 + s * 0.08) * (isSuperBeam ? 1.5 : 1);

  playNoiseBurst({ duration: 0.1, filterFreq: 3200, filterType: 'highpass', volume: peak * 0.55, when: now });
  playSynth({
    type: 'sine', freq: 90, freqEnd: 38, duration: 0.22,
    attack: 0.002, decay: 0.05, sustain: 0.35, release: 0.08,
    volume: peak * 0.7, filterFreq: 240, delaySend: 0, when: now,
  });

  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.linearRampToValueAtTime(1, now + 0.04);
  out.gain.setValueAtTime(1, now + Math.max(0.12, dur - 0.28));
  out.gain.linearRampToValueAtTime(0.0001, now + dur);
  out.connect(sfxGain);

  const nBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
  const nData = nBuf.getChannelData(0);
  for (let i = 0; i < nData.length; i++) nData[i] = Math.random() * 2 - 1;
  const noise = audioCtx.createBufferSource();
  noise.buffer = nBuf;
  noise.loop = true;
  const nFilt = audioCtx.createBiquadFilter();
  nFilt.type = 'lowpass';
  nFilt.Q.value = 0.6;
  nFilt.frequency.setValueAtTime(1100 + s * 120, now);
  nFilt.frequency.exponentialRampToValueAtTime(280, now + dur);
  const nGain = audioCtx.createGain();
  nGain.gain.value = peak;
  noise.connect(nFilt);
  nFilt.connect(nGain);
  nGain.connect(out);

  const hiss = audioCtx.createBufferSource();
  hiss.buffer = nBuf;
  hiss.loop = true;
  const hFilt = audioCtx.createBiquadFilter();
  hFilt.type = 'bandpass';
  hFilt.frequency.value = 1800 + s * 200;
  hFilt.Q.value = 1.1;
  const hGain = audioCtx.createGain();
  hGain.gain.value = peak * 0.28;
  hiss.connect(hFilt);
  hFilt.connect(hGain);
  hGain.connect(out);

  const saw = audioCtx.createOscillator();
  saw.type = 'sawtooth';
  saw.frequency.setValueAtTime(150 + s * 12, now);
  saw.frequency.exponentialRampToValueAtTime(72, now + dur);
  const sFilt = audioCtx.createBiquadFilter();
  sFilt.type = 'lowpass';
  sFilt.frequency.setValueAtTime(1400, now);
  sFilt.frequency.exponentialRampToValueAtTime(420, now + dur);
  const sGain = audioCtx.createGain();
  sGain.gain.value = peak * 0.38;
  saw.connect(sFilt);
  sFilt.connect(sGain);
  sGain.connect(out);

  const sub = audioCtx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(52 + s * 4, now);
  sub.frequency.exponentialRampToValueAtTime(26, now + dur);
  const subGain = audioCtx.createGain();
  subGain.gain.value = peak * 0.72;
  sub.connect(subGain);
  subGain.connect(out);

  const stopAt = now + dur + 0.05;
  noise.start(now);
  hiss.start(now);
  saw.start(now);
  sub.start(now);
  noise.stop(stopAt);
  hiss.stop(stopAt);
  saw.stop(stopAt);
  sub.stop(stopAt);

  if (isSuperBeam || s >= 3.5) {
    const rumble = audioCtx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.setValueAtTime(32, now);
    rumble.frequency.exponentialRampToValueAtTime(18, now + dur);
    const rGain = audioCtx.createGain();
    rGain.gain.value = peak * 0.45;
    rumble.connect(rGain);
    rGain.connect(out);
    rumble.start(now);
    rumble.stop(stopAt);
  }
}

function playBeamFire() {
  playChargeBeamFire({ size: 1 });
}

function sfxCoreCrossfireTelegraph() {
  return;
}

function sfxCoreEyeBeamTrack() {
  playLockOn();
}

function sfxCoreEyeBeamLock() {
  playTrackingLockOn();
}

function sfxCoreEyeBeamFire() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const now = audioCtx.currentTime;
  const dur = Math.max(0.72, framesToSeconds(CORE_EYEBEAM_ACTIVE_DURATION) * 2.4);
  const peak = 0.52;

  playNoiseBurst({ duration: 0.09, filterFreq: 5500, filterType: 'highpass', volume: 0.32, delaySend: 0.08, when: now });
  playNoiseBurst({ duration: 0.12, filterFreq: 1800, filterType: 'bandpass', filterQ: 1.2, volume: 0.22, delaySend: 0.06, when: now });
  playSynth({
    type: 'sine', freq: 160, freqEnd: 72, duration: 0.22,
    attack: 0.002, decay: 0.05, sustain: 0.4, release: 0.08,
    volume: 0.22, filterFreq: 420, delaySend: 0, when: now,
  });

  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.linearRampToValueAtTime(1, now + 0.018);
  out.gain.setValueAtTime(1, now + Math.max(0.18, dur - 0.22));
  out.gain.linearRampToValueAtTime(0.0001, now + dur);
  out.connect(sfxGain);

  const nBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
  const nData = nBuf.getChannelData(0);
  for (let i = 0; i < nData.length; i++) nData[i] = Math.random() * 2 - 1;

  const roar = audioCtx.createBufferSource();
  roar.buffer = nBuf;
  roar.loop = true;
  const rFilt = audioCtx.createBiquadFilter();
  rFilt.type = 'bandpass';
  rFilt.frequency.setValueAtTime(2200, now);
  rFilt.frequency.exponentialRampToValueAtTime(900, now + dur);
  rFilt.Q.value = 0.9;
  const rGain = audioCtx.createGain();
  rGain.gain.value = peak * 0.42;
  roar.connect(rFilt);
  rFilt.connect(rGain);
  rGain.connect(out);

  const hiss = audioCtx.createBufferSource();
  hiss.buffer = nBuf;
  hiss.loop = true;
  const hFilt = audioCtx.createBiquadFilter();
  hFilt.type = 'highpass';
  hFilt.frequency.setValueAtTime(4200, now);
  hFilt.frequency.exponentialRampToValueAtTime(2400, now + dur);
  const hGain = audioCtx.createGain();
  hGain.gain.value = peak * 0.28;
  hiss.connect(hFilt);
  hFilt.connect(hGain);
  hGain.connect(out);

  const sawA = audioCtx.createOscillator();
  sawA.type = 'sawtooth';
  sawA.frequency.setValueAtTime(880, now);
  sawA.frequency.exponentialRampToValueAtTime(340, now + dur);
  const sawB = audioCtx.createOscillator();
  sawB.type = 'sawtooth';
  sawB.frequency.setValueAtTime(910, now);
  sawB.frequency.exponentialRampToValueAtTime(355, now + dur);
  const sFilt = audioCtx.createBiquadFilter();
  sFilt.type = 'lowpass';
  sFilt.frequency.setValueAtTime(4800, now);
  sFilt.frequency.exponentialRampToValueAtTime(1600, now + dur);
  const sGain = audioCtx.createGain();
  sGain.gain.value = peak * 0.36;
  sawA.connect(sFilt);
  sawB.connect(sFilt);
  sFilt.connect(sGain);
  sGain.connect(out);

  const scream = audioCtx.createOscillator();
  scream.type = 'square';
  scream.frequency.setValueAtTime(1480, now);
  scream.frequency.exponentialRampToValueAtTime(620, now + dur);
  const scFilt = audioCtx.createBiquadFilter();
  scFilt.type = 'bandpass';
  scFilt.frequency.setValueAtTime(1600, now);
  scFilt.frequency.exponentialRampToValueAtTime(700, now + dur);
  scFilt.Q.value = 2.2;
  const scGain = audioCtx.createGain();
  scGain.gain.value = peak * 0.22;
  scream.connect(scFilt);
  scFilt.connect(scGain);
  scGain.connect(out);

  const pierce = audioCtx.createOscillator();
  pierce.type = 'sine';
  pierce.frequency.setValueAtTime(1760, now);
  pierce.frequency.exponentialRampToValueAtTime(740, now + dur);
  const pGain = audioCtx.createGain();
  pGain.gain.value = peak * 0.38;
  pierce.connect(pGain);
  pGain.connect(out);

  if (delayInput) {
    const send = audioCtx.createGain();
    send.gain.value = 0.18;
    out.connect(send);
    send.connect(delayInput);
  }

  const stopAt = now + dur + 0.05;
  roar.start(now);
  hiss.start(now);
  sawA.start(now);
  sawB.start(now);
  scream.start(now);
  pierce.start(now);
  roar.stop(stopAt);
  hiss.stop(stopAt);
  sawA.stop(stopAt);
  sawB.stop(stopAt);
  scream.stop(stopAt);
  pierce.stop(stopAt);
}

function sfxCoreTeslaCharge() {
  return;
}

const CORE_TESLA_BURST_STYLES = ['contra', 'thick', 'chord', 'coil', 'spray'];
let coreTeslaBurstStyle = 'contra';

function sfxCoreTeslaBurst() {
  if (coreTeslaBurstStyle === 'chord') return sfxCoreTeslaBurstChord();
  if (coreTeslaBurstStyle === 'coil') return sfxCoreTeslaBurstCoil();
  if (coreTeslaBurstStyle === 'spray') return sfxCoreTeslaBurstSpray();
  if (coreTeslaBurstStyle === 'fan') return sfxCoreTeslaBurstFan();
  if (coreTeslaBurstStyle === 'thick') return sfxCoreTeslaBurstThick();
  return sfxCoreTeslaBurstContra();
}

function playNesDutyPulse({ when, duration, freq, freqEnd, vol, duty = 0.5 }) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const sr = audioCtx.sampleRate;
  const n = Math.max(1, Math.floor(sr * duration));
  const buf = audioCtx.createBuffer(1, n, sr);
  const data = buf.getChannelData(0);
  let phase = 0;
  const ratio = Math.max(0.05, freqEnd / freq);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const f = freq * Math.pow(ratio, t);
    phase += f / sr;
    phase -= Math.floor(phase);
    const env = Math.pow(1 - t, 0.7);
    const sq = phase < duty ? 1 : -1;
    const sine = Math.sin(phase * Math.PI * 2);
    data[i] = (sq * 0.42 + sine * 0.58) * env;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(3200, when);
  lp.frequency.exponentialRampToValueAtTime(1400, when + duration);
  lp.Q.value = 0.55;
  const gain = audioCtx.createGain();
  gain.gain.value = vol;
  src.connect(lp);
  lp.connect(gain);
  gain.connect(sfxGain);
  src.start(when);
  src.stop(when + duration + 0.01);
}

function playNesApuNoise({ when, duration, period, periodEnd, vol }) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const cpu = 1789773;
  const sr = audioCtx.sampleRate;
  const n = Math.max(1, Math.floor(sr * duration));
  const buf = audioCtx.createBuffer(1, n, sr);
  const data = buf.getChannelData(0);
  let lfsr = 1;
  let bit = 1;
  let acc = 0;
  for (let i = 0; i < n; i++) {
    const t = i / n;
    const per = period + (periodEnd - period) * t;
    acc += cpu / sr;
    while (acc >= per) {
      acc -= per;
      bit = (lfsr ^ (lfsr >>> 1)) & 1;
      lfsr = (lfsr >>> 1) | (bit << 14);
    }
    data[i] = (bit ? 1 : -1) * Math.pow(1 - t, 1.15);
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(2200, when);
  lp.frequency.exponentialRampToValueAtTime(900, when + duration);
  lp.Q.value = 0.5;
  const gain = audioCtx.createGain();
  gain.gain.value = vol;
  src.connect(lp);
  lp.connect(gain);
  gain.connect(sfxGain);
  src.start(when);
  src.stop(when + duration + 0.01);
}

function sfxCoreTeslaBurstContra() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  playNesApuNoise({ when: t0, duration: 0.2, period: 380, periodEnd: 1016, vol: 0.1 });
  playNesDutyPulse({ when: t0, duration: 0.055, freq: 700, freqEnd: 200, vol: 0.18, duty: 0.5 });
  playNesDutyPulse({ when: t0 + 0.068, duration: 0.05, freq: 580, freqEnd: 165, vol: 0.14, duty: 0.5 });
}

function sfxCoreTeslaBurstThick() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  playSynth({
    type: 'square', freq: 620, freqEnd: 210, duration: 0.09,
    attack: 0.001, decay: 0.025, sustain: 0.22, release: 0.04,
    volume: 0.14, filterType: 'lowpass', filterFreq: 2400, filterEnd: 800, delaySend: 0.06, when: t0,
  });
  playSynth({
    type: 'sine', freq: 310, freqEnd: 110, duration: 0.11,
    attack: 0.001, decay: 0.03, sustain: 0.28, release: 0.045,
    volume: 0.18, filterFreq: 700, delaySend: 0, when: t0,
  });
  playSynth({
    type: 'sine', freq: 1240, freqEnd: 420, duration: 0.07,
    attack: 0.001, decay: 0.02, sustain: 0.18, release: 0.03,
    volume: 0.08, filterType: 'lowpass', filterFreq: 2800, delaySend: 0.05, when: t0,
  });
}

function sfxCoreTeslaBurstChord() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  const notes = [
    { freq: 480, freqEnd: 180, vol: 0.14 },
    { freq: 720, freqEnd: 260, vol: 0.11 },
    { freq: 960, freqEnd: 340, vol: 0.09 },
  ];
  notes.forEach((n) => {
    playSynth({
      type: 'triangle', freq: n.freq, freqEnd: n.freqEnd, duration: 0.11,
      attack: 0.001, decay: 0.028, sustain: 0.24, release: 0.04,
      volume: n.vol, filterType: 'lowpass', filterFreq: 2200, filterEnd: 700, delaySend: 0.05, when: t0,
    });
  });
  playSynth({
    type: 'sine', freq: 160, freqEnd: 70, duration: 0.12,
    attack: 0.001, decay: 0.03, sustain: 0.3, release: 0.05,
    volume: 0.12, filterFreq: 400, delaySend: 0, when: t0,
  });
}

function sfxCoreTeslaBurstCoil() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  playSynth({
    type: 'sine', freq: 1680, freqEnd: 520, duration: 0.08,
    attack: 0.001, decay: 0.018, sustain: 0.2, release: 0.03,
    volume: 0.12, filterType: 'bandpass', filterFreq: 1500, filterQ: 4.5, delaySend: 0.08, when: t0,
  });
  playSynth({
    type: 'sine', freq: 840, freqEnd: 240, duration: 0.1,
    attack: 0.001, decay: 0.025, sustain: 0.22, release: 0.04,
    volume: 0.14, filterType: 'bandpass', filterFreq: 900, filterQ: 2.4, delaySend: 0.06, when: t0,
  });
  playSynth({
    type: 'sine', freq: 140, freqEnd: 64, duration: 0.12,
    attack: 0.002, decay: 0.03, sustain: 0.28, release: 0.05,
    volume: 0.14, filterFreq: 360, delaySend: 0, when: t0,
  });
}

function sfxCoreTeslaBurstSpray() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  playSynth({
    type: 'sawtooth', freq: 380, freqEnd: 160, duration: 0.14,
    attack: 0.002, decay: 0.04, sustain: 0.3, release: 0.05,
    volume: 0.12, filterType: 'bandpass', filterFreq: 700, filterEnd: 2100, filterQ: 2.2, delaySend: 0.08, when: t0,
  });
  playSynth({
    type: 'sawtooth', freq: 410, freqEnd: 175, duration: 0.14,
    attack: 0.002, decay: 0.04, sustain: 0.3, release: 0.05,
    volume: 0.1, filterType: 'bandpass', filterFreq: 900, filterEnd: 2400, filterQ: 2.0, delaySend: 0.08, when: t0,
  });
  playSynth({
    type: 'sine', freq: 200, freqEnd: 80, duration: 0.12,
    attack: 0.002, decay: 0.03, sustain: 0.28, release: 0.045,
    volume: 0.12, filterFreq: 480, delaySend: 0, when: t0,
  });
}

function sfxCoreTeslaBurstFan() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  playSynth({
    type: 'sine', freq: 210, freqEnd: 86, duration: 0.13,
    attack: 0.001, decay: 0.035, sustain: 0.32, release: 0.055,
    volume: 0.16, filterFreq: 520, delaySend: 0, when: t0,
  });
  playNoiseBurst({
    duration: 0.055, filterFreq: 1700, filterType: 'bandpass', filterQ: 1.15, volume: 0.09, delaySend: 0.04, when: t0,
  });
  const pellets = [
    { off: 0.000, freq: 1020, freqEnd: 340, pan: -0.72, vol: 0.11 },
    { off: 0.006, freq: 1180, freqEnd: 390, pan: -0.36, vol: 0.12 },
    { off: 0.010, freq: 1360, freqEnd: 450, pan: 0.00, vol: 0.13 },
    { off: 0.006, freq: 1220, freqEnd: 400, pan: 0.36, vol: 0.12 },
    { off: 0.000, freq: 1080, freqEnd: 360, pan: 0.72, vol: 0.11 },
  ];
  pellets.forEach((p) => {
    const when = t0 + p.off;
    let dest = sfxGain;
    if (typeof audioCtx.createStereoPanner === 'function') {
      dest = audioCtx.createGain();
      dest.gain.value = 1;
      const pan = audioCtx.createStereoPanner();
      pan.pan.setValueAtTime(p.pan, when);
      dest.connect(pan);
      pan.connect(sfxGain);
    }
    playSynth({
      type: 'triangle', freq: p.freq, freqEnd: p.freqEnd, duration: 0.085,
      attack: 0.001, decay: 0.022, sustain: 0.22, release: 0.035,
      volume: p.vol, filterType: 'lowpass', filterFreq: 2600, filterEnd: 900, delaySend: 0.05, dest, when,
    });
    playSynth({
      type: 'sine', freq: p.freq * 0.5, freqEnd: p.freqEnd * 0.5, duration: 0.07,
      attack: 0.001, decay: 0.018, sustain: 0.2, release: 0.03,
      volume: p.vol * 0.45, filterFreq: 900, delaySend: 0, dest, when,
    });
  });
}

function sfxCoreOverloadBuildup() {
  sfxCoreOverload();
}

let coreOverloadCtl = null;

function stopCoreOverload(fadeSec = 0.08) {
  if (!coreOverloadCtl || !audioCtx) return;
  const ctl = coreOverloadCtl;
  coreOverloadCtl = null;
  const now = audioCtx.currentTime;
  const fade = Math.max(0.02, fadeSec);
  try {
    ctl.master.gain.cancelScheduledValues(now);
    ctl.master.gain.setValueAtTime(Math.max(0.0001, ctl.master.gain.value), now);
    ctl.master.gain.exponentialRampToValueAtTime(0.0001, now + fade);
  } catch (e) { /* ignore */ }
  const halt = now + fade + 0.04;
  for (const node of ctl.nodes) {
    try { node.stop(halt); } catch (e) { /* already stopped */ }
  }
}

function sfxCoreCrossfireVolley() {
  if (frame === lastCoreCrossfireVolleyFrame) return;
  lastCoreCrossfireVolleyFrame = frame;
  sfxHazardFire('coreLaserActive');
}

function sfxCoreEmpTelegraph() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  const dur = framesToSeconds(CORE_EMP_TELEGRAPH);
  playNoiseBurst({ duration: dur, filterFreq: 280, filterEnd: 900, filterType: 'bandpass', filterQ: 0.7, volume: 0.2, delaySend: 0.08, when: t0 });
  playSynth({
    type: 'sawtooth', freq: 70, freqEnd: 210, duration: dur,
    attack: 0.06, decay: 0.2, sustain: 0.7, release: 0.1,
    volume: 0.1, filterType: 'lowpass', filterFreq: 400, filterEnd: 1600, delaySend: 0.06, when: t0,
  });
  playSynth({
    type: 'sine', freq: 48, freqEnd: 92, duration: dur,
    attack: 0.08, decay: 0.18, sustain: 0.65, release: 0.1,
    volume: 0.12, filterFreq: 180, delaySend: 0, when: t0,
  });
  const crackleCount = 7;
  for (let i = 0; i < crackleCount; i++) {
    playNoiseBurst({
      duration: 0.03 + (i % 2) * 0.015,
      filterFreq: 1800 + i * 220,
      filterType: 'bandpass',
      filterQ: 2.6,
      volume: 0.08 + i * 0.018,
      when: t0 + (dur * 0.12) + i * (dur * 0.12),
    });
  }
}

function sfxCoreEmpPulse() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  playSynth({
    type: 'sine', freq: 240, freqEnd: 96, duration: 0.24,
    attack: 0.008, decay: 0.06, sustain: 0.48, release: 0.1,
    volume: 0.2, filterFreq: 620, delaySend: 0, when: t0,
  });
  playSynth({
    type: 'triangle', freq: 760, freqEnd: 280, duration: 0.2,
    attack: 0.006, decay: 0.055, sustain: 0.38, release: 0.09,
    volume: 0.15, filterType: 'lowpass', filterFreq: 2000, filterEnd: 720, delaySend: 0.08, when: t0,
  });
  playSynth({
    type: 'sine', freq: 1480, freqEnd: 640, duration: 0.16,
    attack: 0.004, decay: 0.045, sustain: 0.3, release: 0.08,
    volume: 0.1, filterType: 'bandpass', filterFreq: 1400, filterQ: 2.8, delaySend: 0.1, when: t0,
  });
  playSynth({
    type: 'sine', freq: 980, freqEnd: 420, duration: 0.14,
    attack: 0.01, decay: 0.04, sustain: 0.32, release: 0.08,
    volume: 0.07, filterType: 'lowpass', filterFreq: 2400, filterEnd: 900, delaySend: 0.06, when: t0,
  });
  playNoiseBurst({
    duration: 0.022, filterFreq: 2600, filterType: 'bandpass', filterQ: 5.5, volume: 0.05, delaySend: 0.03, when: t0,
  });
  playSynth({
    type: 'sine', freq: 300, freqEnd: 120, duration: 0.2,
    attack: 0.008, decay: 0.05, sustain: 0.42, release: 0.09,
    volume: 0.11, filterFreq: 780, delaySend: 0, when: t0 + 0.018,
  });
  playSynth({
    type: 'triangle', freq: 920, freqEnd: 340, duration: 0.16,
    attack: 0.006, decay: 0.045, sustain: 0.32, release: 0.08,
    volume: 0.08, filterType: 'lowpass', filterFreq: 2100, filterEnd: 800, delaySend: 0.07, when: t0 + 0.018,
  });
}

function playCoreBulkheadThunk(when, freq, panVal) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = when;
  const dest = audioCtx.createGain();
  dest.gain.value = 1;
  if (typeof audioCtx.createStereoPanner === 'function') {
    const pan = audioCtx.createStereoPanner();
    pan.pan.setValueAtTime(panVal, t0);
    dest.connect(pan);
    pan.connect(sfxGain);
  } else {
    dest.connect(sfxGain);
  }
  playNoiseBurst({ duration: 0.22, filterFreq: 280, filterEnd: 90, filterType: 'lowpass', volume: 0.72, dest, when: t0 });
  playNoiseBurst({ duration: 0.1, filterFreq: 900, filterType: 'bandpass', filterQ: 1.6, volume: 0.48, dest, when: t0 });
  playNoiseBurst({ duration: 0.05, filterFreq: 2200, filterType: 'bandpass', filterQ: 2.8, volume: 0.34, dest, when: t0 });
  playSynth({
    type: 'sine', freq, freqEnd: freq * 0.45, duration: 0.32,
    attack: 0.001, decay: 0.06, sustain: 0.42, release: 0.12,
    volume: 0.48, filterFreq: 320, delaySend: 0, dest, when: t0,
  });
  playSynth({
    type: 'triangle', freq: freq * 2.1, freqEnd: freq * 0.65, duration: 0.18,
    attack: 0.001, decay: 0.04, sustain: 0.3, release: 0.08,
    volume: 0.22, filterFreq: 1400, delaySend: 0.06, dest, when: t0,
  });
  playSynth({
    type: 'sine', freq: 38, freqEnd: 22, duration: 0.28,
    attack: 0.002, decay: 0.07, sustain: 0.4, release: 0.1,
    volume: 0.3, filterFreq: 90, delaySend: 0, dest, when: t0,
  });
}

function sfxCoreBulkheadTelegraph() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  const dur = framesToSeconds(CORE_BULKHEAD_TELEGRAPH);
  playNoiseBurst({ duration: dur, filterFreq: 240, filterEnd: 110, filterType: 'lowpass', volume: 0.5, when: t0 });
  playNoiseBurst({ duration: dur * 0.95, filterFreq: 620, filterEnd: 340, filterType: 'bandpass', filterQ: 0.75, volume: 0.34, delaySend: 0.06, when: t0 });
  playSynth({
    type: 'sine', freq: 52, freqEnd: 34, duration: dur,
    attack: 0.05, decay: 0.14, sustain: 0.78, release: 0.1,
    volume: 0.28, filterFreq: 180, delaySend: 0, when: t0,
  });
  playSynth({
    type: 'sawtooth', freq: 88, freqEnd: 54, duration: dur,
    attack: 0.08, decay: 0.16, sustain: 0.55, release: 0.1,
    volume: 0.1, filterType: 'lowpass', filterFreq: 420, filterEnd: 220, delaySend: 0, when: t0,
  });
  playNoiseBurst({
    duration: dur * 0.85, filterFreq: 900, filterEnd: 1700, filterType: 'bandpass', filterQ: 1.05,
    volume: 0.26, delaySend: 0.07, when: t0 + 0.05,
  });
  playNoiseBurst({
    duration: 0.1, filterFreq: 1500, filterType: 'bandpass', filterQ: 2.0,
    volume: 0.2, when: t0 + dur * 0.32,
  });
  playNoiseBurst({
    duration: 0.11, filterFreq: 1800, filterType: 'bandpass', filterQ: 2.2,
    volume: 0.24, when: t0 + dur * 0.58,
  });
  playNoiseBurst({
    duration: 0.1, filterFreq: 2100, filterType: 'bandpass', filterQ: 2.4,
    volume: 0.22, when: t0 + dur * 0.82,
  });
}

function sfxCoreBulkheadLock() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted) return;
  const t0 = audioCtx.currentTime;
  playCoreBulkheadThunk(t0, 86, -0.48);
  playCoreBulkheadThunk(t0 + 0.07, 64, 0.48);
}

function startCoreBulkheadHoldSound({ preview = false } = {}) {
  if (coreBulkheadHoldNodes || !audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.linearRampToValueAtTime(preview ? 0.32 : 0.2, t0 + 0.14);
  out.connect(sfxGain);

  const press = createGlowDangerNoise();
  const pressFilt = audioCtx.createBiquadFilter();
  pressFilt.type = 'lowpass';
  pressFilt.Q.value = 0.55;
  pressFilt.frequency.setValueAtTime(220, t0);
  const pressGain = audioCtx.createGain();
  pressGain.gain.value = 0.85;
  press.connect(pressFilt);
  pressFilt.connect(pressGain);
  pressGain.connect(out);

  const grind = createGlowDangerNoise();
  const grindFilt = audioCtx.createBiquadFilter();
  grindFilt.type = 'bandpass';
  grindFilt.Q.value = 1.1;
  grindFilt.frequency.setValueAtTime(520, t0);
  const grindGain = audioCtx.createGain();
  grindGain.gain.value = 0.4;
  grind.connect(grindFilt);
  grindFilt.connect(grindGain);
  grindGain.connect(out);

  const servo = audioCtx.createOscillator();
  servo.type = 'sine';
  servo.frequency.setValueAtTime(42, t0);
  const servoGain = audioCtx.createGain();
  servoGain.gain.value = 0.45;
  servo.connect(servoGain);
  servoGain.connect(out);

  const sources = [press, grind, servo];
  if (preview || coreBulkheadIsMoving) {
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = preview ? 0.18 : (60 / CORE_BULKHEAD_DRIFT_PERIOD);
    const lfoVol = audioCtx.createGain();
    lfoVol.gain.value = preview ? 0.06 : 0.035;
    lfo.connect(lfoVol);
    lfoVol.connect(out.gain);
    sources.push(lfo);
  }

  sources.forEach((src) => src.start(t0));
  coreBulkheadHoldNodes = { out, sources };
}

function stopCoreBulkheadHoldSound() {
  if (!coreBulkheadHoldNodes) return;
  const nodes = coreBulkheadHoldNodes;
  coreBulkheadHoldNodes = null;
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  try {
    nodes.out.gain.cancelScheduledValues(now);
    nodes.out.gain.setValueAtTime(Math.max(0.0001, nodes.out.gain.value), now);
    nodes.out.gain.linearRampToValueAtTime(0.0001, now + 0.14);
  } catch (e) { /* already stopped */ }
  nodes.sources.forEach((src) => {
    try { src.stop(now + 0.16); } catch (e) { /* already stopped */ }
  });
}

function syncCoreBulkheadHoldSound() {
  if (typeof previewLoopId === 'string' && previewLoopId === 'coreBulkHold') return;
  const th = currentTheme();
  const active = state === 'playing'
    && th
    && th.isMiniBossZone
    && th.miniBossVariant === 'core'
    && miniBoss
    && !coreBossDefeated
    && miniBossAttackState === 'coreBulkheadActive';
  if (!active) {
    stopCoreBulkheadHoldSound();
    return;
  }
  startCoreBulkheadHoldSound();
}

function playLockOn() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playJavelinAcquireBeep(t0);
  playJavelinAcquireBeep(t0 + 0.2);
}

// MW2 Javelin-style lock: a few dry HUD beeps, then a held rising whine.
function playJavelinAcquireBeep(when) {
  playSynth({
    type: 'sine', freq: 1080, duration: 0.09,
    attack: 0.002, decay: 0.02, sustain: 0.4, release: 0.03,
    volume: 0.24, filterFreq: 4200, delaySend: 0, when,
  });
  playSynth({
    type: 'sine', freq: 2160, duration: 0.07,
    attack: 0.002, decay: 0.018, sustain: 0.25, release: 0.025,
    volume: 0.07, filterFreq: 5000, delaySend: 0, when,
  });
}

function playTrackingLockOn() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const dur = 1.42;
  playNoiseBurst({
    duration: dur, filterFreq: 420, filterEnd: 2400, filterType: 'bandpass', filterQ: 1.4,
    volume: 0.05, delaySend: 0, when: t0,
  });
  playSynth({
    type: 'sine', freq: 420, freqEnd: 1680, duration: dur,
    attack: 0.08, decay: 0.2, sustain: 0.85, release: 0.06,
    volume: 0.1, filterFreq: 2800, delaySend: 0, when: t0,
  });
  playSynth({
    type: 'sine', freq: 430, freqEnd: 1710, duration: dur,
    attack: 0.1, decay: 0.22, sustain: 0.7, release: 0.06,
    volume: 0.045, filterFreq: 3200, delaySend: 0, when: t0,
  });
}

function playBulletVolley() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.22, filterFreq: 380, filterEnd: 90, filterType: 'lowpass', filterQ: 0.45, volume: 0.58, when: t0 });
  playNoiseBurst({ duration: 0.1, filterFreq: 1400, filterEnd: 400, filterType: 'bandpass', filterQ: 0.9, volume: 0.38, when: t0 });
  playSynth({ type: 'sine', freq: 72, freqEnd: 28, duration: 0.22, attack: 0.001, decay: 0.05, sustain: 0.35, release: 0.1, volume: 0.36, filterFreq: 220, delaySend: 0, when: t0 });
  playSynth({ type: 'sawtooth', freq: 140, freqEnd: 42, duration: 0.12, attack: 0.001, decay: 0.03, sustain: 0.22, release: 0.05, volume: 0.18, filterType: 'lowpass', filterFreq: 650, delaySend: 0, when: t0 });
  playNoiseBurst({ duration: 0.045, filterFreq: 3200, filterType: 'highpass', volume: 0.28, when: t0 });
  playNoiseBurst({ duration: 0.04, filterFreq: 2600, filterType: 'highpass', volume: 0.22, when: t0 + 0.012 });
  playNoiseBurst({ duration: 0.035, filterFreq: 2200, filterType: 'highpass', volume: 0.16, when: t0 + 0.024 });
}

function playEnergyShot() {
  playNoiseBurst({ duration: 0.05, filterFreq: 4200, filterType: 'highpass', volume: 0.22 });
  playSynth({ type: 'sawtooth', freq: 1320, freqEnd: 240, duration: 0.09, attack: 0.001, decay: 0.025, sustain: 0.25, release: 0.04, volume: 0.16, filterType: 'lowpass', filterFreq: 3200, filterEnd: 900, delaySend: 0.12 });
  playSynth({ type: 'sine', freq: 220, freqEnd: 90, duration: 0.08, attack: 0.001, decay: 0.02, sustain: 0.3, release: 0.04, volume: 0.18, filterFreq: 600, delaySend: 0 });
}

function playPlasmaShot() {
  playSynth({ type: 'sawtooth', freq: 420, freqEnd: 180, duration: 0.14, attack: 0.004, decay: 0.04, sustain: 0.4, release: 0.06, volume: 0.14, filterType: 'lowpass', filterFreq: 1800, detune: -18, delaySend: 0.22 });
  playSynth({ type: 'sawtooth', freq: 445, freqEnd: 195, duration: 0.14, attack: 0.004, decay: 0.04, sustain: 0.4, release: 0.06, volume: 0.12, filterType: 'lowpass', filterFreq: 1800, detune: 18, delaySend: 0.22 });
  playNoiseBurst({ duration: 0.1, filterFreq: 1600, filterType: 'bandpass', filterQ: 1.6, volume: 0.16 });
}

function playMetalClank() {
  playNoiseBurst({ duration: 0.045, filterFreq: 1800, filterType: 'bandpass', filterQ: 2.4, volume: 0.28 });
  playSynth({ type: 'sine', freq: 820, freqEnd: 210, duration: 0.08, attack: 0.001, decay: 0.02, sustain: 0.2, release: 0.05, volume: 0.22, filterFreq: 2400, delaySend: 0.08 });
  playSynth({ type: 'sine', freq: 175, freqEnd: 90, duration: 0.1, attack: 0.001, decay: 0.03, sustain: 0.25, release: 0.05, volume: 0.2, filterFreq: 500, delaySend: 0 });
}

function playStationAirlockHit() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.09, filterFreq: 3200, filterEnd: 900, filterType: 'bandpass', filterQ: 1.1, volume: 0.2, delaySend: 0.16, when: t0 });
  playNoiseBurst({ duration: 0.05, filterFreq: 4800, filterType: 'highpass', volume: 0.1, when: t0 });
  playSynth({ type: 'sine', freq: 148, freqEnd: 58, duration: 0.16, attack: 0.001, decay: 0.04, sustain: 0.28, release: 0.08, volume: 0.2, filterFreq: 360, delaySend: 0, when: t0 });
  playSynth({ type: 'sine', freq: 1180, freqEnd: 420, duration: 0.08, attack: 0.001, decay: 0.02, sustain: 0.18, release: 0.05, volume: 0.1, filterFreq: 2800, delaySend: 0.22, when: t0 });
  playSynth({ type: 'sine', freq: 784, freqEnd: 784, duration: 0.07, attack: 0.001, decay: 0.02, sustain: 0.15, release: 0.05, volume: 0.06, filterFreq: 2400, delaySend: 0.18, when: t0 + 0.02 });
}

function playBulkheadHit() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.1, filterFreq: 420, filterEnd: 140, filterType: 'lowpass', filterQ: 0.55, volume: 0.42, when: t0 });
  playNoiseBurst({ duration: 0.06, filterFreq: 1400, filterType: 'bandpass', filterQ: 2.8, volume: 0.28, when: t0 });
  playNoiseBurst({ duration: 0.04, filterFreq: 2800, filterType: 'bandpass', filterQ: 3.4, volume: 0.16, when: t0 });
  playSynth({ type: 'sine', freq: 92, freqEnd: 38, duration: 0.18, attack: 0.001, decay: 0.04, sustain: 0.32, release: 0.08, volume: 0.3, filterFreq: 260, delaySend: 0, when: t0 });
  playSynth({ type: 'triangle', freq: 310, freqEnd: 95, duration: 0.14, attack: 0.001, decay: 0.035, sustain: 0.28, release: 0.07, volume: 0.16, filterFreq: 900, delaySend: 0.06, when: t0 });
  playSynth({ type: 'sine', freq: 620, freqEnd: 180, duration: 0.12, attack: 0.001, decay: 0.03, sustain: 0.22, release: 0.08, volume: 0.14, filterFreq: 1800, delaySend: 0.12, when: t0 });
  playSynth({ type: 'triangle', freq: 980, freqEnd: 240, duration: 0.1, attack: 0.001, decay: 0.025, sustain: 0.18, release: 0.07, volume: 0.08, filterFreq: 2400, delaySend: 0.1, when: t0 + 0.02 });
}

function playRockThud() {
  playNoiseBurst({ duration: 0.12, filterFreq: 380, filterEnd: 140, filterType: 'lowpass', filterQ: 0.6, volume: 0.4 });
  playSynth({ type: 'sine', freq: 78, freqEnd: 36, duration: 0.14, attack: 0.002, decay: 0.04, sustain: 0.3, release: 0.06, volume: 0.26, filterFreq: 220, delaySend: 0 });
}

function playGateNeonSlam() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.05, filterFreq: 4200, filterType: 'highpass', volume: 0.28, when: t0 });
  playSynth({ type: 'sine', freq: 98, freqEnd: 38, duration: 0.12, attack: 0.001, decay: 0.03, sustain: 0.28, release: 0.05, volume: 0.34, filterFreq: 260, delaySend: 0, when: t0 });
  playSynth({ type: 'sawtooth', freq: 1680, freqEnd: 220, duration: 0.07, attack: 0.001, decay: 0.018, sustain: 0.18, release: 0.03, volume: 0.12, filterType: 'lowpass', filterFreq: 3600, filterEnd: 700, delaySend: 0.14, when: t0 });
  playSynth({ type: 'sine', freq: 2480, freqEnd: 720, duration: 0.05, attack: 0.001, decay: 0.012, sustain: 0.2, release: 0.03, volume: 0.14, filterFreq: 4200, delaySend: 0.16, when: t0 });
}

function playHBarClank() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.035, filterFreq: 2600, filterType: 'bandpass', filterQ: 4.2, volume: 0.26, when: t0 });
  playNoiseBurst({ duration: 0.05, filterFreq: 1400, filterType: 'bandpass', filterQ: 1.6, volume: 0.14, when: t0 });
  playSynth({ type: 'sine', freq: 1480, freqEnd: 420, duration: 0.1, attack: 0.001, decay: 0.025, sustain: 0.18, release: 0.06, volume: 0.2, filterFreq: 3200, delaySend: 0.12, when: t0 });
  playSynth({ type: 'triangle', freq: 980, freqEnd: 260, duration: 0.08, attack: 0.001, decay: 0.02, sustain: 0.2, release: 0.05, volume: 0.12, filterFreq: 2400, delaySend: 0.08, when: t0 });
  playSynth({ type: 'sine', freq: 220, freqEnd: 110, duration: 0.07, attack: 0.001, decay: 0.02, sustain: 0.22, release: 0.03, volume: 0.1, filterFreq: 600, delaySend: 0, when: t0 });
}

function playAsteroidCrunch() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.14, filterFreq: 420, filterEnd: 120, filterType: 'lowpass', filterQ: 0.55, volume: 0.38, when: t0 });
  playNoiseBurst({ duration: 0.08, filterFreq: 1600, filterEnd: 500, filterType: 'bandpass', filterQ: 1.1, volume: 0.22, when: t0 });
  playNoiseBurst({ duration: 0.04, filterFreq: 2800, filterType: 'bandpass', filterQ: 2.4, volume: 0.16, when: t0 + 0.03 });
  playNoiseBurst({ duration: 0.035, filterFreq: 1900, filterType: 'bandpass', filterQ: 2.0, volume: 0.12, when: t0 + 0.07 });
  playNoiseBurst({ duration: 0.03, filterFreq: 2400, filterType: 'highpass', volume: 0.1, when: t0 + 0.11 });
  playSynth({ type: 'sine', freq: 72, freqEnd: 32, duration: 0.16, attack: 0.002, decay: 0.05, sustain: 0.28, release: 0.07, volume: 0.22, filterFreq: 200, delaySend: 0, when: t0 });
}

function playPendulumThunk() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.12, filterFreq: 320, filterEnd: 110, filterType: 'lowpass', filterQ: 0.55, volume: 0.4, when: t0 });
  playSynth({ type: 'sine', freq: 62, freqEnd: 28, duration: 0.18, attack: 0.002, decay: 0.05, sustain: 0.32, release: 0.08, volume: 0.3, filterFreq: 180, delaySend: 0, when: t0 });
  playSynth({ type: 'triangle', freq: 240, freqEnd: 90, duration: 0.1, attack: 0.001, decay: 0.03, sustain: 0.22, release: 0.05, volume: 0.12, filterFreq: 700, delaySend: 0, when: t0 });
  playNoiseBurst({ duration: 0.03, filterFreq: 2200, filterType: 'bandpass', filterQ: 3.4, volume: 0.16, when: t0 + 0.018 });
  playSynth({ type: 'triangle', freq: 1860, freqEnd: 820, duration: 0.045, attack: 0.001, decay: 0.012, sustain: 0.18, release: 0.03, volume: 0.1, filterFreq: 3600, delaySend: 0.1, when: t0 + 0.02 });
  playSynth({ type: 'triangle', freq: 1480, freqEnd: 540, duration: 0.04, attack: 0.001, decay: 0.01, sustain: 0.16, release: 0.025, volume: 0.08, filterFreq: 3200, delaySend: 0.08, when: t0 + 0.048 });
  playSynth({ type: 'sine', freq: 1240, freqEnd: 420, duration: 0.05, attack: 0.001, decay: 0.012, sustain: 0.15, release: 0.03, volume: 0.07, filterFreq: 2800, delaySend: 0.08, when: t0 + 0.08 });
}

function playBowserFireball() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({
    duration: 0.28, filterFreq: 420, filterEnd: 1600, filterType: 'bandpass', filterQ: 0.65,
    volume: 0.32, delaySend: 0.08, when: t0
  });
  playNoiseBurst({
    duration: 0.18, filterFreq: 2200, filterType: 'highpass',
    volume: 0.12, when: t0 + 0.03
  });
  playSynth({
    type: 'sawtooth', freq: 78, freqEnd: 42, duration: 0.34,
    attack: 0.02, decay: 0.1, sustain: 0.4, release: 0.12,
    volume: 0.16, filterFreq: 220, delaySend: 0, when: t0
  });
  playSynth({
    type: 'sine', freq: 110, freqEnd: 55, duration: 0.3,
    attack: 0.015, decay: 0.08, sustain: 0.35, release: 0.1,
    volume: 0.12, filterFreq: 280, delaySend: 0, when: t0
  });
}

let fireballBreathNodes = null;

function startFireballBreathSound() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || fireballBreathNodes) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.connect(sfxGain);

  const hiss = createGlowDangerNoise();
  const hissFilt = audioCtx.createBiquadFilter();
  hissFilt.type = 'bandpass';
  hissFilt.frequency.value = 850;
  hissFilt.Q.value = 0.65;
  const hissGain = audioCtx.createGain();
  hissGain.gain.value = 0.22;
  hiss.connect(hissFilt);
  hissFilt.connect(hissGain);
  hissGain.connect(out);

  const roarNoise = createGlowDangerNoise();
  const roarFilt = audioCtx.createBiquadFilter();
  roarFilt.type = 'lowpass';
  roarFilt.frequency.value = 200;
  roarFilt.Q.value = 0.55;
  const roarGain = audioCtx.createGain();
  roarGain.gain.value = 0.18;
  roarNoise.connect(roarFilt);
  roarFilt.connect(roarGain);
  roarGain.connect(out);

  const furnace = audioCtx.createOscillator();
  furnace.type = 'sawtooth';
  furnace.frequency.value = 46;
  const fFilt = audioCtx.createBiquadFilter();
  fFilt.type = 'lowpass';
  fFilt.frequency.value = 130;
  const fGain = audioCtx.createGain();
  fGain.gain.value = 0.1;
  furnace.connect(fFilt);
  fFilt.connect(fGain);
  fGain.connect(out);

  const crackle = createGlowDangerNoise();
  const cFilt = audioCtx.createBiquadFilter();
  cFilt.type = 'highpass';
  cFilt.frequency.value = 2400;
  const cGain = audioCtx.createGain();
  cGain.gain.value = 0.06;
  const cMix = audioCtx.createGain();
  cMix.gain.value = 1;
  const lfo = audioCtx.createOscillator();
  lfo.type = 'square';
  lfo.frequency.value = 12;
  const lfoDepth = audioCtx.createGain();
  lfoDepth.gain.value = 0.05;
  lfo.connect(lfoDepth);
  lfoDepth.connect(cGain.gain);
  crackle.connect(cFilt);
  cFilt.connect(cGain);
  cGain.connect(cMix);
  cMix.connect(out);

  hiss.start(now);
  roarNoise.start(now);
  furnace.start(now);
  crackle.start(now);
  lfo.start(now);

  fireballBreathNodes = {
    out, hissFilt, roarFilt, fFilt, hissGain, roarGain, fGain, cMix, lfo,
    sources: [hiss, roarNoise, furnace, crackle, lfo]
  };
}

function stopFireballBreathSound() {
  if (!fireballBreathNodes || !audioCtx) return;
  const now = audioCtx.currentTime;
  const { out, sources } = fireballBreathNodes;
  try {
    out.gain.cancelScheduledValues(now);
    out.gain.setValueAtTime(Math.max(0.0001, out.gain.value), now);
    out.gain.exponentialRampToValueAtTime(0.0001, now + 0.14);
  } catch (e) { /* gain already gone */ }
  sources.forEach((s) => { try { s.stop(now + 0.16); } catch (err) { /* already stopped */ } });
  fireballBreathNodes = null;
}

function fireballBreathProximity() {
  let best = 0;
  for (const g of gates) {
    if (!g || g.type !== 'fireball') continue;
    const gy = liveFireballY(g);
    const dx = g.x - ship.x;
    const dy = gy - ship.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const t = 1 - Math.min(1, dist / 560);
    const behind = dx < -24 ? Math.max(0, 1 + dx / 220) : 1;
    const prox = Math.pow(Math.max(0, t), 1.35) * behind;
    if (prox > best) best = prox;
  }
  return best;
}

function updateFireballBreathMix(prox) {
  if (!fireballBreathNodes || !audioCtx) return;
  const t = audioCtx.currentTime;
  const n = fireballBreathNodes;
  n.out.gain.setTargetAtTime(0.1 + prox * 0.9, t, 0.07);
  n.hissFilt.frequency.setTargetAtTime(650 + prox * 1500, t, 0.09);
  n.hissGain.gain.setTargetAtTime(0.14 + prox * 0.32, t, 0.09);
  n.roarFilt.frequency.setTargetAtTime(150 + prox * 200, t, 0.09);
  n.roarGain.gain.setTargetAtTime(0.1 + prox * 0.32, t, 0.09);
  n.fFilt.frequency.setTargetAtTime(100 + prox * 100, t, 0.09);
  n.fGain.gain.setTargetAtTime(0.06 + prox * 0.18, t, 0.09);
  n.cMix.gain.setTargetAtTime(0.6 + prox * 1.2, t, 0.09);
  n.lfo.frequency.setTargetAtTime(7 + prox * 20, t, 0.09);
}

function syncFireballBreathSound() {
  if (ghostMode || (state !== 'playing' && state !== 'paused')) {
    stopFireballBreathSound();
    return;
  }
  const prox = fireballBreathProximity();
  if (prox < 0.025) {
    stopFireballBreathSound();
    return;
  }
  if (!fireballBreathNodes && prox < 0.06) return;
  startFireballBreathSound();
  updateFireballBreathMix(prox);
}

function shipHazardProximity(x, y, reach) {
  const dx = x - ship.x;
  const dy = y - ship.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const t = 1 - Math.min(1, dist / reach);
  const behind = dx < -28 ? Math.max(0, 1 + dx / 200) : 1;
  return Math.pow(Math.max(0, t), 1.4) * behind;
}

function fadeStopLoopNodes(nodes, fade = 0.14) {
  if (!nodes || !audioCtx) return;
  const now = audioCtx.currentTime;
  try {
    nodes.out.gain.cancelScheduledValues(now);
    nodes.out.gain.setValueAtTime(Math.max(0.0001, nodes.out.gain.value), now);
    nodes.out.gain.exponentialRampToValueAtTime(0.0001, now + fade);
  } catch (e) { /* gain already gone */ }
  nodes.sources.forEach((s) => { try { s.stop(now + fade + 0.02); } catch (err) { /* already stopped */ } });
}

let toxicAcidNodes = null;
let toxicPoolNodes = null;
let toxicGeyserNodes = null;

function startToxicAcidSound() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || toxicAcidNodes) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.connect(sfxGain);

  const hiss = createGlowDangerNoise();
  const hissFilt = audioCtx.createBiquadFilter();
  hissFilt.type = 'bandpass';
  hissFilt.frequency.value = 1400;
  hissFilt.Q.value = 0.85;
  const hissGain = audioCtx.createGain();
  hissGain.gain.value = 0.12;
  hiss.connect(hissFilt);
  hissFilt.connect(hissGain);
  hissGain.connect(out);

  const drip = createGlowDangerNoise();
  const dripFilt = audioCtx.createBiquadFilter();
  dripFilt.type = 'highpass';
  dripFilt.frequency.value = 2200;
  const dripGain = audioCtx.createGain();
  dripGain.gain.value = 0.04;
  const dripLfo = audioCtx.createOscillator();
  dripLfo.type = 'square';
  dripLfo.frequency.value = 4.2;
  const dripDepth = audioCtx.createGain();
  dripDepth.gain.value = 0.035;
  dripLfo.connect(dripDepth);
  dripDepth.connect(dripGain.gain);
  drip.connect(dripFilt);
  dripFilt.connect(dripGain);
  dripGain.connect(out);

  hiss.start(now);
  drip.start(now);
  dripLfo.start(now);
  toxicAcidNodes = { out, hissFilt, hissGain, dripFilt, dripLfo, dripDepth, sources: [hiss, drip, dripLfo] };
}

function stopToxicAcidSound() {
  fadeStopLoopNodes(toxicAcidNodes);
  toxicAcidNodes = null;
}

function updateToxicAcidMix(prox) {
  if (!toxicAcidNodes || !audioCtx) return;
  const t = audioCtx.currentTime;
  const n = toxicAcidNodes;
  n.out.gain.setTargetAtTime(0.05 + prox * 0.32, t, 0.08);
  n.hissFilt.frequency.setTargetAtTime(1100 + prox * 900, t, 0.1);
  n.hissGain.gain.setTargetAtTime(0.07 + prox * 0.16, t, 0.1);
  n.dripFilt.frequency.setTargetAtTime(1800 + prox * 1600, t, 0.1);
  n.dripLfo.frequency.setTargetAtTime(3.2 + prox * 5, t, 0.1);
  n.dripDepth.gain.setTargetAtTime(0.02 + prox * 0.05, t, 0.1);
}

function startToxicPoolSound() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || toxicPoolNodes) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.connect(sfxGain);

  const gurgle = createGlowDangerNoise();
  const gFilt = audioCtx.createBiquadFilter();
  gFilt.type = 'bandpass';
  gFilt.frequency.value = 240;
  gFilt.Q.value = 1.1;
  const gGain = audioCtx.createGain();
  gGain.gain.value = 0.14;
  gurgle.connect(gFilt);
  gFilt.connect(gGain);
  gGain.connect(out);

  const slime = audioCtx.createOscillator();
  slime.type = 'sine';
  slime.frequency.value = 62;
  const sFilt = audioCtx.createBiquadFilter();
  sFilt.type = 'lowpass';
  sFilt.frequency.value = 140;
  const sGain = audioCtx.createGain();
  sGain.gain.value = 0.08;
  slime.connect(sFilt);
  sFilt.connect(sGain);
  sGain.connect(out);

  const wobble = audioCtx.createOscillator();
  wobble.type = 'sine';
  wobble.frequency.value = 2.4;
  const wobbleDepth = audioCtx.createGain();
  wobbleDepth.gain.value = 18;
  wobble.connect(wobbleDepth);
  wobbleDepth.connect(gFilt.frequency);

  gurgle.start(now);
  slime.start(now);
  wobble.start(now);
  toxicPoolNodes = { out, gFilt, gGain, sFilt, sGain, wobble, wobbleDepth, sources: [gurgle, slime, wobble] };
}

function stopToxicPoolSound() {
  fadeStopLoopNodes(toxicPoolNodes);
  toxicPoolNodes = null;
}

function updateToxicPoolMix(prox) {
  if (!toxicPoolNodes || !audioCtx) return;
  const t = audioCtx.currentTime;
  const n = toxicPoolNodes;
  n.out.gain.setTargetAtTime(0.06 + prox * 0.36, t, 0.09);
  n.gFilt.frequency.setTargetAtTime(200 + prox * 160, t, 0.1);
  n.gGain.gain.setTargetAtTime(0.08 + prox * 0.18, t, 0.1);
  n.sGain.gain.setTargetAtTime(0.04 + prox * 0.12, t, 0.1);
  n.wobble.frequency.setTargetAtTime(1.6 + prox * 2.2, t, 0.12);
}

function geyserActivity(g) {
  const p = geyserPhase(g);
  if (p < g.warningFrames) return 0.35 + 0.4 * (p / Math.max(1, g.warningFrames));
  let t = p - g.warningFrames;
  if (t < g.riseFrames) return 0.75 + 0.25 * (t / Math.max(1, g.riseFrames));
  t -= g.riseFrames;
  if (t < g.holdFrames) return 1;
  t -= g.holdFrames;
  if (t < g.fallFrames) return 0.85 * (1 - t / Math.max(1, g.fallFrames)) + 0.18;
  return 0.1;
}

function geyserStage(g) {
  const p = geyserPhase(g);
  if (p < g.warningFrames) return 'warning';
  let t = p - g.warningFrames;
  if (t < g.riseFrames) return 'rise';
  t -= g.riseFrames;
  if (t < g.holdFrames) return 'hold';
  t -= g.holdFrames;
  if (t < g.fallFrames) return 'fall';
  return 'rest';
}

function playGeyserEruption(intensity) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const v = Math.max(0.15, Math.min(1, intensity));
  const t0 = audioCtx.currentTime;

  // chemical spray — wet hiss that opens upward, not a boom
  playNoiseBurst({
    duration: 0.52, filterFreq: 420, filterEnd: 2600, filterType: 'bandpass', filterQ: 1.7,
    volume: 0.26 * v, delaySend: 0.2, when: t0
  });
  playNoiseBurst({
    duration: 0.4, filterFreq: 1900, filterEnd: 700, filterType: 'bandpass', filterQ: 2.6,
    volume: 0.18 * v, delaySend: 0.24, when: t0 + 0.05
  });

  // inharmonic "creature throat" — odd ratios, not a kick drum
  playSynth({
    type: 'triangle', freq: 67, freqEnd: 49, duration: 0.58,
    attack: 0.04, decay: 0.2, sustain: 0.38, release: 0.24,
    volume: 0.15 * v, filterType: 'bandpass', filterFreq: 380, filterQ: 3.4, filterEnd: 240,
    delaySend: 0.28, when: t0
  });
  playSynth({
    type: 'sine', freq: 107, freqEnd: 83, duration: 0.5,
    attack: 0.05, decay: 0.16, sustain: 0.34, release: 0.22,
    volume: 0.11 * v, filterFreq: 720, detune: 22, delaySend: 0.3, when: t0 + 0.02
  });
  playSynth({
    type: 'sine', freq: 286, freqEnd: 209, duration: 0.42,
    attack: 0.03, decay: 0.14, sustain: 0.28, release: 0.2,
    volume: 0.08 * v, filterType: 'bandpass', filterFreq: 860, filterQ: 4.2, filterEnd: 520,
    delaySend: 0.32, when: t0 + 0.06
  });

  // slime squelch — pitch leaps up, then collapses like a bubble bursting
  playSynth({
    type: 'sine', freq: 150, freqEnd: 470, duration: 0.14,
    attack: 0.012, decay: 0.05, sustain: 0.35, release: 0.07,
    volume: 0.13 * v, filterFreq: 1400, delaySend: 0.16, when: t0
  });
  playSynth({
    type: 'triangle', freq: 410, freqEnd: 78, duration: 0.32,
    attack: 0.01, decay: 0.12, sustain: 0.22, release: 0.14,
    volume: 0.11 * v, filterFreq: 1100, filterEnd: 280, delaySend: 0.22, when: t0 + 0.11
  });

  // stray acid bubbles
  playSynth({
    type: 'sine', freq: 940, freqEnd: 210, duration: 0.09,
    attack: 0.002, decay: 0.03, sustain: 0.18, release: 0.04,
    volume: 0.08 * v, filterFreq: 2600, delaySend: 0.14, when: t0 + 0.08
  });
  playSynth({
    type: 'sine', freq: 1280, freqEnd: 340, duration: 0.08,
    attack: 0.002, decay: 0.028, sustain: 0.18, release: 0.035,
    volume: 0.07 * v, filterFreq: 3000, delaySend: 0.14, when: t0 + 0.16
  });
  playSynth({
    type: 'sine', freq: 720, freqEnd: 160, duration: 0.1,
    attack: 0.002, decay: 0.032, sustain: 0.18, release: 0.04,
    volume: 0.07 * v, filterFreq: 2200, delaySend: 0.16, when: t0 + 0.25
  });

  // slow FM worm — inharmonic modulator so it reads as alien, not impact
  const car = audioCtx.createOscillator();
  car.type = 'sine';
  car.frequency.setValueAtTime(81, t0);
  car.frequency.exponentialRampToValueAtTime(54, t0 + 0.55);
  const mod = audioCtx.createOscillator();
  mod.type = 'sine';
  mod.frequency.setValueAtTime(29.5, t0);
  const modGain = audioCtx.createGain();
  modGain.gain.setValueAtTime(70 * v, t0);
  modGain.gain.exponentialRampToValueAtTime(12, t0 + 0.5);
  mod.connect(modGain);
  modGain.connect(car.frequency);
  const fmFilt = audioCtx.createBiquadFilter();
  fmFilt.type = 'lowpass';
  fmFilt.frequency.setValueAtTime(520, t0);
  fmFilt.frequency.exponentialRampToValueAtTime(180, t0 + 0.5);
  const fmGain = audioCtx.createGain();
  fmGain.gain.setValueAtTime(0.0001, t0);
  fmGain.gain.linearRampToValueAtTime(0.14 * v, t0 + 0.05);
  fmGain.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.62);
  car.connect(fmFilt);
  fmFilt.connect(fmGain);
  fmGain.connect(sfxGain);
  if (delayInput) {
    const send = audioCtx.createGain();
    send.gain.value = 0.26;
    fmGain.connect(send);
    send.connect(delayInput);
  }
  car.start(t0);
  mod.start(t0);
  car.stop(t0 + 0.66);
  mod.stop(t0 + 0.66);
}

function updateGeyserEruptionSfx() {
  if (state !== 'playing' || ghostMode) return;
  for (const g of gates) {
    if (!g || g.type !== 'geyser') continue;
    const stage = geyserStage(g);
    const prev = g.geyserSfxStage;
    g.geyserSfxStage = stage;
    if (prev == null) continue;
    if (stage !== 'rise' || prev === 'rise') continue;
    const h = liveGeyserHeight(g);
    const gy = g.pivotSide === 'floor' ? PLAY_BOTTOM - h * 0.55 : PLAY_TOP + h * 0.55;
    const prox = shipHazardProximity(g.x, gy, 680);
    if (prox < 0.07) continue;
    playGeyserEruption(0.4 + prox * 0.7);
  }
}

function startToxicGeyserSound() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || toxicGeyserNodes) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.connect(sfxGain);

  const roar = createGlowDangerNoise();
  const roarFilt = audioCtx.createBiquadFilter();
  roarFilt.type = 'lowpass';
  roarFilt.frequency.value = 180;
  roarFilt.Q.value = 0.6;
  const roarGain = audioCtx.createGain();
  roarGain.gain.value = 0.2;
  roar.connect(roarFilt);
  roarFilt.connect(roarGain);
  roarGain.connect(out);

  const rumble = audioCtx.createOscillator();
  rumble.type = 'sawtooth';
  rumble.frequency.value = 38;
  const rFilt = audioCtx.createBiquadFilter();
  rFilt.type = 'lowpass';
  rFilt.frequency.value = 90;
  const rGain = audioCtx.createGain();
  rGain.gain.value = 0.09;
  rumble.connect(rFilt);
  rFilt.connect(rGain);
  rGain.connect(out);

  const spray = createGlowDangerNoise();
  const sprayFilt = audioCtx.createBiquadFilter();
  sprayFilt.type = 'highpass';
  sprayFilt.frequency.value = 1600;
  const sprayGain = audioCtx.createGain();
  sprayGain.gain.value = 0.05;
  spray.connect(sprayFilt);
  sprayFilt.connect(sprayGain);
  sprayGain.connect(out);

  roar.start(now);
  rumble.start(now);
  spray.start(now);
  toxicGeyserNodes = { out, roarFilt, roarGain, rFilt, rGain, sprayFilt, sprayGain, sources: [roar, rumble, spray] };
}

function stopToxicGeyserSound() {
  fadeStopLoopNodes(toxicGeyserNodes);
  toxicGeyserNodes = null;
}

function updateToxicGeyserMix(prox) {
  if (!toxicGeyserNodes || !audioCtx) return;
  const t = audioCtx.currentTime;
  const n = toxicGeyserNodes;
  n.out.gain.setTargetAtTime(0.05 + prox * 0.42, t, 0.08);
  n.roarFilt.frequency.setTargetAtTime(130 + prox * 160, t, 0.1);
  n.roarGain.gain.setTargetAtTime(0.1 + prox * 0.22, t, 0.1);
  n.rGain.gain.setTargetAtTime(0.04 + prox * 0.14, t, 0.1);
  n.sprayFilt.frequency.setTargetAtTime(1400 + prox * 1800, t, 0.1);
  n.sprayGain.gain.setTargetAtTime(0.02 + prox * 0.12, t, 0.1);
}

function toxicAcidProximity() {
  let best = 0;
  for (const g of gates) {
    if (!g || g.type !== 'aciddrip') continue;
    const prox = shipHazardProximity(g.x, liveAcidDripY(g), 430);
    if (prox > best) best = prox;
  }
  return best;
}

function toxicPoolProximity() {
  let best = 0;
  for (const g of gates) {
    if (!g || g.type !== 'toxicpool') continue;
    const reach = 400 + liveToxicPoolRadius(g) * 1.4;
    const prox = shipHazardProximity(g.x, g.y, reach);
    if (prox > best) best = prox;
  }
  return best;
}

function toxicGeyserProximity() {
  let best = 0;
  for (const g of gates) {
    if (!g || g.type !== 'geyser') continue;
    const h = liveGeyserHeight(g);
    const gy = g.pivotSide === 'floor' ? PLAY_BOTTOM - h * 0.55 : PLAY_TOP + h * 0.55;
    const prox = shipHazardProximity(g.x, gy, 520) * geyserActivity(g);
    if (prox > best) best = prox;
  }
  return best;
}

function toxicHazardTesterActive() {
  return previewLoopId === 'hzAcid' || previewLoopId === 'hzToxic' || previewLoopId === 'hzGeyser';
}

function stopToxicHazardSounds() {
  stopToxicAcidSound();
  stopToxicPoolSound();
  stopToxicGeyserSound();
}

function syncOneToxicLoop(prox, nodes, startFn, stopFn, mixFn) {
  if (prox < 0.03) {
    stopFn();
    return;
  }
  if (!nodes && prox < 0.07) return;
  startFn();
  mixFn(prox);
}

function syncToxicHazardSounds() {
  updateGeyserEruptionSfx();
  if (toxicHazardTesterActive()) return;
  if (ghostMode || (state !== 'playing' && state !== 'paused')) {
    stopToxicHazardSounds();
    return;
  }
  syncOneToxicLoop(toxicAcidProximity(), toxicAcidNodes, startToxicAcidSound, stopToxicAcidSound, updateToxicAcidMix);
  syncOneToxicLoop(toxicPoolProximity(), toxicPoolNodes, startToxicPoolSound, stopToxicPoolSound, updateToxicPoolMix);
  syncOneToxicLoop(toxicGeyserProximity(), toxicGeyserNodes, startToxicGeyserSound, stopToxicGeyserSound, updateToxicGeyserMix);
}

let dustStormNodes = null;

function startDustStormSound() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || dustStormNodes) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.connect(sfxGain);

  const sand = createGlowDangerNoise();
  const sandFilt = audioCtx.createBiquadFilter();
  sandFilt.type = 'bandpass';
  sandFilt.frequency.value = 520;
  sandFilt.Q.value = 0.85;
  const sandGain = audioCtx.createGain();
  sandGain.gain.value = 0.16;
  sand.connect(sandFilt);
  sandFilt.connect(sandGain);
  sandGain.connect(out);

  const grit = createGlowDangerNoise();
  const gritFilt = audioCtx.createBiquadFilter();
  gritFilt.type = 'highpass';
  gritFilt.frequency.value = 1800;
  const gritGain = audioCtx.createGain();
  gritGain.gain.value = 0.05;
  grit.connect(gritFilt);
  gritFilt.connect(gritGain);
  gritGain.connect(out);

  const wind = createGlowDangerNoise();
  const windFilt = audioCtx.createBiquadFilter();
  windFilt.type = 'lowpass';
  windFilt.frequency.value = 220;
  const windGain = audioCtx.createGain();
  windGain.gain.value = 0.14;
  wind.connect(windFilt);
  windFilt.connect(windGain);
  windGain.connect(out);

  const spin = audioCtx.createOscillator();
  spin.type = 'sine';
  spin.frequency.value = 7.5;
  const spinDepth = audioCtx.createGain();
  spinDepth.gain.value = 90;
  spin.connect(spinDepth);
  spinDepth.connect(sandFilt.frequency);

  const howl = audioCtx.createOscillator();
  howl.type = 'triangle';
  howl.frequency.value = 78;
  const howlFilt = audioCtx.createBiquadFilter();
  howlFilt.type = 'bandpass';
  howlFilt.frequency.value = 310;
  howlFilt.Q.value = 2.4;
  const howlGain = audioCtx.createGain();
  howlGain.gain.value = 0.045;
  howl.connect(howlFilt);
  howlFilt.connect(howlGain);
  howlGain.connect(out);

  sand.start(now);
  grit.start(now);
  wind.start(now);
  spin.start(now);
  howl.start(now);
  dustStormNodes = {
    out, sandFilt, sandGain, gritFilt, gritGain, windFilt, windGain,
    spin, spinDepth, howl, howlFilt, howlGain,
    sources: [sand, grit, wind, spin, howl]
  };
}

function stopDustStormSound() {
  fadeStopLoopNodes(dustStormNodes);
  dustStormNodes = null;
}

function updateDustStormMix(prox, approach) {
  if (!dustStormNodes || !audioCtx) return;
  const t = audioCtx.currentTime;
  const n = dustStormNodes;
  n.out.gain.setTargetAtTime(0.06 + prox * 0.48, t, 0.08);
  n.sandFilt.frequency.setTargetAtTime(420 + prox * 380 + approach * 70, t, 0.1);
  n.sandGain.gain.setTargetAtTime(0.1 + prox * 0.2, t, 0.1);
  n.gritGain.gain.setTargetAtTime(0.03 + prox * 0.1, t, 0.1);
  n.windFilt.frequency.setTargetAtTime(160 + prox * 140, t, 0.1);
  n.windGain.gain.setTargetAtTime(0.08 + prox * 0.18, t, 0.1);
  n.spin.frequency.setTargetAtTime(5.5 + prox * 10, t, 0.1);
  n.spinDepth.gain.setTargetAtTime(60 + prox * 80, t, 0.1);
  n.howl.frequency.setTargetAtTime(64 + prox * 40 + approach * 18, t, 0.12);
  n.howlGain.gain.setTargetAtTime(0.02 + prox * 0.07, t, 0.1);
}

function dustStormProximity() {
  let best = 0;
  let approach = 0;
  for (const g of gates) {
    if (!g || g.type !== 'zone2storm') continue;
    const prox = shipHazardProximity(g.x, liveStormY(g), 540 + g.r);
    if (prox > best) {
      best = prox;
      approach = g.x > ship.x ? 1 : -0.55;
    }
  }
  return { prox: best, approach };
}

function syncDustStormSound() {
  if (previewLoopId === 'hzStorm') return;
  if (ghostMode || (state !== 'playing' && state !== 'paused')) {
    stopDustStormSound();
    return;
  }
  const { prox, approach } = dustStormProximity();
  if (prox < 0.03) {
    stopDustStormSound();
    return;
  }
  if (!dustStormNodes && prox < 0.07) return;
  startDustStormSound();
  updateDustStormMix(prox, approach);
}

let meteorStreakNodes = null;

function startMeteorStreakSound() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || meteorStreakNodes) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.connect(sfxGain);

  const air = createGlowDangerNoise();
  const airFilt = audioCtx.createBiquadFilter();
  airFilt.type = 'highpass';
  airFilt.frequency.value = 1400;
  const airGain = audioCtx.createGain();
  airGain.gain.value = 0.08;
  air.connect(airFilt);
  airFilt.connect(airGain);
  airGain.connect(out);

  const trail = createGlowDangerNoise();
  const trailFilt = audioCtx.createBiquadFilter();
  trailFilt.type = 'bandpass';
  trailFilt.frequency.value = 980;
  trailFilt.Q.value = 1.35;
  const trailGain = audioCtx.createGain();
  trailGain.gain.value = 0.12;
  trail.connect(trailFilt);
  trailFilt.connect(trailGain);
  trailGain.connect(out);

  const whistle = audioCtx.createOscillator();
  whistle.type = 'sine';
  whistle.frequency.value = 620;
  const wFilt = audioCtx.createBiquadFilter();
  wFilt.type = 'bandpass';
  wFilt.frequency.value = 900;
  wFilt.Q.value = 3.2;
  const wGain = audioCtx.createGain();
  wGain.gain.value = 0.035;
  whistle.connect(wFilt);
  wFilt.connect(wGain);
  wGain.connect(out);

  const shimmer = audioCtx.createOscillator();
  shimmer.type = 'triangle';
  shimmer.frequency.value = 1480;
  const shGain = audioCtx.createGain();
  shGain.gain.value = 0.018;
  const shLfo = audioCtx.createOscillator();
  shLfo.type = 'sine';
  shLfo.frequency.value = 9;
  const shDepth = audioCtx.createGain();
  shDepth.gain.value = 0.012;
  shLfo.connect(shDepth);
  shDepth.connect(shGain.gain);
  shimmer.connect(shGain);
  shGain.connect(out);

  air.start(now);
  trail.start(now);
  whistle.start(now);
  shimmer.start(now);
  shLfo.start(now);
  meteorStreakNodes = {
    out, airFilt, airGain, trailFilt, trailGain, whistle, wFilt, wGain, shimmer, shLfo,
    sources: [air, trail, whistle, shimmer, shLfo]
  };
}

function stopMeteorStreakSound() {
  fadeStopLoopNodes(meteorStreakNodes);
  meteorStreakNodes = null;
}

function updateMeteorStreakMix(prox, approach) {
  if (!meteorStreakNodes || !audioCtx) return;
  const t = audioCtx.currentTime;
  const n = meteorStreakNodes;
  n.out.gain.setTargetAtTime(0.05 + prox * 0.44, t, 0.07);
  n.airFilt.frequency.setTargetAtTime(1100 + prox * 1600 + approach * 200, t, 0.09);
  n.airGain.gain.setTargetAtTime(0.04 + prox * 0.12, t, 0.09);
  n.trailFilt.frequency.setTargetAtTime(760 + prox * 520 + approach * 120, t, 0.09);
  n.trailGain.gain.setTargetAtTime(0.07 + prox * 0.16, t, 0.09);
  n.whistle.frequency.setTargetAtTime(480 + prox * 280 + approach * 90, t, 0.08);
  n.wGain.gain.setTargetAtTime(0.018 + prox * 0.05, t, 0.09);
  n.shimmer.frequency.setTargetAtTime(1200 + prox * 500 + approach * 140, t, 0.1);
  n.shLfo.frequency.setTargetAtTime(7 + prox * 8, t, 0.1);
}

function meteorStreakProximity() {
  let best = 0;
  let approach = 0;
  for (const g of gates) {
    if (!g || g.type !== 'shootingstar') continue;
    const prox = shipHazardProximity(g.x, liveShootingStarY(g), 520 + g.r * 8);
    if (prox > best) {
      best = prox;
      approach = g.x > ship.x ? 1 : -0.5;
    }
  }
  return { prox: best, approach };
}

function syncMeteorStreakSound() {
  if (previewLoopId === 'hzShootingStar') return;
  if (ghostMode || (state !== 'playing' && state !== 'paused')) {
    stopMeteorStreakSound();
    return;
  }
  const { prox, approach } = meteorStreakProximity();
  if (prox < 0.03) {
    stopMeteorStreakSound();
    return;
  }
  if (!meteorStreakNodes && prox < 0.07) return;
  startMeteorStreakSound();
  updateMeteorStreakMix(prox, approach);
}

let windVortexNodes = null;
let stormCloudNodes = null;

function startWindVortexSound() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || windVortexNodes) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.connect(sfxGain);

  const gust = createGlowDangerNoise();
  const gustFilt = audioCtx.createBiquadFilter();
  gustFilt.type = 'bandpass';
  gustFilt.frequency.value = 360;
  gustFilt.Q.value = 0.7;
  const gustGain = audioCtx.createGain();
  gustGain.gain.value = 0.16;
  gust.connect(gustFilt);
  gustFilt.connect(gustGain);
  gustGain.connect(out);

  const howl = audioCtx.createOscillator();
  howl.type = 'sine';
  howl.frequency.value = 92;
  const howlFilt = audioCtx.createBiquadFilter();
  howlFilt.type = 'bandpass';
  howlFilt.frequency.value = 240;
  howlFilt.Q.value = 2.1;
  const howlGain = audioCtx.createGain();
  howlGain.gain.value = 0.05;
  howl.connect(howlFilt);
  howlFilt.connect(howlGain);
  howlGain.connect(out);

  const swirl = audioCtx.createOscillator();
  swirl.type = 'sine';
  swirl.frequency.value = 5.5;
  const swirlDepth = audioCtx.createGain();
  swirlDepth.gain.value = 70;
  swirl.connect(swirlDepth);
  swirlDepth.connect(gustFilt.frequency);

  const heaveHz = (VORTEX_OSCILLATION_FREQ * 60) / (Math.PI * 2);
  const heave = audioCtx.createOscillator();
  heave.type = 'sine';
  heave.frequency.value = Math.max(0.12, heaveHz);
  const heaveDepth = audioCtx.createGain();
  heaveDepth.gain.value = 18;
  heave.connect(heaveDepth);
  heaveDepth.connect(howl.frequency);

  gust.start(now);
  howl.start(now);
  swirl.start(now);
  heave.start(now);
  windVortexNodes = {
    out, gustFilt, gustGain, howl, howlFilt, howlGain, swirl, swirlDepth, heave, heaveDepth,
    sources: [gust, howl, swirl, heave]
  };
}

function stopWindVortexSound() {
  fadeStopLoopNodes(windVortexNodes);
  windVortexNodes = null;
}

function updateWindVortexMix(prox) {
  if (!windVortexNodes || !audioCtx) return;
  const t = audioCtx.currentTime;
  const n = windVortexNodes;
  n.out.gain.setTargetAtTime(0.18 + prox * 0.82, t, 0.06);
  n.gustFilt.frequency.setTargetAtTime(300 + prox * 280, t, 0.1);
  n.gustGain.gain.setTargetAtTime(0.18 + prox * 0.28, t, 0.08);
  n.howl.frequency.setTargetAtTime(84 + prox * 56, t, 0.12);
  n.howlGain.gain.setTargetAtTime(0.06 + prox * 0.1, t, 0.08);
  n.swirl.frequency.setTargetAtTime(4.5 + prox * 7, t, 0.1);
  n.heaveDepth.gain.setTargetAtTime(12 + prox * 22, t, 0.12);
}

function windVortexProximity() {
  let best = 0;
  for (const g of gates) {
    if (!g || g.type !== 'windvortex' || !g.reachR) continue;
    const dist = Math.hypot(g.x - ship.x, g.y - ship.y);
    const reach = g.reachR * 1.12;
    if (dist >= reach) continue;
    // Same disc as the gust: stay loud after the center has scrolled past.
    const prox = Math.pow(1 - dist / reach, 0.65);
    if (prox > best) best = prox;
  }
  return best;
}

function syncWindVortexSound() {
  if (previewLoopId === 'hzVortex') return;
  if (ghostMode || (state !== 'playing' && state !== 'paused')) {
    stopWindVortexSound();
    return;
  }
  const prox = windVortexProximity();
  if (prox < 0.03) {
    stopWindVortexSound();
    return;
  }
  if (!windVortexNodes && prox < 0.07) return;
  startWindVortexSound();
  updateWindVortexMix(prox);
}

function startStormCloudSound() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || stormCloudNodes) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.connect(sfxGain);

  const thunder = createGlowDangerNoise();
  const thFilt = audioCtx.createBiquadFilter();
  thFilt.type = 'lowpass';
  thFilt.frequency.value = 140;
  const thGain = audioCtx.createGain();
  thGain.gain.value = 0.2;
  thunder.connect(thFilt);
  thFilt.connect(thGain);
  thGain.connect(out);

  const rain = createGlowDangerNoise();
  const rainFilt = audioCtx.createBiquadFilter();
  rainFilt.type = 'bandpass';
  rainFilt.frequency.value = 1800;
  rainFilt.Q.value = 0.6;
  const rainGain = audioCtx.createGain();
  rainGain.gain.value = 0.06;
  rain.connect(rainFilt);
  rainFilt.connect(rainGain);
  rainGain.connect(out);

  const crackle = createGlowDangerNoise();
  const crFilt = audioCtx.createBiquadFilter();
  crFilt.type = 'highpass';
  crFilt.frequency.value = 2800;
  const crGain = audioCtx.createGain();
  crGain.gain.value = 0.0001;
  const crLfo = audioCtx.createOscillator();
  crLfo.type = 'square';
  crLfo.frequency.value = 14;
  const crDepth = audioCtx.createGain();
  crDepth.gain.value = 0.0001;
  crLfo.connect(crDepth);
  crDepth.connect(crGain.gain);
  crackle.connect(crFilt);
  crFilt.connect(crGain);
  crGain.connect(out);

  const hum = audioCtx.createOscillator();
  hum.type = 'triangle';
  hum.frequency.value = 118;
  const humGain = audioCtx.createGain();
  humGain.gain.value = 0.02;
  hum.connect(humGain);
  humGain.connect(out);

  thunder.start(now);
  rain.start(now);
  crackle.start(now);
  crLfo.start(now);
  hum.start(now);
  stormCloudNodes = {
    out, thFilt, thGain, rainGain, crFilt, crGain, crLfo, crDepth, hum, humGain,
    sources: [thunder, rain, crackle, crLfo, hum]
  };
}

function stopStormCloudSound() {
  fadeStopLoopNodes(stormCloudNodes);
  stormCloudNodes = null;
}

function updateStormCloudMix(prox, charge) {
  if (!stormCloudNodes || !audioCtx) return;
  const t = audioCtx.currentTime;
  const n = stormCloudNodes;
  n.out.gain.setTargetAtTime(0.05 + prox * 0.42, t, 0.08);
  n.thFilt.frequency.setTargetAtTime(110 + prox * 80 + charge * 40, t, 0.12);
  n.thGain.gain.setTargetAtTime(0.12 + prox * 0.16, t, 0.1);
  n.rainGain.gain.setTargetAtTime(0.03 + prox * 0.08, t, 0.1);
  n.crFilt.frequency.setTargetAtTime(2200 + charge * 1800, t, 0.08);
  n.crGain.gain.setTargetAtTime(0.008 + charge * prox * 0.12, t, 0.06);
  n.crDepth.gain.setTargetAtTime(0.004 + charge * prox * 0.09, t, 0.06);
  n.crLfo.frequency.setTargetAtTime(8 + charge * 18, t, 0.08);
  n.hum.frequency.setTargetAtTime(96 + charge * 70, t, 0.1);
  n.humGain.gain.setTargetAtTime(0.01 + charge * prox * 0.05, t, 0.08);
}

function stormCloudProximity() {
  let best = 0;
  let charge = 0;
  for (const g of gates) {
    if (!g || g.type !== 'cloudarc') continue;
    const dCloud = Math.min(
      Math.hypot(g.x - ship.x, g.y - ship.y),
      Math.hypot(g.x2 - ship.x, g.y2 - ship.y)
    );
    const dArc = pointToSegmentDist(ship.x, ship.y, g.x, g.y, g.x2, g.y2);
    const dist = Math.min(dCloud, dArc);
    const t = 1 - Math.min(1, dist / 500);
    const midX = (g.x + g.x2) / 2;
    const behind = (midX - ship.x) < -40 ? Math.max(0, 1 + (midX - ship.x) / 240) : 1;
    const prox = Math.pow(Math.max(0, t), 1.35) * behind;
    if (prox > best) {
      best = prox;
      if (barrierIsActive(g)) charge = 1;
      else if (barrierFramesToToggle(g) < 25) charge = 0.45;
      else charge = 0.08;
    }
  }
  return { prox: best, charge };
}

function syncStormCloudSound() {
  if (previewLoopId === 'hzCloudArc') return;
  if (ghostMode || (state !== 'playing' && state !== 'paused')) {
    stopStormCloudSound();
    return;
  }
  const { prox, charge } = stormCloudProximity();
  if (prox < 0.03) {
    stopStormCloudSound();
    return;
  }
  if (!stormCloudNodes && prox < 0.07) return;
  startStormCloudSound();
  updateStormCloudMix(prox, charge);
}

function stopStormSkiesHazardSounds() {
  stopWindVortexSound();
  stopStormCloudSound();
}

let movingDoorNodes = null;

function startMovingDoorSound() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || movingDoorNodes) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.connect(sfxGain);

  // thin air leaking around a pressurized hatch seal
  const hiss = createGlowDangerNoise();
  const hissFilt = audioCtx.createBiquadFilter();
  hissFilt.type = 'highpass';
  hissFilt.frequency.value = 2600;
  hissFilt.Q.value = 0.7;
  const hissGain = audioCtx.createGain();
  hissGain.gain.value = 0.07;
  hiss.connect(hissFilt);
  hissFilt.connect(hissGain);
  hissGain.connect(out);

  // cabin air cycling through the frame
  const vent = createGlowDangerNoise();
  const ventFilt = audioCtx.createBiquadFilter();
  ventFilt.type = 'bandpass';
  ventFilt.frequency.value = 1280;
  ventFilt.Q.value = 0.9;
  const ventGain = audioCtx.createGain();
  ventGain.gain.value = 0.08;
  vent.connect(ventFilt);
  ventFilt.connect(ventGain);
  ventGain.connect(out);

  // quiet hull pressure, kept light so it doesn't read as earthbound rumble
  const press = createGlowDangerNoise();
  const pressFilt = audioCtx.createBiquadFilter();
  pressFilt.type = 'lowpass';
  pressFilt.frequency.value = 95;
  const pressGain = audioCtx.createGain();
  pressGain.gain.value = 0.06;
  press.connect(pressFilt);
  pressFilt.connect(pressGain);
  pressGain.connect(out);

  const mag = audioCtx.createOscillator();
  mag.type = 'sine';
  mag.frequency.value = 118;
  const magGain = audioCtx.createGain();
  magGain.gain.value = 0.055;
  mag.connect(magGain);
  magGain.connect(out);

  const magHi = audioCtx.createOscillator();
  magHi.type = 'sine';
  magHi.frequency.value = 236;
  const magHiGain = audioCtx.createGain();
  magHiGain.gain.value = 0.018;
  magHi.connect(magHiGain);
  magHiGain.connect(out);

  const motor = audioCtx.createOscillator();
  motor.type = 'triangle';
  motor.frequency.value = 86;
  const motorFilt = audioCtx.createBiquadFilter();
  motorFilt.type = 'lowpass';
  motorFilt.frequency.value = 420;
  const motorGain = audioCtx.createGain();
  motorGain.gain.value = 0.04;
  motor.connect(motorFilt);
  motorFilt.connect(motorGain);
  motorGain.connect(out);

  const beacon = audioCtx.createOscillator();
  beacon.type = 'sine';
  beacon.frequency.value = 784;
  const beaconFilt = audioCtx.createBiquadFilter();
  beaconFilt.type = 'bandpass';
  beaconFilt.frequency.value = 784;
  beaconFilt.Q.value = 8;
  const beaconGain = audioCtx.createGain();
  beaconGain.gain.value = 0.012;
  beacon.connect(beaconFilt);
  beaconFilt.connect(beaconGain);
  beaconGain.connect(out);

  const magLfo = audioCtx.createOscillator();
  magLfo.type = 'sine';
  magLfo.frequency.value = 0.28;
  const magLfoDepth = audioCtx.createGain();
  magLfoDepth.gain.value = 6;
  magLfo.connect(magLfoDepth);
  magLfoDepth.connect(mag.frequency);

  hiss.start(now);
  vent.start(now);
  press.start(now);
  mag.start(now);
  magHi.start(now);
  motor.start(now);
  beacon.start(now);
  magLfo.start(now);
  movingDoorNodes = {
    out, hissFilt, hissGain, ventFilt, ventGain, pressFilt, pressGain,
    mag, magGain, magHi, magHiGain, motor, motorFilt, motorGain,
    beacon, beaconGain, magLfo, magLfoDepth,
    sources: [hiss, vent, press, mag, magHi, motor, beacon, magLfo]
  };
}

function stopMovingDoorSound() {
  fadeStopLoopNodes(movingDoorNodes);
  movingDoorNodes = null;
}

function updateMovingDoorMix(prox, slide) {
  if (!movingDoorNodes || !audioCtx) return;
  const t = audioCtx.currentTime;
  const n = movingDoorNodes;
  const motion = 0.4 + slide * 0.6;
  n.out.gain.setTargetAtTime(0.08 + prox * 0.38, t, 0.08);
  n.hissFilt.frequency.setTargetAtTime(2200 + prox * 900, t, 0.12);
  n.hissGain.gain.setTargetAtTime(0.04 + prox * 0.08, t, 0.1);
  n.ventFilt.frequency.setTargetAtTime(1080 + prox * 420 + slide * 80, t, 0.1);
  n.ventGain.gain.setTargetAtTime((0.05 + prox * 0.08) * motion, t, 0.08);
  n.pressFilt.frequency.setTargetAtTime(78 + prox * 40, t, 0.14);
  n.pressGain.gain.setTargetAtTime(0.035 + prox * 0.05, t, 0.12);
  n.mag.frequency.setTargetAtTime(108 + prox * 22, t, 0.12);
  n.magGain.gain.setTargetAtTime(0.035 + prox * 0.05, t, 0.1);
  n.magHi.frequency.setTargetAtTime(216 + prox * 44, t, 0.12);
  n.magHiGain.gain.setTargetAtTime(0.01 + prox * 0.02, t, 0.1);
  n.motor.frequency.setTargetAtTime(72 + prox * 18 + slide * 28, t, 0.1);
  n.motorFilt.frequency.setTargetAtTime(340 + prox * 140 + slide * 80, t, 0.1);
  n.motorGain.gain.setTargetAtTime((0.025 + prox * 0.05) * motion, t, 0.08);
  n.beaconGain.gain.setTargetAtTime(0.006 + prox * 0.018, t, 0.12);
}

function movingDoorProximity() {
  let best = 0;
  let slide = 0.5;
  for (const g of gates) {
    if (!g || g.type !== 'movingdoor') continue;
    const dx = g.x - ship.x;
    const reach = 500;
    const adx = Math.abs(dx);
    if (adx >= reach) continue;
    const behind = dx < -36 ? Math.max(0, 1 + (dx + 36) / 200) : 1;
    const prox = Math.pow(1 - adx / reach, 0.6) * behind;
    if (prox > best) {
      best = prox;
      slide = Math.abs(Math.cos((frame - g.spawnFrame) * g.freq + g.phase));
    }
  }
  return { prox: best, slide };
}

function syncMovingDoorSound() {
  if (previewLoopId === 'hzDoorProx') return;
  if (ghostMode || (state !== 'playing' && state !== 'paused')) {
    stopMovingDoorSound();
    return;
  }
  const { prox, slide } = movingDoorProximity();
  if (prox < 0.03) {
    stopMovingDoorSound();
    return;
  }
  if (!movingDoorNodes && prox < 0.06) return;
  startMovingDoorSound();
  updateMovingDoorMix(prox, slide);
}

let blackHoleNodes = null;

function startBlackHoleSound() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain || blackHoleNodes) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.connect(sfxGain);

  // Mid whoom — laptop speakers cannot hear the old 32Hz sub.
  const voidNoise = createGlowDangerNoise();
  const voidFilt = audioCtx.createBiquadFilter();
  voidFilt.type = 'lowpass';
  voidFilt.frequency.value = 280;
  voidFilt.Q.value = 0.7;
  const voidGain = audioCtx.createGain();
  voidGain.gain.value = 0.12;
  voidNoise.connect(voidFilt);
  voidFilt.connect(voidGain);
  voidGain.connect(out);

  const suck = createGlowDangerNoise();
  const suckFilt = audioCtx.createBiquadFilter();
  suckFilt.type = 'bandpass';
  suckFilt.frequency.value = 520;
  suckFilt.Q.value = 1.1;
  const suckGain = audioCtx.createGain();
  suckGain.gain.value = 0.08;
  suck.connect(suckFilt);
  suckFilt.connect(suckGain);
  suckGain.connect(out);

  const woom = audioCtx.createOscillator();
  woom.type = 'sine';
  woom.frequency.value = 78;
  const woomGain = audioCtx.createGain();
  woomGain.gain.value = 0.1;
  woom.connect(woomGain);
  woomGain.connect(out);

  const drone = audioCtx.createOscillator();
  drone.type = 'triangle';
  drone.frequency.value = 118;
  const droneFilt = audioCtx.createBiquadFilter();
  droneFilt.type = 'lowpass';
  droneFilt.frequency.value = 480;
  const droneGain = audioCtx.createGain();
  droneGain.gain.value = 0.055;
  drone.connect(droneFilt);
  droneFilt.connect(droneGain);
  droneGain.connect(out);

  const ring = audioCtx.createOscillator();
  ring.type = 'sine';
  ring.frequency.value = 311;
  const ringFilt = audioCtx.createBiquadFilter();
  ringFilt.type = 'bandpass';
  ringFilt.frequency.value = 311;
  ringFilt.Q.value = 4.5;
  const ringGain = audioCtx.createGain();
  ringGain.gain.value = 0.018;
  ring.connect(ringFilt);
  ringFilt.connect(ringGain);
  ringGain.connect(out);

  const swirl = audioCtx.createOscillator();
  swirl.type = 'sine';
  swirl.frequency.value = 0.28;
  const swirlDepth = audioCtx.createGain();
  swirlDepth.gain.value = 90;
  swirl.connect(swirlDepth);
  swirlDepth.connect(suckFilt.frequency);

  const tug = audioCtx.createOscillator();
  tug.type = 'sine';
  tug.frequency.value = 0.4;
  const tugDepth = audioCtx.createGain();
  tugDepth.gain.value = 10;
  tug.connect(tugDepth);
  tugDepth.connect(drone.frequency);

  voidNoise.start(now);
  suck.start(now);
  woom.start(now);
  drone.start(now);
  ring.start(now);
  swirl.start(now);
  tug.start(now);
  blackHoleNodes = {
    out, voidFilt, voidGain, suckFilt, suckGain, woom, woomGain,
    drone, droneFilt, droneGain, ring, ringFilt, ringGain,
    swirl, swirlDepth, tug, tugDepth,
    sources: [voidNoise, suck, woom, drone, ring, swirl, tug]
  };
}

function stopBlackHoleSound() {
  fadeStopLoopNodes(blackHoleNodes);
  blackHoleNodes = null;
}

function updateBlackHoleMix(prox, pull) {
  if (!blackHoleNodes || !audioCtx) return;
  const t = audioCtx.currentTime;
  const n = blackHoleNodes;
  const depth = Math.max(prox, pull * 0.9);
  n.out.gain.setTargetAtTime(0.08 + depth * 0.28, t, 0.08);
  n.voidFilt.frequency.setTargetAtTime(200 + depth * 140, t, 0.1);
  n.voidGain.gain.setTargetAtTime(0.1 + depth * 0.12, t, 0.1);
  n.suckFilt.frequency.setTargetAtTime(620 - pull * 220, t, 0.08);
  n.suckGain.gain.setTargetAtTime(0.05 + pull * 0.1, t, 0.1);
  n.woom.frequency.setTargetAtTime(92 - pull * 22, t, 0.1);
  n.woomGain.gain.setTargetAtTime(0.07 + depth * 0.08, t, 0.1);
  n.drone.frequency.setTargetAtTime(132 - pull * 36, t, 0.1);
  n.droneFilt.frequency.setTargetAtTime(420 - pull * 80, t, 0.1);
  n.droneGain.gain.setTargetAtTime(0.04 + depth * 0.055, t, 0.1);
  n.ring.frequency.setTargetAtTime(330 - pull * 70, t, 0.12);
  n.ringFilt.frequency.setTargetAtTime(330 - pull * 70, t, 0.12);
  n.ringGain.gain.setTargetAtTime(0.012 + prox * 0.02, t, 0.12);
  n.swirl.frequency.setTargetAtTime(0.2 + pull * 0.5, t, 0.14);
  n.swirlDepth.gain.setTargetAtTime(60 + depth * 80, t, 0.14);
  n.tug.frequency.setTargetAtTime(0.28 + pull * 0.45, t, 0.14);
  n.tugDepth.gain.setTargetAtTime(6 + pull * 12, t, 0.12);
}

function blackHoleProximity() {
  let best = 0;
  let pull = 0;
  for (const g of gates) {
    if (!g || g.type !== 'blackhole') continue;
    const dist = Math.hypot(g.x - ship.x, g.y - ship.y);
    const core = g.coreR || 80;
    const well = g.reachR || core * 1.5;
    // Hear the hole itself, not only the thin gravity shell around huge cores.
    const hearR = Math.max(well, core + 260) * 1.5;
    if (dist >= hearR) continue;
    const prox = Math.pow(1 - dist / hearR, 0.4);
    if (prox > best) {
      best = prox;
      pull = dist < well ? 1 - dist / well : Math.max(0, 1 - (dist - well) / Math.max(40, hearR - well));
    }
  }
  return { prox: best, pull };
}

function syncBlackHoleSound() {
  if (previewLoopId === 'hzBlackHole') return;
  if (ghostMode || (state !== 'playing' && state !== 'paused')) {
    stopBlackHoleSound();
    return;
  }
  const { prox, pull } = blackHoleProximity();
  if (prox < 0.02) {
    stopBlackHoleSound();
    return;
  }
  if (!blackHoleNodes && prox < 0.035) return;
  startBlackHoleSound();
  updateBlackHoleMix(prox, pull);
}

function playPendulumSwoosh() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.22, filterFreq: 280, filterEnd: 1600, filterType: 'bandpass', filterQ: 0.7, volume: 0.26, delaySend: 0.1, when: t0 });
  playNoiseBurst({ duration: 0.16, filterFreq: 900, filterEnd: 220, filterType: 'lowpass', filterQ: 0.6, volume: 0.16, when: t0 + 0.04 });
  playSynth({ type: 'sine', freq: 140, freqEnd: 70, duration: 0.2, attack: 0.02, decay: 0.06, sustain: 0.4, release: 0.08, volume: 0.12, filterFreq: 400, delaySend: 0, when: t0 });
  playSynth({ type: 'triangle', freq: 420, freqEnd: 180, duration: 0.14, attack: 0.01, decay: 0.04, sustain: 0.3, release: 0.06, volume: 0.07, filterFreq: 1400, delaySend: 0.12, when: t0 + 0.02 });
}

function playBoltZapImpact() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playElectricCrackles({ count: 8, spacing: 0.01, volume: 0.32, when: t0 });
  playNoiseBurst({ duration: 0.12, filterFreq: 2400, filterEnd: 500, filterType: 'bandpass', filterQ: 1.4, volume: 0.28, when: t0 });
  playNoiseBurst({ duration: 0.08, filterFreq: 5200, filterType: 'highpass', volume: 0.2, when: t0 });
  playSynth({ type: 'sawtooth', freq: 2400, freqEnd: 80, duration: 0.12, attack: 0.001, decay: 0.03, sustain: 0.2, release: 0.05, volume: 0.16, filterType: 'highpass', filterFreq: 600, delaySend: 0.1, when: t0 });
  playSynth({ type: 'sine', freq: 110, freqEnd: 42, duration: 0.14, attack: 0.001, decay: 0.04, sustain: 0.28, release: 0.06, volume: 0.22, filterFreq: 280, delaySend: 0, when: t0 });
}

function playEmpDischarge() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const hi = 698;
  const lo = 349;
  for (let i = 0; i < 16; i++) {
    const drop = 1 - i * 0.022;
    playSynth({
      type: 'square',
      freq: (i % 2 ? hi : lo) * drop,
      duration: 0.02,
      attack: 0.001,
      decay: 0.004,
      sustain: 0.75,
      release: 0.008,
      volume: 0.16 * (1 - i * 0.035),
      filterType: 'lowpass',
      filterFreq: 2600,
      delaySend: 0.04,
      when: t0 + i * 0.017,
    });
  }
  playNoiseBurst({ duration: 0.22, filterFreq: 2400, filterType: 'bandpass', filterQ: 1.4, volume: 0.07, when: t0 });
}

function playDroneBuzz() {
  playSynth({ type: 'sawtooth', freq: 168, freqEnd: 132, duration: 0.16, attack: 0.01, decay: 0.05, sustain: 0.5, release: 0.06, volume: 0.16, filterType: 'lowpass', filterFreq: 900, delaySend: 0.08 });
  playNoiseBurst({ duration: 0.12, filterFreq: 700, filterType: 'bandpass', filterQ: 1.2, volume: 0.14 });
}

function playAlienDroneSpawn() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.22, filterFreq: 1600, filterEnd: 4200, filterType: 'bandpass', filterQ: 1.8, volume: 0.16, delaySend: 0.1, when: t0 });
  playSynth({
    type: 'sawtooth', freq: 620, freqEnd: 380, duration: 0.2,
    attack: 0.012, decay: 0.05, sustain: 0.45, release: 0.08,
    volume: 0.1, filterType: 'bandpass', filterFreq: 1400, filterQ: 2.2, delaySend: 0.12, when: t0,
  });
  playSynth({
    type: 'sawtooth', freq: 655, freqEnd: 400, duration: 0.2,
    attack: 0.014, decay: 0.05, sustain: 0.4, release: 0.08,
    volume: 0.07, filterType: 'bandpass', filterFreq: 1600, filterQ: 2.4, delaySend: 0.12, when: t0,
  });
  playSynth({
    type: 'sine', freq: 2400, freqEnd: 1100, duration: 0.12,
    attack: 0.004, decay: 0.03, sustain: 0.3, release: 0.05,
    volume: 0.1, filterFreq: 4500, delaySend: 0.16, when: t0,
  });
}

function playGravityWoom() {
  playSynth({ type: 'sine', freq: 70, freqEnd: 28, duration: 0.28, attack: 0.02, decay: 0.08, sustain: 0.55, release: 0.1, volume: 0.32, filterFreq: 160, delaySend: 0.1 });
  playNoiseBurst({ duration: 0.18, filterFreq: 160, filterType: 'lowpass', volume: 0.2 });
}

function playBossSlam() {
  playNoiseBurst({ duration: 0.22, filterFreq: 240, filterEnd: 90, filterType: 'lowpass', filterQ: 0.5, volume: 0.5 });
  playSynth({ type: 'sine', freq: 52, freqEnd: 28, duration: 0.22, attack: 0.004, decay: 0.06, sustain: 0.4, release: 0.1, volume: 0.34, filterFreq: 140, delaySend: 0 });
}

function playMeteorRingImpact() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.1, filterFreq: 5200, filterType: 'highpass', volume: 0.48, when: t0 });
  playNoiseBurst({ duration: 0.28, filterFreq: 900, filterEnd: 140, filterType: 'lowpass', filterQ: 0.4, volume: 0.62, when: t0 });
  playNoiseBurst({ duration: 0.18, filterFreq: 1600, filterEnd: 280, filterType: 'bandpass', filterQ: 0.7, volume: 0.38, when: t0 });
  playSynth({ type: 'sine', freq: 58, freqEnd: 18, duration: 0.85, attack: 0.002, decay: 0.12, sustain: 0.5, release: 0.28, volume: 0.52, filterFreq: 140, delaySend: 0, when: t0 });
  playSynth({ type: 'sine', freq: 36, freqEnd: 16, duration: 1.05, attack: 0.004, decay: 0.16, sustain: 0.45, release: 0.32, volume: 0.36, filterFreq: 90, delaySend: 0, when: t0 });
  playSynth({ type: 'sawtooth', freq: 78, freqEnd: 26, duration: 0.42, attack: 0.002, decay: 0.08, sustain: 0.3, release: 0.14, volume: 0.14, filterType: 'lowpass', filterFreq: 420, filterEnd: 90, delaySend: 0, when: t0 });
  playEntranceRumble({ when: t0, duration: 1.85, volStart: 0.55, volEnd: 0.08, filtStart: 380, filtEnd: 70 });
  playNoiseBurst({ duration: 0.55, filterFreq: 280, filterEnd: 1600, filterType: 'lowpass', volume: 0.32, delaySend: 0.12, when: t0 + 0.05 });
  playNoiseBurst({ duration: 0.7, filterFreq: 1400, filterEnd: 220, filterType: 'highpass', volume: 0.18, delaySend: 0.1, when: t0 + 0.16 });
  playSynth({ type: 'sine', freq: 42, freqEnd: 20, duration: 0.7, attack: 0.02, decay: 0.18, sustain: 0.4, release: 0.22, volume: 0.22, filterFreq: 110, delaySend: 0, when: t0 + 0.22 });
}

function playHotEmberRoar() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.4, filterFreq: 480, filterEnd: 1600, filterType: 'bandpass', filterQ: 0.65, volume: 0.46, delaySend: 0.1, when: t0 });
  playNoiseBurst({ duration: 0.36, filterFreq: 4200, filterEnd: 1600, filterType: 'highpass', filterQ: 0.7, volume: 0.3, delaySend: 0.12, when: t0 });
  playNoiseBurst({ duration: 0.22, filterFreq: 2200, filterEnd: 650, filterType: 'bandpass', filterQ: 1.5, volume: 0.26, when: t0 + 0.03 });
  playNoiseBurst({ duration: 0.05, filterFreq: 3400, filterType: 'bandpass', filterQ: 3.4, volume: 0.3, when: t0 + 0.02 });
  playNoiseBurst({ duration: 0.04, filterFreq: 2700, filterType: 'bandpass', filterQ: 3.0, volume: 0.24, when: t0 + 0.08 });
  playNoiseBurst({ duration: 0.05, filterFreq: 3900, filterType: 'bandpass', filterQ: 3.6, volume: 0.22, when: t0 + 0.14 });
  playNoiseBurst({ duration: 0.04, filterFreq: 2100, filterType: 'bandpass', filterQ: 2.6, volume: 0.2, when: t0 + 0.21 });
  playSynth({
    type: 'sawtooth', freq: 86, freqEnd: 44, duration: 0.3,
    attack: 0.014, decay: 0.08, sustain: 0.4, release: 0.1,
    volume: 0.13, filterType: 'lowpass', filterFreq: 560, filterEnd: 160, delaySend: 0, when: t0,
  });
}

function playHotEmberImpact() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.16, filterFreq: 2600, filterEnd: 700, filterType: 'bandpass', filterQ: 1.3, volume: 0.38, when: t0 });
  playNoiseBurst({ duration: 0.12, filterFreq: 4800, filterType: 'highpass', volume: 0.24, when: t0 });
  playNoiseBurst({ duration: 0.14, filterFreq: 900, filterEnd: 220, filterType: 'lowpass', volume: 0.2, when: t0 });
}

function playKeyPickup() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const notes = [784, 1047, 1319, 1568, 2093];
  notes.forEach((freq, i) => {
    const when = t0 + i * 0.052;
    playSynth({
      type: 'sine', freq, duration: 0.16,
      attack: 0.004, decay: 0.04, sustain: 0.5, release: 0.09,
      volume: 0.24 - i * 0.02, filterFreq: 4400, delaySend: 0.32, when,
    });
    playSynth({
      type: 'triangle', freq: freq * 2, duration: 0.1,
      attack: 0.002, decay: 0.03, sustain: 0.28, release: 0.05,
      volume: 0.07, filterFreq: 5200, delaySend: 0.24, when,
    });
  });
  playSynth({
    type: 'sine', freq: 2637, freqEnd: 3136, duration: 0.32,
    attack: 0.012, decay: 0.08, sustain: 0.4, release: 0.14,
    volume: 0.11, filterFreq: 5600, delaySend: 0.45, when: t0 + 0.24,
  });
  playNoiseBurst({
    duration: 0.1, filterFreq: 4800, filterType: 'highpass', volume: 0.07,
    delaySend: 0.2, when: t0 + 0.015,
  });
}

function sfxHazardFire(type) {
  if (type === 'fireball') {
    playBowserFireball();
    return;
  }
  if (type === 'boomerang') {
    playBoomerangPass();
    return;
  }
  if (type === 'flameWallTelegraph') {
    sfxFireBossFlameWallTelegraph();
    return;
  }
  if (type === 'flameWallActive') {
    startMoltenFlameWallSound();
    return;
  }
  if (type === 'barrageTelegraph') {
    sfxFireBossBarrageTelegraph();
    return;
  }
  if (type === 'coreFlame') {
    sfxFireBossEmberLaunch();
    return;
  }
  if (type === 'coreCrossfireTelegraph') {
    sfxCoreCrossfireTelegraph();
    return;
  }
  if (type === 'coreCrossfireActive') {
    sfxCoreCrossfireVolley();
    return;
  }
  if (type === 'coreCrossfireGap') {
    return;
  }
  if (type === 'coreBulkheadTelegraph') {
    sfxCoreBulkheadTelegraph();
    return;
  }
  if (type === 'coreBulkheadActive') {
    startCoreBulkheadHoldSound();
    return;
  }
  if (type === 'coreEmpTelegraph') {
    sfxCoreEmpTelegraph();
    return;
  }
  if (type === 'coreEmpPulse') {
    sfxCoreEmpPulse();
    return;
  }
  if (type === 'coreTesla') {
    sfxCoreTeslaBurst();
    return;
  }
  if (!sfxHazardRateOk('fire:' + type, 70)) return;
  if (type === 'bossvolleytelegraph') {
    playTrackingLockOn();
    return;
  }
  if (type === 'bossvolley') {
    playBulletVolley();
    return;
  }
  if (type === 'bossdrone') {
    return;
  }
  if (type === 'accesskey') {
    playKeyPickup();
    return;
  }
  if (type === 'bosschargebeamtelegraph') {
    playChargeTelegraph(lastBossChargeBeamSfx);
    return;
  }
  if (type === 'bosschargebeam') {
    playChargeBeamFire(lastBossChargeBeamSfx);
    return;
  }
  if (type === 'bossdiagonalring' || type === 'bossragepulse') {
    playMeteorRingImpact();
    return;
  }
  const family = hazardFamily(type);
  if (family === 'laser') {
    if (isHazardTelegraph(type) && isChargeBeamType(type)) playChargeWhine();
    else if (isHazardTelegraph(type)) playLockOn();
    else if (isChargeBeamType(type)) playBeamFire();
    else playEnergyShot();
  } else if (family === 'fire') {
    if (isHazardTelegraph(type)) {
      playNoiseBurst({ duration: 0.16, filterFreq: 280, filterEnd: 900, filterType: 'lowpass', volume: 0.2 });
      playSynth({ type: 'sine', freq: 90, freqEnd: 140, duration: 0.16, attack: 0.02, decay: 0.05, sustain: 0.4, release: 0.05, volume: 0.12, filterFreq: 400, delaySend: 0 });
    } else {
      playNoiseBurst({ duration: 0.22, filterFreq: 380, filterEnd: 1100, filterType: 'bandpass', filterQ: 0.55, volume: 0.34 });
      playNoiseBurst({ duration: 0.08, filterFreq: 2200, filterType: 'bandpass', filterQ: 1.4, volume: 0.16, when: audioCtx.currentTime + 0.05 });
      playSynth({ type: 'sine', freq: 68, freqEnd: 46, duration: 0.2, attack: 0.02, decay: 0.08, sustain: 0.4, release: 0.08, volume: 0.16, filterFreq: 180, delaySend: 0 });
    }
  } else if (family === 'electric') {
    playElectricCrackles({ count: 6, spacing: 0.012, volume: 0.26 });
    playSynth({ type: 'sawtooth', freq: 2100, freqEnd: 220, duration: 0.07, attack: 0.001, decay: 0.02, sustain: 0.25, release: 0.04, volume: 0.14, filterType: 'highpass', filterFreq: 900, filterQ: 0.7, delaySend: 0.08 });
  } else if (family === 'plasma') {
    playPlasmaShot();
  } else if (family === 'whoosh') {
    playNoiseBurst({ duration: 0.18, filterFreq: 420, filterEnd: 2400, filterType: 'lowpass', filterQ: 0.6, volume: 0.28 });
  } else if (family === 'nova') {
    playSynth({ type: 'sine', freq: 90, freqEnd: 280, duration: 0.16, attack: 0.02, decay: 0.05, sustain: 0.5, release: 0.04, volume: 0.2, filterFreq: 800, delaySend: 0.12 });
    playNoiseBurst({ duration: 0.28, filterFreq: 700, filterEnd: 180, filterType: 'lowpass', volume: 0.42, when: audioCtx.currentTime + 0.12 });
    playSynth({ type: 'sine', freq: 140, freqEnd: 40, duration: 0.22, attack: 0.004, decay: 0.06, sustain: 0.35, release: 0.08, volume: 0.24, filterFreq: 300, delaySend: 0, when: audioCtx.currentTime + 0.12 });
  } else if (family === 'drone') {
    playDroneBuzz();
  } else if (family === 'metal') {
    playMetalClank();
  } else if (family === 'bossHeavy') {
    playBossSlam();
  } else if (family === 'gravity') {
    playGravityWoom();
  } else if (family === 'echo') {
    playSynth({ type: 'sine', freq: 640, freqEnd: 480, duration: 0.08, attack: 0.002, decay: 0.02, sustain: 0.3, release: 0.1, volume: 0.22, filterFreq: 2200, delaySend: 0.55 });
  } else if (family === 'rock') {
    playRockThud();
  } else if (family === 'drip') {
    playSynth({ type: 'sine', freq: 1480, freqEnd: 420, duration: 0.07, attack: 0.001, decay: 0.02, sustain: 0.2, release: 0.05, volume: 0.28, filterFreq: 2800, delaySend: 0.12 });
    playNoiseBurst({ duration: 0.05, filterFreq: 2600, filterType: 'bandpass', filterQ: 4.5, volume: 0.14, delaySend: 0.1 });
  } else if (family === 'key') {
    playKeyPickup();
  }
}

function sfxHazardImpact(type) {
  if (type === 'charging' || type === 'chargingClose') {
    sfxFireBossBodyHit();
    return;
  }
  if (type === 'coreFlame') {
    sfxFireBossEmberHit();
    return;
  }
  if (type === 'barrageActive') {
    sfxFireBossSqueezeHit();
    return;
  }
  if (type === 'coreBulkheadActive') {
    playBulkheadHit();
    return;
  }
  if (type === 'bossdrone') {
    playHotEmberImpact();
    return;
  }
  if (type === 'gate') {
    playGateNeonSlam();
    return;
  }
  if (type === 'hbar') {
    playHBarClank();
    return;
  }
  if (type === 'asteroid') {
    playAsteroidCrunch();
    return;
  }
  if (type === 'pendulum') {
    playPendulumThunk();
    return;
  }
  if (type === 'lbolt') {
    playBoltZapImpact();
    return;
  }
  if (type === 'emp') {
    if (sfxHazardRateOk('empdischarge', 140)) playEmpDischarge();
    return;
  }
  if (type === 'movingdoor' || type === 'specialdoor') {
    playStationAirlockHit();
    return;
  }
  const family = hazardFamily(type);
  if (family === 'laser') {
    playNoiseBurst({ duration: 0.08, filterFreq: 3600, filterType: 'highpass', volume: 0.26 });
    playSynth({ type: 'sawtooth', freq: 980, freqEnd: 120, duration: 0.1, attack: 0.001, decay: 0.03, sustain: 0.2, release: 0.05, volume: 0.14, filterType: 'lowpass', filterFreq: 2400, delaySend: 0.1 });
    playSynth({ type: 'sine', freq: 160, freqEnd: 55, duration: 0.1, attack: 0.001, decay: 0.03, sustain: 0.25, release: 0.05, volume: 0.2, filterFreq: 500, delaySend: 0 });
  } else if (family === 'fire') {
    playNoiseBurst({ duration: 0.28, filterFreq: 700, filterEnd: 160, filterType: 'lowpass', filterQ: 0.5, volume: 0.42 });
    playNoiseBurst({ duration: 0.12, filterFreq: 1800, filterEnd: 600, filterType: 'bandpass', filterQ: 1.1, volume: 0.2, when: audioCtx.currentTime + 0.04 });
    playSynth({ type: 'sine', freq: 90, freqEnd: 38, duration: 0.22, attack: 0.008, decay: 0.06, sustain: 0.35, release: 0.1, volume: 0.22, filterFreq: 220, delaySend: 0 });
  } else if (family === 'rock') {
    playRockThud();
  } else if (family === 'electric') {
    playElectricCrackles({ count: 7, spacing: 0.011, volume: 0.3 });
    playSynth({ type: 'sawtooth', freq: 2800, freqEnd: 90, duration: 0.11, attack: 0.001, decay: 0.03, sustain: 0.2, release: 0.05, volume: 0.16, filterType: 'highpass', filterFreq: 700, delaySend: 0.1 });
    playNoiseBurst({ duration: 0.08, filterFreq: 5000, filterType: 'highpass', filterQ: 1.2, volume: 0.22 });
  } else if (family === 'drip') {
    playSynth({ type: 'sine', freq: 980, freqEnd: 160, duration: 0.1, attack: 0.001, decay: 0.03, sustain: 0.18, release: 0.07, volume: 0.3, filterFreq: 2200, delaySend: 0.18 });
    playNoiseBurst({ duration: 0.14, filterFreq: 2400, filterEnd: 900, filterType: 'bandpass', filterQ: 5.5, volume: 0.22, delaySend: 0.16 });
    playSynth({ type: 'sine', freq: 1320, freqEnd: 380, duration: 0.06, attack: 0.001, decay: 0.02, sustain: 0.15, release: 0.04, volume: 0.16, filterFreq: 3000, delaySend: 0.2, when: audioCtx.currentTime + 0.07 });
  } else if (family === 'gravity') {
    playGravityWoom();
  } else if (family === 'whoosh') {
    playNoiseBurst({ duration: 0.18, filterFreq: 1600, filterEnd: 220, filterType: 'lowpass', filterQ: 0.6, volume: 0.34 });
  } else if (family === 'metal') {
    playMetalClank();
  } else if (family === 'echo') {
    playSynth({ type: 'sine', freq: 720, freqEnd: 360, duration: 0.1, attack: 0.002, decay: 0.03, sustain: 0.25, release: 0.12, volume: 0.22, filterFreq: 2000, delaySend: 0.6 });
  } else if (family === 'nova') {
    playNoiseBurst({ duration: 0.3, filterFreq: 650, filterEnd: 140, filterType: 'lowpass', volume: 0.46 });
    playSynth({ type: 'sine', freq: 110, freqEnd: 36, duration: 0.24, attack: 0.004, decay: 0.07, sustain: 0.35, release: 0.1, volume: 0.28, filterFreq: 280, delaySend: 0 });
  } else if (family === 'plasma') {
    playPlasmaShot();
    playSynth({ type: 'sine', freq: 90, freqEnd: 40, duration: 0.12, attack: 0.002, decay: 0.04, sustain: 0.3, release: 0.06, volume: 0.16, filterFreq: 300, delaySend: 0 });
  } else if (family === 'drone') {
    playDroneBuzz();
    playNoiseBurst({ duration: 0.1, filterFreq: 500, filterType: 'lowpass', volume: 0.22 });
  } else if (family === 'bossHeavy') {
    playBossSlam();
  } else if (family === 'key') {
    playKeyPickup();
  } else {
    playNoiseBurst({ duration: 0.1, filterFreq: 900, filterType: 'lowpass', volume: 0.3 });
    playSynth({ type: 'sine', freq: 140, freqEnd: 55, duration: 0.12, attack: 0.002, decay: 0.03, sustain: 0.3, release: 0.05, volume: 0.22, filterFreq: 400, delaySend: 0 });
  }
}

function sfxFireBossDeath() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.85, filterFreq: 520, filterEnd: 140, filterType: 'lowpass', volume: 0.32, delaySend: 0.08, when: t0 });
  playNoiseBurst({ duration: 0.7, filterFreq: 980, filterEnd: 260, filterType: 'bandpass', filterQ: 0.7, volume: 0.2, delaySend: 0.1, when: t0 });
  playSynth({
    type: 'sine', freq: 118, freqEnd: 36, duration: 0.82,
    attack: 0.04, decay: 0.22, sustain: 0.4, release: 0.22,
    volume: 0.2, filterFreq: 280, filterEnd: 90, delaySend: 0, when: t0,
  });
  playSynth({
    type: 'triangle', freq: 210, freqEnd: 55, duration: 0.7,
    attack: 0.05, decay: 0.2, sustain: 0.32, release: 0.2,
    volume: 0.08, filterFreq: 700, filterEnd: 180, delaySend: 0.06, when: t0,
  });
  [0.08, 0.2, 0.34, 0.5, 0.64].forEach((off, i) => {
    playNoiseBurst({
      duration: 0.05 + (4 - i) * 0.012,
      filterFreq: 1600 - i * 220,
      filterType: 'bandpass',
      filterQ: 2.2,
      volume: 0.14 - i * 0.02,
      when: t0 + off,
    });
  });
}

function sfxFireBossAsh() {
  startMoltenDeathAshSound();
}

function sfxFireBossDisperse() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.28, filterFreq: 280, filterEnd: 80, filterType: 'lowpass', volume: 0.3, when: t0 });
  playSynth({
    type: 'sine', freq: 62, freqEnd: 28, duration: 0.36,
    attack: 0.008, decay: 0.1, sustain: 0.35, release: 0.16,
    volume: 0.16, filterFreq: 160, delaySend: 0, when: t0,
  });
  playNoiseBurst({ duration: 1.05, filterFreq: 1400, filterEnd: 420, filterType: 'bandpass', filterQ: 0.55, volume: 0.2, delaySend: 0.16, when: t0 + 0.04 });
  playNoiseBurst({ duration: 0.95, filterFreq: 2400, filterEnd: 700, filterType: 'highpass', volume: 0.12, delaySend: 0.18, when: t0 + 0.08 });
  playNoiseBurst({ duration: 0.7, filterFreq: 900, filterEnd: 180, filterType: 'lowpass', volume: 0.14, delaySend: 0.1, when: t0 + 0.18 });
  [0.1, 0.22, 0.36, 0.5, 0.66, 0.82].forEach((off, i) => {
    playNoiseBurst({
      duration: 0.08 + (i % 2) * 0.03,
      filterFreq: 1800 - i * 160,
      filterType: 'bandpass',
      filterQ: 1.4,
      volume: 0.1 - i * 0.01,
      delaySend: 0.12,
      when: t0 + off,
    });
  });
}

function sfxFireBossChargeDash({ close = false } = {}) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  const dur = close ? 0.62 : 1.22;
  const peak = close ? 0.2 : 0.46;
  const peakT = t0 + peak;
  const endT = t0 + dur;
  const sources = [];

  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.linearRampToValueAtTime(close ? 0.5 : 0.38, t0 + peak * 0.5);
  out.gain.linearRampToValueAtTime(close ? 1 : 0.92, peakT);
  out.gain.linearRampToValueAtTime(0.4, peakT + (close ? 0.08 : 0.18));
  out.gain.linearRampToValueAtTime(0.0001, endT);

  if (typeof audioCtx.createStereoPanner === 'function') {
    const pan = audioCtx.createStereoPanner();
    pan.pan.setValueAtTime(0.86, t0);
    pan.pan.linearRampToValueAtTime(0.04, peakT);
    pan.pan.linearRampToValueAtTime(-0.84, endT);
    out.connect(pan);
    pan.connect(sfxGain);
  } else {
    out.connect(sfxGain);
  }

  const air = createGlowDangerNoise();
  const airFilt = audioCtx.createBiquadFilter();
  airFilt.type = 'lowpass';
  airFilt.Q.value = 0.5;
  airFilt.frequency.setValueAtTime(200, t0);
  airFilt.frequency.exponentialRampToValueAtTime(1200, peakT);
  airFilt.frequency.exponentialRampToValueAtTime(160, endT);
  const airGain = audioCtx.createGain();
  airGain.gain.value = 0.72;
  air.connect(airFilt);
  airFilt.connect(airGain);
  airGain.connect(out);
  sources.push(air);

  const rush = createGlowDangerNoise();
  const rushFilt = audioCtx.createBiquadFilter();
  rushFilt.type = 'bandpass';
  rushFilt.Q.value = 0.75;
  rushFilt.frequency.setValueAtTime(340, t0);
  rushFilt.frequency.exponentialRampToValueAtTime(1700, peakT);
  rushFilt.frequency.exponentialRampToValueAtTime(380, endT);
  const rushGain = audioCtx.createGain();
  rushGain.gain.setValueAtTime(0.1, t0);
  rushGain.gain.linearRampToValueAtTime(0.58, peakT);
  rushGain.gain.linearRampToValueAtTime(0.06, endT);
  rush.connect(rushFilt);
  rushFilt.connect(rushGain);
  rushGain.connect(out);
  sources.push(rush);

  const heat = createGlowDangerNoise();
  const heatFilt = audioCtx.createBiquadFilter();
  heatFilt.type = 'highpass';
  heatFilt.Q.value = 0.7;
  heatFilt.frequency.setValueAtTime(1600, t0);
  heatFilt.frequency.exponentialRampToValueAtTime(4600, peakT);
  heatFilt.frequency.exponentialRampToValueAtTime(1100, endT);
  const heatGain = audioCtx.createGain();
  heatGain.gain.setValueAtTime(0.03, t0);
  heatGain.gain.linearRampToValueAtTime(0.2, peakT);
  heatGain.gain.linearRampToValueAtTime(0.32, peakT + (close ? 0.08 : 0.16));
  heatGain.gain.linearRampToValueAtTime(0.0001, endT);
  heat.connect(heatFilt);
  heatFilt.connect(heatGain);
  heatGain.connect(out);
  if (delayInput) {
    const send = audioCtx.createGain();
    send.gain.value = 0.14;
    heatGain.connect(send);
    send.connect(delayInput);
  }
  sources.push(heat);

  const body = audioCtx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(close ? 64 : 52, t0);
  body.frequency.exponentialRampToValueAtTime(close ? 96 : 84, peakT);
  body.frequency.exponentialRampToValueAtTime(close ? 46 : 40, peakT + (close ? 0.14 : 0.24));
  const bodyFilt = audioCtx.createBiquadFilter();
  bodyFilt.type = 'lowpass';
  bodyFilt.frequency.setValueAtTime(240, t0);
  bodyFilt.frequency.exponentialRampToValueAtTime(560, peakT);
  bodyFilt.frequency.exponentialRampToValueAtTime(160, peakT + 0.22);
  const bodyGain = audioCtx.createGain();
  bodyGain.gain.setValueAtTime(0.05, t0);
  bodyGain.gain.linearRampToValueAtTime(0.18, peakT);
  bodyGain.gain.linearRampToValueAtTime(0.0001, peakT + (close ? 0.14 : 0.24));
  body.connect(bodyFilt);
  bodyFilt.connect(bodyGain);
  bodyGain.connect(out);
  sources.push(body);

  const grit = audioCtx.createOscillator();
  grit.type = 'sawtooth';
  grit.frequency.setValueAtTime(close ? 82 : 62, t0);
  grit.frequency.exponentialRampToValueAtTime(close ? 150 : 118, peakT);
  grit.frequency.exponentialRampToValueAtTime(close ? 48 : 42, peakT + (close ? 0.12 : 0.2));
  const gritFilt = audioCtx.createBiquadFilter();
  gritFilt.type = 'lowpass';
  gritFilt.frequency.setValueAtTime(300, t0);
  gritFilt.frequency.exponentialRampToValueAtTime(980, peakT);
  gritFilt.frequency.exponentialRampToValueAtTime(180, peakT + 0.2);
  const gritGain = audioCtx.createGain();
  gritGain.gain.setValueAtTime(0.025, t0);
  gritGain.gain.linearRampToValueAtTime(0.09, peakT);
  gritGain.gain.linearRampToValueAtTime(0.0001, peakT + (close ? 0.12 : 0.2));
  grit.connect(gritFilt);
  gritFilt.connect(gritGain);
  gritGain.connect(out);
  sources.push(grit);

  sources.forEach((src) => {
    src.start(t0);
    src.stop(endT + 0.03);
  });

  playNoiseBurst({ duration: 0.05, filterFreq: 3200, filterType: 'bandpass', filterQ: 3.2, volume: 0.2, when: peakT });
  playNoiseBurst({ duration: 0.04, filterFreq: 2400, filterType: 'bandpass', filterQ: 2.6, volume: 0.16, when: peakT + 0.04 });
  playNoiseBurst({ duration: 0.045, filterFreq: 3800, filterType: 'bandpass', filterQ: 3.4, volume: 0.14, when: peakT + 0.09 });
}

function sfxFireBossBodyHit() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.055, filterFreq: 4500, filterType: 'highpass', volume: 0.44, when: t0 });
  playNoiseBurst({ duration: 0.2, filterFreq: 1500, filterEnd: 420, filterType: 'bandpass', filterQ: 1.2, volume: 0.38, when: t0 });
  playNoiseBurst({ duration: 0.16, filterFreq: 3000, filterEnd: 900, filterType: 'highpass', volume: 0.16, delaySend: 0.08, when: t0 + 0.028 });
  playSynth({
    type: 'triangle', freq: 240, freqEnd: 108, duration: 0.13,
    attack: 0.001, decay: 0.035, sustain: 0.28, release: 0.055,
    volume: 0.24, filterFreq: 800, delaySend: 0, when: t0,
  });
  playSynth({
    type: 'sawtooth', freq: 380, freqEnd: 140, duration: 0.09,
    attack: 0.001, decay: 0.025, sustain: 0.22, release: 0.04,
    volume: 0.09, filterType: 'lowpass', filterFreq: 1700, delaySend: 0.05, when: t0,
  });
}

function sfxCoreGateOpen() {
  playNoiseBurst({ duration: 0.28, filterFreq: 280, filterEnd: 90, filterType: 'lowpass', volume: 0.38 });
  playSynth({ type: 'sine', freq: 62, freqEnd: 34, duration: 0.32, attack: 0.02, decay: 0.08, sustain: 0.45, release: 0.1, volume: 0.26, filterFreq: 200, delaySend: 0 });
  playNoiseBurst({ duration: 0.18, filterFreq: 1400, filterType: 'bandpass', filterQ: 2, volume: 0.14, when: audioCtx.currentTime + 0.08 });
}

function sfxCoreEmerge() {
  playNoiseBurst({ duration: 0.22, filterFreq: 400, filterEnd: 1800, filterType: 'lowpass', volume: 0.26 });
  playSynth({ type: 'sine', freq: 80, freqEnd: 140, duration: 0.2, attack: 0.01, decay: 0.06, sustain: 0.4, release: 0.08, volume: 0.18, filterFreq: 500, delaySend: 0.12 });
}

function sfxCoreOverload() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  stopCoreOverload(0.03);
  const now = audioCtx.currentTime;
  const dur = framesToSeconds(CORE_OVERLOAD_BUILDUP_DURATION);

  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0.28, now);
  master.gain.linearRampToValueAtTime(1, now + dur);
  master.connect(sfxGain);

  const nBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
  const nData = nBuf.getChannelData(0);
  for (let i = 0; i < nData.length; i++) nData[i] = Math.random() * 2 - 1;

  const mains = audioCtx.createOscillator();
  mains.type = 'sine';
  mains.frequency.setValueAtTime(60, now);
  mains.frequency.exponentialRampToValueAtTime(118, now + dur);
  const mainsGain = audioCtx.createGain();
  mainsGain.gain.setValueAtTime(0.16, now);
  mainsGain.gain.linearRampToValueAtTime(0.34, now + dur);
  mains.connect(mainsGain);
  mainsGain.connect(master);

  const buzz = audioCtx.createOscillator();
  buzz.type = 'sawtooth';
  buzz.frequency.setValueAtTime(120, now);
  buzz.frequency.exponentialRampToValueAtTime(380, now + dur);
  const bFilt = audioCtx.createBiquadFilter();
  bFilt.type = 'lowpass';
  bFilt.frequency.setValueAtTime(480, now);
  bFilt.frequency.exponentialRampToValueAtTime(2200, now + dur);
  const bGain = audioCtx.createGain();
  bGain.gain.setValueAtTime(0.05, now);
  bGain.gain.linearRampToValueAtTime(0.18, now + dur);
  buzz.connect(bFilt);
  bFilt.connect(bGain);
  bGain.connect(master);

  const spin = audioCtx.createOscillator();
  spin.type = 'triangle';
  spin.frequency.setValueAtTime(1480, now);
  spin.frequency.exponentialRampToValueAtTime(4200, now + dur);
  const spGain = audioCtx.createGain();
  spGain.gain.setValueAtTime(0.03, now);
  spGain.gain.linearRampToValueAtTime(0.14, now + dur);
  spin.connect(spGain);
  spGain.connect(master);

  const alarm = audioCtx.createOscillator();
  alarm.type = 'square';
  alarm.frequency.setValueAtTime(880, now);
  alarm.frequency.exponentialRampToValueAtTime(1860, now + dur);
  const aFilt = audioCtx.createBiquadFilter();
  aFilt.type = 'bandpass';
  aFilt.frequency.setValueAtTime(1100, now);
  aFilt.frequency.exponentialRampToValueAtTime(2400, now + dur);
  aFilt.Q.value = 3.4;
  const aGain = audioCtx.createGain();
  aGain.gain.setValueAtTime(0.02, now);
  aGain.gain.linearRampToValueAtTime(0.12, now + dur);
  alarm.connect(aFilt);
  aFilt.connect(aGain);
  aGain.connect(master);

  const fizz = audioCtx.createBufferSource();
  fizz.buffer = nBuf;
  fizz.loop = true;
  const fFilt = audioCtx.createBiquadFilter();
  fFilt.type = 'highpass';
  fFilt.frequency.setValueAtTime(1800, now);
  fFilt.frequency.exponentialRampToValueAtTime(5200, now + dur);
  const fGain = audioCtx.createGain();
  fGain.gain.setValueAtTime(0.04, now);
  fGain.gain.linearRampToValueAtTime(0.26, now + dur);
  fizz.connect(fFilt);
  fFilt.connect(fGain);
  fGain.connect(master);

  const arc = audioCtx.createBufferSource();
  arc.buffer = nBuf;
  arc.loop = true;
  const arcFilt = audioCtx.createBiquadFilter();
  arcFilt.type = 'bandpass';
  arcFilt.frequency.setValueAtTime(900, now);
  arcFilt.frequency.exponentialRampToValueAtTime(2800, now + dur);
  arcFilt.Q.value = 1.8;
  const arcGain = audioCtx.createGain();
  arcGain.gain.setValueAtTime(0.03, now);
  arcGain.gain.linearRampToValueAtTime(0.2, now + dur);
  arc.connect(arcFilt);
  arcFilt.connect(arcGain);
  arcGain.connect(master);

  for (let i = 0; i < 9; i++) {
    playSynth({
      type: 'square', freq: 1320 + (i % 3) * 280, freqEnd: 420, duration: 0.045,
      attack: 0.001, decay: 0.012, sustain: 0.12, release: 0.02,
      volume: 0.05 + i * 0.008, filterType: 'highpass', filterFreq: 900, delaySend: 0.04,
      when: now + 0.1 + i * (0.15 - i * 0.008),
    });
  }
  playElectricCrackles({ count: 12, spacing: 0.11, volume: 0.14, when: now + 0.06 });
  playElectricCrackles({ count: 10, spacing: 0.04, volume: 0.22, when: now + dur * 0.58 });

  const stopAt = now + dur + 0.08;
  mains.start(now);
  buzz.start(now);
  spin.start(now);
  alarm.start(now);
  fizz.start(now);
  arc.start(now);
  mains.stop(stopAt);
  buzz.stop(stopAt);
  spin.stop(stopAt);
  alarm.stop(stopAt);
  fizz.stop(stopAt);
  arc.stop(stopAt);

  coreOverloadCtl = { master, nodes: [mains, buzz, spin, alarm, fizz, arc] };
}

function sfxCoreOverloadFlash() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  stopCoreOverload(0.04);
  const t0 = audioCtx.currentTime;

  playNoiseBurst({ duration: 0.04, filterFreq: 8500, filterType: 'highpass', volume: 0.55, delaySend: 0.08, when: t0 });
  playNoiseBurst({ duration: 0.08, filterFreq: 4200, filterType: 'bandpass', filterQ: 2.2, volume: 0.4, when: t0 });
  playNoiseBurst({ duration: 0.22, filterFreq: 2600, filterEnd: 700, filterType: 'bandpass', filterQ: 0.9, volume: 0.36, when: t0 + 0.02 });
  playNoiseBurst({ duration: 0.55, filterFreq: 4800, filterEnd: 1400, filterType: 'highpass', volume: 0.38, delaySend: 0.1, when: t0 + 0.03 });
  playNoiseBurst({ duration: 0.28, filterFreq: 420, filterEnd: 90, filterType: 'lowpass', volume: 0.42, when: t0 });

  playSynth({ type: 'sine', freq: 60, freqEnd: 22, duration: 0.9, attack: 0.001, decay: 0.12, sustain: 0.35, release: 0.28, volume: 0.36, filterFreq: 160, delaySend: 0, when: t0 });
  playSynth({ type: 'square', freq: 2400, freqEnd: 180, duration: 0.12, attack: 0.001, decay: 0.03, sustain: 0.18, release: 0.05, volume: 0.14, filterType: 'highpass', filterFreq: 1200, delaySend: 0.08, when: t0 });
  playSynth({ type: 'sawtooth', freq: 420, freqEnd: 70, duration: 0.22, attack: 0.001, decay: 0.05, sustain: 0.22, release: 0.08, volume: 0.16, filterType: 'lowpass', filterFreq: 1800, filterEnd: 280, delaySend: 0.06, when: t0 });
  playElectricCrackles({ count: 16, spacing: 0.012, volume: 0.3, when: t0 });
  playElectricCrackles({ count: 8, spacing: 0.03, volume: 0.18, when: t0 + 0.14 });
}

function sfxCoreOverloadBreakdown() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  const fryDur = 1.35;

  playNoiseBurst({ duration: fryDur, filterFreq: 5200, filterEnd: 900, filterType: 'highpass', volume: 0.28, delaySend: 0.12, when: t0 });
  playNoiseBurst({ duration: fryDur * 0.85, filterFreq: 2200, filterEnd: 400, filterType: 'bandpass', filterQ: 1.1, volume: 0.16, delaySend: 0.08, when: t0 + 0.06 });
  playSynth({ type: 'sine', freq: 58, freqEnd: 22, duration: fryDur, attack: 0.02, decay: 0.25, sustain: 0.28, release: 0.3, volume: 0.18, filterFreq: 140, delaySend: 0, when: t0 });
  playSynth({ type: 'triangle', freq: 2400, freqEnd: 180, duration: 0.55, attack: 0.01, decay: 0.14, sustain: 0.2, release: 0.16, volume: 0.07, filterType: 'lowpass', filterFreq: 3200, filterEnd: 500, delaySend: 0.08, when: t0 });

  const pops = [0.12, 0.28, 0.41, 0.58, 0.77, 0.98];
  pops.forEach((off, i) => {
    playNoiseBurst({
      duration: 0.035 + (i % 2) * 0.02,
      filterFreq: 2800 + (i % 4) * 600,
      filterType: i % 2 ? 'highpass' : 'bandpass',
      filterQ: 2.8,
      volume: 0.14 - i * 0.012,
      delaySend: 0.06,
      when: t0 + off,
    });
    playSynth({
      type: 'square', freq: 2100 - i * 160, freqEnd: 220, duration: 0.04,
      attack: 0.001, decay: 0.01, sustain: 0.1, release: 0.02,
      volume: 0.05, filterType: 'highpass', filterFreq: 800, delaySend: 0.04, when: t0 + off,
    });
  });
  playElectricCrackles({ count: 8, spacing: 0.09, volume: 0.16, when: t0 + 0.18 });
}

function sfxCoreDying() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playElectricCrackles({ count: 12, spacing: 0.014, volume: 0.3 });
  playSynth({ type: 'sawtooth', freq: 60, freqEnd: 38, duration: 0.55, attack: 0.008, decay: 0.12, sustain: 0.45, release: 0.12, volume: 0.16, filterType: 'lowpass', filterFreq: 220, delaySend: 0 });
  playSynth({ type: 'square', freq: 2650, freqEnd: 380, duration: 0.07, attack: 0.001, decay: 0.02, sustain: 0.15, release: 0.03, volume: 0.08, filterType: 'highpass', filterFreq: 1400, delaySend: 0.06 });
  playSynth({ type: 'square', freq: 1780, freqEnd: 820, duration: 0.05, attack: 0.001, decay: 0.015, sustain: 0.12, release: 0.025, volume: 0.07, filterType: 'highpass', filterFreq: 900, delaySend: 0.05, when: t0 + 0.09 });
  playSynth({ type: 'square', freq: 3100, freqEnd: 160, duration: 0.08, attack: 0.001, decay: 0.02, sustain: 0.12, release: 0.03, volume: 0.09, filterType: 'highpass', filterFreq: 1100, delaySend: 0.06, when: t0 + 0.17 });
  playSynth({ type: 'sawtooth', freq: 980, freqEnd: 140, duration: 0.14, attack: 0.002, decay: 0.04, sustain: 0.2, release: 0.05, volume: 0.1, filterType: 'lowpass', filterFreq: 2400, delaySend: 0.08, when: t0 + 0.28 });
  playNoiseBurst({ duration: 0.04, filterFreq: 4500, filterType: 'highpass', volume: 0.22 });
  playNoiseBurst({ duration: 0.035, filterFreq: 5200, filterType: 'highpass', volume: 0.18, when: t0 + 0.12 });
  playNoiseBurst({ duration: 0.05, filterFreq: 3800, filterType: 'highpass', volume: 0.2, when: t0 + 0.22 });
  playNoiseBurst({ duration: 0.06, filterFreq: 3000, filterType: 'highpass', volume: 0.16, when: t0 + 0.34 });
  playNoiseBurst({ duration: 0.16, filterFreq: 280, filterEnd: 90, filterType: 'lowpass', volume: 0.32, when: t0 + 0.46 });
}

function sfxCoreDyingCollapse() {
  playElectricCrackles({ count: 6, spacing: 0.02, volume: 0.22 });
  playSynth({ type: 'sawtooth', freq: 90, freqEnd: 28, duration: 0.28, attack: 0.004, decay: 0.08, sustain: 0.3, release: 0.1, volume: 0.14, filterType: 'lowpass', filterFreq: 350, delaySend: 0 });
  playNoiseBurst({ duration: 0.2, filterFreq: 1600, filterEnd: 200, filterType: 'lowpass', volume: 0.28 });
}

function sfxMiniBossReturn() {
  playNoiseBurst({ duration: 0.16, filterFreq: 900, filterEnd: 280, filterType: 'lowpass', volume: 0.22 });
}

function sfxFireBossExit() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  const dur = 0.92;
  const peakT = t0 + 0.12;
  const endT = t0 + dur;
  const sources = [];

  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.linearRampToValueAtTime(0.78, peakT);
  out.gain.linearRampToValueAtTime(0.22, t0 + 0.48);
  out.gain.linearRampToValueAtTime(0.0001, endT);

  if (typeof audioCtx.createStereoPanner === 'function') {
    const pan = audioCtx.createStereoPanner();
    pan.pan.setValueAtTime(0.12, t0);
    pan.pan.linearRampToValueAtTime(0.92, endT);
    out.connect(pan);
    pan.connect(sfxGain);
  } else {
    out.connect(sfxGain);
  }

  const air = createGlowDangerNoise();
  const airFilt = audioCtx.createBiquadFilter();
  airFilt.type = 'lowpass';
  airFilt.Q.value = 0.5;
  airFilt.frequency.setValueAtTime(1100, t0);
  airFilt.frequency.exponentialRampToValueAtTime(180, endT);
  const airGain = audioCtx.createGain();
  airGain.gain.value = 0.7;
  air.connect(airFilt);
  airFilt.connect(airGain);
  airGain.connect(out);
  sources.push(air);

  const rush = createGlowDangerNoise();
  const rushFilt = audioCtx.createBiquadFilter();
  rushFilt.type = 'bandpass';
  rushFilt.Q.value = 0.7;
  rushFilt.frequency.setValueAtTime(1400, t0);
  rushFilt.frequency.exponentialRampToValueAtTime(320, endT);
  const rushGain = audioCtx.createGain();
  rushGain.gain.value = 0.42;
  rush.connect(rushFilt);
  rushFilt.connect(rushGain);
  rushGain.connect(out);
  sources.push(rush);

  const heat = createGlowDangerNoise();
  const heatFilt = audioCtx.createBiquadFilter();
  heatFilt.type = 'highpass';
  heatFilt.Q.value = 0.7;
  heatFilt.frequency.setValueAtTime(2800, t0);
  heatFilt.frequency.exponentialRampToValueAtTime(900, t0 + 0.4);
  const heatGain = audioCtx.createGain();
  heatGain.gain.setValueAtTime(0.16, t0);
  heatGain.gain.linearRampToValueAtTime(0.0001, t0 + 0.42);
  heat.connect(heatFilt);
  heatFilt.connect(heatGain);
  heatGain.connect(out);
  sources.push(heat);

  const body = audioCtx.createOscillator();
  body.type = 'sine';
  body.frequency.setValueAtTime(78, t0);
  body.frequency.exponentialRampToValueAtTime(42, t0 + 0.38);
  const bodyGain = audioCtx.createGain();
  bodyGain.gain.setValueAtTime(0.14, t0);
  bodyGain.gain.linearRampToValueAtTime(0.0001, t0 + 0.4);
  body.connect(bodyGain);
  bodyGain.connect(out);
  sources.push(body);

  sources.forEach((src) => {
    src.start(t0);
    src.stop(endT + 0.03);
  });
}

function startMoltenCoreIdleSound({ preview = false } = {}) {
  if (moltenCoreIdleNodes || !audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.linearRampToValueAtTime(preview ? 0.055 : 0.04, now + 0.18);
  out.connect(sfxGain);

  const heat = createGlowDangerNoise();
  const heatFilt = audioCtx.createBiquadFilter();
  heatFilt.type = 'bandpass';
  heatFilt.Q.value = 0.85;
  heatFilt.frequency.setValueAtTime(980, now);
  const heatGain = audioCtx.createGain();
  heatGain.gain.value = 0.55;
  heat.connect(heatFilt);
  heatFilt.connect(heatGain);
  heatGain.connect(out);

  const hum = audioCtx.createOscillator();
  hum.type = 'sine';
  hum.frequency.setValueAtTime(50, now);
  const humGain = audioCtx.createGain();
  humGain.gain.value = 0.22;
  hum.connect(humGain);
  humGain.connect(out);

  const sources = [heat, hum];
  if (preview) {
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 60 / MINI_BOSS_FLOAT_PERIOD;
    const lfoFilt = audioCtx.createGain();
    lfoFilt.gain.value = 420;
    lfo.connect(lfoFilt);
    lfoFilt.connect(heatFilt.frequency);
    const lfoVol = audioCtx.createGain();
    lfoVol.gain.value = 0.018;
    lfo.connect(lfoVol);
    lfoVol.connect(out.gain);
    sources.push(lfo);
  }

  sources.forEach((src) => src.start(now));
  moltenCoreIdleNodes = { out, heatFilt, hum, sources };
}

function updateMoltenCoreIdleSound() {
  if (!moltenCoreIdleNodes || !audioCtx || !miniBoss) return;
  const now = audioCtx.currentTime;
  const phase = Math.sin((frame - miniBossSpawnFrame) * (2 * Math.PI / MINI_BOSS_FLOAT_PERIOD));
  const lift = 0.5 + 0.5 * phase;
  moltenCoreIdleNodes.heatFilt.frequency.setTargetAtTime(760 + lift * 820, now, 0.06);
  moltenCoreIdleNodes.out.gain.setTargetAtTime(0.028 + lift * 0.026, now, 0.06);
  moltenCoreIdleNodes.hum.frequency.setTargetAtTime(46 + lift * 12, now, 0.06);
}

function stopMoltenCoreIdleSound() {
  if (!moltenCoreIdleNodes) return;
  const nodes = moltenCoreIdleNodes;
  moltenCoreIdleNodes = null;
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  try {
    nodes.out.gain.cancelScheduledValues(now);
    nodes.out.gain.setValueAtTime(Math.max(0.0001, nodes.out.gain.value), now);
    nodes.out.gain.linearRampToValueAtTime(0.0001, now + 0.12);
  } catch (e) { /* already stopped */ }
  nodes.sources.forEach((src) => {
    try { src.stop(now + 0.14); } catch (e) { /* already stopped */ }
  });
}

function syncMoltenCoreIdleSound() {
  if (typeof previewLoopId === 'string' && previewLoopId === 'coreIdle') return;
  const th = currentTheme();
  const active = state === 'playing'
    && th
    && th.isMiniBossZone
    && th.miniBossVariant !== 'core'
    && miniBoss
    && !miniBossDefeated
    && miniBossAttackState === 'floating'
    && (frame - miniBossSpawnFrame) >= MINI_BOSS_ENTRANCE_DURATION;
  if (!active) {
    stopMoltenCoreIdleSound();
    return;
  }
  startMoltenCoreIdleSound();
  updateMoltenCoreIdleSound();
}

function sfxFireBossFlameWallTelegraph() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.95, filterFreq: 220, filterEnd: 520, filterType: 'lowpass', volume: 0.2, when: t0 });
  playNoiseBurst({ duration: 0.85, filterFreq: 480, filterEnd: 900, filterType: 'bandpass', filterQ: 0.7, volume: 0.22, delaySend: 0.06, when: t0 + 0.06 });
  playNoiseBurst({ duration: 0.55, filterFreq: 1400, filterEnd: 700, filterType: 'bandpass', filterQ: 1.1, volume: 0.14, when: t0 + 0.28 });
  const pops = [0.12, 0.22, 0.31, 0.42, 0.5, 0.58, 0.66, 0.74, 0.82, 0.9];
  pops.forEach((off, i) => {
    playNoiseBurst({
      duration: 0.035 + (i % 3) * 0.008,
      filterFreq: 1600 + (i % 5) * 420,
      filterType: 'bandpass',
      filterQ: 2.4 + (i % 2),
      volume: 0.12 + i * 0.012,
      when: t0 + off,
    });
  });
}

function startMoltenFlameWallSound({ preview = false } = {}) {
  if (moltenFlameWallNodes || !audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.linearRampToValueAtTime(preview ? 0.9 : 0.8, t0 + 0.08);
  out.gain.linearRampToValueAtTime(preview ? 0.48 : 0.38, t0 + 0.4);
  out.connect(sfxGain);

  const roar = createGlowDangerNoise();
  const roarFilt = audioCtx.createBiquadFilter();
  roarFilt.type = 'lowpass';
  roarFilt.Q.value = 0.55;
  roarFilt.frequency.setValueAtTime(240, t0);
  roarFilt.frequency.exponentialRampToValueAtTime(420, t0 + 0.2);
  const roarGain = audioCtx.createGain();
  roarGain.gain.value = 0.78;
  roar.connect(roarFilt);
  roarFilt.connect(roarGain);
  roarGain.connect(out);

  const billow = createGlowDangerNoise();
  const billowFilt = audioCtx.createBiquadFilter();
  billowFilt.type = 'bandpass';
  billowFilt.Q.value = 0.7;
  billowFilt.frequency.setValueAtTime(620, t0);
  const billowGain = audioCtx.createGain();
  billowGain.gain.value = 0.5;
  billow.connect(billowFilt);
  billowFilt.connect(billowGain);
  billowGain.connect(out);

  const snap = createGlowDangerNoise();
  const snapFilt = audioCtx.createBiquadFilter();
  snapFilt.type = 'bandpass';
  snapFilt.Q.value = 2.8;
  snapFilt.frequency.setValueAtTime(2200, t0);
  const snapGain = audioCtx.createGain();
  snapGain.gain.value = 0.16;
  snap.connect(snapFilt);
  snapFilt.connect(snapGain);
  snapGain.connect(out);

  const pop = createGlowDangerNoise();
  const popFilt = audioCtx.createBiquadFilter();
  popFilt.type = 'bandpass';
  popFilt.Q.value = 4.2;
  popFilt.frequency.setValueAtTime(3100, t0);
  const popGain = audioCtx.createGain();
  popGain.gain.value = 0.08;
  pop.connect(popFilt);
  popFilt.connect(popGain);
  popGain.connect(out);

  const crackleMod = createGlowDangerNoise();
  const crackleModFilt = audioCtx.createBiquadFilter();
  crackleModFilt.type = 'lowpass';
  crackleModFilt.frequency.value = 22;
  crackleModFilt.Q.value = 0.5;
  const crackleDepth = audioCtx.createGain();
  crackleDepth.gain.value = 0.28;
  crackleMod.connect(crackleModFilt);
  crackleModFilt.connect(crackleDepth);
  crackleDepth.connect(snapGain.gain);

  const popMod = createGlowDangerNoise();
  const popModFilt = audioCtx.createBiquadFilter();
  popModFilt.type = 'lowpass';
  popModFilt.frequency.value = 38;
  const popDepth = audioCtx.createGain();
  popDepth.gain.value = 0.2;
  popMod.connect(popModFilt);
  popModFilt.connect(popDepth);
  popDepth.connect(popGain.gain);

  const swell = audioCtx.createOscillator();
  swell.type = 'sine';
  swell.frequency.value = 0.38;
  const swellDepth = audioCtx.createGain();
  swellDepth.gain.value = 90;
  swell.connect(swellDepth);
  swellDepth.connect(roarFilt.frequency);

  const sources = [roar, billow, snap, pop, crackleMod, popMod, swell];
  sources.forEach((src) => src.start(t0));
  moltenFlameWallNodes = { out, sources };

  playNoiseBurst({ duration: 0.22, filterFreq: 380, filterEnd: 140, filterType: 'lowpass', volume: 0.42, when: t0 });
  playNoiseBurst({ duration: 0.16, filterFreq: 700, filterEnd: 320, filterType: 'bandpass', filterQ: 0.8, volume: 0.28, when: t0 });
  playNoiseBurst({ duration: 0.05, filterFreq: 2400, filterType: 'bandpass', filterQ: 2.8, volume: 0.22, when: t0 + 0.02 });
  playNoiseBurst({ duration: 0.04, filterFreq: 1800, filterType: 'bandpass', filterQ: 2.4, volume: 0.18, when: t0 + 0.07 });
  playNoiseBurst({ duration: 0.045, filterFreq: 2800, filterType: 'bandpass', filterQ: 3.2, volume: 0.16, when: t0 + 0.12 });
}

function stopMoltenFlameWallSound() {
  if (!moltenFlameWallNodes) return;
  const nodes = moltenFlameWallNodes;
  moltenFlameWallNodes = null;
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  try {
    nodes.out.gain.cancelScheduledValues(now);
    nodes.out.gain.setValueAtTime(Math.max(0.0001, nodes.out.gain.value), now);
    nodes.out.gain.linearRampToValueAtTime(0.0001, now + 0.16);
  } catch (e) { /* already stopped */ }
  nodes.sources.forEach((src) => {
    try { src.stop(now + 0.18); } catch (e) { /* already stopped */ }
  });
}

function syncMoltenFlameWallSound() {
  if (typeof previewLoopId === 'string' && previewLoopId === 'coreFlame') return;
  const th = currentTheme();
  const active = state === 'playing'
    && th
    && th.isMiniBossZone
    && th.miniBossVariant !== 'core'
    && miniBoss
    && !miniBossDefeated
    && miniBossAttackState === 'flameWallActive';
  if (!active) {
    stopMoltenFlameWallSound();
    return;
  }
  startMoltenFlameWallSound();
}

function sfxFireBossBarrageTelegraph() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.85, filterFreq: 280, filterEnd: 640, filterType: 'lowpass', volume: 0.16, when: t0 });
  playNoiseBurst({ duration: 0.55, filterFreq: 900, filterEnd: 1600, filterType: 'bandpass', filterQ: 1.2, volume: 0.14, delaySend: 0.08, when: t0 + 0.12 });
  playSynth({
    type: 'triangle', freq: 180, freqEnd: 260, duration: 0.7,
    attack: 0.08, decay: 0.18, sustain: 0.45, release: 0.12,
    volume: 0.08, filterFreq: 700, filterEnd: 1400, delaySend: 0.06, when: t0,
  });
  [0.2, 0.38, 0.52, 0.66, 0.8].forEach((off, i) => {
    playNoiseBurst({
      duration: 0.04, filterFreq: 1800 + i * 280, filterType: 'bandpass', filterQ: 2.8,
      volume: 0.1 + i * 0.02, when: t0 + off,
    });
  });
}

function sfxFireBossEmberLaunch() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  const lob = (when, pitch, vol) => {
    playSynth({
      type: 'sine', freq: pitch, freqEnd: pitch * 0.52, duration: 0.58,
      attack: 0.05, decay: 0.18, sustain: 0.52, release: 0.24,
      volume: 0.15 * vol, filterFreq: 380, filterEnd: 140, delaySend: 0.1, when,
    });
    playSynth({
      type: 'triangle', freq: pitch * 1.55, freqEnd: pitch * 0.62, duration: 0.5,
      attack: 0.06, decay: 0.16, sustain: 0.38, release: 0.22,
      volume: 0.07 * vol, filterFreq: 820, filterEnd: 240, delaySend: 0.12, when,
    });
    playNoiseBurst({
      duration: 0.68, filterFreq: 480, filterEnd: 150, filterType: 'lowpass',
      volume: 0.24 * vol, delaySend: 0.14, when,
    });
    playNoiseBurst({
      duration: 0.55, filterFreq: 860, filterEnd: 280, filterType: 'bandpass', filterQ: 0.7,
      volume: 0.15 * vol, delaySend: 0.1, when: when + 0.05,
    });
    [0.14, 0.3, 0.46].forEach((off, i) => {
      playNoiseBurst({
        duration: 0.07, filterFreq: 1280 - i * 240, filterType: 'bandpass', filterQ: 1.6,
        volume: 0.07 * vol, delaySend: 0.06, when: when + off,
      });
    });
  };
  lob(t0, 156, 1);
  lob(t0 + 0.12, 128, 0.86);
}

function sfxFireBossEmberHit() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted) return;
  const t0 = audioCtx.currentTime;
  playHotEmberImpact();
  playNoiseBurst({ duration: 0.1, filterFreq: 1100, filterEnd: 380, filterType: 'bandpass', filterQ: 1.1, volume: 0.22, when: t0 });
  playSynth({
    type: 'triangle', freq: 210, freqEnd: 90, duration: 0.12,
    attack: 0.002, decay: 0.035, sustain: 0.28, release: 0.05,
    volume: 0.16, filterFreq: 700, delaySend: 0, when: t0,
  });
}

function sfxFireBossSqueezeHit() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted) return;
  const t0 = audioCtx.currentTime;
  playRockThud();
  playNoiseBurst({ duration: 0.18, filterFreq: 320, filterEnd: 110, filterType: 'lowpass', volume: 0.36, when: t0 });
  playNoiseBurst({ duration: 0.08, filterFreq: 1600, filterType: 'bandpass', filterQ: 2.2, volume: 0.2, when: t0 });
  playSynth({
    type: 'sine', freq: 78, freqEnd: 42, duration: 0.2,
    attack: 0.003, decay: 0.05, sustain: 0.35, release: 0.08,
    volume: 0.2, filterFreq: 220, delaySend: 0, when: t0,
  });
}

function startMoltenSqueezeSound({ preview = false } = {}) {
  if (moltenSqueezeNodes || !audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.linearRampToValueAtTime(preview ? 0.28 : 0.16, t0 + 0.12);
  out.connect(sfxGain);

  const grind = createGlowDangerNoise();
  const grindFilt = audioCtx.createBiquadFilter();
  grindFilt.type = 'lowpass';
  grindFilt.Q.value = 0.6;
  grindFilt.frequency.setValueAtTime(200, t0);
  const grindGain = audioCtx.createGain();
  grindGain.gain.value = 0.7;
  grind.connect(grindFilt);
  grindFilt.connect(grindGain);
  grindGain.connect(out);

  const scrape = createGlowDangerNoise();
  const scrapeFilt = audioCtx.createBiquadFilter();
  scrapeFilt.type = 'bandpass';
  scrapeFilt.Q.value = 1.4;
  scrapeFilt.frequency.setValueAtTime(420, t0);
  const scrapeGain = audioCtx.createGain();
  scrapeGain.gain.value = 0.28;
  scrape.connect(scrapeFilt);
  scrapeFilt.connect(scrapeGain);
  scrapeGain.connect(out);

  const glow = createGlowDangerNoise();
  const glowFilt = audioCtx.createBiquadFilter();
  glowFilt.type = 'bandpass';
  glowFilt.Q.value = 0.8;
  glowFilt.frequency.setValueAtTime(780, t0);
  const glowGain = audioCtx.createGain();
  glowGain.gain.value = 0.16;
  glow.connect(glowFilt);
  glowFilt.connect(glowGain);
  glowGain.connect(out);

  const sources = [grind, scrape, glow];
  if (preview) {
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.15;
    const lfoVol = audioCtx.createGain();
    lfoVol.gain.value = 0.1;
    lfo.connect(lfoVol);
    lfoVol.connect(out.gain);
    const lfoFilt = audioCtx.createGain();
    lfoFilt.gain.value = 90;
    lfo.connect(lfoFilt);
    lfoFilt.connect(grindFilt.frequency);
    sources.push(lfo);
  }

  sources.forEach((src) => src.start(t0));
  moltenSqueezeNodes = { out, grindFilt, sources };

  playNoiseBurst({ duration: 0.16, filterFreq: 240, filterEnd: 90, filterType: 'lowpass', volume: 0.32, when: t0 });
  playNoiseBurst({ duration: 0.08, filterFreq: 900, filterType: 'bandpass', filterQ: 1.6, volume: 0.16, when: t0 });
}

function updateMoltenSqueezeSound() {
  if (!moltenSqueezeNodes || !audioCtx) return;
  const gap = miniBossSqueezeBottomY - miniBossSqueezeTopY;
  const gapRange = Math.max(1, MINI_BOSS_SQUEEZE_MAX_GAP - MINI_BOSS_SQUEEZE_MIN_GAP);
  const tightness = Math.max(0, Math.min(1, 1 - (gap - MINI_BOSS_SQUEEZE_MIN_GAP) / gapRange));
  const now = audioCtx.currentTime;
  moltenSqueezeNodes.out.gain.setTargetAtTime(0.12 + tightness * 0.22, now, 0.1);
  moltenSqueezeNodes.grindFilt.frequency.setTargetAtTime(170 + tightness * 240, now, 0.1);
}

function stopMoltenSqueezeSound() {
  if (!moltenSqueezeNodes) return;
  const nodes = moltenSqueezeNodes;
  moltenSqueezeNodes = null;
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  try {
    nodes.out.gain.cancelScheduledValues(now);
    nodes.out.gain.setValueAtTime(Math.max(0.0001, nodes.out.gain.value), now);
    nodes.out.gain.linearRampToValueAtTime(0.0001, now + 0.18);
  } catch (e) { /* already stopped */ }
  nodes.sources.forEach((src) => {
    try { src.stop(now + 0.2); } catch (e) { /* already stopped */ }
  });
}

function syncMoltenSqueezeSound() {
  if (typeof previewLoopId === 'string' && previewLoopId === 'coreSqueeze') return;
  const th = currentTheme();
  const active = state === 'playing'
    && th
    && th.isMiniBossZone
    && th.miniBossVariant !== 'core'
    && miniBoss
    && !miniBossDefeated
    && miniBossAttackState === 'barrageActive';
  if (!active) {
    stopMoltenSqueezeSound();
    return;
  }
  startMoltenSqueezeSound();
  updateMoltenSqueezeSound();
}

function startMoltenDeathAshSound({ preview = false } = {}) {
  if (moltenDeathAshNodes || !audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0.0001, t0);
  out.gain.linearRampToValueAtTime(preview ? 0.22 : 0.16, t0 + 0.2);
  out.connect(sfxGain);

  const coals = createGlowDangerNoise();
  const coalsFilt = audioCtx.createBiquadFilter();
  coalsFilt.type = 'lowpass';
  coalsFilt.Q.value = 0.5;
  coalsFilt.frequency.setValueAtTime(160, t0);
  const coalsGain = audioCtx.createGain();
  coalsGain.gain.value = 0.55;
  coals.connect(coalsFilt);
  coalsFilt.connect(coalsGain);
  coalsGain.connect(out);

  const hiss = createGlowDangerNoise();
  const hissFilt = audioCtx.createBiquadFilter();
  hissFilt.type = 'bandpass';
  hissFilt.Q.value = 0.9;
  hissFilt.frequency.setValueAtTime(2100, t0);
  const hissGain = audioCtx.createGain();
  hissGain.gain.value = 0.32;
  hiss.connect(hissFilt);
  hissFilt.connect(hissGain);
  hissGain.connect(out);

  const flake = createGlowDangerNoise();
  const flakeFilt = audioCtx.createBiquadFilter();
  flakeFilt.type = 'bandpass';
  flakeFilt.Q.value = 2.4;
  flakeFilt.frequency.setValueAtTime(3200, t0);
  const flakeGain = audioCtx.createGain();
  flakeGain.gain.value = 0.08;
  flake.connect(flakeFilt);
  flakeFilt.connect(flakeGain);
  flakeGain.connect(out);

  const flakeMod = createGlowDangerNoise();
  const flakeModFilt = audioCtx.createBiquadFilter();
  flakeModFilt.type = 'lowpass';
  flakeModFilt.frequency.value = 14;
  const flakeDepth = audioCtx.createGain();
  flakeDepth.gain.value = 0.12;
  flakeMod.connect(flakeModFilt);
  flakeModFilt.connect(flakeDepth);
  flakeDepth.connect(flakeGain.gain);

  const sources = [coals, hiss, flake, flakeMod];
  if (preview) {
    const lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.22;
    const lfoVol = audioCtx.createGain();
    lfoVol.gain.value = 0.05;
    lfo.connect(lfoVol);
    lfoVol.connect(out.gain);
    const lfoHiss = audioCtx.createGain();
    lfoHiss.gain.value = 280;
    lfo.connect(lfoHiss);
    lfoHiss.connect(hissFilt.frequency);
    sources.push(lfo);
  }

  sources.forEach((src) => src.start(t0));
  moltenDeathAshNodes = { out, hissFilt, coalsFilt, sources };

  playNoiseBurst({ duration: 0.22, filterFreq: 700, filterEnd: 220, filterType: 'bandpass', filterQ: 0.8, volume: 0.16, delaySend: 0.08, when: t0 });
}

function updateMoltenDeathAshSound() {
  if (!moltenDeathAshNodes || !audioCtx || miniBossAttackState !== 'dying') return;
  const elapsed = frame - miniBossAttackStateStartFrame;
  const dimEnd = MINI_BOSS_DEATH_DIM_DURATION;
  const ashT = Math.max(0, Math.min(1, (elapsed - dimEnd) / MINI_BOSS_DEATH_ASH_DURATION));
  const now = audioCtx.currentTime;
  moltenDeathAshNodes.out.gain.setTargetAtTime(0.12 + ashT * 0.08, now, 0.12);
  moltenDeathAshNodes.hissFilt.frequency.setTargetAtTime(1700 + ashT * 900, now, 0.15);
  moltenDeathAshNodes.coalsFilt.frequency.setTargetAtTime(150 - ashT * 50, now, 0.15);
}

function stopMoltenDeathAshSound() {
  if (!moltenDeathAshNodes) return;
  const nodes = moltenDeathAshNodes;
  moltenDeathAshNodes = null;
  if (!audioCtx) return;
  const now = audioCtx.currentTime;
  try {
    nodes.out.gain.cancelScheduledValues(now);
    nodes.out.gain.setValueAtTime(Math.max(0.0001, nodes.out.gain.value), now);
    nodes.out.gain.linearRampToValueAtTime(0.0001, now + 0.16);
  } catch (e) { /* already stopped */ }
  nodes.sources.forEach((src) => {
    try { src.stop(now + 0.18); } catch (e) { /* already stopped */ }
  });
}

function syncMoltenDeathAshSound() {
  if (typeof previewLoopId === 'string' && previewLoopId === 'moltenAsh') return;
  const th = currentTheme();
  const elapsed = miniBoss ? frame - miniBossAttackStateStartFrame : 0;
  const dimEnd = MINI_BOSS_DEATH_DIM_DURATION;
  const ashEnd = dimEnd + MINI_BOSS_DEATH_ASH_DURATION;
  const active = state === 'playing'
    && th
    && th.isMiniBossZone
    && th.miniBossVariant !== 'core'
    && miniBoss
    && !miniBossDefeated
    && miniBossAttackState === 'dying'
    && elapsed >= dimEnd
    && elapsed < ashEnd;
  if (!active) {
    stopMoltenDeathAshSound();
    return;
  }
  startMoltenDeathAshSound();
  updateMoltenDeathAshSound();
}

function playEntranceRumble({ when, duration, volStart, volEnd, filtStart, filtEnd }) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted) return;
  const t0 = when != null ? when : audioCtx.currentTime;
  const buf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const noise = audioCtx.createBufferSource();
  noise.buffer = buf;
  noise.loop = true;
  const filt = audioCtx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.Q.value = 0.55;
  filt.frequency.setValueAtTime(Math.max(80, filtStart), t0);
  filt.frequency.exponentialRampToValueAtTime(Math.max(80, filtEnd), t0 + duration);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(Math.max(0.0001, volStart), t0);
  g.gain.linearRampToValueAtTime(Math.max(0.0001, volEnd), t0 + duration);
  g.gain.linearRampToValueAtTime(0.0001, t0 + duration + 0.08);
  noise.connect(filt);
  filt.connect(g);
  g.connect(sfxGain);
  noise.start(t0);
  noise.stop(t0 + duration + 0.1);
}

function sfxSignalEntranceGlitch(when = null) {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = when != null ? when : audioCtx.currentTime;
  playEntranceRumble({ when: t0, duration: 1.0, volStart: 0.08, volEnd: 0.28, filtStart: 180, filtEnd: 520 });
  playSynth({ type: 'sine', freq: 38, freqEnd: 62, duration: 1.0, attack: 0.08, decay: 0.25, sustain: 0.8, release: 0.12, volume: 0.22, filterFreq: 160, delaySend: 0, when: t0 });
  playSynth({ type: 'sine', freq: 52, freqEnd: 88, duration: 1.0, attack: 0.1, decay: 0.28, sustain: 0.65, release: 0.12, volume: 0.1, filterFreq: 220, delaySend: 0.06, when: t0 });
}

function sfxSignalEntranceAssemble(when = null) {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = when != null ? when : audioCtx.currentTime;
  playEntranceRumble({ when: t0, duration: 1.05, volStart: 0.22, volEnd: 0.42, filtStart: 700, filtEnd: 160 });
  playSynth({ type: 'sine', freq: 48, freqEnd: 28, duration: 1.05, attack: 0.04, decay: 0.2, sustain: 0.8, release: 0.08, volume: 0.26, filterFreq: 140, delaySend: 0, when: t0 });
  playSynth({ type: 'sawtooth', freq: 70, freqEnd: 36, duration: 1.0, attack: 0.05, decay: 0.22, sustain: 0.55, release: 0.08, volume: 0.1, filterType: 'lowpass', filterFreq: 380, filterEnd: 140, delaySend: 0, when: t0 });
}

function sfxSignalEntranceSnap(when = null) {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = when != null ? when : audioCtx.currentTime;
  playNoiseBurst({ duration: 0.12, filterFreq: 5000, filterType: 'highpass', volume: 0.42, when: t0 });
  playNoiseBurst({ duration: 0.22, filterFreq: 1400, filterEnd: 280, filterType: 'bandpass', filterQ: 0.8, volume: 0.4, when: t0 });
  playEntranceRumble({ when: t0, duration: 0.85, volStart: 0.62, volEnd: 0.12, filtStart: 900, filtEnd: 90 });
  playSynth({ type: 'sine', freq: 68, freqEnd: 22, duration: 0.7, attack: 0.002, decay: 0.12, sustain: 0.5, release: 0.22, volume: 0.46, filterFreq: 160, delaySend: 0, when: t0 });
  playSynth({ type: 'sine', freq: 38, freqEnd: 18, duration: 0.85, attack: 0.004, decay: 0.16, sustain: 0.45, release: 0.24, volume: 0.32, filterFreq: 100, delaySend: 0, when: t0 });
  playSynth({ type: 'sawtooth', freq: 90, freqEnd: 28, duration: 0.4, attack: 0.002, decay: 0.08, sustain: 0.35, release: 0.14, volume: 0.16, filterType: 'lowpass', filterFreq: 500, filterEnd: 120, delaySend: 0, when: t0 });
  playNoiseBurst({ duration: 0.4, filterFreq: 500, filterEnd: 2200, filterType: 'lowpass', volume: 0.28, delaySend: 0.1, when: t0 + 0.04 });
  playNoiseBurst({ duration: 0.5, filterFreq: 2200, filterEnd: 350, filterType: 'highpass', volume: 0.2, when: t0 + 0.1, delaySend: 0.08 });
}

function sfxSignalEntrance() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const assembleAt = BOSS_ENTRANCE_CHARGE_END * (BOSS_ENTRANCE_DURATION / 60);
  const snapAt = BOSS_ENTRANCE_ASSEMBLE_END * (BOSS_ENTRANCE_DURATION / 60);
  sfxSignalEntranceGlitch(t0);
  sfxSignalEntranceAssemble(t0 + assembleAt);
  sfxSignalEntranceSnap(t0 + snapAt);
}

let signalPhaseCtl = null;

function stopSignalPhase(fadeSec = 0.06) {
  if (!signalPhaseCtl || !audioCtx) return;
  const ctl = signalPhaseCtl;
  signalPhaseCtl = null;
  const t = audioCtx.currentTime;
  const fade = Math.max(0.02, fadeSec);
  try {
    ctl.master.gain.cancelScheduledValues(t);
    ctl.master.gain.setValueAtTime(Math.max(0.0001, ctl.master.gain.value), t);
    ctl.master.gain.linearRampToValueAtTime(0.0001, t + fade);
  } catch (e) { /* already stopped */ }
  const halt = t + fade + 0.04;
  for (const node of ctl.nodes) {
    try { node.stop(halt); } catch (e) { /* already stopped */ }
  }
}

function startPhaseStrainBed({ duration, volPeak, filtStart, filtEnd, pulseStart, pulseEnd }) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted) return;
  stopSignalPhase(0.03);
  const now = audioCtx.currentTime;
  const dur = Math.max(0.2, duration);
  const master = audioCtx.createGain();
  master.gain.value = 1;
  master.connect(sfxGain);

  const nBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
  const nData = nBuf.getChannelData(0);
  for (let i = 0; i < nData.length; i++) nData[i] = Math.random() * 2 - 1;

  const noise = audioCtx.createBufferSource();
  noise.buffer = nBuf;
  noise.loop = true;
  const filt = audioCtx.createBiquadFilter();
  filt.type = 'lowpass';
  filt.Q.value = 0.6;
  filt.frequency.setValueAtTime(Math.max(80, filtStart), now);
  filt.frequency.exponentialRampToValueAtTime(Math.max(80, filtEnd), now + dur);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.12, now);
  g.gain.linearRampToValueAtTime(volPeak, now + dur * 0.48);
  g.gain.linearRampToValueAtTime(0.08, now + dur);
  noise.connect(filt);
  filt.connect(g);
  g.connect(master);

  const pulse = audioCtx.createOscillator();
  pulse.type = 'sine';
  pulse.frequency.setValueAtTime(pulseStart, now);
  pulse.frequency.exponentialRampToValueAtTime(pulseEnd, now + dur);
  const pulseDepth = audioCtx.createGain();
  pulseDepth.gain.setValueAtTime(0.06, now);
  pulseDepth.gain.linearRampToValueAtTime(0.22, now + dur * 0.5);
  pulseDepth.gain.linearRampToValueAtTime(0.04, now + dur);
  pulse.connect(pulseDepth);
  pulseDepth.connect(g.gain);

  const stopAt = now + dur + 0.06;
  noise.start(now);
  pulse.start(now);
  noise.stop(stopAt);
  pulse.stop(stopAt);
  signalPhaseCtl = { master, nodes: [noise, pulse] };
}

function sfxSignalPhaseStrain() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const dur = framesToSeconds(BOSS_TRANSITION_DURATION);
  startPhaseStrainBed({ duration: dur, volPeak: 0.48, filtStart: 180, filtEnd: 720, pulseStart: 5.5, pulseEnd: 13 });
  playSynth({ type: 'sine', freq: 46, freqEnd: 88, duration: dur, attack: 0.12, decay: 0.4, sustain: 0.55, release: 0.12, volume: 0.18, filterFreq: 220, delaySend: 0.1, when: t0 });
  playSynth({ type: 'sawtooth', freq: 70, freqEnd: 140, duration: dur * 0.85, attack: 0.1, decay: 0.3, sustain: 0.4, release: 0.12, volume: 0.08, filterType: 'lowpass', filterFreq: 320, filterEnd: 900, delaySend: 0.08, when: t0 });
  playNoiseBurst({ duration: 0.12, filterFreq: 4200, filterType: 'highpass', volume: 0.32, when: t0 + dur });
  playNoiseBurst({ duration: 0.28, filterFreq: 900, filterEnd: 160, filterType: 'lowpass', volume: 0.42, when: t0 + dur });
  playSynth({ type: 'sine', freq: 72, freqEnd: 28, duration: 0.38, attack: 0.002, decay: 0.08, sustain: 0.4, release: 0.14, volume: 0.3, filterFreq: 160, delaySend: 0, when: t0 + dur });
  playNoiseBurst({ duration: 0.32, filterFreq: 400, filterEnd: 1800, filterType: 'lowpass', volume: 0.22, delaySend: 0.12, when: t0 + dur + 0.03 });
}

function sfxSignalPhaseEclipse() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const dur = framesToSeconds(BOSS_PHASE5_TRANSITION_DURATION);
  const shatterAt = dur * 0.2;
  const flashAt = dur * 0.55;
  const settleAt = dur * 0.68;
  startPhaseStrainBed({ duration: shatterAt, volPeak: 0.55, filtStart: 140, filtEnd: 500, pulseStart: 7, pulseEnd: 16 });
  playSynth({ type: 'sine', freq: 36, freqEnd: 58, duration: shatterAt, attack: 0.08, decay: 0.2, sustain: 0.7, release: 0.06, volume: 0.22, filterFreq: 140, delaySend: 0, when: t0 });

  playNoiseBurst({ duration: 0.1, filterFreq: 5000, filterType: 'highpass', volume: 0.4, when: t0 + shatterAt });
  playNoiseBurst({ duration: 0.35, filterFreq: 700, filterEnd: 180, filterType: 'lowpass', volume: 0.5, when: t0 + shatterAt });
  playNoiseBurst({ duration: 0.45, filterFreq: 500, filterEnd: 2400, filterType: 'lowpass', volume: 0.32, delaySend: 0.14, when: t0 + shatterAt });
  playSynth({ type: 'sine', freq: 64, freqEnd: 26, duration: 0.42, attack: 0.002, decay: 0.1, sustain: 0.4, release: 0.16, volume: 0.34, filterFreq: 160, delaySend: 0, when: t0 + shatterAt });
  playNoiseBurst({ duration: 0.28, filterFreq: 1600, filterEnd: 400, filterType: 'highpass', volume: 0.18, when: t0 + shatterAt + 0.08, delaySend: 0.1 });
  playNoiseBurst({ duration: 0.3, filterFreq: 400, filterEnd: 1600, filterType: 'lowpass', volume: 0.2, delaySend: 0.12, when: t0 + shatterAt + 0.16 });
  playNoiseBurst({ duration: 0.32, filterFreq: 350, filterEnd: 1400, filterType: 'lowpass', volume: 0.16, delaySend: 0.12, when: t0 + shatterAt + 0.28 });

  playNoiseBurst({ duration: 0.14, filterFreq: 6000, filterType: 'highpass', volume: 0.5, when: t0 + flashAt });
  playNoiseBurst({ duration: 0.4, filterFreq: 1100, filterEnd: 140, filterType: 'lowpass', volume: 0.58, when: t0 + flashAt });
  playSynth({ type: 'sine', freq: 80, freqEnd: 22, duration: 0.55, attack: 0.002, decay: 0.12, sustain: 0.45, release: 0.2, volume: 0.4, filterFreq: 180, delaySend: 0, when: t0 + flashAt });
  playSynth({ type: 'sine', freq: 38, freqEnd: 20, duration: 0.7, attack: 0.004, decay: 0.16, sustain: 0.4, release: 0.24, volume: 0.26, filterFreq: 100, delaySend: 0, when: t0 + flashAt });

  playNoiseBurst({ duration: 0.4, filterFreq: 280, filterEnd: 2000, filterType: 'lowpass', volume: 0.22, delaySend: 0.16, when: t0 + settleAt });
  playSynth({ type: 'sine', freq: 220, freqEnd: 90, duration: 0.55, attack: 0.04, decay: 0.18, sustain: 0.35, release: 0.28, volume: 0.1, filterFreq: 1400, delaySend: 0.22, when: t0 + settleAt });
  playSynth({ type: 'sine', freq: 48, freqEnd: 28, duration: 0.7, attack: 0.03, decay: 0.2, sustain: 0.4, release: 0.28, volume: 0.18, filterFreq: 140, delaySend: 0.08, when: t0 + settleAt });
}

function sfxSignalPhase() {
  if (bossTransitionTargetPhase === 5) sfxSignalPhaseEclipse();
  else sfxSignalPhaseStrain();
}

let signalFinalChargeCtl = null;

function stopSignalFinalCharge(fadeSec = 0.08) {
  if (!signalFinalChargeCtl || !audioCtx) return;
  const ctl = signalFinalChargeCtl;
  signalFinalChargeCtl = null;
  const t = audioCtx.currentTime;
  const fade = Math.max(0.02, fadeSec);
  try {
    ctl.master.gain.cancelScheduledValues(t);
    ctl.master.gain.setValueAtTime(Math.max(0.0001, ctl.master.gain.value), t);
    ctl.master.gain.linearRampToValueAtTime(0.0001, t + fade);
  } catch (e) { /* already stopped */ }
  const halt = t + fade + 0.04;
  for (const node of ctl.nodes) {
    try { node.stop(halt); } catch (e) { /* already stopped */ }
  }
}

function sfxSignalFinalCharge() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted) return;
  stopSignalFinalCharge(0.04);
  const now = audioCtx.currentTime;
  const dur = framesToSeconds(BOSS_FINAL_CHARGE_DURATION);

  const master = audioCtx.createGain();
  master.gain.setValueAtTime(0.18, now);
  master.gain.linearRampToValueAtTime(1, now + dur);
  master.connect(sfxGain);

  const nBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
  const nData = nBuf.getChannelData(0);
  for (let i = 0; i < nData.length; i++) nData[i] = Math.random() * 2 - 1;

  const rumble = audioCtx.createBufferSource();
  rumble.buffer = nBuf;
  rumble.loop = true;
  const rFilt = audioCtx.createBiquadFilter();
  rFilt.type = 'lowpass';
  rFilt.Q.value = 0.55;
  rFilt.frequency.setValueAtTime(160, now);
  rFilt.frequency.exponentialRampToValueAtTime(1100, now + dur);
  const rGain = audioCtx.createGain();
  rGain.gain.setValueAtTime(0.22, now);
  rGain.gain.linearRampToValueAtTime(0.72, now + dur);
  rumble.connect(rFilt);
  rFilt.connect(rGain);
  rGain.connect(master);

  const hiss = audioCtx.createBufferSource();
  hiss.buffer = nBuf;
  hiss.loop = true;
  const hFilt = audioCtx.createBiquadFilter();
  hFilt.type = 'bandpass';
  hFilt.Q.value = 0.9;
  hFilt.frequency.setValueAtTime(400, now);
  hFilt.frequency.exponentialRampToValueAtTime(2200, now + dur);
  const hGain = audioCtx.createGain();
  hGain.gain.setValueAtTime(0.04, now);
  hGain.gain.linearRampToValueAtTime(0.28, now + dur);
  hiss.connect(hFilt);
  hFilt.connect(hGain);
  hGain.connect(master);

  const sub = audioCtx.createOscillator();
  sub.type = 'sine';
  sub.frequency.setValueAtTime(28, now);
  sub.frequency.exponentialRampToValueAtTime(62, now + dur);
  const subGain = audioCtx.createGain();
  subGain.gain.setValueAtTime(0.16, now);
  subGain.gain.linearRampToValueAtTime(0.48, now + dur);
  sub.connect(subGain);
  subGain.connect(master);

  const strain = audioCtx.createOscillator();
  strain.type = 'sawtooth';
  strain.frequency.setValueAtTime(48, now);
  strain.frequency.exponentialRampToValueAtTime(160, now + dur);
  const sFilt = audioCtx.createBiquadFilter();
  sFilt.type = 'lowpass';
  sFilt.frequency.setValueAtTime(280, now);
  sFilt.frequency.exponentialRampToValueAtTime(900, now + dur);
  const sGain = audioCtx.createGain();
  sGain.gain.setValueAtTime(0.05, now);
  sGain.gain.linearRampToValueAtTime(0.22, now + dur);
  strain.connect(sFilt);
  sFilt.connect(sGain);
  sGain.connect(master);

  const pulse = audioCtx.createOscillator();
  pulse.type = 'sine';
  pulse.frequency.setValueAtTime(3.2, now);
  pulse.frequency.exponentialRampToValueAtTime(14, now + dur);
  const pulseDepth = audioCtx.createGain();
  pulseDepth.gain.setValueAtTime(0.08, now);
  pulseDepth.gain.linearRampToValueAtTime(0.28, now + dur);
  pulse.connect(pulseDepth);
  pulseDepth.connect(rGain.gain);

  const stopAt = now + dur + 0.08;
  rumble.start(now);
  hiss.start(now);
  sub.start(now);
  strain.start(now);
  pulse.start(now);
  rumble.stop(stopAt);
  hiss.stop(stopAt);
  sub.stop(stopAt);
  strain.stop(stopAt);
  pulse.stop(stopAt);

  signalFinalChargeCtl = { master, nodes: [rumble, hiss, sub, strain, pulse] };
}

function sfxSignalExplosion() {
  if (!audioUnlocked || !audioCtx) return;
  stopSignalFinalCharge(0.07);
  const t0 = audioCtx.currentTime;
  const total = framesToSeconds(BOSS_EXPLOSION_DURATION);
  const burstAt = total * 0.12;
  const coverDur = total * 0.45;
  const holdDur = total * 0.78;

  playNoiseBurst({ duration: 0.1, filterFreq: 7500, filterType: 'highpass', volume: 0.78, when: t0 });
  playNoiseBurst({ duration: 0.09, filterFreq: 4800, filterType: 'highpass', volume: 0.62, when: t0 + 0.05 });
  playNoiseBurst({ duration: 0.1, filterFreq: 3200, filterType: 'highpass', volume: 0.48, when: t0 + 0.11 });
  playNoiseBurst({ duration: 0.42, filterFreq: 1400, filterEnd: 120, filterType: 'lowpass', filterQ: 0.3, volume: 0.92, when: t0 });
  playNoiseBurst({ duration: 0.28, filterFreq: 2200, filterEnd: 220, filterType: 'bandpass', filterQ: 0.55, volume: 0.62, when: t0 });
  playNoiseBurst({ duration: 0.18, filterFreq: 900, filterEnd: 80, filterType: 'lowpass', volume: 0.7, when: t0 + 0.16 });

  playSynth({ type: 'sine', freq: 72, freqEnd: 20, duration: 1.8, attack: 0.001, decay: 0.16, sustain: 0.55, release: 0.55, volume: 0.78, filterFreq: 180, delaySend: 0, when: t0 });
  playSynth({ type: 'sine', freq: 42, freqEnd: 20, duration: 2.2, attack: 0.002, decay: 0.2, sustain: 0.52, release: 0.65, volume: 0.6, filterFreq: 110, delaySend: 0, when: t0 });
  playSynth({ type: 'sine', freq: 28, freqEnd: 20, duration: 2.6, attack: 0.004, decay: 0.22, sustain: 0.5, release: 0.7, volume: 0.42, filterFreq: 80, delaySend: 0, when: t0 });
  playSynth({ type: 'sawtooth', freq: 130, freqEnd: 28, duration: 0.7, attack: 0.002, decay: 0.12, sustain: 0.35, release: 0.22, volume: 0.28, filterType: 'lowpass', filterFreq: 780, filterEnd: 90, delaySend: 0.08, when: t0 });

  playEntranceRumble({ when: t0, duration: coverDur, volStart: 0.95, volEnd: 0.28, filtStart: 1800, filtEnd: 70 });
  playEntranceRumble({ when: t0 + 0.08, duration: coverDur, volStart: 0.55, volEnd: 0.12, filtStart: 700, filtEnd: 55 });
  playNoiseBurst({ duration: coverDur * 0.7, filterFreq: 280, filterEnd: 3400, filterType: 'lowpass', volume: 0.52, delaySend: 0.22, when: t0 + 0.03 });

  playNoiseBurst({ duration: 0.16, filterFreq: 6000, filterType: 'highpass', volume: 0.55, when: t0 + burstAt });
  playNoiseBurst({ duration: 0.35, filterFreq: 1000, filterEnd: 140, filterType: 'lowpass', volume: 0.7, when: t0 + burstAt });
  playSynth({ type: 'sine', freq: 58, freqEnd: 20, duration: 1.3, attack: 0.003, decay: 0.16, sustain: 0.45, release: 0.4, volume: 0.5, filterFreq: 140, delaySend: 0.06, when: t0 + burstAt });
  playNoiseBurst({ duration: Math.max(0.7, coverDur - burstAt), filterFreq: 3600, filterEnd: 280, filterType: 'highpass', volume: 0.4, delaySend: 0.24, when: t0 + burstAt });

  playNoiseBurst({ duration: 0.28, filterFreq: 700, filterEnd: 90, filterType: 'lowpass', volume: 0.48, delaySend: 0.2, when: t0 + 0.38 });
  playSynth({ type: 'sine', freq: 36, freqEnd: 20, duration: 1.1, attack: 0.01, decay: 0.2, sustain: 0.4, release: 0.4, volume: 0.34, filterFreq: 100, delaySend: 0.1, when: t0 + 0.38 });

  playEntranceRumble({ when: t0 + coverDur * 0.4, duration: Math.max(0.8, holdDur - coverDur * 0.4), volStart: 0.48, volEnd: 0.04, filtStart: 360, filtEnd: 55 });
  playSynth({ type: 'sine', freq: 30, freqEnd: 20, duration: holdDur, attack: 0.06, decay: 0.3, sustain: 0.4, release: 0.55, volume: 0.28, filterFreq: 80, delaySend: 0, when: t0 + coverDur * 0.25 });
  playNoiseBurst({ duration: 0.9, filterFreq: 1800, filterEnd: 220, filterType: 'highpass', volume: 0.18, delaySend: 0.28, when: t0 + coverDur * 0.55 });
}

function sfxSignalSilenced() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const dur = framesToSeconds(POST_BOSS_DOWNTIME_DURATION);
  playSynth({
    type: 'sine', freq: 740, freqEnd: 180, duration: dur * 0.85,
    attack: 0.04, decay: 0.35, sustain: 0.22, release: 0.45,
    volume: 0.09, filterFreq: 2400, delaySend: 0.45, when: t0,
  });
  playSynth({
    type: 'sine', freq: 1480, freqEnd: 420, duration: dur * 0.45,
    attack: 0.02, decay: 0.18, sustain: 0.12, release: 0.35,
    volume: 0.04, filterFreq: 4200, delaySend: 0.5, when: t0,
  });
  playSynth({
    type: 'sine', freq: 52, freqEnd: 28, duration: dur,
    attack: 0.12, decay: 0.4, sustain: 0.28, release: 0.5,
    volume: 0.1, filterFreq: 120, delaySend: 0.08, when: t0,
  });
  playNoiseBurst({
    duration: dur * 0.9, filterFreq: 280, filterEnd: 1600, filterType: 'lowpass',
    volume: 0.08, delaySend: 0.22, when: t0 + 0.06,
  });
  playSynth({
    type: 'sine', freq: 220, freqEnd: 70, duration: dur * 0.7,
    attack: 0.2, decay: 0.3, sustain: 0.2, release: 0.4,
    volume: 0.06, filterFreq: 800, delaySend: 0.35, when: t0 + dur * 0.15,
  });
}

function sfxStart() {
  playNoiseBurst({ duration: 0.22, filterFreq: 280, filterEnd: 2200, filterType: 'lowpass', filterQ: 0.6, volume: 0.28 });
  playSynth({ type: 'sawtooth', freq: 70, freqEnd: 160, duration: 0.2, attack: 0.01, decay: 0.05, sustain: 0.45, release: 0.08, volume: 0.16, filterType: 'lowpass', filterFreq: 500, filterEnd: 1400, delaySend: 0.08 });
}

function sfxWarp() {
  playNoiseBurst({ duration: 0.38, filterFreq: 420, filterEnd: 3800, filterType: 'lowpass', filterQ: 0.55, volume: 0.32 });
  playSynth({ type: 'sine', freq: 90, freqEnd: 520, duration: 0.32, attack: 0.02, decay: 0.08, sustain: 0.5, release: 0.1, volume: 0.18, filterFreq: 1800, delaySend: 0.2 });
}

function sfxRespawn() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const id = currentRespawnId();
  if (id === 'systemsOn') {
    playSynth({
      type: 'sine', freq: 70, freqEnd: 180, duration: 0.28,
      attack: 0.04, decay: 0.08, sustain: 0.35, release: 0.12,
      volume: 0.14, filterFreq: 500, filterEnd: 1200, delaySend: 0.1, when: t0,
    });
    playSynth({
      type: 'triangle', freq: 523.25, duration: 0.07,
      attack: 0.003, decay: 0.02, sustain: 0.45, release: 0.03,
      volume: 0.2, filterFreq: 2200, delaySend: 0.12, when: t0 + 0.22,
    });
    playSynth({
      type: 'triangle', freq: 659.25, duration: 0.07,
      attack: 0.003, decay: 0.02, sustain: 0.45, release: 0.03,
      volume: 0.2, filterFreq: 2400, delaySend: 0.12, when: t0 + 0.30,
    });
    playSynth({
      type: 'triangle', freq: 783.99, duration: 0.14,
      attack: 0.004, decay: 0.03, sustain: 0.4, release: 0.08,
      volume: 0.22, filterFreq: 2800, delaySend: 0.16, when: t0 + 0.38,
    });
    return;
  }
  if (id === 'rematerialize') {
    playNoiseBurst({
      duration: 0.22, filterFreq: 600, filterEnd: 4800, filterType: 'highpass', filterQ: 0.7,
      volume: 0.14, delaySend: 0.2, when: t0,
    });
    playSynth({
      type: 'sine', freq: 220, freqEnd: 1320, duration: 0.28,
      attack: 0.03, decay: 0.06, sustain: 0.3, release: 0.1,
      volume: 0.14, filterFreq: 3200, delaySend: 0.24, when: t0,
    });
    playSynth({
      type: 'triangle', freq: 1760, duration: 0.1,
      attack: 0.004, decay: 0.03, sustain: 0.25, release: 0.08,
      volume: 0.12, filterFreq: 5000, delaySend: 0.28, when: t0 + 0.2,
    });
    return;
  }
  if (id === 'ignition') {
    playNoiseBurst({
      duration: 0.2, filterFreq: 280, filterEnd: 1600, filterType: 'lowpass', filterQ: 0.6,
      volume: 0.16, delaySend: 0.08, when: t0,
    });
    playSynth({
      type: 'sawtooth', freq: 80, freqEnd: 240, duration: 0.22,
      attack: 0.02, decay: 0.06, sustain: 0.35, release: 0.1,
      volume: 0.12, filterType: 'lowpass', filterFreq: 400, filterEnd: 1400, delaySend: 0.1, when: t0,
    });
    playSynth({
      type: 'triangle', freq: 988, duration: 0.12,
      attack: 0.004, decay: 0.03, sustain: 0.4, release: 0.06,
      volume: 0.18, filterFreq: 3000, delaySend: 0.16, when: t0 + 0.2,
    });
    return;
  }
  if (id === 'shieldUp') {
    playSynth({
      type: 'sine', freq: 196, freqEnd: 392, duration: 0.2,
      attack: 0.02, decay: 0.05, sustain: 0.4, release: 0.1,
      volume: 0.16, filterFreq: 900, delaySend: 0.18, when: t0,
    });
    playSynth({
      type: 'sine', freq: 294, freqEnd: 587, duration: 0.22,
      attack: 0.025, decay: 0.05, sustain: 0.35, release: 0.12,
      volume: 0.14, filterFreq: 1400, delaySend: 0.22, when: t0 + 0.06,
    });
    playSynth({
      type: 'triangle', freq: 1175, duration: 0.14,
      attack: 0.006, decay: 0.04, sustain: 0.3, release: 0.1,
      volume: 0.16, filterFreq: 3600, delaySend: 0.24, when: t0 + 0.22,
    });
    return;
  }
  if (id === 'warpIn') {
    playNoiseBurst({
      duration: 0.26, filterFreq: 380, filterEnd: 3200, filterType: 'lowpass', filterQ: 0.5,
      volume: 0.18, delaySend: 0.16, when: t0,
    });
    playSynth({
      type: 'sine', freq: 90, freqEnd: 640, duration: 0.28,
      attack: 0.02, decay: 0.07, sustain: 0.4, release: 0.1,
      volume: 0.16, filterFreq: 2000, delaySend: 0.2, when: t0,
    });
    return;
  }
  if (id === 'readyBeep') {
    playSynth({
      type: 'triangle', freq: 1046.5, duration: 0.06,
      attack: 0.002, decay: 0.015, sustain: 0.5, release: 0.03,
      volume: 0.24, filterFreq: 3200, delaySend: 0.1, when: t0,
    });
    playSynth({
      type: 'triangle', freq: 1318.5, duration: 0.06,
      attack: 0.002, decay: 0.015, sustain: 0.5, release: 0.03,
      volume: 0.24, filterFreq: 3600, delaySend: 0.1, when: t0 + 0.08,
    });
    playSynth({
      type: 'sine', freq: 1568, duration: 0.16,
      attack: 0.004, decay: 0.04, sustain: 0.35, release: 0.08,
      volume: 0.18, filterFreq: 4200, delaySend: 0.18, when: t0 + 0.16,
    });
    return;
  }
  if (id === 'reboot') {
    const hops = [196, 880, 262, 1046, 330, 1318];
    hops.forEach((f, i) => {
      playSynth({
        type: 'square', freq: f, duration: 0.04,
        attack: 0.001, decay: 0.01, sustain: 0.35, release: 0.02,
        volume: 0.12, filterFreq: 2800, delaySend: 0.08, when: t0 + i * 0.032,
      });
    });
    playSynth({
      type: 'triangle', freq: 784, duration: 0.18,
      attack: 0.006, decay: 0.04, sustain: 0.4, release: 0.1,
      volume: 0.2, filterFreq: 2600, delaySend: 0.16, when: t0 + 0.22,
    });
    return;
  }
  playNoiseBurst({
    duration: 0.09, filterFreq: 1400, filterEnd: 5200, filterType: 'highpass', filterQ: 0.9,
    volume: 0.12, delaySend: 0.14, when: t0,
  });
  sfxArp([392.00, 523.25, 659.25, 783.99, 1046.50], 0.25, 0.4, 0.05);
  playSynth({
    type: 'triangle', freq: 1318.51, freqEnd: 1567.98, duration: 0.1,
    attack: 0.004, decay: 0.03, sustain: 0.35, release: 0.08,
    volume: 0.14, filterFreq: 4200, delaySend: 0.22, when: t0 + 0.24,
  });
}

const RESPAWN_OPTIONS = [
  { id: 'spawnChip', name: 'SPAWN CHIP' },
  { id: 'systemsOn', name: 'SYSTEMS ON' },
  { id: 'rematerialize', name: 'REMATERIALIZE' },
  { id: 'ignition', name: 'IGNITION' },
  { id: 'shieldUp', name: 'SHIELD UP' },
  { id: 'warpIn', name: 'WARP IN' },
  { id: 'readyBeep', name: 'READY BEEP' },
  { id: 'reboot', name: 'REBOOT' },
];

function currentRespawnId() {
  const id = audioSettings.respawn;
  return RESPAWN_OPTIONS.some((o) => o.id === id) ? id : 'systemsOn';
}

function currentRespawnLabel() {
  return RESPAWN_OPTIONS.find((o) => o.id === currentRespawnId()).name;
}

function cycleRespawn(dir) {
  const ids = RESPAWN_OPTIONS.map((o) => o.id);
  const i = Math.max(0, ids.indexOf(currentRespawnId()));
  audioSettings.respawn = ids[(i + dir + ids.length) % ids.length];
  saveAudioSettings();
  refreshSfxRespawnUi();
  sfxRespawn();
}

function sfxLifeLost() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  const id = currentLifeLostId();
  if (id === 'powerDown') {
    playNoiseBurst({
      duration: 0.45, filterFreq: 2400, filterEnd: 180, filterType: 'lowpass', filterQ: 0.5,
      volume: 0.16, delaySend: 0.12, when: t0,
    });
    playSynth({
      type: 'sawtooth', freq: 420, freqEnd: 55, duration: 0.55,
      attack: 0.01, decay: 0.12, sustain: 0.28, release: 0.22,
      volume: 0.16, filterType: 'lowpass', filterFreq: 1800, filterEnd: 220, delaySend: 0.14, when: t0,
    });
    playSynth({
      type: 'sine', freq: 840, freqEnd: 90, duration: 0.5,
      attack: 0.012, decay: 0.14, sustain: 0.2, release: 0.2,
      volume: 0.12, filterFreq: 2200, delaySend: 0.18, when: t0,
    });
    return;
  }
  if (id === 'signalLost') {
    playNoiseBurst({
      duration: 0.5, filterFreq: 1800, filterEnd: 700, filterType: 'bandpass', filterQ: 2.4,
      volume: 0.2, delaySend: 0.16, when: t0,
    });
    playSynth({
      type: 'sine', freq: 1480, freqEnd: 180, duration: 0.52,
      attack: 0.008, decay: 0.1, sustain: 0.25, release: 0.2,
      volume: 0.2, filterFreq: 2600, delaySend: 0.22, when: t0,
    });
    playSynth({
      type: 'triangle', freq: 740, freqEnd: 110, duration: 0.4,
      attack: 0.02, decay: 0.12, sustain: 0.15, release: 0.18,
      volume: 0.1, filterFreq: 1600, delaySend: 0.2, when: t0 + 0.08,
    });
    return;
  }
  if (id === 'heartStop') {
    playSynth({
      type: 'sine', freq: 220, duration: 0.12,
      attack: 0.004, decay: 0.04, sustain: 0.35, release: 0.06,
      volume: 0.28, filterFreq: 700, delaySend: 0.08, when: t0,
    });
    playSynth({
      type: 'sine', freq: 165, duration: 0.16,
      attack: 0.006, decay: 0.05, sustain: 0.3, release: 0.08,
      volume: 0.24, filterFreq: 550, delaySend: 0.1, when: t0 + 0.16,
    });
    playSynth({
      type: 'sine', freq: 110, freqEnd: 48, duration: 0.55,
      attack: 0.02, decay: 0.16, sustain: 0.18, release: 0.28,
      volume: 0.16, filterFreq: 400, delaySend: 0.2, when: t0 + 0.36,
    });
    return;
  }
  if (id === 'warpFail') {
    playNoiseBurst({
      duration: 0.28, filterFreq: 4200, filterEnd: 500, filterType: 'lowpass', filterQ: 0.55,
      volume: 0.18, delaySend: 0.18, when: t0,
    });
    playSynth({
      type: 'sine', freq: 720, freqEnd: 90, duration: 0.32,
      attack: 0.01, decay: 0.08, sustain: 0.35, release: 0.12,
      volume: 0.18, filterFreq: 2400, delaySend: 0.22, when: t0,
    });
    sfxArp([784, 659, 523, 392], 0.125, 0.32, 0.055);
    return;
  }
  if (id === 'glitchOut') {
    const hops = [1568, 392, 1175, 262, 880, 196, 698];
    hops.forEach((f, i) => {
      playSynth({
        type: 'square', freq: f, duration: 0.045,
        attack: 0.001, decay: 0.01, sustain: 0.4, release: 0.02,
        volume: 0.14, filterFreq: 3200, delaySend: 0.08, when: t0 + i * 0.038,
      });
    });
    playNoiseBurst({
      duration: 0.08, filterFreq: 3600, filterType: 'highpass',
      volume: 0.12, delaySend: 0.1, when: t0 + 0.28,
    });
    return;
  }
  if (id === 'alarmCut') {
    playSynth({
      type: 'triangle', freq: 880, duration: 0.09,
      attack: 0.003, decay: 0.02, sustain: 0.55, release: 0.04,
      volume: 0.26, filterFreq: 2400, delaySend: 0.12, when: t0,
    });
    playSynth({
      type: 'triangle', freq: 880, duration: 0.09,
      attack: 0.003, decay: 0.02, sustain: 0.55, release: 0.04,
      volume: 0.24, filterFreq: 2400, delaySend: 0.12, when: t0 + 0.14,
    });
    playSynth({
      type: 'triangle', freq: 880, freqEnd: 220, duration: 0.42,
      attack: 0.004, decay: 0.08, sustain: 0.3, release: 0.18,
      volume: 0.22, filterFreq: 2000, delaySend: 0.18, when: t0 + 0.28,
    });
    return;
  }
  playNoiseBurst({
    duration: 0.05, filterFreq: 4200, filterType: 'highpass',
    volume: 0.1, delaySend: 0.12, when: t0,
  });
  sfxArp([1046.50, 783.99, 659.25, 523.25, 392.00], 0.125, 0.4, 0.07);
  playSynth({
    type: 'triangle', freq: 261.63, freqEnd: 196.00, duration: 0.24,
    attack: 0.008, decay: 0.06, sustain: 0.28, release: 0.14,
    volume: 0.16, filterFreq: 1600, delaySend: 0.2, when: t0 + 0.34,
  });
}

const LIFE_LOST_OPTIONS = [
  { id: 'lifeChip', name: 'LIFE CHIP' },
  { id: 'powerDown', name: 'POWER DOWN' },
  { id: 'signalLost', name: 'SIGNAL LOST' },
  { id: 'heartStop', name: 'HEART STOP' },
  { id: 'warpFail', name: 'WARP FAIL' },
  { id: 'glitchOut', name: 'GLITCH OUT' },
  { id: 'alarmCut', name: 'ALARM CUT' },
];

function currentLifeLostId() {
  const id = audioSettings.lifeLost;
  return LIFE_LOST_OPTIONS.some((o) => o.id === id) ? id : 'lifeChip';
}

function currentLifeLostLabel() {
  return LIFE_LOST_OPTIONS.find((o) => o.id === currentLifeLostId()).name;
}

function cycleLifeLost(dir) {
  const ids = LIFE_LOST_OPTIONS.map((o) => o.id);
  const i = Math.max(0, ids.indexOf(currentLifeLostId()));
  audioSettings.lifeLost = ids[(i + dir + ids.length) % ids.length];
  saveAudioSettings();
  refreshSfxLifeLostUi();
  sfxLifeLost();
}

function sfxContinueUsed() {
  if (!audioUnlocked || !audioCtx) return;
  playNoiseBurst({ duration: 0.14, filterFreq: 600, filterEnd: 2400, filterType: 'lowpass', volume: 0.22 });
  playSynth({ type: 'sawtooth', freq: 160, freqEnd: 480, duration: 0.16, attack: 0.006, decay: 0.04, sustain: 0.45, release: 0.06, volume: 0.14, filterType: 'lowpass', filterFreq: 900, filterEnd: 2200, delaySend: 0.12 });
  playSynth({ type: 'sine', freq: 880, freqEnd: 1320, duration: 0.1, attack: 0.004, decay: 0.03, sustain: 0.35, release: 0.05, volume: 0.12, filterFreq: 2400, delaySend: 0.16, when: audioCtx.currentTime + 0.08 });
}

function sfxNewBest() {
  playNoiseBurst({ duration: 0.1, filterFreq: 2800, filterType: 'highpass', volume: 0.16 });
  playSynth({ type: 'sine', freq: 740, freqEnd: 1180, duration: 0.14, attack: 0.004, decay: 0.04, sustain: 0.4, release: 0.06, volume: 0.18, filterFreq: 2600, delaySend: 0.2 });
}

function sfxOverdriveUnlock() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({
    duration: 0.16, filterFreq: 3600, filterEnd: 1100, filterType: 'highpass', filterQ: 1.1,
    volume: 0.12, delaySend: 0.28, when: t0,
  });
  playSynth({
    type: 'sine', freq: 146.83, freqEnd: 196, duration: 0.28,
    attack: 0.01, decay: 0.08, sustain: 0.42, release: 0.16,
    volume: 0.18, filterFreq: 420, delaySend: 0.14, when: t0,
  });
  const notes = [
    { f: 523.25, t: 0.00, d: 0.12, v: 0.17 },
    { f: 659.25, t: 0.10, d: 0.12, v: 0.18 },
    { f: 783.99, t: 0.20, d: 0.13, v: 0.19 },
    { f: 1046.50, t: 0.32, d: 0.18, v: 0.21 },
    { f: 1318.51, t: 0.48, d: 0.32, v: 0.17 },
  ];
  for (const n of notes) {
    playSynth({
      type: 'triangle', freq: n.f, duration: n.d,
      attack: 0.005, decay: 0.04, sustain: 0.55, release: 0.14,
      volume: n.v, filterFreq: 3000, delaySend: 0.34, when: t0 + n.t,
    });
    playSynth({
      type: 'sine', freq: n.f * 2, duration: n.d * 0.65,
      attack: 0.008, decay: 0.045, sustain: 0.22, release: 0.12,
      volume: n.v * 0.26, filterFreq: 4500, delaySend: 0.42, when: t0 + n.t,
    });
  }
  playSynth({
    type: 'triangle', freq: 523.25, duration: 0.62,
    attack: 0.02, decay: 0.12, sustain: 0.34, release: 0.38,
    volume: 0.11, filterFreq: 1900, delaySend: 0.3, when: t0 + 0.48,
  });
  playSynth({
    type: 'sine', freq: 659.25, duration: 0.66,
    attack: 0.03, decay: 0.14, sustain: 0.3, release: 0.4,
    volume: 0.09, filterFreq: 2200, delaySend: 0.32, when: t0 + 0.48,
  });
  playSynth({
    type: 'sine', freq: 2093, freqEnd: 2637, duration: 0.22,
    attack: 0.004, decay: 0.05, sustain: 0.18, release: 0.22,
    volume: 0.09, filterFreq: 5400, delaySend: 0.48, when: t0 + 0.58,
  });
  playSynth({
    type: 'sine', freq: 3136, duration: 0.4,
    attack: 0.01, decay: 0.1, sustain: 0.12, release: 0.32,
    volume: 0.055, filterFreq: 6200, delaySend: 0.52, when: t0 + 0.66,
  });
}

function sfxVictory() {
  playBgm('victory');
}

function sfxGameOver() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playNoiseBurst({ duration: 0.28, filterFreq: 420, filterEnd: 90, filterType: 'lowpass', volume: 0.18, when: t0 });
  const notes = [
    { f: 392.00, t: 0.00, d: 0.3 },
    { f: 329.63, t: 0.24, d: 0.34 },
    { f: 261.63, t: 0.52, d: 0.4 },
    { f: 196.00, t: 0.88, d: 0.85 },
  ];
  for (const n of notes) {
    playSynth({
      type: 'sine', freq: n.f, duration: n.d,
      attack: 0.018, decay: 0.08, sustain: 0.42, release: 0.24,
      volume: 0.24, filterFreq: 1900, delaySend: 0.38, when: t0 + n.t,
    });
    playSynth({
      type: 'triangle', freq: n.f * 2, duration: n.d * 0.72,
      attack: 0.03, decay: 0.1, sustain: 0.22, release: 0.2,
      volume: 0.07, filterFreq: 2600, delaySend: 0.42, when: t0 + n.t,
    });
  }
  playSynth({
    type: 'sine', freq: 98, freqEnd: 49, duration: 1.55,
    attack: 0.08, decay: 0.28, sustain: 0.48, release: 0.55,
    volume: 0.3, filterFreq: 180, delaySend: 0.14, when: t0 + 0.72,
  });
  playSynth({
    type: 'sine', freq: 164.81, freqEnd: 110, duration: 1.7,
    attack: 0.16, decay: 0.4, sustain: 0.32, release: 0.6,
    volume: 0.11, filterFreq: 720, delaySend: 0.48, when: t0 + 0.48,
  });
}

function sfxPause() {
  playNoiseBurst({ duration: 0.04, filterFreq: 1400, filterType: 'bandpass', filterQ: 1.8, volume: 0.16 });
  playSynth({ type: 'sine', freq: 210, freqEnd: 140, duration: 0.1, attack: 0.004, decay: 0.03, sustain: 0.3, release: 0.05, volume: 0.14, filterFreq: 700, delaySend: 0 });
}

let liftSource = null;
let liftGainNode = null;
function startLiftSound() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || liftSource) return;
  const now = audioCtx.currentTime;
  liftSource = audioCtx.createOscillator();
  liftSource.type = 'triangle';
  liftSource.frequency.value = 92;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = 700;
  liftGainNode = audioCtx.createGain();
  liftGainNode.gain.setValueAtTime(0, now);
  liftGainNode.gain.linearRampToValueAtTime(0.06, now + 0.05);
  liftSource.connect(filter);
  filter.connect(liftGainNode);
  liftGainNode.connect(sfxGain);
  liftSource.start(now);
}
function stopLiftSound() {
  if (!liftSource || !audioCtx) return;
  const now = audioCtx.currentTime;
  liftGainNode.gain.cancelScheduledValues(now);
  liftGainNode.gain.setValueAtTime(liftGainNode.gain.value, now);
  liftGainNode.gain.linearRampToValueAtTime(0, now + 0.07);
  liftSource.stop(now + 0.09);
  liftSource = null;
  liftGainNode = null;
}

// Easy-mode "death window": invincibility blink has ended but a new free
// pass isn't available yet (the orange ship glow). Hits here cost a life.
let glowDangerNodes = null;
let glowDangerPreviewUrgency = -1;
let glowDangerPreviewTimer = null;

function isEasyGlowDangerActive() {
  if (state !== 'playing' || ghostMode) return false;
  const t = nowMs();
  return t >= invincibilityEndTime && t < freeHitCooldownEndTime;
}

function createGlowDangerNoise() {
  const noiseBuf = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
  const noiseData = noiseBuf.getChannelData(0);
  for (let i = 0; i < noiseData.length; i++) noiseData[i] = Math.random() * 2 - 1;
  const noise = audioCtx.createBufferSource();
  noise.buffer = noiseBuf;
  noise.loop = true;
  return noise;
}

function previewGlowDangerSound() {
  if (glowDangerPreviewTimer) {
    clearTimeout(glowDangerPreviewTimer);
    glowDangerPreviewTimer = null;
  }
  glowDangerPreviewUrgency = 0.82;
  stopGlowDangerSound();
  startGlowDangerSound();
  updateGlowDangerUrgency();
  glowDangerPreviewTimer = setTimeout(() => {
    glowDangerPreviewTimer = null;
    glowDangerPreviewUrgency = -1;
    if (isGlowDangerTesterLoop()) return;
    if (!isEasyGlowDangerActive()) stopGlowDangerSound();
    else updateGlowDangerUrgency();
  }, 2200);
}

function startGlowDangerSound() {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || glowDangerNodes) return;
  const now = audioCtx.currentTime;
  const kind = currentGlowDangerId();
  const out = audioCtx.createGain();
  out.gain.setValueAtTime(0, now);
  out.gain.linearRampToValueAtTime(kind === 'overheat' ? 1 : 0.9, now + 0.06);
  out.connect(sfxGain);

  if (kind === 'overheat') {
    const hiss = createGlowDangerNoise();
    const hissFilt = audioCtx.createBiquadFilter();
    hissFilt.type = 'highpass';
    hissFilt.frequency.value = 2100;
    hissFilt.Q.value = 0.65;
    const hissGain = audioCtx.createGain();
    hissGain.gain.value = 0.14;
    hiss.connect(hissFilt);
    hissFilt.connect(hissGain);
    hissGain.connect(out);

    const vent = createGlowDangerNoise();
    const ventFilt = audioCtx.createBiquadFilter();
    ventFilt.type = 'bandpass';
    ventFilt.frequency.value = 420;
    ventFilt.Q.value = 1.4;
    const ventGain = audioCtx.createGain();
    ventGain.gain.value = 0.11;
    vent.connect(ventFilt);
    ventFilt.connect(ventGain);
    ventGain.connect(out);

    const furnace = audioCtx.createOscillator();
    furnace.type = 'sawtooth';
    furnace.frequency.value = 46;
    const fFilt = audioCtx.createBiquadFilter();
    fFilt.type = 'lowpass';
    fFilt.frequency.value = 180;
    fFilt.Q.value = 0.7;
    const fGain = audioCtx.createGain();
    fGain.gain.value = 0.2;
    furnace.connect(fFilt);
    fFilt.connect(fGain);
    fGain.connect(out);

    const heat = audioCtx.createOscillator();
    heat.type = 'triangle';
    heat.frequency.value = 168;
    const hFilt = audioCtx.createBiquadFilter();
    hFilt.type = 'lowpass';
    hFilt.frequency.value = 900;
    const hGain = audioCtx.createGain();
    hGain.gain.value = 0.035;
    heat.connect(hFilt);
    hFilt.connect(hGain);
    hGain.connect(out);
    const heatLfo = audioCtx.createOscillator();
    heatLfo.type = 'sine';
    heatLfo.frequency.value = 0.85;
    const heatDepth = audioCtx.createGain();
    heatDepth.gain.value = 38;
    heatLfo.connect(heatDepth);
    heatDepth.connect(heat.frequency);

    const tickNoise = createGlowDangerNoise();
    const tickFilt = audioCtx.createBiquadFilter();
    tickFilt.type = 'bandpass';
    tickFilt.frequency.value = 4800;
    tickFilt.Q.value = 6;
    const tickGain = audioCtx.createGain();
    tickGain.gain.value = 0.07;
    tickNoise.connect(tickFilt);
    tickFilt.connect(tickGain);
    tickGain.connect(out);
    const tickLfo = audioCtx.createOscillator();
    tickLfo.type = 'square';
    tickLfo.frequency.value = 7.5;
    const tickDepth = audioCtx.createGain();
    tickDepth.gain.value = 0.07;
    tickLfo.connect(tickDepth);
    tickDepth.connect(tickGain.gain);

    hiss.start(now);
    vent.start(now);
    furnace.start(now);
    heat.start(now);
    heatLfo.start(now);
    tickNoise.start(now);
    tickLfo.start(now);

    glowDangerNodes = {
      kind,
      out,
      hissFilt,
      hissGain,
      ventFilt,
      ventGain,
      furnace,
      fGain,
      fFilt,
      tickLfo,
      tickGain,
      sources: [hiss, vent, furnace, heat, heatLfo, tickNoise, tickLfo],
    };
    return;
  }

  if (kind === 'klaxon') {
    const a = audioCtx.createOscillator();
    a.type = 'sawtooth';
    a.frequency.value = 494;
    const b = audioCtx.createOscillator();
    b.type = 'sawtooth';
    b.frequency.value = 370;
    const kFilt = audioCtx.createBiquadFilter();
    kFilt.type = 'lowpass';
    kFilt.frequency.value = 1600;
    kFilt.Q.value = 1.2;
    const aGain = audioCtx.createGain();
    aGain.gain.value = 0.055;
    const bGain = audioCtx.createGain();
    bGain.gain.value = 0.055;
    a.connect(aGain);
    b.connect(bGain);
    aGain.connect(kFilt);
    bGain.connect(kFilt);
    kFilt.connect(out);
    const lfo = audioCtx.createOscillator();
    lfo.type = 'square';
    lfo.frequency.value = 2.15;
    const aDepth = audioCtx.createGain();
    aDepth.gain.value = 0.055;
    const bDepth = audioCtx.createGain();
    bDepth.gain.value = -0.055;
    lfo.connect(aDepth);
    aDepth.connect(aGain.gain);
    lfo.connect(bDepth);
    bDepth.connect(bGain.gain);

    const rumble = audioCtx.createOscillator();
    rumble.type = 'sine';
    rumble.frequency.value = 58;
    const rGain = audioCtx.createGain();
    rGain.gain.value = 0.12;
    rumble.connect(rGain);
    rGain.connect(out);

    a.start(now);
    b.start(now);
    lfo.start(now);
    rumble.start(now);

    glowDangerNodes = {
      kind,
      out,
      lfo,
      rumble,
      rGain,
      kFilt,
      sources: [a, b, lfo, rumble],
    };
    return;
  }

  if (kind === 'meltdown') {
    const hiss = createGlowDangerNoise();
    const hissFilt = audioCtx.createBiquadFilter();
    hissFilt.type = 'highpass';
    hissFilt.frequency.value = 1600;
    const hissGain = audioCtx.createGain();
    hissGain.gain.value = 0.1;
    hiss.connect(hissFilt);
    hissFilt.connect(hissGain);
    hissGain.connect(out);

    const siren = audioCtx.createOscillator();
    siren.type = 'sawtooth';
    siren.frequency.value = 210;
    const sFilt = audioCtx.createBiquadFilter();
    sFilt.type = 'lowpass';
    sFilt.frequency.value = 880;
    const sGain = audioCtx.createGain();
    sGain.gain.value = 0.04;
    siren.connect(sFilt);
    sFilt.connect(sGain);
    sGain.connect(out);
    const whoop = audioCtx.createOscillator();
    whoop.type = 'triangle';
    whoop.frequency.value = 1.6;
    const whoopDepth = audioCtx.createGain();
    whoopDepth.gain.value = 70;
    whoop.connect(whoopDepth);
    whoopDepth.connect(siren.frequency);

    const heart = audioCtx.createOscillator();
    heart.type = 'sine';
    heart.frequency.value = 62;
    const heartGain = audioCtx.createGain();
    heartGain.gain.value = 0.16;
    heart.connect(heartGain);
    heartGain.connect(out);
    const pulse = audioCtx.createOscillator();
    pulse.type = 'sine';
    pulse.frequency.value = 2.2;
    const pulseDepth = audioCtx.createGain();
    pulseDepth.gain.value = 0.14;
    pulse.connect(pulseDepth);
    pulseDepth.connect(heartGain.gain);

    hiss.start(now);
    siren.start(now);
    whoop.start(now);
    heart.start(now);
    pulse.start(now);

    glowDangerNodes = {
      kind,
      out,
      hissFilt,
      hissGain,
      whoop,
      pulse,
      heart,
      sources: [hiss, siren, whoop, heart, pulse],
    };
    return;
  }

  const noise = createGlowDangerNoise();
  const nFilt = audioCtx.createBiquadFilter();
  nFilt.type = 'bandpass';
  nFilt.frequency.value = 780;
  nFilt.Q.value = 1.1;
  const nGain = audioCtx.createGain();
  nGain.gain.value = 0.09;
  noise.connect(nFilt);
  nFilt.connect(nGain);
  nGain.connect(out);

  const rumble = audioCtx.createOscillator();
  rumble.type = 'sine';
  rumble.frequency.value = 52;
  const rGain = audioCtx.createGain();
  rGain.gain.value = 0.14;
  rumble.connect(rGain);
  rGain.connect(out);

  const siren = audioCtx.createOscillator();
  siren.type = 'sawtooth';
  siren.frequency.value = 156;
  const sFilt = audioCtx.createBiquadFilter();
  sFilt.type = 'lowpass';
  sFilt.frequency.value = 720;
  sFilt.Q.value = 0.8;
  const sGain = audioCtx.createGain();
  sGain.gain.value = 0.045;
  siren.connect(sFilt);
  sFilt.connect(sGain);
  sGain.connect(out);

  const whoop = audioCtx.createOscillator();
  whoop.type = 'triangle';
  whoop.frequency.value = 2.6;
  const whoopDepth = audioCtx.createGain();
  whoopDepth.gain.value = 48;
  whoop.connect(whoopDepth);
  whoopDepth.connect(siren.frequency);

  const pulse = audioCtx.createOscillator();
  pulse.type = 'sine';
  pulse.frequency.value = 3.4;
  const pulseDepth = audioCtx.createGain();
  pulseDepth.gain.value = 0.05;
  pulse.connect(pulseDepth);
  pulseDepth.connect(sGain.gain);
  const nPulse = audioCtx.createGain();
  nPulse.gain.value = 0.05;
  pulse.connect(nPulse);
  nPulse.connect(nGain.gain);

  noise.start(now);
  rumble.start(now);
  siren.start(now);
  whoop.start(now);
  pulse.start(now);

  glowDangerNodes = {
    kind: 'siren',
    out,
    pulse,
    whoop,
    sources: [noise, rumble, siren, whoop, pulse],
  };
}

function stopGlowDangerSound() {
  if (!glowDangerNodes) return;
  if (!audioCtx) {
    glowDangerNodes = null;
    return;
  }
  const now = audioCtx.currentTime;
  const { out, sources } = glowDangerNodes;
  out.gain.cancelScheduledValues(now);
  out.gain.setValueAtTime(out.gain.value, now);
  out.gain.linearRampToValueAtTime(0, now + 0.08);
  sources.forEach((node) => {
    try { node.stop(now + 0.1); } catch (e) { /* already stopped */ }
  });
  glowDangerNodes = null;
}

function glowDangerUrgencyValue() {
  if (glowDangerPreviewUrgency >= 0) return glowDangerPreviewUrgency;
  const remaining = Math.max(0, freeHitCooldownEndTime - nowMs());
  const windowMs = Math.max(1, FREE_HIT_COOLDOWN_MS - INVINCIBILITY_DURATION_MS);
  return 1 - Math.min(1, remaining / windowMs);
}

function updateGlowDangerUrgency() {
  if (!glowDangerNodes || !audioCtx) return;
  const urgency = glowDangerUrgencyValue();
  const t = audioCtx.currentTime;
  const kind = glowDangerNodes.kind;
  if (kind === 'overheat') {
    glowDangerNodes.hissFilt.frequency.setTargetAtTime(1800 + urgency * 2800, t, 0.06);
    glowDangerNodes.hissGain.gain.setTargetAtTime(0.12 + urgency * 0.2, t, 0.06);
    glowDangerNodes.ventFilt.frequency.setTargetAtTime(360 + urgency * 220, t, 0.08);
    glowDangerNodes.ventGain.gain.setTargetAtTime(0.09 + urgency * 0.12, t, 0.08);
    glowDangerNodes.furnace.frequency.setTargetAtTime(42 + urgency * 28, t, 0.08);
    glowDangerNodes.fFilt.frequency.setTargetAtTime(150 + urgency * 140, t, 0.08);
    glowDangerNodes.fGain.gain.setTargetAtTime(0.16 + urgency * 0.18, t, 0.08);
    glowDangerNodes.tickLfo.frequency.setTargetAtTime(5.5 + urgency * 16, t, 0.05);
    glowDangerNodes.tickGain.gain.setTargetAtTime(0.05 + urgency * 0.12, t, 0.05);
    return;
  }
  if (kind === 'klaxon') {
    glowDangerNodes.lfo.frequency.setTargetAtTime(1.85 + urgency * 3.4, t, 0.05);
    glowDangerNodes.rumble.frequency.setTargetAtTime(52 + urgency * 22, t, 0.08);
    glowDangerNodes.rGain.gain.setTargetAtTime(0.1 + urgency * 0.12, t, 0.08);
    glowDangerNodes.kFilt.frequency.setTargetAtTime(1400 + urgency * 900, t, 0.08);
    return;
  }
  if (kind === 'meltdown') {
    glowDangerNodes.whoop.frequency.setTargetAtTime(1.4 + urgency * 3.2, t, 0.05);
    glowDangerNodes.pulse.frequency.setTargetAtTime(2 + urgency * 4.4, t, 0.05);
    glowDangerNodes.heart.frequency.setTargetAtTime(55 + urgency * 28, t, 0.08);
    glowDangerNodes.hissFilt.frequency.setTargetAtTime(1400 + urgency * 2200, t, 0.08);
    glowDangerNodes.hissGain.gain.setTargetAtTime(0.08 + urgency * 0.16, t, 0.08);
    return;
  }
  glowDangerNodes.pulse.frequency.setTargetAtTime(3.2 + urgency * 5.2, t, 0.05);
  glowDangerNodes.whoop.frequency.setTargetAtTime(2.4 + urgency * 3.6, t, 0.05);
}

function syncGlowDangerSound() {
  if (isGlowDangerTesterLoop()) return;
  if (glowDangerPreviewUrgency >= 0) {
    updateGlowDangerUrgency();
    return;
  }
  if (isEasyGlowDangerActive()) {
    startGlowDangerSound();
    updateGlowDangerUrgency();
  } else {
    stopGlowDangerSound();
  }
}

// ---- BGM ----
// Space beds: long pads, distant sonar pings, almost no drums.
const BGM_PROFILES = {
  standard: {
    tempo: 68,
    leadPattern: [
      220.00, null, null, null, null, null, null, null,
      null, null, 329.63, null, null, null, null, null,
      246.94, null, null, null, null, null, 293.66, null,
      null, null, null, null, 440.00, null, null, null,
    ],
    bassPattern: [
      55.00, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
      41.20, null, null, null, null, null, null, null,
      null, null, null, null, 46.25, null, null, null,
    ],
    padChords: [
      [110.00, 164.81, 220.00], null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
      [82.41, 123.47, 164.81], null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
    ],
    kickSteps: [],
    snareSteps: [],
    hatSteps: [],
    kickVolume: 0,
  },
  boss: {
    tempo: 76,
    leadPattern: [
      146.83, null, null, null, null, null, 174.61, null,
      null, null, null, null, 196.00, null, null, null,
      130.81, null, null, null, null, null, 155.56, null,
      null, null, 185.00, null, null, null, 110.00, null,
    ],
    bassPattern: [
      36.71, null, null, null, 36.71, null, null, null,
      32.70, null, null, null, 32.70, null, null, null,
      29.14, null, null, null, 29.14, null, null, null,
      27.50, null, null, null, 32.70, null, 36.71, null,
    ],
    padChords: [
      [73.42, 87.31, 110.00], null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
      [65.41, 82.41, 98.00], null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
    ],
    kickSteps: [0, 16],
    snareSteps: [],
    hatSteps: [],
    kickVolume: 0.18,
  },
  menu: {
    tempo: 58,
    leadPattern: [
      329.63, null, null, null, null, null, null, null,
      null, null, null, null, 440.00, null, null, null,
      null, null, 277.18, null, null, null, null, null,
      369.99, null, null, null, null, null, 329.63, null,
    ],
    bassPattern: [
      55.00, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
      41.20, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
    ],
    padChords: [
      [110.00, 138.59, 164.81], null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
      [82.41, 110.00, 138.59], null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
    ],
    kickSteps: [],
    snareSteps: [],
    hatSteps: [],
    kickVolume: 0,
  },
  miniboss: {
    tempo: 70,
    leadPattern: [
      174.61, null, null, null, null, null, 196.00, null,
      null, null, 246.94, null, null, null, null, null,
      155.56, null, null, null, 185.00, null, null, null,
      null, null, 220.00, null, null, null, 130.81, null,
    ],
    bassPattern: [
      41.20, null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
      36.71, null, null, null, null, null, null, null,
      null, null, null, null, 32.70, null, null, null,
    ],
    padChords: [
      [82.41, 103.83, 123.47], null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
      [73.42, 92.50, 110.00], null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
    ],
    kickSteps: [0, 16],
    snareSteps: [],
    hatSteps: [],
    kickVolume: 0.14,
  },
  victory: {
    tempo: 96,
    leadVolume: 0.16,
    bassVolume: 0.3,
    padVolume: 0.09,
    leadPattern: [
      329.63, null, 392.00, null, 493.88, null, 392.00, null,
      523.25, null, null, 493.88, null, 392.00, null, 329.63,
      369.99, null, 440.00, null, 554.37, null, 440.00, null,
      659.25, null, 587.33, null, 493.88, null, 440.00, null,
    ],
    bassPattern: [
      82.41, null, null, null, 82.41, null, 110.00, null,
      82.41, null, null, null, 73.42, null, 82.41, null,
      65.41, null, null, null, 65.41, null, 82.41, null,
      55.00, null, 73.42, null, 82.41, null, 110.00, null,
    ],
    padChords: [
      [164.81, 220.00, 277.18], null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
      [164.81, 207.65, 246.94], null, null, null, null, null, null, null,
      null, null, null, null, null, null, null, null,
    ],
    kickSteps: [0, 8, 16, 24],
    snareSteps: [],
    hatSteps: [],
    kickVolume: 0.22,
  },
};

let bgmSchedulerId = null;
let bgmCurrentProfileName = null;
let bgmNextStepTime = 0;
let bgmCurrentStep = 0;
const BGM_LOOKAHEAD_MS = 25;
const BGM_SCHEDULE_AHEAD_S = 0.12;
const BGM_STEPS_PER_BAR = 32;

function bgmStepDuration(profile) {
  return (60 / profile.tempo) / 4;
}

function scheduleKick(time, volume) {
  playSynth({ type: 'sine', freq: 52, freqEnd: 28, when: time, duration: 0.35, attack: 0.02, decay: 0.12, sustain: 0.35, release: 0.2, volume, filterFreq: 180, dest: bgmGain });
}

function scheduleBgmStep(profile, stepIndex, time) {
  const stepDur = bgmStepDuration(profile);
  const step = stepIndex % BGM_STEPS_PER_BAR;
  const leadVol = profile.leadVolume != null ? profile.leadVolume : 0.07;
  const bassVol = profile.bassVolume != null ? profile.bassVolume : 0.22;
  const padVol = profile.padVolume != null ? profile.padVolume : 0.045;

  const leadNote = profile.leadPattern[step];
  if (leadNote) {
    playSynth({
      type: 'sine', freq: leadNote, when: time, duration: stepDur * 2.4,
      attack: 0.04, decay: 0.2, sustain: 0.35, release: 0.8, volume: leadVol,
      filterFreq: 1800, dest: bgmGain, delaySend: 0.7,
    });
    playSynth({
      type: 'triangle', freq: leadNote * 2, when: time, duration: stepDur * 1.6,
      attack: 0.06, decay: 0.15, sustain: 0.2, release: 0.7, volume: leadVol * 0.35,
      filterFreq: 2400, dest: bgmGain, delaySend: 0.55,
    });
  }

  const bassNote = profile.bassPattern[step];
  if (bassNote) {
    playSynth({
      type: 'sine', freq: bassNote, when: time, duration: stepDur * 8,
      attack: 0.25, decay: 0.8, sustain: 0.7, release: 1.2, volume: bassVol,
      filterFreq: 160, dest: bgmGain,
    });
  }

  const chord = profile.padChords && profile.padChords[step];
  if (chord) {
    chord.forEach((freq, i) => {
      playSynth({
        type: i === 0 ? 'sine' : 'triangle', freq, when: time, duration: stepDur * 16,
        attack: 0.6, decay: 1.2, sustain: 0.45, release: 1.4, volume: padVol,
        filterFreq: 700, dest: bgmGain, delaySend: 0.4, detune: i === 1 ? 5 : (i === 2 ? -4 : 0),
      });
    });
  }

  if (profile.kickSteps.includes(step) && profile.kickVolume) {
    scheduleKick(time, profile.kickVolume);
  }
}

function bgmSchedulerTick() {
  if (!audioCtx || !bgmCurrentProfileName) return;
  const profile = BGM_PROFILES[bgmCurrentProfileName];
  while (bgmNextStepTime < audioCtx.currentTime + BGM_SCHEDULE_AHEAD_S) {
    scheduleBgmStep(profile, bgmCurrentStep, bgmNextStepTime);
    bgmNextStepTime += bgmStepDuration(profile);
    bgmCurrentStep++;
  }
}

function playBgm(profileName) {
  if (!audioUnlocked || !BGM_PROFILES[profileName]) return;
  initAudio();
  if (bgmCurrentProfileName === profileName && bgmSchedulerId !== null) return;
  stopBgm();
  bgmCurrentProfileName = profileName;
  bgmCurrentStep = 0;
  bgmNextStepTime = audioCtx.currentTime + 0.05;
  bgmSchedulerId = setInterval(bgmSchedulerTick, BGM_LOOKAHEAD_MS);
}

function stopBgm() {
  if (bgmSchedulerId !== null) {
    clearInterval(bgmSchedulerId);
    bgmSchedulerId = null;
  }
  bgmCurrentProfileName = null;
}

// ---- Sound tester (checklist catalog) ----
let previewLoopNodes = [];
let previewLoopId = null;

function sfxArp(freqs, duty = 0.25, volume = 0.38, step = 0.05) {
  const steps = freqs.map((freq, i) => ({ freq, time: step + (i === freqs.length - 1 ? 0.05 : 0) }));
  playPulseTone({
    dutyCycle: duty,
    freqSteps: steps,
    duration: step * freqs.length + 0.04,
    attack: 0.002, decay: 0.015, sustain: 0.65, release: 0.04, volume,
  });
}

function sfxTelegraph(freq) {
  sfxArp([freq, freq, freq * 1.25], 0.125, 0.34, 0.065);
}

function sfxSlam(freq) {
  playNoiseBurst({ duration: 0.12, filterFreq: Math.max(180, freq * 4), filterEnd: 90, filterType: 'lowpass', volume: 0.36 });
  playSynth({ type: 'sine', freq: freq, freqEnd: freq * 0.45, duration: 0.14, attack: 0.002, decay: 0.04, sustain: 0.3, release: 0.06, volume: 0.28, filterFreq: 400, delaySend: 0 });
}

function isGlowDangerTesterLoop() {
  return typeof previewLoopId === 'string' && previewLoopId.startsWith('shipGlow');
}

function stopSfxPreviewLoops() {
  previewLoopId = null;
  glowDangerPreviewUrgency = -1;
  stopLiftSound();
  stopGlowDangerSound();
  stopFireballBreathSound();
  stopToxicHazardSounds();
  stopDustStormSound();
  stopMeteorStreakSound();
  stopStormSkiesHazardSounds();
  stopMovingDoorSound();
  stopBlackHoleSound();
  stopMoltenCoreIdleSound();
  stopMoltenFlameWallSound();
  stopMoltenSqueezeSound();
  stopMoltenDeathAshSound();
  stopCoreBulkheadHoldSound();
  stopCoreOverload(0.04);
  if (!audioCtx) {
    previewLoopNodes = [];
    return;
  }
  const now = audioCtx.currentTime;
  previewLoopNodes.forEach((node) => {
    try { node.stop(now + 0.05); } catch (e) { /* already stopped */ }
  });
  previewLoopNodes = [];
}

function startPreviewPulseLoop(freq, duty = 0.125, volume = 0.08) {
  stopSfxPreviewLoops();
  if (!audioUnlocked || !audioCtx) return;
  const now = audioCtx.currentTime;
  const osc = audioCtx.createOscillator();
  osc.type = 'triangle';
  osc.frequency.value = freq;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = duty <= 0.15 ? 500 : 900;
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.linearRampToValueAtTime(volume, now + 0.08);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);
  osc.start(now);
  previewLoopNodes.push(osc);
}

function startPreviewNoiseLoop(filterFreq, volume = 0.06) {
  stopSfxPreviewLoops();
  if (!audioUnlocked || !audioCtx) return;
  const now = audioCtx.currentTime;
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate, audioCtx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;
  const filter = audioCtx.createBiquadFilter();
  filter.type = 'bandpass';
  filter.frequency.value = filterFreq;
  const gain = audioCtx.createGain();
  gain.gain.value = volume;
  source.connect(filter);
  filter.connect(gain);
  gain.connect(sfxGain);
  source.start(now);
  previewLoopNodes.push(source);
}

function startPreviewPulsingOrbLoop() {
  if (!audioUnlocked || !audioCtx) return;
  const now = audioCtx.currentTime;
  const out = audioCtx.createGain();
  out.gain.value = 0.17;
  out.connect(sfxGain);

  const lfo = audioCtx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = 1 / 5.8;

  const drone = audioCtx.createOscillator();
  drone.type = 'sine';
  drone.frequency.value = 112;
  const dGain = audioCtx.createGain();
  dGain.gain.value = 0.12;
  const lfoPitch = audioCtx.createGain();
  lfoPitch.gain.value = 54;
  lfo.connect(lfoPitch);
  lfoPitch.connect(drone.frequency);
  drone.connect(dGain);
  dGain.connect(out);

  const bloom = audioCtx.createOscillator();
  bloom.type = 'triangle';
  bloom.frequency.value = 196;
  const bFilt = audioCtx.createBiquadFilter();
  bFilt.type = 'lowpass';
  bFilt.frequency.value = 1100;
  const bGain = audioCtx.createGain();
  bGain.gain.value = 0.05;
  const lfoBloom = audioCtx.createGain();
  lfoBloom.gain.value = 88;
  lfo.connect(lfoBloom);
  lfoBloom.connect(bloom.frequency);
  const lfoFilt = audioCtx.createGain();
  lfoFilt.gain.value = 780;
  lfo.connect(lfoFilt);
  lfoFilt.connect(bFilt.frequency);
  bloom.connect(bFilt);
  bFilt.connect(bGain);
  bGain.connect(out);

  const noise = createGlowDangerNoise();
  const nFilt = audioCtx.createBiquadFilter();
  nFilt.type = 'bandpass';
  nFilt.frequency.value = 740;
  nFilt.Q.value = 1.1;
  const nGain = audioCtx.createGain();
  nGain.gain.value = 0.07;
  const lfoNoise = audioCtx.createGain();
  lfoNoise.gain.value = 500;
  lfo.connect(lfoNoise);
  lfoNoise.connect(nFilt.frequency);
  noise.connect(nFilt);
  nFilt.connect(nGain);
  nGain.connect(out);

  const lfoVol = audioCtx.createGain();
  lfoVol.gain.value = 0.055;
  lfo.connect(lfoVol);
  lfoVol.connect(out.gain);

  drone.start(now);
  bloom.start(now);
  noise.start(now);
  lfo.start(now);
  previewLoopNodes.push(drone, bloom, noise, lfo);
  playPulsingOrbBloom(1);
}

function playSfxCatalogEntry(entry) {
  unlockAudio();
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  if (entry.kind === 'loop') {
    if (previewLoopId === entry.id) {
      stopSfxPreviewLoops();
      stopBgm();
      return false;
    }
    stopSfxPreviewLoops();
    stopBgm();
    previewLoopId = entry.id;
    entry.play();
    return true;
  }
  if (entry.kind === 'bgm') {
    const profileName = typeof entry.profile === 'function' ? entry.profile() : entry.profile;
    if (bgmCurrentProfileName === profileName && bgmSchedulerId !== null) {
      stopBgm();
      return false;
    }
    stopSfxPreviewLoops();
    playBgm(profileName);
    previewLoopId = entry.id;
    return true;
  }
  stopSfxPreviewLoops();
  entry.play();
  return false;
}

function stopAllSoundTesterAudio() {
  stopSfxPreviewLoops();
  stopBgm();
}

function playGlowDangerTesterStyle(id) {
  audioSettings.glowDanger = id;
  saveAudioSettings();
  refreshSfxGlowDangerUi();
  glowDangerPreviewUrgency = 0.85;
  stopGlowDangerSound();
  startGlowDangerSound();
  updateGlowDangerUrgency();
}

function refreshSfxGlowDangerUi() {
  const kind = document.getElementById('sfx-glow-danger-kind');
  if (kind) kind.textContent = `LOOP — ${currentGlowDangerLabel()} — arrows change style`;
}

function refreshSfxLifeLostUi() {
  const kind = document.getElementById('sfx-life-lost-kind');
  if (kind) kind.textContent = `ONE-SHOT — ${currentLifeLostLabel()} — arrows change style`;
}

function refreshSfxRespawnUi() {
  const kind = document.getElementById('sfx-respawn-kind');
  if (kind) kind.textContent = `ONE-SHOT — ${currentRespawnLabel()} — arrows change style`;
}

const SFX_CATALOG = [
  { id: 'uiClick', section: '1. UI / Menu', name: 'Generic button click', kind: 'oneshot', play: () => sfxUiClick() },
  { id: 'uiDiffCycle', section: '1. UI / Menu', name: 'Difficulty cycle prev/next', kind: 'oneshot', play: () => sfxArp([880, 988, 880], 0.25, 0.36, 0.04) },
  { id: 'uiOpenSettings', section: '1. UI / Menu', name: 'Menu open — Settings', kind: 'oneshot', play: () => sfxArp([523, 659, 784], 0.25, 0.36) },
  { id: 'uiOpenAchievements', section: '1. UI / Menu', name: 'Menu open — Achievements', kind: 'oneshot', play: () => sfxArp([659, 784, 988], 0.25, 0.36) },
  { id: 'uiOpenStatistics', section: '1. UI / Menu', name: 'Menu open — Statistics', kind: 'oneshot', play: () => sfxArp([392, 523, 659], 0.25, 0.34) },
  { id: 'uiOpenZoneSelect', section: '1. UI / Menu', name: 'Menu open — Zone Select', kind: 'oneshot', play: () => sfxArp([440, 554, 740], 0.125, 0.36) },
  { id: 'uiOpenPause', section: '1. UI / Menu', name: 'Menu open — Pause', kind: 'oneshot', play: () => sfxPause() },
  { id: 'uiBack', section: '1. UI / Menu', name: 'Back / cancel', kind: 'oneshot', play: () => sfxArp([784, 523], 0.25, 0.34, 0.055) },
  { id: 'uiConfirmDanger', section: '1. UI / Menu', name: 'Confirm dangerous action', kind: 'oneshot', play: () => { playNoiseBurst({ duration: 0.08, filterFreq: 1200, volume: 0.3 }); sfxArp([311, 233], 0.5, 0.4, 0.07); } },
  { id: 'uiStartGame', section: '1. UI / Menu', name: 'Start game', kind: 'oneshot', play: () => sfxStart() },
  { id: 'uiResume', section: '1. UI / Menu', name: 'Resume game', kind: 'oneshot', play: () => sfxArp([440, 659, 880], 0.25, 0.36) },
  { id: 'uiUseContinue', section: '1. UI / Menu', name: 'Use continue', kind: 'oneshot', play: () => sfxContinueUsed() },
  { id: 'uiQuitHome', section: '1. UI / Menu', name: 'Quit to home', kind: 'oneshot', play: () => sfxArp([659, 494, 330], 0.25, 0.36, 0.06) },
  { id: 'uiZonePreview', section: '1. UI / Menu', name: 'Zone preview', kind: 'oneshot', play: () => sfxArp([740, 880], 0.125, 0.28, 0.04) },
  { id: 'uiWarpToZone', section: '1. UI / Menu', name: 'Warp to zone (confirm)', kind: 'oneshot', play: () => sfxWarp() },
  { id: 'uiAchievement', section: '1. UI / Menu', name: 'Achievement unlocked', kind: 'oneshot', play: () => sfxArp([784, 988, 1175, 1568], 0.25, 0.4, 0.06) },
  { id: 'uiRankEarned', section: '1. UI / Menu', name: 'Rank earned', kind: 'oneshot', play: () => sfxArp([523, 659, 784, 1047, 1319], 0.25, 0.42, 0.07) },
  { id: 'uiDistanceMilestone', section: '1. UI / Menu', name: 'Distance milestone reached', kind: 'oneshot', play: () => sfxArp([659, 831, 988], 0.125, 0.38, 0.07) },
  { id: 'uiOverdriveUnlock', section: '1. UI / Menu', name: 'Overdrive difficulty unlocked', kind: 'oneshot', play: () => sfxOverdriveUnlock() },

  { id: 'shipThrust', section: '2. Ship & Core Loop', name: 'Lift / thrust (tester only — off in gameplay)', kind: 'loop', play: () => startLiftSound() },
  { id: 'shipCollision', section: '2. Ship & Core Loop', name: 'Collision / death', kind: 'oneshot', play: () => sfxCollision() },
  { id: 'shipGhostHit', section: '2. Ship & Core Loop', name: 'Easy ghost hit (free pass)', kind: 'oneshot', play: () => sfxGhostHit() },
  { id: 'shipGlowDanger', section: '2. Ship & Core Loop', name: 'Easy glow / death window (danger)', kind: 'loop', play: () => { glowDangerPreviewUrgency = 0.85; startGlowDangerSound(); updateGlowDangerUrgency(); } },
  { id: 'shipGlowSiren', section: '2. Ship & Core Loop', name: 'Glow danger — Siren Pulse', kind: 'loop', play: () => playGlowDangerTesterStyle('siren') },
  { id: 'shipGlowOverheat', section: '2. Ship & Core Loop', name: 'Glow danger — Overheat', kind: 'loop', play: () => playGlowDangerTesterStyle('overheat') },
  { id: 'shipGlowKlaxon', section: '2. Ship & Core Loop', name: 'Glow danger — Red Alert', kind: 'loop', play: () => playGlowDangerTesterStyle('klaxon') },
  { id: 'shipGlowMeltdown', section: '2. Ship & Core Loop', name: 'Glow danger — Meltdown', kind: 'loop', play: () => playGlowDangerTesterStyle('meltdown') },
  { id: 'shipRespawn', section: '2. Ship & Core Loop', name: 'Respawn', kind: 'oneshot', play: () => sfxRespawn() },
  { id: 'shipLifeLost', section: '2. Ship & Core Loop', name: 'Life lost transition', kind: 'oneshot', play: () => sfxLifeLost() },
  { id: 'shipContinueUsed', section: '2. Ship & Core Loop', name: 'Continue used (extra life)', kind: 'oneshot', play: () => sfxContinueUsed() },
  { id: 'shipGameOver', section: '2. Ship & Core Loop', name: 'Game over', kind: 'oneshot', play: () => sfxGameOver() },
  { id: 'shipWarp', section: '2. Ship & Core Loop', name: 'Zone transition / warp', kind: 'oneshot', play: () => sfxWarp() },
  { id: 'shipNewBest', section: '2. Ship & Core Loop', name: 'New best distance', kind: 'oneshot', play: () => sfxNewBest() },
  { id: 'shipVictory', section: '2. Ship & Core Loop', name: 'Victory fanfare', kind: 'bgm', profile: 'victory', play: () => {} },

  { id: 'hzGate', section: '3. Zone Hazards', name: 'Gate pillar impact', kind: 'oneshot', play: () => sfxHazardImpact('gate') },
  { id: 'hzAsteroid', section: '3. Zone Hazards', name: 'Asteroid cluster', kind: 'oneshot', play: () => sfxHazardImpact('asteroid') },
  { id: 'hzHbar', section: '3. Zone Hazards', name: 'H-bar cluster', kind: 'oneshot', play: () => sfxHazardImpact('hbar') },
  { id: 'hzPendulum', section: '3. Zone Hazards', name: 'Pendulum impact', kind: 'oneshot', play: () => sfxHazardImpact('pendulum') },
  { id: 'hzPendulumSwoosh', section: '3. Zone Hazards', name: 'Pendulum swoosh', kind: 'oneshot', play: () => playPendulumSwoosh() },
  { id: 'hzLbolt', section: '3. Zone Hazards', name: 'Floating bolt impact', kind: 'oneshot', play: () => sfxHazardImpact('lbolt') },
  { id: 'hzAcid', section: '3. Zone Hazards', name: 'Acid drip (proximity)', kind: 'loop', play: () => { startToxicAcidSound(); updateToxicAcidMix(0.85); } },
  { id: 'hzVortex', section: '3. Zone Hazards', name: 'Wind vortex (proximity)', kind: 'loop', play: () => { startWindVortexSound(); updateWindVortexMix(0.85); } },
  { id: 'hzTurretFire', section: '3. Zone Hazards', name: 'Turret fire', kind: 'oneshot', play: () => sfxHazardFire('turretshot') },
  { id: 'hzTurretShot', section: '3. Zone Hazards', name: 'Turret shot travel/impact', kind: 'oneshot', play: () => sfxHazardImpact('turretshot') },
  { id: 'hzSearchlight', section: '3. Zone Hazards', name: 'Searchlight sweep / detect', kind: 'oneshot', play: () => sfxHazardImpact('searchlight') },
  { id: 'hzCorruption', section: '3. Zone Hazards', name: 'Signal corruption (loop)', kind: 'loop', play: () => startPreviewPulseLoop(73, 0.125, 0.07) },
  { id: 'hzEmp', section: '3. Zone Hazards', name: 'EMP burst', kind: 'oneshot', play: () => playEmpDischarge() },
  { id: 'hzPulseOrb', section: '3. Zone Hazards', name: 'Pulsing orb (expand / contract)', kind: 'loop', play: () => startPreviewPulsingOrbLoop() },
  { id: 'hzBoomerang', section: '3. Zone Hazards', name: 'Boomerang throw/return (selected)', kind: 'oneshot', play: () => playBoomerangPass() },
  { id: 'hzBoomerangBlade', section: '3. Zone Hazards', name: 'Boomerang — Blade whoosh', kind: 'oneshot', play: () => { boomerangPassStyle = 'blade'; playBoomerangPassBlade(); } },
  { id: 'hzBoomerangWood', section: '3. Zone Hazards', name: 'Boomerang — Wooden spin', kind: 'oneshot', play: () => { boomerangPassStyle = 'wood'; playBoomerangPassWood(); } },
  { id: 'hzBoomerangNeon', section: '3. Zone Hazards', name: 'Boomerang — Neon disc', kind: 'oneshot', play: () => { boomerangPassStyle = 'neon'; playBoomerangPassNeon(); } },
  { id: 'hzBoomerangChop', section: '3. Zone Hazards', name: 'Boomerang — Spin chops (in fight)', kind: 'oneshot', play: () => { boomerangPassStyle = 'chop'; playBoomerangPassChop(); } },
  { id: 'hzBoomerangDoppler', section: '3. Zone Hazards', name: 'Boomerang — Deep doppler', kind: 'oneshot', play: () => { boomerangPassStyle = 'doppler'; playBoomerangPassDoppler(); } },
  { id: 'hzBoomerangRing', section: '3. Zone Hazards', name: 'Boomerang — Ringing blade', kind: 'oneshot', play: () => { boomerangPassStyle = 'ring'; playBoomerangPassRing(); } },
  { id: 'hzLensing', section: '3. Zone Hazards', name: 'Lensing zone (loop)', kind: 'loop', play: () => startPreviewPulseLoop(55, 0.5, 0.06) },
  { id: 'hzSupernova', section: '3. Zone Hazards', name: 'Supernova buildup + explosion', kind: 'oneshot', play: () => sfxHazardFire('supernova') },
  { id: 'hzNovaDebris', section: '3. Zone Hazards', name: 'Supernova debris', kind: 'oneshot', play: () => sfxHazardImpact('supernovadebris') },
  { id: 'hzLaserGrid', section: '3. Zone Hazards', name: 'Laser grid', kind: 'oneshot', play: () => sfxHazardImpact('lasergrid') },
  { id: 'hzFireball', section: '3. Zone Hazards', name: 'Fireball breath (proximity)', kind: 'oneshot', play: () => playBowserFireball() },
  { id: 'hzGeyser', section: '3. Zone Hazards', name: 'Toxic geyser (proximity)', kind: 'loop', play: () => { startToxicGeyserSound(); updateToxicGeyserMix(0.85); } },
  { id: 'hzGeyserErupt', section: '3. Zone Hazards', name: 'Toxic geyser eruption', kind: 'oneshot', play: () => playGeyserEruption(1) },
  { id: 'hzBlackHole', section: '3. Zone Hazards', name: 'Black hole (proximity)', kind: 'loop', play: () => { startBlackHoleSound(); updateBlackHoleMix(0.85, 0.7); } },
  { id: 'hzLightning', section: '3. Zone Hazards', name: 'Lightning bolt', kind: 'oneshot', play: () => sfxHazardImpact('lightning') },
  { id: 'hzToxic', section: '3. Zone Hazards', name: 'Toxic pool (proximity)', kind: 'loop', play: () => { startToxicPoolSound(); updateToxicPoolMix(0.85); } },
  { id: 'hzOrbiter', section: '3. Zone Hazards', name: 'Orbiter (loop)', kind: 'loop', play: () => startPreviewPulseLoop(220, 0.25, 0.06) },
  { id: 'hzSparkHub', section: '3. Zone Hazards', name: 'Spark hub (loop)', kind: 'loop', play: () => startPreviewPulseLoop(440, 0.125, 0.05) },
  { id: 'hzSparkShot', section: '3. Zone Hazards', name: 'Spark projectile', kind: 'oneshot', play: () => sfxHazardFire('sparkprojectile') },
  { id: 'hzDoor', section: '3. Zone Hazards', name: 'Moving door impact', kind: 'oneshot', play: () => sfxHazardImpact('movingdoor') },
  { id: 'hzDoorProx', section: '3. Zone Hazards', name: 'Moving door (proximity)', kind: 'loop', play: () => { startMovingDoorSound(); updateMovingDoorMix(0.85, 0.8); } },
  { id: 'hzSpecialDoor', section: '3. Zone Hazards', name: 'Special door', kind: 'oneshot', play: () => sfxHazardImpact('specialdoor') },
  { id: 'hzAccessKey', section: '3. Zone Hazards', name: 'Access key pickup (item chime)', kind: 'oneshot', play: () => playKeyPickup() },
  { id: 'hzArcPlanet', section: '3. Zone Hazards', name: 'Arc planet (loop)', kind: 'loop', play: () => startPreviewPulseLoop(82, 0.25, 0.05) },
  { id: 'hzShootingStar', section: '3. Zone Hazards', name: 'Meteor streak (proximity)', kind: 'loop', play: () => { startMeteorStreakSound(); updateMeteorStreakMix(0.85, 1); } },
  { id: 'hzWreckage', section: '3. Zone Hazards', name: 'Wreckage / creak', kind: 'oneshot', play: () => sfxHazardImpact('wreckage') },
  { id: 'hzEcho', section: '3. Zone Hazards', name: 'Echo trail', kind: 'oneshot', play: () => sfxHazardImpact('echotrail') },
  { id: 'hzStorm', section: '3. Zone Hazards', name: 'Dust tornado (proximity)', kind: 'loop', play: () => { startDustStormSound(); updateDustStormMix(0.85, 1); } },
  { id: 'hzBillboard', section: '3. Zone Hazards', name: 'Billboard (likely silent)', kind: 'oneshot', play: () => sfxHazardImpact('billboard') },
  { id: 'hzCloudArc', section: '3. Zone Hazards', name: 'Storm cloud arc (proximity)', kind: 'loop', play: () => { startStormCloudSound(); updateStormCloudMix(0.85, 1); } },

  { id: 'coreCharge', section: '4. Mini-Boss (Reactor Core)', name: 'Charging / charging-close', kind: 'oneshot', play: () => sfxFireBossChargeDash() },
  { id: 'coreIdle', section: '4. Mini-Boss (Reactor Core)', name: 'Molten Core idle / bob', kind: 'loop', play: () => startMoltenCoreIdleSound({ preview: true }) },
  { id: 'coreBodyHit', section: '4. Mini-Boss (Reactor Core)', name: 'Molten Core body hit', kind: 'oneshot', play: () => sfxFireBossBodyHit() },
  { id: 'coreBarrageTel', section: '4. Mini-Boss (Reactor Core)', name: 'Barrage telegraph', kind: 'oneshot', play: () => sfxFireBossBarrageTelegraph() },
  { id: 'coreBarrage', section: '4. Mini-Boss (Reactor Core)', name: 'Ember wave launch', kind: 'oneshot', play: () => sfxFireBossEmberLaunch() },
  { id: 'coreSqueeze', section: '4. Mini-Boss (Reactor Core)', name: 'Squeeze walls', kind: 'loop', play: () => startMoltenSqueezeSound({ preview: true }) },
  { id: 'coreEmberHit', section: '4. Mini-Boss (Reactor Core)', name: 'Ember hit', kind: 'oneshot', play: () => sfxFireBossEmberHit() },
  { id: 'coreSqueezeHit', section: '4. Mini-Boss (Reactor Core)', name: 'Squeeze wall hit', kind: 'oneshot', play: () => sfxFireBossSqueezeHit() },
  { id: 'moltenDeath', section: '4. Mini-Boss (Reactor Core)', name: 'Molten Core dying / dim', kind: 'oneshot', play: () => sfxFireBossDeath() },
  { id: 'moltenAsh', section: '4. Mini-Boss (Reactor Core)', name: 'Molten Core ashing', kind: 'loop', play: () => startMoltenDeathAshSound({ preview: true }) },
  { id: 'moltenDisperse', section: '4. Mini-Boss (Reactor Core)', name: 'Molten Core disperse', kind: 'oneshot', play: () => sfxFireBossDisperse() },
  { id: 'coreBulkTel', section: '4. Mini-Boss (Reactor Core)', name: 'Core bulkhead close', kind: 'oneshot', play: () => sfxCoreBulkheadTelegraph() },
  { id: 'coreBulkLock', section: '4. Mini-Boss (Reactor Core)', name: 'Core bulkhead lock', kind: 'oneshot', play: () => sfxCoreBulkheadLock() },
  { id: 'coreBulkHold', section: '4. Mini-Boss (Reactor Core)', name: 'Core bulkhead hold', kind: 'loop', play: () => startCoreBulkheadHoldSound({ preview: true }) },
  { id: 'coreBulk', section: '4. Mini-Boss (Reactor Core)', name: 'Core bulkhead hit', kind: 'oneshot', play: () => sfxHazardImpact('coreBulkheadActive') },
  { id: 'coreCrossTel', section: '4. Mini-Boss (Reactor Core)', name: 'Core crossfire telegraph (silent)', kind: 'oneshot', play: () => sfxHazardFire('coreCrossfireTelegraph') },
  { id: 'coreCross', section: '4. Mini-Boss (Reactor Core)', name: 'Core crossfire volley (laser active, once)', kind: 'oneshot', play: () => sfxHazardFire('coreCrossfireActive') },
  { id: 'coreCrossGap', section: '4. Mini-Boss (Reactor Core)', name: 'Core crossfire gap (silent)', kind: 'oneshot', play: () => sfxHazardFire('coreCrossfireGap') },
  { id: 'coreEmpTel', section: '4. Mini-Boss (Reactor Core)', name: 'Core EMP telegraph', kind: 'oneshot', play: () => sfxCoreEmpTelegraph() },
  { id: 'coreEmp', section: '4. Mini-Boss (Reactor Core)', name: 'Core EMP wave launch', kind: 'oneshot', play: () => sfxCoreEmpPulse() },
  { id: 'coreLaserTel', section: '4. Mini-Boss (Reactor Core)', name: 'Core laser telegraph', kind: 'oneshot', play: () => sfxHazardFire('coreLaserTelegraph') },
  { id: 'coreLaser', section: '4. Mini-Boss (Reactor Core)', name: 'Core laser active', kind: 'oneshot', play: () => sfxHazardFire('coreLaserActive') },
  { id: 'coreOrbit', section: '4. Mini-Boss (Reactor Core)', name: 'Core orbit barrage', kind: 'oneshot', play: () => sfxHazardFire('coreOrbit') },
  { id: 'coreOrbitHit', section: '4. Mini-Boss (Reactor Core)', name: 'Core orbit hit', kind: 'oneshot', play: () => sfxHazardImpact('coreOrbit') },
  { id: 'coreEmerge', section: '4. Mini-Boss (Reactor Core)', name: 'Core sphere emerge', kind: 'oneshot', play: () => sfxCoreEmerge() },
  { id: 'coreGate', section: '4. Mini-Boss (Reactor Core)', name: 'Core gate open', kind: 'oneshot', play: () => sfxCoreGateOpen() },
  { id: 'coreEyeTrack', section: '4. Mini-Boss (Reactor Core)', name: 'Core eye beam track', kind: 'oneshot', play: () => sfxCoreEyeBeamTrack() },
  { id: 'coreEyeLock', section: '4. Mini-Boss (Reactor Core)', name: 'Core eye beam lock', kind: 'oneshot', play: () => sfxCoreEyeBeamLock() },
  { id: 'coreEyeFire', section: '4. Mini-Boss (Reactor Core)', name: 'Core eye beam fire', kind: 'oneshot', play: () => sfxCoreEyeBeamFire() },
  { id: 'coreEyeHit', section: '4. Mini-Boss (Reactor Core)', name: 'Core eye beam hit', kind: 'oneshot', play: () => sfxHazardImpact('coreEyeBeam') },
  { id: 'coreTeslaCharge', section: '4. Mini-Boss (Reactor Core)', name: 'Core tesla charge (silent)', kind: 'oneshot', play: () => sfxCoreTeslaCharge() },
  { id: 'coreTesla', section: '4. Mini-Boss (Reactor Core)', name: 'Core tesla burst (selected)', kind: 'oneshot', play: () => sfxCoreTeslaBurst() },
  { id: 'coreTeslaContra', section: '4. Mini-Boss (Reactor Core)', name: 'Core tesla — Contra blast', kind: 'oneshot', play: () => { coreTeslaBurstStyle = 'contra'; sfxCoreTeslaBurstContra(); } },
  { id: 'coreTeslaThick', section: '4. Mini-Boss (Reactor Core)', name: 'Core tesla — Thick pew', kind: 'oneshot', play: () => { coreTeslaBurstStyle = 'thick'; sfxCoreTeslaBurstThick(); } },
  { id: 'coreTeslaChord', section: '4. Mini-Boss (Reactor Core)', name: 'Core tesla — Stacked chord', kind: 'oneshot', play: () => { coreTeslaBurstStyle = 'chord'; sfxCoreTeslaBurstChord(); } },
  { id: 'coreTeslaCoil', section: '4. Mini-Boss (Reactor Core)', name: 'Core tesla — Coil snap', kind: 'oneshot', play: () => { coreTeslaBurstStyle = 'coil'; sfxCoreTeslaBurstCoil(); } },
  { id: 'coreTeslaSpray', section: '4. Mini-Boss (Reactor Core)', name: 'Core tesla — Filter spray', kind: 'oneshot', play: () => { coreTeslaBurstStyle = 'spray'; sfxCoreTeslaBurstSpray(); } },
  { id: 'coreTeslaFan', section: '4. Mini-Boss (Reactor Core)', name: 'Core tesla — Fan pellets (previous)', kind: 'oneshot', play: () => { coreTeslaBurstStyle = 'fan'; sfxCoreTeslaBurstFan(); } },
  { id: 'coreTeslaHit', section: '4. Mini-Boss (Reactor Core)', name: 'Core tesla hit', kind: 'oneshot', play: () => sfxHazardImpact('coreTesla') },
  { id: 'coreFlameTel', section: '4. Mini-Boss (Reactor Core)', name: 'Flame wall telegraph', kind: 'oneshot', play: () => sfxFireBossFlameWallTelegraph() },
  { id: 'coreFlame', section: '4. Mini-Boss (Reactor Core)', name: 'Flame wall active', kind: 'loop', play: () => startMoltenFlameWallSound({ preview: true }) },
  { id: 'coreSpark', section: '4. Mini-Boss (Reactor Core)', name: 'Core spark deploy', kind: 'oneshot', play: () => sfxHazardFire('corespark') },
  { id: 'coreDying', section: '4. Mini-Boss (Reactor Core)', name: 'Core dying (unused wall death)', kind: 'oneshot', play: () => sfxCoreDying() },
  { id: 'coreOverloadBuild', section: '4. Mini-Boss (Reactor Core)', name: 'Core overload buildup', kind: 'oneshot', play: () => sfxCoreOverload() },
  { id: 'coreOverload', section: '4. Mini-Boss (Reactor Core)', name: 'Core overload dying', kind: 'oneshot', play: () => sfxCoreOverload() },
  { id: 'coreOverloadFlash', section: '4. Mini-Boss (Reactor Core)', name: 'Core overload flash', kind: 'oneshot', play: () => sfxCoreOverloadFlash() },
  { id: 'coreOverloadBreak', section: '4. Mini-Boss (Reactor Core)', name: 'Core overload breakdown', kind: 'oneshot', play: () => sfxCoreOverloadBreakdown() },
  { id: 'coreReturn', section: '4. Mini-Boss (Reactor Core)', name: 'Molten Core return', kind: 'oneshot', play: () => sfxMiniBossReturn() },
  { id: 'coreExit', section: '4. Mini-Boss (Reactor Core)', name: 'Molten Core exit', kind: 'oneshot', play: () => sfxFireBossExit() },

  { id: 'sigEntrance', section: '5. Final Boss (The Signal)', name: 'Boss entrance', kind: 'oneshot', play: () => sfxSignalEntrance() },
  { id: 'sigAttack', section: '5. Final Boss (The Signal)', name: 'Boss attack (generic)', kind: 'oneshot', play: () => sfxHazardFire('bossattack') },
  { id: 'sigBeamTel', section: '5. Final Boss (The Signal)', name: 'Charge beam telegraph (selected)', kind: 'oneshot', play: () => playChargeTelegraph({ duration: framesToSeconds(BOSS_CHARGE_BEAM_TELEGRAPH_DURATION), size: 1 }) },
  { id: 'sigBeamTelX', section: '5. Final Boss (The Signal)', name: 'Charge telegraph — X Charge', kind: 'oneshot', play: () => playMegaManCharge({ duration: framesToSeconds(BOSS_CHARGE_BEAM_TELEGRAPH_DURATION), size: 1 }) },
  { id: 'sigBeamTelSweep', section: '5. Final Boss (The Signal)', name: 'Charge telegraph — Sweep Whine', kind: 'oneshot', play: () => playChargeSweep({ duration: framesToSeconds(BOSS_CHARGE_BEAM_TELEGRAPH_DURATION), size: 1 }) },
  { id: 'sigBeamTelBeat', section: '5. Final Boss (The Signal)', name: 'Charge telegraph — Heartbeat', kind: 'oneshot', play: () => playChargeHeartbeat({ duration: framesToSeconds(BOSS_CHARGE_BEAM_TELEGRAPH_DURATION), size: 1 }) },
  { id: 'sigBeamTelStatic', section: '5. Final Boss (The Signal)', name: 'Charge telegraph — Static Build', kind: 'oneshot', play: () => playChargeStatic({ duration: framesToSeconds(BOSS_CHARGE_BEAM_TELEGRAPH_DURATION), size: 1 }) },
  { id: 'sigBeam', section: '5. Final Boss (The Signal)', name: 'Charge beam active', kind: 'oneshot', play: () => playChargeBeamFire({ size: 1, duration: framesToSeconds(BOSS_CHARGE_BEAM_FIRE_DURATION) }) },
  { id: 'sigRage', section: '5. Final Boss (The Signal)', name: 'Rage pulse (meteor ring)', kind: 'oneshot', play: () => sfxHazardFire('bossragepulse') },
  { id: 'sigDrone', section: '5. Final Boss (The Signal)', name: 'Ember drone spawn (silent in play — tester only)', kind: 'oneshot', play: () => playHotEmberRoar() },
  { id: 'sigRing', section: '5. Final Boss (The Signal)', name: 'Diagonal ring attack', kind: 'oneshot', play: () => playMeteorRingImpact() },
  { id: 'sigVolleyTel', section: '5. Final Boss (The Signal)', name: 'Volley telegraph', kind: 'oneshot', play: () => playTrackingLockOn() },
  { id: 'sigVolley', section: '5. Final Boss (The Signal)', name: 'Volley active (shotgun burst)', kind: 'oneshot', play: () => sfxHazardFire('bossvolley') },
  { id: 'sigEmber', section: '5. Final Boss (The Signal)', name: 'Ember / ash (loop)', kind: 'loop', play: () => startPreviewNoiseLoop(900, 0.05) },
  { id: 'sigPhase', section: '5. Final Boss (The Signal)', name: 'Phase 2→3 strain / lock-in', kind: 'oneshot', play: () => sfxSignalPhaseStrain() },
  { id: 'sigPhase5', section: '5. Final Boss (The Signal)', name: 'Phase 4→5 shatter / eclipse', kind: 'oneshot', play: () => sfxSignalPhaseEclipse() },
  { id: 'sigFinalCharge', section: '5. Final Boss (The Signal)', name: 'Final charge / shake (into boom)', kind: 'oneshot', play: () => sfxSignalFinalCharge() },
  { id: 'sigExplosion', section: '5. Final Boss (The Signal)', name: 'Explosion / white-out', kind: 'oneshot', play: () => sfxSignalExplosion() },
  { id: 'sigSilenced', section: '5. Final Boss (The Signal)', name: 'Aftermath (wall recedes, after white-out)', kind: 'oneshot', play: () => sfxSignalSilenced() },

  { id: 'bgmMenu', section: '6. Background Music', name: 'Menu / home loop', kind: 'bgm', profile: 'menu', play: () => {} },
  { id: 'bgmStage', section: '6. Background Music', name: 'Standard zone loop', kind: 'bgm', profile: 'standard', play: () => {} },
  { id: 'bgmBoss', section: '6. Background Music', name: 'Boss zone loop (The Signal)', kind: 'bgm', profile: 'boss', play: () => {} },
  { id: 'bgmMini', section: '6. Background Music', name: 'Mini-boss (Reactor Core) loop', kind: 'bgm', profile: 'miniboss', play: () => {} },
  { id: 'bgmVictory', section: '6. Background Music', name: 'Victory — Neon Rise', kind: 'bgm', profile: 'victory', play: () => {} },
  { id: 'bgmGameOver', section: '6. Background Music', name: 'Game over stinger', kind: 'oneshot', play: () => sfxGameOver() },
  { id: 'bgmZoneVar', section: '6. Background Music', name: 'Per-zone variation (uses stage loop)', kind: 'bgm', profile: 'standard', play: () => {} },
];

function buildSfxTesterUi() {
  const list = document.getElementById('sfx-tester-list');
  if (!list) return;
  const bySection = [];
  for (const entry of SFX_CATALOG) {
    let group = bySection.find((g) => g.title === entry.section);
    if (!group) {
      group = { title: entry.section, entries: [] };
      bySection.push(group);
    }
    group.entries.push(entry);
  }
  list.innerHTML = bySection.map((group) => {
    const buttons = group.entries.map((entry) => {
      const kindLabel = entry.kind === 'loop' ? 'LOOP — click again to stop' : entry.kind === 'bgm' ? 'MUSIC — click again to stop' : 'ONE-SHOT';
      if (entry.id === 'shipGlowDanger') {
        return `<div class="sfx-glow-row">
          <button type="button" class="sfx-glow-arrow" data-glow-danger-dir="-1" aria-label="Previous glow danger">&#9664;</button>
          <button type="button" class="sfx-btn" data-sfx-id="${entry.id}">${entry.name}<span class="sfx-kind" id="sfx-glow-danger-kind">LOOP — ${currentGlowDangerLabel()} — arrows change style</span></button>
          <button type="button" class="sfx-glow-arrow" data-glow-danger-dir="1" aria-label="Next glow danger">&#9654;</button>
        </div>`;
      }
      if (entry.id === 'shipRespawn') {
        return `<div class="sfx-glow-row">
          <button type="button" class="sfx-glow-arrow" data-respawn-dir="-1" aria-label="Previous respawn">&#9664;</button>
          <button type="button" class="sfx-btn" data-sfx-id="${entry.id}">${entry.name}<span class="sfx-kind" id="sfx-respawn-kind">ONE-SHOT — ${currentRespawnLabel()} — arrows change style</span></button>
          <button type="button" class="sfx-glow-arrow" data-respawn-dir="1" aria-label="Next respawn">&#9654;</button>
        </div>`;
      }
      if (entry.id === 'shipLifeLost') {
        return `<div class="sfx-glow-row">
          <button type="button" class="sfx-glow-arrow" data-life-lost-dir="-1" aria-label="Previous life lost">&#9664;</button>
          <button type="button" class="sfx-btn" data-sfx-id="${entry.id}">${entry.name}<span class="sfx-kind" id="sfx-life-lost-kind">ONE-SHOT — ${currentLifeLostLabel()} — arrows change style</span></button>
          <button type="button" class="sfx-glow-arrow" data-life-lost-dir="1" aria-label="Next life lost">&#9654;</button>
        </div>`;
      }
      return `<button type="button" class="sfx-btn" data-sfx-id="${entry.id}">${entry.name}<span class="sfx-kind">${kindLabel}</span></button>`;
    }).join('');
    return `<div class="sfx-section-title">${group.title}</div><div class="sfx-grid">${buttons}</div>`;
  }).join('');
}

function setSfxTesterPlaying(id) {
  document.querySelectorAll('.sfx-btn.playing').forEach((btn) => btn.classList.remove('playing'));
  if (!id) return;
  const btn = document.querySelector(`.sfx-btn[data-sfx-id="${id}"]`);
  if (btn) btn.classList.add('playing');
}

function initSfxTester() {
  const overlay = document.getElementById('sfx-tester');
  const toggle = document.getElementById('sfx-toggle');
  const closeBtn = document.getElementById('sfx-tester-close');
  const stopBtn = document.getElementById('sfx-tester-stop');
  const list = document.getElementById('sfx-tester-list');
  if (!overlay || !toggle || !list) return;
  buildSfxTesterUi();
  toggle.addEventListener('click', () => {
    overlay.classList.add('active');
    unlockAudio();
  });
  closeBtn.addEventListener('click', () => {
    overlay.classList.remove('active');
    stopAllSoundTesterAudio();
    setSfxTesterPlaying(null);
  });
  stopBtn.addEventListener('click', () => {
    stopAllSoundTesterAudio();
    setSfxTesterPlaying(null);
  });
  list.addEventListener('click', (e) => {
    const respawnStep = e.target.closest('[data-respawn-dir]');
    if (respawnStep) {
      unlockAudio();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      cycleRespawn(Number(respawnStep.dataset.respawnDir));
      setSfxTesterPlaying('shipRespawn');
      return;
    }
    const lifeLostStep = e.target.closest('[data-life-lost-dir]');
    if (lifeLostStep) {
      unlockAudio();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      cycleLifeLost(Number(lifeLostStep.dataset.lifeLostDir));
      setSfxTesterPlaying('shipLifeLost');
      return;
    }
    const step = e.target.closest('[data-glow-danger-dir]');
    if (step) {
      unlockAudio();
      initAudio();
      if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
      cycleGlowDanger(Number(step.dataset.glowDangerDir));
      setSfxTesterPlaying('shipGlowDanger');
      return;
    }
    const btn = e.target.closest('[data-sfx-id]');
    if (!btn) return;
    const entry = SFX_CATALOG.find((item) => item.id === btn.dataset.sfxId);
    if (!entry) return;
    const playing = playSfxCatalogEntry(entry);
    setSfxTesterPlaying(playing ? entry.id : null);
  });
}

initSfxTester();

// ---- Drawing ----
function lerpHexColor(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 0xff, ag = (a >> 8) & 0xff, ab = a & 0xff;
  const br = (b >> 16) & 0xff, bg = (b >> 8) & 0xff, bb = b & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `rgb(${r},${g},${bl})`;
}

function getBossColorProgress() {
  // 0 = original phase 1-2 colors, 1 = full phase 3 colors -- smoothly
  // animated only during the phase 2->3 transition specifically.
  // phases 3+ always stay at full color, including during the later
  // phase 4->5 transformation, which reuses the same bossTransitioning
  // flag for a different purpose and must not re-trigger this ramp
  if (bossTransitioning && bossTransitionTargetPhase === 3) {
    return Math.min(1, (frame - bossTransitionStartFrame) / BOSS_TRANSITION_DURATION);
  }
  if (bossPhase >= 3) return 1;
  return 0;
}

function getPhase5BackgroundProgress() {
  // 0 = phase 3/4 grid background, 1 = full volcanic ash background --
  // animates in lockstep with the phase 4->5 transformation
  if (bossTransitioning && bossTransitionTargetPhase === 5) {
    return Math.min(1, (frame - bossTransitionStartFrame) / BOSS_PHASE5_TRANSITION_DURATION);
  }
  if (bossPhase >= 5) return 1;
  return 0;
}

function drawBossCharge(theme, stageProgress) {
  // stage 1: glitch static intensifying around the spawn point, plus a
  // pulsing point of light building up -- no solid orb yet
  ctx.save();
  for (let i = 0; i < 12; i++) {
    const flicker = Math.sin(frame * 0.5 + i * 3.1);
    if (flicker > 0.2) {
      const ang = i * 2.4;
      const dist = 40 + 60 * stageProgress * (0.5 + 0.5 * Math.sin(i * 1.3));
      const x = boss.x + Math.cos(ang) * dist;
      const y = boss.y + Math.sin(ang) * dist;
      ctx.fillStyle = i % 2 === 0 ? theme.accentA : theme.accentB;
      ctx.globalAlpha = 0.4 * stageProgress;
      ctx.fillRect(x - 3, y - 3, 6, 6);
    }
  }
  const pulse = 0.6 + 0.4 * Math.sin(frame * 0.4);
  const coreR = 8 + 30 * stageProgress * pulse;
  ctx.shadowColor = theme.accentB;
  ctx.shadowBlur = 15 + 15 * stageProgress;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.5 + 0.5 * stageProgress;
  ctx.beginPath();
  ctx.arc(boss.x, boss.y, coreR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBossFragments(theme, stageProgress) {
  // stage 2: shards converge from a ring around the final position,
  // accelerating inward, with a faint central glow building as they approach
  ctx.save();
  const eased = stageProgress * stageProgress;
  for (const frag of boss.fragments) {
    const fx = frag.startX + (boss.x - frag.startX) * eased;
    const fy = frag.startY + (boss.y - frag.startY) * eased;
    ctx.shadowColor = theme.accentA;
    ctx.shadowBlur = 10;
    ctx.fillStyle = theme.accentB;
    ctx.globalAlpha = 0.5 + 0.5 * stageProgress;
    ctx.beginPath();
    ctx.arc(fx, fy, frag.size, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.shadowBlur = 20;
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.3 * stageProgress;
  ctx.beginPath();
  ctx.arc(boss.x, boss.y, 20 + 30 * stageProgress, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBossSnapEffect(theme, stageProgress) {
  // stage 3: bright flash fading quickly, plus an expanding shockwave
  // ring -- layered on top of the now-fully-formed orb underneath
  ctx.save();
  const flashAlpha = Math.max(0, 1 - stageProgress * 3);
  if (flashAlpha > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.7})`;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, boss.maxR * 1.5, 0, Math.PI * 2);
    ctx.fill();
  }
  const ringR = boss.maxR * (1 + stageProgress * 2.5);
  const ringAlpha = Math.max(0, 1 - stageProgress * 1.2);
  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = 4 * (1 - stageProgress) + 1;
  ctx.globalAlpha = ringAlpha;
  ctx.beginPath();
  ctx.arc(boss.x, boss.y, ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawBossTransitionCompleteEffect(theme, stageProgress) {
  // punctuates the moment the new form locks in -- same visual language
  // as the entrance snap, but in the new phase-3 colors
  ctx.save();
  const flashAlpha = Math.max(0, 1 - stageProgress * 2.5);
  if (flashAlpha > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flashAlpha * 0.8})`;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, boss.maxR * 1.6, 0, Math.PI * 2);
    ctx.fill();
  }
  const ringR = boss.maxR * (1 + stageProgress * 2.8);
  const ringAlpha = Math.max(0, 1 - stageProgress * 1.1);
  ctx.strokeStyle = theme.phase3AccentB;
  ctx.lineWidth = 5 * (1 - stageProgress) + 1;
  ctx.globalAlpha = ringAlpha;
  ctx.beginPath();
  ctx.arc(boss.x, boss.y, ringR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// phase 4 "wear and tear" -- jagged cracks spreading gradually across
// the boss's surface as phase 4 progresses, echoing the same glowing
// cyan crack language already used on the homing fragment's cracked
// core. drawn inside the boss's own clip so they're automatically
// bounded to its circular silhouette; each crack fades in individually
// at a staggered offset so they visibly spread over time rather than
// all appearing at once
const BOSS_CRACK_PATHS = [
  [[-0.5, -0.6], [-0.2, -0.3], [-0.4, -0.1], [-0.15, 0.05]],
  [[0.4, -0.4], [0.55, -0.15], [0.35, 0.1], [0.5, 0.3]],
  [[-0.3, 0.2], [-0.5, 0.4], [-0.25, 0.55]],
  [[0.1, -0.7], [0.25, -0.5], [0.05, -0.35], [0.2, -0.15]],
  [[0.2, 0.4], [0.4, 0.55], [0.15, 0.7]],
  [[-0.1, -0.2], [0.1, 0.0], [-0.05, 0.25], [0.15, 0.45]]
];
const BOSS_CRACK_APPEAR_OFFSETS = [0, 150, 300, 500, 700, 900];
const BOSS_CRACK_FADE_IN_DURATION = 120;

function drawBossCracks(bx, by, r, framesSincePhase4) {
  if (framesSincePhase4 < 0) return;
  ctx.save();
  for (let i = 0; i < BOSS_CRACK_PATHS.length; i++) {
    const sinceAppear = framesSincePhase4 - BOSS_CRACK_APPEAR_OFFSETS[i];
    if (sinceAppear < 0) continue;
    const fadeIn = Math.min(1, sinceAppear / BOSS_CRACK_FADE_IN_DURATION);
    const pulse = 0.7 + 0.3 * Math.sin(frame * 0.15 + i * 1.9);
    ctx.strokeStyle = '#00e0ff';
    ctx.lineWidth = 1.5;
    ctx.globalAlpha = fadeIn * pulse * 0.85;
    ctx.shadowColor = '#00e0ff';
    ctx.shadowBlur = 5;
    ctx.beginPath();
    BOSS_CRACK_PATHS[i].forEach(([px, py], j) => {
      const x = bx + px * r, y = by + py * r;
      j === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.restore();
}

// phase 5 final form -- a total-eclipse look: dark core, irregular
// flaring corona (not a smooth ring, jagged flare-like protrusions),
// and a single bright "diamond ring" highlight point near the rim
// the boss's standard sphere appearance -- gradient, scanlines, and
// 3D shading, factored out so the phase 5 transformation can render
// an exact match before morphing, instead of a simplified stand-in
// that visibly pops the moment the sequence begins
function drawBossStandardSphere(bx, by, r, effAccentA, effAccentB, effSkyTop) {
  ctx.save();
  const grad = ctx.createLinearGradient(0, by - r, 0, by + r);
  grad.addColorStop(0, '#ffd23f');
  grad.addColorStop(0.5, effAccentA);
  grad.addColorStop(1, effAccentB);
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = grad;
  ctx.fillRect(bx - r, by - r, r * 2, r * 2);
  ctx.fillStyle = effSkyTop;
  for (let i = 0; i < 5; i++) {
    const y = by + r * 0.15 * i - 2;
    ctx.fillRect(bx - r, y, r * 2, 3 + i);
  }

  const shadeGrad = ctx.createRadialGradient(
    bx - r * 0.35, by - r * 0.35, r * 0.05,
    bx, by, r * 1.05
  );
  shadeGrad.addColorStop(0, 'rgba(255,255,255,0.4)');
  shadeGrad.addColorStop(0.35, 'rgba(255,255,255,0.05)');
  shadeGrad.addColorStop(0.7, 'rgba(0,0,0,0)');
  shadeGrad.addColorStop(1, 'rgba(0,0,0,0.5)');
  ctx.fillStyle = shadeGrad;
  ctx.fillRect(bx - r, by - r, r * 2, r * 2);
  ctx.restore();
}

function drawBossEclipseForm(bx, by, r, theme) {
  ctx.save();

  const coronaLayers = 3;
  for (let layer = 0; layer < coronaLayers; layer++) {
    const numRays = 28;
    ctx.beginPath();
    for (let i = 0; i <= numRays; i++) {
      const ang = (i / numRays) * Math.PI * 2;
      const flareNoise = Math.sin(ang * 5 + frame * 0.02 + layer * 2) * 0.15
        + Math.sin(ang * 11 + frame * 0.015 + layer) * 0.08;
      const rayR = r * (1.15 + layer * 0.13 + flareNoise);
      const x = bx + Math.cos(ang) * rayR, y = by + Math.sin(ang) * rayR;
      i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    }
    ctx.closePath();
    const coronaGrad = ctx.createRadialGradient(bx, by, r * 0.85, bx, by, r * 1.7);
    coronaGrad.addColorStop(0, '#ffd23f');
    coronaGrad.addColorStop(0.4, theme.phase3AccentA);
    coronaGrad.addColorStop(1, 'rgba(255,0,0,0)');
    ctx.fillStyle = coronaGrad;
    ctx.globalAlpha = 0.55 - layer * 0.13;
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.fillStyle = '#050005';
  ctx.beginPath();
  ctx.arc(bx, by, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#ff6020';
  ctx.lineWidth = 2;
  ctx.shadowColor = '#ffb020';
  ctx.shadowBlur = 15;
  ctx.stroke();

  // diamond-ring highlight -- a single bright point near the upper
  // right rim, like the last visible sliver of light in an eclipse
  const highlightAng = -0.4;
  const hx = bx + Math.cos(highlightAng) * r, hy = by + Math.sin(highlightAng) * r;
  const sparkle = 0.7 + 0.3 * Math.sin(frame * 0.2);
  ctx.shadowBlur = 0;
  ctx.globalAlpha = sparkle;
  ctx.fillStyle = '#fff5cc';
  ctx.shadowColor = '#ffd23f';
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(hx, hy, r * 0.06, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// phase 5's dramatic transformation: tremble -> shatter outward
// (reusing the boss's own fragment positions, played in reverse of
// the entrance's converge-inward animation) -> a dark void beat ->
// the eclipse form snapping into place with a flash
function drawBossPhase5Transformation(theme, stageProgress) {
  const bx = boss.x, by = boss.y, r = boss.maxR;

  if (stageProgress < 0.2) {
    // stage 1: intense trembling -- uses the exact same standard
    // sphere renderer as normal gameplay, so there's no visual pop at
    // the instant the sequence begins. cracks flare at full intensity
    // and a thin glow outline builds as tension mounts
    const sp = stageProgress / 0.2;
    const jitterMag = 8 * sp;
    const jx = Math.sin(frame * 3.1) * jitterMag, jy = Math.cos(frame * 3.7) * jitterMag;
    drawBossStandardSphere(bx + jx, by + jy, r, theme.phase3AccentA, theme.phase3AccentB, theme.phase3SkyTop);
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx + jx, by + jy, r, 0, Math.PI * 2);
    ctx.clip();
    drawBossCracks(bx + jx, by + jy, r, 99999);
    ctx.restore();
    ctx.save();
    ctx.globalAlpha = sp * 0.25;
    ctx.strokeStyle = '#00e0ff';
    ctx.lineWidth = 3;
    ctx.shadowColor = '#00e0ff';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(bx + jx, by + jy, r * 1.02, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else if (stageProgress < 0.55) {
    // stage 2: crossfade morph from sphere to eclipse -- the orb never
    // shrinks or disappears, plus a dense burst of fragments and
    // sparks explodes outward, with staggered expanding shockwave
    // rings for scale
    const sp = (stageProgress - 0.2) / 0.35;
    const morphEase = sp * sp * (3 - 2 * sp);

    drawBossStandardSphere(bx, by, r, theme.phase3AccentA, theme.phase3AccentB, theme.phase3SkyTop);
    if (morphEase > 0.03) {
      ctx.save();
      ctx.globalAlpha = morphEase;
      drawBossEclipseForm(bx, by, r, theme);
      ctx.restore();
    }

    // dense burst -- the boss's own fragments plus extra small sparks
    ctx.save();
    for (const frag of boss.fragments) {
      const fx = bx + (frag.startX - bx) * sp * 1.6;
      const fy = by + (frag.startY - by) * sp * 1.6;
      ctx.shadowColor = '#00e0ff';
      ctx.shadowBlur = 8;
      ctx.fillStyle = '#00e0ff';
      ctx.globalAlpha = Math.max(0, 1 - sp * 1.1);
      ctx.beginPath();
      ctx.arc(fx, fy, frag.size, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 16; i++) {
      const ang = i * 0.393 + 0.15;
      const dist = r * (0.3 + sp * 2.2) * (0.7 + 0.3 * Math.sin(i * 3.1));
      const sx = bx + Math.cos(ang) * dist, sy = by + Math.sin(ang) * dist;
      ctx.fillStyle = i % 2 === 0 ? '#00e0ff' : '#ffd23f';
      ctx.shadowColor = ctx.fillStyle;
      ctx.shadowBlur = 6;
      ctx.globalAlpha = Math.max(0, 1 - sp * 1.3);
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // staggered expanding shockwave rings for scale
    ctx.save();
    for (let ring = 0; ring < 3; ring++) {
      const ringDelay = ring * 0.15;
      const ringSp = Math.max(0, sp - ringDelay);
      if (ringSp <= 0) continue;
      const ringR = r * (1 + ringSp * 2.5);
      const ringAlpha = Math.max(0, 1 - ringSp * 1.3);
      ctx.strokeStyle = '#00e0ff';
      ctx.lineWidth = 3 * (1 - ringSp) + 1;
      ctx.globalAlpha = ringAlpha * 0.6;
      ctx.beginPath();
      ctx.arc(bx, by, ringR, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  } else if (stageProgress < 0.68) {
    // stage 3: peak flash -- the climactic moment, big and bright
    drawBossEclipseForm(bx, by, r, theme);
    const sp = (stageProgress - 0.55) / 0.13;
    const flashAlpha = sp < 0.4 ? sp / 0.4 : Math.max(0, 1 - (sp - 0.4) / 0.6);
    ctx.save();
    ctx.fillStyle = `rgba(255,255,255,${flashAlpha})`;
    ctx.beginPath();
    ctx.arc(bx, by, r * 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else {
    // stage 4: eclipse fully settles in, with radiating lens-flare
    // rays fading in and a final lingering shockwave
    const sp = (stageProgress - 0.68) / 0.32;
    drawBossEclipseForm(bx, by, r, theme);

    ctx.save();
    const rayAlpha = Math.min(1, sp * 3) * Math.max(0, 1 - sp * 0.4);
    ctx.globalAlpha = rayAlpha * 0.5;
    ctx.strokeStyle = '#ffd23f';
    for (let i = 0; i < 8; i++) {
      const ang = i * 0.785 + frame * 0.005;
      const innerR = r * 1.1, outerR = r * (2.2 + 0.3 * Math.sin(i * 2 + frame * 0.03));
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx + Math.cos(ang) * innerR, by + Math.sin(ang) * innerR);
      ctx.lineTo(bx + Math.cos(ang) * outerR, by + Math.sin(ang) * outerR);
      ctx.stroke();
    }
    ctx.restore();

    if (sp < 0.3) {
      const ringSp = sp / 0.3;
      ctx.save();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2 * (1 - ringSp) + 0.5;
      ctx.globalAlpha = Math.max(0, 1 - ringSp) * 0.5;
      ctx.beginPath();
      ctx.arc(bx, by, r * (1.3 + ringSp * 1.8), 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

// the ultimate charge -- same eclipse form underneath, but with
// glow, sparks, and a pulsing ring all intensifying continuously as
// stageProgress climbs toward the detonation
function drawBossFinalCharge(theme, stageProgress) {
  const bx = boss.x, by = boss.y, r = boss.maxR;
  drawBossEclipseForm(bx, by, r, theme);

  ctx.save();
  ctx.globalAlpha = 0.3 + stageProgress * 0.6;
  ctx.fillStyle = '#fff5cc';
  ctx.shadowColor = '#ffd23f';
  ctx.shadowBlur = 15 + stageProgress * 30;
  ctx.beginPath();
  ctx.arc(bx, by, r * (0.15 + stageProgress * 0.35), 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  const numSparks = 6 + Math.floor(stageProgress * 10);
  for (let i = 0; i < numSparks; i++) {
    const ang = (i / numSparks) * Math.PI * 2 + frame * (0.02 + stageProgress * 0.05);
    const dist = r * (2.5 - stageProgress * 1.3) * (0.7 + 0.3 * Math.sin(i * 3 + frame * 0.1));
    const sx = bx + Math.cos(ang) * dist, sy = by + Math.sin(ang) * dist;
    ctx.globalAlpha = 0.4 + stageProgress * 0.5;
    ctx.fillStyle = '#ffd23f';
    ctx.shadowColor = '#ffd23f';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  const pulseSpeed = 0.1 + stageProgress * 0.3;
  const pulse = 0.5 + 0.5 * Math.sin(frame * pulseSpeed);
  ctx.globalAlpha = stageProgress * 0.5 * pulse;
  ctx.strokeStyle = '#00e0ff';
  ctx.lineWidth = 2 + stageProgress * 4;
  ctx.beginPath();
  ctx.arc(bx, by, r * 1.1, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

// the ending cinematic: burst outward from the boss, grow to cover
// the entire screen in white, hold, then fade away entirely --
// leaving nothing rendered so the ship is revealed alone afterward
function drawBossExplosion(theme, stageProgress) {
  const bx = boss.x, by = boss.y, r = boss.maxR;

  if (stageProgress < 0.15) {
    const sp = stageProgress / 0.15;
    drawBossEclipseForm(bx, by, r, theme);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = sp;
    ctx.beginPath();
    ctx.arc(bx, by, r * (1 + sp * 2), 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (stageProgress < 0.45) {
    const sp = (stageProgress - 0.15) / 0.3;
    const maxCoverR = Math.hypot(W, H);
    const currR = r * 3 + sp * (maxCoverR - r * 3);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = Math.min(1, sp * 1.5);
    ctx.beginPath();
    ctx.arc(bx, by, currR, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (stageProgress < 0.7) {
    const sp = (stageProgress - 0.45) / 0.25;
    const alpha = sp < 0.5 ? 1 : Math.max(0, 1 - (sp - 0.5) * 2);
    ctx.save();
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = alpha;
    ctx.fillRect(0, PLAY_TOP, W, PLAY_BOTTOM - PLAY_TOP);
    ctx.restore();
  }
  // beyond 0.7: nothing rendered -- boss is gone, ship revealed alone
}

// fills a rectangular region with a textured, animated flame appearance --
// layered gradient plus flickering jagged tongues plus drifting embers,
// clipped to the region so nothing bleeds outside it
function drawFlameTexture(rx, ry, rw, rh) {
  if (rw <= 0 || rh <= 0) return;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rx, ry, rw, rh);
  ctx.clip();

  const flicker = 0.88 + 0.12 * Math.sin(frame * 0.6);

  // base gradient: dark, hot red at the far edge fading toward brighter
  // orange/yellow near the middle, for depth rather than a flat fill
  const grad = ctx.createLinearGradient(rx, ry, rx + rw, ry);
  grad.addColorStop(0, `rgba(140,15,10,${0.9 * flicker})`);
  grad.addColorStop(0.5, `rgba(220,50,15,${0.92 * flicker})`);
  grad.addColorStop(1, `rgba(255,110,30,${0.85 * flicker})`);
  ctx.fillStyle = grad;
  ctx.fillRect(rx, ry, rw, rh);

  // a couple of large, translucent angular shard shapes for visual
  // weight -- jagged crystalline silhouettes rather than soft flame,
  // batched into one fill() call each
  const shardSpacing = 130;
  const shardCount = Math.ceil(rw / shardSpacing) + 1;
  ctx.fillStyle = 'rgba(140,15,10,0.4)';
  ctx.beginPath();
  for (let i = 0; i < shardCount; i++) {
    const seed = i * 9.13;
    const sx = rx + i * shardSpacing + Math.sin(seed) * 20;
    const segH = rh / 6;
    ctx.moveTo(sx, ry);
    for (let s = 0; s <= 6; s++) {
      const jitter = Math.sin(frame * 0.06 + seed + s * 2.3) * 22;
      ctx.lineTo(sx + jitter + (s % 2 === 0 ? 30 : -10), ry + s * segH);
    }
    ctx.lineTo(sx + 60, ry + rh);
    ctx.lineTo(sx - 10, ry + rh);
    ctx.closePath();
  }
  ctx.fill();

  // jagged energy shard bolts -- zigzagging lines running the height of
  // the region, sharp angular jitter (not smooth curves), two layers
  // (thick dim, thin bright) each batched into a single stroke() call
  function drawShardLayer(spacing, lineWidth, colorRGBA, jitterAmt, speedMult) {
    ctx.strokeStyle = colorRGBA;
    ctx.lineWidth = lineWidth;
    ctx.lineJoin = 'miter';
    const count = Math.ceil(rw / spacing) + 1;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const seed = i * 5.71;
      const baseX = rx + i * spacing + spacing * 0.5;
      const segCount = 7;
      const segH = rh / segCount;
      ctx.moveTo(baseX + Math.sin(frame * 0.1 * speedMult + seed) * jitterAmt, ry);
      for (let s = 1; s <= segCount; s++) {
        const jx = baseX + Math.sin(frame * 0.1 * speedMult + seed + s * 1.9) * jitterAmt;
        ctx.lineTo(jx, ry + s * segH);
      }
    }
    ctx.stroke();
  }
  ctx.globalAlpha = flicker;
  drawShardLayer(70, 5, 'rgba(255,120,30,0.7)', 24, 0.6);
  drawShardLayer(70, 2, 'rgba(255,235,170,0.85)', 16, 1.3);
  ctx.globalAlpha = 1;

  // drifting ember particles, batched into one path
  ctx.fillStyle = `rgba(255,200,80,${0.6 * flicker})`;
  ctx.beginPath();
  for (let i = 0; i < Math.max(3, Math.floor((rw * rh) / 9000)); i++) {
    const ex = rx + ((i * 53.7 + frame * 0.8) % rw);
    const ey = ry + ((i * 91.3 - frame * 0.5) % rh + rh) % rh;
    const emberFlicker = 0.5 + 0.5 * Math.sin(frame * 0.3 + i * 2.4);
    ctx.moveTo(ex + 1.5 + emberFlicker, ey);
    ctx.arc(ex, ey, 1.5 + emberFlicker, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.restore();
}

function drawMiniBossBarrage(theme) {
  if (!theme || !theme.isMiniBossZone) return;
  if (!miniBoss) return;
  if (miniBossAttackState !== 'barrageTelegraph' && miniBossAttackState !== 'barrageActive') return;
  ctx.save();

  if (miniBossAttackState === 'barrageTelegraph') {
    // no visual here currently -- the squeeze walls and ember lanes
    // themselves carry the barrage's telegraph once active
  } else {
    // squeeze walls -- solid bars with a glowing inner edge marking the
    // lethal boundary
    const wallPulse = 0.6 + 0.4 * Math.sin(frame * 0.3);
    ctx.fillStyle = 'rgba(40,10,20,0.92)';
    ctx.fillRect(0, 0, W, miniBossSqueezeTopY);
    ctx.fillRect(0, miniBossSqueezeBottomY, W, H - miniBossSqueezeBottomY);
    const topGrad = ctx.createLinearGradient(0, miniBossSqueezeTopY - MINI_BOSS_SQUEEZE_WALL_THICKNESS, 0, miniBossSqueezeTopY);
    topGrad.addColorStop(0, 'rgba(255,80,30,0)');
    topGrad.addColorStop(1, `rgba(255,100,40,${0.85 * wallPulse})`);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, miniBossSqueezeTopY - MINI_BOSS_SQUEEZE_WALL_THICKNESS, W, MINI_BOSS_SQUEEZE_WALL_THICKNESS);
    const bottomGrad = ctx.createLinearGradient(0, miniBossSqueezeBottomY, 0, miniBossSqueezeBottomY + MINI_BOSS_SQUEEZE_WALL_THICKNESS);
    bottomGrad.addColorStop(0, `rgba(255,100,40,${0.85 * wallPulse})`);
    bottomGrad.addColorStop(1, 'rgba(255,80,30,0)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, miniBossSqueezeBottomY, W, MINI_BOSS_SQUEEZE_WALL_THICKNESS);

    for (const e of miniBossBarrageEmbers) {
      const flicker = 0.8 + 0.2 * Math.sin(frame * 0.4 + e.y * 0.05);
      const glowGrad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, MINI_BOSS_BARRAGE_EMBER_R * 2.2);
      glowGrad.addColorStop(0, `rgba(255,220,150,${0.9 * flicker})`);
      glowGrad.addColorStop(0.5, `rgba(255,130,30,${0.6 * flicker})`);
      glowGrad.addColorStop(1, 'rgba(255,80,20,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(e.x, e.y, MINI_BOSS_BARRAGE_EMBER_R * 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,235,190,${flicker})`;
      ctx.beginPath();
      ctx.arc(e.x, e.y, MINI_BOSS_BARRAGE_EMBER_R * 0.6, 0, Math.PI * 2);
      ctx.fill();
      // short trailing streak for a sense of motion
      ctx.strokeStyle = `rgba(255,150,40,${0.4 * flicker})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(e.x, e.y);
      ctx.lineTo(e.x + 24, e.y);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawMiniBossFlameWall(theme) {
  if (!theme || !theme.isMiniBossZone) return;
  if (!miniBoss) return;
  if (miniBossAttackState !== 'flameWallTelegraph' && miniBossAttackState !== 'flameWallActive') return;
  const safeBoundary = miniBoss.x - miniBoss.r * 2;
  const MINI_BOSS_FLAME_VISUAL_GAP = 50; // purely cosmetic -- pushes the rendered fire away from the safe window's edge; the real safety boundary (used for collision, elsewhere) is untouched
  const visualBoundary = safeBoundary + MINI_BOSS_FLAME_VISUAL_GAP;
  ctx.save();

  if (miniBossAttackState === 'flameWallTelegraph') {
    // growing warning glow along the boundary line before it becomes lethal
    const stateElapsed = frame - miniBossAttackStateStartFrame;
    const progress = Math.min(1, stateElapsed / MINI_BOSS_FLAME_WALL_TELEGRAPH);
    const pulse = 0.5 + 0.5 * Math.sin(frame * 0.5);
    ctx.globalAlpha = progress * (0.3 + 0.3 * pulse);
    ctx.strokeStyle = '#ff5020';
    ctx.lineWidth = 4 + progress * 6;
    ctx.shadowColor = '#ff5020';
    ctx.shadowBlur = 15;
    ctx.beginPath();
    ctx.moveTo(visualBoundary, PLAY_TOP);
    ctx.lineTo(visualBoundary, PLAY_BOTTOM);
    ctx.stroke();
  } else {
    // safe window: a bounded box tracking the ship's current height,
    // rather than a full-height strip -- everything else (above, below,
    // and right of the boundary) is filled with real flame texture so
    // the ship reads as genuinely surrounded rather than behind a wall
    const windowH = MINI_BOSS_FLAME_WALL_WINDOW_H;
    const windowTop = Math.max(PLAY_TOP, Math.min(PLAY_BOTTOM - windowH, miniBoss.y - windowH / 2));
    const windowBottom = windowTop + windowH;

    drawFlameTexture(visualBoundary, PLAY_TOP, (W - visualBoundary) + 20, PLAY_BOTTOM - PLAY_TOP);
    drawFlameTexture(0, PLAY_TOP, visualBoundary, windowTop - PLAY_TOP);
    drawFlameTexture(0, windowBottom, visualBoundary, PLAY_BOTTOM - windowBottom);

    // bright outline around the safe window so it reads clearly as safe
    const pulse = 0.7 + 0.3 * Math.sin(frame * 0.3);
    ctx.strokeStyle = `rgba(15,240,252,${0.5 * pulse})`;
    ctx.lineWidth = 2;
    ctx.shadowColor = '#0ff0fc';
    ctx.shadowBlur = 10;
    ctx.strokeRect(0, windowTop, visualBoundary, windowH);
  }
  ctx.restore();
}

function drawCoreSparks() {
  for (const s of coreSparks) {
    // crackling electric tendrils radiating from the ball -- matches
    // Derelict Station's spark hub projectile exactly: evenly spaced
    // with a shared slow rotation so the overall shape stays symmetric,
    // with small independent jitter/length variation per tendril
    ctx.strokeStyle = '#5ec8e8';
    ctx.lineWidth = 1.2;
    ctx.shadowColor = '#5ec8e8';
    ctx.shadowBlur = 6;
    const tendrilCount = 6;
    const sharedRotation = frame * 0.03 + s.spawnX * 0.01;
    for (let i = 0; i < tendrilCount; i++) {
      const seed = s.spawnX * 0.03 + i * 5.3;
      const baseAngle = (i / tendrilCount) * Math.PI * 2 + sharedRotation;
      const jitterAngle = baseAngle + Math.sin(frame * 0.8 + seed) * 0.15;
      const len = CORE_SPARK_R * (1.2 + 0.4 * Math.abs(Math.sin(frame * 0.5 + seed)));
      const midLen = len * 0.5;
      const midAngle = baseAngle + Math.sin(frame * 0.9 + seed) * 0.12;
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + Math.cos(midAngle) * midLen, s.y + Math.sin(midAngle) * midLen);
      ctx.lineTo(s.x + Math.cos(jitterAngle) * len, s.y + Math.sin(jitterAngle) * len);
      ctx.stroke();
    }
    // bright core ball
    ctx.shadowBlur = 12;
    const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, CORE_SPARK_R);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.45, '#5ec8e8');
    grad.addColorStop(1, 'rgba(94,200,232,0.15)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(s.x, s.y, CORE_SPARK_R, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
  }
}

function drawReactorCoreAttacks(theme) {
  if (!theme || theme.miniBossVariant !== 'core') return;
  if (!miniBoss) return;
  const state = miniBossAttackState;
  ctx.save();

  if (coreBossPhase === 6 && (state === 'coreCrossfireTelegraph' ||
      state === 'coreCrossfireActive' || state === 'coreCrossfireGap')) {
    drawCoreSparks();
  }

  if (state === 'coreLaserTelegraph') {
    const stateElapsed = frame - miniBossAttackStateStartFrame;
    const progress = Math.min(1, stateElapsed / CORE_LASER_TELEGRAPH);
    const pulse = 0.5 + 0.5 * Math.sin(frame * 0.5);
    ctx.strokeStyle = `rgba(232,168,74,${0.5 * progress * pulse})`;
    ctx.lineWidth = 2 + progress * 2;
    ctx.setLineDash([10, 8]);
    ctx.shadowColor = '#e8a84a';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(0, coreLaserY);
    ctx.lineTo(miniBoss.x + 8, coreLaserY);
    ctx.stroke();
    ctx.setLineDash([]);
  } else if (state === 'coreLaserActive') {
    const beamRight = miniBoss.x + 8;
    const grad = ctx.createLinearGradient(0, coreLaserY - CORE_LASER_THICKNESS / 2, 0, coreLaserY + CORE_LASER_THICKNESS / 2);
    grad.addColorStop(0, 'rgba(94,200,232,0)');
    grad.addColorStop(0.5, 'rgba(220,245,255,0.95)');
    grad.addColorStop(1, 'rgba(94,200,232,0)');
    ctx.fillStyle = grad;
    ctx.shadowColor = '#5ec8e8';
    ctx.shadowBlur = 18;
    ctx.fillRect(0, coreLaserY - CORE_LASER_THICKNESS / 2, beamRight, CORE_LASER_THICKNESS);
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.fillRect(0, coreLaserY - 2, beamRight, 4);
  } else if (state === 'coreBulkheadTelegraph' || state === 'coreBulkheadActive') {
    let gapCenter = coreBulkheadGapCenter;
    if (coreBulkheadIsMoving && state === 'coreBulkheadActive') {
      const stateElapsed = frame - miniBossAttackStateStartFrame;
      gapCenter = (PLAY_TOP + PLAY_BOTTOM) / 2 + CORE_BULKHEAD_DRIFT_AMPLITUDE * Math.sin(stateElapsed * (2 * Math.PI / CORE_BULKHEAD_DRIFT_PERIOD));
    } else if (state === 'coreBulkheadTelegraph') {
      gapCenter = (PLAY_TOP + PLAY_BOTTOM) / 2;
    }
    const isTelegraph = state === 'coreBulkheadTelegraph';
    const stateElapsed = frame - miniBossAttackStateStartFrame;
    const closeProgress = isTelegraph ? Math.min(1, stateElapsed / CORE_BULKHEAD_TELEGRAPH) : 1;
    const gapHeight = CORE_BULKHEAD_GAP_HEIGHT + (1 - closeProgress) * (PLAY_BOTTOM - PLAY_TOP);
    const gapTop = gapCenter - gapHeight / 2;
    const gapBottom = gapCenter + gapHeight / 2;
    const bulkRightEdge = coreBulkheadX + 45;

    const barGrad = ctx.createLinearGradient(0, 0, bulkRightEdge, 0);
    barGrad.addColorStop(0, '#0c1117');
    barGrad.addColorStop(0.85, '#1c2833');
    barGrad.addColorStop(1, '#101820');
    ctx.fillStyle = barGrad;
    ctx.fillRect(0, PLAY_TOP, bulkRightEdge, Math.max(0, gapTop - PLAY_TOP));
    ctx.fillRect(0, gapBottom, bulkRightEdge, Math.max(0, PLAY_BOTTOM - gapBottom));

    const pulse = 0.6 + 0.4 * Math.sin(frame * 0.3);
    ctx.strokeStyle = `rgba(94,200,232,${0.7 * pulse})`;
    ctx.lineWidth = 3;
    ctx.shadowColor = '#5ec8e8';
    ctx.shadowBlur = 10;
    if (gapTop > PLAY_TOP) {
      ctx.beginPath();
      ctx.moveTo(0, gapTop);
      ctx.lineTo(bulkRightEdge, gapTop);
      ctx.stroke();
    }
    if (gapBottom < PLAY_BOTTOM) {
      ctx.beginPath();
      ctx.moveTo(0, gapBottom);
      ctx.lineTo(bulkRightEdge, gapBottom);
      ctx.stroke();
    }
    // rivets/panel lines for a mechanical read, scattered across the span
    ctx.shadowBlur = 0;
    ctx.strokeStyle = 'rgba(94,200,232,0.2)';
    ctx.lineWidth = 1;
    for (let px = 20; px < bulkRightEdge - 10; px += 70) {
      for (let py = PLAY_TOP + 15; py < gapTop; py += 30) {
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 40, py); ctx.stroke();
      }
      for (let py = gapBottom + 15; py < PLAY_BOTTOM; py += 30) {
        ctx.beginPath(); ctx.moveTo(px, py); ctx.lineTo(px + 40, py); ctx.stroke();
      }
    }
  } else if (state === 'coreSparkDeploy') {
    drawCoreSparks();
    // beam volleys, drawn on top of the sparks when active
    if (coreP3BeamState === 'telegraph') {
      const stateElapsed = frame - coreP3BeamStateStartFrame;
      const progress = Math.min(1, stateElapsed / CORE_P3_BEAM_TELEGRAPH);
      const pulse = 0.5 + 0.5 * Math.sin(frame * 0.5);
      const beamRight = miniBoss.x + 8;
      ctx.strokeStyle = `rgba(232,168,74,${0.5 * progress * pulse})`;
      ctx.lineWidth = 2 + progress * 2;
      ctx.setLineDash([10, 8]);
      for (const by of coreP3BeamYs) {
        ctx.beginPath();
        ctx.moveTo(0, by);
        ctx.lineTo(beamRight, by);
        ctx.stroke();
      }
      ctx.setLineDash([]);
    } else if (coreP3BeamState === 'active') {
      const beamRight = miniBoss.x + 8;
      for (const by of coreP3BeamYs) {
        const grad = ctx.createLinearGradient(0, by - CORE_P3_BEAM_THICKNESS / 2, 0, by + CORE_P3_BEAM_THICKNESS / 2);
        grad.addColorStop(0, 'rgba(94,200,232,0)');
        grad.addColorStop(0.5, 'rgba(220,245,255,0.95)');
        grad.addColorStop(1, 'rgba(94,200,232,0)');
        ctx.fillStyle = grad;
        ctx.shadowColor = '#5ec8e8';
        ctx.shadowBlur = 18;
        ctx.fillRect(0, by - CORE_P3_BEAM_THICKNESS / 2, beamRight, CORE_P3_BEAM_THICKNESS);
        ctx.fillStyle = 'rgba(255,255,255,0.9)';
        ctx.fillRect(0, by - 2, beamRight, 4);
      }
      ctx.shadowBlur = 0;
    }
  } else if (state === 'coreEmpTelegraph') {
    const stateElapsed = frame - miniBossAttackStateStartFrame;
    const progress = Math.min(1, stateElapsed / CORE_EMP_TELEGRAPH);
    const squeezeCenter = (PLAY_TOP + PLAY_BOTTOM) / 2;
    const targetTopY = squeezeCenter - CORE_SQUEEZE_MAX_GAP / 2;
    const targetBottomY = squeezeCenter + CORE_SQUEEZE_MAX_GAP / 2;
    const previewTopY = PLAY_TOP + (targetTopY - PLAY_TOP) * progress;
    const previewBottomY = PLAY_BOTTOM + (targetBottomY - PLAY_BOTTOM) * progress;
    const wallPulse = 0.6 + 0.4 * Math.sin(frame * 0.3);
    ctx.globalAlpha = progress;
    ctx.fillStyle = 'rgba(10,14,20,0.92)';
    ctx.fillRect(0, 0, W, previewTopY);
    ctx.fillRect(0, previewBottomY, W, H - previewBottomY);
    const topGrad = ctx.createLinearGradient(0, previewTopY - MINI_BOSS_SQUEEZE_WALL_THICKNESS, 0, previewTopY);
    topGrad.addColorStop(0, 'rgba(94,200,232,0)');
    topGrad.addColorStop(1, `rgba(94,200,232,${0.85 * wallPulse})`);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, previewTopY - MINI_BOSS_SQUEEZE_WALL_THICKNESS, W, MINI_BOSS_SQUEEZE_WALL_THICKNESS);
    const bottomGrad = ctx.createLinearGradient(0, previewBottomY, 0, previewBottomY + MINI_BOSS_SQUEEZE_WALL_THICKNESS);
    bottomGrad.addColorStop(0, `rgba(94,200,232,${0.85 * wallPulse})`);
    bottomGrad.addColorStop(1, 'rgba(94,200,232,0)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, previewBottomY, W, MINI_BOSS_SQUEEZE_WALL_THICKNESS);
    ctx.globalAlpha = 1;
  } else if (state === 'coreEmpActive') {
    const wallPulse = 0.6 + 0.4 * Math.sin(frame * 0.3);
    ctx.fillStyle = 'rgba(10,14,20,0.92)';
    ctx.fillRect(0, 0, W, coreSqueezeTopY);
    ctx.fillRect(0, coreSqueezeBottomY, W, H - coreSqueezeBottomY);
    const topGrad = ctx.createLinearGradient(0, coreSqueezeTopY - MINI_BOSS_SQUEEZE_WALL_THICKNESS, 0, coreSqueezeTopY);
    topGrad.addColorStop(0, 'rgba(94,200,232,0)');
    topGrad.addColorStop(1, `rgba(94,200,232,${0.85 * wallPulse})`);
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, coreSqueezeTopY - MINI_BOSS_SQUEEZE_WALL_THICKNESS, W, MINI_BOSS_SQUEEZE_WALL_THICKNESS);
    const bottomGrad = ctx.createLinearGradient(0, coreSqueezeBottomY, 0, coreSqueezeBottomY + MINI_BOSS_SQUEEZE_WALL_THICKNESS);
    bottomGrad.addColorStop(0, `rgba(94,200,232,${0.85 * wallPulse})`);
    bottomGrad.addColorStop(1, 'rgba(94,200,232,0)');
    ctx.fillStyle = bottomGrad;
    ctx.fillRect(0, coreSqueezeBottomY, W, MINI_BOSS_SQUEEZE_WALL_THICKNESS);

    for (const e of coreEmpPulses) {
      const flicker = 0.8 + 0.2 * Math.sin(frame * 0.4 + e.y * 0.05);
      const glowGrad = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, CORE_EMP_R * 2.4);
      glowGrad.addColorStop(0, `rgba(220,245,255,${0.9 * flicker})`);
      glowGrad.addColorStop(0.5, `rgba(94,200,232,${0.6 * flicker})`);
      glowGrad.addColorStop(1, 'rgba(94,200,232,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(e.x, e.y, CORE_EMP_R * 2.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = `rgba(220,245,255,${flicker})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + frame * 0.1;
        ctx.moveTo(e.x, e.y);
        ctx.lineTo(e.x + Math.cos(a) * CORE_EMP_R * 0.9, e.y + Math.sin(a) * CORE_EMP_R * 0.9);
      }
      ctx.stroke();
    }
  } else if (state === 'coreCrossfireTelegraph') {
    const stateElapsed = frame - miniBossAttackStateStartFrame;
    const progress = Math.min(1, stateElapsed / CORE_CROSSFIRE_TELEGRAPH);
    const pulse = 0.5 + 0.5 * Math.sin(frame * 0.5);
    const beamRight = miniBoss.x + 8;
    ctx.strokeStyle = `rgba(232,168,74,${0.5 * progress * pulse})`;
    ctx.lineWidth = 2 + progress * 2;
    ctx.setLineDash([10, 8]);
    for (const by of coreCrossfireBeamYs) {
      ctx.beginPath();
      ctx.moveTo(0, by);
      ctx.lineTo(beamRight, by);
      ctx.stroke();
    }
    ctx.setLineDash([]);
  } else if (state === 'coreCrossfireActive') {
    const beamRight = miniBoss.x + 8;
    for (const by of coreCrossfireBeamYs) {
      const grad = ctx.createLinearGradient(0, by - CORE_CROSSFIRE_THICKNESS / 2, 0, by + CORE_CROSSFIRE_THICKNESS / 2);
      grad.addColorStop(0, 'rgba(94,200,232,0)');
      grad.addColorStop(0.5, 'rgba(220,245,255,0.95)');
      grad.addColorStop(1, 'rgba(94,200,232,0)');
      ctx.fillStyle = grad;
      ctx.shadowColor = '#5ec8e8';
      ctx.shadowBlur = 18;
      ctx.fillRect(0, by - CORE_CROSSFIRE_THICKNESS / 2, beamRight, CORE_CROSSFIRE_THICKNESS);
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      ctx.fillRect(0, by - 2, beamRight, 4);
    }
    ctx.shadowBlur = 0;
  } else if (state === 'coreOrbitBarrageActive') {
    for (const p of coreOrbitProjectiles) {
      const pulse = 0.7 + 0.3 * Math.sin(frame * 0.3 + p.angle * 3);
      const glowGrad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, CORE_ORBIT_R * 1.8);
      glowGrad.addColorStop(0, `rgba(232,168,74,${0.85 * pulse})`);
      glowGrad.addColorStop(0.6, `rgba(94,200,232,${0.5 * pulse})`);
      glowGrad.addColorStop(1, 'rgba(94,200,232,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(p.x, p.y, CORE_ORBIT_R * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = `rgba(255,235,200,${0.9 * pulse})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, CORE_ORBIT_R * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // eye beam sub-cycle visual
    const eyeAngle = Math.atan2(coreEyeBeamY - miniBoss.y, ship.x - miniBoss.x);
    const eyeX = miniBoss.x + Math.cos(eyeAngle) * miniBoss.r * 0.15;
    const eyeY = miniBoss.y + Math.sin(eyeAngle) * miniBoss.r * 0.15;
    if (coreEyeBeamState === 'track' || coreEyeBeamState === 'lock') {
      const lockT = coreEyeBeamState === 'lock' ? Math.min(1, (frame - coreEyeBeamStateStartFrame) / CORE_EYEBEAM_LOCK_DURATION) : 0;
      const pulse = 0.5 + 0.5 * Math.sin(frame * (coreEyeBeamState === 'lock' ? 0.7 : 0.3));
      const intensity = coreEyeBeamState === 'lock' ? 0.5 + 0.4 * lockT : 0.35;
      ctx.strokeStyle = `rgba(255,90,70,${intensity * pulse})`;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(eyeX, eyeY);
      ctx.lineTo(ship.x, coreEyeBeamY);
      ctx.stroke();
      ctx.setLineDash([]);
      const reticleR = 12 + 4 * pulse;
      ctx.strokeStyle = `rgba(255,120,90,${(intensity + 0.2) * pulse})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(ship.x, coreEyeBeamY, reticleR, 0, Math.PI * 2);
      ctx.stroke();
    } else if (coreEyeBeamState === 'active') {
      // extrapolate the line through the exact reticle point (ship.x,
      // coreEyeBeamY) out to the screen edge, preserving the same slope
      // the tracking line used -- connecting straight to (0, coreEyeBeamY)
      // would have a different slope and miss the reticle position entirely
      const slope = (coreEyeBeamY - eyeY) / (ship.x - eyeX);
      const beamStartX = 0;
      const beamStartY = eyeY + slope * (beamStartX - eyeX);
      const grad = ctx.createLinearGradient(eyeX, eyeY, beamStartX, beamStartY);
      grad.addColorStop(0, 'rgba(255,220,200,0.95)');
      grad.addColorStop(1, 'rgba(255,60,40,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = CORE_EYEBEAM_THICKNESS;
      ctx.lineCap = 'round';
      ctx.shadowColor = '#ff5a46';
      ctx.shadowBlur = 18;
      ctx.beginPath();
      ctx.moveTo(eyeX, eyeY);
      ctx.lineTo(beamStartX, beamStartY);
      ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(eyeX, eyeY);
      ctx.lineTo(beamStartX, beamStartY);
      ctx.stroke();
      ctx.lineCap = 'butt';
      // bright origin flash where the beam meets the sphere
      const originGlow = ctx.createRadialGradient(eyeX, eyeY, 0, eyeX, eyeY, 28);
      originGlow.addColorStop(0, 'rgba(255,220,200,0.95)');
      originGlow.addColorStop(1, 'rgba(255,90,70,0)');
      ctx.fillStyle = originGlow;
      ctx.beginPath();
      ctx.arc(eyeX, eyeY, 28, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // tesla discharge burst sub-cycle visual
    if (coreTeslaState === 'charging') {
      const chargeProgress = Math.min(1, (frame - coreTeslaStateStartFrame) / CORE_TESLA_CHARGE_DURATION);
      const teslaPulse = 0.5 + 0.5 * Math.sin(frame * 0.3);
      const glowR = miniBoss.r * (1.1 + 0.3 * chargeProgress);
      const glowGrad = ctx.createRadialGradient(miniBoss.x, miniBoss.y, miniBoss.r * 0.5, miniBoss.x, miniBoss.y, glowR);
      glowGrad.addColorStop(0, `rgba(232,168,74,${0.5 * chargeProgress * teslaPulse})`);
      glowGrad.addColorStop(1, 'rgba(232,168,74,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(miniBoss.x, miniBoss.y, glowR, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const p of coreTeslaProjectiles) {
      const sparkGlow = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, CORE_TESLA_PROJECTILE_R * 2);
      sparkGlow.addColorStop(0, 'rgba(255,220,150,0.9)');
      sparkGlow.addColorStop(1, 'rgba(232,168,74,0)');
      ctx.fillStyle = sparkGlow;
      ctx.beginPath();
      ctx.arc(p.x, p.y, CORE_TESLA_PROJECTILE_R * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = 'rgba(255,245,220,0.95)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, CORE_TESLA_PROJECTILE_R * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawReactorCoreBody(x, y, r) {
  ctx.save();

  // cool cyan glow instead of fire corona
  const flicker = 0.85 + 0.1 * Math.sin(frame * 0.15);
  const glowR = r * (1.35 + 0.08 * Math.sin(frame * 0.08));
  const glowGrad = ctx.createRadialGradient(x, y, r * 0.4, x, y, glowR * flicker);
  glowGrad.addColorStop(0, 'rgba(94,200,232,0.4)');
  glowGrad.addColorStop(0.6, 'rgba(94,200,232,0.15)');
  glowGrad.addColorStop(1, 'rgba(94,200,232,0)');
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(x, y, glowR * flicker, 0, Math.PI * 2);
  ctx.fill();

  // base sphere: dark armored metal with a cool rim-light, not a glowing gradient
  const coreGrad = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, r * 0.15, x, y, r);
  coreGrad.addColorStop(0, '#3a434c');
  coreGrad.addColorStop(0.5, '#232b33');
  coreGrad.addColorStop(0.85, '#12181e');
  coreGrad.addColorStop(1, '#5ec8e8');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  // glowing circuit-line paneling across the surface, clipped to the sphere
  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  const circuitPulse = 0.6 + 0.4 * Math.sin(frame * 0.06);
  ctx.strokeStyle = `rgba(94,200,232,${0.55 * circuitPulse})`;
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2 + frame * 0.003;
    ctx.beginPath();
    ctx.arc(x, y, r * (0.35 + i * 0.13), a, a + Math.PI * 1.1);
    ctx.stroke();
  }
  ctx.restore();

  // slowly rotating outer armor ring -- sells "mechanical" motion, distinct
  // from anything the fire boss does
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(frame * 0.012);
  ctx.strokeStyle = `rgba(232,168,74,${0.7 * flicker})`;
  ctx.lineWidth = 3;
  ctx.setLineDash([r * 0.35, r * 0.22]);
  ctx.beginPath();
  ctx.arc(0, 0, r * 1.12, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();

  // central sensor "eye" -- tracks the ship
  const eyeAngle = Math.atan2(ship.y - y, ship.x - x);
  const eyeOffset = r * 0.15;
  const ex = x + Math.cos(eyeAngle) * eyeOffset, ey = y + Math.sin(eyeAngle) * eyeOffset;
  const eyePulse = 0.7 + 0.3 * Math.sin(frame * 0.2);
  ctx.fillStyle = '#0a0e14';
  ctx.beginPath();
  ctx.arc(ex, ey, r * 0.32, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = `rgba(220,245,255,${0.9 * eyePulse})`;
  ctx.shadowColor = '#5ec8e8';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(ex, ey, r * 0.16, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  // small orbiting sensor/warning lights instead of fire sparks
  for (let i = 0; i < 4; i++) {
    const a = frame * 0.02 + i * (Math.PI * 2 / 4);
    const dist = r * (1.15 + 0.15 * Math.sin(frame * 0.05 + i * 3));
    const sx = x + Math.cos(a) * dist;
    const sy = y + Math.sin(a) * dist * 0.7;
    ctx.fillStyle = `rgba(232,168,74,${0.6 + 0.3 * Math.sin(frame * 0.25 + i)})`;
    ctx.beginPath();
    ctx.arc(sx, sy, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function moltenCoreChargeMotion() {
  if (!miniBoss) return null;
  const state = miniBossAttackState;
  let dir = 0;
  let intensity = 0;
  if (state === 'charging') {
    dir = miniBossChargeIndex % 2 === 0 ? -1 : 1;
    intensity = 1;
  } else if (state === 'exiting') {
    dir = 1;
    intensity = 0.5;
  } else if (state === 'chargingClose') {
    dir = -1;
    const stopX = ship.x + MINI_BOSS_CLOSE_CHARGE_STOP_OFFSET;
    intensity = Math.min(1, Math.max(0, (miniBoss.x - stopX) / 240));
  }
  if (!dir || intensity < 0.05) return null;
  return { dir, intensity };
}

function drawMoltenCoreBody(x, y, r, opts) {
  const stretchX = (opts && opts.stretchX) || 1;
  const stretchY = (opts && opts.stretchY) || 1;
  const alpha = opts && opts.alpha != null ? opts.alpha : 1;
  const sparks = !opts || opts.sparks !== false;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.translate(x, y);
  ctx.scale(stretchX, stretchY);

  const flicker = 0.85 + 0.15 * Math.sin(frame * 0.4) + 0.08 * Math.sin(frame * 0.17 + 2);
  const coronaR = r * (1.5 + 0.15 * Math.sin(frame * 0.12));
  const coronaGrad = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, coronaR * flicker);
  coronaGrad.addColorStop(0, 'rgba(255,150,30,0.55)');
  coronaGrad.addColorStop(0.6, 'rgba(255,80,20,0.25)');
  coronaGrad.addColorStop(1, 'rgba(255,50,10,0)');
  ctx.fillStyle = coronaGrad;
  ctx.beginPath();
  ctx.arc(0, 0, coronaR * flicker, 0, Math.PI * 2);
  ctx.fill();

  const coreGrad = ctx.createRadialGradient(-r * 0.25, -r * 0.25, r * 0.1, 0, 0, r);
  coreGrad.addColorStop(0, '#fff5cc');
  coreGrad.addColorStop(0.35, '#ffcc33');
  coreGrad.addColorStop(0.7, '#ff5020');
  coreGrad.addColorStop(1, '#a01a00');
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();

  if (sparks) {
    for (let i = 0; i < 5; i++) {
      const a = frame * 0.02 + i * (Math.PI * 2 / 5);
      const dist = r * (1.1 + 0.3 * Math.sin(frame * 0.05 + i * 3));
      const sx = Math.cos(a) * dist;
      const sy = Math.sin(a) * dist * 0.7;
      const sparkR = 2.5 + 1.5 * Math.sin(frame * 0.3 + i * 2);
      ctx.fillStyle = 'rgba(255,180,60,' + (0.6 + 0.3 * Math.sin(frame * 0.25 + i)) + ')';
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(0.5, sparkR), 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

function drawMoltenCoreChargeSmear(x, y, r, motion) {
  const { dir, intensity } = motion;
  const behind = -dir;
  const streakLen = r * (2.8 + 4.2 * intensity);

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const streak = ctx.createLinearGradient(x, y, x + behind * streakLen, y);
  streak.addColorStop(0, `rgba(255,230,140,${0.42 * intensity})`);
  streak.addColorStop(0.18, `rgba(255,140,40,${0.28 * intensity})`);
  streak.addColorStop(0.55, `rgba(255,50,16,${0.12 * intensity})`);
  streak.addColorStop(1, 'rgba(255,30,8,0)');
  ctx.fillStyle = streak;
  ctx.beginPath();
  ctx.ellipse(x + behind * streakLen * 0.38, y, streakLen * 0.55, r * (0.55 + 0.22 * intensity), 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = `rgba(255,210,90,${0.28 * intensity})`;
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  for (let i = 0; i < 5; i++) {
    const seed = i * 1.7 + frame * 0.13;
    const oy = (i - 2) * r * 0.28 + Math.sin(seed) * r * 0.08;
    const len = r * (1.4 + intensity * 2.1 + (i % 3) * 0.35);
    const start = x + behind * r * 0.35;
    ctx.globalAlpha = 0.35 * intensity * (0.55 + 0.45 * Math.abs(Math.sin(seed)));
    ctx.beginPath();
    ctx.moveTo(start, y + oy);
    ctx.lineTo(start + behind * len, y + oy * 1.05);
    ctx.stroke();
  }
  ctx.restore();

  for (let i = 4; i >= 1; i--) {
    const t = i / 4;
    const trailX = x + behind * r * (0.55 + i * 0.95) * intensity;
    const trailY = y + Math.sin(frame * 0.4 + i) * 1.5 * intensity;
    drawMoltenCoreBody(trailX, trailY, r * (1 + 0.06 * i), {
      stretchX: 1.25 + t * 0.55 * intensity,
      stretchY: 0.78 - t * 0.08 * intensity,
      alpha: 0.22 * (1 - t * 0.45) * intensity,
      sparks: false
    });
  }

  for (let i = 0; i < 7; i++) {
    const t = (i + (frame * 0.35) % 1) / 7;
    const px = x + behind * r * (0.8 + t * 3.4 * intensity);
    const py = y + Math.sin(frame * 0.55 + i * 2.1) * r * 0.42;
    ctx.fillStyle = `rgba(255,${160 - i * 12},40,${(0.45 - t * 0.35) * intensity})`;
    ctx.beginPath();
    ctx.arc(px, py, 1.6 + (1 - t) * 2.4, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMiniBoss(theme) {
  if (!theme || !theme.isMiniBossZone) return;
  if (!miniBoss) return;
  const x = miniBoss.x, y = miniBoss.y, r = miniBoss.r;
  if (r <= 0) return;
  if (miniBossAttackState === 'dying') {
    drawMiniBossDying(x, y, r, frame - miniBossAttackStateStartFrame);
    return;
  }
  if (miniBossAttackState === 'coreDying') {
    drawCoreBossDying(x, y, r, frame - miniBossAttackStateStartFrame);
    return;
  }
  if (miniBossAttackState === 'coreOverloadDying') {
    drawCoreOverloadDeath(x, y, r, frame - miniBossAttackStateStartFrame);
    return;
  }
  if (miniBossAttackState === 'coreGateOpen') {
    drawReactorCoreGate(x, coreGateOpenAmount);
    return;
  }
  if (miniBossAttackState === 'coreSphereEmerge' || miniBossAttackState === 'coreOrbitBarrageActive') {
    drawReactorCoreGate(miniBoss.restX, 1);
    drawReactorCoreBody(x, y, r);
    return;
  }
  if (theme.miniBossVariant === 'core') {
    drawReactorCoreWallBoss(x, r);
    return;
  }

  const motion = moltenCoreChargeMotion();
  if (motion) {
    drawMoltenCoreChargeSmear(x, y, r, motion);
    const behind = -motion.dir;
    ctx.save();
    ctx.translate(behind * r * 0.2 * motion.intensity, 0);
    drawMoltenCoreBody(x, y, r, {
      stretchX: 1 + 0.62 * motion.intensity,
      stretchY: 1 - 0.32 * motion.intensity,
      sparks: true
    });
    ctx.restore();
    return;
  }

  drawMoltenCoreBody(x, y, r);
}

function drawReactorCoreGate(x, openAmount) {
  ctx.save();
  const wallTop = PLAY_TOP, wallBottom = PLAY_BOTTOM, wallThickness = 120;
  const center = (wallTop + wallBottom) / 2;
  const slide = openAmount * (wallThickness * 1.1);

  ctx.fillStyle = 'rgba(2,3,5,0.97)';
  ctx.fillRect(x + wallThickness, 0, W - (x + wallThickness), H);

  // dark opening glow, growing as the gate opens
  if (openAmount > 0.02) {
    const glowGrad = ctx.createRadialGradient(x + wallThickness / 2, center, 0, x + wallThickness / 2, center, wallThickness * 0.9);
    glowGrad.addColorStop(0, `rgba(94,200,232,${0.4 * openAmount})`);
    glowGrad.addColorStop(1, 'rgba(94,200,232,0)');
    ctx.fillStyle = glowGrad;
    ctx.fillRect(x, wallTop, wallThickness, wallBottom - wallTop);
  }

  // top half, sliding up and off
  const topH = center - wallTop;
  const topGrad = ctx.createLinearGradient(x, 0, x + wallThickness, 0);
  topGrad.addColorStop(0, '#232c36');
  topGrad.addColorStop(0.15, '#161d25');
  topGrad.addColorStop(1, '#0a0d12');
  ctx.fillStyle = topGrad;
  ctx.fillRect(x, wallTop - slide, wallThickness, topH);

  // bottom half, sliding down and off
  const botH = wallBottom - center;
  ctx.fillStyle = topGrad;
  ctx.fillRect(x, center + slide, wallThickness, botH);

  ctx.restore();
}

function drawCoreBossDying(x, y, r, stateElapsed) {
  const dimEnd = CORE_DEATH_DIM_DURATION;
  const darkenEnd = dimEnd + CORE_DEATH_DARKEN_DURATION;
  const dimT = Math.max(0, Math.min(1, stateElapsed / dimEnd));
  const darkenT = Math.max(0, Math.min(1, (stateElapsed - dimEnd) / CORE_DEATH_DARKEN_DURATION));
  const collapseT = Math.max(0, Math.min(1, (stateElapsed - darkenEnd) / CORE_DEATH_COLLAPSE_DURATION));
  const effR = r * (1 - collapseT);

  ctx.save();

  if (effR > 0.5) {
    const glowFade = Math.max(0, 1 - dimT * 1.3 - darkenT * 0.7);
    if (glowFade > 0.01) {
      const flicker = 0.85 + 0.1 * Math.sin(frame * 0.3);
      const glowR = effR * (1.3 + 0.08 * Math.sin(frame * 0.1));
      const glowGrad = ctx.createRadialGradient(x, y, effR * 0.3, x, y, glowR * flicker);
      glowGrad.addColorStop(0, `rgba(94,200,232,${0.35 * glowFade})`);
      glowGrad.addColorStop(1, 'rgba(94,200,232,0)');
      ctx.fillStyle = glowGrad;
      ctx.beginPath();
      ctx.arc(x, y, glowR * flicker, 0, Math.PI * 2);
      ctx.fill();
    }

    // base sphere: active cyan dims toward a dull slate over stage 1, then
    // holds that dulled tone as the undercoat beneath the dark patches
    const c0 = lerpColor('#eaf8ff', '#5a6570', dimT);
    const c1 = lerpColor('#5ec8e8', '#3a434c', dimT);
    const c2 = lerpColor('#2a6a80', '#22262c', dimT);
    const c3 = lerpColor('#12303c', '#0c0e10', dimT);
    const coreGrad = ctx.createRadialGradient(x - effR * 0.25, y - effR * 0.25, effR * 0.1, x, y, effR);
    coreGrad.addColorStop(0, c0);
    coreGrad.addColorStop(0.35, c1);
    coreGrad.addColorStop(0.7, c2);
    coreGrad.addColorStop(1, c3);
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(x, y, effR, 0, Math.PI * 2);
    ctx.fill();

    // dark powered-off patches spread unevenly, each with a fading amber
    // warning-light edge before it goes fully cold
    if (darkenT > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, effR, 0, Math.PI * 2);
      ctx.clip();
      for (const patch of coreDeathPatches) {
        const patchT = Math.max(0, Math.min(1, (darkenT - patch.startFrac) / 0.5));
        if (patchT <= 0) continue;
        const px = x + Math.cos(patch.angle) * patch.distFrac * effR;
        const py = y + Math.sin(patch.angle) * patch.distFrac * effR;
        const patchR = effR * patch.sizeFrac * patchT;
        const darkGrad = ctx.createRadialGradient(px, py, 0, px, py, patchR);
        darkGrad.addColorStop(0, `rgba(8,9,10,${0.9 * patchT})`);
        darkGrad.addColorStop(0.7, `rgba(8,9,10,${0.75 * patchT})`);
        darkGrad.addColorStop(1, 'rgba(8,9,10,0)');
        ctx.fillStyle = darkGrad;
        ctx.beginPath();
        ctx.arc(px, py, patchR, 0, Math.PI * 2);
        ctx.fill();
        if (patchT < 0.9) {
          ctx.strokeStyle = `rgba(232,168,74,${0.5 * (1 - patchT)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px, py, patchR * 0.85, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  // metal debris chunks -- drawn regardless of exact sub-stage, so pieces
  // spawned late in collapse keep tumbling and fading through the pause after
  for (const p of coreDeathDebris) {
    const lifeT = p.life / p.maxLife;
    const alpha = lifeT < 0.15 ? lifeT / 0.15 : Math.max(0, 1 - (lifeT - 0.6) / 0.4);
    if (alpha <= 0.01) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = `rgba(35,42,50,${0.9 * alpha})`;
    ctx.strokeStyle = `rgba(94,200,232,${0.4 * alpha})`;
    ctx.lineWidth = 1;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  }

  ctx.restore();
}

function drawCoreOverloadDeath(x, y, r, stateElapsed) {
  const buildupEnd = CORE_OVERLOAD_BUILDUP_DURATION;
  const flashEnd = buildupEnd + CORE_OVERLOAD_FLASH_DURATION;
  const breakdownEnd = flashEnd + CORE_OVERLOAD_BREAKDOWN_DURATION;
  const buildupT = Math.max(0, Math.min(1, stateElapsed / buildupEnd));
  const flashT = Math.max(0, Math.min(1, (stateElapsed - buildupEnd) / CORE_OVERLOAD_FLASH_DURATION));
  const breakdownT = Math.max(0, Math.min(1, (stateElapsed - flashEnd) / CORE_OVERLOAD_BREAKDOWN_DURATION));
  const effR = r * (1 - breakdownT * 0.9);

  ctx.save();

  const jitterMag = buildupT * 4;
  const dx = x + (Math.random() - 0.5) * jitterMag;
  const dy = y + (Math.random() - 0.5) * jitterMag;

  if (effR > 0.5 && stateElapsed < flashEnd) {
    const glowIntensity = 0.3 + buildupT * 0.7;
    const glowR = effR * (1.3 + 0.3 * buildupT);
    const glowGrad = ctx.createRadialGradient(dx, dy, effR * 0.3, dx, dy, glowR);
    glowGrad.addColorStop(0, `rgba(150,230,255,${glowIntensity})`);
    glowGrad.addColorStop(1, 'rgba(94,200,232,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(dx, dy, glowR, 0, Math.PI * 2);
    ctx.fill();

    const c0 = lerpColor('#5ec8e8', '#ffffff', buildupT);
    const c1 = lerpColor('#2a6a80', '#c8f0ff', buildupT);
    const c2 = lerpColor('#12303c', '#5ec8e8', buildupT);
    const coreGrad = ctx.createRadialGradient(dx - effR * 0.25, dy - effR * 0.25, effR * 0.1, dx, dy, effR);
    coreGrad.addColorStop(0, '#ffffff');
    coreGrad.addColorStop(0.4, c0);
    coreGrad.addColorStop(0.75, c1);
    coreGrad.addColorStop(1, c2);
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(dx, dy, effR, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(dx, dy, effR, 0, Math.PI * 2);
    ctx.clip();
    for (const arcSpark of coreOverloadArcs) {
      const arcAlpha = 1 - arcSpark.life / arcSpark.maxLife;
      if (arcAlpha <= 0) continue;
      const x1 = dx + Math.cos(arcSpark.angle1) * effR;
      const y1 = dy + Math.sin(arcSpark.angle1) * effR;
      const x2 = dx + Math.cos(arcSpark.angle2) * effR;
      const y2 = dy + Math.sin(arcSpark.angle2) * effR;
      const midX = (x1 + x2) / 2 + (Math.random() - 0.5) * effR * 0.6;
      const midY = (y1 + y2) / 2 + (Math.random() - 0.5) * effR * 0.6;
      ctx.strokeStyle = `rgba(255,255,255,${arcAlpha})`;
      ctx.lineWidth = 2;
      ctx.shadowColor = '#c8f0ff';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(midX, midY);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  if (stateElapsed >= buildupEnd && stateElapsed < flashEnd) {
    const flashAlpha = flashT < 0.3 ? flashT / 0.3 : Math.max(0, 1 - (flashT - 0.3) / 0.7);
    const flashR = r * (2 + flashT * 3);
    const flashGrad = ctx.createRadialGradient(dx, dy, 0, dx, dy, flashR);
    flashGrad.addColorStop(0, `rgba(255,255,255,${0.95 * flashAlpha})`);
    flashGrad.addColorStop(0.4, `rgba(200,240,255,${0.6 * flashAlpha})`);
    flashGrad.addColorStop(1, 'rgba(94,200,232,0)');
    ctx.fillStyle = flashGrad;
    ctx.beginPath();
    ctx.arc(dx, dy, flashR, 0, Math.PI * 2);
    ctx.fill();
  }

  if (stateElapsed >= flashEnd && effR > 0.5) {
    const fadeAlpha = Math.max(0, 1 - breakdownT * 1.3);
    const coreGrad = ctx.createRadialGradient(dx, dy, 0, dx, dy, effR);
    coreGrad.addColorStop(0, `rgba(255,255,255,${fadeAlpha})`);
    coreGrad.addColorStop(0.6, `rgba(150,230,255,${fadeAlpha * 0.7})`);
    coreGrad.addColorStop(1, 'rgba(94,200,232,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(dx, dy, effR, 0, Math.PI * 2);
    ctx.fill();
  }

  for (const p of coreDeathDebris) {
    const lifeT = p.life / p.maxLife;
    const alpha = lifeT < 0.15 ? lifeT / 0.15 : Math.max(0, 1 - (lifeT - 0.6) / 0.4);
    if (alpha <= 0.01) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = `rgba(35,42,50,${0.9 * alpha})`;
    ctx.strokeStyle = `rgba(200,240,255,${0.6 * alpha})`;
    ctx.lineWidth = 1;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.strokeRect(-p.size / 2, -p.size / 2, p.size, p.size);
    ctx.restore();
  }

  ctx.restore();
}


function drawMiniBossDying(x, y, r, stateElapsed) {
  const dimEnd = MINI_BOSS_DEATH_DIM_DURATION;
  const ashEnd = dimEnd + MINI_BOSS_DEATH_ASH_DURATION;
  const dimT = Math.max(0, Math.min(1, stateElapsed / dimEnd));
  const ashT = Math.max(0, Math.min(1, (stateElapsed - dimEnd) / MINI_BOSS_DEATH_ASH_DURATION));
  const disperseT = Math.max(0, Math.min(1, (stateElapsed - ashEnd) / MINI_BOSS_DEATH_DISPERSE_DURATION));
  const effR = r * (1 - disperseT); // the ashed form shrinks away during the dispersal stage

  ctx.save();

  if (effR > 0.5) {
    // corona fades out as the boss dims, gone well before ashing finishes
    const coronaFade = Math.max(0, 1 - dimT * 1.3 - ashT * 0.7);
    if (coronaFade > 0.01) {
      const flicker = 0.85 + 0.1 * Math.sin(frame * 0.3);
      const coronaR = effR * (1.4 + 0.1 * Math.sin(frame * 0.1));
      const coronaGrad = ctx.createRadialGradient(x, y, effR * 0.3, x, y, coronaR * flicker);
      coronaGrad.addColorStop(0, `rgba(255,120,30,${0.4 * coronaFade})`);
      coronaGrad.addColorStop(1, 'rgba(255,50,10,0)');
      ctx.fillStyle = coronaGrad;
      ctx.beginPath();
      ctx.arc(x, y, coronaR * flicker, 0, Math.PI * 2);
      ctx.fill();
    }

    // base sphere: bright fire dims toward a dulled ember over stage 1,
    // then holds that dulled tone as the undercoat beneath the ash patches
    const c0 = lerpColor('#fff5cc', '#997755', dimT);
    const c1 = lerpColor('#ffcc33', '#805030', dimT);
    const c2 = lerpColor('#ff5020', '#552818', dimT);
    const c3 = lerpColor('#a01a00', '#2a1208', dimT);
    const coreGrad = ctx.createRadialGradient(x - effR * 0.25, y - effR * 0.25, effR * 0.1, x, y, effR);
    coreGrad.addColorStop(0, c0);
    coreGrad.addColorStop(0.35, c1);
    coreGrad.addColorStop(0.7, c2);
    coreGrad.addColorStop(1, c3);
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(x, y, effR, 0, Math.PI * 2);
    ctx.fill();

    // dark ash patches spread unevenly across the surface, each with a
    // glowing crack-like edge that fades as the patch matures
    if (ashT > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, effR, 0, Math.PI * 2);
      ctx.clip();
      for (const patch of miniBossDeathPatches) {
        const patchT = Math.max(0, Math.min(1, (ashT - patch.startFrac) / 0.5));
        if (patchT <= 0) continue;
        const px = x + Math.cos(patch.angle) * patch.distFrac * effR;
        const py = y + Math.sin(patch.angle) * patch.distFrac * effR;
        const patchR = effR * patch.sizeFrac * patchT;
        const ashGrad = ctx.createRadialGradient(px, py, 0, px, py, patchR);
        ashGrad.addColorStop(0, `rgba(20,18,16,${0.9 * patchT})`);
        ashGrad.addColorStop(0.7, `rgba(20,18,16,${0.75 * patchT})`);
        ashGrad.addColorStop(1, 'rgba(20,18,16,0)');
        ctx.fillStyle = ashGrad;
        ctx.beginPath();
        ctx.arc(px, py, patchR, 0, Math.PI * 2);
        ctx.fill();
        if (patchT < 0.9) {
          ctx.strokeStyle = `rgba(255,120,40,${0.5 * (1 - patchT)})`;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px, py, patchR * 0.85, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  }

  // ash particles -- drawn regardless of exact sub-stage, so flakes spawned
  // late in dispersal keep drifting and fading through the pause afterward
  for (const p of miniBossDeathAshParticles) {
    const lifeT = p.life / p.maxLife;
    const alpha = lifeT < 0.15 ? lifeT / 0.15 : Math.max(0, 1 - (lifeT - 0.6) / 0.4);
    if (alpha <= 0.01) continue;
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.rotation);
    ctx.fillStyle = `rgba(30,26,22,${0.85 * alpha})`;
    ctx.fillRect(-p.size / 2, -p.size / 3, p.size, p.size * 0.66);
    ctx.restore();
  }

  ctx.restore();
}

function drawBossArenaBarrierWall(theme, bossEntity) {
  if (!bossEntity) return;
  // once the boss is fully defeated, the wall recedes into the distance and
  // fades out during the quiet downtime beat, so it's completely gone
  // before the ship flies off screen -- previously it just stayed at full
  // strength, unchanged, through the entire victory sequence
  let recedeProgress = 0;
  if (bossFullyDefeated) {
    recedeProgress = (postBossDowntimeActive && postBossDowntimeStartFrame >= 0)
      ? Math.min(1, (frame - postBossDowntimeStartFrame) / POST_BOSS_DOWNTIME_DURATION)
      : 1; // downtime already finished (fly-off/victory underway) -- fully gone
  }
  if (recedeProgress >= 1) return;
  const fadeAlpha = 1 - recedeProgress;
  const wallX = bossEntity.x + bossEntity.maxR + 150 + recedeProgress * 500;
  if (wallX >= W) return;
  ctx.save();

  const pulse = 0.75 + 0.25 * Math.sin(frame * 0.08);
  // same progress value driving the background's phase-3 color shift, so
  // the wall's palette can never drift out of sync with it again
  const colorProgress = getBossColorProgress();
  const effMainColor = lerpHexColor(theme.accentB, theme.phase3AccentB, colorProgress);
  const effAccentColor = lerpHexColor(theme.accentA, theme.phase3AccentA, colorProgress);

  // dark backdrop beyond the wall -- "outside the arena"
  ctx.globalAlpha = fadeAlpha;
  ctx.fillStyle = 'rgba(5,3,12,0.94)';
  ctx.fillRect(wallX, 0, W - wallX, H);

  // soft outer glow behind the wall
  const glowGrad = ctx.createLinearGradient(wallX - 40, 0, wallX + 40, 0);
  glowGrad.addColorStop(0, effMainColor.replace('rgb', 'rgba').replace(')', ',0)'));
  glowGrad.addColorStop(0.5, effMainColor.replace('rgb', 'rgba').replace(')', `,${0.35 * pulse})`));
  glowGrad.addColorStop(1, effMainColor.replace('rgb', 'rgba').replace(')', ',0)'));
  ctx.fillStyle = glowGrad;
  ctx.fillRect(wallX - 40, 0, 80, H);

  // main containment bar
  ctx.globalAlpha = 0.75 * pulse * fadeAlpha;
  ctx.fillStyle = effMainColor;
  ctx.fillRect(wallX, 0, 12, H);
  // accent stripe
  ctx.globalAlpha = 0.6 * pulse * fadeAlpha;
  ctx.fillStyle = effAccentColor;
  ctx.fillRect(wallX + 14, 0, 4, H);
  ctx.globalAlpha = fadeAlpha;

  // segmented conduit ticks running the height of the barrier, evenly
  // spaced, batched into a single path
  ctx.fillStyle = `rgba(13,2,33,${0.6})`;
  ctx.beginPath();
  const tickSpacing = 42;
  for (let ty = 8; ty < H; ty += tickSpacing) {
    ctx.rect(wallX, ty, 12, 12);
  }
  ctx.fill();
  ctx.fillStyle = `rgba(255,210,63,${0.5 * pulse})`;
  ctx.beginPath();
  for (let ty = 8; ty < H; ty += tickSpacing) {
    ctx.arc(wallX + 6, ty + 6, 2, 0, Math.PI * 2);
  }
  ctx.fill();

  ctx.restore();
}

function drawBossArenaVignette(theme, bossEntity) {
  if (!bossEntity) return;
  const fadeStart = bossEntity.x + bossEntity.maxR + 150; // breathing room past the boss itself
  const fadeEnd = fadeStart + 380;
  if (fadeStart >= W) return; // nothing to draw if the screen is narrow enough that the boss already fills it
  ctx.save();
  const grad = ctx.createLinearGradient(fadeStart, 0, Math.min(fadeEnd, W), 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(1, 'rgba(0,0,0,0.96)');
  ctx.fillStyle = grad;
  ctx.fillRect(fadeStart, 0, W - fadeStart, H);
  if (fadeEnd < W) {
    ctx.fillStyle = 'rgba(0,0,0,0.96)';
    ctx.fillRect(fadeEnd, 0, W - fadeEnd, H);
  }
  ctx.restore();
}

// seeded once per mini boss spawn so the crack pattern doesn't jitter frame
// to frame; regenerated in resetGame's mini boss setup alongside restX
let miniBossWallCracks = [];

// seeded once per core boss spawn, mirrors miniBossWallCracks' pattern but
// for panel seams/rivets instead of rock cracks
let coreWallPanels = [];

// fixed emplacement heights along the wall boss -- purely visual anchor
// points; gameplay-critical projectile origins (EMP) stay centered
// separately to avoid misaligning with the squeeze walls
const CORE_WALL_LASER_Y_FRAC = 0.18;
const CORE_WALL_DRONE_Y_FRAC = 0.5;
const CORE_WALL_EMP_Y_FRAC = 0.82;

// seeded once per core boss spawn -- small glowing sensor details scattered
// across the facade for visual density, matching the reference's numerous
// small lit details
let coreWallSensors = [];

function drawReactorCoreWallBoss(x, effR) {
  ctx.save();
  const wallTop = PLAY_TOP, wallBottom = PLAY_BOTTOM;
  const collapseScale = Math.max(0, effR);
  const pulse = 0.7 + 0.3 * Math.sin(frame * 0.06);
  const wallThickness = 120; // one thick, solid mass -- not thin layered strips

  // dark void beyond the structure
  ctx.fillStyle = 'rgba(2,3,5,0.97)';
  ctx.fillRect(x + wallThickness, 0, W - (x + wallThickness), H);

  // soft glow at the leading edge
  const glowGrad = ctx.createLinearGradient(x - 40, 0, x + 10, 0);
  glowGrad.addColorStop(0, 'rgba(94,200,232,0)');
  glowGrad.addColorStop(1, `rgba(94,200,232,${0.3 * pulse * collapseScale})`);
  ctx.fillStyle = glowGrad;
  ctx.fillRect(x - 40, 0, 50, H);

  // ==== the mass itself -- heavy, dark armor plating, one solid block ====
  const plateGrad = ctx.createLinearGradient(x, 0, x + wallThickness, 0);
  plateGrad.addColorStop(0, '#232c36');
  plateGrad.addColorStop(0.15, '#161d25');
  plateGrad.addColorStop(1, '#0a0d12');
  ctx.fillStyle = plateGrad;
  ctx.fillRect(x, wallTop, wallThickness, wallBottom - wallTop);

  // a few bold structural seams (not many thin decorative ones) -- reads
  // as heavy armor plate divisions, not a fussy paneled facade
  if (coreWallPanels.length === 0) {
    const divisions = 4;
    for (let i = 1; i < divisions; i++) {
      coreWallPanels.push({ seamY: wallTop + (i / divisions) * (wallBottom - wallTop) });
    }
  }
  ctx.strokeStyle = 'rgba(0,0,0,0.5)';
  ctx.lineWidth = 4;
  for (const panel of coreWallPanels) {
    ctx.beginPath();
    ctx.moveTo(x, panel.seamY);
    ctx.lineTo(x + wallThickness, panel.seamY);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(94,200,232,0.25)';
  ctx.lineWidth = 1;
  for (const panel of coreWallPanels) {
    ctx.beginPath();
    ctx.moveTo(x, panel.seamY + 2);
    ctx.lineTo(x + wallThickness, panel.seamY + 2);
    ctx.stroke();
  }

  // heavy diagonal bracing across the mass -- sells "reinforced weapon
  // platform" rather than a smooth wall
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(x + 10, wallTop + 10);
  ctx.lineTo(x + wallThickness - 10, wallBottom * 0.4);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x + 10, wallBottom - 10);
  ctx.lineTo(x + wallThickness - 10, wallBottom * 0.6);
  ctx.stroke();

  // ==== weapon emplacements -- protrude toward the ship ====
  const emplacements = [
    { fracY: CORE_WALL_DRONE_Y_FRAC, active: miniBossAttackState === 'coreSparkDeploy', kind: 'bay' }
  ];
  for (const e of emplacements) {
    const ey = wallTop + e.fracY * (wallBottom - wallTop);
    const activePulse = e.active ? (0.6 + 0.4 * Math.sin(frame * 0.3)) : 0.4;
    const glowColor = e.active ? '232,168,74' : '94,200,232';
    const glowHex = e.active ? '#e8a84a' : '#5ec8e8';

    if (e.kind === 'bay') {
      // a heavy blast hatch -- thick beveled frame, warning-striped door
      const bayW = 44, bayH = 76;
      ctx.fillStyle = '#12171d';
      ctx.fillRect(x - bayW, ey - bayH / 2 - 4, bayW + 4, bayH + 8);
      const doorGrad = ctx.createLinearGradient(x - bayW + 6, 0, x - 4, 0);
      doorGrad.addColorStop(0, '#242e38');
      doorGrad.addColorStop(1, '#141b22');
      ctx.fillStyle = doorGrad;
      ctx.fillRect(x - bayW + 6, ey - bayH / 2, bayW - 10, bayH);
      ctx.strokeStyle = `rgba(${glowColor},${0.7 * activePulse})`;
      ctx.lineWidth = 3;
      ctx.shadowColor = glowHex;
      ctx.shadowBlur = e.active ? 14 : 4;
      ctx.strokeRect(x - bayW + 6, ey - bayH / 2, bayW - 10, bayH);
      ctx.shadowBlur = 0;
      // center seam, like double doors
      ctx.strokeStyle = 'rgba(0,0,0,0.5)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x - bayW / 2 - 2, ey - bayH / 2);
      ctx.lineTo(x - bayW / 2 - 2, ey + bayH / 2);
      ctx.stroke();
    }
  }


  // near-edge highlight so the boundary still reads clearly
  ctx.fillStyle = `rgba(94,200,232,${0.5 * pulse})`;
  ctx.fillRect(x, wallTop, 2, wallBottom - wallTop);

  ctx.restore();
}

function drawBossArenaBulkheadWall(theme, bossEntity) {
  if (!bossEntity) return;
  const wallX = bossEntity.restX + bossEntity.maxR + 150;
  if (wallX >= W) return;
  ctx.save();

  const pulse = 0.7 + 0.3 * Math.sin(frame * 0.06);
  const wallThickness = 46;

  ctx.fillStyle = 'rgba(2,3,5,0.97)';
  ctx.fillRect(wallX, 0, W - wallX, H);

  const glowGrad = ctx.createLinearGradient(wallX - 35, 0, wallX + 10, 0);
  glowGrad.addColorStop(0, 'rgba(94,200,232,0)');
  glowGrad.addColorStop(1, `rgba(94,200,232,${0.3 * pulse})`);
  ctx.fillStyle = glowGrad;
  ctx.fillRect(wallX - 35, 0, 45, H);

  // the bulkhead band itself -- dark reinforced metal plating
  const plateGrad = ctx.createLinearGradient(wallX, 0, wallX + wallThickness, 0);
  plateGrad.addColorStop(0, '#1c2833');
  plateGrad.addColorStop(0.5, '#101820');
  plateGrad.addColorStop(1, '#0a0e14');
  ctx.fillStyle = plateGrad;
  ctx.fillRect(wallX, 0, wallThickness, H);

  // panel seams with rivets, seeded once so they hold still
  if (coreWallPanels.length === 0) {
    const panelCount = Math.max(4, Math.ceil(H / 90));
    for (let i = 0; i < panelCount; i++) {
      const seamY = (i / panelCount) * H + Math.random() * 20;
      coreWallPanels.push({ seamY, phase: Math.random() * Math.PI * 2, hasLight: Math.random() < 0.6 });
    }
  }
  for (const panel of coreWallPanels) {
    ctx.strokeStyle = 'rgba(94,200,232,0.2)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(wallX + 4, panel.seamY);
    ctx.lineTo(wallX + wallThickness - 4, panel.seamY);
    ctx.stroke();
    // rivets at each end of the seam
    ctx.fillStyle = 'rgba(150,170,185,0.4)';
    ctx.beginPath();
    ctx.arc(wallX + 8, panel.seamY, 1.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(wallX + wallThickness - 8, panel.seamY, 1.8, 0, Math.PI * 2);
    ctx.fill();
    if (panel.hasLight) {
      const lightPulse = 0.5 + 0.5 * Math.sin(frame * 0.05 + panel.phase);
      ctx.fillStyle = `rgba(94,200,232,${0.8 * lightPulse})`;
      ctx.shadowColor = '#5ec8e8';
      ctx.shadowBlur = 6;
      ctx.beginPath();
      ctx.arc(wallX + wallThickness / 2, panel.seamY + 22, 2.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  // near-edge highlight
  ctx.fillStyle = `rgba(94,200,232,${0.5 * pulse})`;
  ctx.fillRect(wallX, 0, 2, H);

  ctx.restore();
}

function drawBossArenaObsidianWall(theme, bossEntity) {
  if (!bossEntity) return;
  // anchored to the boss's stable resting x, not its live (charge-swept)
  // position -- keeps the wall visually steady throughout the whole fight,
  // including charges where the boss itself sweeps across the screen
  let wallX = bossEntity.restX + bossEntity.maxR + 150;
  if (miniBossWallRecedeStartFrame !== -1) {
    // fight's over -- the wall breaks away and recedes off the right edge,
    // progressively revealing the escape run terrain that's already been
    // set up and is scrolling underneath it, rather than the scene cutting
    const recedeElapsed = frame - miniBossWallRecedeStartFrame;
    const recedeProgress = Math.min(1, recedeElapsed / MINI_BOSS_WALL_RECEDE_DURATION);
    const eased = recedeProgress * recedeProgress * recedeProgress; // ease-in cubic
    wallX = wallX + ((W + 200) - wallX) * eased;
  }
  if (wallX >= W) return;
  ctx.save();

  const pulse = 0.7 + 0.3 * Math.sin(frame * 0.06);
  const wallThickness = 46;

  // dark backdrop beyond the wall -- "outside the arena"
  ctx.fillStyle = 'rgba(4,2,3,0.97)';
  ctx.fillRect(wallX, 0, W - wallX, H);

  // soft glow bleeding out from the wall's near edge
  const glowGrad = ctx.createLinearGradient(wallX - 35, 0, wallX + 10, 0);
  glowGrad.addColorStop(0, 'rgba(255,90,20,0)');
  glowGrad.addColorStop(1, `rgba(255,90,20,${0.3 * pulse})`);
  ctx.fillStyle = glowGrad;
  ctx.fillRect(wallX - 35, 0, 45, H);

  // the obsidian rock band itself -- dark volcanic glass
  const rockGrad = ctx.createLinearGradient(wallX, 0, wallX + wallThickness, 0);
  rockGrad.addColorStop(0, '#231b1d');
  rockGrad.addColorStop(0.5, '#150f11');
  rockGrad.addColorStop(1, '#0c0709');
  ctx.fillStyle = rockGrad;
  ctx.fillRect(wallX, 0, wallThickness, H);

  // glowing fissure cracks running through the rock, seeded once so they
  // hold still rather than jittering
  if (miniBossWallCracks.length === 0) {
    const crackCount = Math.max(4, Math.ceil(H / 90));
    for (let i = 0; i < crackCount; i++) {
      const points = [];
      let cx = wallThickness * (0.3 + Math.random() * 0.4);
      let cy = (i / crackCount) * H + Math.random() * 40;
      const segments = 5 + Math.floor(Math.random() * 3);
      for (let s = 0; s <= segments; s++) {
        points.push({ x: cx, y: cy });
        cx = Math.max(4, Math.min(wallThickness - 4, cx + (Math.random() - 0.5) * 22));
        cy += (H / crackCount) / segments * 0.9 + Math.random() * 10;
      }
      miniBossWallCracks.push({ points, phase: Math.random() * Math.PI * 2 });
    }
  }
  ctx.lineCap = 'round';
  for (const crack of miniBossWallCracks) {
    const crackPulse = 0.6 + 0.4 * Math.sin(frame * 0.05 + crack.phase);
    ctx.strokeStyle = `rgba(255,110,30,${0.75 * crackPulse})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(wallX + crack.points[0].x, crack.points[0].y);
    for (let i = 1; i < crack.points.length; i++) {
      ctx.lineTo(wallX + crack.points[i].x, crack.points[i].y);
    }
    ctx.stroke();
  }

  // near-edge highlight so the boundary still reads clearly at a glance
  ctx.fillStyle = `rgba(255,140,50,${0.5 * pulse})`;
  ctx.fillRect(wallX, 0, 2, H);

  ctx.restore();
}

function drawBoss(theme) {
  if (!theme || !theme.isBossZone) return;
  if (!boss) return;
  if (bossFullyDefeated) return; // gone for good -- downtime, fly-off, and victory screen all render nothing here

  const entranceElapsed = frame - bossSpawnFrame;
  const entranceProgress = Math.min(1, entranceElapsed / BOSS_ENTRANCE_DURATION);

  if (entranceProgress < BOSS_ENTRANCE_CHARGE_END) {
    drawBossCharge(theme, entranceProgress / BOSS_ENTRANCE_CHARGE_END);
    return; // orb itself not visible yet
  }
  if (entranceProgress < BOSS_ENTRANCE_ASSEMBLE_END) {
    drawBossFragments(theme, (entranceProgress - BOSS_ENTRANCE_CHARGE_END) / (BOSS_ENTRANCE_ASSEMBLE_END - BOSS_ENTRANCE_CHARGE_END));
    return; // orb itself not visible yet
  }

  if (bossTransitioning && bossTransitionTargetPhase === 5) {
    const stageProgress = Math.min(1, (frame - bossTransitionStartFrame) / BOSS_PHASE5_TRANSITION_DURATION);
    drawBossPhase5Transformation(theme, stageProgress);
    return;
  }

  if (bossExplosionActive) {
    const stageProgress = Math.min(1, (frame - bossExplosionStartFrame) / BOSS_EXPLOSION_DURATION);
    drawBossExplosion(theme, stageProgress);
    return;
  }

  if (bossFinalChargeActive) {
    const stageProgress = Math.min(1, (frame - bossFinalChargeStartFrame) / BOSS_FINAL_CHARGE_DURATION);
    drawBossFinalCharge(theme, stageProgress);
    return;
  }

  const r = boss.r * (bossDefeated ? Math.max(0, 1 - (frame - bossDefeatFrame) / 90) : 1);
  if (r <= 0) return;

  if (bossPhase === 5) {
    drawBossEclipseForm(boss.x, boss.y, r, theme);
    return;
  }

  const colorProgress = getBossColorProgress();
  const effAccentA = lerpHexColor(theme.accentA, theme.phase3AccentA, colorProgress);
  const effAccentB = lerpHexColor(theme.accentB, theme.phase3AccentB, colorProgress);
  const effSkyTop = lerpHexColor(theme.skyTop, theme.phase3SkyTop, colorProgress);

  // while straining to transform, a fast jitter conveys effort --
  // intensity builds through most of the transition then eases right
  // as the new form locks in, with crackling energy particles and a
  // building glow layered on top for a more dramatic strain
  let jitterX = 0, jitterY = 0, strainGlow = 0;
  if (bossTransitioning) {
    const strainElapsed = frame - bossTransitionStartFrame;
    const strainProgress = Math.min(1, strainElapsed / BOSS_TRANSITION_DURATION);
    const jitterMag = 7 * Math.sin(strainProgress * Math.PI);
    jitterX = Math.sin(frame * 2.3) * jitterMag;
    jitterY = Math.cos(frame * 2.9) * jitterMag;
    strainGlow = strainProgress;
  }
  const bx = boss.x + jitterX, by = boss.y + jitterY;

  if (bossTransitioning) {
    ctx.save();
    for (let i = 0; i < 10; i++) {
      const flicker = Math.sin(frame * 0.6 + i * 2.8);
      if (flicker > 0.15) {
        const ang = i * 2.1 + frame * 0.02;
        const dist = boss.maxR * (0.9 + 0.35 * Math.sin(i * 1.7 + frame * 0.05));
        const px = bx + Math.cos(ang) * dist;
        const py = by + Math.sin(ang) * dist;
        ctx.fillStyle = i % 2 === 0 ? theme.accentA : theme.phase3AccentA;
        ctx.globalAlpha = 0.5 * strainGlow;
        ctx.shadowColor = theme.phase3AccentB;
        ctx.shadowBlur = 8;
        ctx.fillRect(px - 3, py - 3, 6, 6);
      }
    }
    ctx.restore();
  }

  drawBossStandardSphere(bx, by, r, effAccentA, effAccentB, effSkyTop);

  if (bossPhase === 4) {
    const elapsed = theme.bossDuration - bossTimer;
    const framesSincePhase4 = elapsed - 3 * BOSS_PHASE_DURATION;
    ctx.save();
    ctx.beginPath();
    ctx.arc(bx, by, r, 0, Math.PI * 2);
    ctx.clip();
    drawBossCracks(bx, by, r, framesSincePhase4);
    ctx.restore();
  }

  if (entranceProgress < 1) {
    drawBossSnapEffect(theme, (entranceProgress - BOSS_ENTRANCE_ASSEMBLE_END) / (1 - BOSS_ENTRANCE_ASSEMBLE_END));
  }

  const sinceTransitionEnd = frame - bossTransitionEndFrame;
  if (sinceTransitionEnd >= 0 && sinceTransitionEnd < BOSS_TRANSITION_COMPLETE_FX_DURATION) {
    drawBossTransitionCompleteEffect(theme, sinceTransitionEnd / BOSS_TRANSITION_COMPLETE_FX_DURATION);
  }
}

// "corrupted synthwave" background elements for phase 3+, fading in
// alongside the existing sky/grid color transition (same colorProgress
// value). purely decorative atmosphere -- does not touch the boss
// sprite or any gameplay object
function drawCorruptedBackgroundSun(theme, colorProgress) {
  if (colorProgress <= 0) return;
  const sunCX = W * 0.75;
  const sunCY = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * 0.25;
  const sunR = (PLAY_BOTTOM - PLAY_TOP) * 0.17;
  ctx.save();
  ctx.globalAlpha = colorProgress * 0.85;
  const sunGrad = ctx.createLinearGradient(0, sunCY - sunR, 0, sunCY + sunR);
  sunGrad.addColorStop(0, '#ffd23f');
  sunGrad.addColorStop(0.5, theme.phase3AccentA);
  sunGrad.addColorStop(1, theme.phase3AccentB);
  ctx.beginPath();
  ctx.arc(sunCX, sunCY, sunR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = sunGrad;
  ctx.fillRect(sunCX - sunR, sunCY - sunR, sunR * 2, sunR * 2);
  ctx.fillStyle = theme.phase3SkyTop;
  for (let i = 0; i < 5; i++) {
    const y = sunCY + sunR * 0.15 * i - 2;
    ctx.fillRect(sunCX - sunR, y, sunR * 2, 3 + i);
  }
  ctx.restore();
}

function drawCorruptedGlitchBlocks(theme, colorProgress) {
  if (colorProgress <= 0) return;
  ctx.save();
  const blocks = [
    { x: 0.03, y: 0.15, w: 60, h: 8 }, { x: 0.10, y: 0.15, w: 8, h: 40 },
    { x: 0.03, y: 0.30, w: 100, h: 5 }, { x: 0.15, y: 0.22, w: 5, h: 60 },
    { x: 0.06, y: 0.40, w: 40, h: 5 }, { x: 0.02, y: 0.45, w: 5, h: 25 },
    { x: 0.12, y: 0.10, w: 30, h: 5 }, { x: 0.08, y: 0.35, w: 5, h: 15 }
  ];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const flicker = Math.sin(frame * 0.15 + i * 2.3) > 0.1 ? 1 : 0.2;
    ctx.globalAlpha = colorProgress * flicker * 0.7;
    ctx.fillStyle = theme.phase3AccentA;
    ctx.shadowColor = theme.phase3AccentA;
    ctx.shadowBlur = 4;
    const bx = W * b.x, by = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * b.y;
    ctx.fillRect(bx, by, b.w, b.h);
  }
  ctx.restore();
}

function drawCorruptedSmoke(theme, colorProgress) {
  if (colorProgress <= 0) return;
  ctx.save();
  const wisps = [
    { x: 0.15, seed: 0 }, { x: 0.35, seed: 1.7 }, { x: 0.55, seed: 3.1 },
    { x: 0.75, seed: 4.5 }, { x: 0.9, seed: 5.8 }
  ];
  for (const w of wisps) {
    const baseX = W * w.x + Math.sin(frame * 0.008 + w.seed) * 20;
    const baseY = PLAY_BOTTOM;
    const height = (PLAY_BOTTOM - PLAY_TOP) * 0.35;
    const grad = ctx.createLinearGradient(baseX, baseY, baseX, baseY - height);
    grad.addColorStop(0, theme.phase3AccentA + '00');
    grad.addColorStop(0.3, theme.phase3AccentA + '40');
    grad.addColorStop(1, theme.phase3AccentA + '00');
    ctx.fillStyle = grad;
    ctx.globalAlpha = colorProgress * 0.6;
    ctx.beginPath();
    ctx.ellipse(baseX, baseY - height * 0.5, 25, height * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// true converging perspective grid for phase 3+, replacing the flat
// uniform grid -- horizontal lines use 1/depth spacing (classic
// perspective-floor trick: line at "depth" d sits at horizonY +
// groundHeight/d, which naturally bunches lines together near the
// horizon and spreads them out near the viewer) and vertical lines
// all converge to a single vanishing point at the horizon
// deterministic ember particle seeds -- generated once so particles
// stay consistent frame to frame rather than jittering randomly
const BOSS_ASH_EMBERS = (() => {
  const embers = [];
  for (let i = 0; i < 45; i++) {
    const seed = i * 12.9898;
    const pseudoRand = (n) => { const x = Math.sin(n) * 43758.5453; return x - Math.floor(x); };
    embers.push({
      xFrac: pseudoRand(seed),
      yFrac: pseudoRand(seed + 1),
      size: 1 + pseudoRand(seed + 2) * 2.5,
      brightness: 0.4 + pseudoRand(seed + 3) * 0.6,
      driftSpeed: 0.15 + pseudoRand(seed + 4) * 0.35,
      flickerSeed: pseudoRand(seed + 5) * 100,
      xDrift: (pseudoRand(seed + 6) - 0.5) * 0.3
    });
  }
  return embers;
})();

function drawVolcanicAshBackground(theme, progress) {
  if (progress <= 0) return;
  ctx.save();

  // darkening overlay for the hazy, dim atmosphere
  ctx.globalAlpha = progress * 0.55;
  ctx.fillStyle = bossAshGrayVariant ? '#0a0a0a' : '#0a0505';
  ctx.fillRect(0, PLAY_TOP, W, PLAY_BOTTOM - PLAY_TOP);

  // soft dark smoke blobs in the corners -- skipped for the gray
  // variant, whose reference shows a clean backdrop with no smoke
  if (!bossAshGrayVariant) {
    ctx.globalAlpha = progress * 0.4;
    const smokeSpots = [
      { x: W * 0.08, y: PLAY_TOP + 20, r: 90 },
      { x: W * 0.02, y: PLAY_TOP + 60, r: 60 },
      { x: W * 0.95, y: PLAY_BOTTOM - 30, r: 100 },
      { x: W * 0.88, y: PLAY_BOTTOM - 70, r: 65 }
    ];
    for (const s of smokeSpots) {
      const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r);
      grad.addColorStop(0, 'rgba(40,35,35,0.8)');
      grad.addColorStop(1, 'rgba(40,35,35,0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // glowing embers, drifting slowly upward and wrapping
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  for (const e of BOSS_ASH_EMBERS) {
    const riseOffset = ((frame * e.driftSpeed) % (playHeight + 40)) / playHeight;
    let y = PLAY_TOP + ((e.yFrac - riseOffset) % 1 + 1) % 1 * playHeight;
    const x = W * ((e.xFrac + Math.sin(frame * 0.01 + e.flickerSeed) * e.xDrift * 0.05 + 1) % 1);
    const flicker = 0.6 + 0.4 * Math.sin(frame * 0.08 + e.flickerSeed);
    ctx.globalAlpha = progress * e.brightness * flicker;
    ctx.fillStyle = '#ff5020';
    ctx.shadowColor = '#ff5020';
    ctx.shadowBlur = e.size * 2.5;
    ctx.beginPath();
    ctx.arc(x, y, e.size, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function drawPerspectiveGrid(theme, colorProgress) {
  if (colorProgress <= 0) return;
  const horizonY = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * 0.58;
  const vanishX = W / 2;
  const groundHeight = PLAY_BOTTOM - horizonY;

  ctx.save();
  ctx.strokeStyle = theme.phase3AccentA;
  ctx.lineWidth = 1;

  // horizontal lines, slowly scrolling toward the viewer over time
  const scrollPhase = (frame * SCROLL_SPEED * (theme.scrollMult || 1) * 0.01) % 1;
  const numLines = 14;
  for (let i = 1; i <= numLines; i++) {
    const depth = i + scrollPhase;
    const y = horizonY + groundHeight / depth;
    if (y > PLAY_BOTTOM || y < horizonY) continue;
    const fadeIn = Math.min(1, (y - horizonY) / (groundHeight * 0.15));
    ctx.globalAlpha = colorProgress * fadeIn;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }

  // vertical lines converging to the vanishing point, fanning out to
  // well beyond the visible width at the bottom edge
  ctx.globalAlpha = colorProgress * 0.8;
  const numVLines = 16;
  const spread = W * 2.2;
  for (let i = -numVLines; i <= numVLines; i++) {
    const bottomX = vanishX + (i / numVLines) * spread;
    ctx.beginPath();
    ctx.moveTo(vanishX, horizonY);
    ctx.lineTo(bottomX, PLAY_BOTTOM);
    ctx.stroke();
  }

  ctx.restore();
}

function drawSynthwaveScene(top, bottom) {
  const h = Math.max(1, bottom - top);
  const t = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;
  const skyGrad = ctx.createLinearGradient(0, top, 0, bottom);
  skyGrad.addColorStop(0, '#1a0836');
  skyGrad.addColorStop(0.42, '#2a1050');
  skyGrad.addColorStop(0.62, '#16082c');
  skyGrad.addColorStop(1, '#0e041c');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, top, W, h);

  const sunCX = W * 0.5;
  const sunR = Math.min(W, h) * 0.27;
  const sunCY = top + h * 0.36;
  const horizonY = Math.min(bottom, sunCY + sunR * 0.98);
  const skyH = Math.max(1, horizonY - top);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, top, W, skyH);
  ctx.clip();
  ctx.fillStyle = '#ffffff';
  for (let i = 0; i < 78; i++) {
    const hx = Math.sin(i * 12.9898 + 78.233) * 43758.5453;
    const hy = Math.sin(i * 39.346 + 11.135) * 23421.631;
    const hs = Math.sin(i * 7.13 + 4.2) * 9123.17;
    const fx = hx - Math.floor(hx);
    const fy = hy - Math.floor(hy);
    const fs = hs - Math.floor(hs);
    const sx = fx * W;
    const sy = top + fy * skyH;
    const ddx = sx - sunCX;
    const ddy = sy - sunCY;
    if (ddx * ddx + ddy * ddy < sunR * sunR * 1.08) continue;
    const twinkle = 0.28 + 0.72 * (0.5 + 0.5 * Math.sin(t * (0.9 + fs * 2.1) + i * 1.7));
    ctx.globalAlpha = (0.18 + fs * 0.55) * twinkle;
    ctx.beginPath();
    ctx.arc(sx, sy, 0.7 + fs * 1.15, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  ctx.save();
  const bloomPulse = 0.94 + 0.08 * Math.sin(t * 0.55);
  const bloomR = sunR * 1.92 * bloomPulse;
  const bloom = ctx.createRadialGradient(sunCX, sunCY, sunR * 0.35, sunCX, sunCY, bloomR);
  bloom.addColorStop(0, 'rgba(255, 214, 120, 0.42)');
  bloom.addColorStop(0.28, 'rgba(255, 150, 120, 0.22)');
  bloom.addColorStop(0.55, 'rgba(255, 80, 160, 0.12)');
  bloom.addColorStop(0.78, 'rgba(140, 40, 180, 0.05)');
  bloom.addColorStop(1, 'rgba(40, 10, 60, 0)');
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(sunCX, sunCY, bloomR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  const sunGrad = ctx.createLinearGradient(0, sunCY - sunR, 0, sunCY + sunR);
  sunGrad.addColorStop(0, '#ffe98a');
  sunGrad.addColorStop(0.38, '#ffcc5a');
  sunGrad.addColorStop(0.68, '#ff7a9a');
  sunGrad.addColorStop(1, '#ff3d9a');
  ctx.save();
  ctx.shadowColor = 'rgba(255, 170, 110, 0.7)';
  ctx.shadowBlur = sunR * (0.38 + 0.08 * Math.sin(t * 0.55));
  ctx.beginPath();
  ctx.arc(sunCX, sunCY, sunR, 0, Math.PI * 2);
  ctx.fillStyle = sunGrad;
  ctx.fill();
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.arc(sunCX, sunCY, sunR, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = '#0a0418';
  const bandCount = 8;
  const bandStart = sunCY - sunR * 0.1;
  const bandSpan = sunR * 0.7;
  for (let i = 0; i < bandCount; i++) {
    const t = i / (bandCount - 1);
    const y = bandStart + t * bandSpan;
    const thickness = sunR * (0.014 + t * 0.028);
    ctx.fillRect(sunCX - sunR, y, sunR * 2, thickness);
  }
  ctx.restore();

  ctx.save();
  const vanishX = W / 2;
  const groundHeight = Math.max(1, bottom - horizonY);
  ctx.strokeStyle = '#ff4db8';
  ctx.lineWidth = 1.15;
  const scrollPhase = (t * 0.32) % 1;
  const numLines = 16;
  for (let i = 1; i <= numLines; i++) {
    const depth = i + scrollPhase;
    const y = horizonY + groundHeight / depth;
    if (y > bottom || y < horizonY) continue;
    const fadeIn = Math.min(1, (y - horizonY) / (groundHeight * 0.12));
    ctx.globalAlpha = 0.55 * fadeIn;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(W, y);
    ctx.stroke();
  }
  ctx.globalAlpha = 0.5;
  const numVLines = 16;
  const spread = W * 2.4;
  for (let i = -numVLines; i <= numVLines; i++) {
    const bottomX = vanishX + (i / numVLines) * spread;
    ctx.beginPath();
    ctx.moveTo(vanishX, horizonY);
    ctx.lineTo(bottomX, bottom);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHomeBackground() {
  drawSynthwaveScene(0, H);
}

function drawMenuBackground() {
  drawSynthwaveScene(PLAY_TOP, PLAY_BOTTOM);
}

function drawBackground(theme) {
  const colorProgress = theme.isBossZone ? getBossColorProgress() : 0;
  const phase5Progress = theme.isBossZone ? getPhase5BackgroundProgress() : 0;
  let effSkyTop = colorProgress > 0 ? lerpHexColor(theme.skyTop, theme.phase3SkyTop, colorProgress) : theme.skyTop;
  let effSkyMid = colorProgress > 0 ? lerpHexColor(theme.skyMid, theme.phase3SkyMid, colorProgress) : theme.skyMid;
  let effSkyBottom = colorProgress > 0 ? lerpHexColor(theme.skyBottom, theme.phase3SkyBottom, colorProgress) : theme.skyBottom;
  if (bossAshGrayVariant && phase5Progress > 0) {
    effSkyTop = lerpHexColor(effSkyTop, '#0e0e0e', phase5Progress);
    effSkyMid = lerpHexColor(effSkyMid, '#0a0a0a', phase5Progress);
    effSkyBottom = lerpHexColor(effSkyBottom, '#050505', phase5Progress);
  }
  const skyGrad = ctx.createLinearGradient(0, PLAY_TOP, 0, PLAY_BOTTOM);
  skyGrad.addColorStop(0, effSkyTop);
  skyGrad.addColorStop(0.55, effSkyMid);
  skyGrad.addColorStop(1, effSkyBottom);
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, PLAY_TOP, W, PLAY_BOTTOM - PLAY_TOP);

  if (theme.isBossZone) {
    drawPerspectiveGrid(theme, colorProgress * (1 - phase5Progress));
    drawVolcanicAshBackground(theme, phase5Progress);
  }

  if (theme.bgStyle === 'grid') {
    if (!theme.isBossZone) {
    const sunCX = W * 0.78;
    const sunCY = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * 0.32;
    const sunR = (PLAY_BOTTOM - PLAY_TOP) * 0.22;
    const sunGrad = ctx.createLinearGradient(0, sunCY - sunR, 0, sunCY + sunR);
    sunGrad.addColorStop(0, '#ffd23f');
    sunGrad.addColorStop(0.5, theme.accentA);
    sunGrad.addColorStop(1, theme.accentB);
    ctx.save();
    ctx.beginPath();
    ctx.arc(sunCX, sunCY, sunR, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = sunGrad;
    ctx.fillRect(sunCX - sunR, sunCY - sunR, sunR * 2, sunR * 2);
    ctx.fillStyle = theme.skyTop;
    for (let i = 0; i < 5; i++) {
      const y = sunCY + sunR * 0.15 * i - 2;
      ctx.fillRect(sunCX - sunR, y, sunR * 2, 3 + i);
    }
    ctx.restore();
    }

    // the perspective grid fully replaces this one in boss zones once
    // the transition begins -- skip rendering it entirely at that
    // point rather than paying its full stroke cost while it fades to
    // near-invisible, which was doubling grid-related draw calls
    // during the whole transition window
    if (!(theme.isBossZone && colorProgress > 0)) {
    ctx.save();
    ctx.strokeStyle = theme.accentA + '59';
    ctx.lineWidth = 1;
    ctx.globalAlpha = bossGridFadeEnabled ? 1 - colorProgress : 1;
    const gridSpacing = 40;
    const offset = (frame * SCROLL_SPEED * (theme.scrollMult || 1)) % gridSpacing;
    for (let x = -offset; x < W; x += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(x, PLAY_TOP);
      ctx.lineTo(x, PLAY_BOTTOM);
      ctx.stroke();
    }
    for (let y = PLAY_TOP; y < PLAY_BOTTOM; y += gridSpacing) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }
    ctx.restore();
    }
  } else if (theme.bgStyle === 'matrix') {
    for (let p of bgParticles) {
      const grad = ctx.createLinearGradient(p.x, p.y - p.len, p.x, p.y);
      grad.addColorStop(0, 'rgba(0,0,0,0)');
      grad.addColorStop(1, theme.accentA);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = p.alpha;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - p.len);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (theme.bgStyle === 'stars') {
    for (let p of bgParticles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = theme.accentB;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (theme.bgStyle === 'embers') {
    for (let p of bgParticles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = theme.accentA;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (theme.bgStyle === 'ruins') {
    const playHeight = PLAY_BOTTOM - PLAY_TOP;

    // stone block wall texture behind everything
    ctx.strokeStyle = 'rgba(0,0,0,0.25)';
    ctx.lineWidth = 1;
    const blockW = 70, blockH = 38;
    const rowOffset = (frame * 0.6) % blockW;
    let row = 0;
    for (let by = PLAY_TOP; by < PLAY_BOTTOM; by += blockH) {
      const stagger = (row % 2 === 0) ? 0 : blockW / 2;
      for (let bx = -rowOffset - blockW + stagger; bx < W + blockW; bx += blockW) {
        ctx.strokeRect(bx, by, blockW, blockH);
      }
      row++;
    }

    // fluted stone pillars, solid and clearly load-bearing
    const pillarSpacing = 220;
    const pillarWidth = 50;
    const pillarOffset = (frame * 0.6) % pillarSpacing;
    for (let px = -pillarOffset; px < W + pillarSpacing; px += pillarSpacing) {
      const pgrad = ctx.createLinearGradient(px, 0, px + pillarWidth, 0);
      pgrad.addColorStop(0, 'rgba(8,14,20,0.9)');
      pgrad.addColorStop(0.5, 'rgba(30,45,55,0.9)');
      pgrad.addColorStop(1, 'rgba(8,14,20,0.9)');
      ctx.fillStyle = pgrad;
      ctx.fillRect(px, PLAY_TOP, pillarWidth, playHeight);

      // vertical fluting grooves
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.lineWidth = 1.5;
      for (let fx = px + 8; fx < px + pillarWidth; fx += 9) {
        ctx.beginPath();
        ctx.moveTo(fx, PLAY_TOP + 16);
        ctx.lineTo(fx, PLAY_BOTTOM - 16);
        ctx.stroke();
      }

      // capital and base
      ctx.fillStyle = 'rgba(15,25,32,0.95)';
      ctx.fillRect(px - 8, PLAY_TOP, pillarWidth + 16, 16);
      ctx.fillRect(px - 8, PLAY_BOTTOM - 16, pillarWidth + 16, 16);

      // torch brazier glow mounted on the pillar
      const torchY = PLAY_TOP + playHeight * 0.28;
      const flicker = 0.7 + 0.3 * Math.sin(frame * 0.15 + px * 0.1);
      const tgrad = ctx.createRadialGradient(px + pillarWidth / 2, torchY, 0, px + pillarWidth / 2, torchY, 34);
      tgrad.addColorStop(0, `rgba(120,220,255,${0.55 * flicker})`);
      tgrad.addColorStop(1, 'rgba(120,220,255,0)');
      ctx.fillStyle = tgrad;
      ctx.beginPath();
      ctx.arc(px + pillarWidth / 2, torchY, 34, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = theme.accentA;
      ctx.beginPath();
      ctx.arc(px + pillarWidth / 2, torchY, 4, 0, Math.PI * 2);
      ctx.fill();
    }

    // soft drifting dust in the torchlight (kept subtle, not star-like)
    for (let p of bgParticles) {
      ctx.globalAlpha = p.alpha * 0.5;
      ctx.fillStyle = theme.accentB;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (theme.bgStyle === 'toxic') {
    const playHeight = PLAY_BOTTOM - PLAY_TOP;

    // drifting toxic fog banks
    for (let i = 0; i < 4; i++) {
      const fx = ((W * 0.3 * i - frame * 0.25) % (W + 260)) - 130;
      const fy = PLAY_TOP + playHeight * (0.15 + i * 0.22);
      const fgrad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 150);
      fgrad.addColorStop(0, 'rgba(138,255,77,0.12)');
      fgrad.addColorStop(1, 'rgba(138,255,77,0)');
      ctx.fillStyle = fgrad;
      ctx.beginPath();
      ctx.ellipse(fx, fy, 150, 45, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // sickly bubbling ground texture near top and bottom edges
    ctx.fillStyle = 'rgba(60,80,20,0.35)';
    const oozeSpacing = 60;
    const oozeOffset = (frame * 0.7) % oozeSpacing;
    for (let ox = -oozeOffset; ox < W + oozeSpacing; ox += oozeSpacing) {
      const bob = Math.sin(frame * 0.05 + ox * 0.05) * 4;
      ctx.beginPath();
      ctx.arc(ox, PLAY_TOP + 6 + bob, 10, 0, Math.PI);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ox + oozeSpacing / 2, PLAY_BOTTOM - 6 - bob, 10, Math.PI, Math.PI * 2);
      ctx.fill();
    }

    // rising toxic bubbles/spores
    for (let p of bgParticles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = theme.accentA;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (theme.bgStyle === 'station') {
    const playHeight = PLAY_BOTTOM - PLAY_TOP;

    // structural hull panel grid
    ctx.strokeStyle = 'rgba(94,200,232,0.08)';
    ctx.lineWidth = 1;
    const panelW = 90, panelH = 70;
    const offX = (frame * 0.4) % panelW;
    for (let px = -offX; px < W + panelW; px += panelW) {
      ctx.beginPath();
      ctx.moveTo(px, PLAY_TOP);
      ctx.lineTo(px, PLAY_BOTTOM);
      ctx.stroke();
    }
    for (let py = PLAY_TOP; py < PLAY_BOTTOM; py += panelH) {
      ctx.beginPath();
      ctx.moveTo(0, py);
      ctx.lineTo(W, py);
      ctx.stroke();
    }

    // hull-breach windows showing distant starfield, spaced along the wall
    const winSpacing = 260;
    const winOffset = (frame * 0.6) % winSpacing;
    for (let wx = -winOffset; wx < W + winSpacing; wx += winSpacing) {
      const wy = PLAY_TOP + playHeight * 0.5;
      ctx.fillStyle = 'rgba(2,4,8,0.6)';
      ctx.beginPath();
      ctx.ellipse(wx, wy, 26, 40, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(94,200,232,0.3)';
      ctx.lineWidth = 2;
      ctx.stroke();
      // tiny stars inside the window
      for (let s = 0; s < 5; s++) {
        const sx = wx + (Math.sin(s * 7.1) * 16);
        const sy = wy + (Math.cos(s * 5.3) * 26);
        ctx.fillStyle = 'rgba(255,255,255,0.6)';
        ctx.fillRect(sx, sy, 1.2, 1.2);
      }
    }

    // flickering emergency light strips along the top/bottom edges
    const lightSpacing = 140;
    const lightOffset = (frame * 0.5) % lightSpacing;
    for (let lx = -lightOffset; lx < W + lightSpacing; lx += lightSpacing) {
      const flicker = 0.4 + 0.4 * Math.max(0, Math.sin(frame * 0.08 + lx * 0.3));
      ctx.fillStyle = theme.accentB;
      ctx.globalAlpha = flicker * 0.5;
      ctx.fillRect(lx, PLAY_TOP + 2, 24, 3);
      ctx.fillRect(lx + 40, PLAY_BOTTOM - 5, 24, 3);
    }
    ctx.globalAlpha = 1;

    // drifting metal dust
    for (let p of bgParticles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = theme.accentA;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  } else if (theme.bgStyle === 'void') {
    // deliberately sparse -- almost nothing but a few faint distant stars,
    // letting the black holes dominate an otherwise empty, dark scene
    for (let p of bgParticles) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = theme.accentA;
      ctx.fillRect(p.x, p.y, p.r, p.r);
    }
    ctx.globalAlpha = 1;
  } else if (theme.bgStyle === 'storm') {
    // deterministic lightning: a brief flash on a fixed schedule, not random
    const flashCycle = 210;
    const flashT = frame % flashCycle;
    if (flashT < 6) {
      const flashAlpha = (1 - flashT / 6) * 0.35;
      ctx.fillStyle = `rgba(230,230,255,${flashAlpha})`;
      ctx.fillRect(0, PLAY_TOP, W, PLAY_BOTTOM - PLAY_TOP);
    }
    // cloud bands
    ctx.fillStyle = 'rgba(20,22,40,0.4)';
    for (let i = 0; i < 4; i++) {
      const cy = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * (0.1 + i * 0.22);
      const cx = (W * 0.3 * i - frame * 0.3) % (W + 300) - 150;
      ctx.beginPath();
      ctx.ellipse(cx, cy, 180, 30, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    // rain streaks
    for (let p of bgParticles) {
      const grad = ctx.createLinearGradient(p.x, p.y - p.len, p.x, p.y);
      grad.addColorStop(0, 'rgba(200,210,255,0)');
      grad.addColorStop(1, theme.accentB);
      ctx.strokeStyle = grad;
      ctx.globalAlpha = p.alpha;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y - p.len);
      ctx.lineTo(p.x - p.len * 0.35, p.y);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }
}

function drawDiamondGate(g, theme) {
  const { radius, centerX, centerY } = diamondGeometry(g);
  if (radius <= 2) return;

  ctx.save();
  ctx.shadowColor = theme.accentB;
  ctx.shadowBlur = 16;

  const grad = ctx.createLinearGradient(centerX - radius, centerY - radius, centerX + radius, centerY + radius);
  grad.addColorStop(0, theme.accentA);
  grad.addColorStop(1, theme.accentB);
  ctx.fillStyle = grad;

  // filled bounding square with a diamond-shaped hole (evenodd rule) = the solid frame
  ctx.beginPath();
  ctx.rect(centerX - radius, centerY - radius, radius * 2, radius * 2);
  ctx.moveTo(centerX, centerY - radius);
  ctx.lineTo(centerX + radius, centerY);
  ctx.lineTo(centerX, centerY + radius);
  ctx.lineTo(centerX - radius, centerY);
  ctx.closePath();
  ctx.fill('evenodd');

  // bright diamond outline to sell the "frame" edge
  ctx.shadowBlur = 20;
  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(centerX, centerY - radius);
  ctx.lineTo(centerX + radius, centerY);
  ctx.lineTo(centerX, centerY + radius);
  ctx.lineTo(centerX - radius, centerY);
  ctx.closePath();
  ctx.stroke();

  ctx.restore();
}

function drawOrbiter(g, theme) {
  const pos = liveOrbiterPos(g);
  ctx.save();

  // planet sphere with simple shading for a rounded look
  ctx.shadowColor = g.color;
  ctx.shadowBlur = 10;
  const grad = ctx.createRadialGradient(pos.x - g.r * 0.35, pos.y - g.r * 0.35, g.r * 0.1, pos.x, pos.y, g.r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, g.color);
  grad.addColorStop(1, '#1a1220');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, g.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSupernovaPlanet(g, theme) {
  if (g.detonated) {
    drawSupernovaFlash(g, theme);
    return;
  }
  const warning = supernovaIsWarning(g);
  const warningT = warning ? (supernovaPhaseElapsed(g) - supernovaEffectiveDormant(g)) / g.warningFrames : 0;

  ctx.save();
  ctx.translate(g.x, g.y);

  // base sphere: smooth blended amber/rust gradient (vertical, since gas
  // giant bands run horizontally across latitude)
  const grad = ctx.createLinearGradient(0, -g.planetR, 0, g.planetR);
  grad.addColorStop(0, '#e8c48c');
  grad.addColorStop(0.2, '#c98a4a');
  grad.addColorStop(0.38, '#8a4a28');
  grad.addColorStop(0.5, '#e0b878');
  grad.addColorStop(0.65, '#7a3a20');
  grad.addColorStop(0.8, '#c07838');
  grad.addColorStop(1, '#5a2c16');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, g.planetR, 0, Math.PI * 2);
  ctx.fill();

  // subtle soft wave texture on top -- gentle marbled turbulence without
  // hard band edges. phase drifts slowly over time to suggest the planet
  // rotating, since the waves themselves must stay horizontal (a full
  // rotate() would tilt them, which isn't how gas giant bands behave)
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, g.planetR, 0, Math.PI * 2);
  ctx.clip();
  const phase = frame * 0.006 + g.rotSeed;
  const xSpan = g.planetR * 1.15;
  const waveCount = 5;
  for (let i = 0; i < waveCount; i++) {
    const yBase = -g.planetR + (i + 0.5) * ((g.planetR * 2) / waveCount);
    ctx.beginPath();
    const segments = 18;
    for (let s = 0; s <= segments; s++) {
      const t = s / segments;
      const x = -xSpan + t * xSpan * 2;
      const wobble = Math.sin(t * Math.PI * 2.5 + phase + i * 1.1) * g.planetR * 0.06;
      const y = yBase + wobble;
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(255,230,190,0.12)' : 'rgba(60,25,10,0.15)';
    ctx.lineWidth = g.planetR * 0.18;
    ctx.stroke();
  }
  // storm-spot features that visibly orbit around the vertical axis --
  // this is what actually sells the "spinning" illusion, since a subtle
  // texture drift alone barely reads as rotation. each spot's screen x
  // position and squash factor are driven by its longitude angle, so it
  // slides across, foreshortens near the limb, and disappears around the
  // back exactly like a feature on a real rotating sphere would
  const spotDefs = [
    { latFrac: -0.35, speed: 1.3, size: 0.22, color: 'rgba(60,25,10,0.4)' },
    { latFrac: 0.15, speed: 1.3, size: 0.16, color: 'rgba(255,225,180,0.35)' },
    { latFrac: 0.55, speed: 1.3, size: 0.19, color: 'rgba(50,20,8,0.35)' }
  ];
  spotDefs.forEach((spot, i) => {
    const spotAngle = phase * spot.speed + i * (Math.PI * 2 / 3) + g.rotSeed;
    const cosA = Math.cos(spotAngle);
    if (cosA > -0.15) {
      const spotX = Math.sin(spotAngle) * g.planetR * 0.82;
      const spotY = spot.latFrac * g.planetR;
      const squash = Math.max(0.15, cosA);
      const fadeAlpha = Math.min(1, (cosA + 0.15) / 0.3);
      ctx.save();
      ctx.translate(spotX, spotY);
      ctx.scale(squash, 1);
      ctx.globalAlpha = fadeAlpha;
      ctx.fillStyle = spot.color;
      ctx.beginPath();
      ctx.ellipse(0, 0, g.planetR * spot.size, g.planetR * spot.size * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  });
  ctx.globalAlpha = 1;

  // relight with the same falloff as the base sphere so the 3D illusion
  // stays consistent
  const relight = ctx.createRadialGradient(-g.planetR * 0.35, -g.planetR * 0.35, g.planetR * 0.1, 0, 0, g.planetR);
  relight.addColorStop(0, 'rgba(255,240,220,0.18)');
  relight.addColorStop(0.55, 'rgba(0,0,0,0)');
  relight.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = relight;
  ctx.beginPath();
  ctx.arc(0, 0, g.planetR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // fault-line cracks, glowing brighter and pulsing faster as detonation
  // approaches -- the destabilization telegraph
  const crackIntensity = warning ? (0.3 + 0.7 * warningT) : 0.15;
  const crackPulseSpeed = warning ? 0.4 : 0.05;
  const crackPulse = 0.5 + 0.5 * Math.sin(frame * crackPulseSpeed);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, g.planetR, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = theme.accentB;
  ctx.globalAlpha = crackIntensity * crackPulse;
  ctx.lineWidth = 2 + (warning ? warningT * 2 : 0);
  ctx.shadowColor = theme.accentB;
  ctx.shadowBlur = warning ? 10 * warningT : 3;
  const crackPaths = [
    [[-0.6, -0.5], [0, 0], [0.5, 0.3], [0.7, 0.8]],
    [[0.6, -0.6], [0.1, -0.1], [-0.3, 0.4], [-0.7, 0.7]],
    [[0, -0.9], [0, -0.2], [0.3, 0.2], [0.2, 0.8]]
  ];
  for (const path of crackPaths) {
    ctx.beginPath();
    path.forEach(([px, py], i) => {
      const x = px * g.planetR, y = py * g.planetR;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // atmospheric rim glow
  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 3;
  ctx.globalAlpha = 0.4;
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(0, 0, g.planetR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawSupernovaFlash(g, theme) {
  const t = Math.min(1, (frame - g.detonationFrame) / 20);
  ctx.save();
  ctx.translate(g.x, g.y);
  const flashR = g.planetR * (1 + t * 2);
  const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, flashR);
  grad.addColorStop(0, `rgba(255,255,255,${1 - t})`);
  grad.addColorStop(0.4, `rgba(255,220,150,${(1 - t) * 0.6})`);
  grad.addColorStop(1, 'rgba(255,180,100,0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(0, 0, flashR, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSupernovaDebris(g, theme) {
  const pos = liveProjectilePos(g);
  ctx.save();
  ctx.shadowColor = '#ff8844';
  ctx.shadowBlur = 10;
  const grad = ctx.createRadialGradient(pos.x - g.r * 0.3, pos.y - g.r * 0.3, g.r * 0.1, pos.x, pos.y, g.r);
  grad.addColorStop(0, '#fff3c4');
  grad.addColorStop(0.5, '#e8703a');
  grad.addColorStop(1, '#3a1a10');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, g.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawLensingZone(g, theme) {
  ctx.save();
  ctx.translate(g.x, g.y);

  // concentric rippling distortion rings, like heat-haze or water ripples
  const ringCount = 5;
  for (let i = 1; i <= ringCount; i++) {
    const baseR = (g.zoneRadius / ringCount) * i;
    const wobbleAmt = 6 + i * 1.5;
    const phase = frame * 0.02 + g.rotSeed + i * 0.8;
    ctx.beginPath();
    const segments = 40;
    for (let s = 0; s <= segments; s++) {
      const ang = (s / segments) * Math.PI * 2;
      const wobble = Math.sin(ang * 4 + phase) * wobbleAmt * (i / ringCount);
      const r = baseR + wobble;
      const px = Math.cos(ang) * r, py = Math.sin(ang) * r;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.strokeStyle = theme.accentA;
    ctx.globalAlpha = 0.12 * (1 - i / (ringCount + 2));
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // subtle rotating swirl streaks
  ctx.save();
  ctx.rotate(frame * 0.008 + g.rotSeed);
  for (let i = 0; i < 3; i++) {
    const swirlAngle = (i / 3) * Math.PI * 2;
    ctx.strokeStyle = theme.accentB;
    ctx.globalAlpha = 0.15;
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let s = 0; s <= 20; s++) {
      const t = s / 20;
      const ang = swirlAngle + t * Math.PI * 1.5;
      const r = t * g.zoneRadius * 0.85;
      ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r);
    }
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // small lethal core, partially camouflaged in the shimmer -- genuinely
  // findable (pulses toward full brightness periodically), just easy to
  // overlook amid the surrounding visual noise
  const corePulse = 0.5 + 0.5 * Math.sin(frame * 0.15 + g.rotSeed);
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 6 + 4 * corePulse;
  ctx.fillStyle = theme.accentA;
  ctx.globalAlpha = 0.55 + 0.25 * corePulse;
  ctx.beginPath();
  ctx.arc(0, 0, g.coreR, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();
}

// telegraph: a growing preview line at the locked height, plus a
// building charge glow and converging sparks at the boss itself
function drawBossChargeBeamTelegraph(g, theme) {
  const elapsed = frame - g.spawnFrame;
  const progress = Math.min(1, elapsed / g.warningFrames);
  ctx.save();
  const pulse = 0.7 + 0.3 * Math.sin(frame * 0.3);
  ctx.strokeStyle = '#ffd23f';
  ctx.lineWidth = 2 + progress * 3;
  ctx.globalAlpha = (0.15 + progress * 0.5) * pulse;
  ctx.shadowColor = '#ff6020';
  ctx.shadowBlur = 6 + progress * 10;
  ctx.beginPath();
  ctx.moveTo(boss ? boss.x : 0, g.lockedY);
  ctx.lineTo(0, g.lockedY);
  ctx.stroke();

  if (boss) {
    ctx.globalAlpha = progress * 0.7;
    ctx.fillStyle = '#fff5cc';
    ctx.shadowColor = '#ffd23f';
    ctx.shadowBlur = 15 * progress;
    ctx.beginPath();
    ctx.arc(boss.x, boss.y, boss.maxR * 0.25 * progress, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 6; i++) {
      const ang = i * 1.047 + frame * 0.04;
      const dist = boss.maxR * (1.5 - progress * 0.8);
      const sx = boss.x + Math.cos(ang) * dist, sy = boss.y + Math.sin(ang) * dist;
      ctx.globalAlpha = progress * 0.6;
      ctx.fillStyle = '#ffd23f';
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(sx, sy, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// fired beam: layered glow, mid orange body, and a flickering
// white-hot core, spanning the full width at the locked height
function drawBossChargeBeam(g, theme) {
  const elapsed = frame - g.spawnFrame;
  const progress = elapsed / (g.fireDuration || BOSS_CHARGE_BEAM_FIRE_DURATION);
  const fadeOut = progress > 0.8 ? Math.max(0, 1 - (progress - 0.8) / 0.2) : 1;
  const beamThickness = g.thickness || BOSS_CHARGE_BEAM_THICKNESS;
  ctx.save();

  ctx.strokeStyle = '#ff2010';
  ctx.lineWidth = beamThickness;
  ctx.shadowColor = '#ff2010';
  ctx.shadowBlur = 25;
  ctx.globalAlpha = fadeOut * 0.5;
  ctx.beginPath();
  ctx.moveTo(boss ? boss.x : 0, g.lockedY);
  ctx.lineTo(0, g.lockedY);
  ctx.stroke();

  ctx.strokeStyle = '#ff8020';
  ctx.lineWidth = beamThickness * 0.55;
  ctx.shadowBlur = 0;
  ctx.globalAlpha = fadeOut * 0.8;
  ctx.beginPath();
  ctx.moveTo(boss ? boss.x : 0, g.lockedY);
  ctx.lineTo(0, g.lockedY);
  ctx.stroke();

  const flicker = 0.85 + 0.15 * Math.sin(frame * 0.8);
  ctx.strokeStyle = '#fff5cc';
  ctx.lineWidth = beamThickness * 0.2 * flicker;
  ctx.globalAlpha = fadeOut;
  ctx.beginPath();
  ctx.moveTo(boss ? boss.x : 0, g.lockedY);
  ctx.lineTo(0, g.lockedY);
  ctx.stroke();

  ctx.restore();
}

function drawBossAshCloud(g, theme) {
  ctx.save();
  const puffs = [
    { dx: 0, dy: 0, r: g.r },
    { dx: -g.r * 0.5, dy: g.r * 0.2, r: g.r * 0.65 },
    { dx: g.r * 0.45, dy: -g.r * 0.15, r: g.r * 0.6 },
    { dx: g.r * 0.1, dy: g.r * 0.35, r: g.r * 0.5 }
  ];
  for (const p of puffs) {
    const cx = g.x + p.dx, cy = g.y + p.dy;
    const grad = ctx.createRadialGradient(cx, cy, 0, cx, cy, p.r);
    grad.addColorStop(0, 'rgba(50,48,50,0.55)');
    grad.addColorStop(1, 'rgba(50,48,50,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, p.r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawBossEmber(g, theme) {
  ctx.save();
  const pulse = 0.7 + 0.3 * Math.sin(frame * 0.3 + g.rotSeed);
  ctx.globalAlpha = pulse;
  ctx.fillStyle = '#ff5020';
  ctx.shadowColor = '#ff5020';
  ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff5cc';
  ctx.globalAlpha = pulse * 0.8;
  ctx.beginPath();
  ctx.arc(g.x, g.y, g.r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBossVolleyTelegraph(g, theme) {
  if (!boss) return;
  const elapsed = frame - g.spawnFrame;
  const progress = Math.min(1, elapsed / g.warningFrames);

  ctx.save();
  ctx.strokeStyle = '#ff3050';
  ctx.lineWidth = 2 + 3 * progress;
  ctx.globalAlpha = 0.3 + 0.5 * progress;
  ctx.setLineDash([8, 6]);
  ctx.beginPath();
  ctx.moveTo(boss.x, boss.y);
  ctx.lineTo(ship.x, ship.y);
  ctx.stroke();
  ctx.setLineDash([]);

  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.4);
  ctx.fillStyle = '#ff3050';
  ctx.globalAlpha = progress;
  ctx.beginPath();
  ctx.arc(boss.x, boss.y, 8 + 4 * pulse, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBossRagePulse(g, theme) {
  const liveR = liveRagePulseRadius(g);
  if (liveR <= 0) return;
  ctx.save();
  const alpha = Math.max(0, 1 - (liveR / BOSS_RAGE_PULSE_MAX_R) * 0.8);

  const vRadius = BOSS_RAGE_PULSE_THICKNESS / 2;
  const ringColors = ['#fff5cc', '#ffd23f', '#ffb020', theme.phase3AccentA, '#a01000'];

  // one continuous ring, centered on wherever the boss was at the
  // exact moment it originated, growing outward as a whole (like the
  // reference image's ring bursting outward) -- starts tight around
  // that origin point and expands horizontally in both directions,
  // without tracking any further boss movement afterward. the
  // outermost band is the brightest, reading clearly as the true
  // collision edge without needing a separate straight-line marker
  // that broke the ring's silhouette
  for (let i = 0; i < ringColors.length; i++) {
    const hRadius = Math.max(0, liveR - i * 9);
    const vR = vRadius * (1 - i * 0.12);
    ctx.strokeStyle = ringColors[i];
    ctx.lineWidth = i === 0 ? 5 : 3 + (ringColors.length - i);
    ctx.globalAlpha = alpha * (i === 0 ? 0.95 : 0.7 - i * 0.09);
    ctx.shadowColor = ringColors[i];
    ctx.shadowBlur = i === 0 ? 18 : 10;
    ctx.beginPath();
    ctx.ellipse(g.x, g.y, hRadius, vR, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.restore();
}

function drawBossDiagonalRings(g, theme) {
  const liveR = liveDiagonalRingRadius(g);
  if (liveR <= 0) return;
  ctx.save();
  const alpha = Math.max(0, 1 - (liveR / BOSS_DIAGONAL_RING_MAX_R) * 0.8);
  const vRadius = BOSS_DIAGONAL_RING_THICKNESS / 2;
  const ringColors = ['#e0faff', '#4fd3ff', '#1a9fe0', '#0a5fb0', '#052a60'];
  const angle = Math.atan(BOSS_DIAGONAL_RING_SLOPE);

  // two rings, tilted at opposite angles, crossing in an X -- same
  // nested-ellipse technique as the phase 3 ring, distinct cool
  // blue palette to read as a different attack
  for (const rotSign of [1, -1]) {
    for (let i = 0; i < ringColors.length; i++) {
      const hRadius = Math.max(0, liveR - i * 9);
      const vR = vRadius * (1 - i * 0.12);
      ctx.strokeStyle = ringColors[i];
      ctx.lineWidth = i === 0 ? 5 : 3 + (ringColors.length - i);
      ctx.globalAlpha = alpha * (i === 0 ? 0.95 : 0.7 - i * 0.09);
      ctx.shadowColor = ringColors[i];
      ctx.shadowBlur = i === 0 ? 18 : 10;
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, hRadius, vR, rotSign * angle, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  ctx.restore();
}

function drawBossAttack(g, theme) {
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 10;
  ctx.fillStyle = '#ffd23f';
  ctx.beginPath();
  ctx.arc(0, 0, g.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.restore();
}

function drawBoomerang(g, theme) {
  const pos = liveBoomerangPos(g);
  ctx.save();
  ctx.translate(pos.x, pos.y);
  ctx.rotate(frame * 0.3);

  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 10;
  ctx.fillStyle = theme.accentB;
  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 2;

  for (let i = 0; i < 2; i++) {
    ctx.save();
    ctx.rotate(i * Math.PI / 2);
    ctx.beginPath();
    ctx.ellipse(0, 0, g.r * 1.6, g.r * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  ctx.shadowBlur = 0;
  ctx.restore();
}

function drawPulsingOrb(g, theme) {
  const liveR = livePulsingOrbRadius(g);
  ctx.save();
  ctx.translate(g.x, g.y);

  const grad = ctx.createRadialGradient(-liveR * 0.3, -liveR * 0.3, liveR * 0.1, 0, 0, liveR);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.4, theme.accentA);
  grad.addColorStop(1, theme.accentB);
  ctx.fillStyle = grad;
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 15;
  ctx.beginPath();
  ctx.arc(0, 0, liveR, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(0, 0, liveR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawEchoTrail(g, theme) {
  ctx.save();

  const zoneLeft = g.x - g.zoneWidth / 2;
  const zoneRight = g.x + g.zoneWidth / 2;

  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 3;
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 8;
  ctx.globalAlpha = 0.6;
  ctx.beginPath();
  ctx.moveTo(zoneLeft, PLAY_TOP);
  ctx.lineTo(zoneLeft, PLAY_BOTTOM);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(zoneRight, PLAY_TOP);
  ctx.lineTo(zoneRight, PLAY_BOTTOM);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  if (Math.abs(ship.x - g.x) < g.zoneWidth / 2) {
    const histIdx = shipYHistory.length - 1 - g.delayFrames;
    if (histIdx >= 0) {
      const historicalY = shipYHistory[histIdx];
      const dist = Math.abs(ship.y - historicalY);
      const danger = dist < g.dangerThreshold * 2;

      ctx.save();
      ctx.translate(ship.x, historicalY);
      ctx.globalAlpha = danger ? 0.7 : 0.35;
      ctx.fillStyle = danger ? '#ff3050' : theme.accentB;
      ctx.shadowColor = danger ? '#ff3050' : theme.accentB;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-10, -9);
      ctx.lineTo(-10, 9);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  const labelPulse = 0.6 + 0.4 * Math.sin(frame * 0.1 + g.rotSeed);
  ctx.fillStyle = theme.accentA;
  ctx.globalAlpha = labelPulse;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('ECHO', g.x, PLAY_TOP + 20);
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawEmp(g, theme) {
  ctx.save();
  const elapsed = empPhaseElapsed(g);
  const discharging = empIsDischarging(g);
  const chargeProgress = Math.min(1, elapsed / g.chargeFrames);

  const anchorY = g.anchor === 'top' ? PLAY_TOP : PLAY_BOTTOM;
  const regionTop = g.anchor === 'top' ? PLAY_TOP : PLAY_BOTTOM - g.reachDepth;
  const regionBottom = g.anchor === 'top' ? PLAY_TOP + g.reachDepth : PLAY_BOTTOM;

  if (discharging) {
    const dischargeElapsed = elapsed - g.chargeFrames;
    const dischargeProgress = dischargeElapsed / g.dischargeFrames;
    const flashAlpha = Math.sin(dischargeProgress * Math.PI) * 0.6;
    ctx.fillStyle = theme.accentA;
    ctx.globalAlpha = flashAlpha;
    ctx.fillRect(g.x - 30, regionTop, 60, regionBottom - regionTop);
    ctx.globalAlpha = 1;

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.7;
    for (let i = 0; i < 5; i++) {
      const jag = (i - 2) * 12;
      ctx.beginPath();
      ctx.moveTo(g.x + jag, regionTop);
      ctx.lineTo(g.x + jag + Math.sin(frame * 0.5 + i) * 8, regionBottom);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  } else if (elapsed < g.chargeFrames) {
    const intensity = chargeProgress;
    const sparkCount = Math.floor(3 + intensity * 5);
    for (let i = 0; i < sparkCount; i++) {
      const sparkPhase = frame * 0.3 + i * 1.7;
      if (Math.sin(sparkPhase) > (1 - intensity * 0.6)) {
        const sx = g.x + Math.sin(i * 2.3) * 25;
        const sy = anchorY + (g.anchor === 'top' ? 1 : -1) * (10 + Math.abs(Math.sin(sparkPhase * 2)) * 40 * intensity);
        ctx.strokeStyle = theme.accentB;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(g.x, anchorY);
        ctx.lineTo(sx, sy);
        ctx.stroke();
      }
    }
    ctx.globalAlpha = 1;

    const pulse = 0.4 + 0.3 * intensity * (0.5 + 0.5 * Math.sin(frame * 0.2));
    ctx.shadowColor = theme.accentB;
    ctx.shadowBlur = 6 + 10 * intensity;
    ctx.fillStyle = theme.accentB;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(g.x, anchorY, 8 + 4 * intensity, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

function drawSignalCorruption(g, theme) {
  ctx.save();

  const zoneLeft = g.x - g.zoneWidth / 2;
  const zoneRight = g.x + g.zoneWidth / 2;

  // clear glowing boundary lines marking exactly where the effect
  // starts and stops -- fairness requires this to be unambiguous
  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = 3;
  ctx.shadowColor = theme.accentB;
  ctx.shadowBlur = 8;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.moveTo(zoneLeft, PLAY_TOP);
  ctx.lineTo(zoneLeft, PLAY_BOTTOM);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(zoneRight, PLAY_TOP);
  ctx.lineTo(zoneRight, PLAY_BOTTOM);
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.globalAlpha = 1;

  // full-height glitch texture filling the whole zone
  ctx.save();
  ctx.beginPath();
  ctx.rect(zoneLeft, PLAY_TOP, g.zoneWidth, PLAY_BOTTOM - PLAY_TOP);
  ctx.clip();

  const bandCount = 12;
  for (let i = 0; i < bandCount; i++) {
    const bandY = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) / bandCount * i + 10;
    const jitter = Math.sin(frame * 0.3 + g.rotSeed + i * 1.7) * 15;
    ctx.strokeStyle = i % 2 === 0 ? theme.accentA : theme.accentB;
    ctx.globalAlpha = 0.12 + 0.08 * Math.abs(Math.sin(frame * 0.15 + i));
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(zoneLeft + jitter, bandY);
    ctx.lineTo(zoneRight + jitter, bandY);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  const blockCount = 8;
  for (let i = 0; i < blockCount; i++) {
    const flickerPhase = (frame * 0.05 + g.rotSeed + i * 1.3) % (Math.PI * 2);
    if (Math.sin(flickerPhase * 2.5) > 0.2) {
      const bx = zoneLeft + (g.zoneWidth / blockCount) * i + (g.zoneWidth / blockCount) * 0.5;
      const by = PLAY_TOP + ((i * 137) % (PLAY_BOTTOM - PLAY_TOP));
      const bw = 20 + (i % 3) * 10, bh = 5 + (i % 2) * 4;
      ctx.fillStyle = i % 2 === 0 ? theme.accentA : theme.accentB;
      ctx.globalAlpha = 0.3;
      ctx.fillRect(bx - bw / 2, by - bh / 2, bw, bh);
    }
  }
  ctx.globalAlpha = 1;
  ctx.restore();

  // explicit label so the control inversion is never ambiguous
  const labelPulse = 0.6 + 0.4 * Math.sin(frame * 0.1 + g.rotSeed);
  ctx.fillStyle = theme.accentB;
  ctx.globalAlpha = labelPulse;
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.fillText('\u21C5 INVERTED', g.x, PLAY_TOP + 20);
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawLaserGrid(g, theme) {
  ctx.save();
  const pulse = 0.6 + 0.4 * Math.sin(frame * 0.1 + g.rotSeed);
  for (const seg of g.segments) {
    let x1, y1, x2, y2;
    if (seg.type === 'h') {
      x1 = g.x + seg.xRel1; y1 = seg.y; x2 = g.x + seg.xRel2; y2 = seg.y;
    } else {
      x1 = g.x + seg.xRel; y1 = seg.y1; x2 = g.x + seg.xRel; y2 = seg.y2;
    }
    ctx.strokeStyle = theme.accentA;
    ctx.shadowColor = theme.accentA;
    ctx.shadowBlur = 8 * pulse;
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.shadowBlur = 0;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

// "sharp shard" concept -- a jagged, irregular polygon (not a clean
// geometric shape) reading as a broken-off piece of the boss's own
// signal, with a glitching cyan-offset outline, flickering scanlines
// clipped to the silhouette, and a pulsing red core -- all animated
// per-frame using g.rotSeed so different drone instances desync
function drawBossDroneShard(g, theme) {
  ctx.save();
  ctx.translate(g.x, g.y);

  const pts = [
    [-0.39, -0.58], [0.34, -0.97], [0.92, -0.32], [0.71, 0.61],
    [0, 1.0], [-0.71, 0.61], [-0.87, -0.18]
  ].map(([x, y]) => [x * g.r, y * g.r]);

  function tracePath() {
    ctx.beginPath();
    pts.forEach(([x, y], i) => i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y));
    ctx.closePath();
  }

  // glitching cyan-offset outline, jittering each frame
  const glitchX = Math.sin(frame * 0.3 + g.rotSeed) * g.r * 0.12;
  const glitchY = Math.cos(frame * 0.22 + g.rotSeed) * g.r * 0.12;
  ctx.save();
  ctx.translate(glitchX, glitchY);
  ctx.strokeStyle = '#00e0ff';
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.4;
  tracePath();
  ctx.stroke();
  ctx.restore();

  // main jagged body
  ctx.globalAlpha = 1;
  ctx.fillStyle = '#1a0000';
  ctx.strokeStyle = '#ff2010';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = '#ff2010';
  ctx.shadowBlur = 6;
  tracePath();
  ctx.fill();
  ctx.stroke();

  // flickering scanlines, clipped to the shard's silhouette
  ctx.save();
  tracePath();
  ctx.clip();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffb020';
  ctx.lineWidth = 0.5;
  for (let i = -1; i <= 1; i++) {
    const ly = i * g.r * 0.35 + Math.sin(frame * 0.1 + g.rotSeed + i) * g.r * 0.15;
    ctx.globalAlpha = 0.3 + 0.4 * Math.abs(Math.sin(frame * 0.15 + i * 2 + g.rotSeed));
    ctx.beginPath();
    ctx.moveTo(-g.r, ly);
    ctx.lineTo(g.r, ly);
    ctx.stroke();
  }
  ctx.restore();

  // pulsing glowing core
  const pulse = 0.7 + 0.3 * Math.sin(frame * 0.25 + g.rotSeed);
  ctx.globalAlpha = 1;
  ctx.shadowColor = '#ff4020';
  ctx.shadowBlur = 8 * pulse;
  ctx.fillStyle = '#ff4020';
  ctx.beginPath();
  ctx.arc(0, 0, g.r * 0.35, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#fff5cc';
  ctx.beginPath();
  ctx.arc(0, 0, g.r * 0.15, 0, Math.PI * 2);
  ctx.fill();

  // drifting sparks
  ctx.fillStyle = '#ff6030';
  for (let i = 0; i < 2; i++) {
    const sAng = frame * 0.02 + g.rotSeed + i * Math.PI;
    const sDist = g.r * (1.3 + 0.2 * Math.sin(frame * 0.08 + i));
    ctx.beginPath();
    ctx.arc(Math.cos(sAng) * sDist, Math.sin(sAng) * sDist, 1.2, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

// "tracker orb" concept for the homing fragment -- deliberately
// smooth and round, contrasting with the jagged shard silhouette, so
// it's instantly readable as a different kind of threat. nested rings
// with a rotating scan arc sell the "actively tracking" behavior
// "cracked core sphere" concept for the homing fragment -- a solid
// round body (still contrasting with the shard's jagged silhouette)
// with glowing crack lines running through it and a visible pulsing
// core, reading as a dense, deliberate projectile rather than a
// sensor. cracks pulse in brightness to feel like they're charging
function drawBossHomingOrb(g, theme) {
  ctx.save();
  ctx.translate(g.x, g.y);

  // solid body
  ctx.shadowColor = '#ff2010';
  ctx.shadowBlur = 6;
  ctx.fillStyle = '#3a0000';
  ctx.strokeStyle = '#ff2010';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, g.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // glowing cracks, clipped to the sphere, pulsing brightness
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, g.r, 0, Math.PI * 2);
  ctx.clip();
  const crackPulse = 0.6 + 0.4 * Math.sin(frame * 0.2 + g.rotSeed);
  ctx.strokeStyle = '#00e0ff';
  ctx.lineWidth = 1.2;
  ctx.globalAlpha = crackPulse;
  ctx.shadowColor = '#00e0ff';
  ctx.shadowBlur = 4;
  const cracks = [
    [[-0.583, -0.417], [-0.083, 0.167], [-0.667, 0.333]],
    [[0.417, -0.667], [0.167, -0.083], [0.75, 0.25]],
    [[-0.25, 0.583], [0.333, 0.417], [0.583, 0.833]]
  ];
  for (const crack of cracks) {
    ctx.beginPath();
    crack.forEach(([x, y], i) => {
      const px = x * g.r, py = y * g.r;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    });
    ctx.stroke();
  }
  ctx.restore();

  // pulsing core, visible through the cracks
  const corePulse = 0.7 + 0.3 * Math.sin(frame * 0.25 + g.rotSeed + 1.5);
  ctx.globalAlpha = 1;
  ctx.shadowColor = '#ff4020';
  ctx.shadowBlur = 8 * corePulse;
  ctx.fillStyle = '#ff4020';
  ctx.beginPath();
  ctx.arc(0, 0, g.r * 0.33, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#fff5cc';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, g.r * 0.33, 0, Math.PI * 2);
  ctx.stroke();
  ctx.fillStyle = '#fff5cc';
  ctx.beginPath();
  ctx.arc(0, 0, g.r * 0.12, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSecurityDrone(g, theme) {
  ctx.save();
  ctx.translate(g.x, g.y);

  const blink = Math.sin(frame * 0.2 + g.rotSeed) > 0.3;

  // propeller arms
  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.7;
  for (let i = 0; i < 4; i++) {
    const ang = Math.PI / 4 + i * Math.PI / 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(ang) * g.r * 1.4, Math.sin(ang) * g.r * 1.4);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // angular hex body
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 8;
  ctx.fillStyle = '#1a1428';
  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const ang = i * Math.PI / 3;
    const px = Math.cos(ang) * g.r * 0.7, py = Math.sin(ang) * g.r * 0.7;
    if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // blinking core light
  ctx.shadowBlur = blink ? 10 : 3;
  ctx.fillStyle = blink ? '#ff2ec4' : '#802060';
  ctx.beginPath();
  ctx.arc(0, 0, g.r * 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawBillboard(g, theme) {
  const panelLeft = g.x - g.panelWidth / 2;
  const panelTop = g.anchor === 'top' ? PLAY_TOP : PLAY_BOTTOM - g.panelHeight;

  ctx.save();

  // holographic panel base -- semi-transparent glowing fill
  const grad = ctx.createLinearGradient(0, panelTop, 0, panelTop + g.panelHeight);
  grad.addColorStop(0, theme.accentA + '30');
  grad.addColorStop(1, theme.accentB + '15');
  ctx.fillStyle = grad;
  ctx.fillRect(panelLeft, panelTop, g.panelWidth, g.panelHeight);

  // glowing frame border
  ctx.strokeStyle = theme.accentA;
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 10;
  ctx.lineWidth = 3;
  ctx.strokeRect(panelLeft, panelTop, g.panelWidth, g.panelHeight);
  ctx.shadowBlur = 0;

  // scrolling abstract ad-content glyphs, clipped to the panel
  ctx.save();
  ctx.beginPath();
  ctx.rect(panelLeft, panelTop, g.panelWidth, g.panelHeight);
  ctx.clip();
  const scrollOffset = (frame * 1.5 + g.rotSeed * 50) % 40;
  for (let row = 0; row < Math.ceil(g.panelHeight / 40) + 1; row++) {
    const y = panelTop - 40 + row * 40 + 15 - scrollOffset;
    ctx.fillStyle = row % 2 === 0 ? theme.accentB : theme.accentA;
    ctx.globalAlpha = 0.5;
    ctx.fillRect(panelLeft + 15, y, g.panelWidth - 30, 12);
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawTurret(g, theme) {
  ctx.save();
  const mountTop = g.anchor === 'top' ? PLAY_TOP : g.y;
  const mountHeight = g.anchor === 'top' ? (g.y - PLAY_TOP) : (PLAY_BOTTOM - g.y);
  ctx.fillStyle = '#1a1428';
  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 2;
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 6;
  ctx.fillRect(g.x - 18, mountTop, 36, mountHeight);
  ctx.strokeRect(g.x - 18, mountTop, 36, mountHeight);
  ctx.shadowBlur = 0;

  // muzzle light pulses brighter as the next shot approaches
  const elapsed = frame - g.spawnFrame;
  const cyclePos = (elapsed % g.fireInterval) / g.fireInterval;
  ctx.fillStyle = theme.accentB;
  ctx.globalAlpha = 0.4 + 0.6 * cyclePos;
  ctx.beginPath();
  ctx.arc(g.x, g.y, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawTurretShot(g, theme) {
  ctx.save();
  ctx.shadowColor = theme.accentB;
  ctx.shadowBlur = 10;
  ctx.fillStyle = theme.accentB;
  ctx.beginPath();
  ctx.arc(g.x, g.y, g.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(g.x, g.y, g.r * 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSearchlight(g, theme) {
  const ep = liveSearchlightEndpoint(g);
  ctx.save();

  // soft outer glow cone
  ctx.strokeStyle = theme.accentA;
  ctx.globalAlpha = 0.25;
  ctx.lineWidth = g.beamWidth * 2.2;
  ctx.beginPath();
  ctx.moveTo(g.x, PLAY_TOP);
  ctx.lineTo(ep.x, ep.y);
  ctx.stroke();

  // bright core line
  ctx.globalAlpha = 0.7;
  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = g.beamWidth * 0.5;
  ctx.beginPath();
  ctx.moveTo(g.x, PLAY_TOP);
  ctx.lineTo(ep.x, ep.y);
  ctx.stroke();

  ctx.globalAlpha = 1;

  // pivot lamp housing
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#1a1428';
  ctx.beginPath();
  ctx.arc(g.x, PLAY_TOP, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.shadowBlur = 0;

  ctx.restore();
}

function drawZone2Storm(g, theme) {
  const y = liveStormY(g);
  ctx.save();
  ctx.translate(g.x, y);

  // three layers rotate and pulse at different, unsynced rates so the
  // whole poof feels alive without needing a totally different motion
  // system -- no vertical funnel, just a dense scalloped cloud mass
  const phase1 = frame * 0.008 + g.rotSeed;
  const phase2 = frame * -0.013 + g.rotSeed * 1.7;
  const phase3 = frame * 0.021 + g.rotSeed * 2.3;
  const pulse1 = 1 + Math.sin(frame * 0.02 + g.rotSeed) * 0.04;
  const pulse2 = 1 + Math.sin(frame * 0.031 + g.rotSeed * 1.5) * 0.05;
  const pulse3 = 1 + Math.sin(frame * 0.024 + g.rotSeed * 0.8) * 0.06;

  // a scalloped (bumpy-edged) circular outline, built from rounded bumps
  // connected by quadratic curves through pulled-in valley points --
  // this is what gives the cartoon "poof" silhouette instead of a plain
  // smooth circle
  function scallopedPath(baseR, bumpCount, bumpAmount, rotationPhase) {
    const pts = [];
    for (let i = 0; i < bumpCount; i++) {
      const ang = (i / bumpCount) * Math.PI * 2 + rotationPhase;
      const r = baseR + bumpAmount;
      pts.push([Math.cos(ang) * r, Math.sin(ang) * r]);
    }
    ctx.beginPath();
    for (let i = 0; i < bumpCount; i++) {
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[(i + 1) % bumpCount];
      const midAng = ((i + 0.5) / bumpCount) * Math.PI * 2 + rotationPhase;
      const valleyR = baseR - bumpAmount * 0.5;
      const vx = Math.cos(midAng) * valleyR, vy = Math.sin(midAng) * valleyR;
      if (i === 0) ctx.moveTo(x1, y1);
      ctx.quadraticCurveTo(vx, vy, x2, y2);
    }
    ctx.closePath();
  }

  // outer layer -- darkest, largest, sets the overall silhouette
  scallopedPath(g.r * 0.8 * pulse1, 9, g.r * 0.2, phase1);
  ctx.fillStyle = '#6b5a38';
  ctx.fill();

  // mid layer -- main tone
  scallopedPath(g.r * 0.62 * pulse2, 8, g.r * 0.16, phase2);
  ctx.fillStyle = '#c4a86a';
  ctx.fill();

  // inner layer -- lightest, brightest, gives the sense of a glowing core
  scallopedPath(g.r * 0.38 * pulse3, 7, g.r * 0.1, phase3);
  ctx.fillStyle = '#e8dcb8';
  ctx.fill();

  // burst spike lines radiating from a few fixed points around the edge,
  // matching the reference image's cartoon dust-poof look
  const spikeAngles = [-2.1, -0.6, 1.2, 2.6];
  spikeAngles.forEach((baseAng) => {
    const ang = baseAng + phase1 * 0.3;
    const r1 = g.r * 0.78;
    const r2 = g.r * 1.05;
    const perpAng = ang + Math.PI / 2;
    const spread = g.r * 0.1;
    ctx.strokeStyle = '#c4a86a';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * r1 + Math.cos(perpAng) * spread, Math.sin(ang) * r1 + Math.sin(perpAng) * spread);
    ctx.lineTo(Math.cos(ang) * r2, Math.sin(ang) * r2);
    ctx.moveTo(Math.cos(ang) * r1 - Math.cos(perpAng) * spread, Math.sin(ang) * r1 - Math.sin(perpAng) * spread);
    ctx.lineTo(Math.cos(ang) * r2, Math.sin(ang) * r2);
    ctx.stroke();
  });

  ctx.restore();
}

function drawArcPlanet(g, theme) {
  const y = liveArcPlanetY(g);
  ctx.save();

  ctx.shadowColor = g.color;
  ctx.shadowBlur = 10;
  const grad = ctx.createRadialGradient(g.x - g.r * 0.35, y - g.r * 0.35, g.r * 0.1, g.x, y, g.r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.35, g.color);
  grad.addColorStop(1, '#1a1220');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(g.x, y, g.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawWindVortex(g, theme) {
  ctx.save();
  ctx.translate(g.x, g.y);

  const fieldGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, g.reachR);
  fieldGrad.addColorStop(0, theme.accentB + '00');
  fieldGrad.addColorStop(0.7, theme.accentB + '18');
  fieldGrad.addColorStop(1, theme.accentB + '00');
  ctx.fillStyle = fieldGrad;
  ctx.beginPath();
  ctx.arc(0, 0, g.reachR, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.rotate(frame * 0.03 + g.rotSeed);
  const armCount = 3;
  for (let a = 0; a < armCount; a++) {
    ctx.save();
    ctx.rotate((a / armCount) * Math.PI * 2);
    ctx.strokeStyle = theme.accentA;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = 2;
    ctx.beginPath();
    const turns = 1.4;
    const steps = 24;
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const ang = t * turns * Math.PI * 2;
      const r = t * g.reachR * 0.85;
      const x = Math.cos(ang) * r, y = Math.sin(ang) * r;
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  ctx.restore();
}

function drawBlackHole(g, theme) {
  ctx.save();
  ctx.translate(g.x, g.y);

  // scale visibility details with actual size (baseline ~100px core) so a
  // bigger hole reads as more visible from a distance, not less -- fixed
  // pixel details would otherwise become proportionally thinner and blend
  // into the equally-dark void background as holes get larger
  const sizeScale = Math.max(1, g.coreR / 100);

  // reach field: a soft glow fading from the core out to the boundary,
  // plus a visible ring marking exactly where the pull begins
  const fieldGrad = ctx.createRadialGradient(0, 0, g.coreR, 0, 0, g.reachR);
  const fieldAlpha = 0.18 * Math.min(1.6, sizeScale);
  const fieldAlphaHex = Math.round(fieldAlpha * 255).toString(16).padStart(2, '0');
  fieldGrad.addColorStop(0, theme.accentA + fieldAlphaHex);
  fieldGrad.addColorStop(1, theme.accentA + '00');
  ctx.fillStyle = fieldGrad;
  ctx.beginPath();
  ctx.arc(0, 0, g.reachR, 0, Math.PI * 2);
  ctx.fill();

  const pulse = 0.5 + 0.5 * Math.sin(frame * 0.03 + g.rotSeed);
  ctx.strokeStyle = theme.accentA;
  ctx.globalAlpha = 0.22 + 0.15 * pulse;
  ctx.lineWidth = 2.5 * sizeScale;
  ctx.beginPath();
  ctx.arc(0, 0, g.reachR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // rotating accretion disk bands
  ctx.save();
  ctx.rotate(frame * 0.02 + g.rotSeed);
  const diskR = g.coreR * 2.2;
  for (let i = 0; i < 3; i++) {
    const bandR = g.coreR * 1.3 + (i * (diskR - g.coreR * 1.3)) / 3;
    ctx.strokeStyle = theme.accentB;
    ctx.globalAlpha = 0.5 - i * 0.12;
    ctx.lineWidth = 5 * sizeScale;
    ctx.beginPath();
    ctx.ellipse(0, 0, bandR, bandR * 0.4, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.globalAlpha = 1;

  // lethal core: near-black with a violet rim glow
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 24 * sizeScale;
  const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, g.coreR);
  coreGrad.addColorStop(0, '#000000');
  coreGrad.addColorStop(0.85, '#050208');
  coreGrad.addColorStop(1, theme.accentA);
  ctx.fillStyle = coreGrad;
  ctx.beginPath();
  ctx.arc(0, 0, g.coreR, 0, Math.PI * 2);
  ctx.fill();

  // extra rim stroke so the core's silhouette reads clearly against the
  // dark background even at a distance, scaling with size
  ctx.strokeStyle = theme.accentA;
  ctx.globalAlpha = 0.6;
  ctx.lineWidth = 2 * sizeScale;
  ctx.beginPath();
  ctx.arc(0, 0, g.coreR, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawWreckage(g, theme) {
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.rotate(g.rotSeed + frame * g.spin);

  // irregular angular chunk (5-point jagged polygon), reads clearly as
  // spinning debris rather than a round rock
  const grad = ctx.createLinearGradient(-g.r, -g.r, g.r, g.r);
  grad.addColorStop(0, '#7a8590');
  grad.addColorStop(0.5, '#454e57');
  grad.addColorStop(1, '#20262c');
  ctx.fillStyle = grad;
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 8;

  const pts = [
    [0.9, -0.3], [0.3, -0.95], [-0.6, -0.7], [-0.95, 0.15],
    [-0.35, 0.9], [0.5, 0.75], [0.85, 0.2]
  ];
  ctx.beginPath();
  pts.forEach(([px, py], i) => {
    const x = px * g.r, y = py * g.r;
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.closePath();
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.globalAlpha = 1;

  // panel seam lines for a broken-hull-plating look
  ctx.strokeStyle = 'rgba(0,0,0,0.35)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-g.r * 0.5, -g.r * 0.4);
  ctx.lineTo(g.r * 0.4, g.r * 0.1);
  ctx.moveTo(-g.r * 0.1, -g.r * 0.6);
  ctx.lineTo(-g.r * 0.1, g.r * 0.5);
  ctx.stroke();

  ctx.restore();
}

function drawAsteroid(g, theme) {
  ctx.save();
  ctx.translate(g.x, g.y);
  ctx.rotate(g.rotSeed + frame * g.spin);

  const grad = ctx.createRadialGradient(-g.r * 0.3, -g.r * 0.3, g.r * 0.15, 0, 0, g.r);
  grad.addColorStop(0, '#8a7358');
  grad.addColorStop(1, '#2e2418');
  ctx.fillStyle = grad;
  ctx.shadowColor = theme.accentB;
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(0, 0, g.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.shadowBlur = 0;
  ctx.fillStyle = 'rgba(0,0,0,0.28)';
  ctx.beginPath();
  ctx.arc(g.r * 0.3, g.r * 0.1, g.r * 0.22, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(-g.r * 0.25, -g.r * 0.35, g.r * 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = theme.accentB;
  ctx.globalAlpha = 0.45;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.arc(0, 0, g.r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawFireball(g, theme) {
  const y = liveFireballY(g);
  const r = g.r;
  const s = r / 20; // F3 was designed at this base scale

  ctx.save();
  ctx.translate(g.x, y);
  // jagged licks lead (left, direction of travel), white-hot core trails
  // behind at the tail (right)

  // continuously-flowing motion trail -- streaks spawn near the flame and
  // drift backward (trailing edge), fading out as they go, looping
  ctx.strokeStyle = '#4fd6ff';
  ctx.lineWidth = Math.max(2, r * 0.15);
  const cycleLen = r * 4.5;
  for (let i = 0; i < 5; i++) {
    const phase = (frame * 1.6 + i * (cycleLen / 5)) % cycleLen;
    const off = 42 * s + phase;
    const fade = 1 - phase / cycleLen;
    ctx.globalAlpha = 0.38 * fade;
    const yOff = Math.sin(i * 2.3 + frame * 0.06) * r * 0.28;
    const segLen = r * (0.7 + fade * 0.6);
    ctx.beginPath();
    ctx.moveTo(off, yOff);
    ctx.lineTo(off + segLen, yOff);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  ctx.shadowColor = '#4fd6ff';
  ctx.shadowBlur = 14;

  // outer jagged flame silhouette -- fixed shape, no pulsing (only the
  // ship-relative position moves, so the slide reads clearly)
  ctx.fillStyle = '#0d3a5c';
  ctx.beginPath();
  ctx.moveTo(46 * s, 0);
  ctx.lineTo(15 * s, -20 * s);
  ctx.lineTo(-5 * s, -10 * s);
  ctx.lineTo(-35 * s, -18 * s);
  ctx.lineTo(-55 * s, 0);
  ctx.lineTo(-35 * s, 18 * s);
  ctx.lineTo(-5 * s, 10 * s);
  ctx.lineTo(15 * s, 20 * s);
  ctx.closePath();
  ctx.fill();

  // inner bright layer
  ctx.fillStyle = '#4fd6ff';
  ctx.beginPath();
  ctx.moveTo(34 * s, 0);
  ctx.lineTo(8 * s, -13 * s);
  ctx.lineTo(-12 * s, 0);
  ctx.lineTo(8 * s, 13 * s);
  ctx.closePath();
  ctx.fill();

  // white-hot core at the tail (trailing edge)
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.ellipse(28 * s, 0, 15 * s, 10 * s, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawHBar(g, theme) {
  const y = liveGateCenter(g);
  const left = g.x - g.width / 2;
  const top = y - g.thickness / 2;

  ctx.save();
  ctx.shadowColor = theme.accentB;
  ctx.shadowBlur = 12;
  const grad = ctx.createLinearGradient(left, top, left + g.width, top + g.thickness);
  grad.addColorStop(0, theme.accentA);
  grad.addColorStop(1, theme.accentB);
  ctx.fillStyle = grad;

  const r = Math.min(6, g.thickness / 2);
  ctx.beginPath();
  ctx.moveTo(left + r, top);
  ctx.lineTo(left + g.width - r, top);
  ctx.quadraticCurveTo(left + g.width, top, left + g.width, top + r);
  ctx.lineTo(left + g.width, top + g.thickness - r);
  ctx.quadraticCurveTo(left + g.width, top + g.thickness, left + g.width - r, top + g.thickness);
  ctx.lineTo(left + r, top + g.thickness);
  ctx.quadraticCurveTo(left, top + g.thickness, left, top + g.thickness - r);
  ctx.lineTo(left, top + r);
  ctx.quadraticCurveTo(left, top, left + r, top);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;
  ctx.stroke();
  ctx.restore();
}

function drawBarrier(g, theme) {
  const active = barrierIsActive(g);
  const framesToToggle = barrierFramesToToggle(g);
  const warning = !active && framesToToggle < 25; // pre-activation flicker warning

  const gTop = g.gapCenter - g.gapHeight / 2;
  const gBottom = g.gapCenter + g.gapHeight / 2;
  const left = g.x - g.width / 2;
  const right = g.x + g.width / 2;
  const cx = g.x;

  // build a jagged vertical path (zigzagging left-right) for a mass spanning yStart..yEnd
  function jaggedMassPath(yStart, yEnd) {
    const n = g.jitter.length;
    const points = [];
    for (let i = 0; i <= n + 1; i++) {
      const t = i / (n + 1);
      const y = yStart + (yEnd - yStart) * t;
      const jx = (i > 0 && i <= n) ? g.jitter[i - 1] * g.width * 0.7 : 0;
      points.push([cx + jx, y]);
    }
    return points;
  }

  function fillJaggedMass(yStart, yEnd) {
    if (yEnd <= yStart) return;
    const path = jaggedMassPath(yStart, yEnd);
    ctx.beginPath();
    ctx.moveTo(left, yStart);
    path.forEach(([px, py]) => ctx.lineTo(px + g.width / 2, py));
    ctx.lineTo(right, yEnd);
    // close back along the left side
    ctx.lineTo(right, yEnd);
    for (let i = path.length - 1; i >= 0; i--) ctx.lineTo(path[i][0] - g.width / 2, path[i][1]);
    ctx.closePath();
    ctx.fill();

    // bright jagged energy line down the middle -- the "shaped like a lightning bolt" part
    ctx.save();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2.5;
    ctx.shadowColor = '#fff';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    path.forEach(([px, py], i) => { if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
    ctx.stroke();
    ctx.restore();
  }

  ctx.save();

  if (active || warning) {
    const flicker = warning
      ? 0.4 + 0.5 * Math.abs(Math.sin(frame * 0.9))
      : 0.85 + 0.15 * Math.sin(frame * 1.7);
    ctx.globalAlpha = flicker;
    ctx.shadowColor = theme.accentA;
    ctx.shadowBlur = 18;
    ctx.fillStyle = theme.accentA;

    fillJaggedMass(PLAY_TOP, gTop);
    fillJaggedMass(gBottom, PLAY_BOTTOM);
  } else {
    // inactive: faint dashed outline only, no danger
    ctx.globalAlpha = 0.3;
    ctx.strokeStyle = theme.accentB;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(left, PLAY_TOP, g.width, gTop - PLAY_TOP);
    ctx.strokeRect(left, gBottom, g.width, PLAY_BOTTOM - gBottom);
    ctx.setLineDash([]);
  }

  ctx.restore();
}

function drawLightningBolt(g, theme) {
  const left = g.x - g.span / 2;
  const right = g.x + g.span / 2;

  // brief fade-in flash when it first appears
  const age = frame - g.spawnFrame;
  const fadeIn = Math.min(1, age / 20);

  // build the jagged path using the bolt's fixed jitter values
  const points = [];
  const segs = g.jitter.length + 1;
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const px = left + (right - left) * t;
    const py = g.y1 + (g.y2 - g.y1) * t + (i > 0 && i < segs ? g.jitter[i - 1] * g.thickness : 0);
    points.push([px, py]);
  }

  ctx.save();
  ctx.globalAlpha = fadeIn * (0.8 + 0.2 * Math.sin(frame * 1.5));

  // outer glow
  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = g.thickness;
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = fadeIn * 0.35;
  ctx.beginPath();
  points.forEach(([px, py], i) => { if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
  ctx.stroke();

  // bright jagged core
  ctx.globalAlpha = fadeIn;
  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 3;
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 16;
  ctx.beginPath();
  points.forEach(([px, py], i) => { if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); });
  ctx.stroke();

  ctx.restore();
}

function drawCloud(cx, cy, theme, lit) {
  ctx.save();
  const puffs = [[0, 0, 20], [-17, 5, 15], [17, 5, 15], [-7, -8, 13], [8, -9, 13], [0, 8, 14]];
  // soft glow behind the whole cloud so it reads clearly against the sky
  ctx.globalAlpha = lit ? 0.35 : 0.2;
  ctx.fillStyle = theme.accentA;
  ctx.beginPath();
  puffs.forEach(([dx, dy, r]) => {
    ctx.moveTo(cx + dx + r * 1.4, cy + dy);
    ctx.arc(cx + dx, cy + dy, r * 1.4, 0, Math.PI * 2);
  });
  ctx.fill();
  // shadowed base
  ctx.globalAlpha = 0.75;
  ctx.fillStyle = '#3a3f5c';
  ctx.beginPath();
  puffs.forEach(([dx, dy, r]) => {
    ctx.moveTo(cx + dx + r, cy + dy + 2);
    ctx.arc(cx + dx, cy + dy + 2, r, 0, Math.PI * 2);
  });
  ctx.fill();
  // lit top -- brighter when the arc is actively discharging
  ctx.globalAlpha = lit ? 0.85 : 0.6;
  ctx.fillStyle = lit ? theme.accentA : '#8992b8';
  ctx.beginPath();
  puffs.forEach(([dx, dy, r]) => {
    ctx.moveTo(cx + dx + r * 0.9, cy + dy - 2);
    ctx.arc(cx + dx, cy + dy - 2, r * 0.9, 0, Math.PI * 2);
  });
  ctx.fill();
  ctx.restore();
}

function drawCloudArc(g, theme) {
  const active = barrierIsActive(g);
  const framesToToggle = barrierFramesToToggle(g);
  const warning = !active && framesToToggle < 25;

  drawCloud(g.x, g.y, theme, active);
  drawCloud(g.x2, g.y2, theme, active);

  const dx = g.x2 - g.x, dy = g.y2 - g.y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const px = -dy / len, py = dx / len; // unit perpendicular, for jitter offset
  const n = g.jitter.length;
  const amplitude = 14;
  const points = [];
  for (let i = 0; i <= n + 1; i++) {
    const t = i / (n + 1);
    const baseX = g.x + dx * t, baseY = g.y + dy * t;
    const j = (i > 0 && i <= n) ? g.jitter[i - 1] * amplitude : 0;
    points.push([baseX + px * j, baseY + py * j]);
  }
  // find the main-line point closest to the fixed branchT to fork from
  const branchIdx = Math.round(g.branchT * (points.length - 1));
  const [bx, by] = points[branchIdx];
  const mainAngle = Math.atan2(dy, dx);
  const branchAngle = mainAngle + g.branchSide * (0.6 + g.branchAngleJitter);
  const bx2 = bx + Math.cos(branchAngle) * g.branchLen;
  const by2 = by + Math.sin(branchAngle) * g.branchLen;

  ctx.save();
  if (active || warning) {
    const flicker = warning
      ? 0.4 + 0.5 * Math.abs(Math.sin(frame * 0.9))
      : 0.85 + 0.15 * Math.sin(frame * 1.7);
    ctx.globalAlpha = flicker;
    ctx.shadowColor = theme.accentA;
    ctx.shadowBlur = 22;

    // wide outer glow pass
    ctx.strokeStyle = theme.accentA;
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();

    // secondary branch fork, thinner and dimmer than the main bolt
    if (active) {
      ctx.globalAlpha = flicker * 0.7;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.lineTo(bx2, by2);
      ctx.stroke();
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#fff';
      ctx.stroke();
    }

    // bright white-hot core on the main line
    ctx.globalAlpha = flicker;
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    points.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.stroke();
  }
  ctx.restore();
}

function drawFloatingBolt(g, theme) {
  const active = barrierIsActive(g);
  const framesToToggle = barrierFramesToToggle(g);
  const warning = !active && framesToToggle < 25;

  const topY = g.y - g.height / 2;
  const px = g.shape.map(([nx, ny]) => [g.x + nx * g.swingWidth / 2, topY + ny * g.height]);

  ctx.save();

  if (active || warning) {
    const flicker = warning
      ? 0.4 + 0.5 * Math.abs(Math.sin(frame * 0.9))
      : 0.85 + 0.15 * Math.sin(frame * 1.7);
    ctx.globalAlpha = flicker;
    ctx.shadowColor = theme.accentA;
    ctx.shadowBlur = 16;

    const grad = ctx.createLinearGradient(g.x, topY, g.x, topY + g.height);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, theme.accentA);
    grad.addColorStop(1, theme.accentB);
    ctx.fillStyle = grad;

    ctx.beginPath();
    px.forEach(([rx, ry], i) => { if (i === 0) ctx.moveTo(rx, ry); else ctx.lineTo(rx, ry); });
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 1.2;
    ctx.globalAlpha = flicker * 0.8;
    ctx.stroke();
  }

  ctx.restore();
}

function drawPendulum(g, theme) {
  const bobY = livePendulumBobY(g);

  ctx.save();

  // bob
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 14;
  const grad = ctx.createRadialGradient(g.x - g.r * 0.3, bobY - g.r * 0.3, g.r * 0.15, g.x, bobY, g.r);
  grad.addColorStop(0, '#fff3c4');
  grad.addColorStop(0.55, theme.accentA);
  grad.addColorStop(1, '#8a6a1a');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(g.x, bobY, g.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;
  ctx.stroke();

  ctx.restore();
}

function drawAcidDripVisual(x, y, r, accentA, accentB) {
  ctx.save();
  ctx.shadowColor = accentA;
  ctx.shadowBlur = 10;
  const grad = ctx.createRadialGradient(x, y + r * 0.15, r * 0.1, x, y + r * 0.15, r);
  grad.addColorStop(0, '#e8ffb0');
  grad.addColorStop(0.5, accentA);
  grad.addColorStop(1, accentB);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.moveTo(x, y - r * 1.3);
  ctx.quadraticCurveTo(x + r * 0.95, y - r * 0.2, x + r * 0.75, y + r * 0.35);
  ctx.arc(x, y + r * 0.15, r * 0.78, Math.PI * 0.25, Math.PI * 0.75);
  ctx.quadraticCurveTo(x - r * 0.95, y - r * 0.2, x, y - r * 1.3);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = accentA;
  ctx.lineWidth = 1;
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.restore();
}

function drawAcidDrip(g, theme) {
  drawAcidDripVisual(g.x, liveAcidDripY(g), g.r, theme.accentA, theme.accentB);
}

function drawShootingStar(g, theme) {
  const y = liveShootingStarY(g);
  const effScroll = SCROLL_SPEED * (currentTheme().scrollMult || 1);

  // direction of travel via recent velocity, so the tail orients correctly
  // for any diagonal slope
  const dt = 6;
  const prevFrame = Math.max(g.spawnFrame, frame - dt);
  const framesBack = frame - prevFrame;
  const prevT = Math.min(1, (prevFrame - g.spawnFrame) / g.life);
  const prevY = g.startY + (g.endY - g.startY) * prevT;
  const dx = -framesBack * effScroll;
  const dy = y - prevY;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  const dirX = dx / len, dirY = dy / len;

  // tail extends OPPOSITE the direction of travel (behind, where it came
  // from) -- the bright head at (g.x, y) leads, the fading tail trails
  const pulse = 1 + Math.sin(frame * 0.35 + g.spawnFrame) * 0.15;
  const tailLen = g.r * 9 * pulse;
  const tailX = g.x - dirX * tailLen;
  const tailY = y - dirY * tailLen;

  ctx.save();
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 10;

  const grad = ctx.createLinearGradient(tailX, tailY, g.x, y);
  grad.addColorStop(0, 'rgba(255,255,255,0)');
  grad.addColorStop(0.6, theme.accentA);
  grad.addColorStop(1, '#fff3d6');
  ctx.strokeStyle = grad;
  ctx.lineWidth = g.r * 0.9 * pulse;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(tailX, tailY);
  ctx.lineTo(g.x, y);
  ctx.stroke();

  // twinkling sparkles along the tail's length, each with its own phase
  ctx.fillStyle = '#fff3d6';
  const sparkleCount = 4;
  for (let i = 1; i <= sparkleCount; i++) {
    const along = i / (sparkleCount + 1);
    const sx = g.x - dirX * tailLen * along;
    const sy = y - dirY * tailLen * along;
    const twinkle = 0.4 + 0.6 * Math.max(0, Math.sin(frame * 0.25 + i * 1.9 + g.spawnFrame * 0.1));
    ctx.globalAlpha = twinkle * (1 - along * 0.6);
    ctx.beginPath();
    ctx.arc(sx, sy, g.r * 0.18 * (1 - along * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.shadowBlur = 6;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(g.x, y, g.r * 0.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawMovingDoor(g, theme) {
  const ranges = liveDoorGapRanges(g).slice().sort((a, b) => a.top - b.top);

  ctx.save();
  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 2;
  ctx.globalAlpha = 0.4;
  ctx.beginPath();
  ctx.moveTo(g.x - g.width / 2, PLAY_TOP);
  ctx.lineTo(g.x - g.width / 2, PLAY_BOTTOM);
  ctx.moveTo(g.x + g.width / 2, PLAY_TOP);
  ctx.lineTo(g.x + g.width / 2, PLAY_BOTTOM);
  ctx.stroke();
  ctx.globalAlpha = 1;

  // solid slab everywhere except the gaps
  ctx.fillStyle = '#2a323b';
  let cursor = PLAY_TOP;
  for (const r of ranges) {
    if (r.top > cursor) {
      ctx.fillRect(g.x - g.width / 2, cursor, g.width, r.top - cursor);
    }
    cursor = Math.max(cursor, r.bottom);
  }
  if (cursor < PLAY_BOTTOM) {
    ctx.fillRect(g.x - g.width / 2, cursor, g.width, PLAY_BOTTOM - cursor);
  }

  // warning stripe accents at the solid segment edges
  ctx.fillStyle = theme.accentB;
  ctx.globalAlpha = 0.5;
  for (const r of ranges) {
    ctx.fillRect(g.x - g.width / 2, r.top - 4, g.width, 4);
    ctx.fillRect(g.x - g.width / 2, r.bottom, g.width, 4);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawAccessKey(g, theme) {
  ctx.save();
  ctx.translate(g.x, g.y + Math.sin(frame * 0.06) * 4);
  const spin = Math.sin(frame * 0.04);
  ctx.scale(spin * 0.6 + 0.7, 1);

  ctx.shadowColor = theme.accentB;
  ctx.shadowBlur = 14;
  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = 4;
  ctx.lineCap = 'round';

  ctx.beginPath();
  ctx.arc(0, -10, 8, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, -2);
  ctx.lineTo(0, 14);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(0, 8);
  ctx.lineTo(7, 8);
  ctx.moveTo(0, 14);
  ctx.lineTo(5, 14);
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,255,255,0.4)';
  ctx.beginPath();
  ctx.arc(0, -10, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawSparkHub(g, theme) {
  const charging = sparkHubIsCharging(g);
  const chargeT = charging ? sparkHubPhase(g) / g.chargeFrames : 0;

  ctx.save();

  // T1 tower: a straight industrial strut connecting the hub to the
  // ceiling or floor it's mounted on
  const boundaryY = g.mountSide === 'ceiling' ? PLAY_TOP : PLAY_BOTTOM;
  ctx.fillStyle = '#2a323b';
  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 1.5;
  const towerTop = Math.min(boundaryY, g.y);
  const towerBottom = Math.max(boundaryY, g.y);
  ctx.fillRect(g.x - 6, towerTop, 12, towerBottom - towerTop);
  ctx.strokeRect(g.x - 6, towerTop, 12, towerBottom - towerTop);
  // mounting bracket at the boundary
  ctx.fillStyle = '#3a4450';
  ctx.fillRect(g.x - 10, boundaryY - (g.mountSide === 'ceiling' ? 0 : 8), 20, 8);

  ctx.translate(g.x, g.y);

  // pointy satellite spikes, one per firing direction -- doubles as a
  // visual hint for where the burst will launch
  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 2;
  for (let i = 0; i < 8; i++) {
    const ang = (i * Math.PI) / 4;
    const innerR = 7, outerR = 17;
    ctx.beginPath();
    ctx.moveTo(Math.cos(ang) * innerR, Math.sin(ang) * innerR);
    ctx.lineTo(Math.cos(ang) * outerR, Math.sin(ang) * outerR);
    ctx.stroke();
    ctx.fillStyle = theme.accentB;
    ctx.beginPath();
    ctx.arc(Math.cos(ang) * outerR, Math.sin(ang) * outerR, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // small satellite dish panel
  ctx.fillStyle = '#2a323b';
  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, g.mountSide === 'ceiling' ? -20 : 20, 9, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // angular central core body
  ctx.fillStyle = '#1a2a3a';
  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, -9); ctx.lineTo(9, 0); ctx.lineTo(0, 9); ctx.lineTo(-9, 0);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // charge-up glow building toward the moment it fires
  if (charging && chargeT > 0.3) {
    const pulse = (chargeT - 0.3) / 0.7;
    ctx.fillStyle = theme.accentA;
    ctx.shadowColor = theme.accentA;
    ctx.shadowBlur = 20 * pulse;
    ctx.globalAlpha = pulse * (0.5 + 0.5 * Math.sin(frame * 0.6));
    ctx.beginPath();
    ctx.arc(0, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}

function drawSparkProjectile(g, theme) {
  const pos = liveProjectilePos(g);
  ctx.save();

  // crackling electric tendrils radiating from the ball -- evenly spaced
  // with a shared slow rotation so the overall shape stays symmetric,
  // with only small independent jitter/length variation per tendril for
  // liveliness without throwing off the balance
  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 1.2;
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 6;
  const tendrilCount = 6;
  const sharedRotation = frame * 0.03 + g.spawnFrame * 0.7;
  for (let i = 0; i < tendrilCount; i++) {
    const seed = g.spawnFrame * 3.7 + i * 5.3;
    const baseAngle = (i / tendrilCount) * Math.PI * 2 + sharedRotation;
    const jitterAngle = baseAngle + Math.sin(frame * 0.8 + seed) * 0.15;
    const len = g.r * (1.2 + 0.4 * Math.abs(Math.sin(frame * 0.5 + seed)));
    const midLen = len * 0.5;
    const midAngle = baseAngle + Math.sin(frame * 0.9 + seed) * 0.12;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(pos.x + Math.cos(midAngle) * midLen, pos.y + Math.sin(midAngle) * midLen);
    ctx.lineTo(pos.x + Math.cos(jitterAngle) * len, pos.y + Math.sin(jitterAngle) * len);
    ctx.stroke();
  }

  // bright core ball
  ctx.shadowBlur = 12;
  const grad = ctx.createRadialGradient(pos.x, pos.y, 0, pos.x, pos.y, g.r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.45, theme.accentA);
  grad.addColorStop(1, 'rgba(94,200,232,0.15)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, g.r, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawSpecialDoor(g, theme) {
  const unlocked = specialDoorUnlocked[g.eventIndex];
  ctx.save();

  ctx.fillStyle = unlocked ? 'rgba(26,17,8,0.3)' : '#1a1108';
  ctx.globalAlpha = unlocked ? 0.35 : 1;
  ctx.fillRect(g.x - g.width / 2, PLAY_TOP, g.width, PLAY_BOTTOM - PLAY_TOP);
  ctx.globalAlpha = 1;

  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = 3;
  ctx.globalAlpha = unlocked ? 0.4 : 0.9;
  ctx.strokeRect(g.x - g.width / 2, PLAY_TOP, g.width, PLAY_BOTTOM - PLAY_TOP);
  ctx.globalAlpha = 1;

  // card reader panel and status light
  const panelY = (PLAY_TOP + PLAY_BOTTOM) / 2;
  ctx.fillStyle = '#0a0e14';
  ctx.fillRect(g.x - 12, panelY - 20, 24, 40);
  ctx.strokeStyle = theme.accentB;
  ctx.globalAlpha = unlocked ? 0.3 : 0.8;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(g.x - 12, panelY - 20, 24, 40);
  ctx.globalAlpha = 1;

  const pulse = unlocked ? 1 : 0.6 + 0.4 * Math.sin(frame * 0.15);
  ctx.fillStyle = unlocked ? '#5ec870' : '#d84545';
  ctx.shadowColor = ctx.fillStyle;
  ctx.shadowBlur = 10 * pulse;
  ctx.globalAlpha = pulse;
  ctx.beginPath();
  ctx.arc(g.x, panelY, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawGeyser(g, theme) {
  const h = liveGeyserHeight(g);
  const warning = geyserIsWarning(g);
  const dir = g.pivotSide === 'floor' ? -1 : 1;
  const baseY = g.pivotSide === 'floor' ? PLAY_BOTTOM : PLAY_TOP;
  const tipY = baseY + dir * h;

  ctx.save();

  // warning pulse at the base, telegraphing an incoming eruption
  if (warning) {
    const pulse = 0.3 + 0.3 * Math.sin(frame * 0.4);
    ctx.fillStyle = theme.accentA;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.ellipse(g.x, baseY - dir * 2, g.width * 0.7, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  // tapering spike body from base to current tip height
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 12;
  const grad = ctx.createLinearGradient(g.x, baseY, g.x, tipY);
  grad.addColorStop(0, theme.accentB);
  grad.addColorStop(1, '#e8ffb0');
  ctx.fillStyle = grad;
  ctx.globalAlpha = 0.85;
  ctx.beginPath();
  ctx.moveTo(g.x - g.width / 2, baseY);
  ctx.lineTo(g.x - g.width * 0.15, tipY);
  ctx.lineTo(g.x + g.width * 0.15, tipY);
  ctx.lineTo(g.x + g.width / 2, baseY);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.6;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawToxicPool(g, theme) {
  const r = liveToxicPoolRadius(g);

  ctx.save();
  ctx.shadowColor = theme.accentA;
  ctx.shadowBlur = 16;

  const grad = ctx.createRadialGradient(g.x, g.y, 0, g.x, g.y, r);
  grad.addColorStop(0, '#e8ffb0');
  grad.addColorStop(0.5, theme.accentA);
  grad.addColorStop(1, theme.accentB);
  ctx.globalAlpha = 0.85;
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
  ctx.fill();

  // small bubbling dots inside for a toxic-ooze texture
  ctx.globalAlpha = 0.6;
  ctx.fillStyle = theme.accentB;
  for (let i = 0; i < 3; i++) {
    const a = frame * 0.04 + i * 2.1;
    const dist = r * 0.5;
    const bx = g.x + Math.cos(a) * dist;
    const by = g.y + Math.sin(a) * dist;
    ctx.beginPath();
    ctx.arc(bx, by, Math.max(1.5, r * 0.15), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.7;
  ctx.beginPath();
  ctx.arc(g.x, g.y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.restore();
}

function drawGates(theme) {
  for (let g of gates) {
    if (g.type === 'asteroid') {
      drawAsteroid(g, theme);
      continue;
    }
    if (g.type === 'wreckage') {
      drawWreckage(g, theme);
      continue;
    }
    if (g.type === 'blackhole') {
      drawBlackHole(g, theme);
      continue;
    }
    if (g.type === 'windvortex') {
      drawWindVortex(g, theme);
      continue;
    }
    if (g.type === 'orbiter') {
      drawOrbiter(g, theme);
      continue;
    }
    if (g.type === 'arcplanet') {
      drawArcPlanet(g, theme);
      continue;
    }
    if (g.type === 'zone2storm') {
      drawZone2Storm(g, theme);
      continue;
    }
    if (g.type === 'searchlight') {
      drawSearchlight(g, theme);
      continue;
    }
    if (g.type === 'turret') {
      drawTurret(g, theme);
      continue;
    }
    if (g.type === 'turretshot') {
      drawTurretShot(g, theme);
      continue;
    }
    if (g.type === 'billboard') {
      drawBillboard(g, theme);
      continue;
    }
    if (g.type === 'emp') {
      drawEmp(g, theme);
      continue;
    }
    if (g.type === 'echotrail') {
      drawEchoTrail(g, theme);
      continue;
    }
    if (g.type === 'pulsingorb') {
      drawPulsingOrb(g, theme);
      continue;
    }
    if (g.type === 'boomerang') {
      drawBoomerang(g, theme);
      continue;
    }
    if (g.type === 'bossattack') {
      drawBossAttack(g, theme);
      continue;
    }
    if (g.type === 'bossragepulse') {
      drawBossRagePulse(g, theme);
      continue;
    }
    if (g.type === 'bossdiagonalring') {
      drawBossDiagonalRings(g, theme);
      continue;
    }
    if (g.type === 'bossdrone') {
      if (g.homing) drawBossHomingOrb(g, theme); else drawBossDroneShard(g, theme);
      continue;
    }
    if (g.type === 'bossvolleytelegraph') {
      drawBossVolleyTelegraph(g, theme);
      continue;
    }
    if (g.type === 'bossember') {
      drawBossEmber(g, theme);
      continue;
    }
    if (g.type === 'bossashcloud') {
      drawBossAshCloud(g, theme);
      continue;
    }
    if (g.type === 'bosschargebeamtelegraph') {
      drawBossChargeBeamTelegraph(g, theme);
      continue;
    }
    if (g.type === 'bosschargebeam') {
      drawBossChargeBeam(g, theme);
      continue;
    }
    if (g.type === 'securitydrone') {
      drawSecurityDrone(g, theme);
      continue;
    }
    if (g.type === 'lasergrid') {
      drawLaserGrid(g, theme);
      continue;
    }
    if (g.type === 'lensingzone') {
      drawLensingZone(g, theme);
      continue;
    }
    if (g.type === 'signalcorruption') {
      drawSignalCorruption(g, theme);
      continue;
    }
    if (g.type === 'supernova') {
      drawSupernovaPlanet(g, theme);
      continue;
    }
    if (g.type === 'supernovadebris') {
      drawSupernovaDebris(g, theme);
      continue;
    }
    if (g.type === 'movingdoor') {
      drawMovingDoor(g, theme);
      continue;
    }
    if (g.type === 'accesskey') {
      drawAccessKey(g, theme);
      continue;
    }
    if (g.type === 'specialdoor') {
      drawSpecialDoor(g, theme);
      continue;
    }
    if (g.type === 'sparkhub') {
      drawSparkHub(g, theme);
      continue;
    }
    if (g.type === 'sparkprojectile') {
      drawSparkProjectile(g, theme);
      continue;
    }
    if (g.type === 'shootingstar') {
      drawShootingStar(g, theme);
      continue;
    }
    if (g.type === 'toxicpool') {
      drawToxicPool(g, theme);
      continue;
    }
    if (g.type === 'aciddrip') {
      drawAcidDrip(g, theme);
      continue;
    }
    if (g.type === 'geyser') {
      drawGeyser(g, theme);
      continue;
    }
    if (g.type === 'fireball') {
      drawFireball(g, theme);
      continue;
    }
    if (g.type === 'pendulum') {
      drawPendulum(g, theme);
      continue;
    }
    if (g.type === 'hbar') {
      drawHBar(g, theme);
      continue;
    }
    if (g.type === 'lbolt') {
      drawFloatingBolt(g, theme);
      continue;
    }
    if (g.type === 'cloudarc') {
      drawCloudArc(g, theme);
      continue;
    }
    if (g.type === 'barrier') {
      drawBarrier(g, theme);
      continue;
    }
    if (g.type === 'lightning') {
      drawLightningBolt(g, theme);
      continue;
    }
    if (theme.obstacleShape === 'diamond') {
      drawDiamondGate(g, theme);
      continue;
    }
    const center = liveGateCenter(g);
    const gap = liveGateGap(g);
    const topH = center - gap / 2 - PLAY_TOP;
    const botY = center + gap / 2;
    const botH = PLAY_BOTTOM - botY;

    ctx.save();
    ctx.shadowColor = theme.accentB;
    ctx.shadowBlur = 14;
    const grad = ctx.createLinearGradient(g.x, 0, g.x + GATE_WIDTH, 0);
    grad.addColorStop(0, theme.accentA);
    grad.addColorStop(1, theme.accentB);
    ctx.fillStyle = grad;

    ctx.fillRect(g.x, PLAY_TOP, GATE_WIDTH, topH);
    ctx.fillRect(g.x, botY, GATE_WIDTH, botH);
    ctx.restore();
  }
}

const PORTAL_VANISH_RANGE = 260; // px -- how far before the portal the ship starts vanishing

function getShipVanishProgress() {
  if (warpActive) return 1; // stay hidden through the entire warp tunnel sequence
  if (!portalObject) return 0;
  const dist = portalObject.x - ship.x;
  if (dist > PORTAL_VANISH_RANGE) return 0;
  if (dist < 0) return 1;
  return Math.max(0, Math.min(1, (PORTAL_VANISH_RANGE - dist) / PORTAL_VANISH_RANGE));
}

const INVINCIBILITY_BLINK_INTERVAL_MS = 66; // ~15 toggles/sec -- classic NES-style flicker rate

function unlockedShipTrails() {
  return SHIP_TRAILS.filter((t) => t.unlocked());
}

function currentShipTrail() {
  const spec = SHIP_TRAILS.find((t) => t.id === shipTrailStyle);
  if (spec && spec.unlocked()) return spec;
  shipTrailStyle = 'classic';
  savePlayerProfile();
  return SHIP_TRAILS.find((t) => t.id === 'classic') || SHIP_TRAILS[0];
}

function cycleShipTrail(dir) {
  const unlocked = unlockedShipTrails();
  if (!unlocked.length) return;
  let i = unlocked.findIndex((t) => t.id === currentShipTrail().id);
  if (i < 0) i = 0;
  shipTrailStyle = unlocked[(i + dir + unlocked.length) % unlocked.length].id;
  savePlayerProfile();
  lastRenderedOverlayState = null;
  updateOverlay();
}

function unlockedShipSkins() {
  return SHIP_SKINS.filter((s) => s.unlocked());
}

function currentShipSkin() {
  if (shipSkinStyle === 'gravity') shipSkinStyle = 'neon';
  const spec = SHIP_SKINS.find((s) => s.id === shipSkinStyle);
  if (spec && spec.unlocked()) return spec;
  shipSkinStyle = 'classic';
  savePlayerProfile();
  return SHIP_SKINS[0];
}

function cycleShipSkin(dir) {
  const unlocked = unlockedShipSkins();
  if (!unlocked.length) return;
  let i = unlocked.findIndex((s) => s.id === currentShipSkin().id);
  if (i < 0) i = 0;
  shipSkinStyle = unlocked[(i + dir + unlocked.length) % unlocked.length].id;
  savePlayerProfile();
  lastRenderedOverlayState = null;
  updateOverlay();
}

function updateShipTrailParticles() {
  const trail = currentShipTrail().id;
  if (trail !== 'sparks' && trail !== 'overdrive') {
    if (shipTrailParticles.length) shipTrailParticles = [];
    return;
  }
  if (trail === 'overdrive') {
    const spawn = holding ? 4 : 2;
    for (let i = 0; i < spawn; i++) {
      const flash = Math.random() < 0.2;
      shipTrailParticles.push({
        kind: flash ? 'flash' : 'ember',
        x: ship.x - SHIP_W * 0.5 - Math.random() * 10,
        y: ship.y + (Math.random() - 0.5) * (holding ? 18 : 10),
        vx: -2.4 - Math.random() * (holding ? 3.6 : 1.8),
        vy: (Math.random() - 0.5) * 1.25,
        life: 0,
        maxLife: flash ? 6 + Math.floor(Math.random() * 5) : 16 + Math.floor(Math.random() * 14),
        r: flash ? 2.2 + Math.random() * 1.6 : 1.3 + Math.random() * 2.2,
        len: 10 + Math.random() * 16
      });
    }
  } else {
    const spawn = holding ? 2 : 1;
    for (let i = 0; i < spawn; i++) {
      shipTrailParticles.push({
        kind: 'spark',
        x: ship.x - SHIP_W * 0.45,
        y: ship.y + (Math.random() - 0.5) * 7,
        vx: -1.2 - Math.random() * (holding ? 2.4 : 1.1),
        vy: (Math.random() - 0.5) * 0.7,
        life: 0,
        maxLife: 10 + Math.floor(Math.random() * 10),
        r: 1.2 + Math.random() * 1.2
      });
    }
  }
  for (let i = shipTrailParticles.length - 1; i >= 0; i--) {
    const p = shipTrailParticles[i];
    p.x += p.vx;
    p.y += p.vy;
    p.life++;
    if (p.life >= p.maxLife) shipTrailParticles.splice(i, 1);
  }
  const cap = trail === 'overdrive' ? 120 : 80;
  if (shipTrailParticles.length > cap) shipTrailParticles.splice(0, shipTrailParticles.length - cap);
}

function updateShipToxicDrips() {
  if (currentShipSkin().id !== 'toxic') {
    if (shipToxicDrips.length) shipToxicDrips = [];
    shipToxicDripCooldown = 0;
    return;
  }
  const th = currentTheme();
  const effScroll = SCROLL_SPEED * (th.scrollMult || 1);
  shipToxicDripCooldown--;
  const interval = holding ? 48 : 84;
  if (shipToxicDripCooldown <= 0) {
    shipToxicDripCooldown = interval;
    shipToxicDrips.push({
      x: ship.x - SHIP_W * 0.28 + (Math.random() - 0.5) * 6,
      startY: ship.y + SHIP_H * 0.28,
      spawnFrame: frame,
      fallSpeed: 2.2 + Math.random() * 1.4,
      r: 5.5 + Math.random() * 2.8,
      vx: -effScroll * (0.35 + Math.random() * 0.2)
    });
  }
  for (let i = shipToxicDrips.length - 1; i >= 0; i--) {
    const d = shipToxicDrips[i];
    d.x += d.vx;
    const y = d.startY + d.fallSpeed * (frame - d.spawnFrame);
    if (y > PLAY_BOTTOM + d.r * 2 || d.x < -40) shipToxicDrips.splice(i, 1);
  }
  if (shipToxicDrips.length > 24) shipToxicDrips.splice(0, shipToxicDrips.length - 24);
}

function traceShipDart() {
  ctx.beginPath();
  ctx.moveTo(SHIP_W / 2, 0);
  ctx.lineTo(-SHIP_W / 2, -SHIP_H / 2);
  ctx.lineTo(-SHIP_W / 2 + 8, 0);
  ctx.lineTo(-SHIP_W / 2, SHIP_H / 2);
  ctx.closePath();
}

function drawShipSkinClassic(theme) {
  ctx.shadowColor = theme.accentB;
  ctx.shadowBlur = 12;
  const bodyGrad = ctx.createLinearGradient(-SHIP_W / 2, 0, SHIP_W / 2, 0);
  bodyGrad.addColorStop(0, theme.accentB);
  bodyGrad.addColorStop(1, '#ffffff');
  ctx.fillStyle = bodyGrad;
  traceShipDart();
  ctx.fill();
  ctx.strokeStyle = theme.accentA;
  ctx.lineWidth = 1.5;
  ctx.stroke();
}

function drawShipSkinSignal() {
  const r = SHIP_H * 0.85;
  ctx.save();
  ctx.shadowColor = '#ff6aa8';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fillStyle = '#ff4d8d';
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.clip();
  const grad = ctx.createLinearGradient(0, -r, 0, r);
  grad.addColorStop(0, '#ffe066');
  grad.addColorStop(0.22, '#ff9a4a');
  grad.addColorStop(0.42, '#ff5a9a');
  grad.addColorStop(0.55, '#ff2ec4');
  grad.addColorStop(0.72, '#7a7ae8');
  grad.addColorStop(1, '#3ad6d0');
  ctx.fillStyle = grad;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.fillStyle = '#1a0b3a';
  const barStart = r * 0.06;
  const barGap = r * 0.155;
  const barH = r * 0.055;
  for (let i = 0; i < 4; i++) {
    ctx.fillRect(-r, barStart + i * barGap, r * 2, barH);
  }
  const shade = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.04, 0, 0, r);
  shade.addColorStop(0, 'rgba(255,255,255,0.55)');
  shade.addColorStop(0.28, 'rgba(255,255,255,0.08)');
  shade.addColorStop(0.72, 'rgba(0,0,0,0)');
  shade.addColorStop(1, 'rgba(0,0,0,0.28)');
  ctx.fillStyle = shade;
  ctx.fillRect(-r, -r, r * 2, r * 2);
  ctx.restore();
}

function drawShipSkinEclipse() {
  const t = nowMs() * 0.004;
  const pulse = 0.55 + 0.45 * Math.sin(t);
  const glowR = SHIP_W * 0.92;
  const corona = ctx.createRadialGradient(0, 0, 2, 0, 0, glowR);
  corona.addColorStop(0, `rgba(255, 90, 36, ${0.42 * pulse})`);
  corona.addColorStop(0.4, `rgba(255, 32, 90, ${0.2 * pulse})`);
  corona.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = corona;
  ctx.beginPath();
  ctx.arc(0, 0, glowR, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + t * 0.35;
    const len = SHIP_W * (0.32 + 0.14 * Math.sin(t * 2.2 + i * 1.7));
    ctx.strokeStyle = i % 2 ? `rgba(255,80,40,${0.45 * pulse})` : `rgba(255,210,80,${0.35 * pulse})`;
    ctx.lineWidth = 1.15;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 5, Math.sin(a) * 4);
    ctx.lineTo(Math.cos(a) * (6 + len), Math.sin(a) * (5 + len * 0.7));
    ctx.stroke();
  }
  ctx.restore();
  ctx.shadowColor = '#ff4020';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#080006';
  traceShipDart();
  ctx.fill();
  ctx.strokeStyle = '#ff5a3a';
  ctx.lineWidth = 1.7;
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.fillStyle = `rgba(255, 226, 180, ${0.5 + 0.4 * pulse})`;
  ctx.beginPath();
  ctx.moveTo(5, 0);
  ctx.lineTo(0, -3.2);
  ctx.lineTo(-5, 0);
  ctx.lineTo(0, 3.2);
  ctx.closePath();
  ctx.fill();
}

function drawShipSkinGold() {
  const shine = 0.5 + 0.5 * Math.sin(nowMs() * 0.006);
  ctx.shadowColor = '#ffd23f';
  ctx.shadowBlur = 16 + shine * 10;
  const bodyGrad = ctx.createLinearGradient(-SHIP_W / 2, -SHIP_H / 2, SHIP_W / 2, SHIP_H / 2);
  bodyGrad.addColorStop(0, '#8a5a08');
  bodyGrad.addColorStop(0.28, '#c99010');
  bodyGrad.addColorStop(0.52 + shine * 0.08, '#fff4c8');
  bodyGrad.addColorStop(0.78, '#ffd23f');
  bodyGrad.addColorStop(1, '#fffdf0');
  ctx.fillStyle = bodyGrad;
  traceShipDart();
  ctx.fill();
  ctx.strokeStyle = '#ffe9a0';
  ctx.lineWidth = 1.8;
  ctx.stroke();
  ctx.save();
  traceShipDart();
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha *= 0.32 + 0.28 * shine;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.moveTo(-SHIP_W / 2 + 3, -SHIP_H / 2 + 1);
  ctx.lineTo(SHIP_W / 2 - 5, SHIP_H / 2 - 3);
  ctx.stroke();
  ctx.restore();
}

function drawShipSkinRainbow() {
  const t = nowMs();
  const hue = (t * 0.22) % 360;
  const flicker = Math.sin(t * 0.041) > 0.7 || ((Math.floor(t / 38) * 17) % 11) === 0;
  const h = flicker ? (hue + 130 + (t % 90)) % 360 : hue;
  const sat = flicker ? 100 : 92;
  const lit = flicker ? 70 : 56;
  ctx.shadowColor = `hsl(${h}, 100%, 58%)`;
  ctx.shadowBlur = flicker ? 22 : 14;
  const bodyGrad = ctx.createLinearGradient(-SHIP_W / 2, 0, SHIP_W / 2, 0);
  bodyGrad.addColorStop(0, `hsl(${(h + 50) % 360}, ${sat}%, ${lit - 6}%)`);
  bodyGrad.addColorStop(0.5, `hsl(${h}, 100%, ${lit + 12}%)`);
  bodyGrad.addColorStop(1, flicker ? '#ffffff' : `hsl(${(h + 90) % 360}, ${sat}%, 78%)`);
  ctx.fillStyle = bodyGrad;
  traceShipDart();
  ctx.fill();
  ctx.strokeStyle = `hsl(${(h + 180) % 360}, 90%, 68%)`;
  ctx.lineWidth = flicker ? 2.1 : 1.5;
  ctx.stroke();
}

function drawShipSkinCore() {
  const t = frame;
  ctx.strokeStyle = '#5ec8e8';
  ctx.lineWidth = 1.2;
  ctx.shadowColor = '#5ec8e8';
  ctx.shadowBlur = 6;
  const tendrilCount = 6;
  const sharedRotation = t * 0.03;
  const sparkR = Math.max(SHIP_H * 0.95, SHIP_W * 0.38);
  for (let i = 0; i < tendrilCount; i++) {
    const seed = i * 5.3;
    const baseAngle = (i / tendrilCount) * Math.PI * 2 + sharedRotation;
    const jitterAngle = baseAngle + Math.sin(t * 0.8 + seed) * 0.15;
    const len = sparkR * (1.2 + 0.4 * Math.abs(Math.sin(t * 0.5 + seed)));
    const midLen = len * 0.5;
    const midAngle = baseAngle + Math.sin(t * 0.9 + seed) * 0.12;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(midAngle) * midLen, Math.sin(midAngle) * midLen);
    ctx.lineTo(Math.cos(jitterAngle) * len, Math.sin(jitterAngle) * len);
    ctx.stroke();
  }
  ctx.shadowBlur = 14;
  const bodyGrad = ctx.createRadialGradient(2, 0, 0, 0, 0, SHIP_W * 0.55);
  bodyGrad.addColorStop(0, '#ffffff');
  bodyGrad.addColorStop(0.45, '#5ec8e8');
  bodyGrad.addColorStop(1, 'rgba(94,200,232,0.18)');
  ctx.fillStyle = bodyGrad;
  traceShipDart();
  ctx.fill();
  ctx.save();
  traceShipDart();
  ctx.clip();
  ctx.globalCompositeOperation = 'lighter';
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(220,245,255,0.8)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const yOff = (i - 1) * 4.2;
    ctx.beginPath();
    ctx.moveTo(-SHIP_W / 2 + 3, yOff);
    ctx.lineTo(-2 + Math.sin(t * 0.7 + i) * 3.2, yOff + Math.sin(t * 1.1 + i * 2) * 2);
    ctx.lineTo(SHIP_W / 2 - 5, yOff * 0.25);
    ctx.stroke();
  }
  ctx.restore();
}

function drawShipSkinMolten() {
  drawMoltenCoreBody(0, 0, SHIP_H * 0.78);
}

function drawShipSkinNeon() {
  ctx.save();
  ctx.shadowColor = '#ff2ec4';
  ctx.shadowBlur = 12;
  ctx.fillStyle = '#1a1428';
  traceShipDart();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.save();
  traceShipDart();
  ctx.clip();
  const scrollOffset = (frame * 1.5) % 10;
  for (let row = 0; row < 6; row++) {
    const y = -SHIP_H + row * 8 + 4 - scrollOffset;
    ctx.fillStyle = row % 2 === 0 ? 'rgba(46,232,255,0.35)' : 'rgba(255,46,196,0.32)';
    ctx.fillRect(-SHIP_W, y, SHIP_W * 2, 3.5);
  }
  ctx.restore();
  ctx.strokeStyle = '#ff2ec4';
  ctx.shadowColor = '#ff2ec4';
  ctx.shadowBlur = 8;
  ctx.lineWidth = 2.2;
  traceShipDart();
  ctx.stroke();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff';
  ctx.globalAlpha = 0.85;
  ctx.lineWidth = 0.9;
  traceShipDart();
  ctx.stroke();
  ctx.globalAlpha = 1;
  const blink = Math.sin(frame * 0.2) > 0.3;
  ctx.shadowColor = '#ff2ec4';
  ctx.shadowBlur = blink ? 10 : 3;
  ctx.fillStyle = blink ? '#ff2ec4' : '#802060';
  ctx.beginPath();
  ctx.arc(3, 0, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawShipSkinStorm() {
  const accentA = '#fff59d';
  const accentB = '#5c6bc0';
  const lit = holding;
  ctx.save();
  ctx.shadowColor = accentB;
  ctx.shadowBlur = 12;
  const bodyGrad = ctx.createLinearGradient(-SHIP_W / 2, 0, SHIP_W / 2, 0);
  bodyGrad.addColorStop(0, accentB);
  bodyGrad.addColorStop(1, '#dce3ff');
  ctx.fillStyle = bodyGrad;
  traceShipDart();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = accentA;
  ctx.lineWidth = 1.5;
  traceShipDart();
  ctx.stroke();
  const boltOn = lit || ((frame % 22) < 4);
  if (boltOn) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const flash = lit ? 1 : 0.75;
    const drawBolt = (pts, width, color, blur, alpha) => {
      ctx.globalAlpha = flash * alpha;
      ctx.strokeStyle = color;
      ctx.shadowColor = accentA;
      ctx.shadowBlur = blur;
      ctx.lineWidth = width;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      pts.forEach(([x, y], i) => { if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
      ctx.stroke();
    };
    const main = [[-SHIP_W / 2 + 4, -2], [-6, 3], [2, -3], [SHIP_W / 2 - 5, 1]];
    const branch = [[-6, 3], [-2, 7], [4, 5]];
    drawBolt(main, 3.2, accentB, 8, 0.45);
    drawBolt(main, 1.5, accentA, 12, 1);
    drawBolt(branch, 2.2, accentB, 6, 0.35);
    drawBolt(branch, 1.1, accentA, 8, 0.9);
    ctx.restore();
  }
  ctx.restore();
}

function drawShipSkinToxic() {
  ctx.save();
  ctx.shadowColor = '#8aff4d';
  ctx.shadowBlur = 12;
  const bodyGrad = ctx.createRadialGradient(2, -2, 1, 0, 0, SHIP_W * 0.55);
  bodyGrad.addColorStop(0, '#e8ffb0');
  bodyGrad.addColorStop(0.45, '#8aff4d');
  bodyGrad.addColorStop(1, '#d4c84a');
  ctx.fillStyle = bodyGrad;
  traceShipDart();
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.save();
  traceShipDart();
  ctx.clip();
  ctx.fillStyle = 'rgba(212,200,74,0.55)';
  for (let i = 0; i < 3; i++) {
    const a = frame * 0.04 + i * 2.1;
    ctx.beginPath();
    ctx.arc(Math.cos(a) * 7, Math.sin(a) * 3.5, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
  ctx.strokeStyle = '#8aff4d';
  ctx.globalAlpha = 0.75;
  ctx.lineWidth = 1.4;
  traceShipDart();
  ctx.stroke();
  ctx.restore();
}

function drawShipSkinVoid() {
  const r = SHIP_H * 0.8;
  ctx.save();
  const field = ctx.createRadialGradient(0, 0, r * 0.5, 0, 0, r * 2.1);
  field.addColorStop(0, 'rgba(138,92,245,0.28)');
  field.addColorStop(1, 'rgba(138,92,245,0)');
  ctx.fillStyle = field;
  ctx.beginPath();
  ctx.arc(0, 0, r * 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.save();
  ctx.rotate(frame * 0.02);
  for (let i = 0; i < 3; i++) {
    const bandR = r * (1.15 + i * 0.28);
    ctx.strokeStyle = '#c9a0ff';
    ctx.globalAlpha = 0.48 - i * 0.1;
    ctx.lineWidth = 2.2 - i * 0.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, bandR, bandR * 0.38, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
  ctx.shadowColor = '#8a5cf5';
  ctx.shadowBlur = 14;
  const core = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
  core.addColorStop(0, '#000000');
  core.addColorStop(0.82, '#050208');
  core.addColorStop(1, '#8a5cf5');
  ctx.fillStyle = core;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#8a5cf5';
  ctx.globalAlpha = 0.7;
  ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.arc(0, 0, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawShipSkinSRankOutline(alpha) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.shadowColor = '#fff8e0';
  ctx.shadowBlur = 16;
  ctx.strokeStyle = '#ffe08a';
  ctx.lineWidth = 1.8;
  traceShipDart();
  ctx.stroke();
  ctx.shadowBlur = 0;
  const fill = ctx.createLinearGradient(-SHIP_W / 2, 0, SHIP_W / 2, 0);
  fill.addColorStop(0, 'rgba(255,248,224,0.15)');
  fill.addColorStop(0.5, 'rgba(255,255,255,0.55)');
  fill.addColorStop(1, 'rgba(255,224,138,0.35)');
  ctx.fillStyle = fill;
  traceShipDart();
  ctx.fill();
  ctx.restore();
}

function drawShipSkinSRank() {
  const flare = holding ? 1 : 0.55 + 0.2 * Math.sin(nowMs() * 0.006);
  ctx.save();
  ctx.globalAlpha *= 0.35 + flare * 0.65;
  drawShipSkinSRankOutline(1);
  ctx.restore();
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.strokeStyle = `rgba(255,255,255,${0.45 + flare * 0.4})`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-SHIP_W / 2 + 6, 0);
  ctx.lineTo(SHIP_W / 2 - 4, 0);
  ctx.stroke();
  for (let i = 0; i < 3; i++) {
    const a = nowMs() * 0.003 + i * (Math.PI * 2 / 3);
    const ox = Math.cos(a) * (SHIP_W * 0.42);
    const oy = Math.sin(a) * (SHIP_H * 0.7);
    ctx.fillStyle = '#fff8e0';
    ctx.shadowColor = '#ffd23f';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(ox, oy - 3.2);
    ctx.lineTo(ox + 2.1, oy);
    ctx.lineTo(ox, oy + 3.2);
    ctx.lineTo(ox - 2.1, oy);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawShipBody(theme, alpha) {
  ctx.save();
  ctx.globalAlpha *= alpha;
  const skin = currentShipSkin().id;
  if (skin === 'signal') drawShipSkinSignal();
  else if (skin === 'eclipse') drawShipSkinEclipse();
  else if (skin === 'gold') drawShipSkinGold();
  else if (skin === 'prism') drawShipSkinRainbow();
  else if (skin === 'molten') drawShipSkinMolten();
  else if (skin === 'core') drawShipSkinCore();
  else if (skin === 'neon') drawShipSkinNeon();
  else if (skin === 'storm') drawShipSkinStorm();
  else if (skin === 'toxic') drawShipSkinToxic();
  else if (skin === 'void') drawShipSkinVoid();
  else if (skin === 'srank') drawShipSkinSRank();
  else drawShipSkinClassic(theme);
  ctx.restore();
}

function drawClassicFlame(theme, extraLen, colorA, colorB) {
  const flameLen = 14 + extraLen + (holding ? 10 : 4) + Math.sin(frame * 0.5) * 3;
  const trailGrad = ctx.createLinearGradient(-SHIP_W / 2 - flameLen, 0, -SHIP_W / 2, 0);
  trailGrad.addColorStop(0, 'rgba(255,255,255,0)');
  trailGrad.addColorStop(1, holding ? colorB : colorA);
  ctx.fillStyle = trailGrad;
  ctx.beginPath();
  ctx.moveTo(-SHIP_W / 2, -6);
  ctx.lineTo(-SHIP_W / 2 - flameLen, 0);
  ctx.lineTo(-SHIP_W / 2, 6);
  ctx.closePath();
  ctx.fill();
}

function drawShipTrailWorld(theme) {
  const id = currentShipTrail().id;
  if (id === 'ribbon' && shipYHistory.length > 4) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.shadowColor = theme.accentB;
    ctx.shadowBlur = 10;
    const n = Math.min(48, shipYHistory.length);
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      const px = ship.x - i * 3.4;
      const py = shipYHistory[shipYHistory.length - 1 - i];
      const wobble = Math.sin(frame * 0.18 + i * 0.35) * (holding ? 2.2 : 1.1);
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py + wobble);
    }
    ctx.strokeStyle = theme.accentB;
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = holding ? 5 : 3.2;
    ctx.stroke();
    ctx.strokeStyle = theme.accentA;
    ctx.globalAlpha = 0.35;
    ctx.lineWidth = holding ? 2.2 : 1.4;
    ctx.stroke();
    ctx.restore();
  }
  if (id === 'echo' && currentShipSkin().id !== 'molten' && shipYHistory.length > 6) {
    const steps = [6, 12, 18, 24];
    ctx.save();
    for (let s = steps.length - 1; s >= 0; s--) {
      const i = steps[s];
      if (i >= shipYHistory.length) continue;
      const px = ship.x - i * 2.6;
      const py = shipYHistory[shipYHistory.length - 1 - i];
      ctx.save();
      ctx.translate(px, py);
      ctx.rotate(ship.rotation * Math.PI / 180);
      ctx.globalAlpha = 0.12 + (1 - s / steps.length) * 0.16;
      drawShipBody(theme, 1);
      ctx.restore();
    }
    ctx.restore();
  }
  if (currentShipSkin().id === 'molten' && shipYHistory.length > 6) {
    const r = SHIP_H * 0.78;
    const intensity = holding ? 1 : 0.72;
    const steps = [5, 10, 16, 22];
    for (let s = steps.length - 1; s >= 0; s--) {
      const i = steps[s];
      if (i >= shipYHistory.length) continue;
      const t = (s + 1) / steps.length;
      const px = ship.x - i * (2.8 + intensity * 1.4);
      const py = shipYHistory[shipYHistory.length - 1 - i] + Math.sin(frame * 0.4 + s) * 1.4 * intensity;
      drawMoltenCoreBody(px, py, r * (1 + 0.05 * (4 - s)), {
        stretchX: 1.2 + t * 0.45 * intensity,
        stretchY: 0.8 - t * 0.06 * intensity,
        alpha: (0.5 - t * 0.16) * intensity,
        sparks: false
      });
    }
  }
  if (shipToxicDrips.length) {
    for (const d of shipToxicDrips) {
      const y = d.startY + d.fallSpeed * Math.max(0, frame - d.spawnFrame);
      drawAcidDripVisual(d.x, y, d.r, '#8aff4d', '#d4c84a');
    }
  }
  if (id === 'sparks') {
    ctx.save();
    for (const p of shipTrailParticles) {
      const t = 1 - p.life / p.maxLife;
      ctx.globalAlpha = 0.25 + t * 0.7;
      ctx.fillStyle = t > 0.5 ? '#ffffff' : theme.accentB;
      ctx.beginPath();
      ctx.arc(p.x, p.y, Math.max(0.4, p.r * t), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  if (id === 'overdrive') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const age = (frame * 2.15 + i * 12) % 38;
      const px = ship.x - 16 - age * 2.5;
      const py = ship.y + Math.sin(frame * 0.12 + i) * 1.4;
      const s = 6 + age * 0.38;
      ctx.globalAlpha = Math.max(0, 0.62 - age / 38);
      ctx.strokeStyle = i % 2 === 0 ? '#ffe28a' : '#ff3a18';
      ctx.lineWidth = 1.7;
      ctx.beginPath();
      ctx.moveTo(px + s, py);
      ctx.lineTo(px, py - s * 0.42);
      ctx.lineTo(px - s * 0.75, py);
      ctx.lineTo(px, py + s * 0.42);
      ctx.closePath();
      ctx.stroke();
    }
    for (const p of shipTrailParticles) {
      const t = 1 - p.life / p.maxLife;
      ctx.globalAlpha = 0.22 + t * 0.8;
      if (p.kind === 'flash') {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, Math.max(0.5, p.r * t), 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.strokeStyle = t > 0.62 ? '#fff6c8' : (t > 0.32 ? '#ffb020' : '#ff2848');
        ctx.lineWidth = Math.max(0.7, p.r * t);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(p.x + p.len * t, p.y - p.vy * 3);
        ctx.stroke();
      }
    }
    ctx.restore();
  }
  if (id === 'glitch') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const n = Math.min(18, shipYHistory.length);
    for (let i = 2; i < n; i += 2) {
      const drop = ((frame * 13 + i * 17) % 7) === 0;
      if (drop) continue;
      const px = ship.x - i * 4.2 + (((frame + i * 9) % 11) - 5);
      const py = shipYHistory[shipYHistory.length - 1 - i] + (((frame * 3 + i * 5) % 9) - 4);
      const w = 6 + ((frame + i) % 8);
      const h = 2 + ((i + frame) % 3);
      ctx.globalAlpha = 0.22 + (1 - i / n) * 0.45;
      ctx.fillStyle = (i + frame) % 2 === 0 ? theme.accentB : theme.accentA;
      ctx.fillRect(px - w, py - h / 2, w, h);
    }
    ctx.restore();
  }
  if (id === 'helix' && shipYHistory.length > 4) {
    ctx.save();
    ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    const n = Math.min(42, shipYHistory.length);
    const amp = holding ? 11 : 7.5;
    for (let strand = 0; strand < 2; strand++) {
      ctx.beginPath();
      for (let i = 0; i < n; i++) {
        const px = ship.x - i * 3.1;
        const py = shipYHistory[shipYHistory.length - 1 - i]
          + Math.sin(frame * 0.22 + i * 0.42 + strand * Math.PI) * amp;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.strokeStyle = strand === 0 ? theme.accentB : theme.accentA;
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = holding ? 2.6 : 1.8;
      ctx.stroke();
    }
    ctx.restore();
  }
  if (id === 'rings') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = theme.accentB;
    for (let i = 0; i < 4; i++) {
      const age = (frame * 1.8 + i * 14) % 42;
      const px = ship.x - 10 - age * 1.8;
      const py = ship.y;
      ctx.globalAlpha = Math.max(0, 0.7 - age / 42);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(px, py, 8 + age * 0.55, 5 + age * 0.32, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawShipTrailLocal(theme) {
  const skin = currentShipSkin().id;
  if (skin === 'molten' || skin === 'void' || skin === 'toxic' || skin === 'signal') return;
  const id = currentShipTrail().id;
  if (id === 'classic' || id === 'echo' || id === 'ribbon') {
    drawClassicFlame(theme, 0, theme.accentA, theme.accentB);
    return;
  }
  if (id === 'pulse') {
    for (let i = 0; i < 3; i++) {
      const pulse = 0.55 + 0.45 * Math.abs(Math.sin(frame * 0.28 + i * 0.9));
      const len = (10 + i * 7 + (holding ? 8 : 0)) * pulse;
      ctx.globalAlpha = 0.35 + pulse * 0.4;
      ctx.strokeStyle = i % 2 === 0 ? theme.accentB : theme.accentA;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-SHIP_W / 2 - 2, -5 + i);
      ctx.lineTo(-SHIP_W / 2 - len, 0);
      ctx.lineTo(-SHIP_W / 2 - 2, 5 - i);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    return;
  }
  if (id === 'sparks') {
    drawClassicFlame(theme, -4, theme.accentB, '#ffffff');
    return;
  }
  if (id === 'glitch') {
    const baseLen = 16 + (holding ? 14 : 5);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 5; i++) {
      const stutter = ((frame * 3 + i * 11) % 5) === 0;
      if (stutter) continue;
      const y = -8 + i * 4;
      const len = baseLen + ((frame * 2 + i * 7) % 16) - (i * 2);
      const xOff = ((frame + i * 13) % 9) - 4;
      ctx.globalAlpha = 0.55 + (i % 2) * 0.25;
      ctx.fillStyle = i % 2 === 0 ? theme.accentB : theme.accentA;
      ctx.fillRect(-SHIP_W / 2 - len + xOff, y, len, 2.2);
    }
    if ((frame % 6) < 2) {
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-SHIP_W / 2 - baseLen - 10, -2, 18, 3);
    }
    ctx.restore();
    return;
  }
  if (id === 'overdrive') {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const boost = holding ? 1 : 0.64;
    const flicker = 0.86 + 0.14 * Math.sin(frame * 0.85);
    const plume = (28 + (holding ? 24 : 9) + Math.sin(frame * 0.42) * 6) * boost;

    const outer = ctx.createLinearGradient(-SHIP_W / 2 - plume, 0, -SHIP_W / 2, 0);
    outer.addColorStop(0, 'rgba(255, 16, 40, 0)');
    outer.addColorStop(0.4, 'rgba(255, 48, 18, 0.5)');
    outer.addColorStop(1, 'rgba(255, 220, 110, 0.95)');
    ctx.fillStyle = outer;
    ctx.beginPath();
    ctx.moveTo(-SHIP_W / 2 + 2, -10);
    ctx.quadraticCurveTo(-SHIP_W / 2 - plume * 0.42, -18 * boost * flicker, -SHIP_W / 2 - plume, 0);
    ctx.quadraticCurveTo(-SHIP_W / 2 - plume * 0.42, 18 * boost * flicker, -SHIP_W / 2 + 2, 10);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.9 * flicker;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.moveTo(-SHIP_W / 2, -3.2);
    ctx.lineTo(-SHIP_W / 2 - plume * 0.72, 0);
    ctx.lineTo(-SHIP_W / 2, 3.2);
    ctx.closePath();
    ctx.fill();

    const curl = 11 + Math.sin(frame * 0.2) * 7;
    ctx.globalAlpha = 0.5 + 0.35 * Math.abs(Math.sin(frame * 0.31));
    ctx.strokeStyle = '#ffd23f';
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-SHIP_W / 2 - 3, -6);
    ctx.quadraticCurveTo(-SHIP_W / 2 - plume * 0.38, -curl - 10, -SHIP_W / 2 - plume * 0.78, -5);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-SHIP_W / 2 - 3, 6);
    ctx.quadraticCurveTo(-SHIP_W / 2 - plume * 0.38, curl + 10, -SHIP_W / 2 - plume * 0.78, 5);
    ctx.stroke();
    ctx.restore();
    return;
  }
  if (id === 'twin') {
    ctx.save();
    ctx.translate(0, -8);
    drawClassicFlame(theme, -2, theme.accentB, '#ffffff');
    ctx.restore();
    ctx.save();
    ctx.translate(0, 8);
    drawClassicFlame(theme, -2, theme.accentA, '#ffffff');
    ctx.restore();
    return;
  }
  if (id === 'helix') {
    drawClassicFlame(theme, -8, theme.accentB, theme.accentA);
    return;
  }
  if (id === 'rings') {
    drawClassicFlame(theme, -10, theme.accentB, '#ffffff');
    ctx.save();
    ctx.strokeStyle = theme.accentA;
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 3; i++) {
      const age = (frame * 2.4 + i * 11) % 28;
      ctx.globalAlpha = Math.max(0, 0.8 - age / 28);
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.ellipse(-SHIP_W / 2 - age * 0.4, 0, 5 + age * 0.7, 4 + age * 0.35, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }
}

function drawShip(theme) {
  const vanish = getShipVanishProgress();
  if (vanish >= 0.995) return; // fully consumed by the portal

  // classic NES-style blinking sprite while invincible -- hard on/off
  // toggle rather than a smooth fade, matching the authentic retro look
  // real hardware produced (no alpha blending, just skipping the draw
  // entirely every other interval). Tied to real time so the blink rate
  // itself stays consistent regardless of frame rate.
  const isInvincible = ghostMode || nowMs() < invincibilityEndTime;
  if (isInvincible && Math.floor(nowMs() / INVINCIBILITY_BLINK_INTERVAL_MS) % 2 === 0) return;

  drawShipTrailWorld(theme);

  ctx.save();
  ctx.translate(ship.x, ship.y);
  ctx.rotate(ship.rotation * Math.PI / 180 + vanish * 8);
  const shrink = 1 - vanish * 0.85;
  ctx.scale(shrink, shrink);
  ctx.globalAlpha = 1 - vanish;

  // dim warning glow during the "death window" -- the protection window
  // has worn off but the next free pass isn't available yet, so a hazard
  // here costs a real life. A slow, calm pulse signals "not safe anymore"
  // without the urgency of the blink, since there's no immediate threat,
  // just a used-up grace period.
  const nowForGlow = nowMs();
  if (!isInvincible && nowForGlow < freeHitCooldownEndTime) {
    const pulse = 0.4 + 0.3 * Math.sin(nowForGlow * 0.004);
    const glowR = SHIP_W * 1.1;
    const warnGrad = ctx.createRadialGradient(0, 0, SHIP_W * 0.2, 0, 0, glowR);
    warnGrad.addColorStop(0, `rgba(255,170,0,${pulse})`);
    warnGrad.addColorStop(1, 'rgba(255,170,0,0)');
    ctx.fillStyle = warnGrad;
    ctx.beginPath();
    ctx.arc(0, 0, glowR, 0, Math.PI * 2);
    ctx.fill();
  }

  drawShipTrailLocal(theme);

  if (currentShipTrail().id === 'glitch') {
    const jx = 5 + Math.sin(frame * 1.1) * 3.5;
    const jy = Math.cos(frame * 0.9) * 2.2;
    const drawGhost = (dx, dy, color, alpha) => {
      ctx.save();
      ctx.translate(dx, dy);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= alpha;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(SHIP_W / 2, 0);
      ctx.lineTo(-SHIP_W / 2, -SHIP_H / 2);
      ctx.lineTo(-SHIP_W / 2 + 8, 0);
      ctx.lineTo(-SHIP_W / 2, SHIP_H / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    };
    drawGhost(jx, jy * 0.4, theme.accentB, 0.85);
    drawGhost(-jx, -jy * 0.4, theme.accentA, 0.8);
    // horizontal scan tears -- bands of the hull jump left/right
    const bandH = SHIP_H / 4;
    for (let b = 0; b < 4; b++) {
      const tear = (((frame * 2 + b * 19) % 8) - 4) * 2.4;
      ctx.save();
      ctx.beginPath();
      ctx.rect(-SHIP_W, -SHIP_H / 2 + b * bandH, SHIP_W * 2, bandH);
      ctx.clip();
      ctx.translate(tear, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha *= 0.55;
      ctx.fillStyle = b % 2 === 0 ? theme.accentB : theme.accentA;
      ctx.beginPath();
      ctx.moveTo(SHIP_W / 2, 0);
      ctx.lineTo(-SHIP_W / 2, -SHIP_H / 2);
      ctx.lineTo(-SHIP_W / 2 + 8, 0);
      ctx.lineTo(-SHIP_W / 2, SHIP_H / 2);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  drawShipBody(theme, 1);

  ctx.restore();
}

function drawToxicBarOoze(theme) {
  ctx.save();

  // top bar: flat toxic pool layer along the inner edge
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = theme.accentA;
  ctx.fillRect(0, BAR_HEIGHT - 18, W, 18);

  // bottom bar: mirrored flat pool layer
  ctx.fillRect(0, H - BAR_HEIGHT, W, 18);

  // rising bubbles, staggered and looping, deterministic per index
  ctx.fillStyle = theme.accentB;
  const bubbleCount = 6;
  const riseSpan = 22;
  for (let i = 0; i < bubbleCount; i++) {
    const cycle = 90 + (i % 3) * 15;
    const t = (frame + i * 37) % cycle;
    const progress = t / cycle;
    const bx = ((i + 0.5) / bubbleCount) * W;
    const bubbleR = 2 + (i % 3);
    ctx.globalAlpha = 0.6 * (1 - progress);

    // top bar bubbles drift downward, dripping out of the ceiling layer
    // into the play area (mirrors the bottom bar's upward flow)
    const topBy = (BAR_HEIGHT - 4) + progress * riseSpan;
    ctx.beginPath();
    ctx.arc(bx, topBy, bubbleR, 0, Math.PI * 2);
    ctx.fill();

    // bottom bar bubbles drift upward too (rising out of the floor layer)
    const botBy = (H - BAR_HEIGHT + 4) - progress * riseSpan;
    ctx.beginPath();
    ctx.arc(bx, botBy, bubbleR, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

function drawBars(theme) {
  const barGrad = ctx.createLinearGradient(0, 0, 0, BAR_HEIGHT);
  barGrad.addColorStop(0, theme.barTop);
  barGrad.addColorStop(1, theme.barBottom);

  ctx.fillStyle = barGrad;
  ctx.fillRect(0, 0, W, BAR_HEIGHT);
  ctx.fillRect(0, H - BAR_HEIGHT, W, BAR_HEIGHT);

  if (theme.bgStyle === 'toxic') {
    drawToxicBarOoze(theme);
  }

  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, BAR_HEIGHT);
  ctx.lineTo(W, BAR_HEIGHT);
  ctx.moveTo(0, H - BAR_HEIGHT);
  ctx.lineTo(W, H - BAR_HEIGHT);
  ctx.stroke();

  ctx.fillStyle = theme.accentB;
  ctx.font = 'bold 20px Courier New';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = theme.accentB;
  ctx.shadowBlur = 8;
  ctx.fillText('SYNTH FLIGHT', 14, BAR_HEIGHT / 2 + 2);
  ctx.shadowBlur = 0;
  ctx.font = '9px Courier New';
  ctx.fillStyle = 'rgba(255,255,255,0.3)';
  ctx.fillText('build 2026-08-28-vortex-overlap-check', 14, BAR_HEIGHT + 10);
  ctx.textAlign = 'right';
  ctx.font = 'bold 13px Courier New';
  ctx.fillStyle = theme.accentA;
  ctx.fillText(theme.name, W - 14, BAR_HEIGHT / 2 + 2);

  // lives indicator -- small triangles left of the theme name
  const liveSize = 7;
  let lx = W - 14 - ctx.measureText(theme.name).width - 16;
  for (let i = 0; i < MAX_LIVES; i++) {
    ctx.save();
    ctx.translate(lx, BAR_HEIGHT / 2);
    ctx.fillStyle = i < lives ? theme.accentB : 'rgba(255,255,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(liveSize, 0);
    ctx.lineTo(-liveSize * 0.7, -liveSize * 0.7);
    ctx.lineTo(-liveSize * 0.7, liveSize * 0.7);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    lx -= liveSize * 2.2;
  }

  ctx.font = 'bold 15px Courier New';
  ctx.fillStyle = theme.accentA;
  ctx.textAlign = 'left';
  ctx.fillText('DISTANCE: ' + Math.floor(distance - zoneStartDistance) + ' / ' + THEME_DISTANCE, 14, H - BAR_HEIGHT / 2 + 1);
  ctx.textAlign = 'right';
  ctx.fillText('BEST: ' + best, W - 14, H - BAR_HEIGHT / 2 + 1);
}

function drawWarpEffect() {
  const progress = 1 - (warpTimer / WARP_DURATION); // 0 -> 1
  const oldTheme = currentTheme();
  const newTheme = THEMES[nextThemeIndex];

  const cx = W / 2;
  const cy = (PLAY_TOP + PLAY_BOTTOM) / 2;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const streakCount = 46;
  const maxLen = Math.max(W, H);
  for (let i = 0; i < streakCount; i++) {
    const angle = (i / streakCount) * Math.PI * 2 + progress * 2;
    const len = maxLen * Math.min(1, progress * 1.6) * (0.5 + 0.5 * Math.sin(i * 12.9898));
    const x2 = cx + Math.cos(angle) * len;
    const y2 = cy + Math.sin(angle) * len * 0.6;
    ctx.strokeStyle = lerpColor(oldTheme.accentB, newTheme.accentA, progress);
    ctx.globalAlpha = 0.5 * (1 - Math.abs(progress - 0.5) * 1.4);
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  }
  ctx.restore();

  // flash at midpoint
  const flashStrength = Math.max(0, 1 - Math.abs(progress - 0.5) * 4);
  if (flashStrength > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flashStrength * 0.5})`;
    ctx.fillRect(0, PLAY_TOP, W, PLAY_BOTTOM - PLAY_TOP);
  }

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 28px Courier New';
  ctx.fillStyle = newTheme.accentB;
  ctx.shadowColor = newTheme.accentB;
  ctx.shadowBlur = 16;
  ctx.globalAlpha = Math.min(1, progress * 2, (1 - progress) * 3 + 0.3);
  ctx.fillText((themeIndex === nextThemeIndex ? 'LAUNCHING ' : 'ENTERING ') + newTheme.name, cx, cy);
  ctx.restore();
}

function drawTerrain(theme) {
  if (terrainSegments.length < 2) return;

  ctx.save();
  ctx.shadowColor = theme.accentB;
  ctx.shadowBlur = 12;

  // top land mass
  const topGrad = ctx.createLinearGradient(0, PLAY_TOP, 0, PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) * 0.55);
  topGrad.addColorStop(0, theme.accentA);
  topGrad.addColorStop(1, theme.accentB);
  ctx.fillStyle = topGrad;
  ctx.beginPath();
  ctx.moveTo(terrainSegments[0].x, PLAY_TOP - 4);
  for (const s of terrainSegments) {
    ctx.lineTo(s.x, s.topY);
  }
  ctx.lineTo(terrainSegments[terrainSegments.length - 1].x, PLAY_TOP - 4);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = theme.accentB;
  ctx.lineWidth = 2;
  ctx.beginPath();
  terrainSegments.forEach((s, i) => {
    if (i === 0) ctx.moveTo(s.x, s.topY); else ctx.lineTo(s.x, s.topY);
  });
  ctx.stroke();

  // bottom land mass
  const botGrad = ctx.createLinearGradient(0, PLAY_BOTTOM - (PLAY_BOTTOM - PLAY_TOP) * 0.55, 0, PLAY_BOTTOM);
  botGrad.addColorStop(0, theme.accentB);
  botGrad.addColorStop(1, theme.accentA);
  ctx.fillStyle = botGrad;
  ctx.beginPath();
  ctx.moveTo(terrainSegments[0].x, PLAY_BOTTOM + 4);
  for (const s of terrainSegments) {
    ctx.lineTo(s.x, s.bottomY);
  }
  ctx.lineTo(terrainSegments[terrainSegments.length - 1].x, PLAY_BOTTOM + 4);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  terrainSegments.forEach((s, i) => {
    if (i === 0) ctx.moveTo(s.x, s.bottomY); else ctx.lineTo(s.x, s.bottomY);
  });
  ctx.stroke();

  // fork island: a solid mass splitting the passage -- draw only the contiguous
  // runs of segments that actually have thickness, so the outline never traces
  // through the zero-height collapsed points before/after a fork
  const ISLAND_EPS = 1.5;
  let run = [];
  const flushRun = () => {
    if (run.length < 2) { run = []; return; }
    const islGrad = ctx.createLinearGradient(0, PLAY_TOP, 0, PLAY_BOTTOM);
    islGrad.addColorStop(0, theme.accentB);
    islGrad.addColorStop(0.5, theme.accentA);
    islGrad.addColorStop(1, theme.accentB);
    ctx.fillStyle = islGrad;
    ctx.beginPath();
    run.forEach((s, i) => {
      if (i === 0) ctx.moveTo(s.x, s.islandTop); else ctx.lineTo(s.x, s.islandTop);
    });
    for (let i = run.length - 1; i >= 0; i--) {
      ctx.lineTo(run[i].x, run[i].islandBottom);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = theme.accentA;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    run = [];
  };
  for (const s of terrainSegments) {
    if (s.islandBottom - s.islandTop > ISLAND_EPS) {
      run.push(s);
    } else {
      flushRun();
    }
  }
  flushRun();

  ctx.restore();
}

function drawPortalRing() {
  if (!portalObject) return;
  const theme = currentTheme();
  const nextTheme = THEMES[(themeIndex + 1) % THEMES.length];
  const cx = portalObject.x;
  const halfWidth = 34 + Math.sin(frame * 0.05) * 4;

  ctx.save();

  // swirling interior fill, spanning the full play height, blended toward
  // the next zone's colors
  const grad = ctx.createLinearGradient(cx - halfWidth, 0, cx + halfWidth, 0);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.3, nextTheme.accentB);
  grad.addColorStop(0.5, theme.accentA);
  grad.addColorStop(0.7, nextTheme.accentB);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.globalAlpha = 0.55;
  ctx.fillStyle = grad;
  ctx.fillRect(cx - halfWidth, PLAY_TOP, halfWidth * 2, PLAY_BOTTOM - PLAY_TOP);

  // horizontal swirl bands drifting up/down for a portal-energy feel
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = nextTheme.accentA;
  ctx.lineWidth = 2;
  const bandSpacing = 26;
  const bandOffset = (frame * 1.6) % bandSpacing;
  for (let y = PLAY_TOP - bandSpacing + bandOffset; y < PLAY_BOTTOM + bandSpacing; y += bandSpacing) {
    const wobble = Math.sin(frame * 0.08 + y * 0.05) * halfWidth * 0.5;
    ctx.beginPath();
    ctx.moveTo(cx - halfWidth * 0.8 + wobble, y);
    ctx.quadraticCurveTo(cx, y - 6, cx + halfWidth * 0.8 + wobble, y);
    ctx.stroke();
  }

  // glowing left/right edges spanning the full window, top to bottom --
  // deliberately NOT theme.accentB here, since that's the same color the
  // standard gate obstacle uses for its own glow/gradient, which made the
  // portal's own edge look identical to a real obstacle overlapping it
  ctx.globalAlpha = 0.95;
  ctx.shadowColor = '#ffffff';
  ctx.shadowBlur = 22;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(cx - halfWidth, PLAY_TOP);
  ctx.lineTo(cx - halfWidth, PLAY_BOTTOM);
  ctx.moveTo(cx + halfWidth, PLAY_TOP);
  ctx.lineTo(cx + halfWidth, PLAY_BOTTOM);
  ctx.stroke();

  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.globalAlpha = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx - halfWidth, PLAY_TOP);
  ctx.lineTo(cx - halfWidth, PLAY_BOTTOM);
  ctx.moveTo(cx + halfWidth, PLAY_TOP);
  ctx.lineTo(cx + halfWidth, PLAY_BOTTOM);
  ctx.stroke();

  ctx.restore();
}

function getBossShakeOffset() {
  if (!boss || !currentTheme().isBossZone) return { x: 0, y: 0 };
  if (bossFullyDefeated) return { x: 0, y: 0 };

  const entranceElapsed = frame - bossSpawnFrame;
  const entranceProgress = Math.min(1, entranceElapsed / BOSS_ENTRANCE_DURATION);
  if (entranceProgress >= BOSS_ENTRANCE_ASSEMBLE_END && entranceProgress < 1) {
    const stageProgress = (entranceProgress - BOSS_ENTRANCE_ASSEMBLE_END) / (1 - BOSS_ENTRANCE_ASSEMBLE_END);
    const shakeDecay = Math.max(0, 1 - stageProgress * 3);
    const shakeMag = 8 * shakeDecay;
    return { x: Math.sin(frame * 1.9) * shakeMag, y: Math.cos(frame * 2.3) * shakeMag };
  }

  const sinceTransitionEnd = frame - bossTransitionEndFrame;
  if (sinceTransitionEnd >= 0 && sinceTransitionEnd < BOSS_TRANSITION_COMPLETE_FX_DURATION) {
    const stageProgress = sinceTransitionEnd / BOSS_TRANSITION_COMPLETE_FX_DURATION;
    const shakeDecay = Math.max(0, 1 - stageProgress * 2.5);
    const shakeMag = 10 * shakeDecay;
    return { x: Math.sin(frame * 1.9) * shakeMag, y: Math.cos(frame * 2.3) * shakeMag };
  }

  if (bossTransitioning && bossTransitionTargetPhase === 5) {
    const stageProgress = (frame - bossTransitionStartFrame) / BOSS_PHASE5_TRANSITION_DURATION;
    if (stageProgress >= 0.2 && stageProgress < 0.68) {
      // shake builds through the burst, peaking hardest right at the flash
      const localProgress = (stageProgress - 0.2) / 0.48;
      const shakeMag = 14 * Math.sin(localProgress * Math.PI);
      return { x: Math.sin(frame * 2.1) * shakeMag, y: Math.cos(frame * 2.6) * shakeMag };
    }
  }

  if (bossFinalChargeActive) {
    const stageProgress = (frame - bossFinalChargeStartFrame) / BOSS_FINAL_CHARGE_DURATION;
    const shakeMag = 4 + stageProgress * 12; // builds steadily toward detonation
    return { x: Math.sin(frame * 1.7) * shakeMag, y: Math.cos(frame * 2.2) * shakeMag };
  }

  if (bossExplosionActive) {
    const stageProgress = (frame - bossExplosionStartFrame) / BOSS_EXPLOSION_DURATION;
    if (stageProgress < 0.45) {
      const shakeMag = 20; // maximum violence during the burst and white-out
      return { x: Math.sin(frame * 3.3) * shakeMag, y: Math.cos(frame * 3.9) * shakeMag };
    } else if (stageProgress < 0.7) {
      const localProgress = (stageProgress - 0.45) / 0.25;
      const shakeMag = 20 * Math.max(0, 1 - localProgress);
      return { x: Math.sin(frame * 3.3) * shakeMag, y: Math.cos(frame * 3.9) * shakeMag };
    }
  }

  return { x: 0, y: 0 };
}

function updateBgmForState() {
  if (!audioUnlocked) return;
  if (!audioSettings.bgmEnabled) {
    stopBgm();
    return;
  }
  const tester = document.getElementById('sfx-tester');
  if (tester && tester.classList.contains('active') && previewLoopId) return;
  if (state === 'playing' || state === 'paused' || state === 'respawn' || state === 'continue-prompt') {
    const th = currentTheme();
    playBgm((th.isBossZone || th.isMiniBossZone) ? 'boss' : 'standard');
  } else if (state === 'victory') {
    playBgm('victory');
  } else if (state === 'gameover') {
    stopBgm();
  } else {
    playBgm('menu');
  }
}

function draw() {
  try {
  updateBgmForState();
  applyCanvasRenderScale();
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, W, H);

  const shakeOffset = getBossShakeOffset();
  ctx.save();
  ctx.translate(shakeOffset.x, shakeOffset.y);

  const theme = currentTheme();
  if (state === 'home') {
    drawHomeBackground();
  } else if (state === 'options') {
    drawMenuBackground();
  } else {
    drawBackground(theme);
  }
  drawBoss(theme);
  drawMiniBoss(theme);
  drawMiniBossBarrage(theme);
  drawMiniBossFlameWall(theme);
  drawReactorCoreAttacks(theme);
  if (!warpActive && state !== 'home' && state !== 'options') {
    if (theme.obstacleShape === 'terrain') {
      drawTerrain(theme);
    } else {
      drawGates(theme);
    }
    drawPortalRing();
  }
  // drawn after gates/terrain so the wall/vignette actually occludes any
  // hazard or projectile positioned within its darkened zone, rather than
  // those rendering on top of it
  if (theme.isBossZone) drawBossArenaBarrierWall(theme, boss);
  if (theme.isMiniBossZone && miniBoss && theme.miniBossVariant !== 'core') {
    drawBossArenaObsidianWall(theme, miniBoss);
  }
  if (state !== 'home' && state !== 'options') {
    drawShip(theme);
  }
  if (warpActive) {
    drawWarpEffect();
  }
  if (state !== 'home') {
    drawBars(theme);
  }
  ctx.restore();
  } finally {
    maybeCaptureZoneScreenshot();
    updateOverlay();
  }
}

let lastRenderedOverlayState = null;
const STATIC_OVERLAY_STATES = new Set(['zone-select', 'settings', 'achievements', 'paused', 'statistics', 'confirm-reset-stats', 'victory']);
function updateOverlay() {
  overlay.classList.toggle('home-layout', state === 'home');
  pauseToggleBtn.style.display = (state === 'playing' || state === 'paused') ? 'block' : 'none';
  pauseToggleBtn.style.top = (BAR_HEIGHT + 8) + 'px';
  pauseToggleBtn.textContent = (state === 'paused') ? '\u25B6' : 'II';
  pauseToggleBtn.title = (state === 'paused') ? 'Resume (Esc)' : 'Pause (Esc)';
  overlay.style.pointerEvents = (state === 'playing' || state === 'ready' || state === 'respawn' || state === 'gameover' || state === 'victory') ? 'none' : 'auto';
  const __renderKey = state === 'zone-select' ? `zone-select:${zoneSelectPreviewIdx}:${unlockedZones.has(zoneSelectPreviewIdx) && zoneScreenshots[zoneSelectPreviewIdx] ? '1' : '0'}` : state === 'settings' ? `settings:${audioSettings.sfxEnabled}:${audioSettings.bgmEnabled}:${shipTrailStyle}:${shipSkinStyle}` : state === 'options' ? `options:${selectedDifficulty}` : state;
  if (__renderKey === lastRenderedOverlayState) {
    return;
  }
  lastRenderedOverlayState = __renderKey;
  const __scrollList = (typeof overlay.querySelector === 'function') ? overlay.querySelector('.scrollable-overlay-list') : null;
  const __savedScrollTop = __scrollList ? __scrollList.scrollTop : null;
  if (state === 'home') {
    overlay.innerHTML = `
      <div class="game-logo-plate home-title-plate">
        <div class="game-logo home-title">SYNTH FLIGHT</div>
      </div>
      <div id="menu-start-prompt" class="clickable" data-action="go-to-options">CLICK TO START</div>
    `;
  } else if (state === 'options') {
    const difficultyLabels = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD', extra: 'OVERDRIVE' };
    const difficultyClasses = { easy: 'difficulty-easy', normal: 'difficulty-normal', hard: 'difficulty-hard', extra: 'difficulty-extra' };
    const isLockedExtra = selectedDifficulty === 'extra' && !extraDifficultyUnlocked;
    const displayLabel = isLockedExtra ? '???' : difficultyLabels[selectedDifficulty];
    const displayClass = isLockedExtra ? '' : difficultyClasses[selectedDifficulty];
    overlay.innerHTML = `
      <div class="game-logo-plate" style="margin-bottom:18px;">
        <div class="game-logo" style="font-size:38px;">SYNTH FLIGHT</div>
      </div>
      <div class="options-panel-v2">
        <div class="panel-header">OPTIONS</div>
        <div class="menu-stack">
          <div class="menu-btn-row">
            <span class="menu-btn-label">DIFFICULTY</span>
            <div class="stepper-control">
              <button type="button" class="stepper-arrow" data-action="diff-prev">&#9664;</button>
              <span class="stepper-value ${displayClass}">${displayLabel}</span>
              <button type="button" class="stepper-arrow" data-action="diff-next">&#9654;</button>
            </div>
          </div>
          <div class="menu-btn-row" data-action="open-zone-select">
            <span class="menu-btn-label">ZONE SELECT</span>
            <span class="row-action-indicator">WARP &#9654;</span>
          </div>
          <div class="menu-btn-row" data-action="open-settings">
            <span class="menu-btn-label">SETTINGS</span>
            <span class="row-action-indicator">OPEN &#9654;</span>
          </div>
          <div class="menu-btn-row" data-action="open-achievements">
            <span class="menu-btn-label">ACHIEVEMENTS</span>
            <span class="row-action-indicator">VIEW &#9654;</span>
          </div>
          <div class="menu-btn-row" data-action="open-statistics">
            <span class="menu-btn-label">STATISTICS</span>
            <span class="row-action-indicator">VIEW &#9654;</span>
          </div>
        </div>
        <div class="start-action-container">
          <button type="button" class="btn-start-game" data-action="start-game">CLICK TO START</button>
        </div>
      </div>
    `;
  } else if (state === 'settings') {
    const deathWindowSeconds = ((FREE_HIT_COOLDOWN_MS - INVINCIBILITY_DURATION_MS) / 1000).toFixed(1);
    const iframeSeconds = (INVINCIBILITY_DURATION_MS / 1000).toFixed(1);
    const overdriveLocked = !extraDifficultyUnlocked;
    overlay.innerHTML = `
      <div class="menu-panel">
        <div id="title" style="font-size:32px;">SETTINGS</div>
        <div id="subtitle" class="overlay-recap">Audio</div>
        <div class="settings-diff-list scrollable-overlay-list">
          <div class="menu-btn-row" data-action="toggle-sfx">
            <span class="menu-btn-label">SOUND EFFECTS</span>
            <span class="row-action-indicator">${audioSettings.sfxEnabled ? 'ON' : 'OFF'}</span>
          </div>
          <div class="menu-btn-row" data-action="toggle-bgm">
            <span class="menu-btn-label">BACKGROUND MUSIC</span>
            <span class="row-action-indicator">${audioSettings.bgmEnabled ? 'ON' : 'OFF'}</span>
          </div>
          <div class="menu-btn-row">
            <span class="menu-btn-label">SHIP TRAIL</span>
            <div class="stepper-control">
              <button type="button" class="stepper-arrow" data-action="trail-prev">&#9664;</button>
              <span class="stepper-value">${currentShipTrail().name}</span>
              <button type="button" class="stepper-arrow" data-action="trail-next">&#9654;</button>
            </div>
          </div>
          <div class="settings-trail-hint">${currentShipTrail().hint} &middot; ${unlockedShipTrails().length} / ${SHIP_TRAILS.length} unlocked</div>
          <div class="menu-btn-row">
            <span class="menu-btn-label">SHIP</span>
            <div class="stepper-control">
              <button type="button" class="stepper-arrow" data-action="skin-prev">&#9664;</button>
              <span class="stepper-value">${currentShipSkin().name}</span>
              <button type="button" class="stepper-arrow" data-action="skin-next">&#9654;</button>
            </div>
          </div>
          <div class="settings-trail-hint">${currentShipSkin().hint} &middot; ${unlockedShipSkins().length} / ${SHIP_SKINS.length} unlocked</div>
          <div class="achievement-section-header" style="margin-top:14px;">DIFFICULTY DETAILS</div>
          <div class="settings-diff-card">
            <div class="settings-diff-name difficulty-easy">EASY</div>
            <div class="settings-diff-stats">
              9 lives &middot; 3 continues<br>
              ${iframeSeconds}s invincible (blinking) after a hit<br>
              ${deathWindowSeconds}s vulnerable afterward before it can trigger again
            </div>
          </div>
          <div class="settings-diff-card">
            <div class="settings-diff-name difficulty-normal">NORMAL</div>
            <div class="settings-diff-stats">
              9 lives &middot; 3 continues<br>
              No invincibility frames
            </div>
          </div>
          <div class="settings-diff-card">
            <div class="settings-diff-name difficulty-hard">HARD</div>
            <div class="settings-diff-stats">
              9 lives &middot; no continues<br>
              No invincibility frames
            </div>
          </div>
          <div class="settings-diff-card difficulty-extra${overdriveLocked ? ' locked' : ''}">
            <div class="settings-diff-name">OVERDRIVE ${overdriveLocked ? '&#128274;' : ''}</div>
            <div class="settings-diff-stats">
              ${overdriveLocked
                ? 'Beat the game on Normal or Hard to unlock'
                : '1 life &middot; no continues<br>' +
                  iframeSeconds + 's invincible (blinking) after a hit<br>' +
                  deathWindowSeconds + 's vulnerable afterward before it can trigger again'}
            </div>
          </div>
        </div>
        <div id="sub-panel-back" data-action="back-to-options">&#9664; BACK</div>
      </div>
    `;
  } else if (state === 'achievements') {
    const difficultyLabels = { easy: 'EASY', normal: 'NORMAL', hard: 'HARD', extra: 'OVERDRIVE' };
    const completedZoneCount = THEMES.filter((th, idx) => completedZones.has(idx)).length;
    const beatenCount = beatenDifficulties.size;
    const deathlessCount = THEMES.filter((th, idx) => deathlessZones.has(idx)).length;
    const DISTANCE_MILESTONES = [10000, 25000, 50000, 100000, 200000];
    const distanceMilestonesReached = DISTANCE_MILESTONES.filter(m => totalDistanceTraveled >= m).length;
    const achievementTile = (num, name, done, doneClass) => `
        <div class="zone-tile achievement-tile${done ? ' achievement-unlocked ' + doneClass : ' locked'}">
          <span class="tile-num">${num}</span>
          <span class="tile-name">${name}</span>
          <span class="tile-status">${done ? '<span class="ach-seal"></span>' : '&#128274;'}</span>
        </div>
      `;
    const completedZoneTilesHtml = THEMES.map((th, idx) => achievementTile((idx + 1) < 10 ? '0' + (idx + 1) : (idx + 1), th.name, completedZones.has(idx), 'achievement-done')).join('');
    const beatGameTilesHtml = ['easy', 'normal', 'hard', 'extra'].map(diff =>
      achievementTile('&#127942;', `BEAT GAME: ${difficultyLabels[diff]}`, beatenDifficulties.has(diff), 'achievement-done')
    ).join('');
    const deathlessTilesHtml = THEMES.map((th, idx) => achievementTile((idx + 1) < 10 ? '0' + (idx + 1) : (idx + 1), th.name, deathlessZones.has(idx), 'achievement-deathless')).join('');
    const distanceTilesHtml = DISTANCE_MILESTONES.map(m =>
      achievementTile('&#128640;', `${(m / 1000)}K METERS`, totalDistanceTraveled >= m, 'achievement-distance')
    ).join('');
    const rankTilesHtml = RANK_TIER_ORDER.map(tier =>
      achievementTile('&#11088;', `RANK ${tier} &mdash; ${RANK_TIER_HINTS[tier]}`, achievedRanks.has(tier), 'achievement-rank')
    ).join('');
    const trailTilesHtml = SHIP_TRAILS.map((t, idx) => {
      const done = t.unlocked();
      const label = done ? t.name : `${t.name} &mdash; ${t.hint}`;
      return achievementTile((idx + 1) < 10 ? '0' + (idx + 1) : String(idx + 1), label, done, 'achievement-trail');
    }).join('');
    const shipTilesHtml = SHIP_SKINS.map((s, idx) => {
      const done = s.unlocked();
      const label = done ? s.name : `${s.name} &mdash; ${s.hint}`;
      return achievementTile((idx + 1) < 10 ? '0' + (idx + 1) : String(idx + 1), label, done, 'achievement-ship');
    }).join('');
    overlay.innerHTML = `
      <div class="menu-panel zone-select-panel scrollable-overlay-list">
        <div id="title" style="font-size:32px;">ACHIEVEMENTS</div>
        <div id="subtitle" class="overlay-recap">${completedZoneCount} / ${THEMES.length} zones completed &middot; ${beatenCount} / 4 difficulties beaten &middot; ${deathlessCount} / ${THEMES.length} deathless &middot; ${distanceMilestonesReached} / ${DISTANCE_MILESTONES.length} distance milestones &middot; ${achievedRanks.size} / ${RANK_TIER_ORDER.length} ranks &middot; ${unlockedShipTrails().length} / ${SHIP_TRAILS.length} ship trails &middot; ${unlockedShipSkins().length} / ${SHIP_SKINS.length} ships</div>
        <div class="stats-cat stats-cat-done">COMPLETED</div>
        <div class="zone-grid">${completedZoneTilesHtml}${beatGameTilesHtml}</div>
        <div class="stats-cat stats-cat-deathless">DEATHLESS</div>
        <div class="achievement-section-note">Clear a zone without dying, on Normal difficulty or higher.</div>
        <div class="zone-grid">${deathlessTilesHtml}</div>
        <div class="stats-cat stats-cat-distance">DISTANCE MILESTONES</div>
        <div class="achievement-section-note">Lifetime distance flown, across every run.</div>
        <div class="zone-grid">${distanceTilesHtml}</div>
        <div class="stats-cat stats-cat-ranks">RANKS</div>
        <div class="achievement-section-note">Awarded when you beat the full game, from deaths on that run. A better rank also unlocks every tier below it.</div>
        <div class="zone-grid">${rankTilesHtml}</div>
        <div class="stats-cat stats-cat-trails">SHIP TRAILS</div>
        <div class="achievement-section-note">Cosmetic exhaust animations. Equip unlocked trails in Settings.</div>
        <div class="zone-grid">${trailTilesHtml}</div>
        <div class="stats-cat stats-cat-ships">SHIPS</div>
        <div class="achievement-section-note">Cosmetic hull skins. Equip unlocked ships in Settings.</div>
        <div class="zone-grid">${shipTilesHtml}</div>
        <div id="sub-panel-back" data-action="back-to-options">&#9664; BACK</div>
      </div>
    `;
  } else if (state === 'statistics') {
    const totalLifetimeDeaths = lifetimeDeathsByZone.reduce((a, b) => a + (b || 0), 0);
    const totalCompletions = zoneCompletionCounts.reduce((a, b) => a + (b || 0), 0);
    const maxDeaths = Math.max(1, ...lifetimeDeathsByZone.map(n => n || 0));
    const maxClears = Math.max(1, ...zoneCompletionCounts.map(n => n || 0));
    const statZoneTile = (idx, name, count, kind, heatMax) => {
      const hasValue = count > 0;
      const heat = hasValue ? Math.max(0.28, count / heatMax) : 0;
      const num = (idx + 1) < 10 ? '0' + (idx + 1) : String(idx + 1);
      return `
        <div class="stat-zone-tile stat-zone-${kind} ${hasValue ? 'has-value' : 'is-empty'}" style="--stat-heat:${heat.toFixed(3)}">
          <span class="tile-num">${num}</span>
          <span class="tile-name">${name}</span>
          <span class="stat-zone-count">${count.toLocaleString()}</span>
        </div>
      `;
    };
    const deathTilesHtml = THEMES.map((th, idx) => statZoneTile(idx, th.name, lifetimeDeathsByZone[idx] || 0, 'deaths', maxDeaths)).join('');
    const completionTilesHtml = THEMES.map((th, idx) => statZoneTile(idx, th.name, zoneCompletionCounts[idx] || 0, 'clears', maxClears)).join('');
    overlay.innerHTML = `
      <div class="menu-panel zone-select-panel scrollable-overlay-list">
        <div id="title" style="font-size:32px;">STATISTICS</div>
        <div class="stats-hero">
          <div class="stats-hero-card stats-hero-distance">
            <div class="stats-hero-label">TOTAL DISTANCE</div>
            <div class="stats-hero-value">${Math.floor(totalDistanceTraveled).toLocaleString()}<span class="stats-hero-unit">m</span></div>
          </div>
          <div class="stats-hero-card stats-hero-deaths">
            <div class="stats-hero-label">TOTAL DEATHS</div>
            <div class="stats-hero-value">${totalLifetimeDeaths.toLocaleString()}</div>
          </div>
          <div class="stats-hero-card stats-hero-clears">
            <div class="stats-hero-label">ZONE CLEARS</div>
            <div class="stats-hero-value">${totalCompletions.toLocaleString()}</div>
          </div>
        </div>
        <div class="stats-cat stats-cat-deaths">DEATHS BY ZONE</div>
        <div class="zone-grid">${deathTilesHtml}</div>
        <div class="stats-cat stats-cat-clears">ZONE COMPLETIONS</div>
        <div class="zone-grid">${completionTilesHtml}</div>
        <div class="menu-btn-row danger-row" data-action="confirm-reset-stats" style="margin-top:20px; justify-content:center;">
          <span class="menu-btn-label">RESET STATS</span>
        </div>
        <div id="sub-panel-back" data-action="back-to-options">&#9664; BACK</div>
      </div>
    `;
  } else if (state === 'confirm-reset-stats') {
    overlay.innerHTML = `
      <div class="options-panel-v2 confirm-panel">
        <div class="panel-header confirm-danger-header">RESET STATS?</div>
        <div class="confirm-warning-text">
          This will permanently erase your best distance, unlocked zones, achievements, and all lifetime statistics.
          <br><br>
          <strong>This cannot be undone.</strong>
        </div>
        <div class="confirm-btn-row">
          <button type="button" class="btn-confirm-cancel" data-action="cancel-reset-stats">CANCEL</button>
          <button type="button" class="btn-confirm-danger" data-action="reset-stats-confirmed">YES, DELETE EVERYTHING</button>
        </div>
      </div>
    `;
  } else if (state === 'zone-select') {
    const zoneTypeLabel = (th) => th.isBossZone ? 'FINAL BOSS ZONE' : (th.isMiniBossZone ? 'MINI BOSS ZONE' : 'STANDARD ZONE');
    const tilesHtml = THEMES.map((th, idx) => {
      const unlocked = unlockedZones.has(idx);
      const active = idx === zoneSelectPreviewIdx;
      return `
        <div class="zone-tile${unlocked ? '' : ' locked'}${active ? ' active' : ''}"${unlocked ? ` data-action="preview-zone" data-zone-idx="${idx}"` : ''}>
          <span class="tile-num">${(idx + 1) < 10 ? '0' + (idx + 1) : (idx + 1)}</span>
          <span class="tile-name">${th.name}</span>
          <span class="tile-status">${unlocked ? '&#9654;' : '&#128274;'}</span>
        </div>
      `;
    }).join('');
    const previewTheme = THEMES[zoneSelectPreviewIdx];
    const previewUnlocked = unlockedZones.has(zoneSelectPreviewIdx);
    for (let i = 0; i < THEMES.length; i++) {
      if (!unlockedZones.has(i) || zoneScreenshots[i]) continue;
      try { generateAndStoreZoneStill(i); } catch (e) { /* keep sky fallback */ }
    }
    const previewShot = previewUnlocked ? zoneScreenshots[zoneSelectPreviewIdx] : null;
    const previewViewportInner = previewShot
      ? `<img class="preview-shot" alt="${previewTheme.name}" src="${previewShot}">`
      : (previewUnlocked
        ? ''
        : '<div class="preview-locked-label">LOCKED</div>');
    overlay.innerHTML = `
      <div class="menu-panel zone-select-panel scrollable-overlay-list">
        <div id="title" style="font-size:26px;">ZONE SELECT</div>
        <div class="zone-select-subtitle">WARP TO ANY UNLOCKED ZONE -- PRACTICE MODE, DOESN'T AFFECT BEST DISTANCE OR DEATH STATS</div>
        <div class="zone-select-wrapper">
          <div class="zone-grid">${tilesHtml}</div>
          <div class="zone-preview-panel">
            <div>
              <div class="preview-viewport${previewUnlocked ? '' : ' locked'}" style="background: linear-gradient(180deg, ${previewTheme.skyTop}, ${previewTheme.skyMid}, ${previewTheme.skyBottom});">${previewViewportInner}</div>
              <div class="preview-details">
                <div class="preview-title">${zoneSelectPreviewIdx + 1}. ${previewTheme.name}</div>
                <div class="preview-stats">
                  <span>TYPE: ${zoneTypeLabel(previewTheme)}</span>
                  <span>STATUS: ${previewUnlocked ? 'UNLOCKED' : 'LOCKED'}</span>
                </div>
              </div>
            </div>
            <button type="button" class="btn-warp" data-action="warp-to-zone"${previewUnlocked ? '' : ' disabled'}>WARP TO ZONE &#9654;</button>
          </div>
        </div>
        <div id="sub-panel-back" data-action="back-to-options">&#9664; BACK</div>
      </div>
    `;
  } else if (state === 'ready') {
    const diffLabel = selectedDifficulty.toUpperCase();
    overlay.innerHTML = `
      <div id="title">CLICK TO START</div>
      <div id="subtitle">Difficulty: ${diffLabel}<br>Hold to rise, release to fall<br>Fly through the shifting gates<br>New world every 1000 distance<br>${MAX_LIVES} lives per run</div>
    `;
  } else if (state === 'paused') {
    overlay.innerHTML = `
      <div class="menu-panel">
        <div class="panel-header">PAUSED</div>
        <div class="menu-stack">
          <div class="menu-btn-row" data-action="resume-game">
            <span class="menu-btn-label">RESUME</span>
            <span class="row-action-indicator">PLAY &#9654;</span>
          </div>
          <div class="menu-btn-row" data-action="open-pause-options">
            <span class="menu-btn-label">OPTIONS</span>
            <span class="row-action-indicator">OPEN &#9654;</span>
          </div>
          <div class="menu-btn-row" data-action="quit-to-home">
            <span class="menu-btn-label">${isPracticeRun ? 'ZONE SELECT' : 'MAIN MENU'}</span>
            <span class="row-action-indicator">${isPracticeRun ? 'BACK' : 'EXIT'} &#9654;</span>
          </div>
        </div>
        <div class="panel-footer-hint">PRESS ESC OR TAP THE PAUSE BUTTON TO RESUME</div>
      </div>
    `;
  } else if (state === 'respawn') {
    overlay.innerHTML = `
      <div id="title">LIFE LOST</div>
      <div id="subtitle">${lives} ${lives === 1 ? 'life' : 'lives'} remaining<br>Restarting at the beginning of this zone<br>Click to continue</div>
    `;
  } else if (state === 'continue-prompt') {
    overlay.innerHTML = `
      <div class="menu-panel continue-panel">
        <div class="panel-header">CONTINUE?</div>
        <div class="continue-credit">${continuesRemaining}</div>
        <div class="continue-credit-label">${continuesRemaining === 1 ? 'CREDIT REMAINING' : 'CREDITS REMAINING'}</div>
        <div class="menu-stack">
          <button type="button" class="btn-start-game" data-action="use-continue">CONTINUE &#9654;</button>
          <button type="button" class="btn-continue-secondary" data-action="quit-to-home">${isPracticeRun ? 'ZONE SELECT' : 'MAIN MENU'}</button>
        </div>
      </div>
    `;
  } else if (state === 'gameover') {
    overlay.innerHTML = `
      <div id="title">GAME OVER</div>
      <div id="subtitle">Distance: ${Math.floor(maxDistanceReached)} &nbsp;|&nbsp; Best: ${best}<br>Click to try again</div>
    `;
  } else if (state === 'victory') {
    // rank tier based on total deaths across the run -- 0 deaths within
    // the S-Rank band is specifically called out as a "perfect run"
    const rankTier = rankTierForDeaths(totalDeaths);
    const rankLabel = rankTier === 'S'
      ? (totalDeaths === 0 ? 'PERFECT RUN &mdash; S RANK' : 'S RANK')
      : `${rankTier} RANK`;

    const clearTimeSeconds = Math.floor(clearTimeMs / 1000);
    const clearTimeLabel = `${Math.floor(clearTimeSeconds / 60)}:${String(clearTimeSeconds % 60).padStart(2, '0')}`;

    // natural reading order -- the grid (2 columns) fills left-to-right,
    // top-to-bottom on its own, so 01 sits next to 02, 03 next to 04, etc.
    const zoneRowHtml = (th, idx) => {
      const num = (idx + 1) < 10 ? '0' + (idx + 1) : (idx + 1);
      const deaths = deathsByZone[th.name] || 0;
      return `<div class="zone-stat-row"><span><span class="skull">&#128128;</span> ${num} ${th.name}</span><span class="deaths">${deaths}</span></div>`;
    };
    const zoneRowsHtml = THEMES.map((th, idx) => zoneRowHtml(th, idx)).join('');

    const unlockBanner = justUnlockedExtraDifficulty
      ? `<div id="subtitle" style="font-size:14px; color:#ff0000; text-shadow:0 0 10px rgba(255,0,0,0.8); margin-top:12px;">&#128274; OVERDRIVE DIFFICULTY UNLOCKED</div>`
      : '';
    overlay.innerHTML = `
      <div id="title" style="font-size:38px; text-shadow: 0 0 12px var(--neon-cyan), 0 0 25px var(--neon-pink);">THE SIGNAL IS SILENCED</div>
      <div id="subtitle" style="font-size:15px; margin-top:28px;">The Signal has been destroyed. Synth Flight is complete.</div>
      ${unlockBanner}
      <div class="reward-card">
        <div class="rank-badge">
          <span class="star">&#9733;</span>
          <span class="rank-text">${rankLabel}</span>
          <span class="star">&#9733;</span>
        </div>
        <div class="stats-matrix">
          <div class="stat-box">
            <div class="stat-label">TOTAL DEATHS</div>
            <div class="stat-value">${totalDeaths}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">CLEAR TIME</div>
            <div class="stat-value">${clearTimeLabel}</div>
          </div>
          <div class="stat-box">
            <div class="stat-label">ZONES CLEARED</div>
            <div class="stat-value">${THEMES.length} / ${THEMES.length}</div>
          </div>
        </div>
        <div class="zone-breakdown-grid">
          ${zoneRowsHtml}
        </div>
        <button type="button" class="btn-continue">CLICK TO CONTINUE &#9654;</button>
      </div>
    `;
  } else {
    overlay.innerHTML = '';
  }
  if (__savedScrollTop !== null) {
    const __newScrollList = overlay.querySelector('.scrollable-overlay-list');
    if (__newScrollList) __newScrollList.scrollTop = __savedScrollTop;
  }
}

// ---- Dev tools ----
const devToggle = document.getElementById('dev-toggle');
const devPanel = document.getElementById('dev-panel');

devToggle.addEventListener('click', () => {
  devPanel.classList.toggle('active');
});

function devStatus(msg) {
  const el = document.getElementById('dev-status');
  if (el) el.textContent = msg;
}

function devJumpToTheme(idx) {
  if (state === 'ready' || state === 'gameover' || state === 'respawn' || state === 'victory' || state === 'continue-prompt') {
    resetGame();
    state = 'playing';
  }
  devSessionActive = true;
  devGracePeriodEndFrame = frame + DEV_GRACE_PERIOD_DURATION; // freeze the ship for a fixed window, so it survives however long the dev panel takes to navigate
  // reset distance tracking so the jumped-to zone behaves exactly like a
  // fresh zone entry (requires exactly 1000 distance), regardless of
  // whatever distance was accumulated before the jump
  distance = 0;
  themeLevelReached = 0;
  beginWarp(idx);
  devStatus('Warping to zone ' + (idx + 1) + '...');
}

function devSkipWarp() {
  if (warpActive) {
    finishWarp();
    devStatus('Warp skipped -- now in zone ' + (themeIndex + 1) + '.');
  } else {
    devStatus('Nothing to skip -- not currently warping. Jump to a zone first.');
  }
}

function devSkipToCorePhase6() {
  if (state === 'ready' || state === 'gameover' || state === 'respawn' || state === 'victory' || state === 'continue-prompt') {
    resetGame();
    state = 'playing';
  }
  devSessionActive = true;
  if (themeIndex !== 9) {
    distance = 0;
    themeLevelReached = 0;
    beginWarp(9);
  }
  while (warpActive) finishWarp();
  if (!miniBoss) {
    devStatus('Reactor Core boss not yet spawned -- click again in a moment.');
    return;
  }
  coreBossPhase = 6;
  coreSparkSpawned = 0;
  coreSparks = [];
  coreSparkPhaseStartFrame = frame;
  coreCrossfireRound = 0;
  const safeSlot = Math.floor(Math.random() * CORE_CROSSFIRE_SLOT_FRACS.length);
  coreCrossfireBeamYs = computeCrossfireBeamYs(safeSlot);
  miniBossAttackState = 'coreCrossfireTelegraph';
  miniBossAttackStateStartFrame = frame;
  ship.y = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) / 2;
  ship.vy = 0;
  devGracePeriodEndFrame = frame + DEV_GRACE_PERIOD_DURATION;
  devStatus('Jumped to Reactor Core phase 6 (crossfire + sparks).');
}

function devSkipToCorePhase8() {
  if (state === 'ready' || state === 'gameover' || state === 'respawn' || state === 'victory' || state === 'continue-prompt') {
    resetGame();
    state = 'playing';
  }
  devSessionActive = true;
  if (themeIndex !== 9) {
    distance = 0;
    themeLevelReached = 0;
    beginWarp(9);
  }
  while (warpActive) finishWarp();
  if (!miniBoss) {
    devStatus('Reactor Core boss not yet spawned -- click again in a moment.');
    return;
  }
  miniBossSpawnFrame = frame - MINI_BOSS_ENTRANCE_DURATION - 1; // entrance animation is separate from the zone warp and runs on its own timer -- without this it fires independently a moment later and overwrites the state set below
  coreBossPhase = 8;
  miniBoss.x = Math.min(ship.x + CORE_SPHERE_X_OFFSET, miniBoss.restX);
  miniBoss.y = miniBoss.baseY;
  miniBoss.r = miniBoss.maxR;
  coreOrbitSpawned = 0;
  coreOrbitProjectiles = [];
  coreOrbitEmitAngle = 0;
  coreGateOpenAmount = 1;
  miniBossAttackState = 'coreOrbitBarrageActive';
  miniBossAttackStateStartFrame = frame;
  ship.y = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) / 2;
  ship.vy = 0;
  coreEyeBeamState = 'track';
  coreEyeBeamStateStartFrame = frame;
  coreEyeBeamY = ship.y;
  coreTeslaState = 'charging';
  coreTeslaStateStartFrame = frame;
  coreTeslaProjectiles = [];
  coreTeslaEmptySlot = pickCoreTeslaEmptySlot();
  devGracePeriodEndFrame = frame + DEV_GRACE_PERIOD_DURATION;
  devStatus('Jumped to Reactor Core phase 8 (orbiting barrage).');
}

function devAddDistance() {
  if (state === 'ready' || state === 'respawn') state = 'playing';
  distance += 500;
  devStatus('Distance +500 (now ' + Math.floor(distance) + ').');
}

function devSetDistanceInZone(value) {
  if (state === 'ready' || state === 'respawn') state = 'playing';
  distance = zoneStartDistance + value;
  portalObject = null; // recompute cleanly from the new position
  devStatus('Jumped to ' + value + ' / ' + THEME_DISTANCE + ' in the current zone.');
}

function devUnlockEverything() {
  extraDifficultyUnlocked = true;
  unlockedZones = new Set(THEMES.map((_, i) => i));
  completedZones = new Set(THEMES.map((_, i) => i));
  deathlessZones = new Set(THEMES.map((_, i) => i));
  beatenDifficulties = new Set(['easy', 'normal', 'hard', 'extra']);
  achievedRanks = new Set(RANK_TIER_ORDER);
  if (totalDistanceTraveled < 200000) totalDistanceTraveled = 200000;
  if (!Array.isArray(zoneCompletionCounts) || zoneCompletionCounts.length < THEMES.length) {
    zoneCompletionCounts = new Array(THEMES.length).fill(0);
  }
  for (let i = 0; i < THEMES.length; i++) {
    zoneCompletionCounts[i] = Math.max(zoneCompletionCounts[i] || 0, 1);
  }
  savePlayerProfile();
  lastRenderedOverlayState = null;
  try { updateOverlay(); } catch (e) { /* overlay may not be ready */ }
  devStatus('Unlocked all zones, Overdrive, achievements, ranks, and distance milestones.');
}

const unlockAllBtn = document.createElement('button');
unlockAllBtn.textContent = 'Unlock everything';
unlockAllBtn.style.borderColor = '#ffd23f';
unlockAllBtn.style.color = '#ffd23f';
unlockAllBtn.addEventListener('click', devUnlockEverything);
devPanel.appendChild(unlockAllBtn);

THEMES.forEach((t, i) => {
  const btn = document.createElement('button');
  btn.textContent = (i + 1) + '. ' + t.name;
  btn.addEventListener('click', () => devJumpToTheme(i));
  devPanel.appendChild(btn);
});

const skipWarpBtn = document.createElement('button');
skipWarpBtn.textContent = 'Skip warp animation';
skipWarpBtn.addEventListener('click', devSkipWarp);
devPanel.appendChild(skipWarpBtn);

const skipCorePhase6Btn = document.createElement('button');
skipCorePhase6Btn.textContent = 'Jump to Reactor Core phase 6';
skipCorePhase6Btn.addEventListener('click', devSkipToCorePhase6);
devPanel.appendChild(skipCorePhase6Btn);

const skipCorePhase8Btn = document.createElement('button');
skipCorePhase8Btn.textContent = 'Jump to Reactor Core phase 8 (orbit barrage)';
skipCorePhase8Btn.addEventListener('click', devSkipToCorePhase8);
devPanel.appendChild(skipCorePhase8Btn);

const addDistBtn = document.createElement('button');
addDistBtn.textContent = '+500 distance (difficulty)';
addDistBtn.addEventListener('click', devAddDistance);
devPanel.appendChild(addDistBtn);

function devSkipToBossPhase3() {
  if (!currentTheme().isBossZone || !boss) {
    devStatus('Not in the boss zone.');
    return;
  }
  if (bossPhase >= 3 || bossTransitioning) {
    devStatus('Already at phase ' + bossPhase + (bossTransitioning ? ' (mid-transition)' : '') + ' -- ignoring, this would yank the boss backward.');
    return;
  }
  // the ship has likely been falling under gravity the whole time
  // spent navigating the dev panel to reach this button -- recenter
  // it so the skip doesn't get immediately undone by a boundary crash
  ship.y = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) / 2;
  ship.vy = 0;
  devGracePeriodEndFrame = frame + DEV_GRACE_PERIOD_DURATION;
  bossSpawnFrame = frame - BOSS_ENTRANCE_DURATION; // ensure entrance is already complete
  const elapsedTarget = BOSS_PHASE_DURATION * 2 + 10; // just past the phase 2/3 boundary
  bossTimer = Math.round(currentTheme().bossDuration - elapsedTarget);
  bossPhase = 2; // so the transition trigger fires naturally on the next update
  bossTransitioning = false;
  gates = gates.filter(g => !BOSS_HAZARD_TYPES.includes(g.type)); // battlefield already clear
  bossWaitingForClear = true; // will immediately proceed to the transformation since gates has no hazards
  bossWaitingForClearStartFrame = frame;
  bossWaitingForClearTargetPhase = 3;
  devStatus('Skipped to the phase 2->3 transition (ship recentered, battlefield cleared) -- it will play out (~3s), then phase 3 begins.');
}

function devSkipToBossPhase4() {
  if (!currentTheme().isBossZone || !boss) {
    devStatus('Not in the boss zone.');
    return;
  }
  if (bossPhase >= 4 || bossTransitioning) {
    devStatus('Already at phase ' + bossPhase + (bossTransitioning ? ' (mid-transition)' : '') + ' -- ignoring, this would yank the boss backward.');
    return;
  }
  ship.y = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) / 2;
  ship.vy = 0;
  devGracePeriodEndFrame = frame + DEV_GRACE_PERIOD_DURATION;
  bossSpawnFrame = frame - BOSS_ENTRANCE_DURATION;
  const elapsedTarget = BOSS_PHASE_DURATION * 3 + 10; // just past the phase 3/4 boundary
  bossTimer = Math.round(currentTheme().bossDuration - elapsedTarget);
  bossPhase = 3;
  bossTransitioning = false;
  devStatus('Skipped to phase 4 (ship recentered) -- instant, no transition sequence.');
}

function devSkipToBossPhase5() {
  if (!currentTheme().isBossZone || !boss) {
    devStatus('Not in the boss zone.');
    return;
  }
  if (bossPhase >= 5 || bossTransitioning) {
    devStatus('Already at phase ' + bossPhase + (bossTransitioning ? ' (mid-transition)' : '') + ' -- ignoring, this would yank the boss backward.');
    return;
  }
  ship.y = PLAY_TOP + (PLAY_BOTTOM - PLAY_TOP) / 2;
  ship.vy = 0;
  devGracePeriodEndFrame = frame + DEV_GRACE_PERIOD_DURATION;
  bossSpawnFrame = frame - BOSS_ENTRANCE_DURATION;
  const elapsedTarget = BOSS_PHASE_DURATION * 4 + 10; // just past the phase 4/5 boundary
  bossTimer = Math.round(currentTheme().bossDuration - elapsedTarget);
  bossPhase = 4;
  bossTransitioning = false;
  gates = gates.filter(g => !BOSS_HAZARD_TYPES.includes(g.type)); // battlefield already clear
  bossWaitingForClear = true; // will immediately proceed to the transformation since gates has no hazards
  bossWaitingForClearStartFrame = frame;
  bossWaitingForClearTargetPhase = 5;
  devStatus('Skipped to phase 5 -- battlefield cleared, shatter-and-reform transformation begins next frame.');
}

function devWarpToVictory() {
  if (state === 'ready' || state === 'gameover' || state === 'respawn' || state === 'continue-prompt') {
    resetGame();
    state = 'playing';
  }
  isPracticeRun = false;
  devSessionActive = true;
  themeIndex = 12; // The Signal, the final zone
  themeLevelReached = 12;
  triggerVictory();
  devStatus('Warped straight to the victory screen (dev preview -- not recorded to your save).');
}

const skipPhase3Btn = document.createElement('button');
skipPhase3Btn.textContent = 'Skip to boss phase 3';
skipPhase3Btn.addEventListener('click', devSkipToBossPhase3);
devPanel.appendChild(skipPhase3Btn);

const skipPhase4Btn = document.createElement('button');
skipPhase4Btn.textContent = 'Skip to boss phase 4';
skipPhase4Btn.addEventListener('click', devSkipToBossPhase4);
devPanel.appendChild(skipPhase4Btn);

const skipPhase5Btn = document.createElement('button');
skipPhase5Btn.textContent = 'Skip to boss phase 5';
skipPhase5Btn.addEventListener('click', devSkipToBossPhase5);
devPanel.appendChild(skipPhase5Btn);

const warpToVictoryBtn = document.createElement('button');
warpToVictoryBtn.textContent = 'Warp to victory screen';
warpToVictoryBtn.addEventListener('click', devWarpToVictory);
devPanel.appendChild(warpToVictoryBtn);

const triggerBeamBtn = document.createElement('button');
triggerBeamBtn.textContent = 'Trigger charge beam';
triggerBeamBtn.addEventListener('click', () => {
  if (bossPhase !== 5 || bossTransitioning) {
    devStatus('Not in phase 5 (or mid-transition) -- skip to phase 5 first.');
    return;
  }
  spawnBossChargeBeamTelegraph();
  devStatus('Charge beam telegraph spawned, locked to current ship position.');
});
devPanel.appendChild(triggerBeamBtn);

const jump750Btn = document.createElement('button');
jump750Btn.textContent = 'Start at 750 in zone';
jump750Btn.addEventListener('click', () => devSetDistanceInZone(750));
devPanel.appendChild(jump750Btn);

const ghostBtn = document.createElement('button');
ghostBtn.textContent = 'Ghost Mode: Off';
ghostBtn.addEventListener('click', () => {
  ghostMode = !ghostMode;
  ghostBtn.textContent = 'Ghost Mode: ' + (ghostMode ? 'On' : 'Off');
  devStatus(ghostMode
    ? 'Ghost mode on -- full noclip. Hazards, walls, and pull fields cannot kill you. Portal still works.'
    : 'Ghost mode off -- normal collision restored.');
});
devPanel.appendChild(ghostBtn);

const gridFadeBtn = document.createElement('button');
gridFadeBtn.textContent = 'Boss Grid Fade: On';
gridFadeBtn.addEventListener('click', () => {
  bossGridFadeEnabled = !bossGridFadeEnabled;
  gridFadeBtn.textContent = 'Boss Grid Fade: ' + (bossGridFadeEnabled ? 'On' : 'Off');
  devStatus(bossGridFadeEnabled
    ? 'Grid will fade out during the phase 3 color transition.'
    : 'Grid stays visible through the phase 3 color transition.');
});
devPanel.appendChild(gridFadeBtn);

const ashVariantBtn = document.createElement('button');
ashVariantBtn.textContent = 'Phase 5 Ash: Gray';
ashVariantBtn.addEventListener('click', () => {
  bossAshGrayVariant = !bossAshGrayVariant;
  ashVariantBtn.textContent = 'Phase 5 Ash: ' + (bossAshGrayVariant ? 'Gray' : 'Red');
  devStatus('Phase 5 ash background switched to ' + (bossAshGrayVariant ? 'gray' : 'red') + ' tint.');
});
devPanel.appendChild(ashVariantBtn);

const CUSTOM_LEVEL_STORAGE_KEYS = ['zone4-terrain-custom', 'bolt-patterns-custom', 'blackhole-events-custom', 'windvortex-events-custom', 'cloudarc-events-custom', 'lensingzone-events-custom', 'supernova-events-custom', 'turret-events-custom', 'emp-events-custom', 'orb-events-custom'];

function collectCustomLevelDataFromThemes() {
  return {
    _version: (window.SHIPPED_CUSTOM_LEVELS && window.SHIPPED_CUSTOM_LEVELS._version) || 'snes229',
    'bolt-patterns-custom': THEMES.map(t => t.obstacleShape === 'lbolt' ? t.pattern : null),
    'blackhole-events-custom': THEMES.map(t => t.blackHoleEvents || null),
    'windvortex-events-custom': THEMES.map(t => t.windVortexEvents || null),
    'cloudarc-events-custom': THEMES.map(t => t.cloudArcEvents || null),
    'lensingzone-events-custom': THEMES.map(t => t.lensingZoneEvents || null),
    'supernova-events-custom': THEMES.map(t => t.supernovaEvents || null),
    'turret-events-custom': THEMES.map(t => t.turretEvents || null),
    'emp-events-custom': THEMES.map(t => t.empEvents || null),
    'orb-events-custom': THEMES.map(t => t.pulsingOrbEvents || null)
  };
}

function downloadBakedCustomLevels() {
  const data = collectCustomLevelDataFromThemes();
  const text = 'window.SHIPPED_CUSTOM_LEVELS = ' + JSON.stringify(data, null, 2) + ';\n';
  const blob = new Blob([text], { type: 'text/javascript;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'custom-levels.js';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const exportCustomBtn = document.createElement('button');
exportCustomBtn.textContent = 'Export Saved Custom Data';
const importCustomBtn = document.createElement('button');
importCustomBtn.textContent = 'Import Custom Data (from textarea)';
const bakeCustomBtn = document.createElement('button');
bakeCustomBtn.textContent = 'Download custom-levels.js (bake into project)';
const clearLocalCustomBtn = document.createElement('button');
clearLocalCustomBtn.textContent = 'Clear local custom overrides';
const exportTextarea = document.createElement('textarea');
exportTextarea.style.cssText = 'display:none; width:100%; height:200px; margin-top:8px; font-family:monospace; font-size:11px; background:#0d0221; color:#0ff0fc; border:1px solid #ff2079;';
exportCustomBtn.addEventListener('click', async () => {
  devStatus('Reading saved custom data from storage...');
  const out = {};
  for (const k of CUSTOM_LEVEL_STORAGE_KEYS) {
    try {
      const result = await window.storage.get(k);
      const parsed = parseStoredCustom(result && result.value);
      if (parsed) out[k] = parsed;
    } catch (e) { /* key not saved, skip */ }
  }
  const foundCount = Object.keys(out).length;
  if (foundCount === 0) {
    devStatus('No saved custom data found in storage. Paste JSON below and use Import.');
    exportTextarea.style.display = 'block';
  } else {
    devStatus('Found ' + foundCount + ' saved custom dataset(s). Copy the text below and send it back.');
    exportTextarea.style.display = 'block';
    exportTextarea.value = JSON.stringify(out, null, 2);
    exportTextarea.focus();
    exportTextarea.select();
  }
});
importCustomBtn.addEventListener('click', async () => {
  let data;
  try {
    data = JSON.parse(exportTextarea.value);
  } catch (e) {
    exportTextarea.style.display = 'block';
    devStatus('Import failed — paste the exported JSON into the box first.');
    return;
  }
  let imported = 0;
  for (const k of CUSTOM_LEVEL_STORAGE_KEYS) {
    if (data[k] == null) continue;
    try {
      await window.storage.set(k, JSON.stringify(data[k]));
      imported++;
    } catch (e) { /* skip */ }
  }
  if (imported === 0) {
    devStatus('Import found no recognized custom-level keys.');
    return;
  }
  await applyAllCustomLevelData();
  await loadCustomTerrain();
  devStatus('Imported ' + imported + ' custom dataset(s). Reloaded into themes.');
});
bakeCustomBtn.addEventListener('click', async () => {
  const data = collectCustomLevelDataFromThemes();
  for (const [k, v] of Object.entries(data)) {
    try { await window.storage.set(k, JSON.stringify(v)); } catch (e) { /* skip */ }
  }
  downloadBakedCustomLevels();
  exportTextarea.style.display = 'block';
  exportTextarea.value = JSON.stringify(data, null, 2);
  devStatus('Downloaded custom-levels.js. Replace the file in the project folder, then hard-refresh. Editor Save first if you still have unsaved moves.');
});
clearLocalCustomBtn.addEventListener('click', async () => {
  for (const k of CUSTOM_LEVEL_STORAGE_KEYS) {
    try { await window.storage.set(k, ''); } catch (e) { /* skip */ }
    try { localStorage.removeItem(GAME_STORAGE_PREFIX + k); } catch (e) { /* skip */ }
  }
  await applyAllCustomLevelData();
  await loadCustomTerrain();
  devStatus('Cleared local overrides. Using shipped custom-levels.js layouts.');
});
devPanel.appendChild(exportCustomBtn);
devPanel.appendChild(importCustomBtn);
devPanel.appendChild(bakeCustomBtn);
devPanel.appendChild(clearLocalCustomBtn);
devPanel.appendChild(exportTextarea);

const fireballSpeedSlider = document.getElementById('fireball-speed-slider');
const fireballSpeedValue = document.getElementById('fireball-speed-value');
fireballSpeedSlider.addEventListener('input', () => {
  fireballSpeedMult = parseFloat(fireballSpeedSlider.value);
  fireballSpeedValue.textContent = fireballSpeedMult.toFixed(1);
  devStatus('Flame speed set to ' + fireballSpeedMult.toFixed(1) + 'x world scroll.');
});

window.addEventListener('keydown', (e) => {
  const num = parseInt(e.key, 10);
  if (num >= 1 && num <= THEMES.length) {
    devJumpToTheme(num - 1);
  }
});

// ---- Zone 2 hand-drawn cave editor ----
const editorCanvas = document.getElementById('editorCanvas');
const editorCtx = editorCanvas.getContext('2d');
const editorOverlay = document.getElementById('editor-overlay');
const editorToggleBtn = document.getElementById('editor-toggle');
const editorStatus = document.getElementById('editor-status');
const editorToggleCustomBtn = document.getElementById('editor-toggle-custom');

let editorMode = false;
let editorTool = 'top';
let editorPanX = 0;
let editorDrawing = false;
let editorLastLevelX = null;

function resizeEditorCanvas() {
  editorCanvas.width = editorCanvas.clientWidth;
  editorCanvas.height = editorCanvas.clientHeight;
}

function editorPlayTopBottom() {
  // mirrors the real game's proportions, using the editor canvas's own height
  const margin = editorCanvas.height * 0.08;
  return { top: margin, bottom: editorCanvas.height - margin };
}

function openEditor() {
  editorMode = true;
  editorOverlay.classList.add('active');
  resizeEditorCanvas();
  updateEditorToggleCustomLabel();
  requestAnimationFrame(drawEditorLoop);
}

function closeEditor() {
  editorMode = false;
  editorOverlay.classList.remove('active');
}

function updateEditorToggleCustomLabel() {
  editorToggleCustomBtn.textContent = 'Using: ' + (useCustomTerrain ? 'Custom' : 'Procedural');
}

editorToggleBtn.addEventListener('click', openEditor);
document.getElementById('editor-close').addEventListener('click', closeEditor);

document.getElementById('tool-top').addEventListener('click', () => {
  editorTool = 'top';
  document.getElementById('tool-top').classList.add('tool-active');
  document.getElementById('tool-bottom').classList.remove('tool-active');
});
document.getElementById('tool-bottom').addEventListener('click', () => {
  editorTool = 'bottom';
  document.getElementById('tool-bottom').classList.add('tool-active');
  document.getElementById('tool-top').classList.remove('tool-active');
});

document.getElementById('editor-clear').addEventListener('click', () => {
  customTerrainZone2 = defaultCustomTerrain();
  editorStatus.textContent = 'Reset to flat.';
});

document.getElementById('editor-save').addEventListener('click', async () => {
  editorStatus.textContent = 'Saving...';
  const ok = await saveCustomTerrain();
  editorStatus.textContent = ok ? 'Saved!' : 'Save failed (kept in memory only).';
  updateEditorToggleCustomLabel();
});

document.getElementById('editor-toggle-custom').addEventListener('click', () => {
  useCustomTerrain = !useCustomTerrain;
  updateEditorToggleCustomLabel();
  editorStatus.textContent = useCustomTerrain ? 'Custom level active in-game.' : 'Procedural pattern active in-game.';
});

document.getElementById('editor-test').addEventListener('click', () => {
  closeEditor();
  devJumpToTheme(3);
});

function editorScreenToLevel(clientX, clientY) {
  const rect = editorCanvas.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const levelX = ((px + editorPanX) % EDITOR_LEVEL_LENGTH + EDITOR_LEVEL_LENGTH) % EDITOR_LEVEL_LENGTH;
  const { top, bottom } = editorPlayTopBottom();
  const frac = Math.max(0, Math.min(1, (py - top) / (bottom - top)));
  return { levelX, frac };
}

function applyEditorPoint(levelX, frac, fromLevelX) {
  const n = customTerrainZone2.length;
  const idx = Math.round(levelX / EDITOR_SAMPLE_SPACING) % n;

  function setOne(i, f) {
    const point = customTerrainZone2[i];
    if (editorTool === 'top') {
      point.topFrac = Math.min(f, point.bottomFrac - EDITOR_MIN_GAP_FRAC);
      point.topFrac = Math.max(0, point.topFrac);
    } else {
      point.bottomFrac = Math.max(f, point.topFrac + EDITOR_MIN_GAP_FRAC);
      point.bottomFrac = Math.min(1, point.bottomFrac);
    }
  }

  if (fromLevelX === null || fromLevelX === undefined) {
    setOne(idx, frac);
    return;
  }
  // interpolate across fast drags so the stroke has no gaps
  let a = Math.round(fromLevelX / EDITOR_SAMPLE_SPACING);
  let b = idx;
  const steps = Math.min(40, Math.abs(b - a) + 1);
  for (let s = 0; s <= steps; s++) {
    const t = steps === 0 ? 0 : s / steps;
    const i = Math.round((a + (b - a) * t)) % n;
    setOne(((i % n) + n) % n, frac);
  }
}

function editorPointerDown(clientX, clientY) {
  editorDrawing = true;
  const { levelX, frac } = editorScreenToLevel(clientX, clientY);
  applyEditorPoint(levelX, frac, null);
  editorLastLevelX = levelX;
}
function editorPointerMove(clientX, clientY) {
  if (!editorDrawing) return;
  const { levelX, frac } = editorScreenToLevel(clientX, clientY);
  applyEditorPoint(levelX, frac, editorLastLevelX);
  editorLastLevelX = levelX;
}
function editorPointerUp() {
  editorDrawing = false;
  editorLastLevelX = null;
}

editorCanvas.addEventListener('mousedown', (e) => editorPointerDown(e.clientX, e.clientY));
editorCanvas.addEventListener('mousemove', (e) => editorPointerMove(e.clientX, e.clientY));
window.addEventListener('mouseup', editorPointerUp);
editorCanvas.addEventListener('touchstart', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  editorPointerDown(t.clientX, t.clientY);
}, { passive: false });
editorCanvas.addEventListener('touchmove', (e) => {
  e.preventDefault();
  const t = e.touches[0];
  editorPointerMove(t.clientX, t.clientY);
}, { passive: false });
editorCanvas.addEventListener('touchend', editorPointerUp);

editorCanvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  editorPanX = Math.max(0, Math.min(EDITOR_LEVEL_LENGTH - editorCanvas.width, editorPanX + e.deltaY + e.deltaX));
}, { passive: false });

function drawEditor() {
  const w = editorCanvas.width, h = editorCanvas.height;
  editorCtx.clearRect(0, 0, w, h);
  editorCtx.fillStyle = '#000d05';
  editorCtx.fillRect(0, 0, w, h);

  const { top, bottom } = editorPlayTopBottom();

  // vertical rulers every 200 level-space px
  editorCtx.strokeStyle = 'rgba(255,204,51,0.15)';
  editorCtx.fillStyle = 'rgba(255,204,51,0.4)';
  editorCtx.font = '10px Courier New';
  editorCtx.lineWidth = 1;
  const firstMark = Math.floor(editorPanX / 200) * 200;
  for (let lx = firstMark; lx < editorPanX + w + 200; lx += 200) {
    const sx = lx - editorPanX;
    editorCtx.beginPath();
    editorCtx.moveTo(sx, 0);
    editorCtx.lineTo(sx, h);
    editorCtx.stroke();
    editorCtx.fillText(String(Math.round(((lx % EDITOR_LEVEL_LENGTH) + EDITOR_LEVEL_LENGTH) % EDITOR_LEVEL_LENGTH)), sx + 3, 12);
  }

  // loop point marker
  const loopSx = EDITOR_LEVEL_LENGTH - editorPanX;
  if (loopSx > -50 && loopSx < w + 50) {
    editorCtx.strokeStyle = '#ff2079';
    editorCtx.setLineDash([6, 6]);
    editorCtx.beginPath();
    editorCtx.moveTo(loopSx, 0);
    editorCtx.lineTo(loopSx, h);
    editorCtx.stroke();
    editorCtx.setLineDash([]);
    editorCtx.fillStyle = '#ff2079';
    editorCtx.fillText('LOOP END', loopSx + 4, h - 6);
  }

  // draw top/bottom shapes across visible window
  const n = customTerrainZone2.length;
  editorCtx.fillStyle = 'rgba(255,204,51,0.5)';
  editorCtx.beginPath();
  editorCtx.moveTo(0, top - 4);
  for (let sx = 0; sx <= w; sx += 4) {
    const levelX = ((sx + editorPanX) % EDITOR_LEVEL_LENGTH + EDITOR_LEVEL_LENGTH) % EDITOR_LEVEL_LENGTH;
    const s = sampleCustomTerrainAt(levelX);
    editorCtx.lineTo(sx, top + s.topFrac * (bottom - top));
  }
  editorCtx.lineTo(w, top - 4);
  editorCtx.closePath();
  editorCtx.fill();

  editorCtx.fillStyle = 'rgba(255,51,0,0.5)';
  editorCtx.beginPath();
  editorCtx.moveTo(0, bottom + 4);
  for (let sx = 0; sx <= w; sx += 4) {
    const levelX = ((sx + editorPanX) % EDITOR_LEVEL_LENGTH + EDITOR_LEVEL_LENGTH) % EDITOR_LEVEL_LENGTH;
    const s = sampleCustomTerrainAt(levelX);
    editorCtx.lineTo(sx, top + s.bottomFrac * (bottom - top));
  }
  editorCtx.lineTo(w, bottom + 4);
  editorCtx.closePath();
  editorCtx.fill();

  editorCtx.fillStyle = 'rgba(255,255,255,0.5)';
  editorCtx.font = '11px Courier New';
  editorCtx.fillText('TOP WALL', 8, top + 14);
  editorCtx.fillText('BOTTOM WALL', 8, bottom - 6);
}

function sampleCustomTerrainAt(levelX) {
  // like sampleCustomTerrain() but safe to call before a game is active
  const n = customTerrainZone2.length;
  const idxF = (levelX / EDITOR_SAMPLE_SPACING) % (n - 1);
  const i0 = Math.floor(idxF);
  const i1 = (i0 + 1) % n;
  const t = idxF - i0;
  const a = customTerrainZone2[i0], b = customTerrainZone2[i1];
  return {
    topFrac: a.topFrac + (b.topFrac - a.topFrac) * t,
    bottomFrac: a.bottomFrac + (b.bottomFrac - a.bottomFrac) * t
  };
}

function drawEditorLoop() {
  if (!editorMode) return;
  drawEditor();
  requestAnimationFrame(drawEditorLoop);
}

window.addEventListener('resize', () => {
  if (editorMode) resizeEditorCanvas();
});

// ---- Zone preview: simulate a full 1000-distance span for any zone,
// re-using the exact same generation functions as live gameplay, then
// render it all on one wide static map so problem spots can be spotted
// without playing through
const previewCanvas = document.getElementById('previewCanvas');
const previewCtx = previewCanvas.getContext('2d');
const previewOverlay = document.getElementById('preview-overlay');
const previewStatus = document.getElementById('preview-status');

function captureSimState() {
  return {
    gates, patternIndex, lastSpawnX, fireballSpawnCounter,
    terrainSegments, terrainSegmentsSinceEntry, terrainLevelX,
    terrainWaypointTarget, terrainWaypointSegLeft, terrainWaypointGapTarget, terrainWaypointIslandTarget,
    themeIndex, distance, frame, ship: { x: ship.x, y: ship.y, vy: ship.vy, rotation: ship.rotation }
  };
}

function restoreSimState(s) {
  gates = s.gates; patternIndex = s.patternIndex; lastSpawnX = s.lastSpawnX;
  fireballSpawnCounter = s.fireballSpawnCounter;
  terrainSegments = s.terrainSegments; terrainSegmentsSinceEntry = s.terrainSegmentsSinceEntry;
  terrainLevelX = s.terrainLevelX;
  terrainWaypointTarget = s.terrainWaypointTarget; terrainWaypointSegLeft = s.terrainWaypointSegLeft;
  terrainWaypointGapTarget = s.terrainWaypointGapTarget; terrainWaypointIslandTarget = s.terrainWaypointIslandTarget;
  themeIndex = s.themeIndex; distance = s.distance; frame = s.frame;
  ship.x = s.ship.x; ship.y = s.ship.y; ship.vy = s.ship.vy; ship.rotation = s.ship.rotation;
}

function simulateZonePreview(themeIdx, targetDistance) {
  const saved = captureSimState();

  themeIndex = themeIdx;
  distance = 0;
  frame = 0;
  gates = [];
  patternIndex = 0;
  lastSpawnX = 0;
  fireballSpawnCounter = 0;
  terrainSegmentsSinceEntry = 0;
  terrainLevelX = 0;
  terrainWaypointTarget = null;
  terrainWaypointSegLeft = 0;
  ship.x = 0;
  ship.y = (PLAY_TOP + PLAY_BOTTOM) / 2;

  const th = THEMES[themeIdx];
  const targetPx = targetDistance * 10;
  const result = { themeIndex: themeIdx, obstacles: [], terrainSegments: null };

  if (th.obstacleShape === 'terrain') {
    initTerrain();
    let guard = 0;
    while (terrainSegments[terrainSegments.length - 1].x < targetPx && guard < 5000) {
      addTerrainSegment();
      distance = terrainSegments[terrainSegments.length - 1].x / 10;
      guard++;
    }
    result.terrainSegments = terrainSegments.map(s => ({ ...s }));
  } else if (th.obstacleShape === 'fireball') {
    // timer-based spawner, not position-based -- step it like the real update loop
    let x = 0;
    let counter = 0;
    let guard = 0;
    while (x < targetPx && guard < 5000) {
      counter++;
      const interval = Math.max(50, (th.fireballIntervalBase || 100) - distance * 0.01);
      if (counter >= interval) {
        spawnFireball();
        const last = gates[gates.length - 1];
        last.previewX = x;
        counter = 0;
      }
      x += 4;
      distance = x / 10;
      guard++;
    }
    result.obstacles = gates.map(g => ({ ...g, x: g.previewX !== undefined ? g.previewX : g.x }));
  } else if (th.obstacleShape === 'none') {
    // event-based zone -- place each hand-placed event directly at its
    // trigger-distance position rather than stepping through a
    // spacing/timer loop
    const playHeight = PLAY_BOTTOM - PLAY_TOP;
    const margin = 15;
    if (th.blackHoleEvents) for (const [idx, event] of th.blackHoleEvents.entries()) {
      gates.push({
        type: 'blackhole',
        x: event.triggerDistance * 10,
        y: PLAY_TOP + margin + event.yFrac * Math.max(1, playHeight - margin * 2),
        coreR: event.coreR,
        reachR: event.reachR,
        rotSeed: 0,
        passed: false,
        previewX: event.triggerDistance * 10,
        _eventIdx: idx
      });
    }
    if (th.lensingZoneEvents) {
      for (const [idx, event] of th.lensingZoneEvents.entries()) {
        gates.push({
          type: 'lensingzone',
          x: event.triggerDistance * 10,
          y: PLAY_TOP + margin + event.yFrac * Math.max(1, playHeight - margin * 2),
          coreR: event.coreR,
          zoneRadius: event.zoneRadius,
          rotSeed: 0,
          passed: false,
          previewX: event.triggerDistance * 10,
          _lensIdx: idx
        });
      }
    }
    if (th.supernovaEvents) {
      for (const [idx, event] of th.supernovaEvents.entries()) {
        gates.push({
          type: 'supernova',
          x: event.triggerDistance * 10,
          y: PLAY_TOP + margin + event.yFrac * Math.max(1, playHeight - margin * 2),
          planetR: event.planetR,
          dormantFrames: event.dormantFrames,
          warningFrames: event.warningFrames,
          detonated: false,
          rotSeed: 0,
          passed: false,
          previewX: event.triggerDistance * 10,
          _novaIdx: idx
        });
      }
    }
    if (th.turretEvents) {
      for (const [idx, event] of th.turretEvents.entries()) {
        const y = event.anchor === 'top' ? PLAY_TOP + event.mountOffset : PLAY_BOTTOM - event.mountOffset;
        gates.push({
          type: 'turret',
          x: event.triggerDistance * 10,
          y: y,
          anchor: event.anchor,
          fireAngleDeg: event.fireAngleDeg || 0,
          numShots: event.numShots,
          fireInterval: event.fireInterval,
          rotSeed: 0,
          passed: false,
          previewX: event.triggerDistance * 10,
          _turretIdx: idx
        });
      }
    }
    if (th.empEvents) {
      for (const [idx, event] of th.empEvents.entries()) {
        gates.push({
          type: 'emp',
          x: event.triggerDistance * 10,
          anchor: event.anchor,
          reachDepth: event.reachDepth,
          chargeFrames: event.chargeFrames,
          dischargeFrames: event.dischargeFrames,
          spawnFrame: 0,
          rotSeed: 0,
          passed: false,
          previewX: event.triggerDistance * 10,
          _empIdx: idx
        });
      }
    }
    if (th.pulsingOrbEvents) {
      const playHeight2 = PLAY_BOTTOM - PLAY_TOP;
      for (const [idx, event] of th.pulsingOrbEvents.entries()) {
        gates.push({
          type: 'pulsingorb',
          x: event.triggerDistance * 10,
          y: PLAY_TOP + playHeight2 / 2,
          minR: event.minR,
          maxR: event.maxR,
          period: event.period,
          spawnFrame: 0,
          rotSeed: 0,
          passed: false,
          previewX: event.triggerDistance * 10,
          _orbIdx: idx
        });
      }
    }
    result.obstacles = gates.map(g => ({ ...g, x: g.previewX !== undefined ? g.previewX : g.x }));
  } else {
    // real gameplay's initial upfront spawn starts at ship.x + 420, not 0 --
    // matching that offset here (ship.x is 0 in this preview simulation) is
    // what makes bolt positions actually line up with event-based hazards
    // like wind vortex, which are placed directly at triggerDistance*10
    let x = 420;
    let guard = 0;
    while (x < targetPx && guard < 2000) {
      const gateCountBefore = gates.length;
      const gapAtSpawn = !th.obstacleShape ? currentGapSize() : null;
      const entryIdxUsed = patternIndex % th.pattern.length;
      const spacing = spawnGate(x);
      for (let i = gateCountBefore; i < gates.length; i++) {
        gates[i].previewGap = gapAtSpawn;
        gates[i]._entryIdx = entryIdxUsed;
        gates[i]._boltIdx = i - gateCountBefore;
      }
      x += spacing || 300;
      distance = x / 10;
      guard++;
    }
    result.obstacles = gates.map(g => ({ ...g }));
  }

  // secondary layer, independent of obstacleShape: wind vortex events run
  // alongside whatever primary hazard the zone uses (matches how the real
  // gameplay trigger check works -- it's never gated on obstacleShape)
  if (th.windVortexEvents) {
    const playHeightV = PLAY_BOTTOM - PLAY_TOP;
    const marginV = 15;
    th.windVortexEvents.forEach((event, idx) => {
      result.obstacles.push({
        type: 'windvortex',
        x: event.triggerDistance * 10,
        y: PLAY_TOP + marginV + event.yFrac * Math.max(1, playHeightV - marginV * 2),
        reachR: event.reachR,
        rotSeed: idx * 5.1,
        passed: false,
        previewX: event.triggerDistance * 10,
        _vortexIdx: idx
      });
    });
  }

  restoreSimState(saved);
  return result;
}

// Runs the REAL game engine -- reseedZoneObstacles() then the actual
// per-frame update() loop -- to capture the exact obstacle set a real
// playthrough would produce, rather than a second, separate approximation
// of the spawn logic that can quietly drift out of sync with it. Ghost
// mode plus an extended grace period keep the ship completely safe
// throughout (frozen in place, no collisions, no forces) so nothing here
// can end the run early; nothing about this affects the real game, since
// all touched state is restored before returning.
function captureFullZoneRun(themeIdx, targetDistance) {
  const saved = captureSimState();
  const savedGhost = ghostMode;
  const savedGrace = devGracePeriodEndFrame;
  const savedState = state;
  const savedZoneStartDistance = zoneStartDistance;
  const savedZoneStartFrame = zoneStartFrame;
  const savedWarpActive = warpActive;
  const savedPortalObject = portalObject;
  const savedEventFlags = {
    specialEventsSpawned, blackHoleEventsSpawned, windVortexEventsSpawned, cloudArcEventsSpawned, lasergridEventsSpawned,
    droneSwarmEventsSpawned, billboardEventsSpawned, searchlightEventsSpawned,
    turretEventsSpawned, signalCorruptionEventsSpawned, empEventsSpawned,
    echoTrailEventsSpawned, pulsingOrbEventsSpawned, boomerangEventsSpawned,
    lensingZoneEventsSpawned, supernovaEventsSpawned,
  };
  // the update() loop this capture drives processes mini boss fight logic
  // exactly like real gameplay -- without saving/restoring it, previewing
  // this zone in the editor could advance or even complete the fight
  // internally, leaking that progress into the player's actual game
  const savedMiniBossState = {
    miniBoss, miniBossCyclesCompleted, miniBossSpawnFrame, miniBossDefeated, miniBossDefeatFrame,
    miniBossAttackState, miniBossAttackStateStartFrame, miniBossChargeHeights, miniBossChargeIndex,
    miniBossChargeRound, miniBossFlameWallDriftDir, miniBossBarrageEmbers, miniBossBarrageWavesLaunched,
    miniBossSqueezeTopY, miniBossSqueezeBottomY, miniBossBarragePhaseStartFrame, miniBossDeathPatches,
    miniBossDeathAshParticles, miniBossEscapeRunActive, miniBossEscapeRunStartDistance, miniBossHadFirstFloat,
    miniBossNextAttackSet, miniBossFloatBlendStartX, miniBossFloatBlendStartY, miniBossFloatBlendStartFrame,
    miniBossWallRecedeStartFrame, miniBossWallCracks, coreWallPanels, coreWallSensors,
  };

  themeIndex = themeIdx;
  distance = 0; frame = 0; zoneStartDistance = 0; zoneStartFrame = 0;
  warpActive = false; portalObject = null; state = 'playing';
  ship.x = 0; ship.y = (PLAY_TOP + PLAY_BOTTOM) / 2; ship.vy = 0; ship.rotation = 0;
  ghostMode = true;
  const savedThemeLevelReached = themeLevelReached;
  // the real update loop auto-triggers a zone transition once distance
  // crosses a THEME_DISTANCE boundary relative to themeLevelReached -- since
  // this capture run's own distance climbs from 0 up toward targetDistance
  // (often exactly one THEME_DISTANCE), that real transition could fire
  // mid-capture and reset zoneStartDistance out from under the position math.
  // pinning themeLevelReached far ahead keeps the check from ever tripping
  themeLevelReached = 999999;

  const th = THEMES[themeIdx];
  const result = { themeIndex: themeIdx, obstacles: [], terrainSegments: null };

  // maps each single-spawn event array to its spawned-flag array, the gate
  // type it produces, and the tag field the editor's selection/drag code
  // expects on each captured gate
  const EVENT_TYPE_MAP = [
    { flagsGetter: () => blackHoleEventsSpawned, gateType: 'blackhole', tag: '_eventIdx' },
    { flagsGetter: () => windVortexEventsSpawned, gateType: 'windvortex', tag: '_vortexIdx' },
    { flagsGetter: () => cloudArcEventsSpawned, gateType: 'cloudarc', tag: '_arcIdx' },
    { flagsGetter: () => lensingZoneEventsSpawned, gateType: 'lensingzone', tag: '_lensIdx' },
    { flagsGetter: () => supernovaEventsSpawned, gateType: 'supernova', tag: '_novaIdx' },
    { flagsGetter: () => turretEventsSpawned, gateType: 'turret', tag: '_turretIdx' },
    { flagsGetter: () => empEventsSpawned, gateType: 'emp', tag: '_empIdx' },
    { flagsGetter: () => pulsingOrbEventsSpawned, gateType: 'pulsingorb', tag: '_orbIdx' },
  ];
  const snapshotEventFlags = () => EVENT_TYPE_MAP.map(m => (m.flagsGetter() || []).slice());

  if (th.obstacleShape === 'terrain') {
    // terrain uses its own terrainSegments data structure, not gates, and
    // isn't part of the position-mismatch issue this addresses -- keep the
    // existing lightweight step-through for it
    initTerrain();
    let guard = 0;
    while (terrainSegments[terrainSegments.length - 1].x < targetDistance * 10 && guard < 5000) {
      addTerrainSegment();
      distance = terrainSegments[terrainSegments.length - 1].x / 10;
      guard++;
    }
    result.terrainSegments = terrainSegments.map(s => ({ ...s }));
  } else {
    devGracePeriodEndFrame = 999999999; // keep the ship's vertical physics frozen for the entire capture run
    patternIndex = 0;
    reseedZoneObstacles(ship.x + 420); // the exact same entry point a real zone transition uses

    const capturedIds = new Set();
    const capturedGates = [];
    // computes each bolt's position directly from the pattern data and a
    // known base spawn x, rather than searching the live `gates` array for
    // it. A bolt with an extreme xJitter can scroll far enough off-screen
    // to trigger the game's own despawn check within the very same frame
    // it spawns in -- searching gates after the fact would silently miss
    // it, and every later cycle-repetition of that same bolt along with
    // it, making the preview quietly incomplete until something else
    // (like an unrelated edit) happened to correct that bolt's position
    // and "reveal" the previously-invisible instances.
    const captureBoltsForEntry = (entryIdx, baseX, zp) => {
      const entry = th.pattern[entryIdx];
      if (!entry || !entry.bolts) return;
      entry.bolts.forEach((b, bi) => {
        const gx = baseX + b.xJitter;
        const effectiveZoneProgress = zp + (gx - ship.x) / 10;
        const playHeight = PLAY_BOTTOM - PLAY_TOP;
        const margin = 28;
        const heightPx = b.heightFrac * playHeight;
        const cycleLength = b.onFrames + b.offFrames;
        capturedGates.push({
          type: 'lbolt',
          x: effectiveZoneProgress * 10,
          y: PLAY_TOP + margin + b.yFrac * Math.max(1, playHeight - margin * 2),
          height: heightPx,
          swingWidth: b.swingWidthPx,
          shape: BOLT_SHAPES[b.shape],
          onFrames: b.onFrames,
          offFrames: b.offFrames,
          cycleLength: cycleLength,
          phaseOffset: Math.round(b.phaseFrac * cycleLength),
          passed: false,
          _entryIdx: entryIdx, _boltIdx: bi
        });
      });
    };
    const captureInitialPatternGates = (startX, toEntryRaw, zp) => {
      let x = startX;
      for (let ei = 0; ei < toEntryRaw; ei++) {
        const entryIdx = ((ei % th.pattern.length) + th.pattern.length) % th.pattern.length;
        if (ei > 0) x += th.pattern[entryIdx].spacing || GATE_SPACING;
        captureBoltsForEntry(entryIdx, x, zp);
      }
    };
    // captures any newly-appeared non-lbolt gate, tagging single-spawn event
    // types using which specific flag index flipped true since flagsBefore
    const captureOtherNewGates = (zp, flagsBefore) => {
      const flagsAfter = snapshotEventFlags();
      for (const g of gates) {
        if (g.type === 'lbolt' || capturedIds.has(g)) continue;
        capturedIds.add(g);
        const effectiveZoneProgress = zp + (g.x - ship.x) / 10;
        const captured = { ...g, x: effectiveZoneProgress * 10 };
        if (g.x2 !== undefined) captured.x2 = g.x2 + (captured.x - g.x); // keep x2 consistent with the same shift applied to x
        EVENT_TYPE_MAP.forEach((m, mi) => {
          if (g.type !== m.gateType) return;
          const before = flagsBefore[mi] || [];
          const after = flagsAfter[mi] || [];
          for (let i = 0; i < after.length; i++) {
            if (after[i] && !before[i]) { captured[m.tag] = i; break; }
          }
        });
        capturedGates.push(captured);
      }
    };

    let prevPatternIndex = patternIndex; // after reseedZoneObstacles's initial 6-gate spawn
    if (th.obstacleShape === 'lbolt') captureInitialPatternGates(ship.x + 420, prevPatternIndex, distance - zoneStartDistance);
    captureOtherNewGates(distance - zoneStartDistance, EVENT_TYPE_MAP.map(() => []));

    let guard = 0;
    while ((distance - zoneStartDistance) < targetDistance && guard < 20000) {
      const flagsBefore = snapshotEventFlags();
      // belt-and-suspenders: pin the ship to a safe, centered position every
      // frame, not just at setup. ghost mode and the extended grace period
      // cover the normal death paths, but at least one Neon City mechanic
      // was found to end the run anyway -- forcing position each frame
      // guarantees nothing can push the ship into a boundary during capture
      ship.y = (PLAY_TOP + PLAY_BOTTOM) / 2;
      ship.vy = 0;
      update();
      if (state !== 'playing') state = 'playing'; // backstop in case something still ends the run
      const zp = distance - zoneStartDistance;
      if (th.obstacleShape === 'lbolt' && patternIndex > prevPatternIndex) {
        // only one new entry can spawn per frame in the ongoing loop, so
        // lastSpawnX (updated synchronously the instant it spawns) is
        // exactly that entry's base position, regardless of whether the
        // resulting gate object has already despawned by now
        const entryIdx = ((patternIndex - 1) % th.pattern.length + th.pattern.length) % th.pattern.length;
        captureBoltsForEntry(entryIdx, lastSpawnX, zp);
        prevPatternIndex = patternIndex;
      }
      captureOtherNewGates(zp, flagsBefore);
      guard++;
    }
    result.obstacles = capturedGates;
  }

  ghostMode = savedGhost;
  themeLevelReached = savedThemeLevelReached;
  devGracePeriodEndFrame = savedGrace;
  state = savedState;
  zoneStartDistance = savedZoneStartDistance;
  zoneStartFrame = savedZoneStartFrame;
  warpActive = savedWarpActive;
  portalObject = savedPortalObject;
  blackHoleEventsSpawned = savedEventFlags.blackHoleEventsSpawned;
  specialEventsSpawned = savedEventFlags.specialEventsSpawned;
  windVortexEventsSpawned = savedEventFlags.windVortexEventsSpawned;
  cloudArcEventsSpawned = savedEventFlags.cloudArcEventsSpawned;
  lasergridEventsSpawned = savedEventFlags.lasergridEventsSpawned;
  droneSwarmEventsSpawned = savedEventFlags.droneSwarmEventsSpawned;
  billboardEventsSpawned = savedEventFlags.billboardEventsSpawned;
  searchlightEventsSpawned = savedEventFlags.searchlightEventsSpawned;
  turretEventsSpawned = savedEventFlags.turretEventsSpawned;
  signalCorruptionEventsSpawned = savedEventFlags.signalCorruptionEventsSpawned;
  empEventsSpawned = savedEventFlags.empEventsSpawned;
  echoTrailEventsSpawned = savedEventFlags.echoTrailEventsSpawned;
  pulsingOrbEventsSpawned = savedEventFlags.pulsingOrbEventsSpawned;
  boomerangEventsSpawned = savedEventFlags.boomerangEventsSpawned;
  lensingZoneEventsSpawned = savedEventFlags.lensingZoneEventsSpawned;
  supernovaEventsSpawned = savedEventFlags.supernovaEventsSpawned;
  miniBoss = savedMiniBossState.miniBoss;
  miniBossCyclesCompleted = savedMiniBossState.miniBossCyclesCompleted;
  miniBossSpawnFrame = savedMiniBossState.miniBossSpawnFrame;
  miniBossDefeated = savedMiniBossState.miniBossDefeated;
  miniBossDefeatFrame = savedMiniBossState.miniBossDefeatFrame;
  miniBossAttackState = savedMiniBossState.miniBossAttackState;
  miniBossAttackStateStartFrame = savedMiniBossState.miniBossAttackStateStartFrame;
  miniBossChargeHeights = savedMiniBossState.miniBossChargeHeights;
  miniBossChargeIndex = savedMiniBossState.miniBossChargeIndex;
  miniBossChargeRound = savedMiniBossState.miniBossChargeRound;
  miniBossFlameWallDriftDir = savedMiniBossState.miniBossFlameWallDriftDir;
  miniBossBarrageEmbers = savedMiniBossState.miniBossBarrageEmbers;
  miniBossBarrageWavesLaunched = savedMiniBossState.miniBossBarrageWavesLaunched;
  miniBossSqueezeTopY = savedMiniBossState.miniBossSqueezeTopY;
  miniBossSqueezeBottomY = savedMiniBossState.miniBossSqueezeBottomY;
  miniBossBarragePhaseStartFrame = savedMiniBossState.miniBossBarragePhaseStartFrame;
  miniBossDeathPatches = savedMiniBossState.miniBossDeathPatches;
  miniBossDeathAshParticles = savedMiniBossState.miniBossDeathAshParticles;
  miniBossEscapeRunActive = savedMiniBossState.miniBossEscapeRunActive;
  miniBossEscapeRunStartDistance = savedMiniBossState.miniBossEscapeRunStartDistance;
  miniBossHadFirstFloat = savedMiniBossState.miniBossHadFirstFloat;
  miniBossNextAttackSet = savedMiniBossState.miniBossNextAttackSet;
  miniBossFloatBlendStartX = savedMiniBossState.miniBossFloatBlendStartX;
  miniBossFloatBlendStartY = savedMiniBossState.miniBossFloatBlendStartY;
  miniBossFloatBlendStartFrame = savedMiniBossState.miniBossFloatBlendStartFrame;
  miniBossWallRecedeStartFrame = savedMiniBossState.miniBossWallRecedeStartFrame;
  miniBossWallCracks = savedMiniBossState.miniBossWallCracks;
  coreWallPanels = savedMiniBossState.coreWallPanels;
  coreWallSensors = savedMiniBossState.coreWallSensors;
  restoreSimState(saved);

  return result;
}

function resizePreviewCanvas(worldWidthPx) {
  const wrap = document.getElementById('preview-canvas-wrap');
  const savedScroll = wrap ? wrap.scrollLeft : null;
  previewCanvas.width = Math.max(previewCanvas.parentElement.clientWidth, worldWidthPx * previewScale + 100);
  previewCanvas.height = previewCanvas.parentElement.clientHeight || 500;
  // setting canvas width/height can cause the browser to reset or clamp
  // the scrollable wrapper's scroll position, even when the resulting
  // canvas size is unchanged -- restore it so a re-render triggered from
  // somewhere the user didn't directly interact with (like an auto-fix
  // during save) never silently yanks their view away from what they were
  // actually looking at
  if (wrap && savedScroll !== null) wrap.scrollLeft = savedScroll;
  return previewScale;
}

function drawZonePreview(data) {
  const th = THEMES[data.themeIndex];
  const targetPx = 10000;
  const scale = resizePreviewCanvas(targetPx);
  const w = previewCanvas.width, h = previewCanvas.height;
  const topMargin = 30, botMargin = 30;
  const pTop = topMargin, pBot = h - botMargin;
  const pHeight = pBot - pTop;

  previewCtx.fillStyle = th.skyMid || '#111';
  previewCtx.fillRect(0, 0, w, h);
  previewCtx.strokeStyle = 'rgba(255,255,255,0.15)';
  previewCtx.lineWidth = 1;
  previewCtx.strokeRect(0, pTop, w, pHeight);

  previewCtx.fillStyle = 'rgba(255,255,255,0.4)';
  previewCtx.font = '10px Courier New';
  for (let d = 0; d <= 1000; d += 100) {
    const sx = d * 10 * scale;
    previewCtx.beginPath();
    previewCtx.moveTo(sx, pTop);
    previewCtx.lineTo(sx, pBot);
    previewCtx.strokeStyle = d % 500 === 0 ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.08)';
    previewCtx.stroke();
    previewCtx.fillText(String(d), sx + 3, pTop - 8);
  }

  const yToScreen = (y) => pTop + ((y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * pHeight;

  if (data.terrainSegments) {
    previewCtx.fillStyle = 'rgba(255,204,51,0.55)';
    previewCtx.beginPath();
    data.terrainSegments.forEach((s, i) => {
      const sx = s.x * scale;
      const sy = yToScreen(s.topY);
      if (i === 0) previewCtx.moveTo(sx, pTop); else previewCtx.lineTo(sx, sy);
    });
    for (let i = data.terrainSegments.length - 1; i >= 0; i--) {
      previewCtx.lineTo(data.terrainSegments[i].x * scale, pTop);
    }
    previewCtx.closePath();
    previewCtx.fill();

    previewCtx.beginPath();
    data.terrainSegments.forEach((s, i) => {
      const sx = s.x * scale;
      const sy = yToScreen(s.bottomY);
      if (i === 0) previewCtx.moveTo(sx, sy); else previewCtx.lineTo(sx, sy);
    });
    for (let i = data.terrainSegments.length - 1; i >= 0; i--) {
      previewCtx.lineTo(data.terrainSegments[i].x * scale, pBot);
    }
    previewCtx.closePath();
    previewCtx.fill();

    previewCtx.fillStyle = 'rgba(255,150,50,0.6)';
    data.terrainSegments.forEach((s) => {
      if (s.islandBottom - s.islandTop > 2) {
        const sx = s.x * scale;
        previewCtx.fillRect(sx, yToScreen(s.islandTop), 3, yToScreen(s.islandBottom) - yToScreen(s.islandTop));
      }
    });
  }

  // windvortex is a background force-field visual, not a foreground hazard --
  // draw it first (behind) regardless of where it falls in the underlying
  // obstacles array, so its semi-transparent overlay never washes out a
  // bolt or other hazard that happens to sit on top of it
  const sortedObstacles = [...data.obstacles].sort((a, b) => (a.type === 'windvortex' ? -1 : 0) - (b.type === 'windvortex' ? -1 : 0));
  for (const g of sortedObstacles) {
    const sx = g.x * scale;
    if (g.type === 'gate') {
      const gap = g.previewGap || 150;
      const topSafe = g.baseCenter - g.amplitude - gap / 2;
      const botSafe = g.baseCenter + g.amplitude + gap / 2;
      previewCtx.fillStyle = 'rgba(15,240,252,0.4)';
      previewCtx.fillRect(sx - 3, pTop, 6, yToScreen(topSafe) - pTop);
      previewCtx.fillRect(sx - 3, yToScreen(botSafe), 6, pBot - yToScreen(botSafe));
      previewCtx.fillStyle = 'rgba(15,240,252,0.15)';
      previewCtx.fillRect(sx - 3, yToScreen(topSafe), 6, yToScreen(botSafe) - yToScreen(topSafe));
    } else if (g.type === 'hbar') {
      const top = g.baseCenter - g.amplitude - g.thickness / 2;
      const bot = g.baseCenter + g.amplitude + g.thickness / 2;
      previewCtx.fillStyle = 'rgba(0,255,157,0.35)';
      previewCtx.fillRect(sx - g.width * scale / 2, yToScreen(top), Math.max(3, g.width * scale), yToScreen(bot) - yToScreen(top));
    } else if (g.type === 'asteroid') {
      previewCtx.fillStyle = 'rgba(200,150,100,0.6)';
      previewCtx.beginPath();
      previewCtx.arc(sx, yToScreen(g.y), Math.max(2, g.r * scale), 0, Math.PI * 2);
      previewCtx.fill();
    } else if (g.type === 'fireball') {
      previewCtx.fillStyle = 'rgba(255,120,50,0.5)';
      previewCtx.beginPath();
      previewCtx.arc(sx, yToScreen(g.startY), Math.max(2, g.r * scale), 0, Math.PI * 2);
      previewCtx.fill();
    } else if (g.type === 'barrier') {
      const gTop = g.gapCenter - g.gapHeight / 2;
      const gBot = g.gapCenter + g.gapHeight / 2;
      previewCtx.fillStyle = 'rgba(255,245,157,0.4)';
      previewCtx.fillRect(sx - 3, pTop, 6, yToScreen(gTop) - pTop);
      previewCtx.fillRect(sx - 3, yToScreen(gBot), 6, pBot - yToScreen(gBot));
    } else if (g.type === 'lbolt') {
      // _entryIdx/_boltIdx identify which pattern entry this bolt came from,
      // but that entry repeats every pattern cycle across the full preview
      // length -- matching on those alone would highlight every repeated
      // occurrence at once. g.x is unique per instance, so include it to
      // select only the one actually clicked.
      const isSelected = previewSelectedBolt && g._entryIdx === previewSelectedBolt._entryIdx && g._boltIdx === previewSelectedBolt._boltIdx && g.x === previewSelectedBolt.x;
      const top = g.y - g.height / 2;
      const bx = sx - Math.max(2, g.swingWidth * scale / 2);
      const bw = Math.max(4, g.swingWidth * scale);
      const by = yToScreen(top);
      const bh = (g.height / (PLAY_BOTTOM - PLAY_TOP)) * pHeight;

      // real gameplay renders an active bolt with a 16px glow (shadowBlur)
      // around its silhouette -- without matching that here, a small bolt
      // reads as much smaller in the editor than it will actually look once
      // lit up and glowing in the real game
      previewCtx.save();
      previewCtx.shadowColor = th.accentA || '#fff59d';
      previewCtx.shadowBlur = 16 * scale;

      // g.shape is already the resolved polygon (array of [nx,ny] points) --
      // draw the real silhouette so shape edits are actually visible here.
      // use the same bright white-to-accent gradient as real gameplay's
      // active-bolt render (not a flat fill) so it stays clearly visible
      // even with other elements like a vortex's overlay nearby
      if (isSelected) {
        previewCtx.fillStyle = 'rgba(255,80,220,0.8)';
      } else {
        const boltGrad = previewCtx.createLinearGradient(sx, by, sx, by + bh);
        boltGrad.addColorStop(0, '#ffffff');
        boltGrad.addColorStop(0.5, th.accentA || '#fff59d');
        boltGrad.addColorStop(1, th.accentB || '#5c6bc0');
        previewCtx.fillStyle = boltGrad;
      }
      previewCtx.beginPath();
      g.shape.forEach(([nx, ny], i) => {
        const px = sx + nx * (g.swingWidth * scale) / 2;
        const py = yToScreen(top + ny * g.height);
        if (i === 0) previewCtx.moveTo(px, py); else previewCtx.lineTo(px, py);
      });
      previewCtx.closePath();
      previewCtx.fill();
      previewCtx.restore();

      if (isSelected) {
        previewCtx.strokeStyle = '#ff50dc';
        previewCtx.lineWidth = 2;
        previewCtx.strokeRect(bx, by, bw, bh);
        // resize handle
        previewCtx.fillStyle = '#ff50dc';
        previewCtx.fillRect(bx + bw - 6, by + bh - 6, 10, 10);
      }
    } else if (g.type === 'blackhole') {
      const isSelected = previewSelectedBlackHole && g._eventIdx === previewSelectedBlackHole._eventIdx;
      const cy = yToScreen(g.y);
      // use the vertical scale for both axes so these render as true
      // circles -- the horizontal distance-compression scale is far too
      // aggressive (flattens the whole 10000px zone into a small canvas)
      // and would make a huge black hole look like a thin vertical sliver
      const vScale = pHeight / (PLAY_BOTTOM - PLAY_TOP);
      const rReach = g.reachR * vScale;
      const rCore = g.coreR * vScale;

      previewCtx.fillStyle = isSelected ? 'rgba(255,80,220,0.22)' : 'rgba(138,92,245,0.18)';
      previewCtx.beginPath();
      previewCtx.arc(sx, cy, rReach, 0, Math.PI * 2);
      previewCtx.fill();
      previewCtx.strokeStyle = isSelected ? '#ff50dc' : 'rgba(138,92,245,0.5)';
      previewCtx.lineWidth = isSelected ? 2 : 1;
      previewCtx.stroke();

      previewCtx.fillStyle = isSelected ? 'rgba(255,80,220,0.65)' : 'rgba(10,5,15,0.9)';
      previewCtx.beginPath();
      previewCtx.arc(sx, cy, rCore, 0, Math.PI * 2);
      previewCtx.fill();
      previewCtx.strokeStyle = '#8a5cf5';
      previewCtx.lineWidth = 1.5;
      previewCtx.stroke();

      if (isSelected) {
        previewCtx.fillStyle = '#ff50dc';
        previewCtx.fillRect(sx + rCore - 5, cy - 5, 10, 10);
        previewCtx.fillStyle = '#c9a0ff';
        previewCtx.fillRect(sx + rReach - 5, cy - 5, 10, 10);
      }
    } else if (g.type === 'windvortex') {
      const isSelected = previewSelectedWindVortex && g._vortexIdx === previewSelectedWindVortex._vortexIdx;
      const cy = yToScreen(g.y);
      const vScale = pHeight / (PLAY_BOTTOM - PLAY_TOP);
      const rReach = g.reachR * vScale;

      previewCtx.fillStyle = isSelected ? 'rgba(255,80,220,0.22)' : 'rgba(92,107,192,0.18)';
      previewCtx.beginPath();
      previewCtx.arc(sx, cy, rReach, 0, Math.PI * 2);
      previewCtx.fill();
      previewCtx.strokeStyle = isSelected ? '#ff50dc' : 'rgba(255,245,157,0.5)';
      previewCtx.lineWidth = isSelected ? 2 : 1;
      previewCtx.setLineDash(isSelected ? [] : [4, 4]);
      previewCtx.stroke();
      previewCtx.setLineDash([]);

      // small spiral hint at center so it reads as "swirling" rather than a plain circle
      previewCtx.strokeStyle = '#fff59d';
      previewCtx.lineWidth = 1.5;
      previewCtx.beginPath();
      for (let s = 0; s <= 16; s++) {
        const tt = s / 16;
        const ang = tt * Math.PI * 3;
        const r = tt * Math.min(rReach * 0.5, 14);
        const px = sx + Math.cos(ang) * r, py = cy + Math.sin(ang) * r;
        if (s === 0) previewCtx.moveTo(px, py); else previewCtx.lineTo(px, py);
      }
      previewCtx.stroke();

      if (isSelected) {
        previewCtx.fillStyle = '#c9a0ff';
        previewCtx.fillRect(sx + rReach - 5, cy - 5, 10, 10);
      }
    } else if (g.type === 'cloudarc') {
      const isSelected = previewSelectedCloudArc && g._arcIdx === previewSelectedCloudArc._arcIdx;
      const cy1 = yToScreen(g.y);
      const cy2 = yToScreen(g.y2);
      const sx2 = g.x2 * scale;

      previewCtx.strokeStyle = isSelected ? '#ff50dc' : 'rgba(255,245,157,0.55)';
      previewCtx.lineWidth = isSelected ? 2.5 : 1.5;
      previewCtx.setLineDash(isSelected ? [] : [5, 5]);
      previewCtx.beginPath();
      previewCtx.moveTo(sx, cy1);
      previewCtx.lineTo(sx2, cy2);
      previewCtx.stroke();
      previewCtx.setLineDash([]);

      previewCtx.fillStyle = isSelected ? 'rgba(255,80,220,0.5)' : 'rgba(146,161,209,0.5)';
      previewCtx.beginPath();
      previewCtx.arc(sx, cy1, 8, 0, Math.PI * 2);
      previewCtx.fill();
      previewCtx.beginPath();
      previewCtx.arc(sx2, cy2, 8, 0, Math.PI * 2);
      previewCtx.fill();

      if (isSelected) {
        previewCtx.fillStyle = '#c9a0ff';
        previewCtx.fillRect(sx2 - 5, cy2 - 5, 10, 10);
      }
    } else if (g.type === 'lensingzone') {
      const isSelected = previewSelectedLensingZone && g._lensIdx === previewSelectedLensingZone._lensIdx;
      const cy = yToScreen(g.y);
      const vScale = pHeight / (PLAY_BOTTOM - PLAY_TOP);
      const rZone = g.zoneRadius * vScale;
      const rCore = g.coreR * vScale;

      previewCtx.fillStyle = isSelected ? 'rgba(255,80,220,0.22)' : 'rgba(94,200,232,0.16)';
      previewCtx.beginPath();
      previewCtx.arc(sx, cy, rZone, 0, Math.PI * 2);
      previewCtx.fill();
      previewCtx.strokeStyle = isSelected ? '#ff50dc' : 'rgba(94,200,232,0.5)';
      previewCtx.lineWidth = isSelected ? 2 : 1;
      previewCtx.stroke();

      previewCtx.fillStyle = isSelected ? 'rgba(255,80,220,0.7)' : '#5ec8e8';
      previewCtx.beginPath();
      previewCtx.arc(sx, cy, rCore, 0, Math.PI * 2);
      previewCtx.fill();

      if (isSelected) {
        previewCtx.fillStyle = '#ff50dc';
        previewCtx.fillRect(sx + rCore - 5, cy - 5, 10, 10);
        previewCtx.fillStyle = '#9de3f5';
        previewCtx.fillRect(sx + rZone - 5, cy - 5, 10, 10);
      }
    } else if (g.type === 'supernova') {
      const isSelected = previewSelectedSupernova && g._novaIdx === previewSelectedSupernova._novaIdx;
      const cy = yToScreen(g.y);
      const vScale = pHeight / (PLAY_BOTTOM - PLAY_TOP);
      const rPlanet = g.planetR * vScale;

      previewCtx.fillStyle = isSelected ? 'rgba(255,80,220,0.7)' : '#c9683a';
      previewCtx.beginPath();
      previewCtx.arc(sx, cy, rPlanet, 0, Math.PI * 2);
      previewCtx.fill();
      previewCtx.strokeStyle = isSelected ? '#ff50dc' : '#e8a84a';
      previewCtx.lineWidth = isSelected ? 2 : 1.5;
      previewCtx.stroke();

      if (isSelected) {
        previewCtx.fillStyle = '#ff50dc';
        previewCtx.fillRect(sx + rPlanet - 5, cy - 5, 10, 10);
      }
    } else if (g.type === 'turret') {
      const isSelected = previewSelectedTurret && g._turretIdx === previewSelectedTurret._turretIdx;
      const cy = yToScreen(g.y);

      previewCtx.fillStyle = isSelected ? 'rgba(255,80,220,0.8)' : '#c98aff';
      previewCtx.beginPath();
      previewCtx.arc(sx, cy, 9, 0, Math.PI * 2);
      previewCtx.fill();
      previewCtx.strokeStyle = isSelected ? '#ff50dc' : '#8a5cf5';
      previewCtx.lineWidth = isSelected ? 2 : 1.5;
      previewCtx.stroke();

      // barrel line showing the current firing angle
      const angleRad = g.fireAngleDeg * Math.PI / 180;
      const barrelLen = 26;
      previewCtx.strokeStyle = isSelected ? '#ff50dc' : '#c98aff';
      previewCtx.lineWidth = 3;
      previewCtx.beginPath();
      previewCtx.moveTo(sx, cy);
      previewCtx.lineTo(sx - barrelLen * Math.cos(angleRad), cy + barrelLen * Math.sin(angleRad));
      previewCtx.stroke();

      if (isSelected) {
        previewCtx.fillStyle = '#ff50dc';
        previewCtx.fillRect(sx + 9 - 5, cy - 5, 10, 10);
      }
    } else if (g.type === 'emp') {
      const isSelected = previewSelectedEmp && g._empIdx === previewSelectedEmp._empIdx;
      const anchorCy = yToScreen(g.anchor === 'top' ? PLAY_TOP : PLAY_BOTTOM);
      const reachVScale = pHeight / (PLAY_BOTTOM - PLAY_TOP);
      const reachCy = yToScreen(g.anchor === 'top' ? PLAY_TOP + g.reachDepth : PLAY_BOTTOM - g.reachDepth);

      // reach indicator line
      previewCtx.strokeStyle = isSelected ? 'rgba(255,80,220,0.6)' : 'rgba(200,138,255,0.4)';
      previewCtx.lineWidth = 4;
      previewCtx.beginPath();
      previewCtx.moveTo(sx, anchorCy);
      previewCtx.lineTo(sx, reachCy);
      previewCtx.stroke();

      previewCtx.fillStyle = isSelected ? 'rgba(255,80,220,0.8)' : '#c98aff';
      previewCtx.beginPath();
      previewCtx.arc(sx, anchorCy, 8, 0, Math.PI * 2);
      previewCtx.fill();
      previewCtx.strokeStyle = isSelected ? '#ff50dc' : '#8a5cf5';
      previewCtx.lineWidth = isSelected ? 2 : 1.5;
      previewCtx.stroke();

      if (isSelected) {
        previewCtx.fillStyle = '#ff50dc';
        previewCtx.fillRect(sx + 8 - 5, anchorCy - 5, 10, 10);
      }
    } else if (g.type === 'pulsingorb') {
      const isSelected = previewSelectedOrb && g._orbIdx === previewSelectedOrb._orbIdx;
      const cy = yToScreen(g.y);
      const vScale = pHeight / (PLAY_BOTTOM - PLAY_TOP);
      const midR = (g.minR + g.maxR) / 2 * vScale;
      const maxRPreview = g.maxR * vScale;

      // faint ring showing the maximum extent
      previewCtx.strokeStyle = 'rgba(200,138,255,0.25)';
      previewCtx.lineWidth = 1;
      previewCtx.beginPath();
      previewCtx.arc(sx, cy, maxRPreview, 0, Math.PI * 2);
      previewCtx.stroke();

      previewCtx.fillStyle = isSelected ? 'rgba(255,80,220,0.5)' : 'rgba(200,138,255,0.5)';
      previewCtx.beginPath();
      previewCtx.arc(sx, cy, midR, 0, Math.PI * 2);
      previewCtx.fill();
      previewCtx.strokeStyle = isSelected ? '#ff50dc' : '#8a5cf5';
      previewCtx.lineWidth = isSelected ? 2 : 1.5;
      previewCtx.stroke();

      if (isSelected) {
        previewCtx.fillStyle = '#ff50dc';
        previewCtx.fillRect(sx + midR - 5, cy - 5, 10, 10);
      }
    }
  }
}

let currentPreviewZone = 0;
let previewMoveThrottleTs = 0;
const PREVIEW_MOVE_THROTTLE_MS = 120; // roughly matches captureFullZoneRun's worst-case cost, so throttled calls don't queue up faster than they can complete
let previewEditMode = false;
let previewLastData = null;
let previewScale = 0.75;
let previewSelectedBolt = null;
let previewSelectedBlackHole = null;
let previewSelectedWindVortex = null;
let previewSelectedCloudArc = null;
let previewSelectedLensingZone = null;
let previewSelectedSupernova = null;
let previewSelectedTurret = null;
let previewSelectedEmp = null;
let previewSelectedOrb = null;
let previewDragMode = null;
let previewDragStart = null;

// keep the original authored bolt patterns so "Reset to default" always works,
// even after saving edits
const DEFAULT_LBOLT_PATTERNS = {};
THEMES.forEach((t, i) => {
  if (t.obstacleShape === 'lbolt') DEFAULT_LBOLT_PATTERNS[i] = JSON.parse(JSON.stringify(t.pattern));
});
const DEFAULT_BLACKHOLE_EVENTS = {};
THEMES.forEach((t, i) => {
  if (t.blackHoleEvents) DEFAULT_BLACKHOLE_EVENTS[i] = JSON.parse(JSON.stringify(t.blackHoleEvents));
});
const DEFAULT_WINDVORTEX_EVENTS = {};
THEMES.forEach((t, i) => {
  if (t.windVortexEvents) DEFAULT_WINDVORTEX_EVENTS[i] = JSON.parse(JSON.stringify(t.windVortexEvents));
});
const DEFAULT_LENSINGZONE_EVENTS = {};
THEMES.forEach((t, i) => {
  if (t.lensingZoneEvents) DEFAULT_LENSINGZONE_EVENTS[i] = JSON.parse(JSON.stringify(t.lensingZoneEvents));
});
const DEFAULT_SUPERNOVA_EVENTS = {};
THEMES.forEach((t, i) => {
  if (t.supernovaEvents) DEFAULT_SUPERNOVA_EVENTS[i] = JSON.parse(JSON.stringify(t.supernovaEvents));
});
const DEFAULT_TURRET_EVENTS = {};
THEMES.forEach((t, i) => {
  if (t.turretEvents) DEFAULT_TURRET_EVENTS[i] = JSON.parse(JSON.stringify(t.turretEvents));
});
const DEFAULT_EMP_EVENTS = {};
THEMES.forEach((t, i) => {
  if (t.empEvents) DEFAULT_EMP_EVENTS[i] = JSON.parse(JSON.stringify(t.empEvents));
});
const DEFAULT_PULSING_ORB_EVENTS = {};
THEMES.forEach((t, i) => {
  if (t.pulsingOrbEvents) DEFAULT_PULSING_ORB_EVENTS[i] = JSON.parse(JSON.stringify(t.pulsingOrbEvents));
});

function getPreviewLayout() {
  const h = previewCanvas.height;
  const pTop = 30, pBot = h - 30;
  return { pTop, pBot, pHeight: pBot - pTop, scale: previewScale };
}
// scrolls the preview so a given world-x position is centered in view --
// used after "Add" buttons, since a new hazard's trigger distance can be
// far from wherever the editor is currently scrolled, making it look like
// the click did nothing when it actually added something out of sight
function scrollPreviewTo(worldX) {
  const wrap = document.getElementById('preview-canvas-wrap');
  wrap.scrollLeft = Math.max(0, worldX * previewScale - wrap.clientWidth / 2);
}
// sets the preview status message while preserving scroll position --
// changing this text can reflow the toolbar (longer messages especially),
// which as a side effect can shift the scrollable preview wrapper's own
// scroll position, silently moving the user's view without any object
// actually moving. Used everywhere previewStatus.textContent would
// otherwise be set directly.
function setPreviewStatus(text) {
  const wrap = document.getElementById('preview-canvas-wrap');
  const savedScroll = wrap ? wrap.scrollLeft : null;
  previewStatus.textContent = text;
  if (wrap && savedScroll !== null) {
    wrap.scrollLeft = savedScroll;
    // the reflow this text change triggers can shift scroll asynchronously,
    // after this function already returns -- catch it again post-paint
    requestAnimationFrame(() => { wrap.scrollLeft = savedScroll; });
  }
}
// picks a trigger distance for a newly-added event that's genuinely free,
// rather than max(existing)+increment -- which, once the increment pushed
// past the zone-length cap, would clamp every subsequent add to the exact
// same distance as whatever was already there. Repeated clicks then
// silently stacked new events on top of old ones at an identical position:
// data was added correctly each time, but nothing looked different and
// the view never moved, since the position genuinely hadn't changed.
// Finds the widest gap between existing trigger distances (including the
// zone's start and end as boundaries) and places the new one in the
// middle of it, guaranteeing a distinct position as long as any gap wider
// than the minimum spacing remains.
function findFreeTriggerDistance(existingDistances, zoneMin, zoneMax, minSpacing) {
  const sorted = [zoneMin, ...existingDistances.slice().sort((a, b) => a - b), zoneMax];
  let bestGapStart = zoneMin, bestGapEnd = zoneMax, bestGapSize = -1;
  for (let i = 0; i < sorted.length - 1; i++) {
    const gapSize = sorted[i + 1] - sorted[i];
    if (gapSize > bestGapSize) { bestGapSize = gapSize; bestGapStart = sorted[i]; bestGapEnd = sorted[i + 1]; }
  }
  const candidate = Math.round((bestGapStart + bestGapEnd) / 2);
  // last-resort fallback if the zone is genuinely saturated -- still
  // distinct from anything currently there, even if uncomfortably close
  if (bestGapSize < minSpacing && existingDistances.length) {
    return Math.min(zoneMax, Math.max(...existingDistances) + minSpacing);
  }
  return candidate;
}
function yToScreenPreview(y, layout) {
  return layout.pTop + ((y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * layout.pHeight;
}
function boltScreenBox(g, layout) {
  const sx = g.x * layout.scale;
  const top = g.y - g.height / 2;
  const bottom = g.y + g.height / 2;
  const left = sx - Math.max(2, g.swingWidth * layout.scale / 2);
  const width = Math.max(4, g.swingWidth * layout.scale);
  const sTop = yToScreenPreview(top, layout);
  const sBottom = yToScreenPreview(bottom, layout);
  return { left, top: sTop, width, height: sBottom - sTop, right: left + width, bottom: sBottom };
}

function updateBoltPanel() {
  const shapeBtn = document.getElementById('preview-bolt-shape');
  const delBtn = document.getElementById('preview-bolt-delete');
  const addBtn = document.getElementById('preview-bolt-add');
  const th = THEMES[currentPreviewZone];
  addBtn.style.display = (th.obstacleShape === 'lbolt' && previewEditMode) ? '' : 'none';
  if (previewSelectedBolt && previewEditMode) {
    const srcBolt = th.pattern[previewSelectedBolt._entryIdx].bolts[previewSelectedBolt._boltIdx];
    shapeBtn.style.display = '';
    delBtn.style.display = '';
    shapeBtn.textContent = 'Shape: ' + srcBolt.shape;
  } else {
    shapeBtn.style.display = 'none';
    delBtn.style.display = 'none';
  }
}

function updateBlackHolePanel() {
  const delBtn = document.getElementById('preview-bh-delete');
  const addBtn = document.getElementById('preview-bh-add');
  const sizeControls = document.getElementById('preview-bh-size-controls');
  const coreInput = document.getElementById('preview-bh-core-input');
  const reachInput = document.getElementById('preview-bh-reach-input');
  const th = THEMES[currentPreviewZone];
  const isBlackHoleZone = !!th.blackHoleEvents;
  addBtn.style.display = (isBlackHoleZone && previewEditMode) ? '' : 'none';
  const hasSelection = isBlackHoleZone && previewEditMode && previewSelectedBlackHole;
  delBtn.style.display = hasSelection ? '' : 'none';
  sizeControls.style.display = hasSelection ? 'flex' : 'none';
  if (hasSelection) {
    const srcEvent = th.blackHoleEvents[previewSelectedBlackHole._eventIdx];
    // only overwrite if not currently focused, so typing isn't interrupted
    if (document.activeElement !== coreInput) coreInput.value = srcEvent.coreR;
    if (document.activeElement !== reachInput) reachInput.value = srcEvent.reachR;
  }
}

function updateWindVortexPanel() {
  const delBtn = document.getElementById('preview-vortex-delete');
  const addBtn = document.getElementById('preview-vortex-add');
  const sizeControls = document.getElementById('preview-vortex-size-controls');
  const reachInput = document.getElementById('preview-vortex-reach-input');
  const th = THEMES[currentPreviewZone];
  const isVortexZone = !!th.windVortexEvents;
  addBtn.style.display = (isVortexZone && previewEditMode) ? '' : 'none';
  const hasSelection = isVortexZone && previewEditMode && previewSelectedWindVortex;
  delBtn.style.display = hasSelection ? '' : 'none';
  sizeControls.style.display = hasSelection ? 'flex' : 'none';
  if (hasSelection) {
    const srcEvent = th.windVortexEvents[previewSelectedWindVortex._vortexIdx];
    if (document.activeElement !== reachInput) reachInput.value = srcEvent.reachR;
  }
}

function updateCloudArcPanel() {
  const delBtn = document.getElementById('preview-arc-delete');
  const addBtn = document.getElementById('preview-arc-add');
  const th = THEMES[currentPreviewZone];
  const isArcZone = !!th.cloudArcEvents;
  addBtn.style.display = (isArcZone && previewEditMode) ? '' : 'none';
  const hasSelection = isArcZone && previewEditMode && previewSelectedCloudArc;
  delBtn.style.display = hasSelection ? '' : 'none';
}

function updateLensingZonePanel() {
  const delBtn = document.getElementById('preview-lens-delete');
  const addBtn = document.getElementById('preview-lens-add');
  const sizeControls = document.getElementById('preview-lens-size-controls');
  const coreInput = document.getElementById('preview-lens-core-input');
  const zoneInput = document.getElementById('preview-lens-zone-input');
  const th = THEMES[currentPreviewZone];
  const isLensingZone = !!th.lensingZoneEvents;
  addBtn.style.display = (isLensingZone && previewEditMode) ? '' : 'none';
  const hasSelection = isLensingZone && previewEditMode && previewSelectedLensingZone;
  delBtn.style.display = hasSelection ? '' : 'none';
  sizeControls.style.display = hasSelection ? 'flex' : 'none';
  if (hasSelection) {
    const srcEvent = th.lensingZoneEvents[previewSelectedLensingZone._lensIdx];
    if (document.activeElement !== coreInput) coreInput.value = srcEvent.coreR;
    if (document.activeElement !== zoneInput) zoneInput.value = srcEvent.zoneRadius;
  }
}

function updateSupernovaPanel() {
  const delBtn = document.getElementById('preview-nova-delete');
  const addBtn = document.getElementById('preview-nova-add');
  const sizeControls = document.getElementById('preview-nova-size-controls');
  const planetInput = document.getElementById('preview-nova-planet-input');
  const dormantInput = document.getElementById('preview-nova-dormant-input');
  const dormantWrap = document.getElementById('preview-nova-dormant-wrap');
  const warningInput = document.getElementById('preview-nova-warning-input');
  const variantBtn = document.getElementById('preview-nova-variant');
  const th = THEMES[currentPreviewZone];
  const isSupernovaZone = !!th.supernovaEvents;
  addBtn.style.display = (isSupernovaZone && previewEditMode) ? '' : 'none';
  const hasSelection = isSupernovaZone && previewEditMode && previewSelectedSupernova;
  delBtn.style.display = hasSelection ? '' : 'none';
  sizeControls.style.display = hasSelection ? 'flex' : 'none';
  if (hasSelection) {
    const srcEvent = th.supernovaEvents[previewSelectedSupernova._novaIdx];
    const variant = srcEvent.variant || 'timer';
    if (document.activeElement !== planetInput) planetInput.value = srcEvent.planetR;
    if (document.activeElement !== dormantInput) dormantInput.value = srcEvent.dormantFrames;
    if (document.activeElement !== warningInput) warningInput.value = srcEvent.warningFrames;
    variantBtn.textContent = 'Variant: ' + (variant === 'onscreen' ? 'On-Screen' : 'Timer');
    // dormant time has no effect on the onscreen variant -- hide it so
    // it doesn't look like a control that should do something
    dormantWrap.style.display = variant === 'onscreen' ? 'none' : 'inline-flex';
  }
}

function updateTurretPanel() {
  const delBtn = document.getElementById('preview-turret-delete');
  const addBtn = document.getElementById('preview-turret-add');
  const controls = document.getElementById('preview-turret-controls');
  const anchorBtn = document.getElementById('preview-turret-anchor');
  const angleInput = document.getElementById('preview-turret-angle-input');
  const shotsInput = document.getElementById('preview-turret-shots-input');
  const intervalInput = document.getElementById('preview-turret-interval-input');
  const th = THEMES[currentPreviewZone];
  const isTurretZone = !!th.turretEvents;
  addBtn.style.display = (isTurretZone && previewEditMode) ? '' : 'none';
  const hasSelection = isTurretZone && previewEditMode && previewSelectedTurret;
  delBtn.style.display = hasSelection ? '' : 'none';
  controls.style.display = hasSelection ? 'flex' : 'none';
  if (hasSelection) {
    const srcEvent = th.turretEvents[previewSelectedTurret._turretIdx];
    anchorBtn.textContent = 'Anchor: ' + (srcEvent.anchor === 'top' ? 'Top' : 'Bottom');
    if (document.activeElement !== angleInput) angleInput.value = srcEvent.fireAngleDeg || 0;
    if (document.activeElement !== shotsInput) shotsInput.value = srcEvent.numShots;
    if (document.activeElement !== intervalInput) intervalInput.value = srcEvent.fireInterval;
  }
}

function updateEmpPanel() {
  const delBtn = document.getElementById('preview-emp-delete');
  const addBtn = document.getElementById('preview-emp-add');
  const controls = document.getElementById('preview-emp-controls');
  const anchorBtn = document.getElementById('preview-emp-anchor');
  const reachInput = document.getElementById('preview-emp-reach-input');
  const chargeInput = document.getElementById('preview-emp-charge-input');
  const dischargeInput = document.getElementById('preview-emp-discharge-input');
  const th = THEMES[currentPreviewZone];
  const isEmpZone = !!th.empEvents;
  addBtn.style.display = (isEmpZone && previewEditMode) ? '' : 'none';
  const hasSelection = isEmpZone && previewEditMode && previewSelectedEmp;
  delBtn.style.display = hasSelection ? '' : 'none';
  controls.style.display = hasSelection ? 'flex' : 'none';
  if (hasSelection) {
    const srcEvent = th.empEvents[previewSelectedEmp._empIdx];
    anchorBtn.textContent = 'Anchor: ' + (srcEvent.anchor === 'top' ? 'Top' : 'Bottom');
    if (document.activeElement !== reachInput) reachInput.value = srcEvent.reachDepth;
    if (document.activeElement !== chargeInput) chargeInput.value = srcEvent.chargeFrames;
    if (document.activeElement !== dischargeInput) dischargeInput.value = srcEvent.dischargeFrames;
  }
}

function updateOrbPanel() {
  const delBtn = document.getElementById('preview-orb-delete');
  const addBtn = document.getElementById('preview-orb-add');
  const controls = document.getElementById('preview-orb-controls');
  const minrInput = document.getElementById('preview-orb-minr-input');
  const maxrInput = document.getElementById('preview-orb-maxr-input');
  const periodInput = document.getElementById('preview-orb-period-input');
  const th = THEMES[currentPreviewZone];
  const isOrbZone = !!th.pulsingOrbEvents;
  addBtn.style.display = (isOrbZone && previewEditMode) ? '' : 'none';
  const hasSelection = isOrbZone && previewEditMode && previewSelectedOrb;
  delBtn.style.display = hasSelection ? '' : 'none';
  controls.style.display = hasSelection ? 'flex' : 'none';
  if (hasSelection) {
    const srcEvent = th.pulsingOrbEvents[previewSelectedOrb._orbIdx];
    if (document.activeElement !== minrInput) minrInput.value = srcEvent.minR;
    if (document.activeElement !== maxrInput) maxrInput.value = srcEvent.maxR;
    if (document.activeElement !== periodInput) periodInput.value = srcEvent.period;
  }
}

document.getElementById('preview-toggle').addEventListener('click', () => {
  previewOverlay.classList.add('active');
  runPreview(currentPreviewZone);
});
document.getElementById('preview-close').addEventListener('click', () => {
  previewOverlay.classList.remove('active');
});
document.querySelectorAll('.preview-zone-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.preview-zone-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    currentPreviewZone = parseInt(btn.dataset.zone, 10);
    previewSelectedBolt = null;
    previewSelectedBlackHole = null;
    previewSelectedWindVortex = null;
    previewSelectedCloudArc = null;
    previewSelectedLensingZone = null;
    previewSelectedSupernova = null;
    previewSelectedTurret = null;
    previewSelectedEmp = null;
    previewSelectedOrb = null;
    updateBoltPanel();
    updateBlackHolePanel();
    updateWindVortexPanel();
    updateCloudArcPanel();
    updateLensingZonePanel();
    updateSupernovaPanel();
    updateTurretPanel();
    updateEmpPanel();
    updateOrbPanel();
    runPreview(currentPreviewZone);
  });
});

document.getElementById('preview-edit-toggle').addEventListener('click', () => {
  const th = THEMES[currentPreviewZone];
  if (th.obstacleShape !== 'lbolt' && !th.blackHoleEvents && !th.lensingZoneEvents && !th.supernovaEvents && !th.turretEvents && !th.empEvents && !th.pulsingOrbEvents) {
    setPreviewStatus('Editing only supports floating-bolt, black hole, lensing zone, supernova, turret, EMP, and orb hazards right now.');
    return;
  }
  previewEditMode = !previewEditMode;
  document.getElementById('preview-edit-toggle').textContent = 'Edit Mode: ' + (previewEditMode ? 'On' : 'Off');
  document.getElementById('preview-edit-toggle').style.background = previewEditMode ? 'rgba(157,123,255,0.4)' : '';
  if (!previewEditMode) {
    previewSelectedBolt = null;
    previewSelectedBlackHole = null;
    previewSelectedWindVortex = null;
    previewSelectedCloudArc = null;
    previewSelectedLensingZone = null;
    previewSelectedSupernova = null;
    previewSelectedTurret = null;
    previewSelectedEmp = null;
    previewSelectedOrb = null;
  }
  updateBoltPanel();
  updateBlackHolePanel();
  updateWindVortexPanel();
  updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  if (previewLastData) drawZonePreview(previewLastData);
});

document.getElementById('preview-bolt-shape').addEventListener('click', () => {
  if (!previewSelectedBolt) return;
  const th = THEMES[currentPreviewZone];
  const srcBolt = th.pattern[previewSelectedBolt._entryIdx].bolts[previewSelectedBolt._boltIdx];
  const keys = Object.keys(BOLT_SHAPES);
  const idx = keys.indexOf(srcBolt.shape);
  srcBolt.shape = keys[(idx + 1) % keys.length];
  const savedSel = { entryIdx: previewSelectedBolt._entryIdx, boltIdx: previewSelectedBolt._boltIdx };
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  previewSelectedBolt = previewLastData.obstacles.find(g => g._entryIdx === savedSel.entryIdx && g._boltIdx === savedSel.boltIdx) || null;
  updateBoltPanel();
  drawZonePreview(previewLastData);
});

document.getElementById('preview-bolt-delete').addEventListener('click', () => {
  if (!previewSelectedBolt) return;
  const th = THEMES[currentPreviewZone];
  const idx = previewSelectedBolt._entryIdx;
  const entry = th.pattern[idx];
  entry.bolts.splice(previewSelectedBolt._boltIdx, 1);
  if (entry.bolts.length === 0) {
    // this entry's spacing is the gap leading to the NEXT entry -- removing
    // it outright would erase that gap from the cumulative total, shifting
    // every subsequent bolt left to fill the space. fold it into the
    // preceding entry's spacing instead so nothing else moves.
    if (idx === 0) {
      // the very first entry is spawned at a fixed starting position, not
      // reached via any spacing value -- folding its spacing into the last
      // entry only fixes the loop-around point, not this first spawn. leave
      // it in place as an empty placeholder instead: it spawns nothing, but
      // its spacing still correctly carries through to the next entry.
    } else if (th.pattern.length > 1) {
      th.pattern[idx - 1].spacing += entry.spacing;
      th.pattern.splice(idx, 1);
    } else {
      th.pattern.splice(idx, 1);
    }
  }
  previewSelectedBolt = null;
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  updateBoltPanel();
  drawZonePreview(previewLastData);
});

document.getElementById('preview-bolt-add').addEventListener('click', () => {
  const th = THEMES[currentPreviewZone];
  if (th.obstacleShape !== 'lbolt') return;

  let targetEntryIdx, targetBoltIdx;
  const newBoltDefaults = { heightFrac: 0.3, swingWidthPx: 36, shape: 'E1', onFrames: 70, offFrames: 90, phaseFrac: 0.3 };

  if (previewSelectedBolt) {
    // a bolt is selected -- add a sibling to its same pattern entry, so it
    // repeats alongside the existing one at every cycle of that entry
    const entryIdx = previewSelectedBolt._entryIdx;
    const entry = th.pattern[entryIdx];
    const srcBolt = entry.bolts[previewSelectedBolt._boltIdx];
    entry.bolts.push({ ...newBoltDefaults, xJitter: srcBolt.xJitter, yFrac: (srcBolt.yFrac + 0.3) % 1 });
    targetEntryIdx = entryIdx;
    targetBoltIdx = entry.bolts.length - 1;
  } else {
    // nothing selected -- insert a whole new pattern entry (a new "beat" in
    // the cycle) by splitting whichever existing entry has the largest
    // spacing, similar in spirit to how other Add buttons find free room
    let bestIdx = 0, bestSpacing = -1;
    th.pattern.forEach((entry, i) => {
      if (entry.spacing > bestSpacing) { bestSpacing = entry.spacing; bestIdx = i; }
    });
    const splitEntry = th.pattern[bestIdx];
    const half = Math.round(splitEntry.spacing / 2);
    splitEntry.spacing = half;
    th.pattern.splice(bestIdx + 1, 0, { spacing: bestSpacing - half, bolts: [{ ...newBoltDefaults, xJitter: 0, yFrac: 0.5 }] });
    targetEntryIdx = bestIdx + 1;
    targetBoltIdx = 0;
  }

  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  // the pattern repeats several times across the zone -- find() naturally
  // lands on the first, earliest occurrence of the new bolt
  previewSelectedBolt = previewLastData.obstacles.find(g => g.type === 'lbolt' && g._entryIdx === targetEntryIdx && g._boltIdx === targetBoltIdx) || null;
  if (previewSelectedBolt) scrollPreviewTo(previewSelectedBolt.x);
  updateBoltPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Bolt added.');
});

document.getElementById('preview-bh-delete').addEventListener('click', () => {
  if (!previewSelectedBlackHole) return;
  const th = THEMES[currentPreviewZone];
  th.blackHoleEvents.splice(previewSelectedBlackHole._eventIdx, 1);
  previewSelectedBlackHole = null;
  previewSelectedWindVortex = null;
  previewSelectedCloudArc = null;
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  updateBlackHolePanel();
  updateWindVortexPanel();
  updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Black hole deleted.');
});

document.getElementById('preview-bh-add').addEventListener('click', () => {
  const th = THEMES[currentPreviewZone];
  if (!th.blackHoleEvents) return;
  const usedDistances = th.blackHoleEvents.map(e => e.triggerDistance);
  const newDistance = findFreeTriggerDistance(usedDistances, 20, 950, 100);
  th.blackHoleEvents.push({ triggerDistance: newDistance, yFrac: 0.5, coreR: 80, reachR: 220 });
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  const newIdx = th.blackHoleEvents.length - 1;
  previewSelectedBlackHole = previewLastData.obstacles.find(g => g._eventIdx === newIdx) || null;
  if (previewSelectedBlackHole) scrollPreviewTo(previewSelectedBlackHole.x);
  updateBlackHolePanel();
  updateWindVortexPanel();
  updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Black hole added.');
});

document.getElementById('preview-vortex-delete').addEventListener('click', () => {
  if (!previewSelectedWindVortex) return;
  const th = THEMES[currentPreviewZone];
  th.windVortexEvents.splice(previewSelectedWindVortex._vortexIdx, 1);
  previewSelectedWindVortex = null;
  previewSelectedCloudArc = null;
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  updateBlackHolePanel();
  updateWindVortexPanel();
  updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Wind vortex deleted.');
});

document.getElementById('preview-vortex-add').addEventListener('click', () => {
  const th = THEMES[currentPreviewZone];
  if (!th.windVortexEvents) return;
  const usedDistances = th.windVortexEvents.map(e => e.triggerDistance);
  const newDistance = findFreeTriggerDistance(usedDistances, 20, 950, 100);
  th.windVortexEvents.push({ triggerDistance: newDistance, yFrac: 0.5, reachR: 220 });
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  const newIdx = th.windVortexEvents.length - 1;
  previewSelectedWindVortex = previewLastData.obstacles.find(g => g.type === 'windvortex' && g._vortexIdx === newIdx) || null;
  if (previewSelectedWindVortex) scrollPreviewTo(previewSelectedWindVortex.x);
  updateBlackHolePanel();
  updateWindVortexPanel();
  updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Wind vortex added.');
});

document.getElementById('preview-arc-delete').addEventListener('click', () => {
  if (!previewSelectedCloudArc) return;
  const th = THEMES[currentPreviewZone];
  th.cloudArcEvents.splice(previewSelectedCloudArc._arcIdx, 1);
  previewSelectedCloudArc = null;
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  updateBlackHolePanel();
  updateWindVortexPanel();
  updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Cloud arc deleted.');
});

document.getElementById('preview-arc-add').addEventListener('click', () => {
  const th = THEMES[currentPreviewZone];
  if (!th.cloudArcEvents) return;
  const usedDistances = th.cloudArcEvents.map(e => e.triggerDistance);
  const newDistance = findFreeTriggerDistance(usedDistances, 20, 900, 100);
  th.cloudArcEvents.push({ triggerDistance: newDistance, y1Frac: 0.3, y2Frac: 0.7, spanPx: 550, onFrames: 70, offFrames: 90, phaseFrac: 0.2 });
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  const newIdx = th.cloudArcEvents.length - 1;
  previewSelectedCloudArc = previewLastData.obstacles.find(g => g.type === 'cloudarc' && g._arcIdx === newIdx) || null;
  if (previewSelectedCloudArc) scrollPreviewTo(previewSelectedCloudArc.x);
  updateBlackHolePanel();
  updateWindVortexPanel();
  updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Cloud arc added.');
});

document.getElementById('preview-lens-delete').addEventListener('click', () => {
  if (!previewSelectedLensingZone) return;
  const th = THEMES[currentPreviewZone];
  th.lensingZoneEvents.splice(previewSelectedLensingZone._lensIdx, 1);
  previewSelectedLensingZone = null;
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  updateBlackHolePanel();
  updateWindVortexPanel();
  updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Lensing zone deleted.');
});

document.getElementById('preview-lens-add').addEventListener('click', () => {
  const th = THEMES[currentPreviewZone];
  if (!th.lensingZoneEvents) return;
  const usedDistances = th.lensingZoneEvents.map(e => e.triggerDistance);
  const newDistance = findFreeTriggerDistance(usedDistances, 20, 950, 100);
  th.lensingZoneEvents.push({ triggerDistance: newDistance, yFrac: 0.5, coreR: 12, zoneRadius: 120 });
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  const newIdx = th.lensingZoneEvents.length - 1;
  previewSelectedLensingZone = previewLastData.obstacles.find(g => g._lensIdx === newIdx) || null;
  if (previewSelectedLensingZone) scrollPreviewTo(previewSelectedLensingZone.x);
  updateBlackHolePanel();
  updateWindVortexPanel();
  updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Lensing zone added.');
});

document.getElementById('preview-nova-delete').addEventListener('click', () => {
  if (!previewSelectedSupernova) return;
  const th = THEMES[currentPreviewZone];
  th.supernovaEvents.splice(previewSelectedSupernova._novaIdx, 1);
  previewSelectedSupernova = null;
  previewSelectedTurret = null;
  previewSelectedEmp = null;
  previewSelectedOrb = null;
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Supernova deleted.');
});

document.getElementById('preview-nova-add').addEventListener('click', () => {
  const th = THEMES[currentPreviewZone];
  if (!th.supernovaEvents) return;
  const usedDistances = th.supernovaEvents.map(e => e.triggerDistance);
  const newDistance = findFreeTriggerDistance(usedDistances, 20, 900, 150);
  th.supernovaEvents.push({ triggerDistance: newDistance, yFrac: 0.5, planetR: 140, variant: 'timer', dormantFrames: 200, warningFrames: 100 });
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  const newIdx = th.supernovaEvents.length - 1;
  previewSelectedSupernova = previewLastData.obstacles.find(g => g._novaIdx === newIdx) || null;
  if (previewSelectedSupernova) scrollPreviewTo(previewSelectedSupernova.x);
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Supernova added.');
});

document.getElementById('preview-nova-variant').addEventListener('click', () => {
  if (!previewSelectedSupernova) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.supernovaEvents[previewSelectedSupernova._novaIdx];
  srcEvent.variant = (srcEvent.variant || 'timer') === 'timer' ? 'onscreen' : 'timer';
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  setPreviewStatus('Variant set to ' + (srcEvent.variant === 'onscreen' ? 'On-Screen' : 'Timer') + '.');
});

document.getElementById('preview-turret-delete').addEventListener('click', () => {
  if (!previewSelectedTurret) return;
  const th = THEMES[currentPreviewZone];
  th.turretEvents.splice(previewSelectedTurret._turretIdx, 1);
  previewSelectedTurret = null;
  previewSelectedEmp = null;
  previewSelectedOrb = null;
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Turret deleted.');
});

document.getElementById('preview-turret-add').addEventListener('click', () => {
  const th = THEMES[currentPreviewZone];
  if (!th.turretEvents) return;
  const usedDistances = th.turretEvents.map(e => e.triggerDistance);
  const newDistance = findFreeTriggerDistance(usedDistances, 20, 900, 150);
  th.turretEvents.push({ triggerDistance: newDistance, anchor: 'top', mountOffset: 70, numShots: 3, fireInterval: 80, fireAngleDeg: 0, projectileSpeed: 6.5, projectileR: 10 });
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  const newIdx = th.turretEvents.length - 1;
  previewSelectedTurret = previewLastData.obstacles.find(g => g._turretIdx === newIdx) || null;
  if (previewSelectedTurret) scrollPreviewTo(previewSelectedTurret.x);
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Turret added.');
});

document.getElementById('preview-turret-anchor').addEventListener('click', () => {
  if (!previewSelectedTurret) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.turretEvents[previewSelectedTurret._turretIdx];
  srcEvent.anchor = srcEvent.anchor === 'top' ? 'bottom' : 'top';
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  previewSelectedTurret = previewLastData.obstacles.find(g => g._turretIdx === previewSelectedTurret._turretIdx) || null;
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Anchor set to ' + (srcEvent.anchor === 'top' ? 'Top' : 'Bottom') + '.');
});

document.getElementById('preview-turret-angle-input').addEventListener('input', (e) => {
  if (!previewSelectedTurret) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.turretEvents[previewSelectedTurret._turretIdx];
  const val = parseFloat(e.target.value);
  if (!isNaN(val)) {
    srcEvent.fireAngleDeg = Math.max(-80, Math.min(80, val));
    previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
    previewSelectedTurret = previewLastData.obstacles.find(g => g._turretIdx === previewSelectedTurret._turretIdx) || null;
    drawZonePreview(previewLastData);
  }
});

document.getElementById('preview-turret-shots-input').addEventListener('input', (e) => {
  if (!previewSelectedTurret) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.turretEvents[previewSelectedTurret._turretIdx];
  const val = parseInt(e.target.value, 10);
  if (!isNaN(val)) srcEvent.numShots = Math.max(1, Math.min(10, val));
});

document.getElementById('preview-turret-interval-input').addEventListener('input', (e) => {
  if (!previewSelectedTurret) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.turretEvents[previewSelectedTurret._turretIdx];
  const val = parseInt(e.target.value, 10);
  if (!isNaN(val)) srcEvent.fireInterval = Math.max(20, Math.min(300, val));
});

document.getElementById('preview-emp-delete').addEventListener('click', () => {
  if (!previewSelectedEmp) return;
  const th = THEMES[currentPreviewZone];
  th.empEvents.splice(previewSelectedEmp._empIdx, 1);
  previewSelectedTurret = null;
  previewSelectedEmp = null;
  previewSelectedOrb = null;
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('EMP deleted.');
});

document.getElementById('preview-emp-add').addEventListener('click', () => {
  const th = THEMES[currentPreviewZone];
  if (!th.empEvents) return;
  const usedDistances = th.empEvents.map(e => e.triggerDistance);
  const newDistance = findFreeTriggerDistance(usedDistances, 20, 900, 150);
  th.empEvents.push({ triggerDistance: newDistance, anchor: 'top', reachDepth: 300, chargeFrames: 250, dischargeFrames: 45 });
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  const newIdx = th.empEvents.length - 1;
  previewSelectedEmp = previewLastData.obstacles.find(g => g._empIdx === newIdx) || null;
  if (previewSelectedEmp) scrollPreviewTo(previewSelectedEmp.x);
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('EMP added.');
});

document.getElementById('preview-emp-anchor').addEventListener('click', () => {
  if (!previewSelectedEmp) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.empEvents[previewSelectedEmp._empIdx];
  srcEvent.anchor = srcEvent.anchor === 'top' ? 'bottom' : 'top';
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  previewSelectedEmp = previewLastData.obstacles.find(g => g._empIdx === previewSelectedEmp._empIdx) || null;
  updateEmpPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Anchor set to ' + (srcEvent.anchor === 'top' ? 'Top' : 'Bottom') + '.');
});

document.getElementById('preview-emp-reach-input').addEventListener('input', (e) => {
  if (!previewSelectedEmp) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.empEvents[previewSelectedEmp._empIdx];
  const val = parseInt(e.target.value, 10);
  if (!isNaN(val)) srcEvent.reachDepth = Math.max(100, Math.min(450, val));
});

document.getElementById('preview-emp-charge-input').addEventListener('input', (e) => {
  if (!previewSelectedEmp) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.empEvents[previewSelectedEmp._empIdx];
  const val = parseInt(e.target.value, 10);
  if (!isNaN(val)) srcEvent.chargeFrames = Math.max(60, Math.min(400, val));
});

document.getElementById('preview-emp-discharge-input').addEventListener('input', (e) => {
  if (!previewSelectedEmp) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.empEvents[previewSelectedEmp._empIdx];
  const val = parseInt(e.target.value, 10);
  if (!isNaN(val)) srcEvent.dischargeFrames = Math.max(15, Math.min(120, val));
});

document.getElementById('preview-orb-delete').addEventListener('click', () => {
  if (!previewSelectedOrb) return;
  const th = THEMES[currentPreviewZone];
  th.pulsingOrbEvents.splice(previewSelectedOrb._orbIdx, 1);
  previewSelectedTurret = null;
  previewSelectedEmp = null;
  previewSelectedOrb = null;
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Orb deleted.');
});

document.getElementById('preview-orb-add').addEventListener('click', () => {
  const th = THEMES[currentPreviewZone];
  if (!th.pulsingOrbEvents) return;
  const usedDistances = th.pulsingOrbEvents.map(e => e.triggerDistance);
  const newDistance = findFreeTriggerDistance(usedDistances, 20, 900, 150);
  th.pulsingOrbEvents.push({ triggerDistance: newDistance, minR: 40, maxR: 200, period: 350 });
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  const newIdx = th.pulsingOrbEvents.length - 1;
  previewSelectedOrb = previewLastData.obstacles.find(g => g._orbIdx === newIdx) || null;
  if (previewSelectedOrb) scrollPreviewTo(previewSelectedOrb.x);
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Orb added.');
});

document.getElementById('preview-orb-minr-input').addEventListener('input', (e) => {
  if (!previewSelectedOrb) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.pulsingOrbEvents[previewSelectedOrb._orbIdx];
  const val = parseInt(e.target.value, 10);
  if (!isNaN(val)) {
    srcEvent.minR = Math.max(15, Math.min(150, val));
    previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
    previewSelectedOrb = previewLastData.obstacles.find(g => g._orbIdx === previewSelectedOrb._orbIdx) || null;
    drawZonePreview(previewLastData);
  }
});

document.getElementById('preview-orb-maxr-input').addEventListener('input', (e) => {
  if (!previewSelectedOrb) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.pulsingOrbEvents[previewSelectedOrb._orbIdx];
  const val = parseInt(e.target.value, 10);
  if (!isNaN(val)) {
    srcEvent.maxR = Math.max(60, Math.min(250, val));
    previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
    previewSelectedOrb = previewLastData.obstacles.find(g => g._orbIdx === previewSelectedOrb._orbIdx) || null;
    drawZonePreview(previewLastData);
  }
});

document.getElementById('preview-orb-period-input').addEventListener('input', (e) => {
  if (!previewSelectedOrb) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.pulsingOrbEvents[previewSelectedOrb._orbIdx];
  const val = parseInt(e.target.value, 10);
  if (!isNaN(val)) srcEvent.period = Math.max(100, Math.min(600, val));
});

document.getElementById('preview-bh-core-input').addEventListener('input', (e) => {
  if (!previewSelectedBlackHole) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.blackHoleEvents[previewSelectedBlackHole._eventIdx];
  const val = parseFloat(e.target.value);
  if (!isFinite(val) || val < 20) return;
  srcEvent.coreR = val;
  // keep reach comfortably larger than core so the graduated pull field
  // always means something
  if (srcEvent.reachR < val * 1.15) {
    srcEvent.reachR = Math.round(val * 1.2);
    document.getElementById('preview-bh-reach-input').value = srcEvent.reachR;
  }
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  previewSelectedBlackHole = previewLastData.obstacles.find(g => g._eventIdx === previewSelectedBlackHole._eventIdx) || null;
  drawZonePreview(previewLastData);
});

document.getElementById('preview-bh-reach-input').addEventListener('input', (e) => {
  if (!previewSelectedBlackHole) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.blackHoleEvents[previewSelectedBlackHole._eventIdx];
  const val = parseFloat(e.target.value);
  if (!isFinite(val) || val < srcEvent.coreR * 1.15) return;
  srcEvent.reachR = val;
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  previewSelectedBlackHole = previewLastData.obstacles.find(g => g._eventIdx === previewSelectedBlackHole._eventIdx) || null;
  drawZonePreview(previewLastData);
});

document.getElementById('preview-vortex-reach-input').addEventListener('input', (e) => {
  if (!previewSelectedWindVortex) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.windVortexEvents[previewSelectedWindVortex._vortexIdx];
  const val = parseFloat(e.target.value);
  if (!isFinite(val) || val < 60) return;
  srcEvent.reachR = val;
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  previewSelectedWindVortex = previewLastData.obstacles.find(g => g.type === 'windvortex' && g._vortexIdx === previewSelectedWindVortex._vortexIdx) || null;
  drawZonePreview(previewLastData);
});

document.getElementById('preview-lens-core-input').addEventListener('input', (e) => {
  if (!previewSelectedLensingZone) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.lensingZoneEvents[previewSelectedLensingZone._lensIdx];
  const val = parseFloat(e.target.value);
  if (!isFinite(val) || val < 4) return;
  srcEvent.coreR = val;
  // keep the zone comfortably larger than the core so there's a real
  // distortion field surrounding it, not just a bare point
  if (srcEvent.zoneRadius < val * 2) {
    srcEvent.zoneRadius = Math.round(val * 3);
    document.getElementById('preview-lens-zone-input').value = srcEvent.zoneRadius;
  }
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  previewSelectedLensingZone = previewLastData.obstacles.find(g => g._lensIdx === previewSelectedLensingZone._lensIdx) || null;
  drawZonePreview(previewLastData);
});

document.getElementById('preview-lens-zone-input').addEventListener('input', (e) => {
  if (!previewSelectedLensingZone) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.lensingZoneEvents[previewSelectedLensingZone._lensIdx];
  const val = parseFloat(e.target.value);
  if (!isFinite(val) || val < srcEvent.coreR * 2) return;
  srcEvent.zoneRadius = val;
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  previewSelectedLensingZone = previewLastData.obstacles.find(g => g._lensIdx === previewSelectedLensingZone._lensIdx) || null;
  drawZonePreview(previewLastData);
});

document.getElementById('preview-nova-planet-input').addEventListener('input', (e) => {
  if (!previewSelectedSupernova) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.supernovaEvents[previewSelectedSupernova._novaIdx];
  const val = parseFloat(e.target.value);
  if (!isFinite(val) || val < 40) return;
  srcEvent.planetR = val;
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  previewSelectedSupernova = previewLastData.obstacles.find(g => g._novaIdx === previewSelectedSupernova._novaIdx) || null;
  drawZonePreview(previewLastData);
});

document.getElementById('preview-nova-dormant-input').addEventListener('input', (e) => {
  if (!previewSelectedSupernova) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.supernovaEvents[previewSelectedSupernova._novaIdx];
  const val = parseFloat(e.target.value);
  if (!isFinite(val) || val < 30) return;
  srcEvent.dormantFrames = val;
});

document.getElementById('preview-nova-warning-input').addEventListener('input', (e) => {
  if (!previewSelectedSupernova) return;
  const th = THEMES[currentPreviewZone];
  const srcEvent = th.supernovaEvents[previewSelectedSupernova._novaIdx];
  const val = parseFloat(e.target.value);
  if (!isFinite(val) || val < 20) return;
  srcEvent.warningFrames = val;
});

document.getElementById('preview-save').addEventListener('click', async () => {
  setPreviewStatus('Saving...');
  // warn about black holes or lensing zones that don't have enough
  // runway left in the zone to fully scroll off-screen before the
  // zone-end transition wipes everything -- otherwise they visibly
  // vanish mid-exit
  const runwayWarnings = [];
  const autoFixedBolts = [];
  // fix any bolt whose effective zone-progress position falls before 0 --
  // it still spawns and is dangerous in real gameplay (it's part of the
  // zone's initial spawn), but the editor canvas can't show or scroll to
  // negative coordinates, so once in this state there's no way to click
  // and drag it back into view manually -- pull it back to just inside
  // the visible range automatically, the same correction the live drag
  // handler applies, rather than leaving an unfixable warning
  THEMES.forEach((t, zi) => {
    if (t.obstacleShape === 'lbolt' && t.pattern) {
      let changed = true;
      let guard = 0;
      while (changed && guard < 20) {
        changed = false;
        guard++;
        const captured = captureFullZoneRun(zi, 1000);
        const bad = captured.obstacles.find(o => o.type === 'lbolt' && o.x < 0);
        if (bad) {
          const srcBolt = t.pattern[bad._entryIdx].bolts[bad._boltIdx];
          srcBolt.xJitter += Math.round(-bad.x + 10);
          autoFixedBolts.push(`Zone ${zi + 1} bolt (entry ${bad._entryIdx + 1}, shape slot ${bad._boltIdx + 1})`);
          changed = true;
        }
      }
    }
  });
  THEMES.forEach((t, zi) => {
    if (t.blackHoleEvents) {
      t.blackHoleEvents.forEach((ev, ei) => {
        const spawnX = 1000 + ev.reachR + 40; // approx W + reachR + 40, matching spawnBlackHoleEvent
        const neededDistanceUnits = (spawnX - (-80 - ev.reachR)) / 10;
        const availableDistanceUnits = 1000 - ev.triggerDistance;
        if (availableDistanceUnits < neededDistanceUnits) {
          runwayWarnings.push(`Zone ${zi + 1} hole #${ei + 1} (trigger ${ev.triggerDistance}, reach ${ev.reachR}) needs ~${Math.ceil(neededDistanceUnits)} distance to exit but only has ${availableDistanceUnits} left`);
        }
      });
    }
    if (t.windVortexEvents) {
      t.windVortexEvents.forEach((ev, ei) => {
        const spawnX = 1000 + ev.reachR + 40; // matching spawnWindVortexEvent
        const neededDistanceUnits = (spawnX - (-80 - ev.reachR)) / 10;
        const availableDistanceUnits = 1000 - ev.triggerDistance;
        if (availableDistanceUnits < neededDistanceUnits) {
          runwayWarnings.push(`Zone ${zi + 1} vortex #${ei + 1} (trigger ${ev.triggerDistance}, reach ${ev.reachR}) needs ~${Math.ceil(neededDistanceUnits)} distance to exit but only has ${availableDistanceUnits} left`);
        }
      });
    }
    if (t.lensingZoneEvents) {
      t.lensingZoneEvents.forEach((ev, ei) => {
        const spawnX = 1000 + ev.zoneRadius + 40;
        const neededDistanceUnits = (spawnX - (-80 - ev.zoneRadius)) / 10;
        const availableDistanceUnits = 1000 - ev.triggerDistance;
        if (availableDistanceUnits < neededDistanceUnits) {
          runwayWarnings.push(`Zone ${zi + 1} lens #${ei + 1} (trigger ${ev.triggerDistance}, zone ${ev.zoneRadius}) needs ~${Math.ceil(neededDistanceUnits)} distance to exit but only has ${availableDistanceUnits} left`);
        }
      });
    }
    if (t.supernovaEvents) {
      t.supernovaEvents.forEach((ev, ei) => {
        const spawnX = 1000 + ev.planetR + 40;
        // also account for the dormant+warning buildup time before the
        // planet even starts its exit journey, plus debris needing to
        // travel roughly as far as the planet would have
        const buildupPx = (ev.dormantFrames + ev.warningFrames) * 2.8;
        const neededDistanceUnits = (spawnX - (-80 - ev.planetR) - buildupPx) / 10;
        const availableDistanceUnits = 1000 - ev.triggerDistance;
        if (availableDistanceUnits < neededDistanceUnits) {
          runwayWarnings.push(`Zone ${zi + 1} nova #${ei + 1} (trigger ${ev.triggerDistance}, planet ${ev.planetR}) needs ~${Math.ceil(neededDistanceUnits)} distance to exit but only has ${availableDistanceUnits} left`);
        }
      });
    }
    if (t.turretEvents) {
      t.turretEvents.forEach((ev, ei) => {
        const spawnX = 1000 + 40 + 22;
        // also account for all shots needing to be fired before the
        // mount itself is done being relevant
        const buildupPx = ev.numShots * ev.fireInterval * 2.8;
        const neededDistanceUnits = (spawnX - (-80 - 22) - buildupPx) / 10;
        const availableDistanceUnits = 1000 - ev.triggerDistance;
        if (availableDistanceUnits < neededDistanceUnits) {
          runwayWarnings.push(`Zone ${zi + 1} turret #${ei + 1} (trigger ${ev.triggerDistance}) needs ~${Math.ceil(neededDistanceUnits)} distance to exit but only has ${availableDistanceUnits} left`);
        }
      });
    }
    if (t.empEvents) {
      t.empEvents.forEach((ev, ei) => {
        const spawnX = 1000 + 40;
        const buildupPx = (ev.chargeFrames + ev.dischargeFrames) * 2.8;
        const neededDistanceUnits = (spawnX - (-80 - 30) - buildupPx) / 10;
        const availableDistanceUnits = 1000 - ev.triggerDistance;
        if (availableDistanceUnits < neededDistanceUnits) {
          runwayWarnings.push(`Zone ${zi + 1} EMP #${ei + 1} (trigger ${ev.triggerDistance}) needs ~${Math.ceil(neededDistanceUnits)} distance to exit but only has ${availableDistanceUnits} left`);
        }
      });
    }
    if (t.pulsingOrbEvents) {
      t.pulsingOrbEvents.forEach((ev, ei) => {
        const spawnX = 1000 + ev.maxR + 40;
        const neededDistanceUnits = (spawnX - (-80 - ev.maxR)) / 10;
        const availableDistanceUnits = 1000 - ev.triggerDistance;
        if (availableDistanceUnits < neededDistanceUnits) {
          runwayWarnings.push(`Zone ${zi + 1} orb #${ei + 1} (trigger ${ev.triggerDistance}, maxR ${ev.maxR}) needs ~${Math.ceil(neededDistanceUnits)} distance to exit but only has ${availableDistanceUnits} left`);
        }
      });
    }
  });
  try {
    const boltSerializable = THEMES.map(t => t.obstacleShape === 'lbolt' ? t.pattern : null);
    await window.storage.set('bolt-patterns-custom', JSON.stringify(boltSerializable));
    const bhSerializable = THEMES.map(t => t.blackHoleEvents || null);
    await window.storage.set('blackhole-events-custom', JSON.stringify(bhSerializable));
    const vortexSerializable = THEMES.map(t => t.windVortexEvents || null);
    await window.storage.set('windvortex-events-custom', JSON.stringify(vortexSerializable));
    const cloudArcSerializable = THEMES.map(t => t.cloudArcEvents || null);
    await window.storage.set('cloudarc-events-custom', JSON.stringify(cloudArcSerializable));
    const lensSerializable = THEMES.map(t => t.lensingZoneEvents || null);
    await window.storage.set('lensingzone-events-custom', JSON.stringify(lensSerializable));
    const novaSerializable = THEMES.map(t => t.supernovaEvents || null);
    await window.storage.set('supernova-events-custom', JSON.stringify(novaSerializable));
    const turretSerializable = THEMES.map(t => t.turretEvents || null);
    await window.storage.set('turret-events-custom', JSON.stringify(turretSerializable));
    const empSerializable = THEMES.map(t => t.empEvents || null);
    await window.storage.set('emp-events-custom', JSON.stringify(empSerializable));
    const orbSerializable = THEMES.map(t => t.pulsingOrbEvents || null);
    await window.storage.set('orb-events-custom', JSON.stringify(orbSerializable));
    const msgs = [];
    if (autoFixedBolts.length) {
      msgs.push(autoFixedBolts.length + ' bolt(s) were sitting before the zone start (invisible/unreachable in the editor) and were automatically pulled back into view');
      console.warn(autoFixedBolts.join('\n'));
    }
    if (runwayWarnings.length) {
      msgs.push(runwayWarnings.length + ' hazard(s) may vanish before fully exiting -- move them earlier or shrink size');
      console.warn(runwayWarnings.join('\n'));
    }
    setPreviewStatus(msgs.length ? 'Saved, but ' + msgs.join('; ') + '.' : 'Saved!');
    if (autoFixedBolts.length && previewOverlay.classList.contains('active')) {
      previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
      drawZonePreview(previewLastData);
    }
  } catch (e) {
    setPreviewStatus('Save failed (kept in memory only).');
  }
});

document.getElementById('preview-reset').addEventListener('click', () => {
  const th = THEMES[currentPreviewZone];
  let resetSomething = false;
  if (th.obstacleShape === 'lbolt') {
    th.pattern = JSON.parse(JSON.stringify(DEFAULT_LBOLT_PATTERNS[currentPreviewZone]));
    previewSelectedBolt = null;
    resetSomething = true;
  }
  if (th.blackHoleEvents) {
    th.blackHoleEvents = JSON.parse(JSON.stringify(DEFAULT_BLACKHOLE_EVENTS[currentPreviewZone]));
    previewSelectedBlackHole = null;
    previewSelectedWindVortex = null;
    previewSelectedCloudArc = null;
    resetSomething = true;
  }
  if (th.windVortexEvents) {
    th.windVortexEvents = JSON.parse(JSON.stringify(DEFAULT_WINDVORTEX_EVENTS[currentPreviewZone]));
    previewSelectedWindVortex = null;
    previewSelectedCloudArc = null;
    resetSomething = true;
  }
  if (th.lensingZoneEvents) {
    th.lensingZoneEvents = JSON.parse(JSON.stringify(DEFAULT_LENSINGZONE_EVENTS[currentPreviewZone]));
    previewSelectedLensingZone = null;
    resetSomething = true;
  }
  if (th.supernovaEvents) {
    th.supernovaEvents = JSON.parse(JSON.stringify(DEFAULT_SUPERNOVA_EVENTS[currentPreviewZone]));
    previewSelectedSupernova = null;
    previewSelectedTurret = null;
    previewSelectedEmp = null;
    previewSelectedOrb = null;
    resetSomething = true;
  }
  if (th.turretEvents) {
    th.turretEvents = JSON.parse(JSON.stringify(DEFAULT_TURRET_EVENTS[currentPreviewZone]));
    previewSelectedTurret = null;
    previewSelectedEmp = null;
    previewSelectedOrb = null;
    resetSomething = true;
  }
  if (th.empEvents) {
    th.empEvents = JSON.parse(JSON.stringify(DEFAULT_EMP_EVENTS[currentPreviewZone]));
    previewSelectedEmp = null;
    resetSomething = true;
  }
  if (th.pulsingOrbEvents) {
    th.pulsingOrbEvents = JSON.parse(JSON.stringify(DEFAULT_PULSING_ORB_EVENTS[currentPreviewZone]));
    previewSelectedOrb = null;
    resetSomething = true;
  }
  if (!resetSomething) {
    setPreviewStatus('Nothing to reset for this zone.');
    return;
  }
  previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
  updateBoltPanel();
  updateBlackHolePanel();
  updateWindVortexPanel();
  updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
  setPreviewStatus('Reset to default.');
});

previewCanvas.addEventListener('mousedown', (e) => {
  if (!previewEditMode || !previewLastData) return;
  const rect = previewCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const layout = getPreviewLayout();

  let hitBolt = null, hitBlackHole = null, hitWindVortex = null, hitCloudArc = null, hitCloudArcTarget = null, hitLensingZone = null, hitSupernova = null, hitTurret = null, hitEmp = null, hitOrb = null;
  for (const g of previewLastData.obstacles) {
    if (g.type === 'lbolt') {
      const box = boltScreenBox(g, layout);
      if (mx >= box.left && mx <= box.right && my >= box.top && my <= box.bottom) { hitBolt = g; break; }
    } else if (g.type === 'blackhole') {
      const sx = g.x * layout.scale;
      const cy = layout.pTop + ((g.y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * layout.pHeight;
      const vScale = layout.pHeight / (PLAY_BOTTOM - PLAY_TOP);
      const rReach = g.reachR * vScale;
      const dx = mx - sx, dy = my - cy;
      if (dx * dx + dy * dy <= rReach * rReach) { hitBlackHole = g; break; }
    } else if (g.type === 'windvortex') {
      const sx = g.x * layout.scale;
      const cy = layout.pTop + ((g.y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * layout.pHeight;
      const vScale = layout.pHeight / (PLAY_BOTTOM - PLAY_TOP);
      const rReach = g.reachR * vScale;
      const dx = mx - sx, dy = my - cy;
      if (dx * dx + dy * dy <= rReach * rReach) { hitWindVortex = g; break; }
    } else if (g.type === 'cloudarc') {
      const sx1 = g.x * layout.scale;
      const cy1 = layout.pTop + ((g.y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * layout.pHeight;
      const sx2 = g.x2 * layout.scale;
      const cy2 = layout.pTop + ((g.y2 - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * layout.pHeight;
      const d1sq = (mx - sx1) ** 2 + (my - cy1) ** 2;
      const d2sq = (mx - sx2) ** 2 + (my - cy2) ** 2;
      if (d1sq <= 144) { hitCloudArc = g; hitCloudArcTarget = 'left'; break; }
      if (d2sq <= 144) { hitCloudArc = g; hitCloudArcTarget = 'right'; break; }
      // distance from click to the line segment, for grabbing the arc as a whole
      const lineLenSq = (sx2 - sx1) ** 2 + (cy2 - cy1) ** 2 || 1;
      const t = Math.max(0, Math.min(1, ((mx - sx1) * (sx2 - sx1) + (my - cy1) * (cy2 - cy1)) / lineLenSq));
      const projX = sx1 + (sx2 - sx1) * t, projY = cy1 + (cy2 - cy1) * t;
      const distSq = (mx - projX) ** 2 + (my - projY) ** 2;
      if (distSq <= 64) { hitCloudArc = g; hitCloudArcTarget = 'line'; break; }
    } else if (g.type === 'lensingzone') {
      const sx = g.x * layout.scale;
      const cy = layout.pTop + ((g.y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * layout.pHeight;
      const vScale = layout.pHeight / (PLAY_BOTTOM - PLAY_TOP);
      const rZone = g.zoneRadius * vScale;
      const dx = mx - sx, dy = my - cy;
      if (dx * dx + dy * dy <= rZone * rZone) { hitLensingZone = g; break; }
    } else if (g.type === 'supernova') {
      const sx = g.x * layout.scale;
      const cy = layout.pTop + ((g.y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * layout.pHeight;
      const vScale = layout.pHeight / (PLAY_BOTTOM - PLAY_TOP);
      const rPlanet = g.planetR * vScale;
      const dx = mx - sx, dy = my - cy;
      if (dx * dx + dy * dy <= rPlanet * rPlanet) { hitSupernova = g; break; }
    } else if (g.type === 'turret') {
      const sx = g.x * layout.scale;
      const cy = layout.pTop + ((g.y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * layout.pHeight;
      const dx = mx - sx, dy = my - cy;
      if (dx * dx + dy * dy <= 14 * 14) { hitTurret = g; break; }
    } else if (g.type === 'emp') {
      const sx = g.x * layout.scale;
      const anchorY = g.anchor === 'top' ? PLAY_TOP : PLAY_BOTTOM;
      const cy = layout.pTop + ((anchorY - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * layout.pHeight;
      const dx = mx - sx, dy = my - cy;
      if (dx * dx + dy * dy <= 14 * 14) { hitEmp = g; break; }
    } else if (g.type === 'pulsingorb') {
      const sx = g.x * layout.scale;
      const cy = layout.pTop + ((g.y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * layout.pHeight;
      const vScale = layout.pHeight / (PLAY_BOTTOM - PLAY_TOP);
      const midR = (g.minR + g.maxR) / 2 * vScale;
      const dx = mx - sx, dy = my - cy;
      if (dx * dx + dy * dy <= midR * midR) { hitOrb = g; break; }
    }
  }

  if (hitBolt) {
    previewSelectedBlackHole = null;
    previewSelectedWindVortex = null;
    previewSelectedCloudArc = null;
    previewSelectedLensingZone = null;
    previewSelectedSupernova = null;
    previewSelectedTurret = null;
    previewSelectedEmp = null;
    previewSelectedOrb = null;
    previewSelectedBolt = hitBolt;
    const box = boltScreenBox(hitBolt, layout);
    const nearHandle = Math.abs(mx - box.right) < 10 && Math.abs(my - box.bottom) < 10;
    previewDragMode = nearHandle ? 'resize' : 'move';

    const th = THEMES[currentPreviewZone];
    const srcBolt = th.pattern[hitBolt._entryIdx].bolts[hitBolt._boltIdx];
    previewDragStart = {
      mx, my, entryIdx: hitBolt._entryIdx, boltIdx: hitBolt._boltIdx,
      origYFrac: srcBolt.yFrac, origXJitter: srcBolt.xJitter,
      origHeightFrac: srcBolt.heightFrac, origSwingWidthPx: srcBolt.swingWidthPx
    };
    updateBoltPanel();
    updateBlackHolePanel();
    updateWindVortexPanel();
    updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
    drawZonePreview(previewLastData);
    return;
  }

  if (hitBlackHole) {
    previewSelectedBolt = null;
    previewSelectedLensingZone = null;
    previewSelectedSupernova = null;
    previewSelectedTurret = null;
    previewSelectedEmp = null;
    previewSelectedOrb = null;
    previewSelectedBlackHole = hitBlackHole;
    const sx = hitBlackHole.x * layout.scale;
    const cy = layout.pTop + ((hitBlackHole.y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * layout.pHeight;
    const vScale = layout.pHeight / (PLAY_BOTTOM - PLAY_TOP);
    const rCore = hitBlackHole.coreR * vScale;
    const rReach = hitBlackHole.reachR * vScale;
    const nearCoreHandle = Math.abs(mx - (sx + rCore)) < 10 && Math.abs(my - cy) < 10;
    const nearReachHandle = Math.abs(mx - (sx + rReach)) < 10 && Math.abs(my - cy) < 10;
    previewDragMode = nearCoreHandle ? 'resizeCore' : (nearReachHandle ? 'resizeReach' : 'move');

    const th = THEMES[currentPreviewZone];
    const srcEvent = th.blackHoleEvents[hitBlackHole._eventIdx];
    previewDragStart = {
      mx, my, eventIdx: hitBlackHole._eventIdx,
      origYFrac: srcEvent.yFrac, origTriggerDistance: srcEvent.triggerDistance,
      origCoreR: srcEvent.coreR, origReachR: srcEvent.reachR
    };
    updateBoltPanel();
    updateBlackHolePanel();
    updateWindVortexPanel();
    updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
    drawZonePreview(previewLastData);
    return;
  }

  if (hitWindVortex) {
    previewSelectedBolt = null;
    previewSelectedBlackHole = null;
    previewSelectedWindVortex = null;
    previewSelectedCloudArc = null;
    previewSelectedLensingZone = null;
    previewSelectedSupernova = null;
    previewSelectedTurret = null;
    previewSelectedEmp = null;
    previewSelectedOrb = null;
    previewSelectedWindVortex = hitWindVortex;
    const sx = hitWindVortex.x * layout.scale;
    const cy = layout.pTop + ((hitWindVortex.y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * layout.pHeight;
    const vScale = layout.pHeight / (PLAY_BOTTOM - PLAY_TOP);
    const rReach = hitWindVortex.reachR * vScale;
    const nearReachHandle = Math.abs(mx - (sx + rReach)) < 10 && Math.abs(my - cy) < 10;
    previewDragMode = nearReachHandle ? 'resizeReach' : 'move';

    const th = THEMES[currentPreviewZone];
    const srcEvent = th.windVortexEvents[hitWindVortex._vortexIdx];
    previewDragStart = {
      mx, my, vortexIdx: hitWindVortex._vortexIdx,
      origYFrac: srcEvent.yFrac, origTriggerDistance: srcEvent.triggerDistance,
      origReachR: srcEvent.reachR
    };
    updateBoltPanel();
    updateBlackHolePanel();
    updateWindVortexPanel();
    updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
    drawZonePreview(previewLastData);
    return;
  }

  if (hitCloudArc) {
    previewSelectedBolt = null;
    previewSelectedBlackHole = null;
    previewSelectedWindVortex = null;
    previewSelectedCloudArc = null;
    previewSelectedLensingZone = null;
    previewSelectedSupernova = null;
    previewSelectedTurret = null;
    previewSelectedEmp = null;
    previewSelectedOrb = null;
    previewSelectedCloudArc = hitCloudArc;
    previewDragMode = hitCloudArcTarget === 'left' ? 'moveLeft' : hitCloudArcTarget === 'right' ? 'moveRight' : 'moveBoth';

    const th = THEMES[currentPreviewZone];
    const srcEvent = th.cloudArcEvents[hitCloudArc._arcIdx];
    previewDragStart = {
      mx, my, arcIdx: hitCloudArc._arcIdx,
      origY1Frac: srcEvent.y1Frac, origY2Frac: srcEvent.y2Frac,
      origTriggerDistance: srcEvent.triggerDistance, origSpanPx: srcEvent.spanPx
    };
    updateBoltPanel();
    updateBlackHolePanel();
    updateWindVortexPanel();
    updateCloudArcPanel();
    updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
    drawZonePreview(previewLastData);
    return;
  }

  if (hitLensingZone) {
    previewSelectedBolt = null;
    previewSelectedBlackHole = null;
    previewSelectedWindVortex = null;
    previewSelectedCloudArc = null;
    previewSelectedSupernova = null;
    previewSelectedTurret = null;
    previewSelectedEmp = null;
    previewSelectedOrb = null;
    previewSelectedLensingZone = hitLensingZone;
    const sx = hitLensingZone.x * layout.scale;
    const cy = layout.pTop + ((hitLensingZone.y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * layout.pHeight;
    const vScale = layout.pHeight / (PLAY_BOTTOM - PLAY_TOP);
    const rCore = hitLensingZone.coreR * vScale;
    const rZone = hitLensingZone.zoneRadius * vScale;
    const nearCoreHandle = Math.abs(mx - (sx + rCore)) < 10 && Math.abs(my - cy) < 10;
    const nearZoneHandle = Math.abs(mx - (sx + rZone)) < 10 && Math.abs(my - cy) < 10;
    previewDragMode = nearCoreHandle ? 'resizeLensCore' : (nearZoneHandle ? 'resizeLensZone' : 'moveLens');

    const th = THEMES[currentPreviewZone];
    const srcEvent = th.lensingZoneEvents[hitLensingZone._lensIdx];
    previewDragStart = {
      mx, my, lensIdx: hitLensingZone._lensIdx,
      origYFrac: srcEvent.yFrac, origTriggerDistance: srcEvent.triggerDistance,
      origCoreR: srcEvent.coreR, origZoneRadius: srcEvent.zoneRadius
    };
    updateBoltPanel();
    updateBlackHolePanel();
    updateWindVortexPanel();
    updateCloudArcPanel();
    updateLensingZonePanel();
    updateSupernovaPanel();
    updateTurretPanel();
    updateEmpPanel();
    updateOrbPanel();
    drawZonePreview(previewLastData);
    return;
  }

  if (hitSupernova) {
    previewSelectedBolt = null;
    previewSelectedBlackHole = null;
    previewSelectedWindVortex = null;
    previewSelectedCloudArc = null;
    previewSelectedLensingZone = null;
    previewSelectedSupernova = hitSupernova;
    const sx = hitSupernova.x * layout.scale;
    const cy = layout.pTop + ((hitSupernova.y - PLAY_TOP) / (PLAY_BOTTOM - PLAY_TOP)) * layout.pHeight;
    const vScale = layout.pHeight / (PLAY_BOTTOM - PLAY_TOP);
    const rPlanet = hitSupernova.planetR * vScale;
    const nearPlanetHandle = Math.abs(mx - (sx + rPlanet)) < 10 && Math.abs(my - cy) < 10;
    previewDragMode = nearPlanetHandle ? 'resizeNovaPlanet' : 'moveNova';

    const th = THEMES[currentPreviewZone];
    const srcEvent = th.supernovaEvents[hitSupernova._novaIdx];
    previewDragStart = {
      mx, my, novaIdx: hitSupernova._novaIdx,
      origYFrac: srcEvent.yFrac, origTriggerDistance: srcEvent.triggerDistance,
      origPlanetR: srcEvent.planetR
    };
    updateBoltPanel();
    updateBlackHolePanel();
    updateWindVortexPanel();
    updateCloudArcPanel();
    updateLensingZonePanel();
    updateSupernovaPanel();
    updateTurretPanel();
    updateEmpPanel();
    updateOrbPanel();
    drawZonePreview(previewLastData);
    return;
  }

  if (hitTurret) {
    previewSelectedBolt = null;
    previewSelectedBlackHole = null;
    previewSelectedWindVortex = null;
    previewSelectedCloudArc = null;
    previewSelectedLensingZone = null;
    previewSelectedSupernova = null;
    previewSelectedTurret = hitTurret;
    previewDragMode = 'moveTurret';

    const th = THEMES[currentPreviewZone];
    const srcEvent = th.turretEvents[hitTurret._turretIdx];
    previewDragStart = {
      mx, my, turretIdx: hitTurret._turretIdx,
      origTriggerDistance: srcEvent.triggerDistance
    };
    updateBoltPanel();
    updateBlackHolePanel();
    updateWindVortexPanel();
    updateCloudArcPanel();
    updateLensingZonePanel();
    updateSupernovaPanel();
    updateTurretPanel();
    updateEmpPanel();
    updateOrbPanel();
    drawZonePreview(previewLastData);
    return;
  }

  if (hitEmp) {
    previewSelectedBolt = null;
    previewSelectedBlackHole = null;
    previewSelectedWindVortex = null;
    previewSelectedCloudArc = null;
    previewSelectedLensingZone = null;
    previewSelectedSupernova = null;
    previewSelectedTurret = null;
    previewSelectedEmp = hitEmp;
    previewSelectedOrb = null;
    previewDragMode = 'moveEmp';

    const th = THEMES[currentPreviewZone];
    const srcEvent = th.empEvents[hitEmp._empIdx];
    previewDragStart = {
      mx, my, empIdx: hitEmp._empIdx,
      origTriggerDistance: srcEvent.triggerDistance
    };
    updateBoltPanel();
    updateBlackHolePanel();
    updateWindVortexPanel();
    updateCloudArcPanel();
    updateLensingZonePanel();
    updateSupernovaPanel();
    updateTurretPanel();
    updateEmpPanel();
    updateOrbPanel();
    drawZonePreview(previewLastData);
    return;
  }

  if (hitOrb) {
    previewSelectedBolt = null;
    previewSelectedBlackHole = null;
    previewSelectedWindVortex = null;
    previewSelectedCloudArc = null;
    previewSelectedLensingZone = null;
    previewSelectedSupernova = null;
    previewSelectedTurret = null;
    previewSelectedEmp = null;
    previewSelectedOrb = hitOrb;
    previewDragMode = 'moveOrb';

    const th = THEMES[currentPreviewZone];
    const srcEvent = th.pulsingOrbEvents[hitOrb._orbIdx];
    previewDragStart = {
      mx, my, orbIdx: hitOrb._orbIdx,
      origTriggerDistance: srcEvent.triggerDistance
    };
    updateBoltPanel();
    updateBlackHolePanel();
    updateWindVortexPanel();
    updateCloudArcPanel();
    updateLensingZonePanel();
    updateSupernovaPanel();
    updateTurretPanel();
    updateEmpPanel();
    updateOrbPanel();
    drawZonePreview(previewLastData);
    return;
  }

  previewSelectedBolt = null;
  previewSelectedBlackHole = null;
  previewSelectedWindVortex = null;
  previewSelectedCloudArc = null;
  previewSelectedLensingZone = null;
  previewSelectedSupernova = null;
  previewSelectedTurret = null;
  previewSelectedEmp = null;
  previewSelectedOrb = null;
  updateBoltPanel();
  updateBlackHolePanel();
  updateWindVortexPanel();
  updateCloudArcPanel();
  updateLensingZonePanel();
  updateSupernovaPanel();
  updateTurretPanel();
  updateEmpPanel();
  updateOrbPanel();
  drawZonePreview(previewLastData);
});

window.addEventListener('mousemove', (e) => {
  if (!previewEditMode || !previewDragStart) return;
  const rect = previewCanvas.getBoundingClientRect();
  const mx = e.clientX - rect.left;
  const my = e.clientY - rect.top;
  const layout = getPreviewLayout();
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const th = THEMES[currentPreviewZone];
  // captureFullZoneRun re-runs the real game engine end-to-end (needed for
  // accuracy) which costs tens of milliseconds -- throttle how often that
  // full refresh fires during continuous mousemove drag events so dragging
  // stays responsive; the underlying data itself still updates every event,
  // and mouseup always forces one final untouched refresh
  const now = performance.now();
  const throttled = (now - previewMoveThrottleTs) < PREVIEW_MOVE_THROTTLE_MS;
  if (!throttled) previewMoveThrottleTs = now;

  if (previewSelectedBolt) {
    const srcBolt = th.pattern[previewDragStart.entryIdx].bolts[previewDragStart.boltIdx];
    if (previewDragMode === 'move') {
      const dxWorld = (mx - previewDragStart.mx) / layout.scale;
      const dyFrac = (my - previewDragStart.my) / layout.pHeight;
      srcBolt.xJitter = Math.round(previewDragStart.origXJitter + dxWorld);
      srcBolt.yFrac = Math.max(0.02, Math.min(0.98, previewDragStart.origYFrac + dyFrac));
    } else if (previewDragMode === 'resize') {
      const dxScreen = mx - previewDragStart.mx;
      const dyScreen = my - previewDragStart.my;
      const newSwing = Math.max(16, previewDragStart.origSwingWidthPx + (dxScreen / layout.scale) * 2);
      const newHeightPx = Math.max(20, previewDragStart.origHeightFrac * playHeight + (dyScreen / layout.pHeight) * playHeight);
      srcBolt.swingWidthPx = Math.round(newSwing);
      srcBolt.heightFrac = Math.max(0.05, Math.min(0.85, newHeightPx / playHeight));
    }
    if (!throttled) {
    previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
    let draggedBolt = previewLastData.obstacles.find(g => g._entryIdx === previewDragStart.entryIdx && g._boltIdx === previewDragStart.boltIdx) || null;
    // a bolt dragged far enough left can end up with an effective
    // zone-progress before 0 -- it would still exist and be dangerous in
    // real gameplay (it's part of the zone's initial spawn), but the editor
    // canvas can't render or scroll to negative coordinates at all, making
    // it permanently invisible/unreachable in the editor from that point on.
    // pull it back to zone-progress 0 instead of allowing that dead end.
    if (draggedBolt && draggedBolt.x < 0 && previewDragMode === 'move') {
      srcBolt.xJitter += Math.round(-draggedBolt.x + 10); // shift right so it lands at zone-progress ~1, just inside the visible/reachable range
      previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
      draggedBolt = previewLastData.obstacles.find(g => g._entryIdx === previewDragStart.entryIdx && g._boltIdx === previewDragStart.boltIdx) || null;
    }
    previewSelectedBolt = draggedBolt;
    drawZonePreview(previewLastData);
    }
  } else if (previewSelectedBlackHole) {
    const srcEvent = th.blackHoleEvents[previewDragStart.eventIdx];
    if (previewDragMode === 'move') {
      const dxWorld = (mx - previewDragStart.mx) / layout.scale; // preview px -> distance*10 units
      const dyFrac = (my - previewDragStart.my) / layout.pHeight;
      srcEvent.triggerDistance = Math.max(20, Math.min(980, previewDragStart.origTriggerDistance + dxWorld / 10));
      srcEvent.yFrac = Math.max(0, Math.min(1, previewDragStart.origYFrac + dyFrac));
    } else if (previewDragMode === 'resizeCore') {
      const dxScreen = mx - previewDragStart.mx;
      const pxPerScreenPx = (PLAY_BOTTOM - PLAY_TOP) / layout.pHeight;
      const newCoreR = Math.max(20, previewDragStart.origCoreR + dxScreen * pxPerScreenPx);
      // keep reach comfortably larger than core so the graduated pull
      // field always means something
      srcEvent.coreR = Math.round(newCoreR);
      srcEvent.reachR = Math.max(srcEvent.reachR, Math.round(newCoreR * 1.2));
    } else if (previewDragMode === 'resizeReach') {
      const dxScreen = mx - previewDragStart.mx;
      const pxPerScreenPx = (PLAY_BOTTOM - PLAY_TOP) / layout.pHeight;
      const newReachR = Math.max(srcEvent.coreR * 1.15, previewDragStart.origReachR + dxScreen * pxPerScreenPx);
      srcEvent.reachR = Math.round(newReachR);
    }
    if (!throttled) {
    previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
    previewSelectedBlackHole = previewLastData.obstacles.find(g => g._eventIdx === previewDragStart.eventIdx) || null;
    drawZonePreview(previewLastData);
    }
  } else if (previewSelectedWindVortex) {
    const srcEvent = th.windVortexEvents[previewDragStart.vortexIdx];
    if (previewDragMode === 'move') {
      const dxWorld = (mx - previewDragStart.mx) / layout.scale;
      const dyFrac = (my - previewDragStart.my) / layout.pHeight;
      srcEvent.triggerDistance = Math.max(20, Math.min(980, previewDragStart.origTriggerDistance + dxWorld / 10));
      srcEvent.yFrac = Math.max(0, Math.min(1, previewDragStart.origYFrac + dyFrac));
    } else if (previewDragMode === 'resizeReach') {
      const dxScreen = mx - previewDragStart.mx;
      const pxPerScreenPx = (PLAY_BOTTOM - PLAY_TOP) / layout.pHeight;
      const newReachR = Math.max(60, previewDragStart.origReachR + dxScreen * pxPerScreenPx);
      srcEvent.reachR = Math.round(newReachR);
    }
    if (!throttled) {
    previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
    previewSelectedWindVortex = previewLastData.obstacles.find(g => g.type === 'windvortex' && g._vortexIdx === previewDragStart.vortexIdx) || null;
    drawZonePreview(previewLastData);
    }
  } else if (previewSelectedCloudArc) {
    const srcEvent = th.cloudArcEvents[previewDragStart.arcIdx];
    if (previewDragMode === 'moveLeft') {
      const dxWorld = (mx - previewDragStart.mx) / layout.scale;
      const dyFrac = (my - previewDragStart.my) / layout.pHeight;
      const newTrigger = Math.max(20, Math.min(980, previewDragStart.origTriggerDistance + dxWorld / 10));
      // keep the right cloud's absolute position fixed while dragging the
      // left one -- span is defined relative to the left, so shifting
      // triggerDistance alone would otherwise also drag the right cloud
      srcEvent.spanPx = Math.max(60, previewDragStart.origSpanPx - (newTrigger - previewDragStart.origTriggerDistance) * 10);
      srcEvent.triggerDistance = newTrigger;
      srcEvent.y1Frac = Math.max(0, Math.min(1, previewDragStart.origY1Frac + dyFrac));
    } else if (previewDragMode === 'moveRight') {
      const dxScreen = mx - previewDragStart.mx;
      const pxPerScreenPx = (PLAY_BOTTOM - PLAY_TOP) / layout.pHeight; // reuse vertical px-per-screenpx as a stand-in scale reference
      const dxWorld = dxScreen / layout.scale;
      const dyFrac = (my - previewDragStart.my) / layout.pHeight;
      srcEvent.spanPx = Math.max(60, previewDragStart.origSpanPx + dxWorld);
      srcEvent.y2Frac = Math.max(0, Math.min(1, previewDragStart.origY2Frac + dyFrac));
    } else if (previewDragMode === 'moveBoth') {
      const dxWorld = (mx - previewDragStart.mx) / layout.scale;
      srcEvent.triggerDistance = Math.max(20, Math.min(980, previewDragStart.origTriggerDistance + dxWorld / 10));
    }
    if (!throttled) {
    previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
    previewSelectedCloudArc = previewLastData.obstacles.find(g => g.type === 'cloudarc' && g._arcIdx === previewDragStart.arcIdx) || null;
    drawZonePreview(previewLastData);
    }
  } else if (previewSelectedLensingZone) {
    const srcEvent = th.lensingZoneEvents[previewDragStart.lensIdx];
    if (previewDragMode === 'moveLens') {
      const dxWorld = (mx - previewDragStart.mx) / layout.scale;
      const dyFrac = (my - previewDragStart.my) / layout.pHeight;
      srcEvent.triggerDistance = Math.max(20, Math.min(980, previewDragStart.origTriggerDistance + dxWorld / 10));
      srcEvent.yFrac = Math.max(0, Math.min(1, previewDragStart.origYFrac + dyFrac));
    } else if (previewDragMode === 'resizeLensCore') {
      const dxScreen = mx - previewDragStart.mx;
      const pxPerScreenPx = (PLAY_BOTTOM - PLAY_TOP) / layout.pHeight;
      const newCoreR = Math.max(4, previewDragStart.origCoreR + dxScreen * pxPerScreenPx);
      srcEvent.coreR = Math.round(newCoreR);
      srcEvent.zoneRadius = Math.max(srcEvent.zoneRadius, Math.round(newCoreR * 3));
    } else if (previewDragMode === 'resizeLensZone') {
      const dxScreen = mx - previewDragStart.mx;
      const pxPerScreenPx = (PLAY_BOTTOM - PLAY_TOP) / layout.pHeight;
      const newZoneR = Math.max(srcEvent.coreR * 2, previewDragStart.origZoneRadius + dxScreen * pxPerScreenPx);
      srcEvent.zoneRadius = Math.round(newZoneR);
    }
    if (!throttled) {
    previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
    previewSelectedLensingZone = previewLastData.obstacles.find(g => g._lensIdx === previewDragStart.lensIdx) || null;
    drawZonePreview(previewLastData);
    }
  } else if (previewSelectedSupernova) {
    const srcEvent = th.supernovaEvents[previewDragStart.novaIdx];
    if (previewDragMode === 'moveNova') {
      const dxWorld = (mx - previewDragStart.mx) / layout.scale;
      const dyFrac = (my - previewDragStart.my) / layout.pHeight;
      srcEvent.triggerDistance = Math.max(20, Math.min(980, previewDragStart.origTriggerDistance + dxWorld / 10));
      srcEvent.yFrac = Math.max(0, Math.min(1, previewDragStart.origYFrac + dyFrac));
    } else if (previewDragMode === 'resizeNovaPlanet') {
      const dxScreen = mx - previewDragStart.mx;
      const pxPerScreenPx = (PLAY_BOTTOM - PLAY_TOP) / layout.pHeight;
      const newPlanetR = Math.max(40, previewDragStart.origPlanetR + dxScreen * pxPerScreenPx);
      srcEvent.planetR = Math.round(newPlanetR);
    }
    if (!throttled) {
    previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
    previewSelectedSupernova = previewLastData.obstacles.find(g => g._novaIdx === previewDragStart.novaIdx) || null;
    drawZonePreview(previewLastData);
    }
  } else if (previewSelectedTurret) {
    const srcEvent = th.turretEvents[previewDragStart.turretIdx];
    if (previewDragMode === 'moveTurret') {
      const dxWorld = (mx - previewDragStart.mx) / layout.scale;
      srcEvent.triggerDistance = Math.max(20, Math.min(980, previewDragStart.origTriggerDistance + dxWorld / 10));
    }
    if (!throttled) {
    previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
    previewSelectedTurret = previewLastData.obstacles.find(g => g._turretIdx === previewDragStart.turretIdx) || null;
    drawZonePreview(previewLastData);
    }
  } else if (previewSelectedEmp) {
    const srcEvent = th.empEvents[previewDragStart.empIdx];
    if (previewDragMode === 'moveEmp') {
      const dxWorld = (mx - previewDragStart.mx) / layout.scale;
      srcEvent.triggerDistance = Math.max(20, Math.min(980, previewDragStart.origTriggerDistance + dxWorld / 10));
    }
    if (!throttled) {
    previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
    previewSelectedEmp = previewLastData.obstacles.find(g => g._empIdx === previewDragStart.empIdx) || null;
    drawZonePreview(previewLastData);
    }
  } else if (previewSelectedOrb) {
    const srcEvent = th.pulsingOrbEvents[previewDragStart.orbIdx];
    if (previewDragMode === 'moveOrb') {
      const dxWorld = (mx - previewDragStart.mx) / layout.scale;
      srcEvent.triggerDistance = Math.max(20, Math.min(980, previewDragStart.origTriggerDistance + dxWorld / 10));
    }
    if (!throttled) {
    previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
    previewSelectedOrb = previewLastData.obstacles.find(g => g._orbIdx === previewDragStart.orbIdx) || null;
    drawZonePreview(previewLastData);
    }
  }
});

window.addEventListener('mouseup', () => {
  if (previewDragStart) {
    // the throttle may have skipped refreshing on the very last mousemove
    // before release -- force one final, accurate refresh now. the
    // underlying data itself was never throttled (only this visual
    // refresh was), and isSelected checks match by _idx fields rather
    // than object identity, so existing selection state stays correctly
    // linked to the freshly captured data
    previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
    // same negative-position clamp as the mousemove handler -- this is the
    // actual final, definitive state, so it needs its own check regardless
    // of whether the in-progress drag ever hit the throttled clamp above
    if (previewSelectedBolt && previewDragMode === 'move') {
      const th = THEMES[currentPreviewZone];
      const srcBolt = th.pattern[previewDragStart.entryIdx].bolts[previewDragStart.boltIdx];
      let draggedBolt = previewLastData.obstacles.find(g => g._entryIdx === previewDragStart.entryIdx && g._boltIdx === previewDragStart.boltIdx) || null;
      if (draggedBolt && draggedBolt.x < 0) {
        srcBolt.xJitter += Math.round(-draggedBolt.x + 10);
        previewLastData = captureFullZoneRun(currentPreviewZone, 1000);
      }
    }
    drawZonePreview(previewLastData);
  }
  previewDragMode = null;
  previewDragStart = null;
});

function runPreview(themeIdx) {
  setPreviewStatus('Simulating...');
  document.querySelectorAll('.preview-zone-btn').forEach(b => {
    b.classList.toggle('active', parseInt(b.dataset.zone, 10) === themeIdx);
  });
  requestAnimationFrame(() => {
    previewLastData = captureFullZoneRun(themeIdx, 1000);
    drawZonePreview(previewLastData);
    setPreviewStatus(THEMES[themeIdx].name + ' -- 0 to 1000 distance');
  });
}

// custom saved data (bolt patterns, vortex/black-hole/etc events) loads
// asynchronously from storage. if the user opens the level editor before
// that load finishes, the preview renders from the not-yet-updated default
// data while gameplay -- played moments later, after the load completes --
// correctly reflects their saved edits, making the two appear out of sync
// even though nothing is actually wrong. re-render the preview once loading
// finishes so it always reflects whatever data is actually current.
function refreshPreviewIfOpen() {
  if (previewOverlay.classList.contains('active')) runPreview(currentPreviewZone);
}

const CUSTOM_LEVEL_APPLIERS = {
  'bolt-patterns-custom': (t, data) => { if (t.obstacleShape === 'lbolt') t.pattern = data; },
  'blackhole-events-custom': (t, data) => { if (t.blackHoleEvents) t.blackHoleEvents = data; },
  'windvortex-events-custom': (t, data) => { if (t.windVortexEvents) t.windVortexEvents = data; },
  'cloudarc-events-custom': (t, data) => { if (t.cloudArcEvents) t.cloudArcEvents = data; },
  'lensingzone-events-custom': (t, data) => { if (t.lensingZoneEvents) t.lensingZoneEvents = data; },
  'supernova-events-custom': (t, data) => { if (t.supernovaEvents) t.supernovaEvents = data; },
  'turret-events-custom': (t, data) => { if (t.turretEvents) t.turretEvents = data; },
  'emp-events-custom': (t, data) => { if (t.empEvents) t.empEvents = data; },
  'orb-events-custom': (t, data) => { if (t.pulsingOrbEvents) t.pulsingOrbEvents = data; }
};

function applyCustomLevelArray(apply, data) {
  if (!apply || !data) return;
  THEMES.forEach((t, i) => {
    if (data[i]) apply(t, data[i]);
  });
}

function snapshotDefaultCustomLayouts() {
  THEMES.forEach((t, i) => {
    if (t.obstacleShape === 'lbolt') DEFAULT_LBOLT_PATTERNS[i] = JSON.parse(JSON.stringify(t.pattern));
    if (t.blackHoleEvents) DEFAULT_BLACKHOLE_EVENTS[i] = JSON.parse(JSON.stringify(t.blackHoleEvents));
    if (t.windVortexEvents) DEFAULT_WINDVORTEX_EVENTS[i] = JSON.parse(JSON.stringify(t.windVortexEvents));
    if (t.lensingZoneEvents) DEFAULT_LENSINGZONE_EVENTS[i] = JSON.parse(JSON.stringify(t.lensingZoneEvents));
    if (t.supernovaEvents) DEFAULT_SUPERNOVA_EVENTS[i] = JSON.parse(JSON.stringify(t.supernovaEvents));
    if (t.turretEvents) DEFAULT_TURRET_EVENTS[i] = JSON.parse(JSON.stringify(t.turretEvents));
    if (t.empEvents) DEFAULT_EMP_EVENTS[i] = JSON.parse(JSON.stringify(t.empEvents));
    if (t.pulsingOrbEvents) DEFAULT_PULSING_ORB_EVENTS[i] = JSON.parse(JSON.stringify(t.pulsingOrbEvents));
  });
}

async function applyAllCustomLevelData() {
  const shipped = window.SHIPPED_CUSTOM_LEVELS;
  const shippedVersion = shipped && shipped._version;
  let storedVersion = null;
  try {
    const result = await window.storage.get('custom-levels-version');
    storedVersion = result && result.value;
  } catch (e) { /* missing host storage */ }
  const storageIsCurrent = !!(shippedVersion && storedVersion === shippedVersion);

  if (shipped) {
    for (const [key, apply] of Object.entries(CUSTOM_LEVEL_APPLIERS)) {
      applyCustomLevelArray(apply, shipped[key]);
    }
  }
  if (storageIsCurrent) {
    for (const [key, apply] of Object.entries(CUSTOM_LEVEL_APPLIERS)) {
      const { data, fromStorage } = await readCustomLevelKey(key);
      if (!data || !fromStorage) continue;
      applyCustomLevelArray(apply, data);
    }
  } else if (shipped) {
    for (const key of Object.keys(CUSTOM_LEVEL_APPLIERS)) {
      if (!shipped[key]) continue;
      try { await window.storage.set(key, JSON.stringify(shipped[key])); } catch (e) { /* read-only */ }
    }
    if (shippedVersion) {
      try { await window.storage.set('custom-levels-version', shippedVersion); } catch (e) { /* read-only */ }
    }
  } else {
    for (const [key, apply] of Object.entries(CUSTOM_LEVEL_APPLIERS)) {
      const { data, fromStorage } = await readCustomLevelKey(key);
      if (!data) continue;
      if (!fromStorage) {
        try { await window.storage.set(key, JSON.stringify(data)); } catch (e) { /* read-only */ }
      }
      applyCustomLevelArray(apply, data);
    }
  }
  snapshotDefaultCustomLayouts();
  refreshPreviewIfOpen();
}
applyAllCustomLevelData();

window.addEventListener('resize', () => {
  if (previewOverlay.classList.contains('active')) runPreview(currentPreviewZone);
});

loadCustomTerrain();

const SIM_HZ = 60;
const SIM_STEP_MS = 1000 / SIM_HZ;
const MAX_SIM_STEPS = 5;
let simLastNow = 0;

function loop() {
  const now = performance.now();
  if (!isPortraitBlocked) {
    try {
      let elapsed = simLastNow ? now - simLastNow : SIM_STEP_MS;
      simLastNow = now;
      if (!isFinite(elapsed) || elapsed < 0) elapsed = SIM_STEP_MS;
      if (elapsed > 100) elapsed = 100;

      if (state === 'playing' || state === 'victory') {
        // One tick per paint so a 120/144Hz Cursor panel stays at the
        // speed this game was tuned for. Extra ticks only when a frame
        // actually ran long (typical ~30fps fullscreen Chrome).
        let steps = 1;
        if (elapsed > 20) {
          steps = Math.min(MAX_SIM_STEPS, Math.round(elapsed / SIM_STEP_MS));
          if (steps < 1) steps = 1;
        }
        for (let i = 0; i < steps; i++) update();
      } else {
        update();
      }
      draw();
    } catch (err) {
      console.error('Synth Flight frame error', err);
      try { updateOverlay(); } catch (overlayErr) { /* keep rAF alive */ }
    }
  } else {
    simLastNow = now;
  }
  requestAnimationFrame(loop);
}

window.addEventListener('resize', checkOrientation);
window.addEventListener('orientationchange', checkOrientation);

try {
  checkOrientation();
  resetGame();
  state = 'home';
  updateOverlay();
  window.SYNTH_FLIGHT_BOOTED = true;
  loop();
} catch (e) {
  window.SYNTH_FLIGHT_BOOTED = true;
  overlay.innerHTML = '<div id="subtitle" style="max-width:640px; font-size:14px; color:#ff2079; pointer-events:auto;">Startup error: ' + String(e && e.stack ? e.stack : e) + '</div>';
}

