import { Entity } from './Entity.js';
import { getEncounter } from '../data/enemies.js';

const MOVE_SPEED = 58.5; // pixels per second (+30% balance pass)
const AGGRO_RADIUS_MULTIPLIER = 2.5; // +150% lure range

export class Enemy extends Entity {
  constructor({ poke, x, y, encounterId }) {
    super({ poke, x, y });
    this.encounterId = encounterId;
    this.spawnPoint = { x, y };
    this.moveSpeed = MOVE_SPEED;
    this.wanderTarget = null;
    this.wanderPause = 0;
    this.radius = 15;

    const encounter = getEncounter(encounterId);
    this.aggroRadius = encounter.aggroRadius * AGGRO_RADIUS_MULTIPLIER;
    this.wanderRadius = encounter.wanderRadius;
    this.leashRadius = this.aggroRadius * 2.2;
  }
}
