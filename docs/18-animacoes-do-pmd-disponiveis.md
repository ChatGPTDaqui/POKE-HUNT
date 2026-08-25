# Animações do PMD: o que existe, o que dá para usar, e quanto custa

Levantamento de PH-122, feito em 2026-08-24. **Nada foi adotado nesta rodada** —
a issue pede que o custo em MB seja medido e dito *antes* de commitar, e adotar
as duas recomendações principais são 20,4 MB.

## O bloqueio que a issue registrava caiu

A issue dizia: *"a fonte não está mais no disco (...) antes de escolher animação
nova, é preciso trazer o acervo de volta (clone do SpriteCollab, ~GB)"*.

O acervo **existe localmente**, em
`C:\Users\Mark2\Documents\POKE\Assets\SpriteCollab-master (1)\SpriteCollab-master`.
Não é o mesmo caminho que `scripts/import-kanto-sprites.js` procurava (aquele era
dentro de `assets/`, e foi removido do repositório). Todos os números abaixo
saíram dele, sem rede.

## O que o jogo usa hoje

Seis: `Idle`, `Walk`, `Shoot`, `Charge`, `Sleep`, `Faint`
(`src/data/battleSpriteAnims.ts#AnimName`). `Sleep` foi a última a entrar e é o
precedente que o pedido cita.

## O que o acervo tem, para as 245 espécies do elenco

Contado **seguindo `<CopyOf>`**, não por nome de arquivo. A diferença importa: a
contagem crua diz que Silcoon não tem `Idle`, e ele tem — o nó aponta para
`Walk`, e o importador resolve. Contar arquivo mede o nome, não a arte.

Reproduza com:

```
node scripts/conferir-animacoes-pmd.mjs --acervo="<checkout do SpriteCollab>"
```

| animação | cobertura | MB | | animação | cobertura |
| --- | --- | --- | --- | --- | --- |
| `Swing` | **245/245** | 14,2 | | `Strike` | 188/245 (77%) |
| `Attack` | **245/245** | 12,1 | | `Twirl` | 93/245 (38%) |
| `Double` | **245/245** | 10,8 | | `Cringe` | 63/245 (26%) |
| `Hop` | **245/245** | 10,5 | | `Pose` | 60/245 (24%) |
| `Rotate` | **245/245** | 9,9 | | `Tumble` | 59/245 (24%) |
| `Hurt` | **245/245** | 2,9 | | `Nod` | 57/245 (23%) |

Mais 32 animações abaixo de 20% (`Withdraw`, `Appeal`, `Shake`, `Dance`,
`Punch`, `Kick`, `Bite`…). O acervo tem **67 nomes distintos** para as 245
espécies do elenco.

As seis em uso hoje: `Idle`, `Walk`, `Sleep` e `Charge` estão em 245/245 no
disco; `Faint` em 58/245, que é toda a cobertura que o acervo tem.

### Um achado de lado: `Shoot` está incompleto no repositório

`Shoot` está em **228** pastas e o acervo resolve **240**. São 12 espécies que
hoje caem no fallback durante a pose de ataque sem precisar. Não é decisão de
custo — é reimportar.

## Recomendação por caso de uso

### Confusão → `Rotate`. **Adotar.**

9 quadros, 18 ticks (0,3 s), cobertura **100%**. O POKE gira no lugar — é
literalmente a leitura de "tonto", e loopa bem porque volta à direção original.

É o caso que mais rende: confusão hoje é comunicada **só** por VFX sobreposto
(`data/statusVfx.ts`) e pelo corpo tingido. Numa hunt com vários inimigos em
volta, o VFX de um se confunde com o do outro; o corpo girando não.

**Custo: 9,9 MB** (normal + shiny, 245 espécies).

### Comemoração de nível e de cura → `Hop`. **Adotar.**

10 quadros, 24 ticks (0,4 s), cobertura **100%**. Um pulo.

Serve nos dois eventos que o pedido cita, e não compete com `desiredAnimName`:
aquela função deriva de estado **contínuo** (dormindo, andando, atacando), e
comemoração é **pontual**. O caminho certo é o mesmo de `attackAnimTimer` — um
temporizador próprio que ganha de tudo enquanto corre, como `Shoot` já faz.

**Custo: 10,5 MB.**

### Paralisia → **não adotar nenhuma.** Ficar com o VFX.

Não há animação boa:

- `Cringe` (encolher-se) é a semanticamente certa e cobre **26%**. Adotar exigiria
  fallback para 74% das espécies, e o fallback seria `Idle` — ou seja, três em
  cada quatro POKE paralisados ficariam idênticos a um POKE parado. Pior que não
  ter.
- `Shake` (tremer) cobre 5%.
- `Hurt` cobre 100%, mas são 2 quadros de 10 ticks: é um flinch de levar dano,
  não um estado. Em loop lê como "está apanhando agora", que é outra informação.

Paralisia continua no corpo tingido + VFX. Registrar isso vale tanto quanto
adotar: a próxima pessoa a abrir o acervo não precisa refazer a conta.

### Congelamento → idem, e há um detalhe

`animationSystem.ts:42` já registra que não existe animação de congelado no lote
PMD. Continua verdade no acervo inteiro: nenhuma das 67.

## Custo, e por que ele não é detalhe

`assets/` tem ~270 MB e fica **na raiz do repositório**, versionada
(`CLAUDE.md` — copiar para `public/` duplicaria ~6.300 arquivos).

| adotar | MB | sobre os ~270 MB |
| --- | --- | --- |
| `Rotate` (confusão) | 9,9 | +3,7% |
| `Hop` (comemoração) | 10,5 | +3,9% |
| as duas | **20,4** | **+7,5%** |

São ~980 arquivos novos. E o custo é **permanente**: uma vez commitado, o binário
fica no histórico do git mesmo que a animação seja removida depois.

Por isso este documento existe antes da adoção, e não junto com ela.

## Como adotar, quando for decidido

1. Acrescentar o nome a `AnimName` (`src/data/battleSpriteAnims.ts`).
2. Acrescentar a `NEEDED_ANIMS` em `scripts/importar-especies-novas.mjs` e rodar
   com `--acervo=<pasta>`. O script já segue `<CopyOf>` e já copia a variante
   shiny (caindo na normal quando ela não existe).
3. Declarar o fallback. **Nenhuma das duas recomendadas precisa** — as duas são
   100% —, mas a linha tem que existir mesmo assim: uma espécie nova entra no
   elenco sem passar por aqui, e foi assim que `Faint` chegou a 24%.
4. Confusão: uma linha em `desiredAnimName`, acima de `imobilizadoPorStatus`.
   Comemoração: um temporizador próprio, no molde de `attackAnimTimer`.
5. Contar de novo a cobertura depois de importar, espécie por espécie — é o que
   foi feito com `Sleep` e é o que impede o "0 faltando" ser uma suposição.
