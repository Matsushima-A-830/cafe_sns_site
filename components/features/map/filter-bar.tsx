'use client'

import { useId } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

type Area = { code: string; label: string }
type Tag = { slug: string; label: string }

function FilterSelect({
  label,
  value,
  onChange,
  options,
  className,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  className?: string
}) {
  const fieldId = useId()

  return (
    <div className={className ?? 'flex flex-col gap-2 md:w-40'}>
      <Label htmlFor={fieldId}>{label}</Label>
      <select
        id={fieldId}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="h-10 rounded-md border border-border-default bg-surface px-3 text-sm text-foreground focus-visible:ring-2 focus-visible:ring-ring-focus"
      >
        <option value="">すべて</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export function FilterBar({
  areas,
  areaCode,
  onAreaChange,
  moodTags,
  moodTag,
  onMoodTagChange,
  occasionTags,
  occasionTag,
  onOccasionTagChange,
  query,
  onQueryChange,
}: {
  areas: Area[]
  areaCode: string
  onAreaChange: (areaCode: string) => void
  moodTags: Tag[]
  moodTag: string
  onMoodTagChange: (moodTag: string) => void
  occasionTags: Tag[]
  occasionTag: string
  onOccasionTagChange: (occasionTag: string) => void
  query: string
  onQueryChange: (query: string) => void
}) {
  const queryFieldId = useId()

  return (
    <div className="flex flex-col gap-3 md:flex-row md:flex-wrap md:items-end">
      <FilterSelect
        label="エリア"
        value={areaCode}
        onChange={onAreaChange}
        options={areas.map((area) => ({ value: area.code, label: area.label }))}
      />
      <FilterSelect
        label="雰囲気"
        value={moodTag}
        onChange={onMoodTagChange}
        options={moodTags.map((tag) => ({ value: tag.slug, label: tag.label }))}
      />
      <FilterSelect
        label="利用機会"
        value={occasionTag}
        onChange={onOccasionTagChange}
        options={occasionTags.map((tag) => ({ value: tag.slug, label: tag.label }))}
      />
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
