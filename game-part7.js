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

