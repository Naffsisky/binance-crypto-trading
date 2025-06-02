const { calcEMA, calcRSI, calcStochastic, calcBB, calcMACD, calcATR, calcVWAP } = require('./futuresIndicator')
const { fetchKlines } = require('./fetchKlines')
const { getFuturesPrice } = require('../balancePrice')

// Indikator utama untuk scalping
const SCALPING_INDICATORS = {
  emaFast: 5,
  emaSlow: 21,
  rsiPeriod: 14,
  stochPeriod: 14,
  bbPeriod: 20,
  bbDev: 2,
  atrPeriod: 14,
  macdFast: 12,
  macdSlow: 26,
  macdSignal: 9,
}

const MAX_LEVERAGE = 20 // Leverage maksimum

async function scanScalpingSignal(symbol) {
  try {
    // Ambil data 1m dan 5m
    const tf1m = await fetchKlines(symbol, '1m', 100)
    const tf5m = await fetchKlines(symbol, '5m', 50)

    if (tf1m.length < 50 || tf5m.length < 20) return null

    // Ekstrak data
    const closes1m = tf1m.map((c) => c.close)
    const highs1m = tf1m.map((c) => c.high)
    const lows1m = tf1m.map((c) => c.low)
    const volumes1m = tf1m.map((c) => c.volume)

    // Hitung indikator
    const emaFast = calcEMA(closes1m, 5)
    const emaSlow = calcEMA(closes1m, 21)
    const rsi = calcRSI(closes1m, 14)
    const stoch = calcStochastic({ high: highs1m, low: lows1m, close: closes1m, period: 14, signalPeriod: 3 })
    const bb = calcBB({ values: closes1m, period: 20, stdDev: 2 })
    const macd = calcMACD({ values: closes1m, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 })
    const atr = calcATR({ high: highs1m, low: lows1m, close: closes1m, period: 14 })
    const vwap = calcVWAP(highs1m, lows1m, closes1m, volumes1m)

    // Ambil nilai terakhir
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

    // Hitung skor untuk BULLISH dan BEARISH
    let bullishScore = 0
    let bearishScore = 0

    // Kondisi bullish
    if (last.emaFast > last.emaSlow) bullishScore += 1.5
    if (last.price > last.vwap) bullishScore += 1.0
    if (last.rsi > 50 && last.rsi < 70) bullishScore += 1.0
    if (last.stochK > last.stochD && last.stochK < 80) bullishScore += 1.0
    if (last.macdHist > 0) bullishScore += 1.0
    if (last.price > (last.bbUpper + last.bbLower) / 2) bullishScore += 0.5

    // Kondisi bearish
    if (last.emaFast < last.emaSlow) bearishScore += 1.5
    if (last.price < last.vwap) bearishScore += 1.0
    if (last.rsi < 50 && last.rsi > 30) bearishScore += 1.0
    if (last.stochK < last.stochD && last.stochK > 20) bearishScore += 1.0
    if (last.macdHist < 0) bearishScore += 1.0
    if (last.price < (last.bbUpper + last.bbLower) / 2) bearishScore += 0.5

    // Tentukan arah dan skor
    let direction = null
    let score = 0

    if (bullishScore > bearishScore && bullishScore >= 3.5) {
      direction = 'BULLISH'
      score = bullishScore
    } else if (bearishScore > bullishScore && bearishScore >= 3.5) {
      direction = 'BEARISH'
      score = bearishScore
    } else {
      return null // Tidak ada sinyal yang cukup kuat
    }

    // Hitung leverage otomatis berdasarkan volatilitas
    const volatility = last.atr / last.price
    let leverage = Math.min(MAX_LEVERAGE, Math.max(1, Math.floor(0.1 / volatility)))

    // Untuk coin dengan harga sangat rendah (<$0.01), batasi leverage
    if (last.price < 0.01 && leverage > 10) {
      leverage = 10
    }

    // Hitung stop loss dan take profit
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
