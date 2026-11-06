"""Build the Kaggle notebook from the package sources, so the notebook never drifts from ``plotline_ml``.

    ml/.venv/bin/python ml/notebooks/build_notebook.py

Writes ``ml/notebooks/plotline_lejepa_kaggle.ipynb``: it writes the package into the Kaggle working directory,
fetches the full region set (internet on), trains on the GPU, exports ``encoder.npz`` and evaluates against
Hansen loss labels on the held-out regions.
"""

from __future__ import annotations

import json
from pathlib import Path

HERE = Path(__file__).resolve().parent
PKG = HERE.parent / "plotline_ml"
MODULES = ["__init__", "regions", "fetch", "patches", "model", "npencoder", "train", "export", "evaluate"]


def md(text: str) -> dict:
    return {"cell_type": "markdown", "metadata": {}, "source": text.strip("\n").splitlines(keepends=True)}


def code(text: str) -> dict:
    return {
        "cell_type": "code",
        "metadata": {},
        "execution_count": None,
        "outputs": [],
        "source": text.strip("\n").splitlines(keepends=True),
    }


def build() -> dict:
    cells = [
        md("""
# Plotline land-change encoder: full-scale LeJEPA training on a Kaggle GPU

Plotline checks whether EUDR commodity plots were deforested after 31 December 2020. The verdict comes from
official forest maps (EU JRC GFC2020, Hansen Global Forest Change); a **tiny self-supervised encoder trained
with LeJEPA** (SIGReg, Balestriero & LeCun 2025) adds a second signal: the cosine distance between a plot's
2020 and current Sentinel-2 embeddings.

The repository trains a demo-scale encoder on CPU in minutes (`make train`, 9 regions). This notebook runs the
same code at full scale:

1. fetch 32 commodity landscapes (9 demo + 23 extra) from Microsoft Planetary Computer (anonymous), Hansen
   GFC-2025-v1.13 and JRC GFC2020 V4 — about 30-60 min with internet on;
2. train with LeJEPA on the GPU (20k steps, batch 512, 8 views);
3. export `encoder.npz` (batch norm folded, NumPy forward pass, < 2 MB) and check NumPy = PyTorch;
4. evaluate at plot level against Hansen loss on regions held out of training (ROC-AUC, precision, recall),
   with NDVI / NBR differencing and a random-init encoder as baselines.

**Settings:** Accelerator GPU (T4 or P100), Internet on. Copy `/kaggle/working/plotline/ml/artifacts/` back to
`ml/artifacts/` in the repository to use the new encoder in the API.
"""),
        code("""
%%bash
pip install -q \\
    "lejepa @ git+https://github.com/galilai-group/lejepa.git@c293d291ca87cd4fddee9d3fffe4e914c7272052" \\
    "rasterio>=1.4" "pystac-client>=0.8" "planetary-computer>=1.0" "scikit-learn>=1.5"
nvidia-smi --query-gpu=name,memory.total --format=csv
"""),
        code("""
import os
import pathlib

ROOT = pathlib.Path("/kaggle/working/plotline")
(ROOT / "ml" / "plotline_ml").mkdir(parents=True, exist_ok=True)
(ROOT / "data").mkdir(exist_ok=True)
os.chdir(ROOT / "ml")
print(os.getcwd())
"""),
        md("## Package sources (generated from `ml/plotline_ml/`)"),
    ]
    for name in MODULES:
        src = (PKG / f"{name}.py").read_text()
        cells.append(code(f"%%writefile /kaggle/working/plotline/ml/plotline_ml/{name}.py\n{src}"))
    cells += [
        md("## 1. Fetch the full region set (skips regions already on disk)"),
        code("!python -m plotline_ml.fetch --set full --scenes 8"),
        md("## 2. Train with LeJEPA on the GPU"),
        code(
            "!python -m plotline_ml.train --device cuda --steps 20000 --batch 512 --views 8 "
            "--lr 2e-3 --slices 512"
        ),
        md("## 3. Export the NumPy encoder (parity with PyTorch is checked on export)"),
        code("!python -m plotline_ml.export"),
        md("## 4. Evaluate against Hansen loss on the held-out regions"),
        code("!python -m plotline_ml.evaluate"),
        code("""
from IPython.display import Markdown, display

display(Markdown((ROOT / "ml" / "artifacts" / "EVAL.md").read_text()))
"""),
        code("""
import shutil

shutil.make_archive("/kaggle/working/plotline_artifacts", "zip", ROOT / "ml" / "artifacts")
print("download /kaggle/working/plotline_artifacts.zip and unpack it into ml/artifacts/")
"""),
    ]
    return {
        "cells": cells,
        "metadata": {
            "kernelspec": {"display_name": "Python 3", "language": "python", "name": "python3"},
            "language_info": {"name": "python"},
            "kaggle": {"accelerator": "gpu", "isInternetEnabled": True},
        },
        "nbformat": 4,
        "nbformat_minor": 5,
    }


if __name__ == "__main__":
    out = HERE / "plotline_lejepa_kaggle.ipynb"
    out.write_text(json.dumps(build(), indent=1, ensure_ascii=False) + "\n")
    print(f"wrote {out}")
