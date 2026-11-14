import { dataSP } from '../dominio/parametros';
import { PERFIS, type Permissao } from '../dominio/permissoes';
import type { Id, ListQuery, Parametros, SaldoItem, Usuario } from '../types/models';
import type { ArquivosEntrega, Servicos } from './contracts';
import {
  alterarAtivo, atualizarContrato, cancelarContrato, criarAta, criarContrato, inativarLocal, reativarLocal, salvarEmpresaInspetora, salvarEspecie, salvarFornecedor, salvarLocal,
  salvarTamanho, salvarTratamento, situacaoFornecedor,
} from './mock/cadastros';
import {
  ataView, contratoView, dofView, emissaoView, entregaView, etiquetasEmissao, fardoDetalhe, fardoView, fichaDormente, fornecedorView, inspecaoFardo, localView, resumoFornecedor, saldoPorItem, tamanhoView,
} from './mock/consultas';
import { cadastrarEntrega, declararDof } from './mock/documentos';
import { achar, falha, registrar, type Ctx, type Estado } from './mock/estado';
import { transferirFardo } from './mock/estoque';
import { informarSaldoDof, marcarDestinacaoLancada, marcarPerdaComunicada, registrarPerda, saldoPatio } from './mock/ibama';
import { concluirInspecao, registrarComunicacao, registrarInspecao, registrarRetirada, simularFardo } from './mock/inspecao';
import { abrirInventario, analisarInventario, fecharInventario, inventarioPorLocal, lerNoInventario } from './mock/inventario';
import { alertas, indicadores, pendencias } from './mock/painel';
import { emitirLaudo, previaRecebimento, receber } from './mock/recebimento';
import { abrirRme, acharRme, cancelarRme, entregarRme, iniciarSeparacao, separarRme, sugerirSeparacao } from './mock/rme';
import { emitir, xmlDaNf } from './mock/simulador';
import { paginar } from './mock/util';

/**
 * Montagem dos serviços sobre um "motor" de dados. As leituras e os campos calculados são os mesmos para todas as
 * fontes (as consultas de `mock/consultas.ts` sobre o `Estado`); só a escrita muda:
 *   · mock: a regra em TypeScript roda numa cópia do estado (`regra`);
 *   · Supabase: a função do banco de mesmo efeito (`op`: nome e argumentos), que confere a permissão e grava numa transação.
 * As duas devolvem a mesma chave (em geral o id do registro), e `resposta` monta o que a tela recebe a partir do
 * estado já atualizado.
 */
export interface Operacao { nome: string; args: Record<string, unknown> }

export interface Motor {
  /** Relógio (os testes fixam). */
  agora(): Date;
  /** Leitura sobre o estado atual, com a sessão conferida. */
  ler<T>(fn: (e: Estado, u: Usuario) => T): Promise<T>;
  /** Escrita: `permissoes` conferidas antes no mock (no banco, a função confere). */
  escrever<K, T>(permissoes: Permissao[] | null, op: Operacao, regra: (e: Estado, ctx: Ctx, u: Usuario) => K, resposta: (e: Estado, k: K, u: Usuario) => T): Promise<T>;
  /** Arquivos que acompanham uma operação: no Supabase, enviados ao armazenamento antes; devolve o que vai à função. */
  anexos(arquivos: Record<string, File | undefined>, pasta: string): Promise<Record<string, unknown>>;
  reiniciarDemonstracao(): Promise<void>;
}

const op = (nome: string, args: Record<string, unknown> = {}): Operacao => ({ nome, args });

export function montarServicos(m: Motor): Servicos {
  const { ler, escrever } = m;
  const dia = () => dataSP(m.agora());
  const CADASTROS: Permissao[] = ['cadastros:editar'];
  /** Padrão das listas de estoque e de fila: mais antigos primeiro. */
  const maisAntigos = (q: ListQuery = {}): ListQuery => (q.sortBy || q.sort ? q : { ...q, sort: [{ campo: 'recebidoEm', dir: 'asc' }, { campo: 'id', dir: 'asc' }] });
  const maisRecentes = (campo: string) => (q: ListQuery = {}): ListQuery => (q.sortBy || q.sort ? q : { ...q, sort: [{ campo, dir: 'desc' }] });
  const fardosView = (e: Estado) => e.fardos.map((f) => fardoView(e, f, dia()));
  const porCodigoDeLocal = (e: Estado, codigo: string) => {
    const c = codigo.trim().toUpperCase().replace(/^LOC-/, '');
    return achar(e.locais, (l) => l.codigo === c, `Local ${codigo}`);
  };
  const exigirDemonstracao = (e: Estado) => { if (!e.parametros.modoDemonstracao) falha(409, 'O modo demonstração está desligado (Configurações).'); };

  // Respostas montadas a partir do estado atualizado e da chave devolvida.
  const fornecedorDe = (e: Estado, k: Id) => fornecedorView(achar(e.fornecedores, (f) => f.id === k, 'Fornecedor'), dia());
  const daLista = <T extends { id: Id }>(lista: (e: Estado) => T[], oQue: string) => (e: Estado, k: Id) => achar(lista(e), (x) => x.id === k, oQue);
  const tamanhoDe = (e: Estado, k: Id) => tamanhoView(achar(e.tamanhos, (x) => x.id === k, 'Tamanho'));
  const localDe = (e: Estado, k: Id) => localView(e, achar(e.locais, (l) => l.id === k, 'Local'), dia());
  const contratoDe = (e: Estado, k: Id) => contratoView(e, achar(e.contratos, (c) => c.id === k, 'Contrato'), dia());
  const fardoDe = (e: Estado, k: Id) => fardoView(e, achar(e.fardos, (f) => f.id === k, 'Fardo'), dia());
  const rmeDe = (e: Estado, k: Id) => achar(e.rmes, (r) => r.id === k, 'RME');

  /** Cadastro simples (espécie, tamanho, tratamento, empresa inspetora): salvar, inativar e reativar. */
  function cadastro<T extends { id: Id }, V, D>(tabela: string, funcao: string, oQue: string, lista: (e: Estado) => T[], salvar: (e: Estado, d: D, ctx: Ctx, id?: Id) => T, ver: (e: Estado, k: Id) => V) {
    const ativo = (k: Id, valor: boolean) => escrever(CADASTROS, op('alterar_ativo', { p_tabela: tabela, p_id: k, p_ativo: valor }),
      (e, ctx) => alterarAtivo(e, ctx, lista(e) as unknown as { id: Id; ativo: boolean }[], k, valor, oQue).id, ver);
    return {
      criar: (d: D) => escrever(CADASTROS, op(funcao, { p_id: null, p_dados: d }), (e, ctx) => salvar(e, d, ctx).id, ver),
      atualizar: (k: Id, d: Partial<D>) => escrever(CADASTROS, op(funcao, { p_id: k, p_dados: d }), (e, ctx) => salvar(e, d as D, ctx, k).id, ver),
      inativar: (k: Id) => ativo(k, false),
      reativar: (k: Id) => ativo(k, true),
    };
  }

  return {
    dashboard: {
      indicadores: () => ler((e) => indicadores(e, dia())),
      pendencias: () => ler((e, u) => pendencias(e, u, dia())),
      alertas: () => ler((e) => alertas(e, dia())),
    },

    fornecedores: {
      listar: (q) => ler((e) => paginar(e.fornecedores.map((f) => fornecedorView(f, dia())), q)),
      obter: (k) => ler((e) => fornecedorDe(e, k)),
      criar: (d) => escrever(CADASTROS, op('salvar_fornecedor', { p_id: null, p_dados: d }), (e, ctx) => salvarFornecedor(e, d, ctx).id, fornecedorDe),
      atualizar: (k, d) => escrever(CADASTROS, op('salvar_fornecedor', { p_id: k, p_dados: d }), (e, ctx) => salvarFornecedor(e, d, ctx, k).id, fornecedorDe),
      inativar: (k) => escrever(CADASTROS, op('situacao_fornecedor', { p_id: k, p_situacao: 'inativo' }), (e, ctx) => situacaoFornecedor(e, k, 'inativo', ctx).id, fornecedorDe),
      reativar: (k) => escrever(CADASTROS, op('situacao_fornecedor', { p_id: k, p_situacao: 'ativo' }), (e, ctx) => situacaoFornecedor(e, k, 'ativo', ctx).id, fornecedorDe),
      resumo: (k) => ler((e) => resumoFornecedor(e, k, dia())),
    },
    especies: {
      listar: (q) => ler((e) => paginar(e.especies, q)),
      obter: (k) => ler((e) => achar(e.especies, (x) => x.id === k, 'Espécie')),
      ...cadastro('especies', 'salvar_especie', 'Espécie', (e) => e.especies, salvarEspecie, daLista((e) => e.especies, 'Espécie')),
    },
    tamanhos: {
      listar: (q) => ler((e) => paginar(e.tamanhos.map(tamanhoView), q)),
      obter: (k) => ler((e) => tamanhoDe(e, k)),
      ...cadastro('tamanhos', 'salvar_tamanho', 'Tamanho', (e) => e.tamanhos, salvarTamanho, tamanhoDe),
    },
    tratamentos: {
      listar: (q) => ler((e) => paginar(e.tratamentos, q)),
      obter: (k) => ler((e) => achar(e.tratamentos, (x) => x.id === k, 'Tratamento')),
      ...cadastro('tratamentos', 'salvar_tratamento', 'Tratamento', (e) => e.tratamentos, salvarTratamento, daLista((e) => e.tratamentos, 'Tratamento')),
    },
    empresasInspetoras: {
      listar: (q) => ler((e) => paginar(e.empresasInspetoras, q)),
      obter: (k) => ler((e) => achar(e.empresasInspetoras, (x) => x.id === k, 'Empresa inspetora')),
      ...cadastro('empresas_inspetoras', 'salvar_empresa_inspetora', 'Empresa inspetora', (e) => e.empresasInspetoras, salvarEmpresaInspetora, daLista((e) => e.empresasInspetoras, 'Empresa inspetora')),
    },
    locais: {
      listar: (q) => ler((e) => paginar(e.locais.map((l) => localView(e, l, dia())), q)),
      obter: (k) => ler((e) => localDe(e, k)),
      obterPorCodigo: (codigo) => ler((e) => localView(e, porCodigoDeLocal(e, codigo), dia())),
      criar: (d) => escrever(CADASTROS, op('salvar_local', { p_id: null, p_dados: d }), (e, ctx) => salvarLocal(e, d, ctx).id, localDe),
      atualizar: (k, d) => escrever(CADASTROS, op('salvar_local', { p_id: k, p_dados: d }), (e, ctx) => salvarLocal(e, d, ctx, k).id, localDe),
      inativar: (k) => escrever(CADASTROS, op('inativar_local', { p_id: k }), (e, ctx) => inativarLocal(e, k, ctx).id, localDe),
      reativar: (k) => escrever(CADASTROS, op('alterar_ativo', { p_tabela: 'locais', p_id: k, p_ativo: true }), (e, ctx) => reativarLocal(e, k, ctx).id, localDe),
    },
    usuarios: {
      listar: (q) => ler((e) => paginar(e.usuarios, q)),
      atualizar: (k, d) => escrever(['admin'], op('atualizar_usuario', { p_id: k, p_dados: d }), (e, ctx) => {
        const u = achar(e.usuarios, (x) => x.id === k, 'Usuário');
        if (d.perfil) { if (!PERFIS[d.perfil]) falha(422, 'Perfil inválido.', { perfil: 'Escolha um perfil.' }); u.perfil = d.perfil; u.permissoes = [...PERFIS[d.perfil].permissoes]; }
        if (d.ativo !== undefined) u.ativo = d.ativo;
        registrar(e, ctx, 'usuario', u.id, 'alterado', `Usuário ${u.nome}: perfil ${u.perfil}, ${u.ativo ? 'ativo' : 'inativo'}`);
        return u.id;
      }, daLista((e) => e.usuarios, 'Usuário')),
    },

    atas: {
      listar: (q) => ler((e) => paginar(e.atas.map((a) => ataView(e, a, dia())), q)),
      criar: (d) => escrever(['contratos:editar'], op('criar_ata', { p_dados: d }), (e, ctx) => criarAta(e, d, ctx).id, (e, k) => ataView(e, achar(e.atas, (a) => a.id === k, 'Ata'), dia())),
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
      criar: (d) => escrever(['contratos:editar'], op('criar_contrato', { p_dados: d }), (e, ctx) => criarContrato(e, d, ctx).id, contratoDe),
      atualizar: (numero, d) => escrever(['contratos:editar'], op('atualizar_contrato', { p_numero: numero, p_dados: d }), (e, ctx) => atualizarContrato(e, numero, d, ctx).id, contratoDe),
      cancelar: (numero, motivo) => escrever(['contratos:editar'], op('cancelar_contrato', { p_numero: numero, p_motivo: motivo }), (e, ctx) => cancelarContrato(e, numero, motivo, ctx).id, contratoDe),
    },

    simulador: {
      listar: (q) => ler((e) => paginar(e.emissoes.map((x) => emissaoView(e, x)), maisRecentes('criadoEm')(q))),
      emitir: (d) => escrever(['simulador:usar'], op('emitir_fardos', { p_dados: d }), (e, ctx) => { exigirDemonstracao(e); return emitir(e, d, ctx).id; },
        (e, k) => emissaoView(e, achar(e.emissoes, (x) => x.id === k, 'Emissão'))),
      etiquetas: (k) => ler((e) => etiquetasEmissao(e, k, dia())),
      xmlNf: (k) => ler((e) => xmlDaNf(e, k)),
    },

    documentos: {
      cadastrarEntrega: async (d, arquivos?: ArquivosEntrega) => escrever(['nf:cadastrar'],
        op('cadastrar_entrega', { p_dados: d, p_origem: d.origem ?? 'cadastro', p_arquivos: await m.anexos({ ...arquivos }, 'entregas') }),
        (e, ctx) => cadastrarEntrega(e, d, d.origem ?? 'cadastro', ctx, arquivos).id,
        (e, k) => entregaView(e, achar(e.entregas, (x) => x.id === k, 'Entrega'), dia())),
      listarEntregas: (q = {}) => ler((e) => {
        // etapa = com_ocorrencia é a aba "Com ocorrência" de Recebimentos (as demais são a etapa calculada).
        const { etapa, ...filters } = q.filters ?? {};
        const lista = e.entregas.map((x) => entregaView(e, x, dia())).filter((x) => !etapa || (etapa === 'com_ocorrencia' ? x.comOcorrencia : x.etapa === etapa));
        return paginar(lista, maisRecentes('criadoEm')({ ...q, filters }));
      }),
      listarNfs: (q) => ler((e) => paginar(e.nfs, maisRecentes('emissao')(q))),
      listarDofs: (q) => ler((e) => paginar(e.dofs.map((d) => dofView(e, d, dia())), q?.sortBy || q?.sort ? q : { ...q, sort: [{ campo: 'prazoDeclaracao', dir: 'asc' }] })),
      fardosSemEntrega: (contratoId) => ler((e) => fardosView(e).filter((f) => f.contratoId === contratoId && !f.recebidoEm && !f.entregaId)),
      declararDof: (k) => escrever(['dof:declarar'], op('declarar_dof', { p_id: k }), (e, ctx) => declararDof(e, k, ctx).id,
        (e, x) => dofView(e, achar(e.dofs, (d) => d.id === x, 'DOF'), dia())),
    },

    recebimentos: {
      listar: (q) => ler((e) => paginar(e.recebimentos, maisRecentes('recebidoEm')(q))),
      obter: (k) => ler((e) => achar(e.recebimentos, (r) => r.id === k, 'Recebimento')),
      entregasACaminho: () => ler((e) => e.entregas.filter((x) => x.situacao !== 'recebida').map((x) => entregaView(e, x, dia()))),
      previa: (entregaId, fardosLidos, faltas) => ler((e) => previaRecebimento(e, entregaId, fardosLidos, faltas)),
      receber: async (entregaId, d) => {
        // Fotos e canhoto vão antes ao armazenamento; a função do banco recebe só a descrição dos arquivos.
        const fotos = await Promise.all(d.ocorrencias.map((o) => m.anexos(Object.fromEntries(o.fotos.map((f, i) => [String(i), f])), `entregas/${entregaId}`)));
        const canhoto = await m.anexos({ canhoto: d.canhoto }, `entregas/${entregaId}`);
        const dados = { ...d, canhoto: canhoto.canhoto, ocorrencias: d.ocorrencias.map((o, n) => ({ ...o, fotos: Object.values(fotos[n]) })) };
        return escrever(['recebimento:registrar'], op('receber', { p_entrega_id: entregaId, p_dados: dados }), (e, ctx) => receber(e, entregaId, d, ctx).id,
          (e, k) => achar(e.recebimentos, (r) => r.id === k, 'Recebimento'));
      },
      emitirLaudo: (entregaId) => escrever(['inspecao:operar'], op('emitir_laudo', { p_entrega_id: entregaId }), (e, ctx) => emitirLaudo(e, entregaId, ctx).id,
        (e, k) => entregaView(e, achar(e.entregas, (x) => x.id === k, 'Entrega'), dia())),
    },

    inspecao: {
      fila: (q) => ler((e) => paginar(fardosView(e).filter((f) => f.situacao === 'aguardando_inspecao' || f.situacao === 'em_inspecao'), maisAntigos(q))),
      naoLocalizados: (q) => ler((e) => paginar(e.dormentes.filter((d) => d.situacao === 'nao_localizado'), q)),
      obterFardo: (k) => ler((e) => inspecaoFardo(e, k, dia())),
      registrar: (dormenteId, d, fardoId) => escrever(['inspecao:operar'], op('registrar_inspecao', { p_dormente_id: dormenteId, p_dados: d, p_fardo_id: fardoId ?? null }),
        (e, ctx) => registrarInspecao(e, dormenteId, d, ctx, fardoId).fardoId, (e, k) => inspecaoFardo(e, k, dia())),
      simularFardo: (k) => escrever(['inspecao:operar'], op('simular_fardo', { p_fardo_id: k }), (e, ctx) => { exigirDemonstracao(e); simularFardo(e, k, ctx); return k; },
        (e, x) => inspecaoFardo(e, x, dia())),
      concluir: (k, d) => escrever(['inspecao:operar'], op('concluir_inspecao', { p_fardo_id: k, p_dados: d }), (e, ctx) => concluirInspecao(e, k, d, ctx).id, fardoDe),
      reprovados: (q) => ler((e) => paginar(fardosView(e).filter((f) => f.reprovacao && !f.reprovacao.retiradoEm), q?.sortBy || q?.sort ? q : { ...q, sort: [{ campo: 'id', dir: 'asc' }] })),
      registrarComunicacao: (k) => escrever(['inspecao:operar'], op('registrar_comunicacao', { p_fardo_id: k }), (e, ctx) => registrarComunicacao(e, k, ctx).id, fardoDe),
      registrarRetirada: (k) => escrever(['inspecao:operar'], op('registrar_retirada', { p_fardo_id: k }), (e, ctx) => registrarRetirada(e, k, ctx).id, fardoDe),
    },

    fardos: {
      listar: (q = {}) => ler((e) => {
        // noLocal: fardos que estão de fato no local (o baixado guarda o último local, mas não está mais lá).
        const { noLocal, ...filters } = q.filters ?? {};
        const lista = fardosView(e).filter((f) => !noLocal || (f.localId === noLocal && f.situacao !== 'baixado'));
        return paginar(lista, maisAntigos({ ...q, filters }));
      }),
      obter: (k) => ler((e) => fardoDetalhe(e, k, dia())),
      transferir: (k, localId) => escrever(['estoque:movimentar'], op('transferir_fardo', { p_fardo_id: k, p_local_id: localId }), (e, ctx) => transferirFardo(e, k, localId, ctx).id, fardoDe),
    },

    dormentes: {
      listar: (q) => ler((e) => paginar(e.dormentes, q)),
      obter: (k) => ler((e) => fichaDormente(e, k, dia())),
    },

    estoque: {
      porItem: (q = {}) => ler((e) => {
        // Ordem: uso (via corrente, depois AMV), comprimento e classe. A busca olha o código do tamanho e as espécies.
        const tam = (k: Id) => e.tamanhos.find((x) => x.id === k);
        const nomes = (s: SaldoItem) => [tam(s.tamanhoId)?.codigo ?? '', ...s.especies.map((x) => e.especies.find((y) => y.id === x.especieId)?.nomePopular ?? '')];
        const ordenado = [...saldoPorItem(e, dia())].sort((a, b) => a.uso.localeCompare(b.uso) * -1 || (tam(a.tamanhoId)?.comprimentoCm ?? 0) - (tam(b.tamanhoId)?.comprimentoCm ?? 0) || a.classe - b.classe);
        return paginar(ordenado, q, nomes);
      }),
      porFardo: (q = {}) => ler((e) => {
        // Filtros pelo item do contrato (tamanho) e pelo uso do tamanho; espécie e classe são campos do fardo.
        const { tamanhoId, uso, acimaLimite, ...filters } = q.filters ?? {};
        const doItem = new Map(e.contratos.flatMap((c) => c.itens).map((i) => [i.id, i.tamanhoId]));
        const lista = fardosView(e).filter((f) => {
          if (f.situacao !== 'em_estoque') return false;
          const t = e.tamanhos.find((x) => x.id === doItem.get(f.itemContratoId));
          return (!tamanhoId || t?.id === tamanhoId) && (!uso || t?.uso === uso) && (acimaLimite !== 'sim' || f.acimaLimiteDias);
        });
        const busca = (f: (typeof lista)[number]) => [e.especies.find((x) => x.id === f.especieId)?.nomePopular ?? '', e.tamanhos.find((x) => x.id === doItem.get(f.itemContratoId))?.codigo ?? ''];
        return paginar(lista, maisAntigos({ ...q, filters }), busca);
      }),
    },

    eventos: {
      listar: (q = {}) => ler((e) => paginar(e.eventos, q.sortBy || q.sort ? q : { ...q, sort: [{ campo: 'quando', dir: 'desc' }, { campo: 'id', dir: 'desc' }] })),
    },

    movimentacoes: {
      listar: (q = {}) => ler((e) => {
        const { periodo, localId, ...filters } = q.filters ?? {};
        const desde = periodo ? m.agora().getTime() - Number(periodo) * 86_400_000 : 0;
        const lista = e.movimentacoes.filter((x) => (!desde || Date.parse(x.quando) >= desde) && (!localId || x.deLocalId === localId || x.paraLocalId === localId));
        return paginar(lista, maisRecentes('quando')({ ...q, filters }));
      }),
    },

    rme: {
      listar: (q) => ler((e) => paginar(e.rmes, maisRecentes('criadoEm')(q))),
      obter: (numero) => ler((e) => acharRme(e, numero)),
      abrir: (d) => escrever(['rme:abrir'], op('abrir_rme', { p_dados: d }), (e, ctx, u) => abrirRme(e, d, u, ctx).id, rmeDe),
      iniciarSeparacao: (numero) => escrever(['rme:separar'], op('iniciar_separacao', { p_numero: numero }), (e, ctx) => iniciarSeparacao(e, numero, ctx).id, rmeDe),
      sugerirSeparacao: (numero) => ler((e) => sugerirSeparacao(e, numero, { agora: m.agora, quem: '' })),
      separar: (numero, s) => escrever(['rme:separar'], op('separar_rme', { p_numero: numero, p_separacao: s }), (e, ctx) => separarRme(e, numero, s, ctx).id, rmeDe),
      entregar: (numero) => escrever(['rme:separar'], op('entregar_rme', { p_numero: numero }), (e, ctx) => entregarRme(e, numero, ctx).id, rmeDe),
      // O almoxarife cancela qualquer RME; o requisitante, só as que abriu.
      cancelar: (numero, motivo) => escrever(['rme:separar', 'rme:abrir'], op('cancelar_rme', { p_numero: numero, p_motivo: motivo }), (e, ctx, u) => {
        if (!u.permissoes.includes('rme:separar') && acharRme(e, numero).solicitanteId !== u.id) falha(403, 'Só quem abriu a RME (ou o almoxarifado) pode cancelá-la.');
        return cancelarRme(e, numero, motivo, ctx).id;
      }, rmeDe),
    },

    inventarios: {
      listar: (q) => ler((e) => paginar(e.inventarios, maisRecentes('abertoEm')(q))),
      obter: (k) => ler((e) => achar(e.inventarios, (i) => i.id === k || i.numero === k, 'Inventário')),
      abrir: (locaisIds) => escrever(['estoque:movimentar'], op('abrir_inventario', { p_locais: locaisIds }), (e, ctx) => abrirInventario(e, locaisIds, ctx).id,
        daLista((e) => e.inventarios, 'Inventário')),
      ler: (k, leitura) => escrever(['estoque:movimentar'], op('ler_inventario', { p_id: k, p_tipo: leitura.tipo, p_item: leitura.id, p_local: leitura.localId }),
        (e, ctx) => lerNoInventario(e, k, leitura, ctx), (_e, r) => r),
      previa: (k) => ler((e) => analisarInventario(e, achar(e.inventarios, (i) => i.id === k, 'Inventário'))),
      fechar: (k, justificativas) => escrever(['estoque:movimentar'], op('fechar_inventario', { p_id: k, p_justificativas: justificativas }),
        (e, ctx) => fecharInventario(e, k, justificativas, ctx).id, daLista((e) => e.inventarios, 'Inventário')),
    },

    ibama: {
      destinacoes: (q = {}) => ler((e) => {
        const { lancado, de, ate, ...filters } = q.filters ?? {};
        const lista = e.destinacoes.filter((d) => (!lancado || (lancado === 'sim') === !!d.lancadoEm) && (!de || d.entregueEm.slice(0, 10) >= de) && (!ate || d.entregueEm.slice(0, 10) <= ate));
        return paginar(lista, maisRecentes('entregueEm')({ ...q, filters }));
      }),
      marcarLancado: (k) => escrever(['dof:declarar'], op('marcar_destinacao_lancada', { p_id: k }), (e, ctx) => marcarDestinacaoLancada(e, k, ctx).id, daLista((e) => e.destinacoes, 'Destinação final')),
      saldosInformados: (q = {}) => ler((e) => paginar(e.saldosDof, q.sortBy || q.sort ? q : { ...q, sort: [{ campo: 'data', dir: 'desc' }, { campo: 'quando', dir: 'desc' }] })),
      informarSaldo: (d) => escrever(['dof:declarar'], op('informar_saldo_dof', { p_dados: d }), (e, ctx) => informarSaldoDof(e, d, ctx).id, daLista((e) => e.saldosDof, 'Saldo informado')),
      saldoPatio: () => ler((e) => saldoPatio(e)),
      registrarPerda: (k, d) => escrever(['painel:gestao'], op('registrar_perda', { p_dormente_id: k, p_dados: d }), (e, ctx) => registrarPerda(e, k, d, ctx).id, daLista((e) => e.perdas, 'Perda')),
      perdas: (q = {}) => ler((e) => {
        const { comunicado, de, ate, ...filters } = q.filters ?? {};
        const lista = e.perdas.filter((p) => (!comunicado || (comunicado === 'sim') === !!p.comunicadoEm) && (!de || p.quando.slice(0, 10) >= de) && (!ate || p.quando.slice(0, 10) <= ate));
        return paginar(lista, maisRecentes('quando')({ ...q, filters }));
      }),
      inventarioPorLocal: () => ler((e) => inventarioPorLocal(e)),
      marcarPerdaComunicada: (k) => escrever(['painel:gestao', 'dof:declarar'], op('marcar_perda_comunicada', { p_id: k }), (e, ctx) => marcarPerdaComunicada(e, k, ctx).id, daLista((e) => e.perdas, 'Perda')),
    },

    parametros: {
      obter: () => ler((e) => e.parametros),
      atualizar: (d) => escrever(['admin'], op('atualizar_parametros', { p_dados: d }), (e, ctx) => {
        const p: Parametros = { ...e.parametros, ...d, toleranciaVolumePct: e.parametros.toleranciaVolumePct };
        const campos: Record<string, string> = {};
        if (!Number.isInteger(p.limiteDiasEstoque) || p.limiteDiasEstoque <= 0) campos.limiteDiasEstoque = 'Dias inteiros, maior que zero.';
        const [atencao, critico] = p.alertaDofDias;
        if (!Number.isInteger(atencao) || !Number.isInteger(critico) || critico < 0 || atencao < critico) campos.alertaDofDias = 'O alerta de atenção vem antes (ou junto) do crítico.';
        const [l1, l2] = p.limitesCategoria;
        if (!(l2 > 0 && l2 < l1 && l1 <= 100)) campos.limitesCategoria = 'Limites entre 0 e 100, o da categoria A maior que o da B.';
        if (!Number.isInteger(p.dormentesPorFardoPadrao) || p.dormentesPorFardoPadrao < 1 || p.dormentesPorFardoPadrao > 50) campos.dormentesPorFardoPadrao = 'De 1 a 50.';
        p.niveis.forEach((n, i) => { if (!(n.minimo >= 0 && n.maximo >= n.minimo)) campos[`niveis.${i}`] = 'Mínimo de 0 para cima e máximo maior ou igual ao mínimo.'; });
        if (Object.keys(campos).length) falha(422, 'Confira os parâmetros.', campos);
        e.parametros = p;
        registrar(e, ctx, 'parametros', 'parametros', 'alterado', `Parâmetros alterados: ${Object.keys(d).join(', ')}`);
        return 'parametros';
      }, (e) => e.parametros),
      reiniciarDemonstracao: () => m.reiniciarDemonstracao(),
    },
  };
}
