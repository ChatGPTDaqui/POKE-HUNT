# Revisão dos efeitos de ambiente dos mapas — plano (29/10/2026)

Pedido do dono: rever os efeitos dos mapas um por um. Alguns estão desalinhados com o objeto desenhado (cascatas, por exemplo), e alguns mapas têm objetos que pedem efeito e não têm (chaminés, incensos...). O dono está ausente e pediu para não perguntar: a tarefa termina testada, aprovada e promovida.

## Decisões (tomadas sem o dono, por estar ausente)

- **Escopo:** as 83 artes de `assets/hunt-backgrounds/`, inclusive as que já foram revisadas na 8.54/8.55. Só âncoras de prop (`src/data/ancorasDeAmbiente.ts`). Escala, colisão e máscara de água ficam fora: a proporção foi revista na 8.54.
- **Método:**
  1. Um overlay por arte (1024 px) com cruz colorida por tipo e o índice de cada âncora, mais o JSON das âncoras atuais.
  2. Revisão visual em paralelo por subagentes (lotes de ~14 artes). Cada um devolve a **lista final** de âncoras de cada arte, com o motivo.
  3. Aplicação centralizada num só lugar, para evitar conflito no mesmo arquivo.
  4. Novo overlay de cada arte alterada, conferido antes do commit.
- **Ponto de ancoragem por tipo** (como o código desenha):
  - `chamine`, `fumarola`, `gas`: a fumaça sobe a partir do ponto. O ponto fica na **boca** da chaminé, do incensário ou da fenda.
  - `tocha`, `fogueira`: a chama é desenhada com a **base** no ponto, em cima do pavio, da lenha ou do bocal pintado.
  - `cascata`: anel de espuma achatado + gotas. Fica onde a queda **bate** na água (pé da queda), nunca no meio do jato.
  - `correnteza`, `quebraMar`: sobre a água, na beira, em pedra no rio ou onde a onda quebra.
  - `orbe`, `vagalume`, `nevoa`, `fogoFatuo`, `borboleta`, `petala`: centro do objeto ou da área.
  - Brilho somado (`orbe`, luz de poste) não aparece em arte diurna clara. Nela, usar tipo opaco (`nevoa`, `fogoFatuo`) ou nada.
- **Não inventar:** efeito só onde a arte desenha a fonte (chaminé, incensário, lampião, fogueira, queda d'água, fenda). Nada de efeito decorativo solto.
- **Entrega:** uma PR com patch notes (8.58), suíte completa verde, promoção por `scripts` de sempre.
