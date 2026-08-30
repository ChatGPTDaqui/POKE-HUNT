-- PH-120, fatia 1: a SESSAO de troca direta entre dois jogadores.
--
-- O QUE ESTA FATIA ENTREGA, E O QUE ELA DELIBERADAMENTE NAO ENTREGA
-- ---------------------------------------------------------------------------
-- Entrega: a mesa. Duas pessoas, uma sessao, quem convidou e quem foi
-- convidado, o estado dela, e as RPCs de abrir, aceitar, recusar, cancelar e
-- expirar.
--
-- NAO entrega: o que vai EM CIMA da mesa (fatia 2 — oferta versionada e reserva
-- do que esta nela), a execucao atomica da troca (fatia 3) nem a tela (fatia 4).
-- O fatiamento e o que a propria issue sugere, e a razao e concreta: a mesa
-- sozinha ja tem duas armadilhas de concorrencia (sessao dupla e expiracao), e
-- misturar isso com a transacao de troca faria uma PR que ninguem revisa de
-- verdade.
--
-- Nada aqui move POKE ou item. A tabela de oferta nasce vazia na fatia 2.
--
-- POR QUE O MERCADO NAO COBRE ISTO
-- ---------------------------------------------------------------------------
-- O Mercado troca POKE por OURO, com escrow. Troca POKE por POKE nao existe — e
-- e nela que o golpe mora: sem sessao, o combinado por chat vira "manda primeiro
-- que eu mando depois", e quem manda primeiro perde.
--
-- AS TRES ARMADILHAS QUE ESTA MIGRATION JA FECHA
-- ---------------------------------------------------------------------------
--  1. SESSAO DUPLA. O `CLAUDE.md` e explicito: indice UNIQUE tem de ser PARCIAL
--     no banco, porque validacao de cliente nao impede duplo-clique. Sao dois
--     indices parciais aqui, um por papel, porque a mesa tem dois lados e o
--     mesmo jogador nao pode estar em duas mesas nem como anfitriao nem como
--     convidado.
--  2. EXPIRACAO NO SERVIDOR. Sessao aberta pra sempre e, a partir da fatia 2,
--     POKE reservado pra sempre. `expira_em` nasce junto com a linha e o pg_cron
--     abaixo fecha o que passou — o mesmo desenho de `fechar_sessoes_inativas`
--     (PH-277), inclusive no ponto de nao confiar so no caminho de acesso.
--  3. `IF FOUND`, NAO `record IS NOT NULL`. Em PL/pgSQL um record com qualquer
--     campo nulo compara falso — foi o que quebrou o escrow do leilao. Todo
--     teste de existencia aqui usa `found`.
--
-- CONVIDAR NAO E AMIZADE, E ISSO E DE PROPOSITO. Exigir amizade fecharia a troca
-- pra quem combinou pelo chat do mundo, que e onde ela costuma ser combinada. O
-- que protege nao e a lista de amigos, e a confirmacao dupla da fatia 3.
--
-- BLOQUEIO, SIM: se um bloqueou o outro, nao ha mesa. A tabela ja existe
-- (`mail_blocks`), e ignorar isso deixaria o bloqueio valendo so no Correio.

-- ---------------------------------------------------------------------------
-- 1. A mesa
-- ---------------------------------------------------------------------------
-- `estado` como texto com CHECK, e nao enum: enum novo exige `alter type` em
-- migration propria pra cada valor futuro, e esta maquina nao consegue rodar
-- `db push` (o classificador barra) — cada ida ao banco custa um ciclo inteiro
-- de CI. O CHECK entrega a mesma garantia e muda com um `alter table`.
create table if not exists public.troca_sessao (
  id uuid primary key default gen_random_uuid(),
  -- Quem convidou e quem foi convidado. A distincao NAO e cosmetica: so o
  -- anfitriao pode cancelar antes do aceite, e so o convidado pode aceitar.
  anfitriao_id uuid not null references public.players(user_id) on delete cascade,
  convidado_id uuid not null references public.players(user_id) on delete cascade,
  estado text not null default 'convidada'
    check (estado in ('convidada', 'aberta', 'concluida', 'cancelada', 'expirada')),
  criada_em timestamptz not null default now(),
  atualizada_em timestamptz not null default now(),
  -- Prazo de vida. Ver `TROCA_MINUTOS_ATE_EXPIRAR` do lado do TypeScript — os
  -- dois numeros precisam concordar, e ha teste comparando.
  expira_em timestamptz not null default now() + interval '15 minutes',
  -- Por que a sessao terminou, pra reclamacao depois ter o que auditar. Nulo
  -- enquanto ela esta viva.
  encerrada_por uuid references public.players(user_id) on delete set null,
  encerrada_em timestamptz,
  -- Ninguem troca consigo mesmo. Barrar aqui e mais barato que barrar em cada
  -- RPC, e nao ha caminho que escape.
  constraint troca_sessao_lados_distintos check (anfitriao_id <> convidado_id)
);

comment on table public.troca_sessao is
  'PH-120: mesa de troca direta entre dois jogadores. A oferta vive em troca_oferta (fatia 2).';

-- OS DOIS INDICES QUE IMPEDEM A SESSAO DUPLA.
--
-- Parciais, e por isso funcionam: a condicao e "so entre as VIVAS". Sessao
-- concluida, cancelada ou expirada nao ocupa lugar nenhum — sem o `where`, o
-- jogador ficaria impedido de trocar de novo pra sempre depois da primeira vez.
--
-- Dois indices e nao um porque o mesmo jogador pode aparecer em qualquer um dos
-- dois papeis, e um indice sobre uma coluna so nao alcanca a outra.
create unique index if not exists troca_sessao_anfitriao_viva
  on public.troca_sessao (anfitriao_id)
  where estado in ('convidada', 'aberta');

create unique index if not exists troca_sessao_convidado_viva
  on public.troca_sessao (convidado_id)
  where estado in ('convidada', 'aberta');

-- Varredura da expiracao (a funcao abaixo) e a leitura "tenho mesa aberta?".
create index if not exists troca_sessao_vivas_por_prazo
  on public.troca_sessao (expira_em)
  where estado in ('convidada', 'aberta');

alter table public.troca_sessao enable row level security;

-- Le quem esta na mesa, e mais ninguem. Sem policy de INSERT/UPDATE de
-- proposito: toda escrita passa pelas RPCs `security definer` abaixo, que sao o
-- unico lugar onde as regras (bloqueio, sessao dupla, papel) sao aplicadas.
-- Um grant de escrita aqui abriria uma rota paralela sem nenhuma delas.
drop policy if exists "troca leitura dos participantes" on public.troca_sessao;
create policy "troca leitura dos participantes" on public.troca_sessao
  for select to authenticated
  using (anfitriao_id = auth.uid() or convidado_id = auth.uid());

grant select on public.troca_sessao to authenticated;
grant select, insert, update on public.troca_sessao to service_role;

-- ---------------------------------------------------------------------------
-- 2. Abrir a mesa
-- ---------------------------------------------------------------------------
create or replace function public.abrir_troca(p_convidado_id uuid)
returns public.troca_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_sessao public.troca_sessao;
begin
  if v_eu is null then
    raise exception 'sem sessao autenticada';
  end if;
  if p_convidado_id is null or p_convidado_id = v_eu then
    raise exception 'Voce nao pode trocar com voce mesmo.';
  end if;

  perform 1 from public.players where user_id = p_convidado_id;
  if not found then
    raise exception 'Jogador nao encontrado.';
  end if;

  -- BLOQUEIO VALE NOS DOIS SENTIDOS, e a funcao que ja existe (PH-81) e quem
  -- sabe disso — repetir a consulta aqui criaria uma segunda definicao de
  -- "bloqueado" pra divergir da do Correio no primeiro ajuste.
  --
  -- Os dois sentidos importam: so checar "ele me bloqueou" deixaria quem
  -- bloqueou abrir mesa com o bloqueado, que e assedio com um passo a mais.
  if public.bloqueio_entre(v_eu, p_convidado_id) then
    raise exception 'Nao e possivel trocar com este jogador.';
  end if;

  -- Fecha o que ja venceu ANTES de tentar inserir: sem isto uma sessao expirada
  -- e nao varrida ainda ocupa o indice parcial, e o jogador leria "voce ja esta
  -- numa troca" sobre uma mesa que nao existe mais.
  perform public.expirar_trocas();

  -- A mensagem vem do estado JA lido, e nao do erro do indice: `unique_violation`
  -- nao diz QUEM esta ocupado, e a diferenca entre "voce ja esta" e "ele ja
  -- esta" e a unica coisa acionavel pro jogador.
  perform 1 from public.troca_sessao
   where estado in ('convidada', 'aberta')
     and (anfitriao_id = v_eu or convidado_id = v_eu);
  if found then
    raise exception 'Voce ja esta numa troca. Termine ou cancele antes de abrir outra.';
  end if;

  perform 1 from public.troca_sessao
   where estado in ('convidada', 'aberta')
     and (anfitriao_id = p_convidado_id or convidado_id = p_convidado_id);
  if found then
    raise exception 'Este jogador ja esta em outra troca.';
  end if;

  -- O INSERT continua sendo a autoridade. A leitura acima e pela mensagem; sem
  -- este indice, duas chamadas no mesmo milissegundo passariam as duas.
  insert into public.troca_sessao (anfitriao_id, convidado_id)
  values (v_eu, p_convidado_id)
  returning * into v_sessao;

  return v_sessao;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 3. Aceitar, recusar, cancelar
-- ---------------------------------------------------------------------------
-- Uma funcao por acao, e nao uma `mudar_estado(novo)`: cada uma tem um dono
-- diferente (so o convidado aceita; so quem esta na mesa cancela) e uma
-- transicao valida diferente. Uma funcao generica empurraria essa distincao pro
-- chamador, que e o cliente — exatamente onde ela nao pode viver.
create or replace function public.aceitar_troca(p_sessao_id uuid)
returns public.troca_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_sessao public.troca_sessao;
begin
  if v_eu is null then
    raise exception 'sem sessao autenticada';
  end if;

  -- `for update` porque duas chamadas simultaneas (duplo-clique, aba dupla)
  -- leriam as duas o estado 'convidada' e as duas escreveriam 'aberta'.
  select * into v_sessao from public.troca_sessao
   where id = p_sessao_id for update;
  if not found then
    raise exception 'Troca nao encontrada.';
  end if;
  if v_sessao.convidado_id <> v_eu then
    raise exception 'So quem foi convidado pode aceitar.';
  end if;
  if v_sessao.estado <> 'convidada' then
    raise exception 'Esta troca nao esta esperando aceite.';
  end if;
  if v_sessao.expira_em <= now() then
    -- Nao aceita e ja marca: deixar 'convidada' faria a proxima tentativa
    -- repetir a mesma corrida.
    update public.troca_sessao
       set estado = 'expirada', encerrada_em = now(), atualizada_em = now()
     where id = p_sessao_id;
    raise exception 'Esta troca expirou.';
  end if;

  -- O PRAZO REINICIA NO ACEITE. O primeiro prazo cobre o convite parado; a
  -- partir daqui as duas pessoas estao na mesa montando oferta, e herdar o
  -- restinho do convite daria dois minutos pra fazer a troca inteira.
  update public.troca_sessao
     set estado = 'aberta',
         atualizada_em = now(),
         expira_em = now() + interval '15 minutes'
   where id = p_sessao_id
  returning * into v_sessao;

  return v_sessao;
end;
$function$;

create or replace function public.encerrar_troca(p_sessao_id uuid, p_motivo text default 'cancelada')
returns public.troca_sessao
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_eu uuid := auth.uid();
  v_sessao public.troca_sessao;
begin
  if v_eu is null then
    raise exception 'sem sessao autenticada';
  end if;
  if p_motivo not in ('cancelada') then
    -- 'concluida' e da fatia 3 e nunca vem do cliente; 'expirada' e do cron.
    raise exception 'motivo invalido';
  end if;

  select * into v_sessao from public.troca_sessao
   where id = p_sessao_id for update;
  if not found then
    raise exception 'Troca nao encontrada.';
  end if;
  if v_sessao.anfitriao_id <> v_eu and v_sessao.convidado_id <> v_eu then
    raise exception 'Voce nao esta nesta troca.';
  end if;

  -- Encerrar o que ja acabou e no-op, e nao erro: duplo-clique no botao de
  -- cancelar nao pode virar mensagem vermelha.
  if v_sessao.estado not in ('convidada', 'aberta') then
    return v_sessao;
  end if;

  -- QUALQUER UM DOS DOIS CANCELA, a qualquer momento, ate a fatia 3 executar.
  -- E o oposto do golpe: quem desconfia sai da mesa sem depender do outro.
  update public.troca_sessao
     set estado = p_motivo,
         encerrada_por = v_eu,
         encerrada_em = now(),
         atualizada_em = now()
   where id = p_sessao_id
  returning * into v_sessao;

  return v_sessao;
end;
$function$;

-- ---------------------------------------------------------------------------
-- 4. Expiracao
-- ---------------------------------------------------------------------------
-- DOIS CAMINHOS, pelo mesmo motivo da PH-277: o `abrir_troca` limpa o que
-- atrapalha QUEM VOLTA, e o cron limpa o que ninguem mais vai olhar. So o
-- primeiro deixaria mesa vencida ocupando o indice de quem nunca mais abrir o
-- jogo — e, da fatia 2 em diante, POKE reservado junto.
create or replace function public.expirar_trocas()
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_quantas integer;
begin
  update public.troca_sessao
     set estado = 'expirada', encerrada_em = now(), atualizada_em = now()
   where estado in ('convidada', 'aberta')
     and expira_em <= now();
  get diagnostics v_quantas = row_count;
  return v_quantas;
end;
$function$;

grant execute on function public.abrir_troca(uuid) to authenticated;
grant execute on function public.aceitar_troca(uuid) to authenticated;
grant execute on function public.encerrar_troca(uuid, text) to authenticated;
-- `expirar_trocas` NAO e concedida a `authenticated`: ela e varredura global, e
-- um cliente que a chamasse em loop varreria a tabela inteira a cada clique.
-- `abrir_troca` a chama por dentro, que e o unico caminho de cliente que precisa
-- dela.
grant execute on function public.expirar_trocas() to service_role;

-- pg_cron: de 5 em 5 minutos. Nao precisa ser mais fino — `abrir_troca` ja
-- resolve na hora o caso que atrapalha alguem de verdade, e o cron so limpa o
-- resto. Minuto 2 pra nao cair junto do `sessoes-inativas-fechar` (minuto 29).
select cron.unschedule('trocas-expirar') where exists (
  select 1 from cron.job where jobname = 'trocas-expirar'
);
select cron.schedule('trocas-expirar', '2-59/5 * * * *', $cron$select public.expirar_trocas();$cron$);
