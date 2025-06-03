const Binance = require('binance-api-node').default

const futuresClient = Binance({
  apiKey: process.env.API_KEY,
  apiSecret: process.env.API_SECRET,
  httpBase: 'https://fapi.binance.com',
})

async function setLeverage(symbol, leverage) {
  try {
    await futuresClient.futuresLeverage({
      symbol,
      leverage: parseInt(leverage),
    })
    return true
  } catch (err) {
    throw new Error(`Gagal set leverage: ${err.message}`)
  }
}

async function buyFutures(symbol, quantity) {
  try {
    const stepSize = await getStepSize(symbol)
    const roundedQty = roundQuantity(quantity, stepSize)

    return await futuresClient.futuresOrder({
      symbol,
      side: 'BUY',
      type: 'MARKET',
      quantity: roundedQty,
    })
  } catch (err) {
    throw new Error(`Gagal BUY: ${err.response?.data?.msg || err.message}`)
  }
}

async function sellFutures(symbol, quantity) {
  try {
    const stepSize = await getStepSize(symbol)
    const roundedQty = roundQuantity(quantity, stepSize)

    return await futuresClient.futuresOrder({
      symbol,
      side: 'SELL',
      type: 'MARKET',
      quantity: roundedQty,
    })
  } catch (err) {
    throw new Error(`Gagal SELL: ${err.response?.data?.msg || err.message}`)
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
}
