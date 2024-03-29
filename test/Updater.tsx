import React from 'react'
import { useContract } from './hooks'
import { multicall } from './multicall'

interface Props {
  blockTimestamp: number | undefined
}

export function Updater({ blockTimestamp }: Props) {
  const contract = useContract()
  if (!contract) return null
  return <multicall.Updater latestBlockTimestamp={blockTimestamp ?? 0} contract={contract} />
}
