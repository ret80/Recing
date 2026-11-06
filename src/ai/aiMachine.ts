import { assign, setup } from 'xstate';

export type AIStateValue = 'cruising' | 'attacking' | 'evading' | 'recovering';

export type AIContext = {
  aggression: number;
  skill: number;
  lastThreatSide: 'front' | 'back' | null;
  attacks: number;
};

export type AIEvent =
  | { type: 'ENEMY_SPOTTED'; inCone: boolean }
  | { type: 'THREAT_FRONT'; obstacle: boolean }
  | { type: 'THREAT_BEHIND' }
  | { type: 'CLEAR' }
  | { type: 'STUCK' }
  | { type: 'RECOVERED' }
  | { type: 'LOST_TARGET' };

export function createAIMachine(aggression: number, skill: number) {
  return setup({
    types: {
      context: {} as AIContext,
      events: {} as AIEvent,
    },
    guards: {
      enemyInCone: ({ event }) => event.type === 'ENEMY_SPOTTED' && event.inCone,
      canAttack: ({ context }) => context.aggression >= 0,
      hasThreatFront: ({ event }) => event.type === 'THREAT_FRONT',
      hasThreatBehind: ({ event }) => event.type === 'THREAT_BEHIND',
      isStuck: ({ event }) => event.type === 'STUCK',
    },
    actions: {
      markFront: assign({ lastThreatSide: () => 'front' as const }),
      markBack: assign({ lastThreatSide: () => 'back' as const }),
      countAttack: assign({ attacks: ({ context }) => context.attacks + 1 }),
    },
  }).createMachine({
    id: 'ai',
    initial: 'cruising',
    context: {
      aggression,
      skill,
      lastThreatSide: null,
      attacks: 0,
    },
    states: {
      cruising: {
        on: {
          ENEMY_SPOTTED: { target: 'attacking', guard: 'enemyInCone', actions: 'countAttack' },
          THREAT_FRONT: { target: 'evading', guard: 'hasThreatFront', actions: 'markFront' },
          THREAT_BEHIND: { target: 'evading', guard: 'hasThreatBehind', actions: 'markBack' },
          STUCK: { target: 'recovering', guard: 'isStuck' },
        },
      },
      attacking: {
        on: {
          LOST_TARGET: 'cruising',
          THREAT_BEHIND: { target: 'evading', actions: 'markBack' },
          THREAT_FRONT: { target: 'evading', actions: 'markFront' },
          STUCK: { target: 'recovering', guard: 'isStuck' },
        },
      },
      evading: {
        on: {
          CLEAR: 'cruising',
          STUCK: { target: 'recovering', guard: 'isStuck' },
        },
        after: {
          1500: { target: 'cruising' },
        },
      },
      recovering: {
        on: {
          RECOVERED: 'cruising',
        },
        after: {
          1200: { target: 'cruising' },
        },
      },
    },
  });
}
