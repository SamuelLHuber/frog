import { useStore as zustand_useStore } from 'zustand'

import { store } from '../lib/store'
import { Data } from '../types/frog'

export function useStore<slice>(
  selector: (state: ExtractState<typeof store>) => slice,
): slice {
  return zustand_useStore(store, selector)
}

export function useData(): Data | undefined {
  return useStore((state) => state.dataMap[state.dataKey])
}

export function useFrame(): Data['frame'] | undefined {
  return useStore((state) => state.dataMap[state.dataKey]?.frame)
}

type ExtractState<store> = store extends {
  getState: () => infer state
}
  ? state
  : never