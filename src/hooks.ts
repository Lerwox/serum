import { useMemo, useEffect } from 'react'
import { hash, Abi, FunctionAbi, CallData } from 'starknet'
import { useDispatch, useSelector } from 'react-redux'

import { getStructsAbiFromAbiEntries } from './utils/abi'
import { toCallKey, parseCallKey } from './utils/callKey'
import { CallResult, CallState, Call, WithMulticallState, OptionalRawArgs } from './types'
import { INVALID_CALL_STATE, LOADING_CALL_STATE } from './constants'
import { areCallInputsValid } from './validation'
import type { MulticallContext } from './context'

function toCallState(callResult: CallResult, latestBlockTimestamp?: number): CallState {
  if (!callResult) return INVALID_CALL_STATE
  const { valid, data, blockTimestamp } = callResult
  if (!valid) return INVALID_CALL_STATE
  if (valid && !blockTimestamp) return LOADING_CALL_STATE
  if (!latestBlockTimestamp) return LOADING_CALL_STATE

  const syncing = (blockTimestamp ?? 0) < latestBlockTimestamp
  if (data && Object.keys(data).length)
    return { valid: true, loading: false, syncing, result: data, error: false }

  return { valid: true, loading: false, syncing, error: true }
}

function useCallsDataSubscription(context: MulticallContext, calls: Array<Call | undefined>): CallResult[] {
  const { reducerPath, actions } = context

  const callResults = useSelector((state: WithMulticallState) => state[reducerPath].callResults)
  const dispatch = useDispatch()

  const serializedCallKeys = useMemo(
    () =>
      JSON.stringify(
        calls
          ?.filter((c): c is Call => !!c)
          ?.map(toCallKey)
          ?.sort() ?? []
      ),
    [calls]
  )

  useEffect(() => {
    const callKeys = JSON.parse(serializedCallKeys)
    const calls = callKeys.map(parseCallKey)
    if (!calls) return

    dispatch(actions.addMulticallListeners({ calls }))

    return () => {
      dispatch(actions.removeMulticallListeners({ calls }))
    }
  }, [serializedCallKeys, dispatch])

  return useMemo(
    () =>
      calls.map((call?: Call) => {
        if (!call) return { valid: false }

        const result = callResults[toCallKey(call)]
        let data
        if (result?.data && Object.keys(result.data).length) data = result.data

        return { valid: true, data, blockTimestamp: result?.blockTimestamp }
      }),
    [calls, callResults]
  )
}

// export function useSingleContractMultipleData() {
//
// }

export function useMultipleContractSingleData(
  context: MulticallContext,
  latestBlockTimestamp: number | undefined,
  addresses: Array<string | undefined>,
  abi: Abi,
  methodName: string,
  callInputs?: OptionalRawArgs
): CallState[] {
  const functionInterface = useMemo(() => abi.find((abi) => abi.name === methodName) as FunctionAbi, [abi, methodName])
  const outputsAbi = functionInterface?.outputs
  const structsAbi = useMemo(() => getStructsAbiFromAbiEntries(abi, outputsAbi), [abi, outputsAbi])

  const selector = useMemo(() => hash.getSelectorFromName(methodName), [methodName])

  const calldata = useMemo(
    () => (areCallInputsValid(callInputs) ? CallData.compile(callInputs) : undefined),
    [callInputs]
  )

  const calls = useMemo(
    () =>
      outputsAbi && selector && (addresses?.length ?? 0) > 0
        ? addresses.map<Call | undefined>((address) => {
            return address && calldata ? { address, selector, outputsAbi, structsAbi, calldata } : undefined
          })
        : [],
    [addresses, selector, calldata]
  )

  const callResults = useCallsDataSubscription(context, calls)

  return useMemo(
    () => callResults.map((result) => toCallState(result, latestBlockTimestamp)),
    [latestBlockTimestamp, callResults]
  )
}
