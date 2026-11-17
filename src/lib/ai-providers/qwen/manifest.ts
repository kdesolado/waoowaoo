import { defineAiProviderManifest } from '@/lib/ai-providers/manifest'
import { qwenAdapter } from './adapter'
import {
  QWEN_API_CONFIG_MODELS,
  QWEN_CAPABILITY_CATALOG,
  QWEN_PLATFORM_MODELS,
} from './models'

export const qwenProviderManifest = defineAiProviderManifest({
  providerKey: 'qwen',
  adapter: qwenAdapter,
  apiConfig: {
    visibility: 'visible',
    name: 'Local Qwen Image',
    baseUrl: 'http://192.168.1.187:8789',
  },
  platformCredentials: { envPrefix: 'PLATFORM_QWEN', requiresBaseUrl: true },
  catalogs: {
    capabilities: QWEN_CAPABILITY_CATALOG,
    pricing: [],
    apiConfigModels: QWEN_API_CONFIG_MODELS,
    platformModels: QWEN_PLATFORM_MODELS,
  },
})
