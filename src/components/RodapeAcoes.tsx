import type { ReactNode } from 'react';

/**
 * Ações das telas de campo (seção 11.1 do plano): no celular, fixas no rodapé, ao alcance do polegar, com alvos de 48 px;
 * no computador, alinhadas à direita no fim do conteúdo. `fixo={false}` mantém no fluxo (ex. na vitrine).
 */
export function RodapeAcoes({ children, fixo = true }: { children: ReactNode; fixo?: boolean }) {
  return <div className={`rodape-acoes${fixo ? ' rodape-fixo' : ''}`}>{children}</div>;
}
