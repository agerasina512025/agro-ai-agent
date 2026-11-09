# -*- coding: utf-8 -*-
"""Собирает data/knowledge-base.json в JS-файл для статического прототипа."""
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SRC = ROOT / "data" / "knowledge-base.json"
DST = ROOT / "assets" / "js" / "knowledge-base.js"


def main() -> None:
    data = json.loads(SRC.read_text(encoding="utf-8"))

    product_ids = {p["id"] for p in data["products"]}
    if len(product_ids) != len(data["products"]):
        raise SystemExit("Повторяющиеся id товаров")
    for p in data["products"]:
        missing = {"id", "name", "category", "price", "stock", "specs", "keywords"} - set(p)
        if missing:
            raise SystemExit(f"{p['id']}: нет полей {sorted(missing)}")
    if len(data["categories"]) != len({c["id"] for c in data["categories"]}):
        raise SystemExit("Повторяющиеся категории")

    payload = json.dumps(data, ensure_ascii=False, indent=2)
    DST.parent.mkdir(parents=True, exist_ok=True)
    DST.write_text(
        "/* Сгенерировано tools/build_kb.py из data/knowledge-base.json. Не править вручную. */\n"
        f"window.AGRO_KB = {payload};\n",
        encoding="utf-8",
    )
    print(f"OK: {DST.relative_to(ROOT)} — {len(data['products'])} позиций, {len(data['faq'])} вопросов")


if __name__ == "__main__":
    main()
