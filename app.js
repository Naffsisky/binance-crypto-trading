const inquirer = require('inquirer')
const { startSpotPriceStream } = require('./websocket/livePrice')
const { getSpotUSDTBalance, getFuturesUSDTBalance, getSpotPrice, getFuturesPrice, getSpotAssets, fetchExchangeInfo } = require('./utils/balancePrice')
const { buySpot, sellSpot } = require('./utils/ordersSpot')
const { predictAndAnalyze } = require('./utils/predictAnalyze')
const { scanCheapCoins } = require('./scanner/cheapCoin')
const { scanMediumCoins } = require('./scanner/mediumCoin')
const { scanHighCoins } = require('./scanner/highCoin')
const { scanScalpingSignal } = require('./utils/futures/scalpingEngine')
const { calculatePositionSize, calculateLeverage } = require('./utils/futures/riskManager')
const { buyFutures, sellFutures, setLeverage } = require('./utils/futures/ordersFutures')

const coinList = require('./coinList.json')

async function menu() {
  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: 'Pilih Menu:',
      choices: [
        '1. Cek Saldo Spot',
        '2. Cek Saldo Futures',
        '3. Cek Harga Coin',
        '4. Cek Harga Coin Live (WebSocket)',
        '5. Cek Inisial Coin',
        '6. Buy Spot',
        '7. Sell Spot',
        '8. Portfolio Spot',
        '9. Prediksi & Strategi Teknikal',
        '10. Scan Bullish Coins',
        '11. Scalping Futures',
        '0. Keluar',
      ],
    },
  ])

  switch (choice) {
    case '1. Cek Saldo Spot':
      await checkSpotBalance()
      break
    case '2. Cek Saldo Futures':
      await checkFuturesBalance()
      break
    case '3. Cek Harga Coin':
      await checkCoinPrice()
      break
    case '4. Cek Harga Coin Live (WebSocket)':
      await livePriceViaWebSocket()
      break
    case '5. Cek Inisial Coin':
      console.log('\nDaftar Coin yang tersedia:\n' + `> ${coinList.join('\n> ')}` + '\n')
      break
    case '6. Buy Spot':
      await handleBuySpot()
      break
    case '7. Sell Spot':
      await handleSellSpot()
      break
    case '8. Portfolio Spot':
      await displaySpotPortfolio()
      break
    case '9. Prediksi & Strategi Teknikal':
      await predictAndAnalyze()
      break
    case '10. Scan Bullish Coins':
      await scanner()
      break
    case '11. Scalping Futures':
      await handleScalpingFutures()
      break
    case '0. Keluar':
      console.log('Sampai jumpa!\n')
      process.exit(0)
  }

  await menu()
}

async function checkSpotBalance() {
  const balance = await getSpotUSDTBalance()
  console.log(`\nSaldo Spot USDT: ${balance}\n`)
}

async function checkFuturesBalance() {
  const balance = await getFuturesUSDTBalance()
  console.log(`\nSaldo Futures USDT: ${balance}\n`)
}

async function checkCoinPrice() {
  const { symbols } = await inquirer.prompt([
    {
      type: 'input',
      name: 'symbols',
      message: 'Masukkan coin (pisahkan dengan koma), contoh: BTC,ETH,SOL:',
    },
  ])

  const coins = symbols
    .toUpperCase()
    .split(',')
    .map((s) => s.trim())

  for (const coin of coins) {
    const symbol = coin + 'USDT'
    const spotPrice = await getSpotPrice(symbol)
    const futuresPrice = await getFuturesPrice(symbol)

    console.log(`\n${symbol}`)
    console.log(`  Spot Price   : ${spotPrice}`)
    console.log(`  Futures Price: ${futuresPrice}`)
  }
}

async function livePriceViaWebSocket() {
  const { symbols } = await inquirer.prompt([
    {
      type: 'input',
      name: 'symbols',
      message: 'Masukkan coin (misal: BTC,ETH,SOL):',
    },
  ])

  const coins = symbols
    .toUpperCase()
    .split(',')
    .map((s) => s.trim())
  startSpotPriceStream(coins)

  console.log('\nTekan CTRL+C untuk keluar.\n')
}

async function handleBuySpot() {
  const { symbol, quantity } = await inquirer.prompt([
    { type: 'input', name: 'symbol', message: 'Masukkan simbol (contoh: BTCUSDT):' },
    { type: 'input', name: 'quantity', message: 'Jumlah yang ingin dibeli:' },
  ])
  await buySpot(symbol.toUpperCase(), parseFloat(quantity))
}

async function handleSellSpot() {
  const { symbol, quantity } = await inquirer.prompt([
    { type: 'input', name: 'symbol', message: 'Masukkan simbol (contoh: BTCUSDT):' },
    { type: 'input', name: 'quantity', message: 'Jumlah yang ingin dijual:' },
  ])
  await sellSpot(symbol.toUpperCase(), parseFloat(quantity))
}

async function displaySpotPortfolio() {
  console.log('Mengambil data portfolio...')
  try {
    const portfolio = await getSpotAssets()

    if (portfolio.length === 0) {
      console.log('Tidak ada aset di spot wallet')
      return
    }

    const COLOR_RESET = '\x1b[0m'
    const COLOR_GREEN = '\x1b[32m'
    const COLOR_RED = '\x1b[31m'

    let totalValue = 0
    let totalProfit = 0

    console.log('\n=== Portfolio Spot ===')
    console.log('Aset'.padEnd(10) + ' | ' + 'Jumlah'.padStart(12) + ' | ' + 'Harga Beli'.padStart(14) + ' | ' + 'Harga Saat Ini'.padStart(14) + ' | ' + 'Profit (USDT)'.padStart(12) + ' | ' + 'Profit (%)')
    console.log('-'.repeat(80))

    portfolio.forEach((item) => {
      const assetValue = item.balance * item.currentPrice
      totalValue += assetValue
      totalProfit += item.profitUSDT

      const color = item.profitUSDT >= 0 ? COLOR_GREEN : COLOR_RED

      console.log(
        `${item.asset.padEnd(10)} | ` +
          `${item.balance.toFixed(2).padStart(12)} | ` +
          `$${item.avgPrice.toFixed(8).padStart(13)} | ` +
          `$${item.currentPrice.toFixed(8).padStart(13)} | ` +
          `${color}${item.profitUSDT.toFixed(2).padStart(12)}${COLOR_RESET} | ` +
          `${color}${item.profitPercent.toFixed(2).padStart(7)}%${COLOR_RESET}`
      )
    })

    const totalColor = totalProfit >= 0 ? COLOR_GREEN : COLOR_RED
    console.log('\nTotal Nilai Portfolio: $' + totalValue.toFixed(2))
    console.log(`Total Profit: ${totalColor}$${totalProfit.toFixed(2)}${COLOR_RESET}`)
  } catch (err) {
    console.error('Error menampilkan portfolio:', err)
  }
}

async function scanner() {
  const { choice } = await inquirer.prompt([
    {
      type: 'list',
      name: 'choice',
      message: 'Pilih Scanner:',
      choices: ['1. Scan Bullish Coins (<$1)', '2. Scan Medium Coins ($1-$100)', '3. Scan Expensive Coins ($100+)', '0. Kembali ke Menu Utama'],
    },
  ])

  switch (choice) {
    case '1. Scan Bullish Coins (<$1)':
      await scanCheapCoins()
      break
    case '2. Scan Medium Coins ($1-$100)':
      await scanMediumCoins()
      break
    case '3. Scan Expensive Coins ($100+)':
      await scanHighCoins()
      break
    case '0. Kembali ke Menu Utama':
      return
  }

  await scanner()
  return
}

async function handleScalpingFutures() {
  try {
    const answers = await inquirer.prompt([
      {
        type: 'input',
        name: 'nominal',
        message: 'Modal USDT total:',
        validate: (v) => !isNaN(v) && v > 0,
      },
      {
        type: 'input',
        name: 'riskPercent',
        message: 'Risiko per trade (% dari modal efektif):',
        default: '1',
        validate: (v) => v > 0 && v <= 5,
      },
      {
        type: 'input',
        name: 'maxPositions',
        message: 'Maksimal jumlah posisi:',
        default: '5',
      },
    ])

    const riskPercent = parseFloat(answers.riskPercent)
    const nominalTotal = parseFloat(answers.nominal)
    const maxPositions = parseInt(answers.maxPositions)

    // Dapatkan semua simbol futures
    const info = await fetchExchangeInfo()
    const allSymbols = info.symbols.filter((s) => s.quoteAsset === 'USDT' && s.contractType === 'PERPETUAL').map((s) => s.symbol)

    console.log(`Memulai analisis ${allSymbols.length} simbol futures...`)

    // Scan semua simbol dan dapatkan sinyal terbaik
    const topSignals = await scanTopSignals(allSymbols, maxPositions)

    if (topSignals.length === 0) {
      console.log('Tidak ditemukan sinyal trading yang memenuhi kriteria')
      return
    }

    // Eksekusi order
    const orders = []
    for (const signal of topSignals) {
      try {
        // Hitung ukuran posisi dengan leverage
        const positionSize = calculatePositionSize(nominalTotal / topSignals.length, riskPercent, signal.price, signal.stopLoss, signal.leverage)

        // Set leverage
        await setLeverage(signal.symbol, signal.leverage)

        // Eksekusi order sesuai arah sinyal
        let orderResult
        if (signal.direction === 'BULLISH') {
          orderResult = await buyFutures(signal.symbol, positionSize)
        } else {
          orderResult = await sellFutures(signal.symbol, positionSize)
        }

        orders.push({
          symbol: signal.symbol,
          side: signal.direction === 'BULLISH' ? 'BUY' : 'SELL',
          qty: positionSize,
          price: signal.price,
          stopLoss: signal.stopLoss,
          takeProfit: signal.takeProfit,
          leverage: signal.leverage,
          score: signal.score,
        })

        console.log(`Mencoba set leverage untuk ${signal.symbol}...`)
        try {
          await setLeverage(signal.symbol.replace('USDT', ''), signal.leverage)
          console.log(`Set leverage x${signal.leverage} berhasil`)
        } catch (err) {
          console.error(`Gagal set leverage: ${err.message}`)
          continue
        }

        console.log(`Order: ${signal.symbol} ${signal.direction} ${positionSize.toFixed(4)} @ ${signal.price}`)
      } catch (err) {
        console.error(`Gagal order ${signal.symbol}:`, err.message)
      }
    }

    // Tampilkan ringkasan
    console.log('\n=== Eksekusi Trading ===')

    if (orders.length === 0) {
      console.log('Tidak ada order yang berhasil dieksekusi')
    } else {
      const tableData = orders.map((o) => ({
        Symbol: o.symbol,
        Arah: o.side,
        Jumlah: o.qty.toFixed(4),
        Harga: o.price.toFixed(6),
        'Stop Loss': o.stopLoss.toFixed(6),
        'Take Profit': o.takeProfit.toFixed(6),
        Leverage: `x${o.leverage}`,
        Skor: o.score.toFixed(2),
      }))

      // Tampilkan tabel
      console.table(tableData)
    }
  } catch (err) {
    console.error('Error:', err)
  }
}

// Fungsi baru untuk scan sinyal terbaik
async function scanTopSignals(symbols, maxSignals = 5) {
  const allSignals = []

  // Batasi paralelisasi untuk hindari rate limit
  const BATCH_SIZE = 5
  for (let i = 0; i < symbols.length; i += BATCH_SIZE) {
    const batch = symbols.slice(i, i + BATCH_SIZE)
    const batchPromises = batch.map((symbol) =>
      scanScalpingSignal(symbol).catch((err) => {
        console.error(`Error scanning ${symbol}:`, err.message)
        return null
      })
    )

    const batchResults = await Promise.all(batchPromises)
    const validSignals = batchResults.filter((s) => s !== null && s.score >= 4.0)
    allSignals.push(...validSignals)

    console.log(`Proses: ${Math.min(i + BATCH_SIZE, symbols.length)}/${symbols.length} | Sinyal ditemukan: ${validSignals.length}`)
  }

  // Urutkan dan ambil yang terbaik
  allSignals.sort((a, b) => b.score - a.score)
  return allSignals.slice(0, maxSignals)
}

menu()
