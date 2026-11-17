import type { AiProviderAdapter } from '@/lib/ai-providers/runtime-types'
import { createAiProviderFailureAdapter } from '@/lib/ai-providers/failure'
import { describeMediaVariantBase } from '@/lib/ai-providers/shared/media-adapter'
import { executeQwenImageGeneration } from './image'
import { QWEN_IMAGE_OPTION_SCHEMA } from './models'

const failure = createAiProviderFailureAdapter('qwen')

export const qwenAdapter: AiProviderAdapter = {
  providerKey: 'qwen',
  failure,
  image: {
    describe: (selection) => describeMediaVariantBase({
      modality: 'image',
      selection,
      executionMode: 'sync',
      optionSchema: QWEN_IMAGE_OPTION_SCHEMA,
    }),
    execute: executeQwenImageGeneration,
  },
  connectionTest: {
    diagnose: async ({ apiKey, baseUrl }) => {
      try {
        if (!baseUrl?.trim()) throw new Error('base_url_missing')
        const response = await fetch(`${baseUrl.trim().replace(/\/$/, '')}/health`, {
          headers: apiKey.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {},
          signal: AbortSignal.timeout(10_000),
        })
        if (!response.ok) throw new Error(`http_${String(response.status)}`)
        return {
          success: true,
          steps: [{ name: 'models', status: 'pass', messageKey: 'connectionTest.modelsOk' }],
        }
      } catch (error) {
        return {
          success: false,
          steps: [{
            name: 'models',
            status: 'fail',
            messageKey: 'connectionTest.networkError',
            diagnostic: error instanceof Error ? error.message : String(error),
          }],
        }
      }
    },
  },
}
