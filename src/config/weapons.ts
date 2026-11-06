import type { UpgradeLevel } from './balance';

export type FrontWeaponType = 'scrapVulcan' | 'rockets' | 'heatDrones';
export type RearWeaponType = 'oilSlick' | 'spikeMine' | 'cassette';
export type BoostType = 'jumpJets' | 'nitro';

export type FrontWeaponSpec = {
  id: FrontWeaponType;
  name: string;
  damage: number;
  speed: number;
  lifetime: number;
  cooldown: number;
  ammoByLevel: [number, number, number, number];
  color: number;
  twin?: boolean;
  aoeRadius?: number;
  homing?: boolean;
};

export type RearWeaponSpec = {
  id: RearWeaponType;
  name: string;
  damage: number;
  radius: number;
  lifetime: number;
  cooldown: number;
  ammoByLevel: [number, number, number, number];
  maxActive: number;
  color: number;
  impulse?: number;
  cassette?: boolean;
};

export type BoostSpec = {
  id: BoostType;
  name: string;
  cooldown: number;
  ammoByLevel: [number, number, number, number];
  color: number;
};

export const FRONT_WEAPONS: Record<FrontWeaponType, FrontWeaponSpec> = {
  scrapVulcan: {
    id: 'scrapVulcan',
    name: 'Скрап-Винтовки',
    damage: 8,
    speed: 70,
    lifetime: 1.2,
    cooldown: 0.12,
    ammoByLevel: [40, 70, 110, 160],
    color: 0xffc45e,
    twin: true,
  },
  rockets: {
    id: 'rockets',
    name: 'Самодельные ракеты',
    damage: 35,
    speed: 30,
    lifetime: 4,
    cooldown: 0.9,
    ammoByLevel: [3, 5, 8, 12],
    color: 0xff7433,
    aoeRadius: 5,
  },
  heatDrones: {
    id: 'heatDrones',
    name: 'Тепловые дроны',
    damage: 18,
    speed: 24,
    lifetime: 5,
    cooldown: 1.2,
    ammoByLevel: [3, 5, 8, 12],
    color: 0x66e0ff,
    homing: true,
  },
};

export const REAR_WEAPONS: Record<RearWeaponType, RearWeaponSpec> = {
  oilSlick: {
    id: 'oilSlick',
    name: 'Слив Нефти',
    damage: 0,
    radius: 6,
    lifetime: Number.POSITIVE_INFINITY,
    cooldown: 1.5,
    ammoByLevel: [2, 3, 5, 7],
    maxActive: 6,
    color: 0x111111,
  },
  spikeMine: {
    id: 'spikeMine',
    name: 'Шипованные Мины',
    damage: 25,
    radius: 4,
    lifetime: Number.POSITIVE_INFINITY,
    cooldown: 1.2,
    ammoByLevel: [3, 4, 6, 8],
    maxActive: 8,
    color: 0xd0d0d0,
    impulse: 12,
  },
  cassette: {
    id: 'cassette',
    name: 'Кассетная шрапнель',
    damage: 15,
    radius: 3,
    lifetime: 10,
    cooldown: 1.5,
    ammoByLevel: [2, 3, 4, 6],
    maxActive: 8,
    color: 0xffb347,
    cassette: true,
  },
};

export const BOOSTS: Record<BoostType, BoostSpec> = {
  jumpJets: {
    id: 'jumpJets',
    name: 'Гидравлические Прыжки',
    cooldown: 0.8,
    ammoByLevel: [1, 2, 4, 7],
    color: 0x66e0ff,
  },
  nitro: {
    id: 'nitro',
    name: 'Инъекция Нитро',
    cooldown: 3,
    ammoByLevel: [1, 2, 4, 7],
    color: 0x3d7bff,
  },
};

export function ammoForFront(id: FrontWeaponType, level: UpgradeLevel): number {
  return FRONT_WEAPONS[id].ammoByLevel[level];
}
export function ammoForRear(id: RearWeaponType, level: UpgradeLevel): number {
  return REAR_WEAPONS[id].ammoByLevel[level];
}
export function ammoForBoost(id: BoostType, level: UpgradeLevel): number {
  return BOOSTS[id].ammoByLevel[level];
}

export const WEAPON_LABELS: Record<string, string> = {
  scrapVulcan: 'Скрап-Винтовки',
  rockets: 'Самодельные ракеты',
  heatDrones: 'Тепловые дроны',
  oilSlick: 'Слив Нефти',
  spikeMine: 'Шипованные Мины',
  cassette: 'Кассетная шрапнель',
  jumpJets: 'Гидро-прыжки',
  nitro: 'Нитро',
};
