import { useEffect, useState } from 'react';
import type { Game } from '../game/Game';
import type { GameSettings } from '../game/storage';
import type { InputAction } from '../game/InputSystem';

const ACTION_LABELS: Record<InputAction, string> = {
  throttle: 'Газ',
  brake: 'Тормоз',
  left: 'Влево',
  right: 'Вправо',
  fireFront: 'Переднее оружие',
  fireRear: 'Заднее оружие',
  fireBoost: 'Буст',
  pause: 'Пауза',
};

const ORDER: InputAction[] = ['throttle', 'brake', 'left', 'right', 'fireFront', 'fireRear', 'fireBoost', 'pause'];

function keyLabel(code: string): string {
  return code
    .replace('Key', '')
    .replace('Arrow', '')
    .replace('ControlLeft', 'CTRL')
    .replace('ShiftLeft', 'SHIFT')
    .replace('Space', 'SPACE')
    .replace('Escape', 'ESC');
}

export function SettingsPanel({
  game,
  settings,
  onClose,
}: {
  game: Game;
  settings: GameSettings;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<GameSettings>(settings);
  const [bindings, setBindings] = useState(() => game.getBindings());
  const [rebinding, setRebinding] = useState<InputAction | null>(null);
  const [gamepad, setGamepad] = useState(true);

  useEffect(() => {
    if (!rebinding) return;
    const handler = (event: KeyboardEvent): void => {
      event.preventDefault();
      if (event.code === 'Escape') {
        setRebinding(null);
        return;
      }
      game.setBinding(rebinding, [event.code]);
      setBindings(game.getBindings());
      setRebinding(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [game, rebinding]);

  const update = (patch: Partial<GameSettings>): void => {
    const next = { ...local, ...patch };
    setLocal(next);
    game.setSettings(next);
  };

  return (
    <div className="ui-screen">
      <div className="panel settings">
        <button className="modal-close" onClick={onClose} aria-label="Закрыть">
          ×
        </button>
        <h2>Настройки</h2>

        <div className="settings-row">
          <span>Громкость</span>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={local.volume}
            onChange={(event) => update({ volume: Number(event.target.value) })}
          />
          <span className="stat-value">{Math.round(local.volume * 100)}%</span>
        </div>

        <div className="settings-row">
          <span>Модель вождения</span>
          <div className="row">
            <button
              className={local.drivingMode === 'sim' ? 'primary' : 'ghost'}
              onClick={() => update({ drivingMode: 'sim' })}
            >
              Симуляция
            </button>
            <button
              className={local.drivingMode === 'arcade' ? 'primary' : 'ghost'}
              onClick={() => update({ drivingMode: 'arcade' })}
            >
              Аркада
            </button>
          </div>
          <span className="small muted">
            {local.drivingMode === 'sim'
              ? 'Сцепление шин по углу скольжения и весу: физически корректно, ошибки не прощаются'
              : 'Цепкий руль, автовыравнивание и прижимная сила: проще и веселее'}
          </span>
        </div>

        <div className="settings-row">
          <span>Плотность частиц</span>
          <div className="row">
            <button
              className={local.particles === 'high' ? 'primary' : 'ghost'}
              onClick={() => update({ particles: 'high' })}
            >
              Высокая
            </button>
            <button
              className={local.particles === 'low' ? 'primary' : 'ghost'}
              onClick={() => update({ particles: 'low' })}
            >
              Низкая
            </button>
          </div>
          <span />
        </div>

        <div className="settings-row">
          <span>Качество графики</span>
          <div className="row">
            <button
              className={local.quality === 'high' ? 'primary' : 'ghost'}
              onClick={() => update({ quality: 'high' })}
            >
              Высокое
            </button>
            <button
              className={local.quality === 'low' ? 'primary' : 'ghost'}
              onClick={() => update({ quality: 'low' })}
            >
              Низкое
            </button>
          </div>
          <span />
        </div>

        <div className="settings-row">
          <span>Тряска камеры</span>
          <label className="row">
            <input
              type="checkbox"
              checked={local.cameraShake}
              onChange={(event) => update({ cameraShake: event.target.checked })}
            />
            <span className="small muted">Включена при взрывах и попаданиях</span>
          </label>
          <span />
        </div>

        <div className="settings-row">
          <span>Пост-обработка</span>
          <label className="row">
            <input
              type="checkbox"
              checked={local.postProcessing}
              onChange={(event) => update({ postProcessing: event.target.checked })}
            />
            <span className="small muted">Виньетка и цветокоррекция (MVP: резерв)</span>
          </label>
          <span />
        </div>

        <div className="settings-row">
          <span>Геймпад</span>
          <label className="row">
            <input
              type="checkbox"
              checked={gamepad}
              onChange={(event) => {
                setGamepad(event.target.checked);
                game.setGamepadEnabled(event.target.checked);
              }}
            />
            <span className="small muted">Gamepad API: левый стик, RT/LT, A/B/X</span>
          </label>
          <span />
        </div>

        <h3 style={{ marginTop: 18 }}>Управление</h3>
        <div className="bindings">
          {ORDER.map((action) => (
            <div key={action} className="row spread">
              <span>{ACTION_LABELS[action]}</span>
              <button
                className={rebinding === action ? 'primary' : 'ghost'}
                style={{ padding: '4px 8px', fontSize: 10 }}
                onClick={() => setRebinding(action)}
              >
                {rebinding === action
                  ? 'НАЖМИТЕ КЛАВИШУ'
                  : bindings[action].map(keyLabel).join(' / ')}
              </button>
            </div>
          ))}
        </div>
        <div className="small muted" style={{ marginTop: 10 }}>
          Переназначение действует до перезагрузки страницы. Esc отменяет захват клавиши.
        </div>
      </div>
    </div>
  );
}
