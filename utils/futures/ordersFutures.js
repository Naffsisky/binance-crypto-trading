const Binance = require('binance-api-node').default
const axios = require('axios')

const futuresClient = Binance({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  httpBase: 'https://fapi.binance.com',
})

async function setLeverage(symbol, leverage) {
  try {
    leverage = parseInt(leverage)
    await futuresClient.futuresLeverage({ symbol, leverage })
    return true
  } catch (err) {
    throw new Error(`Gagal set leverage: ${err.message}`)
  }
}

async function buyFutures(symbol, quantity) {
  try {
    // Dapatkan info simbol
    const exchangeInfo = await fetchExchangeInfo()
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol)

    if (!symbolInfo) {
      throw new Error(`Symbol info not found for ${symbol}`)
    }

    // Dapatkan filter lot size
    const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === 'LOT_SIZE')
    const stepSize = parseFloat(lotSizeFilter.stepSize)

    // Hitung presisi dan sesuaikan quantity
    const precision = Math.max(0, Math.log10(1 / stepSize))
    const adjustedQty = parseFloat(quantity.toFixed(precision))

    // Gunakan fungsi yang benar: futuresOrder dengan type MARKET
    const order = await futuresClient.futuresOrder({
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: adjustedQty,
    })

    return order
  } catch (err) {
    throw new Error(`Gagal BUY: ${err.response?.data?.msg || err.message}`)
  }
}

async function sellFutures(symbol, quantity) {
  try {
    const exchangeInfo = await fetchExchangeInfo()
    const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol)

    if (!symbolInfo) {
      throw new Error(`Symbol info not found for ${symbol}`)
    }

    const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === 'LOT_SIZE')
    const stepSize = parseFloat(lotSizeFilter.stepSize)
    const precision = Math.max(0, Math.log10(1 / stepSize))
    const adjustedQty = parseFloat(quantity.toFixed(precision))

    const order = await futuresClient.futuresOrder({
      symbol,
      side: 'SELL',
      type: 'MARKET',
      quantity: adjustedQty,
    })

    return order
  } catch (err) {
    throw new Error(`Gagal SELL: ${err.response?.data?.msg || err.message}`)
  }
}

async function fetchExchangeInfo() {
  try {
    const response = await axios.get('https://fapi.binance.com/fapi/v1/exchangeInfo')
    return response.data
  } catch (err) {
    throw new Error(`fetchExchangeInfo failed: ${err.message}`)
  }
}

async function getStepSize(symbol) {
  const exchangeInfo = await futuresClient.futuresExchangeInfo()
  const symbolInfo = exchangeInfo.symbols.find((s) => s.symbol === symbol)
  const lotSizeFilter = symbolInfo.filters.find((f) => f.filterType === 'LOT_SIZE')
  return parseFloat(lotSizeFilter.stepSize)
}

function roundQuantity(quantity, stepSize) {
  const precision = Math.max(0, Math.floor(-Math.log10(stepSize)))
  return parseFloat(quantity.toFixed(precision))
}

async function closePosition(symbol, quantity) {
  try {
    // Cek posisi saat ini
    const position = await futuresClient.futuresPositionRisk({ symbol: symbol.replace('USDT', '') })
    const currentPosition = position.find((p) => p.symbol === symbol.replace('USDT', ''))

    if (!currentPosition || parseFloat(currentPosition.positionAmt) === 0) {
      console.log('No position to close')
      return null
    }

    // Tentukan arah penutupan
    const positionAmt = parseFloat(currentPosition.positionAmt)
    if (positionAmt > 0) {
      // Close long position
      return await futuresClient.futuresMarketSell({
        symbol: symbol.replace('USDT', ''),
        quantity: Math.abs(positionAmt),
      })
    } else {
      // Close short position
      return await futuresClient.futuresMarketBuy({
        symbol: symbol.replace('USDT', ''),
        quantity: Math.abs(positionAmt),
      })
    }
  } catch (err) {
    throw new Error(`Failed to close position: ${err.response?.data?.msg || err.message}`)
  }
}

module.exports = {
  setLeverage,
  buyFutures,
  sellFutures,
  closePosition,
  fetchExchangeInfo,
}
