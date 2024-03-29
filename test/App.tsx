import React from 'react'

import { Provider } from 'react-redux'
import { useLatestBlock, useEthBalance } from './hooks'
import { store } from './store'
import { Updater } from './Updater'

export function App() {
  const blockTimestamp = useLatestBlock()

  return (
    <Provider store={store}>
      <Updater blockTimestamp={blockTimestamp} />
      <Home blockTimestamp={blockTimestamp} />
    </Provider>
  )
}

interface HomeProps {
  blockTimestamp: number | undefined
}

function Home({ blockTimestamp }: HomeProps) {
  const balance = useEthBalance(blockTimestamp, '0x557b047d712012c9d34a0f1cf38455cd28b5a35786331c95f61cd3a82a52294')

  return (
    <div>
      <h1>Hello Multicall</h1>
      <h2>Block timestamp:</h2>
      {blockTimestamp && <p data-testid="blockTimestamp">{blockTimestamp}</p>}
      <h2>ETH Balance:</h2>
      {balance && <p data-testid="ETHbalance">{balance}</p>}
    </div>
  )
}
