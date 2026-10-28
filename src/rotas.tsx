import type { ComponentType } from 'react';
import type { NomeIcone } from './components/Icone';
import Administracao from './pages/Administracao';
import Configuracoes from './pages/Configuracoes';
import Dashboard from './pages/Dashboard';
import Especies from './pages/Especies';
import Estoque from './pages/Estoque';
import Fornecedores from './pages/Fornecedores';
import Inventario from './pages/Inventario';
import Lotes from './pages/Lotes';
import Movimentacoes from './pages/Movimentacoes';
import NotasFiscais from './pages/NotasFiscais';
import Patio from './pages/Patio';
import Recebimento from './pages/Recebimento';
import Relatorios from './pages/Relatorios';
import RmePage from './pages/Rme';
import Tamanhos from './pages/Tamanhos';
import VisaoComputacional from './pages/VisaoComputacional';
import Volumetria from './pages/Volumetria';

export const GRUPOS_MENU = ['Visão geral', 'Operação', 'Cadastros e controle', 'Sistema'] as const;

export interface Rota {
  caminho: string;
  tela: ComponentType;
  rotulo: string;
  icone: NomeIcone;
  grupo: (typeof GRUPOS_MENU)[number];
  /** Marca o item do menu como ativo só no caminho exato (usado na raiz "/"). */
  fim?: boolean;
}

/**
 * Lista única das telas protegidas: gera as rotas (App.tsx) e o menu lateral (Layout.tsx).
 * Tela nova = uma linha aqui. A ordem dentro de cada grupo é a ordem do menu.
 */
export const ROTAS: Rota[] = [
  { caminho: '/', tela: Dashboard, rotulo: 'Dashboard', icone: 'grid', grupo: 'Visão geral', fim: true },
  { caminho: '/notas', tela: NotasFiscais, rotulo: 'NF e DOF', icone: 'file', grupo: 'Operação' },
  { caminho: '/recebimento', tela: Recebimento, rotulo: 'Recebimento', icone: 'truck', grupo: 'Operação' },
  { caminho: '/lotes', tela: Lotes, rotulo: 'Lotes', icone: 'layers', grupo: 'Operação' },
  { caminho: '/estoque', tela: Estoque, rotulo: 'Estoque', icone: 'box', grupo: 'Operação' },
  { caminho: '/rme', tela: RmePage, rotulo: 'RME', icone: 'pedido', grupo: 'Operação' },
  { caminho: '/movimentacoes', tela: Movimentacoes, rotulo: 'Movimentações', icone: 'swap', grupo: 'Operação' },
  { caminho: '/patio', tela: Patio, rotulo: 'Pátio', icone: 'map', grupo: 'Operação' },
  { caminho: '/inventario', tela: Inventario, rotulo: 'Inventário físico', icone: 'clipboard', grupo: 'Operação' },
  { caminho: '/visao-computacional', tela: VisaoComputacional, rotulo: 'Visão computacional', icone: 'camera', grupo: 'Operação' },
  { caminho: '/fornecedores', tela: Fornecedores, rotulo: 'Fornecedores', icone: 'building', grupo: 'Cadastros e controle' },
  { caminho: '/especies', tela: Especies, rotulo: 'Espécies', icone: 'leaf', grupo: 'Cadastros e controle' },
  { caminho: '/tamanhos', tela: Tamanhos, rotulo: 'Tamanhos', icone: 'medida', grupo: 'Cadastros e controle' },
  { caminho: '/volumetria', tela: Volumetria, rotulo: 'Controle volumétrico', icone: 'ruler', grupo: 'Cadastros e controle' },
  { caminho: '/relatorios', tela: Relatorios, rotulo: 'Relatórios', icone: 'chart', grupo: 'Cadastros e controle' },
  { caminho: '/administracao', tela: Administracao, rotulo: 'Usuários e auditoria', icone: 'shield', grupo: 'Sistema' },
  { caminho: '/configuracoes', tela: Configuracoes, rotulo: 'Configurações', icone: 'gear', grupo: 'Sistema' },
];
