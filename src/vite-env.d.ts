/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Stadia Maps API key for the basemap tiles. Unset in local dev (Stadia
   *  serves keyless from localhost); required in production, domain-restricted
   *  to the deployed host. */
  readonly VITE_STADIA_API_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
