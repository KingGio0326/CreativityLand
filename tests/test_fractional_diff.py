"""Tests for fractional differentiation (López de Prado AFML cap. 5)."""

import numpy as np
import pandas as pd
import pytest

from engine.fractional_diff import frac_diff_ffd, find_optimal_d, get_weights_ffd


class TestGetWeightsFfd:
    def test_d_zero_returns_single_weight(self):
        """d=0 means no transformation — single weight [1]."""
        w = get_weights_ffd(0.0)
        assert len(w) == 1
        assert w[0] == pytest.approx(1.0)

    def test_d_one_produces_diff_weights(self):
        """d=1 should produce weights [−1, 1] (standard diff)."""
        w = get_weights_ffd(1.0, threshold=1e-10)
        # For d=1: w0=1, w1=-1*(1-1+1)/1 = -1*(1)/1 = -1, w2=-(-1)*(1-2+1)/2 = 0
        assert len(w) == 2
        np.testing.assert_allclose(w, [-1.0, 1.0])

    def test_weights_decay(self):
        """Weights should decay in magnitude for fractional d."""
        w = get_weights_ffd(0.4)
        assert len(w) > 2
        # The most recent weight (last) should be 1.0
        assert w[-1] == pytest.approx(1.0)

    def test_threshold_controls_length(self):
        """Tighter threshold → more weights."""
        w_loose = get_weights_ffd(0.5, threshold=1e-3)
        w_tight = get_weights_ffd(0.5, threshold=1e-7)
        assert len(w_tight) > len(w_loose)


class TestFracDiffFfd:
    def test_output_same_length(self):
        """Output should have the same length as input."""
        s = pd.Series(np.random.randn(100).cumsum())
        result = frac_diff_ffd(s, d=0.4)
        assert len(result) == len(s)

    def test_nans_at_start(self):
        """First few values should be NaN (insufficient window)."""
        s = pd.Series(np.random.randn(500).cumsum())
        # Use a looser threshold so the window fits within 500 values
        result = frac_diff_ffd(s, d=0.4, threshold=1e-2)
        # At least the first value should be NaN
        assert pd.isna(result.iloc[0])
        # Later values should not be NaN
        assert not pd.isna(result.iloc[-1])

    def test_d_zero_identity(self):
        """d=0 should return the original series."""
        s = pd.Series([10.0, 20.0, 30.0, 40.0, 50.0])
        result = frac_diff_ffd(s, d=0.0)
        pd.testing.assert_series_equal(result, s)

    def test_d_one_returns_differences(self):
        """d=1 should approximate standard first differences."""
        s = pd.Series([100.0, 102.0, 105.0, 103.0, 108.0])
        result = frac_diff_ffd(s, d=1.0, threshold=1e-10)
        expected_diffs = [2.0, 3.0, -2.0, 5.0]
        clean = result.dropna()
        np.testing.assert_allclose(clean.values, expected_diffs, atol=1e-10)


class TestFindOptimalD:
    def test_random_walk_needs_differentiation(self):
        """A random walk should need d > 0 to become stationary."""
        np.random.seed(42)
        rw = pd.Series(np.random.randn(500).cumsum())
        d = find_optimal_d(rw)
        assert 0 < d <= 1.0

    def test_stationary_series_needs_zero(self):
        """A stationary series should have d=0 or very small."""
        np.random.seed(42)
        stationary = pd.Series(np.random.randn(500))
        d = find_optimal_d(stationary)
        assert d <= 0.1

    def test_returns_float(self):
        """Should return a float."""
        np.random.seed(42)
        s = pd.Series(np.random.randn(200).cumsum())
        d = find_optimal_d(s)
        assert isinstance(d, float)
        assert 0.0 <= d <= 1.0

    def test_custom_d_range(self):
        """Should work with custom d_range."""
        np.random.seed(42)
        s = pd.Series(np.random.randn(300).cumsum())
        d = find_optimal_d(s, d_range=np.arange(0.3, 0.7, 0.1))
        assert 0.3 <= d <= 0.7 or d == 1.0
