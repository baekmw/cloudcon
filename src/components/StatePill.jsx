import { Badge } from './ui/badge'

const tones = {
  공연중: 'success',
  공연예정: 'amber',
  공연완료: 'secondary',
}

export default function StatePill({ state, className = '' }) {
  const variant = tones[state] || 'secondary'
  return (
    <Badge variant={variant} className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${className}`}>
      {state || '상태 미정'}
    </Badge>
  )
}
