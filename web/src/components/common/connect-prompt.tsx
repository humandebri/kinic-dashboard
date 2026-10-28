import { FingerprintIcon } from 'lucide-react'

import EmptyState from '@/components/common/empty-state'
import { Button } from '@/components/ui/button'
import { useIdentityState } from '@/components/providers/identity-provider'

type ConnectPromptProps = {
  description?: string
}

const ConnectPrompt = ({ description = 'Sign in with Internet Identity to continue.' }: ConnectPromptProps) => {
  const identity = useIdentityState()
  return (
    <EmptyState
      icon={<FingerprintIcon />}
      title='Connect your identity'
      description={description}
      action={
        <Button variant='brand' onClick={() => void identity.login()} disabled={!identity.isReady}>
          Connect Internet Identity
        </Button>
      }
    />
  )
}

export default ConnectPrompt
