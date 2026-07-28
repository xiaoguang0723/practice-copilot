import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createDefaultSettings, type PracticeApi } from '../shared/protocol'
import { KnowledgeBasePanel } from '../src/components/KnowledgeBasePanel'

afterEach(cleanup)

describe('KnowledgeBasePanel', () => {
  it('enables retrieval and selects a local knowledge base explicitly', async () => {
    const settings = createDefaultSettings()
    const save = vi.fn(async (patch) => ({ ...settings, ...patch }))
    const api = {
      knowledge: {
        create: vi.fn(), delete: vi.fn(), deleteDocument: vi.fn(), importDocument: vi.fn(),
        list: vi.fn(async () => [{ createdAt: 1, id: 'leetcode', name: 'LeetCode 题解', updatedAt: 1 }]),
        listDocuments: vi.fn(async () => []), rename: vi.fn(), updateDocument: vi.fn()
      },
      settings: { save }
    } as unknown as PracticeApi
    Object.defineProperty(window, 'practice', { configurable: true, value: api })

    render(<KnowledgeBasePanel onClose={vi.fn()} onSettingsChange={vi.fn()} settings={settings} />)
    fireEvent.click(screen.getByRole('checkbox', { name: '启用知识库检索' }))
    expect(save).toHaveBeenCalledWith({ knowledgeBaseEnabled: true })

    const library = await screen.findByRole('checkbox', { name: '选择 LeetCode 题解' })
    fireEvent.click(library)
    await waitFor(() => expect(save).toHaveBeenCalledWith({ selectedKnowledgeBaseIds: ['leetcode'] }))
  })
})
