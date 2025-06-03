// Exponential Moving Average (EMA)
function calcEMA(prices, period) {
  const k = 2 / (period + 1)
  const ema = []
  let sum = 0

  for (let i = 0; i < period; i++) {
    sum += prices[i]
    ema.push(null)
  }

  ema[period - 1] = sum / period

  for (let i = period; i < prices.length; i++) {
    ema[i] = prices[i] * k + ema[i - 1] * (1 - k)
  }

  return ema
}

// Relative Strength Index (RSI)
function calcRSI(prices, period) {
  const rsi = new Array(period).fill(null)
  let gains = 0
  let losses = 0

  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1]
    if (change >= 0) gains += change
    else losses += Math.abs(change)
  }

  let avgGain = gains / period
  let avgLoss = losses / period

  rsi[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)

  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1]
    let gain = 0
    let loss = 0

    if (change >= 0) gain = change
    else loss = Math.abs(change)

    avgGain = (avgGain * (period - 1) + gain) / period
    avgLoss = (avgLoss * (period - 1) + loss) / period

    rsi[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss)
  }

  return rsi
}

// Average True Range (ATR)
function calcATR(klines, period) {
  const tr = [0]
  for (let i = 1; i < klines.length; i++) {
    const prevClose = klines[i - 1].close
    const tr1 = klines[i].high - klines[i].low
    const tr2 = Math.abs(klines[i].high - prevClose)
    const tr3 = Math.abs(klines[i].low - prevClose)
    tr.push(Math.max(tr1, tr2, tr3))
  }

  const atr = new Array(period).fill(null)
  let sum = 0

  for (let i = 0; i < period; i++) {
    sum += tr[i]
  }

  atr[period - 1] = sum / period

  for (let i = period; i < tr.length; i++) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period
  }

  return atr
}

module.exports = {
  calcEMA,
  calcRSI,
  calcATR,
}
