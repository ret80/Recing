import { useCallback, useState } from 'react';
import { useSyncExternalStore } from 'react';
import type { Game } from '../game/Game';
import type { GameStore } from '../game/GameStore';
import { Hud } from './Hud';
import { Menu } from './Menu';
import { Garage } from './Garage';
import { Results, Countdown, Pause, TrackIntro } from './Screens';
import { SettingsPanel } from './SettingsPanel';
import { TouchControls } from './TouchControls';

export function App({ game, store }: { game: Game; store: GameStore }) {
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, store.getSnapshot);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const openSettings = useCallback(() => setSettingsOpen(true), []);

  const screen = snapshot.screen;
  const showHud = screen === 'racing' || screen === 'countdown' || screen === 'trackIntro' || screen === 'paused';

  return (
    <div className="ui-root" style={{ position: 'absolute', inset: 0 }}>
      {showHud && <Hud snapshot={snapshot} />}

      {screen === 'menu' && <Menu game={game} snapshot={snapshot} onSettings={openSettings} />}
      {screen === 'garage' && <Garage game={game} snapshot={snapshot} onSettings={openSettings} />}
      {screen === 'trackIntro' && <TrackIntro snapshot={snapshot} />}
      {screen === 'countdown' && <Countdown snapshot={snapshot} />}
      {screen === 'paused' && <Pause game={game} onSettings={openSettings} />}
      {screen === 'results' && <Results game={game} snapshot={snapshot} />}

      {screen === 'racing' && snapshot.touchControls && <TouchControls game={game} />}

      {settingsOpen && <SettingsPanel game={game} settings={snapshot.settings} onClose={closeSettings} />}
    </div>
  );
}
