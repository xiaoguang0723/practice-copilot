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
  return normalized.endsWith('/chat/completions')
    ? normalized
    : `${normalized}/chat/completions`
}

export function validateSettingsPatch(patch: SettingsPatch): ValidationResult {
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
