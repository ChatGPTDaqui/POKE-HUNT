# Auditoria de desempenho e egress — 23/11/2026

**Concluído.** A auditoria foi somente leitura. A seção "Resultado" registra o que foi aplicado depois e o que foi descartado com evidência.

## Resultado

1. **Fundos (#1180).** Os 95 JPG de hunt e trilha foram recomprimidos com mozjpeg q85 pelo `scripts/otimizar-arte.mjs`, mantendo nome e dimensão: 181 MB → 57 MB.
   - A variante de 1280 px foi **descartada**. Com `escala` de cerca de 0.4 e zoom padrão 2.5, o fundo é desenhado 1:1 em pixel CSS e sem suavização. Com 1280 px ele perde nitidez visivelmente, e o dono preferiu manter 2048.
2. **Folhas de batalha (#1180).** As 10.507 folhas viraram PNG com paleta, aceito só quando todo pixel com alfa > 0 decodifica idêntico: 166 MB → 60 MB.
3. **Cache do site (#1180).** Criado `site/public/_headers`.
4. **JS (#1183).** As tabelas geradas não foram para JSON sob demanda, porque isso tornaria assíncrono um acesso que hoje é síncrono e mexeria na simulação.
   - No lugar disso, um plugin de build (`scripts/dados-gerados-como-json.mts`) troca o literal por `JSON.parse` com valor idêntico, conferido por teste: o processamento cai de 66 para 37 ms em Node.
   - As tabelas também vão para um chunk `dados` (177 KB gzip), que fica em cache entre deploys de código.
5. **Conquistas: descartada.** A premissa estava errada.
   - Só 3 dos tipos de regra de `conquista_valor` leem `player_contador`. Os outros (`abates`, `posse`, `colecao`, `metrica`, `conjunto`, `platina`...) leem `player_pokedex`, `pokemon_instances`, `players`, `pvp_rank` etc., que também mudam no flush. Avaliar só as regras dos contadores alterados deixaria de conceder conquistas.
   - As regras de contador, as únicas que dava para pular com segurança, já são as baratas (busca por índice).
   - O custo é 3,2% do tempo do banco desde 20/08.
6. **Advisors: descartada.** As 24 políticas duplicadas já usam `(select auth.uid())` e `(select is_admin())`, avaliados uma vez por consulta (initplan). Fundi-las não muda o custo de forma mensurável e mexe em segurança. Também ficam como estão:
   - os FKs sem índice (INFO, pouco volume);
   - os índices "não usados" (tráfego baixo demais para concluir).

**Achado extra.** Desde 20/08, 75% do tempo do banco está na leitura de WAL do Realtime (`SELECT wal->>...`, 4,4 milhões de chamadas). Isso era o custo das assinaturas `postgres_changes`, já removidas em 12/10 (`20261012200000_realtime_sem_postgres_changes.sql`). Em 23/11 o contador não subiu durante a medição, e a publicação `supabase_realtime` está vazia. Não há nada a fazer; o número é histórico.

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
