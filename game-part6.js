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

