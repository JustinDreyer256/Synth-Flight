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

