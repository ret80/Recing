import type { Game } from '../game/Game';
import type { DebugGridState } from '../game/GameStore';

const toHex = (value: number): string => `#${value.toString(16).padStart(6, '0')}`;
const fromHex = (value: string): number => Number.parseInt(value.replace('#', ''), 16) || 0;

/**
 * Отладочная панель (открывается через ?debug). Позволяет включить сетку
 * дорожного полотна и сетку рельефа и задать им цвета.
 */
export function DebugPanel({ game, grid }: { game: Game; grid: DebugGridState }) {
  const update = (patch: Partial<DebugGridState>): void => game.setDebugGrid(patch);

  return (
    <div className="debug-panel">
      <div className="debug-title">DEBUG</div>

      <label className="debug-row">
        <input
          type="checkbox"
          checked={grid.road}
          onChange={(event) => update({ road: event.target.checked })}
        />
        <span>Сетка дороги</span>
        <input
          type="color"
          value={toHex(grid.roadColor)}
          onChange={(event) => update({ roadColor: fromHex(event.target.value) })}
          aria-label="Цвет сетки дороги"
        />
      </label>

      <label className="debug-row">
        <input
          type="checkbox"
          checked={grid.terrain}
          onChange={(event) => update({ terrain: event.target.checked })}
        />
        <span>Сетка ландшафта</span>
        <input
          type="color"
          value={toHex(grid.terrainColor)}
          onChange={(event) => update({ terrainColor: fromHex(event.target.value) })}
          aria-label="Цвет сетки ландшафта"
        />
      </label>
    </div>
  );
}
