from typing import TypedDict


class TradingState(TypedDict):
    ticker: str
    articles: list[dict]
    sentiment_summary: dict
    historical_context: str
    risk_assessment: dict
    proposed_signal: str
    confidence: float
    reasoning: list[str]
    final_signal: str
    retry_count: int
    macro_analysis: dict
    macro_adjusted: bool
    technical_analysis: dict
    fundamental_analysis: dict
    momentum_analysis: dict
    mean_reversion_analysis: dict
    ml_prediction: dict
    social_analysis: dict
    vote_breakdown: dict
    pattern_signal: str
    pattern_patterns_found: int
    pattern_best_similarity: float
    rate_direction: str
