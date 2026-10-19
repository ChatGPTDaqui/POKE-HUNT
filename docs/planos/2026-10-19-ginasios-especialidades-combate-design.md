# Ginásios humanos, Especialidades imersivas e duas regras de combate — design

19/10/2026. Brainstorm com o dono. São quatro entregas independentes, cada uma
com PR própria e na ordem abaixo.

## Ordem de execução

1. **Cura limitada por PP.** É a menor e conserta o travamento de hoje (o
   selvagem se cura para sempre).
2. **Fim do Ataque Básico + Struggle.** Mexe na mesma regra de escolha de golpe.
3. **Especialidades reformuladas.** 360 missões novas e títulos em degraus. O
   nível 10 fica com a regra provisória até a entrega 4.
4. **Ginásios com líder humano.** É a maior: banco, economia, PvP assíncrono 6x6
   e mandato. Ela também liga o nível 10 da Especialidade à insígnia do tipo.

As entregas 1 e 2 rodam no servidor (`authority`): o motor é o mesmo bundle, e
o servidor re-simula tudo. Toda regra nova precisa dar o mesmo resultado nas
duas pontas.

---

## 1. Cura limitada por PP

Hoje o jogo não tem PP: cada golpe só tem tempo de recarga (`cooldownFromPp`).
Por isso Recover e Synthesis voltam assim que a recarga termina.

- **Golpe de cura** é a cura pura: o golpe que tem `healPercent` e não causa
  dano (Recover, Roost, Synthesis, Moonlight, Morning Sun, Soft-Boiled,
  Milk Drink, Slack Off, Rest e afins). Golpes de dreno ficam de fora.
- **Quantidade:** o PP original do catálogo (`ability.pp`). Recover tem 10,
  Synthesis tem 5.
- **Contagem:** por entidade e por alvo. Cada uso gasta 1 PP; com 0, o golpe
  fica indisponível e a IA escolhe outro.
- **Reset:** sempre que o alvo da entidade muda. Para o jogador, ao engajar
  outro inimigo. Para o selvagem, quando o POKE do jogador em campo é trocado.
- **Vale para todos:** selvagem, jogador, protetor (Guardian/Lord), duelo e
  PvP.
- **HUD:** o slot do golpe de cura mostra os usos restantes (ex.: "3/10").

**Risco aceito:** com vários inimigos, o jogador que troca de alvo recupera o PP
da própria cura. Como é conteúdo contra a máquina, isso não trava nada, só
favorece o jogador.

**Testes:**
- o selvagem com Recover perde a luta em tempo finito;
- o PP volta ao trocar de alvo;
- cliente e servidor (modo silencioso) chegam ao mesmo resultado.

---

## 2. Fim do Ataque Básico + Struggle

- `BASIC_ATTACK` sai do jogo: do moveset escolhível, dos presets de PvP e do
  fallback do selvagem. Save antigo com `basic_attack` nos golpes ativos
  ignora o id (sem migration).
- **POKE sem nenhum golpe de dano** (ex.: Magikarp antes do Lv 15):
  - Ele usa os golpes que tem (status) gastando PP do catálogo, com a mesma
    contagem por alvo da entrega 1.
  - Com todos esgotados, usa **Struggle**: poder 50, sem tipo, sempre acerta, e
    recuo de 1/4 do HP máximo de quem usa (regra da geração 4 em diante).
  - Vale também para o selvagem.
- **Aviso:**
  - Na Equipe, o POKE ganha a marca "Sem golpe de dano: ensine um TM".
  - Em campo, quando ele entra sem golpe de dano, aparece um aviso uma vez.
- POKE com golpe de dano nunca usa Struggle. Só a cura tem limite de PP (entrega
  1).
- Textos de ajuda (Wiki, glossário e tutorial) que citam o "Ataque Básico" são
  reescritos. Entra uma nota de versão.

**Testes:**
- POKE sem golpe de dano esgota o status e passa ao Struggle, com recuo;
- POKE com golpe de dano nunca usa Struggle;
- save com `basic_attack` carrega sem erro.

---

## 3. Especialidades reformuladas

O objetivo é que o jogador se sinta especialista no tipo. Cada nível pede
**feitos com POKEs do tipo**, mais o ouro e a Pedra (o modelo híbrido continua).
São 18 tipos x 2 trilhas x 10 níveis.

**Famílias de feito** (todas aprovadas):

| Família | Trilha | Exemplos |
|---|---|---|
| Combate | Dano | Vencer N selvagens com POKE do tipo em campo; N acertos super-efetivos com golpes do tipo; derrotar Guardiões e Lordes com POKE do tipo |
| Defesa | Defesa | Levar N golpes "pouco efetivos" com POKE do tipo; sobreviver com menos de 10% de HP; vencer quem tem vantagem de tipo sobre você |
| Conhecer | As duas | Capturar espécies do tipo; evoluir POKEs do tipo; pesquisa do Bestiário em espécies do tipo |
| Domínio | Níveis altos | Limpar um estágio com a equipe toda do tipo; caçar no bioma de casa do tipo; **nível 10: insígnia do tipo** (entrega 4) |

**Regras gerais:**
- Cada nível pede de 1 a 3 feitos, crescendo com o nível.
- Os feitos são gerados por molde, como hoje (`especialidadeMissoes.ts`), e
  avaliados no servidor pelo avaliador das conquistas.
- Contadores novos no servidor, por tipo do POKE ativo, acumulados no flush:
  - abates com o tipo;
  - acertos super-efetivos com golpe do tipo;
  - protetores vencidos com o tipo;
  - golpes resistidos;
  - sobrevivências críticas;
  - vitórias contra quem tem vantagem de tipo;
  - capturas do tipo;
  - evoluções do tipo;
  - estágio limpo com a equipe toda do tipo.

  Precisa de migration com os tipos regenerados no mesmo PR (ver o gate).
- **Quem já tem nível o mantém** (regra da 8.26). Só os próximos níveis usam as
  missões novas.

**Títulos em degraus:** três por tipo, contando o maior nível entre dano e
defesa:
- Aprendiz no nível 3;
- Especialista no nível 7;
- Mestre no nível 10.

São 54 títulos, com nome próprio por tipo (ex.: Fogo: Aprendiz das Chamas,
Especialista das Chamas, Mestre das Chamas). O jogador escolhe qual exibir no
perfil. A exibição no boneco em campo fica para depois, como pedido.

**Testes:**
- o molde gera 360 missões válidas;
- cada contador soma só com POKE do tipo;
- o nível atual é preservado;
- o título certo é liberado em cada degrau.

---

## 4. Ginásios com líder humano

### Estrutura

- **90 ginásios:** 18 tipos x 5 faixas de nível. Cada faixa tem um nome:
  - 100: Liga Regional;
  - 200: Liga Elite;
  - 300: Liga Campeã;
  - 400: Liga Lendária;
  - 500: Liga Mestra.
- **Teto de nível:** POKE acima do teto da faixa luta com os atributos
  calculados no nível do teto, só na batalha. Golpes e IVs continuam os dele.
- **Luta 6 contra 6 ao vivo na tela do desafiante** (revisão do dono): ele
  assiste golpe por golpe, com o combate do modo livre. A equipe do líder vem do
  snapshot salvo (`pokeDoSnapshotDePvp`) e é controlada pela IA, então o líder
  não precisa estar online.
- **Quem decide o resultado continua sendo o servidor.** Ao desafiar, o servidor
  cobra a taxa e entrega a semente da luta. O cliente roda a luta ao vivo e
  envia o fim. O servidor re-simula com a mesma semente e as mesmas equipes, e
  só aceita o resultado se bater. É o mesmo padrão do resto do jogo (autoridade
  re-simula). Sem isso, um cliente adulterado declararia vitória e tomaria
  ginásio e insígnia.

### Líder e mandato

- Todo ginásio começa com um **líder NPC**, com uma equipe do tipo no teto da
  faixa.
- O **mandato dura 7 dias**. Ao fim, assume quem venceu um **duelo para
  destronar** no **menor tempo de batalha**; empate fica com quem venceu
  primeiro. Sem nenhum vencedor no mandato, o líder atual renova por mais 7
  dias.
- **Equipe do líder:** 6 POKEs, todos com o tipo do ginásio (primário ou
  secundário). O líder pode trocar a equipe durante o mandato, mas só por POKEs
  do tipo.
- Um jogador **pode liderar vários ginásios ao mesmo tempo** (decisão do dono).
  Cada ginásio tem a sua equipe, e o mesmo POKE pode estar em mais de um (um
  Gyarados Água/Voador pode defender Água e Voador).

### Dois duelos

| Duelo | Equipe do desafiante | Se vencer |
|---|---|---|
| **Pela insígnia** | Qualquer equipe | Ganha a insígnia (tipo + faixa) |
| **Para destronar** | Só POKEs com o tipo do ginásio | Entra na disputa do próximo mandato; vale o menor tempo de batalha |

- Cada duelo cobra a **taxa da faixa**: 50 mil, 150 mil, 400 mil, 1 milhão e 2,5
  milhões de ouro (da faixa 100 à 500). O valor da primeira faixa é do dono; os
  outros são proposta a confirmar.
- **O líder recebe 30% quando vence**, ou seja, quando o desafiante perde. Se o
  desafiante vence, o líder não recebe. O resto da taxa sempre sai do jogo.
- **Limite:** 2 desafios por dia por jogador (somando todos os ginásios e os
  dois tipos de duelo; o dia vira à meia-noite de Brasília, igual ao Diário). O
  líder não desafia o próprio ginásio.
- **Repetição na equipe:** a mesma espécie pode aparecer no máximo 2 vezes na
  equipe de 6, tanto na do desafiante quanto na do líder.

### Insígnia

- Coleção permanente e cosmética no perfil, num estojo de 18 tipos x 5 faixas.
  Sem bônus de poder.
- Conta para as conquistas.
- Cumpre o **nível 10 da Especialidade** do tipo, em qualquer faixa.

### Segurança e economia

- Tudo passa por RPC no servidor: cobrança da taxa, resultado, repasse e posse.
  O cliente nunca decide quem venceu.
- Com 30% só na vitória do líder, uma conta alternativa perdendo de propósito
  gera no máximo 30% de volta e queima 70%. Farmar o próprio líder dá prejuízo.
- Pagar a taxa e registrar o duelo acontecem na mesma transação. Desafio
  recusado (sem ouro, limite de tempo, equipe inválida) não cobra nada.

### Interface

- Tela de Ginásios: abas por faixa e grade dos 18 tipos.
- Cada ginásio mostra o líder, a equipe (visível antes de pagar), a taxa, o
  tempo restante do mandato e o melhor tempo de destronar até agora.
- Botões "Desafiar pela insígnia" e "Desafiar para destronar". O de destronar só
  é liberado com uma equipe toda do tipo.
- O replay da luta usa o combate do modo livre, nunca narrador (regra do PvP).
- O líder vê os ganhos do mandato.

**Testes:**
- teto de nível;
- equipe do tipo exigida no destronar e na equipe do líder;
- taxa, repasse e queima;
- troca de mandato pelo menor tempo e renovação sem vencedor;
- limite de 2 por dia;
- espécie repetida no máximo 2 vezes;
- resultado do cliente que não bate com a re-simulação é recusado;
- insígnia liberando o nível 10 da Especialidade.

---

## Decidido pelo dono

| Tema | Decisão |
|---|---|
| Cura | Só cura pura; PP original; reset ao mudar de alvo |
| Sem golpe de dano | Aviso + usa o que tem até acabar o PP, depois Struggle |
| Feitos de Especialidade | Combate, Defesa, Conhecer e Domínio |
| Título | Degraus nos níveis 3, 7 e 10 |
| Mandato | 7 dias; assume o destronar mais rápido, só com POKEs do tipo |
| Duelos | Pela insígnia (qualquer equipe) e para destronar (equipe do tipo) |
| Faixas | 100, 200, 300, 400 e 500 |
| Taxa | 50 mil na faixa 100, crescendo; líder recebe 30% quando vence |
| Equipes | 6 contra 6; a mesma espécie no máximo 2 vezes |
| Formato da luta | Ao vivo na tela do desafiante; o servidor valida re-simulando |
| Limite | 2 desafios por dia por jogador |
| Ginásios por líder | Sem limite |
| Insígnia | Coleção e exibição, sem bônus |

## Assumido (o dono pode mudar)

- Taxas da faixa 200 em diante: 150 mil, 400 mil, 1 milhão, 2,5 milhões.
- Nomes das ligas e dos 54 títulos.
- Renovação do líder sem vencedor de destronar.
- O líder pode trocar a equipe durante o mandato (só POKEs do tipo).
