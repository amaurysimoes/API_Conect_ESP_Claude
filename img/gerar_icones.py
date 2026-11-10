"""Gera os ícones do app Android a partir de img/icone.png (o ícone oficial do projeto).

Rodar na pasta api_conect (precisa do Pillow: está no .venv do aplicacao_desk_agente):
  aplicacao_desk_agente\\agente_python\\.venv\\Scripts\\python.exe img\\gerar_icones.py

Para trocar o ícone: troque img/icone.png (veja o CLAUDE.md) e rode de novo; depois compile o app.
"""
import os
from pathlib import Path

from PIL import Image

raiz = Path(__file__).resolve().parent.parent
res = raiz / "aplicacao_android" / "app" / "src" / "main" / "res"
origem = Image.open(raiz / "img" / "icone.png").convert("RGBA")

DENSIDADES = {"mdpi": 1, "hdpi": 1.5, "xhdpi": 2, "xxhdpi": 3, "xxxhdpi": 4}
FUNDO = (15, 17, 21, 255)          # o mesmo fundo escuro do app

for nome, f in DENSIDADES.items():
    (res / f"mipmap-{nome}").mkdir(parents=True, exist_ok=True)
    (res / f"drawable-{nome}").mkdir(parents=True, exist_ok=True)

    # ícone do app (aparelhos antigos): circuito sobre o fundo escuro
    t = int(48 * f)
    base = Image.new("RGBA", (t, t), FUNDO)
    m = int(t * 0.10)
    base.alpha_composite(origem.resize((t - 2 * m, t - 2 * m), Image.LANCZOS), (m, m))
    base.save(res / f"mipmap-{nome}" / "ic_launcher.png")

    # primeiro plano do ícone adaptativo (Android 8+): 108dp, desenho a 68% (cabe na zona segura do círculo)
    t2 = int(108 * f)
    fg = Image.new("RGBA", (t2, t2), (0, 0, 0, 0))
    d = int(t2 * 0.68)
    fg.alpha_composite(origem.resize((d, d), Image.LANCZOS), ((t2 - d) // 2, (t2 - d) // 2))
    fg.save(res / f"mipmap-{nome}" / "ic_launcher_foreground.png")

    # ícone da notificação: só a silhueta branca (o Android exige)
    t3 = int(24 * f)
    pequeno = origem.resize((t3, t3), Image.LANCZOS)
    branco = Image.new("RGBA", (t3, t3), (255, 255, 255, 255))
    branco.putalpha(pequeno.split()[3])
    branco.save(res / f"drawable-{nome}" / "ic_stat.png")

(res / "drawable-nodpi").mkdir(parents=True, exist_ok=True)
origem.save(res / "drawable-nodpi" / "icone.png")      # o ícone dentro da janela do app
print("ícones do Android gerados a partir de img/icone.png")
