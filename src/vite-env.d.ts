/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_TRUEFORGE_BASE_URL: string
  readonly VITE_TRUEFORGE_TOKEN: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
