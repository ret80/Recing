import { assign, setup } from 'xstate';
import type { ZoneId } from '../config/balance';

export type GameScreen = 'menu' | 'garage' | 'trackIntro' | 'countdown' | 'racing' | 'paused' | 'results';

export type GameMachineContext = {
  zone: ZoneId;
  lastOutcome: 'finished' | 'dnf' | 'none';
};

export const gameMachine = setup({
  types: {
    context: {} as GameMachineContext,
    events: {} as
      | { type: 'START' }
      | { type: 'LOAD' }
      | { type: 'START_RACE'; zone: ZoneId }
      | { type: 'INTRO_FINISHED' }
      | { type: 'COUNTDOWN_FINISHED' }
      | { type: 'RACE_FINISHED' }
      | { type: 'DNF' }
      | { type: 'PAUSE' }
      | { type: 'RESUME' }
      | { type: 'QUIT' }
      | { type: 'NEXT_RACE' }
      | { type: 'NEXT_DIVISION' }
      | { type: 'NEXT_ZONE'; zone: ZoneId }
      | { type: 'SEASON_FAILED' }
      | { type: 'BACK_TO_MENU' }
      | { type: 'GO_GARAGE' },
  },
  actions: {
    setZone: assign({
      zone: ({ event }) => ('zone' in event ? event.zone : 1),
    }),
    setOutcomeFinished: assign({ lastOutcome: () => 'finished' as const }),
    setOutcomeDnf: assign({ lastOutcome: () => 'dnf' as const }),
  },
  guards: {
    isDnf: ({ context }) => context.lastOutcome === 'dnf',
  },
}).createMachine({
  id: 'game',
  initial: 'menu',
  context: {
    zone: 1,
    lastOutcome: 'none',
  },
  states: {
    menu: {
      on: { START: 'garage', LOAD: 'garage' },
    },
    garage: {
      on: {
        START_RACE: { target: 'trackIntro', actions: 'setZone' },
        BACK_TO_MENU: 'menu',
      },
    },
    trackIntro: {
      on: {
        INTRO_FINISHED: 'countdown',
        PAUSE: 'paused',
        QUIT: 'garage',
      },
    },
    countdown: {
      on: {
        COUNTDOWN_FINISHED: 'racing',
        PAUSE: 'paused',
        QUIT: 'garage',
      },
    },
    racing: {
      on: {
        RACE_FINISHED: { target: 'results', actions: 'setOutcomeFinished' },
        DNF: { target: 'results', actions: 'setOutcomeDnf' },
        PAUSE: 'paused',
        QUIT: 'garage',
      },
    },
    paused: {
      on: {
        RESUME: 'racing',
        QUIT: 'garage',
      },
    },
    results: {
      on: {
        NEXT_RACE: 'trackIntro',
        NEXT_DIVISION: 'garage',
        NEXT_ZONE: { target: 'trackIntro', actions: 'setZone' },
        SEASON_FAILED: 'garage',
        GO_GARAGE: 'garage',
        BACK_TO_MENU: 'menu',
      },
    },
  },
});

export type GameActor = import('xstate').ActorRefFrom<typeof gameMachine>;
