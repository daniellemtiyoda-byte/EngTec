import type { ReactNode } from 'react';
import type { StatusEstoque, StatusRegistro } from '../types/models';

export type Tom = 'verde' | 'laranja' | 'vermelho' | 'azul' | 'cinza' | 'simulado';

export function Badge({ tom, children }: { tom: Tom; children: ReactNode }) {
  return <span className={`badge badge-${tom}`}>{children}</span>;
}

const REG: Record<StatusRegistro, [Tom, string]> = {
  aprovado: ['verde', 'Aprovado'], pendente: ['laranja', 'Pendente'], bloqueado: ['vermelho', 'Bloqueado'], simulado: ['simulado', 'Simulado'],
};
export const StatusRegistroBadge = ({ s }: { s: StatusRegistro }) => <Badge tom={REG[s][0]}>{REG[s][1]}</Badge>;

const EST: Record<StatusEstoque, [Tom, string]> = {
  disponivel: ['verde', 'Disponível'], bloqueado: ['cinza', 'Bloqueado'], em_analise: ['azul', 'Em análise'], divergente: ['vermelho', 'Com divergência'],
};
export const StatusEstoqueBadge = ({ s }: { s: StatusEstoque }) => <Badge tom={EST[s][0]}>{EST[s][1]}</Badge>;
