# ADR 0004: A tiny LeJEPA-trained encoder for the land-change signal, served with NumPy

Status: accepted

## Context
Satellite imagery is abundant, labels are scarce. LeJEPA (Balestriero & LeCun, 2025) trains joint-embedding
encoders with a single objective, view invariance plus SIGReg (sketched isotropic Gaussian regularisation),
without teacher networks or stop-gradients, and works at small batch sizes. The project may run one tiny model
locally (< 10 M parameters, < 200 MB RAM).

## Decision
Train a ~0.45 M-parameter CNN on 32 × 32 Sentinel-2 patches (B02, B03, B04, B08, B11 at 10 m) with the
`lejepa` reference package (Epps–Pulley test, sliced), on CPU in minutes at demo scale (9 commodity landscapes in
Côte d'Ivoire, Ghana, Brazil, Indonesia, Peru, downloaded anonymously from Planetary Computer), and as a Kaggle
notebook for full-scale GPU training. Augmentations encode what is *not* land change (viewing geometry, gain,
haze, noise). Export with batch norm folded into the convolutions to `ml/artifacts/encoder.npz` (< 2 MB) and run
the forward pass in NumPy inside the API, so the API has no deep-learning runtime. Change score = cosine
distance between 2020 and current embeddings; similar plots = cosine nearest neighbours. Evaluate at plot level
against Hansen loss within JRC 2020 forest, with NDVI/NBR differencing and a random-init encoder as baselines,
two regions held out of training, and publish the numbers in the README whatever they are.

## Consequences
A real, measured innovation that stays cheap to run. At demo scale it is a second signal, not a classifier we
trust alone (ADR 0001). Full-scale training needs a Kaggle account (free GPU) and more regions.
