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

function stormBoltRng(seed) {
  let s = (seed >>> 0) || 1;
  return function () {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function stormChargeBoltGeometry(lockedY, seed) {
  const rand = stormBoltRng((seed || 1) ^ (((lockedY * 97) | 0) + 0x51ed));
  const minY = PLAY_TOP + 10;
  const maxY = PLAY_BOTTOM - 10;
  const clampY = (y) => Math.max(minY, Math.min(maxY, y));
  let pts = [
    [0, clampY(lockedY + (rand() - 0.5) * 10)],
    [W, clampY(lockedY + (rand() - 0.5) * 22)]
  ];
  let disp = 58;
  for (let pass = 0; pass < 5; pass++) {
    const next = [pts[0]];
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i];
      const b = pts[i + 1];
      const mx = (a[0] + b[0]) * 0.5;
      const my = (a[1] + b[1]) * 0.5;
      const dx = b[0] - a[0];
      const dy = b[1] - a[1];
      const len = Math.hypot(dx, dy) || 1;
      const offset = (rand() * 2 - 1) * disp;
      next.push([mx - (dy / len) * offset * 0.18, clampY(my + (dx / len) * offset)]);
      next.push(b);
    }
    pts = next;
    disp *= 0.46;
  }
  const forks = [];
  const forkCount = 4 + Math.floor(rand() * 3);
  for (let f = 0; f < forkCount; f++) {
    const idx = 4 + Math.floor(rand() * (pts.length - 10));
    const [sx, sy] = pts[idx];
    const [nx, ny] = pts[Math.min(pts.length - 1, idx + 1)];
    const ang = Math.atan2(ny - sy, nx - sx) + (rand() > 0.5 ? 1 : -1) * (0.5 + rand() * 0.85);
    const branch = [[sx, sy]];
    let bx = sx;
    let by = sy;
    let len = 22 + rand() * 44;
    const segs = 3 + Math.floor(rand() * 3);
    for (let k = 0; k < segs; k++) {
      const jag = (rand() - 0.5) * 0.7;
      bx += Math.cos(ang + jag) * len;
      by = clampY(by + Math.sin(ang + jag) * len);
      branch.push([bx, by]);
      len *= 0.68;
    }
    forks.push(branch);
  }
  return { pts, forks };
}

function getStormChargeBoltGeometry(g) {
  if (g.boltGeom && g.boltGeom.pts && g.boltGeom.pts.length) return g.boltGeom;
  g.boltGeom = stormChargeBoltGeometry(g.lockedY, g.boltSeed || 1);
  return g.boltGeom;
}

function stormBoltRevealCount(len, t) {
  return Math.max(2, Math.min(len, Math.ceil(Math.max(0, t) * (len - 1)) + 1));
}

function spawnStormChargeBoltEvent(eventIndex) {
  const th = currentTheme();
  const entry = th.lightningStrikeEvents[eventIndex];
  const playHeight = PLAY_BOTTOM - PLAY_TOP;
  const lockedY = PLAY_TOP + playHeight * (entry.yFrac != null ? entry.yFrac : 0.38);
  const boltSeed = ((eventIndex + 1) * 9176) ^ (frame * 13) ^ 0xa5a5;
  gates.push({
    type: 'stormchargebolttelegraph',
    x: ship.x + EVENT_SPAWN_OFFSET,
    lockedY,
    boltSeed,
    boltGeom: stormChargeBoltGeometry(lockedY, boltSeed),
    spawnFrame: frame,
    warningFrames: entry.telegraphFrames || 84,
    fireDuration: entry.fireFrames || 42,
    thickness: entry.thickness || 12,
    resolved: false,
    passed: false
  });
  sfxHazardFire('stormchargebolttelegraph');
}

function fireStormChargeBolt(g) {
  gates.push({
    type: 'stormchargebolt',
    x: g.x,
    lockedY: g.lockedY,
    boltSeed: g.boltSeed,
    boltGeom: g.boltGeom || stormChargeBoltGeometry(g.lockedY, g.boltSeed || 1),
    spawnFrame: frame,
    fireDuration: g.fireDuration,
    thickness: g.thickness,
    passed: false
  });
  playStormThunderStrike();
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
  const doorGapPx = entry.doorGapPx != null ? entry.doorGapPx : 500;
  const doorX = ship.x + EVENT_SPAWN_OFFSET + doorGapPx;

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
  lightningStrikeEventsSpawned = currentTheme().lightningStrikeEvents ? currentTheme().lightningStrikeEvents.map(() => false) : [];
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
  prefetchThemeBgm(zoneIndex);
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
    else if (action === 'open-zone-select') { zoneSelectPreviewIdx = 0; state = 'zone-select'; prefetchThemeBgm(0); }
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
        prefetchThemeBgm(idx);
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
  prefetchThemeBgm(nextThemeIndex);
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

