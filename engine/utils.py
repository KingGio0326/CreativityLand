"""Shared utilities for the engine package."""

import json
import math


def sanitize_for_json(obj):
    """Recursively replace NaN/Infinity floats with None in nested structures.

    Handles dicts, lists, tuples, numpy scalar types, and plain floats.
    """
    # Handle numpy scalar types (np.float64, np.int64, etc.)
    try:
        import numpy as np
        if isinstance(obj, (np.floating, np.complexfloating)):
            obj = float(obj)
        elif isinstance(obj, np.integer):
            obj = int(obj)
        elif isinstance(obj, np.bool_):
            obj = bool(obj)
        elif isinstance(obj, np.ndarray):
            return sanitize_for_json(obj.tolist())
    except ImportError:
        pass

    if isinstance(obj, float):
        if math.isnan(obj) or math.isinf(obj):
            return None
        return obj
    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}
    if isinstance(obj, (list, tuple)):
        cleaned = [sanitize_for_json(v) for v in obj]
        return cleaned if isinstance(obj, list) else tuple(cleaned)
    return obj


def safe_json_dumps(obj, **kwargs):
    """json.dumps that never raises on NaN/Infinity values."""
    return json.dumps(sanitize_for_json(obj), **kwargs)
