"""Tiny convolutional encoder for 32 x 32 Sentinel-2 patches (5 bands), ~0.45 M parameters.

The architecture is deliberately plain (3x3 conv + batch norm + ReLU, global average pooling, linear head)
so the trained network can be exported to a handful of NumPy arrays and run inside the API without any
deep-learning runtime (see ``export.py`` and ``backend/app/ml/encoder.py``).
"""

from __future__ import annotations

import torch
from torch import nn

CHANNELS: tuple[int, ...] = (32, 64, 64, 128, 128, 128)
STRIDES: tuple[int, ...] = (1, 2, 1, 2, 1, 2)
EMBED_DIM = 128
PROJ_DIM = 64


class TinyEncoder(nn.Module):
    def __init__(self, in_ch: int = 5, embed_dim: int = EMBED_DIM) -> None:
        super().__init__()
        layers: list[nn.Module] = []
        c = in_ch
        for out, stride in zip(CHANNELS, STRIDES, strict=True):
            layers += [nn.Conv2d(c, out, 3, stride, 1, bias=False), nn.BatchNorm2d(out), nn.ReLU(inplace=True)]
            c = out
        self.features = nn.Sequential(*layers)
        self.head = nn.Linear(c, embed_dim)

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.head(self.features(x).mean(dim=(2, 3)))


class Projector(nn.Module):
    """Training-only projection head; SIGReg and the invariance term act on its output."""

    def __init__(self, embed_dim: int = EMBED_DIM, proj_dim: int = PROJ_DIM) -> None:
        super().__init__()
        self.net = nn.Sequential(
            nn.Linear(embed_dim, 256), nn.BatchNorm1d(256), nn.ReLU(inplace=True), nn.Linear(256, proj_dim)
        )

    def forward(self, x: torch.Tensor) -> torch.Tensor:
        return self.net(x)


def count_params(module: nn.Module) -> int:
    return sum(p.numel() for p in module.parameters())
