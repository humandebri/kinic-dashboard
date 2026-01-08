// Where: Dashboard transactions section.
// What: Paginated table for recent transaction rows.
// Why: Mirrors the reference data table with consistent pagination UI.
'use client'

import { useState } from 'react'

import { ChevronLeftIcon, ChevronRightIcon, EllipsisVerticalIcon } from 'lucide-react'

import type { ColumnDef, PaginationState } from '@tanstack/react-table'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable
} from '@tanstack/react-table'

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { useMounted } from '@/hooks/use-mounted'
import { Pagination, PaginationContent, PaginationEllipsis, PaginationItem } from '@/components/ui/pagination'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import { usePagination } from '@/hooks/use-pagination'
import type { TransactionItem } from '@/data/dashboard-transactions'

export const columns: ColumnDef<TransactionItem>[] = [
  {
    accessorKey: 'name',
    header: 'Source',
    cell: ({ row }) => (
      <div className='flex items-center gap-2'>
        <Avatar className='size-9'>
          <AvatarImage src={row.original.avatar} alt='Source' />
          <AvatarFallback className='text-xs'>{row.original.avatarFallback}</AvatarFallback>
        </Avatar>
        <div className='flex flex-col text-sm'>
          <span className='text-card-foreground font-medium'>{row.getValue('name')}</span>
          <span className='text-muted-foreground'>{row.original.email}</span>
        </div>
      </div>
    )
  },
  {
    accessorKey: 'amount',
    header: 'Chunks',
    cell: ({ row }) => {
      const amount = parseFloat(row.getValue('amount'))

      const formatted = new Intl.NumberFormat('en-US').format(amount)

      return <span>{formatted}</span>
    }
  },
  {
    accessorKey: 'status',
    header: 'Status',
    cell: ({ row }) => (
      <Badge className='bg-primary/10 text-primary rounded-sm px-1.5 capitalize'>{row.getValue('status')}</Badge>
    )
  },
  {
    accessorKey: 'paidBy',
    header: () => <span className='w-fit'>Type</span>,
    cell: ({ row }) => {
      const kind = row.getValue('paidBy') === 'mastercard' ? 'PDF' : 'Markdown'
      return <Badge className='bg-primary/10 text-primary rounded-sm px-1.5'>{kind}</Badge>
    }
  },
  {
    id: 'actions',
    header: () => 'Actions',
    cell: () => <RowActions />,
    size: 60,
    enableHiding: false
  }
]

const TransactionDatatable = ({ data }: { data: TransactionItem[] }) => {
  const pageSize = 5

  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: pageSize
  })

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onPaginationChange: setPagination,
    state: { pagination }
  })

  const totalPages = Math.ceil(data.length / pageSize)
  const currentPage = pagination.pageIndex + 1

  const { pages, showLeftEllipsis, showRightEllipsis } = usePagination({
    currentPage,
    totalPages,
    paginationItemsToDisplay: 5
  })

  return (
    <div className='w-full space-y-4'>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder
                    ? null
                    : flexRender(header.column.columnDef.header, header.getContext())}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length ? (
            table.getRowModel().rows.map((row) => (
              <TableRow key={row.id}>
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className='text-muted-foreground py-8 text-center'>
                No activity yet
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <Pagination>
        <PaginationContent>
          <PaginationItem>
            <Button
              variant='ghost'
              size='icon'
              className='text-muted-foreground size-8 rounded-full'
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              <ChevronLeftIcon className='size-4' />
            </Button>
          </PaginationItem>
          {showLeftEllipsis && (
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
          )}
          {pages.map((page) => (
            <PaginationItem key={page}>
              <Button
                variant={page === currentPage ? 'default' : 'ghost'}
                size='icon'
                className='text-muted-foreground size-8 rounded-full'
                onClick={() => table.setPageIndex(page - 1)}
              >
                {page}
              </Button>
            </PaginationItem>
          ))}
          {showRightEllipsis && (
            <PaginationItem>
              <PaginationEllipsis />
            </PaginationItem>
          )}
          <PaginationItem>
            <Button
              variant='ghost'
              size='icon'
              className='text-muted-foreground size-8 rounded-full'
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              <ChevronRightIcon className='size-4' />
            </Button>
          </PaginationItem>
        </PaginationContent>
      </Pagination>
    </div>
  )
}

const RowActions = () => {
  const mounted = useMounted()

  if (!mounted) {
    // Render a static trigger to avoid SSR/client id mismatches in Radix.
    return (
      <Button variant='ghost' size='icon' className='text-muted-foreground size-6 rounded-full'>
        <EllipsisVerticalIcon />
        <span className='sr-only'>Menu</span>
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant='ghost' size='icon' className='text-muted-foreground size-6 rounded-full'>
          <EllipsisVerticalIcon />
          <span className='sr-only'>Menu</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align='end'>
        <DropdownMenuGroup>
          <DropdownMenuItem>Open</DropdownMenuItem>
          <DropdownMenuItem>Tag</DropdownMenuItem>
          <DropdownMenuItem>Remove</DropdownMenuItem>
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

export default TransactionDatatable
