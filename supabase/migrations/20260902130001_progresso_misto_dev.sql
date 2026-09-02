-- PH-440 (espelho do schema dev): conserta a linha MISTA — a que tem chave de bioma E
-- chave de faixa ao mesmo tempo — sem perder o progresso de bioma.
--
-- O ESTADO QUE A PH-429 NAO PREVIU. A migration dela (20260902120000) supunha
-- que uma linha estivesse OU no formato de faixa OU no de bioma, e por isso
-- recalculava `bioma_progress` do zero a partir das faixas. Ela esta certa pro
-- que existia quando rodou; o que ela nao previu foi o que aconteceu DEPOIS.
--
-- Como a linha mista nasce, medido no banco em 02/09, poucas horas depois do
-- deploy: a migration converteu as linhas do schema; em seguida o CLIENTE
-- AINDA PUBLICADO EM PRODUCAO (bundle antigo) carregou, fez o merge que o
-- codigo antigo fazia
--
--   { ...defaults.biomaProgress, ...doBanco }   com defaults = {faixa1: 0, faixa2: 0, faixa3: 0}
--
-- e regravou no flush. Resultado: as chaves de faixa ZERADAS ao lado das
-- chaves de bioma corretas. Duas linhas de `public` ficaram assim (o `dev` nao
-- tinha nenhuma no momento da medicao), uma delas com os 12 biomas fechados.
--
-- POR QUE ISSO E URGENTE. A migration da PH-429 volta a casar com essas linhas
-- (o filtro procura chave de faixa) e, numa reexecucao, sobrescreveria
-- `mata: 9` com o zero derivado de `faixa1: 0`. Ela deixou de ser idempotente
-- no momento em que o estado misto passou a existir. O leitor do cliente tinha
-- o mesmo defeito, e e o pior dos dois: ele roda a cada carga.
--
-- O CONSERTO, nos dois lados: partir do que ja esta em formato de bioma e
-- aplicar a traducao das faixas POR CIMA, pelo MAXIMO. Correto nos tres casos —
-- so-novo (nao ha faixa a aplicar), so-legado (nao ha bioma de onde partir) e
-- misto (o maior vence, que e o que preserva o progresso).
--
-- IDEMPOTENTE: o filtro continua sendo a presenca de chave de faixa, e ao fim
-- desta migration nenhuma linha tem mais nenhuma. Rodar de novo nao acha nada.
-- Rodar sobre linha ja limpa tambem seria seguro: o passo 1 copiaria os biomas
-- e o passo 2 nao teria faixa pra aplicar.
--
-- A TABELA DE TRADUCAO E A MESMA DA PH-429 e a mesma do TypeScript
-- (`src/data/progressoDeBioma.ts`): ordem congelada dos 12 biomas, faixa1 -> 3,
-- faixa2 -> 6, faixa3 -> 9, e o estagio 10 nunca concedido. Um teste do cliente
-- (`traducaoDoProgressoBateNoSql.test.ts`) tranca as duas listas juntas.

do $$
declare
  -- A ordem CONGELADA, identica a da PH-429 e a do TypeScript.
  v_ordem text[] := array[
    'campo_aberto', 'subterraneo', 'marinho', 'industrial',
    'mata', 'aguas_interiores', 'urbano', 'gelido',
    'aridos', 'sagrado', 'sombrio', 'igneo'
  ];
  v_faixas text[] := array['faixa1', 'faixa2', 'faixa3'];
  v_estagios int[] := array[3, 6, 9];
  v_jogador record;
  v_novo jsonb;
  v_quantos int;
  v_ate int;
  v_bioma text;
  v_atual int;
  v_doBanco int;
  i int;
  j int;
  v_corrigidos int := 0;
begin
  for v_jogador in
    select user_id, bioma_progress
    from dev.players
    where bioma_progress ?| array['faixa1', 'faixa2', 'faixa3']
  loop
    v_novo := '{}'::jsonb;

    -- PASSO 1: preserva o que JA esta em formato de bioma. E a linha que
    -- faltava na PH-429 — sem ela o progresso de quem tem os dois formatos
    -- juntos vai a zero.
    foreach v_bioma in array v_ordem loop
      v_doBanco := coalesce((v_jogador.bioma_progress ->> v_bioma)::int, 0);
      -- Apara pra regua: valor fora de 0..10 gravado por engano liberaria
      -- conteudo que nao existe.
      v_doBanco := least(greatest(v_doBanco, 0), 10);
      v_novo := v_novo || jsonb_build_object(v_bioma, v_doBanco);
    end loop;

    -- PASSO 2: aplica a traducao das faixas POR CIMA, pelo maximo.
    for j in 1 .. array_length(v_faixas, 1) loop
      v_quantos := coalesce((v_jogador.bioma_progress ->> v_faixas[j])::int, 0);
      v_ate := least(greatest(v_quantos, 0), array_length(v_ordem, 1));
      for i in 1 .. v_ate loop
        v_bioma := v_ordem[i];
        v_atual := coalesce((v_novo ->> v_bioma)::int, 0);
        v_novo := jsonb_set(
          v_novo, array[v_bioma],
          to_jsonb(greatest(v_atual, v_estagios[j]))
        );
      end loop;
    end loop;

    update dev.players
      set bioma_progress = v_novo
      where user_id = v_jogador.user_id;
    v_corrigidos := v_corrigidos + 1;
  end loop;

  raise notice 'PH-440 dev: % linha(s) mista(s) corrigida(s)', v_corrigidos;
end $$;
