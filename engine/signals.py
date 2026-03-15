"""Trading signal generation based on sentiment analysis."""


class SignalGenerator:
    """Generates buy/sell/hold signals from sentiment scores."""

    def __init__(self, buy_threshold: float = 0.7, sell_threshold: float = 0.7):
        self.buy_threshold = buy_threshold
        self.sell_threshold = sell_threshold

    def generate(self, sentiment: dict) -> str:
        """Generate a trading signal from a sentiment result."""
        label = sentiment["label"].lower()
        score = sentiment["score"]

        if label == "positive" and score >= self.buy_threshold:
            return "BUY"
        elif label == "negative" and score >= self.sell_threshold:
            return "SELL"
        return "HOLD"

    def generate_batch(self, sentiments: list[dict]) -> list[str]:
        """Generate signals for a batch of sentiment results."""
        return [self.generate(s) for s in sentiments]
