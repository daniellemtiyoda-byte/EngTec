import type { ComponentType } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import type { NomeIcone } from './components/Icone';
import type { Permissao } from './dominio/permissoes';
import Cadastros from './pages/Cadastros';
import ContratoDetalhe from './pages/ContratoDetalhe';
import Inspecao from './pages/Inspecao';
import InspecaoFardo from './pages/InspecaoFardo';
import Documentos from './pages/Documentos';
import Contratos from './pages/Contratos';
import EmConstrucao from './pages/EmConstrucao';
import EtiquetasImpressao from './pages/EtiquetasImpressao';
import FardoDetalhe from './pages/FardoDetalhe';
import FichaDormente from './pages/FichaDormente';
import FornecedorDetalhe from './pages/FornecedorDetalhe';
import LocalDetalhe from './pages/LocalDetalhe';
import RecebimentoDetalhe from './pages/RecebimentoDetalhe';
import Recebimentos from './pages/Recebimentos';
import Simulador from './pages/Simulador';
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
  /** Sem o Layout (menu e topo): folhas de impressão. Continua exigindo sessão e permissão. */
  semLayout?: boolean;
}

/** Tela provisória com o nome do item e a etapa em que ela entra. Some quando a tela de verdade chegar. */
const emConstrucao = (titulo: string, etapa: number): ComponentType => {
  const Tela = () => <EmConstrucao titulo={titulo} etapa={etapa} />;
  Tela.displayName = `EmConstrucao(${titulo})`;
  return Tela;
};

/** Endereço antigo do fardo: leva ao destino do QR. */
function RedirecionaFardo() {
  const { id = '' } = useParams();
  return <Navigate to={`/f/${id}`} replace />;
}

// Leitura das telas de suprimento, entrada, estoque e cadastros.
const OPERACAO: Permissao[] = ['operacao:consultar'];

/**
 * Lista única das telas protegidas: gera as rotas (App.tsx) e o menu lateral (Layout.tsx).
 * Tela nova = uma linha aqui. A ordem dentro de cada grupo é a ordem do menu.
 */
export const ROTAS: Rota[] = [
  { caminho: '/', tela: emConstrucao('Painel', 9), rotulo: 'Painel', icone: 'grid', grupo: 'Início', fim: true },
  { caminho: '/contratos', tela: Contratos, rotulo: 'Contratos', icone: 'contrato', grupo: 'Suprimento', permissoes: OPERACAO },
  { caminho: '/contratos/:numero', tela: ContratoDetalhe, rotulo: 'Contrato', icone: 'contrato', grupo: 'Suprimento', permissoes: OPERACAO, foraDoMenu: true },
  { caminho: '/simulador', tela: Simulador, rotulo: 'Simulador do fornecedor', icone: 'fabrica', grupo: 'Suprimento', permissoes: ['simulador:usar'], demo: true },
  { caminho: '/simulador/etiquetas/:emissao', tela: EtiquetasImpressao, rotulo: 'Etiquetas', icone: 'impressora', grupo: 'Suprimento', permissoes: ['simulador:usar', 'operacao:consultar'], foraDoMenu: true, semLayout: true },
  // NF e DOF primeiro: a entrega nasce no cadastro da NF e da DOF, antes da chegada.
  { caminho: '/documentos', tela: Documentos, rotulo: 'NF e DOF', icone: 'file', grupo: 'Entrada', permissoes: OPERACAO },
  { caminho: '/recebimentos', tela: Recebimentos, rotulo: 'Recebimentos', icone: 'truck', grupo: 'Entrada', permissoes: OPERACAO },
  { caminho: '/recebimentos/:id', tela: RecebimentoDetalhe, rotulo: 'Recebimento', icone: 'truck', grupo: 'Entrada', permissoes: OPERACAO, foraDoMenu: true },
  { caminho: '/inspecao', tela: Inspecao, rotulo: 'Inspeção', icone: 'inspecao', grupo: 'Entrada', permissoes: OPERACAO },
  { caminho: '/inspecao/:fardo', tela: InspecaoFardo, rotulo: 'Inspeção do fardo', icone: 'inspecao', grupo: 'Entrada', permissoes: OPERACAO, foraDoMenu: true },
  // Todos: o requisitante verá só a visão por item (Etapa 7).
  { caminho: '/estoque', tela: emConstrucao('Estoque', 7), rotulo: 'Estoque', icone: 'box', grupo: 'Estoque' },
  { caminho: '/locais', tela: emConstrucao('Locais', 7), rotulo: 'Locais', icone: 'local', grupo: 'Estoque', permissoes: OPERACAO },
  // Destinos dos QR: dormente (todos os usuários logados), fardo e local.
  { caminho: '/d/:id', tela: FichaDormente, rotulo: 'Dormente', icone: 'qr', grupo: 'Estoque', foraDoMenu: true },
  { caminho: '/f/:id', tela: FardoDetalhe, rotulo: 'Fardo', icone: 'box', grupo: 'Estoque', permissoes: OPERACAO, foraDoMenu: true },
  { caminho: '/fardos/:id', tela: RedirecionaFardo, rotulo: 'Fardo', icone: 'box', grupo: 'Estoque', permissoes: OPERACAO, foraDoMenu: true },
  { caminho: '/locais/:codigo', tela: LocalDetalhe, rotulo: 'Local', icone: 'local', grupo: 'Estoque', permissoes: OPERACAO, foraDoMenu: true },
  { caminho: '/movimentacoes', tela: emConstrucao('Movimentações', 7), rotulo: 'Movimentações', icone: 'swap', grupo: 'Estoque', permissoes: OPERACAO },
  { caminho: '/saidas', tela: emConstrucao('Requisições (RME)', 8), rotulo: 'Requisições (RME)', icone: 'pedido', grupo: 'Saída' },
  { caminho: '/cadastros', tela: Cadastros, rotulo: 'Cadastros', icone: 'building', grupo: 'Cadastros', permissoes: OPERACAO },
  { caminho: '/fornecedores/:id', tela: FornecedorDetalhe, rotulo: 'Fornecedor', icone: 'fabrica', grupo: 'Cadastros', permissoes: OPERACAO, foraDoMenu: true },
  { caminho: '/usuarios', tela: emConstrucao('Usuários', 11), rotulo: 'Usuários', icone: 'users', grupo: 'Cadastros', permissoes: ['admin'] },
  { caminho: '/configuracoes', tela: emConstrucao('Configurações', 11), rotulo: 'Configurações', icone: 'gear', grupo: 'Cadastros', permissoes: ['admin'] },
  // Interna: valida os padrões de lista e de objeto com dados fixos.
  { caminho: '/vitrine', tela: Vitrine, rotulo: 'Vitrine', icone: 'layers', grupo: 'Início', permissoes: ['admin'], foraDoMenu: true },
];
