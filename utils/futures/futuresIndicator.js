const { getFuturesPrice } = require('../balancePrice')
const { SMA, EMA, RSI, Stochastic, BollingerBands, MACD, ATR } = require('technicalindicators')

function calculatePositionSize(accountBalance, riskPercent, entryPrice, stopLoss) {
  const riskAmount = accountBalance * (riskPercent / 100)
  const riskPerContract = Math.abs(entryPrice - stopLoss)
  return riskAmount / riskPerContract
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

// Fungsi yang sudah ada
const calcSMA = (values, period) => SMA.calculate({ period, values })

const calcEMA = (values, period) => EMA.calculate({ period, values })

const calcRSI = (values, period) => RSI.calculate({ period, values })

const calcStochastic = ({ high, low, close, period, signalPeriod, smoothing }) => Stochastic.calculate({ high, low, close, period, signalPeriod, smoothing })

const calcBB = ({ values, period, stdDev }) => BollingerBands.calculate({ period, stdDev, values })

const calcMACD = ({ values, fastPeriod, slowPeriod, signalPeriod, SimpleMAOscillator = false, SimpleMASignal = false }) => MACD.calculate({ values, fastPeriod, slowPeriod, signalPeriod, SimpleMAOscillator, SimpleMASignal })

// Tambahkan fungsi yang hilang
const calcATR = ({ high, low, close, period }) => ATR.calculate({ high, low, close, period })

const calcVWAP = (highs, lows, closes, volumes) => {
  const typicalPrices = highs.map((h, i) => (h + lows[i] + closes[i]) / 3)
  const cumulativePV = []
  const cumulativeVolume = []

  for (let i = 0; i < typicalPrices.length; i++) {
    cumulativePV[i] = typicalPrices[i] * volumes[i] + (cumulativePV[i - 1] || 0)
    cumulativeVolume[i] = volumes[i] + (cumulativeVolume[i - 1] || 0)
  }

  return cumulativePV.map((pv, i) => pv / cumulativeVolume[i])
}

module.exports = {
  calculatePositionSize,
  calculateLeverage,
  adjustStopLoss,
  calcSMA,
  calcEMA,
  calcRSI,
  calcStochastic,
  calcBB,
  calcMACD,
  calcATR,
  calcVWAP,
}
