// Where: Root Next.js layout wrapper.
// What: Defines global fonts and app-wide providers.
// Why: Ensures shared state (balance) and styles apply to every route.
import type { ReactNode } from 'react'

import { BalanceProvider } from '@/components/providers/balance-provider'
import { IdentityProvider } from '@/components/providers/identity-provider'

import './globals.css'

export const metadata = {
  title: 'Kinic Memory Dashboard',
  description:
    'Kinic provides trustless agent memory. Build verifiable, owned memory on the Internet Computer. zkTAM keeps memory verifiable, owned, and portable.',
  icons: {
    icon: '/kinic-favicon.png'
  }
}

export default function RootLayout({
  children
}: Readonly<{
  children: ReactNode
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <IdentityProvider>
          <BalanceProvider>{children}</BalanceProvider>
        </IdentityProvider>
      </body>
    </html>
  )
}
