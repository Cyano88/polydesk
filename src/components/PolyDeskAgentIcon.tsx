import { cn } from '../lib/utils'

export default function PolyDeskAgentIcon({
  className,
}: {
  className?: string
  header?: boolean
  isStatic?: boolean
}) {
  return (
    <span
      className={cn('polydesk-chat-icon shrink-0', className)}
      aria-hidden="true"
    >
      <span className="polydesk-chat-icon__bubble">
        <span />
        <span />
        <span />
      </span>
    </span>
  )
}
