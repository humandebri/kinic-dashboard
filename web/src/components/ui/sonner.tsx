import { Toaster as Sonner } from 'sonner'

import { useThemeStore } from '@/stores/theme'

const Toaster = () => {
  const resolved = useThemeStore((state) => state.resolved)
  return (
    <Sonner
      theme={resolved}
      position='bottom-right'
      richColors
      closeButton
      toastOptions={{ classNames: { toast: 'font-sans rounded-xl' } }}
    />
  )
}

export { Toaster }
