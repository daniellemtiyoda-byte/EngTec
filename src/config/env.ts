// Configuração de ambiente. Tudo aqui é público (vai para o navegador): nunca coloque segredos.
export const env = {
  API_URL: ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, ''),
  // Só liga com "true" explícito: variável ausente ou com outro valor usa a API real (falha segura).
  USE_MOCK: import.meta.env.VITE_USE_MOCK === 'true',
  LOGO_URL: (import.meta.env.VITE_LOGO_URL as string | undefined) || '/assets/logo.svg',
  UPLOAD_MAX_MB: Number((import.meta.env.VITE_UPLOAD_MAX_MB as string | undefined) ?? 10) || 10,
};

export const SUFIXO_SIMULADO = env.USE_MOCK ? ' (modo simulado: nada foi gravado em servidor)' : '';
