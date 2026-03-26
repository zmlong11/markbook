/// <reference types="vite/client" />

import type { MarkbookApi } from "../shared/types";

declare global {
  interface Window {
    markbook: MarkbookApi;
  }
}

export {};
