import { describe, expect, it } from 'vitest';
import { Vec3 } from 'cannon-es';
import { WORLD, type DrivingMode } from '../src/config/balance';
import type { Drivetrain } from '../src/config/cars';
import { CHASSIS_REST_Y, PhysicsWorld, quaternionYaw } from '../src/physics/physicsWorld';
import { createVehicleState, stepVehicle } from '../src/game/vehicleController';

const stats = {
  acceleration: 12,
  maxSpeed: 34,
  grip: 0.85,
  jumpForce: 7,
  bounce: 0.5,
  mass: 900,
  maxHealth: 100,
  drivetrain: 'AWD' as Drivetrain,
};

function simulate(
  drivetrain: Drivetrain,
  steer: number,
  seconds: number,
  surfaceGrip = 1,
  mode: DrivingMode = 'sim',
) {
  const physics = new PhysicsWorld();
  physics.addGroundPlane();
  const body = physics.createCarBody(stats, new Vec3(0, CHASSIS_REST_Y, 0), 0);
  body.collisionFilterGroup = 2;
  const state = createVehicleState();
  const steps = Math.round(seconds / WORLD.fixedDt);
  let maxY = body.position.y;
  for (let i = 0; i < steps; i += 1) {
    stepVehicle(state, body, physics, {
      throttle: 1,
      brake: 0,
      steer,
      acceleration: stats.acceleration,
      maxSpeed: stats.maxSpeed,
      mass: stats.mass,
      grip: stats.grip,
      surfaceGrip,
      drivetrain,
      nitroMult: 1,
      mode,
      dt: WORLD.fixedDt,
    });
    physics.step(WORLD.fixedDt);
    maxY = Math.max(maxY, body.position.y);
  }
  const result = {
    body,
    state,
    speed: body.velocity.length(),
    y: body.position.y,
    maxY,
    yaw: quaternionYaw(body.quaternion),
    pitch: body.quaternion.x,
    roll: body.quaternion.z,
  };
  physics.dispose();
  return result;
}

describe('vehicleController', () => {
  it('holds the chassis on its suspension instead of resting on the ground box', () => {
    const result = simulate('AWD', 0, 1.5);
    // Кузов стоит на подвеске около равновесной высоты, а не на земле.
    expect(result.y).toBeGreaterThan(CHASSIS_REST_Y - 0.05);
    expect(result.y).toBeLessThan(CHASSIS_REST_Y + 0.25);
    expect(result.state.groundedWheels).toBe(4);
  });

  it('accelerates and keeps a sane speed after a few seconds', () => {
    const result = simulate('AWD', 0, 3);
    expect(result.speed).toBeGreaterThan(10);
    expect(result.speed).toBeLessThan(40);
    expect(Math.abs(result.yaw)).toBeLessThan(0.1);
  });

  it('turns when the steering wheel is held', () => {
    const result = simulate('AWD', 1, 2);
    expect(Math.abs(result.yaw)).toBeGreaterThan(0.2);
  });

  it('finds traction with all-wheel drive on a slippery surface where RWD spins', () => {
    const awd = simulate('AWD', 0, 1.5, 0.25);
    const rwd = simulate('RWD', 0, 1.5, 0.25);
    expect(awd.speed).toBeGreaterThan(rwd.speed);
  });

  it('reaches at least 120 km/h in both driving modes', () => {
    for (const mode of ['sim', 'arcade'] as const) {
      const result = simulate('AWD', 0, 10, 1, mode);
      expect(result.speed * 3.6).toBeGreaterThanOrEqual(120);
    }
  });

  it('does not launch the chassis off the road during a straight run', () => {
    const result = simulate('AWD', 0, 8);
    // Подвеска и кузов остаются у дороги: никаких подбросов на ровном месте.
    expect(result.maxY).toBeLessThan(CHASSIS_REST_Y + 0.3);
    expect(result.state.groundedWheels).toBe(4);
  });
});
