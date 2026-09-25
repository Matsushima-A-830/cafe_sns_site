import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { RegularCandidate, RegularCustomer } from '@/lib/owner/regulars'
import { RegularsView } from './regulars-view'

const updateRegularNote = vi.fn()
const revokeRegular = vi.fn()
const awardRegular = vi.fn()

vi.mock('@/app/_actions/regular-customers', () => ({
  updateRegularNote: (input: unknown) => updateRegularNote(input),
  revokeRegular: (input: unknown) => revokeRegular(input),
  awardRegular: (input: unknown) => awardRegular(input),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}))

const cafeId = '11111111-1111-4111-8111-111111111111'
const cafeName = 'テストカフェ'

const regular: RegularCustomer = {
  userId: '22222222-2222-4222-8222-222222222222',
  username: 'regular_user',
  displayName: '常連ユーザー',
  avatarUrl: null,
  note: null,
  awardedAt: '2026-03-01T00:00:00.000Z',
  revokedAt: null,
}

const candidate: RegularCandidate = {
  userId: '33333333-3333-4333-8333-333333333333',
  username: 'candidate_user',
  displayName: '候補ユーザー',
  avatarUrl: null,
  postCount: 5,
  commentCount: 2,
  bookmarkCount: 1,
  lastActivityAt: null,
}

function setup(overrides: { candidates?: RegularCandidate[]; regulars?: RegularCustomer[] } = {}) {
  return render(
    <RegularsView
      cafeId={cafeId}
      cafeName={cafeName}
      initialActiveRegulars={overrides.regulars ?? [regular]}
      initialCandidates={overrides.candidates ?? [candidate]}
      initialHistory={[]}
    />,
  )
}

beforeEach(() => {
  updateRegularNote.mockReset()
  revokeRegular.mockReset()
  awardRegular.mockReset()
  updateRegularNote.mockResolvedValue({ ok: true, data: null })
  revokeRegular.mockResolvedValue({ ok: true, data: null })
  awardRegular.mockResolvedValue({ ok: true, data: null })
})

describe('RegularsView / RegularCard', () => {
  it('メモ保存中も保存ボタンを disabled にしない（D60）', async () => {
    updateRegularNote.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: 'メモ編集' }))
    await user.click(screen.getByRole('button', { name: '保存' }))

    const saveButton = screen.getByRole('button', { name: '保存' })
    await waitFor(() => expect(saveButton).toHaveAttribute('aria-busy', 'true'))
    expect(saveButton).not.toBeDisabled()
  })

  it('メモ保存の連打では2回目を送らない', async () => {
    updateRegularNote.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: 'メモ編集' }))
    const saveButton = screen.getByRole('button', { name: '保存' })
    await user.click(saveButton)
    await user.click(saveButton)

    expect(updateRegularNote).toHaveBeenCalledTimes(1)
  })

  it('取消送信中も取消確認ボタンを disabled にしない（D60）', async () => {
    revokeRegular.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: '取消' }))
    await user.click(screen.getByRole('button', { name: '取消する' }))

    const confirmButton = screen.getByRole('button', { name: '取消する' })
    await waitFor(() => expect(confirmButton).toHaveAttribute('aria-busy', 'true'))
    expect(confirmButton).not.toBeDisabled()
  })

  it('取消の連打では2回目を送らない', async () => {
    revokeRegular.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('button', { name: '取消' }))
    const confirmButton = screen.getByRole('button', { name: '取消する' })
    await user.click(confirmButton)
    await user.click(confirmButton)

    expect(revokeRegular).toHaveBeenCalledTimes(1)
  })
})

describe('RegularsView / CandidateCard', () => {
  it('認定送信中も認定ボタンを disabled にしない（D60）', async () => {
    awardRegular.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('tab', { name: '認定候補' }))
    await user.click(screen.getByRole('button', { name: '常連認定 ▶' }))
    await user.click(screen.getByRole('button', { name: '認定する' }))

    const confirmButton = screen.getByRole('button', { name: '認定する' })
    await waitFor(() => expect(confirmButton).toHaveAttribute('aria-busy', 'true'))
    expect(confirmButton).not.toBeDisabled()
  })

  it('認定の連打では2回目を送らない', async () => {
    awardRegular.mockReturnValue(new Promise(() => {}))
    const user = userEvent.setup()
    setup()

    await user.click(screen.getByRole('tab', { name: '認定候補' }))
    await user.click(screen.getByRole('button', { name: '常連認定 ▶' }))
    const confirmButton = screen.getByRole('button', { name: '認定する' })
    await user.click(confirmButton)
    await user.click(confirmButton)

    expect(awardRegular).toHaveBeenCalledTimes(1)
  })
})
