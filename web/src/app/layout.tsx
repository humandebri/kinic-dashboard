// Where: Root Next.js layout wrapper.
// What: Defines global fonts and app-wide providers.
// Why: Ensures shared state (balance) and styles apply to every route.
import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'

import { BalanceProvider } from '@/components/providers/balance-provider'
import { IdentityProvider } from '@/components/providers/identity-provider'

import './globals.css'

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin']
})

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin']
})

export const metadata: Metadata = {
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
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <IdentityProvider>
          <BalanceProvider>{children}</BalanceProvider>
        </IdentityProvider>
      </body>
    </html>
  )
}
