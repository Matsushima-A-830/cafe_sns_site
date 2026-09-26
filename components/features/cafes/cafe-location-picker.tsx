'use client'

import { APIProvider, useMapsLibrary } from '@vis.gl/react-google-maps'
import { useEffect, useId, useRef, useState } from 'react'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { env } from '@/lib/env'
import { cn } from '@/lib/utils/cn'

/**
 * S_CAFE_NEW の位置情報入力。この API キーは Places API (New) のみ有効
 * （legacy Autocomplete ウィジェットは REQUEST_DENIED になるため使えない）。
 * AutocompleteSuggestion / Place の新API を使い、候補一覧は自前描画にして
 * デザインシステム（brown系トークン・8px余白）に合わせる
 */
const SUGGESTION_DEBOUNCE_MS = 300

export type CafeLocation = { lat: number; lng: number; address: string }

type Suggestion = { placeId: string; text: string }

function CafeLocationAutocomplete({
  value,
  onChange,
}: {
  value: CafeLocation | null
  onChange: (location: CafeLocation | null) => void
}) {
  const placesLibrary = useMapsLibrary('places')
  const inputId = useId()
  const [query, setQuery] = useState(value?.address ?? '')
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const sessionTokenRef = useRef<google.maps.places.AutocompleteSessionToken | null>(null)

  useEffect(() => {
    if (!placesLibrary) return
    const trimmed = query.trim()
    if (!trimmed || trimmed === value?.address) {
      setSuggestions([])
      return
    }

    let cancelled = false
    const timer = setTimeout(async () => {
      sessionTokenRef.current ??= new placesLibrary.AutocompleteSessionToken()
      const { suggestions: results } =
        await placesLibrary.AutocompleteSuggestion.fetchAutocompleteSuggestions({
          input: trimmed,
          sessionToken: sessionTokenRef.current,
          includedRegionCodes: ['jp'],
        })
      if (cancelled) return
      setSuggestions(
        results.flatMap((result) => {
          const prediction = result.placePrediction
          if (!prediction) return []
          return [{ placeId: prediction.placeId, text: prediction.text.text }]
        }),
      )
    }, SUGGESTION_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  }, [query, placesLibrary, value?.address])

  async function handleSelect(suggestion: Suggestion) {
    if (!placesLibrary) return
    const place = new placesLibrary.Place({ id: suggestion.placeId })
    await place.fetchFields({ fields: ['location'] })
    // 1件選んだらセッション終了。次の検索で新しいセッショントークンを発行する
    sessionTokenRef.current = null
    setSuggestions([])
    setQuery(suggestion.text)

    if (!place.location) {
      onChange(null)
      return
    }
    onChange({ lat: place.location.lat(), lng: place.location.lng(), address: suggestion.text })
  }

  return (
    <div className="flex flex-col gap-2">
      <Label htmlFor={inputId}>住所や店名で検索して位置を設定（任意）</Label>
      <Input
        id={inputId}
        value={query}
        onChange={(event) => {
          setQuery(event.target.value)
          if (value) onChange(null)
        }}
        placeholder="カフェの住所や店名"
        autoComplete="off"
      />
      {suggestions.length > 0 && (
        <ul className="flex flex-col gap-1 rounded-md border border-border-default bg-surface p-1">
          {suggestions.map((suggestion) => (
            <li key={suggestion.placeId}>
              <button
                type="button"
                onClick={() => handleSelect(suggestion)}
                className={cn(
                  'w-full rounded px-3 py-2 text-left text-sm text-foreground',
                  'hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring-focus',
                )}
              >
                {suggestion.text}
              </button>
            </li>
          ))}
        </ul>
      )}
      {value && (
        <p className="text-sm text-muted-foreground">
          位置を設定しました（緯度 {value.lat.toFixed(5)} / 経度 {value.lng.toFixed(5)}）
        </p>
      )}
    </div>
  )
}

export function CafeLocationPicker(props: {
  value: CafeLocation | null
  onChange: (location: CafeLocation | null) => void
}) {
  // キー未設定の環境（ローカル未設定・CI等）ではフォーム自体を出さない。壊れたUIより無い方がよい
  if (!env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY) return null

  return (
    <APIProvider apiKey={env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY} libraries={['places']}>
      <CafeLocationAutocomplete {...props} />
    </APIProvider>
  )
}
