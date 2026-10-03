# Refinamento do impacto dos Beams

Feedback do dono: melhorar a colisão com o oponente, preservando os oito feixes
da 7.81. Direção assumida para execução conforme orientação de seguir sem novas
perguntas na construção desta família.

## Diagnóstico e direção

O impacto atual é uma estrela de 180 ms e resíduos pequenos. Em vários golpes a
estrela acaba antes do feixe, deixando pouca leitura de pressão sobre o alvo.
Alternativas: ampliar a estrela (mais presença, ainda genérica), adicionar tremor
de câmera (fora da direção aprovada) ou construir colisão sustentada por material.
Escolhida a terceira: núcleo compacto, reação própria enquanto o feixe incide e
escape lateral de energia. Silhueta do oponente deve continuar reconhecível.

- Hyper: coroa angular âmbar, pressão concentrada e fragmentos quentes.
- Solar: raios solares e pétalas de luz verde-dourada.
- Ice: facetas/cristais no contato e lascas laterais; não indicar freeze garantido.
- Aurora: facetas prismáticas que se abrem e refratam a energia.
- Psybeam: arcos mentais segmentados ao redor do ponto de pressão.
- Signal: colisão de duas cores com fitas divergentes.
- Charge: ramificações elétricas que se espalham no contato.
- Bubble: espuma de bolhas ocas e arcos de bolhas estourando.

Sem alterar câmera, combate, primeiro contato, duração, cores ou construção dos
feixes. Impacto desenhado no eixo do golpe e ponto do alvo, independente de distância.
Forma essencial mantém-se com orçamento zero; partículas opcionais respeitam o
orçamento. Nada de flash de tela, blur, strobe ou anel de chão.

## Integração e aceite

Módulo de impacto puro separado da coreografia do feixe; RNG próprio semeado para
não deslocar resíduos existentes. Comparativo de laboratório mantém o mesmo feixe
e oferece coluna anterior sem impacto novo, isolando a alteração para QA.
Testar começo/fim, duração da pressão, paleta, crítico, orçamento zero, várias
direções/distâncias, bounds do buffer e ausência de mutação. QA em sprites/fundo
reais e mobile. Publicar conforme docs/PROCESSO.md.

Auto-revisão: sem placeholders; escopo render/testes/lab, sem assets ou migrations;
escala limitada à folga existente do pixelizador. Vault indisponível; registro local.
