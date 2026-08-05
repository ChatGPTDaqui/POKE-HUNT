// All drawing calls live here so swapping placeholders for real spritesheets
// later only touches this file.
import { directionRowFromFacing } from '../systems/AnimationSystem.js';
import { scaleForSpecies } from '../data/pokeHeights.js';
import { footOffsetFraction } from '../data/spriteFootOffsets.js';
import { hpBarFillColor } from '../data/hpBar.js';
import { AURA_COLORS } from '../data/auraColors.js';
import { LEGENDARY_SPECIES_IDS } from '../data/legendaries.js';
import { impactShapeForType } from '../data/impactShapes.js';
import { CAPTURE_ANIM_URL, CAPTURE_ANIM_FRAME_DURATION, captureAnimFrameRect } from '../data/captureAnim.js';

const IV_MAX = 31;

// Battle sprites (assets/battle-sprites/) load lazily and async; this caches
// the Image objects across draws so we're not re-creating one every frame.
const imageCache = new Map();
function getOrLoadImage(url) {
  let img = imageCache.get(url);
  if (!img) {
    img = new Image();
    img.src = url;
    imageCache.set(url, img);
  }
  return img;
}

function drawPlaceholderShape(ctx, entity) {
  const { shape, color } = entity.species;
  const r = entity.radius;
  ctx.save();
  ctx.translate(entity.x, entity.y);
  ctx.fillStyle = entity.flashTimer > 0 ? '#ffffff' : color;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;

  ctx.beginPath();
  if (shape === 'circle') {
    ctx.arc(0, 0, r, 0, Math.PI * 2);
  } else if (shape === 'square') {
    ctx.rect(-r, -r, r * 2, r * 2);
  } else if (shape === 'diamond') {
    ctx.moveTo(0, -r);
    ctx.lineTo(r, 0);
    ctx.lineTo(0, r);
    ctx.lineTo(-r, 0);
    ctx.closePath();
  } else {
    // triangle, pointed toward facing direction
    ctx.moveTo(0, -r);
    ctx.lineTo(r, r);
    ctx.lineTo(-r, r);
    ctx.closePath();
  }
  ctx.fill();
  ctx.stroke();
  ctx.restore();
}

// Draws the current frame of entity.battleAnim (set by AnimationSystem),
// picking the sprite sheet row from facing direction. Scaled up per the
// species' real-world height (data/pokeHeights.js), anchored around the
// frame's vertical center (which sits at entity.y, per footOffsetFraction's
// own measurement convention) so the *visible foot pixel* — not the frame's
// transparent-padding bottom edge — lands at entity.groundOffset regardless
// of scale, matching the shadow drawn beneath it. Returns false (so the
// caller falls back to the placeholder shape) if the image isn't loaded yet.
// Screen-space rect a battle sprite occupies (shared by drawBattleSprite and
// drawAura, which outlines that same rect) — null when there's no loaded
// battle anim to size against, so callers fall back to a plain radius circle.
function spriteBounds(entity) {
  if (!entity.battleAnim) return null;
  const anim = entity.battleAnim;
  const scale = scaleForSpecies(entity.species.id);
  const footFraction = footOffsetFraction(entity.species.id);
  const destW = anim.frameWidth * scale;
  const destH = anim.frameHeight * scale;
  const groundY = entity.y + entity.groundOffset;
  // Bottom-of-frame sits (0.5 + footFraction) * destH below the frame's
  // center; placing the top that far above groundY puts the actual foot
  // pixel — not the frame's empty bottom padding — at groundY.
  const topY = groundY - destH * (0.5 + footFraction);
  return { x: entity.x - destW / 2, y: topY, w: destW, h: destH };
}

// Which source rect of the loaded spritesheet the current frame/facing needs
// — shared by drawBattleSprite (draws it for real) and drawAura (needs the
// same pixels to cast a silhouette-shaped glow). Returns null if the image
// isn't loaded yet.
function currentFrameSource(entity) {
  if (!entity.battleAnim) return null;
  const anim = entity.battleAnim;
  const img = getOrLoadImage(anim.url);
  if (!img.complete || img.naturalWidth === 0) return null;

  // Most anims are the standard 8-direction-row PMD sheet, but Sleep (used
  // as Faint's fallback — see ANIM_FALLBACKS in battleSprites.js) ships as a
  // single row with no per-direction art. Reading a directional row off a
  // 1-row sheet would sample past the image's actual pixels (silently
  // drawing nothing), so clamp to however many rows the loaded image really has.
  const rowCount = Math.max(1, Math.round(img.naturalHeight / anim.frameHeight));
  const row = Math.min(rowCount - 1, directionRowFromFacing(entity.facing));
  return {
    img,
    sx: entity.animFrame * anim.frameWidth,
    sy: row * anim.frameHeight,
    sw: anim.frameWidth,
    sh: anim.frameHeight,
  };
}

function drawBattleSprite(ctx, entity) {
  const frame = currentFrameSource(entity);
  if (!frame) return false;

  const bounds = spriteBounds(entity);

  ctx.save();
  if (entity.flashTimer > 0) ctx.filter = 'brightness(2.2)';
  ctx.drawImage(
    frame.img, frame.sx, frame.sy, frame.sw, frame.sh,
    bounds.x, bounds.y, bounds.w, bounds.h,
  );
  ctx.restore();
  return true;
}

// Discreet neon outline per maxed IV stat (see data/auraColors.js). Rather
// than stroking the sprite's rectangular bounding box (which read as a
// square picture frame — PMD battle frames carry a lot of transparent
// padding around the actual pokemon for their bounce animation, see
// spriteFootOffsets.js), this casts the sprite's own current frame as a
// canvas shadow: shadowColor/shadowBlur blur the drawn image's *alpha
// shape*, ignoring its real colors, so the halo hugs the actual silhouette
// (legs, ears, tail...) instead of the frame's empty corners. The
// (barely-visible, low-alpha) copy of the sprite drawn here to cast that
// shadow gets fully covered a moment later by drawBattleSprite's real draw —
// only the blurred glow bleeding past the silhouette's edges remains
// visible. Falls back to a plain stroked circle around the entity's
// collision radius for placeholder shapes (no battle sprite loaded).
function drawAura(ctx, entity) {
  const ivs = entity.poke.ivs;
  const maxedStats = Object.keys(AURA_COLORS).filter((key) => ivs[key] >= IV_MAX);
  if (maxedStats.length === 0) return;

  const frame = currentFrameSource(entity);
  const bounds = frame && spriteBounds(entity);
  const alpha = maxedStats.length > 1 ? 0.55 : 0.85;

  ctx.save();
  ctx.globalAlpha = alpha;
  if (bounds) {
    maxedStats.forEach((stat, i) => {
      ctx.shadowColor = AURA_COLORS[stat];
      ctx.shadowBlur = 9 + i * 5;
      ctx.drawImage(
        frame.img, frame.sx, frame.sy, frame.sw, frame.sh,
        bounds.x, bounds.y, bounds.w, bounds.h,
      );
    });
  } else {
    maxedStats.forEach((stat, i) => {
      ctx.shadowColor = AURA_COLORS[stat];
      ctx.shadowBlur = 9 + i * 5;
      ctx.strokeStyle = AURA_COLORS[stat];
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(entity.x, entity.y, entity.radius + i * 3, 0, Math.PI * 2);
      ctx.stroke();
    });
  }
  ctx.restore();
}

// How far above entity.y the visible top of the sprite sits — used to anchor
// the HP bar/name tag above whatever's actually on screen, scaled sprite or
// placeholder shape alike. Mirrors drawBattleSprite's anchor math (frame
// centered around entity.y + groundOffset's foot pixel, not the frame's
// padded bottom edge).
function visualTopOffset(entity) {
  if (!entity.battleAnim) return entity.radius;
  const scale = scaleForSpecies(entity.species.id);
  const footFraction = footOffsetFraction(entity.species.id);
  return entity.battleAnim.frameHeight * (scale * (0.5 + footFraction) - footFraction);
}

// Soft dark ellipse under the entity's feet — drawn before the sprite/shape
// so it reads as a shadow cast on the ground rather than floating on top.
function drawShadow(ctx, entity) {
  const groundY = entity.y + entity.groundOffset;
  const baseWidth = entity.battleAnim
    ? entity.battleAnim.frameWidth * scaleForSpecies(entity.species.id)
    : entity.radius * 2;
  const rx = baseWidth * 0.32;
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.beginPath();
  ctx.ellipse(entity.x, groundY - 1, rx, rx * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function drawEntity(ctx, entity) {
  drawShadow(ctx, entity);
  drawAura(ctx, entity);
  const drewSprite = entity.battleAnim && drawBattleSprite(ctx, entity);
  if (!drewSprite) drawPlaceholderShape(ctx, entity);
}

// Plain rounded-pill HP bar: dark track + colored fill (green/orange/red by
// HP%), no DS chrome frame image — reverted per the user's reference
// screenshot back to this simpler original look.
const HP_BAR_WIDTH = 32;
const HP_BAR_HEIGHT = 5;
function roundedRectPath(ctx, x, y, w, h, r) {
  const radius = Math.min(r, h / 2, w / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

// Legendaries (BOSS hunts, and the Camara dos Lendarios) get a much bigger,
// personalized bar — explicit user request so they read as a boss fight
// instead of using the same small pill every regular wild POKE gets.
const BOSS_HP_BAR_WIDTH_MULTIPLIER = 5;
const BOSS_HP_BAR_HEIGHT_MULTIPLIER = 2;

export function drawHpBar(ctx, entity) {
  const isBoss = LEGENDARY_SPECIES_IDS.includes(entity.species.id);
  const width = HP_BAR_WIDTH * (isBoss ? BOSS_HP_BAR_WIDTH_MULTIPLIER : 1);
  const height = HP_BAR_HEIGHT * (isBoss ? BOSS_HP_BAR_HEIGHT_MULTIPLIER : 1);
  const x = entity.x - width / 2;
  // Bottom edge always sits the same 8px above the sprite's visual top,
  // whatever the bar's height ends up being (boss bars are taller, so they
  // need to start further up to keep that same clearance).
  const y = entity.y - visualTopOffset(entity) - 8 - height;
  const pct = Math.max(0, entity.poke.hp / entity.maxHp);

  ctx.save();
  roundedRectPath(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.9)';
  ctx.lineWidth = 1;
  ctx.stroke();

  if (pct > 0) {
    roundedRectPath(ctx, x, y, width * pct, height, height / 2);
    ctx.fillStyle = hpBarFillColor(pct);
    ctx.fill();
  }
  ctx.restore();
}

// Stacks Lv+name above the entity: level closest to the sprite, name above
// it. Shiny POKEs get the same treatment as everywhere else in the UI — a
// sparkle to the left of the name and the name itself in purple — since
// canvas text can't pick up the .shiny-name/.shiny-tag CSS classes used in
// the HTML menus.
const SHINY_NAME_COLOR = '#b366ff';

export function drawNameLevelTag(ctx, entity) {
  const halfHeight = visualTopOffset(entity);
  const isShiny = entity.poke.isShiny;
  const name = isShiny ? `✨ ${entity.species.name}` : entity.species.name;
  ctx.save();
  ctx.font = '9px monospace';
  ctx.textAlign = 'center';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round'; // avoids miter spikes on sharp glyph corners (M/W/V) reading as blur
  ctx.strokeStyle = '#000000';
  const levelText = `Lv${entity.poke.level}`;
  ctx.strokeText(levelText, entity.x, entity.y - halfHeight - 15);
  ctx.fillStyle = '#f1f1f6';
  ctx.fillText(levelText, entity.x, entity.y - halfHeight - 15);
  ctx.strokeText(name, entity.x, entity.y - halfHeight - 26);
  ctx.fillStyle = isShiny ? SHINY_NAME_COLOR : '#f1f1f6';
  ctx.fillText(name, entity.x, entity.y - halfHeight - 26);
  ctx.restore();
}

// Procedural, type-colored ability effects — replaces the old image-sprite
// system entirely (see CLAUDE.md). Every damaging hit gets a soft glowing
// "fluid" burst of particles in its move's elemental color (typeColors.js);
// AOE hits instead draw an expanding ring sized to the move's real splash
// diameter (`effect.worldSize`, see CombatSystem.js#resolveHit) so the ring
// visually matches the area it actually covers.
const IMPACT_BASE_SIZE = 44; // diameter for single-target hits (no worldSize)
// Explicit user request: the old fade-through-full-transparency look read as
// too washed out — colors now hold at a solid 90% opacity through most of
// the effect's life (HOLD_PORTION) instead of fading continuously from the
// very first frame, and only fade out in the final stretch so the effect
// still disappears smoothly instead of popping off.
const SOLID_OPACITY = 0.9;
const HOLD_PORTION = 0.6;

// Draws one particle of the given shape family, already translated to its
// world position and rotated so local +x points "outward" (away from the
// hit center) — every case below draws in that local space, centered on the
// origin, sized by `size`. See data/impactShapes.js for the type->shape
// mapping and the rationale (no real spritesheet assets exist yet, so this
// IS the visual fallback — themed shapes instead of one generic dot).
function drawShapeParticle(ctx, shape, size) {
  const r = size / 2;
  switch (shape) {
    case 'flame': {
      // Teardrop flickering outward: rounded base, pointed flame tip.
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.quadraticCurveTo(-r * 0.3, -r * 0.9, r, -r * 0.15);
      ctx.quadraticCurveTo(r * 0.5, 0, r, r * 0.15);
      ctx.quadraticCurveTo(-r * 0.3, r * 0.9, -r, 0);
      ctx.fill();
      break;
    }
    case 'droplet': {
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.quadraticCurveTo(r * 0.2, -r * 0.75, -r, 0);
      ctx.quadraticCurveTo(r * 0.2, r * 0.75, r, 0);
      ctx.fill();
      break;
    }
    case 'leaf': {
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.45, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r, 0);
      ctx.lineTo(r, 0);
      ctx.lineWidth = Math.max(1, r * 0.12);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)';
      ctx.stroke();
      break;
    }
    case 'shard': {
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.lineTo(-r * 0.5, -r * 0.5);
      ctx.lineTo(-r * 0.5, r * 0.5);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'bolt': {
      ctx.lineWidth = Math.max(1.5, r * 0.35);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath();
      ctx.moveTo(-r, -r * 0.6);
      ctx.lineTo(-r * 0.1, -r * 0.1);
      ctx.lineTo(-r * 0.4, r * 0.1);
      ctx.lineTo(r, r * 0.7);
      ctx.stroke();
      break;
    }
    case 'crystal': {
      ctx.beginPath();
      ctx.moveTo(0, -r);
      ctx.lineTo(r * 0.55, 0);
      ctx.lineTo(0, r);
      ctx.lineTo(-r * 0.55, 0);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'star': {
      const spikes = 4;
      ctx.beginPath();
      for (let i = 0; i < spikes * 2; i++) {
        const rad = i % 2 === 0 ? r : r * 0.35;
        const ang = (Math.PI / spikes) * i - Math.PI / 2;
        const px = Math.cos(ang) * rad;
        const py = Math.sin(ang) * rad;
        if (i === 0) ctx.moveTo(px, py);
        else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'bubble': {
      ctx.globalAlpha *= 0.7;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha *= 1.4;
      ctx.beginPath();
      ctx.arc(-r * 0.3, -r * 0.3, r * 0.25, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.fill();
      break;
    }
    case 'chunk': {
      ctx.save();
      ctx.rotate(0.5);
      ctx.fillRect(-r * 0.5, -r * 0.5, r, r);
      ctx.restore();
      break;
    }
    case 'feather': {
      ctx.beginPath();
      ctx.moveTo(r, 0);
      ctx.quadraticCurveTo(0, -r * 0.55, -r, -r * 0.1);
      ctx.quadraticCurveTo(0, 0, r, 0);
      ctx.quadraticCurveTo(0, r * 0.05, -r, r * 0.1);
      ctx.quadraticCurveTo(0, r * 0.55, r, 0);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-r * 0.9, 0);
      ctx.lineTo(r * 0.9, 0);
      ctx.lineWidth = Math.max(1, r * 0.1);
      ctx.strokeStyle = 'rgba(0,0,0,0.3)';
      ctx.stroke();
      break;
    }
    case 'swirl': {
      ctx.lineWidth = Math.max(1.5, r * 0.3);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0.3, Math.PI * 1.5);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(r * 0.85, 0, r * 0.18, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'wisp': {
      ctx.globalAlpha *= 0.6;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.7, 0, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
    case 'claw': {
      ctx.lineWidth = Math.max(1.5, r * 0.28);
      ctx.strokeStyle = ctx.fillStyle;
      ctx.lineCap = 'round';
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(-r * 0.6, -r * 0.6 + i * r * 0.5);
        ctx.lineTo(r * 0.6, r * 0.6 + i * r * 0.5);
        ctx.stroke();
      }
      break;
    }
    case 'dot':
    default: {
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fill();
      break;
    }
  }
}

function drawImpactBurst(ctx, effect) {
  const { targetX: x, targetY: y, color, progress } = effect;
  const growth = Math.min(1, progress / 0.25); // quick pop-in
  const fade = progress < HOLD_PORTION ? 1 : 1 - (progress - HOLD_PORTION) / (1 - HOLD_PORTION);
  const alpha = Math.max(0, Math.min(1, fade)) * SOLID_OPACITY;
  const coreRadius = ((effect.worldSize || IMPACT_BASE_SIZE) / 2) * (0.55 + growth * 0.45);
  const shape = impactShapeForType(effect.elementType);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.globalAlpha = alpha;

  const gradient = ctx.createRadialGradient(x, y, 0, x, y, coreRadius);
  gradient.addColorStop(0, `${color}ff`);
  gradient.addColorStop(0.6, `${color}cc`);
  gradient.addColorStop(1, `${color}00`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(x, y, coreRadius, 0, Math.PI * 2);
  ctx.fill();

  // Outward-streaking particles at fixed angles derived from index (no RNG
  // needed each frame, so the burst looks identical across its whole life) —
  // each one is drawn as the move's typed shape (flame/droplet/leaf/...)
  // instead of a plain dot, oriented to face outward along its travel angle.
  const particleCount = 7;
  const travel = coreRadius * 1.6 * progress;
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2 + i * 0.7;
    const px = x + Math.cos(angle) * travel;
    const py = y + Math.sin(angle) * travel;
    const particleSize = coreRadius * 0.44 * (1 - progress * 0.7);
    if (particleSize <= 0) continue;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    drawShapeParticle(ctx, shape, particleSize);
    ctx.restore();
  }
  ctx.restore();
}

function drawAoeRing(ctx, effect) {
  const { targetX: x, targetY: y, color, progress } = effect;
  const maxRadius = effect.worldSize / 2;
  const eased = 1 - (1 - progress) * (1 - progress); // ease-out
  const radius = maxRadius * eased;
  const fade = progress < HOLD_PORTION ? 1 : 1 - (progress - HOLD_PORTION) / (1 - HOLD_PORTION);
  const alpha = Math.max(0, fade) * SOLID_OPACITY;
  const shape = impactShapeForType(effect.elementType);

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';

  ctx.globalAlpha = alpha * 0.5;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha;
  ctx.lineWidth = Math.max(2, 6 * (1 - progress));
  ctx.strokeStyle = color;
  ctx.shadowColor = color;
  ctx.shadowBlur = 12;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.shadowBlur = 0;

  // Type-shaped particles scattered around the ring's live circumference —
  // "ampliadas e de maior fidelidade" than the single-target burst (explicit
  // user request): more of them, bigger, riding the ring outward so the
  // AOE's element reads clearly even at a glance, on top of the ring already
  // communicating the real splash radius.
  const particleCount = 12;
  const particleSize = Math.max(6, maxRadius * 0.16) * (0.4 + 0.6 * (1 - progress));
  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2 + 0.3;
    const px = x + Math.cos(angle) * radius;
    const py = y + Math.sin(angle) * radius;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillStyle = color;
    drawShapeParticle(ctx, shape, particleSize);
    ctx.restore();
  }

  ctx.restore();
}

function drawAbilityEffect(ctx, effect) {
  if (effect.isAoe) {
    drawAoeRing(ctx, effect);
  } else {
    drawImpactBurst(ctx, effect);
  }
}

const CAPTURE_ANIM_DRAW_SIZE = 40; // on-screen px, roughly a POKE icon's size

// Post-battle Pokeball-throw animation, see data/captureAnim.js for the
// sheet's real measured grid and CombatSystem/main.js for the trigger.
// `effect.delay` holds this invisible until the defeated enemy's Faint pose
// has fully played out (see main.js#handleEnemyDefeated) — the ball must
// never appear mid-faint. Once past the delay, `effect.age - effect.delay`
// over frameDuration picks the frame; captureAnimFrameRect clamps to the
// sequence's last frame instead of running off the end, so a duration
// slightly longer than rowCount*frameDuration just holds the final pose
// briefly before the effect is removed.
function drawCaptureAnim(ctx, effect) {
  if (effect.age < effect.delay) return;
  const img = getOrLoadImage(CAPTURE_ANIM_URL);
  if (!img.complete || img.naturalWidth === 0) return;
  const frameIndex = Math.floor((effect.age - effect.delay) / CAPTURE_ANIM_FRAME_DURATION);
  const frame = captureAnimFrameRect(effect.ballItemId, effect.success, frameIndex);
  if (!frame) return;

  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    img, frame.sx, frame.sy, frame.sw, frame.sh,
    effect.targetX - CAPTURE_ANIM_DRAW_SIZE / 2, effect.targetY - CAPTURE_ANIM_DRAW_SIZE / 2,
    CAPTURE_ANIM_DRAW_SIZE, CAPTURE_ANIM_DRAW_SIZE,
  );
  ctx.restore();
}

export function drawEffect(ctx, effect) {
  if (effect.type === 'damageNumber') {
    drawDamageNumber(ctx, effect);
    return;
  }
  if (effect.type === 'abilityName') {
    drawAbilityName(ctx, effect);
    return;
  }
  if (effect.type === 'rewardText') {
    drawRewardText(ctx, effect);
    return;
  }
  if (effect.type === 'abilityEffect') {
    drawAbilityEffect(ctx, effect);
    return;
  }
  if (effect.type === 'captureAnim') {
    drawCaptureAnim(ctx, effect);
    return;
  }
}

// Floating combat text (damage/ability-name/reward numbers) that names an
// `owner` entity (see Effect.js) tracks it live instead of the frozen
// targetX/targetY snapshot taken at spawn — so it follows the POKE if it's
// still moving — and is staggered vertically by `effect.lane` (claimed via
// Entity#claimEffectLane, `effect.laneSize` slots wide) so several
// simultaneous texts above the same entity queue up in a column instead of
// overlapping. Left-aligned from a shared x (not centered) so a ragged mix
// of short/long lines (e.g. "-12" next to "Super efetivo!") still reads as
// one clean queued column instead of each line independently centering
// itself and drifting sideways relative to the others.
const EFFECT_LANE_HEIGHT = 16;
// Clearance above the name/level tag (see drawNameLevelTag): the name line
// itself sits 26px above the entity, and its own text (9px font + 3px
// stroke) extends a further ~12px above that baseline — so lane 0 needs to
// start comfortably past ~38px or the ability-name text collides with the
// POKE's name (bug: they used to sit only 4px apart at 30px).
const EFFECT_BASE_GAP = 44;
const EFFECT_COLUMN_X_OFFSET = -18; // column's left edge, relative to owner.x

function effectAnchor(effect) {
  if (!effect.owner) return { x: effect.targetX, y: effect.targetY };
  const owner = effect.owner;
  return {
    x: owner.x + EFFECT_COLUMN_X_OFFSET,
    y: owner.y - visualTopOffset(owner) - EFFECT_BASE_GAP - effect.lane * EFFECT_LANE_HEIGHT,
  };
}

// Floating combat text: rises and fades. Color reflects type effectiveness
// (see EFFECTIVENESS_COLORS in CombatSystem.js); `effect.effectiveness` gates
// the label line, shown above the number for anything but a normal hit.
// "Super efetivo!" renders noticeably bigger than the other labels so it
// stands out — it still can't collide with anything else in the column since
// spawnDamageNumber reserves a full 2 lanes for any hit with a label.
function drawDamageNumber(ctx, effect) {
  const floatOffset = 30 * effect.progress;
  const alpha = effect.progress < 0.7 ? 1 : 1 - (effect.progress - 0.7) / 0.3;
  const anchor = effectAnchor(effect);
  const x = anchor.x;
  const y = anchor.y - floatOffset;
  const color = effect.color || '#ffffff';
  // Black text needs a light outline instead of the usual dark one to stay
  // visible against the map's dark backgrounds.
  const outline = color === '#000000' ? '#ffffff' : '#000000';

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.textAlign = 'left';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = outline;
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = color;
  ctx.strokeText(`-${effect.value}`, x, y);
  ctx.fillText(`-${effect.value}`, x, y);

  if (effect.effectiveness) {
    const isSuper = effect.effectiveness === 'super';
    ctx.font = isSuper ? 'bold 13px monospace' : '9px monospace';
    ctx.fillStyle = color;
    const labelY = y - (isSuper ? 14 : 12);
    ctx.strokeText(effect.effectivenessLabel || effect.effectiveness, x, labelY);
    ctx.fillText(effect.effectivenessLabel || effect.effectiveness, x, labelY);
  }

  ctx.restore();
}

// The move's name, popped just below the caster's feet when it's used —
// stays put and just fades, distinct from the damage number (which floats
// up from the target once the hit actually lands).
function drawAbilityName(ctx, effect) {
  const alpha = effect.progress < 0.7 ? 1 : 1 - (effect.progress - 0.7) / 0.3;
  const anchor = effectAnchor(effect);
  const x = anchor.x;
  const y = anchor.y;

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.textAlign = 'left';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000000';
  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = effect.color || '#cdd6ff';
  ctx.strokeText(effect.text, x, y);
  ctx.fillText(effect.text, x, y);
  ctx.restore();
}

// XP/gold earned from a kill — floats up higher/faster than the damage
// number so it always reads above the effectiveness text at the same spot.
function drawRewardText(ctx, effect) {
  const floatOffset = 34 * effect.progress;
  const alpha = effect.progress < 0.7 ? 1 : 1 - (effect.progress - 0.7) / 0.3;
  const anchor = effectAnchor(effect);
  const x = anchor.x;
  const y = anchor.y - floatOffset;
  const label = `+${effect.value}${effect.unit ? ' ' + effect.unit : ''}`;

  ctx.save();
  ctx.globalAlpha = Math.max(0, alpha);
  ctx.textAlign = 'left';
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#000000';
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = effect.color;
  ctx.strokeText(label, x, y);
  ctx.fillText(label, x, y);
  ctx.restore();
}

export function drawNpcMarker(ctx, x, y, label, color = '#eae2b7') {
  ctx.save();
  ctx.fillStyle = color;
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 2;
  ctx.fillRect(x - 16, y - 16, 32, 32);
  ctx.strokeRect(x - 16, y - 16, 32, 32);
  ctx.fillStyle = '#d62828';
  ctx.fillRect(x - 3, y - 10, 6, 20);
  ctx.fillRect(x - 10, y - 3, 20, 6);
  if (label) {
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.strokeStyle = '#000000';
    ctx.strokeText(label, x, y + 32);
    ctx.fillStyle = '#f1f1f6';
    ctx.fillText(label, x, y + 32);
  }
  ctx.restore();
}

// Scale applied to the single background image so a "square" of ground reads
// at roughly the size of a small POKE on screen (user reference: a Gen2-style
// route where one grass tile ~= one small POKE's footprint) instead of the
// raw export's native resolution, tuned visually in-browser next to a small
// species like Charmander/Rattata — adjust this single constant to re-tune.
const HUNT_BG_TILE_SCALE = 1.6;

export function drawMapBackground(ctx, map, viewport) {
  const { primary, secondary, image } = map.bg;
  const img = image ? getOrLoadImage(image) : null;
  const imageReady = img && img.complete && img.naturalWidth > 0;

  ctx.save();
  if (imageReady) {
    // Flat base fill first, in the theme's own color — covers the rare sliver
    // beyond the single background image below (only reachable at extreme
    // zoom-out right at the walkable circle's edge) with plain ground instead
    // of empty black.
    ctx.fillStyle = primary;
    const baseMargin = 300;
    ctx.fillRect(
      viewport.x - baseMargin, viewport.y - baseMargin,
      viewport.w + baseMargin * 2, viewport.h + baseMargin * 2,
    );

    // Real background art (user-provided, see data/maps.generated.js's bg.image)
    // is one large detailed scene, not a small seamless texture — tiling it
    // with a repeating pattern (the old approach) stitched its own top/
    // bottom/left/right edges together wherever the tile wrapped, which read
    // as a hard seam cutting across the map (reachable once the walkable
    // circle's edge touches the map's y=0 boundary). At HUNT_BG_TILE_SCALE
    // the image is comfortably bigger than the whole map, so drawing it once,
    // centered on the map, covers the entire playable circle (and a healthy
    // margin around it) with no seam at all — only extreme zoom-out right at
    // the circle's edge can peek past its border into the flat fill above.
    const iw = img.naturalWidth * HUNT_BG_TILE_SCALE;
    const ih = img.naturalHeight * HUNT_BG_TILE_SCALE;
    const mapCx = map.bounds.width / 2;
    const mapCy = map.bounds.height / 2;
    ctx.drawImage(img, mapCx - iw / 2, mapCy - ih / 2, iw, ih);
  } else {
    // Procedural checkerboard fallback for themes with no matching art yet —
    // covers the visible viewport (not map.bounds) for the same reason the
    // imageReady branch above does: no unpainted edges past the map's own
    // extent while it reads as an unbounded map.
    const tile = 48;
    const margin = 300;
    ctx.fillStyle = primary;
    ctx.fillRect(viewport.x - margin, viewport.y - margin, viewport.w + margin * 2, viewport.h + margin * 2);
    ctx.fillStyle = secondary;
    const startCol = Math.floor(viewport.x / tile);
    const endCol = Math.ceil((viewport.x + viewport.w) / tile);
    const startRow = Math.floor(viewport.y / tile);
    const endRow = Math.ceil((viewport.y + viewport.h) / tile);
    for (let row = startRow; row <= endRow; row++) {
      for (let col = startCol; col <= endCol; col++) {
        if ((row + col) % 2 === 0) {
          ctx.fillRect(col * tile, row * tile, tile, tile);
        }
      }
    }
  }
  // No border walls drawn anymore — the walkable area is a soft circular
  // limit enforced purely by movement clamping (see MovementSystem.js),
  // with nothing visual marking where it ends, so the map reads as endless.
  ctx.restore();
}
