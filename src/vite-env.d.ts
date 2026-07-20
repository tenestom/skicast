/// <reference types="vite/client" />

/* CSS Module type declarations for TypeScript */
declare module '*.css' {
  const styles: { [className: string]: string };
  export default styles;
}

/* Vite environment variables */
interface ImportMetaEnv {
  readonly VITE_SIGNALING_URL: string;
  readonly VITE_TURN_URL?: string;
  readonly VITE_TURN_USERNAME?: string;
  readonly VITE_TURN_CREDENTIAL?: string;
  readonly DEV: boolean;
  readonly PROD: boolean;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
