# Próximo golpe por nível

Escopo autorizado: balão no nível do POKE na HUD e na ficha, até produção.

## Comportamento

Hover, toque ou foco abre a previsão da forma atual: menor nível futuro com
golpes válidos ainda não aprendidos, incluindo todos os golpes desse nível.
Usar nivelDeAprendizado e getAbility, as mesmas fontes do aprendizado vigente.
Atualizar ao subir nível ou evoluir. Sem próximos golpes, explicar o término
do aprendizado por nível. Não antecipar TMs nem formas evoluídas. Não mudar
regras de aprendizado, seleção de golpes, persistência ou economia.

## Execução e aceite

1. Reutilizar Explicacao e manter escala e dimensões da HUD.
2. Cobrir agrupamento, golpes já conhecidos, mudança de nível e forma,
   ausência de próximos golpes e abertura ao toque e por foco.
3. Typecheck e testes afetados; CI completo obrigatório na PR para dev.
4. Conferir deploy de dev/staging; promover dev para main com merge commit.
5. Verificar publicação de servidor e cliente pelo SHA promovido, incluindo
   as bancadas funcionais do processo e interação visual do balão.

Auto-revisão: escopo localizado, sem placeholders e sem alterações de banco.
