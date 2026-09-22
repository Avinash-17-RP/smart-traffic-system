// ============================================================
// ADAPTIVE SIGNAL CONTROLLER
// Used when situation = NORMAL
// Dynamically allocates green time based on queue lengths.
// Compare vs. fixed-timer static baseline.
// ============================================================

import type { Junction } from '../types';

export const MIN_GREEN = 10;  // seconds
export const MAX_GREEN = 60;  // seconds
export const FIXED_GREEN = 30; // static baseline
export const YELLOW_TIME = 4;  // seconds

export interface SignalDecision {
  junctionId: string;
  greenNS: number;    // adaptive green seconds for N/S phase
  greenEW: number;    // adaptive green seconds for E/W phase
  fixedGreen: number; // static baseline
  reason: string;
}

/**
 * Compute adaptive green durations for a junction based on queue lengths.
 * Formula: greenTime = clamp(BASE + k * (queue - avgQueue), MIN, MAX)
 * where k = sensitivity factor, avgQueue = mean queue across all directions.
 */
export function computeAdaptiveSignal(junction: Junction): SignalDecision {
  const qNS = junction.queueNorth + junction.queueSouth;
  const qEW = junction.queueEast + junction.queueWest;
  const totalQueue = qNS + qEW;
  const avgQueue = totalQueue / 2;

  const BASE = 25;
  const K = 1.5; // sensitivity: each extra vehicle adds 1.5 seconds

  const rawGreenNS = BASE + K * (qNS - avgQueue);
  const rawGreenEW = BASE + K * (qEW - avgQueue);

  const greenNS = Math.round(Math.min(MAX_GREEN, Math.max(MIN_GREEN, rawGreenNS)));
  const greenEW = Math.round(Math.min(MAX_GREEN, Math.max(MIN_GREEN, rawGreenEW)));

  let reason = '';
  if (qNS > qEW * 1.5) {
    reason = `High N/S queue (${qNS} vs ${qEW}): extending N/S green to ${greenNS}s`;
  } else if (qEW > qNS * 1.5) {
    reason = `High E/W queue (${qEW} vs ${qNS}): extending E/W green to ${greenEW}s`;
  } else {
    reason = `Balanced queues (N/S:${qNS}, E/W:${qEW}): using balanced timing`;
  }

  return {
    junctionId: junction.id,
    greenNS,
    greenEW,
    fixedGreen: FIXED_GREEN,
    reason,
  };
}

/**
 * Tick the signal state of a junction (1 tick = 1 second in simulation time).
 * Returns updated junction.
 */
export function tickSignal(junction: Junction, isStaticMode: boolean): Partial<Junction> {
  const greenNS = isStaticMode ? FIXED_GREEN : junction.adaptiveGreenNS;
  const greenEW = isStaticMode ? FIXED_GREEN : junction.adaptiveGreenEW;

  // If green corridor is active, lock to GREEN
  if (junction.isGreenCorridor) {
    return {
      signalPhase: 'GREEN',
      signalTimer: greenNS,
    };
  }

  let { signalPhase, signalTimer, currentGreenDirection } = junction;
  signalTimer -= 1;

  if (signalTimer <= 0) {
    // Transition to next phase
    if (signalPhase === 'GREEN') {
      signalPhase = 'YELLOW';
      signalTimer = YELLOW_TIME;
    } else if (signalPhase === 'YELLOW') {
      signalPhase = 'RED';
      // Switch direction
      currentGreenDirection = currentGreenDirection === 'NS' ? 'EW' : 'NS';
      signalTimer = currentGreenDirection === 'NS' ? greenNS : greenEW;
      // Immediately go green for new direction
      signalPhase = 'GREEN';
    }
  }

  return { signalPhase, signalTimer, currentGreenDirection };
}

/**
 * Calculate efficiency gain from adaptive vs. fixed signal.
 * Returns percentage reduction in total queue time.
 */
export function calculateSignalEfficiency(adaptive: SignalDecision): {
  adaptiveWasteTime: number;
  fixedWasteTime: number;
  improvement: number;
} {
  // Simplified model: "wasted green time" = green duration when queue is 0
  const adaptiveWaste = Math.max(0, adaptive.greenNS - 15) * 0.1 + Math.max(0, adaptive.greenEW - 15) * 0.1;
  const fixedWaste = Math.abs(adaptive.fixedGreen - 15) * 0.2;
  const improvement = fixedWaste > 0 ? ((fixedWaste - adaptiveWaste) / fixedWaste) * 100 : 0;
  return { adaptiveWasteTime: adaptiveWaste, fixedWasteTime: fixedWaste, improvement };
}
