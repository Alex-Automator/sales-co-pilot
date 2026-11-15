"""Build one self-contained preview.html from index.html, css/ and js/."""
import pathlib, re
root = pathlib.Path(__file__).resolve().parent.parent
html = (root / "index.html").read_text(encoding="utf-8")
html = re.sub(r'<link rel="stylesheet" href="([^"]+)">',
              lambda m: "<style>\n" + (root / m.group(1)).read_text(encoding="utf-8") + "</style>", html)
html = re.sub(r'<link rel="(icon|alternate icon|apple-touch-icon)"[^>]*>\n', "", html)
html = re.sub(r'<script src="https://[^"]+"></script>\n', "", html)
html = html.replace('<script src="js/firebase-config.js"></script>\n', "")
html = re.sub(r'<script src="([^"]+)"></script>',
              lambda m: "<script>\n" + (root / m.group(1)).read_text(encoding="utf-8") + "</script>", html)
(root / "preview.html").write_text(html, encoding="utf-8")
print("preview.html", len(html), "bytes")
