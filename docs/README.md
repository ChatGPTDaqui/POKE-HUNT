# Documentação do NOVO POKE IDLE

Decisões de arquitetura e regras de negócio do jogo. Documentação de **desenvolvedor** —
não é conteúdo do jogo nem material para o jogador (esse canal é a Wiki in-game,
`src/features/wiki/WikiMenu.tsx`).

## A regra que faz esta pasta valer alguma coisa

**O código é a verdade. Esta pasta explica o porquê.**

Nenhum documento aqui repete um número que o código já declara sem dizer de onde ele sai.
Toda constante citada vem com o arquivo e o símbolo (`economySystem.ts#STONE_DROP_CHANCE`),
para que quem lê possa conferir em um comando em vez de confiar.

Isso não é formalidade. Ao escrever esta pasta, `CLAUDE.md` foi conferido contra o código e
**cinco constantes estavam erradas** — ver [13-divergencias-conhecidas.md](13-divergencias-conhecidas.md).
Um documento que afirma "o ouro é multiplicado por 4" enquanto o código multiplica por 1 é pior
que documento nenhum, porque alguém decide balanceamento em cima dele.

Consequência prática de manutenção: **ao mudar uma constante de balanceamento, não venha
atualizar o número aqui.** Cite o símbolo. Se um documento aqui só se mantém correto porque
alguém lembrou de editá-lo, ele vai apodrecer — é o que já aconteceu.

## Esta pasta não é publicada

`docs/` fica fora do build (`vite build` só empacota `src/`) e o repositório é privado.
Isso é o que permite documentar, sem filtro, os limiares anti-abuso do servidor
(claim de flush, amostra mínima do piso, janelas de corrida) em
[04-autoridade-do-servidor.md](04-autoridade-do-servidor.md) e
[07-farm-offline.md](07-farm-offline.md).

**Se o repositório virar público, esses dois arquivos viram um mapa de ataque.** Não é
teoria: a caça a bugs da leva 5.6 achou dois exploits críticos reais explorando exatamente
esses pontos. Tornar o repositório público exige, antes, decidir o que sai daqui.

## Índice

| Documento | O que responde |
|---|---|
| [01-arquitetura.md](01-arquitetura.md) | Que camadas existem, o que roda onde, e por quê |
| [02-dados-e-catalogo.md](02-dados-e-catalogo.md) | De onde vem o conteúdo do jogo e como ele é provado |
| [03-motor-de-simulacao.md](03-motor-de-simulacao.md) | Combate, movimento, determinismo, execução headless |
| [04-autoridade-do-servidor.md](04-autoridade-do-servidor.md) | Quem pode escrever progresso e como isso é garantido |
| [05-regras-de-negocio.md](05-regras-de-negocio.md) | Economia, progressão, captura, raridade, itens |
| [06-mundo-hunts-e-spawn.md](06-mundo-hunts-e-spawn.md) | Como uma hunt é composta e quem aparece nela |
| [07-farm-offline.md](07-farm-offline.md) | O que acontece com o jogador ausente |
| [08-social-e-mercado.md](08-social-e-mercado.md) | Negociação entre jogadores, chat, correio, amizades |
| [09-interface.md](09-interface.md) | Escala fluida, breakpoints, janelas, tokens |
| [10-invariantes-e-testes.md](10-invariantes-e-testes.md) | O que cada teste tranca e que bug ele impede |
| [11-operacao.md](11-operacao.md) | Comandos, deploy, banco, wipe |
| [12-decisoes-descartadas.md](12-decisoes-descartadas.md) | O que foi tentado, medido e rejeitado |
| [13-divergencias-conhecidas.md](13-divergencias-conhecidas.md) | Onde a documentação existente mente hoje |
| [14-habilidades.md](14-habilidades.md) | Habilidade, Natureza e Característica: o que vale, o que não vale e por quê |
| [15-coordenacao-supabase.md](15-coordenacao-supabase.md) | Como o time evita pisar um no outro no Supabase e no `CLAUDE.md` |
| [17-geracao-iii-preparada.md](17-geracao-iii-preparada.md) | As 135 espécies de Hoenn prontas na base, e o que ligá-las exige — em ordem |

## Como isto se relaciona com os outros arquivos do repositório

| Arquivo | Versionado | Papel |
|---|---|---|
| `CLAUDE.md` | **não** (`.gitignore:17`) | Regra operacional de agente: layout do repo, comandos, gotchas, disciplina de teste, fora-de-escopo. Carregado em toda sessão — por isso é curto. |
| `HISTORICO.md` | sim | Diário cronológico por leva. Organizado por *quando* algo foi feito. **Não** é auto-carregado; consultado por `grep`. |
| `README.md` | sim | Como rodar. Curto de propósito. |
| `UI-INVENTARIO.md` | sim | Inventário de superfícies de UI, tirado num momento específico. |
| `SPEC-supabase-migration.md` | sim | Especificação da migração para Supabase, histórica. |
| `docs/` (esta pasta) | sim | Arquitetura e regras de negócio, por assunto. |

### A duplicação entre `CLAUDE.md` e esta pasta foi resolvida em 2026-08-17

Até essa data `CLAUDE.md` eram **4.594 linhas** (≈80k tokens carregados em *toda* sessão)
misturando três coisas: diário por leva, descrição de sistema — duplicando esta pasta — e regra
operacional. Metade descrevia código já cortado do repositório: 67 referências a `js/` (jogo
vanilla), 14 a `web/src` (o app é a raiz desde `70d5561`; `web/` é diretório vazio) e ~23 a
arquivos de servidor deletados na migração RPC-everything (`app.ts`, `acoes.ts`, `mercado.ts`,
`social.ts`, `ranking.ts`, `reiniciar.ts`, `node.ts`).

Aplicada a resolução que esta seção propunha:

- **Regra operacional** ficou em `CLAUDE.md` (~330 linhas), com links para cá.
- **Diário** foi para `HISTORICO.md`, cópia byte-a-byte conferida por `diff`, com um cabeçalho
  novo mapeando cada caminho morto para a realidade atual.
- **Descrição de sistema** é responsabilidade só desta pasta.

Ordem de autoridade quando divergirem: **o código, depois esta pasta, depois `HISTORICO.md`** —
o histórico descreve o código como ele era em cada rodada, não como está.

### Por que o diário entrou no git

Ele era o registro mais denso de decisão do projeto — incluindo medições que custaram sessões
inteiras — e existia **só numa máquina**. Um `git clone` trazia o código e nenhum desse contexto.
Decidido que o risco de perda total pesava mais que o de exposição.

**Consequência:** `HISTORICO.md` entra na mesma advertência que este arquivo já faz sobre
[04](04-autoridade-do-servidor.md) e [07](07-farm-offline.md) — ele documenta sem filtro os
limiares anti-abuso do servidor. Se o repositório virar público, são **três** arquivos a revisar
antes, não dois.
