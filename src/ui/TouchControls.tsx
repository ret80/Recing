import { useCallback, useEffect, useRef, useState } from 'react';
import type { Game } from '../game/Game';
import type { TouchState } from '../game/InputSystem';

type FireKey = 'fireFront' | 'fireRear' | 'fireBoost';

function firePatch(key: FireKey, value: boolean): Partial<TouchState> {
  if (key === 'fireFront') return { fireFront: value };
  if (key === 'fireRear') return { fireRear: value };
  return { fireBoost: value };
}

type Stick = {
  pointerId: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
};

const STEER_RANGE = 62;
const SPEED_RANGE = 78;
const AXIS_DEADZONE = 0.06;

function clampAxis(value: number): number {
  const clamped = Math.max(-1, Math.min(1, value));
  return Math.abs(clamped) < AXIS_DEADZONE ? 0 : clamped;
}

/**
 * Экранные контролы: левый стик — повороты, правый — скорость.
 * Появляются в точке касания и исчезают, когда палец отпущен.
 */
export function TouchControls({ game }: { game: Game }) {
  const [steerStick, setSteerStick] = useState<Stick | null>(null);
  const [speedStick, setSpeedStick] = useState<Stick | null>(null);
  const steerRef = useRef<Stick | null>(null);
  const speedRef = useRef<Stick | null>(null);

  const applySteer = useCallback(
    (stick: Stick) => {
      const dx = stick.x - stick.originX;
      // Влево по экрану — влево по рулю (как у клавиатуры, steer > 0 = влево).
      game.setTouchInput({ steer: clampAxis(-dx / STEER_RANGE) });
    },
    [game],
  );

  const applySpeed = useCallback(
    (stick: Stick) => {
      const dy = stick.y - stick.originY;
      const up = clampAxis(-dy / SPEED_RANGE);
      game.setTouchInput({
        throttle: Math.max(0, up),
        brake: Math.max(0, -up),
      });
    },
    [game],
  );

  const handlePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === 'mouse') return;
    const half = window.innerWidth * 0.5;
    const stick: Stick = {
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      x: event.clientX,
      y: event.clientY,
    };
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      /* не все браузеры разрешают захват для синтетических/отменённых касаний */
    }
    if (event.clientX <= half) {
      steerRef.current = stick;
      setSteerStick(stick);
      applySteer(stick);
    } else {
      speedRef.current = stick;
      setSpeedStick(stick);
      applySpeed(stick);
    }
  };

  const handlePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const steer = steerRef.current;
    if (steer && steer.pointerId === event.pointerId) {
      const next = { ...steer, x: event.clientX, y: event.clientY };
      steerRef.current = next;
      setSteerStick(next);
      applySteer(next);
      return;
    }
    const speed = speedRef.current;
    if (speed && speed.pointerId === event.pointerId) {
      const next = { ...speed, x: event.clientX, y: event.clientY };
      speedRef.current = next;
      setSpeedStick(next);
      applySpeed(next);
    }
  };

  const endPointer = (event: React.PointerEvent<HTMLDivElement>) => {
    if (steerRef.current?.pointerId === event.pointerId) {
      steerRef.current = null;
      setSteerStick(null);
      game.setTouchInput({ steer: 0 });
    }
    if (speedRef.current?.pointerId === event.pointerId) {
      speedRef.current = null;
      setSpeedStick(null);
      game.setTouchInput({ throttle: 0, brake: 0 });
    }
  };

  useEffect(() => {
    return () => game.setTouchInput({ active: false, steer: 0, throttle: 0, brake: 0 });
  }, [game]);

  const setActive = (active: boolean) => game.setTouchInput({ active });

  const steerOffset = steerStick
    ? Math.max(-STEER_RANGE, Math.min(STEER_RANGE, steerStick.x - steerStick.originX))
    : 0;
  const speedOffset = speedStick
    ? Math.max(-SPEED_RANGE, Math.min(SPEED_RANGE, speedStick.y - speedStick.originY))
    : 0;

  const holdButton = (key: FireKey) => ({
    onPointerDown: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {
        /* см. выше */
      }
      setActive(true);
      game.setTouchInput(firePatch(key, true));
    },
    onPointerUp: (event: React.PointerEvent<HTMLButtonElement>) => {
      event.stopPropagation();
      game.setTouchInput(firePatch(key, false));
    },
    onPointerCancel: () => game.setTouchInput(firePatch(key, false)),
  });

  return (
    <div
      className="touch-layer"
      onPointerDown={(event) => {
        setActive(true);
        handlePointerDown(event);
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={endPointer}
      onPointerCancel={endPointer}
    >
      {steerStick && (
        <div
          className="touch-stick touch-stick-steer"
          style={{ left: steerStick.originX, top: steerStick.originY }}
        >
          <span className="touch-stick-label">РУЛЬ</span>
          <span className="touch-stick-knob" style={{ transform: `translateX(${steerOffset}px)` }} />
        </div>
      )}
      {speedStick && (
        <div
          className="touch-stick touch-stick-speed"
          style={{ left: speedStick.originX, top: speedStick.originY }}
        >
          <span className="touch-stick-label">{speedOffset < 0 ? 'ГАЗ' : speedOffset > 0 ? 'ТОРМОЗ' : 'СКОРОСТЬ'}</span>
          <span className="touch-stick-knob" style={{ transform: `translateY(${speedOffset}px)` }} />
        </div>
      )}

      <div className="touch-buttons">
        <button
          className="touch-btn pause"
          onPointerDown={(event) => {
            event.stopPropagation();
            game.togglePause();
          }}
          aria-label="Пауза"
        >
          ❚❚
        </button>
        <button className="touch-btn fire" {...holdButton('fireFront')} aria-label="Переднее оружие">
          ОГОНЬ
        </button>
        <button className="touch-btn rear" {...holdButton('fireRear')} aria-label="Заднее оружие">
          ЗАД
        </button>
        <button className="touch-btn boost" {...holdButton('fireBoost')} aria-label="Буст">
          БУСТ
        </button>
      </div>
    </div>
  );
}
