/**
 * strategies.js — OI Pulse Single Source of Truth
 * ─────────────────────────────────────────────────
 * ALL strategy logic lives here. The strategy page auto-renders from this file.
 * To add a new strategy: add an entry to the relevant section.
 * To remove one: delete the entry. The page and scoring engine both update automatically.
 *
 * Last updated: auto-tracked via `updatedAt` field on each entry.
 */

window.OIPULSE_STRATEGIES = {

  meta: {
    version: "2.1",
    updatedAt: "2025-03-17",
    description: "Multi-factor OI signal scoring system with anti-fakeout protection",
    author: "OI Pulse",
    baseSuccessFloor: 35,
    maxSuccess: 96,
    fakeoutPenalty: 0.82,  // score multiplied by this if flagged
  },

  /* ══════════════════════════════════════════════════════
     SECTION 1 — SIGNAL DETECTION
     The 4 core signal types based on price + OI direction
  ══════════════════════════════════════════════════════ */
  signals: [
    {
      id: "BUY",
      icon: "▲",
      color: "#00d68f",
      label: "BUY — Long Buildup",
      condition: "Price Change > +0.3%  AND  OI Change > +2%",
      meaning: "New long positions are being built by institutional players. Both price and open interest are rising together, confirming that fresh money is entering on the buy side — not just short covering.",
      whatToDo: "Look for an entry on the next 15-minute candle close above the previous high. Confirm volume is above average before entering.",
      risk: "If Nifty is bearish, this could be a sector-specific move that reverses quickly. Always check index alignment.",
      successFloor: 50,
    },
    {
      id: "SELL",
      icon: "▼",
      color: "#ff4f6a",
      label: "SELL — Short Buildup",
      condition: "Price Change < -0.3%  AND  OI Change > +2%",
      meaning: "New short positions are being added as price falls with rising OI. This is a strong bearish signal — operators are shorting into the move, not just unwinding longs.",
      whatToDo: "Enter short on the next candle close below the previous 15-min low. Confirm with PCR > 1.0 for higher probability.",
      risk: "Watch for unexpected positive news that can trigger a short squeeze. Keep SL strict.",
      successFloor: 50,
    },
    {
      id: "CAUTION",
      icon: "⚠",
      color: "#f5a623",
      label: "CAUTION — Short Covering",
      condition: "Price Change > +0.3%  AND  OI Change < -2%",
      meaning: "Price is rising but OI is falling, which means existing shorts are being closed (covered), NOT new longs being added. This is a weak bullish move — it will likely stall once short covering is complete.",
      whatToDo: "Do not chase. Wait to see if fresh long buildup (OI rising) follows the covering. Only enter if OI starts rising after the initial move.",
      risk: "These moves often reverse sharply. Maximum success capped at 55%.",
      successFloor: 30,
    },
    {
      id: "NEUTRAL",
      icon: "—",
      color: "#8892a4",
      label: "NEUTRAL — Long Unwinding",
      condition: "Price Change < -0.3%  AND  OI Change < -2%  (or weak move)",
      meaning: "Existing long positions are being exited as price falls. Bears are not aggressively shorting — longs are simply walking away. No clear directional bias.",
      whatToDo: "Avoid new positions. Monitor for either fresh short buildup (becoming SELL) or stabilisation and reversal. Good time to watch, not trade.",
      risk: "Can transition to SELL quickly if fresh shorts start entering.",
      successFloor: 25,
    },
  ],

  /* ══════════════════════════════════════════════════════
     SECTION 2 — SUCCESS SCORING FACTORS
     Each factor adds to the 35% base score.
     Modify maxPoints or thresholds to tune the engine.
  ══════════════════════════════════════════════════════ */
  scoringFactors: [
    {
      id: "oi_strength",
      name: "OI Change Strength",
      maxPoints: 15,
      weight: "High",
      active: true,
      formula: "min(15, abs(OI_change_%) × 1.5)",
      howItWorks: "The stronger the OI change, the more conviction behind the move. A 1% OI change scores ~1.5 points. A 10% OI change scores the maximum 15 points.",
      thresholds: [
        { condition: "OI change < 3%",   score: "< 4.5 pts",  label: "Weak", color: "#ff4f6a" },
        { condition: "OI change 3–5%",   score: "4.5–7.5 pts",label: "Moderate", color: "#f5a623" },
        { condition: "OI change 5–8%",   score: "7.5–12 pts", label: "Strong", color: "#5ecea0" },
        { condition: "OI change > 8%",   score: "12–15 pts",  label: "Very Strong (watch for manipulation)", color: "#00d68f" },
      ],
      tip: "Wait for OI change to cross 5% before entering. Single-candle OI spikes above 8% are flagged as possible manipulation.",
      addedOn: "2025-01-01",
    },
    {
      id: "price_strength",
      name: "Price Move Strength",
      maxPoints: 12,
      weight: "High",
      active: true,
      formula: "min(12, abs(price_change_%) × 2.5)",
      howItWorks: "A 1% price move scores 2.5 points. A 4.8%+ move scores the maximum 12 points. Weak price moves (< 1.5%) suggest indecision — the move may not be sustainable.",
      thresholds: [
        { condition: "Price < 1.5%",  score: "< 3.75 pts", label: "Weak — indecision", color: "#ff4f6a" },
        { condition: "Price 1.5–2%",  score: "3.75–5 pts", label: "Moderate", color: "#f5a623" },
        { condition: "Price 2–4%",    score: "5–10 pts",   label: "Strong", color: "#5ecea0" },
        { condition: "Price > 4%",    score: "10–12 pts",  label: "Powerful (check for stop-hunt)", color: "#00d68f" },
      ],
      tip: "Price moves above 3.5% in a single session are flagged as potential stop-hunts. Always wait for candle close confirmation.",
      addedOn: "2025-01-01",
    },
    {
      id: "pcr_alignment",
      name: "Put-Call Ratio (PCR) Alignment",
      maxPoints: 10,
      weight: "High",
      active: true,
      formula: "BUY: +10 if PCR<0.8, +5 if PCR<1.0 | SELL: +10 if PCR>1.2, +5 if PCR>1.0",
      howItWorks: "PCR measures puts vs calls outstanding. A low PCR (< 0.8) means more calls are being written — bullish sentiment. A high PCR (> 1.2) means puts are dominant — bearish sentiment. When PCR agrees with the signal, confidence is significantly higher.",
      thresholds: [
        { condition: "PCR < 0.7",       score: "+10 pts for BUY",  label: "Strongly Bullish", color: "#00d68f" },
        { condition: "PCR 0.7–1.0",     score: "+5 pts for BUY",   label: "Mildly Bullish", color: "#5ecea0" },
        { condition: "PCR 1.0–1.2",     score: "+5 pts for SELL",  label: "Mildly Bearish", color: "#f5a623" },
        { condition: "PCR > 1.2",       score: "+10 pts for SELL", label: "Strongly Bearish", color: "#ff4f6a" },
      ],
      tip: "If PCR does not align with your signal direction, reduce position size by 50% or wait for PCR to shift.",
      addedOn: "2025-01-01",
    },
    {
      id: "index_alignment",
      name: "Nifty Index Alignment",
      maxPoints: 8,
      weight: "Medium",
      active: true,
      formula: "Signal direction matches Nifty: +8pts | Nifty contradicts signal: -4pts",
      howItWorks: "Trading against the broader market (Nifty/Sensex) fails roughly 60% of the time. When the stock signal and Nifty trend agree, it confirms that the move is market-supported, not a random individual stock anomaly.",
      thresholds: [
        { condition: "BUY signal + Nifty > +0.2%",  score: "+8 pts",  label: "Index confirming", color: "#00d68f" },
        { condition: "SELL signal + Nifty < -0.2%", score: "+8 pts",  label: "Index confirming", color: "#00d68f" },
        { condition: "Signal contradicts Nifty",     score: "-4 pts",  label: "Counter-trend — risky", color: "#ff4f6a" },
        { condition: "Nifty sideways (±0.2%)",       score: "0 pts",   label: "Neutral", color: "#8892a4" },
      ],
      tip: "Counter-trend signals are not invalid — they can be sector rotations. But treat them as lower conviction and reduce size.",
      addedOn: "2025-01-01",
    },
    {
      id: "volume_ratio",
      name: "Volume vs Average (Institutional Participation)",
      maxPoints: 10,
      weight: "High",
      active: true,
      formula: "Vol > 2x avg: +10 | Vol > 1.5x: +7 | Vol > 1.2x: +4 | Below: 0",
      howItWorks: "Institutional players (FIIs, mutual funds, proprietary desks) move large volumes. When volume spikes above the 5-day average, it signals that smart money is participating — not just retail traders. Low-volume breakouts fail 70% of the time.",
      thresholds: [
        { condition: "Volume < 1.2x avg",  score: "0 pts",   label: "Retail only — high fakeout risk", color: "#ff4f6a" },
        { condition: "Volume 1.2x–1.5x",   score: "+4 pts",  label: "Moderate institutional interest", color: "#f5a623" },
        { condition: "Volume 1.5x–2x",     score: "+7 pts",  label: "Strong institutional participation", color: "#5ecea0" },
        { condition: "Volume > 2x avg",     score: "+10 pts", label: "Heavy institutional activity", color: "#00d68f" },
      ],
      tip: "If volume is below 1.2x average, mark the signal as watchlist only. Enter only when volume confirms on the next candle.",
      addedOn: "2025-01-01",
    },
    {
      id: "delivery_pct",
      name: "Delivery Percentage",
      maxPoints: 5,
      weight: "Medium",
      active: true,
      formula: "Delivery > 60%: +5 | Delivery > 50%: +3 | Below 50%: 0",
      howItWorks: "Delivery % measures how much of the day's volume was actual delivery (not intraday). High delivery means real buying/selling intention — someone is taking or giving stock, not just trading for the day. Low delivery = intraday speculation = prone to reversals by EOD.",
      thresholds: [
        { condition: "Delivery < 40%",  score: "0 pts",  label: "Intraday dominated — unreliable", color: "#ff4f6a" },
        { condition: "Delivery 40–50%", score: "0 pts",  label: "Mixed — neutral", color: "#8892a4" },
        { condition: "Delivery 50–60%", score: "+3 pts", label: "Genuine interest forming", color: "#5ecea0" },
        { condition: "Delivery > 60%",  score: "+5 pts", label: "Strong real conviction", color: "#00d68f" },
      ],
      tip: "For swing trades (holding overnight), delivery % is critical. For intraday scalps, delivery matters less.",
      addedOn: "2025-01-01",
    },
    {
      id: "w52_position",
      name: "52-Week Price Position",
      maxPoints: 5,
      weight: "Low",
      active: true,
      formula: "BUY near 52W low (< 35% of range): +5 | SELL near 52W high (> 75%): +5 | BUY near 52W high (> 85%): -3",
      howItWorks: "The 52-week range is a powerful reference for institutional support and resistance. Buying near the 52W low means you have a favourable risk:reward with the lows as natural support. Buying near the 52W high means you're chasing — limited upside with high reversal risk.",
      thresholds: [
        { condition: "BUY signal, price in bottom 35% of 52W range",  score: "+5 pts",  label: "Excellent R:R — room to run", color: "#00d68f" },
        { condition: "SELL signal, price in top 25% of 52W range",    score: "+5 pts",  label: "Natural resistance overhead", color: "#00d68f" },
        { condition: "BUY signal, price in top 15% of 52W range",     score: "-3 pts",  label: "Chasing — poor R:R", color: "#ff4f6a" },
        { condition: "All other positions",                            score: "0 pts",   label: "Neutral", color: "#8892a4" },
      ],
      tip: "The 52W position doesn't disqualify a trade — it adjusts your sizing. Near highs on a BUY? Take 25% size. Near lows on a BUY? Take full size.",
      addedOn: "2025-01-01",
    },
  ],

  /* ══════════════════════════════════════════════════════
     SECTION 3 — ANTI-FAKEOUT RULES
     If ANY rule triggers, signal is flagged and score × 0.82
  ══════════════════════════════════════════════════════ */
  antiFakeoutRules: [
    {
      id: "oi_spike",
      name: "Single-Candle OI Spike > 8%",
      active: true,
      trigger: "abs(OI_change) > 8%",
      warning: "OI spike >8% in one candle — possible operator trap. Wait for next candle to confirm continuation.",
      explanation: "Operators (large traders) sometimes create artificial OI spikes to trigger retail stop-losses or lure them into bad entries. A genuine buildup takes multiple candles. A single-candle spike is suspicious and warrants waiting for confirmation.",
      howToVerify: "Check if OI continues rising in the next 5-min candle. If yes — real buildup. If OI stabilises or falls — it was a trap.",
      addedOn: "2025-01-15",
    },
    {
      id: "price_spike",
      name: "Single-Session Price Move > 3.5%",
      active: true,
      trigger: "abs(price_change) > 3.5%",
      warning: "Price move >3.5% — possible stop-hunt spike. Wait for candle close confirmation before entering.",
      explanation: "Moves larger than 3.5% in a single session often represent a stop-hunt — where large players push price quickly to trigger stop-losses from existing positions, then reverse. This is especially common in the first 30 minutes of trading.",
      howToVerify: "If the large candle has a long upper/lower wick, it was likely a stop-hunt. A strong closing candle (body > 60% of range) is more reliable.",
      addedOn: "2025-01-15",
    },
    {
      id: "low_volume",
      name: "Volume Below 1.2x Average",
      active: true,
      trigger: "vol_ratio < 1.2",
      warning: "Volume <1.2x average — low institutional participation. High fakeout risk on this signal.",
      explanation: "Without institutional participation, price moves are driven by retail traders who are more easily shaken out. Low-volume breakouts lack the 'fuel' to sustain the move and typically fail when volume normalises.",
      howToVerify: "Wait for a second candle where volume is above average to confirm the move is real before entering.",
      addedOn: "2025-01-15",
    },
    {
      id: "pcr_buy_contradiction",
      name: "PCR > 1.3 on BUY Signal",
      active: true,
      trigger: "signal == BUY and pcr > 1.3",
      warning: "PCR >1.3 with BUY signal — heavy put writing suggests underlying bearish bias. Exercise caution.",
      explanation: "When PCR is very high (> 1.3) but a BUY signal appears, it means the options market is heavily positioned for a fall. The stock may be experiencing a brief short-term bounce, but the options market disagrees with the upside view. This creates conflicting signals.",
      howToVerify: "Monitor PCR over the next 30 minutes. If PCR drops below 1.0, the bearish bias is fading and the BUY becomes more valid.",
      addedOn: "2025-01-20",
    },
    {
      id: "pcr_sell_contradiction",
      name: "PCR < 0.6 on SELL Signal",
      active: true,
      trigger: "signal == SELL and pcr < 0.6",
      warning: "PCR <0.6 with SELL signal — heavy call writing suggests bullish options bias. Exercise caution.",
      explanation: "Very low PCR (< 0.6) means the market is overwhelmingly bullish in options positioning. A SELL signal here could be a temporary intraday dip within a larger bullish trend — potentially a trap for shorts.",
      howToVerify: "Look at the daily chart. If the stock is in an uptrend on the daily timeframe, the SELL signal on 5-min is likely a scalp opportunity only, not a trend trade.",
      addedOn: "2025-01-20",
    },
  ],

  /* ══════════════════════════════════════════════════════
     SECTION 4 — CONVICTION LEVELS
     How to act based on final success score
  ══════════════════════════════════════════════════════ */
  convictionLevels: [
    {
      label: "HIGH CONVICTION",
      range: [80, 96],
      color: "#00d68f",
      action: "Enter full position size at next candle open",
      positionSize: "100%",
      entryTiming: "Next candle open after signal",
      description: "All major factors aligned. Strong OI buildup, PCR confirmed, index agreeing, and clean signal with no fakeout flags. This is your highest-quality setup.",
    },
    {
      label: "STRONG",
      range: [65, 79],
      color: "#5ecea0",
      action: "Enter 50% position — wait for one more confirming candle",
      positionSize: "50%",
      entryTiming: "After one confirming candle close",
      description: "Most factors aligned but one or two are weak (e.g., volume slightly low, or PCR partially aligned). Reduce risk by entering half size and adding the rest if the next candle confirms.",
    },
    {
      label: "MODERATE",
      range: [50, 64],
      color: "#f5a623",
      action: "Enter 25% size only, or paper trade and monitor",
      positionSize: "25%",
      entryTiming: "After two confirming candles",
      description: "Signal exists but several factors are weak. Could work but risk of failure is meaningful. Only enter if you have specific sector knowledge or a separate reason to be in this trade.",
    },
    {
      label: "WEAK",
      range: [40, 49],
      color: "#ff6b6b",
      action: "Do not enter. Add to watchlist.",
      positionSize: "0%",
      entryTiming: "Skip",
      description: "Too many factors are against this trade. OI signal may be present but it lacks volume, PCR, or index confirmation. Entering here is speculative, not strategic.",
    },
    {
      label: "VERY WEAK",
      range: [20, 39],
      color: "#ff4f6a",
      action: "Skip completely. High fakeout probability.",
      positionSize: "0%",
      entryTiming: "Skip",
      description: "Signal is technically present but almost all supporting factors are missing or contradicting. This setup has a negative expected value — skipping is the professional decision.",
    },
  ],

  /* ══════════════════════════════════════════════════════
     SECTION 5 — ENTRY & EXIT RULES
  ══════════════════════════════════════════════════════ */
  entryExitRules: {
    entryWindows: [
      {
        time: "9:30–9:45 AM",
        label: "AVOID",
        color: "#ff4f6a",
        reason: "First 15 minutes is the operator manipulation zone. Large players push price in false directions to trigger retail stop-losses and create liquidity for their real positions. All apparent signals in this window have a high failure rate.",
      },
      {
        time: "9:45–11:30 AM",
        label: "BEST WINDOW",
        color: "#00d68f",
        reason: "The strongest and most reliable entry window. Morning trends establish themselves after the initial noise clears. OI builds steadily. Volume is high. Take any STRONG or HIGH CONVICTION signal in this window.",
      },
      {
        time: "11:30 AM–1:00 PM",
        label: "MODERATE",
        color: "#f5a623",
        reason: "Trends begin to slow and consolidate. Some whipsaw is common as participants take lunch-hour positions. Only take HIGH CONVICTION signals. Avoid MODERATE or WEAK setups entirely in this period.",
      },
      {
        time: "1:00–2:00 PM",
        label: "AVOID",
        color: "#ff4f6a",
        reason: "The dead zone. Volume drops to its daily low. Even genuine signals can fail because there is not enough liquidity to sustain moves. Random noise dominates price action. Do not enter new positions.",
      },
      {
        time: "2:00–3:00 PM",
        label: "GOOD",
        color: "#5ecea0",
        reason: "Volume picks back up as end-of-day positioning begins. Trends that have been building all day tend to extend in this window. Take STRONG and HIGH CONVICTION signals for intraday or short-term swings.",
      },
      {
        time: "3:00–3:15 PM",
        label: "EXIT ONLY",
        color: "#f5a623",
        reason: "Closing squareoff begins. Institutional traders are closing intraday positions, creating artificial price movements that are not directional. No new entries. Focus on managing existing positions.",
      },
      {
        time: "3:15–3:30 PM",
        label: "MARKET CLOSE",
        color: "#8892a4",
        reason: "F&O expiry settlements and last-minute institutional moves. Very unpredictable. All intraday positions should be closed before 3:15 PM to avoid closing auction volatility.",
      },
    ],

    stopLossRules: [
      {
        rule: "ATR-Based SL (Not Fixed %)",
        detail: "Stop-loss is placed at 1 ATR below entry for BUY (1 ATR above for SELL). ATR is calibrated per stock — metals/PSU banks get wider ATR than FMCG/IT stocks. This accounts for each stock's natural volatility range.",
      },
      {
        rule: "Low Volume = Wider SL (1.4x ATR)",
        detail: "When volume is below 1.5x average, SL is widened to 1.4× ATR instead of 1×. Low volume creates choppier, noisier price action that will hit a tight SL even on valid trades. The wider SL absorbs this noise.",
      },
      {
        rule: "Breakeven Rule — Zero Risk After 1 ATR",
        detail: "As soon as price moves 1 ATR in your favour (shown as Breakeven Trigger on each trade), immediately move your SL to your entry price. This converts the trade to a zero-risk position — worst case is breakeven, best case is the full target.",
      },
      {
        rule: "Never Widen SL After Entry",
        detail: "Once a SL is set, it must never be moved further away from entry. Widening SL is how retail traders turn small losses into large ones. If the trade doesn't work, the SL keeps the loss small and capital is preserved for the next setup.",
      },
      {
        rule: "1:2 Risk-Reward Minimum",
        detail: "Every trade targets at least 2× the risk. If SL is ₹20 away from entry, the target must be at least ₹40 away. Never take a trade where the potential gain is less than twice the potential loss.",
      },
    ],

    confirmationRules: [
      {
        rule: "Wait for Candle Close",
        detail: "Never enter mid-candle. Always wait for the 15-minute candle to fully close above (BUY) or below (SELL) the structure before entering. A candle that closes back inside the range is a failed breakout.",
      },
      {
        rule: "BUY: Close Above Previous 15-Min High",
        detail: "For a BUY signal, the entry candle must close above the high of the previous 15-minute candle. This confirms that bulls have overcome recent resistance and the move is genuine.",
      },
      {
        rule: "SELL: Close Below Previous 15-Min Low",
        detail: "For a SELL signal, the entry candle must close below the low of the previous 15-minute candle. This confirms that bears have broken recent support.",
      },
      {
        rule: "OI Must Rise for 2 Consecutive Candles",
        detail: "A single candle OI jump can be manipulation. Wait for OI to continue rising in the next candle to confirm that institutional players are consistently building the position — not just creating a single-candle trap.",
      },
    ],
  },

  /* ══════════════════════════════════════════════════════
     SECTION 6 — PRICE LEVEL CALCULATION
  ══════════════════════════════════════════════════════ */
  priceLevelMethod: {
    atrMethod: "ATR approximated as price × sector_ATR% (calibrated per stock based on historical volatility)",
    entryRule: "LTP × 1.001 for BUY (slight premium avoids buying into a spike top) | LTP × 0.999 for SELL",
    targetRule: "Entry ± (ATR × 2.0) — always 1:2 risk:reward",
    stopLossRule: "Entry ∓ (ATR × sl_multiplier) where sl_multiplier = 1.0 for high-vol stocks, 1.4 for low-vol stocks",
    breakevenRule: "Move SL to entry when price reaches Entry ± (ATR × 1.0)",
    sectorATRs: [
      { sector: "IT",       atrPct: "1.0%", note: "Stable, lower volatility" },
      { sector: "FMCG",     atrPct: "1.0%", note: "Defensive, lower volatility" },
      { sector: "Banking",  atrPct: "1.1–1.2%", note: "Moderate volatility" },
      { sector: "Auto",     atrPct: "1.0–1.5%", note: "Varies by company" },
      { sector: "Pharma",   atrPct: "1.1%", note: "Can spike on news" },
      { sector: "Energy",   atrPct: "1.2–1.3%", note: "Crude oil sensitivity" },
      { sector: "Infra",    atrPct: "1.2–1.5%", note: "Policy-sensitive" },
      { sector: "Metal",    atrPct: "1.5–1.8%", note: "High volatility, global commodity prices" },
      { sector: "Finance",  atrPct: "1.1–1.4%", note: "Rate-sensitive" },
      { sector: "Telecom",  atrPct: "1.1%", note: "Moderate" },
    ],
  },

};
// End of strategies.js
