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
  if (type === 'stormchargebolttelegraph') {
    playStormChargeTelegraph();
    return;
  }
  if (type === 'stormchargebolt') {
    playStormThunderStrike();
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

