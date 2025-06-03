const { setLeverage, buyFutures, sellFutures } = require('./ordersFutures')
const { fetchKlines } = require('./futuresApi')
const { calculatePositionSize } = require('./riskManager')
const { calcEMA, calcRSI, calcATR } = require('./scalpIndicators')

async function predictDirection(symbol, timeframe) {
  try {
    const { isSymbolValid } = require('./futuresApi')
    if (!(await isSymbolValid(symbol))) {
      console.log(`[ERROR] ${symbol} tidak valid atau tidak aktif trading`)
      return null
    }
    const klines = await fetchKlines(symbol, `${timeframe}m`, 100)
    if (klines.length < 50) {
      console.log(`[WARN] ${symbol}: Data tidak cukup (${klines.length} candle)`)
      return null
    }

    const closes = klines.map((k) => k.close)
    const highs = klines.map((k) => k.high)
    const lows = klines.map((k) => k.low)

    const emaFast = calcEMA(closes, 9)
    const emaSlow = calcEMA(closes, 21)
    const rsi = calcRSI(closes, 14)
    const atr = calcATR({ high: highs, low: lows, close: closes }, 14)

    const lastIndex = closes.length - 1
    const last = {
      price: closes[lastIndex],
      emaFast: emaFast[lastIndex],
      emaSlow: emaSlow[lastIndex],
      rsi: rsi[lastIndex],
      atr: atr[lastIndex],
    }

    let confidence = 0
    let direction = null

    if (last.emaFast > last.emaSlow) {
      direction = 'BULLISH'
      confidence += 0.4
    } else {
      direction = 'BEARISH'
      confidence += 0.4
    }

    if (direction === 'BULLISH' && last.rsi < 70) confidence += 0.3
    if (direction === 'BEARISH' && last.rsi > 30) confidence += 0.3
    if (Math.abs(last.emaFast - last.emaSlow) > last.price * 0.005) confidence += 0.3

    return {
      direction,
      confidence: Math.min(1.0, confidence),
      price: last.price,
      atr: last.atr,
    }
  } catch (err) {
    console.error('Prediction error:', err.message || err)
    return null
  }
}

async function openLongPosition(state, entryPrice, atr) {
  try {
    const isMultiplierCoin = state.symbol.startsWith('1000')
    let leverage = 10 // Default leverage rendah untuk coin kecil

    // Hitung leverage hanya untuk coin non-multiplier
    if (!isMultiplierCoin) {
      const leverageRatio = atr / entryPrice
      if (leverageRatio > 0) {
        leverage = Math.min(20, Math.max(5, Math.floor(0.05 / leverageRatio)))
      }
    }

    console.log(`[LEVERAGE] Setting leverage to ${leverage} for ${state.symbol}`)
    await setLeverage(state.symbol, leverage)

    const stopLoss = entryPrice - atr * 1.5

    // Gunakan fungsi calculatePositionSize yang diperbarui
    const positionSize = await calculatePositionSize(state.symbol, state.tradingCapital, state.riskPercent, entryPrice, stopLoss, leverage)

    // Periksa jika positionSize valid
    if (positionSize <= 0) {
      throw new Error(`Invalid position size: ${positionSize}`)
    }

    console.log(`[ORDER] Buying ${positionSize} ${state.symbol}`)
    await buyFutures(state.symbol, positionSize)

    state.position = {
      type: 'LONG',
      entryPrice,
      quantity: positionSize,
      leverage,
      stopLoss,
      highestProfit: 0,
      openTime: Date.now(),
    }

    console.log(`LONG position opened: ${positionSize} @ ${entryPrice}`)
  } catch (err) {
    console.error(`[ERROR] Failed to open LONG position: ${err.message}`)
    throw err
  }
}

async function openShortPosition(state, entryPrice, atr) {
  const leverage = Math.min(20, Math.max(5, Math.floor(0.05 / (atr / entryPrice))))
  await setLeverage(state.symbol, leverage)

  const stopLoss = entryPrice + atr * 1.5
  const positionSize = calculatePositionSize(state.tradingCapital, state.riskPercent, entryPrice, stopLoss, leverage)

  await sellFutures(state.symbol, positionSize)

  state.position = {
    type: 'SHORT',
    entryPrice,
    quantity: positionSize,
    leverage,
    stopLoss,
    highestProfit: 0,
    openTime: Date.now(),
  }

  console.log(`SHORT position opened: ${positionSize.toFixed(4)} @ ${entryPrice}`)
}

async function monitorPosition(state) {
  const { position } = state
  const trailingThreshold = 0.3 // Tutup jika profit turun 30% dari tertinggi
  const maxDuration = 3 * 60 * 60 * 1000 // 3 jam

  while (position) {
    try {
      await new Promise((resolve) => setTimeout(resolve, 10000)) // Cek setiap 10 detik

      const currentPrice = await fetchCurrentPrice(state.symbol)
      let profit = 0

      // Hitung profit saat ini
      if (position.type === 'LONG') {
        profit = (currentPrice - position.entryPrice) * position.quantity
      } else {
        profit = (position.entryPrice - currentPrice) * position.quantity
      }

      // Update highest profit
      if (profit > position.highestProfit) {
        position.highestProfit = profit
      }

      // Hitung profit setelah fee (fee taker 0.04%)
      const fee = position.quantity * position.entryPrice * state.feeRate
      const netProfit = profit - fee

      // Kondisi exit:
      // 1. Stop loss
      if (netProfit < 0 && Math.abs(netProfit) >= Math.abs(position.entryPrice - position.stopLoss) * position.quantity) {
        console.log(`Stop loss hit! Closing position...`)
        await closePosition(state)
        break
      }

      // 2. Profit turun dari tertinggi
      if (position.highestProfit > 0 && profit < position.highestProfit * (1 - trailingThreshold)) {
        console.log(`Profit dropped ${trailingThreshold * 100}% from peak. Closing position...`)
        await closePosition(state)
        break
      }

      // 3. Waktu habis (3 jam)
      if (Date.now() - position.openTime > maxDuration) {
        console.log(`Max duration reached. Closing position...`)
        await closePosition(state)
        break
      }

      // 4. Profit kecil (take profit cepat)
      if (netProfit > 0 && netProfit <= position.entryPrice * position.quantity * 0.005) {
        // 0.5%
        // Biarkan profit berlari, tidak ditutup
      }

      // Log status setiap menit
      if (Date.now() % 60000 < 10000) {
        console.log(`Position status: ${profit > 0 ? '+' : ''}${profit.toFixed(4)} | Peak: ${position.highestProfit.toFixed(4)}`)
      }
    } catch (err) {
      console.error('Monitoring error:', err)
      await new Promise((resolve) => setTimeout(resolve, 30000)) // Tunggu 30 detik jika error
    }
  }

  console.log('Position closed. Returning to main menu.')
}

async function closePosition(state) {
  const { position } = state
  if (!position) return

  const currentPrice = await fetchCurrentPrice(state.symbol)
  let profit = 0

  if (position.type === 'LONG') {
    profit = (currentPrice - position.entryPrice) * position.quantity
    await sellFutures(state.symbol, position.quantity)
  } else {
    profit = (position.entryPrice - currentPrice) * position.quantity
    await buyFutures(state.symbol, position.quantity)
  }

  // Hitung fee (0.04% taker fee)
  const entryFee = position.quantity * position.entryPrice * state.feeRate
  const exitFee = position.quantity * currentPrice * state.feeRate
  const totalFee = entryFee + exitFee
  const netProfit = profit - totalFee

  // Update modal
  state.currentCapital = state.initialCapital + netProfit
  state.tradingCapital = state.currentCapital * 0.5 // Gunakan setengah modal baru
  state.profit += netProfit
  state.tradeCount++

  console.log(`Position closed at ${currentPrice}`)
  console.log(`Profit: $${profit.toFixed(4)} | Fee: $${totalFee.toFixed(4)} | Net: $${netProfit.toFixed(4)}`)
  console.log(`New capital: $${state.currentCapital.toFixed(4)} | Trading capital: $${state.tradingCapital.toFixed(4)}`)

  state.position = null
}

module.exports = { predictDirection, openLongPosition, openShortPosition, monitorPosition }
