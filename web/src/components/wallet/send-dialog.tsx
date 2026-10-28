// Where: Header balance menu → Send dialog.
// What: Sends KINIC from the II principal via ICRC-1 transfer.
// Why: Lets users move funds without leaving the dashboard.
import { Principal } from '@dfinity/principal'
import { useState, type FormEvent } from 'react'
import { toast } from 'sonner'

import { useBalance } from '@/components/providers/balance-provider'
import { useIdentityState } from '@/components/providers/identity-provider'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { errorMessage, formatKinic, parseKinic } from '@/lib/format'
import { createLedgerActor, transferIcrc1 } from '@/lib/ledger'

type SendDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SendDialog = ({ open, onOpenChange }: SendDialogProps) => {
  const identityState = useIdentityState()
  const balance = useBalance()
  const [toAddress, setToAddress] = useState('')
  const [amount, setAmount] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSending, setIsSending] = useState(false)

  const handleOpenChange = (next: boolean) => {
    if (isSending) return
    if (!next) setError(null)
    onOpenChange(next)
  }

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault()
    if (!identityState.identity) {
      setError('Connect identity to send.')
      return
    }

    let destination: Principal
    try {
      destination = Principal.fromText(toAddress.trim())
    } catch {
      setError('Invalid destination principal.')
      return
    }

    const parsed = parseKinic(amount)
    if (parsed.value === null) {
      setError(parsed.error ?? 'Invalid amount.')
      return
    }
    if (balance.balanceBase !== null && parsed.value > balance.balanceBase) {
      setError('Amount exceeds your balance.')
      return
    }

    setIsSending(true)
    setError(null)
    try {
      const actor = await createLedgerActor(identityState.identity)
      const height = await transferIcrc1(actor, {
        from_subaccount: [],
        to: { owner: destination, subaccount: [] },
        amount: parsed.value,
        fee: [],
        memo: [],
        created_at_time: [BigInt(Date.now()) * 1_000_000n]
      })
      toast.success('Transfer submitted', { description: `Block ${height.toString()}` })
      setToAddress('')
      setAmount('')
      balance.refresh()
      onOpenChange(false)
    } catch (sendError) {
      setError(errorMessage(sendError, 'Transfer failed.'))
    } finally {
      setIsSending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className='max-w-md'>
        <DialogHeader>
          <DialogTitle>Send KINIC</DialogTitle>
          <DialogDescription>Transfers are final. Double-check the destination principal.</DialogDescription>
        </DialogHeader>
        <form className='grid gap-4' onSubmit={handleSubmit}>
          <div className='grid gap-2'>
            <Label htmlFor='send-to'>To principal</Label>
            <Input
              id='send-to'
              value={toAddress}
              onChange={(event) => setToAddress(event.target.value)}
              placeholder='xxxxx-xxxxx-…'
              autoComplete='off'
              spellCheck={false}
              className='font-mono text-[13px]'
            />
          </div>
          <div className='grid gap-2'>
            <div className='flex items-center justify-between gap-2'>
              <Label htmlFor='send-amount'>Amount</Label>
              <span className='text-xs text-muted-foreground'>
                Balance: {balance.balanceBase === null ? '—' : formatKinic(balance.balanceBase)} KINIC
              </span>
            </div>
            <div className='flex gap-2'>
              <div className='relative flex-1'>
                <Input
                  id='send-amount'
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder='0.00'
                  inputMode='decimal'
                  autoComplete='off'
                  className='pr-14 font-mono'
                />
                <span className='pointer-events-none absolute inset-y-0 right-3 flex items-center text-xs text-muted-foreground'>
                  KINIC
                </span>
              </div>
              <Button
                type='button'
                variant='outline'
                onClick={() => balance.balanceBase !== null && setAmount(formatKinic(balance.balanceBase))}
                disabled={balance.balanceBase === null}
              >
                Max
              </Button>
            </div>
          </div>
          {error ? (
            <div
              role='alert'
              className='rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive'
            >
              {error}
            </div>
          ) : null}
          <DialogFooter>
            <Button type='button' variant='outline' onClick={() => handleOpenChange(false)} disabled={isSending}>
              Cancel
            </Button>
            <Button type='submit' variant='brand' disabled={isSending || !identityState.isAuthenticated}>
              {isSending ? 'Sending…' : 'Send'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

export default SendDialog
