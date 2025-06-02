// ./scanner/futuresScanner.js
const { fetchKlines } = require('../utils/futures/fetchKlines.js')
const { calcSMA, calcEMA, calcRSI, calcStochastic, calcBB } = require('../utils/futures/futuresIndicator.js')

/**
 * Cek sinyal bullish/bearish untuk satu simbol futures
 * @param {string} symbol – misal 'BTCUSDT'
 * @returns {object} – { symbol, direction, score, details }
 */
async function evaluateSymbol(symbol) {
  // 1. Ambil klines
  // – 1m (butuh ~20–50 candle untuk RSI14 + BB + Stochastic)
  const klines1m = await fetchKlines(symbol, '1m', 100)
  // – 2m (butuh ~20–50 candle untuk SMA Ribbon)
  const klines2m = await fetchKlines(symbol, '2m', 100)
  // – 5m (untuk EMA9/21, EMA20/50, RSI7)
  const klines5m = await fetchKlines(symbol, '5m', 100)

  // Siapkan arrays high/low/close
  const close1m = klines1m.map((c) => c.close)
  const high1m = klines1m.map((c) => c.high)
  const low1m = klines1m.map((c) => c.low)
  const volume1m = klines1m.map((c) => c.volume)

  const close2m = klines2m.map((c) => c.close)
  const high2m = klines2m.map((c) => c.high)
  const low2m = klines2m.map((c) => c.low)
  const volume2m = klines2m.map((c) => c.volume)

  const close5m = klines5m.map((c) => c.close)
  const high5m = klines5m.map((c) => c.high)
  const low5m = klines5m.map((c) => c.low)
  const volume5m = klines5m.map((c) => c.volume)

  // 2. Hitung semua indikator

  // 2a) SMA Ribbon (2m): SMA5, SMA8, SMA13
  const sma5_2m = calcSMA(close2m, 5)
  const sma8_2m = calcSMA(close2m, 8)
  const sma13_2m = calcSMA(close2m, 13)
  // Karena hasil SMA array akan lebih pendek (length = close2m.length – periode + 1),
  // kita ambil index terakhir sebagai value terkini
  const latestSMA5_2m = sma5_2m[sma5_2m.length - 1]
  const latestSMA8_2m = sma8_2m[sma8_2m.length - 1]
  const latestSMA13_2m = sma13_2m[sma13_2m.length - 1]

  // 2b) EMA Crossover (5m): EMA9 dan EMA21
  const ema9_5m = calcEMA(close5m, 9)
  const ema21_5m = calcEMA(close5m, 21)
  const latestEMA9_5m = ema9_5m[ema9_5m.length - 1]
  const latestEMA21_5m = ema21_5m[ema21_5m.length - 1]
  // Untuk detect crossover, kita butuh juga “value prev”:
  const prevEMA9_5m = ema9_5m[ema9_5m.length - 2]
  const prevEMA21_5m = ema21_5m[ema21_5m.length - 2]

  // 2c) Filter Tren (5m): EMA20 dan EMA50
  const ema20_5m = calcEMA(close5m, 20)
  const ema50_5m = calcEMA(close5m, 50)
  const latestEMA20_5m = ema20_5m[ema20_5m.length - 1]
  const latestEMA50_5m = ema50_5m[ema50_5m.length - 1]

  // 2d) RSI (1m): periode 14, ambang 25/75
  const rsi14_1m = calcRSI(close1m, 14)
  const latestRSI14_1m = rsi14_1m[rsi14_1m.length - 1]
  const prevRSI14_1m = rsi14_1m[rsi14_1m.length - 2]

  // 2e) RSI (5m): periode 7, ambang 30/70
  const rsi7_5m = calcRSI(close5m, 7)
  const latestRSI7_5m = rsi7_5m[rsi7_5m.length - 1]

  // 2f) Stochastic (1m): %K periode 9 (atau 5–9), %D 3, smoothing 1
  const stoch1m = calcStochastic({
    high: high1m,
    low: low1m,
    close: close1m,
    period: 9,
    signalPeriod: 3,
    smoothing: 1,
  })
  const latestStoch1m = stoch1m[stoch1m.length - 1] // { k: x, d: y }
  const prevStoch1m = stoch1m[stoch1m.length - 2]

  // 2g) Stochastic (5m): %K 14, %D 3, smoothing 3
  const stoch5m = calcStochastic({
    high: high5m,
    low: low5m,
    close: close5m,
    period: 14,
    signalPeriod: 3,
    smoothing: 3,
  })
  const latestStoch5m = stoch5m[stoch5m.length - 1]

  // 2h) Bollinger Bands (1m): periode 14, stdDev 2
  const bb1m = calcBB({ values: close1m, period: 14, stdDev: 2 })
  const latestBB1m = bb1m[bb1m.length - 1] // { lower, middle, upper, pb }

  // 2i) (Opsional) MACD (1m): (12, 26, 9)
  // const macd1m = calcMACD({ values: close1m, fastPeriod: 12, slowPeriod: 26, signalPeriod: 9 })
  // const latestMACD1m = macd1m[macd1m.length - 1] // { MACD, signal, histogram }

  // 2j) (Opsional) Volume Filter: rata‐rata volume 20 candle terakhir (1m)
  const avgVol1m_20 = volume1m.slice(-20).reduce((a, b) => a + b, 0) / 20
  const latestVol1m = volume1m[volume1m.length - 1]

  // 3. Terapkan logika “bullish” / “bearish” & hitung score
  let scoreBullish = 0
  let scoreBearish = 0

  // 3a) SMA Ribbon 2m: bullish jika SMA5 > SMA8 > SMA13
  if (latestSMA5_2m > latestSMA8_2m && latestSMA8_2m > latestSMA13_2m) {
    scoreBullish++
  }
  // Bearish jika SMA5 < SMA8 < SMA13
  if (latestSMA5_2m < latestSMA8_2m && latestSMA8_2m < latestSMA13_2m) {
    scoreBearish++
  }

  // 3b) EMA Crossover (5m):
  // – Bullish: prevEMA9 < prevEMA21 && latestEMA9 > latestEMA21
  if (prevEMA9_5m < prevEMA21_5m && latestEMA9_5m > latestEMA21_5m) {
    scoreBullish++
  }
  // – Bearish: prevEMA9 > prevEMA21 && latestEMA9 < latestEMA21
  if (prevEMA9_5m > prevEMA21_5m && latestEMA9_5m < latestEMA21_5m) {
    scoreBearish++
  }

  // 3c) Filter tren (5m):
  // – Bullish jika EMA20 > EMA50
  if (latestEMA20_5m > latestEMA50_5m) {
    scoreBullish++
  }
  // – Bearish jika EMA20 < EMA50
  if (latestEMA20_5m < latestEMA50_5m) {
    scoreBearish++
  }

  // 3d) RSI (1m): bullish si RSI14 menembus dari bawah 25 → naik
  if (prevRSI14_1m < 25 && latestRSI14_1m > 25) {
    scoreBullish++
  }
  // Bearish: RSI14 menembus dari atas 75 → turun
  if (prevRSI14_1m > 75 && latestRSI14_1m < 75) {
    scoreBearish++
  }

  // 3e) RSI (5m) + Filter tren: bullish jika latestRSI7_5m > 30 && EMA20 > EMA50
  if (latestRSI7_5m > 30 && latestEMA20_5m > latestEMA50_5m) {
    scoreBullish++
  }
  // Bearish: latestRSI7_5m < 70 && EMA20 < EMA50
  if (latestRSI7_5m < 70 && latestEMA20_5m < latestEMA50_5m) {
    scoreBearish++
  }

  // 3f) Stochastic 1m: bullish jika prev %K < 20 && latest %K > latest %D
  if (prevStoch1m.k < 20 && latestStoch1m.k > latestStoch1m.d) {
    scoreBullish++
  }
  // Bearish: prev %K > 80 && latest %K < latest %D
  if (prevStoch1m.k > 80 && latestStoch1m.k < latestStoch1m.d) {
    scoreBearish++
  }

  // 3g) Stochastic 5m: bullish jika latest %K < 20 && cross‐up
  if (stoch5m[stoch5m.length - 2].k < 20 && latestStoch5m.k > latestStoch5m.d) {
    scoreBullish++
  }
  // Bearish: %K > 80 && cross‐down
  if (stoch5m[stoch5m.length - 2].k > 80 && latestStoch5m.k < latestStoch5m.d) {
    scoreBearish++
  }

  // 3h) Bollinger Bands (1m): bullish jika harga close menembus lower band
  const lastClose1m = close1m[close1m.length - 1]
  if (lastClose1m < latestBB1m.lower) {
    scoreBullish++
  }
  // Bearish: if lastClose1m > upper band
  if (lastClose1m > latestBB1m.upper) {
    scoreBearish++
  }

  // 3i) Volume (1m): bullish jika volume > rata‐rata 20 dan price naik
  const prevClose1m = close1m[close1m.length - 2]
  if (latestVol1m > avgVol1m_20 && lastClose1m > prevClose1m) {
    scoreBullish++
  }
  // Bearish: volume > rata and harga turun
  if (latestVol1m > avgVol1m_20 && lastClose1m < prevClose1m) {
    scoreBearish++
  }

  // 4. Tentukan direction akhir & score
  let direction = 'NEUTRAL'
  let finalScore = 0

  if (scoreBullish > scoreBearish && scoreBullish >= 4) {
    direction = 'BULLISH'
    finalScore = scoreBullish
  } else if (scoreBearish > scoreBullish && scoreBearish >= 4) {
    direction = 'BEARISH'
    finalScore = scoreBearish
  }

  // Kirim detail untuk logging/analisis
  return {
    symbol,
    direction,
    score: direction === 'BULLISH' ? scoreBullish : direction === 'BEARISH' ? scoreBearish : 0,
    details: {
      smaRibbon: { latestSMA5_2m, latestSMA8_2m, latestSMA13_2m },
      emaCrossover: { prevEMA9_5m, prevEMA21_5m, latestEMA9_5m, latestEMA21_5m },
      trendFilter5m: { latestEMA20_5m, latestEMA50_5m },
      rsi14_1m: { prev: prevRSI14_1m, latest: latestRSI14_1m },
      rsi7_5m: latestRSI7_5m,
      stoch1m: { prev: prevStoch1m, latest: latestStoch1m },
      stoch5m: latestStoch5m,
      bb1m: latestBB1m,
      volume1m: { prevAvg20: avgVol1m_20, latest: latestVol1m },
    },
  }
}

/**
 * Scan banyak simbol secara berurutan (bisa juga paralel dengan Promise.all,
 * tapi hati-hati ratelimit).
 * @param {string[]} symbols – contohnya ['BTCUSDT','ETHUSDT',...]
 * @returns {Promise<object[]>} – array hasil evaluateSymbol()
 */
async function scanSymbols(symbols) {
  const results = []
  for (let i = 0; i < symbols.length; i++) {
    try {
      const res = await evaluateSymbol(symbols[i])
      results.push(res)
    } catch (err) {
      console.error(`Error scanning ${symbols[i]}: ${err.message}`)
    }
  }
  return results
}

module.exports = { scanSymbols }
