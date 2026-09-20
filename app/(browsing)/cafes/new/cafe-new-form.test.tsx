import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CafeNewForm } from './cafe-new-form'

const createCafe = vi.fn()
const findSimilarCafes = vi.fn()

vi.mock('@/app/_actions/cafes', () => ({
  createCafe: (input: unknown) => createCafe(input),
  findSimilarCafes: (input: unknown) => findSimilarCafes(input),
}))

const areas = [
  { code: 'JP-13-shibuya-ku', label: '渋谷区' },
  { code: 'JP-13-meguro-ku', label: '目黒区' },
]

function setup() {
  render(<CafeNewForm areas={areas} />)
  return { user: userEvent.setup() }
}

async function fillRequired(user: ReturnType<typeof userEvent.setup>, name = '喫茶ソラ') {
  await user.type(screen.getByLabelText('カフェ名'), name)
  await user.type(screen.getByLabelText('都道府県'), '東京都')
  await user.type(screen.getByLabelText('市区町村'), '渋谷区')
}

beforeEach(() => {
  createCafe.mockReset()
  findSimilarCafes.mockReset()
  findSimilarCafes.mockResolvedValue({ ok: true, data: [] })
  createCafe.mockResolvedValue({ ok: true, data: { cafeId: 'cafe-1' } })
})

describe('CafeNewForm', () => {
  it('必須項目が空のまま送信すると createCafe を呼ばずエラーを出す', async () => {
    const { user } = setup()

    await user.click(screen.getByRole('button', { name: '登録する' }))

    expect(await screen.findByText('カフェ名を入力してください')).toBeInTheDocument()
    expect(createCafe).not.toHaveBeenCalled()
  })

  it('必須項目を入力して送信すると createCafe を呼び、成功時は完了メッセージに切り替わる', async () => {
    const { user } = setup()
    await fillRequired(user)

    await user.click(screen.getByRole('button', { name: '登録する' }))

    await waitFor(() =>
      expect(createCafe).toHaveBeenCalledWith(
        expect.objectContaining({ name: '喫茶ソラ', prefecture: '東京都', city: '渋谷区' }),
      ),
    )
    expect(await screen.findByText(/「喫茶ソラ」を登録しました/)).toBeInTheDocument()
  })

  it('エリアチップを選ぶと areaCode 付きで createCafe を呼ぶ', async () => {
    const { user } = setup()
    await fillRequired(user)
    await user.click(screen.getByRole('button', { name: '渋谷区' }))

    await user.click(screen.getByRole('button', { name: '登録する' }))

    await waitFor(() =>
      expect(createCafe).toHaveBeenCalledWith(
        expect.objectContaining({ areaCode: 'JP-13-shibuya-ku' }),
      ),
    )
  })

  it('サーバーエラー時はメッセージを表示し、完了状態にはしない', async () => {
    createCafe.mockResolvedValue({ ok: false, error: 'FORBIDDEN' })
    const { user } = setup()
    await fillRequired(user)

    await user.click(screen.getByRole('button', { name: '登録する' }))

    expect(await screen.findByText('この操作を行う権限がありません')).toBeInTheDocument()
    expect(screen.queryByText(/を登録しました/)).not.toBeInTheDocument()
  })

  it('カフェ名を入力してデバウンス経過後、似た名前の既存カフェを表示する', async () => {
    findSimilarCafes.mockResolvedValue({
      ok: true,
      data: [{ id: 'cafe-2', name: '喫茶ソラ本店', areaLabel: '渋谷区' }],
    })
    const { user } = setup()

    await user.type(screen.getByLabelText('カフェ名'), '喫茶ソラ')

    expect(await screen.findByText('似た名前の既存カフェがあります')).toBeInTheDocument()
    expect(screen.getByText('喫茶ソラ本店（渋谷区）')).toBeInTheDocument()
  })
})
