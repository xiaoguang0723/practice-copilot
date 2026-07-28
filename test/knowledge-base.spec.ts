import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { KnowledgeBaseStore } from '../electron/knowledge-base'

const temporaryDirectories: string[] = []
const stores: KnowledgeBaseStore[] = []

function createStore(): KnowledgeBaseStore {
  const directory = mkdtempSync(join(tmpdir(), 'practice-copilot-knowledge-'))
  temporaryDirectories.push(directory)
  const store = new KnowledgeBaseStore(directory)
  stores.push(store)
  return store
}

afterEach(() => {
  while (stores.length > 0) stores.pop()!.close()
  while (temporaryDirectories.length > 0) {
    rmSync(temporaryDirectories.pop()!, { force: true, recursive: true })
  }
})

describe('KnowledgeBaseStore', () => {
  it('stores an imported text copy and finds its relevant chunk in the selected knowledge base', () => {
    const store = createStore()
    const knowledgeBase = store.createKnowledgeBase('LeetCode 题解')

    const document = store.importDocument({
      content:
        '# 两数之和\n\n给定整数数组 nums 和整数 target，请返回和为 target 的两个元素下标。使用哈希表可以在 O(n) 时间内完成。',
      knowledgeBaseId: knowledgeBase.id,
      name: '两数之和.md'
    })

    expect(store.getDocument(document.id)?.content).toContain('哈希表')
    expect(store.search([knowledgeBase.id], 'nums target 哈希表')).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          documentId: document.id,
          documentName: '两数之和.md',
          knowledgeBaseName: 'LeetCode 题解'
        })
      ])
    )
  })

  it('updates local document copies and removes only the knowledge-base records', () => {
    const store = createStore()
    const knowledgeBase = store.createKnowledgeBase('算法笔记')
    const document = store.importDocument({
      content: '原始内容',
      knowledgeBaseId: knowledgeBase.id,
      name: 'notes.txt'
    })

    expect(store.renameKnowledgeBase(knowledgeBase.id, '算法题解').name).toBe('算法题解')
    expect(store.updateDocument(document.id, '更新后的动态规划题解').content).toBe('更新后的动态规划题解')

    store.deleteDocument(document.id)
    expect(store.getDocument(document.id)).toBeUndefined()

    store.deleteKnowledgeBase(knowledgeBase.id)
    expect(store.listKnowledgeBases()).toEqual([])
  })

  it('rejects unsupported document formats', () => {
    const store = createStore()
    const knowledgeBase = store.createKnowledgeBase('资料')

    expect(() => store.importDocument({
      content: 'PDF extracted text', knowledgeBaseId: knowledgeBase.id, name: 'answer.pdf'
    })).toThrow('仅支持 TXT 和 MD')
  })
})
