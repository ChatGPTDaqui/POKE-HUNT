# Montador de equipe, defesa do ginásio e rotação por POKE — design aprovado (23/10/2026)

Pedido do dono antes de promover a 8.39: o líder escolhe a equipe de defesa (POKEs, golpes e rotação) de forma intuitiva, e o mesmo sistema vale pro time de PvP.

- **Montador único** (`src/components/montador/MontadorDeEquipe.tsx`): 6 vagas arrastáveis, caixa com busca e filtro, editor de golpes (até 4, em ordem) e, por POKE, **Inteligente** (padrão: analisa o oponente — tipo, resistências, defesas — e usa o golpe de mais dano) ou **Rotação** (ordem 1→2→3→4). Explicação aparece ao passar o mouse/tocar.
- **PvP**: o Build passa a usar o montador; preset ganha `rotacao` por vaga (antigos = Inteligente).
- **Defesa do ginásio**: painel do líder (`DefesaDoGinasio.tsx`). Servidor guarda referência `{pokemon_id, golpes, rotacao}` em `ginasio_lider.defesa` e lê os POKEs atuais em cada desafio (defesa viva). Quem assume o mandato defende com a equipe da vitória.
- **Trava** (escolha do dono: "impedir sair da caixa"): POKE da defesa fica trancado (cadeado) e uma trigger recusa vender, anunciar, leiloar, trocar ou soltar enquanto defende. Reset de conta libera.
- **Motor**: `PokeInstance.rotacaoDeGolpes` por POKE vale na arena dos dois lados; ausente = chave global do modo livre.
- Migration `20261023160000/160001_defesa_de_ginasio_e_rotacao`.
