import { describe, expect, it } from 'vitest';
import { ECONOMY, UPGRADES } from '../src/config/balance';
import { CARS } from '../src/config/cars';
import {
  applySeasonProgress,
  buyCar,
  buyUpgrade,
  nextUpgradePrice,
  placementReward,
  raceMoney,
} from '../src/game/economy';
import { defaultProfile, emptyUpgrades, type PlayerProfile } from '../src/game/storage';

function profile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...defaultProfile(), ...overrides };
}

describe('placementReward', () => {
  it('uses the GDD table for all four places', () => {
    expect(placementReward(1, 'rookie')).toEqual({ money: 10000, points: 400 });
    expect(placementReward(2, 'rookie')).toEqual({ money: 7000, points: 200 });
    expect(placementReward(3, 'rookie')).toEqual({ money: 4000, points: 100 });
    expect(placementReward(4, 'rookie')).toEqual({ money: 2000, points: 50 });
  });

  it('applies the maniacs money multiplier', () => {
    expect(placementReward(1, 'maniacs')).toEqual({
      money: Math.round(10000 * ECONOMY.divisions.maniacs.moneyMultiplier),
      points: 400,
    });
  });
});

describe('raceMoney', () => {
  it('sums placement, trophies, dominance and scrap', () => {
    expect(raceMoney(1, 'rookie', 2, 1, 3)).toBe(10000 + 2 * ECONOMY.trophyMoney + ECONOMY.dominanceMoney + 3 * ECONOMY.scrapValue);
  });

  it('falls back to the last place for invalid places', () => {
    expect(raceMoney(9, 'rookie', 0, 0, 0)).toBe(2000);
  });
});

describe('upgrades', () => {
  it('prices the next level and returns null at max', () => {
    const carId = CARS[0]?.id ?? 'scrap-buggy';
    const base = profile({ upgrades: { [carId]: emptyUpgrades() } });
    expect(nextUpgradePrice(base, carId, 'engine')).toBe(UPGRADES.engine.levels[1]?.price);

    const maxed = profile({ upgrades: { [carId]: { ...emptyUpgrades(), engine: 3 } } });
    expect(nextUpgradePrice(maxed, carId, 'engine')).toBeNull();
  });

  it('rejects tires for tracked and hover chassis', () => {
    const tracked = CARS.find((car) => car.chassis === 'tracked');
    if (!tracked) throw new Error('tracked car missing');
    const base = profile();
    expect(nextUpgradePrice(base, tracked.id, 'tires')).toBeNull();
  });

  it('deducts money and raises the level on purchase', () => {
    const carId = CARS[0]?.id ?? 'scrap-buggy';
    const base = profile({ money: 50000, upgrades: { [carId]: emptyUpgrades() } });
    const result = buyUpgrade(base, carId, 'engine');
    expect(result.ok).toBe(true);
    expect(result.profile.money).toBe(50000 - (UPGRADES.engine.levels[1]?.price ?? 0));
    expect(result.profile.upgrades[carId]?.engine).toBe(1);
  });

  it('rejects purchases without enough money', () => {
    const carId = CARS[0]?.id ?? 'scrap-buggy';
    const base = profile({ money: 0, upgrades: { [carId]: emptyUpgrades() } });
    const result = buyUpgrade(base, carId, 'engine');
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Недостаточно/);
  });
});

describe('cars', () => {
  it('selects an already-owned car for free', () => {
    const owned = CARS[0]?.id ?? 'scrap-buggy';
    const base = profile({ carsOwned: [owned], car: 'other' });
    const result = buyCar(base, owned);
    expect(result.ok).toBe(true);
    expect(result.profile.car).toBe(owned);
    expect(result.profile.money).toBe(base.money);
  });

  it('buys a new car and initializes its upgrades', () => {
    const target = CARS[1];
    if (!target) throw new Error('second car missing');
    const base = profile({ money: target.price, carsOwned: ['scrap-buggy'] });
    const result = buyCar(base, target.id);
    expect(result.ok).toBe(true);
    expect(result.profile.carsOwned).toContain(target.id);
    expect(result.profile.car).toBe(target.id);
    expect(result.profile.money).toBe(0);
    expect(result.profile.upgrades[target.id]).toEqual(emptyUpgrades());
  });

  it('rejects a car that is too expensive', () => {
    const target = CARS[CARS.length - 1];
    if (!target) throw new Error('last car missing');
    const result = buyCar(profile({ money: 0 }), target.id);
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/Недостаточно/);
  });
});

describe('season progression', () => {
  it('advances from rookie to maniacs when the threshold is met', () => {
    const base = profile({ points: 400, seasonLaps: ECONOMY.seasonRaces - 1, division: 'rookie' });
    const result = applySeasonProgress(base, 1);
    // Очки сезона сбрасываются после успешного перехода в следующий дивизион.
    expect(result.profile.points).toBe(0);
    expect(result.profile.division).toBe('maniacs');
    expect(result.advancedDivision).toBe(true);
    expect(result.seasonFailed).toBe(false);
    expect(result.profile.seasonLaps).toBe(0);
  });

  it('advances the zone after a successful maniacs season', () => {
    const base = profile({
      points: 1200,
      seasonLaps: ECONOMY.seasonRaces - 1,
      division: 'maniacs',
      zone: 2,
    });
    const result = applySeasonProgress(base, 4);
    expect(result.advancedZone).toBe(true);
    expect(result.profile.zone).toBe(3);
    expect(result.profile.division).toBe('rookie');
  });

  it('resets points on failure while keeping money and cars', () => {
    const base = profile({ points: 0, seasonLaps: ECONOMY.seasonRaces - 1, money: 12345 });
    const result = applySeasonProgress(base, 4);
    expect(result.seasonFailed).toBe(true);
    expect(result.profile.points).toBe(0);
    expect(result.profile.money).toBe(12345);
    expect(result.profile.carsOwned).toEqual(base.carsOwned);
  });

  it('does not finish a season before five races', () => {
    const base = profile({ seasonLaps: 0 });
    const result = applySeasonProgress(base, 1);
    expect(result.seasonJustFinished).toBe(false);
    expect(result.seasonFailed).toBe(false);
    expect(result.profile.seasonLaps).toBe(1);
  });
});
