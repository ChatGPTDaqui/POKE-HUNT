# Punhos de energia — desenho aprovado

O usuário aprovou: punho de energia reconhecível em pixel art/anime, soco curto
saindo do atacante, mesma família com personalidade própria por golpe, presença
forte mas controlada e impacto localizado sem tremor de câmera. Bullet Punch
fica fora: deve usar sua sprite original, sem alterar sua arte ou parâmetros.
Autorização de implementação: "execute" após essas decisões.

Implementar onze golpes do catálogo: Mega, Mach, Dynamic, Focus, Comet, Dizzy,
Fire, Ice, Thunder, Shadow e Sucker Punch. Reutilizar Canvas, paletas,
pixelizador, cache e orçamento existentes. Registrar por golpe antes do fallback
por tipo; não aplicar socos a golpes em área nem a outros ataques de aço.

Punho com contorno escuro, quatro nós/dedos fechados, polegar sobre a palma,
luz em blocos e rastro curto. Avança na direção do alvo e se desfaz no contato.
Jab de Mach; peso nos três fortes; chama/cristal/faísca nos elementais;
aparição sombria em Shadow/Sucker; arco e resíduo espiralado em Dizzy.
Comet alterna socos pelo número de contatos efetivamente resolvidos, inclusive
interrupção por KO/substituto. O motor apenas anota esse contador cosmético:
nenhum novo sorteio, espera, dano, movimento, gate ou persistência.
Crítico mantém subida de tier visual existente, sem inventar contatos extras.

Bullet Punch devolve ao caminho de sprite existente antes do fallback procedural.
Não alterar moveVfx.ts nem assets. Número de dano mantém o tempo da sprite.

Aceite: catálogo completo, exclusão de Bullet e AoE, determinismo, orçamento,
limites do retângulo em todas as direções, contatos de Comet e isolamento visual.
Conferir quadros reais no laboratório com sprites/fundo do jogo, celular e desktop.
Typecheck, suíte completa, build engine/authority, CI, staging e produção pelo
processo vigente. Spec revisto: sem placeholders; escopo só VFX, sem câmera.

O vault E:/Context não está disponível nesta sessão; desenho registrado no
repositório para manter o contexto junto da implementação autorizada.
