import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { Game } from './game/Game';
import { GameStore } from './game/GameStore';
import { App } from './ui/App';
import './index.css';

const canvas = document.querySelector<HTMLCanvasElement>('#game-canvas');
const overlay = document.querySelector<HTMLElement>('#ui-overlay');

if (!canvas || !overlay) {
  throw new Error('Game canvas or UI overlay is missing from index.html');
}

const store = new GameStore();
const game = new Game(canvas, store);

if (import.meta.env.DEV) {
  (window as unknown as { __game?: Game }).__game = game;
}

createRoot(overlay).render(
  <StrictMode>
    <App game={game} store={store} />
  </StrictMode>,
);

let last = performance.now();
let frameHandle = 0;

function frame(now: number): void {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  game.update(dt);
  game.render(dt);
  frameHandle = requestAnimationFrame(frame);
}

frameHandle = requestAnimationFrame(frame);

window.addEventListener(
  'beforeunload',
  () => {
    cancelAnimationFrame(frameHandle);
    game.dispose();
  },
  { once: true },
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    cancelAnimationFrame(frameHandle);
    game.dispose();
  });
}
