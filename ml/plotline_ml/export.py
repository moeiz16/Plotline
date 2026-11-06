"""Export the trained encoder to a small NumPy archive (batch norm folded into conv weights).

    python -m plotline_ml.export

Writes ``ml/artifacts/encoder.npz`` (weights, band statistics, metadata) and ``ml/artifacts/reference.npz``
(a few input patches with their expected embeddings) so the API can verify its NumPy forward pass.
"""

from __future__ import annotations

import json
from datetime import UTC, datetime

import numpy as np
import torch

from plotline_ml.model import CHANNELS, STRIDES, TinyEncoder, count_params
from plotline_ml.npencoder import embed, load_weights
from plotline_ml.train import ARTIFACTS, CHECKPOINT, normalise

ENCODER_VERSION = "plotline-lejepa-s2-v1"


def fold(enc: TinyEncoder) -> dict[str, np.ndarray]:
    out: dict[str, np.ndarray] = {}
    mods = list(enc.features)
    i = 0
    for k in range(0, len(mods), 3):
        conv, bn = mods[k], mods[k + 1]
        scale = bn.weight.detach() / torch.sqrt(bn.running_var + bn.eps)
        out[f"conv{i}_w"] = (conv.weight.detach() * scale.view(-1, 1, 1, 1)).numpy().astype(np.float32)
        out[f"conv{i}_b"] = (bn.bias.detach() - bn.running_mean * scale).numpy().astype(np.float32)
        out[f"conv{i}_stride"] = np.array(conv.stride[0])
        i += 1
    out["n_convs"] = np.array(i)
    out["head_w"] = enc.head.weight.detach().numpy().astype(np.float32)
    out["head_b"] = enc.head.bias.detach().numpy().astype(np.float32)
    return out


def main() -> None:
    ck = torch.load(CHECKPOINT, weights_only=False, map_location="cpu")
    enc = TinyEncoder(in_ch=len(ck["band_mean"]))
    enc.load_state_dict(ck["encoder"])
    enc.eval()
    arrays = fold(enc)
    meta = {
        "version": ENCODER_VERSION,
        "architecture": {
            "channels": list(CHANNELS),
            "strides": list(STRIDES),
            "embed_dim": enc.head.out_features,
        },
        "parameters": count_params(enc),
        "bands": ["B02", "B03", "B04", "B08", "B11"],
        "patch_px": 32,
        "gsd_m": 10,
        "objective": "LeJEPA: (1-lambda)*invariance + lambda*SIGReg (Epps-Pulley, sliced)",
        "train_args": ck["args"],
        "held_out_regions": list(ck["held_out"]),
        "train_images": ck["train_images"],
        "train_seconds": ck["train_seconds"],
        "exported_at": datetime.now(UTC).isoformat(timespec="seconds"),
    }
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    path = ARTIFACTS / "encoder.npz"
    np.savez_compressed(
        path,
        **arrays,
        band_mean=ck["band_mean"].numpy().astype(np.float32),
        band_std=ck["band_std"].numpy().astype(np.float32),
        meta=np.array(json.dumps(meta)),
    )
    weights = load_weights(path)
    rng = np.random.default_rng(7)
    x = (rng.random((6, len(ck["band_mean"]), 32, 32)) * 0.3).astype(np.float32)
    with torch.no_grad():
        ref = enc(normalise(torch.from_numpy(x), ck["band_mean"], ck["band_std"])).numpy()
    got = embed(weights, x)
    err = float(np.abs(got - ref).max())
    np.savez_compressed(ARTIFACTS / "reference.npz", inputs=x, embeddings=ref)
    print(
        f"exported {path} ({path.stat().st_size / 1024:.0f} KB, sha256 {weights.sha256[:12]}), "
        f"max |numpy - torch| = {err:.2e}"
    )
    if err > 1e-3:
        raise SystemExit("NumPy forward pass does not match PyTorch")


if __name__ == "__main__":
    main()
