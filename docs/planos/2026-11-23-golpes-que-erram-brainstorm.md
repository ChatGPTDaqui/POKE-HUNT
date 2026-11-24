# Golpes que erram: auditoria e brainstorm (23/11/2026)

Brainstorm. **Estado em 23/11/2026:** o dono escolheu só a camada A (visual), com o texto sempre "Errou!" (A5 descartado). A1–A4 implementados; nenhuma regra de B.

Pedido do dono: "precisamos fazer alguma coisa sobre os ataques que erram".

## Como funciona hoje (medido no código em 23/11)

- O sorteio é feito **no disparo** (`golpeErrou`, combatSystem), uma vez por uso. Ele leva em conta a precisão do catálogo, o clima, as traits (Hustle, Compound Eyes, Wonder Skin), os estágios de precisão/evasão, Sand Veil/Snow Cloak e a Névoa. Lock-On e Mind Reader garantem o próximo acerto.
- No erro: a pose de golpe toca inteira e o cooldown do golpe arma. O **turno inteiro (3 s) é perdido**. O "Errou!" (cinza, 0,7 s, nos pés de quem atacou) aparece **no instante do disparo**, antes de a pose chegar ao ápice.
- Não sai **nenhum VFX**: o golpe "não existe" na tela. O alvo não reage. Sem `travaDoGolpe`, quem errou pode andar logo que a pose termina.
- Catálogo: **103 dos 348 golpes de dano (30%) podem errar** (60 entre 90–99%, 30 entre 80–89%, 10 entre 70–79%, 3 abaixo de 70%). Entre os de status, 23 de 211, mas é onde estão os piores (Sing 55%, Hypnosis 60%…).
- A IA (`pickAbilityGreedy`) já multiplica o dano estimado pela precisão.

## Por que incomoda

1. **Lê como bug.** Pose sem golpe e sem reação: parece que o efeito não carregou.
2. **O aviso chega antes do golpe.** "Errou!" no disparo quebra a regra da coreografia (o resultado aparece junto do impacto).
3. **O turno perdido é longo.** Num idle assistido, 3 s sem nada acontecendo, às vezes duas vezes seguidas, é a parte "chata" do combate.
4. **Azar em sequência.** Com 70%, errar 2 seguidas acontece 9% das vezes e 3 seguidas, 2,7%. Numa hunt de horas, isso aparece todo dia.

## Ideias, por camada

### A. Apresentação (sem mexer em regra, sem risco no servidor)

- **A1. O erro acontece no impacto.** Sortear no disparo continua igual (determinismo), mas o desenho mostra o golpe **saindo** e errando no instante em que acertaria. O "Errou!" vai para cima do alvo, junto do impacto, como o número de dano.
- **A2. VFX que passa raspando.** Projéteis e raios desviam alguns pixels e seguem além do alvo, sumindo; golpes de contato fazem a investida (RushFrame) e "batem no ar" ao lado. É o mesmo VFX com um `desvio` (ângulo e alcance), sem arte nova.
- **A3. O alvo esquiva.** Hop do acervo PMD (pose que já existe em várias espécies) ou um passo lateral só no desenho, com "Desviou!". Fica claro que **o alvo** fez algo, e não que o jogo falhou.
- **A4. Atacante segura o golpe.** `travaDoGolpe` também no erro, até o "impacto": ninguém sai andando no meio do golpe.
- **A5. Texto variado pela causa.** "Errou!" (sorte), "Desviou!" (evasão do alvo), "Perdido na névoa" (Névoa), "Areia nos olhos" (Sand Attack). A causa já é conhecida em `golpeErrou`.

### B. Regra (muda balanceamento; o servidor re-simula, então só com teste de paridade)

- **B1. De raspão.** O erro vira um acerto fraco: 25–35% do dano, sem crítico nem efeito secundário, número em cinza "de raspão". Mata o "turno vazio" sem anular a precisão. Status continua errando seco.
- **B2. Proteção contra azar.** Cada erro seguido soma +10 pontos de precisão no próximo uso daquele POKE (zera ao acertar). Determinístico, sem sorteio extra. Corta as sequências de 3 erros sem mexer na média.
- **B3. Turno mais curto no erro.** O cooldown global cai de 3 s para ~1,5 s quando o golpe erra: o ritmo continua e o erro custa menos tempo de tela. No duelo por rounds, o round fecha igual.
- **B4. Erro dá foco.** Errar deixa uma marca (como Lock-On): o próximo golpe contra o mesmo alvo não erra. É fiel ao espírito dos jogos e fácil de explicar.

### C. Informação para o jogador

- **C1.** Mostrar a precisão no slot do golpe (HUD) e na bolha: "70%" ao lado do poder.
- **C2.** Na tela de detalhes do POKE: taxa de acerto real da sessão ("acertou 82% dos golpes").
- **C3.** Aviso na montagem de equipe quando a fila tem muitos golpes abaixo de 80%.

## Recomendação

Começar por **A1 + A2 + A3 + A4** (só desenho: resolve o "parece bug" e respeita a coreografia) e escolher **uma** regra de B. A melhor relação custo/efeito é **B2 (proteção contra azar)**: não muda a média, é invisível quando dá certo e acaba com as sequências que irritam. **B1 (de raspão)** é a mais forte para o idle, mas mexe em DPS e precisa de rebalanceamento.

## Riscos e decisões

1. Qualquer item de B muda o resultado das lutas: precisa de teste de paridade cliente×servidor e de rodar a simulação de balanceamento (kills/hora) antes e depois.
2. A3 depende da pose Hop; nas espécies sem ela, use o passo lateral só no desenho.
3. A1 adia o "Errou!": no duelo por rounds, o round seguinte só abre 3 s depois do disparo, então não há conflito.
4. **Decisão sua:** qual regra de B (ou nenhuma) entra.
