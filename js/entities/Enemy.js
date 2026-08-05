import { Entity } from './Entity.js';
import { getEncounter } from '../data/enemies.js';

const MOVE_SPEED = 58.5; // pixels per second (+30% balance pass)
// Explicit user request: dial the lure/aggro range back down to "moderate" —
// wilds should only close in from a medium distance, not the +150% boost
// this used to apply on top of the encounter's real base aggroRadius (175,
// see scripts/sync-planilha.js#syncMapsAndEncounters). 1x means the base
// value now applies as-is.
const AGGRO_RADIUS_MULTIPLIER = 1;

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
