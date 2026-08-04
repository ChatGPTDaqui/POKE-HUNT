// Short-lived visual effect for an attack (slash flash or particle burst).
// Purely cosmetic — combat resolution happens in CombatSystem before the
// effect is created.
let nextEffectId = 1;

export class Effect {
  constructor({
    type, x, y, targetX, targetY, radius = 10, color = '#fff', duration = 0.25,
    value, effectiveness, effectivenessLabel, text, unit, isAoe, owner, laneSize = 1,
    worldSize,
  }) {
    this.id = `effect-${nextEffectId++}`;
    this.type = type; // 'damageNumber' | 'abilityName' | 'rewardText' | 'abilityEffect'
    this.x = x;
    this.y = y;
    this.targetX = targetX;
    this.targetY = targetY;
    this.radius = radius;
    this.color = color;
    this.duration = duration;
    this.age = 0;
    this.value = value; // damageNumber/rewardText
    this.effectiveness = effectiveness; // future type-advantage hook, unset for now
    this.effectivenessLabel = effectivenessLabel;
    this.text = text; // abilityName
    this.unit = unit; // rewardText suffix, e.g. 'XP' or 'Ouro'
    this.isAoe = isAoe; // abilityEffect — draws an expanding ring instead of a burst
    this.worldSize = worldSize; // abilityEffect — AOE moves draw at this diameter instead of the flat default

    // Floating-text effects (damageNumber/abilityName/rewardText) that name an
    // `owner` entity track it live instead of freezing targetX/targetY at
    // spawn time — see Sprites.js's drawers, which read owner.x/y each frame
    // when this is set. `lane` (see Entity#claimEffectLane) staggers several
    // simultaneous texts above the same owner so they never overlap.
    // `laneSize` > 1 for effects taller than one line (a damage number with
    // an effectiveness label stacked above it) reserves extra room so the
    // next effect up doesn't get placed inside that space.
    this.laneSize = laneSize;
    this.owner = owner || null;
    this.lane = owner ? owner.claimEffectLane(this.id, laneSize) : 0;
  }

  get progress() {
    return Math.min(1, this.age / this.duration);
  }

  get done() {
    return this.age >= this.duration;
  }

  tick(dt) {
    this.age += dt;
  }
}
