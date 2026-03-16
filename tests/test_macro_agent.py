import pytest
from unittest.mock import patch, MagicMock
from agents.macro_agent import MacroAgent


def test_is_macro_relevant_true():
    agent = MacroAgent()
    articles = [
        {"title": "Russia launches war offensive",
         "content": "sanctions imposed"},
        {"title": "NATO responds to invasion",
         "content": "conflict escalates"},
    ]
    assert agent.is_macro_relevant(articles) is True


def test_is_macro_relevant_false():
    agent = MacroAgent()
    articles = [
        {"title": "Apple reports Q4 earnings",
         "content": "revenue beat estimates"},
        {"title": "iPhone sales up 10%",
         "content": "strong demand"},
    ]
    assert agent.is_macro_relevant(articles) is False


def test_adjusted_signal_high_impact_negative():
    agent = MacroAgent()
    signal, conf, reason = agent.get_adjusted_signal(
        "BUY", 0.8,
        {"has_macro_impact": True,
         "impact_direction": "negative",
         "impact_magnitude": "high",
         "causal_chain": "war disrupts supply chain",
         "confidence": 0.85}
    )
    assert signal in ["SELL", "HOLD"]


def test_adjusted_signal_no_impact():
    agent = MacroAgent()
    signal, conf, reason = agent.get_adjusted_signal(
        "BUY", 0.75,
        {"has_macro_impact": False}
    )
    assert signal == "BUY"
    assert conf == 0.75
