import { Entity } from './Entity.js';

const MOVE_SPEED = 91; // pixels per second (+30% balance pass), independent of the Velocidade de Ataque stat

export class Player extends Entity {
  constructor({ poke, x, y }) {
    super({ poke, x, y });
    this.moveSpeed = MOVE_SPEED;
    this.wanderTarget = null;
    this.wanderPause = 0;
    this.radius = 14;
    this.fainted = false;
  }
}
