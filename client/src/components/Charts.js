'use client';

import { useId } from 'react';

/*
 * Small single-series charts for reports. One blue for every chart (each shows one measure),
 * thin bars with rounded data ends, value labels in text colours, a hover tooltip, and a
 * "Show as table" view so the numbers never depend on seeing the chart.
 */

function DataTable({ rows, labelHeader, valueHeader }) {
  return (
    <details className="mt-3 text-xs print:hidden">
      <summary className="cursor-pointer select-none text-slate-500 hover:text-slate-800">Show as table</summary>
      <table className="mt-2 w-full text-left">
        <thead className="text-slate-500">
          <tr>
            <th scope="col" className="py-1 font-medium">{labelHeader}</th>
            <th scope="col" className="py-1 text-right font-medium">{valueHeader}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 tabular-nums text-slate-700">
          {rows.map((r) => (
            <tr key={r.label}>
              <td className="py-1">{r.label}</td>
              <td className="py-1 text-right">{r.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

/** Horizontal bars: one row per category, label on the left, value at the bar's end. */
export function BarList({ rows, labelHeader = 'Category', valueHeader = 'Count', unit = '' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <div>
      <ul className="space-y-2.5">
        {rows.map((r) => (
          <li key={r.label} className="group relative grid grid-cols-[7rem_1fr] items-center gap-3 sm:grid-cols-[9rem_1fr]">
            <span className="truncate text-sm text-slate-600" title={r.label}>
              {r.label}
            </span>
            <span className="flex items-center gap-2">
              <span className="h-3 flex-1 rounded-r bg-slate-100" aria-hidden>
                <span
                  className="block h-3 rounded-r bg-blue-600 transition-colors group-hover:bg-blue-700"
                  style={{ width: r.value ? `max(4px, ${(r.value / max) * 100}%)` : 0 }}
                />
              </span>
              <span className="w-10 text-right text-sm font-semibold tabular-nums text-slate-900">
                {r.value}
                {unit}
              </span>
            </span>
            <span
              role="tooltip"
              className="pointer-events-none absolute -top-8 left-28 z-10 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow group-hover:block sm:left-36"
            >
              {r.label}: {r.value}
              {unit}
            </span>
          </li>
        ))}
      </ul>
      <DataTable rows={rows} labelHeader={labelHeader} valueHeader={valueHeader} />
    </div>
  );
}

/** Vertical columns over time (oldest → newest). */
export function ColumnChart({ rows, labelHeader = 'Period', valueHeader = 'Count' }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  const id = useId();
  return (
    <div>
      <div className="flex h-40 items-end gap-1.5 border-b border-slate-200" role="img" aria-labelledby={`${id}-desc`}>
        <span id={`${id}-desc`} className="sr-only">
          {rows.map((r) => `${r.label}: ${r.value}`).join(', ')}
        </span>
        {rows.map((r) => (
          <div key={r.label} className="group relative flex h-full flex-1 flex-col items-center justify-end">
            <span className="mb-1 text-[11px] font-semibold tabular-nums text-slate-700">{r.value || ''}</span>
            <span
              className="block w-full max-w-[36px] rounded-t bg-blue-600 transition-colors group-hover:bg-blue-700"
              style={{ height: r.value ? `max(4px, ${(r.value / max) * 85}%)` : 0 }}
              aria-hidden
            />
            <span className="pointer-events-none absolute -top-7 z-10 hidden whitespace-nowrap rounded-md bg-slate-900 px-2 py-1 text-xs text-white shadow group-hover:block">
              {r.label}: {r.value}
            </span>
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5" aria-hidden>
        {rows.map((r, i) => (
          <span key={r.label} className="flex-1 truncate text-center text-[10px] text-slate-500">
            {i % 2 === 0 || rows.length <= 6 ? r.short ?? r.label : ''}
          </span>
        ))}
      </div>
      <DataTable rows={rows} labelHeader={labelHeader} valueHeader={valueHeader} />
    </div>
  );
}
