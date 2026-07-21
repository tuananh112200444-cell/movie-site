/// <reference types="vite/client" />

import 'react';

declare global {
  const __BASE_PATH__: string;
  const __IS_PREVIEW__: boolean;
  const __READDY_PROJECT_ID__: string;
  const __READDY_VERSION_ID__: string;
  const __READDY_AI_DOMAIN__: string;
  const __KP_RELEASE_ID__: string;
}

// Extend React img props to support fetchPriority (HTML spec)
declare module 'react' {
  interface ImgHTMLAttributes<T> {
    fetchPriority?: 'high' | 'low' | 'auto';
  }
}
