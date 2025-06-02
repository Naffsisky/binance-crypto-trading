const { getFuturesPrice } = require('../balancePrice')

function calculatePositionSize(accountBalance, riskPercent, entryPrice, stopLoss, leverage) {
  // Hitung modal efektif setelah leverage
  const effectiveCapital = accountBalance * leverage

  // Hitung jumlah risiko dalam USDT
  const riskAmount = effectiveCapital * (riskPercent / 100)

  // Hitung risiko per kontrak
  const riskPerContract = Math.abs(entryPrice - stopLoss)

  // Kembalikan jumlah kontrak (pastikan tidak 0)
  const size = riskAmount / riskPerContract
  return size > 0 ? size : 0
}

function calculateLeverage(entryPrice, stopLoss, maxLeverage = 20) {
  const priceDiff = Math.abs(entryPrice - stopLoss)
  const riskPercent = (priceDiff / entryPrice) * 100
  const calculatedLeverage = Math.min(maxLeverage, Math.floor(5 / riskPercent))
  return Math.max(1, Math.min(calculatedLeverage, maxLeverage))
}

async function adjustStopLoss(symbol, position, priceData) {
  const currentPrice = await getFuturesPrice(symbol)
  const atr = priceData.atr

  if (position.side === 'LONG') {
    const newSl = currentPrice - atr * 0.8
    return Math.max(newSl, position.originalSl)
  } else {
    const newSl = currentPrice + atr * 0.8
    return Math.min(newSl, position.originalSl)
  }
}

module.exports = {
  calculatePositionSize,
  calculateLeverage,
  adjustStopLoss,
}
