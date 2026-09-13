import { describe, expect, it } from 'vitest'
import { extractPlainText } from '@/lib/validators/posts'
import { textToTiptapDoc, tiptapDocToText } from './tiptap'

describe('textToTiptapDoc', () => {
  it('1行を1段落にする', () => {
    expect(textToTiptapDoc('こんにちは')).toEqual({
      type: 'doc',
      content: [{ type: 'paragraph', content: [{ type: 'text', text: 'こんにちは' }] }],
    })
  })

  it('空行は content を持たない段落にする（Tiptap が不正ノードと見なさない形）', () => {
    expect(textToTiptapDoc('A\n\nB')).toEqual({
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'A' }] },
        { type: 'paragraph' },
        { type: 'paragraph', content: [{ type: 'text', text: 'B' }] },
      ],
    })
  })

  it('空文字・空白のみは空の doc にする（createPost が POST_BODY_EMPTY で判定できる形）', () => {
    expect(textToTiptapDoc('')).toEqual({ type: 'doc', content: [] })
    expect(extractPlainText(textToTiptapDoc('   \n  ')).trim()).toBe('')
  })
})

describe('tiptapDocToText', () => {
  it('textToTiptapDoc と往復する', () => {
    for (const text of ['こんにちは', 'A\n\nB', '1行目\n2行目']) {
      expect(tiptapDocToText(textToTiptapDoc(text))).toBe(text)
    }
  })

  it('壊れた入力でも例外を投げず空文字を返す', () => {
    for (const broken of [null, undefined, 'text', 42, {}, { content: 'no-array' }]) {
      expect(tiptapDocToText(broken)).toBe('')
    }
  })
})
