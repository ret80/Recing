import { describe, expect, it } from 'vitest';
import { Vec3 } from 'cannon-es';
import { buildTrack } from '../src/track/track';
import { PhysicsWorld } from '../src/physics/physicsWorld';
import { buildTrackColliders } from '../src/physics/trackCollision';

describe('track collision', () => {
  it('covers the whole drivable width without holes', () => {
    for (const layout of ['flat', 'hills'] as const) checkWidth(layout);
  }, 30000);

  function checkWidth(layout: 'flat' | 'hills'): void {
    const track = buildTrack(1, layout);
    const physics = new PhysicsWorld();
    buildTrackColliders(physics, track);
    const half = track.width / 2;
    // Проверяем всю полосу, где может оказаться центр машины: до отбойника
    // (half + 0.8) остаётся ещё полкорпуса запаса.
    const offsets = [-half - 0.4, -half + 0.5, -half / 2, 0, half / 2, half - 0.5, half + 0.4];
    let misses = 0;
    for (let i = 0; i < track.waypoints.length; i += 7) {
      const wp = track.waypoints[i];
      if (!wp) continue;
      for (const offset of offsets) {
        const x = wp.position.x + wp.right.x * offset;
        const z = wp.position.z + wp.right.z * offset;
        // Луч вдоль нормали полотна — так же смотрит подвеска машины,
        // выровненной по дороге, а не строго вниз.
        const surface = new Vec3(x, wp.position.y, z);
        const up = wp.tangent.cross(wp.right).unit();
        const hit = physics.raycast(
          surface.vadd(up.scale(6)),
          surface.vsub(up.scale(3)),
        );
        if (!hit || hit.point.distanceTo(surface) > 1) {
          misses += 1;
          if (misses <= 6) console.log('miss', i, offset.toFixed(1), 'dist', hit ? hit.point.distanceTo(surface).toFixed(2) : 'none');
        }
      }
    }
    physics.dispose();
    expect(misses, `${layout} misses`).toBe(0);
  }

  it('keeps a car on the road surface instead of dropping it through', () => {
    const track = buildTrack(1, 'hills');
    const physics = new PhysicsWorld();
    buildTrackColliders(physics, track);
    const wp = track.waypoints[60];
    if (!wp) throw new Error('track has no waypoint 60');
    const body = physics.createCarBody(
      {
        acceleration: 12,
        maxSpeed: 34,
        grip: 0.9,
        jumpForce: 7,
        bounce: 0.5,
        mass: 900,
        maxHealth: 100,
        drivetrain: 'AWD',
      },
      new Vec3(wp.position.x, wp.position.y + 1.2, wp.position.z),
      0,
    );
    for (let i = 0; i < 120; i += 1) physics.step(1 / 60);
    expect(body.position.y).toBeGreaterThan(wp.position.y);
    physics.dispose();
  });
});
