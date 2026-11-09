"""Acha arquivos do programa (ícone), tanto rodando pelo Python quanto dentro do .exe."""
import sys
from pathlib import Path


def caminho(nome):
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return str(base / nome)
