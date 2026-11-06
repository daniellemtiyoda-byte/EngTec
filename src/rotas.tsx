import type { ComponentType } from 'react';
import type { NomeIcone } from './components/Icone';
import type { Permissao } from './dominio/permissoes';
import EmConstrucao from './pages/EmConstrucao';
import Vitrine from './pages/Vitrine';

/** Grupos do menu na ordem da jornada do dormente (seção 3.2 do docs/PLANO-V2.md). */
export const GRUPOS_MENU = ['Início', 'Suprimento', 'Entrada', 'Estoque', 'Saída', 'Cadastros'] as const;

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
  /** Rota acessível por link, fora do menu (páginas de objeto, vitrine). */
  foraDoMenu?: boolean;
  /** Selo "Demo" ao lado do item do menu (Simulador do fornecedor). */
  demo?: boolean;
}

/** Tela provisória com o nome do item e a etapa em que ela entra. Some quando a tela de verdade chegar. */
const emConstrucao = (titulo: string, etapa: number): ComponentType => {
  const Tela = () => <EmConstrucao titulo={titulo} etapa={etapa} />;
  Tela.displayName = `EmConstrucao(${titulo})`;
  return Tela;
};

// Leitura das telas de suprimento, entrada, estoque e cadastros.
const OPERACAO: Permissao[] = ['operacao:consultar'];

/**
 * Lista única das telas protegidas: gera as rotas (App.tsx) e o menu lateral (Layout.tsx).
 * Tela nova = uma linha aqui. A ordem dentro de cada grupo é a ordem do menu.
 */
export const ROTAS: Rota[] = [
  { caminho: '/', tela: emConstrucao('Painel', 9), rotulo: 'Painel', icone: 'grid', grupo: 'Início', fim: true },
  { caminho: '/contratos', tela: emConstrucao('Contratos', 3), rotulo: 'Contratos', icone: 'contrato', grupo: 'Suprimento', permissoes: OPERACAO },
  { caminho: '/simulador', tela: emConstrucao('Simulador do fornecedor', 4), rotulo: 'Simulador do fornecedor', icone: 'fabrica', grupo: 'Suprimento', permissoes: ['simulador:usar'], demo: true },
  // NF e DOF primeiro: a entrega nasce no cadastro da NF e da DOF, antes da chegada.
  { caminho: '/documentos', tela: emConstrucao('NF e DOF', 5), rotulo: 'NF e DOF', icone: 'file', grupo: 'Entrada', permissoes: OPERACAO },
  { caminho: '/recebimentos', tela: emConstrucao('Recebimentos', 5), rotulo: 'Recebimentos', icone: 'truck', grupo: 'Entrada', permissoes: OPERACAO },
  { caminho: '/inspecao', tela: emConstrucao('Inspeção', 6), rotulo: 'Inspeção', icone: 'inspecao', grupo: 'Entrada', permissoes: OPERACAO },
  // Todos: o requisitante verá só a visão por item (Etapa 7).
  { caminho: '/estoque', tela: emConstrucao('Estoque', 7), rotulo: 'Estoque', icone: 'box', grupo: 'Estoque' },
  { caminho: '/locais', tela: emConstrucao('Locais', 7), rotulo: 'Locais', icone: 'local', grupo: 'Estoque', permissoes: OPERACAO },
  { caminho: '/movimentacoes', tela: emConstrucao('Movimentações', 7), rotulo: 'Movimentações', icone: 'swap', grupo: 'Estoque', permissoes: OPERACAO },
  { caminho: '/saidas', tela: emConstrucao('Requisições (RME)', 8), rotulo: 'Requisições (RME)', icone: 'pedido', grupo: 'Saída' },
  { caminho: '/cadastros', tela: emConstrucao('Cadastros', 3), rotulo: 'Cadastros', icone: 'building', grupo: 'Cadastros', permissoes: OPERACAO },
  { caminho: '/usuarios', tela: emConstrucao('Usuários', 11), rotulo: 'Usuários', icone: 'users', grupo: 'Cadastros', permissoes: ['admin'] },
  { caminho: '/configuracoes', tela: emConstrucao('Configurações', 11), rotulo: 'Configurações', icone: 'gear', grupo: 'Cadastros', permissoes: ['admin'] },
  // Interna: valida os padrões de lista e de objeto com dados fixos.
  { caminho: '/vitrine', tela: Vitrine, rotulo: 'Vitrine', icone: 'layers', grupo: 'Início', permissoes: ['admin'], foraDoMenu: true },
];
