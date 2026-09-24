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

const BGM_FILE_TRACKS = [
  { id: 'bgm-01-synthwave', src: 'audio/bgm/bgm-01-synthwave.mp3', themeIndex: 0, start: 0, loopStart: 0, loopEnd: 192 },
  { id: 'bgm-02-gravity-well', src: 'audio/bgm/bgm-02-gravity-well.mp3', themeIndex: 1, start: 0, loopStart: 0 },
  { id: 'bgm-03-deep-space', src: 'audio/bgm/bgm-03-deep-space.mp3', themeIndex: 2, start: 0, loopStart: 0, loopEnd: 22 },
  { id: 'bgm-04-inferno', src: 'audio/bgm/bgm-04-inferno.mp3', themeIndex: 3, start: 0, loopStart: 0, loopEnd: 104 },
  { id: 'bgm-05-molten-core', src: 'audio/bgm/bgm-05-molten-core.mp3', themeIndex: 4, start: 0, loopStart: 0, loopEnd: 104 },
  { id: 'bgm-06-storm-skies', src: 'audio/bgm/bgm-06-storm-skies.mp3', themeIndex: 5, start: 0, loopStart: 0 },
  { id: 'bgm-07-ancient-ruins', src: 'audio/bgm/bgm-07-ancient-ruins.ogg', themeIndex: 6, start: 0, loopStart: 0 },
  { id: 'bgm-08-toxic-wasteland', src: 'audio/bgm/bgm-08-toxic-wasteland.mp3', themeIndex: 7, start: 0, loopStart: 0, loopEnd: 46 },
  { id: 'bgm-09-derelict-station', src: 'audio/bgm/bgm-09-derelict-station.mp3', themeIndex: 8, start: 0, loopStart: 0 },
  { id: 'bgm-10-reactor-core-p1', src: 'audio/bgm/bgm-10-reactor-core-p1.mp3', themeIndex: 9, phaseMin: 1, phaseMax: 7, start: 0, loopStart: 0 },
  { id: 'bgm-10-reactor-core-p8', src: 'audio/bgm/bgm-10-reactor-core-p8.mp3?v=snes267', themeIndex: 9, phaseMin: 8, phaseMax: 99, start: 50, loopStart: 50 },
  { id: 'bgm-11-the-void', src: 'audio/bgm/bgm-11-the-void.mp3', themeIndex: 10, start: 1, loopStart: 1, loopEnd: 38 },
  { id: 'bgm-12-neon-city', src: 'audio/bgm/bgm-12-neon-city.mp3', themeIndex: 11, start: 0, loopStart: 0 },
  { id: 'bgm-13-the-signal-p1', src: 'audio/bgm/bgm-13-the-signal-p1.mp3?v=snes266', themeIndex: 12, phaseMin: 1, phaseMax: 2, start: 0, loopStart: 0 },
  { id: 'bgm-13-the-signal-p3', src: 'audio/bgm/bgm-13-the-signal-p3.mp3', themeIndex: 12, phaseMin: 3, phaseMax: 4, start: 0, loopStart: 0 },
  { id: 'bgm-13-the-signal-p5', src: 'audio/bgm/bgm-13-the-signal-p5.mp3', themeIndex: 12, phaseMin: 5, phaseMax: 99, start: 0, loopStart: 0 },
];
const bgmElementCache = {};
const bgmMediaNodeCache = {};
let bgmHtmlAudio = null;
let bgmFileGainNode = null;
let bgmFileTrackId = null;
let bgmActiveFileTrack = null;
let bgmFileLoadToken = 0;

function bgmFileTrackById(id) {
  return BGM_FILE_TRACKS.find((t) => t.id === id) || null;
}

function currentPlayPhase() {
  const th = THEMES[warpActive ? nextThemeIndex : themeIndex];
  if (!th) return 1;
  if (th.isBossZone) {
    if (bossTransitioning && bossTransitionTargetPhase) return bossTransitionTargetPhase;
    return bossPhase || 1;
  }
  if (th.miniBossVariant === 'core') return coreBossPhase || 1;
  return 1;
}

function currentFileBgmTrack() {
  if (!(state === 'playing' || state === 'paused' || state === 'respawn' || state === 'continue-prompt')) return null;
  const idx = warpActive ? nextThemeIndex : themeIndex;
  const tracks = BGM_FILE_TRACKS.filter((t) => t.themeIndex === idx);
  if (!tracks.length) return null;
  const phase = currentPlayPhase();
  const hit = tracks.find((t) => phase >= (t.phaseMin || 1) && phase <= (t.phaseMax == null ? 99 : t.phaseMax));
  return hit || tracks[0];
}

function getBgmElement(src) {
  if (!bgmElementCache[src]) {
    const el = new Audio();
    el.preload = 'auto';
    el.src = src;
    bgmElementCache[src] = el;
  }
  return bgmElementCache[src];
}

function getBgmMediaNode(src, el) {
  if (!bgmMediaNodeCache[src]) bgmMediaNodeCache[src] = audioCtx.createMediaElementSource(el);
  return bgmMediaNodeCache[src];
}

function stopSynthBgm() {
  if (bgmSchedulerId !== null) {
    clearInterval(bgmSchedulerId);
    bgmSchedulerId = null;
  }
  bgmCurrentProfileName = null;
}

function stopFileBgm(fadeSec) {
  bgmFileLoadToken++;
  const el = bgmHtmlAudio;
  const gain = bgmFileGainNode;
  bgmHtmlAudio = null;
  bgmFileGainNode = null;
  bgmFileTrackId = null;
  bgmActiveFileTrack = null;
  if (el) {
    try { el.pause(); } catch (e) { /* already paused */ }
  }
  if (!audioCtx || !gain) return;
  const t0 = audioCtx.currentTime;
  const fade = fadeSec != null ? fadeSec : 0.12;
  try {
    gain.gain.cancelScheduledValues(t0);
    gain.gain.setValueAtTime(Math.max(0.0001, gain.gain.value), t0);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + fade);
  } catch (e) { /* already stopped */ }
}

function stopBgm() {
  stopSynthBgm();
  stopFileBgm(0.08);
}

function playBgm(profileName) {
  if (!audioUnlocked || !BGM_PROFILES[profileName]) return;
  initAudio();
  if (bgmFileTrackId) stopFileBgm(0.12);
  if (bgmCurrentProfileName === profileName && bgmSchedulerId !== null) return;
  stopSynthBgm();
  bgmCurrentProfileName = profileName;
  bgmCurrentStep = 0;
  bgmNextStepTime = audioCtx.currentTime + 0.05;
  bgmSchedulerId = setInterval(bgmSchedulerTick, BGM_LOOKAHEAD_MS);
}

function startHtmlBgm(track) {
  if (!audioCtx || !bgmGain || audioSettings.muted) return;
  stopSynthBgm();
  const prevEl = bgmHtmlAudio;
  const prevGain = bgmFileGainNode;
  const t0 = audioCtx.currentTime;
  const fade = 0.18;
  const el = getBgmElement(track.src);
  const media = getBgmMediaNode(track.src, el);
  const gain = audioCtx.createGain();
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(1, t0 + fade);
  try { media.disconnect(); } catch (e) { /* first connect */ }
  media.connect(gain);
  gain.connect(bgmGain);
  el.loop = track.loopEnd == null;
  const offset = track.start != null ? track.start : 0;
  try { el.currentTime = offset; } catch (e) { /* not seekable yet */ }
  const playAttempt = el.play();
  if (playAttempt && playAttempt.catch) {
    playAttempt.catch(() => {
      if (bgmFileTrackId !== track.id) return;
      bgmFileTrackId = null;
      playBgm('standard');
    });
  }
  bgmHtmlAudio = el;
  bgmFileGainNode = gain;
  bgmFileTrackId = track.id;
  bgmActiveFileTrack = track;
  if (prevEl && prevEl !== el) {
    try { prevEl.pause(); } catch (e) { /* already paused */ }
  }
  if (prevGain && prevGain !== gain) {
    try {
      prevGain.gain.cancelScheduledValues(t0);
      prevGain.gain.setValueAtTime(Math.max(0.0001, prevGain.gain.value), t0);
      prevGain.gain.exponentialRampToValueAtTime(0.0001, t0 + fade);
    } catch (e) { /* already stopped */ }
  }
}

function playFileBgm(trackId, opts) {
  if (!audioUnlocked || audioSettings.muted) return;
  initAudio();
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  const track = bgmFileTrackById(trackId);
  if (!track) return;
  if (bgmFileTrackId === track.id && !(opts && opts.restart)) return;
  bgmFileLoadToken++;
  bgmFileTrackId = track.id;
  startHtmlBgm(track);
}

function restartBossFileBgm() {
  const th = currentTheme();
  if (!th || !(th.isBossZone || th.isMiniBossZone)) return;
  const track = currentFileBgmTrack();
  if (!track) return;
  playFileBgm(track.id, { restart: true });
}

function tickFileBgmLoop() {
  const el = bgmHtmlAudio;
  const track = bgmActiveFileTrack;
  if (!el || !track || track.loopEnd == null || el.paused) return;
  const loopStart = track.loopStart != null ? track.loopStart : (track.start || 0);
  if (el.currentTime >= track.loopEnd - 0.03) {
    try { el.currentTime = loopStart; } catch (e) { /* ignore */ }
  }
}

function prefetchBgmTrack(trackId) {
  const track = bgmFileTrackById(trackId);
  if (!track) return;
  getBgmElement(track.src);
}

function prefetchThemeBgm(themeIdx) {
  for (const track of BGM_FILE_TRACKS) {
    if (track.themeIndex === themeIdx) prefetchBgmTrack(track.id);
  }
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
    if (entry.trackId) {
      if (bgmFileTrackId === entry.trackId && bgmHtmlAudio && !bgmHtmlAudio.paused) {
        stopBgm();
        return false;
      }
      stopSfxPreviewLoops();
      playFileBgm(entry.trackId);
      previewLoopId = entry.id;
      return true;
    }
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
  { id: 'hzStormChargeTel', section: '3. Zone Hazards', name: 'Storm charge bolt telegraph', kind: 'oneshot', play: () => playStormChargeTelegraph() },
  { id: 'hzStormThunder', section: '3. Zone Hazards', name: 'Storm charge bolt thunder', kind: 'oneshot', play: () => playStormThunderStrike() },

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

  { id: 'bgmMenu', section: '6. Background Music', name: 'Menu / home loop (synth)', kind: 'bgm', profile: 'menu', play: () => {} },
  { id: 'bgmVictory', section: '6. Background Music', name: 'Victory — Neon Rise (synth)', kind: 'bgm', profile: 'victory', play: () => {} },
  { id: 'bgmGameOver', section: '6. Background Music', name: 'Game over stinger', kind: 'oneshot', play: () => sfxGameOver() },
  { id: 'bgm01', section: '6. Background Music', name: '01 Synthwave', kind: 'bgm', trackId: 'bgm-01-synthwave', play: () => {} },
  { id: 'bgm02', section: '6. Background Music', name: '02 Gravity Well', kind: 'bgm', trackId: 'bgm-02-gravity-well', play: () => {} },
  { id: 'bgm03', section: '6. Background Music', name: '03 Deep Space', kind: 'bgm', trackId: 'bgm-03-deep-space', play: () => {} },
  { id: 'bgm04', section: '6. Background Music', name: '04 Inferno', kind: 'bgm', trackId: 'bgm-04-inferno', play: () => {} },
  { id: 'bgm05', section: '6. Background Music', name: '05 Molten Core', kind: 'bgm', trackId: 'bgm-05-molten-core', play: () => {} },
  { id: 'bgm06', section: '6. Background Music', name: '06 Storm Skies', kind: 'bgm', trackId: 'bgm-06-storm-skies', play: () => {} },
  { id: 'bgm07', section: '6. Background Music', name: '07 Ancient Ruins', kind: 'bgm', trackId: 'bgm-07-ancient-ruins', play: () => {} },
  { id: 'bgm08', section: '6. Background Music', name: '08 Toxic Wasteland', kind: 'bgm', trackId: 'bgm-08-toxic-wasteland', play: () => {} },
  { id: 'bgm09', section: '6. Background Music', name: '09 Derelict Station', kind: 'bgm', trackId: 'bgm-09-derelict-station', play: () => {} },
  { id: 'bgm10a', section: '6. Background Music', name: '10 Reactor Core (phases 1–7)', kind: 'bgm', trackId: 'bgm-10-reactor-core-p1', play: () => {} },
  { id: 'bgm10b', section: '6. Background Music', name: '10 Reactor Core (phase 8)', kind: 'bgm', trackId: 'bgm-10-reactor-core-p8', play: () => {} },
  { id: 'bgm11', section: '6. Background Music', name: '11 The Void', kind: 'bgm', trackId: 'bgm-11-the-void', play: () => {} },
  { id: 'bgm12', section: '6. Background Music', name: '12 Neon City', kind: 'bgm', trackId: 'bgm-12-neon-city', play: () => {} },
  { id: 'bgm13a', section: '6. Background Music', name: '13 The Signal (phases 1–2)', kind: 'bgm', trackId: 'bgm-13-the-signal-p1', play: () => {} },
  { id: 'bgm13b', section: '6. Background Music', name: '13 The Signal (phases 3–4)', kind: 'bgm', trackId: 'bgm-13-the-signal-p3', play: () => {} },
  { id: 'bgm13c', section: '6. Background Music', name: '13 The Signal (phase 5)', kind: 'bgm', trackId: 'bgm-13-the-signal-p5', play: () => {} },
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
