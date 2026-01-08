// Where: Shared client hook for hydration-safe rendering.
// What: Exposes a mounted flag that flips true after first client effect.
// Why: Avoids SSR/CSR markup drift for components that generate dynamic IDs.
'use client'

import { useEffect, useState } from 'react'

export const useMounted = (): boolean => {
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    setMounted(true)
  }, [])

  return mounted
}
