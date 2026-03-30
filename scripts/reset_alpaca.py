"""One-shot script to reset Alpaca paper trading account.

Closes all positions, cancels all orders, and prints the new balance.
Note: Alpaca API does not allow setting balance programmatically.
To reset to $1,000, go to https://app.alpaca.markets/paper/dashboard/overview
and click "Reset Account", then set the desired amount.

Usage:
    python scripts/reset_alpaca.py
"""

import os
import sys

import httpx
from dotenv import load_dotenv

load_dotenv()

PAPER_URL = "https://paper-api.alpaca.markets"


def main():
    api_key = os.getenv("ALPACA_API_KEY", "")
    secret_key = os.getenv("ALPACA_SECRET_KEY", "")

    if not api_key or not secret_key:
        print("ERROR: ALPACA_API_KEY and ALPACA_SECRET_KEY must be set")
        sys.exit(1)

    headers = {
        "APCA-API-KEY-ID": api_key,
        "APCA-API-SECRET-KEY": secret_key,
        "Content-Type": "application/json",
    }

    client = httpx.Client(base_url=PAPER_URL, headers=headers, timeout=30.0)

    # 1. Cancel all open orders
    print("Cancelling all open orders...")
    r = client.delete("/v2/orders")
    if r.is_success:
        cancelled = r.json() if r.text else []
        print(f"  Cancelled {len(cancelled)} orders")
    else:
        print(f"  Warning: {r.status_code} - {r.text}")

    # 2. Close all positions
    print("Closing all positions...")
    r = client.delete("/v2/positions")
    if r.is_success:
        closed = r.json() if r.text else []
        n = len(closed) if isinstance(closed, list) else 0
        print(f"  Closed {n} positions")
    else:
        print(f"  Warning: {r.status_code} - {r.text}")

    # 3. Print current balance
    print("\nFetching account info...")
    r = client.get("/v2/account")
    r.raise_for_status()
    acct = r.json()

    equity = float(acct.get("equity", 0))
    cash = float(acct.get("cash", 0))
    buying_power = float(acct.get("buying_power", 0))

    print(f"\n{'='*40}")
    print(f"  Equity:       ${equity:,.2f}")
    print(f"  Cash:         ${cash:,.2f}")
    print(f"  Buying Power: ${buying_power:,.2f}")
    print(f"  Positions:    0")
    print(f"  Open Orders:  0")
    print(f"{'='*40}")

    if equity != 1000.0:
        print(
            f"\nNOTA: Il balance attuale e' ${equity:,.2f}, non $1,000."
            f"\nPer resettare a $1,000 vai su:"
            f"\n  https://app.alpaca.markets/paper/dashboard/overview"
            f"\n  -> Click 'Reset Account' -> Imposta $1,000"
            f"\n\nL'API Alpaca non permette di settare il balance programmaticamente."
        )
    else:
        print("\nAccount gia' a $1,000.00 - tutto OK!")

    client.close()


if __name__ == "__main__":
    main()
