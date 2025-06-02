require('dotenv').config()
const { Spot } = require('@binance/connector')
const Binance = require('binance-api-node').default
const BASE_URL = 'https://fapi.binance.com'
const axios = require('axios')

const spotClient = new Spot(process.env.API_KEY, process.env.API_SECRET)
const futuresClient = Binance({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  httpBase: BASE_URL,
})

// === SPOT ===
async function getSpotUSDTBalance() {
  try {
    const response = await spotClient.account()
    const balances = response.data.balances
    const usdt = balances.find((b) => b.asset === 'USDT')
    return usdt ? parseFloat(usdt.free) : 0
  } catch (err) {
    console.error('Spot Balance Error:', err.response?.data || err.message)
    return 0
  }
}

async function getSpotPrice(symbol) {
  try {
    const response = await spotClient.tickerPrice(symbol)
    return parseFloat(response.data.price)
  } catch (err) {
    console.error('Spot Price Error:', err.response?.data || err.message)
    return 0
  }
}

async function getSpotAssets() {
  try {
    const response = await spotClient.account()
    const balances = response.data.balances.filter((asset) => parseFloat(asset.free) > 0 || parseFloat(asset.locked) > 0)

    const exchangeInfo = await spotClient.exchangeInfo()
    const validSymbols = exchangeInfo.data.symbols.map((s) => s.symbol)

    const portfolio = []

    for (const asset of balances) {
      const assetName = asset.asset
      const balance = parseFloat(asset.free) + parseFloat(asset.locked)
      if (balance <= 0) continue

      if (assetName === 'USDT') {
        portfolio.push({
          asset: assetName,
          balance,
          avgPrice: 1,
          currentPrice: 1,
          profitUSDT: 0,
          profitPercent: 0,
        })
        continue
      }

      const symbol = `${assetName}USDT`
      if (!validSymbols.includes(symbol)) {
        continue
      }

      let currentPrice = 0
      try {
        const ticker = await spotClient.tickerPrice(symbol)
        currentPrice = parseFloat(ticker.data.price)
      } catch (err) {
        console.error(`Gagal dapatkan harga ${symbol}:`, err.message)
      }

      let totalQty = 0
      let totalCost = 0
      try {
        const trades = await spotClient.myTrades(symbol)
        trades.data
          .filter((t) => t.isBuyer)
          .forEach((trade) => {
            const qty = parseFloat(trade.qty)
            const cost = qty * parseFloat(trade.price)
            totalQty += qty
            totalCost += cost
          })
      } catch (err) {
        console.error(`Gagal dapatkan riwayat ${symbol}:`, err.message)
      }

      const avgPrice = totalQty > 0 ? totalCost / totalQty : currentPrice

      const assetValue = balance * currentPrice
      if (assetValue < 0.4) continue

      const profitUSDT = (currentPrice - avgPrice) * balance
      const profitPercent = avgPrice > 0 ? ((currentPrice - avgPrice) / avgPrice) * 100 : 0

      portfolio.push({
        asset: assetName,
        balance,
        avgPrice,
        currentPrice,
        profitUSDT,
        profitPercent,
      })
    }

    return portfolio
  } catch (err) {
    console.error('Error portfolio:', err.response?.data || err.message)
    return []
  }
}

// === FUTURES ===
async function getFuturesUSDTBalance() {
  try {
    const balances = await futuresClient.futuresAccountBalance()
    const usdt = balances.find((b) => b.asset === 'USDT')
    return usdt ? parseFloat(usdt.balance) : 0
  } catch (err) {
    console.error('Futures Balance Error:', err.body || err.message)
    return 0
  }
}

async function getFuturesPrice(symbol) {
  try {
    const price = await futuresClient.futuresMarkPrice({ symbol })
    return parseFloat(price.markPrice)
  } catch (err) {
    console.error('Futures Price Error:', err.body || err.message)
    return 0
  }
}

async function fetchExchangeInfo() {
  try {
    const info = await futuresClient.exchangeInfo()
    return info
  } catch (err) {
    try {
      const response = await axios.get(`${BASE_URL}/fapi/v1/exchangeInfo`)
      return response.data
    } catch (fallbackErr) {
      const errorMsg = fallbackErr.response?.data?.msg || fallbackErr.message
      throw new Error(`fetchExchangeInfo failed: ${errorMsg}`)
    }
  }
}

module.exports = {
  getSpotUSDTBalance,
  getFuturesUSDTBalance,
  getSpotPrice,
  getFuturesPrice,
  getSpotAssets,
  fetchExchangeInfo,
}
