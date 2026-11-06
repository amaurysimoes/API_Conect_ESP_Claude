"""Gera fire_page/src/topicos.js a partir de app/info_card.py (TOPICOS), para o card de Informações do site ser
SEMPRE igual ao do programa. Uso (na raiz):  .venv\\Scripts\\python.exe tools\\gerar_topicos_site.py
(o tools\\gerar_estrutura.py também chama este gerador)."""
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from app.info_card import TOPICOS  # noqa: E402

OUT = ROOT / "fire_page" / "src" / "topicos.js"


def main():
    itens = [{"titulo": t, "onde": o, "que": q, "serve": s, "usar": u} for t, o, q, s, u in TOPICOS]
    texto = ("// GERADO por tools/gerar_topicos_site.py a partir de app/info_card.py: NÃO edite aqui.\n"
             "// Para mudar o conteúdo do card de Informações, edite TOPICOS em app/info_card.py e gere de novo.\n"
             "export const TOPICOS = " + json.dumps(itens, ensure_ascii=False, indent=2) + ";\n")
    OUT.write_text(texto, encoding="utf-8")
    print(f"Gerado: {OUT} ({len(itens)} tópicos)")


if __name__ == "__main__":
    main()
