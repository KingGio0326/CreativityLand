"""Purged K-Fold Cross-Validation (López de Prado, AFML cap. 7).

Prevents information leakage in time-series CV by:
1. Purging: removing training samples whose label period overlaps the test set
2. Embargo: adding a temporal buffer after the test set
"""

import numpy as np
import pandas as pd
from sklearn.model_selection import BaseCrossValidator


class PurgedKFoldCV(BaseCrossValidator):
    """Purged K-Fold Cross-Validation for financial time series.

    Parameters
    ----------
    n_splits : int
        Number of folds (default 5).
    embargo_pct : float
        Fraction of total samples to use as embargo buffer after each
        test fold (default 0.01).
    """

    def __init__(self, n_splits: int = 5, embargo_pct: float = 0.01):
        self.n_splits = n_splits
        self.embargo_pct = embargo_pct

    def split(self, X, y=None, groups=None, pred_times=None, eval_times=None):
        """Generate train/test indices with purging and embargo.

        Parameters
        ----------
        X : array-like
            Feature matrix (used only for length).
        y : ignored
        groups : ignored
        pred_times : pd.Series of datetime
            When each sample was observed.
        eval_times : pd.Series of datetime
            When each sample's label was determined
            (pred_time + holding period).

        Yields
        ------
        train_indices, test_indices : np.ndarray
        """
        n_samples = X.shape[0] if hasattr(X, "shape") else len(X)
        if n_samples < self.n_splits:
            raise ValueError(
                f"Cannot split {n_samples} samples into {self.n_splits} folds"
            )

        indices = np.arange(n_samples)

        # Divide into n_splits contiguous blocks
        fold_sizes = np.full(self.n_splits, n_samples // self.n_splits)
        fold_sizes[: n_samples % self.n_splits] += 1

        folds = []
        current = 0
        for size in fold_sizes:
            folds.append(indices[current : current + size])
            current += size

        embargo_size = int(n_samples * self.embargo_pct)

        for i in range(self.n_splits):
            test_idx = folds[i]
            train_mask = np.ones(n_samples, dtype=bool)
            train_mask[test_idx] = False

            if pred_times is not None and eval_times is not None:
                test_start = pred_times.iloc[test_idx[0]]
                # Purging: remove training samples BEFORE the test set
                # whose eval_time reaches into the test period.
                # Their labels use price data from the test window → leakage.
                for j in range(n_samples):
                    if not train_mask[j]:
                        continue
                    if (pred_times.iloc[j] < test_start
                            and eval_times.iloc[j] >= test_start):
                        train_mask[j] = False

            # Embargo: remove training samples right after the test set
            if embargo_size > 0 and len(test_idx) > 0:
                emb_start = test_idx[-1] + 1
                emb_end = min(emb_start + embargo_size, n_samples)
                train_mask[emb_start:emb_end] = False

            yield indices[train_mask], test_idx

    def get_n_splits(self, X=None, y=None, groups=None):
        return self.n_splits

    def compute_purge_count(self, X, pred_times, eval_times):
        """Return average number of samples purged per fold."""
        n_samples = X.shape[0] if hasattr(X, "shape") else len(X)
        indices = np.arange(n_samples)

        fold_sizes = np.full(self.n_splits, n_samples // self.n_splits)
        fold_sizes[: n_samples % self.n_splits] += 1

        folds = []
        current = 0
        for size in fold_sizes:
            folds.append(indices[current : current + size])
            current += size

        purged_counts = []
        for i in range(self.n_splits):
            test_idx = folds[i]
            test_start = pred_times.iloc[test_idx[0]]
            count = 0
            for j in range(n_samples):
                if j in test_idx:
                    continue
                if (pred_times.iloc[j] < test_start
                        and eval_times.iloc[j] >= test_start):
                    count += 1
            purged_counts.append(count)
        return float(np.mean(purged_counts))
