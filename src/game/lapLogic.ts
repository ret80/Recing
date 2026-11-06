import type { Lap } from '../ecs/components';

export const CHECKPOINTS_PER_LAP = 12;

export type LapEvent = 'none' | 'checkpoint' | 'lap' | 'finish';

/**
 * Строгая последовательность чекпоинтов (античит GDD §2, §3):
 * засчитывается только следующий ожидаемый индекс.
 */
export function advanceLap(lap: Lap, checkpointIndex: number, now = 0): LapEvent {
  if (lap.finished) return 'none';
  if (checkpointIndex !== lap.nextCheckpoint) return 'none';

  if (checkpointIndex === 0) {
    const lapTime = Math.max(0, now - lap.lapStartTime);
    lap.lapTimes.push(lapTime);
    lap.lapStartTime = now;
    lap.lastCheckpoint = 0;
    if (lap.currentLap >= lap.totalLaps) {
      lap.finished = true;
      lap.progress = lap.totalLaps * CHECKPOINTS_PER_LAP;
      return 'finish';
    }
    lap.currentLap += 1;
    lap.nextCheckpoint = 1;
    lap.progress = (lap.currentLap - 1) * CHECKPOINTS_PER_LAP;
    return 'lap';
  }

  lap.lastCheckpoint = checkpointIndex;
  lap.nextCheckpoint = (checkpointIndex + 1) % CHECKPOINTS_PER_LAP;
  lap.progress = (lap.currentLap - 1) * CHECKPOINTS_PER_LAP + checkpointIndex;
  return 'checkpoint';
}

export function raceProgress(lap: Lap, distanceToNext: number, segmentLength: number): number {
  const base = (lap.currentLap - 1) * CHECKPOINTS_PER_LAP + lap.nextCheckpoint;
  const fraction = segmentLength > 0 ? Math.max(0, Math.min(1, 1 - distanceToNext / segmentLength)) : 0;
  return lap.finished ? lap.totalLaps * CHECKPOINTS_PER_LAP + 1 : base + fraction;
}
