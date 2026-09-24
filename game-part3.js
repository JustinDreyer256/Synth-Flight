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
        // First key shares a lane with the 2-gap moving door. On typical
        // window widths that door spawns ~50px behind the key, so the slab
        // arrives first and the card sits in the metal. Hold the door until
        // the key is clearly closer to the ship.
        const movingDoorSpawnX = W + 60;
        const keyBlocksMovingDoor = gates.some((g) => (
          g.type === 'accesskey' && !g.collected && g.x > movingDoorSpawnX - 280
        ));
        if (!nearLastEvent && !keyBlocksMovingDoor) {
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
      if (th.lightningStrikeEvents && !portalObject) {
        const zoneProgress = distance - zoneStartDistance;
        th.lightningStrikeEvents.forEach((event, i) => {
          if (!lightningStrikeEventsSpawned[i] && zoneProgress >= event.triggerDistance) {
            spawnStormChargeBoltEvent(i);
            lightningStrikeEventsSpawned[i] = true;
          }
        });
      }
      for (const g of gates) {
        if (g.type === 'stormchargebolttelegraph' && !g.resolved && (frame - g.spawnFrame) >= g.warningFrames) {
          fireStormChargeBolt(g);
          g.resolved = true;
        }
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
        if (g.type === 'stormchargebolttelegraph') return !g.resolved;
        if (g.type === 'stormchargebolt') return (frame - g.spawnFrame) < (g.fireDuration || 42);
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
        } else if (g.type === 'stormchargebolt') {
          const { pts, forks } = getStormChargeBoltGeometry(g);
          const reveal = Math.min(1, (frame - g.spawnFrame) / 7);
          const count = stormBoltRevealCount(pts.length, reveal);
          const hitR = (g.thickness || 12) / 2 + shipR;
          let hit = false;
          for (let i = 1; i < count; i++) {
            if (pointToSegmentDist(ship.x, ship.y, pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]) < hitR) {
              hit = true;
              break;
            }
          }
          if (!hit && reveal > 0.35 && forks) {
            for (let f = 0; f < forks.length && !hit; f++) {
              const fork = forks[f];
              for (let i = 1; i < fork.length; i++) {
                if (pointToSegmentDist(ship.x, ship.y, fork[i - 1][0], fork[i - 1][1], fork[i][0], fork[i][1]) < hitR * 0.62) {
                  hit = true;
                  break;
                }
              }
            }
          }
          if (hit) tryEndGame(g.type);
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
    restartBossFileBgm();
  } else if (continuesRemaining > 0) {
    state = 'continue-prompt';
    restartBossFileBgm();
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
  prefetchThemeBgm(0);
  if (state === 'zone-select') prefetchThemeBgm(zoneSelectPreviewIdx);
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
  attack = 0,
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
  const peak = Math.max(0.0001, volume);
  if (attack > 0) {
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  } else {
    gain.gain.setValueAtTime(peak, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  }
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
  stormchargebolttelegraph: 'electric', stormchargebolt: 'electric',
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

function playStormChargeTelegraph() {
  if (!audioUnlocked || !audioCtx) return;
  playNoiseBurst({ duration: 0.55, filterFreq: 900, filterEnd: 1600, filterType: 'bandpass', filterQ: 0.7, volume: 0.12, delaySend: 0.08 });
  playElectricCrackles({ count: 4, spacing: 0.16, volume: 0.12 });
}

function playThunderRoll(when) {
  if (!audioUnlocked || !audioCtx || audioSettings.muted || !sfxGain) return;
  const t0 = when != null ? when : audioCtx.currentTime;
  const sr = audioCtx.sampleRate;
  const dur = 2.2;
  const n = Math.max(1, Math.floor(sr * dur));
  const buf = audioCtx.createBuffer(1, n, sr);
  const data = buf.getChannelData(0);
  let brown = 0;
  for (let i = 0; i < n; i++) {
    brown = (brown + (Math.random() * 2 - 1) * 0.03) * 0.985;
    data[i] = brown * 4.2;
  }
  const src = audioCtx.createBufferSource();
  src.buffer = buf;
  const lp = audioCtx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.Q.value = 0.65;
  lp.frequency.setValueAtTime(480, t0);
  lp.frequency.exponentialRampToValueAtTime(110, t0 + dur);
  const bp = audioCtx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.setValueAtTime(190, t0);
  bp.Q.value = 0.7;
  bp.frequency.exponentialRampToValueAtTime(95, t0 + dur);
  const g = audioCtx.createGain();
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.linearRampToValueAtTime(0.78, t0 + 0.14);
  g.gain.exponentialRampToValueAtTime(0.26, t0 + 0.32);
  g.gain.linearRampToValueAtTime(0.7, t0 + 0.5);
  g.gain.exponentialRampToValueAtTime(0.2, t0 + 0.82);
  g.gain.linearRampToValueAtTime(0.4, t0 + 1.12);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(lp);
  lp.connect(bp);
  bp.connect(g);
  g.connect(sfxGain);
  if (delayInput) {
    const send = audioCtx.createGain();
    send.gain.value = 0.28;
    g.connect(send);
    send.connect(delayInput);
  }
  src.start(t0);
  src.stop(t0 + dur + 0.04);
}

function playStormThunderStrike() {
  if (!audioUnlocked || !audioCtx) return;
  const t0 = audioCtx.currentTime;
  playThunderRoll(t0);
  playNoiseBurst({ duration: 0.5, filterFreq: 260, filterEnd: 90, filterType: 'lowpass', volume: 0.52, attack: 0.08, when: t0, delaySend: 0.22 });
  playNoiseBurst({ duration: 0.62, filterFreq: 200, filterEnd: 85, filterType: 'lowpass', volume: 0.36, attack: 0.06, when: t0 + 0.34, delaySend: 0.26 });
  playNoiseBurst({ duration: 0.8, filterFreq: 150, filterEnd: 80, filterType: 'lowpass', volume: 0.26, attack: 0.08, when: t0 + 0.78, delaySend: 0.3 });
  playSynth({ type: 'triangle', freq: 86, freqEnd: 46, duration: 0.7, attack: 0.08, decay: 0.16, sustain: 0.32, release: 0.36, volume: 0.16, filterFreq: 170, delaySend: 0.1, when: t0 });
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

