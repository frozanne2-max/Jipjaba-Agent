"""Shared helpers for loading 집잡아 mock data from /data."""

from __future__ import annotations

import json
import os
from functools import lru_cache

_DATA_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data")


@lru_cache(maxsize=None)
def _load(name: str) -> list:
    path = os.path.join(_DATA_DIR, name)
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def listings() -> list:
    return _load("listings.json")


def market_prices() -> list:
    return _load("market_prices.json")


def faq() -> list:
    return _load("faq.json")


def find_listings(location=None, property_type=None, budget=None, limit=5) -> list:
    rows = listings()
    out = []
    for row in rows:
        if location and row["location"] != location:
            continue
        if property_type and row["type"] != property_type:
            continue
        if budget:
            price = row.get("jeonse_price") or row.get("deposit") or 0
            if price and price > budget * 1.15:  # 15% tolerance
                continue
        out.append(row)
    return out[:limit] if out else rows[:limit]


def find_market(location=None, property_type=None, limit=5) -> list:
    rows = market_prices()
    out = [
        r
        for r in rows
        if (not location or r["location"] == location)
        and (not property_type or r["type"] == property_type)
    ]
    return out[:limit] if out else rows[:limit]


def find_faq(keywords=None, limit=4) -> list:
    rows = faq()
    if not keywords:
        return rows[:limit]
    scored = []
    for row in rows:
        haystack = row["question"] + " " + " ".join(row.get("keywords", []))
        score = sum(1 for kw in keywords if kw and kw in haystack)
        if score:
            scored.append((score, row))
    scored.sort(key=lambda x: x[0], reverse=True)
    picked = [r for _, r in scored[:limit]]
    return picked if picked else rows[:limit]
