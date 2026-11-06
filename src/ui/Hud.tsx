import { BOOSTS, FRONT_WEAPONS, REAR_WEAPONS } from '../config/weapons';
import { CARS } from '../config/cars';
import type { AppSnapshot } from '../game/GameStore';
import { formatTime } from './format';

export function Hud({ snapshot }: { snapshot: AppSnapshot }) {
  const car = CARS.find((entry) => entry.id === snapshot.profile.car) ?? CARS[0];
  const healthPercent = snapshot.maxHealth > 0 ? Math.max(0, Math.min(1, snapshot.health / snapshot.maxHealth)) : 0;
  const healthClass =
    healthPercent > 0.5 ? '' : healthPercent > 0.25 ? 'wounded' : 'critical';
  const speedKmh = Math.round(snapshot.speed * 3.6);
  const frontName = car ? FRONT_WEAPONS[car.front].name : 'Переднее';
  const rearName = car ? REAR_WEAPONS[car.rear].name : 'Заднее';
  const boostName = car ? BOOSTS[car.boost].name : 'Буст';

  return (
    <div className="hud">
      <div className="hud-corner hud-top-left">
        <div className="hud-card">
          <div className="place">
            {snapshot.playerPosition}
            <small> / {Math.max(snapshot.standings.length, 4)}</small>
          </div>
          <div className="lap-line">
            <b>
              КРУГ {snapshot.lap}/{snapshot.totalLaps}
            </b>
          </div>
        </div>
        <div className="hud-card timer">{formatTime(snapshot.timeLeft)}</div>
      </div>

      <div className="hud-corner hud-top-right">
        <div className="hud-card standings">
          {snapshot.standings.map((entry) => (
            <div key={entry.id} className={`standing-row${entry.isPlayer ? ' player' : ''}`}>
              <span>{entry.position}</span>
              <span>{entry.name || '—'}</span>
              <span>{entry.finished ? 'ФИН' : `К${entry.lap}`}</span>
            </div>
          ))}
        </div>
        <div className="fps">{snapshot.fps} FPS</div>
      </div>

      <div className="hud-corner hud-bottom-left">
        <div className="hud-card health-wrap">
          <div className="health-label">
            <span>БРОНЯ</span>
            <span>
              {Math.ceil(snapshot.health)} / {Math.round(snapshot.maxHealth)}
            </span>
          </div>
          <div className="health-bar">
            <div className={`health-fill ${healthClass}`} style={{ width: `${healthPercent * 100}%` }} />
          </div>
          {snapshot.damageLevel > 0 && (
            <div className="damage-note">
              {snapshot.damageLevel === 2 ? 'КРИТИЧЕСКИ: ДЫМ + ИСКРЫ' : 'ПОВРЕЖДЕНИЕ: ЧЁРНЫЙ ДЫМ'}
            </div>
          )}
          {snapshot.invuln && <div className="damage-note">НЕУЯЗВИМОСТЬ {snapshot.invulnTimer.toFixed(1)} С</div>}
        </div>
      </div>

      <div className="hud-corner hud-bottom-right">
        <div className="ammo">
          <div className={`ammo-slot${snapshot.ammoFront <= 0 ? ' empty' : ''}`} title={frontName}>
            <span className="label">ПЕРЕД</span>
            <span className="count">{snapshot.ammoFront}</span>
          </div>
          <div className={`ammo-slot${snapshot.ammoRear <= 0 ? ' empty' : ''}`} title={rearName}>
            <span className="label">ЗАД</span>
            <span className="count">{snapshot.ammoRear}</span>
          </div>
          <div className={`ammo-slot${snapshot.ammoBoost <= 0 ? ' empty' : ''}`} title={boostName}>
            <span className="label">БУСТ</span>
            <span className="count">{snapshot.ammoBoost}</span>
          </div>
        </div>
      </div>

      {Math.abs(snapshot.speed) > 0.3 && (
        <div className="speedometer">
          <b>{speedKmh}</b> <span>КМ/Ч</span>
        </div>
      )}
      {snapshot.nitroActive && <div className="nitro">НИТРО</div>}

      {snapshot.subtitle && <div className="subtitle">{snapshot.subtitle}</div>}

      {snapshot.respawnTimer > 0 && (
        <div className="respawn">
          <span>ВОССТАНОВЛЕНИЕ</span>
          <b>{Math.ceil(snapshot.respawnTimer)}</b>
          <span>ДО РЕСПАУНА</span>
        </div>
      )}
    </div>
  );
}
