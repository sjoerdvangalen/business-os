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
  User,
  Building2,
} from 'lucide-react'
import Link from 'next/link'

interface Contact {
  id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  job_title: string | null
  department: string | null
  linkedin_url: string | null
  status: string | null
  created_at: string
  company_id: string | null
  companies?: { name: string }
}

export default function ContactsPage() {
  const [data, setData] = useState<Contact[]>([])
  const [loading, setLoading] = useState(true)
  const [sorting, setSorting] = useState<SortingState>([])
  const [columnFilters, setColumnFilters] = useState<ColumnFiltersState>([])
  const [globalFilter, setGlobalFilter] = useState('')
  const [editingCell, setEditingCell] = useState<{ id: string; key: keyof Contact } | null>(null)
  const [editValue, setEditValue] = useState('')
  const supabase = createClient()

  useEffect(() => {
    fetchContacts()
  }, [])

  async function fetchContacts() {
    setLoading(true)
    const { data: contacts, error } = await supabase
      .from('contacts')
      .select('*, companies(name)')
      .order('created_at', { ascending: false })

    if (error) {
      toast.error('Failed to load contacts')
      console.error(error)
    } else {
      setData(contacts || [])
    }
    setLoading(false)
  }

  async function updateContact(id: string, key: keyof Contact, value: string | null) {
    const { error } = await supabase
      .from('contacts')
      .update({ [key]: value })
      .eq('id', id)

    if (error) {
      toast.error('Failed to update contact')
      console.error(error)
    } else {
      setData((prev) =>
        prev.map((contact) =>
          contact.id === id ? { ...contact, [key]: value } : contact
        )
      )
      toast.success('Contact updated')
    }
  }

  async function deleteContact(id: string) {
    if (!confirm('Are you sure you want to delete this contact?')) return

    const { error } = await supabase.from('contacts').delete().eq('id', id)

    if (error) {
      toast.error('Failed to delete contact')
    } else {
      setData((prev) => prev.filter((c) => c.id !== id))
      toast.success('Contact deleted')
    }
  }

  function startEdit(contact: Contact, key: keyof Contact) {
    setEditingCell({ id: contact.id, key })
    const value = contact[key]
    setEditValue(typeof value === 'string' ? value : '')
  }

  function saveEdit() {
    if (editingCell) {
      updateContact(editingCell.id, editingCell.key, editValue || null)
      setEditingCell(null)
    }
  }

  function cancelEdit() {
    setEditingCell(null)
    setEditValue('')
  }

  const exportToCSV = () => {
    const headers = ['First Name', 'Last Name', 'Email', 'Phone', 'Job Title', 'Company', 'Status']
    const csv = [
      headers.join(','),
      ...data.map((c) =>
        [
          c.first_name || '',
          c.last_name || '',
          c.email || '',
          c.phone || '',
          c.job_title || '',
          c.companies?.name || '',
          c.status || '',
        ].map((v) => `"${v}"`).join(',')
      ),
    ].join('\n')

    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `contacts-${new Date().toISOString().split('T')[0]}.csv`
    a.click()
    URL.revokeObjectURL(url)
    toast.success('Contacts exported to CSV')
  }

  const columns: ColumnDef<Contact>[] = useMemo(
    () => [
      {
        accessorKey: 'first_name',
        header: ({ column }) => (
          <Button
            variant="ghost"
            onClick={() => column.toggleSorting(column.getIsSorted() === 'asc')}
            className="h-8 px-2"
          >
            <User className="mr-2 h-4 w-4" />
            Name
            <ArrowUpDown className="ml-2 h-4 w-4" />
          </Button>
        ),
        cell: ({ row }) => {
          const contact = row.original
          const isEditing = editingCell?.id === contact.id && editingCell?.key === 'first_name'
          const fullName = `${contact.first_name || ''} ${contact.last_name || ''}`.trim()

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
                onClick={() => startEdit(contact, 'first_name')}
              >
                {fullName || 'Unnamed'}
              </span>
            </div>
          )
        },
      },
      {
        accessorKey: 'email',
        header: 'Email',
        cell: ({ row }) => {
          const contact = row.original
          const isEditing = editingCell?.id === contact.id && editingCell?.key === 'email'

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
              className="cursor-pointer hover:text-blue-600 text-sm"
              onClick={() => startEdit(contact, 'email')}
            >
              {contact.email || '—'}
            </span>
          )
        },
      },
      {
        accessorKey: 'job_title',
        header: 'Job Title',
        cell: ({ row }) => {
          const contact = row.original
          const isEditing = editingCell?.id === contact.id && editingCell?.key === 'job_title'

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
              onClick={() => startEdit(contact, 'job_title')}
            >
              {contact.job_title || '—'}
            </Badge>
          )
        },
      },
      {
        accessorKey: 'companies',
        header: 'Company',
        cell: ({ row }) => {
          const contact = row.original
          return (
            <div className="flex items-center gap-1 text-sm">
              <Building2 className="h-3 w-3 text-muted-foreground" />
              {contact.companies?.name || '—'}
            </div>
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
          const contact = row.original
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
                <DropdownMenuItem onClick={() => startEdit(contact, 'first_name')}>
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </DropdownMenuItem>
                {contact.email && (
                  <DropdownMenuItem asChild>
                    <a href={`mailto:${contact.email}`}>
                      <Mail className="mr-2 h-4 w-4" />
                      Send Email
                    </a>
                  </DropdownMenuItem>
                )}
                {contact.phone && (
                  <DropdownMenuItem asChild>
                    <a href={`tel:${contact.phone}`}>
                      <Phone className="mr-2 h-4 w-4" />
                      Call
                    </a>
                  </DropdownMenuItem>
                )}
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => deleteContact(contact.id)}
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
          <h1 className="text-3xl font-bold tracking-tight">Contacts</h1>
          <p className="text-muted-foreground">
            Manage your contacts. Click any cell to edit inline.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" onClick={exportToCSV}>
            <Download className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button asChild>
            <Link href="/crm/contacts/new">
              <Plus className="mr-2 h-4 w-4" />
              Add Contact
            </Link>
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Total Contacts</CardDescription>
            <CardTitle className="text-2xl">{data.length.toLocaleString()}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>With Email</CardDescription>
            <CardTitle className="text-2xl">
              {data.filter((c) => c.email).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>With Phone</CardDescription>
            <CardTitle className="text-2xl">
              {data.filter((c) => c.phone).length}
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardDescription>Linked to Company</CardDescription>
            <CardTitle className="text-2xl">
              {data.filter((c) => c.company_id).length}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search contacts..."
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
                    {loading ? 'Loading...' : 'No contacts found.'}
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
