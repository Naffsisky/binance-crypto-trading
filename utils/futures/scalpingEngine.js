const { ADX } = require('technicalindicators')
const { calcEMA, calcRSI, calcStochastic, calcBB, calcMACD, calcATR, calcVWAP, calcADX } = require('./futuresIndicator')
const { fetchKlines } = require('./fetchKlines')

const MAX_LEVERAGE = 20

async function scanScalpingSignal(symbol) {
  try {
    const tf1m = await fetchKlines(symbol, '1m', 100)
    const tf5m = await fetchKlines(symbol, '5m', 50)

    if (tf1m.length < 50 || tf5m.length < 20) return null

    const closes1m = tf1m.map((c) => c.close)
    const highs1m = tf1m.map((c) => c.high)
    const lows1m = tf1m.map((c) => c.low)
    const volumes1m = tf1m.map((c) => c.volume)

    const emaFast = calcEMA(closes1m, 5)
    const emaSlow = calcEMA(closes1m, 21)
    const rsi = calcRSI(closes1m, 14)
    const stoch = calcStochastic({ high: highs1m, low: lows1m, close: closes1m, period: 14, signalPeriod: 3 })
    const bb = calcBB({ values: closes1m, period: 20, stdDev: 2 })
    const macd = calcMACD({ values: closes1m, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 })
    const atr = calcATR({ high: highs1m, low: lows1m, close: closes1m, period: 14 })
    const vwap = calcVWAP(highs1m, lows1m, closes1m, volumes1m)
    const avgVol = volumes1m.slice(-20).reduce((a, b) => a + b, 0) / 20

    const adx = ADX.calculate({
      close: closes1m,
      high: highs1m,
      low: lows1m,
      period: 14,
    })

    const last = {
      price: closes1m[closes1m.length - 1],
      emaFast: emaFast[emaFast.length - 1],
      emaSlow: emaSlow[emaSlow.length - 1],
      rsi: rsi[rsi.length - 1],
      stochK: stoch[stoch.length - 1].k,
      stochD: stoch[stoch.length - 1].d,
      bbUpper: bb[bb.length - 1].upper,
      bbLower: bb[bb.length - 1].lower,
      macdHist: macd[macd.length - 1].histogram,
      atr: atr[atr.length - 1],
      vwap: vwap[vwap.length - 1],
    }

    let bullishScore = 0
    let bearishScore = 0

    if (last.emaFast > last.emaSlow) bullishScore += 1.5
    if (last.price > last.vwap) bullishScore += 1.0
    if (last.rsi > 50 && last.rsi < 70) bullishScore += 1.0
    if (last.stochK > last.stochD && last.stochK < 80) bullishScore += 1.0
    if (last.macdHist > 0) bullishScore += 1.0
    if (last.price > (last.bbUpper + last.bbLower) / 2) bullishScore += 0.5
    if (volumes1m[volumes1m.length - 1] > avgVol) {
      bullishScore += 0.5
    }
    if (adx[adx.length - 1]?.adx > 20) {
      bullishScore += 0.5
    }

    if (last.emaFast < last.emaSlow) bearishScore += 1.5
    if (last.price < last.vwap) bearishScore += 1.0
    if (last.rsi < 50 && last.rsi > 30) bearishScore += 1.0
    if (last.stochK < last.stochD && last.stochK > 20) bearishScore += 1.0
    if (last.macdHist < 0) bearishScore += 1.0
    if (last.price < (last.bbUpper + last.bbLower) / 2) bearishScore += 0.5

    let direction = null
    let score = 0

    if (bullishScore > bearishScore && bullishScore >= 4.5) {
      direction = 'BULLISH'
      score = bullishScore
    } else if (bearishScore > bullishScore && bearishScore >= 4.5) {
      direction = 'BEARISH'
      score = bearishScore
    } else {
      return null
    }

    const volatility = last.atr / last.price
    let leverage = Math.min(MAX_LEVERAGE, Math.max(1, Math.floor(0.1 / volatility)))

    if (last.price < 0.01 && leverage > 10) {
      leverage = 10
    }

    const riskRewardRatio = 1.5
    const stopLoss = direction === 'BULLISH' ? last.price - last.atr * 1.5 : last.price + last.atr * 1.5

    const takeProfit = direction === 'BULLISH' ? last.price + last.atr * riskRewardRatio * 2 : last.price - last.atr * riskRewardRatio * 2

    return {
      symbol,
      direction,
      score,
      price: last.price,
      stopLoss,
      takeProfit,
      atr: last.atr,
      leverage,
    }
  } catch (err) {
    console.error(`Error scanning ${symbol}:`, err.message)
    return null
  }
}

module.exports = { scanScalpingSignal }
