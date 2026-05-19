'use client';

import { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

export interface Column<T> {
  key: string;
  header: string;
  render: (row: T) => React.ReactNode;
  className?: string;
  align?: 'left' | 'right' | 'center';
}

interface DataTableProps<T> {
  rows: T[];
  columns: Column<T>[];
  pageSize?: number;
  rowKey: (row: T) => string;
  searchPlaceholder?: string;
  searchFn?: (row: T, q: string) => boolean;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  toolbar?: React.ReactNode;
}

export function DataTable<T>({
  rows,
  columns,
  pageSize = 12,
  rowKey,
  searchPlaceholder = 'Search…',
  searchFn,
  onRowClick,
  emptyMessage = 'No records to show.',
  toolbar,
}: DataTableProps<T>) {
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    if (!query.trim() || !searchFn) return rows;
    const q = query.trim().toLowerCase();
    return rows.filter((r) => searchFn(r, q));
  }, [rows, query, searchFn]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const start = (currentPage - 1) * pageSize;
  const slice = filtered.slice(start, start + pageSize);

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-100 p-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setPage(1);
            }}
            placeholder={searchPlaceholder}
            className="h-9 w-full rounded-md border border-slate-200 bg-white pl-8 pr-3 text-sm font-medium text-[#0B1220] outline-none focus:border-navy-700 focus:ring-2 focus:ring-amber-400/30"
          />
        </div>

        <div className="flex items-center gap-2">{toolbar}</div>
      </div>

      <div className="thin-scrollbar overflow-x-auto">
        <table className="min-w-full divide-y divide-slate-100">
          <thead className="bg-[#F8FAF4]">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  scope="col"
                  className={
                    'px-4 py-2 text-[10px] font-black uppercase tracking-[0.14em] text-slate-500 ' +
                    (col.align === 'right'
                      ? 'text-right'
                      : col.align === 'center'
                        ? 'text-center'
                        : 'text-left')
                  }
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {slice.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-4 py-10 text-center text-sm text-slate-500"
                >
                  {emptyMessage}
                </td>
              </tr>
            ) : (
              slice.map((row) => (
                <tr
                  key={rowKey(row)}
                  className={
                    onRowClick
                      ? 'cursor-pointer transition hover:bg-[#F8FAF4]'
                      : 'hover:bg-slate-50/40'
                  }
                  onClick={() => onRowClick?.(row)}
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={
                        'px-4 py-3 text-sm text-[#0B1220] ' +
                        (col.align === 'right'
                          ? 'text-right'
                          : col.align === 'center'
                            ? 'text-center'
                            : 'text-left') +
                        ' ' +
                        (col.className ?? '')
                      }
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {filtered.length > pageSize && (
        <div className="flex items-center justify-between border-t border-slate-100 px-3 py-2 text-xs text-slate-500">
          <p>
            Page {currentPage} of {totalPages} · {filtered.length} rows
          </p>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white disabled:opacity-40"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages}
              className="flex h-8 w-8 items-center justify-center rounded-md border border-slate-200 bg-white disabled:opacity-40"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
