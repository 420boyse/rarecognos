"""Nine original pixel heads. Larger, two clear eyes, distinct palettes."""
from PIL import Image

CREAM = (243, 238, 226, 255)
W = (250, 248, 242, 255)
K = (16, 14, 14, 255)
OUT = "/tmp/rarecognos/public/art/faces"
CELL = 36
SIZE = 640

faces = [
    ("01", {"a": (42, 64, 168), "b": (232, 176, 64), "c": (24, 28, 72)}, [
        ".....aaaaaa.....",
        "....aaaaaaaa....",
        "...aaaaaaaaaa...",
        "...aaawwkwwaaa..",
        "..aaaawkkwwaaaa.",
        "...aaabbbbbaaa..",
        "....aabbbbbaa...",
        ".....bbbbbb.....",
        "......cccc......",
    ]),
    ("02", {"a": (34, 128, 86), "b": (214, 168, 112), "c": (18, 78, 58)}, [
        "..cc........cc..",
        ".caaa......aaac.",
        "caaaaabbbbaaaaac",
        "caaawwkwwbbbbaac",
        "caaawkkwwbbbbaac",
        ".caaabbbbbbaaac.",
        "..caabbbbbbaac..",
        "...cabbbbbbac...",
        "....cccccccc....",
    ]),
    ("03", {"a": (196, 64, 58), "b": (24, 42, 138), "c": (240, 196, 150)}, [
        "....aaaaaaaa....",
        "...aaaaaaaaaa...",
        "..aaacccccaaaa..",
        ".aaacwwccwwcaaa.",
        ".aaackkccckcaaa.",
        "..aabbbbbbbaaa..",
        ".bbbbbbbbbbbbb..",
        "..bbbbbbbbbbb...",
        "...bbbbbbbbb....",
    ]),
    ("04", {"a": (110, 200, 120), "b": (250, 214, 90), "c": (240, 140, 60)}, [
        "...a..aa..a.....",
        "..aaa.aa.aaa....",
        ".bbbbbbbbbbbb...",
        "bbbwwbbbwwbbbb..",
        "bbbkkbbbkkbbbb..",
        ".bbccccccccbb...",
        "..cccccccccc....",
        "...cccccccc.....",
        "....cccccc......",
    ]),
    ("05", {"a": (16, 122, 142), "b": (150, 214, 206), "c": (10, 62, 78)}, [
        "......aaaa......",
        ".....aaaaaa.....",
        "....aaaaaaaa....",
        "...aaawwkwwaa...",
        "...aaawkkwwaa...",
        "....aabbbbaa....",
        ".....bbbbbb.....",
        "......cccc......",
        "......cccc......",
        ".....cccccc.....",
    ]),
    ("06", {"a": (142, 72, 186), "b": (232, 132, 36), "c": (72, 28, 96)}, [
        "...aaaaabbbbb...",
        "..aaaaaabbbbbb..",
        ".aaaaaaabbbbbbb.",
        "aaaawwkwwbbbwwb.",
        "aaaawkkwwbbbkkb.",
        ".aaaaaabbbbbbb..",
        "..aaaabbbbbcc...",
        "...aaabbbccc....",
        "....aaccccc.....",
    ]),
    ("07", {"a": (92, 48, 32), "b": (228, 186, 140), "c": (48, 22, 18)}, [
        ".ccccccccccccc..",
        "ccbbbbbbbbbbccc.",
        "cbbwwbbwwbbbcc..",
        "cbbkkbbkkbbbcc..",
        "cbbbbbbbbbbbcc..",
        ".cbbbbbbbbbccc..",
        "..ccccccccccc...",
        "...ccccccccc....",
    ]),
    ("08", {"a": (236, 186, 48), "b": (48, 150, 72), "c": (190, 72, 36)}, [
        "....bbbbbbbb....",
        "...baaaaaaaab...",
        "..baaaaaaaaaab..",
        ".baawwaaawwaaab.",
        ".baakkaakkaaaab.",
        "..baaaacccaaab..",
        "...aaaaaaaaa....",
        "....aaacccaa....",
        "......cccc......",
    ]),
    ("09", {"a": (214, 64, 120), "b": (36, 64, 176), "c": (250, 150, 176)}, [
        "..cccaaaaaaccc..",
        ".ccaaaaaaaaaccc.",
        "ccaaaaaaaaaaacc.",
        "caawwaaaawwaaac.",
        "caakkaaaakkaaac.",
        ".cbbbbbbbbbbbc..",
        "..bbbbbbbbbbb...",
        "...bbbbbbbbb....",
        "....bbbbbbb.....",
    ]),
]

for name, palette, rows in faces:
    colors = {k: (*v, 255) for k, v in palette.items()}
    colors["w"] = W
    colors["k"] = K
    width = max(len(r) for r in rows)
    height = len(rows)
    img = Image.new("RGBA", (SIZE, SIZE), CREAM)
    pix = img.load()
    ox = (SIZE - width * CELL) // 2
    oy = (SIZE - height * CELL) // 2
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch not in colors:
                continue
            color = colors[ch]
            for py in range(CELL):
                for px in range(CELL):
                    pix[ox + x * CELL + px, oy + y * CELL + py] = color
    img.save(f"{OUT}/{name}.png")
print("wrote", len(faces))
