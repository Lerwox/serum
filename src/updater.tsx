import React, { Dispatch, useEffect, useMemo, useRef } from 'react'
import { Contract, AbiEntry, num } from 'starknet'
import { useSelector, useDispatch } from 'react-redux'

import { parseCallKey, toCallKey } from './utils/callKey'
import useDebounce from './utils/useDebounce'
import { WithMulticallState, MulticallState, CallResultData, StructsAbi, Call } from './types'
import { MAX_CALLS_PER_CHUNK } from './constants'
import { MulticallContext } from './context'
import { MulticallActions } from './slice'

type ContractCallResult = any

function chunkCalls(calls: Call[]): Call[][] {
  const maxCallsPerChunk = Math.ceil(calls.length / Math.ceil(calls.length / MAX_CALLS_PER_CHUNK))
  const chunks = []
  let current = []

  for (const call of calls) {
    current.push(call)
    if (current.length === maxCallsPerChunk) {
      chunks.push(current)
      current = []
    }
  }
  if (current.length) chunks.push(current)

  return chunks
}

async function fetchChunk(multicallContract: Contract, chunk: Call[]): Promise<ContractCallResult> {
  try {
    const { result } = await multicallContract.aggregate(
      chunk.reduce<(string | number)[]>((acc, call: Call) => {
        acc.push(call.address, call.selector, call.calldata.length, ...call.calldata)
        return acc
      }, [])
    )

    return result
  } catch (error) {
    console.error('Failed to fetch chunk', error)
    throw error
  }
}

function parseResponseField(
  responseIterator: Iterator<bigint>,
  output: AbiEntry,
  structs: StructsAbi,
  parsedResult: CallResultData
): any {
  const { name, type } = output

  switch (true) {
    case /_len$/.test(name):
      return responseIterator.next().value.toNumber()

    case /\(felt/.test(type):
      return type.split(',').reduce<string[]>((acc) => {
        acc.push(responseIterator.next().value.toString())
        return acc
      }, [])

    case /\*/.test(type):
      const array = []
      const dereferencedType = type.replace('*', '')

      if (parsedResult[`${name}_len`]) {
        const arrayLenght = parsedResult[`${name}_len`] as number

        while (array.length < arrayLenght) {
          if (dereferencedType in structs) array.push(parseResponse(structs[type], structs, responseIterator))
          else array.push(responseIterator.next().value.toString())
        }
      } else if (parsedResult[`${name}_len`] === 0) {
        responseIterator.next()
      } else {
        throw 'Invalid ABI'
      }

      return array

    case type in structs:
      return parseResponse(structs[type], structs, responseIterator)

    default:
      return responseIterator.next().value.toString()
  }
}

function parseResponse(outputs: AbiEntry[], structs: StructsAbi, responseIterator: Iterator<bigint>): CallResultData {
  const resultObject = outputs.flat().reduce((acc, output) => {
    acc[output.name] = parseResponseField(responseIterator, output, structs, acc)
    if (acc[output.name] && acc[`${output.name}_len`]) delete acc[`${output.name}_len`]

    return acc
  }, {} as CallResultData)

  return resultObject
  // return Object.entries(resultObject).reduce((acc, [key, value]) => {
  //   acc.push(value);
  //   acc[key] = value;
  //   return acc;
  // }, [] as Result);
}

function activeListeningKeys(callListeners: MulticallState['callListeners']): string[] {
  return Object.keys(callListeners).filter((callKey: string) => {
    return callListeners[callKey] > 0
  })
}

function outdatedListeningKeys(
  callResults: MulticallState['callResults'],
  listeningKeys: string[],
  latestBlockTimestamp?: number
): string[] {
  if (latestBlockTimestamp === undefined) return []

  return listeningKeys.filter((callKey: string) => {
    const result = callResults[callKey]
    // no data => outdated
    if (!result?.data) return true

    if ((result.fetchingBlockTimestamp ?? 0) >= latestBlockTimestamp || (result.blockTimestamp ?? 0) >= latestBlockTimestamp)
      return false

    return true
  })
}

// fetch handlers

interface FetchChunkContext {
  actions: MulticallActions
  dispatch: Dispatch<any>
  latestBlockTimestamp: number
}

function onFetchChunkSuccess(fetchChunkContext: FetchChunkContext, chunk: Call[], result: ContractCallResult) {
  if (!Array.isArray(result) || !result.every(num.isBigInt)) {
    fetchChunkContext.dispatch(
      fetchChunkContext.actions.errorFetchingMulticallResults({
        calls: chunk,
        fetchingBlockTimestamp: fetchChunkContext.latestBlockTimestamp,
      })
    )
    return
  }

  const responseIterator = result[Symbol.iterator]()

  const results = chunk.reduce<{
    [callKey: string]: CallResultData
  }>((acc, call: Call) => {
    const callKey = toCallKey(call)
    const result = parseResponse(call.outputsAbi, call.structsAbi, responseIterator)

    acc[callKey] = result
    return acc
  }, {})

  if (Object.keys(results).length > 0) {
    fetchChunkContext.dispatch(
      fetchChunkContext.actions.updateMulticallResults({
        resultsData: results,
        blockTimestamp: fetchChunkContext.latestBlockTimestamp
      })
    )
  }
}

function onFetchChunkFailure(fetchChunkContext: FetchChunkContext, chunk: Call[], error: any) {
  console.error('Failed to fetch multicall chunk', chunk, error)

  fetchChunkContext.dispatch(
    fetchChunkContext.actions.errorFetchingMulticallResults({
      fetchingBlockTimestamp: fetchChunkContext.latestBlockTimestamp,
      calls: chunk
    })
  )
}

// UPDATER

export interface UpdaterProps {
  context: MulticallContext
  latestBlockTimestamp: number
  contract: Contract
}

function Updater({ latestBlockTimestamp, contract, context }: UpdaterProps): null {
  const { actions, reducerPath } = context

  const dispatch = useDispatch()
  const state = useSelector((state: WithMulticallState) => state[reducerPath])
  // wait for listeners to settle before triggering updates
  const debouncedListeners = useDebounce(state.callListeners, 100)
  const cancellations = useRef<{ blockTimestamp: number; cancellations: Array<() => void> }>()

  const listeningKeys: string[] = useMemo(() => activeListeningKeys(debouncedListeners), [debouncedListeners])

  const outdatedCallKeys: string[] = useMemo(
    () => outdatedListeningKeys(state.callResults, listeningKeys, latestBlockTimestamp),
    [state.callResults, listeningKeys, latestBlockTimestamp]
  )

  const serializedOutdatedCallKeys: string = useMemo(() => JSON.stringify(outdatedCallKeys.sort()), [outdatedCallKeys])

  useEffect(() => {
    if (!contract || !latestBlockTimestamp) return
    const outdatedCallKeys = JSON.parse(serializedOutdatedCallKeys)
    const calls = outdatedCallKeys.map(parseCallKey)

    const chunks = chunkCalls(calls)

    if (cancellations.current && cancellations.current.blockTimestamp !== latestBlockTimestamp) {
      cancellations.current.cancellations.forEach((cancel) => cancel())
    }

    dispatch(actions.fetchMulticallResults({ fetchingBlockTimestamp: latestBlockTimestamp, calls }))

    cancellations.current = {
      blockTimestamp: latestBlockTimestamp,
      cancellations: chunks.map((chunk: Call[]) => {
        let cancel: () => void = () => {}

        const promise = new Promise<ContractCallResult>(async (resolve, reject) => {
          cancel = reject

          try {
            const result = await fetchChunk(contract, chunk)
            resolve(result)
          } catch (error) {
            reject(error)
          }
        })

        const fetchChunkContext = {
          actions,
          dispatch,
          latestBlockTimestamp,
        }

        promise
          .then((result) => onFetchChunkSuccess(fetchChunkContext, chunk, result))
          .catch((error: any) => onFetchChunkFailure(fetchChunkContext, chunk, error))

        return cancel
      }),
    }
  }, [latestBlockTimestamp, dispatch, serializedOutdatedCallKeys])

  return null
}

export function createUpdater(context: MulticallContext) {
  const UpdaterContextBound = (props: Omit<UpdaterProps, 'context'>) => {
    return <Updater context={context} {...props} />
  }
  return UpdaterContextBound
}
