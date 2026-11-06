"""The API's NumPy encoder is the exported LeJEPA encoder: same code, same outputs as PyTorch."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest

from app.ml.change import PATCH, high_threshold, level_for, load_encoder, patch_windows
from app.ml.encoder import cosine_distance, embed

ROOT = Path(__file__).resolve().parents[3]
ARTIFACTS = ROOT / "ml" / "artifacts"
needs_export = pytest.mark.skipif(not (ARTIFACTS / "reference.npz").exists(), reason="encoder not exported")


def test_vendored_forward_pass_is_identical_to_the_training_package() -> None:
    src = ROOT / "ml" / "plotline_ml" / "npencoder.py"
    if not src.exists():
        pytest.skip("ml package not present")
    assert (ROOT / "backend" / "app" / "ml" / "encoder.py").read_text() == src.read_text()


@needs_export
def test_numpy_embeddings_match_pytorch_reference() -> None:
    w = load_encoder(ARTIFACTS / "encoder.npz")
    ref = np.load(ARTIFACTS / "reference.npz")
    got = embed(w, ref["inputs"])
    assert got.shape == ref["embeddings"].shape
    assert np.abs(got - ref["embeddings"]).max() < 1e-3
    assert cosine_distance(got, ref["embeddings"]).max() < 1e-5


@needs_export
def test_encoder_metadata() -> None:
    w = load_encoder(ARTIFACTS / "encoder.npz")
    assert w.meta["version"] == "plotline-lejepa-s2-v1"
    assert w.meta["parameters"] < 5_000_000
    assert w.meta["bands"] == ["B02", "B03", "B04", "B08", "B11"]
    assert set(w.meta["held_out_regions"]) == {"pe_madre_de_dios", "gh_western_north"}
    assert (ARTIFACTS / "encoder.npz").stat().st_size < 20 * 1024 * 1024


@needs_export
def test_threshold_comes_from_the_hansen_evaluation() -> None:
    data = json.loads((ARTIFACTS / "eval.json").read_text())
    assert high_threshold(ARTIFACTS / "eval.json") == pytest.approx(data["api_threshold"])


def test_missing_encoder_is_handled(tmp_path: Path) -> None:
    assert load_encoder(tmp_path / "missing.npz") is None


def test_change_levels() -> None:
    assert level_for(None, 0.1) is None
    assert level_for(0.2, 0.1) == "high"
    assert level_for(0.1, 0.1) == "high"
    assert level_for(0.06, 0.1) == "elevated"
    assert level_for(0.01, 0.1) == "low"


def test_patch_windows_cover_the_plot() -> None:
    small = np.zeros((48, 48), bool)
    small[20:30, 18:28] = True
    wins = patch_windows(small)
    assert len(wins) == 1 and wins[0][2] == pytest.approx(100 / PATCH**2)
    big = np.zeros((120, 120), bool)
    big[10:110, 15:105] = True
    wins = patch_windows(big)
    covered = np.zeros_like(big)
    for r, c, _ in wins:
        covered[r : r + PATCH, c : c + PATCH] = True
    assert covered[big].all()
    assert patch_windows(np.zeros((20, 20), bool)) == []
