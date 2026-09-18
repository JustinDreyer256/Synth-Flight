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

