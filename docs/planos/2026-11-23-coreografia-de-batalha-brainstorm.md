# Coreografia de batalha: auditoria e brainstorm (23/11/2026)

Brainstorm. **Estado em 23/11/2026:** implementados A1–A6, P1, P2, P3 (sem congelar o atacante nem o VFX), P4 (só no desenho: o HP ainda cai inteiro no 1º impacto) e P7(a). Ficaram para depois: P5 (RushFrame/ReturnFrame), P6 (respiro "vivo") e P7(b).

Objetivo do dono: um combate agradável e fácil de assistir, com todas as sprites em harmonia dentro do turno de 3 s (`TURNO_SEGUNDOS`). Regras pedidas:

1. O POKE não anda durante a execução de um golpe.
2. O alvo reage ao hit no mesmo instante em que o dano aparece.
3. Uma animação não corta a outra: quem está atacando termina a pose e só depois toca a de levar dano.

## Como funciona hoje (medido no código em 23/11)

Linha do tempo de um golpe (`engine/tempoDoGolpe.ts`):

```
t0 disparo ─ pose de ataque no quadro 0 (poseDoGolpe: Kick/Punch/Bite… ou Shoot/Charge/Attack)
  ├ ápice (HitFrame do AnimData PMD) ─ VFX nasce
  ├ ápice + 1º impacto da coreografia ─ dano, número, flash 0,15 s, Hurt*, derrota
  └ ápice + último impacto + 0,15 s ─ travaDoGolpe solta, o POKE pode andar
```

`*Hurt` só existe no duelo (`mapDef.encarada`) e só quando um acerto tira ≥ 20% do HP máximo (`registrarDanoParaHurt`). Prioridade das poses em `desiredAnimName`: Faint › animOverride › Sleep › ataque › Hurt › Idle por status › Walk/Idle.

O que já está certo e deve ficar:
- O dano cai no **primeiro impacto** do VFX, não no fim da pose (regra 2 vale para golpes de um acerto).
- O número de dano nasce junto do hit (`spawnDamageNumber`, sem atraso desde 11/10).
- A pose dura o tempo real da arte, e o VFX nasce no HitFrame.
- `travaDoGolpe` segura o deslocamento até o último impacto, e o servidor re-simula essa trava igual ao cliente.
- O mais rápido resolve primeiro (`ordenarPorVelocidade` + `esperaOMaisRapido`).

## Achados (por impacto)

### A1. A pose Hurt é descartada quando chega durante a pose de ataque (fere a regra 3)
`hurtAnimTimer` e `attackAnimTimer` correm **em paralelo**. Se o hit chega no meio do ataque, o Hurt fica escondido atrás da pose de ataque e o timer dele (0,45 s) se gasta ali. Quando o ataque acaba, sobra pouco ou nada: o flinch some, ou aparece um pedaço dele. No combate livre isso é comum: os dois lados disparam a cada 3 s sem olhar um para o outro. O comentário de `rodadaDeDuelo.ts`, que diz que as duas poses "nunca disputam", depende de `HIT_LAND_DELAY`, que já não existe; hoje o pouso varia por golpe.

### A2. Andar no lugar depois da pose (fere a regra 1, visualmente)
Entre o fim da pose (`attackAnimTimer`) e o fim de `travaDoGolpe`, o corpo fica parado, mas o `state` continua saindo da distância real. Se o alvo morreu e o próximo está longe, o estado vira `chase`, e `desiredAnimName` devolve `Walk`, porque só checa `imobilizadoPorStatus`, não a trava. Resultado: o POKE fica "andando no lugar" por até ~1 s com o golpe ainda no ar. A correção é de uma linha (trava → `Idle`), mas o certo é encaixá-la na fila de poses (proposta P1).

### A3. No combate livre não existe reação a dano
Fora do duelo, a única reação é `flashTimer` (0,15 s de brilho). Num modo assistido por horas, esse é o maior vazio de leitura: não fica claro quem apanhou, nem quanto.

### A4. Golpe de vários acertos: todo o dano cai no 1º impacto (fere a regra 2)
`resolveHit` aplica os N acertos no mesmo tick. O VFX desenha N impactos (`acertosVisuais`) espalhados no tempo, mas os N números e o flash saem todos no primeiro. `IMPACTOS_DOS_GOLPES` só guarda `[primeiro, último]`, sem a lista completa dos impactos.

### A5. O sono corta a pose de ataque
`Sleep` está acima do ataque na prioridade, de propósito (PH comentado em `desiredAnimName`). A informação é útil, mas o corte é exatamente o que a regra 3 proíbe. Proposta: o sono espera o fim da pose (no máximo ~0,6 s).

### A6. Hurt sobre Hurt não reinicia a arte
`updateAnimations` só zera `animFrame` quando a URL muda. Um segundo hit durante o Hurt (outro atacante, ou multi-hit no futuro) renova o timer, mas a arte segue do quadro em que estava. Além disso, 0,45 s é mais do que a arte PMD de Hurt (~0,33 s), que então dá uma volta e meia.

### A7. Dados do PMD que ainda não usamos
O `AnimData.xml` marca três instantes por pose de golpe: `RushFrame` (fim do preparo, começa o avanço), `HitFrame` (já usamos como ápice) e `ReturnFrame` (fim do golpe, começa o recuo). Extraímos só o `HitFrame` (`scripts/extrair-apice-dos-ataques.mjs`). Os outros dois dão de graça "preparo" e "recuperação" por espécie.

## O que a pesquisa trouxe

- **Antecipação → impacto → recuperação.** É o trio clássico de leitura de golpe. O PMD já marca os três instantes (A7).
- **Hitstop.** É uma pausa curta no instante do impacto. O olho não registra um impacto de 1 quadro (16 ms), e a pausa dá tempo de ver. Os valores de referência são de luta (Street Fighter: 8/12/15 quadros em fraco/médio/forte); para um idle assistido, 60–120 ms bastam. Ponto importante: congelar **atacante e alvo juntos**, não só o alvo. Sakurai lista 8 técnicas, e as que servem aqui são: tremer o alvo na horizontal, a tremida decair e o tamanho da tremida acompanhar a força do golpe. Ele também separa hitstop (efeito visual) de hitstun (estado de jogo), e para nós o hitstop deve ser **só desenho**.
- **Estudo acadêmico de "impact feel"** (arXiv 2208.06155): hitstop, som coerente e câmera são os três fatores mais fortes, e faltar um deles estraga a sensação. Para nós, isso pede leve tremor de câmera só em crítico ou KO.
- **Separar lógica e apresentação.** No Hearthstone a regra resolve na hora e só a animação entra numa fila; o estado mostrado pode atrasar um pouco. Devlogs de auto battler citam como principal queixa "aconteceu tudo ao mesmo tempo" e, como remédio, dar a cada ação o próprio tempo.
- **Interromper ou enfileirar** (Unity/Unreal/Godot, Animancer): o padrão de luta é o hit interromper o ataque. Para um jogo assistido, a fila é o melhor encaixe, e é o que o dono pediu. Armadilha citada em vários fóruns: ao interromper ou trocar, limpar o estado da pose anterior para não voltar a arte velha.

## Propostas

### P1. Fila de poses por entidade (resolve A1, A2, A5, A6)
Trocar a prioridade fixa por **canais**:

| Canal | Poses | Regra |
|---|---|---|
| Fatal | Faint | Corta tudo (é a única exceção). |
| Ação | pose de golpe, animOverride | Exclusiva: ninguém interrompe; dura até o fim. |
| Reação | Hurt, Sleep (entrada) | Se a Ação estiver ocupada, **enfileira** e toca logo depois. Reações repetidas se fundem: reinicia do quadro 0, sem empilhar. |
| Postura | Idle, Walk, Sleep (contínuo) | Base. Com `travaDoGolpe` ativa, é sempre Idle. |

Puro e determinístico como hoje (`tickAttackAnimTimers` roda no servidor). A fila não muda o dano nem a ordem; só o que a sprite mostra. O "o alvo reage no instante do dano" continua valendo para quem está livre. Para quem está no meio de um ataque, o flash e o número saem na hora, e o Hurt entra logo depois.

### P2. Hurt também no combate livre, com intensidade por dano (resolve A3)
- Sem limite de 20% fora do duelo, mas com três graus: **leve** (< 10% do HP), só flash e um tremor de 2 px; **médio**, Hurt com recuo de 4 px; **forte** (≥ 25%, crítico ou super efetivo), Hurt, recuo de 8 px e hitstop.
- O recuo (knockback) é só desenho: deslocar a sprite no eixo do golpe (`anguloDeAtaque` já existe) e voltar em ~150 ms, sem mexer em `x/y` do motor.
- A duração do Hurt passa a ser a da arte (soma de `durations`), não os 0,45 s fixos.

### P3. Hitstop visual (camada de render)
No quadro do impacto, congelar por 60–120 ms: o quadro da sprite do atacante (no HitFrame), o quadro do alvo e o relógio da coreografia do VFX. A simulação não para; o desenho "segura" e recupera o tempo depois (como em `atrasoDoNumeroDeDano`, que já fazia isso). Escala: normal 60 ms, super efetivo 90 ms, crítico 120 ms, KO 150 ms com leve tremor de câmera. Precisa de opção "reduzir movimento" na Configuração.

### P4. Multi-hit com um número por impacto (resolve A4)
- Gerar a **lista completa** de impactos por golpe em `IMPACTOS_DOS_GOLPES` (o teste gerador já percorre a coreografia).
- Em `resolveHit`, enfileirar cada acerto no seu impacto (ou aplicar tudo no 1º e só **mostrar** os números escalonados; mais barato, mas o HP da barra adianta). Decisão de produto: o mais honesto é o primeiro, mas ele mexe no motor e na autoridade.

### P5. Usar RushFrame e ReturnFrame (A7)
- Estender o extrator para os três marcadores.
- `RushFrame`: momento de mostrar o nome do golpe ("telegrafar"), hoje mostrado no disparo.
- `ReturnFrame`: o fim real do golpe. Pode substituir a folga fixa de 0,15 s (`FOLGA_DEPOIS_DO_IMPACTO`) pelo recuo autoral da espécie.

### P6. Orçamento do turno de 3 s
Proposta de partitura para o golpe típico, para revisar caso a caso:

```
0,00  preparo (até RushFrame) + nome do golpe
~0,30 avanço → HitFrame: VFX nasce
~0,45 impacto: hitstop, flash, número, recuo do alvo
~0,60 alvo: Hurt (ou na fila, se estiver atacando)
~1,00 atacante: ReturnFrame → Idle; trava solta no último impacto
1,0–3,0 respiro: Idle "vivo", barras assentam, o próximo golpe telegrafa
```

Hoje o respiro existe, mas é vazio. Dá para usar o Idle das artes PMD (já carregado) e, no duelo, uma **pequena reorientação** de frente.

### P7. Não deixar dois impactos caírem juntos no mesmo alvo (opcional, mexe no motor)
No combate livre com vários selvagens, até 3–4 hits podem pousar no jogador dentro de 100 ms. Ideias: (a) escalonar só a apresentação: o 2º hit da mesma janela espera +120 ms para o flash e o número; (b) no motor, uma janela mínima entre impactos no mesmo alvo. (a) é seguro; (b) muda DPS e precisa passar pela autoridade.

## Riscos e decisões antes de código

1. **Servidor re-simula o movimento.** P1 só pode tocar no que é desenho, ou entrar no mesmo tick puro (`tickAttackAnimTimers`). Hitstop e recuo ficam só no render.
2. **P4 completo muda quando o HP cai**, o que afeta Endure, recuo e derrota. Exige teste de paridade cliente×servidor (`andaSoDepoisDoGolpe.test.ts` é o modelo).
3. **Acessibilidade:** tremor e hitstop precisam de uma chave "reduzir movimento".
4. **Desempenho:** hitstop congela o relógio do VFX, então o cache de quadros (`versao` em `desenharVfx`) não pode quebrar com isso.
5. **Ordem sugerida:** A2 (uma linha) → P1 → P2 → P3 → P5 → P4 → P7.

## Fontes

- Formato PMD (RushFrame/HitFrame/ReturnFrame): https://wiki.pmdo.pmdcollab.org/PMD_Sprite_Format
- Hitstop, guia prático: https://bugnet.io/blog/how-to-use-hit-pause-to-make-impacts-feel-powerful
- Hitstop em atacante e alvo, Godot: https://uhiyama-lab.com/en/notes/godot/hit-feedback-hitstop/
- Checklist de game feel, Godot: https://forum.godotengine.org/t/game-feel-checklist-for-godot-4-hit-stop-trauma-shake-coyote-time-and-more/145340
- Estudo "impact feel": https://arxiv.org/abs/2208.06155
- Sakurai, 8 técnicas de hitstop: https://www.gonintendo.com/contents/13581-sakurai-s-latest-game-dev-video-features-8-hit-stop-techniques
- Sakurai, hitstop × hitstun (Famitsu, tradução de fã): https://sourcegaming.info/2015/11/11/thoughts-on-hitstop-sakurais-famitsu-column-vol-490-1/
- Auto battler rápido demais: https://upsquared.itch.io/auto-food-fight/devlog/410588/auto-food-fight-devlog-7-basic-combat-done
- Pausa depois do ataque, idle: https://shinoinori0.itch.io/idle-and-unmotivated/devlog/1086493/alpha-build-070-combo-system-dynamic-stat-display-and-stop-on-attack
- Interrupção × fila (Animancer): https://kybernetik.com.au/animancer/docs/samples/fsm/interruptions
- Limpar o estado ao interromper, Godot: https://forum.godotengine.org/t/how-to-solve-the-problem-that-the-attack-box-is-not-destroyed-when-the-characters-attack-animation-is-interrupted-by-being-hit/128490
- Fila de ações do Showdown (simulação, não animação): https://huggingface.co/spaces/PShowdown/Pokemon_server/blob/b7d0d2801893debbf9eea9e414e90a3f974f10c4/sim/battle-queue.ts
