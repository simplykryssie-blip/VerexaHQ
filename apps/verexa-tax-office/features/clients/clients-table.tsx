"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  type ColumnDef,
  type SortingState,
  flexRender,
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowUpDown, ChevronLeft, ChevronRight } from "lucide-react";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CLIENT_STATUS_LABELS, CLIENT_TYPE_LABELS } from "@/lib/validation/clients";
import { formatDate } from "@/lib/formatters";
import type { Tables } from "@/types/database";

type ClientRow = Tables<"clients">;

export function ClientsTable({ clients }: { clients: ClientRow[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: "created_at", desc: true }]);

  const columns = useMemo<ColumnDef<ClientRow>[]>(
    () => [
      {
        id: "name",
        header: "Client",
        accessorFn: (row) => `${row.first_name} ${row.last_name}`.trim() || row.company || "—",
        cell: ({ row }) => (
          <div>
            <Link href={`/clients/${row.original.id}`} className="font-medium hover:underline">
              {row.original.company || `${row.original.first_name} ${row.original.last_name}`.trim()}
            </Link>
            <div className="text-xs text-muted-foreground">{row.original.email || "—"}</div>
          </div>
        ),
      },
      {
        accessorKey: "client_type",
        header: "Type",
        cell: ({ getValue }) => (
          <Badge variant="outline">{CLIENT_TYPE_LABELS[getValue() as keyof typeof CLIENT_TYPE_LABELS]}</Badge>
        ),
      },
      {
        accessorKey: "status",
        header: "Status",
        cell: ({ getValue }) => {
          const v = getValue() as string;
          return <Badge variant="secondary">{CLIENT_STATUS_LABELS[v as keyof typeof CLIENT_STATUS_LABELS] ?? v}</Badge>;
        },
      },
      {
        accessorKey: "portal_status",
        header: "Portal",
        cell: ({ getValue }) => <span className="text-xs capitalize">{String(getValue()).replace("_", " ")}</span>,
      },
      { accessorKey: "phone", header: "Phone", cell: ({ getValue }) => (getValue() as string) || "—" },
      {
        accessorKey: "created_at",
        header: "Created",
        cell: ({ getValue }) => formatDate(getValue() as string),
      },
    ],
    [],
  );

  const table = useReactTable({
    data: clients,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  });

  return (
    <div className="rounded-lg border border-border bg-card">
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => (
                <TableHead key={header.id}>
                  {header.isPlaceholder ? null : (
                    <button
                      type="button"
                      onClick={header.column.getToggleSortingHandler()}
                      className="flex items-center gap-1 hover:text-foreground"
                    >
                      {flexRender(header.column.columnDef.header, header.getContext())}
                      {header.column.getCanSort() && <ArrowUpDown className="h-3 w-3" />}
                    </button>
                  )}
                </TableHead>
              ))}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.map((row) => (
            <TableRow key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <div className="flex items-center justify-between px-3 py-2.5 border-t border-border text-sm">
        <span className="text-muted-foreground">
          Page {table.getState().pagination.pageIndex + 1} of {Math.max(1, table.getPageCount())} ·{" "}
          {clients.length} client{clients.length === 1 ? "" : "s"}
        </span>
        <div className="flex gap-1">
          <Button variant="outline" size="sm" onClick={() => table.previousPage()} disabled={!table.getCanPreviousPage()}>
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => table.nextPage()} disabled={!table.getCanNextPage()}>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
