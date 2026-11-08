import { describe, expect, it } from 'vitest';
import { AIBrain, type AISensors } from '../src/ai/utility';

const clear: AISensors = {
  speed: 20,
  forwardSpeed: 20,
  yawError: 0,
  trackHeadingError: 0,
  blockedAhead: false,
  blockedBehind: false,
  recentWallHit: false,
  upsideDown: false,
  fell: false,
};

const step = (brain: AIBrain, sensors: Partial<AISensors>, dt = 1 / 60, targetSpeed = 30) =>
  brain.update(dt, { ...clear, ...sensors }, targetSpeed);

describe('utility AI', () => {
  it('drives forward on a clear road', () => {
    const brain = new AIBrain(0.5, 0.8, 'meat');
    const decision = step(brain, {});
    expect(decision.maneuver).toBe('race');
    expect(decision.throttle).toBe(1);
    expect(decision.brake).toBe(0);
    expect(decision.respawn).toBe(false);
  });

  it('reverses when a wall blocks the way', () => {
    const brain = new AIBrain(0.5, 0.8, 'meat');
    const decision = step(brain, { speed: 0, blockedAhead: true });
    expect(decision.maneuver).toBe('reverse');
    expect(decision.brake).toBe(1);
    expect(decision.throttle).toBe(0);
  });

  it('does not reverse into an obstacle behind', () => {
    const brain = new AIBrain(0.5, 0.8, 'meat');
    const decision = step(brain, { speed: 0, blockedAhead: true, blockedBehind: true });
    expect(decision.maneuver).toBe('turnAround');
    expect(decision.throttle).toBe(1);
  });

  it('turns around when facing the wrong way', () => {
    const brain = new AIBrain(0.5, 0.8, 'meat');
    const decision = step(brain, {
      speed: 0,
      forwardSpeed: 0,
      trackHeadingError: -Math.PI,
      yawError: -Math.PI,
    });
    expect(decision.maneuver).toBe('turnAround');
    expect(decision.brake).toBe(1);
    expect(decision.steer).toBeLessThan(0);
  });

  it('holds the reverse burst before trying something else', () => {
    const brain = new AIBrain(0.5, 0.8, 'meat');
    step(brain, { speed: 0, blockedAhead: true });
    const held = step(brain, { speed: 1, blockedAhead: true }, 0.1);
    expect(held.maneuver).toBe('reverse');
    const freed = step(brain, { speed: 8 }, 0.9);
    expect(freed.maneuver).toBe('race');
  });

  it('returns to racing once the heading is aligned again', () => {
    const brain = new AIBrain(0.5, 0.8, 'meat');
    step(brain, { speed: 0, trackHeadingError: Math.PI });
    let decision = step(brain, { speed: 5, trackHeadingError: 0.2 });
    for (let index = 0; index < 10 && decision.maneuver !== 'race'; index += 1) {
      decision = step(brain, { speed: 5, trackHeadingError: 0.2 }, 0.05);
    }
    expect(decision.maneuver).toBe('race');
  });

  it('respawns after being stuck for too long', () => {
    const brain = new AIBrain(0.5, 0.8, 'meat');
    let decision = step(brain, { speed: 0 });
    for (let index = 0; index < 400 && !decision.respawn; index += 1) {
      decision = step(brain, { speed: 0 }, 0.05);
    }
    expect(decision.maneuver).toBe('recover');
    expect(decision.respawn).toBe(true);
  });

  it('respawns immediately after falling out of the world', () => {
    const brain = new AIBrain(0.5, 0.8, 'meat');
    const decision = step(brain, { speed: 0, fell: true });
    expect(decision.maneuver).toBe('recover');
    expect(decision.respawn).toBe(true);
  });
});
