require('dotenv').config()
const inquirer = require('inquirer')
const { Spot } = require('@binance/connector')
const { SMA, EMA, RSI, MACD, ATR, Stochastic, WilliamsR, BollingerBands, ADX } = require('technicalindicators')

const spotClient = new Spot(process.env.API_KEY, process.env.API_SECRET, {
  recvWindow: 60000,
  timestamp: Date.now,
})

async function predictAndAnalyze() {
  const { symbol: rawSymbol } = await inquirer.prompt([
    {
      type: 'input',
      name: 'symbol',
      message: 'Masukkan simbol (contoh: BTCUSDT):',
      validate: (input) => !!input.trim() || 'Simbol tidak boleh kosong',
    },
  ])

  const symbol = rawSymbol.trim().toUpperCase()

  try {
    // Dapatkan harga saat ini
    const res = await spotClient.avgPrice(symbol)
    const currentPrice = parseFloat(res.data.price)
    const decimals = currentPrice < 1 ? 8 : 2

    console.log(`\n🏷️  Harga saat ini untuk ${symbol}: ${currentPrice.toFixed(decimals)} USDT`)

    // Dapatkan data klines (candle) dengan timeframe lebih panjang
    const klinesRes = await spotClient.klines(symbol, '1h', { limit: 200 })
    const klines = klinesRes.data

    const MIN_CANDLES = 150 // Untuk indikator periode panjang (SMA100, Ichimoku)
    if (klines.length < MIN_CANDLES) {
      const missing = MIN_CANDLES - klines.length
      console.log(`\n⚠️  Data kurang ${missing} candle. Menggunakan data maksimal yang tersedia`)
    }

    // Ekstrak data untuk analisis
    const closes = klines.map((k) => parseFloat(k[4]))
    const highs = klines.map((k) => parseFloat(k[2]))
    const lows = klines.map((k) => parseFloat(k[3]))
    const volumes = klines.map((k) => parseFloat(k[5]))
    const opens = klines.map((k) => parseFloat(k[1]))
    const lastCandle = {
      open: parseFloat(klines[klines.length - 1][1]),
      high: parseFloat(klines[klines.length - 1][2]),
      low: parseFloat(klines[klines.length - 1][3]),
      close: closes[closes.length - 1],
    }
    const isBullishEngulfing =
      closes[closes.length - 2] < opens[opens.length - 2] && // Bearish sebelumnya
      lastCandle.close > lastCandle.open && // Bullish sekarang
      lastCandle.close > opens[opens.length - 2] && // Close di atas open sebelumnya
      lastCandle.open < closes[closes.length - 2] // Open di bawah close sebelumnya

    if (isBullishEngulfing) {
      signals.push({
        type: 'BUY',
        signal: 'BULLISH ENGULFING',
        description: 'Pola candlestick reversal bullish',
        weight: 1.4,
      })
    }

    // 1. Moving Averages
    const sma20 = SMA.calculate({ period: 20, values: closes }).pop()
    const sma50 = SMA.calculate({ period: 50, values: closes }).pop()
    const sma100 = SMA.calculate({ period: 100, values: closes }).pop()
    const ema12 = EMA.calculate({ period: 12, values: closes }).pop()
    const ema26 = EMA.calculate({ period: 26, values: closes }).pop()
    const ema50 = EMA.calculate({ period: 50, values: closes }).pop()

    // 2. Momentum Indicators
    const rsi = getLastValue(RSI.calculate, { period: 14, values: closes }, 50)
    const macd = getLastValue(
      MACD.calculate,
      {
        values: closes,
        fastPeriod: 12,
        slowPeriod: 26,
        signalPeriod: 9,
      },
      { MACD: 0, signal: 0, histogram: 0 }
    )

    const stoch = Stochastic.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
      signalPeriod: 3,
    }).pop()

    const williamsR = WilliamsR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    }).pop()

    const vwma = (period) => {
      let sum = 0
      let volSum = 0
      for (let i = closes.length - period; i < closes.length; i++) {
        sum += closes[i] * volumes[i]
        volSum += volumes[i]
      }
      return sum / volSum
    }

    const vwma12 = vwma(12)
    const vwma26 = vwma(26)
    const vmacd = vwma12 - vwma26

    // 3. Volatility & Volume
    const atr = ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    }).pop()

    const volumeAvg20 = SMA.calculate({ period: 20, values: volumes }).pop()
    const currentVolume = volumes[volumes.length - 1]
    const volumeRatio = currentVolume / volumeAvg20

    // 4. Support & Resistance (Pivot Points)
    const pivot = calculatePivotPoints(highs, lows, closes)

    // 5. Ichimoku Cloud (untuk analisis komprehensif)
    const ichimoku = calculateIchimoku(highs, lows, closes)

    // 6. Fibonacci Retracement
    const fib = calculateFibonacciRetracement(highs, lows)

    // 7. Bollinger Bands
    const bb = getLastValue(
      BollingerBands.calculate,
      {
        period: 20,
        values: closes,
        stdDev: 2,
      },
      { upper: 0, middle: 0, lower: 0 }
    )

    // 8. ADX (Average Directional Index)
    const adxResult = getLastValue(
      ADX.calculate,
      {
        high: highs,
        low: lows,
        close: closes,
        period: 14,
      },
      { adx: 0 }
    )

    const adx = adxResult.adx || 0

    // Tampilkan hasil analisis
    console.log('\n📊 ANALISIS TEKNIKAL LANJUTAN:')
    console.log('-----------------------------------')

    // Trend Analysis
    console.log('\n🔍 TREND ANALYSIS:')
    console.log(`- SMA 20: ${sma20.toFixed(decimals)}`)
    console.log(`- SMA 50: ${sma50.toFixed(decimals)}`)
    console.log(`- SMA 100: ${sma100.toFixed(decimals)}`)
    console.log(`- EMA 12: ${ema12.toFixed(decimals)}`)
    console.log(`- EMA 26: ${ema26.toFixed(decimals)}`)
    console.log(`- EMA 50: ${ema50.toFixed(decimals)}`)

    const trendStatus =
      currentPrice > sma50 && sma50 > sma100 && ema12 > ema26
        ? '📈 BULLISH STRONG'
        : currentPrice > sma50 && sma50 > sma100
        ? '📈 BULLISH'
        : currentPrice < sma50 && sma50 < sma100 && ema12 < ema26
        ? '📉 BEARISH STRONG'
        : currentPrice < sma50 && sma50 < sma100
        ? '📉 BEARISH'
        : '↔️ SIDEWAYS'

    console.log(`- TREND: ${trendStatus}`)
    console.log(`- Ichimoku Cloud: ${ichimoku.signal}`)

    // Fibonacci & Bollinger Bands
    console.log('\n📐 FIBONACCI LEVELS:')
    console.log(`- 0.0%: ${fib.level0.toFixed(decimals)}`)
    console.log(`- 23.6%: ${fib.level236.toFixed(decimals)}`)
    console.log(`- 38.2%: ${fib.level382.toFixed(decimals)}`)
    console.log(`- 50.0%: ${fib.level500.toFixed(decimals)}`)
    console.log(`- 61.8%: ${fib.level618.toFixed(decimals)}`)

    console.log('\n📊 BOLLINGER BANDS (20,2):')
    console.log(`- Upper: ${bb.upper.toFixed(decimals)}`)
    console.log(`- Middle: ${bb.middle.toFixed(decimals)}`)
    console.log(`- Lower: ${bb.lower.toFixed(decimals)}`)
    console.log(`- Harga vs Bands: ${currentPrice > bb.upper ? 'DI ATAS' : currentPrice < bb.lower ? 'DI BAWAH' : 'DI TENGAH'}`)

    console.log('\n🌀 TREND STRENGTH (ADX):')
    console.log(`- ADX (14): ${adx.toFixed(2)} ${adx > 25 ? '(TREND KUAT)' : adx < 20 ? '(TREND LEMAH)' : ''}`)

    // Momentum Analysis
    console.log('\n⚡ MOMENTUM ANALYSIS:')
    console.log(`- RSI (14): ${rsi.toFixed(2)} ${rsi > 70 ? '(OVERBOUGHT)' : rsi < 30 ? '(OVERSOLD)' : ''}`)
    console.log(`- Stochastic: K=${stoch.k.toFixed(2)}, D=${stoch.d.toFixed(2)} ${stoch.k < 20 ? '(OVERSOLD)' : stoch.k > 80 ? '(OVERBOUGHT)' : ''}`)
    console.log(`- Williams %R: ${williamsR.toFixed(2)} ${williamsR < -80 ? '(OVERSOLD)' : williamsR > -20 ? '(OVERBOUGHT)' : ''}`)
    console.log(`- MACD: ${macd.MACD.toFixed(decimals)}`)
    console.log(`- Signal: ${macd.signal.toFixed(decimals)}`)
    console.log(`- Histogram: ${macd.histogram.toFixed(decimals)} ${macd.histogram > 0 ? '↑' : '↓'}`)
    console.log(`- ATR (14): ${atr.toFixed(decimals)} (Volatilitas)`)

    // Volume Analysis
    console.log('\n📦 VOLUME ANALYSIS:')
    console.log(`- Volume Terakhir: ${currentVolume.toFixed(2)}`)
    console.log(`- Rata2 Volume (20): ${volumeAvg20.toFixed(2)}`)
    console.log(`- Rasio Volume: ${volumeRatio.toFixed(2)}x ${volumeRatio > 1.5 ? '↑↑↑' : volumeRatio > 1.2 ? '↑↑' : volumeRatio < 0.8 ? '↓↓↓' : volumeRatio < 0.9 ? '↓↓' : ''}`)

    // Support & Resistance
    console.log('\n⛰️ SUPPORT & RESISTANCE:')
    console.log(`- Support (S1): ${pivot.s1.toFixed(decimals)}`)
    console.log(`- Pivot Point: ${pivot.pp.toFixed(decimals)}`)
    console.log(`- Resistance (R1): ${pivot.r1.toFixed(decimals)}`)
    console.log(`- Ichimoku Support: ${ichimoku.support.toFixed(decimals)}`)
    console.log(`- Ichimoku Resistance: ${ichimoku.resistance.toFixed(decimals)}`)

    // Volume Weighted Analysis
    console.log('\n📊 VOLUME WEIGHTED ANALYSIS:')
    console.log(`- Volume Weighted MACD: ${vmacd.toFixed(decimals)}`)
    console.log(`- Volume Weighted MA 12: ${vwma12.toFixed(decimals)}`)
    console.log(`- Volume Weighted MA 26: ${vwma26.toFixed(decimals)}`)

    // Print last candle details
    console.log('\n📈 LAST CANDLE DETAILS:')
    console.log(`- Harga Terakhir: ${currentPrice.toFixed(decimals)}`)
    console.log(`- Harga Open: ${lastCandle.open.toFixed(decimals)}`)
    console.log(`- Harga High: ${lastCandle.high.toFixed(decimals)}`)
    console.log(`- Harga Low: ${lastCandle.low.toFixed(decimals)}`)
    console.log(`- Harga Close: ${lastCandle.close.toFixed(decimals)}`)
    console.log(`- Bullish Engulfing: ${isBullishEngulfing ? 'YA' : 'TIDAK'}`)

    // Ringkasan Sinyal
    console.log('\n🚦 SIGNAL SUMMARY:')
    const signals = generateTradingSignals({
      price: currentPrice,
      sma20,
      sma50,
      sma100,
      ema12,
      ema26,
      rsi,
      macd,
      stoch,
      williamsR,
      volumeRatio,
      pivot,
      ichimoku,
      fib,
      bb,
      adx,
      trendDirection: currentPrice > sma50 ? 'up' : 'down',
    })

    signals.forEach((s, i) => console.log(`${i + 1}. ${s.signal} - ${s.description}`))

    // Rekomendasi berbasis sinyal
    const buySignals = signals.filter((s) => s.type === 'BUY').length
    const sellSignals = signals.filter((s) => s.type === 'SELL').length
    const neutralSignals = signals.filter((s) => s.type === 'NEUTRAL').length

    console.log('\n💡 REKOMENDASI:')
    if (buySignals > sellSignals + 2) {
      console.log('✅ STRONG BUY SIGNAL')
    } else if (buySignals > sellSignals) {
      console.log('🟢 BUY')
    } else if (sellSignals > buySignals + 2) {
      console.log('❌ STRONG SELL SIGNAL')
    } else if (sellSignals > buySignals) {
      console.log('🔴 SELL')
    } else {
      console.log(neutralSignals > 0 ? `🔵 ${neutralSignals} sinyal netral` : '')
      console.log('➡️ HOLD (Tidak ada sinyal kuat)')
    }
  } catch (err) {
    console.error('\n❌ Gagal menganalisis:', err.response?.data || err.message)
  }
}

// Helper Functions -----------------------------------------------------

function calculatePivotPoints(highs, lows, closes) {
  const high = Math.max(...highs.slice(-24)) // High 24 jam terakhir
  const low = Math.min(...lows.slice(-24)) // Low 24 jam terakhir
  const close = closes[closes.length - 1]

  const pp = (high + low + close) / 3
  return {
    pp,
    s1: 2 * pp - high,
    s2: pp - (high - low),
    s3: low - 2 * (high - pp),
    r1: 2 * pp - low,
    r2: pp + (high - low),
    r3: high + 2 * (pp - low),
  }
}

function calculateIchimoku(highs, lows, closes) {
  // Tenkan-sen (Conversion Line)
  const tenkanPeriod = 9
  const tenkanHigh = Math.max(...highs.slice(-tenkanPeriod))
  const tenkanLow = Math.min(...lows.slice(-tenkanPeriod))
  const tenkan = (tenkanHigh + tenkanLow) / 2

  // Kijun-sen (Base Line)
  const kijunPeriod = 26
  const kijunHigh = Math.max(...highs.slice(-kijunPeriod))
  const kijunLow = Math.min(...lows.slice(-kijunPeriod))
  const kijun = (kijunHigh + kijunLow) / 2

  // Senkou Span A (Leading Span A)
  const senkouA = (tenkan + kijun) / 2

  // Senkou Span B (Leading Span B)
  const senkouPeriod = 52
  const senkouHigh = Math.max(...highs.slice(-senkouPeriod))
  const senkouLow = Math.min(...lows.slice(-senkouPeriod))
  const senkouB = (senkouHigh + senkouLow) / 2

  const currentPrice = closes[closes.length - 1]

  return {
    tenkan,
    kijun,
    senkouA,
    senkouB,
    signal: currentPrice > senkouA && currentPrice > senkouB ? 'BULLISH ABOVE CLOUD' : currentPrice < senkouA && currentPrice < senkouB ? 'BEARISH BELOW CLOUD' : 'NEUTRAL IN CLOUD',
    support: Math.min(senkouA, senkouB),
    resistance: Math.max(senkouA, senkouB),
  }
}

function calculateFibonacciRetracement(highs, lows) {
  const period = 50 // Gunakan 50 candle terakhir
  const swingHigh = Math.max(...highs.slice(-period))
  const swingLow = Math.min(...lows.slice(-period))
  const diff = swingHigh - swingLow

  return {
    level0: swingHigh,
    level236: swingHigh - diff * 0.236,
    level382: swingHigh - diff * 0.382,
    level500: swingHigh - diff * 0.5,
    level618: swingHigh - diff * 0.618,
    level786: swingHigh - diff * 0.786,
    level100: swingLow,
  }
}

// Fungsi aman untuk mengambil nilai terakhir indikator
function getLastValue(calcFunction, params, defaultValue = 0) {
  try {
    const results = calcFunction(params)
    return results.length > 0 ? results[results.length - 1] : defaultValue
  } catch (e) {
    console.error(`Error calculating ${calcFunction.name}:`, e)
    return defaultValue
  }
}

function generateTradingSignals(data) {
  const signals = []
  const { price, fib, bb, adx } = data

  const weightedSignals = {
    TREND: 1.5,
    ICHIMOKU: 1.2,
    FIBONACCI: 1.0,
    BOLLINGER: 0.9,
    VOLUME: 0.8,
    MOMENTUM: 0.7,
  }

  // Trend signals
  if (data.price > data.sma50 && data.sma50 > data.sma100) {
    signals.push({
      type: 'BUY',
      signal: 'TREND BULLISH',
      description: 'Harga di atas SMA 50 dan SMA 50 > SMA 100',
    })
  }

  if (data.price < data.sma50 && data.sma50 < data.sma100) {
    signals.push({
      type: 'SELL',
      signal: 'TREND BEARISH',
      description: 'Harga di bawah SMA 50 dan SMA 50 < SMA 100',
    })
  }

  // Momentum signals
  if (data.rsi < 30 && data.macd.histogram > 0) {
    signals.push({
      type: 'BUY',
      signal: 'RSI OVERSOLD + MACD BULLISH',
      description: 'Momentum bullish setelah kondisi oversold',
    })
  }

  if (data.rsi > 70 && data.macd.histogram < 0) {
    signals.push({
      type: 'SELL',
      signal: 'RSI OVERBOUGHT + MACD BEARISH',
      description: 'Momentum bearish setelah kondisi overbought',
    })
  }

  // Volume confirmation
  if (data.volumeRatio > 1.5 && data.price > data.pivot.pp) {
    signals.push({
      type: 'BUY',
      signal: 'VOLUME KONFIRMASI BULLISH',
      description: 'Volume signifikan di atas pivot point',
    })
  }

  if (data.price > data.ichimoku.resistance) {
    if (data.volumeRatio > 1.3) {
      signals.push({
        type: 'BUY',
        signal: 'BREAKOUT KONFIRMASI VOLUME',
        description: 'Breakout resistance dengan volume tinggi',
        weight: 1.6,
      })
    }
  }

  // Ichimoku signals
  if (data.price > data.ichimoku.resistance && data.ichimoku.signal.includes('BULLISH')) {
    signals.push({
      type: 'BUY',
      signal: 'ICHIMOKU BULLISH BREAKOUT',
      description: 'Breakout di atas cloud Ichimoku',
    })
  }

  // Stochastic crossover
  if (data.stoch.k > data.stoch.d && data.stoch.k < 20) {
    signals.push({
      type: 'BUY',
      signal: 'STOCHASTIC BULLISH CROSSOVER',
      description: 'Bullish crossover di area oversold',
    })
  }

  // Williams %R confirmation
  if (data.williamsR < -80 && data.macd.histogram > 0) {
    signals.push({
      type: 'BUY',
      signal: 'WILLIAMS %R EXTREME OVERSOLD',
      description: 'Konfirmasi momentum bullish di area oversold ekstrim',
    })
  }

  // Fibonacci Support Signal
  const fibRange = fib.level382 - fib.level500
  const inFibZone = price >= fib.level500 - 0.05 * fibRange && price <= fib.level382 + 0.05 * fibRange

  if (inFibZone && data.volumeRatio > 1.2) {
    signals.push({
      type: 'BUY',
      signal: 'FIBONACCI SUPPORT + VOLUME',
      description: `Harga di area Fibonacci (${fib.level500.toFixed(8)}-${fib.level382.toFixed(8)}) dengan volume konfirmasi`,
      weight: 1.3,
    })
  }

  // Bollinger Bands Signal
  if (price < bb.lower && bb.lower > 0) {
    signals.push({
      type: 'BUY',
      signal: 'BOLLINGER OVERSOLD',
      description: `Harga menyentuh lower band (${bb.lower.toFixed(8)})`,
    })
  }

  // ADX Trend Strength
  if (adx > 25) {
    signals.push({
      type: data.trendDirection === 'up' ? 'BUY' : 'SELL',
      signal: `TREND KUAT (ADX ${adx.toFixed(8)})`,
      description: 'Trend kuat diikuti momentum',
    })
  }

  if (signals.length === 0) {
    signals.push({
      type: 'NEUTRAL',
      signal: 'TIDAK ADA SINYAL KUAT',
      description: 'Pasar sideways atau konflik indikator',
    })
  }

  let score = 0
  signals.forEach((s) => {
    const signalType = s.signal.split(' ')[0]
    const weight = weightedSignals[signalType] || 1.0

    if (s.type === 'BUY') score += weight
    if (s.type === 'SELL') score -= weight
  })

  score = Math.round(score * 10) / 10
  console.log(`\n🔢 TOTAL SCORE: ${score.toFixed(8)}`)

  const calculateRisk = () => {
    const stopLoss = Math.min(data.pivot.s1, data.bb.lower, data.fib.level500)

    const riskRewardRatio = data.price - stopLoss > 3 * (data.pivot.r1 - data.price) ? 'TINGGI (1:3+)' : 'STANDAR (1:2)'

    return {
      stopLoss: stopLoss.toFixed(8),
      takeProfit: data.pivot.r1.toFixed(8),
      riskRewardRatio,
    }
  }

  const risk = calculateRisk()
  console.log('\n🛡️  MANAJEMEN RISIKO:')
  console.log(`- Stop Loss: ${risk.stopLoss}`)
  console.log(`- Take Profit: ${risk.takeProfit}`)
  console.log(`- Risk/Reward: ${risk.riskRewardRatio}`)

  console.log('\n💡 REKOMENDASI BERDASARKAN SCORING:')
  if (score > 3) console.log('✅ STRONG BUY SIGNAL')
  else if (score > 1) console.log('🟢 BUY')
  else if (score < -3) console.log('❌ STRONG SELL SIGNAL')
  else if (score < -1) console.log('🔴 SELL')
  else console.log('➡️ HOLD (Netral)')

  return signals
}

module.exports = {
  predictAndAnalyze,
}
