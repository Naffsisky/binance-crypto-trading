const WebSocket = require('ws')

function startSpotPriceStream(symbols = []) {
  const lowerSymbols = symbols.map((s) => s.toLowerCase() + 'usdt')
  const streams = lowerSymbols.map((s) => `${s}@trade`).join('/')
  const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`)

  ws.on('open', () => {
    console.log(`Terhubung ke WebSocket Spot untuk: ${symbols.join(', ')}`)
  })

  ws.on('message', (data) => {
    const parsed = JSON.parse(data)
    const price = parsed.data.p
    const symbol = parsed.data.s
    const time = new Date(parsed.data.T).toLocaleTimeString()
    console.log(`[${time}] ${symbol} => ${price}`)
  })

  ws.on('error', (err) => {
    console.error('WebSocket Error:', err.message)
  })

  ws.on('close', () => {
    console.log('Koneksi WebSocket Spot ditutup.')
  })

  return ws
}

module.exports = { startSpotPriceStream }
