// Configuração de ambiente. Tudo aqui é público (vai para o navegador): nunca coloque segredos.
export const env = {
  API_URL: ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, ''),
  // Só liga com "true" explícito: variável ausente ou com outro valor usa a API real (falha segura).
  USE_MOCK: import.meta.env.VITE_USE_MOCK === 'true',
  LOGO_URL: (import.meta.env.VITE_LOGO_URL as string | undefined) || '/assets/logo.svg',
  UPLOAD_MAX_MB: Number((import.meta.env.VITE_UPLOAD_MAX_MB as string | undefined) ?? 10) || 10,
  // Base do link gravado nos QR (a URL da Vercel, Etapa 4). Vazia: usa o endereço em que o app está aberto.
  APP_URL: ((import.meta.env.VITE_APP_URL as string | undefined) ?? '').replace(/\/$/, ''),
};

/**
 * Endereço que abre o sistema de inspeção (Railway Edge Inspector, app de desktop) com os dados do fardo.
 * Fixo no código, nunca vindo da API. Só funciona onde o Inspector estiver instalado e registrado para este protocolo
 * (pendente na equipe do Inspector: proposta da v1 em docs/arquivo/INTEGRACAO-INSPECAO.md).
 */
export const PROTOCOLO_INSPECTOR = 'railway-inspector://inspecionar';
