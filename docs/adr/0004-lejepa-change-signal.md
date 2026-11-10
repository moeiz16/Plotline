# ADR 0004: A tiny LeJEPA-trained encoder for the land-change signal, served with NumPy

Status: accepted

## Context
Satellite imagery is abundant, labels are scarce. LeJEPA (Balestriero & LeCun, 2025) trains joint-embedding
encoders with a single objective, view invariance plus SIGReg (sketched isotropic Gaussian regularisation),
without teacher networks or stop-gradients, and works at small batch sizes. The project may run one tiny model
locally (< 10 M parameters, < 200 MB RAM).

## Decision
Train a ~0.45 M-parameter CNN on 32 × 32 Sentinel-2 patches (B02, B03, B04, B08, B11 at 10 m) with the
`lejepa` reference package (pinned to a commit; Epps–Pulley test, sliced) on a laptop CPU at demo scale (nine
10 km commodity landscapes in Côte d'Ivoire, Ghana, Brazil, Indonesia and Peru, downloaded anonymously from
Planetary Computer; 1,500 steps in about 22 minutes), and as a Kaggle notebook for full-scale GPU training
over a longer region list. Augmentations encode what is *not* land change (viewing geometry, gain,
haze, noise). Export with batch norm folded into the convolutions to `ml/artifacts/encoder.npz` (< 2 MB) and run
the forward pass in NumPy inside the API, so the API has no deep-learning runtime. Change score = cosine
distance between 2020 and current embeddings; similar plots = cosine nearest neighbours. Evaluate at plot level
against Hansen loss within JRC 2020 forest, with NDVI/NBR differencing and a random-init encoder as baselines,
two regions held out of training (Madre de Dios, Peru, and Western North, Ghana), and publish the numbers in
the README whatever they are.

## Consequences
A real, measured innovation that stays cheap to run (0.44 M parameters, a 1.6 MB weights file). The measured
result is mixed, and the design accounts for it: on the held-out regions the LeJEPA score reaches ROC-AUC 0.89
(untrained encoder 0.80, NDVI drop 0.65), but across all nine regions it reaches 0.65, below plain NBR
differencing (0.81), and at the API threshold it recovers about 9 % of loss plots. At demo scale it is therefore
a second signal that routes plots to review, not a classifier we trust alone (ADR 0001). Full-scale training
needs a Kaggle account (free GPU) and more regions.
