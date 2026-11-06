import { describe, expect, it } from 'vitest';
import { canFire, consumeShot, refillAmmo, tickCooldown } from '../src/game/weaponLogic';

describe('weaponLogic', () => {
  it('ticks cooldowns down to zero but never below', () => {
    expect(tickCooldown(1, 0.25)).toBeCloseTo(0.75);
    expect(tickCooldown(0.1, 1)).toBe(0);
    expect(tickCooldown(0, 1)).toBe(0);
  });

  it('requires both ammo and an expired cooldown', () => {
    expect(canFire(1, 0)).toBe(true);
    expect(canFire(0, 0)).toBe(false);
    expect(canFire(1, 0.2)).toBe(false);
  });

  it('consumes one shot and applies the weapon cooldown', () => {
    expect(consumeShot(3, 0, 0.12)).toEqual({ ammo: 2, cooldown: 0.12 });
    expect(consumeShot(0, 0, 0.12)).toEqual({ ammo: 0, cooldown: 0.12 });
  });

  it('refills to the charge level without shrinking current ammo', () => {
    expect(refillAmmo(2, 10, 7)).toBe(7);
    expect(refillAmmo(9, 10, 4)).toBe(9);
    expect(refillAmmo(0, 10, 20)).toBe(10);
  });
});
