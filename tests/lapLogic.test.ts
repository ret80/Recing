import { describe, expect, it } from 'vitest';
import { Lap } from '../src/ecs/components';
import { CHECKPOINTS_PER_LAP, advanceLap, raceProgress } from '../src/game/lapLogic';

function racingLap(totalLaps = 2): Lap {
  const lap = new Lap(totalLaps);
  lap.nextCheckpoint = 1;
  return lap;
}

describe('lapLogic', () => {
  it('counts only the expected checkpoint (anti-cheat)', () => {
    const lap = racingLap();
    expect(advanceLap(lap, 5)).toBe('none');
    expect(lap.nextCheckpoint).toBe(1);
    expect(advanceLap(lap, 1)).toBe('checkpoint');
    expect(lap.nextCheckpoint).toBe(2);
  });

  it('advances through all checkpoints and completes a lap at checkpoint 0', () => {
    const lap = racingLap(2);
    for (let i = 1; i < CHECKPOINTS_PER_LAP; i += 1) {
      expect(advanceLap(lap, i, i * 10)).toBe('checkpoint');
    }
    expect(lap.currentLap).toBe(1);
    const event = advanceLap(lap, 0, 120);
    expect(event).toBe('lap');
    expect(lap.currentLap).toBe(2);
    expect(lap.nextCheckpoint).toBe(1);
    expect(lap.lapTimes).toEqual([120]);
    expect(lap.lapStartTime).toBe(120);
  });

  it('finishes after the last lap and freezes progress', () => {
    const lap = racingLap(1);
    for (let i = 1; i < CHECKPOINTS_PER_LAP; i += 1) advanceLap(lap, i, i);
    expect(advanceLap(lap, 0, 100)).toBe('finish');
    expect(lap.finished).toBe(true);
    expect(lap.progress).toBe(CHECKPOINTS_PER_LAP);
    expect(advanceLap(lap, 1, 200)).toBe('none');
  });

  it('records lap times without going negative', () => {
    const lap = racingLap(1);
    for (let i = 1; i < CHECKPOINTS_PER_LAP; i += 1) advanceLap(lap, i, 0);
    advanceLap(lap, 0, -10);
    expect(lap.lapTimes[0]).toBe(0);
  });

  it('ranks finished cars ahead of cars still racing', () => {
    const racing = racingLap(4);
    const finished = racingLap(4);
    finished.finished = true;
    finished.totalLaps = 4;

    expect(raceProgress(finished, 100, 100)).toBeGreaterThan(raceProgress(racing, 100, 100));
  });

  it('adds a distance fraction to progress within a checkpoint segment', () => {
    const lap = racingLap(1);
    const near = raceProgress(lap, 5, 100);
    const far = raceProgress(lap, 90, 100);
    expect(near).toBeGreaterThan(far);
    expect(far).toBeGreaterThanOrEqual(1);
    expect(near).toBeLessThan(2);
  });
});
