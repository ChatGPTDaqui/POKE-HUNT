# 12 — Decisões descartadas

Cada entrada aqui foi **tentada ou seriamente considerada**, medida, e rejeitada. Estão
registradas para que ninguém as reintroduza como "melhoria óbvia" — várias parecem
obviamente certas.

---

## Verificação por re-simulação (o plano original da Fase D)

**Plano:** checkpoint + reconciliação. O servidor re-simula da semente e compara com o que o
cliente mandou.

**Descartado por dois motivos medidos:**

1. **Comparar não funciona.** O determinismo é garantido *dentro de uma engine*, mas o motor
   usa `Math.sin`/`cos`/`atan2` e o IEEE 754 não especifica essas funções bit a bit. Cliente é
   navegador (V8 / SpiderMonkey / JSC), servidor é Node. A posição diverge no último bit → o
   engajamento diverge → o abate diverge. **O comparador acusaria jogador honesto.**
2. **Se comparar custa o mesmo que simular, não compare — simule.** Re-simular gasta a mesma
   CPU que *ser* a simulação, sem comprar nenhuma segurança a mais.

**Adotado:** o servidor **é** a simulação, sob demanda.

---

## Loop contínuo por jogador no servidor

**Descartado:** o custo escala com jogador conectado, obriga a interpolar o canvas a partir de
snapshot, e não compra segurança nenhuma além do modelo sob demanda.

---

## "Edge Function não serve por causa do limite de 2s de CPU"

**Esta conclusão foi minha, e estava errada.** O limite é real; a conclusão foi tirada **antes
de haver número**.

Medido: 30 min de jogo em 26ms; o pior caso (6h, teto do farm offline) em ~1,6s de ida e volta
**incluindo rede**, com 21.594s creditados e 8.550 abates. Sem `WORKER_LIMIT`. Cabe.

Registrado como lembrete de método: **medir antes de concluir sobre limite de plataforma.**

---

## Fixar o inimigo mais forte como "combate pessimista"

**Descartado com medição, e o sintoma chegou pelo usuário.** Ver
[07](07-farm-offline.md#fixar-o-inimigo-mais-forte-não-era-pessimismo).

Resumo: fixar a espécie fixa junto a `catchRate`. O de maior nível daquela hunt era Pidgey,
fácil de capturar — o modo criado para **limitar** o offline capturava **50% mais** que o jogo
ao vivo, e a mochila voltava com 332 cópias do mesmo POKE.

"Mais forte" e "menos lucrativo" não são a mesma coisa.

---

## Piso de venda dentro de `pokemonSellValue` sozinho

**Descartado por efeito colateral medido.** O ouro por abate deriva do mesmo número
(`MONEY_FOR_KILL = sellValue / killDivisor`). Aplicar o piso na função única faria o ouro por
abate saltar de ~5 para ~330 na hunt inicial — **inflação de farm de ~60x** que ninguém pediu.

Duas funções (`pokemonBaseValue` e `pokemonSellValue`), com teste trancando a separação.

---

## Piso de venda como `max(1000, modificadores)`

**Descartado:** com `max`, os 1000 engoliam tudo até a fórmula passar de 1000 sozinha. Na
prática, um POKE comum de nível 40 valia o mesmo que um de nível 1.

Adotado: **soma** (`1000 + modificadores`), para que cada modificador renda desde o primeiro
nível.

---

## RPC de claim atômico para flush concorrente na mesma sessão

**Não construído, e o motivo continua válido.** Medido: 20 flushes simultâneos do mesmo
intervalo de 120s creditaram **1,03x**, todos 200.

Dois motivos estruturais neutralizam a corrida na *mesma* sessão: ouro é gravado como valor
absoluto (converge), e `sessaoAberta` só flusha a mais recente.

**Correção importante:** essa conclusão era estreita demais. Ela vale para dois flushes da
*mesma* sessão. Duas **sessões** têm cada uma seu `last_flush_at`, e os intervalos **somam** —
que é o exploit real corrigido pelo índice único parcial. A medição estava certa; a
generalização não.

O claim atômico que **existe** hoje resolve outro problema: duplicação de POKE por captura em
flushes concorrentes (uid vem de `crypto.randomUUID`, fora da sequência semeada, então não
converge como o ouro).

---

## Índice único como remédio para sessão órfã (a primeira leitura)

Antes do índice único, sessões órfãs eram consideradas "efeito colateral cosmético, não
exploit; não vale um unique index + tratamento de conflito".

**Estava errado**, e virou o exploit medido de +8.105 de ouro e +60 POKEs por clique duplo. Ver
[04](04-autoridade-do-servidor.md#uma-sessão-aberta-por-vez).

---

## Travar a escrita por jogador (lease com expiração)

**Considerado e não construído** para o caso de dois `/acao` concorrentes entre si.

O cliente já serializa por botão (`useAcaoPendente`) e o dano é "a ação perdida", não "10
minutos de caçada perdidos". Um lease troca uma perda rara por um **modo de falha novo** —
escrita travada — que não se justifica com a evidência atual.

---

## Retry-on-401 no servidor

**Descartado.** Mascararia token inválido de verdade e somaria latência a toda falha legítima.

O conserto correto para o 401 intermitente é client-side: não disparar request autenticado
antes de a sessão assentar.

---

## Virtualização das listas longas

**Descartada duas vezes, por motivos diferentes:**

1. **Prematuro.** FPS medido em 158+, zero long task com 220+ cards.
2. **Tecnicamente ruim aqui.** Exigiria saber a altura da viewport e de cada linha, e as duas
   variam com o redimensionamento da janela (`resize: both`), com o `hudScale` e com o próprio
   conteúdo. Daria medição contínua e scroll aninhado dentro de container já rolável, ruim no
   toque.

Adotado: paginação de 30, aplicada **depois** de filtrar e ordenar.

---

## Deteção ativa de bloqueador por isca

**Descartada.** Servir um `ads.js` e ver se carrega é a técnica dos sites anti-adblock,
obrigaria a publicar um arquivo com nome que as listas barram (arriscando marcar o próprio
domínio), e ainda assim só provaria "existe bloqueador" — não que foi ele que derrubou **este**
request.

Adotado: `navigator.onLine` como única pista honesta, e a mensagem cita bloqueador como **causa
provável**, sem afirmar. O jogo não exige nada de quem usa bloqueador.

---

## Renomear `/mercado/anuncio`

**Não feito.** 6.420 URLs do jogo testadas contra as regras de rede genéricas de EasyList,
EasyPrivacy, EasyList Portuguese e uBlock Origin: **nenhuma casa**. As regras com "anuncio" da
EasyList Portuguese são cosméticas ou ancoradas em site específico.

Renomear sem evidência é superstição, e trocar o caminho quebra o cliente já publicado durante
a janela de deploy.

---

## Imagens rippadas para sprite de golpe

**Substituídas por completo** por VFX procedural em canvas — pedido explícito, insatisfação com
o visual.

Deletados `attackGraphics`, `extraAttackGraphicFrames`, `attackGraphicFrames.generated` e
`measure-attack-graphics.js`. As imagens seguem no disco, sem nada as referenciando.

**Bug real que apareceu no caminho:** `Shadow-Ball.png` era PNG indexado **sem chunk `tRNS`** —
zero transparência real. O xadrez branco/cinza que parecia transparência era pixel pintado.
Todo golpe Ghost sem golpe próprio desenhava uma caixa cinza sólida, não uma esfera roxa
flutuante.

---

## VFX em DOM por cima do canvas

**Descartado.** O jogo inteiro (mundo, sprites, combate) renderiza em `<canvas>`, nunca em DOM.
Divs de VFX por cima quebrariam a transformação de câmera e zoom que todo o resto usa.

Se spritesheets por tipo aparecerem, eles plugam **dentro** de `drawShapeParticle` (ou um
`drawImage` no lugar dela) — nada mais no pipeline de combate muda. Foi exatamente o que
aconteceu quando a arte do Crawl entrou.

---

## Arte de item do Scarlet/Violet nos ícones do menu inferior

**Não feito.** O menu já usa ícones de verdade (Phosphor), não texto nem placeholder.

O único pack de arte disponível é o de **itens** (523 PNGs numerados, sem legenda) — não existe
nele um ícone de "mapa", "loja" ou "mercado", **porque não existe item que seja isso**. Trocar
por arte de item errada seria pior que o ícone vetorial correto.

O mecanismo (`MenuEntry.iconUrl`) segue de pé: é uma linha por menu quando houver arte
adequada.

---

## Tokens e Runas no Bestiário

**Não desenhados.** Não existe economia de token no jogo — nenhum sistema concede nem consome.
O painel diz isso.

**Preencher com o dado de exemplo do protótipo mostraria barra que nunca anda e botão "Resgatar"
que não paga nada — pior que tela vazia, porque parece bug.** Mesma regra para Tasks, Correio
(recompensa), Outfit e Especialidades.

---

## "Potencial" e "Bônus de runa" na Calculadora

**Não implementados**: não existem no modelo de dados. O que multiplica atributo aqui é
raridade, shiny e IV — são esses os controles.

---

## Gravar o snapshot de nível 50 no POKE

**Descartado.** `computeStatsAtLevel` é determinística sobre campos que o POKE já carrega e o
banco já persiste. Gravar exigiria coluna nova, backfill de todo save existente e mais um
caminho de escrita no level-up. Derivar dá os mesmos números sem nenhum dos três.

---

## Coluna `play_seconds` em `players`

**Descartada.** O tempo de jogo já é a soma de `game_sessions.simulated_seconds`. Uma coluna
nova custaria uma escrita a mais em **todo** flush (30 em 30s por jogador ativo) para um dado
lido só quando alguém abre o Perfil.

---

## Índices nos seis critérios de ranking de POKE

**Não criados.** Seriam seis índices mantidos a cada escrita de POKE numa tabela de milhares de
linhas. Revisar se a base mudar de escala.

---

## `Set` para `lockedItems`

**Descartado:** `Set` vira `{}` no `JSON.stringify` do save. Objeto simples
(`{ itemId: true }`).

---

## Coluna booleana para "POKE está no mercado"

**Descartada** em favor de um valor novo no enum `location`. Com booleano, cada leitura teria
que lembrar de filtrar, e a que esquecesse virava venda dupla. Com o enum,
`snapshotToGameState` filtra `team`/`bag` e o POKE some do vendedor sozinho.

---

## Realtime do Supabase para o chat

**Descartado.** Exigiria policy de SELECT para `authenticated` na tabela — cliente lendo tabela
direto, que é exatamente o que a Fase D fechou.

Com dezenas de jogadores, polling a cada 6s pelo servidor é barato e não abre porta nenhuma.

---

## Anexo de chat guardando id do POKE

**Descartado** em favor de snapshot. Duas razões: o link continua mostrando o que foi mostrado
na hora (o POKE pode ser vendido ou evoluir depois), e ninguém ganha um jeito de consultar POKE
alheio por id.

---

## Crédito de venda por `update players set gold = gold + X`

**Descartado**, e é o invariante que sustenta o mercado inteiro. Ver
[08](08-social-e-mercado.md#o-invariante-que-sustenta-tudo-aqui).

---

## Delete-tudo + insert para `player_auto_catch_rules`

**Descartado** depois de causar 502 em 33 de 48 `GET /estado` concorrentes. A premissa antiga
("a lista é pequena e não tem chave estável") estava errada: a chave estável é a própria
constraint `UNIQUE (user_id, species_id)`.

---

## `createPattern('repeat')` no fundo da hunt

**Descartado.** A imagem é uma cena única detalhada, não uma textura feita para repetir sem
costura. Enquanto o mapa cabia numa cópia, era invisível; dobrado o mapa, o wrap virou uma
risca escura cortando o mapa em zoom out.

Adotado: `drawImage` único centrado. A imagem escalada já é maior que o mapa nas duas
dimensões.

---

## `strokeRect` no bounding-box para a aura de IV máximo

**Descartado.** Com o padding transparente dos quadros PMD, lia como "moldura", não como
contorno no POKE.

Adotado: shadow-cast sobre o recorte do quadro atual — o canvas borra a **forma real de alpha**
e o halo abraça a silhueta.

---

## `Shoot → Idle` como fallback de animação de ataque

**Descartado**, e era um bug real em 15 das 227 espécies com arte (incluindo Charmander): elas
não têm `Shoot-Anim.png`, então **atacavam com a pose de parado**. Sem erro, sem log.

A cadeia virou **lista**, não sucessor único, por dois motivos:

1. `Shoot → Charge` e `Charge → Shoot` são mutuamente dependentes. Com sucessor único, uma
   espécie sem nenhum dos dois entrava em ciclo, a guarda de visitados cortava o laço e
   `resolveBattleAnim` devolvia `null` — o que joga a entidade no **placeholder geométrico**. O
   bug relatado teria virado outro pior.
2. A lista deixa o último degrau (`Walk`, que toda espécie com arte tem) explícito.

---

## Escala global de sprite de batalha

`GLOBAL_BATTLE_SCALE = 1.5` foi introduzido e depois **revertido**. Hoje `scaleForSpecies`
devolve **1** para todo mundo — tamanho original do arquivo, comuns e lendários.

A função continua existindo em vez de sumir com as chamadas: ela é o **único** ponto de escala
do campo de batalha, então enquanto devolver 1 não há como escala nova reaparecer espalhada.
`HEIGHT_M` (altura real da Pokedex) ficou exportado — dado levantado à mão, não vale jogar
fora.

---

## Barra de HP com chrome cropado de rip

**Revertida** para pill 100% canvas, a pedido, com print de referência.
`assets/hp-bar/frame.png` segue no disco, sem import.

---

## `backdrop-filter: blur` atrás dos menus

**Removido** de `#overlay-root` e do overlay de confirmação, a pedido. O escurecimento
continua; só o blur saiu.

O `blur(6px)` do `.panel` genérico não mudou — é decoração do painel, não do jogo atrás.

---

## Slowpoke → Slowking

**Não implementado.** Slowpoke já evolui por nível para Slowbro (dado real), e o modelo só
suporta um `evolvesTo` por espécie.

Não é dead-end para consertar — é uma **segunda opção** de evolução que este sistema nunca teve
como representar.

---

## Corrigir a linha duplicada da planilha (`SEAKING|TAIL_WHIP|1`)

**Não feito na migração de fonte, de propósito.** Corrigir ali embutiria uma mudança de jogo
numa troca de fonte, quebrando a prova byte a byte.

Efeito real: nenhum no combate, só a aba "Golpes" do perfil lista duas vezes. Limpar deve ser
um commit próprio e visível.

---

## Escrever na planilha por script

**Regra permanente do projeto.** O risco é corromper um arquivo grande feito à mão com um
escritor de XML improvisado.

Valor que precisa mudar vai no invólucro à mão (`data/items.ts`, `data/pokes.ts`), nunca no
gerado.

---

## Fora de escopo por decisão explícita

Não implementar sem pedir:

- Pesca e varas (as varas sincronizam, mas não são vendidas)
- PP como recurso consumível — PP é só a entrada do cooldown
- Mecânicas de golpe além de dano, tipo, STAB, efetividade e cooldown: status, alteração de
  atributo, prioridade, multi-hit, recoil, dano fixo, "sempre acerta"
