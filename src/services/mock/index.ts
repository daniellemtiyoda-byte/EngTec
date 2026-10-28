import type { Servicos } from '../contracts';
import { TOLERANCIA_VOLUME_PCT } from '../../dominio/parametros';
import type {
  DofPendente, Indicadores, ItemNf, LinhaSaldoIbama, Lote, Movimentacao, NotaFiscal, NovoTamanho, ProcessamentoImagem, SessaoInventario, Tamanho,
  TipoMovimentacao, Usuario,
} from '../../types/models';
import { data, pct, rotuloClasse } from '../../utils/format';
import { chaveAcessoValida } from '../../utils/nfeXml';
import { ApiError } from '../http';
import { decidirMovimentacao, registrarPerdaAjuste } from './ajustes';
import { criarDados } from './data';
import { receber } from './recebimento';
import { abrirRme, cancelarRme, conferirRme, entregarRme, opcoesSeparacao, separarRme } from './rme';
import { atraso, dataSP, diasEntre, hojeSP, paginar, simularRede, somarDias, volumeDormenteM3 } from './util';

let sessao: Usuario | null = null; // apenas em memória: nada de credenciais no armazenamento do navegador
let seq = 100_000; // acima dos ids gerados em data.ts
const novoId = (p: string) => `${p}${++seq}`;

export function criarServicosSimulados(): Servicos {
  const D = criarDados();

  function validarTamanho(n: NovoTamanho, id?: string) {
    if (D.tamanhos.some((t) => t.id !== id && t.codigo.toLowerCase() === n.codigo.toLowerCase())) {
      throw new ApiError(409, 'Já existe um tamanho com este código.', { codigo: 'Código já utilizado.' });
    }
  }
  const agora = () => ({ quando: new Date().toISOString(), usuario: D.usuarioDemo.nome, novoId });
  function acharRme(id: string) {
    const r = D.rmes.find((x) => x.id === id);
    if (!r) throw new ApiError(404, 'RME não encontrada.');
    return r;
  }
  /** Idade e limite calculados na consulta, com o parâmetro vigente (no modo real, pelo servidor). */
  function comIdade<T extends Lote>(l: T): T {
    const idadeDias = diasEntre(dataSP(l.recebidoEm), hojeSP());
    return { ...l, idadeDias, acimaLimiteIdade: l.saldo > 0 && idadeDias > D.parametros.limiteIdadeDias };
  }
  /** Lote com NF e DOF de origem e todo o saldo que saiu explicado por movimentações aprovadas (histórico NF → destino). */
  function rastreavel(l: Lote) {
    const saiu = D.movimentacoes.filter((m) => m.loteCodigo === l.codigo && m.status === 'aprovado')
      .reduce((a, m) => a + (m.tipo === 'saida' || m.tipo === 'perda' ? m.quantidade : m.tipo === 'ajuste' ? -m.quantidade : 0), 0);
    return !!l.nfNumero && !!l.dofNumero && saiu === l.quantidade - l.saldo;
  }
  function dofsPendentes(): DofPendente[] {
    const p = D.parametros;
    const hoje = hojeSP();
    return D.notas.filter((n) => n.situacao === 'recebida' && n.dof?.declaracao === 'pendente').map((n) => {
      const dof = n.dof!;
      const diasParaPrazo = diasEntre(hoje, dof.prazoDeclaracao);
      return {
        id: n.id, nfId: n.id, nfNumero: n.numero, fornecedor: n.fornecedor, dofNumero: dof.numero, codigoControle: dof.codigoControle, validade: dof.validade,
        prazoDeclaracao: dof.prazoDeclaracao, recebidoEm: D.recebimentos.find((r) => r.nfId === n.id)?.recebidoEm ?? '', diasParaPrazo,
        nivel: diasParaPrazo <= p.alertaDofCriticoDias ? 'critico' as const : diasParaPrazo <= p.alertaDofAtencaoDias ? 'atencao' as const : 'no_prazo' as const,
      };
    }).sort((a, b) => a.diasParaPrazo - b.diasParaPrazo);
  }
  const comVolume = (id: string, n: NovoTamanho): Tamanho => ({ id, ...n, volumeM3: volumeDormenteM3(n.larguraCm, n.alturaCm, n.comprimentoCm) });

  return {
    auth: {
      entrar: async ({ usuario, senha }) => {
        await atraso(500);
        if (!usuario.trim() || !senha) throw new ApiError(401, 'Usuário ou senha inválidos.');
        sessao = D.usuarioDemo;
        return sessao;
      },
      usuarioAtual: async () => { await atraso(150); return sessao; },
      sair: async () => { await atraso(150); sessao = null; },
    },
    dashboard: {
      indicadores: async (): Promise<Indicadores> => {
        await simularRede();
        const s = D.saldos;
        const soma = (f: (x: (typeof s)[number]) => number) => s.reduce((a, x) => a + f(x), 0);
        const porClasse = new Map<string, number>();
        for (const x of s) porClasse.set(rotuloClasse(x.classe), (porClasse.get(rotuloClasse(x.classe)) ?? 0) + x.disponivel);
        const porEspecie = new Map<string, number>();
        for (const x of s) if (x.volumeM3 > 0) porEspecie.set(x.especieDocumental, (porEspecie.get(x.especieDocumental) ?? 0) + x.volumeM3);
        const meses = ['Jun', 'Jul', 'Ago', 'Set', 'Out'];
        const entregues = D.rmes.filter((r) => r.status === 'entregue');
        const lotes = D.lotes.map(comIdade).filter((l) => l.saldo > 0);
        const emEstoque = lotes.reduce((a, l) => a + l.saldo, 0);
        const inv = D.divergenciasInventario;
        const baseInv = inv.reduce((a, x) => a + x.saldoSistema, 0);
        return {
          disponivel: soma((x) => x.disponivel), bloqueado: soma((x) => x.bloqueado), emAnalise: soma((x) => x.emAnalise), divergente: soma((x) => x.divergente),
          metrosLineares: soma((x) => x.metrosLineares), volumeDocumentalM3: D.lotes.reduce((a, l) => a + l.volumeDocumentalM3, 0), volumeCalculadoM3: soma((x) => x.volumeM3),
          recebimentosPendentes: D.notas.filter((n) => n.situacao !== 'recebida').length,
          inventariosAbertos: D.sessoesInventario.filter((x) => x.estado !== 'aprovado' && x.estado !== 'rejeitado').length,
          recebimentosPorMes: meses.map((m, i) => ({ rotulo: m, valor: [4, 6, 5, 7, 3][i] })),
          estoquePorClasse: [...porClasse].map(([rotulo, valor]) => ({ rotulo, valor })),
          // Indicadores do PRD
          fifoPct: entregues.length ? (entregues.filter((r) => r.separacao?.seguiuSugestao).length / entregues.length) * 100 : undefined,
          rmesEntregues: entregues.length, rmesNoSistema: D.rmes.length,
          idadeMediaDias: emEstoque ? lotes.reduce((a, l) => a + l.idadeDias * l.saldo, 0) / emEstoque : 0,
          lotesAcimaLimite: lotes.filter((l) => l.acimaLimiteIdade).length, limiteIdadeDias: D.parametros.limiteIdadeDias,
          divergenciaInventarioPct: baseInv ? (inv.reduce((a, x) => a + Math.abs(x.diferenca), 0) / baseInv) * 100 : 0,
          rastreabilidadePct: D.lotes.length ? (D.lotes.filter(rastreavel).length / D.lotes.length) * 100 : 0,
          dofsPendentes: dofsPendentes().length, lotesAguardandoInspecao: D.lotes.filter((l) => l.inspecao === 'aguardando').length,
          saldoM3PorEspecie: [...porEspecie].sort((a, b) => b[1] - a[1]).map(([rotulo, valor]) => ({ rotulo, valor })),
          origem: 'simulado',
        };
      },
      alertas: async () => {
        await atraso(250);
        const p = D.parametros;
        const divergentes = D.recebimentos.filter((r) => r.acimaTolerancia).map((r) => ({
          id: `al-vol-${r.id}`, nivel: 'critico' as const, titulo: `Divergência de volume acima de ${TOLERANCIA_VOLUME_PCT}% na NF ${r.nfNumero}`,
          descricao: `DOF ${r.dofNumero}: ${r.divergenciaVolumePct > 0 ? '+' : ''}${pct(r.divergenciaVolumePct)}. A norma manda recusar a carga e comunicar o órgão; os lotes ficam com divergência até serem liberados.`,
          link: '/recebimento',
        }));
        const dofs = dofsPendentes().filter((d) => d.nivel !== 'no_prazo').map((d) => ({
          id: `al-dof-${d.nfId}`, nivel: d.nivel === 'critico' ? 'critico' as const : 'atencao' as const,
          titulo: d.diasParaPrazo < 0 ? `DOF ${d.dofNumero} com prazo de declaração vencido` : `DOF ${d.dofNumero}: declarar no Sinaflor até ${data(d.prazoDeclaracao)}`,
          descricao: `NF ${d.nfNumero} (${d.fornecedor}). ${d.diasParaPrazo < 0 ? `Venceu há ${-d.diasParaPrazo} dia(s); novos DOFs podem ser suspensos.` : d.diasParaPrazo === 0 ? 'Vence hoje.' : `Faltam ${d.diasParaPrazo} dia(s).`}`,
          link: '/relatorios',
        }));
        const hoje = hojeSP();
        const ativas = D.rmes.filter((r) => r.status !== 'entregue' && r.status !== 'cancelada');
        const vencidas = ativas.filter((r) => r.dataLimite < hoje);
        const urgentes = ativas.filter((r) => r.urgencia === 'urgente' && r.dataLimite >= hoje);
        const aConferir = D.rmes.filter((r) => r.status === 'em_separacao').length;
        const velhos = D.lotes.map(comIdade).filter((l) => l.saldo > 0 && l.acimaLimiteIdade).length;
        const aguardando = D.lotes.filter((l) => l.inspecao === 'aguardando').length;
        const pendentesAprov = D.movimentacoes.filter((m) => (m.tipo === 'perda' || m.tipo === 'ajuste') && m.status === 'pendente').length;
        const semDof = D.notas.filter((n) => n.situacao === 'aguardando_dof').length;
        const aReceber = D.notas.filter((n) => n.situacao === 'aguardando_recebimento').length;
        const se = <T,>(cond: unknown, a: T) => (cond ? [a] : []);
        return [
          ...divergentes,
          ...dofs,
          ...vencidas.map((r) => ({ id: `al-rme-${r.id}`, nivel: 'critico' as const, titulo: `RME ${r.numero} com data limite vencida`, descricao: `Destinatário: ${r.destinatario}. Ainda não entregue.`, link: '/rme' })),
          ...urgentes.map((r) => ({ id: `al-urg-${r.id}`, nivel: 'critico' as const, titulo: `RME urgente ${r.numero}`, descricao: `${r.destinatario}: data limite ${data(r.dataLimite)}.`, link: '/rme' })),
          ...se(aConferir, { id: 'al-conferir', nivel: 'atencao' as const, titulo: `${aConferir} RME aguardando conferência`, descricao: 'A entrega e a baixa só acontecem após a conferência do supervisor.', link: '/rme' }),
          ...se(velhos, { id: 'al-idade', nivel: 'atencao' as const, titulo: `${velhos} lote(s) acima de ${p.limiteIdadeDias} dias em estoque`, descricao: `Limite ${p.provisorio ? 'provisório ' : ''}definido em Configurações.`, link: '/lotes' }),
          ...se(aguardando, { id: 'al-inspecao', nivel: 'atencao' as const, titulo: `${aguardando} lote(s) aguardando inspeção`, descricao: 'Material fora do estoque disponível até o resultado da inspeção.', link: '/lotes' }),
          ...se(pendentesAprov, { id: 'al-aprovar', nivel: 'atencao' as const, titulo: `${pendentesAprov} perda/ajuste aguardando aprovação`, descricao: 'O saldo só muda após a aprovação do supervisor ou gestor.', link: '/movimentacoes' }),
          ...se(semDof, { id: 'al-sem-dof', nivel: 'atencao' as const, titulo: `${semDof} NF aguardando DOF`, descricao: 'O recebimento não avança sem o DOF cadastrado.', link: '/notas' }),
          ...se(aReceber, { id: 'al-receber', nivel: 'atencao' as const, titulo: `${aReceber} NF aguardando recebimento`, descricao: 'NF com DOF pronta para conferência.', link: '/recebimento' }),
          { id: 'al4', nivel: 'info' as const, titulo: 'Dados simulados em uso', descricao: 'Esta instalação está em modo de demonstração.', link: '/configuracoes' },
        ];
      },
    },
    fornecedores: { listar: (q) => paginar(D.fornecedores, q) },
    documentos: { listar: (q) => paginar(D.documentos, q) },
    notas: {
      listar: (q) => paginar(D.notas, q),
      cadastrar: async (n, xml) => {
        await atraso(600);
        const f = D.fornecedores.find((x) => x.id === n.fornecedorId);
        if (!f) throw new ApiError(422, 'Fornecedor não encontrado.', { fornecedorId: 'Selecione um fornecedor cadastrado.' });
        if (f.status === 'bloqueado') throw new ApiError(422, 'Fornecedor bloqueado.', { fornecedorId: 'Fornecedor bloqueado não pode emitir NF para recebimento.' });
        const chave = n.chaveAcesso?.replace(/\D/g, '') || undefined;
        if (chave && !chaveAcessoValida(chave)) throw new ApiError(422, 'Chave de acesso inválida.', { chaveAcesso: 'Confira os 44 dígitos da chave.' });
        if (chave && D.notas.some((x) => x.chaveAcesso === chave)) throw new ApiError(409, 'Já existe uma NF com esta chave de acesso.', { chaveAcesso: 'Chave de acesso já cadastrada.' });
        if (D.notas.some((x) => x.fornecedorId === f.id && x.numero === n.numero && x.serie === n.serie)) {
          throw new ApiError(409, 'Esta NF já foi cadastrada para o fornecedor.', { numero: 'NF já cadastrada (mesmo número e série).' });
        }
        if (!n.itens.length) throw new ApiError(422, 'Informe ao menos um item.');
        const id = novoId('nf');
        const itens: ItemNf[] = n.itens.map((it, i) => {
          const e = D.especies.find((x) => x.id === it.especieId);
          const t = D.tamanhos.find((x) => x.id === it.tamanhoId);
          if (!e || !t) throw new ApiError(422, 'Espécie ou tamanho do item não encontrado no cadastro.');
          return { id: `${id}-i${i + 1}`, descricao: it.descricao, especieId: e.id, especie: e.nomeCientifico, tamanhoId: t.id, tamanho: t.codigo, quantidade: it.quantidade };
        });
        const nf: NotaFiscal = {
          id, numero: n.numero, serie: n.serie, chaveAcesso: chave, fornecedorId: f.id, fornecedor: f.razaoSocial, emissao: n.emissao,
          origem: xml ? 'xml' : 'manual', xmlAnexado: !!xml, dofSugerido: n.dofSugerido, itens, quantidadeTotal: itens.reduce((a, x) => a + x.quantidade, 0),
          situacao: 'aguardando_dof',
        };
        D.notas.unshift(nf);
        return nf;
      },
      cadastrarDof: async (nfId, d, pdf) => {
        await atraso(600);
        const nf = D.notas.find((x) => x.id === nfId);
        if (!nf) throw new ApiError(404, 'NF não encontrada.');
        if (nf.dof) throw new ApiError(409, 'Esta NF já tem DOF (um DOF por NF).');
        if (!pdf.name.toLowerCase().endsWith('.pdf')) throw new ApiError(422, 'O DOF deve ser anexado em PDF.', { pdf: 'Anexe o PDF do DOF.' });
        if (D.notas.some((x) => x.dof?.codigoControle.toLowerCase() === d.codigoControle.toLowerCase())) {
          throw new ApiError(409, 'Código de controle já usado em outro DOF.', { codigoControle: 'Código de controle já cadastrado.' });
        }
        const volumes = [...new Map(nf.itens.map((i) => [i.especieId, i.especie]))].map(([especieId, especie]) => {
          const v = d.volumes.find((x) => x.especieId === especieId)?.volumeM3;
          if (!v || v <= 0) throw new ApiError(422, `Informe o volume do DOF para ${especie}.`, { [`vol_${especieId}`]: 'Informe o volume em m³.' });
          return { especieId, especie, volumeM3: v };
        });
        nf.dof = {
          numero: d.numero, codigoControle: d.codigoControle, validade: d.validade, volumes, volumeTotalM3: volumes.reduce((a, v) => a + v.volumeM3, 0),
          arquivoPdf: pdf.name.slice(0, 80), declaracao: 'pendente', prazoDeclaracao: somarDias(d.validade, 1),
        };
        nf.situacao = 'aguardando_recebimento';
        return nf;
      },
      declararDof: async (nfId) => {
        await atraso(500);
        const nf = D.notas.find((x) => x.id === nfId);
        if (!nf?.dof) throw new ApiError(404, 'NF ou DOF não encontrado.');
        if (nf.situacao !== 'recebida') throw new ApiError(409, 'O DOF só é declarado no Sinaflor depois do recebimento da NF.');
        if (nf.dof.declaracao === 'declarado') throw new ApiError(409, 'Este DOF já foi marcado como declarado.');
        Object.assign(nf.dof, { declaracao: 'declarado', declaradoPor: D.usuarioDemo.nome, declaradoEm: new Date().toISOString() });
        return nf;
      },
    },
    recebimentos: {
      listar: (q) => paginar(D.recebimentos, q),
      confirmar: async (d, fotos) => {
        await atraso(700);
        const nf = D.notas.find((x) => x.id === d.nfId);
        if (!nf) throw new ApiError(404, 'NF não encontrada.');
        return receber(D, nf, d, { quando: new Date().toISOString(), usuario: D.usuarioDemo.nome, fotos: fotos.length, novoId });
      },
    },
    lotes: { listar: (q) => paginar(D.lotes.map(comIdade), q) },
    fardos: { listar: (q) => paginar(D.fardos, q) },
    estoque: {
      listar: (q) => paginar(D.saldos.map((s) => {
        const l = comIdade(D.lotes.find((x) => x.codigo === s.loteCodigo)!);
        return { ...s, idadeDias: l.idadeDias, acimaLimiteIdade: l.acimaLimiteIdade };
      }), q),
    },
    movimentacoes: {
      listar: (q) => paginar(D.movimentacoes, q),
      registrar: async (n) => {
        await atraso(600);
        if (n.tipo === 'perda' || n.tipo === 'ajuste') return registrarPerdaAjuste(D, n, agora());
        if (n.tipo !== 'transferencia') throw new ApiError(422, 'Entrada vem do recebimento e saída da RME: não são registradas aqui.');
        const lote = D.lotes.find((l) => l.codigo.toLowerCase() === n.loteCodigo.trim().toLowerCase());
        if (!lote) throw new ApiError(404, 'Lote não encontrado.', { loteCodigo: 'Lote inexistente.' });
        if (lote.estoqueStatus === 'bloqueado') throw new ApiError(409, 'Lote bloqueado: movimentação não permitida.');
        const m: Movimentacao = { id: novoId('m'), tipo: n.tipo, loteCodigo: lote.codigo, especie: lote.especieDocumental, quantidade: n.quantidade, origem: n.origem || '—', destino: n.destino || '—', dataHora: new Date().toISOString(), usuario: D.usuarioDemo.nome, status: 'pendente' };
        D.movimentacoes.unshift(m);
        return m;
      },
      decidir: async (id, d) => {
        await atraso(500);
        const m = D.movimentacoes.find((x) => x.id === id);
        if (!m) throw new ApiError(404, 'Movimentação não encontrada.');
        return decidirMovimentacao(D, m, d, agora());
      },
    },
    rme: {
      listar: (q) => paginar(D.rmes, q),
      abrir: async (n) => { await atraso(500); return abrirRme(D, n, agora()); },
      opcoesSeparacao: async (id) => { await simularRede(); return opcoesSeparacao(D, acharRme(id)); },
      separar: async (id, n) => { await atraso(600); return separarRme(D, acharRme(id), n, agora()); },
      conferir: async (id, d) => { await atraso(500); return conferirRme(acharRme(id), d, agora()); },
      entregar: async (id) => { await atraso(700); return entregarRme(D, acharRme(id), agora()); },
      cancelar: async (id, motivo) => { await atraso(500); return cancelarRme(acharRme(id), motivo, agora()); },
    },
    inventario: {
      listar: (q) => paginar(D.sessoesInventario, q),
      criarSessao: async (d) => {
        await atraso(500);
        const s: SessaoInventario = { id: novoId('i'), descricao: d.descricao, local: d.local, abertaEm: new Date().toISOString(), estado: 'em_contagem', itensContados: 0, divergencias: 0, ajuste: 'nao_aplicavel' };
        D.sessoesInventario.unshift(s);
        return s;
      },
      registrarContagem: async (id, itens) => {
        await atraso(500);
        const s = D.sessoesInventario.find((x) => x.id === id);
        if (!s) throw new ApiError(404, 'Sessão não encontrada.');
        s.itensContados += itens.length;
        return s;
      },
      divergencias: (id, q) => paginar(D.divergenciasInventario.filter((x) => x.sessaoId === id), q),
    },
    visao: {
      listar: (q) => paginar(D.processamentos, q),
      enviarImagem: async (arquivo) => {
        await atraso(700);
        const p: ProcessamentoImagem = { id: novoId('p'), arquivo: arquivo.name.slice(0, 60), enviadoEm: new Date().toISOString(), estado: 'na_fila', revisao: 'nao_aplicavel' };
        D.processamentos.unshift(p);
        return p;
      },
    },
    patio: { listar: (q) => paginar(D.locaisPatio, q), transferencias: { listar: (q) => paginar(D.transferencias, q) } },
    relatorios: {
      listar: (q) => paginar(D.relatorios, q),
      solicitarExportacao: async (relatorioId, formato) => { await atraso(500); return { id: novoId('x'), relatorioId, formato, estado: 'solicitada' as const }; },
      saldoIbama: async () => {
        await simularRede();
        const linhas = new Map<string, LinhaSaldoIbama>();
        for (const l of D.lotes.filter((x) => x.saldo > 0)) {
          const t = D.tamanhos.find((x) => x.codigo === l.tamanho);
          const k = `${l.especieDocumental}|${l.tamanho}`;
          const linha = linhas.get(k) ?? {
            id: k, especie: l.especieDocumental, tamanho: l.tamanho, larguraCm: t?.larguraCm ?? 0, alturaCm: t?.alturaCm ?? 0, comprimentoCm: t?.comprimentoCm ?? 0,
            lotes: 0, quantidade: 0, volumeM3: 0, disponivelM3: 0, emAnaliseM3: 0, bloqueadoM3: 0, divergenteM3: 0,
          };
          const v = (l.volumeCalculadoM3 / l.quantidade) * l.saldo;
          const balde = ({ disponivel: 'disponivelM3', em_analise: 'emAnaliseM3', bloqueado: 'bloqueadoM3', divergente: 'divergenteM3' } as const)[l.estoqueStatus];
          linha.lotes += 1; linha.quantidade += l.saldo; linha.volumeM3 += v; linha[balde] += v;
          linhas.set(k, linha);
        }
        return [...linhas.values()].sort((a, b) => a.especie.localeCompare(b.especie) || a.tamanho.localeCompare(b.tamanho));
      },
      dofsPendentes: async () => { await simularRede(); return dofsPendentes(); },
      movimentacoesPeriodo: async (f) => {
        await simularRede();
        if (!f.de || !f.ate || f.de > f.ate) throw new ApiError(422, 'Informe um período válido.', { de: 'Data inicial até a final.' });
        const usuario = f.usuario?.trim().toLowerCase();
        const linhas = D.movimentacoes
          .filter((m) => { const d = dataSP(m.dataHora); return d >= f.de && d <= f.ate; })
          .filter((m) => (!f.especie || m.especie === f.especie) && (!f.tipo || m.tipo === f.tipo) && (!usuario || m.usuario.toLowerCase().includes(usuario)))
          .sort((a, b) => b.dataHora.localeCompare(a.dataHora));
        const tipos: TipoMovimentacao[] = ['entrada', 'saida', 'transferencia', 'perda', 'ajuste'];
        const totais = tipos.map((tipo) => {
          const aprov = linhas.filter((m) => m.tipo === tipo && m.status === 'aprovado');
          return { tipo, registros: aprov.length, quantidade: aprov.reduce((a, m) => a + m.quantidade, 0) };
        }).filter((t) => t.registros > 0);
        return { linhas, totais };
      },
    },
    parametros: {
      obter: async () => { await atraso(200); return { ...D.parametros }; },
      atualizar: async (d) => {
        await atraso(500);
        const erros: Record<string, string> = {};
        if (!Number.isInteger(d.limiteIdadeDias) || d.limiteIdadeDias < 1 || d.limiteIdadeDias > 3650) erros.limiteIdadeDias = 'Inteiro entre 1 e 3650.';
        if (!Number.isInteger(d.alertaDofCriticoDias) || d.alertaDofCriticoDias < 0) erros.alertaDofCriticoDias = 'Inteiro, mínimo 0.';
        if (!Number.isInteger(d.alertaDofAtencaoDias) || d.alertaDofAtencaoDias < d.alertaDofCriticoDias) erros.alertaDofAtencaoDias = 'Inteiro, maior ou igual ao do alerta crítico.';
        if (Object.keys(erros).length) throw new ApiError(422, 'Confira os parâmetros.', erros);
        Object.assign(D.parametros, d);
        return { ...D.parametros };
      },
    },
    auditoria: { listar: (q) => paginar(D.auditoria, q) },
    especies: {
      listar: (q) => paginar(D.especies, q),
      atualizar: async (id, d) => {
        await atraso(500);
        const e = D.especies.find((x) => x.id === id);
        if (!e) throw new ApiError(404, 'Espécie não encontrada.');
        e.classe = d.classe ?? undefined;
        e.uso = d.uso;
        // A classe exibida em lotes e saldos é a da espécie.
        for (const x of [...D.lotes, ...D.saldos]) if (x.especieDocumental === e.nomeCientifico) x.classe = e.classe;
        return e;
      },
    },
    tamanhos: {
      listar: (q) => paginar(D.tamanhos, q),
      cadastrar: async (n) => {
        await atraso(500);
        validarTamanho(n);
        const t = comVolume(novoId('t'), n);
        D.tamanhos.push(t);
        return t;
      },
      atualizar: async (id, n) => {
        await atraso(500);
        const i = D.tamanhos.findIndex((x) => x.id === id);
        if (i < 0) throw new ApiError(404, 'Tamanho não encontrado.');
        validarTamanho(n, id);
        D.tamanhos[i] = comVolume(id, n);
        return D.tamanhos[i];
      },
    },
    volumetria: { listar: (q) => paginar(D.volumetria, q) },
    usuarios: { listar: (q) => paginar(D.usuarios, q) },
    sistema: { testarConexao: async () => { await atraso(300); return { ok: true, mensagem: 'Modo simulado: nenhuma conexão real foi testada.', simulado: true }; } },
  };
}
