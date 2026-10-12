import { useState } from 'react'
import { Check, Copy } from 'lucide-react'

interface Props {
  text: string
  label?: string
}

export default function CopyField({ text, label }: Props) {
  const [copied, setCopied] = useState(false)

  async function copy() {
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      return
    }
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <div className="flex items-center gap-2">
      {label && <span className="w-24 shrink-0 truncate text-xs text-gray-500">{label}</span>}
      <code className="min-w-0 flex-1 truncate rounded bg-fg/5 px-2 py-1 text-xs text-gray-300" title={text}>
        {text}
      </code>
      <button
        onClick={copy}
        title="Copy"
        className="shrink-0 rounded p-1.5 text-gray-500 hover:bg-fg/5 hover:text-gray-200"
      >
        {copied ? <Check size={13} /> : <Copy size={13} />}
      </button>
    </div>
  )
}
