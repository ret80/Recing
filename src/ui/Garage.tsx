import { useState } from 'react';
import {
  ECONOMY,
  PILOTS,
  RACE,
  TRACK_LAYOUTS,
  UPGRADES,
  UPGRADE_MODS,
  ZONES,
  type TrackLayout,
  type UpgradeCategory,
} from '../config/balance';
import { CARS, computeStats, getCar, type UpgradeState } from '../config/cars';
import type { Game } from '../game/Game';
import type { AppSnapshot } from '../game/GameStore';
import { getUpgrades } from '../game/storage';
import { money, pips } from './format';

type Tab = 'car' | 'upgrades' | 'pilot' | 'track' | 'season';

const TABS: { id: Tab; label: string; hint: string }[] = [
  { id: 'car', label: 'Машина', hint: 'Выбор корпуса' },
  { id: 'upgrades', label: 'Апгрейды', hint: 'Тюнинг узлов' },
  { id: 'pilot', label: 'Пилот', hint: 'Характеристики' },
  { id: 'track', label: 'Трасса', hint: 'Зона и рельеф' },
  { id: 'season', label: 'Сезон', hint: 'Прогресс и награды' },
];

function statBar(label: string, value: number, max: number, suffix = '') {
  const percent = Math.max(0, Math.min(100, (value / max) * 100));
  return (
    <div className="stat-row" key={label}>
      <span className="muted">{label}</span>
      <span className="stat-bar">
        <span style={{ width: `${percent}%` }} />
      </span>
      <span className="stat-value">
        {Math.round(value)}
        {suffix}
      </span>
    </div>
  );
}

function levelPips(level: number): string {
  return `${'◆'.repeat(level)}${'◇'.repeat(Math.max(0, 3 - level))}`;
}

export function Garage({
  game,
  snapshot,
  onSettings,
}: {
  game: Game;
  snapshot: AppSnapshot;
  onSettings: () => void;
}) {
  const [tab, setTab] = useState<Tab>('car');
  const [message, setMessage] = useState<string | null>(null);
  const profile = snapshot.profile;
  const car = CARS.find((entry) => entry.id === profile.car) ?? getCar(profile.car);
  const pilot = PILOTS.find((entry) => entry.id === profile.pilot) ?? PILOTS[4];
  const upgrades = getUpgrades(profile, car.id);
  const stats = computeStats(car, upgrades, pilot ?? PILOTS[0]!);
  const owned = profile.carsOwned.includes(car.id);
  const zone = ZONES.find((entry) => entry.id === snapshot.zoneId) ?? ZONES[0]!;
  const trackSpec = TRACK_LAYOUTS.find((entry) => entry.id === profile.track) ?? TRACK_LAYOUTS[0]!;

  const buyCar = (carId: string): void => {
    if (profile.carsOwned.includes(carId)) {
      game.selectCar(carId);
      setMessage(null);
      return;
    }
    const result = game.purchaseCar(carId);
    setMessage(result.ok ? 'Машина куплена. Добро пожаловать в гараж.' : result.reason ?? 'Покупка не удалась');
  };

  const buyUpgrade = (category: UpgradeCategory): void => {
    const result = game.purchaseUpgrade(category);
    setMessage(result.ok ? 'Улучшение установлено.' : result.reason ?? 'Покупка не удалась');
  };

  const selectPilot = (pilotId: AppSnapshot['profile']['pilot']): void => {
    game.selectPilot(pilotId);
    setMessage(null);
  };

  const selectZone = (zoneId: number): void => {
    if (zoneId > profile.zone) {
      setMessage('Зона закрыта. Продвигайтесь по сезону, чтобы открыть её.');
      return;
    }
    game.selectZone(zoneId as AppSnapshot['zoneId']);
    setMessage(null);
  };

  const selectTrack = (layout: TrackLayout): void => {
    game.selectTrack(layout);
    setMessage(null);
  };

  return (
    <div className="ui-screen garage-screen">
      <div className="garage-shell">
        <header className="garage-bar">
          <div className="garage-bar-main">
            <div className="garage-title">ГАРАЖ ПУСТОШИ</div>
            <div className="small muted garage-subtitle">
              Дивизион: {profile.division === 'rookie' ? 'Новички' : 'Безумцы'} · Очки: {profile.points} · Сезон:{' '}
              {profile.seasonLaps}/{ECONOMY.seasonRaces}
            </div>
          </div>
          <div className="garage-wallet">
            <span>
              Баланс: <strong>{money(profile.money)}</strong>
            </span>
            <span className="muted">Зона: {zone.name}</span>
            <span className="muted">Трасса: {trackSpec.name}</span>
          </div>
          <div className="garage-bar-actions">
            <button className="ghost" onClick={onSettings}>
              Настройки
            </button>
            <button className="ghost" onClick={() => game.goToMenu()}>
              Меню
            </button>
          </div>
        </header>

        <nav className="garage-tabs" role="tablist">
          {TABS.map((entry) => (
            <button
              key={entry.id}
              role="tab"
              aria-selected={tab === entry.id}
              className={`garage-tab${tab === entry.id ? ' active' : ''}`}
              onClick={() => setTab(entry.id)}
            >
              <span className="garage-tab-label">{entry.label}</span>
              <span className="garage-tab-hint">{entry.hint}</span>
            </button>
          ))}
        </nav>

        <section className="garage-panel">
          {message && (
            <div className="banner garage-message">
              {message}
              <button className="banner-close" onClick={() => setMessage(null)} aria-label="Закрыть">
                ×
              </button>
            </div>
          )}

          {tab === 'car' && (
            <div className="garage-split">
              <div className="garage-col">
                <h3 className="garage-h3">Корпуса</h3>
                <div className="car-list">
                  {CARS.map((entry) => {
                    const isOwned = profile.carsOwned.includes(entry.id);
                    return (
                      <button
                        key={entry.id}
                        className={`car-card${entry.id === car.id ? ' active' : ''}${isOwned ? '' : ' locked'}`}
                        onClick={() => buyCar(entry.id)}
                        title={entry.description}
                      >
                        <span className="name">{entry.name}</span>
                        <span className="desc">
                          {entry.chassis === 'tracked' ? 'Гусеницы' : entry.chassis === 'hover' ? 'Ховер' : 'Колёса'} ·{' '}
                          {entry.description}
                        </span>
                        <span className="price">{isOwned ? 'В ГАРАЖЕ' : money(entry.price)}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="garage-col">
                <h3 className="garage-h3">{car.name}</h3>
                <div className="small muted" style={{ marginBottom: 10 }}>
                  {owned ? 'Собственность гаража' : `Цена: ${money(car.price)}`} · масса {car.mass} кг
                </div>
                {statBar('Скорость', stats.maxSpeed, 48, ' м/с')}
                {statBar('Разгон', stats.acceleration, 28)}
                {statBar('Сцепление', stats.grip, 1.4)}
                {statBar('Броня', stats.maxHealth, 320)}
                {statBar('Прыжок', stats.jumpForce, 12)}
                <div className="garage-specs">
                  <div>
                    <span className="muted">Переднее</span>
                    <b>{car.front}</b>
                  </div>
                  <div>
                    <span className="muted">Заднее</span>
                    <b>{car.rear}</b>
                  </div>
                  <div>
                    <span className="muted">Буст</span>
                    <b>{car.boost}</b>
                  </div>
                </div>
                <p className="small muted garage-note">
                  Каждая машина — свой характер: гусеницы игнорируют нефть и слизь, ховер парит над опасными
                  поверхностями, а колёсные машины быстрее всех разгоняются.
                </p>
                {!owned && (
                  <button className="primary" disabled={profile.money < car.price} onClick={() => buyCar(car.id)}>
                    Купить за {money(car.price)}
                  </button>
                )}
              </div>
            </div>
          )}

          {tab === 'upgrades' && (
            <div className="garage-split">
              <div className="garage-col wide">
                <h3 className="garage-h3">Тюнинг · {car.name}</h3>
                {(Object.keys(UPGRADES) as UpgradeCategory[]).map((category) => {
                  const spec = UPGRADES[category];
                  const disabled = spec.disabledFor.includes(car.chassis);
                  const level = upgrades[category];
                  const next = spec.levels[(level + 1) as 1 | 2 | 3];
                  return (
                    <div className="upgrade-row" key={category}>
                      <span>
                        <span className="upgrade-name">{spec.label}</span>
                        <span className="lvl">
                          {' '}
                          {levelPips(level)} ур. {level}/3 · {spec.levels[level]?.name ?? '—'}
                        </span>
                      </span>
                      {disabled ? (
                        <span className="small muted">недоступно для этого шасси</span>
                      ) : next ? (
                        <button className="ghost" disabled={profile.money < next.price} onClick={() => buyUpgrade(category)}>
                          {next.name} · {money(next.price)}
                        </button>
                      ) : (
                        <span className="small muted">максимум</span>
                      )}
                    </div>
                  );
                })}
              </div>
              <div className="garage-col">
                <h3 className="garage-h3">Итоговые характеристики</h3>
                {statBar('Скорость', stats.maxSpeed, 48, ' м/с')}
                {statBar('Разгон', stats.acceleration, 28)}
                {statBar('Сцепление', stats.grip, 1.4)}
                {statBar('Броня', stats.maxHealth, 320)}
                {statBar('Прыжок', stats.jumpForce, 12)}
                <div className="upgrade-legend small muted">
                  <div>Оружие: {UPGRADE_MODS.weapons.ammo[upgrades.weapons]} зарядов</div>
                  <div>Броня: +{UPGRADE_MODS.body.maxHealth[upgrades.body]} HP</div>
                  <div>Шины: +{Math.round(UPGRADE_MODS.tires.grip[upgrades.tires] * 100)}% сцепления</div>
                  <div>Подвеска: {Math.round(UPGRADE_MODS.suspension.bounce[upgrades.suspension] * 100)}% отскока</div>
                </div>
              </div>
            </div>
          )}

          {tab === 'pilot' && (
            <div className="garage-col">
              <h3 className="garage-h3">Пилоты</h3>
              <div className="pilot-grid">
                {PILOTS.map((entry) => {
                  const locked = entry.secret === true && profile.zone < 6;
                  return (
                    <button
                      key={entry.id}
                      className={`pilot-card${entry.id === profile.pilot ? ' active' : ''}`}
                      disabled={locked}
                      onClick={() => selectPilot(entry.id)}
                    >
                      <span>
                        <strong>{entry.name}</strong>
                        <span className="small muted"> — {entry.title}</span>
                        <br />
                        <span className="small muted">{entry.description}</span>
                      </span>
                      <span className="pilot-stats small">
                        <span>Разгон</span>
                        <b>{pips(entry.stats[0], 5)}</b>
                        <span>Скорость</span>
                        <b>{pips(entry.stats[1], 5)}</b>
                        <span>Повороты</span>
                        <b>{pips(entry.stats[2], 5)}</b>
                        <span>Прыжки</span>
                        <b>{pips(entry.stats[3], 5)}</b>
                      </span>
                    </button>
                  );
                })}
              </div>
              {profile.zone < 6 && (
                <div className="small muted" style={{ marginTop: 10 }}>
                  «Бессмертный Воитель» откроется после прохождения всех шести зон.
                </div>
              )}
            </div>
          )}

          {tab === 'track' && (
            <div className="garage-split">
              <div className="garage-col">
                <h3 className="garage-h3">Зона</h3>
                <div className="zone-grid">
                  {ZONES.map((entry) => {
                    const locked = entry.id > profile.zone;
                    return (
                      <button
                        key={entry.id}
                        className={`zone-card${entry.id === snapshot.zoneId ? ' active' : ''}`}
                        disabled={locked}
                        onClick={() => selectZone(entry.id)}
                      >
                        <span className="zone-head">
                          <strong>{entry.name}</strong>
                          <span className="small muted zone-meta">
                            {entry.width} м · {locked ? 'закрыто' : entry.boss}
                          </span>
                        </span>
                        <span className="small muted">{entry.description}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="garage-col">
                <h3 className="garage-h3">Конфигурация трассы</h3>
                <div className="track-grid">
                  {TRACK_LAYOUTS.map((entry) => (
                    <button
                      key={entry.id}
                      className={`track-card${entry.id === profile.track ? ' active' : ''}`}
                      onClick={() => selectTrack(entry.id)}
                    >
                      <span className="track-name">{entry.name}</span>
                      <span className="small muted">{entry.description}</span>
                      <span className="track-elev">
                        {entry.elevation > 0 ? `Перепад высот: ${entry.elevation} м` : 'Ровное полотно'}
                      </span>
                    </button>
                  ))}
                </div>
                <p className="small muted garage-note">
                  На «Серпантине» подъёмы отбирают скорость, а с гребня машина уходит в полёт — подвеска и
                  сцепление решают больше, чем максимальная скорость.
                </p>
              </div>
            </div>
          )}

          {tab === 'season' && (
            <div className="garage-split">
              <div className="garage-col">
                <h3 className="garage-h3">Сезон</h3>
                <div className="season-cards">
                  <div className="season-card">
                    <span className="muted">Дивизион</span>
                    <b>{profile.division === 'rookie' ? 'Новички' : 'Безумцы'}</b>
                  </div>
                  <div className="season-card">
                    <span className="muted">Очки</span>
                    <b>{profile.points}</b>
                  </div>
                  <div className="season-card">
                    <span className="muted">Гонок в сезоне</span>
                    <b>
                      {profile.seasonLaps}/{ECONOMY.seasonRaces}
                    </b>
                  </div>
                  <div className="season-card">
                    <span className="muted">Лучшее место</span>
                    <b>{profile.bestPlace}</b>
                  </div>
                </div>
                <div className="season-notes small muted">
                  <p>
                    Новички: чтобы перейти в «Безумцев», нужно набрать {ECONOMY.divisions.rookie.threshold} очков за
                    сезон. Безумцы получают награды ×{ECONOMY.divisions.maniacs.moneyMultiplier}.
                  </p>
                  <p>
                    Каждая гонка: победа приносит репутацию, трофеи — за уничтожение соперников, доминирование — за
                    круг преимущества, утиль — за собранные ящики.
                  </p>
                </div>
              </div>
              <div className="garage-col">
                <h3 className="garage-h3">Награды за гонку</h3>
                <table className="payout-table">
                  <thead>
                    <tr>
                      <th>Место</th>
                      <th>Очки</th>
                      <th>Деньги</th>
                    </tr>
                  </thead>
                  <tbody>
                    {RACE.positions.map((entry) => (
                      <tr key={entry.place}>
                        <td>{entry.place}</td>
                        <td>{entry.points}</td>
                        <td>{money(entry.money)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="season-notes small muted">
                  <div>
                    Утиль: {money(ECONOMY.scrapValue)} за ящик · до {ECONOMY.maxScrapPerTrack} за гонку
                  </div>
                  <div>Трофей: {money(ECONOMY.trophyMoney)} · Доминирование: {money(ECONOMY.dominanceMoney)}</div>
                  <div>
                    Всего: {profile.totalRaces} гонок · {profile.totalTrophies} трофеев · {profile.totalScrap} утиля
                  </div>
                </div>
              </div>
            </div>
          )}
        </section>

        <footer className="garage-footer">
          <div className="garage-footer-info">
            <b>{zone.name}</b>
            <span className="muted"> · {trackSpec.name}</span>
            <span className={`garage-ready${trackSpec.elevation > 0 ? ' hills' : ''}`}>
              {trackSpec.elevation > 0 ? `перепад ${trackSpec.elevation} м` : 'ровное полотно'}
            </span>
          </div>
          <button className="primary garage-start" onClick={() => game.startRace(snapshot.zoneId)}>
            Выехать на трассу
          </button>
        </footer>
      </div>
    </div>
  );
}

export type GarageUpgradeState = UpgradeState;
