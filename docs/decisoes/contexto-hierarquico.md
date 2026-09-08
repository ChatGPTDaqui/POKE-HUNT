# Contexto por tarefa — PH-515

Estado: vigente, migração aprovada em 08/09/2026. Base: 016f1240.

## Decisão

Contrato mínimo → índice por tarefa → domínio/procedimento → trecho histórico quando necessário.
AGENTS.md é comum; CLAUDE.md apenas encaminha. Procedimento não é carregado para simples
consulta. Documentos antigos permanecem como snapshots datados e com links compatíveis.
Domínios curtos preservam cuidados de alto impacto e roteiam perguntas às seções detalhadas;
essas seções precisam de confirmação no código quando descrevem estado mutável.
Não reduzimos binários nem reescrevemos Git: isso não reduz automaticamente contexto.

## Preservação das regras

| Origem | Destino vigente |
|---|---|
| CLAUDE: stack/camadas/assets | AGENTS, arquitetura, README |
| CLAUDE: build engine | verificação, arquitetura |
| CLAUDE: env e banco | banco, ambiente-local |
| CLAUDE: limites, PostgREST, hydrate, entregas, sessão única | autoridade e banco |
| CLAUDE: três bosses/entradas de geração | mundo-hunts, decisões |
| PROCESSO: Jira, worktree, commits e integração | PROCESSO |
| PROCESSO: matriz e isolamento | verificação |
| PROCESSO: DDL/DML, pares, tipos, compatibilidade, wipe | banco |
| PROCESSO: staging, patch notes, promoção, bancadas e status | publicação |
| PROMPT: tipografia congelada | preservacao-visual, sob demanda |

## Verificação e medição

Baseline de caracteres normalizados LF (sem presumir tokens faturados):
- AGENTS.md: 283
- CLAUDE.md: 4558
- docs/PROCESSO.md: 6310
- docs/README.md: 6569

Rodar node scripts/docs/verificar-contexto.mjs: verificar orçamento, links/âncoras atuais,
integridade do conteúdo histórico contra Git base (permitidos apenas aviso e links rebaseados) e cenários de roteamento. Snapshots apontam referências antigas para o commit original; não são documentação operacional.
Meta: AGENTS ≤ 2500, índice ≤ 2000 caracteres. Percurso de consulta = ambos + ponte CLAUDE.
Comparar também implementação, authority, schema e publicação: economia nunca dispensa gates.
Aceite inclui revisão humana/agente do conteúdo: contagem e links não provam qualidade semântica.

## Migração e reversão

1. Preservar base e mapear regras (tabela acima).
2. Corrigir fontes conflitantes nas páginas vigentes e arquivar texto original.
3. Introduzir roteamento e procedimentos especializados.
4. Encurtar índices pessoais com snapshot local separado.
5. Conferir links, regras e cenários; integrar por PR/CI.
6. Reverter a PR se a recuperação perder precisão; backups pessoais são restaurados separadamente.

Limites: sem auditoria funcional integral do jogo ou revalidação de cada medição histórica.
Visibilidade pública confirmada no GitHub; revisão de exposição tem escopo próprio.
Nenhum comando de aplicação, asset, migration, proteção ou workflow foi alterado.
