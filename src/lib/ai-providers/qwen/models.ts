import type { AiOptionSchema } from '@/lib/ai-registry/types'
import type { PlatformModelPreset } from '@/lib/platform-models/types'
import { buildMediaOptionSchema, integerRangeValidator } from '@/lib/ai-providers/shared/option-schema'

export const QWEN_IMAGE_21_MODEL_ID = 'qwen-image-2.1'
export const QWEN_IMAGE_21_MODEL_KEY = `qwen::${QWEN_IMAGE_21_MODEL_ID}`

export const QWEN_IMAGE_OPTION_SCHEMA: AiOptionSchema = buildMediaOptionSchema('image', {
  allowedKeys: ['negativePrompt', 'seed', 'steps'],
  validators: {
    seed: integerRangeValidator({ min: 0, max: Number.MAX_SAFE_INTEGER }),
    steps: integerRangeValidator({ min: 1, max: 50 }),
  },
})

export const QWEN_CAPABILITY_CATALOG = [{
  modelType: 'image',
  provider: 'qwen',
  modelId: QWEN_IMAGE_21_MODEL_ID,
  capabilities: {
    image: {
      resolutionOptions: ['1K', 'Full HD'],
    },
  },
}] as const

export const QWEN_API_CONFIG_MODELS = [{
  provider: 'qwen',
  modelId: QWEN_IMAGE_21_MODEL_ID,
  name: 'Qwen Image 2.1 (RTX 3090)',
  type: 'image',
}] as const

export const QWEN_PLATFORM_MODELS = [{
  provider: 'qwen',
  modelId: QWEN_IMAGE_21_MODEL_ID,
  name: 'Qwen Image 2.1 (RTX 3090)',
  type: 'image',
}] as const satisfies readonly PlatformModelPreset[]

export const QWEN_PRICING_CATALOG = [{
  apiType: 'image',
  provider: 'qwen',
  modelId: QWEN_IMAGE_21_MODEL_ID,
  cost: { mode: 'flat', unit: 'per_call', flatAmount: 0.001 },
  retail: { mode: 'flat', unit: 'per_call', flatAmount: 0.02 },
}] as const
