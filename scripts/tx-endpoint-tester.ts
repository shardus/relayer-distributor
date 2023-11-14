import * as crypto from '@shardus/crypto-utils'
import fetch from 'node-fetch'

// Initialize the crypto module with a specific seed
crypto.init('69fa4195670576c0160d660c3be36556ff8d504725be8a59b5a96509e0c994bc')

// Define a developer account object with public and secret keys
const devAccount = {
  publicKey: 'YOUR_PUBLIC_KEY_HERE',
  secretKey: 'YOUR_SECRET_KEY_HERE',
}

// Data object to be sent in the transaction
const data: any = {
  start: 0, // start cycle
  end: 10, // end cycle
  txId: '',
  accountId: '',
  sender: devAccount.publicKey,
}

// Signing the data object with the developer's secret and public keys
crypto.signObj(data, devAccount.secretKey, devAccount.publicKey)
console.log(data) // Log the signed data object

// Sending a POST request to the specified URL with the transaction data
fetch('http://127.0.0.1:6000/transaction', {
  method: 'post',
  body: JSON.stringify(data),
  headers: { 'Content-Type': 'application/json' },
  timeout: 2000,
})
  .then(async (res) => {
    if (res.ok) console.log(await res.json())
    else console.log(res.status)
  })
  .catch((err) => {
    console.log(err)
  })
