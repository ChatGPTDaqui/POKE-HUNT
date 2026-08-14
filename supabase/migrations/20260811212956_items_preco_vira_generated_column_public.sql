alter table public.items add column buy_price_atual integer generated always as (
  case
    when kind = 'stone' then null
    when kind in ('ball', 'potion') then greatest(1, round(buy_price * (1 - 0.7)))
    else buy_price
  end
) stored;

alter table public.items add column sell_price integer generated always as (
  case
    when kind = 'stone' then 500
    when kind in ('ball', 'potion') then greatest(1, round(greatest(1, round(buy_price * (1 - 0.7))) * 0.5))
    else greatest(1, round(buy_price * 0.5))
  end
) stored;

comment on column public.items.buy_price_atual is 'Preco de compra com desconto ja aplicado (ball/potion -70%, hardcoded aqui -- BALL_POTION_BUY_DISCOUNT nunca veio de formulas, ja era so-codigo antes). Generated column: recalcula sozinho quando buy_price muda, sem ferramenta externa.';
comment on column public.items.sell_price is 'Preco de venda = 50% do buy_price_atual (SELL_ITEM_FRACTION=0.5, hoje em formulas.SELL_ITEM_FRACTION mas hardcoded aqui pois generated column nao pode consultar outra tabela). Stone e excecao: preco fixo de 500, nunca derivado de buy_price.';
