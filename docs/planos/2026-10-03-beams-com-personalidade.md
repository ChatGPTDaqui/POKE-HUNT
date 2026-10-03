# Família Beam — direção visual e implementação

Pedido: oito golpes do catálogo atual, com pesquisa de referências da franquia,
identidades próprias e acabamento anime pixel. O dono escolheu A e mandou seguir
sem novas perguntas; a direção artística abaixo é assumida para execução.

## Direção

Alternativas consideradas: recolorir um laser (barato, pouca personalidade),
sprites novos (arte fixa, adaptação pior à distância) ou coreografias Canvas por
golpe (escolhida: geometria orientável, paletas próprias e timing independente).
Não usar imagens da franquia como assets: referências são estudo, arte é procedural.

| Golpe | Preparação, feixe e encerramento |
|---|---|
| Hyper Beam | Orbe âmbar comprimida; canhão branco/dourado com borda laranja, fraturas longitudinais e colapso em fragmentos quentes. |
| Solar Beam | Luz convergindo; coluna luminosa verde-dourada, filamentos paralelos e centelhas solares que se apagam. |
| Ice Beam | Orbe fria; núcleo branco, agulhas ciano e facetas cristalinas; lascas breves no alvo, sem indicar freeze garantido. |
| Aurora Beam | Estrela prismática; fitas rosa/ciano/amarelo onduladas em torno de núcleo claro; brilho facetado. |
| Psybeam | Orbe violeta; eixo fino com hélices e anéis ópticos em movimento, espiral residual. |
| Signal Beam | Dois focos; fitas magenta/turquesa em contrafase, pulsos espaciais e fragmentos bicolores; sem strobe. |
| Charge Beam | Compressão elétrica; eixo dourado com arcos angulares, fagulhas na origem e descarga localizada. |
| Bubble Beam | Bolhas nascendo na origem; corrente de bolhas ocas com reflexos e tamanhos variados; estouros e gotas no alvo. |

Três fases: antecipação, extensão até o alvo e sustentação/colapso. Primeiro contato
visual sincronizado com o número de dano pelo mecanismo existente. Tempos e
potência são exclusivamente visuais: não criar turnos de carga, recarga, acertos
extras, buffs ou status. Sem câmera, tela branca, blur ou gradientes. Crítico
acrescenta detalhes sem transformar um Beam em outro golpe. Não adicionar golpes
fora do catálogo (Moongeist, Meteor, Steel, Eternabeam etc.). Bullet permanece intacto.

## Referências consultadas

- [Aurora Beam](https://bulbapedia.bulbagarden.net/wiki/Aurora_Beam_(move)):
  descrição de arco-íris; imagem de Sword/Shield inspecionada, núcleo claro e fitas cromáticas.
- [Hyper Beam](https://bulbapedia.bulbagarden.net/wiki/Hyper_Beam_(move)):
  orbe/feixe laranja no anime; imagem de Gengar inspecionada, cone quente e fraturas.
- [Ice Beam](https://bulbapedia.bulbagarden.net/wiki/Ice_Beam_(move)):
  orbe azul clara e raios frios no anime.
- [Solar Beam](https://bulbapedia.bulbagarden.net/wiki/Solar_Beam_(move)):
  absorção e concentração de luz.
- [Bubble Beam](https://bulbapedia.bulbagarden.net/wiki/Bubble_Beam_(move)):
  corrente de bolhas azuis, não laser sólido.
- [Charge Beam](https://bulbapedia.bulbagarden.net/wiki/Charge_Beam_(move)):
  orbe elétrica e feixe amarelo.
- [Psybeam](https://bulbapedia.bulbagarden.net/wiki/Psybeam_(move)) e
  [Signal Beam](https://bulbapedia.bulbagarden.net/wiki/Signal_Beam_(move)):
  personalidade mental e sinal luminoso. Hélices/anéis e cores escolhidas são
  interpretação artística, não alegação de reprodução exata de todas as versões.

## Integração e aceite

Registro por ID antes do fallback por tipo. Paleta opcional na entrada de
coreografia, consumida tanto no render real quanto no laboratório/pixelizador;
sem mudanças globais nas cores dos tipos. Coreografias puras, RNG local semeado,
geometria essencial preservada com orçamento zero; ornamentos limitados.
Laboratório compara anterior/nova assinatura, em distância apropriada para Beam.
Testes: cobertura exata dos oito IDs, determinismo, crítico, direções/distâncias,
limites do buffer, paletas após pixelização, restauração Canvas, orçamento e
isolamento da simulação. QA visual com fundo/sprites reais, desktop/mobile.
Publicação por PR dev, checks, staging e promoção main conforme PROCESSO.

Auto-revisão: escopo restrito ao render/lab, sem placeholders; cores próprias
registradas no pixelizador; faixas de tempo compatíveis com vida do efeito existente.
Vault E:/Context não disponível nesta sessão; registro mantido no repositório.
