# Mural de contratos e ovos — design (20/10/2026)

Aprovado pelo dono em 20/10/2026. Substitui as cadeias de Tasks, que repetiam o Bestiário (os dois mediam abates por espécie).

## Bug corrigido antes (PR #1013)
As Tasks reivindicadas voltavam a aparecer como disponíveis a cada recarga. O estado inicial vem de `/estado`, que montava `missoesReivindicadas` vazio. No boot não há lista local para `mesclarMissoes` unir com a do servidor. Agora `lerSnapshot({ comMissoes: true })` é usado só no `/estado`.

## Mural
- 5 contratos por dia, renovados à meia-noite de Brasília (`_dia_do_diario`).
- Espécie: sorteada entre as dos sub-biomas normais dos biomas liberados (Campo Aberto sempre, mais os biomas com estágio ≥ 1). Sem lendárias, sem sala especial e sem espécie com peso de spawn < 5. Não repete espécie no dia.
- Raridade do contrato: Comum 50%, Incomum 28%, Raro 15%, Ultra 6%, Lendário 1%. Não existe contrato Mítico.
- "Derrote N": N vale 50/100/200/400/800 × min(1, peso/30), com piso de 10. Contam só os abates feitos depois que o contrato aparece (`base`).
- Contrato shiny: só de raridade Raro ou maior, com chance de 45% nessas raridades (cerca de 1 em 10 no total), e só de espécie com peso ≥ 20. O pedido é "derrote 1 shiny".
- Refresh: troca os contratos não entregues por 10 × 2^n diamantes, onde n é o número de trocas já feitas no dia.
- Prêmio: um ovo da forma base, na raridade do contrato. Sem ouro.
- Contrato não entregue some na virada do dia.

## Ovos
- Ficam na Mochila (aba Ovos) e só chocam na equipe, onde ocupam uma das 6 vagas.
- Abates para chocar: Comum 200, Incomum 400, Raro 800, Ultra 1500, Lendário 3000. O flush desconta os abates da janela de todo ovo na equipe.
- Pronto (0 abates), o botão Chocar dispara a revelação animada. O servidor sorteia só nessa hora:
  - Raridade do POKE (%):

    | Ovo | Comum | Incomum | Raro | Ultra | Lendário | Mítico |
    |---|---|---|---|---|---|---|
    | Comum | 60 | 30 | 8 | 1,6 | 0,35 | 0,05 |
    | Incomum | 40 | 38 | 17 | 4 | 0,85 | 0,15 |
    | Raro | 20 | 35 | 32 | 10 | 2,5 | 0,5 |
    | Ultra | 5 | 20 | 40 | 27 | 6,5 | 1,5 |
    | Lendário | 0 | 5 | 30 | 40 | 20 | 5 |

  - Shiny: 25% no ovo de contrato shiny; nos outros, a fórmula normal do jogo.
  - IV de 15 a 31; natureza uniforme; habilidade da forma base, com 5% de chance da oculta.
  - Nasce no Lv 1, com `origem = 'ovo'`. Vai para a equipe se o ovo estava lá e há vaga; senão, para a Mochila.

## Fora desta entrega
- Bestiário continua só como coleção de abates; prêmio cosmético fica para depois.
- As cadeias antigas saem sem compensação. As tabelas `missao_cadeia` e `player_missoes_reivindicadas` ficam no banco.

## Fonte dos números
`src/data/ovos.ts`. O SQL repete os números, e `src/data/ovos.test.ts` compara os dois e gera o catálogo.
