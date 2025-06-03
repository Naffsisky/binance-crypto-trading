const Binance = require('binance-api-node').default
const axios = require('axios')

const futuresClient = Binance({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  httpBase: 'https://fapi.binance.com',
})

// Fungsi untuk mendapatkan harga saat ini
async function fetchCurrentPrice(symbol) {
  try {
    const price = await futuresClient.futuresMarkPrice({ symbol })
    return parseFloat(price.markPrice)
  } catch (err) {
    console.error('Futures Price Error:', err.body || err.message)
    return 0
  }
}

// Fungsi untuk mendapatkan data kline
async function fetchKlines(symbol, interval, limit = 500) {
  try {
    const response = await axios.get('https://fapi.binance.com/fapi/v1/klines', {
      params: { symbol, interval, limit },
    })

    return response.data.map((k) => ({
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5]),
      openTime: k[0],
      closeTime: k[6],
    }))
  } catch (err) {
    console.error(`[KLINES] Error ${symbol} ${interval}:`, err.response?.data?.msg || err.message)
    return []
  }
}

// Fungsi untuk mendapatkan info exchange
async function fetchExchangeInfo() {
  try {
    const response = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo')
    return response.data
  } catch (fallbackErr) {
    const errorMsg = fallbackErr.response?.data?.msg || fallbackErr.message
    throw new Error(`fetchExchangeInfo failed: ${errorMsg}`)
  }
}

async function isSymbolValid(symbol) {
  try {
    const info = await fetchExchangeInfo()
    return info.symbols.some((s) => s.symbol === symbol && s.status === 'TRADING')
  } catch (err) {
    console.error('Symbol validation error:', err)
    return false
  }
}

module.exports = {
  fetchCurrentPrice,
  fetchKlines,
  fetchExchangeInfo,
  isSymbolValid,
}
