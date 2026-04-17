'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  getFilteredRowModel,
  useReactTable,
  SortingState,
  ColumnFiltersState,
} from '@tanstack/react-table'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { createClient } from '@/lib/supabase/client'
import { toast } from 'sonner'
import {
  ArrowUpDown,
  ChevronDown,
  MoreHorizontal,
  Plus,
  Search,
  Filter,
  Download,
  Trash2,
  Edit,
  Mail,
  Phone,
  Building2,
  Globe,
  MapPin,
} from 'lucide-react'
import Link from 'next/link'

interface Company {
  id: string
  name: string
  industry: string | null
  size: string | null
  website: string | null
  city: string | null
  country: string | null
  status: string | null
  created_at: string
  phone: string | null
  email: string | null
  linkedin_url: string | null
  description: string | null
}

export default function CompaniesPage() {
  const [data, setData] = useState<Company[]>([])
  const [loading, setLoading] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [editingCell, setEditingCell] = useState<{ id: string; key: keyof Company } | null>(null)
  const [editValue, setEditValue] = useState('')
  const supabase = createClient()

  useEffect(() => {
    fetchCompanies()
  }, [])

  async function fetchCompanies() {
    setLoading(true)
    const { data: companies, error } = await supabase
      .from('companies')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Failed to load companies')
      console.error(error)
    } else {
      setData(companies || [])
    }
    setLoading(false)
  }

  async function updateCompany(id: string, key: keyof Company, value: string | null) {
    const { error } = await supabase
      .from('companies')
      .update({ [key]: value })
      .eq('id', id)

    if (error) {
      toast.error('Failed to update company')
      console.error(error)
    } else {
      setData((prev) =>
        prev.map((company) =>
          company.id === id ? { ...company, [key]: value } : company
        )
      )
      toast.success('Company updated')
    }
  }

  async function deleteCompany(id: string) {
    if (!confirm('Are you sure you want to delete this company?')) return

    const { error } = await supabase.from('companies').delete().eq('id', id)

    if (error) {
      toast.error('Failed to delete company')
    } else {
      setData((prev) => prev.filter((c) => c.id !== id))
      toast.success('Company deleted')
    }
  }

  function startEdit(company: Company, key: keyof Company) {
    setEditingCell({ id: company.id, key })
    setEditValue(company[key] || '')
  }

  function saveEdit() {
    if (editingCell) {
      updateCompany(editingCell.id, editingCell.key, editValue || null)
      setEditingCell(null)
    }
  }

  function cancelEdit() {
    setEditingCell(null)
    setEditValue('')
  }

  const exportToCSV = () => {
    const headers = ['Name', 'Industry', 'Size', 'City', 'Country', 'Website', 'Status']
    const csv = [
      headers.join(','),
      ...data.map((c) =>
        [
          c.name,
          c.industry || '',
          c.size || '',
          c.city || '',
          c.country || '',
          c.website || '',
          c.status || '',
        ].map((v) => `"${v}"`).join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `companies-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Companies exported to CSV')
  }

  const columns: ColumnDef<Company>[] = useMemo(
    () => [
      {
        accessorKey: 'name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2"
          >
            <Building2 className="mr-2 h-4 w-4" />
            Company
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const company = row.original
          const isEditing = editingCell?.id === company.id && editingCell?.key === 'name'

          if (isEditing) {
            return (
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit()
                  if (e.key === 'Escape') cancelEdit()
                }}
                autoFocus
                className="h-8"
              />
            )
          }

          return (
            <div className="flex items-center gap-2">
              <span
                className="font-medium cursor-pointer hover:text-blue-600"
                onClick={() => startEdit(company, 'name')}
              >
                {company.name}
              </span>
              {company.website && (
                <a
                  href={`https://${company.website}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-800"
                >
                  <Globe className="h-3 w-3" />
                </a>
              )}
            </div>
          )
        },
      },
      {
        accessorKey: 'industry',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2"
          >
            Industry
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const company = row.original
          const isEditing = editingCell?.id === company.id && editingCell?.key === 'industry'

          if (isEditing) {
            return (
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit()
                  if (e.key === 'Escape') cancelEdit()
                }}
                autoFocus
                className="h-8"
              />
            )
          }

          return (
            <Badge
              variant="secondary"
              className="cursor-pointer hover:bg-slate-300"
              onClick={() => startEdit(company, 'industry')}
            >
              {company.industry || '—'}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'size',
        header: 'Size',
        cell: ({ row }) => {
          const company = row.original
          const isEditing = editingCell?.id === company.id && editingCell?.key === 'size'

          if (isEditing) {
            return (
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit()
                  if (e.key === 'Escape') cancelEdit()
                }}
                autoFocus
                className="h-8 w-24"
              />
            )
          }

          return (
            <span
              className="cursor-pointer hover:text-blue-600"
              onClick={() => startEdit(company, 'size')}
            >
              {company.size || '—'}
            </span>
          )
        },
      },
      {
        accessorKey: 'city',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2"
          >
            <MapPin className="mr-2 h-4 w-4" />
            Location
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const company = row.original
          const isEditing =
            editingCell?.id === company.id && editingCell?.key === 'city'

          if (isEditing) {
            return (
              <Input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onBlur={saveEdit}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveEdit()
                  if (e.key === 'Escape') cancelEdit()
                }}
                autoFocus
                className="h-8"
              />
            )
          }

          return (
            <span
              className="cursor-pointer hover:text-blue-600"
              onClick={() => startEdit(company, 'city')}
            >
              {company.city || '—'}
              {company.country && `, ${company.country}`}
            </span>
          )
        },
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const status = row.original.status
          const colors: Record<string, string> = {
            active: 'bg-green-100 text-green-800',
            prospect: 'bg-blue-100 text-blue-800',
            customer: 'bg-purple-100 text-purple-800',
            churned: 'bg-red-100 text-red-800',
          }
          return (
            <Badge className={colors[status || ''] || 'bg-gray-100 text-gray-800'}>
              {status || '—'}
            </Badge>
          )
        },
      },
      {
        id: 'actions',
        header: '',
        cell: ({ row }) => {
          const company = row.original
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" className="h-8 w-8 p-0">
                  <MoreHorizontal className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => startEdit(company, 'name')}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/crm/companies/${company.id}/contacts`}>
                    <Building2 className="mr-2 h-4 w-4" />
                    View Contacts
                  </Link>
                </DropdownMenuItem>
                {company.email && (
                  <DropdownMenuItem asChild>
                    <a href={`mailto:${company.email}`}>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Email
                    </a>
                  </DropdownMenuItem>
                )}
                {company.phone && (
                  <DropdownMenuItem asChild>
                    <a href={`tel:${company.phone}`}>
                      <Phone className="mr-2 h-4 w-4" />
                      Call
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => deleteCompany(company.id)}
                  className="text-red-600"
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    [editingCell, editValue]
  )

  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    state: {
      sorting,
      columnFilters,
      globalFilter,
    },
    onGlobalFilterChange: setGlobalFilter,
  })

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Companies</h1>
          <p className="text-muted-foreground">
            Manage your companies. Click any cell to edit inline.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button asChild>
            <Link href="/crm/companies/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Company
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Companies</CardDescription>
            <CardTitle className="text-2xl">{data.length.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Active</CardDescription>
            <CardTitle className="text-2xl">
              {data.filter((c) => c.status === 'active').length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Customers</CardDescription>
            <CardTitle className="text-2xl">
              {data.filter((c) => c.status === 'customer').length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Prospects</CardDescription>
            <CardTitle className="text-2xl">
              {data.filter((c) => c.status === 'prospect').length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search companies..."
            value={globalFilter}
            onChange={(e) => setGlobalFilter(e.target.value)}
            className="pl-9"
          />
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline">
              <Filter className="mr-2 h-4 w-4" />
              Columns
              <ChevronDown className="ml-2 h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => (
                <DropdownMenuItem
                  key={column.id}
                  className="capitalize"
                  onClick={() => column.toggleVisibility(!column.getIsVisible())}
                >
                  <input
                    type="checkbox"
                    checked={column.getIsVisible()}
                    onChange={() => {}}
                    className="mr-2"
                  />
                  {column.id}
                </DropdownMenuItem>
              ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              {table.getHeaderGroups().map((headerGroup) => (
                <TableRow key={headerGroup.id}>
                  {headerGroup.headers.map((header) => (
                    <TableHead key={header.id}>
                      {header.isPlaceholder
                        ? null
                        : flexRender(
                            header.column.columnDef.header,
                            header.getContext()
                          )}
                    </TableHead>
                  ))}
                </TableRow>
              ))}
            </TableHeader>
            <TableBody>
              {table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell key={cell.id}>
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={columns.length} className="h-24 text-center">
                    {loading ? 'Loading...' : 'No companies found.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  )
}
