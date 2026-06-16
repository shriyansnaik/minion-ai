import json
import re
from functools import lru_cache
from pathlib import Path

_PRICES_FILE = Path(__file__).parent / "model_prices.json"


def _load() -> list[tuple[re.Pattern, float, float]]:
    data = json.loads(_PRICES_FILE.read_text())
    entries = []
    for m in data:
        tier = next((t for t in m.get("pricingTiers", []) if t.get("isDefault")), None)
        if not tier:
            continue
        prices = tier.get("prices", {})
        inp = prices.get("input")
        out = prices.get("output")
        if inp is None or out is None:
            continue
        try:
            entries.append((re.compile(m["matchPattern"]), float(inp), float(out)))
        except re.error:
            continue
    return entries


_ENTRIES = _load()


@lru_cache(maxsize=256)
def _lookup(model: str) -> tuple[float, float] | None:
    # Try the full string first, then the bare model name (strips provider prefix)
    candidates = [model]
    if "/" in model:
        candidates.append(model.split("/", 1)[1])
    for candidate in candidates:
        for pat, inp, out in _ENTRIES:
            if pat.search(candidate):
                return inp, out
    return None


def list_builtin() -> list[dict]:
    data = json.loads(_PRICES_FILE.read_text())
    result = []
    for m in data:
        tier = next((t for t in m.get("pricingTiers", []) if t.get("isDefault")), None)
        if not tier:
            continue
        prices = tier.get("prices", {})
        inp = prices.get("input")
        out = prices.get("output")
        if inp is None or out is None:
            continue
        result.append({
            "model_name": m["modelName"],
            "input_price_per_mtok": round(float(inp) * 1_000_000, 4),
            "output_price_per_mtok": round(float(out) * 1_000_000, 4),
        })
    return result


def estimate(model: str, input_tokens: int, output_tokens: int) -> float | None:
    result = _lookup(model)
    if result is None:
        return None
    inp_price, out_price = result
    return input_tokens * inp_price + output_tokens * out_price
