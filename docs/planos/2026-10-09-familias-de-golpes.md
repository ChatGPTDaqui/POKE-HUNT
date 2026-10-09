# Famílias de golpes — catálogo para VFX por golpe

Pedido do dono (09/10/2026): categorizar todas as famílias de golpes e, em
cascata, criar um efeito próprio para cada golpe — um golpe por meta, até
produção. Este arquivo é o mapa; cada golpe vira uma tarefa/PR própria.

## Números

- 340 golpes de dano no catálogo (ABILITIES_DATA + GOLPES_TM) + 18 golpes de
  área do nível 50 (`aoe50_<tipo>`) = 358.
- Já com efeito próprio: 11 socos (7.80) + 8 feixes (7.81/7.82) = 19.
  Bullet Punch fica de fora por pedido do dono (sprite original).
- Faltam 321 de catálogo + 18 do nível 50.

## Critério

Família = FORMA FÍSICA do golpe (o que o corpo/energia faz), não o tipo.
O tipo continua pintando e dando a textura (fogo = calor, água = gota...).
Cada golpe pertence a uma família só. Dentro da família cada golpe tem
perfil próprio (forma, ritmo, partícula-assinatura, impacto) — mesma regra
do Soco e do Feixe: família compartilha a coreografia, o golpe tem personalidade.

"Aprendizados" = quantas espécies aprendem o golpe por nível (peso de uso).

## Decisões de arquitetura

1. Família = uma coreografia parametrizada (`PERFIS_DE_<FAMILIA>`), golpe =
   perfil. Mesmo padrão de `beams.ts`. Um arquivo por golpe deixaria o bundle
   do jogo pesado (VFX já tem ~12 mil linhas).
2. `resolverVfx` hoje ignora `REGISTRO_POR_GOLPE` em golpe de área. As
   famílias com golpes de área (Som, Vento, Onda, Tremor, Explosão, nível 50)
   exigem liberar o registro por golpe para área antes.
3. Golpe sem efeito próprio continua no efeito por tipo/tier (sem regressão).
4. Medir custo de todo golpe novo contra uma referência conhecida no mesmo
   lote (Petal Blizzard ~1,1 ms; Eruption ~2,6 ms).

## Resumo (ordenado por aprendizados)

| Família | Golpes | Feitos | Aprendizados |
|---|---|---|---|
| Investida (corpo) | 18 | 0 | 283 |
| Jato e sopro | 17 | 0 | 259 |
| Luta corporal (tapa, arremesso, revide) | 26 | 0 | 213 |
| Feixe | 14 | 8 | 148 |
| Mordida | 10 | 0 | 147 |
| Rajada de projéteis | 19 | 0 | 135 |
| Força mental | 11 | 0 | 133 |
| Lâmina (corte único) | 13 | 0 | 133 |
| Some e volta (dois tempos) | 12 | 0 | 127 |
| Pedra e cristal | 10 | 0 | 117 |
| Nuvem, pó e assombração | 12 | 0 | 105 |
| Chifre, ferrão e bico | 13 | 0 | 98 |
| Esfera / bomba | 16 | 0 | 96 |
| Cauda, asa e chicote | 10 | 0 | 86 |
| Explosão | 9 | 0 | 81 |
| Garra | 7 | 0 | 80 |
| Truque sombrio (roubo, castigo) | 8 | 0 | 80 |
| Vento e tempestade | 9 | 0 | 79 |
| Soco | 15 | 12 | 78 |
| Tremor de chão | 6 | 0 | 75 |
| Som | 11 | 0 | 75 |
| Cabeçada | 6 | 0 | 69 |
| Dreno | 4 | 0 | 68 |
| Rolamento / giro | 6 | 0 | 67 |
| Raio elétrico | 6 | 0 | 56 |
| Aperto e pinça | 8 | 0 | 53 |
| Chute e pisão | 11 | 0 | 51 |
| Investida envolta em elemento | 7 | 0 | 44 |
| Lâmina de vento / folhas | 5 | 0 | 42 |
| Fúria (golpes em sequência descontrolada) | 3 | 0 | 37 |
| Onda e maré | 9 | 0 | 35 |
| Vórtice que prende | 4 | 0 | 29 |
| Luz e brilho | 5 | 0 | 26 |

## Famílias e golpes

✅ = já tem efeito próprio. Formato: Nome (tipo poder[, área], aprendizados).

### Soco — `soco` (15)

✅ Sucker Punch (Dark 70, 25) · Hammer Arm (Fighting 100, 10) · ✅ Dynamic Punch (Fighting 100, 5) · Sky Uppercut (Fighting 85, 5) · ✅ Comet Punch (Normal 18, 4) · ✅ Mach Punch (Fighting 40, 4) · ✅ Thunder Punch (Electric 75, 4) · ✅ Fire Punch (Fire 75, 3) · ✅ Mega Punch (Normal 80, 3) · ✅ Shadow Punch (Ghost 60, 3) · ✅ Bullet Punch (Steel 40, 3) · Meteor Mash (Steel 90, 3) · ✅ Dizzy Punch (Normal 70, 2) · ✅ Focus Punch (Fighting 150, 2) · ✅ Ice Punch (Ice 75, 2)

### Feixe — `feixe` (14)

✅ Bubble Beam (Water 65, 26) · ✅ Hyper Beam (Normal 150, 23) · ✅ Psybeam (Psychic 65, 21) · ✅ Signal Beam (Bug 75, 13) · ✅ Solar Beam (Grass 120, 13) · ✅ Aurora Beam (Ice 65, 11) · Zap Cannon (Electric 120, 10) · ✅ Ice Beam (Ice 90, 9) · Dragon Pulse (Dragon 85, 9) · ✅ Charge Beam (Electric 50, 5) · Flash Cannon (Steel 80, 3) · Mirror Shot (Steel 65, 3) · Aeroblast (Flying 100, 1) · Psystrike (Psychic 100, 1)

### Chute e pisão — `chute` (11)

Stomp (Normal 65, 19) · Double Kick (Fighting 30, 7) · Low Kick (Fighting —, 5) · Jump Kick (Fighting 100, 4) · Stomping Tantrum (Ground 75, 4) · High Jump Kick (Fighting 130, 3) · Low Sweep (Fighting 65, 3) · Rolling Kick (Fighting 60, 2) · Blaze Kick (Fire 85, 2) · Triple Kick (Fighting 10, 1) · Mega Kick (Normal 120, 1)

### Mordida — `mordida` (10)

Bite (Dark 60, 49) · Crunch (Dark 80, 40) · Ice Fang (Ice 65, 14) · Fire Fang (Fire 65, 11) · Poison Fang (Poison 50, 10) · Thunder Fang (Electric 65, 7) · Bug Bite (Bug 60, 7) · Leech Life (Bug 80, 5) · Hyper Fang (Normal 80, 2) · Super Fang (Normal —, 2)

### Garra — `garra` (7)

Fury Swipes (Normal 18, 26) · Scratch (Normal 40, 22) · Metal Claw (Steel 50, 13) · False Swipe (Normal 40, 9) · Crush Claw (Normal 75, 4) · Dragon Claw (Dragon 80, 4) · Shadow Claw (Ghost 70, 2)

### Lâmina (corte único) — `lamina` (13)

Slash (Normal 70, 35) · Air Slash (Flying 75, 25) · Night Slash (Dark 70, 13) · Fury Cutter (Bug 40, 13) · X-Scissor (Bug 80, 12) · Aerial Ace (Flying 60, 7) · Cross Chop (Fighting 100, 5) · Karate Chop (Fighting 50, 5) · Leaf Blade (Grass 90, 4) · Dual Chop (Dragon 40, 4) · Psycho Cut (Psychic 70, 4) · Razor Shell (Water 75, 3) · Cross Poison (Poison 70, 3)

### Lâmina de vento / folhas — `vento_cortante` (5)

Razor Leaf (Grass 55, área, 14) · Magical Leaf (Grass 60, 11) · Air Cutter (Flying 60, área, 8) · Sonic Boom (Normal —, 5) · Razor Wind (Normal 80, área, 4)

### Investida (corpo) — `investida` (18)

Tackle (Normal 40, 59) · Take Down (Normal 90, 48) · Double-Edge (Normal 120, 47) · Quick Attack (Normal 40, 46) · Body Slam (Normal 85, 22) · Chip Away (Normal 70, 17) · Last Resort (Normal 140, 12) · Heavy Slam (Steel —, 10) · Giga Impact (Normal 150, 5) · U-turn (Bug 70, 5) · Acrobatics (Flying 55, 5) · Retaliate (Normal 70, 3) · Extreme Speed (Normal 80, 2) · High Horsepower (Ground 95, 1) · Strength (Normal 80, 1) · Facade (Normal 70, 0) · Return (Normal —, 0) · Frustration (Normal —, 0)

### Investida envolta em elemento — `investida_elemental` (7)

Spark (Electric 65, 13) · Flare Blitz (Fire 120, 8) · Flame Charge (Fire 50, 7) · Aqua Jet (Water 40, 7) · Dragon Rush (Dragon 100, 6) · Wild Charge (Electric 90, 3) · Volt Switch (Electric 70, 0)

### Fúria (golpes em sequência descontrolada) — `furia` (3)

Thrash (Normal 120, 20) · Outrage (Dragon 120, 9) · Petal Dance (Grass 120, 8)

### Cabeçada — `cabecada` (6)

Zen Headbutt (Psychic 80, 31) · Headbutt (Normal 70, 24) · Iron Head (Steel 80, 7) · Skull Bash (Normal 130, 4) · Head Smash (Rock 150, 2) · Wood Hammer (Grass 120, 1)

### Rolamento / giro — `rolamento` (6)

Rollout (Rock 30, 26) · Gyro Ball (Steel —, 16) · Rapid Spin (Normal 20, 14) · Flame Wheel (Fire 60, 7) · Ice Ball (Ice 30, 3) · Steamroller (Bug 65, 1)

### Some e volta (dois tempos) — `some_e_volta` (12)

Pursuit (Dark 40, 29) · Feint Attack (Dark 60, 28) · Feint (Normal 30, 18) · Bounce (Flying 85, 12) · Dig (Ground 80, 9) · Shadow Sneak (Ghost 40, 9) · Dive (Water 80, 7) · Brave Bird (Flying 120, 5) · Sky Attack (Flying 140, 4) · Phantom Force (Ghost 90, 3) · Fly (Flying 90, 2) · Sky Drop (Flying 60, 1)

### Cauda, asa e chicote — `cauda_chicote` (10)

Slam (Normal 80, 23) · Aqua Tail (Water 90, 23) · Wing Attack (Flying 60, 18) · Vine Whip (Grass 45, 6) · Iron Tail (Steel 100, 5) · Dragon Tail (Dragon 60, 5) · Power Whip (Grass 120, 2) · Needle Arm (Grass 60, 2) · Poison Tail (Poison 50, 1) · Steel Wing (Steel 70, 1)

### Aperto e pinça — `aperto` (8)

Wring Out (Normal —, 15) · Wrap (Normal 15, 9) · Constrict (Normal 10, 7) · Vice Grip (Normal 55, 6) · Guillotine (Normal —, 6) · Bind (Normal 15, 4) · Crabhammer (Water 100, 4) · Clamp (Water 35, 2)

### Chifre, ferrão e bico — `perfurar` (13)

Fury Attack (Normal 15, 19) · Peck (Flying 35, 16) · Poison Sting (Poison 15, 16) · Poison Jab (Poison 80, 12) · Horn Attack (Normal 65, 7) · Megahorn (Bug 120, 6) · Horn Drill (Normal —, 6) · Drill Peck (Flying 80, 6) · Drill Run (Ground 80, 4) · Pluck (Flying 60, 3) · Fell Stinger (Bug 50, 2) · Twineedle (Bug 25, 1) · Smart Strike (Steel 70, 0)

### Luta corporal (tapa, arremesso, revide) — `luta_corpo` (26)

Flail (Normal —, 23) · Rage (Normal 20, 20) · Endeavor (Normal —, 16) · Wake-Up Slap (Fighting 70, 14) · Counter (Fighting —, 12) · Reversal (Fighting —, 11) · Superpower (Fighting 120, 11) · Fake Out (Normal 40, 11) · Double Hit (Normal 35, 11) · Pound (Normal 40, 10) · Double Slap (Normal 15, 10) · Bide (Normal —, 10) · Close Combat (Fighting 120, 9) · Seismic Toss (Fighting —, 8) · Revenge (Fighting 60, 6) · Vital Throw (Fighting 70, 6) · Force Palm (Fighting 60, 5) · Submission (Fighting 80, 5) · Arm Thrust (Fighting 15, 3) · Brick Break (Fighting 75, 3) · Metal Burst (Steel —, 3) · Smelling Salts (Normal 70, 2) · Final Gambit (Fighting —, 2) · Circle Throw (Fighting 60, 1) · Storm Throw (Fighting 60, 1) · Brutal Swing (Dark 60, área, 0)

### Truque sombrio (roubo, castigo) — `truque_sombrio` (8)

Payback (Dark 50, 19) · Assurance (Dark 60, 19) · Knock Off (Dark 65, 18) · Covet (Normal 60, 9) · Punishment (Dark —, 7) · Foul Play (Dark 95, 4) · Beat Up (Dark —, 3) · Thief (Dark 60, 1)

### Esfera / bomba — `esfera` (16)

Water Pulse (Water 60, 27) · Mud Bomb (Ground 65, 16) · Electro Ball (Electric —, 14) · Shadow Ball (Ghost 80, 10) · Energy Ball (Grass 90, 6) · Sludge Bomb (Poison 90, 6) · Seed Bomb (Grass 80, 4) · Weather Ball (Normal 50, 3) · Aura Sphere (Fighting 80, 2) · Magnet Bomb (Steel 60, 2) · Vacuum Wave (Fighting 40, 2) · Mist Ball (Psychic 70, 1) · Luster Purge (Psychic 95, 1) · Egg Bomb (Normal 100, 1) · Octazooka (Water 65, 1) · Focus Blast (Fighting 120, 0)

### Rajada de projéteis — `rajada` (19)

Swift (Normal 60, área, 26) · Natural Gift (Normal —, 19) · Mud Shot (Ground 55, 12) · Spit Up (Normal —, 12) · Rock Blast (Rock 25, 11) · Fling (Dark —, 10) · Pin Missile (Bug 25, 9) · Ice Shard (Ice 40, 9) · Bullet Seed (Grass 25, 8) · Spike Cannon (Normal 20, 3) · Trump Card (Normal —, 3) · Hidden Power (Normal 60, 3) · Bone Rush (Ground 25, 2) · Bonemerang (Ground 50, 2) · Bone Club (Ground 65, 2) · Icicle Spear (Ice 25, 1) · Barrage (Normal 15, 1) · Present (Normal —, 1) · Pay Day (Normal 40, 1)

### Pedra e cristal — `pedra` (10)

Ancient Power (Rock 60, 34) · Rock Slide (Rock 75, área, 21) · Stone Edge (Rock 100, 15) · Rock Throw (Rock 50, 13) · Power Gem (Rock 80, 12) · Rock Tomb (Rock 60, 9) · Smack Down (Rock 50, 9) · Avalanche (Ice 60, 2) · Icicle Crash (Ice 85, 1) · Precipice Blades (Ground 120, área, 1)

### Jato e sopro — `jato` (17)

Hydro Pump (Water 110, 46) · Water Gun (Water 40, 44) · Ember (Fire 40, 27) · Brine (Water 65, 27) · Flamethrower (Fire 90, 21) · Mud-Slap (Ground 20, 20) · Bubble (Water 40, área, 17) · Acid (Poison 40, área, 10) · Dragon Breath (Dragon 60, 9) · Belch (Poison 120, 9) · Dragon Rage (Dragon —, 7) · Sludge (Poison 65, 6) · Gunk Shot (Poison 120, 6) · Acid Spray (Poison 40, 6) · Frost Breath (Ice 60, 2) · Incinerate (Fire 60, área, 2) · Scald (Water 80, 0)

### Nuvem, pó e assombração — `nuvem_e_po` (12)

Astonish (Ghost 30, 26) · Night Shade (Ghost —, 13) · Lick (Ghost 30, 10) · Hex (Ghost 65, 10) · Smog (Poison 30, 8) · Powder Snow (Ice 40, área, 8) · Clear Smog (Poison 50, 6) · Venoshock (Poison 65, 6) · Silver Wind (Bug 60, 6) · Fairy Wind (Fairy 40, 5) · Draining Kiss (Fairy 50, 5) · Ominous Wind (Ghost 60, 2)

### Vento e tempestade — `vento` (9)

Gust (Flying 40, 13) · Twister (Dragon 40, área, 12) · Blizzard (Ice 110, área, 12) · Hurricane (Flying 110, 11) · Leaf Storm (Grass 130, 9) · Icy Wind (Ice 55, área, 8) · Petal Blizzard (Grass 90, área, 7) · Heat Wave (Fire 95, área, 4) · Leaf Tornado (Grass 65, 3)

### Vórtice que prende — `vortice` (4)

Fire Spin (Fire 35, 13) · Sand Tomb (Ground 35, 7) · Whirlpool (Water 35, 5) · Infestation (Bug 20, 4)

### Dreno — `dreno` (4)

Absorb (Grass 20, 23) · Mega Drain (Grass 40, 20) · Giga Drain (Grass 75, 17) · Dream Eater (Psychic 100, 8)

### Som — `som` (11)

Uproar (Normal 90, 15) · Bug Buzz (Bug 90, 11) · Snore (Normal 50, 10) · Disarming Voice (Fairy 40, área, 9) · Synchronoise (Psychic 120, área, 9) · Hyper Voice (Normal 90, área, 8) · Echoed Voice (Normal 40, 5) · Round (Normal 60, 3) · Boomburst (Normal 140, área, 2) · Struggle Bug (Bug 50, área, 2) · Snarl (Dark 55, área, 1)

### Força mental — `mente` (11)

Psychic (Psychic 90, 33) · Confusion (Psychic 50, 32) · Future Sight (Psychic 120, 21) · Extrasensory (Psychic 80, 12) · Psywave (Psychic —, 10) · Stored Power (Psychic 20, 8) · Psyshock (Psychic 80, 6) · Mirror Coat (Psychic —, 6) · Heart Stamp (Psychic 60, 3) · Psycho Boost (Psychic 140, 1) · Doom Desire (Steel 140, 1)

### Raio elétrico — `raio` (6)

Discharge (Electric 80, área, 22) · Thunder (Electric 110, 13) · Thunder Shock (Electric 40, 12) · Thunderbolt (Electric 90, 4) · Nuzzle (Electric 20, 3) · Shock Wave (Electric 60, 2)

### Luz e brilho — `luz` (5)

Play Rough (Fairy 90, 12) · Moonblast (Fairy 95, 8) · Tri Attack (Normal 80, 4) · Sacred Fire (Fire 100, 2) · Dazzling Gleam (Fairy 80, área, 0)

### Explosão — `explosao` (9)

Explosion (Normal 250, área, 17) · Lava Plume (Fire 80, área, 13) · Self-Destruct (Normal 200, área, 11) · Inferno (Fire 100, 11) · Flame Burst (Fire 70, 11) · Fire Blast (Fire 110, 8) · Eruption (Fire 150, área, 6) · Burn Up (Fire 130, 4) · Overheat (Fire 130, 0)

### Tremor de chão — `terremoto` (6)

Earthquake (Ground 100, área, 27) · Earth Power (Ground 90, 16) · Bulldoze (Ground 60, área, 13) · Magnitude (Ground —, área, 12) · Fissure (Ground —, 7) · Grass Knot (Grass —, 0)

### Onda e maré — `onda` (9)

Sheer Cold (Ice —, 9) · Muddy Water (Water 90, área, 8) · Dark Pulse (Dark 80, 6) · Sludge Wave (Poison 95, área, 4) · Water Spout (Water 150, área, 3) · Waterfall (Water 80, 2) · Freeze-Dry (Ice 70, 2) · Origin Pulse (Water 110, área, 1) · Surf (Water 90, área, 0)


### Área do nível 50 — `aoe50_<tipo>` (18)

Um por tipo, poder 70, aprendido por todo POKE no nível 50 (o golpe de área
mais visto do jogo). Hoje usam o efeito de área por tipo (tier 2).

## Cascata — uma meta por golpe

Aprovação do dono: POR FAMÍLIA, no lab do staging (`/lab-vfx`, seletor
"Família: <nome>"). Família aprovada → inscrever em `REGISTRO_POR_GOLPE` →
promover. Até lá o jogo segue no efeito do tipo (teste garante).

### 1. Mordida — `coreografias/mordidas.ts` (no lab, aguardando o dono)

Boca que aparece no alvo e fecha nele; fechada, os dentes cravam e as gengivas
ficam por fora do corpo. Estrela de contato atrás da boca. Saída rápida
abrindo pra fora. Custo na cena: p95 1,4–2,1 ms (Petal Blizzard no mesmo lote: 7,9).

| Golpe | Meta (personalidade) | Estado |
|---|---|---|
| Bite | mandíbula sombria, fecha uma vez, dois furos de presa ficam no alvo | lab |
| Crunch | mandíbula maior, mastiga DUAS vezes, rachaduras claras + furos | lab |
| Hyper Fang | dentões de roedor em bisel, fechamento rápido, estalo branco | lab |
| Super Fang | dentões maiores, talho horizontal que corta o alvo ao meio (½ HP) | lab |
| Thunder Fang | gengiva elétrica, faíscas nas presas antes; dois raios pelos cantos | lab |
| Ice Fang | dentes de gelo; cristais crescem da linha da mordida pros lados | lab |
| Fire Fang | gengiva em brasa; línguas de fogo pelos cantos da boca | lab |
| Poison Fang | só a boca de cima (cobra), duas presas longas; veneno pinga e cai | lab |
| Bug Bite | pinças em "( )" que beliscam duas vezes; migalhas voam | lab |
| Leech Life | pinças menores; bolinhas de vida voltam ao atacante | lab |
