import { describe, expect, it } from 'vitest';
import { Transform, World } from '../src/ecs/components';
import { NameTag } from '../src/ecs/components';

describe('minimal ECS', () => {
  it('creates entities and stores typed components', () => {
    const world = new World();
    const id = world.createEntity();
    const transform = world.add(id, new Transform());
    world.add(id, new NameTag('Player', true));

    expect(transform).toBeInstanceOf(Transform);
    expect(world.get(id, Transform)).toBe(transform);
    expect(world.get(id, NameTag)?.value).toBe('Player');
    expect(world.has(id, Transform)).toBe(true);
    expect(world.require(id, Transform)).toBe(transform);
  });

  it('queries entities that have all requested components', () => {
    const world = new World();
    const both = world.createEntity();
    world.add(both, new Transform());
    world.add(both, new NameTag('A', false));
    const onlyTransform = world.createEntity();
    world.add(onlyTransform, new Transform());

    expect(world.query(Transform).sort()).toEqual([both, onlyTransform].sort());
    expect(world.query(Transform, NameTag)).toEqual([both]);
    expect(world.query()).toHaveLength(2);
  });

  it('removes and destroys components and entities', () => {
    const world = new World();
    const id = world.createEntity();
    world.add(id, new Transform());
    world.remove(id, Transform);
    expect(world.has(id, Transform)).toBe(false);
    expect(() => world.require(id, Transform)).toThrow(/no component/);

    world.add(id, new Transform());
    world.destroyEntity(id);
    expect(world.get(id, Transform)).toBeUndefined();
    expect(world.count).toBe(0);
  });

  it('notifies destroy listeners once per entity', () => {
    const world = new World();
    const destroyed: number[] = [];
    const unsubscribe = world.onDestroy((id) => destroyed.push(id));
    const id = world.createEntity();
    world.destroyEntity(id);
    world.destroyEntity(id);
    expect(destroyed).toEqual([id]);

    unsubscribe();
    const second = world.createEntity();
    world.destroyEntity(second);
    expect(destroyed).toEqual([id]);
  });

  it('clears all state and restarts ids', () => {
    const world = new World();
    world.createEntity();
    world.clear();
    expect(world.count).toBe(0);
    expect(world.createEntity()).toBe(1);
  });

  it('rejects components on missing entities', () => {
    const world = new World();
    expect(() => world.add(999, new Transform())).toThrow(/does not exist/);
  });
});
