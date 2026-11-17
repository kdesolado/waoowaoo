import type { AiProviderImageExecutionContext, GenerateResult } from '@/lib/ai-providers/runtime-types'
import { EXTERNAL_OPERATION } from '@/lib/external-operation/registry'
import { fetchProviderWithRetry, readProviderJsonResponse } from '@/lib/ai-providers/failure'

type GatewayResponse = {
  readonly data?: readonly { readonly b64_json?: string }[]
  readonly prompt_id?: string
  readonly seed?: number
  readonly error?: string
  readonly detail?: string
}

function dimensions(aspectRatio?: string, resolution?: string): { width: number; height: number } {
  const longEdge = resolution === '1K' ? 1024 : 1920
  const [rawWidth, rawHeight] = (aspectRatio || '16:9').split(':').map(Number)
  const ratio = Number.isFinite(rawWidth) && Number.isFinite(rawHeight) && rawWidth > 0 && rawHeight > 0
    ? rawWidth / rawHeight
    : 16 / 9
  if (ratio >= 1) {
    return { width: Math.floor(longEdge / 8) * 8, height: Math.floor((longEdge / ratio) / 8) * 8 }
  }
  return { width: Math.floor((longEdge * ratio) / 8) * 8, height: Math.floor(longEdge / 8) * 8 }
}

export async function executeQwenImageGeneration(
  input: AiProviderImageExecutionContext,
): Promise<GenerateResult> {
  const baseUrl = input.providerConfig.baseUrl?.trim().replace(/\/$/, '')
  if (!baseUrl) throw new Error('QWEN_GATEWAY_BASE_URL_REQUIRED')
  const apiKey = input.providerConfig.apiKey.trim()
  if (!apiKey) throw new Error('QWEN_GATEWAY_TOKEN_REQUIRED')
  const options = input.options ?? {}
  if ((options.referenceImages?.length ?? 0) > 0) {
    throw new Error('QWEN_IMAGE_21_REFERENCE_IMAGES_NOT_SUPPORTED')
  }
  const size = dimensions(options.aspectRatio, options.resolution)
  const response = await fetchProviderWithRetry({
    url: `${baseUrl}/v1/images/generations`,
    provider: 'qwen',
    phase: 'submit',
    options: {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prompt: input.prompt,
        negative_prompt: typeof options.negativePrompt === 'string' ? options.negativePrompt : '',
        seed: typeof options.seed === 'number' ? options.seed : undefined,
        steps: typeof options.steps === 'number' ? options.steps : 25,
        ...size,
      }),
      operation: EXTERNAL_OPERATION.PROVIDER_SUBMIT,
      timeoutMs: 15 * 60 * 1000,
      scope: 'qwen:image:submit',
    },
  })
  const result = await readProviderJsonResponse<GatewayResponse>({
    response,
    provider: 'qwen',
    phase: 'result',
  })
  const imageBase64 = result.data?.[0]?.b64_json
  if (!imageBase64) throw new Error('QWEN_GATEWAY_IMAGE_MISSING')
  return {
    success: true,
    imageBase64,
    requestId: result.prompt_id,
    metadata: { seed: result.seed, width: size.width, height: size.height },
  }
}
