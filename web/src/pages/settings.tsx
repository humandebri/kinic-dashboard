// Where: Settings page.
// What: Appearance, default memory, II session length, and manually saved canisters.
// Why: Keeps per-browser preferences in one place.
import { Principal } from '@dfinity/principal'
import { MonitorIcon, MoonIcon, PlusIcon, SunIcon, Trash2Icon } from 'lucide-react'
import { useState, type FormEvent, type ReactNode } from 'react'
import { toast } from 'sonner'

import CopyButton from '@/components/common/copy-button'
import PageHeader from '@/components/common/page-header'
import { useIdentityState } from '@/components/providers/identity-provider'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { useMemoryOptions } from '@/hooks/use-memory-options'
import { II_SESSION_TTL_NS } from '@/lib/ic-config'
import { readStorage, writeStorage } from '@/lib/storage'
import { cn } from '@/lib/utils'
import { useCustomCanisters } from '@/stores/custom-canisters'
import { useSelectedMemory } from '@/stores/selected-memory'
import { useThemeStore, type ThemePreference } from '@/stores/theme'

const SESSION_TTL_KEY = 'kinic.ii-session-ttl-ns'
const SESSION_TTL_OPTIONS = [
  { label: '15 minutes', value: '900000000000' },
  { label: '1 hour', value: '3600000000000' },
  { label: '12 hours', value: '43200000000000' },
  { label: '1 day', value: '86400000000000' },
  { label: '7 days', value: '604800000000000' }
]
const NONE = '__none__'

const Section = ({ title, description, children }: { title: string; description: string; children: ReactNode }) => (
  <Card>
    <div className='grid gap-4 md:grid-cols-[240px_minmax(0,1fr)] md:gap-8'>
      <CardHeader className='pb-0 md:pb-6'>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className='md:pl-0 md:pt-6'>{children}</CardContent>
    </div>
  </Card>
)

const THEME_OPTIONS: Array<[ThemePreference, string, ReactNode]> = [
  ['light', 'Light', <SunIcon key='l' />],
  ['dark', 'Dark', <MoonIcon key='d' />],
  ['system', 'System', <MonitorIcon key='s' />]
]

const SettingsPage = () => {
  const identityState = useIdentityState()
  const { defaultMemoryId, setDefaultMemoryId } = useSelectedMemory()
  const { customCanisters, addCustomCanister, removeCustomCanister } = useCustomCanisters()
  const { preference, setPreference } = useThemeStore()
  const memoryOptions = useMemoryOptions()
  const [newCanister, setNewCanister] = useState('')
  const [sessionTtl, setSessionTtl] = useState(() => {
    const stored = readStorage(SESSION_TTL_KEY)
    return stored && /^\d+$/.test(stored) ? stored : II_SESSION_TTL_NS.toString()
  })

  const handleAddCustom = (event: FormEvent) => {
    event.preventDefault()
    const trimmed = newCanister.trim()
    if (!trimmed) return
    try {
      Principal.fromText(trimmed)
    } catch {
      toast.error('Invalid canister ID')
      return
    }
    addCustomCanister(trimmed)
    setNewCanister('')
    toast.success('Canister saved')
  }

  return (
    <div className='space-y-6'>
      <PageHeader title='Settings' description='Preferences are stored in this browser only.' />

      <Section title='Appearance' description='Choose how the dashboard looks.'>
        <div className='grid max-w-md grid-cols-3 gap-2'>
          {THEME_OPTIONS.map(([value, label, icon]) => (
            <button
              key={value}
              type='button'
              onClick={() => setPreference(value)}
              aria-pressed={preference === value}
              className={cn(
                'flex flex-col items-center gap-2 rounded-xl border px-3 py-4 text-sm transition [&_svg]:size-5',
                preference === value
                  ? 'border-brand bg-brand/5 font-medium text-foreground ring-1 ring-brand'
                  : 'text-muted-foreground hover:bg-accent hover:text-foreground'
              )}
            >
              {icon}
              {label}
            </button>
          ))}
        </div>
      </Section>

      <Section title='Default memory' description='Selected automatically when you open the dashboard.'>
        <div className='max-w-md space-y-2'>
          <Select
            value={defaultMemoryId ?? NONE}
            onValueChange={(value) => setDefaultMemoryId(value === NONE ? null : value)}
            disabled={!identityState.isAuthenticated}
          >
            <SelectTrigger className='font-mono text-xs'>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE} className='text-sm'>
                Not set
              </SelectItem>
              {memoryOptions.map((value) => (
                <SelectItem key={value} value={value} className='font-mono text-xs'>
                  {value}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {!identityState.isAuthenticated ? (
            <p className='text-xs text-muted-foreground'>Connect identity to choose a default.</p>
          ) : null}
        </div>
      </Section>

      <Section title='Session length' description='How long an Internet Identity sign-in stays valid. Applies next time you sign in.'>
        <div className='max-w-md'>
          <Select
            value={sessionTtl}
            onValueChange={(value) => {
              setSessionTtl(value)
              writeStorage(SESSION_TTL_KEY, value)
              toast.success('Session length saved', { description: 'Takes effect on your next sign-in.' })
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SESSION_TTL_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </Section>

      <Section title='Saved canisters' description='Memories you were given access to that are not owned by you.'>
        <div className='space-y-4'>
          <form className='flex max-w-xl gap-2' onSubmit={handleAddCustom}>
            <Input
              value={newCanister}
              onChange={(event) => setNewCanister(event.target.value)}
              placeholder='Canister ID (e.g. aaaaa-aa)'
              className='font-mono text-[13px]'
              spellCheck={false}
              autoComplete='off'
              aria-label='Canister ID'
            />
            <Button type='submit' variant='outline' disabled={!newCanister.trim()}>
              <PlusIcon /> Add
            </Button>
          </form>
          {customCanisters.length ? (
            <ul className='divide-y rounded-xl border'>
              {customCanisters.map((canisterId) => (
                <li key={canisterId} className='flex items-center gap-2 px-4 py-2.5'>
                  <span className='min-w-0 flex-1 break-all font-mono text-xs'>{canisterId}</span>
                  <CopyButton value={canisterId} />
                  <Button
                    variant='ghost'
                    size='icon-sm'
                    className='text-muted-foreground hover:text-destructive'
                    onClick={() => removeCustomCanister(canisterId)}
                    aria-label={`Remove ${canisterId}`}
                  >
                    <Trash2Icon />
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className='text-sm text-muted-foreground'>No canisters saved yet.</p>
          )}
        </div>
      </Section>
    </div>
  )
}

export default SettingsPage
