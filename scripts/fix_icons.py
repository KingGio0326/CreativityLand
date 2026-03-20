from PIL import Image
import os

def remove_background(img):
    img = img.convert("RGBA")
    w, h = img.size
    pixels = img.load()

    # Campiona il colore dei 4 angoli per capire il colore bg
    corners = [
        pixels[0, 0],
        pixels[w-1, 0],
        pixels[0, h-1],
        pixels[w-1, h-1],
    ]

    # Prendi il colore più chiaro tra gli angoli come bg
    bg_color = max(corners, key=lambda c: c[0]+c[1]+c[2])

    # Soglia: pixel entro 40 di distanza dal bg diventano trasparenti
    threshold = 40

    new_data = []
    for y in range(h):
        for x in range(w):
            r, g, b, a = pixels[x, y]
            dr = abs(r - bg_color[0])
            dg = abs(g - bg_color[1])
            db = abs(b - bg_color[2])
            if dr < threshold and dg < threshold and db < threshold:
                new_data.append((r, g, b, 0))
            else:
                new_data.append((r, g, b, a))

    result = Image.new("RGBA", (w, h))
    result.putdata(new_data)
    return result

icons_dir = "dashboard/public/icons"
for filename in sorted(os.listdir(icons_dir)):
    if not filename.endswith(".png"):
        continue
    path = os.path.join(icons_dir, filename)
    img = Image.open(path)
    fixed = remove_background(img)
    fixed.save(path, "PNG")
    print(f"Fixed: {filename}")

print("Tutti i background rimossi.")
