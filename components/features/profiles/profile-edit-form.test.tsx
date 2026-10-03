import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ProfileEditForm } from './profile-edit-form'

const updateProfile = vi.fn()
const submitArea = vi.fn()
const uploadAvatar = vi.fn()
const deleteUnsavedAvatarFile = vi.fn()
const routerPush = vi.fn()
const routerRefresh = vi.fn()

vi.mock('@/app/_actions/profiles', () => ({
  updateProfile: (input: unknown) => updateProfile(input),
}))

vi.mock('@/app/_actions/onboarding', () => ({
  submitArea: (input: unknown) => submitArea(input),
}))

vi.mock('@/lib/storage/avatar-client', () => ({
  uploadAvatar: (file: File) => uploadAvatar(file),
  deleteUnsavedAvatarFile: (path: string) => deleteUnsavedAvatarFile(path),
}))

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush, refresh: routerRefresh }),
}))

const initialProfile = {
  username: 'taro',
  displayName: 'たろう',
  bio: null,
  avatarUrl: null,
  areaCode: null,
}
const areas = [{ code: 'shibuya', label: '渋谷' }]
const newAvatarUrl = 'http://127.0.0.1:54321/storage/v1/object/public/avatars/user-1/new.webp'

beforeEach(() => {
  updateProfile.mockReset()
  submitArea.mockReset()
  uploadAvatar.mockReset()
  deleteUnsavedAvatarFile.mockReset()
  routerPush.mockReset()
  routerRefresh.mockReset()
})

describe('ProfileEditForm', () => {
  it('変更が無ければ保存ボタンは disabled', () => {
    render(<ProfileEditForm initialProfile={initialProfile} areas={areas} />)
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('表示名を変えると保存ボタンが有効になる', async () => {
    const user = userEvent.setup()
    render(<ProfileEditForm initialProfile={initialProfile} areas={areas} />)

    await user.type(screen.getByLabelText('表示名'), '2')

    expect(screen.getByRole('button', { name: '保存' })).toBeEnabled()
  })

  it('アバターを選ぶとアップロードし、保存ボタンが有効になる', async () => {
    uploadAvatar.mockResolvedValue({
      ok: true,
      data: { path: 'user-1/new.webp', publicUrl: newAvatarUrl },
    })
    const user = userEvent.setup()
    render(<ProfileEditForm initialProfile={initialProfile} areas={areas} />)

    const file = new File(['dummy'], 'avatar.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('変更'), file)

    await waitFor(() => expect(uploadAvatar).toHaveBeenCalledWith(file))
    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeEnabled())
  })

  it('アバターのアップロード失敗はエラーを表示し、保存ボタンは disabled のまま', async () => {
    uploadAvatar.mockResolvedValue({ ok: false, error: 'FILE_TOO_LARGE' })
    const user = userEvent.setup()
    render(<ProfileEditForm initialProfile={initialProfile} areas={areas} />)

    const file = new File(['dummy'], 'avatar.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('変更'), file)

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent('画像のサイズが大きすぎます')
    })
    expect(screen.getByRole('button', { name: '保存' })).toBeDisabled()
  })

  it('保存時、変更したアバターの公開URLを含めて updateProfile を呼ぶ', async () => {
    uploadAvatar.mockResolvedValue({
      ok: true,
      data: { path: 'user-1/new.webp', publicUrl: newAvatarUrl },
    })
    updateProfile.mockResolvedValue({ ok: true, data: null })
    const user = userEvent.setup()
    render(<ProfileEditForm initialProfile={initialProfile} areas={areas} />)

    const file = new File(['dummy'], 'avatar.png', { type: 'image/png' })
    await user.upload(screen.getByLabelText('変更'), file)
    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeEnabled())

    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({
        displayName: 'たろう',
        bio: '',
        avatarUrl: newAvatarUrl,
      }),
    )
    expect(routerPush).toHaveBeenCalledWith('/me')
  })

  it('アバターを変えていなければ updateProfile に avatarUrl を含めない', async () => {
    updateProfile.mockResolvedValue({ ok: true, data: null })
    const user = userEvent.setup()
    render(<ProfileEditForm initialProfile={initialProfile} areas={areas} />)

    await user.type(screen.getByLabelText('表示名'), '2')
    await user.click(screen.getByRole('button', { name: '保存' }))

    await waitFor(() =>
      expect(updateProfile).toHaveBeenCalledWith({ displayName: 'たろう2', bio: '' }),
    )
  })

  it('保存前にアバターを選び直すと、直前のアップロードを孤立ファイルとして削除する（D64）', async () => {
    uploadAvatar
      .mockResolvedValueOnce({ ok: true, data: { path: 'user-1/first.webp', publicUrl: 'a' } })
      .mockResolvedValueOnce({ ok: true, data: { path: 'user-1/second.webp', publicUrl: 'b' } })
    const user = userEvent.setup()
    render(<ProfileEditForm initialProfile={initialProfile} areas={areas} />)

    const input = screen.getByLabelText('変更')
    await user.upload(input, new File(['a'], 'a.png', { type: 'image/png' }))
    await waitFor(() => expect(uploadAvatar).toHaveBeenCalledTimes(1))

    await user.upload(input, new File(['b'], 'b.png', { type: 'image/png' }))
    await waitFor(() => expect(uploadAvatar).toHaveBeenCalledTimes(2))

    await waitFor(() => expect(deleteUnsavedAvatarFile).toHaveBeenCalledWith('user-1/first.webp'))
    expect(deleteUnsavedAvatarFile).not.toHaveBeenCalledWith('user-1/second.webp')
  })

  it('保存済みアバターはアンマウント時に削除しない', async () => {
    uploadAvatar.mockResolvedValue({
      ok: true,
      data: { path: 'user-1/new.webp', publicUrl: newAvatarUrl },
    })
    updateProfile.mockResolvedValue({ ok: true, data: null })
    const user = userEvent.setup()
    const { unmount } = render(<ProfileEditForm initialProfile={initialProfile} areas={areas} />)

    await user.upload(
      screen.getByLabelText('変更'),
      new File(['a'], 'a.png', { type: 'image/png' }),
    )
    await waitFor(() => expect(screen.getByRole('button', { name: '保存' })).toBeEnabled())
    await user.click(screen.getByRole('button', { name: '保存' }))
    await waitFor(() => expect(updateProfile).toHaveBeenCalled())

    unmount()

    expect(deleteUnsavedAvatarFile).not.toHaveBeenCalled()
  })

  it('保存せずに画面を離れると、アップロード済みの未保存アバターを削除する（D64）', async () => {
    uploadAvatar.mockResolvedValue({
      ok: true,
      data: { path: 'user-1/abandoned.webp', publicUrl: newAvatarUrl },
    })
    const user = userEvent.setup()
    const { unmount } = render(<ProfileEditForm initialProfile={initialProfile} areas={areas} />)

    await user.upload(
      screen.getByLabelText('変更'),
      new File(['a'], 'a.png', { type: 'image/png' }),
    )
    await waitFor(() => expect(uploadAvatar).toHaveBeenCalled())

    unmount()

    expect(deleteUnsavedAvatarFile).toHaveBeenCalledWith('user-1/abandoned.webp')
  })
})
