import type { ComponentType } from 'react';
import type { NomeIcone } from './components/Icone';
import type { Permissao } from './dominio/permissoes';
import Administracao from './pages/Administracao';
import Cadastros from './pages/Cadastros';
import Configuracoes from './pages/Configuracoes';
import Dashboard from './pages/Dashboard';
import Estoque from './pages/Estoque';
import FardoDetalhe from './pages/FardoDetalhe';
import Inspecao from './pages/Inspecao';
import Inventario from './pages/Inventario';
import LoteDetalhe from './pages/LoteDetalhe';
import Lotes from './pages/Lotes';
import Movimentacoes from './pages/Movimentacoes';
import NotasFiscais from './pages/NotasFiscais';
import Patio from './pages/Patio';
import Recebimento from './pages/Recebimento';
import Relatorios from './pages/Relatorios';
import RmePage from './pages/Rme';
import Saldo from './pages/Saldo';
import VisaoComputacional from './pages/VisaoComputacional';

/** Grupos do menu na ordem do fluxo do dormente (PRD): entrada → estoque → saída → controle. */
export const GRUPOS_MENU = ['Início', 'Entrada', 'Estoque', 'Saída', 'Controle', 'Sistema'] as const;

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
  /** Rota acessível por link, fora do menu (detalhes, telas fora do MVP). */
  foraDoMenu?: boolean;
}

const CADASTROS: Permissao[] = ['admin', 'cadastros:editar', 'nf:cadastrar', 'relatorios:exportar'];

/**
 * Lista única das telas protegidas: gera as rotas (App.tsx) e o menu lateral (Layout.tsx).
 * Tela nova = uma linha aqui. A ordem dentro de cada grupo é a ordem do menu.
 */
export const ROTAS: Rota[] = [
  { caminho: '/', tela: Dashboard, rotulo: 'Painel', icone: 'grid', grupo: 'Início', fim: true },
  { caminho: '/notas', tela: NotasFiscais, rotulo: 'NF e DOF', icone: 'file', grupo: 'Entrada', permissoes: ['nf:cadastrar', 'dof:declarar', 'recebimento:registrar'] },
  { caminho: '/recebimento', tela: Recebimento, rotulo: 'Recebimento', icone: 'truck', grupo: 'Entrada', permissoes: ['recebimento:registrar'] },
  { caminho: '/inspecao', tela: Inspecao, rotulo: 'Inspeção', icone: 'inspecao', grupo: 'Entrada', permissoes: ['inspecao:concluir', 'recebimento:registrar'] },
  { caminho: '/estoque', tela: Estoque, rotulo: 'Estoque', icone: 'box', grupo: 'Estoque' },
  { caminho: '/saldo', tela: Saldo, rotulo: 'Saldo de estoque', icone: 'layers', grupo: 'Estoque' },
  { caminho: '/fardos/:codigo', tela: FardoDetalhe, rotulo: 'Fardo', icone: 'box', grupo: 'Estoque', foraDoMenu: true },
  // A lista de lotes é a visão "Por lote" do Estoque; /lotes só redireciona (links antigos e alertas do servidor).
  { caminho: '/lotes', tela: Lotes, rotulo: 'Lotes', icone: 'layers', grupo: 'Estoque', foraDoMenu: true },
  { caminho: '/lotes/:codigo', tela: LoteDetalhe, rotulo: 'Lote', icone: 'layers', grupo: 'Estoque', foraDoMenu: true },
  { caminho: '/patio', tela: Patio, rotulo: 'Pátio', icone: 'map', grupo: 'Estoque' },
  { caminho: '/inventario', tela: Inventario, rotulo: 'Inventário físico', icone: 'clipboard', grupo: 'Estoque', permissoes: ['inventario:criar', 'movimentacoes:aprovar'] },
  { caminho: '/rme', tela: RmePage, rotulo: 'RME', icone: 'pedido', grupo: 'Saída', permissoes: ['rme:abrir', 'rme:separar', 'rme:conferir'] },
  { caminho: '/movimentacoes', tela: Movimentacoes, rotulo: 'Movimentações', icone: 'swap', grupo: 'Controle', permissoes: ['movimentacoes:registrar', 'movimentacoes:aprovar'] },
  { caminho: '/relatorios', tela: Relatorios, rotulo: 'Relatórios e IBAMA', icone: 'chart', grupo: 'Controle', permissoes: ['relatorios:exportar', 'dof:declarar'] },
  // Espécies, tamanhos, fornecedores e documentos em abas (?aba=).
  { caminho: '/cadastros', tela: Cadastros, rotulo: 'Cadastros', icone: 'building', grupo: 'Sistema', permissoes: CADASTROS },
  { caminho: '/administracao', tela: Administracao, rotulo: 'Usuários e auditoria', icone: 'shield', grupo: 'Sistema', permissoes: ['admin'] },
  { caminho: '/configuracoes', tela: Configuracoes, rotulo: 'Configurações', icone: 'gear', grupo: 'Sistema', permissoes: ['admin'] },
  // Fora do MVP: continua acessível pelo endereço, mas não aparece no menu.
  { caminho: '/visao-computacional', tela: VisaoComputacional, rotulo: 'Visão computacional', icone: 'camera', grupo: 'Controle', permissoes: ['visao:enviar'], foraDoMenu: true },
];
