-- Lancamento das conquistas: avalia UMA vez cada jogador que ja existe
-- (14/10/2026, decisao do dono: retroativo so o merito garantido).
--
-- Nao ha regra especial de retroatividade: `avaliar_conquistas` le o que o banco
-- ja tem. Abates por especie, biomas/estagios limpos, Lance, nivel de treinador,
-- divisao PvP, Especialidades e Diario sao merito do proprio jogador e fecham
-- aqui. Posse de POKE nao fecha porque todo POKE anterior a 20261014120000 tem
-- origem `desconhecida`, e os contadores novos (captura, evolucao, ouro de caca,
-- clima) comecam em zero.
--
-- Os dois schemas explicitamente, num arquivo so: e a mesma operacao de dados
-- sobre as tabelas que as migrations 20261014130000/130001 criaram.
begin;

do $$
declare
  j record;
begin
  for j in select user_id from public.players loop
    perform public.avaliar_conquistas(j.user_id);
  end loop;
  for j in select user_id from dev.players loop
    perform dev.avaliar_conquistas(j.user_id);
  end loop;
end
$$;

commit;
