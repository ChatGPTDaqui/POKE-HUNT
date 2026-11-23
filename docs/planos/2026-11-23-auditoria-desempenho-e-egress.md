# Auditoria de desempenho e egress — 23/11/2026

A auditoria foi somente leitura. A seção "Feito" registra o que foi aplicado depois.

## Feito (PR perf/arte-mais-leve)

- Prioridade 1, em parte: os 95 fundos JPG (hunt e trilha) foram recomprimidos com mozjpeg q85 pelo `scripts/otimizar-arte.mjs`, com mesmo nome e dimensão, passando de 181 MB para 57 MB. A variante de 1280 px ficou para depois porque exige mudança no renderizador.
- Prioridade 2: as folhas de `battle-sprites` foram para PNG com paleta só quando o RGBA decodificado ficou idêntico ao original. É sem perda.
- Prioridade 3: criado `site/public/_headers`.
- As prioridades 4 a 6 não foram aplicadas. Elas mexem na simulação, nas conquistas ou no RLS, e o ganho é pequeno perante o tráfego atual.

## Conclusão

O Supabase já gasta pouco egress. Nas últimas 24 h, as respostas da Edge Function `jogo` somaram cerca de 1 MB, e o navegador fez poucas dezenas de chamadas REST diretas. O flush adaptativo (30 a 90 s) e o tempo real por broadcast, em vez de `postgres_changes`, já cortaram o que costuma pesar.

O que deixa o jogo pesado está na **arte e no JavaScript servidos pelo Cloudflare Pages**. O Pages não cobra tráfego, então esse ganho é velocidade para o jogador, não custo.

## Medições

| Item | Hoje |
|---|---|
| Fundo de hunt (`assets/hunt-backgrounds`, 83 JPG de 2048²) | média de 1,8 MB, máximo de 4,7 MB por hunt |
| Fundo da trilha de estágios (`assets/biome-selector`, 12 JPG) | 2,8 a 4,0 MB cada (`urlDoFundoDoBioma`) |
| Animações de batalha (`assets/battle-sprites`, 10.507 PNG) | até 140 KB por folha |
| JS para entrar no jogo (`index`, `autoridade`, `GameShell`, `gameStatePersistence`) | 4,4 MB sem compressão (cerca de 1,2 MB em br) |
| Tela inicial do jogo | cerca de 350 KB (210 KB de JS em br) |
| Site, página inicial | 1,5 MB (24 imagens com lazy) |
| Arte do site (`/art/*`, `/_astro/*`) | `max-age=0`: revalida a cada visita |
| Edge `jogo`, p50 | `fechar` cerca de 1 s, `estado` 560 ms, `abrir` 375 ms, `saude` 413 ms (sem banco: é a rede até us-east-1) |
| `registrar_conquistas_do_flush` | 84 ms de média por flush, a consulta de maior tempo total do banco |

Testes de recompressão (sharp):

| Arquivo | Original | JPG q82 | WebP 2048 | WebP 1280 |
|---|---|---|---|---|
| jungle | 4.632 KB | 1.071 KB | 1.054 KB | 458 KB |
| plains | 3.559 KB | 720 KB | 618 KB | 284 KB |
| forest | 3.695 KB | 832 KB | 805 KB | 337 KB |

Folhas de batalha com paleta de 256 cores: rayquaza QuickStrike foi de 137 para 37 KB, e gyarados Swing Shiny de 134 para 55 KB.

## Prioridades

1. **Fundos de hunt e da trilha.** Recomprimir de 4 a 5 vezes, gerar uma variante de 1280 px para telas pequenas e escolher o tamanho por `devicePixelRatio × largura`. Cada imagem de 2048² também ocupa cerca de 16 MB de memória de vídeo no celular. É o maior ganho na entrada da hunt. Requer comparação visual antes e depois.
2. **Folhas de `battle-sprites` com paleta.** Redução de 60 a 70%. Requer conferência visual: é pixel art, e a paleta costuma ser sem perda visível.
3. **Cache do site.** Criar `site/public/_headers` com `/_astro/*` imutável e `/art/*` com 1 dia mais `stale-while-revalidate`. É uma mudança pequena.
4. **Peso do JS ao entrar no jogo.** As tabelas geradas grandes (`pokes`, `spriteTopOffsets`, `elencoPorEstagio`, `subBiomaCollision`, cerca de 1,2 MB de fonte) ficam dentro dos chunks. Passá-las para JSON carregado sob demanda reduz o tempo de parse no celular. Exige medir antes e depois, e mexe na simulação.
5. **Conquistas por flush.** `avaliar_conquistas` percorre todo o catálogo ainda não obtido a cada flush. Avaliar só as regras cujos contadores mudaram em `p_contadores` reduz a CPU do banco (instância nano). Precisa de migration.
6. **Advisors do Supabase.**
   - Juntar as 24 políticas SELECT permissivas duplicadas (o par "admin reads all" com a do próprio jogador) numa só, com `or`.
   - Os 48 FKs sem índice são INFO e têm pouco volume.
   - Não apagar os índices "não usados": o tráfego é baixo demais para concluir.

Fora do escopo do jogador: arquivos sem referência no `dist`, como `masks/water-collision-mask.png` (11 MB, já convertido em `aguaMask.generated.ts`), `treinadores/originais` e PNGs soltos na raiz de `assets/`. Eles só aumentam o deploy e a contagem perto do limite de 20.000 arquivos.
