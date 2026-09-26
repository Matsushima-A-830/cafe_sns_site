'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Area = { code: string; label: string }

export function FilterBar({
  areas,
  areaCode,
  onAreaChange,
  query,
  onQueryChange,
}: {
  areas: Area[]
  areaCode: string
  onAreaChange: (areaCode: string) => void
  query: string
  onQueryChange: (query: string) => void
}) {
  const areaFieldId = useId()
  const queryFieldId = useId()

  return (
    <div className="flex flex-col gap-3 md:flex-row md:items-end">
      <div className="flex flex-col gap-2 md:w-48">
        <Label htmlFor={areaFieldId}>エリア</Label>
        <select
          id={areaFieldId}
          value={areaCode}
          onChange={(event) => onAreaChange(event.target.value)}
          className="h-10 rounded-md border border-border-default bg-surface px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring-focus"
        >
          <option value="">すべて</option>
          {areas.map((area) => (
            <option key={area.code} value={area.code}>
              {area.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-1 flex-col gap-2">
        <Label htmlFor={queryFieldId}>カフェ名で検索</Label>
        <Input
          id={queryFieldId}
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="カフェ名"
        />
      </div>
    </div>
  )
}
