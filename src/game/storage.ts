import {
  ECONOMY,
  HANDLING,
  SETTINGS_KEY,
  STORAGE_KEY,
  TRACK_LAYOUTS,
  ZONES,
  type DrivingMode,
  type PilotId,
  type TrackLayout,
  type ZoneId,
} from '../config/balance';
import type { UpgradeState } from '../config/cars';

export type PlayerProfile = {
  /** 2 — порядок трасс: первой идёт «Серпантин» с перепадами высот. */
  version: 2;
  money: number;
  car: string;
  carsOwned: string[];
  upgrades: Record<string, UpgradeState>;
  pilot: PilotId;
  points: number;
  zone: ZoneId;
  /** Выбранная конфигурация трассы (ровная или с перепадами высот). */
  track: TrackLayout;
  division: 'rookie' | 'maniacs';
  seasonLaps: number;
  seasonFinished: boolean;
  totalRaces: number;
  totalTrophies: number;
  totalScrap: number;
  bestPlace: number;
};

export type GameSettings = {
  volume: number;
  particles: 'high' | 'low';
  postProcessing: boolean;
  cameraShake: boolean;
  quality: 'high' | 'low';
  /** Модель вождения: физически корректная симуляция или прощающая аркада. */
  drivingMode: DrivingMode;
};

export function emptyUpgrades(): UpgradeState {
  return { engine: 0, body: 0, tires: 0, suspension: 0, weapons: 0 };
}

export function defaultProfile(): PlayerProfile {
  return {
    version: 2,
    money: ECONOMY.startingMoney,
    car: ECONOMY.startCarId,
    carsOwned: [ECONOMY.startCarId],
    upgrades: { [ECONOMY.startCarId]: emptyUpgrades() },
    pilot: 'badlands',
    points: 0,
    zone: 1,
    track: 'hills',
    division: 'rookie',
    seasonLaps: 0,
    seasonFinished: false,
    totalRaces: 0,
    totalTrophies: 0,
    totalScrap: 0,
    bestPlace: 4,
  };
}

export function defaultSettings(): GameSettings {
  return {
    volume: 0.6,
    particles: 'high',
    postProcessing: false,
    cameraShake: true,
    quality: 'high',
    drivingMode: 'sim',
  };
}

function sanitizeProfile(raw: unknown): PlayerProfile {
  const base = defaultProfile();
  if (!raw || typeof raw !== 'object') return base;
  const value = raw as Partial<PlayerProfile>;
  const zone = ZONES.some((z) => z.id === value.zone) ? (value.zone as ZoneId) : base.zone;
  const storedTrack = TRACK_LAYOUTS.some((t) => t.id === value.track) ? (value.track as TrackLayout) : base.track;
  // Старые профили (version 1) один раз переводим на новый порядок трасс,
  // где первой идёт «Серпантин». Дальше выбор игрока не трогаем.
  const track = value.version === 2 ? storedTrack : base.track;
  return {
    ...base,
    ...value,
    version: 2,
    zone,
    track,
    carsOwned: Array.isArray(value.carsOwned) && value.carsOwned.length > 0 ? value.carsOwned : base.carsOwned,
    upgrades: typeof value.upgrades === 'object' && value.upgrades ? { ...base.upgrades, ...value.upgrades } : base.upgrades,
    money: typeof value.money === 'number' ? value.money : base.money,
    points: typeof value.points === 'number' ? value.points : base.points,
  };
}

export function loadProfile(): PlayerProfile {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultProfile();
    return sanitizeProfile(JSON.parse(raw));
  } catch {
    return defaultProfile();
  }
}

export function saveProfile(profile: PlayerProfile): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(profile));
  } catch {
    /* приватный режим / переполнение — прогресс просто не сохранится */
  }
}

export function loadSettings(): GameSettings {
  const base = defaultSettings();
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return base;
    const stored = JSON.parse(raw) as Partial<GameSettings>;
    const drivingMode =
      stored.drivingMode && stored.drivingMode in HANDLING ? stored.drivingMode : base.drivingMode;
    return { ...base, ...stored, drivingMode };
  } catch {
    return base;
  }
}

export function saveSettings(settings: GameSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore */
  }
}

export function resetProfile(): PlayerProfile {
  const profile = defaultProfile();
  saveProfile(profile);
  return profile;
}

export function getUpgrades(profile: PlayerProfile, carId: string): UpgradeState {
  return profile.upgrades[carId] ?? emptyUpgrades();
}
