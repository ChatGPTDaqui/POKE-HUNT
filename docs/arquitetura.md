# Arquitetura

| Camada | Papel/fonte |
|---|---|
| src/features, src/components | Telas e HUD React |
| src/stores | Estado do jogo, mundo efêmero e preferências locais |
| src/engine, src/core | Simulação compartilhada e RNG |
| src/render | Canvas imperativo, fora do React |
| authority/src | Sessão de hunt e persistência da simulação |
| supabase/migrations | RPCs, schema e políticas de acesso |
| scripts/usum, src/data/generated | Fonte do catálogo e saída de geração |

## Invariantes

- Simulação não importa valores de stores do navegador. headless é entrada do servidor;
  controller integra ações de UI. build:engine gera #engine para authority.
- Entidades guardam id + lookup; referências a proxies Immer podem ser revogadas.
  Contadores pertencem ao mundo, não a estado global de módulo.
- HP/EXP em combate vêm do worldStore; gameStateStore representa progresso persistido.
  Preferências do dispositivo ficam nas stores locais e não no snapshot do servidor.
- Servidor de sessões e RPCs security definer são mecanismos distintos de escrita legítima.
  RPC não implica substituir sempre o estado completo: confira seu refetch no cliente.
- Assets ficam na raiz. Vite/serve.js servem arte; build publicável a copia para dist.
  Não duplicar em public/assets. Chunks ficam em dist/build.
- React Router seleciona shell; painéis internos usam estado da interface.

Antes de alterar uma camada, consulte o [domínio](README.md).
Justificativas e migração vanilla: [registro datado](arquivo/2026-09-08/docs/01-arquitetura.md).
Nesse registro, escrita exclusiva por service_role e README com cd web são descrições superadas.
