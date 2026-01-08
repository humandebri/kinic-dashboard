// Where: Dashboard sidebar navigation data.
// What: Sectioned menu items with icons and labels.
// Why: Keeps layout component focused on rendering.
import type { ReactNode } from 'react'
import {
  ArrowRightLeftIcon,
  ChartPieIcon,
  ChartSplineIcon,
  CirclePlusIcon,
  HashIcon,
  SettingsIcon,
  Undo2Icon
} from 'lucide-react'

export type SidebarLink = {
  label: string
  href: string
  icon: ReactNode
  badge?: string
  disabled?: boolean
}

export type SidebarSection = {
  label?: string
  items: SidebarLink[]
}

export const primarySection: SidebarSection = {
  items: []
}

export const pageSections: SidebarSection[] = [
  {
    label: 'Pages',
    items: [
      { label: 'Memories', href: '/memories', icon: <ChartSplineIcon /> },
      { label: 'Insert', href: '/insert', icon: <ArrowRightLeftIcon /> },
      { label: 'Search', href: '/search', icon: <ChartPieIcon /> },
      { label: 'Memory Detail', href: '/memories/selected', icon: <HashIcon /> }
    ]
  },
  {
    label: 'Utilities',
    items: [
      { label: 'Add Memory', href: '/memories/add', icon: <CirclePlusIcon /> },
      { label: 'Updates', href: '#', icon: <Undo2Icon />, disabled: true },
      { label: 'Settings', href: '/settings', icon: <SettingsIcon /> }
    ]
  }
]
