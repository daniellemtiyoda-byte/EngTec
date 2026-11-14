import type { Permissao } from '../dominio/permissoes';
import type { CartaoPainel } from '../types/models';
import type { Servicos } from './contracts';

/**
 * Cartões do Painel (seção 9.2 do plano). Cada valor vem da MESMA consulta da lista que o link abre (mesmo serviço,
 * mesmo filtro, o `total`), então o número do cartão e o da lista não se separam. Quem não tem nenhuma das permissões
 * de um cartão não o recebe. Cartão que só mostra um total sem lista própria (Em estoque) vem dos indicadores.
 */
export async function cartoesDoPainel(s: Servicos, permissoes: Permissao[]): Promise<CartaoPainel[]> {
  const pode = (...ps: Permissao[]) => ps.some((p) => permissoes.includes(p));
  const G: Permissao = 'painel:gestao';
  const um = { pageSize: 1 };
  const total = (p: Promise<{ total: number }>) => p.then((r) => r.total);
  const ind = pode('operacao:consultar') ? await s.dashboard.indicadores() : undefined;
  if (!ind) return [];

  const defs: { quem: Permissao[]; calcular: () => Promise<CartaoPainel> }[] = [
    { quem: ['operacao:consultar'], calcular: async () => ({ id: 'em-estoque', rotulo: 'Dormentes em estoque', valor: ind.emEstoque, detalhe: 'inclui os em cura; a soma das colunas do saldo por item', tom: 'azul', link: '/estoque' }) },
    { quem: ['inspecao:operar', G], calcular: async () => ({ id: 'inspecionar', rotulo: 'Fardos a inspecionar', valor: await total(s.inspecao.fila(um)), detalhe: `${ind.aguardandoInspecao} dormentes aguardando`, tom: 'azul', link: '/inspecao' }) },
    { quem: [G], calcular: async () => ({ id: 'falta', rotulo: 'Itens abaixo do mínimo', valor: await total(s.estoque.porItem({ ...um, filters: { situacao: 'falta' } })), tom: 'vermelho', link: '/estoque?situacao=falta' }) },
    { quem: [G], calcular: async () => ({ id: 'excesso', rotulo: 'Itens acima do máximo', valor: await total(s.estoque.porItem({ ...um, filters: { situacao: 'excesso' } })), tom: 'laranja', link: '/estoque?situacao=excesso' }) },
    { quem: [G], calcular: async () => ({ id: 'parados', rotulo: 'Fardos acima do limite de dias', valor: await total(s.estoque.porFardo({ ...um, filters: { acimaLimite: 'sim' } })), tom: 'laranja', link: '/estoque?visao=fardo&acimaLimite=sim' }) },
    { quem: ['dof:declarar', G], calcular: async () => ({ id: 'dofs', rotulo: 'DOFs a declarar', valor: await total(s.documentos.listarDofs({ ...um, filters: { situacaoDeclaracao: 'a_declarar' } })), tom: 'laranja', link: '/documentos?aba=dofs' }) },
    { quem: ['rme:separar', G], calcular: async () => ({ id: 'rmes-abertas', rotulo: 'RMEs abertas', valor: await total(s.rme.listar({ ...um, filters: { situacao: 'aberta' } })), tom: 'azul', link: '/saidas' }) },
    { quem: ['rme:separar', G], calcular: async () => ({ id: 'rmes-em-separacao', rotulo: 'RMEs em separação', valor: await total(s.rme.listar({ ...um, filters: { situacao: 'em_separacao' } })), tom: 'azul', link: '/saidas?situacao=em_separacao' }) },
    { quem: [G], calcular: async () => ({ id: 'atrasadas', rotulo: 'Contratos com parcela atrasada', valor: await total(s.contratos.listar({ ...um, filters: { situacao: 'vigente', atrasada: 'sim' } })), detalhe: `${ind.parcelasAtrasadas} parcela(s) atrasada(s)`, tom: 'vermelho', link: '/contratos?atrasada=sim' }) },
    { quem: ['inspecao:operar', G], calcular: async () => ({ id: 'laudos', rotulo: 'Laudos perto do prazo ou vencidos', valor: await total(s.documentos.listarEntregas({ ...um, filters: { etapa: 'aguardando_laudo', laudo: 'a_vencer' } })), tom: 'laranja', link: '/recebimentos?etapa=aguardando_laudo&laudo=a_vencer' }) },
    { quem: ['inspecao:operar', G], calcular: async () => ({ id: 'reprovados', rotulo: 'Fardos com reprovados a retirar', valor: await total(s.inspecao.reprovados(um)), detalhe: `${ind.reprovadosAguardandoRetirada} dormentes reprovados`, tom: 'laranja', link: '/inspecao?aba=reprovados' }) },
    { quem: [G], calcular: async () => ({ id: 'nao-localizados', rotulo: 'Dormentes não localizados', valor: await total(s.inspecao.naoLocalizados(um)), tom: 'vermelho', link: '/inspecao?aba=nao_localizados' }) },
  ];
  return Promise.all(defs.filter((d) => pode(...d.quem)).map((d) => d.calcular()));
}
