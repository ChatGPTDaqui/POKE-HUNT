# Treinadores: preservar a arte recebida

## Problema comprovado

O conversor legado reduzia os corpos para cerca de 30 px, quantizava a paleta
para 20 cores, binarizava alpha e redesenhava pernas/poses. As cinco fontes do
dono têm 1024×1536 px e transparência. Não era apenas um problema de recorte.

## Implementação em prévia

- Fontes preservadas em assets/treinadores/originais, sem modificar Downloads.
- scripts/arte/treinadores-de-campo.json registra fonte/linhas/direções.
- importar-treinadores-sem-perda.cjs localiza corpos por componentes, recorta
  com margem e copia RGBA sem reamostragem, quantização ou desenho de poses.
  O limiar de alpha apenas localiza os corpos: não binariza a imagem de saída.
- Walk mantém os quatro quadros originais, na ordem original. Cópias espelhadas
  apenas nas direções já previstas no mapa. As oito vistas não existem em todas
  as fontes; não são criadas vistas inéditas.
- Idle escolhe o passo de menor abertura dos pés e o mantém estático. Não existe
  idle dedicado nas fontes: a pose pode ter um pé levantado. Respiração e pernas
  inventadas foram retiradas, não substituídas por arte gerada.
- quadrosDoTreinador.json descreve geometria nativa por skin. O renderizador
  escala para cerca de 30 px de corpo no mundo, conservando proporções originais
  entre direções, sem mudar seguimento, colisão, autoridade ou combate.
- Suavização de redução de alta qualidade fica restrita ao desenho do treinador;
  as configurações anteriores do contexto são restauradas para os demais sprites.
  Uma figura de 30 px ainda tem limite de detalhe visível: fonte preservada não
  significa que todo detalhe de 200 px apareça no mesmo tamanho em tela.

## Validação e teste visual

Cinco testes Node com as fontes reais comparam RGBA dos recortes, incluindo
espelhos, arquivos gerados, paleta maior que 20 cores e alpha parcial. Os testes
do renderizador verificam geometria, porte de mundo e restauração da suavização;
24 testes afetados passaram. Typecheck e build da bancada passaram.

Bancada dedicada: /scripts/harness/treinadores-fieis.html, cinco skins em movimento,
estado parado, oito direções e zoom, usando TreinadorEmCampo real, sem conta/rede.
Não confundir com jornada-completa, que mostra menus sem Canvas do jogo.

Conferência em navegador nesta sessão não realizada: acesso automatizado havia
sido recusado por política de segurança; não contornado. O contato PNG ampliado
é inspeção dos assets, não screenshot do jogo nem aprovação visual em mobile/PC.
Manter em prévia até o teste do dono. Não promover.

Para reproduzir: node scripts/arte/importar-treinadores-sem-perda.cjs; validar com
node --test scripts/arte/verificar-recortes-treinadores.cjs.
