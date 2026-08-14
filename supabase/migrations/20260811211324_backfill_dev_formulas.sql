insert into dev.formulas (key, expression, variables, description, sort_order)
select key, expression, variables, description, sort_order from public.formulas
on conflict (key) do update set
  expression = excluded.expression,
  variables = excluded.variables,
  description = excluded.description,
  sort_order = excluded.sort_order;
