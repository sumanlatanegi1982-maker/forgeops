import { defineEnv } from './env'
import { TrueForge } from '@truefoundry/trueforge-sdk'

const env = defineEnv()

export const trueForgeClient = new TrueForge({
  baseUrl: env.TRUEFORGE_BASE_URL,
  timeoutInSeconds: 600,
  ...(env.TRUEFORGE_TOKEN ? { token: env.TRUEFORGE_TOKEN } : {}),
})
