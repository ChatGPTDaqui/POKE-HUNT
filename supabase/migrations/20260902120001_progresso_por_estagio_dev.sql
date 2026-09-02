-- PH-429 (espelho do schema dev): `players.bioma_progress` deixa de ser tres inteiros
-- por FAIXA e passa a ser um inteiro por BIOMA, "maior estagio ja limpo" (0 a
-- 10).
--
-- O QUE MUDA, E POR QUE. O formato antigo era
--
--   {"faixa1": 7, "faixa2": 6, "faixa3": 5}
--
-- e cada numero significava "quantos biomas da ORDEM_DOS_BIOMAS o jogador
-- venceu naquela faixa" — um eixo unico e sequencial, com o bioma seguinte
-- trancado atras do anterior. O redesenho da progressao (02/09/2026) tirou esse
-- eixo: os 12 biomas nascem todos abertos e o progresso e por bioma,
-- independente. O formato novo e
--
--   {"campo_aberto": 9, "subterraneo": 9, ..., "igneo": 0}
--
-- A REGRA DA TRADUCAO, e o motivo de cada numero. A faixa1 cobria Lv 1-30, que
-- no vocabulario novo sao os estagios 1 a 3; a faixa2 cobria Lv 31-60
-- (estagios 4 a 6); a faixa3, Lv 61-90 (estagios 7 a 9). Quem venceu o Lord de
-- um bioma na faixa1 limpou, portanto, tudo ate o estagio 3 daquele bioma.
--
-- O ESTAGIO 10 NAO E CONCEDIDO POR TRADUCAO NENHUMA. Ele cobre Lv 91-100,
-- conteudo que nao existia (o teto era 90). Ninguem pode ter limpado o que nao
-- existia: o jogador nao perde progresso e nao ganha o que nao tinha.
--
-- A ORDEM DOS BIOMAS ESTA CONGELADA AQUI DE PROPOSITO, e nao lida de lugar
-- nenhum. O numero gravado em `faixa1` e um INDICE nessa lista; se ela mudar
-- amanha, a traducao de um save de ontem passaria a apontar pro bioma errado.
-- Save antigo se le com a regra antiga. Ela e a mesma de
-- `src/data/progressoDeBioma.ts#ORDEM_LEGADA_DOS_BIOMAS`, e as duas precisam
-- continuar iguais — um teste do cliente tranca a lista de la.
--
-- IDEMPOTENTE: so toca linha cujo jsonb ainda tem a chave `faixa1`, `faixa2` ou
-- `faixa3`. Rodar duas vezes nao muda nada, porque depois da primeira nenhuma
-- linha tem mais essas chaves.
--
-- Medido antes de escrever, em 02/09: 8 jogadores no `dev`, 1 com progresso
-- diferente de zero, nenhum `current_map_id` no formato antigo e nenhuma sessao
-- viva. A traducao de mapId (que existe no cliente) nao tem nada pra corrigir
-- hoje — ela e defesa, nao conserto.

-- ---------------------------------------------------------------------------
-- 1. O default da coluna passa a ser o formato novo.
-- ---------------------------------------------------------------------------
-- Sem isto, jogador que se cadastrar depois desta migration nasce com
-- `{"faixa1": 0, ...}` e cai no caminho de traducao a cada carga, pra sempre —
-- funciona, mas e um caminho legado exercitado por conta nova, que e o jeito
-- mais rapido de ele nunca poder ser removido.
alter table dev.players
  alter column bioma_progress set default
    '{"campo_aberto": 0, "subterraneo": 0, "marinho": 0, "industrial": 0,
      "mata": 0, "aguas_interiores": 0, "urbano": 0, "gelido": 0,
      "aridos": 0, "sagrado": 0, "sombrio": 0, "igneo": 0}'::jsonb;

-- ---------------------------------------------------------------------------
-- 2. Backfill das linhas que ainda estao no formato antigo.
-- ---------------------------------------------------------------------------
do $$
declare
  -- A ordem CONGELADA. Ver o comentario do cabecalho.
  v_ordem text[] := array[
    'campo_aberto', 'subterraneo', 'marinho', 'industrial',
    'mata', 'aguas_interiores', 'urbano', 'gelido',
    'aridos', 'sagrado', 'sombrio', 'igneo'
  ];
  -- Faixa antiga -> ate que estagio ela vale.
  v_faixas text[] := array['faixa1', 'faixa2', 'faixa3'];
  v_estagios int[] := array[3, 6, 9];
  v_jogador record;
  v_novo jsonb;
  v_quantos int;
  v_ate int;
  v_bioma text;
  v_atual int;
  i int;
  j int;
  v_convertidos int := 0;
begin
  for v_jogador in
    select user_id, bioma_progress
    from dev.players
    -- O filtro E a idempotencia: linha ja convertida nao tem chave de faixa.
    where bioma_progress ?| array['faixa1', 'faixa2', 'faixa3']
  loop
    -- Comeca com os 12 biomas em zero.
    v_novo := '{}'::jsonb;
    foreach v_bioma in array v_ordem loop
      v_novo := v_novo || jsonb_build_object(v_bioma, 0);
    end loop;

    for j in 1 .. array_length(v_faixas, 1) loop
      v_quantos := coalesce((v_jogador.bioma_progress ->> v_faixas[j])::int, 0);
      -- `least`: uma linha real do banco tem `faixa2: 12`, o total de biomas.
      -- Sem o teto, o laco leria fora do array.
      v_ate := least(greatest(v_quantos, 0), array_length(v_ordem, 1));
      for i in 1 .. v_ate loop
        v_bioma := v_ordem[i];
        v_atual := coalesce((v_novo ->> v_bioma)::int, 0);
        -- MAXIMO, e nao atribuicao: as tres faixas se sobrepoem nos primeiros
        -- biomas (quem venceu 5 na faixa3 tambem venceu esses 5 na faixa1), e
        -- as faixas nao vem necessariamente em ordem crescente no dado real —
        -- uma linha tem `faixa1: 11` com `faixa2: 12`.
        v_novo := jsonb_set(
          v_novo, array[v_bioma],
          to_jsonb(greatest(v_atual, v_estagios[j]))
        );
      end loop;
    end loop;

    update dev.players
      set bioma_progress = v_novo
      where user_id = v_jogador.user_id;
    v_convertidos := v_convertidos + 1;
  end loop;

  raise notice 'PH-429 dev: % linha(s) convertida(s) do formato de faixa', v_convertidos;
end $$;
