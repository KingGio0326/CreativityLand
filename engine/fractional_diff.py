"""Fractional Differentiation (López de Prado, AFML cap. 5).

Fixed-Width Window Fractional Differentiation (FFD) makes price series
stationary while preserving memory — the sweet spot between raw prices
(non-stationary, full memory) and integer returns (stationary, no memory).

Typical optimal d ~ 0.3-0.5 for financial time series.
"""

import numpy as np
import pandas as pd
from statsmodels.tsa.stattools import adfuller


def get_weights_ffd(d: float, threshold: float = 1e-5) -> np.ndarray:
    """Compute weights for Fixed-Width Window Fractional Differentiation.

    Uses the recursive formula (López de Prado eq. 5.6):
        w_0 = 1
        w_k = -w_{k-1} * (d - k + 1) / k

    Weights are truncated when abs(w_k) < threshold.
    """
    weights = [1.0]
    k = 1
    while True:
        w = -weights[-1] * (d - k + 1) / k
        if abs(w) < threshold:
            break
        weights.append(w)
        k += 1
    return np.array(weights[::-1])  # oldest weight first


def frac_diff_ffd(
    series: pd.Series, d: float, threshold: float = 1e-5,
) -> pd.Series:
    """Apply FFD to a pandas Series.

    Returns a Series of the same length with NaN where insufficient
    history exists for the convolution window.
    """
    weights = get_weights_ffd(d, threshold)
    width = len(weights)
    result = pd.Series(index=series.index, dtype=float)

    for i in range(width - 1, len(series)):
        window = series.values[i - width + 1 : i + 1]
        result.iloc[i] = np.dot(weights, window)

    return result


def find_optimal_d(
    series: pd.Series,
    d_range: np.ndarray | None = None,
    p_value_threshold: float = 0.05,
    threshold: float = 1e-3,
) -> float:
    """Find minimum d that makes the series stationary (ADF test).

    Tests d from 0.0 to 1.0 in steps of 0.05. Returns the smallest d
    for which the ADF p-value < p_value_threshold.

    If no d < 1.0 works, returns 1.0 (standard integer differentiation).
    """
    if d_range is None:
        d_range = np.arange(0.0, 1.05, 0.05)

    for d in d_range:
        try:
            diffed = frac_diff_ffd(series, d, threshold=threshold)
            clean = diffed.dropna()
            if len(clean) < 20:
                continue
            adf_result = adfuller(clean, maxlag=1, regression="c", autolag=None)
            p_value = adf_result[1]
            if p_value < p_value_threshold:
                return round(float(d), 2)
        except Exception:
            continue

    return 1.0
