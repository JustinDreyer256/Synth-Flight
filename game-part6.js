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

