"""Desenha a GRADE DE COORDENADAS por cima de cada arte de fundo (PH-254).

POR QUE ISTO EXISTE

A tabela de ancoras de `src/data/ancorasDeAmbiente.ts` guarda posicao NORMALIZADA
na arte (u, v em 0..1) — "a chamine fica em (0.62, 0.41)". Escolher esse par
olhando a arte crua e chute: erra 5% pra qualquer lado e a fumaca sai do telhado
e fica boiando no ceu, e o erro so aparece depois de a arte estar no jogo.

Com a grade impressa em cima, a leitura vira contagem: acha a linha, acha a
coluna, escreve o par. E o mesmo truque das referencias pintadas de agua
(`scripts/agua-refs/`) — a arte continua sendo a fonte, o que muda e ter uma
regua sobre ela.

A saida NAO vai pro jogo e NAO e commitada: e material de conferencia, gerado
sob demanda. `scripts/harness/ancoras-grade/` esta no .gitignore do proprio
diretorio de harness.

USO
    py scripts/harness/grade-de-ancoras.py
    py scripts/harness/grade-de-ancoras.py --artes volcano,swamp --largura 1100
"""
import argparse
import os

from PIL import Image, ImageDraw

RAIZ = os.path.normpath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..'))
FUNDOS = os.path.join(RAIZ, 'assets', 'hunt-backgrounds')

ap = argparse.ArgumentParser()
ap.add_argument('--artes', default='', help='lista separada por virgula, sem extensao; vazio = todas')
ap.add_argument('--largura', type=int, default=980)
ap.add_argument('--passo', type=float, default=0.1, help='espacamento da grade em fracao da arte')
ap.add_argument('--out', default='scripts/harness/ancoras-grade')
a = ap.parse_args()

SAIDA = os.path.join(RAIZ, a.out)
os.makedirs(SAIDA, exist_ok=True)

pedidas = set(x for x in a.artes.split(',') if x)
arquivos = sorted(f for f in os.listdir(FUNDOS) if f.lower().endswith(('.jpg', '.png')))

for arq in arquivos:
    base = os.path.splitext(arq)[0]
    if pedidas and base not in pedidas:
        continue
    img = Image.open(os.path.join(FUNDOS, arq)).convert('RGB')
    alt = int(a.largura * img.height / img.width)
    img = img.resize((a.largura, alt), Image.LANCZOS)
    d = ImageDraw.Draw(img, 'RGBA')
    n = int(round(1.0 / a.passo))
    for i in range(1, n):
        x = int(img.width * i * a.passo)
        y = int(img.height * i * a.passo)
        # Linha do meio mais forte: sem uma referencia grossa, contar decimo a
        # decimo em imagem de mil pixels erra uma casa com facilidade.
        forte = abs(i * a.passo - 0.5) < 1e-6
        cor = (255, 255, 255, 190) if forte else (255, 255, 255, 90)
        d.line([(x, 0), (x, img.height)], fill=cor, width=2 if forte else 1)
        d.line([(0, y), (img.width, y)], fill=cor, width=2 if forte else 1)
        d.text((x + 3, 3), '%.1f' % (i * a.passo), fill=(255, 240, 120, 255))
        d.text((3, y + 2), '%.1f' % (i * a.passo), fill=(120, 240, 255, 255))
    img.save(os.path.join(SAIDA, base + '.png'))
    print(base)
print('saida:', SAIDA)
