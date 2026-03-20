"""
strategies_config.py
────────────────────
Python mirror of strategies.js — single source of truth for all scoring logic.
When you add/edit a factor here, ALSO update strategies.js to keep the
strategy page in sync. Both files should always match.

To add a new scoring factor:
  1. Add entry to SCORING_FACTORS list below
  2. Add same entry to strategies.js > scoringFactors array
  3. Re-deploy — strategy page and scores both update automatically

To disable a factor (without deleting it):
  Set "active": False — it will show as DISABLED on the strategy page
  and be excluded from scoring.
"""

META = {
    "version": "2.1",
    "updatedAt": "2025-03-17",
    "baseSuccessFloor": 35,
    "maxSuccess": 96,
    "fakeoutPenalty": 0.82,
}

# ── SIGNAL THRESHOLDS ────────────────────────────────────────────────────────
PRICE_THRESHOLD = 0.3   # % above/below which a price move is considered directional
OI_THRESHOLD    = 2.0   # % above/below which OI change is considered significant

def compute_signal(price_chg: float, oi_chg: float) -> str:
    pu = price_chg >  PRICE_THRESHOLD
    pd = price_chg < -PRICE_THRESHOLD
    ou = oi_chg    >  OI_THRESHOLD
    od = oi_chg    < -OI_THRESHOLD
    if pu and ou:  return "BUY"
    if pd and ou:  return "SELL"
    if pu and od:  return "CAUTION"
    return "NEUTRAL"

# ── SCORING FACTORS ───────────────────────────────────────────────────────────
# Each factor must have: id, name, maxPoints, active, compute(data, signal, nifty_chg)
# compute() returns (points_earned, tip_or_None)

SCORING_FACTORS = [

    {
        "id": "oi_strength",
        "name": "OI Change Strength",
        "maxPoints": 15,
        "weight": "High",
        "active": True,
        "addedOn": "2025-01-01",
        "compute": lambda d, sig, nc: (
            min(15, abs(d["oi_chg"]) * 1.5),
            "OI change <3% — wait for stronger buildup. ~+10% when OI >5%."
            if abs(d["oi_chg"]) < 3 else None
        ),
    },

    {
        "id": "price_strength",
        "name": "Price Move Strength",
        "maxPoints": 12,
        "weight": "High",
        "active": True,
        "addedOn": "2025-01-01",
        "compute": lambda d, sig, nc: (
            min(12, abs(d["price_chg"]) * 2.5),
            "Price move <1.5% — indecisive. Wait for candle close above/below structure."
            if abs(d["price_chg"]) < 1.5 else None
        ),
    },

    {
        "id": "pcr_alignment",
        "name": "PCR Alignment",
        "maxPoints": 10,
        "weight": "High",
        "active": True,
        "addedOn": "2025-01-01",
        "compute": lambda d, sig, nc: (
            10 if (sig == "BUY"  and d["pcr"] < 0.8) or (sig == "SELL" and d["pcr"] > 1.2)
            else 5 if (sig == "BUY"  and d["pcr"] < 1.0) or (sig == "SELL" and d["pcr"] > 1.0)
            else 0,
            f"PCR {d['pcr']:.2f} not aligned with signal. Alignment adds ~10% success."
            if not ((sig in ("BUY","SELL")) and (
                (sig=="BUY" and d["pcr"] < 1.0) or (sig=="SELL" and d["pcr"] > 1.0)
            )) else None
        ),
    },

    {
        "id": "index_alignment",
        "name": "Nifty Index Alignment",
        "maxPoints": 8,
        "weight": "Medium",
        "active": True,
        "addedOn": "2025-01-01",
        "compute": lambda d, sig, nc: (
            8  if (sig == "BUY" and nc > 0.2)  or (sig == "SELL" and nc < -0.2)
            else -4 if (sig == "BUY" and nc < -0.3) or (sig == "SELL" and nc > 0.3)
            else 0,
            "Nifty direction not confirming. Counter-trend trades fail ~60% of the time."
            if not ((sig in ("BUY","SELL")) and (
                (sig=="BUY" and nc > 0.2) or (sig=="SELL" and nc < -0.2)
            )) else None
        ),
    },

    {
        "id": "volume_ratio",
        "name": "Volume vs Average",
        "maxPoints": 10,
        "weight": "High",
        "active": True,
        "addedOn": "2025-01-01",
        "compute": lambda d, sig, nc: (
            10 if d["vol_ratio"] > 2.0
            else 7 if d["vol_ratio"] > 1.5
            else 4 if d["vol_ratio"] > 1.2
            else 0,
            f"Volume {d['vol_ratio']:.1f}x avg — low institutional conviction. +6% if >1.5x."
            if d["vol_ratio"] < 1.2 else None
        ),
    },

    {
        "id": "delivery_pct",
        "name": "Delivery Percentage",
        "maxPoints": 5,
        "weight": "Medium",
        "active": True,
        "addedOn": "2025-01-01",
        "compute": lambda d, sig, nc: (
            5 if d["delivery"] > 60
            else 3 if d["delivery"] > 50
            else 0,
            f"Delivery {d['delivery']:.0f}% low — intraday dominated. +5% if >60%."
            if d["delivery"] <= 50 else None
        ),
    },

    {
        "id": "w52_position",
        "name": "52-Week Price Position",
        "maxPoints": 5,
        "weight": "Low",
        "active": True,
        "addedOn": "2025-01-01",
        "compute": lambda d, sig, nc: _w52_compute(d, sig),
    },

]

def _w52_compute(d, sig):
    """52-week position scoring (needs a helper because it's more complex)."""
    rng = max(d["w52hi"] - d["w52lo"], 1)
    pos = (d["price"] - d["w52lo"]) / rng
    if sig == "BUY" and pos < 0.35:
        return (5, None)
    if sig == "SELL" and pos > 0.75:
        return (5, None)
    if sig == "BUY" and pos > 0.85:
        return (-3, "Price near 52W high. Poor R:R for BUY here. Better entry on pullback.")
    return (0, None)


# ── ANTI-FAKEOUT RULES ────────────────────────────────────────────────────────
# Each rule: id, name, active, check(data, signal) -> (is_triggered, warning_string)

ANTI_FAKEOUT_RULES = [

    {
        "id": "oi_spike",
        "name": "Single-Candle OI Spike > 8%",
        "active": True,
        "addedOn": "2025-01-15",
        "check": lambda d, sig: (
            abs(d["oi_chg"]) > 8,
            "OI spike >8% in one candle — possible operator trap. Wait for next candle confirmation."
        ),
    },

    {
        "id": "price_spike",
        "name": "Single-Session Price Move > 3.5%",
        "active": True,
        "addedOn": "2025-01-15",
        "check": lambda d, sig: (
            abs(d["price_chg"]) > 3.5,
            "Price move >3.5% — possible stop-hunt spike. Wait for candle close confirmation."
        ),
    },

    {
        "id": "low_volume",
        "name": "Volume Below 1.2x Average",
        "active": True,
        "addedOn": "2025-01-15",
        "check": lambda d, sig: (
            d["vol_ratio"] < 1.2,
            "Volume <1.2x average — low institutional participation. High fakeout risk."
        ),
    },

    {
        "id": "pcr_buy_contradiction",
        "name": "PCR > 1.3 on BUY Signal",
        "active": True,
        "addedOn": "2025-01-20",
        "check": lambda d, sig: (
            sig == "BUY" and d["pcr"] > 1.3,
            "PCR >1.3 with BUY signal — heavy put writing suggests bearish bias. Use caution."
        ),
    },

    {
        "id": "pcr_sell_contradiction",
        "name": "PCR < 0.6 on SELL Signal",
        "active": True,
        "addedOn": "2025-01-20",
        "check": lambda d, sig: (
            sig == "SELL" and d["pcr"] < 0.6,
            "PCR <0.6 with SELL signal — heavy call writing suggests bullish bias. Use caution."
        ),
    },

]

# ── SECTOR ATR TABLE ──────────────────────────────────────────────────────────
# Used by price_levels() in fetch_signals.py
SECTOR_ATR = {
    "IT":      1.0,
    "FMCG":    1.0,
    "Banking":  1.15,
    "Auto":     1.25,
    "Pharma":   1.1,
    "Energy":   1.25,
    "Infra":    1.3,
    "Metal":    1.65,
    "Finance":  1.25,
    "Telecom":  1.1,
}

# ── MASTER SCORING FUNCTION ───────────────────────────────────────────────────
def compute_success_score(d: dict, signal: str, nifty_chg: float) -> tuple:
    """
    d must have: price_chg, oi_chg, pcr, vol_ratio, delivery, price, w52hi, w52lo
    Returns: (score: int, conviction: str, tips: list[str])
    """
    score = META["baseSuccessFloor"]
    tips  = []

    for factor in SCORING_FACTORS:
        if not factor["active"]:
            continue
        try:
            pts, tip = factor["compute"](d, signal, nifty_chg)
            score += pts
            if tip:
                tips.append(tip)
        except Exception as e:
            pass  # Graceful degradation if a factor fails

    # Anti-fakeout check
    is_clean    = True
    fw          = []
    for rule in ANTI_FAKEOUT_RULES:
        if not rule["active"]:
            continue
        try:
            triggered, warning = rule["check"](d, signal)
            if triggered:
                is_clean = False
                fw.append(warning)
        except:
            pass

    if not is_clean:
        score = int(score * META["fakeoutPenalty"])

    # Signal-type caps
    if signal in ("CAUTION", "NEUTRAL"):
        score = min(score, 55)

    score = max(20, min(META["maxSuccess"], round(score)))

    if   score >= 80: conviction = "HIGH CONVICTION"
    elif score >= 65: conviction = "STRONG"
    elif score >= 50: conviction = "MODERATE"
    elif score >= 40: conviction = "WEAK"
    else:             conviction = "VERY WEAK"

    return score, conviction, tips[:3], is_clean, fw
