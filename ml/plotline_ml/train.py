"""Self-supervised training of the tiny encoder with LeJEPA (SIGReg + view invariance), CPU-friendly.

    python -m plotline_ml.train [--steps 1500] [--batch 128] [--views 4] [--lamb 0.05]

LeJEPA objective (Balestriero & LeCun, 2025): for V augmented views of each patch,
    loss = (1 - lambda) * invariance + lambda * SIGReg
where invariance pulls every view's projection towards the mean over views and SIGReg (Sketched
Isotropic Gaussian Regularisation, ``lejepa.multivariate.SlicingUnivariateTest`` over an Epps-Pulley
univariate test) pushes the projected batch towards an isotropic Gaussian, which prevents collapse
without teacher networks, stop-gradients or schedules of heuristics.

Augmentations model what should NOT count as land change: viewing geometry (crops, flips, 90-degree
rotations), sensor/illumination gain, atmospheric haze (a blue-weighted additive offset with contrast
loss) and noise. No labels are used. Regions in ``HELD_OUT`` are excluded from training entirely.
"""

from __future__ import annotations

import argparse
import json
import math
import time
from pathlib import Path

import lejepa
import numpy as np
import torch
import torch.nn.functional as F

from plotline_ml.model import Projector, TinyEncoder, count_params
from plotline_ml.patches import load_patches

ROOT = Path(__file__).resolve().parents[2]
ARTIFACTS = ROOT / "ml" / "artifacts"
CHECKPOINT = ROOT / "data" / "ml" / "encoder.pt"
HELD_OUT = ("pe_madre_de_dios", "ci_soubre")
HAZE_PROFILE = torch.tensor([1.0, 0.8, 0.6, 0.3, 0.15])


def augment(x: torch.Tensor, g: torch.Generator) -> torch.Tensor:
    """x: (B, C, 32, 32) reflectance -> one augmented view, same shape."""
    b = x.shape[0]
    scale = torch.empty(b).uniform_(0.55, 1.0, generator=g)
    tx = (torch.rand(b, generator=g) * 2 - 1) * (1 - scale)
    ty = (torch.rand(b, generator=g) * 2 - 1) * (1 - scale)
    k = torch.randint(0, 4, (b,), generator=g).float() * (math.pi / 2)
    flip = torch.where(torch.rand(b, generator=g) < 0.5, -1.0, 1.0)
    cos, sin = torch.cos(k) * scale, torch.sin(k) * scale
    theta = torch.stack(
        [torch.stack([cos * flip, -sin, tx], 1), torch.stack([sin * flip, cos, ty], 1)], 1
    )  # (B, 2, 3)
    grid = F.affine_grid(theta, list(x.shape), align_corners=False)
    v = F.grid_sample(x, grid, mode="bilinear", padding_mode="reflection", align_corners=False)
    gain = torch.empty(b, x.shape[1], 1, 1).uniform_(0.88, 1.12, generator=g)
    haze = torch.empty(b, 1, 1, 1).uniform_(0.0, 0.035, generator=g) * HAZE_PROFILE[: x.shape[1]].view(1, -1, 1, 1)
    contrast = torch.empty(b, 1, 1, 1).uniform_(0.0, 0.2, generator=g)
    mean = v.mean(dim=(2, 3), keepdim=True)
    v = (v * (1 - contrast) + mean * contrast) * gain + haze
    return v + torch.randn(v.shape, generator=g) * 0.004


def normalise(x: torch.Tensor, mean: torch.Tensor, std: torch.Tensor) -> torch.Tensor:
    return (x - mean.view(1, -1, 1, 1)) / std.view(1, -1, 1, 1)


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--steps", type=int, default=1500)
    ap.add_argument("--batch", type=int, default=128)
    ap.add_argument("--views", type=int, default=4)
    ap.add_argument("--lamb", type=float, default=0.05)
    ap.add_argument("--lr", type=float, default=2e-3)
    ap.add_argument("--slices", type=int, default=256)
    ap.add_argument("--seed", type=int, default=0)
    ap.add_argument("--threads", type=int, default=4)
    args = ap.parse_args()

    torch.manual_seed(args.seed)
    torch.set_num_threads(args.threads)
    g = torch.Generator().manual_seed(args.seed)

    ps = load_patches()
    train_mask = ~np.isin(ps.region, HELD_OUT)
    imgs = []
    for arr, clear in ((ps.baseline, ps.clear_baseline), (ps.current, ps.clear_current)):
        keep = train_mask & (clear >= 0.9)
        imgs.append(arr[keep])
    data = torch.from_numpy(np.concatenate(imgs)).float()
    band_mean = data.mean(dim=(0, 2, 3))
    band_std = data.std(dim=(0, 2, 3)) + 1e-6
    print(f"training images: {len(data)} from {len(set(ps.region[train_mask]))} regions")

    enc, proj = TinyEncoder(in_ch=data.shape[1]), Projector()
    print(f"encoder parameters: {count_params(enc):,} (+ projector {count_params(proj):,}, training only)")
    sigreg = lejepa.multivariate.SlicingUnivariateTest(
        univariate_test=lejepa.univariate.EppsPulley(n_points=17), num_slices=args.slices
    )
    params = list(enc.parameters()) + list(proj.parameters())
    opt = torch.optim.AdamW(params, lr=args.lr, weight_decay=5e-4)
    warmup = max(args.steps // 15, 1)
    sched = torch.optim.lr_scheduler.SequentialLR(
        opt,
        [
            torch.optim.lr_scheduler.LinearLR(opt, start_factor=0.01, total_iters=warmup),
            torch.optim.lr_scheduler.CosineAnnealingLR(opt, T_max=args.steps - warmup, eta_min=args.lr / 1000),
        ],
        milestones=[warmup],
    )
    log: list[dict] = []
    t0 = time.time()
    enc.train()
    proj.train()
    for step in range(1, args.steps + 1):
        idx = torch.randint(0, len(data), (args.batch,), generator=g)
        x = data[idx]
        views = torch.cat([normalise(augment(x, g), band_mean, band_std) for _ in range(args.views)])
        z = proj(enc(views)).view(args.views, args.batch, -1)  # (V, B, D)
        inv = (z.mean(0, keepdim=True) - z).square().mean()
        sig = sigreg(z)
        loss = (1 - args.lamb) * inv + args.lamb * sig
        opt.zero_grad(set_to_none=True)
        loss.backward()
        opt.step()
        sched.step()
        if step % 50 == 0 or step == 1:
            rec = {
                "step": step,
                "loss": round(loss.item(), 5),
                "invariance": round(inv.item(), 5),
                "sigreg": round(sig.item(), 5),
                "seconds": round(time.time() - t0, 1),
            }
            log.append(rec)
            print(json.dumps(rec), flush=True)

    CHECKPOINT.parent.mkdir(parents=True, exist_ok=True)
    torch.save(
        {
            "encoder": enc.state_dict(),
            "band_mean": band_mean,
            "band_std": band_std,
            "args": vars(args),
            "held_out": HELD_OUT,
            "train_images": len(data),
            "train_seconds": round(time.time() - t0, 1),
        },
        CHECKPOINT,
    )
    ARTIFACTS.mkdir(parents=True, exist_ok=True)
    (ARTIFACTS / "train_log.json").write_text(
        json.dumps(
            {
                "args": vars(args),
                "held_out_regions": list(HELD_OUT),
                "train_images": len(data),
                "encoder_parameters": count_params(enc),
                "train_seconds": round(time.time() - t0, 1),
                "device": "cpu",
                "curve": log,
            },
            indent=2,
        )
    )
    print(f"saved {CHECKPOINT} in {time.time() - t0:.0f}s")


if __name__ == "__main__":
    main()
