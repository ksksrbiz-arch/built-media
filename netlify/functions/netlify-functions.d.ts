declare module '@netlify/functions' {
  export interface Config {
    path?: string | string[];
  }

  export interface Context {
    params?: Record<string, string | undefined>;
    requestId?: string;
  }
}
