import type { Game } from '../game/Game';
import type { AppSnapshot } from '../game/GameStore';

export function Menu({
  game,
  snapshot,
  onSettings,
}: {
  game: Game;
  snapshot: AppSnapshot;
  onSettings: () => void;
}) {
  return (
    <div className="ui-screen">
      <div className="panel scanlines menu">
        <div className="menu-kicker">АРКАДНЫЕ БОИ НА ВЫЖИВАНИЕ</div>
        <h1>
          Rust <span>&amp; Ruin</span>
        </h1>
        <p className="menu-sub">
          Пустошь не прощает слабых. Гоняй по ржавым трассам, разбирай соперников на запчасти и
          зарабатывай репутацию, пока не добрался до Зоны Отчуждения.
        </p>
        <div className="menu-actions">
          <button className="primary" onClick={() => game.newGame()}>
            Новая игра
          </button>
          <button onClick={() => game.loadProfile()}>Продолжить</button>
          <button className="ghost" onClick={onSettings}>
            Настройки
          </button>
        </div>
        <div className="menu-foot">
          {snapshot.profile.totalRaces > 0
            ? `${snapshot.profile.totalRaces} гонок · ${snapshot.profile.totalTrophies} трофеев · лучший результат — ${snapshot.profile.bestPlace}`
            : 'WASD / стрелки — управление · Space — огонь · E — буст · Esc — пауза'}
        </div>
      </div>
    </div>
  );
}
