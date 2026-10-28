// Where: Shared memory option list.
// What: Merges launcher-owned memories, manually saved canisters, and the current selection.
// Why: The header switcher, Settings, and Search all offer the same set of memories.
import { useMemo } from 'react'

import { useMemoriesState } from '@/components/providers/memories-provider'
import { useCustomCanisters } from '@/stores/custom-canisters'
import { useSelectedMemory } from '@/stores/selected-memory'

export const useMemoryOptions = () => {
  const { memories } = useMemoriesState()
  const customCanisters = useCustomCanisters((state) => state.customCanisters)
  const selectedMemoryId = useSelectedMemory((state) => state.selectedMemoryId)

  return useMemo(() => {
    const merged = new Set<string>()
    if (selectedMemoryId) merged.add(selectedMemoryId)
    for (const memory of memories) {
      if (memory.principalText) merged.add(memory.principalText)
    }
    for (const item of customCanisters) merged.add(item)
    return Array.from(merged)
  }, [customCanisters, memories, selectedMemoryId])
}
