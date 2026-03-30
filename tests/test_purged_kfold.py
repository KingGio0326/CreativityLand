"""Tests for Purged K-Fold Cross-Validation."""

import numpy as np
import pandas as pd
import pytest

from engine.purged_kfold import PurgedKFoldCV


# ── Helpers ──────────────────────────────────────────────────

def _make_dates(n, start="2024-01-01"):
    """Create n business-day timestamps."""
    return pd.bdate_range(start, periods=n, freq="B")


def _make_data(n=200, holding_days=5):
    """Create synthetic dataset with pred_times and eval_times."""
    dates = _make_dates(n)
    X = pd.DataFrame(np.random.randn(n, 3), index=dates, columns=["a", "b", "c"])
    y = pd.Series(np.random.randint(0, 2, n), index=dates)
    pred_times = pd.Series(dates, index=range(n))
    eval_times = pred_times + pd.offsets.BDay(holding_days)
    return X, y, pred_times, eval_times


# ── TestFoldStructure ────────────────────────────────────────

class TestFoldStructure:
    def test_correct_number_of_folds(self):
        X, y, pt, et = _make_data(100)
        cv = PurgedKFoldCV(n_splits=5, embargo_pct=0.0)
        folds = list(cv.split(X, pred_times=pt, eval_times=et))
        assert len(folds) == 5

    def test_no_train_test_overlap(self):
        X, y, pt, et = _make_data(100)
        cv = PurgedKFoldCV(n_splits=5, embargo_pct=0.0)
        for train_idx, test_idx in cv.split(X, pred_times=pt, eval_times=et):
            overlap = set(train_idx) & set(test_idx)
            assert len(overlap) == 0, f"Overlap found: {overlap}"

    def test_all_samples_appear_in_test_once(self):
        X, y, pt, et = _make_data(100)
        cv = PurgedKFoldCV(n_splits=5, embargo_pct=0.0)
        all_test = []
        for _, test_idx in cv.split(X, pred_times=pt, eval_times=et):
            all_test.extend(test_idx)
        assert sorted(all_test) == list(range(100))

    def test_get_n_splits(self):
        cv = PurgedKFoldCV(n_splits=7)
        assert cv.get_n_splits() == 7


# ── TestPurging ──────────────────────────────────────────────

class TestPurging:
    def test_purging_removes_leaky_samples(self):
        """Samples before test set whose eval_time extends into test
        period must be removed from training."""
        n = 100
        X, y, pt, et = _make_data(n, holding_days=10)
        cv = PurgedKFoldCV(n_splits=5, embargo_pct=0.0)

        for train_idx, test_idx in cv.split(X, pred_times=pt, eval_times=et):
            test_start = pt.iloc[test_idx[0]]
            for j in train_idx:
                if pt.iloc[j] < test_start:
                    assert et.iloc[j] < test_start, (
                        f"Sample {j} has eval_time {et.iloc[j]} >= "
                        f"test_start {test_start} but is in training"
                    )

    def test_purging_count_positive_with_overlap(self):
        """With a long holding period, some samples should be purged."""
        X, y, pt, et = _make_data(200, holding_days=20)
        cv = PurgedKFoldCV(n_splits=5, embargo_pct=0.0)
        avg_purged = cv.compute_purge_count(X, pt, et)
        assert avg_purged > 0, "Expected some purged samples with 20-day hold"

    def test_no_purging_with_zero_holding(self):
        """With holding_days=0, eval_time == pred_time, no purging needed."""
        X, y, pt, et = _make_data(200, holding_days=0)
        cv = PurgedKFoldCV(n_splits=5, embargo_pct=0.0)
        avg_purged = cv.compute_purge_count(X, pt, et)
        assert avg_purged == 0, "No purging expected with 0-day hold"

    def test_longer_hold_purges_more(self):
        """Longer holding period → more samples purged."""
        X, y, pt, _ = _make_data(200)
        cv = PurgedKFoldCV(n_splits=5, embargo_pct=0.0)

        et_short = pt + pd.offsets.BDay(5)
        et_long = pt + pd.offsets.BDay(30)

        purged_short = cv.compute_purge_count(X, pt, et_short)
        purged_long = cv.compute_purge_count(X, pt, et_long)
        assert purged_long > purged_short


# ── TestEmbargo ──────────────────────────────────────────────

class TestEmbargo:
    def test_embargo_excludes_post_test_samples(self):
        """Samples right after the test set should be excluded
        from training when embargo > 0."""
        n = 100
        X, y, pt, et = _make_data(n, holding_days=0)
        cv_no_embargo = PurgedKFoldCV(n_splits=5, embargo_pct=0.0)
        cv_with_embargo = PurgedKFoldCV(n_splits=5, embargo_pct=0.05)

        for (train_no, test_no), (train_emb, test_emb) in zip(
            cv_no_embargo.split(X, pred_times=pt, eval_times=et),
            cv_with_embargo.split(X, pred_times=pt, eval_times=et),
        ):
            # With embargo, train set is smaller (except possibly last fold)
            assert len(train_emb) <= len(train_no)

    def test_embargo_buffer_correct_size(self):
        """The embargo should remove approximately embargo_pct * n samples."""
        n = 200
        X, y, pt, et = _make_data(n, holding_days=0)
        embargo_pct = 0.05
        expected_embargo = int(n * embargo_pct)  # 10 samples
        cv = PurgedKFoldCV(n_splits=5, embargo_pct=embargo_pct)
        cv_base = PurgedKFoldCV(n_splits=5, embargo_pct=0.0)

        # Check first fold (not last, which has no post-test samples)
        folds = list(cv.split(X, pred_times=pt, eval_times=et))
        folds_base = list(cv_base.split(X, pred_times=pt, eval_times=et))

        train_diff = len(folds_base[0][0]) - len(folds[0][0])
        assert train_diff == expected_embargo


# ── TestEdgeCases ────────────────────────────────────────────

class TestEdgeCases:
    def test_dataset_too_small_raises(self):
        """Should raise ValueError if n_samples < n_splits."""
        X = pd.DataFrame(np.random.randn(3, 2))
        cv = PurgedKFoldCV(n_splits=5)
        with pytest.raises(ValueError, match="Cannot split"):
            list(cv.split(X))

    def test_works_without_temporal_info(self):
        """Without pred_times/eval_times, should work like regular k-fold
        (no purging, only embargo)."""
        X = pd.DataFrame(np.random.randn(100, 3))
        cv = PurgedKFoldCV(n_splits=5, embargo_pct=0.0)
        folds = list(cv.split(X))
        assert len(folds) == 5
        all_test = []
        for train_idx, test_idx in folds:
            assert len(set(train_idx) & set(test_idx)) == 0
            all_test.extend(test_idx)
        assert sorted(all_test) == list(range(100))

    def test_identical_to_plain_kfold_when_no_overlap_no_embargo(self):
        """With embargo=0, holding=0, and no temporal overlap,
        result should be identical to a plain contiguous k-fold."""
        n = 100
        X, y, pt, et = _make_data(n, holding_days=0)
        cv = PurgedKFoldCV(n_splits=5, embargo_pct=0.0)

        folds = list(cv.split(X, pred_times=pt, eval_times=et))
        for train_idx, test_idx in folds:
            # No purging, no embargo → train is everything except test
            assert len(train_idx) + len(test_idx) == n
