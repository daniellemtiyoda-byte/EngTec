import { dataSP } from '../../dominio/parametros';
import { PERFIS, type Permissao } from '../../dominio/permissoes';
import type { Id, ListQuery, Parametros, SaldoItem, Usuario } from '../../types/models';
import { autenticacao } from '../auth';
import type { Servicos } from '../contracts';
import { ApiError } from '../http';
import {
  alterarAtivo, atualizarContrato, cancelarContrato, criarAta, criarContrato, inativarLocal, reativarLocal, salvarEmpresaInspetora, salvarEspecie, salvarFornecedor, salvarLocal,
  salvarTamanho, salvarTratamento, situacaoFornecedor,
} from './cadastros';
import {
  ataView, contratoView, dofView, emissaoView, entregaView, etiquetasEmissao, fardoDetalhe, fardoView, fichaDormente, fornecedorView, inspecaoFardo, localView, resumoFornecedor, saldoPorItem, tamanhoView,
} from './consultas';
import { criarDados } from './data';
import { cadastrarEntrega, declararDof } from './documentos';
import { achar, falha, type Ctx, type Estado } from './estado';
import { transferirFardo } from './estoque';
import { concluirInspecao, registrarComunicacao, registrarInspecao, registrarRetirada, simularFardo } from './inspecao';
import { alertas, indicadores, pendencias } from './painel';
import { armazenamentoPadrao, carregar, salvar, type Armazenamento } from './persistencia';
import { emitirLaudo, previaRecebimento, receber } from './recebimento';
import { abrirRme, acharRme, cancelarRme, entregarRme, iniciarSeparacao, separarRme, sugerirSeparacao } from './rme';
import { emitir, xmlDaNf } from './simulador';
import { paginar, simularRede } from './util';

export interface OpcoesMock {
  /** Quem está logado (padrão: o login simulado). */
  usuarioAtual?: () => Promise<Usuario | null>;
  /** Relógio (padrão: agora). Os testes fixam a data. */
  agora?: () => Date;
  /** Onde guardar o estado (padrão: localStorage; null = só memória). */
  armazenamento?: Armazenamento | null;
  /** Espera de rede simulada em ms (padrão 250; testes usam 0). */
  atrasoMs?: number;
}

/**
 * Serviços simulados (até a Etapa 9). Regras em um módulo por assunto (cadastros, simulador, documentos,
 * recebimento, inspeção, estoque, rme, painel) e campos calculados em consultas.ts. Aqui só a ligação:
 * sessão e permissões (como as políticas do banco farão), escrita atômica e persistência.
 */
export function criarServicosSimulados(op: OpcoesMock = {}): Servicos {
  const agora = op.agora ?? (() => new Date());
  const armazenamento = op.armazenamento === undefined ? armazenamentoPadrao() : op.armazenamento;
  const usuarioAtual = op.usuarioAtual ?? (() => autenticacao.usuarioAtual());
  const atraso = op.atrasoMs ?? 250;
  const dia = () => dataSP(agora());

  let estado: Estado = carregar(armazenamento) ?? criarDados(agora());
  salvar(armazenamento, estado);

  async function sessao(permissoes?: Permissao[]): Promise<Usuario> {
    await simularRede(atraso);
    const u = await usuarioAtual();
    if (!u) throw new ApiError(401, 'Sessão expirada ou não autenticada. Entre novamente.');
    if (permissoes && !permissoes.some((p) => u.permissoes.includes(p))) throw new ApiError(403, 'Você não tem permissão para executar esta operação.');
    return u;
  }

  /** Leitura: o resultado sai como cópia, para a tela nunca alterar o estado por engano. */
  async function ler<T>(fn: (e: Estado, u: Usuario) => T): Promise<T> {
    const u = await sessao();
    return structuredClone(fn(estado, u));
  }

  /** Escrita atômica: a regra roda numa cópia do estado, que só substitui o original se terminar sem erro. */
  async function escrever<T>(permissoes: Permissao[] | null, fn: (e: Estado, ctx: Ctx, u: Usuario) => T): Promise<T> {
    const u = await sessao(permissoes ?? undefined);
    const copia = structuredClone(estado);
    const r = fn(copia, { agora, quem: u.nome }, u);
    estado = copia;
    salvar(armazenamento, estado);
    return structuredClone(r);
  }

  const exigirDemonstracao = (e: Estado) => { if (!e.parametros.modoDemonstracao) falha(409, 'O modo demonstração está desligado (Configurações).'); };
  const CADASTROS: Permissao[] = ['cadastros:editar'];
  /** Padrão das listas de estoque e de fila: mais antigos primeiro. */
  const maisAntigos = (q: ListQuery = {}): ListQuery => (q.sortBy || q.sort ? q : { ...q, sort: [{ campo: 'recebidoEm', dir: 'asc' }, { campo: 'id', dir: 'asc' }] });
  const maisRecentes = (campo: string) => (q: ListQuery = {}): ListQuery => (q.sortBy || q.sort ? q : { ...q, sort: [{ campo, dir: 'desc' }] });
  const fardosView = (e: Estado) => e.fardos.map((f) => fardoView(e, f, dia()));
  const porCodigoDeLocal = (e: Estado, codigo: string) => {
    const c = codigo.trim().toUpperCase().replace(/^LOC-/, '');
    return achar(e.locais, (l) => l.codigo === c, `Local ${codigo}`);
  };

  return {
    dashboard: {
      indicadores: () => ler((e) => indicadores(e, dia())),
      pendencias: () => ler((e, u) => pendencias(e, u, dia())),
      alertas: () => ler((e) => alertas(e, dia())),
    },

    fornecedores: {
      listar: (q) => ler((e) => paginar(e.fornecedores.map((f) => fornecedorView(f, dia())), q)),
      obter: (id) => ler((e) => fornecedorView(achar(e.fornecedores, (f) => f.id === id, 'Fornecedor'), dia())),
      criar: (d) => escrever(CADASTROS, (e) => fornecedorView(salvarFornecedor(e, d), dia())),
      atualizar: (id, d) => escrever(CADASTROS, (e) => fornecedorView(salvarFornecedor(e, d, id), dia())),
      inativar: (id) => escrever(CADASTROS, (e) => fornecedorView(situacaoFornecedor(e, id, 'inativo'), dia())),
      reativar: (id) => escrever(CADASTROS, (e) => fornecedorView(situacaoFornecedor(e, id, 'ativo'), dia())),
      resumo: (id) => ler((e) => resumoFornecedor(e, id, dia())),
    },
    especies: {
      listar: (q) => ler((e) => paginar(e.especies, q)),
      obter: (id) => ler((e) => achar(e.especies, (x) => x.id === id, 'Espécie')),
      criar: (d) => escrever(CADASTROS, (e) => salvarEspecie(e, d)),
      atualizar: (id, d) => escrever(CADASTROS, (e) => salvarEspecie(e, d, id)),
      inativar: (id) => escrever(CADASTROS, (e) => alterarAtivo(e.especies, id, false, 'Espécie')),
      reativar: (id) => escrever(CADASTROS, (e) => alterarAtivo(e.especies, id, true, 'Espécie')),
    },
    tamanhos: {
      listar: (q) => ler((e) => paginar(e.tamanhos.map(tamanhoView), q)),
      obter: (id) => ler((e) => tamanhoView(achar(e.tamanhos, (x) => x.id === id, 'Tamanho'))),
      criar: (d) => escrever(CADASTROS, (e) => tamanhoView(salvarTamanho(e, d))),
      atualizar: (id, d) => escrever(CADASTROS, (e) => tamanhoView(salvarTamanho(e, d, id))),
      inativar: (id) => escrever(CADASTROS, (e) => tamanhoView(alterarAtivo(e.tamanhos, id, false, 'Tamanho'))),
      reativar: (id) => escrever(CADASTROS, (e) => tamanhoView(alterarAtivo(e.tamanhos, id, true, 'Tamanho'))),
    },
    tratamentos: {
      listar: (q) => ler((e) => paginar(e.tratamentos, q)),
      obter: (id) => ler((e) => achar(e.tratamentos, (x) => x.id === id, 'Tratamento')),
      criar: (d) => escrever(CADASTROS, (e) => salvarTratamento(e, d)),
      atualizar: (id, d) => escrever(CADASTROS, (e) => salvarTratamento(e, d, id)),
      inativar: (id) => escrever(CADASTROS, (e) => alterarAtivo(e.tratamentos, id, false, 'Tratamento')),
      reativar: (id) => escrever(CADASTROS, (e) => alterarAtivo(e.tratamentos, id, true, 'Tratamento')),
    },
    empresasInspetoras: {
      listar: (q) => ler((e) => paginar(e.empresasInspetoras, q)),
      obter: (id) => ler((e) => achar(e.empresasInspetoras, (x) => x.id === id, 'Empresa inspetora')),
      criar: (d) => escrever(CADASTROS, (e) => salvarEmpresaInspetora(e, d)),
      atualizar: (id, d) => escrever(CADASTROS, (e) => salvarEmpresaInspetora(e, d, id)),
      inativar: (id) => escrever(CADASTROS, (e) => alterarAtivo(e.empresasInspetoras, id, false, 'Empresa inspetora')),
      reativar: (id) => escrever(CADASTROS, (e) => alterarAtivo(e.empresasInspetoras, id, true, 'Empresa inspetora')),
    },
    locais: {
      listar: (q) => ler((e) => paginar(e.locais.map((l) => localView(e, l, dia())), q)),
      obter: (id) => ler((e) => localView(e, achar(e.locais, (l) => l.id === id, 'Local'), dia())),
      obterPorCodigo: (codigo) => ler((e) => localView(e, porCodigoDeLocal(e, codigo), dia())),
      criar: (d) => escrever(CADASTROS, (e, ctx) => localView(e, salvarLocal(e, d, ctx), dia())),
      atualizar: (id, d) => escrever(CADASTROS, (e, ctx) => localView(e, salvarLocal(e, d, ctx, id), dia())),
      inativar: (id) => escrever(CADASTROS, (e, ctx) => localView(e, inativarLocal(e, id, ctx), dia())),
      reativar: (id) => escrever(CADASTROS, (e) => localView(e, reativarLocal(e, id), dia())),
    },
    usuarios: {
      listar: (q) => ler((e) => paginar(e.usuarios, q)),
      atualizar: (id, d) => escrever(['admin'], (e) => {
        const u = achar(e.usuarios, (x) => x.id === id, 'Usuário');
        if (d.perfil) { if (!PERFIS[d.perfil]) falha(422, 'Perfil inválido.', { perfil: 'Escolha um perfil.' }); u.perfil = d.perfil; u.permissoes = [...PERFIS[d.perfil].permissoes]; }
        if (d.ativo !== undefined) u.ativo = d.ativo;
        return u;
      }),
    },

    atas: {
      listar: (q) => ler((e) => paginar(e.atas.map((a) => ataView(e, a, dia())), q)),
      criar: (d) => escrever(['contratos:editar'], (e, ctx) => ataView(e, criarAta(e, d, ctx), dia())),
    },
    contratos: {
      listar: (q = {}) => ler((e) => {
        // tamanhoId: contratos com o item; atrasada: com parcela atrasada.
        const { tamanhoId, atrasada, ...filters } = q.filters ?? {};
        const lista = e.contratos.map((c) => contratoView(e, c, dia()))
          .filter((c) => (!tamanhoId || c.itens.some((i) => i.tamanhoId === tamanhoId)) && (atrasada !== 'sim' || c.parcelasAtrasadas > 0));
        return paginar(lista, { ...q, filters });
      }),
      obter: (numero) => ler((e) => contratoView(e, achar(e.contratos, (c) => c.numero === numero.trim().toUpperCase(), `Contrato ${numero}`), dia())),
      criar: (d) => escrever(['contratos:editar'], (e, ctx) => contratoView(e, criarContrato(e, d, ctx), dia())),
      atualizar: (numero, d) => escrever(['contratos:editar'], (e, ctx) => contratoView(e, atualizarContrato(e, numero, d, ctx), dia())),
      cancelar: (numero, motivo) => escrever(['contratos:editar'], (e, ctx) => contratoView(e, cancelarContrato(e, numero, motivo, ctx), dia())),
    },

    simulador: {
      listar: (q) => ler((e) => paginar(e.emissoes.map((x) => emissaoView(e, x)), maisRecentes('criadoEm')(q))),
      emitir: (d) => escrever(['simulador:usar'], (e, ctx) => { exigirDemonstracao(e); return emissaoView(e, emitir(e, d, ctx)); }),
      etiquetas: (id) => ler((e) => etiquetasEmissao(e, id, dia())),
      xmlNf: (id) => ler((e) => xmlDaNf(e, id)),
    },

    documentos: {
      cadastrarEntrega: (d, arquivos) => escrever(['nf:cadastrar'], (e, ctx) => entregaView(e, cadastrarEntrega(e, d, d.origem ?? 'cadastro', ctx, arquivos), dia())),
      listarEntregas: (q = {}) => ler((e) => {
        // etapa = com_ocorrencia é a aba "Com ocorrência" de Recebimentos (as demais são a etapa calculada).
        const { etapa, ...filters } = q.filters ?? {};
        const lista = e.entregas.map((x) => entregaView(e, x, dia())).filter((x) => !etapa || (etapa === 'com_ocorrencia' ? x.comOcorrencia : x.etapa === etapa));
        return paginar(lista, maisRecentes('criadoEm')({ ...q, filters }));
      }),
      listarNfs: (q) => ler((e) => paginar(e.nfs, maisRecentes('emissao')(q))),
      listarDofs: (q) => ler((e) => paginar(e.dofs.map((d) => dofView(e, d, dia())), q?.sortBy || q?.sort ? q : { ...q, sort: [{ campo: 'prazoDeclaracao', dir: 'asc' }] })),
      fardosSemEntrega: (contratoId) => ler((e) => fardosView(e).filter((f) => f.contratoId === contratoId && !f.recebidoEm && !f.entregaId)),
      declararDof: (id) => escrever(['dof:declarar'], (e, ctx) => dofView(e, declararDof(e, id, ctx), dia())),
    },

    recebimentos: {
      listar: (q) => ler((e) => paginar(e.recebimentos, maisRecentes('recebidoEm')(q))),
      obter: (id) => ler((e) => achar(e.recebimentos, (r) => r.id === id, 'Recebimento')),
      entregasACaminho: () => ler((e) => e.entregas.filter((x) => x.situacao !== 'recebida').map((x) => entregaView(e, x, dia()))),
      previa: (entregaId, fardosLidos, faltas) => ler((e) => previaRecebimento(e, entregaId, fardosLidos, faltas)),
      receber: (entregaId, d) => escrever(['recebimento:registrar'], (e, ctx) => receber(e, entregaId, d, ctx)),
      emitirLaudo: (entregaId) => escrever(['inspecao:operar'], (e, ctx) => emitirLaudo(e, entregaId, ctx)),
    },

    inspecao: {
      fila: (q) => ler((e) => paginar(fardosView(e).filter((f) => f.situacao === 'aguardando_inspecao' || f.situacao === 'em_inspecao'), maisAntigos(q))),
      naoLocalizados: (q) => ler((e) => paginar(e.dormentes.filter((d) => d.situacao === 'nao_localizado'), q)),
      obterFardo: (id) => ler((e) => inspecaoFardo(e, id, dia())),
      registrar: (dormenteId, d, fardoId) => escrever(['inspecao:operar'], (e, ctx) => {
        const insp = registrarInspecao(e, dormenteId, d, ctx, fardoId);
        return inspecaoFardo(e, insp.fardoId, dia());
      }),
      simularFardo: (id) => escrever(['inspecao:operar'], (e, ctx) => { exigirDemonstracao(e); simularFardo(e, id, ctx); return inspecaoFardo(e, id, dia()); }),
      concluir: (id, d) => escrever(['inspecao:operar'], (e, ctx) => fardoView(e, concluirInspecao(e, id, d, ctx), dia())),
      reprovados: (q) => ler((e) => paginar(fardosView(e).filter((f) => f.reprovacao && !f.reprovacao.retiradoEm), q?.sortBy || q?.sort ? q : { ...q, sort: [{ campo: 'id', dir: 'asc' }] })),
      registrarComunicacao: (id) => escrever(['inspecao:operar'], (e, ctx) => fardoView(e, registrarComunicacao(e, id, ctx), dia())),
      registrarRetirada: (id) => escrever(['inspecao:operar'], (e, ctx) => fardoView(e, registrarRetirada(e, id, ctx), dia())),
    },

    fardos: {
      listar: (q = {}) => ler((e) => {
        // noLocal: fardos que estão de fato no local (o baixado guarda o último local, mas não está mais lá).
        const { noLocal, ...filters } = q.filters ?? {};
        const lista = fardosView(e).filter((f) => !noLocal || (f.localId === noLocal && f.situacao !== 'baixado'));
        return paginar(lista, maisAntigos({ ...q, filters }));
      }),
      obter: (id) => ler((e) => fardoDetalhe(e, id, dia())),
      transferir: (id, localId) => escrever(['estoque:movimentar'], (e, ctx) => fardoView(e, transferirFardo(e, id, localId, ctx), dia())),
    },

    dormentes: {
      listar: (q) => ler((e) => paginar(e.dormentes, q)),
      obter: (id) => ler((e) => fichaDormente(e, id, dia())),
    },

    estoque: {
      porItem: (q = {}) => ler((e) => {
        // Ordem: uso (via corrente, depois AMV), comprimento e classe. A busca olha o código do tamanho e as espécies.
        const tam = (id: Id) => e.tamanhos.find((x) => x.id === id);
        const nomes = (s: SaldoItem) => [tam(s.tamanhoId)?.codigo ?? '', ...s.especies.map((x) => e.especies.find((y) => y.id === x.especieId)?.nomePopular ?? '')];
        const ordenado = [...saldoPorItem(e, dia())].sort((a, b) => a.uso.localeCompare(b.uso) * -1 || (tam(a.tamanhoId)?.comprimentoCm ?? 0) - (tam(b.tamanhoId)?.comprimentoCm ?? 0) || a.classe - b.classe);
        return paginar(ordenado, q, nomes);
      }),
      porFardo: (q = {}) => ler((e) => {
        // Filtros pelo item do contrato (tamanho) e pelo uso do tamanho; espécie e classe são campos do fardo.
        const { tamanhoId, uso, acimaLimite, ...filters } = q.filters ?? {};
        const tamanhoDe = new Map(e.contratos.flatMap((c) => c.itens).map((i) => [i.id, i.tamanhoId]));
        const lista = fardosView(e).filter((f) => {
          if (f.situacao !== 'em_estoque') return false;
          const t = e.tamanhos.find((x) => x.id === tamanhoDe.get(f.itemContratoId));
          return (!tamanhoId || t?.id === tamanhoId) && (!uso || t?.uso === uso) && (acimaLimite !== 'sim' || f.acimaLimiteDias);
        });
        const busca = (f: (typeof lista)[number]) => [e.especies.find((x) => x.id === f.especieId)?.nomePopular ?? '', e.tamanhos.find((x) => x.id === tamanhoDe.get(f.itemContratoId))?.codigo ?? ''];
        return paginar(lista, maisAntigos({ ...q, filters }), busca);
      }),
    },

    movimentacoes: {
      listar: (q = {}) => ler((e) => {
        const { periodo, localId, ...filters } = q.filters ?? {};
        const desde = periodo ? agora().getTime() - Number(periodo) * 86_400_000 : 0;
        const lista = e.movimentacoes.filter((m) => (!desde || Date.parse(m.quando) >= desde) && (!localId || m.deLocalId === localId || m.paraLocalId === localId));
        return paginar(lista, maisRecentes('quando')({ ...q, filters }));
      }),
    },

    rme: {
      listar: (q) => ler((e) => paginar(e.rmes, maisRecentes('criadoEm')(q))),
      obter: (numero) => ler((e) => acharRme(e, numero)),
      abrir: (d) => escrever(['rme:abrir'], (e, ctx, u) => abrirRme(e, d, u, ctx)),
      iniciarSeparacao: (numero) => escrever(['rme:separar'], (e, ctx) => iniciarSeparacao(e, numero, ctx)),
      sugerirSeparacao: (numero) => ler((e) => sugerirSeparacao(e, numero, { agora, quem: '' })),
      separar: (numero, s) => escrever(['rme:separar'], (e, ctx) => separarRme(e, numero, s, ctx)),
      entregar: (numero) => escrever(['rme:separar'], (e, ctx) => entregarRme(e, numero, ctx)),
      // O almoxarife cancela qualquer RME; o requisitante, só as que abriu.
      cancelar: (numero, motivo) => escrever(['rme:separar', 'rme:abrir'], (e, ctx, u) => {
        if (!u.permissoes.includes('rme:separar') && acharRme(e, numero).solicitanteId !== u.id) falha(403, 'Só quem abriu a RME (ou o almoxarifado) pode cancelá-la.');
        return cancelarRme(e, numero, motivo, ctx);
      }),
    },

    parametros: {
      obter: () => ler((e) => e.parametros),
      atualizar: (d) => escrever(['admin'], (e) => {
        const p: Parametros = { ...e.parametros, ...d, toleranciaVolumePct: e.parametros.toleranciaVolumePct };
        const campos: Record<string, string> = {};
        if (!Number.isInteger(p.limiteDiasEstoque) || p.limiteDiasEstoque <= 0) campos.limiteDiasEstoque = 'Dias inteiros, maior que zero.';
        const [atencao, critico] = p.alertaDofDias;
        if (!Number.isInteger(atencao) || !Number.isInteger(critico) || critico < 0 || atencao < critico) campos.alertaDofDias = 'O alerta de atenção vem antes (ou junto) do crítico.';
        const [l1, l2] = p.limitesCategoria;
        if (!(l2 > 0 && l2 < l1 && l1 <= 100)) campos.limitesCategoria = 'Limites entre 0 e 100, o da categoria 1 maior que o da 2.';
        if (!Number.isInteger(p.dormentesPorFardoPadrao) || p.dormentesPorFardoPadrao < 1 || p.dormentesPorFardoPadrao > 50) campos.dormentesPorFardoPadrao = 'De 1 a 50.';
        p.niveis.forEach((n, i) => { if (!(n.minimo >= 0 && n.maximo >= n.minimo)) campos[`niveis.${i}`] = 'Mínimo de 0 para cima e máximo maior ou igual ao mínimo.'; });
        if (Object.keys(campos).length) falha(422, 'Confira os parâmetros.', campos);
        e.parametros = p;
        return p;
      }),
      reiniciarDemonstracao: async () => {
        await sessao(['admin']);
        estado = criarDados(agora());
        salvar(armazenamento, estado);
      },
    },
  };
}
