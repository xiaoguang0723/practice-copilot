import { useEffect, useState, type ChangeEvent } from 'react'

import type {
  KnowledgeBaseSummary,
  KnowledgeDocument,
  PublicSettings
} from '../../shared/protocol'

interface KnowledgeBasePanelProps {
  onClose(): void
  onSettingsChange(): Promise<void>
  settings: PublicSettings
}

export function KnowledgeBasePanel({ onClose, onSettingsChange, settings }: KnowledgeBasePanelProps) {
  const [bases, setBases] = useState<KnowledgeBaseSummary[]>([])
  const [documents, setDocuments] = useState<KnowledgeDocument[]>([])
  const [activeBaseId, setActiveBaseId] = useState<string>()
  const [editing, setEditing] = useState<KnowledgeDocument>()
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const run = async (operation: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try { await operation() } catch (caught) {
      setError(caught instanceof Error ? caught.message : '知识库操作失败')
    } finally { setBusy(false) }
  }

  const reloadBases = async () => setBases(await window.practice.knowledge.list())
  const openBase = async (id: string) => {
    setActiveBaseId(id)
    setEditing(undefined)
    setDocuments(await window.practice.knowledge.listDocuments(id))
  }

  useEffect(() => { void reloadBases().catch((caught) => setError(String(caught))) }, [])

  const toggleBase = async (id: string) => {
    const selected = settings.selectedKnowledgeBaseIds.includes(id)
      ? settings.selectedKnowledgeBaseIds.filter((value) => value !== id)
      : [...settings.selectedKnowledgeBaseIds, id]
    await window.practice.settings.save({ selectedKnowledgeBaseIds: selected })
    await onSettingsChange()
  }

  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file || !activeBaseId) return
    if (!/\.(txt|md)$/i.test(file.name)) throw new Error('仅支持 TXT 和 MD 文件')
    if (file.size > 5 * 1024 * 1024) throw new Error('单个资料不能超过 5 MB')
    await window.practice.knowledge.importDocument({
      content: await file.text(), knowledgeBaseId: activeBaseId, name: file.name
    })
    await openBase(activeBaseId)
  }

  return <div className="settings-backdrop">
    <section aria-label="本地知识库" className="settings-panel knowledge-panel">
      <div className="settings-heading">
        <div><span className="eyebrow">KNOWLEDGE</span><h2>本地知识库</h2></div>
        <button aria-label="关闭知识库" className="icon-button" onClick={onClose}>×</button>
      </div>

      <label className="inline-toggle">
        <input
          aria-label="启用知识库检索"
          checked={settings.knowledgeBaseEnabled}
          onChange={(event) => void run(async () => {
            await window.practice.settings.save({ knowledgeBaseEnabled: event.target.checked })
            await onSettingsChange()
          })}
          type="checkbox"
        />
        <span>启用知识库检索</span>
      </label>

      <div className="knowledge-create">
        <input aria-label="知识库名称" maxLength={120} onChange={(event) => setNewName(event.target.value)} placeholder="新知识库名称" value={newName} />
        <button className="primary-button" disabled={busy || !newName.trim()} onClick={() => void run(async () => {
          const created = await window.practice.knowledge.create(newName)
          setNewName('')
          await reloadBases()
          await openBase(created.id)
        })}>新建</button>
      </div>

      <div className="knowledge-list">
        {bases.length === 0 && <span className="empty-note">暂无知识库</span>}
        {bases.map((base) => <div className={`knowledge-row ${activeBaseId === base.id ? 'active' : ''}`} key={base.id}>
          <input aria-label={`选择 ${base.name}`} checked={settings.selectedKnowledgeBaseIds.includes(base.id)} onChange={() => void run(() => toggleBase(base.id))} type="checkbox" />
          <button className="row-title" onClick={() => void run(() => openBase(base.id))}>{base.name}</button>
          <button className="text-button" onClick={() => void run(async () => {
            const name = window.prompt('新的知识库名称', base.name)?.trim()
            if (!name) return
            await window.practice.knowledge.rename(base.id, name)
            await reloadBases()
          })}>改名</button>
          <button className="danger-link" onClick={() => void run(async () => {
            if (!window.confirm(`删除知识库“${base.name}”及其中所有资料？`)) return
            await window.practice.knowledge.delete(base.id)
            if (activeBaseId === base.id) { setActiveBaseId(undefined); setDocuments([]); setEditing(undefined) }
            await window.practice.settings.save({ selectedKnowledgeBaseIds: settings.selectedKnowledgeBaseIds.filter((id) => id !== base.id) })
            await onSettingsChange(); await reloadBases()
          })}>删除</button>
        </div>)}
      </div>

      {activeBaseId && <>
        <label className="file-import"><span>添加资料</span><input accept=".txt,.md,text/plain,text/markdown" disabled={busy} onChange={(event) => void run(() => importFile(event))} type="file" /></label>
        <div className="document-list">
          {documents.length === 0 && <span className="empty-note">暂无资料</span>}
          {documents.map((document) => <button className="document-row" key={document.id} onClick={() => setEditing(document)}>{document.name}</button>)}
        </div>
      </>}

      {editing && <div className="document-editor">
        <strong>{editing.name}</strong>
        <textarea aria-label="资料内容" maxLength={5 * 1024 * 1024} onChange={(event) => setEditing({ ...editing, content: event.target.value })} rows={9} value={editing.content} />
        <div className="settings-actions">
          <button className="danger-link" onClick={() => void run(async () => {
            if (!window.confirm(`删除资料“${editing.name}”？`)) return
            await window.practice.knowledge.deleteDocument(editing.id)
            setEditing(undefined); await openBase(editing.knowledgeBaseId)
          })}>删除资料</button>
          <label className="replace-file"><span>替换</span><input accept=".txt,.md" onChange={(event) => void run(async () => {
            const file = event.target.files?.[0]; if (!file) return
            const updated = await window.practice.knowledge.updateDocument(editing.id, await file.text())
            setEditing(updated); await openBase(updated.knowledgeBaseId)
          })} type="file" /></label>
          <span className="action-spacer" />
          <button className="primary-button" disabled={busy || !editing.content.trim()} onClick={() => void run(async () => {
            const updated = await window.practice.knowledge.updateDocument(editing.id, editing.content)
            setEditing(updated); await openBase(updated.knowledgeBaseId)
          })}>保存资料</button>
        </div>
      </div>}
      {error && <div className="form-error">{error}</div>}
    </section>
  </div>
}
