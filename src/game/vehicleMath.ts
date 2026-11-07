import { Vec3 } from 'cannon-es';
import { PHYSICS } from '../config/balance';

export type VelocityDecomposition = {
  forwardSpeed: number;
  lateralSpeed: number;
};

export function decomposeVelocity(velocity: Vec3, forward: Vec3, right: Vec3): VelocityDecomposition {
  return {
    forwardSpeed: velocity.dot(forward),
    lateralSpeed: velocity.dot(right),
  };
}

/** Полу-авторитетная модель: поперечная скорость гасится сцеплением (GDD §8). */
export function dampLateral(lateralSpeed: number, grip: number, surfaceGrip: number, dt: number): number {
  const factor = Math.exp(-Math.max(0, grip) * Math.max(0, surfaceGrip) * PHYSICS.lateralGripRate * dt);
  return lateralSpeed * factor;
}

export function applyDrag(speed: number, surfaceDrag: number, dt: number): number {
  if (surfaceDrag <= 0) return speed;
  return speed * Math.exp(-surfaceDrag * PHYSICS.dragRate * dt);
}

export function clampForwardSpeed(
  forwardSpeed: number,
  maxSpeed: number,
  nitroMult = 1,
  reverseFactor = PHYSICS.maxReverseFactor,
): number {
  const limit = maxSpeed * nitroMult;
  return Math.max(-limit * reverseFactor, Math.min(limit, forwardSpeed));
}

export function rebuildVelocity(
  forwardSpeed: number,
  lateralSpeed: number,
  forward: Vec3,
  right: Vec3,
  vertical: number,
): Vec3 {
  return new Vec3(
    forward.x * forwardSpeed + right.x * lateralSpeed,
    vertical,
    forward.z * forwardSpeed + right.z * lateralSpeed,
  );
}

/** Идеальная скорость в повороте (GDD §7). */
export function idealCornerSpeed(maxSpeed: number, skill: number, grip: number, curvature: number): number {
  if (curvature <= 0.0001) return maxSpeed * skill;
  const curveLimit = Math.sqrt(Math.max(0.01, grip * 9.82) / curvature);
  return Math.min(maxSpeed * skill, curveLimit);
}

export function steeringYawRate(steer: number, speed: number): number {
  const magnitude = Math.abs(speed);
  // Мёртвая зона: стоящая машина не должна разворачиваться на месте.
  if (magnitude <= PHYSICS.steerDeadSpeed) return 0;
  const span = Math.max(1e-4, PHYSICS.steerMinSpeed - PHYSICS.steerDeadSpeed);
  const speedFactor = Math.min(1, (magnitude - PHYSICS.steerDeadSpeed) / span);
  const direction = speed < 0 ? -1 : 1;
  return steer * PHYSICS.steerRate * speedFactor * direction;
}

export function angleDifference(a: number, b: number): number {
  let diff = a - b;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return diff;
}
