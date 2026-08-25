import type { SettingsPatch } from './protocol'

export type ValidationResult = { ok: true } | { message: string; ok: false }

function parseHttpUrl(value: string): URL {
  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('API 地址必须是有效的 HTTP 地址')
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('API 地址必须使用 HTTP 或 HTTPS')
  }
  return url
}

export function normalizeBaseUrl(baseUrl: string): string {
  const url = parseHttpUrl(baseUrl.trim())
  return url.toString().replace(/\/+$/, '')
}

export function normalizeChatCompletionsUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (normalized.endsWith('/chat/completions')) return normalized
  if (normalized.endsWith('/responses')) return normalized.replace(/\/responses$/, '/chat/completions')
  return `${normalized}/chat/completions`
}

export function normalizeResponsesUrl(baseUrl: string): string {
  const normalized = normalizeBaseUrl(baseUrl)
  if (normalized.endsWith('/responses')) return normalized
  if (normalized.endsWith('/chat/completions')) return normalized.replace(/\/chat\/completions$/, '/responses')
  return `${normalized}/responses`
}

export function normalizeApiUrl(baseUrl: string, protocol: 'chat' | 'response' = 'chat'): string {
  return protocol === 'response' ? normalizeResponsesUrl(baseUrl) : normalizeChatCompletionsUrl(baseUrl)
}

export function validateSettingsPatch(patch: SettingsPatch): ValidationResult {
  if (patch.apiConfigName !== undefined) {
    const name = patch.apiConfigName.trim()
    if (!name || name.length > 80) return { message: '配置名称必须为 1 到 80 个字符', ok: false }
  }
  if (patch.apiProtocol !== undefined && patch.apiProtocol !== 'chat' && patch.apiProtocol !== 'response') {
    return { message: '接口协议无效', ok: false }
  }
  if (patch.baseUrl !== undefined) {
    try {
      normalizeBaseUrl(patch.baseUrl)
    } catch (error) {
      return { message: (error as Error).message, ok: false }
    }
  }
  if (patch.model !== undefined && patch.model.trim().length === 0) {
    return { message: '模型名不能为空', ok: false }
  }
  if (patch.model !== undefined && patch.model.length > 200) {
    return { message: '模型名不能超过 200 个字符', ok: false }
  }
  if (patch.opacity !== undefined && (!Number.isFinite(patch.opacity) || patch.opacity < 0.35 || patch.opacity > 0.95)) {
    return { message: '透明度必须在 35% 到 95% 之间', ok: false }
  }
  if (patch.persistentPrompt !== undefined && patch.persistentPrompt.length > 8000) {
    return { message: '提示词不能超过 8000 个字符', ok: false }
  }
  if (patch.knowledgeBaseEnabled !== undefined && typeof patch.knowledgeBaseEnabled !== 'boolean') {
    return { message: '知识库开关无效', ok: false }
  }
  if (patch.selectedKnowledgeBaseIds !== undefined) {
    if (
      patch.selectedKnowledgeBaseIds.length > 20 ||
      patch.selectedKnowledgeBaseIds.some((id) => typeof id !== 'string' || id.length === 0 || id.length > 100)
    ) {
      return { message: '已选知识库无效', ok: false }
    }
  }
  if (patch.apiKey !== undefined && patch.apiKey.length > 4096) {
    return { message: 'API Key 长度无效', ok: false }
  }
  if (patch.hotkeys) {
    for (const accelerator of Object.values(patch.hotkeys)) {
      if (accelerator !== undefined && accelerator.trim().length === 0) {
        return { message: '快捷键不能为空', ok: false }
      }
    }
  }
  return { ok: true }
}
