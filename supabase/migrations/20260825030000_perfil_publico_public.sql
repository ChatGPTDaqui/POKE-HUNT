-- PH-119 -- o perfil que um jogador ve de OUTRO.
--
-- ---------------------------------------------------------------------------
-- POR QUE UMA RPC NOVA, E NAO `meu_perfil` COM PARAMETRO
-- ---------------------------------------------------------------------------
-- `meu_perfil()` nao recebe alvo: ela le `auth.uid()` e devolve o proprio. Dar
-- um parametro a ela transformaria a funcao que serve a TELA DE CONFIGURACAO —
-- onde tambem moram sair da conta e reiniciar o jogo — numa funcao que responde
-- sobre terceiros. Duas responsabilidades diferentes, e a segunda tem um
-- criterio que a primeira nao tem: o que pode ser visto.
--
-- Separadas, a lista de campos publicos fica visivel num lugar so, e acrescentar
-- campo a `meu_perfil` no futuro nao vaza nada por acidente.
--
-- ---------------------------------------------------------------------------
-- O QUE SAI, E POR QUE CADA UM
-- ---------------------------------------------------------------------------
--   nome, nivel, exp   ja sao publicos: `treinadores_publico` alimenta o
--                      ranking, que qualquer um abre.
--   rank, total        derivados da mesma view.
--   segundosJogados    `game_sessions` tem RLS de linha propria, entao ESTE e
--                      o campo que exige `security definer`. E o dado que a
--                      issue nomeia como inofensivo, e ele diz "este vendedor
--                      joga" — que e o que importa pra decidir negociar.
--   contaCriadaEm      idade da conta. Mesmo raciocinio: separa conta nova de
--                      jogador antigo.
--   noHallDaFama       `hall_da_fama` ja e leitura publica.
--   capturas           contagem de `pokemon_instances`, que ja e leitura
--                      publica linha a linha (o ranking de POKE existe). A
--                      contagem nao revela nada que a tabela nao revele.
--   anunciosAtivos     quantos anuncios o jogador tem no Mercado agora. E
--                      informacao do proprio Mercado, ja visivel na listagem.
--
-- FICAM DE FORA, e a lista importa tanto quanto a de cima: `gold`,
-- `diamonds`, mochila, e-mail, id de sessao, qualquer coisa de `player_items`
-- e o conteudo do time. Nada disso e derivavel do que sai acima.
--
-- ---------------------------------------------------------------------------
-- A RPC NAO ACEITA "ME DIGA DE TODO MUNDO"
-- ---------------------------------------------------------------------------
-- Um id por chamada, e nenhuma listagem. Uma versao que aceitasse array viraria
-- um jeito barato de raspar o tempo de jogo da base inteira — e a tela nunca
-- precisa de mais de um.

create or replace function public.perfil_publico(p_user_id uuid)
returns jsonb
language plpgsql security definer set search_path = public, public
as $$
declare
  v_user_id uuid := auth.uid();
  v_nome text;
  v_nivel int;
  v_exp bigint;
  v_rank int;
  v_total int;
  v_segundos numeric;
  v_arquivados numeric;
  v_hall timestamptz;
  v_criado timestamptz;
  v_capturas int;
  v_anuncios int;
begin
  -- Exigir sessao mesmo sendo dado publico: sem isto a funcao vira um endpoint
  -- anonimo de enumeracao de jogadores, e o `grant` abaixo so protege quem
  -- respeita o `grant`.
  if v_user_id is null then raise exception 'nao autenticado' using errcode = '28000'; end if;

  select p.trainer_name, p.trainer_level, p.trainer_exp, p.created_at
    into v_nome, v_nivel, v_exp, v_criado
    from public.players p where p.user_id = p_user_id;

  -- Jogador inexistente devolve NULO em vez de estourar: a tela chega aqui a
  -- partir de um anuncio, e um anuncio de conta apagada e um caso real. Erro
  -- viraria toast vermelho pra uma situacao que so pede "esse treinador nao
  -- existe mais".
  if v_nome is null then
    return jsonb_build_object('existe', false);
  end if;

  select x.rank, x.total into v_rank, v_total from (
    select user_id,
      row_number() over (order by trainer_level desc, trainer_exp desc) as rank,
      count(*) over () as total
    from public.treinadores_publico
  ) x where x.user_id = p_user_id;

  select coalesce(sum(simulated_seconds), 0) into v_segundos
    from public.game_sessions where user_id = p_user_id;
  select segundos into v_arquivados
    from public.tempo_jogado_arquivado where user_id = p_user_id;
  v_segundos := v_segundos + coalesce(v_arquivados, 0);

  select conquistado_em into v_hall from public.hall_da_fama where user_id = p_user_id limit 1;

  select count(*) into v_capturas from public.pokemon_instances where user_id = p_user_id;
  select count(*) into v_anuncios
    from public.market_listings where seller_id = p_user_id and status = 'ativo';

  return jsonb_build_object(
    'existe', true,
    'userId', p_user_id,
    'nome', v_nome,
    'nivel', coalesce(v_nivel, 1),
    'exp', coalesce(v_exp, 0),
    'rank', coalesce(v_rank, 0),
    'totalJogadores', coalesce(v_total, 0),
    'segundosJogados', v_segundos,
    'contaCriadaEm', v_criado,
    'noHallDaFama', v_hall,
    'capturas', coalesce(v_capturas, 0),
    'anunciosAtivos', coalesce(v_anuncios, 0)
  );
end;
$$;

comment on function public.perfil_publico(uuid) is
  'PH-119: o que um jogador pode ver de OUTRO. Nunca carteira, mochila, e-mail ou time.';

revoke all on function public.perfil_publico(uuid) from public;
revoke execute on function public.perfil_publico(uuid) from anon;
grant execute on function public.perfil_publico(uuid) to authenticated;
