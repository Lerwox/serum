import { AbiEntry, Calldata, MultiType } from 'starknet'

export interface CallResultData {
  [key: string]: string | string[] | number | CallResultData
}

export interface MulticallState {
  callListeners: {
    // Store the number of listeners per call
    [callKey: string]: number
  }
  callResults: {
    [callKey: string]: {
      data?: CallResultData | null
      blockTimestamp?: number
      fetchingBlockTimestamp?: number
    }
  }
}

export interface WithMulticallState {
  [path: string]: MulticallState
}

export interface StructsAbi {
  [name: string]: AbiEntry[]
}

export interface Call {
  address: string
  selector: string
  outputsAbi: AbiEntry[]
  structsAbi: StructsAbi
  calldata: Calldata
}

export interface CallResult {
  data?: CallResultData
  valid: boolean
  blockTimestamp?: number
}

export interface CallState {
  result?: CallResultData
  valid: boolean
  syncing: boolean
  loading: boolean
  error: boolean
}

// Actions

export interface MulticallListenerPayload {
  calls: Call[]
}

export interface MulticallFetchingPayload {
  fetchingBlockTimestamp: number
  calls: Call[]
}

export interface MulticallResultsPayload {
  blockTimestamp: number
  resultsData: { [key: string]: CallResultData }
}

export type NullableMultiType = MultiType | undefined | null

export type OptionalRawArgs = {
  [inputName: string]: NullableMultiType | NullableMultiType[] | {
      type: 'struct'
      [k: string]: NullableMultiType
  };
} | NullableMultiType[]
