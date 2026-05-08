"""One-off: crop icon tiles from AgilBank reference sheets into public/banco/assets/icons."""
from __future__ import annotations

import os
from pathlib import Path

from PIL import Image

WORKSPACE = Path(__file__).resolve().parents[1]
OUT = WORKSPACE / "public" / "banco" / "assets" / "icons"
CURSOR_ASSETS = Path(
    r"C:\Users\gordi\.cursor\projects\c-Users-gordi-concurso\assets"
)

SHEET_EMPRESTIMOS = CURSOR_ASSETS / (
    "c__Users_gordi_AppData_Roaming_Cursor_User_workspaceStorage_6d7674197a08fb5238c0ca330e0a32b2_images_"
    "ChatGPT_Image_8_de_mai._de_2026__16_20_57-a204d433-9cad-4f62-9aab-0fba9cf3cbb1.png"
)
SHEET_CONTAS = CURSOR_ASSETS / (
    "c__Users_gordi_AppData_Roaming_Cursor_User_workspaceStorage_6d7674197a08fb5238c0ca330e0a32b2_images_"
    "ChatGPT_Image_8_de_mai._de_2026__16_21_09-747b671f-1727-44df-b266-1039149723fc.png"
)


def crop_cell(
    img: Image.Image,
    rows: int,
    cols: int,
    r: int,
    c: int,
    grid_top: int,
    grid_bottom: int,
    pad: float = 0.07,
    icon_height_frac: float = 0.62,
) -> Image.Image:
    """Recorta só o desenho do ícone (ladrilho), sem a legenda em texto da folha."""
    w, _h = img.size
    gh = grid_bottom - grid_top
    cw = w / cols
    ch = gh / rows
    x0 = int(c * cw + cw * pad)
    x1 = int((c + 1) * cw - cw * pad)
    y0 = int(grid_top + r * ch + ch * pad)
    y1_full = int(grid_top + (r + 1) * ch - ch * pad)
    inner_h = y1_full - y0
    y1 = int(y0 + inner_h * icon_height_frac)
    return img.crop((x0, y0, x1, y1))


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    if not SHEET_EMPRESTIMOS.is_file() or not SHEET_CONTAS.is_file():
        raise SystemExit(f"Missing source PNGs under {CURSOR_ASSETS}")

    # Header + title occupies top; grid is uniform below (819x1024 sheets).
    gt, gb = 188, 998

    im2 = Image.open(SHEET_EMPRESTIMOS).convert("RGBA")
    im4 = Image.open(SHEET_CONTAS).convert("RGBA")

    # Folha 2/4: 5 colunas x 6 linhas (30 ícones)
    # Pedido pendente: linha 6 col 1 -> (r=5,c=0)
    crop_cell(im2, 6, 5, 5, 0, gt, gb).save(OUT / "icon-cartao-analise.png", "PNG")
    # Empréstimo pessoal: linha 4 col 3 -> (r=3,c=2)
    crop_cell(im2, 6, 5, 3, 2, gt, gb).save(OUT / "icon-credito-andamento.png", "PNG")

    # Folha 4/4: 6 colunas x 5 linhas
    # Preferências da conta: linha 5 col 6 -> (r=4,c=5)
    crop_cell(im4, 5, 6, 4, 5, gt, gb).save(OUT / "icon-consultar-opcoes.png", "PNG")
    # Central de documentos: linha 3 col 6 -> (r=2,c=5)
    crop_cell(im4, 5, 6, 2, 5, gt, gb).save(OUT / "icon-produtos.png", "PNG")

    for name in sorted(os.listdir(OUT)):
        p = OUT / name
        im = Image.open(p)
        print(name, im.size)


if __name__ == "__main__":
    main()
