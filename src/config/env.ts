// Configuração de ambiente. Tudo aqui é público (vai para o navegador): nunca coloque segredos.
export const env = {
  // Fonte dos dados e do login: "supabase" (banco e Supabase Auth) ou, sem a variável, o modo simulado ("mock").
  FONTE_DADOS: (import.meta.env.VITE_FONTE_DADOS === 'supabase' ? 'supabase' : 'mock') as 'supabase' | 'mock',
  // Projeto do Supabase: a URL e a chave pública (anon). A service_role NUNCA entra aqui nem no repositório.
  SUPABASE_URL: ((import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? '').replace(/\/$/, ''),
  SUPABASE_ANON_KEY: (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) ?? '',
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
