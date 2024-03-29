import { createSlice, PayloadAction } from '@reduxjs/toolkit'

import { MulticallFetchingPayload, MulticallListenerPayload, MulticallResultsPayload, MulticallState } from './types'
import { toCallKey } from './utils/callKey'

const initialState: MulticallState = {
  callListeners: {},
  callResults: {},
}

export function createMulticallSlice(reducerPath: string) {
  return createSlice({
    name: reducerPath,
    initialState,
    reducers: {
      addMulticallListeners: (state, action: PayloadAction<MulticallListenerPayload>) => {
        const { calls } = action.payload
        const listeners = state.callListeners

        calls.forEach((call) => {
          const callKey = toCallKey(call)
          listeners[callKey] = (listeners[callKey] ?? 0) + 1
        })
      },

      removeMulticallListeners: (state, action: PayloadAction<MulticallListenerPayload>) => {
        const { calls } = action.payload
        const listeners = state.callListeners

        calls.forEach((call) => {
          const callKey = toCallKey(call)
          if (!listeners[callKey]) return

          if (--listeners[callKey] <= 0) delete listeners[callKey]
        })
      },

      fetchMulticallResults: (state, action: PayloadAction<MulticallFetchingPayload>) => {
        const { fetchingBlockTimestamp, calls } = action.payload
        const results = state.callResults

        calls.forEach((call) => {
          const callKey = toCallKey(call)
          results[callKey] = results[callKey] ?? { fetchingBlockTimestamp }
          if ((results[callKey]?.fetchingBlockTimestamp ?? 0) >= fetchingBlockTimestamp) return
          results[callKey].fetchingBlockTimestamp = fetchingBlockTimestamp
        })
      },

      errorFetchingMulticallResults: (state, action: PayloadAction<MulticallFetchingPayload>) => {
        const { fetchingBlockTimestamp, calls } = action.payload
        const results = state.callResults

        calls.forEach((call) => {
          const callKey = toCallKey(call)
          if (typeof results[callKey]?.fetchingBlockTimestamp !== 'number') return
          if ((results[callKey]?.fetchingBlockTimestamp ?? 0) > fetchingBlockTimestamp) return

          results[callKey] = {
            data: null,
            blockTimestamp: fetchingBlockTimestamp,
          }
        })
      },

      updateMulticallResults: (state, action: PayloadAction<MulticallResultsPayload>) => {
        const { blockTimestamp, resultsData } = action.payload
        const results = state.callResults

        Object.keys(resultsData).forEach((callKey: string) => {
          results[callKey] = results[callKey] ?? {}
          if ((results[callKey].blockTimestamp ?? 0) >= blockTimestamp) return

          results[callKey] = {
            data: resultsData[callKey] ?? null,
            blockTimestamp,
          }
        })
      },
    },
  })
}

export type MulticallActions = ReturnType<typeof createMulticallSlice>['actions']
