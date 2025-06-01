require('dotenv').config()
const inquirer = require('inquirer')
const { Spot } = require('@binance/connector')

const spotClient = new Spot(process.env.API_KEY, process.env.API_SECRET, {
  recvWindow: 60000,
  timestamp: Date.now,
})

const { SMA, EMA, RSI, MACD } = require('technicalindicators')

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
    const res = await spotClient.avgPrice(symbol)
    const currentPrice = parseFloat(res.data.price)
    const decimals = currentPrice < 1 ? 8 : 2
    console.log(`\n🏷️  Harga saat ini untuk ${symbol}: ${currentPrice.toFixed(decimals)} USDT`)

    const klinesRes = await spotClient.klines(symbol, '1h', { limit: 100 })
    const klines = klinesRes.data
    if (!Array.isArray(klines) || klines.length < 50) {
      console.log('\n⚠️  Data historis tidak cukup untuk analisis teknikal (butuh minimal 50 bar).')
      return
    }

    const closes = klines.map((k) => parseFloat(k[4]))
    const highs = klines.map((k) => parseFloat(k[2]))
    const lows = klines.map((k) => parseFloat(k[3]))
    const volumes = klines.map((k) => parseFloat(k[5]))

    const sma20Arr = SMA.calculate({ period: 20, values: closes })
    const sma50Arr = SMA.calculate({ period: 50, values: closes })
    const sma20 = sma20Arr[sma20Arr.length - 1]
    const sma50 = sma50Arr[sma50Arr.length - 1]

    const ema12Arr = EMA.calculate({ period: 12, values: closes })
    const ema26Arr = EMA.calculate({ period: 26, values: closes })
    const ema12 = ema12Arr[ema12Arr.length - 1]
    const ema26 = ema26Arr[ema26Arr.length - 1]

    const rsiArr = RSI.calculate({ period: 14, values: closes })
    const rsi = rsiArr[rsiArr.length - 1]

    const macdInput = {
      values: closes,
      fastPeriod: 12,
      slowPeriod: 26,
      signalPeriod: 9,
      SimpleMAOscillator: false,
      SimpleMASignal: false,
    }
    const macdArr = MACD.calculate(macdInput)
    const lastMacd = macdArr[macdArr.length - 1] || {}
    const macdValue = lastMacd.MACD || 0
    const macdSignal = lastMacd.signal || 0
    const macdHistogram = lastMacd.histogram || 0

    const volumeAvg20 = volumes.slice(-20).reduce((sum, v) => sum + v, 0) / 20
    const currentVolume = volumes[volumes.length - 1]
    const volumeRatio = currentVolume / volumeAvg20

    const supportLevel = Math.min(...lows.slice(-20))
    const resistanceLevel = Math.max(...highs.slice(-20))

    const hourlyDiffs = []
    for (let i = 1; i < closes.length; i++) {
      hourlyDiffs.push(Math.abs(closes[i] - closes[i - 1]))
    }
    const avgHourlyChange = hourlyDiffs.reduce((sum, v) => sum + v, 0) / hourlyDiffs.length

    const tpConservative = resistanceLevel
    const tpAggressive = currentPrice * 1.05

    const gapCons = tpConservative - currentPrice
    const gapAggr = tpAggressive - currentPrice

    const hoursToCons = gapCons > 0 ? gapCons / avgHourlyChange : 0
    const hoursToAggr = gapAggr > 0 ? gapAggr / avgHourlyChange : 0

    console.log('\n🎯 TAKE-PROFIT & ESTIMASI WAKTU:')
    console.log(`- TP konservatif (resistance): ${tpConservative.toFixed(decimals)} USDT`)
    console.log(`  Estimasi waktu: ${hoursToCons.toFixed(1)} jam (avg change ${avgHourlyChange.toFixed(decimals)} USDT/jam)`)
    console.log(`- TP agresif (+5%): ${tpAggressive.toFixed(decimals)} USDT`)
    console.log(`  Estimasi waktu: ${hoursToAggr.toFixed(1)} jam (avg change ${avgHourlyChange.toFixed(decimals)} USDT/jam)`)

    console.log('\n📊 ANALISIS TEKNIKAL LANJUTAN:')
    console.log('-----------------------------------')

    console.log('\n🔍 TREND ANALYSIS:')
    console.log(`- SMA 20: ${sma20.toFixed(decimals)}`)
    console.log(`- SMA 50: ${sma50.toFixed(decimals)}`)
    console.log(`- EMA 12: ${ema12.toFixed(decimals)}`)
    console.log(`- EMA 26: ${ema26.toFixed(decimals)}`)

    let trendStatus
    if (sma20 > sma50 && ema12 > ema26) trendStatus = '📈 BULLISH STRONG'
    else if (sma20 > sma50) trendStatus = '📈 BULLISH'
    else if (sma20 < sma50 && ema12 < ema26) trendStatus = '📉 BEARISH STRONG'
    else if (sma20 < sma50) trendStatus = '📉 BEARISH'
    else trendStatus = '↔️ SIDEWAYS'
    console.log(`- TREND: ${trendStatus}`)

    console.log('\n⚡ MOMENTUM ANALYSIS:')
    const rsiLabel = rsi > 70 ? '(OVERBOUGHT)' : rsi < 30 ? '(OVERSOLD)' : ''
    console.log(`- RSI (14): ${rsi.toFixed(2)} ${rsiLabel}`)
    console.log(`- MACD: ${macdValue.toFixed(decimals)}`)
    console.log(`- Signal: ${macdSignal.toFixed(decimals)}`)
    console.log(`- Histogram: ${macdHistogram.toFixed(decimals)} ${macdHistogram > 0 ? '↑' : '↓'}`)

    console.log('\n📦 VOLUME ANALYSIS:')
    console.log(`- Volume Terakhir: ${currentVolume.toFixed(2)}`)
    console.log(`- Rata₂ Volume (20 bar): ${volumeAvg20.toFixed(2)}`)

    let volEmoji = ''
    if (volumeRatio > 1.5) volEmoji = '↑↑↑'
    else if (volumeRatio > 1.2) volEmoji = '↑↑'
    else if (volumeRatio < 0.8) volEmoji = '↓↓↓'
    else if (volumeRatio < 0.9) volEmoji = '↓↓'
    console.log(`- Rasio Volume: ${volumeRatio.toFixed(2)}x ${volEmoji}`)

    console.log('\n⛰️ SUPPORT & RESISTANCE:')
    console.log(`- Support Terdekat: ${supportLevel.toFixed(decimals)}`)
    console.log(`- Resistance Terdekat: ${resistanceLevel.toFixed(decimals)}`)
    console.log(`- Jarak ke Resistance: ${(((resistanceLevel - currentPrice) / currentPrice) * 100).toFixed(2)}%`)
    console.log(`- Jarak ke Support: ${(((currentPrice - supportLevel) / currentPrice) * 100).toFixed(2)}%`)

    console.log('\n🚦 SIGNAL SUMMARY:')
    const signals = []

    const isBullTrend = sma20 > sma50 && ema12 > ema26
    const isBearTrend = sma20 < sma50 && ema12 < ema26

    const isBullMomentum = macdHistogram > 0
    const isBearMomentum = macdHistogram < 0

    if (isBullTrend && isBullMomentum) {
      signals.push('🟢 STRATEGI BUY: Trend BULLISH + Momentum BULLISH')
    } else if (isBearTrend && isBearMomentum) {
      signals.push('🔴 STRATEGI SELL: Trend BEARISH + Momentum BEARISH')
    } else if (isBearTrend && isBullMomentum) {
      signals.push('⚠️ Bearish Strong tapi ada Momentum Bullish singkat—tunggu konfirmasi')
    } else if (isBullTrend && isBearMomentum) {
      signals.push('⚠️ Bullish tapi ada Momentum Bearish singkat—tunggu konfirmasi')
    } else {
      signals.push('➡️ Pasar Sideways atau Indikator Campur Aduk—tahan posisi')
    }

    signals.forEach((s, i) => console.log(`${i + 1}. ${s}`))
  } catch (err) {
    console.error('\n❌ Gagal menganalisis:', err.response?.data || err.message, '\n')
  }
}

module.exports = {
  predictAndAnalyze,
}
