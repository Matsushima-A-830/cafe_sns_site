import { describe, expect, it } from 'vitest'
import { serviceRoleClient } from '../helpers/supabase'

const service = serviceRoleClient()

async function toPlaintext(doc: unknown): Promise<string | null> {
  const { data, error } = await service.rpc('tiptap_to_plaintext', { doc })
  expect(error).toBeNull()
  return data as string | null
}

describe('tiptap_to_plaintext', () => {
  it('入れ子の text ノードを文書順に空白区切りで連結する', async () => {
    const doc = {
      type: 'doc',
      content: [
        { type: 'heading', content: [{ type: 'text', text: '渋谷の朝カフェ' }] },
        {
          type: 'paragraph',
          content: [
            { type: 'text', text: '静かで' },
            { type: 'text', text: 'Wi-Fi', marks: [{ type: 'bold' }] },
            { type: 'text', text: 'も速い' },
          ],
        },
      ],
    }

    expect(await toPlaintext(doc)).toBe('渋谷の朝カフェ 静かで Wi-Fi も速い')
  })

  it('text ノードが無い文書は NULL（生成列側で coalesce する前提）', async () => {
    const doc = { type: 'doc', content: [{ type: 'image', attrs: { src: 'a.webp' } }] }

    expect(await toPlaintext(doc)).toBeNull()
  })

  it('STRICT なので NULL 入力は NULL', async () => {
    expect(await toPlaintext(null)).toBeNull()
  })
})
