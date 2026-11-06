import { describe, expect, it } from 'vitest';
import { Vec3 } from 'cannon-es';
import { WORLD } from '../src/config/balance';
import {
  CHASSIS_REST_Y,
  PhysicsWorld,
  forwardVector,
  quaternionYaw,
  yawQuaternion,
} from '../src/physics/physicsWorld';

describe('PhysicsWorld', () => {
  it('uses the configured gravity and fixed timestep', () => {
    const physics = new PhysicsWorld();
    expect(physics.world.gravity.y).toBeCloseTo(-WORLD.gravity);
    expect(WORLD.fixedDt).toBeCloseTo(1 / 60);
    expect(WORLD.maxSubSteps).toBe(3);
    physics.dispose();
  });

  it('raycasts the ground plane from above', () => {
    const physics = new PhysicsWorld();
    physics.addGroundPlane(-0.05);
    const hit = physics.raycast(new Vec3(0, 10, 0), new Vec3(0, -5, 0));
    expect(hit).not.toBeNull();
    expect(hit?.point.y).toBeCloseTo(-0.05);
    physics.dispose();
  });

  it('returns null when the ray points at the sky', () => {
    const physics = new PhysicsWorld();
    physics.addGroundPlane();
    expect(physics.raycast(new Vec3(0, 1, 0), new Vec3(0, 20, 0))).toBeNull();
    physics.dispose();
  });

  it('creates a car body at rest height with the configured mass', () => {
    const physics = new PhysicsWorld();
    physics.addGroundPlane();
    const body = physics.createCarBody(
      {
        acceleration: 12,
        maxSpeed: 30,
        grip: 0.8,
        jumpForce: 7,
        bounce: 0.5,
        mass: 900,
        maxHealth: 100,
      },
      new Vec3(0, CHASSIS_REST_Y, 0),
      0,
    );
    expect(body.mass).toBe(900);
    expect(body.position.y).toBeCloseTo(CHASSIS_REST_Y);

    for (let i = 0; i < 120; i += 1) physics.step(WORLD.fixedDt);
    // Тело должно остаться на дороге, а не провалиться сквозь неё.
    expect(body.position.y).toBeGreaterThan(0);
    expect(body.position.y).toBeLessThan(2);
    physics.dispose();
  });

  it('converts yaw to quaternions and forward vectors consistently', () => {
    const yaw = Math.PI / 2;
    const quaternion = yawQuaternion(yaw);
    expect(quaternionYaw(quaternion)).toBeCloseTo(yaw);
    const forward = forwardVector(quaternion);
    expect(forward.x).toBeCloseTo(1);
    expect(forward.z).toBeCloseTo(0);
  });
});
