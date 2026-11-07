import { describe, expect, it } from 'vitest';
import { Vec3 } from 'cannon-es';
import { PHYSICS } from '../src/config/balance';
import {
  angleDifference,
  applyDrag,
  clampForwardSpeed,
  dampLateral,
  decomposeVelocity,
  idealCornerSpeed,
  integrateLongitudinal,
  rebuildVelocity,
  steeringAngle,
  steeringYawRate,
} from '../src/game/vehicleMath';

describe('vehicleMath', () => {
  it('decomposes world velocity into forward/lateral components', () => {
    const result = decomposeVelocity(new Vec3(4, 0, 9), new Vec3(0, 0, 1), new Vec3(1, 0, 0));
    expect(result.forwardSpeed).toBeCloseTo(9);
    expect(result.lateralSpeed).toBeCloseTo(4);
  });

  it('damages lateral speed only when grip and surface grip are positive', () => {
    expect(dampLateral(10, 0, 1, 1 / 60)).toBeCloseTo(10);
    expect(dampLateral(10, 1, 0, 1 / 60)).toBeCloseTo(10);
    const damped = dampLateral(10, 1, 1, 1 / 60);
    expect(damped).toBeLessThan(10);
    expect(damped).toBeGreaterThan(0);
  });

  it('uses an exponential curve for lateral grip', () => {
    const dt = 1 / 60;
    const once = dampLateral(10, 1, 1, dt);
    const twice = dampLateral(once, 1, 1, dt);
    const expected = 10 * Math.exp(-PHYSICS.lateralGripRate * dt * 2);
    expect(twice).toBeCloseTo(expected, 6);
  });

  it('ignores drag on surfaces without drag and slows down otherwise', () => {
    expect(applyDrag(20, 0, 1 / 60)).toBe(20);
    expect(applyDrag(20, 0.5, 1 / 60)).toBeLessThan(20);
  });

  it('clamps forward speed to max speed and allows reverse up to 50%', () => {
    expect(clampForwardSpeed(100, 30)).toBe(30);
    expect(clampForwardSpeed(-100, 30)).toBeCloseTo(-15);
    expect(clampForwardSpeed(100, 30, 1.35)).toBeCloseTo(40.5);
  });

  it('rebuilds velocity from local components and keeps vertical velocity', () => {
    const velocity = rebuildVelocity(10, 2, new Vec3(0, 0, 1), new Vec3(1, 0, 0), 3);
    expect(velocity.x).toBeCloseTo(2);
    expect(velocity.y).toBeCloseTo(3);
    expect(velocity.z).toBeCloseTo(10);
  });

  it('returns full speed on straights and limits speed by curvature', () => {
    expect(idealCornerSpeed(40, 0.9, 1, 0)).toBeCloseTo(36);
    const tight = idealCornerSpeed(40, 0.9, 1, 0.2);
    const wide = idealCornerSpeed(40, 0.9, 1, 0.02);
    expect(tight).toBeLessThan(wide);
    expect(tight).toBeLessThan(40);
  });

  it('reduces corner speed when grip is low', () => {
    expect(idealCornerSpeed(40, 1, 0.2, 0.1)).toBeLessThan(idealCornerSpeed(40, 1, 1, 0.1));
  });

  it('does not rotate the car while it is standing still', () => {
    expect(steeringYawRate(1, 0)).toBe(0);
    expect(steeringYawRate(1, PHYSICS.steerDeadSpeed)).toBe(0);
    expect(steeringYawRate(1, -(PHYSICS.steerDeadSpeed - 0.01))).toBe(0);
    expect(steeringAngle(1, 0)).toBe(0);
  });

  it('turns by the bicycle model: radius follows the steering angle', () => {
    const speed = 6;
    const yawRate = steeringYawRate(1, speed);
    const angle = steeringAngle(1, speed);
    expect(yawRate).toBeGreaterThan(0);
    // ω = v · tan(δ) / база — на такой скорости сцепление не ограничивает.
    expect(yawRate).toBeCloseTo((speed * Math.tan(angle)) / PHYSICS.wheelbase, 5);
    const radius = speed / yawRate;
    expect(radius).toBeGreaterThan(PHYSICS.wheelbase);
  });

  it('caps yaw by grip at speed and reverses direction in reverse', () => {
    const lowGrip = steeringYawRate(1, 30, 0.2, 1);
    const highGrip = steeringYawRate(1, 30, 1, 1);
    expect(lowGrip).toBeLessThan(highGrip);
    expect(highGrip).toBeGreaterThan(0);
    expect(steeringYawRate(1, -6)).toBeCloseTo(-steeringYawRate(1, 6), 5);
    expect(steeringYawRate(-1, 6)).toBeCloseTo(-steeringYawRate(1, 6), 5);
  });

  it('coasts down when the throttle is released and loses speed uphill', () => {
    const base = {
      throttle: 0,
      brake: 0,
      acceleration: 12,
      maxSpeed: 32,
      dt: 1 / 60,
      slopePitch: 0,
    };
    const coasting = integrateLongitudinal({ ...base, speed: 20 });
    expect(coasting).toBeLessThan(20);
    expect(coasting).toBeGreaterThan(0);

    const uphill = integrateLongitudinal({ ...base, speed: 20, slopePitch: 0.2 });
    expect(uphill).toBeLessThan(coasting);

    const downhill = integrateLongitudinal({ ...base, speed: 20, slopePitch: -0.2 });
    expect(downhill).toBeGreaterThan(coasting);

    const accelerating = integrateLongitudinal({ ...base, speed: 10, throttle: 1 });
    expect(accelerating).toBeGreaterThan(10);
  });

  it('normalizes angles into the -PI..PI range', () => {
    expect(angleDifference(0, 0)).toBe(0);
    expect(angleDifference(Math.PI * 2, 0)).toBeCloseTo(0);
    expect(angleDifference(-Math.PI * 2, 0)).toBeCloseTo(0);
    expect(angleDifference(0, Math.PI)).toBeCloseTo(-Math.PI);
  });
});
