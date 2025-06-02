const axios = require('axios')

const { Spot } = require('@binance/connector')
const { SMA, EMA, RSI, MACD, ATR, Stochastic, WilliamsR, BollingerBands, ADX } = require('technicalindicators')
const spotClient = new Spot(process.env.API_KEY, process.env.API_SECRET, {
  recvWindow: 60000,
  timestamp: Date.now,
})

async function getLowPriceCoins() {
  try {
    // 1.a. Dapatkan semua simbol dari Binance
    const response = await axios.get('https://api.binance.com/api/v3/exchangeInfo')
    const symbols = response.data.symbols

    // 1.b. Filter hanya yang quoteAsset = 'USDT' dan status = 'TRADING'
    const lowPriceCoins = symbols.filter((s) => s.quoteAsset === 'USDT' && s.status === 'TRADING' && !s.symbol.includes('UP') && !s.symbol.includes('DOWN'))

    // 1.c. Ambil harga terkini untuk semua ticker sekaligus
    const tickers = await axios.get('https://api.binance.com/api/v3/ticker/price')
    const tickerMap = {}
    tickers.data.forEach((t) => {
      tickerMap[t.symbol] = parseFloat(t.price)
    })

    // 1.d. Gabungkan dan filter harga < 1
    const result = lowPriceCoins
      .map((coin) => ({
        symbol: coin.symbol,
        price: tickerMap[coin.symbol] || 0,
      }))
      .filter((c) => c.price > 0 && c.price < 1)
      .sort((a, b) => b.price - a.price) // urutkan termahal ke termurah

    console.log(`\nDitemukan ${result.length} coin dengan harga di bawah $1:`)
    result.forEach((c) => console.log(`- ${c.symbol}: $${c.price.toFixed(8)}`))

    return result
  } catch (err) {
    console.error('❌ Gagal mendapatkan data coin murah:', err.message)
    return []
  }
}

async function scanCheapCoins() {
  // 3.a. Ambil daftar coin murah
  const coins = await getLowPriceCoins()
  if (coins.length === 0) {
    console.log('\n❌ Tidak ada coin murah yang ditemukan untuk dianalisis.')
    return
  }

  // 3.b. Siapkan array untuk menampung symbol berdasarkan rekomendasi
  const strongBuyList = []
  const buyList = []

  // 3.c. Loop tiap coin, panggil predictAndAnalyzeSymbol, dan tangkap return value
  for (const coin of coins) {
    console.log('\n===============================')
    console.log(`📈 Analisis untuk ${coin.symbol}`)
    console.log('===============================')

    const recommendation = await predictAndAnalyzeSymbol(coin.symbol)

    // **CETAK hasil rekomendasi agar kelihatan debug-nya**
    console.log(`➡️ Rekomendasi untuk ${coin.symbol}: ${recommendation}`)

    // 3.d. Push ke array jika sesuai
    if (recommendation === 'STRONG BUY') {
      strongBuyList.push(coin.symbol)
    } else if (recommendation === 'BUY') {
      buyList.push(coin.symbol)
    }
  }

  // 3.e. Tampilkan ringkasan akhir
  console.log('\n🔍 Ringkasan Coin dengan Sinyal BUY / STRONG BUY:\n')

  if (strongBuyList.length > 0) {
    console.log('✅ STRONG BUY:')
    strongBuyList.forEach((s) => console.log(`- ${s}`))
  }

  if (buyList.length > 0) {
    console.log('\n🟡 BUY:')
    buyList.forEach((s) => console.log(`- ${s}`))
  }

  if (strongBuyList.length === 0 && buyList.length === 0) {
    console.log('Tidak ada coin dengan sinyal BUY atau STRONG BUY.')
  }
}

async function predictAndAnalyzeSymbol(symbolInput) {
  const symbol = symbolInput.trim().toUpperCase()

  try {
    // 2.a. Dapatkan harga rata-rata sekarang
    const res = await spotClient.avgPrice(symbol)
    const currentPrice = parseFloat(res.data.price)
    const decimals = currentPrice < 1 ? 8 : 2

    console.log(`\n🏷️  Harga saat ini untuk ${symbol}: ${currentPrice.toFixed(decimals)} USDT`)

    // 2.b. Dapatkan data klines 1h terakhir (limit 200)
    const klinesRes = await spotClient.klines(symbol, '1h', { limit: 200 })
    const klines = klinesRes.data
    const MIN_CANDLES = 150 // Untuk indikator periode panjang (SMA100, Ichimoku)
    if (klines.length < MIN_CANDLES) {
      const missing = MIN_CANDLES - klines.length
      console.log(`\n⚠️  Data kurang ${missing} candle. Menggunakan data maksimal yang tersedia`)
    }

    // 2.c. Ekstrak array closes, highs, lows, volumes
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

    // 2.d. Hitung indikator teknikal
    const sma20 = SMA.calculate({ period: 20, values: closes }).pop()
    const sma50 = SMA.calculate({ period: 50, values: closes }).pop()
    const sma100 = SMA.calculate({ period: 100, values: closes }).pop()
    const ema12 = EMA.calculate({ period: 12, values: closes }).pop()
    const ema26 = EMA.calculate({ period: 26, values: closes }).pop()
    const ema50 = EMA.calculate({ period: 50, values: closes }).pop()

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

    const atr = ATR.calculate({
      high: highs,
      low: lows,
      close: closes,
      period: 14,
    }).pop()

    const volumeAvg20 = SMA.calculate({ period: 20, values: volumes }).pop()
    const currentVolume = volumes[volumes.length - 1]
    const volumeRatio = currentVolume / volumeAvg20

    // 2.e. Hitung Pivot Points & Ichimoku
    const pivot = calculatePivotPoints(highs, lows, closes)
    const ichimoku = calculateIchimoku(highs, lows, closes)
    const fib = calculateFibonacciRetracement(highs, lows)
    const bb = getLastValue(
      BollingerBands.calculate,
      {
        period: 20,
        values: closes,
        stdDev: 2,
      },
      { upper: 0, middle: 0, lower: 0 }
    )
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
    // 2.f. Tampilkan hasil analisis teknikal (boleh di-skip kalau hanya mau ringkas)
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

    // 2.h. Hitung rekomendasi akhir berdasarkan jumlah sinyal BUY vs SELL
    console.log('\n💡 REKOMENDASI:')
    let rekomendasi = 'HOLD'
    const buySignals = signals.filter((s) => s.type === 'BUY').length
    const sellSignals = signals.filter((s) => s.type === 'SELL').length

    if (buySignals > sellSignals + 2) {
      console.log('✅ STRONG BUY SIGNAL')
      rekomendasi = 'STRONG BUY'
    } else if (buySignals > sellSignals) {
      console.log('🟢 BUY')
      rekomendasi = 'BUY'
    } else if (sellSignals > buySignals + 2) {
      console.log('❌ STRONG SELL')
      rekomendasi = 'STRONG SELL'
    } else if (sellSignals > buySignals) {
      console.log('🔴 SELL')
      rekomendasi = 'SELL'
    } else {
      console.log('➡️ HOLD (Tidak ada sinyal kuat)')
      rekomendasi = 'HOLD'
    }

    // **PENTING**: kembalikan string rekomendasi TANPA emoji, agar gampang di-compare
    return rekomendasi
  } catch (err) {
    console.error(`\n❌ Gagal menganalisis ${symbol}:`, err.response?.data || err.message)
    return 'HOLD'
  }
}

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

  console.log('\n💡 REKOMENDASI BERDASARKAN SCORING:')
  if (score > 3) console.log('✅ STRONG BUY SIGNAL')
  else if (score > 1) console.log('🟢 BUY')
  else if (score < -3) console.log('❌ STRONG SELL SIGNAL')
  else if (score < -1) console.log('🔴 SELL')
  else console.log('➡️ HOLD (Netral)')

  return signals
}

module.exports = {
  scanCheapCoins,
}
