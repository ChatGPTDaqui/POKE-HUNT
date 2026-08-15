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

## Como isto se relaciona com os outros arquivos do repositório

| Arquivo | Versionado | Papel |
|---|---|---|
| `CLAUDE.md` | **não** (`.gitignore:11`) | Histórico cronológico por leva + regras operacionais para agentes. Organizado por *quando* algo foi feito, não por *o que* é. |
| `README.md` | sim | Como rodar. Curto de propósito. |
| `UI-INVENTARIO.md` | sim | Inventário de superfícies de UI, tirado num momento específico. |
| `SPEC-supabase-migration.md` | sim | Especificação da migração para Supabase, histórica. |
| `docs/` (esta pasta) | sim | Arquitetura e regras de negócio, por assunto. |

### `CLAUDE.md` não está no git — e isso é o argumento mais forte para esta pasta existir

`.gitignore:11` o exclui. São **3.982 linhas** com o registro mais denso de decisão do projeto
— incluindo medições que custaram sessões inteiras de investigação — e elas existem **só nesta
máquina**. Um `git clone` traz o código e não traz nenhum desse contexto.

Isso reenquadra a duplicação entre os dois:

- **Não é ruído para colaborador**: ele nunca vê os dois, só este.
- **É risco de perda total**: nada versionado guarda o *porquê* das decisões. Esta pasta é a
  primeira vez que ele entra no repositório.

**A resolução proposta** — não executada, porque é decisão de quem mantém o projeto —
é `CLAUDE.md` ficar com o que é genuinamente específico de agente (gotchas de ambiente,
comandos, disciplina de teste, o diário por leva) e delegar a descrição de sistema para cá,
com links. Enquanto isso não acontecer, **quando as duas divergirem, o código decide, e depois
esta pasta** — que foi escrita lendo o código.
