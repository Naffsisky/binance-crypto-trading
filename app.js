const inquirer = require('inquirer')
const { startSpotPriceStream } = require('./websocket/livePrice')
const { getSpotUSDTBalance, getFuturesUSDTBalance, getSpotPrice, getFuturesPrice, getSpotAssets } = require('./utils/balancePrice')
const { buySpot, sellSpot } = require('./utils/ordersSpot')
const { predictAndAnalyze } = require('./utils/predictAnalyze')

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
      message: 'Masukkan coin (pisahkan dengan koma), contoh: BTC,ETH,SOL',
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
      message: 'Masukkan coin (misal: BTC,ETH,SOL)',
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

menu()
