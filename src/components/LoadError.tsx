import { STATUS } from '../lib/theme'

/**
 * A failed read has to look different from a quiet window. Without this, a
 * broken query and a genuinely empty range both render as a flat chart, and
 * the flat chart is the one that gets believed.
 */
export default function LoadError({ message }: { message: string }) {
  return (
    <p
      role="alert"
      className="border-l-2 px-3 py-1.5 font-mono text-[10px] uppercase leading-relaxed text-slate-400"
      style={{ borderColor: STATUS.critical }}
    >
      ✕ query failed — figures below are not current
      <span className="ml-2 normal-case text-slate-600">{message}</span>
    </p>
  )
}
