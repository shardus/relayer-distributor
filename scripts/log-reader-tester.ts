import { overrideDefaultConfig, config } from '../src/Config'
import { join } from 'path'
import DataLogReader from '../src/log-reader'

// Override default config params from config file, env vars, and cli args
const file = join(process.cwd(), 'distributor-config.json')
const env = process.env
const args = process.argv

overrideDefaultConfig(file, env, args)
console.log(config)

const registerDataReaderListeners = (reader: DataLogReader): void => {
  reader.on(`${reader.dataName}-data`, (logData: any) => {
    try {
      const data: {
        cycle?: any
        receipt?: any
        originalTx?: any
      } = {}
      switch (reader.dataName) {
        case 'cycle':
          data.cycle = logData
          break
        case 'receipt':
          data.receipt = logData
          break
        case 'originalTx':
          data.originalTx = logData
          break
      }
    } catch (e) {
      console.log('Issue with Log-reader data: ')
      console.log('->> LOG DATA: ', logData)
      console.log(e)
    }
  })

  reader.on(`${reader.dataName}-end`, (totalEntriesItReads: any, totalEntriesDefinedOnFile: any) => {
    console.info(
      `✔️ Finished reading ${totalEntriesItReads} entries from ${reader.dataName}-${reader.logCounter} log file having ${totalEntriesDefinedOnFile} entries.`
    )
  })

  reader.on('error', (err: any) => {
    console.error(`Error reading log file: ${err}`)
  })
}

;(async (): Promise<void> => {
  try {
    const DATA_LOG_PATH = config.DATA_LOG_DIR
    const cycleReader = new DataLogReader(DATA_LOG_PATH, 'cycle')
    const receiptReader = new DataLogReader(DATA_LOG_PATH, 'receipt')
    const originalTxReader = new DataLogReader(DATA_LOG_PATH, 'originalTx')
    await Promise.all([receiptReader.init(), cycleReader.init(), originalTxReader.init()])
    registerDataReaderListeners(cycleReader)
    registerDataReaderListeners(receiptReader)
    registerDataReaderListeners(originalTxReader)
  } catch (e) {
    if (e.code === 'ENOENT') {
      console.error(
        '❌ Path to the data-logs directory does not exist. Please check the path in the config file.\n Current Path: ',
        config.DATA_LOG_DIR
      )
    } else {
      console.error('Error in Child Process: ', e.message, e.code)
    }
  }
})()
