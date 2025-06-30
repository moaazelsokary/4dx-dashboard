/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SHAREPOINT_CLIENT_ID: string
  readonly VITE_SHAREPOINT_CLIENT_SECRET: string
  readonly VITE_SHAREPOINT_TENANT_ID: string
  readonly VITE_SHAREPOINT_SITE_NAME: string
  readonly VITE_DEPARTMENT_FILES: string
  readonly VITE_API_BASE_URL: string
  readonly VITE_TOKEN_URL: string
  readonly VITE_DATA_REFRESH_INTERVAL: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
