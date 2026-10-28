import { StrictMode, lazy, Suspense, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router'

import AppShell from '@/components/layout/app-shell'
import { BalanceProvider } from '@/components/providers/balance-provider'
import { IdentityProvider } from '@/components/providers/identity-provider'
import { MemoriesProvider } from '@/components/providers/memories-provider'
import { Toaster } from '@/components/ui/sonner'
import { TooltipProvider } from '@/components/ui/tooltip'
import MemoriesPage from '@/pages/memories'
import NotFoundPage from '@/pages/not-found'

import './index.css'

const MemoryDetailPage = lazy(() => import('@/pages/memory-detail'))
const MintMemoryPage = lazy(() => import('@/pages/mint-memory'))
const InsertPage = lazy(() => import('@/pages/insert'))
const SearchPage = lazy(() => import('@/pages/search'))
const SettingsPage = lazy(() => import('@/pages/settings'))
const CliLoginPage = lazy(() => import('@/pages/cli-login'))

const PageFallback = () => (
  <div className='space-y-4' aria-busy>
    <div className='h-7 w-48 animate-pulse rounded-md bg-muted' />
    <div className='h-40 animate-pulse rounded-xl bg-muted' />
  </div>
)

const lazyPage = (node: ReactNode) => <Suspense fallback={<PageFallback />}>{node}</Suspense>

const router = createBrowserRouter([
  { path: '/', element: <Navigate to='/memories' replace /> },
  { path: '/cli-login', element: lazyPage(<CliLoginPage />) },
  {
    element: <AppShell />,
    children: [
      { path: '/memories', element: <MemoriesPage /> },
      { path: '/memories/add', element: lazyPage(<MintMemoryPage />) },
      { path: '/memories/:id', element: lazyPage(<MemoryDetailPage />) },
      { path: '/insert', element: lazyPage(<InsertPage />) },
      { path: '/search', element: lazyPage(<SearchPage />) },
      { path: '/settings', element: lazyPage(<SettingsPage />) },
      { path: '*', element: <NotFoundPage /> }
    ]
  }
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <IdentityProvider>
      <BalanceProvider>
        <MemoriesProvider>
          <TooltipProvider delayDuration={200}>
            <RouterProvider router={router} />
            <Toaster />
          </TooltipProvider>
        </MemoriesProvider>
      </BalanceProvider>
    </IdentityProvider>
  </StrictMode>
)
