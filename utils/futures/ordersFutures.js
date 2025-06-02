const Binance = require('binance-api-node').default

const futuresClient = Binance({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  httpBase: 'https://fapi.binance.com',
})

// Perbaikan fungsi setLeverage
async function setLeverage(symbol, leverage) {
  try {
    await futuresClient.futuresLeverage({
      symbol: symbol.replace('USDT', ''),
      leverage: parseInt(leverage),
    })
    return true
  } catch (err) {
    throw new Error(`Gagal set leverage: ${err.message}`)
  }
}

// Fungsi order futures
async function buyFutures(symbol, quantity) {
  try {
    return await futuresClient.futuresMarketBuy({
      symbol: symbol.replace('USDT', ''),
      quantity: parseFloat(quantity.toFixed(4)),
    })
  } catch (err) {
    throw new Error(`Gagal BUY: ${err.response?.data?.msg || err.message}`)
  }
}

async function sellFutures(symbol, quantity) {
  try {
    return await futuresClient.futuresMarketSell({
      symbol: symbol.replace('USDT', ''),
      quantity: parseFloat(quantity.toFixed(4)),
    })
  } catch (err) {
    throw new Error(`Gagal SELL: ${err.response?.data?.msg || err.message}`)
  }
}

module.exports = {
  setLeverage,
  buyFutures,
  sellFutures,
}
