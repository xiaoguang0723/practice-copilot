import { randomUUID } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import Database from 'better-sqlite3'

export interface KnowledgeBase {
  createdAt: number
  id: string
  name: string
  updatedAt: number
}

export interface KnowledgeDocument {
  content: string
  createdAt: number
  id: string
  knowledgeBaseId: string
  name: string
  updatedAt: number
}

export interface KnowledgeMatch {
  content: string
  documentId: string
  documentName: string
  knowledgeBaseId: string
  knowledgeBaseName: string
}

export interface ImportKnowledgeDocumentInput {
  content: string
  knowledgeBaseId: string
  name: string
}

interface KnowledgeBaseRow extends KnowledgeBase {}

interface KnowledgeDocumentRow extends KnowledgeDocument {}

interface KnowledgeMatchRow extends KnowledgeMatch {}

const MAX_CHUNK_LENGTH = 800
const MAX_DOCUMENT_BYTES = 5 * 1024 * 1024

export class KnowledgeBaseStore {
  private readonly database: Database.Database
  private readonly documentsDirectory: string

  constructor(rootDirectory: string) {
    mkdirSync(rootDirectory, { recursive: true })
    this.documentsDirectory = join(rootDirectory, 'documents')
    mkdirSync(this.documentsDirectory, { recursive: true })
    this.database = new Database(join(rootDirectory, 'knowledge-base.sqlite'))
    this.database.pragma('journal_mode = WAL')
    this.database.exec(`
      CREATE TABLE IF NOT EXISTS knowledge_bases (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS knowledge_documents (
        id TEXT PRIMARY KEY,
        knowledge_base_id TEXT NOT NULL,
        name TEXT NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (knowledge_base_id) REFERENCES knowledge_bases(id) ON DELETE CASCADE
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_chunks USING fts5(
        content,
        document_id UNINDEXED,
        knowledge_base_id UNINDEXED,
        tokenize = 'unicode61'
      );
    `)
  }

  close(): void {
    this.database.close()
  }

  createKnowledgeBase(name: string): KnowledgeBase {
    const normalizedName = normalizeName(name, '知识库名称')
    const id = randomUUID()
    const now = Date.now()
    this.database
      .prepare(
        'INSERT INTO knowledge_bases (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)'
      )
      .run(id, normalizedName, now, now)
    return { createdAt: now, id, name: normalizedName, updatedAt: now }
  }

  listKnowledgeBases(): KnowledgeBase[] {
    return this.database
      .prepare(
        `SELECT id, name, created_at as createdAt, updated_at as updatedAt
          FROM knowledge_bases ORDER BY updated_at DESC`
      )
      .all() as KnowledgeBaseRow[]
  }

  listDocuments(knowledgeBaseId: string): KnowledgeDocument[] {
    return this.database
      .prepare(
        `SELECT id, knowledge_base_id as knowledgeBaseId, name, content,
          created_at as createdAt, updated_at as updatedAt
          FROM knowledge_documents WHERE knowledge_base_id = ? ORDER BY updated_at DESC`
      )
      .all(knowledgeBaseId) as KnowledgeDocumentRow[]
  }

  renameKnowledgeBase(id: string, name: string): KnowledgeBase {
    const normalizedName = normalizeName(name, '知识库名称')
    const updatedAt = Date.now()
    const result = this.database
      .prepare('UPDATE knowledge_bases SET name = ?, updated_at = ? WHERE id = ?')
      .run(normalizedName, updatedAt, id)
    if (result.changes === 0) throw new Error('知识库不存在')
    return this.getKnowledgeBase(id)!
  }

  deleteKnowledgeBase(id: string): void {
    const documentIds = this.database
      .prepare('SELECT id FROM knowledge_documents WHERE knowledge_base_id = ?')
      .all(id) as Array<{ id: string }>
    const remove = this.database.transaction(() => {
      this.database.prepare('DELETE FROM knowledge_chunks WHERE knowledge_base_id = ?').run(id)
      this.database.prepare('DELETE FROM knowledge_documents WHERE knowledge_base_id = ?').run(id)
      const result = this.database.prepare('DELETE FROM knowledge_bases WHERE id = ?').run(id)
      if (result.changes === 0) throw new Error('知识库不存在')
    })
    remove()
    for (const document of documentIds) this.removeDocumentCopy(document.id)
  }

  importDocument(input: ImportKnowledgeDocumentInput): KnowledgeDocument {
    const knowledgeBase = this.getKnowledgeBase(input.knowledgeBaseId)
    if (!knowledgeBase) throw new Error('知识库不存在')

    const name = normalizeName(input.name, '资料名称')
    if (!/\.(txt|md)$/i.test(name)) throw new Error('仅支持 TXT 和 MD 文件')
    const content = normalizeContent(input.content)

    const id = randomUUID()
    const now = Date.now()
    const chunks = splitIntoChunks(content)
    const document: KnowledgeDocument = {
      content,
      createdAt: now,
      id,
      knowledgeBaseId: knowledgeBase.id,
      name,
      updatedAt: now
    }

    const persist = this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO knowledge_documents
            (id, knowledge_base_id, name, content, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?)`
        )
        .run(id, knowledgeBase.id, name, content, now, now)
      const insertChunk = this.database.prepare(
        'INSERT INTO knowledge_chunks (content, document_id, knowledge_base_id) VALUES (?, ?, ?)'
      )
      for (const chunk of chunks) insertChunk.run(chunk, id, knowledgeBase.id)
    })
    persist()

    writeFileSync(join(this.documentsDirectory, `${id}.txt`), content, 'utf8')
    return document
  }

  getDocument(id: string): KnowledgeDocument | undefined {
    const row = this.database
      .prepare(
        `SELECT id, knowledge_base_id as knowledgeBaseId, name, content,
          created_at as createdAt, updated_at as updatedAt
          FROM knowledge_documents WHERE id = ?`
      )
      .get(id) as KnowledgeDocumentRow | undefined
    return row
  }

  updateDocument(id: string, contentInput: string): KnowledgeDocument {
    const existing = this.getDocument(id)
    if (!existing) throw new Error('资料不存在')
    const content = normalizeContent(contentInput)
    const updatedAt = Date.now()
    const chunks = splitIntoChunks(content)
    const update = this.database.transaction(() => {
      this.database.prepare('DELETE FROM knowledge_chunks WHERE document_id = ?').run(id)
      this.database
        .prepare('UPDATE knowledge_documents SET content = ?, updated_at = ? WHERE id = ?')
        .run(content, updatedAt, id)
      const insertChunk = this.database.prepare(
        'INSERT INTO knowledge_chunks (content, document_id, knowledge_base_id) VALUES (?, ?, ?)'
      )
      for (const chunk of chunks) insertChunk.run(chunk, id, existing.knowledgeBaseId)
    })
    update()
    writeFileSync(join(this.documentsDirectory, `${id}.txt`), content, 'utf8')
    return this.getDocument(id)!
  }

  deleteDocument(id: string): void {
    const existing = this.getDocument(id)
    if (!existing) throw new Error('资料不存在')
    const remove = this.database.transaction(() => {
      this.database.prepare('DELETE FROM knowledge_chunks WHERE document_id = ?').run(id)
      this.database.prepare('DELETE FROM knowledge_documents WHERE id = ?').run(id)
    })
    remove()
    this.removeDocumentCopy(id)
  }

  search(knowledgeBaseIds: string[], query: string): KnowledgeMatch[] {
    const ids = [...new Set(knowledgeBaseIds.filter(Boolean))]
    const matchQuery = toFtsQuery(query)
    if (ids.length === 0 || !matchQuery) return []

    const placeholders = ids.map(() => '?').join(', ')
    return this.database
      .prepare(
        `SELECT chunks.content, documents.id as documentId, documents.name as documentName,
          bases.id as knowledgeBaseId, bases.name as knowledgeBaseName
          FROM knowledge_chunks chunks
          JOIN knowledge_documents documents ON documents.id = chunks.document_id
          JOIN knowledge_bases bases ON bases.id = documents.knowledge_base_id
          WHERE chunks.knowledge_base_id IN (${placeholders}) AND knowledge_chunks MATCH ?
          ORDER BY bm25(knowledge_chunks)
          LIMIT 6`
      )
      .all(...ids, matchQuery) as KnowledgeMatchRow[]
  }

  private getKnowledgeBase(id: string): KnowledgeBase | undefined {
    return this.database
      .prepare(
        `SELECT id, name, created_at as createdAt, updated_at as updatedAt
          FROM knowledge_bases WHERE id = ?`
      )
      .get(id) as KnowledgeBaseRow | undefined
  }

  private removeDocumentCopy(id: string): void {
    rmSync(join(this.documentsDirectory, `${id}.txt`), { force: true })
  }
}

function normalizeName(value: string, fieldName: string): string {
  const normalized = value.trim()
  if (!normalized) throw new Error(`${fieldName}不能为空`)
  if (normalized.length > 120) throw new Error(`${fieldName}不能超过 120 个字符`)
  return normalized
}

function normalizeContent(value: string): string {
  const content = value.replace(/\r\n/g, '\n').trim()
  if (!content) throw new Error('资料内容不能为空')
  if (Buffer.byteLength(content, 'utf8') > MAX_DOCUMENT_BYTES) throw new Error('单个资料不能超过 5 MB')
  return content
}

function splitIntoChunks(content: string): string[] {
  const paragraphs = content.split(/\n{2,}/).map((paragraph) => paragraph.trim()).filter(Boolean)
  const chunks: string[] = []
  let current = ''
  for (const paragraph of paragraphs) {
    if (paragraph.length > MAX_CHUNK_LENGTH) {
      if (current) chunks.push(current)
      current = ''
      for (let index = 0; index < paragraph.length; index += MAX_CHUNK_LENGTH) {
        chunks.push(paragraph.slice(index, index + MAX_CHUNK_LENGTH))
      }
      continue
    }
    if (current && current.length + paragraph.length + 2 > MAX_CHUNK_LENGTH) {
      chunks.push(current)
      current = paragraph
    } else {
      current = current ? `${current}\n\n${paragraph}` : paragraph
    }
  }
  if (current) chunks.push(current)
  return chunks.length > 0 ? chunks : [content]
}

function toFtsQuery(query: string): string {
  const terms = query
    .normalize('NFKC')
    .toLowerCase()
    .match(/[\p{Script=Han}]{2,}|[\p{L}\p{N}_-]{2,}/gu)
  if (!terms) return ''
  return [...new Set(terms)].map((term) => `"${term.replace(/"/g, '')}"`).join(' OR ')
}
