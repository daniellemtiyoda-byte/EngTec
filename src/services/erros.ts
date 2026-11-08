/** Erro padronizado de todas as fontes de dados: a mensagem já é segura para exibir (sem stack trace nem detalhes internos). */
export class ApiError extends Error {
  status: number;
  detalhes?: Record<string, string>;
  constructor(status: number, message: string, detalhes?: Record<string, string>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.detalhes = detalhes;
  }
}

export function mensagemSegura(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return 'Não foi possível concluir a operação. Tente novamente.';
}

/** Sessão expirada no meio do uso: o AuthContext escuta e volta ao login. */
export function avisarSessaoExpirada() {
  if (typeof window !== 'undefined') window.dispatchEvent(new Event('sgd:nao-autenticado'));
}
