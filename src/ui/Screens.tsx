import { TRACK_LAYOUTS, ZONES } from '../config/balance';
import type { Game } from '../game/Game';
import type { AppSnapshot } from '../game/GameStore';
import { formatLapTime, money } from './format';

export function TrackIntro({ snapshot }: { snapshot: AppSnapshot }) {
  const zone = ZONES.find((entry) => entry.id === snapshot.zoneId);
  const track = TRACK_LAYOUTS.find((entry) => entry.id === snapshot.track);
  return (
    <div className="ui-screen">
      <div className="intro">
        <div className="menu-kicker">ЗОНА {snapshot.zoneId}</div>
        <h2>{zone?.name ?? snapshot.zoneName}</h2>
        <p>{zone?.description}</p>
        <div className="boss">БОСС ЗОНЫ: {zone?.boss ?? '—'}</div>
        <div className="small muted">
          Трасса: {track?.name ?? snapshot.track}
          {track && track.elevation > 0 ? ` · перепад высот ${track.elevation} м` : ' · ровное полотно'}
        </div>
      </div>
    </div>
  );
}

export function Countdown({ snapshot }: { snapshot: AppSnapshot }) {
  const value = Math.max(0, Math.ceil(snapshot.countdown));
  return (
    <div className="ui-screen">
      <div className="countdown">{value > 0 ? value : 'GO!'}</div>
    </div>
  );
}

export function Pause({
  game,
  onSettings,
}: {
  game: Game;
  onSettings: () => void;
}) {
  return (
    <div className="ui-screen">
      <div className="panel pause">
        <h2>Пауза</h2>
        <div className="stack">
          <button className="primary" onClick={() => game.togglePause()}>
            Продолжить
          </button>
          <button onClick={onSettings}>Настройки</button>
          <button onClick={() => game.restartRace()}>Перезапустить гонку</button>
          <button className="ghost" onClick={() => game.quitToGarage()}>
            В гараж
          </button>
        </div>
      </div>
    </div>
  );
}

export function Results({ game, snapshot }: { game: Game; snapshot: AppSnapshot }) {
  const rows = snapshot.results ?? [];
  const player = rows.find((row) => row.isPlayer);
  const zone = ZONES.find((entry) => entry.id === snapshot.zoneId);
  const track = TRACK_LAYOUTS.find((entry) => entry.id === snapshot.track);

  return (
    <div className="ui-screen">
      <div className="panel scanlines results">
        <div className="menu-kicker">
          {zone?.name ?? snapshot.zoneName} · {track?.name ?? snapshot.track}
        </div>
        <h2>{snapshot.dnf ? 'Гонка провалена' : player?.place === 1 ? 'Победа!' : 'Финиш'}</h2>
        <div className="small muted">
          {snapshot.dnf
            ? 'Ты не дожил до финиша. Пустошь забрала ещё одного.'
            : `Ты финишировал ${player?.place ?? '—'} из ${rows.length}. Очки идут в копилку сезона.`}
        </div>

        <table className="result-table">
          <thead>
            <tr>
              <th>#</th>
              <th>Пилот</th>
              <th>Лучший круг</th>
              <th>Статус</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={`${row.place}-${row.name}`} className={row.isPlayer ? 'player' : ''}>
                <td>{row.place}</td>
                <td>{row.name}</td>
                <td>{formatLapTime(Math.min(...row.lapTimes.filter((time) => time > 0)))}</td>
                <td>{row.dnf ? 'DNF' : row.finished ? 'ФИНИШ' : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>

        <div className="reward-row">
          <div className="reward">
            <b>{money(player?.money ?? 0)}</b>
            <span>ДЕНЬГИ</span>
          </div>
          <div className="reward">
            <b>{player?.points ?? 0}</b>
            <span>ОЧКИ СЕЗОНА</span>
          </div>
          <div className="reward">
            <b>{player?.trophies ?? 0}</b>
            <span>ТРОФЕИ</span>
          </div>
          <div className="reward">
            <b>{player?.dominance ?? 0}</b>
            <span>ДОМИНИРОВАНИЕ</span>
          </div>
          <div className="reward">
            <b>{player?.scrap ?? 0}</b>
            <span>УТИЛЬ</span>
          </div>
        </div>

        {snapshot.seasonFailed && (
          <div className="banner">
            Сезон провален: очки сброшены, но деньги и улучшения остались. Соберись и попробуй снова.
          </div>
        )}

        <div className="result-actions">
          <button className="primary" onClick={() => game.nextRace()}>
            Следующая трасса
          </button>
          <button onClick={() => game.quitToGarage()}>В гараж</button>
          <button className="ghost" onClick={() => game.goToMenu()}>
            В меню
          </button>
        </div>
      </div>
    </div>
  );
}
