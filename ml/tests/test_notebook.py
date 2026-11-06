"""The Kaggle notebook embeds the current package sources (rebuild with ml/notebooks/build_notebook.py)."""

from __future__ import annotations

import importlib.util
import json
from pathlib import Path

NB_DIR = Path(__file__).resolve().parents[1] / "notebooks"


def test_notebook_is_in_sync_with_the_package() -> None:
    spec = importlib.util.spec_from_file_location("build_notebook", NB_DIR / "build_notebook.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    committed = json.loads((NB_DIR / "plotline_lejepa_kaggle.ipynb").read_text())
    assert committed == json.loads(json.dumps(mod.build())), "run ml/notebooks/build_notebook.py"


def test_notebook_trains_on_gpu_and_evaluates() -> None:
    nb = json.loads((NB_DIR / "plotline_lejepa_kaggle.ipynb").read_text())
    text = "".join("".join(c["source"]) for c in nb["cells"])
    for step in (
        "plotline_ml.fetch --set full",
        "plotline_ml.train --device cuda",
        "plotline_ml.export",
        "plotline_ml.evaluate",
    ):
        assert step in text
