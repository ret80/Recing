import { ECONOMY, RACE, UPGRADES, type UpgradeCategory } from '../config/balance';
import { CARS, getCar } from '../config/cars';
import type { PlayerProfile } from './storage';
import { emptyUpgrades, getUpgrades } from './storage';

export type PlacementReward = { money: number; points: number };

export function placementReward(place: number, division: 'rookie' | 'maniacs'): PlacementReward {
  const row = RACE.positions.find((p) => p.place === place) ?? RACE.positions[RACE.positions.length - 1];
  if (!row) return { money: 0, points: 0 };
  const multiplier = division === 'maniacs' ? ECONOMY.divisions.maniacs.moneyMultiplier : ECONOMY.divisions.rookie.moneyMultiplier;
  return { money: Math.round(row.money * multiplier), points: row.points };
}

export function raceMoney(place: number, division: 'rookie' | 'maniacs', trophies: number, dominance: number, scrap: number): number {
  const placement = placementReward(place, division);
  return placement.money + trophies * ECONOMY.trophyMoney + dominance * ECONOMY.dominanceMoney + scrap * ECONOMY.scrapValue;
}

export type SeasonUpdate = {
  profile: PlayerProfile;
  seasonFailed: boolean;
  advancedDivision: boolean;
  advancedZone: boolean;
  seasonJustFinished: boolean;
};

export function applySeasonProgress(
  profile: PlayerProfile,
  place: number,
  divisionMultiplierIgnored = 1,
): SeasonUpdate {
  void divisionMultiplierIgnored;
  const placement = placementReward(place, profile.division);
  const next: PlayerProfile = {
    ...profile,
    points: profile.points + placement.points,
    seasonLaps: profile.seasonLaps + 1,
    totalRaces: profile.totalRaces + 1,
    bestPlace: Math.min(profile.bestPlace, place),
  };

  let seasonFailed = false;
  let advancedDivision = false;
  let advancedZone = false;
  let seasonJustFinished = false;

  if (next.seasonLaps >= ECONOMY.seasonRaces) {
    seasonJustFinished = true;
    const threshold = profile.division === 'rookie' ? ECONOMY.divisions.rookie.threshold : ECONOMY.divisions.maniacs.threshold;
    if (next.points >= threshold) {
      next.seasonFinished = true;
      next.seasonLaps = 0;
      next.points = 0;
      if (profile.division === 'rookie') {
        next.division = 'maniacs';
        advancedDivision = true;
      } else {
        next.division = 'rookie';
        next.zone = Math.min(6, profile.zone + 1) as PlayerProfile['zone'];
        advancedZone = profile.zone < 6;
      }
    } else {
      seasonFailed = true;
      next.seasonFinished = false;
      next.seasonLaps = 0;
      next.points = 0;
    }
  }

  return { profile: next, seasonFailed, advancedDivision, advancedZone, seasonJustFinished };
}

export function nextUpgradePrice(profile: PlayerProfile, carId: string, category: UpgradeCategory): number | null {
  const car = getCar(carId);
  const spec = UPGRADES[category];
  if (spec.disabledFor.includes(car.chassis)) return null;
  const current = getUpgrades(profile, carId)[category];
  if (current >= 3) return null;
  const next = spec.levels[(current + 1) as 1 | 2 | 3];
  return next ? next.price : null;
}

export function buyUpgrade(profile: PlayerProfile, carId: string, category: UpgradeCategory): { profile: PlayerProfile; ok: boolean; reason?: string } {
  const price = nextUpgradePrice(profile, carId, category);
  if (price === null) return { profile, ok: false, reason: 'Максимальный уровень или слот недоступен' };
  if (profile.money < price) return { profile, ok: false, reason: 'Недостаточно денег' };
  const current = getUpgrades(profile, carId);
  const updatedUpgrades = {
    ...profile.upgrades,
    [carId]: { ...current, [category]: (current[category] + 1) as 0 | 1 | 2 | 3 },
  };
  return { profile: { ...profile, money: profile.money - price, upgrades: updatedUpgrades }, ok: true };
}

export function buyCar(profile: PlayerProfile, carId: string): { profile: PlayerProfile; ok: boolean; reason?: string } {
  const car = CARS.find((c) => c.id === carId);
  if (!car) return { profile, ok: false, reason: 'Неизвестная машина' };
  if (profile.carsOwned.includes(carId)) return { profile: { ...profile, car: carId }, ok: true };
  if (profile.money < car.price) return { profile, ok: false, reason: 'Недостаточно денег' };
  return {
    profile: {
      ...profile,
      money: profile.money - car.price,
      carsOwned: [...profile.carsOwned, carId],
      car: carId,
      upgrades: { ...profile.upgrades, [carId]: emptyUpgrades() },
    },
    ok: true,
  };
}
