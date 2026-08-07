# Como pedir para uma IA corrigir a HUD sem mexer na tipografia

O problema de dizer só "mantenha a fonte e o tamanho": a IA não tem uma definição do que
"manter" significa. Ela vai reescrever componentes, escolher tamanhos "equivalentes" e afirmar
que preservou tudo. A instrução precisa ser verificável, não interpretável.

A técnica: fazer a IA **extrair** a tipografia da HUD atual, **escrever** os valores numa tabela,
e só depois mexer no resto — tratando a tabela como contrato. Assim existe um artefato para
comparar antes e depois.

---

## Passo 1 — Prompt de extração (rodar UMA vez, antes de qualquer correção)

> Antes de mudar qualquer coisa, faça um inventário da tipografia desta HUD e não altere nenhum
> arquivo ainda.
>
> Liste numa tabela, elemento por elemento:
> - família de fonte (nome exato, e de onde ela vem: pacote npm, `@font-face`, CDN, ou stack do
>   sistema)
> - tamanho em px (não a classe utilitária — o valor final computado)
> - peso numérico (400/500/600/700/900)
> - `line-height`, `letter-spacing` e `text-transform` quando não forem o padrão
>
> Depois responda: a fonte está declarada como token central (uma variável CSS / config do
> Tailwind) ou repetida em cada componente? Se estiver repetida, aponte todos os lugares.
>
> Não proponha melhorias de tipografia. Só me devolva a tabela.

Guarde essa tabela. Ela é o contrato.

---

## Passo 2 — Bloco de congelamento (colar em TODO pedido seguinte)

> **RESTRIÇÃO TIPOGRÁFICA — não negociável**
>
> A tipografia desta HUD está aprovada e congelada. Nas mudanças que eu pedir abaixo, você não
> pode alterar, para nenhum elemento existente:
>
> - a família de fonte
> - o tamanho em px
> - o peso
> - `line-height`, `letter-spacing`, `text-transform`
>
> Regras práticas:
> 1. Não troque uma classe de tamanho por outra "equivalente" (`text-sm` → `text-[14px]`,
>    `text-xs` → `text-[13px]`, etc.). Mantenha a declaração **literalmente igual**.
> 2. Se um elemento novo precisar de texto, reutilize um dos tamanhos/pesos que já existem na
>    tabela. Não introduza um valor novo. Se nenhum servir, **pare e me pergunte** em vez de
>    escolher.
> 3. Se a correção que eu pedi só for possível mexendo em tipografia, **não mexa** — me explique o
>    conflito e proponha a alternativa (mudar espaçamento, largura, cor, hierarquia por peso já
>    existente).
> 4. Ao terminar, me devolva a mesma tabela do inventário mostrando antes e depois de cada linha.
>    Se alguma linha mudou, isso é um bug do seu trabalho, não uma melhoria.
>
> **O que eu quero que você corrija:** [descreva aqui]

A regra 1 é a que mais importa. Sem ela a IA "refatora" `text-sm` para um px arbitrário e o
resultado muda 1–2px em cada elemento — o suficiente para o layout desmontar e ninguém saber por
quê.

A regra 4 é o que torna a restrição verificável em vez de um pedido de boa vontade.

---

## Armadilhas específicas deste projeto

Se essa HUD vai entrar no NOVO POKE IDLE, avise a IA sobre estes três pontos — todos já mordem
hoje:

### 1. A fonte tem que ser self-hosted, não CDN

O projeto carrega fonte por pacote npm (`@fontsource-variable/geist`, importado em
`src/index.css`), nunca por `<link>` para Google Fonts. Se a HUD nova usar uma fonte via CDN,
"manter a fonte" significa **instalar o pacote `@fontsource*` equivalente e importar no CSS** — não
copiar a tag `<link>`. Motivo: o build é publicado no Cloudflare Pages e uma request para outra
origem no primeiro paint atrasa o carregamento e falha em rede ruim.

Instrução para a IA:

> A fonte precisa ser self-hosted via pacote `@fontsource` ou `@fontsource-variable` e importada
> em `src/index.css`. Não use `<link>` para CDN de fonte. Se o pacote correspondente não existir,
> me avise antes de escolher outra fonte.

### 2. A fonte precisa virar token, não classe repetida

O projeto usa Tailwind v4 com tokens em `@theme inline` (`src/index.css`):

```css
--font-sans: 'Geist Variable', sans-serif;
--font-heading: var(--font-sans);
```

Se a HUD nova declara a fonte componente a componente (`font-['Press_Start_2P']` espalhado),
trocar de fonte no futuro exige achar todos os lugares. Instrução:

> Declare a família de fonte apenas nos tokens `--font-sans` (e `--font-heading`, se for uma
> família diferente) dentro do bloco `@theme inline` de `src/index.css`. Nenhum componente deve
> nomear a família diretamente.

### 3. O canvas NÃO herda fonte de CSS

O mundo do jogo (nome/nível do POKE, números de dano, nome do golpe, rótulo da Enfermeira) é
desenhado com a API 2D do canvas em `src/render/sprites.ts`, com a família escrita à mão em 6
lugares:

| Linha | Declaração atual | O que desenha |
|---|---|---|
| 253 | `9px monospace` | nome da espécie + nível |
| 574 | `bold 12px monospace` | número de dano |
| 581 | `bold 13px monospace` / `9px monospace` | "Super efetivo!" / outros rótulos |
| 606 | `bold 8px monospace` | nome do golpe |
| 628 | `bold 11px monospace` | texto de recompensa (`+50 🪙`) |
| 654 | `10px monospace` | rótulo do NPC ("Enfermeira") |

Trocar `--font-sans` **não afeta nada disso**. Instrução:

> O texto desenhado no canvas usa `ctx.font` literal em `src/render/sprites.ts` e não herda CSS.
> Se a fonte da HUD deve valer também para o texto do mundo, edite essas declarações
> explicitamente. Se não deve, deixe as 6 como estão e me confirme que o mundo continua em
> monospace de propósito.

Nota: se a fonte for aplicada no canvas, ela precisa estar **carregada** antes do primeiro frame
(`document.fonts.ready`), senão os primeiros segundos de jogo desenham em fallback e ninguém
entende por que o texto "mudou sozinho".

---

## Dívida já existente que vale corrigir na mesma passada

Dois defeitos reais do sistema tipográfico atual. Se a HUD nova for entrar, é o momento barato de
resolver:

1. **`font-mono` é usado nos 3 elementos mais chamativos do jogo** (splash `LVL UP !`, contagem do
   Campeão Lance, contagem do Auto-Revive) e **`--font-mono` não está definido em lugar nenhum** —
   cai no stack default do Tailwind, ou seja, renderiza Menlo no Mac, Consolas no Windows e
   Liberation Mono no Linux, com pesos e larguras diferentes. Definir `--font-mono` (Geist Mono é o
   par natural, mesmo pacote fontsource) resolve.
2. **`--font-heading` aponta para `var(--font-sans)`** — o token existe mas não distingue nada.
   Ou recebe uma família de display de verdade, ou é removido; hoje ele só dá a impressão de haver
   hierarquia de família onde não há.
