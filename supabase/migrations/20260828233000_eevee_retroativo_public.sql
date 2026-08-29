-- PH-164 — quem venceu o Campeao Lance ANTES desta feature existir tambem
-- recebe o Eevee.
--
-- POR QUE PRECISA DE MIGRATION PROPRIA
--
-- A concessao normal pendura num trigger `AFTER INSERT` de `hall_da_fama`
-- (20260828230000). Isso e o que a torna server-authoritative de graca, e e
-- tambem o que a faz NAO alcancar quem ja tem a linha: o trigger nunca dispara
-- pra uma conquista registrada no passado. Sem esta migration, todo veterano
-- ficaria de fora em silencio — e "em silencio" e o problema, porque nao ha erro
-- nenhum pra alguem notar.
--
-- Medido em 2026-08-28, antes de escrever isto: `public.hall_da_fama` tinha 3
-- linhas com `boss_lance` e `dev` tinha 0. Em `dev` esta migration e um no-op, e
-- isso e esperado, nao sinal de que ela falhou.
--
-- POR QUE ELA CHAMA `_conceder_eevee_do_lance` EM VEZ DE ESCREVER A CARTA
--
-- Porque a carta tem uma receita (especie, nivel, IVs, raridade, texto) e duas
-- copias dela divergiriam no dia em que so uma fosse reafinada — o veterano
-- receberia um Eevee diferente do de quem venceu depois, e nada acusaria.
-- Chamando a mesma funcao, a receita continua existindo num lugar so e o
-- marcador `recompensa_concedida` e o MESMO, entao os dois caminhos nao se
-- atropelam.
--
-- IDEMPOTENTE, e a garantia nao esta num `where not exists` escrito aqui:
-- `_conceder_eevee_do_lance` insere no marcador com `on conflict do nothing` e
-- so segue quando de fato inseriu. Rodar esta migration duas vezes concede zero
-- na segunda. E se um destes jogadores vencer o Lance de novo depois, o trigger
-- bate no mesmo marcador e tambem nao concede.
--
-- O `exists` em `players` NAO e a trava de duplicata; e guarda de chave
-- estrangeira. `recompensa_concedida.user_id` referencia `players(user_id)`, e
-- uma linha orfa no Hall (conta apagada com o registro sobrevivendo) abortaria a
-- migration inteira — travando a fila de deploy de todo mundo por causa de um
-- jogador que nem existe mais.
--
-- ESTA MIGRATION MANDA CARTA PRA JOGADOR DE VERDADE no momento em que for
-- aplicada em `public`. E o efeito pretendido e foi decidido explicitamente,
-- mas vale saber que ele acontece no deploy, e nao quando alguem abre o jogo.

begin;

do $$
declare
  v_user_id uuid;
  v_concedidos int := 0;
  v_vistos int := 0;
begin
  for v_user_id in
    select h.user_id
      from public.hall_da_fama h
      where h.conquista = 'boss_lance'
        and exists (select 1 from public.players p where p.user_id = h.user_id)
      order by h.conquistado_em
  loop
    v_vistos := v_vistos + 1;
    if public._conceder_eevee_do_lance(v_user_id) then
      v_concedidos := v_concedidos + 1;
    end if;
  end loop;

  -- `%` sozinho, nao `%s`: o `RAISE` do PL/pgSQL usa `%` como marcador e
  -- deixaria o "s" literal na mensagem.
  raise notice 'eevee retroativo: % veterano(s) no Hall, % carta(s) enviada(s)',
    v_vistos, v_concedidos;
end
$$;

commit;
