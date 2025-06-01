require('dotenv').config()
const { Spot } = require('@binance/connector')

const spotClient = new Spot(process.env.API_KEY, process.env.API_SECRET, {
  recvWindow: 60000,
  timestamp: Date.now,
})

async function buySpot(symbol, quantity) {
  try {
    const params = {
      symbol: symbol.toUpperCase(),
      side: 'BUY',
      type: 'MARKET',
      quantity: quantity,
    }
    console.log('Order Params:', params)

    const order = await spotClient.newOrder(params.symbol, params.side, params.type, { quantity: params.quantity })

    console.log('Buy Order Success:', order.data)
  } catch (err) {
    console.error('Buy Order Error:', err.response?.data || err.message)
  }
}

async function sellSpot(symbol, quantity) {
  try {
    const order = await spotClient.newOrder(symbol.toUpperCase(), 'SELL', 'MARKET', { quantity: quantity })
    console.log('Sell Order Success:', order.data)
  } catch (err) {
    console.error('Sell Order Error:', err.response?.data || err.message)
  }
}

module.exports = {
  buySpot,
  sellSpot,
}
