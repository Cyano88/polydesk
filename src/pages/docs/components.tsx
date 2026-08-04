import type { ReactNode } from 'react'

export function DocHeader({ title, description }: { title: string; description: string }) {
  return (
    <header className="border-b border-gray-200 pb-8 dark:border-white/10">
      <h1 className="text-3xl font-bold tracking-tight text-gray-950 dark:text-white">{title}</h1>
      <p className="mt-3 text-lg leading-8 text-gray-600 dark:text-gray-300">{description}</p>
    </header>
  )
}

export function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <section id={id} className="space-y-4">
      <h2 className="text-xl font-semibold text-gray-950 dark:text-white">{title}</h2>
      <div className="space-y-4 leading-7 text-gray-600 dark:text-gray-300">{children}</div>
    </section>
  )
}

export function Code({ children }: { children: ReactNode }) {
  return <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-sm text-gray-800 dark:bg-white/[0.08] dark:text-gray-200">{children}</code>
}

export function CodeBlock({ children, lang = 'bash' }: { children: string; lang?: string }) {
  return (
    <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-white/10">
      <div className="border-b border-gray-800 bg-gray-900 px-4 py-2 font-mono text-[11px] uppercase tracking-wide text-gray-400">{lang}</div>
      <pre className="overflow-x-auto bg-gray-950 p-4 font-mono text-sm leading-6 text-gray-100">{children}</pre>
    </div>
  )
}

export function Table({ headers, rows }: { headers: string[]; rows: ReactNode[][] }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-gray-200 dark:border-white/10">
      <table className="w-full text-left text-sm">
        <thead className="bg-gray-50 dark:bg-white/[0.05]">
          <tr>{headers.map(header => <th key={header} className="whitespace-nowrap px-4 py-3 font-semibold text-gray-700 dark:text-gray-200">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-gray-200 dark:divide-white/10">
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => <td key={cellIndex} className="px-4 py-3 align-top text-gray-600 dark:text-gray-300">{cell}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function Note({ children }: { children: ReactNode }) {
  return <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm leading-6 text-gray-700 dark:border-white/10 dark:bg-white/[0.05] dark:text-gray-200">{children}</div>
}
