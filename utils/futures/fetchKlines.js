const axios = require('axios')
const API_KEY = process.env.BINANCE_API_KEY
const API_SECRET = process.env.BINANCE_SECRET

const BASE_URL = 'https://fapi.binance.com'

async function fetchKlines(symbol, interval, limit = 200) {
  try {
    const res = await axios.get(`${BASE_URL}/fapi/v1/klines`, {
      params: {
        symbol,
        interval,
        limit,
      },
    })

    return res.data.map((c) => ({
      openTime: c[0],
      open: parseFloat(c[1]),
      high: parseFloat(c[2]),
      low: parseFloat(c[3]),
      close: parseFloat(c[4]),
      volume: parseFloat(c[5]),
      closeTime: c[6],
    }))
  } catch (err) {
    throw new Error(`fetchKlines error: ${err.response?.data?.msg || err.message}`)
  }
}

module.exports = { fetchKlines }
