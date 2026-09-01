-- PH-334: `sala_protetor` guardava uma linha por sessao fechada e nunca limpava.
--
-- O SINTOMA, medido em 2026-09-01:
--
--   public: 14 linhas, 14 de 14 apontam pra sessao FECHADA (3 sessoes abertas)
--   dev:     7 linhas,  7 de  7 idem                       (0 sessoes abertas)
--
-- A FK tem `on delete cascade`, mas ela nunca dispara: `game_sessions` nao e
-- apagada quando a sessao fecha, e MARCADA (`closed_at`). Entao a linha do
-- protetor sobrevive a sessao dona dela pra sempre. Nao vaza pra jogador
-- nenhum e nao pesa no egress (a leitura e sempre por sessao), mas cresce sem
-- limite: uma linha por hunt abandonada com a sala travada.
--
-- POR QUE ISTO NAO E UM TRIGGER DE `closed_at`, QUE E O QUE A ISSUE PEDIA
--
-- A issue afirmava que "linha de sessao fechada nunca e lida". ISSO ESTA
-- ERRADO, e apagar no fechamento criaria um bug de jogo pior que o lixo.
--
-- `salaHerdada` (authority/src/appSessao.ts) le a ultima sessao do jogador
-- NAQUELE mapa com `select=*,sala_protetor(*)` e SEM filtro de `closed_at` —
-- ou seja, le exatamente a linha de uma sessao FECHADA. E a heranca de sala da
-- PH-266: dar F5 no meio da luta contra um Guardian fecha a sessao e reabre
-- outra, e o protetor (com o `hp_atual` que ele tinha) atravessa junto. O
-- comentario da propria PH-266 diz o porque: sem isso, F5 vira um jeito de se
-- livrar do bicho.
--
-- A janela de heranca e `JANELA_DE_HERANCA_DE_SALA_MS` = 5 minutos. Fora dela
-- a linha realmente nao serve pra mais nada. Entao a limpeza e POR IDADE, num
-- purge de hora em hora, e nao no instante do fechamento.
--
-- 1 HORA, e nao 5 minutos colados na janela do TypeScript: o purge nao precisa
-- ser apertado (o lixo maximo passa a ser o de uma hora, com 4 jogadores isso e
-- casa de unidades) e uma margem larga garante que nenhuma corrida entre o
-- fechamento e a reabertura caia do lado errado do limite. `salaProtetorPurga.test.ts`
-- reprova se este limite ficar <= a janela de heranca.
create or replace function public.purgar_sala_protetor(
  p_limite interval default interval '1 hour'
)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_apagadas integer;
begin
  -- `not exists (sessao viva pra esta linha)`, com "viva" = aberta OU fechada
  -- ha menos que o limite. Filtro explicito e positivo: nao existe caminho em
  -- que este delete alcance uma linha de sessao aberta, mesmo que `closed_at`
  -- seja gravado como nulo por um caminho novo que ninguem lembrou.
  delete from public.sala_protetor sp
   where not exists (
     select 1
       from public.game_sessions gs
      where gs.id = sp.session_id
        and (gs.closed_at is null or gs.closed_at > now() - p_limite)
   );

  get diagnostics v_apagadas = row_count;
  return v_apagadas;
end;
$function$;

-- Revoga das 3 de uma vez (PUBLIC, anon, authenticated) — a licao do
-- `gravar_progresso`: `revoke ... from public` sozinho NAO alcanca o grant
-- explicito e NOMEADO que `alter default privileges` da a anon/authenticated na
-- criacao de toda funcao nova neste projeto.
revoke execute on function public.purgar_sala_protetor(interval) from public, anon, authenticated;
grant execute on function public.purgar_sala_protetor(interval) to service_role;

-- `unschedule` condicional + `schedule`: idempotentes juntos, e sem depender de
-- o job ja existir. Mesmo padrao de 20260830010000.
--
-- Minuto 34 pra nao competir com os purges de hora em hora que ja existem —
-- `game-sessions-purge` (11), `chat-messages-purge` (17), `audit-logs-purge`
-- (23) e `sessoes-inativas-fechar` (29) — nem com os `*/5` (`leiloes-encerrar`
-- em 0,5,10... e `trocas-expirar` em 2,7,12...).
do $$
begin
  if exists (select 1 from cron.job where jobname = 'sala-protetor-purge') then
    perform cron.unschedule('sala-protetor-purge');
  end if;
end
$$;

select cron.schedule(
  'sala-protetor-purge',
  '34 * * * *',
  $$select public.purgar_sala_protetor();$$
);

-- BACKFILL das 14 orfas de hoje. E a PROPRIA funcao, entao nao ha uma segunda
-- regra livre pra divergir da primeira, e rodar de novo nao faz nada (a segunda
-- chamada nao acha linha fora do limite e devolve 0).
select public.purgar_sala_protetor();
