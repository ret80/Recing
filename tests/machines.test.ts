import { describe, expect, it } from 'vitest';
import { createActor } from 'xstate';
import { createAIMachine } from '../src/ai/aiMachine';
import { gameMachine } from '../src/game/gameMachine';

describe('gameMachine', () => {
  it('walks the full menu -> race -> results flow', () => {
    const actor = createActor(gameMachine);
    actor.start();
    expect(actor.getSnapshot().value).toBe('menu');

    actor.send({ type: 'START' });
    expect(actor.getSnapshot().value).toBe('garage');

    actor.send({ type: 'START_RACE', zone: 2 });
    expect(actor.getSnapshot().value).toBe('trackIntro');
    expect(actor.getSnapshot().context.zone).toBe(2);

    actor.send({ type: 'INTRO_FINISHED' });
    expect(actor.getSnapshot().value).toBe('countdown');

    actor.send({ type: 'COUNTDOWN_FINISHED' });
    expect(actor.getSnapshot().value).toBe('racing');

    actor.send({ type: 'RACE_FINISHED' });
    expect(actor.getSnapshot().value).toBe('results');

    actor.send({ type: 'NEXT_RACE' });
    expect(actor.getSnapshot().value).toBe('trackIntro');
  });

  it('supports pause, resume, quit and DNF', () => {
    const actor = createActor(gameMachine);
    actor.start();
    actor.send({ type: 'LOAD' });
    actor.send({ type: 'START_RACE', zone: 1 });
    actor.send({ type: 'INTRO_FINISHED' });
    actor.send({ type: 'COUNTDOWN_FINISHED' });

    actor.send({ type: 'PAUSE' });
    expect(actor.getSnapshot().value).toBe('paused');
    actor.send({ type: 'RESUME' });
    expect(actor.getSnapshot().value).toBe('racing');

    actor.send({ type: 'DNF' });
    expect(actor.getSnapshot().value).toBe('results');
    expect(actor.getSnapshot().context.lastOutcome).toBe('dnf');
    actor.send({ type: 'GO_GARAGE' });
    expect(actor.getSnapshot().value).toBe('garage');

    actor.send({ type: 'START_RACE', zone: 1 });
    actor.send({ type: 'QUIT' });
    expect(actor.getSnapshot().value).toBe('garage');
  });
});

describe('AI machine', () => {
  it('transitions between cruising, attacking and evading', () => {
    const actor = createActor(createAIMachine(0.8, 0.9));
    actor.start();
    expect(actor.getSnapshot().value).toBe('cruising');

    actor.send({ type: 'ENEMY_SPOTTED', inCone: true });
    expect(actor.getSnapshot().value).toBe('attacking');
    expect(actor.getSnapshot().context.attacks).toBe(1);

    actor.send({ type: 'LOST_TARGET' });
    expect(actor.getSnapshot().value).toBe('cruising');

    actor.send({ type: 'THREAT_BEHIND' });
    expect(actor.getSnapshot().value).toBe('evading');
    expect(actor.getSnapshot().context.lastThreatSide).toBe('back');

    actor.send({ type: 'CLEAR' });
    expect(actor.getSnapshot().value).toBe('cruising');
  });

  it('ignores spotted events outside the cone', () => {
    const actor = createActor(createAIMachine(0.5, 0.5));
    actor.start();
    actor.send({ type: 'ENEMY_SPOTTED', inCone: false });
    expect(actor.getSnapshot().value).toBe('cruising');
  });

  it('enters recovering on STUCK', () => {
    const actor = createActor(createAIMachine(0.5, 0.5));
    actor.start();
    actor.send({ type: 'STUCK' });
    expect(actor.getSnapshot().value).toBe('recovering');
    actor.send({ type: 'RECOVERED' });
    expect(actor.getSnapshot().value).toBe('cruising');
  });
});
