# Plotline evaluation gates

Run 2026-11-13T21:14:49+00:00 · offline (bundled landscape) · overall: **PASS**

| Gate | Result | Detail |
|---|---|---|
| Geometry rules | PASS | 16/16 labelled EUDR geometry cases |
| Verdict rules | PASS | 35/35 (9 rule-table cases + 26 demo plots); 12.4 ms per assessment |
| Reproducibility | PASS | 9/9 re-assessments identical (hashes, embedding) |
| Mass balance | PASS | 10/10 labelled shipment cases |
| Change signal | PASS | held-out AUC >= 0.6, NumPy = PyTorch, demo landscape levels |

## Land-change signal vs Hansen loss, regions held out of training

| Score | ROC-AUC | Avg. precision | Precision | Recall | F1 | n (pos) |
|---|---|---|---|---|---|---|
| lejepa | 0.8927 | 0.9348 | 0.8132 | 0.9867 | 0.8916 | 442 (299) |
| random_init | 0.7979 | 0.895 | 0.7095 | 0.9933 | 0.8278 | 442 (299) |
| ndvi_drop | 0.6503 | 0.8564 | 0.6728 | 0.9733 | 0.7956 | 442 (299) |
| nbr_drop | 0.6403 | 0.8481 | 0.6787 | 1.0 | 0.8086 | 442 (299) |

Across all nine regions (training landscapes included) the LeJEPA score reaches ROC-AUC 0.6509 against 0.8128 for the NBR index and 0.7397 for NDVI: at demo scale it is a second signal that routes plots to review, not a classifier.

Operating threshold used by the API: 0.62134 (cosine distance). NumPy vs PyTorch max abs difference: 9.5e-07.

Full report: `ml/artifacts/EVAL.md`.
