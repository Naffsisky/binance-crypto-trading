require('dotenv').config()
const inquirer = require('inquirer')
const { Spot } = require('@binance/connector')

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

    // Dapatkan data klines (candle)
    const klinesRes = await spotClient.klines(symbol, '1h', { limit: 100 })
    const klines = klinesRes.data

    if (!Array.isArray(klines) || klines.length < 50) {
      console.log('\n⚠️  Data historis tidak cukup untuk analisis teknikal')
      return
    }

    // Ekstrak data untuk analisis
    const closes = klines.map((k) => parseFloat(k[4]))
    const highs = klines.map((k) => parseFloat(k[2]))
    const lows = klines.map((k) => parseFloat(k[3]))
    const volumes = klines.map((k) => parseFloat(k[5]))

    // 1. Moving Averages
    const sma20 = calculateSMA(closes, 20)
    const sma50 = calculateSMA(closes, 50)
    const ema12 = calculateEMA(closes, 12)
    const ema26 = calculateEMA(closes, 26)

    // 2. RSI (Relative Strength Index)
    const rsi = calculateRSI(closes, 14)

    // 3. MACD (Moving Average Convergence Divergence)
    const macd = calculateMACD(closes)

    // 4. Volume Analysis
    const volumeAvg20 = calculateSMA(volumes, 20)
    const currentVolume = volumes[volumes.length - 1]
    const volumeRatio = currentVolume / volumeAvg20

    // 5. Support & Resistance
    const supportLevel = Math.min(...lows.slice(-20))
    const resistanceLevel = Math.max(...highs.slice(-20))

    // Tampilkan hasil analisis
    console.log('\n📊 ANALISIS TEKNIKAL LANJUTAN:')
    console.log('-----------------------------------')

    // Trend Analysis
    console.log('\n🔍 TREND ANALYSIS:')
    console.log(`- SMA 20: ${sma20.toFixed(decimals)}`)
    console.log(`- SMA 50: ${sma50.toFixed(decimals)}`)
    console.log(`- EMA 12: ${ema12.toFixed(decimals)}`)
    console.log(`- EMA 26: ${ema26.toFixed(decimals)}`)

    const trendStatus = sma20 > sma50 && ema12 > ema26 ? '📈 BULLISH STRONG' : sma20 > sma50 ? '📈 BULLISH' : sma20 < sma50 && ema12 < ema26 ? '📉 BEARISH STRONG' : sma20 < sma50 ? '📉 BEARISH' : '↔️ SIDEWAYS'

    console.log(`- TREND: ${trendStatus}`)

    // Momentum Analysis
    console.log('\n⚡ MOMENTUM ANALYSIS:')
    console.log(`- RSI (14): ${rsi.toFixed(2)} ${rsi > 70 ? '(OVERBOUGHT)' : rsi < 30 ? '(OVERSOLD)' : ''}`)
    console.log(`- MACD: ${macd.MACD.toFixed(decimals)}`)
    console.log(`- Signal: ${macd.signal.toFixed(decimals)}`)
    console.log(`- Histogram: ${macd.histogram.toFixed(decimals)} ${macd.histogram > 0 ? '↑' : '↓'}`)

    // Volume Analysis
    console.log('\n📦 VOLUME ANALYSIS:')
    console.log(`- Volume Terakhir: ${currentVolume.toFixed(2)}`)
    console.log(`- Rata2 Volume (20): ${volumeAvg20.toFixed(2)}`)
    console.log(`- Rasio Volume: ${volumeRatio.toFixed(2)}x ${volumeRatio > 1.5 ? '↑↑↑' : volumeRatio > 1.2 ? '↑↑' : volumeRatio < 0.8 ? '↓↓↓' : volumeRatio < 0.9 ? '↓↓' : ''}`)

    // Support & Resistance
    console.log('\n⛰️ SUPPORT & RESISTANCE:')
    console.log(`- Support Terdekat: ${supportLevel.toFixed(decimals)}`)
    console.log(`- Resistance Terdekat: ${resistanceLevel.toFixed(decimals)}`)
    console.log(`- Jarak ke Resistance: ${(((resistanceLevel - currentPrice) / currentPrice) * 100).toFixed(2)}%`)
    console.log(`- Jarak ke Support: ${(((currentPrice - supportLevel) / currentPrice) * 100).toFixed(2)}%`)

    // Ringkasan Sinyal
    console.log('\n🚦 SIGNAL SUMMARY:')
    const signals = []

    if (sma20 > sma50 && ema12 > ema26) signals.push('TREND BULLISH KUAT')
    if (rsi < 35) signals.push('OVERSOLD (Potensi Reversal Up)')
    if (rsi > 65) signals.push('OVERBOUGHT (Potensi Reversal Down)')
    if (macd.histogram > 0 && macd.MACD > macd.signal) signals.push('MOMENTUM BULLISH')
    if (volumeRatio > 1.5) signals.push('VOLUME SIGNIFIKAN (Konfirmasi Gerakan)')
    if (currentPrice > resistanceLevel * 0.99) signals.push('BREAKOUT RESISTANCE')
    if (currentPrice < supportLevel * 1.01) signals.push('BREAKDOWN SUPPORT')

    if (signals.length > 0) {
      signals.forEach((s, i) => console.log(`${i + 1}. ${s}`))
    } else {
      console.log('Tidak ada sinyal kuat, pasar sideways')
    }
  } catch (err) {
    console.error('\n❌ Gagal menganalisis:', err.response?.data || err.message)
  }
}

// Helper Functions -----------------------------------------------------

function calculateSMA(data, period) {
  const slice = data.slice(-period)
  return slice.reduce((sum, val) => sum + val, 0) / period
}

function calculateEMA(data, period) {
  let ema = data.slice(0, period).reduce((a, b) => a + b) / period
  const multiplier = 2 / (period + 1)

  for (let i = period; i < data.length; i++) {
    ema = (data[i] - ema) * multiplier + ema
  }

  return ema
}

function calculateRSI(data, period) {
  let gains = 0
  let losses = 0

  for (let i = 1; i <= period; i++) {
    const diff = data[i] - data[i - 1]
    if (diff >= 0) gains += diff
    else losses -= diff
  }

  const avgGain = gains / period
  const avgLoss = losses / period
  const rs = avgGain / avgLoss

  return 100 - 100 / (1 + rs)
}

function calculateMACD(data) {
  const ema12 = calculateEMA(data, 12)
  const ema26 = calculateEMA(data, 26)
  const MACD = ema12 - ema26
  const signal = calculateEMA(data.slice(-9), 9) // Signal line (9-period EMA of MACD)
  const histogram = MACD - signal

  return { MACD, signal, histogram }
}

module.exports = {
  predictAndAnalyze,
}
