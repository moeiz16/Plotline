# Land-change signal vs Hansen forest loss (plot level)

Labels: Hansen GFC-2025-v1.13 loss 2021-2025 within EU JRC GFC2020-V4 forest; positive = loss share >= 5% of a 10.24 ha plot; eligible = JRC forest share >= 30%, both composites >= 90% clear.

Plots: 9216 · eligible: 3435 · positives: 1467 · negatives: 1518 · ambiguous (excluded): 450

## Reading the numbers

- On the regions held out of training the LeJEPA change score reaches ROC-AUC 0.8927 (above the best spectral index, ndvi_drop 0.6503; random-init encoder 0.7979). Self-supervised training adds over the same untrained architecture.
- Across all regions it reaches 0.6509, below nbr_drop (0.8128): at demo scale (9 landscapes, 1,500 CPU steps) the score is not calibrated across landscapes.
- At the review operating point (at most 10 % false alarms) it recovers 0.0872 of loss plots across all regions with precision 0.5. That is why the signal only routes plots to a reviewer and never decides a verdict; the official forest datasets do.
- Held-out positives are the majority class (base rate above 50 %), so held-out precision and F1 are optimistic; ROC-AUC is the fairer comparison.

## All regions

| Score | ROC-AUC | Avg. precision | Precision | Recall | F1 | n (pos) |
|---|---|---|---|---|---|---|
| lejepa | 0.6509 | 0.5641 | 0.5711 | 0.8978 | 0.6981 | 2985 (1467) |
| random_init | 0.5834 | 0.519 | 0.5447 | 0.9455 | 0.6912 | 2985 (1467) |
| ndvi_drop | 0.7397 | 0.7109 | 0.6996 | 0.7425 | 0.7204 | 2985 (1467) |
| nbr_drop | 0.8128 | 0.7419 | 0.7349 | 0.827 | 0.7782 | 2985 (1467) |

At the review operating point (threshold set for at most 10 % false alarms on loss-free plots):

| Score | Threshold | Precision | Recall | False-alarm rate |
|---|---|---|---|---|
| lejepa | 0.62134 | 0.5 | 0.0872 | 0.0843 |
| random_init | 0.00019 | 0.3985 | 0.0722 | 0.1054 |
| ndvi_drop | 0.04066 | 0.769 | 0.4128 | 0.1199 |
| nbr_drop | 0.06345 | 0.7995 | 0.4837 | 0.1173 |

## Held-out regions (never seen in training)

| Score | ROC-AUC | Avg. precision | Precision | Recall | F1 | n (pos) |
|---|---|---|---|---|---|---|
| lejepa | 0.8927 | 0.9348 | 0.8132 | 0.9867 | 0.8916 | 442 (299) |
| random_init | 0.7979 | 0.895 | 0.7095 | 0.9933 | 0.8278 | 442 (299) |
| ndvi_drop | 0.6503 | 0.8564 | 0.6728 | 0.9733 | 0.7956 | 442 (299) |
| nbr_drop | 0.6403 | 0.8481 | 0.6787 | 1.0 | 0.8086 | 442 (299) |

At the review operating point (threshold set for at most 10 % false alarms on loss-free plots):

| Score | Threshold | Precision | Recall | False-alarm rate |
|---|---|---|---|---|
| lejepa | 0.4126 | 0.9123 | 0.6933 | 0.1389 |
| random_init | 3e-05 | 0.8868 | 0.6267 | 0.1667 |
| ndvi_drop | 0.03765 | 0.8624 | 0.6267 | 0.2083 |
| nbr_drop | 0.0539 | 0.86 | 0.5733 | 0.1944 |

## ROC-AUC per region

| Region | LeJEPA | Random init | NDVI drop | NBR drop | n (pos) |
|---|---|---|---|---|---|
| br_novo_progresso | 0.85 | 0.871 | 0.92 | 0.93 | 762 (512) |
| br_porto_velho | 0.74 | 0.76 | 0.741 | 0.734 | 541 (137) |
| ci_cavally | 0.774 | 0.391 | 0.806 | 0.83 | 242 (220) |
| gh_western_north | 0.716 | 0.54 | 0.387 | 0.431 | 127 (101) |
| id_east_kalimantan | 0.64 | 0.649 | 0.84 | 0.856 | 735 (135) |
| id_riau | 0.725 | 0.652 | 0.596 | 0.741 | 54 (40) |
| pe_madre_de_dios | 0.934 | 0.887 | 0.934 | 0.897 | 315 (198) |
| pe_san_martin | 0.599 | 0.596 | 0.627 | 0.624 | 209 (124) |

API operating threshold: 0.62134 (cosine distance; 10 % false alarms on loss-free 2020-forest plots (all regions, calibration half)).

Similar-plot search precision@5 (same 2020 land cover): 0.8831 (majority-class chance 0.6423).
