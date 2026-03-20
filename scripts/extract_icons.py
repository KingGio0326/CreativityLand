from PIL import Image
import os

img = Image.open("dashboard/public/icons-source.png").convert("RGBA")
w, h = img.size
print(f"Dimensioni immagine: {w}x{h}")

# Griglia 5 colonne x 2 righe
# Ordine: riga1 = Dashboard, Articles, FinBERT, Backtest, Search
#         riga2 = Agents, Patterns, Performance, Correlation, Guide
icons = [
    ("dashboard",   0, 0),
    ("articles",    1, 0),
    ("finbert",     2, 0),
    ("backtest",    3, 0),
    ("search",      4, 0),
    ("agents",      0, 1),
    ("patterns",    1, 1),
    ("performance", 2, 1),
    ("correlation", 3, 1),
    ("guide",       4, 1),
]

cols, rows = 5, 2
cell_w = w // cols
cell_h = h // rows

# Taglia solo la parte icona (72% altezza cella, senza la label testo sotto)
icon_area_h = int(cell_h * 0.72)
pad = int(cell_w * 0.1)

os.makedirs("dashboard/public/icons", exist_ok=True)

for name, col, row in icons:
    x1 = col * cell_w + pad
    y1 = row * cell_h + pad
    x2 = x1 + cell_w - pad * 2
    y2 = y1 + icon_area_h - pad

    crop = img.crop((x1, y1, x2, y2))
    crop = crop.resize((48, 48), Image.LANCZOS)
    out = f"dashboard/public/icons/{name}.png"
    crop.save(out, "PNG")
    print(f"OK: {out}")

print("Done.")
