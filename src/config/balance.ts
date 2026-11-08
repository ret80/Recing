/**
 * Единый источник игровых чисел (GDD §1, §2, §4, §6, §7).
 * В системах запрещены «магические» цифры — только импорт из этого файла.
 */

export const WORLD = {
  unitScale: 1,
  gravity: 9.82,
  fixedDt: 1 / 60,
  maxSubSteps: 3,
  killPlaneY: -20,
} as const;

export const LIMITS = {
  projectiles: 200,
  mines: 8,
  slicks: 6,
  particles: 3000,
  cars: 4,
  entities: 400,
  debris: 10,
  decals: 50,
} as const;

export const RENDER = {
  highDpr: 2,
  lowDpr: 1,
  /** Множитель числа частиц в настройках «низкая плотность». */
  lowParticleDensity: 0.4,
} as const;

export const CAMERA = {
  fov: 45,
  pitchDeg: 55,
  distance: 28,
  height: 20,
  lag: 0.12,
  shakeDecay: 0.5,
  shakeAmplitude: 0.9,
  /** Портретный режим: камера отъезжает, чтобы машина влезала в узкий кадр. */
  portraitDistanceMult: 1.7,
  portraitHeightMult: 1.35,
} as const;

export const PHYSICS = {
  chassis: { width: 2.0, height: 0.8, length: 4.0, shapeOffsetY: -0.35 },
  /** Высота, на которой корпус стоит над дорогой (полувысота кузова). */
  rideHeight: 0.62,
  wheelRadius: 0.42,
  wheelWidth: 0.32,
  /**
   * Максимальный угол поворота передних колёс на малой скорости (рад).
   * Руль работает как велосипедная модель: машина не может вращаться на месте.
   */
  steerMaxAngle: 0.58,
  /** Скорость (м/с), на которой угол руля падает вдвое от максимума. */
  steerFalloffSpeed: 13,
  /** База машины (м) — расстояние между осями для кинематики поворота. */
  wheelbase: 2.6,
  /** Ниже этой скорости машина не поворачивает (мёртвая зона руления). */
  steerDeadSpeed: 0.6,
  /** Визуальный угол поворота передних колёс (рад) при полном руле. */
  steerVisualAngle: 0.52,
  /** Предельное боковое ускорение сцепления (м/с²) — ограничивает поворот на скорости. */
  lateralGripAccel: 9.82,
  /** Доля ускорения, доступная на заднем ходу. */
  reverseAccelFactor: 0.8,
  /** Максимальная скорость заднего хода как доля от maxSpeed. */
  maxReverseFactor: 0.5,
  /** Коэффициент гашения поперечной скорости (grip применяется как exp(-grip*surface*rate*dt)). */
  lateralGripRate: 7,
  /** Гашение продольной скорости (drag) как exp(-drag*rate*dt). */
  dragRate: 1.4,
  /** Сопротивление качению (м/с²) при отпущенном газе. */
  coastDecel: 2.6,
  /** Торможение двигателем (м/с²) — накат гаснет заметно, но не мгновенно. */
  engineBrake: 3.4,
  /** Аэродинамическое сопротивление: decel = aeroDrag * v². */
  aeroDrag: 0.0014,
  /** Тормозной коэффициент относительно ускорения машины. */
  brakeFactor: 1.2,
  /**
   * Колёсный контроллер: рэйкаст-подвеска и шинные силы.
   * Числа подобраны для аркадного ощущения, а не для точной симуляции.
   */
  wheels: {
    /** Колея (расстояние между колёсами одной оси). */
    track: 1.9,
    /** Половина базы: продольное смещение осей от центра масс. */
    axleZ: 1.25,
    /** Локальная высота точки крепления подвески относительно COM. */
    attachY: -0.33,
    /** Длина подвески в свободном состоянии (м). */
    restLength: 0.18,
    /** Дополнительный ход подвески вниз при отрыве колеса (м). */
    travel: 0.14,
    /** Жёсткость пружины на килограмм массы (1/с²). */
    springStiffness: 48,
    /** Коэффициент демпфирования относительно критического. */
    dampingRatio: 0.45,
    /** Жёсткость отбойника, когда подвеска сжата полностью. */
    bumpStiffness: 180,
    /** Коэффициент трения шины: предел силы = нагрузка * grip * surface * tireFriction. */
    tireFriction: 2.8,
    /** Боковая жёсткость шины (1/с): сила = -v_бок * масса * stiffness / число колёс. */
    corneringStiffness: 9,
    /** Сопротивление качению как доля силы тяжести. */
    rollingResistance: 0.018,
    /** Ограничение силы подвески на колесо в единицах веса машины. */
    maxSpringForcePerMass: 90,
    /** Ниже этой скорости машина не «ползёт» сама по себе (м/с). */
    stopSpeed: 0.22,
    /** Угловое ускорение рыскания в воздухе от руля (рад/с²). */
    airSteerRate: 1.2,
  },
  /** Ограничение вертикальной скорости для стабильности. */
  maxVerticalSpeed: 40,
  /** Угловая стабилизация крена/тангажа (1/с). */
  rollStabilization: 6,
  /** Скорость выравнивания кузова по рельефу (доля в секунду). */
  groundAlignRate: 9,
  /** Сглаживание руления (доля в секунду): убирает рывки угловой скорости. */
  steerSmoothing: 18,
  restitutionBody: 0.05,
  groundFriction: 0.35,
  /**
   * Трение кузова о дорогу. Аркадная модель управляет сцеплением вручную
   * (surfaceGrip + lateralGripRate), поэтому контактное трение cannon-es
   * должно быть близко к нулю (GDD §6, §8).
   */
  carGroundFriction: 0,
  collideImpulse: 0.6,
  massDefault: 1000,
  /** Таран: минимальная относительная скорость, при которой наносится урон. */
  carImpactMinSpeed: 5,
  /** Прирост относительной скорости, дающий максимальный урон тарана. */
  carImpactSpeedRange: 15,
  carImpactMaxDamage: 15,
  /** Пауза между эпизодами урона от контакта одной пары машин. */
  carImpactCooldownSec: 0.4,
} as const;

export const AMMO = {
  /** Доля переднего боезапаса за один ящик утиля. */
  pickupFrontShare: 0.2,
  /** Минимум патронов переднего оружия за ящик. */
  pickupFrontMin: 3,
  /** Патронов/мин/масла заднего оружия за ящик. */
  pickupRear: 1,
  /** Зарядов буста за ящик. */
  pickupBoost: 1,
  /** Доля боезапаса, возвращаемая при респауне после смерти. */
  respawnFrontShare: 0.5,
  respawnRearShare: 0.5,
  respawnBoostShare: 0.5,
} as const;

export const RACE = {
  totalLaps: 4,
  timeLimitSec: 360,
  graceAfterFirstSec: 10,
  respawnDelaySec: 4,
  invulnSec: 2,
  countdownSec: 3,
  trackIntroSec: 3.5,
  dragRaceStart: 0,
  checkpointRadius: 9,
  maxCars: 4,
  dnfPoints: 50,
  positions: [
    { place: 1, points: 400, money: 10000 },
    { place: 2, points: 200, money: 7000 },
    { place: 3, points: 100, money: 4000 },
    { place: 4, points: 50, money: 2000 },
  ],
} as const;

export const ECONOMY = {
  startingMoney: 20000,
  startCarId: 'scrap-buggy',
  trophyMoney: 1000,
  dominanceMoney: 5000,
  scrapValue: 1000,
  maxScrapPerTrack: 8,
  seasonRaces: 5,
  divisions: {
    rookie: { name: 'Новички', threshold: 800, moneyMultiplier: 1.0 },
    maniacs: { name: 'Безумцы', threshold: 1200, moneyMultiplier: 1.5 },
  },
} as const;

/** Типы покрытий GDD §6. */
export type SurfaceType =
  | 'asphalt'
  | 'sludge'
  | 'acidPuddle'
  | 'acidLake'
  | 'oil'
  | 'snow'
  | 'ice'
  | 'lava';

export type SurfaceSpec = {
  type: SurfaceType;
  label: string;
  grip: number;
  drag: number;
  /** Мгновенная смерть при контакте. */
  lethal: boolean;
  /** Случайный занос (рад/с) на время эффекта. */
  spinOut?: number;
  spinOutSec?: number;
  color: number;
};

export const SURFACES: Record<SurfaceType, SurfaceSpec> = {
  asphalt: { type: 'asphalt', label: 'Асфальт', grip: 1.0, drag: 0, lethal: false, color: 0x3a3a3a },
  sludge: { type: 'sludge', label: 'Токсичная слизь', grip: 0.55, drag: 0.45, lethal: false, color: 0x4f7a24 },
  acidPuddle: {
    type: 'acidPuddle',
    label: 'Кислотная лужа',
    grip: 0.4,
    drag: 0.1,
    lethal: false,
    spinOut: Math.PI / 2,
    spinOutSec: 1.5,
    color: 0x3f6fff,
  },
  acidLake: { type: 'acidLake', label: 'Кислотное озеро', grip: 0, drag: 0, lethal: true, color: 0x2f4fd0 },
  oil: { type: 'oil', label: 'Сырая нефть', grip: 0.05, drag: 0, lethal: false, color: 0x111111 },
  snow: { type: 'snow', label: 'Сугроб', grip: 0.7, drag: 0.6, lethal: false, color: 0xdfe9f2 },
  ice: { type: 'ice', label: 'Лёд', grip: 0.18, drag: 0, lethal: false, color: 0x9fd8ff },
  lava: { type: 'lava', label: 'Радиоактивная лава', grip: 0, drag: 0, lethal: true, color: 0xff5a1f },
};

export type ChassisType = 'wheeled' | 'tracked' | 'hover';

export type UpgradeCategory = 'engine' | 'body' | 'tires' | 'suspension' | 'weapons';

export type UpgradeLevel = 0 | 1 | 2 | 3;

export type UpgradeCatalogEntry = {
  level: UpgradeLevel;
  name: string;
  price: number;
};

export type UpgradeCategorySpec = {
  id: UpgradeCategory;
  label: string;
  levels: UpgradeCatalogEntry[];
  /** Категории, недоступные для шасси. */
  disabledFor: ChassisType[];
};

export const UPGRADES: Record<UpgradeCategory, UpgradeCategorySpec> = {
  engine: {
    id: 'engine',
    label: 'Двигатель',
    levels: [
      { level: 0, name: 'V8 Хлам', price: 0 },
      { level: 1, name: 'Турбо-Нагнетатель', price: 20000 },
      { level: 2, name: 'Инжектор', price: 35000 },
      { level: 3, name: 'Атомный Поршень', price: 55000 },
    ],
    disabledFor: [],
  },
  body: {
    id: 'body',
    label: 'Кузов',
    levels: [
      { level: 0, name: 'Ржавая жесть', price: 0 },
      { level: 1, name: 'Стальные листы', price: 12000 },
      { level: 2, name: 'Броня БТР', price: 24000 },
      { level: 3, name: 'Реактивная Броня', price: 32000 },
    ],
    disabledFor: [],
  },
  tires: {
    id: 'tires',
    label: 'Шины',
    levels: [
      { level: 0, name: 'Лысая резина', price: 0 },
      { level: 1, name: 'Внедорожные', price: 15000 },
      { level: 2, name: 'Грязевые', price: 25000 },
      { level: 3, name: 'Шипованные', price: 35000 },
    ],
    disabledFor: ['tracked', 'hover'],
  },
  suspension: {
    id: 'suspension',
    label: 'Подвеска',
    levels: [
      { level: 0, name: 'Рессоры', price: 0 },
      { level: 1, name: 'Амортизаторы', price: 10000 },
      { level: 2, name: 'Гидравлика', price: 20000 },
      { level: 3, name: 'Пневмо-лифты', price: 30000 },
    ],
    disabledFor: ['hover'],
  },
  weapons: {
    id: 'weapons',
    label: 'Оружие/Бусты',
    levels: [
      { level: 0, name: '1 заряд', price: 0 },
      { level: 1, name: '2 заряда', price: 8000 },
      { level: 2, name: '4 заряда', price: 18000 },
      { level: 3, name: '7 зарядов', price: 30000 },
    ],
    disabledFor: [],
  },
};

/** Модификаторы апгрейдов (GDD §4). Индексы = уровень 0..3. */
export const UPGRADE_MODS = {
  engine: {
    maxSpeed: [1, 1.08, 1.16, 1.25],
    acceleration: [1, 1.1, 1.2, 1.32],
  },
  body: { maxHealth: [0, 30, 70, 120] },
  tires: { grip: [0, 0.08, 0.15, 0.24] },
  suspension: { bounce: [1, 0.7, 0.45, 0.25] },
  weapons: { ammo: [1, 2, 4, 7] },
} as const;

export type PilotId = 'viper' | 'cyber' | 'jumper' | 'drift' | 'badlands' | 'quinn' | 'immortal';

export type PilotSpec = {
  id: PilotId;
  name: string;
  title: string;
  /** Характеристики 1..5: acceleration, maxSpeed, cornering, jump. */
  stats: [number, number, number, number];
  description: string;
  secret?: boolean;
};

export const PILOTS: PilotSpec[] = [
  {
    id: 'viper',
    name: 'Jax «Viper»',
    title: 'Бывший курьер',
    stats: [2, 2, 1, 1],
    description: 'Быстрый, но плохо входит в повороты.',
  },
  {
    id: 'cyber',
    name: 'Kael «Cyber»',
    title: 'Техно-маньяк',
    stats: [2, 1, 1, 2],
    description: 'Компенсирует ошибки приземления на руинах.',
  },
  {
    id: 'jumper',
    name: 'Ivan «Jumper»',
    title: 'Безумный каскадер',
    stats: [1, 2, 1, 2],
    description: 'Король трамплинов и обрывов.',
  },
  {
    id: 'drift',
    name: 'Kat «Drift»',
    title: 'Кочевница',
    stats: [1, 1, 2, 2],
    description: 'Идеальный контроль, но медленный разгон.',
  },
  {
    id: 'badlands',
    name: 'Jake «Badlands»',
    title: 'Экс-военный',
    stats: [2, 1, 2, 1],
    description: 'Лучший выбор для новичков, прощает ошибки.',
  },
  {
    id: 'quinn',
    name: 'Tara «Quinn»',
    title: 'Охотница за головами',
    stats: [1, 2, 2, 1],
    description: 'Сбалансированный лидер.',
  },
  {
    id: 'immortal',
    name: 'Бессмертный Воитель',
    title: 'Легенда Пустошей',
    stats: [2, 2, 2, 2],
    description: 'Секретный пилот: +1 ко всем характеристикам.',
    secret: true,
  },
];

export const PILOT_MODS = {
  acceleration: 0.08,
  maxSpeed: 0.06,
  grip: 0.1,
  jumpForce: 0.12,
} as const;

export type ZoneId = 1 | 2 | 3 | 4 | 5 | 6;

export type ZoneSpec = {
  id: ZoneId;
  name: string;
  width: number;
  hasCliffs: boolean;
  surfaces: SurfaceType[];
  description: string;
  palette: { road: number; ground: number; sky: number; accent: number };
  boss: string;
};

export const ZONES: ZoneSpec[] = [
  {
    id: 1,
    name: 'Химические Пустоши',
    width: 24,
    hasCliffs: false,
    surfaces: [],
    description: 'Широкие прямые среди ржавых остовов заводов. Стены по периметру.',
    palette: { road: 0x4a443c, ground: 0x6b5b45, sky: 0xcaa77a, accent: 0xc0562f },
    boss: 'Токсичный Мак',
  },
  {
    id: 2,
    name: 'Выжженные Каньоны',
    width: 18,
    hasCliffs: true,
    surfaces: ['sludge'],
    description: 'Извилистые ущелья, зелёная слизь и обрывы без стен.',
    palette: { road: 0x5a3f34, ground: 0x9a4d2e, sky: 0xd97b4a, accent: 0x6f9a2e },
    boss: 'Хромированный Мясник',
  },
  {
    id: 3,
    name: 'Ржавые Топи',
    width: 20,
    hasCliffs: false,
    surfaces: ['acidPuddle', 'acidLake'],
    description: 'Кислотные лужи на трассе и озёра за её краем.',
    palette: { road: 0x3f4a45, ground: 0x45524a, sky: 0x7e9b8f, accent: 0x3f6fff },
    boss: '«Гнилой Тик»',
  },
  {
    id: 4,
    name: 'Нефтяные Дюны',
    width: 20,
    hasCliffs: true,
    surfaces: ['oil'],
    description: 'Чёрное масло, разрушенные хайвеи и обрывы.',
    palette: { road: 0x3b342c, ground: 0xb08b52, sky: 0xe0b565, accent: 0x1a1a1a },
    boss: 'Дорожный Палач',
  },
  {
    id: 5,
    name: 'Мёртвые Снега',
    width: 21,
    hasCliffs: false,
    surfaces: ['snow', 'ice'],
    description: 'Сугробы, скользкий лёд и мягкие снежные отбойники.',
    palette: { road: 0x5a6670, ground: 0xd9e6ef, sky: 0xafc4d6, accent: 0x9fd8ff },
    boss: 'Ледяной Костолом',
  },
  {
    id: 6,
    name: 'Зона Отчуждения',
    width: 18,
    hasCliffs: true,
    surfaces: ['lava'],
    description: 'Радиоактивная лава, узкие мосты и длинные трамплины.',
    palette: { road: 0x30292a, ground: 0x4a3330, sky: 0x8a2f26, accent: 0xff5a1f },
    boss: 'Плавильщик Слэш',
  },
];

export type TrackLayout = 'flat' | 'hills';

export type TrackLayoutSpec = {
  id: TrackLayout;
  name: string;
  description: string;
  /** Мин/макс перепад высот (м) — 0 для ровной трассы. */
  elevation: number;
};

export const TRACK_LAYOUTS: TrackLayoutSpec[] = [
  {
    id: 'flat',
    name: 'Соляной Полигон',
    description: 'Ровное кольцо через ржавые заводы: широкие дуги, длинные прямые и хороший разгон.',
    elevation: 0,
  },
  {
    id: 'hills',
    name: 'Серпантин',
    description: 'Горки и спуски: подъёмы отбирают скорость, а с гребня машина уходит в полёт.',
    elevation: 32,
  },
];

export type AIConfig = {
  raycastRange: number;
  coneDeg: number;
  reactionMin: number;
  reactionMax: number;
  reactionJitter: number;
  stuckSpeed: number;
  evadeTime: number;
  lineOffsetMax: number;
  threatAheadRange: number;
  threatBehindRange: number;
  rearWeaponDelaySec: number;
  /** Дальность щупа перед/позади машины для поиска стен и препятствий (м). */
  probeDistance: number;
  /** Сколько секунд ИИ откатывается назад, прежде чем попробовать развернуться. */
  reverseBurstSec: number;
  /** Сколько секунд длится одна фаза разворота (назад/вперёд). */
  turnPhaseSec: number;
  /** Максимальное время попытки разворота, после которого машина респаунится. */
  turnAroundTimeoutSec: number;
  /** Курс считается «против трассы», если ошибка больше этого угла (рад). */
  wrongWayAngle: number;
  /** Ошибка курса, при которой разворот считается завершённым (рад). */
  turnDoneAngle: number;
  /** Сколько секунд машина должна простоять, прежде чем респауниться. */
  recoverStuckSec: number;
  /** Сколько секунд машина может лежать вверх колёсами до респауна. */
  flippedRecoverSec: number;
  /** Сколько секунд ИИ помнит удар об отбойник. */
  wallHitMemorySec: number;
  /** Минимальное время удержания выбранного манёвра (с). */
  minManeuverTime: number;
  /** Сила руля при откате назад. */
  reverseSteer: number;
  /** Сила руля при развороте. */
  turnSteer: number;
};

export const AI_CONFIG: AIConfig = {
  raycastRange: 45,
  coneDeg: 35,
  reactionMin: 0.2,
  reactionMax: 0.5,
  reactionJitter: 0.1,
  stuckSpeed: 2,
  evadeTime: 1.5,
  lineOffsetMax: 2,
  /** Дистанции поиска препятствий/угроз. */
  threatAheadRange: 15,
  threatBehindRange: 20,
  /** ИИ не использует заднее оружие на стартовой сетке. */
  rearWeaponDelaySec: 5,
  probeDistance: 5,
  reverseBurstSec: 0.9,
  turnPhaseSec: 0.9,
  turnAroundTimeoutSec: 5,
  wrongWayAngle: 1.9,
  turnDoneAngle: 0.5,
  recoverStuckSec: 6,
  flippedRecoverSec: 1.5,
  wallHitMemorySec: 1.2,
  minManeuverTime: 0.35,
  reverseSteer: 0.85,
  turnSteer: 1,
};

export const WEAPON_TUNING = {
  mineArmDelay: 0.4,
  mineTriggerRadius: 2.6,
  projectileHitRadius: 1.4,
  slickEffectAfterExitSec: 2,
  /** Сколько секунд пятно нефти полностью видно. */
  slickLifetimeSec: 20,
  /** Сколько секунд длится затухание пятна в альфу. */
  slickFadeSec: 4,
  nitroDuration: 2,
  nitroAccelMult: 1.8,
  nitroSpeedMult: 1.35,
  rocketAoeRadius: 5,
  droneTurnRateDeg: 60,
  droneLockConeDeg: 35,
  droneLockRange: 45,
  cassetteDelay: 0.5,
  cassetteSpread: 8,
  cassetteLifetime: 10,
  boostPadImpulse: 12,
  jumpBaseSpeed: 7,
} as const;

/** Реплики комментатора (GDD §11). */
export const COMMENTARY = {
  subtitleSec: 4.5,
  overtakeCooldownSec: 8,
  /** Пауза после старта, чтобы не объявлять «обгон» на стартовой решётке. */
  overtakeGraceSec: 2,
} as const;

export const RESPAWN = {
  delaySec: 4,
  invulnSec: 2,
  healthReset: true,
  /** Боковое смещение точки респауна от центра чекпоинта (м). */
  lateralOffset: 3.2,
  /** Продольное смещение запасных точек, если боковые заняты (м). */
  longitudinalOffset: 5,
  /** Минимальная дистанция между машинами в точке респауна (м). */
  minSeparation: 3,
} as const;

export const STORAGE_KEY = 'rust-and-ruin-profile-v1';
export const SETTINGS_KEY = 'rust-and-ruin-settings-v1';
