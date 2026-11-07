import { useState } from 'react';
import {
  PILOTS,
  UPGRADES,
  ZONES,
  type UpgradeCategory,
} from '../config/balance';
import { CARS, computeStats, getCar, type UpgradeState } from '../config/cars';
import type { Game } from '../game/Game';
import type { AppSnapshot } from '../game/GameStore';
import { getUpgrades } from '../game/storage';
import { money, pips } from './format';

type Tab = 'cars' | 'upgrades' | 'pilots' | 'zones';

const TAB_LABELS: Record<Tab, string> = {
  cars: 'Машины',
  upgrades: 'Апгрейды',
  pilots: 'Пилоты',
  zones: 'Зоны',
};

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

export function Garage({
  game,
  snapshot,
  onSettings,
}: {
  game: Game;
  snapshot: AppSnapshot;
  onSettings: () => void;
}) {
  const [tab, setTab] = useState<Tab>('cars');
  const [message, setMessage] = useState<string | null>(null);
  const profile = snapshot.profile;
  const car = CARS.find((entry) => entry.id === profile.car) ?? getCar(profile.car);
  const pilot = PILOTS.find((entry) => entry.id === profile.pilot) ?? PILOTS[4];
  const upgrades = getUpgrades(profile, car.id);
  const stats = computeStats(car, upgrades, pilot ?? PILOTS[0]!);
  const owned = profile.carsOwned.includes(car.id);

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

  const selectZone = (zone: number): void => {
    if (zone > profile.zone) {
      setMessage('Зона закрыта. Продвигайтесь по сезону, чтобы открыть её.');
      return;
    }
    game.selectZone(zone as AppSnapshot['zoneId']);
    setMessage(null);
  };

  return (
    <div className="ui-screen scrollable">
      <div className="garage-header">
        <div>
          <div className="garage-title">ГАРАЖ ПУСТОШИ</div>
          <div className="small muted">
            Дивизион: {profile.division === 'rookie' ? 'Новички' : 'Безумцы'} · Очки: {profile.points} · Сезон:{' '}
            {profile.seasonLaps}/5
          </div>
        </div>
        <div className="row garage-wallet-row">
          <div className="garage-wallet">
            <span>
              Баланс: <strong>{money(profile.money)}</strong>
            </span>
            <span className="muted">Зона: {snapshot.zoneName || `#${profile.zone}`}</span>
          </div>
        </div>
      </div>

      <div className="garage-actions">
        <button className="ghost" onClick={onSettings}>
          Настройки
        </button>
        <button className="ghost" onClick={() => game.goToMenu()}>
          Меню
        </button>
      </div>

      <div className="garage">
        <aside className="garage-side left">
          <div className="panel-block">
            <h3>Выбор машины</h3>
            <div className="stack">
              {CARS.map((entry) => {
                const isOwned = profile.carsOwned.includes(entry.id);
                return (
                  <button
                    key={entry.id}
                    className={`car-card${entry.id === car.id ? ' active' : ''}${isOwned ? '' : ' locked'}`}
                    onClick={() => (isOwned ? game.selectCar(entry.id) : buyCar(entry.id))}
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
          <div className="panel-block season">
            Утиль за гонку: {money(1000)} · Трофей: {money(1000)} · Доминирование: {money(5000)}
            <br />
            Победа: {money(10000)} · 2 место: {money(7000)} · 3 место: {money(4000)}
          </div>
        </aside>

        <div className="garage-side center">
          <div className="panel-block">
            <h3>{car.name}</h3>
            <div className="small muted" style={{ marginBottom: 10 }}>
              {owned ? 'Собственность гаража' : `Цена: ${money(car.price)}`} · масса {car.mass} кг
            </div>
            {statBar('Скорость', stats.maxSpeed, 48, ' м/с')}
            {statBar('Разгон', stats.acceleration, 28)}
            {statBar('Сцепление', stats.grip, 1.4)}
            {statBar('Броня', stats.maxHealth, 320)}
            {statBar('Прыжок', stats.jumpForce, 12)}
            <div className="small muted" style={{ marginTop: 10 }}>
              Переднее: {car.front} · Заднее: {car.rear} · Буст: {car.boost}
            </div>
          </div>

          <div className="panel-block">
            <div className="tabs">
              {(Object.keys(TAB_LABELS) as Tab[]).map((entry) => (
                <button
                  key={entry}
                  className={tab === entry ? 'active' : ''}
                  onClick={() => setTab(entry)}
                >
                  {TAB_LABELS[entry]}
                </button>
              ))}
            </div>

            {tab === 'cars' && (
              <div className="small muted" style={{ lineHeight: 1.6 }}>
                Каждая машина — свой характер: гусеницы игнорируют нефть и слизь, ховер парит над
                опасными поверхностями, а колёсные машины быстрее всех разгоняются. Выберите
                корпус слева — камера покажет его за стеклом гаража.
              </div>
            )}

            {tab === 'upgrades' && (
              <div>
                {(Object.keys(UPGRADES) as UpgradeCategory[]).map((category) => {
                  const spec = UPGRADES[category];
                  const disabled = spec.disabledFor.includes(car.chassis);
                  const level = upgrades[category];
                  const next = spec.levels[(level + 1) as 1 | 2 | 3];
                  return (
                    <div className="upgrade-row" key={category}>
                      <span>
                        <span>{spec.label}</span>
                        <span className="lvl">
                          {' '}
                          ур. {level}/3 · {spec.levels[level]?.name ?? '—'}
                        </span>
                      </span>
                      {disabled ? (
                        <span className="small muted">недоступно</span>
                      ) : next ? (
                        <button
                          className="ghost"
                          disabled={profile.money < next.price}
                          onClick={() => buyUpgrade(category)}
                        >
                          {money(next.price)}
                        </button>
                      ) : (
                        <span className="small muted">макс.</span>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'pilots' && (
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
                      <span>
                        <span className="pips">{pips(entry.stats[2])}</span>
                        <br />
                        <span className="small muted">
                          A{pips(entry.stats[0], 5).slice(0, 5)}
                        </span>
                      </span>
                    </button>
                  );
                })}
                {profile.zone < 6 && (
                  <div className="small muted">
                    «Бессмертный Воитель» откроется после прохождения всех шести зон.
                  </div>
                )}
              </div>
            )}

            {tab === 'zones' && (
              <div className="zone-grid">
                {ZONES.map((zone) => {
                  const locked = zone.id > profile.zone;
                  return (
                    <button
                      key={zone.id}
                      className={`zone-card${zone.id === snapshot.zoneId ? ' active' : ''}`}
                      disabled={locked}
                      onClick={() => selectZone(zone.id)}
                    >
                      <span>
                        <strong>{zone.name}</strong>
                        <br />
                        <span className="small muted">{zone.description}</span>
                      </span>
                      <span className="small muted">
                        {zone.width} м
                        <br />
                        {locked ? 'закрыто' : `босс: ${zone.boss}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {message && <div className="banner">{message}</div>}

          <div className="garage-start">
            <button className="primary" onClick={() => game.startRace(snapshot.zoneId)}>
              Выехать на трассу · {snapshot.zoneName || `Зона ${snapshot.zoneId}`}
            </button>
          </div>
        </div>

        <div />
      </div>
    </div>
  );
}

export type GarageUpgradeState = UpgradeState;
