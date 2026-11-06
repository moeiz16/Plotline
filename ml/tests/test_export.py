"""The NumPy forward pass (batch norm folded) must match the PyTorch encoder, and stay vendored unchanged."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pytest
import torch

from plotline_ml.export import fold
from plotline_ml.model import TinyEncoder, count_params
from plotline_ml.npencoder import cosine_distance, embed, load_weights
from plotline_ml.train import HELD_OUT, augment, normalise

ROOT = Path(__file__).resolve().parents[2]


def _random_encoder(seed: int = 0) -> TinyEncoder:
    torch.manual_seed(seed)
    enc = TinyEncoder()
    for m in enc.modules():
        if isinstance(m, torch.nn.BatchNorm2d):  # non-trivial running statistics so folding is exercised
            m.running_mean.uniform_(-0.5, 0.5)
            m.running_var.uniform_(0.5, 2.0)
            m.weight.data.uniform_(0.5, 1.5)
            m.bias.data.uniform_(-0.2, 0.2)
    return enc.eval()


def _export(enc: TinyEncoder, path: Path, mean: np.ndarray, std: np.ndarray) -> None:
    np.savez(path, **fold(enc), band_mean=mean, band_std=std, meta=np.array(json.dumps({"version": "test"})))


def test_encoder_is_tiny() -> None:
    assert count_params(TinyEncoder()) < 5_000_000


def test_numpy_matches_torch(tmp_path: Path) -> None:
    enc = _random_encoder()
    mean = np.array([0.03, 0.05, 0.04, 0.28, 0.2], np.float32)
    std = np.array([0.02, 0.02, 0.03, 0.08, 0.06], np.float32)
    _export(enc, tmp_path / "enc.npz", mean, std)
    w = load_weights(tmp_path / "enc.npz")
    x = (np.random.default_rng(1).random((5, 5, 32, 32)) * 0.4).astype(np.float32)
    with torch.no_grad():
        ref = enc(normalise(torch.from_numpy(x), torch.from_numpy(mean), torch.from_numpy(std))).numpy()
    got = embed(w, x, batch=2)
    assert got.shape == (5, 128)
    assert np.abs(got - ref).max() < 1e-4


def test_cosine_distance_range() -> None:
    a = np.array([[1.0, 0.0], [1.0, 0.0], [1.0, 1.0]])
    b = np.array([[1.0, 0.0], [-1.0, 0.0], [0.0, 1.0]])
    np.testing.assert_allclose(cosine_distance(a, b), [0.0, 2.0, 1 - np.sqrt(0.5)], atol=1e-6)


def test_augment_keeps_shape_and_is_seeded() -> None:
    x = torch.rand(4, 5, 32, 32) * 0.3
    a = augment(x, torch.Generator().manual_seed(3))
    b = augment(x, torch.Generator().manual_seed(3))
    assert a.shape == x.shape
    assert torch.allclose(a, b)


def test_held_out_regions_have_forest_plots() -> None:
    assert "pe_madre_de_dios" in HELD_OUT and "gh_western_north" in HELD_OUT
    assert "ci_soubre" not in HELD_OUT


def test_backend_vendors_the_same_forward_pass() -> None:
    vendored = ROOT / "backend" / "app" / "ml" / "encoder.py"
    source = ROOT / "ml" / "plotline_ml" / "npencoder.py"
    assert vendored.read_text() == source.read_text()


@pytest.mark.skipif(not (ROOT / "ml" / "artifacts" / "reference.npz").exists(), reason="encoder not exported")
def test_exported_encoder_reproduces_reference() -> None:
    w = load_weights(ROOT / "ml" / "artifacts" / "encoder.npz")
    ref = np.load(ROOT / "ml" / "artifacts" / "reference.npz")
    assert np.abs(embed(w, ref["inputs"]) - ref["embeddings"]).max() < 1e-3
