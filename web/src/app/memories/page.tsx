// Where: Memories page entry.
// What: Wraps the memories panel in the shared app shell.
// Why: Adds the first list_instance-based screen after dashboard.
'use client'

import AppShell from '@/components/layout/app-shell'
import MemoriesPanel from '@/components/memories/memories-panel'
import { useIdentityState } from '@/components/providers/identity-provider'

const MemoriesPage = () => {
  const identityState = useIdentityState()

  return (
    <AppShell pageTitle='Memories' identityState={identityState}>
      <MemoriesPanel identityState={identityState} />
    </AppShell>
  )
}

export default MemoriesPage
