import { describe, expect, it } from 'vitest';
import { PILOTS, PILOT_MODS, UPGRADE_MODS } from '../src/config/balance';
import { CARS, computeStats, getCar, pilotMultipliers, type UpgradeState } from '../src/config/cars';
import { emptyUpgrades } from '../src/game/storage';

const pilot = PILOTS.find((entry) => entry.id === 'badlands');
const baseUpgrades: UpgradeState = emptyUpgrades();

if (!pilot) throw new Error('badlands pilot missing');

describe('cars config', () => {
  it('contains the five GDD car models with wheeled, tracked and hover chassis', () => {
    expect(CARS).toHaveLength(5);
    expect(new Set(CARS.map((car) => car.chassis))).toEqual(new Set(['wheeled', 'tracked', 'hover']));
  });

  it('looks up cars by id and throws for unknown ids', () => {
    expect(getCar('scrap-buggy').name).toBe('Скрап-Багги');
    expect(() => getCar('nope')).toThrow(/Unknown car/);
  });
});

describe('pilotMultipliers', () => {
  it('gives no bonus to a stat of 1 and scales above it', () => {
    const low = { ...pilot, stats: [1, 1, 1, 1] as [number, number, number, number] };
    expect(pilotMultipliers(low)).toEqual({ acceleration: 1, maxSpeed: 1, grip: 1, jumpForce: 1 });

    const high = { ...pilot, stats: [5, 5, 5, 5] as [number, number, number, number] };
    const mods = pilotMultipliers(high);
    expect(mods.acceleration).toBeCloseTo(1 + PILOT_MODS.acceleration * 4);
    expect(mods.maxSpeed).toBeCloseTo(1 + PILOT_MODS.maxSpeed * 4);
    expect(mods.grip).toBeCloseTo(1 + PILOT_MODS.grip * 4);
    expect(mods.jumpForce).toBeCloseTo(1 + PILOT_MODS.jumpForce * 4);
  });
});

describe('computeStats', () => {
  it('returns base stats without upgrades', () => {
    const car = getCar('scrap-buggy');
    const stats = computeStats(car, baseUpgrades, { ...pilot, stats: [1, 1, 1, 1] });
    expect(stats.maxSpeed).toBeCloseTo(car.maxSpeed);
    expect(stats.acceleration).toBeCloseTo(car.acceleration);
    expect(stats.grip).toBeCloseTo(car.grip);
    expect(stats.maxHealth).toBe(car.health);
    expect(stats.mass).toBe(car.mass);
  });

  it('applies engine and body upgrades', () => {
    const car = getCar('scrap-buggy');
    const upgrades: UpgradeState = { ...baseUpgrades, engine: 3, body: 2 };
    const stats = computeStats(car, upgrades, { ...pilot, stats: [1, 1, 1, 1] });
    expect(stats.maxSpeed).toBeCloseTo(car.maxSpeed * UPGRADE_MODS.engine.maxSpeed[3]);
    expect(stats.acceleration).toBeCloseTo(car.acceleration * UPGRADE_MODS.engine.acceleration[3]);
    expect(stats.maxHealth).toBeCloseTo(car.health + UPGRADE_MODS.body.maxHealth[2]);
  });

  it('adds tire grip only for wheeled chassis', () => {
    const wheeled = computeStats(getCar('scrap-buggy'), { ...baseUpgrades, tires: 3 }, {
      ...pilot,
      stats: [1, 1, 1, 1],
    });
    const tracked = computeStats(getCar('juggernaut'), { ...baseUpgrades, tires: 3 }, {
      ...pilot,
      stats: [1, 1, 1, 1],
    });
    expect(wheeled.grip).toBeCloseTo(getCar('scrap-buggy').grip + UPGRADE_MODS.tires.grip[3]);
    expect(tracked.grip).toBeCloseTo(getCar('juggernaut').grip);
  });

  it('reduces bounce with suspension upgrades', () => {
    const car = getCar('scrap-buggy');
    const soft = computeStats(car, baseUpgrades, pilot);
    const stiff = computeStats(car, { ...baseUpgrades, suspension: 3 }, pilot);
    expect(stiff.bounce).toBeLessThan(soft.bounce);
    expect(stiff.bounce).toBeCloseTo(car.bounce * UPGRADE_MODS.suspension.bounce[3]);
  });
});
