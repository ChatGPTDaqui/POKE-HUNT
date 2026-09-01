# Apara quadro VAZIO das pontas de cada tira de VFX, e corrige o `quadros`
# cadastrado junto.
#
# POR QUE ISSO E UM BUG E NAO CAPRICHO
# ---------------------------------------------------------------------------
# `quadros` nao e so metadado: e o DIVISOR da velocidade. `faseDaTira`
# (render/sprites.ts) tira o quadro atual de `fase x quadros`, entao um quadro
# vazio infla o numero e ACELERA o desenho real. Medido em 2026-08-31: 25 das
# 78 tiras cadastradas tinham quadro vazio na ponta, ate 32% —
#
#   golpe dig    19 quadros, 6 vazios NO INICIO   32%   13,0 contra 19,0 fps
#   tipo ROCK    16 quadros, 5 vazios no fim      31%   11,0 contra 16,0 fps
#   tipo ICE     39 quadros, 9 vazios NO INICIO   23%   30,0 contra 39,0 fps
#
# Alem de acelerar, vira tempo morto: o `dig` gastava o primeiro terco do
# efeito desenhando nada.
#
# POR QUE APARAR AQUI E NAO SO REEXPORTAR
# ---------------------------------------------------------------------------
# O exportador (`tira_efeito.py`, fora deste repo) foi corrigido na mesma leva
# e passa a aparar os dois lados — arte NOVA ja chega certa. Este script existe
# pro acervo que JA esta commitado, e ele e o caminho mais seguro pros 78
# arquivos de hoje:
#
#   * reexportar exige acertar o ID de origem de cada tira, e id trocado
#     significa ARTE ERRADA no jogo — foi exatamente o defeito da PH-368;
#   * reexportar reescreve os 78 arquivos (a quantizacao nao e deterministica
#     entre versoes do Pillow), e o diff deixa de ser revisavel;
#   * aparar toca so os arquivos que tem quadro vazio de verdade.
#
# O LIMIAR E O MESMO DO EXPORTADOR, e tem que continuar sendo: media de alpha
# do quadro >= 1/255. NAO e `getbbox() is None`, que so acha quadro 100%
# transparente — quadro com meia duzia de pixels de alpha 1-2 passava como
# cheio, e a MAIORIA dos casos achados era desses.
#
#   py scripts/aparar-quadros-vazios-vfx.py            # apara e corrige o TS
#   py scripts/aparar-quadros-vazios-vfx.py --conferir  # so relata
import argparse
import pathlib
import re
import sys

from PIL import Image

RAIZ = pathlib.Path(__file__).resolve().parent.parent
ALPHA_MEDIO_MINIMO = 1.0

# (arquivo TS, regex que captura o caminho da arte e o numero de quadros)
FONTES = [
    (RAIZ / 'src/data/vfxTiras.ts',
     re.compile(r'url:\s*`\$\{(?P<raiz>RAIZ|RAIZ_AOE|RAIZ_STATUS)\}/(?P<arq>[\w-]+\.png)`,\s*quadros:\s*(?P<n>\d+)')),
    (RAIZ / 'src/data/moveVfx.ts',
     re.compile(r"tira\('(?P<arq>[\w-]+)',\s*(?P<n>\d+)")),
]
PASTA_DA_RAIZ = {
    'RAIZ': 'assets/move-vfx/tiras',
    'RAIZ_AOE': 'assets/move-vfx/tiras-aoe',
    'RAIZ_STATUS': 'assets/status-vfx',
}


def tem_desenho(img: Image.Image) -> bool:
    alpha = img.getchannel('A')
    soma = sum(i * n for i, n in enumerate(alpha.histogram()))
    return (soma / (img.width * img.height)) >= ALPHA_MEDIO_MINIMO


def cadastradas():
    """{caminho do png: (quadros, ancora)} de tudo que os dois modulos citam.

    A ANCORA e o que distingue `tiras/psychic.png` de `tiras-aoe/psychic.png`.
    Os 18 tipos aparecem com o MESMO nome de arquivo nas duas pastas, entao
    chavear pelo nome faria o `quadros` de um sobrescrever o do outro — bug que
    corromperia o cadastro em silencio (a tira desenharia com o divisor errado,
    que e exatamente o defeito que este script veio consertar).
    """
    achadas = {}
    for arquivo, padrao in FONTES:
        texto = arquivo.read_text(encoding='utf-8')
        for m in padrao.finditer(texto):
            raiz = m.groupdict().get('raiz')
            if raiz:
                png = RAIZ / PASTA_DA_RAIZ[raiz] / m.group('arq')
                ancora = ('vfxTiras', raiz, m.group('arq'))
            else:
                png = RAIZ / 'assets/move-vfx/golpes' / (m.group('arq') + '.png')
                ancora = ('moveVfx', None, m.group('arq'))
            if png.exists():
                achadas[png] = (int(m.group('n')), ancora)
    return achadas


def aparar(png: pathlib.Path, quadros: int, ancora, apenas_conferir: bool):
    img = Image.open(png).convert('RGBA')
    largura = img.width // quadros
    if largura * quadros != img.width:
        print(f'  !! {png.name}: {img.width}px nao divide por {quadros} quadros — pulando')
        return None
    frames = [img.crop((i * largura, 0, (i + 1) * largura, img.height)) for i in range(quadros)]
    inicio = 0
    while inicio < len(frames) and not tem_desenho(frames[inicio]):
        inicio += 1
    fim = 0
    while fim < len(frames) - inicio and not tem_desenho(frames[len(frames) - 1 - fim]):
        fim += 1
    if inicio == 0 and fim == 0:
        return None
    if inicio >= len(frames):
        print(f'  !! {png.name}: TODOS os quadros vazios — pulando')
        return None
    restantes = frames[inicio:len(frames) - fim]
    if not apenas_conferir:
        nova = Image.new('RGBA', (largura * len(restantes), img.height), (0, 0, 0, 0))
        for n, q in enumerate(restantes):
            nova.paste(q, (n * largura, 0))
        nova.save(png)
    return {'arq': png, 'de': quadros, 'para': len(restantes),
            'inicio': inicio, 'fim': fim, 'ancora': ancora}


def corrigir_ts(mudancas):
    """Reescreve o `quadros` de cada entrada, ancorado no ${RAIZ} + nome."""
    for arquivo, _ in FONTES:
        # `Path.read_text` NAO aceita `newline` nesta versao do Python, e
        # passar assim mata o script no MEIO: as PNGs ja foram aparadas e o
        # `quadros` do TS fica pra tras, ou seja o cadastro passa a mentir na
        # direcao oposta. Aconteceu uma vez; por isso `open()` explicito.
        with open(arquivo, encoding='utf-8', newline='') as fh:
            texto = fh.read()
        original = texto
        for m in mudancas:
            modulo, raiz, arq = m['ancora']
            novo = m['para']
            if modulo == 'vfxTiras' and arquivo.name == 'vfxTiras.ts':
                # A ancora inclui o ${RAIZ}/${RAIZ_AOE}, senao os 18 tipos
                # (mesmo nome nas duas pastas) se sobrescrevem.
                alvo = (r'(url:\s*`\$\{' + re.escape(raiz) + r'\}/'
                        + re.escape(arq) + r"`,\s*quadros:\s*)\d+")
                texto, n = re.subn(alvo, lambda mm: mm.group(1) + str(novo), texto)
                assert n == 1, f'{arq} em {raiz}: {n} ocorrencias, esperava 1'
            elif modulo == 'moveVfx' and arquivo.name == 'moveVfx.ts':
                # Aqui a MESMA arte aparece em varios golpes de proposito
                # (mandibula em bite/crunch/hyper_fang), entao todas mudam.
                alvo = r"(tira\('" + re.escape(arq) + r"',\s*)\d+"
                texto, n = re.subn(alvo, lambda mm: mm.group(1) + str(novo), texto)
                assert n >= 1, f'{arq}: nenhuma ocorrencia em moveVfx.ts'
        if texto != original:
            with open(arquivo, 'w', encoding='utf-8', newline='') as fh:
                fh.write(texto)
            print(f'  {arquivo.relative_to(RAIZ)} atualizado')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--conferir', action='store_true', help='so relata, nao escreve')
    args = ap.parse_args()

    alvos = cadastradas()
    print(f'{len(alvos)} tiras cadastradas')
    # PASSO 1 sempre em modo de leitura: descobre o que muda SEM escrever. A
    # gravacao so acontece depois, e o TS vem antes das PNGs — se o TS falhar,
    # a arte continua batendo com o cadastro. Na primeira versao era o
    # contrario e um erro no TS deixou os dois em desacordo.
    mudancas = [m for png, (q, anc) in sorted(alvos.items())
                if (m := aparar(png, q, anc, apenas_conferir=True))]

    if not mudancas:
        print('nenhum quadro vazio nas pontas — nada a fazer')
        return 0

    mudancas.sort(key=lambda m: (m['inicio'] + m['fim']) / m['de'], reverse=True)
    print(f'\n{len(mudancas)} tiras com quadro vazio:')
    for m in mudancas:
        pct = round((m['inicio'] + m['fim']) / m['de'] * 100)
        pontas = []
        if m['inicio']:
            pontas.append(f"{m['inicio']} no inicio")
        if m['fim']:
            pontas.append(f"{m['fim']} no fim")
        print(f"  {m['arq'].name:<24} {m['de']:>3} -> {m['para']:<3} quadros  "
              f"({', '.join(pontas)}, {pct}%)  [{m['ancora'][1] or 'golpe'}]")

    if args.conferir:
        print('\n--conferir: nada foi escrito')
        return 1

    print('\ncorrigindo o `quadros` cadastrado:')
    corrigir_ts(mudancas)
    print('\naparando as tiras:')
    for m in mudancas:
        aparar(m['arq'], m['de'], m['ancora'], apenas_conferir=False)
    print(f'  {len(mudancas)} arquivos reescritos')
    return 0


if __name__ == '__main__':
    sys.exit(main())
