import type { ComponentType } from 'react';
import type { NomeIcone } from './components/Icone';
import type { Permissao } from './dominio/permissoes';
import EmConstrucao from './pages/EmConstrucao';

/** Grupos do menu na ordem da jornada do dormente. Os grupos da v2 (seção 3.2 do docs/PLANO-V2.md) entram na Etapa 1. */
export const GRUPOS_MENU = ['Início'] as const;

export interface Rota {
  caminho: string;
  tela: ComponentType;
  rotulo: string;
  icone: NomeIcone;
  grupo: (typeof GRUPOS_MENU)[number];
  /** Marca o item do menu como ativo só no caminho exato (usado na raiz "/"). */
  fim?: boolean;
  /** Basta uma: sem nenhuma, a tela some do menu e mostra "sem permissão". Ausente = todos os usuários. Só UX; o servidor valida. */
  permissoes?: Permissao[];
  /** Rota acessível por link, fora do menu (páginas de objeto). */
  foraDoMenu?: boolean;
}

/**
 * Lista única das telas protegidas: gera as rotas (App.tsx) e o menu lateral (Layout.tsx).
 * Tela nova = uma linha aqui. A ordem dentro de cada grupo é a ordem do menu.
 */
export const ROTAS: Rota[] = [
  { caminho: '/', tela: EmConstrucao, rotulo: 'Painel', icone: 'grid', grupo: 'Início', fim: true },
];
