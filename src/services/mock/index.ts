import type { Servicos } from '../contracts';
import { TOLERANCIA_VOLUME_PCT } from '../../dominio/parametros';
import type {
  DofPendente, EventoLote, Fardo, Indicadores, Pendencia, ItemNf, LinhaSaldoIbama, Lote, Movimentacao, NotaFiscal, NovoTamanho, ProcessamentoImagem, SessaoInventario, Tamanho,
  TipoMovimentacao, Usuario,
} from '../../types/models';
import { data, pct, rotuloClasse } from '../../utils/format';
import { chaveAcessoValida } from '../../utils/nfeXml';
import { ApiError } from '../http';
import { decidirMovimentacao, registrarPerdaAjuste } from './ajustes';
import { situacaoDoLote } from './estoque';
import { rotuloGrupo } from '../../dominio/inspecao';
import { formarFardos, lancarManual, sugestaoFardos, vigentes } from './inspecao';
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
  /** Ações registradas em nome de quem entrou (no login simulado, o perfil escolhido). */
  const usuarioAtual = () => sessao?.nome ?? D.usuarioDemo.nome;
  const agora = () => ({ quando: new Date().toISOString(), usuario: usuarioAtual(), novoId });
  function acharRme(id: string) {
    const r = D.rmes.find((x) => x.id === id);
    if (!r) throw new ApiError(404, 'RME não encontrada.');
    return r;
  }
  /** Idade e limite calculados na consulta, com o parâmetro vigente (no modo real, pelo servidor). */
  function comIdade<T extends Lote>(l: T): T {
    const idadeDias = diasEntre(dataSP(l.recebidoEm), hojeSP());
    return {
      ...l, idadeDias, acimaLimiteIdade: l.saldo > 0 && idadeDias > D.parametros.limiteIdadeDias, situacao: situacaoDoLote(l, D.fardos),
      pecasInspecionadas: vigentes(D, l.codigo).length,
    };
  }
  /** Lote com NF e DOF de origem e todo o saldo que saiu explicado por movimentações aprovadas (histórico NF → destino). */
  function rastreavel(l: Lote) {
    const saiu = D.movimentacoes.filter((m) => m.loteCodigo === l.codigo && m.status === 'aprovado')
      .reduce((a, m) => a + (m.tipo === 'saida' || m.tipo === 'perda' ? m.quantidade : m.tipo === 'ajuste' ? -m.quantidade : 0), 0);
    return !!l.nfNumero && !!l.dofNumero && saiu === l.quantidade - l.saldo;
  }
  /** Dias até o prazo de declaração e nível, pelos parâmetros vigentes. */
  function prazo(prazoDeclaracao: string) {
    const p = D.parametros;
    const diasParaPrazo = diasEntre(hojeSP(), prazoDeclaracao);
    const nivel: DofPendente['nivel'] = diasParaPrazo <= p.alertaDofCriticoDias ? 'critico' : diasParaPrazo <= p.alertaDofAtencaoDias ? 'atencao' : 'no_prazo';
    return { diasParaPrazo, nivel };
  }
  function dofsPendentes(): DofPendente[] {
    return D.notas.filter((n) => n.situacao === 'recebida' && n.dof?.declaracao === 'pendente').map((n) => {
      const dof = n.dof!;
      return {
        id: n.id, nfId: n.id, nfNumero: n.numero, fornecedor: n.fornecedor, dofNumero: dof.numero, codigoControle: dof.codigoControle, validade: dof.validade,
        prazoDeclaracao: dof.prazoDeclaracao, recebidoEm: D.recebimentos.find((r) => r.nfId === n.id)?.recebidoEm ?? '', ...prazo(dof.prazoDeclaracao),
      };
    }).sort((a, b) => a.diasParaPrazo - b.diasParaPrazo);
  }
  /** Etapa do quadro de Entrada, calculada na consulta. */
  function comEtapa(n: NotaFiscal): NotaFiscal {
    if (n.situacao !== 'recebida') return { ...n, etapa: n.situacao, emAndamento: true, diasParaPrazo: undefined, nivelPrazo: undefined };
    if (n.dof?.declaracao !== 'pendente') return { ...n, etapa: 'concluida', emAndamento: false, diasParaPrazo: undefined, nivelPrazo: undefined };
    const p = prazo(n.dof.prazoDeclaracao);
    return { ...n, etapa: 'declarar', emAndamento: true, diasParaPrazo: p.diasParaPrazo, nivelPrazo: p.nivel };
  }
  const permissoesAtuais = () => (sessao ?? D.usuarioDemo).permissoes;
  /** Primeiros registros de uma fila, para a tela inicial. */
  const exemplos = <T,>(l: T[], f: (x: T) => { codigo: string; texto: string }) => l.slice(0, 3).map(f);
  const comVolume = (id: string, n: NovoTamanho): Tamanho => ({ id, ...n, volumeM3: volumeDormenteM3(n.larguraCm, n.alturaCm, n.comprimentoCm) });

  /** "Aprovado · Categoria 1: 3 fardo(s), 42 un. · Quarentena: 1 fardo(s), 5 un." */
  function resumoFardos(fs: Fardo[]) {
    const g = new Map<string, { n: number; q: number }>();
    for (const f of fs) {
      const k = `${rotuloGrupo(f)}${f.motivoBloqueio ? ' (divergente)' : ''}`;
      const x = g.get(k) ?? { n: 0, q: 0 };
      x.n += 1; x.q += f.quantidadeInicial;
      g.set(k, x);
    }
    return [...g].map(([k, x]) => `${k}: ${x.n} fardo(s), ${x.q} un.`).join(' · ');
  }

  const servicos: Servicos = {
    auth: {
      entrar: async ({ usuario, senha }) => {
        await atraso(500);
        if (!usuario.trim() || !senha) throw new ApiError(401, 'Usuário ou senha inválidos.');
        sessao = D.perfisDemo[usuario.trim().toLowerCase()] ?? D.usuarioDemo;
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
          dofsPendentes: dofsPendentes().length, lotesAguardandoInspecao: D.lotes.filter((l) => l.etapaInspecao !== 'concluida').length,
          saldoM3PorEspecie: [...porEspecie].sort((a, b) => b[1] - a[1]).map(([rotulo, valor]) => ({ rotulo, valor })),
          origem: 'simulado',
        };
      },
      pendencias: async () => {
        await simularRede();
        const pode = (...ps: string[]) => ps.some((x) => permissoesAtuais().includes(x));
        const hoje = hojeSP();
        const urgencia = (r: { urgencia: string; dataLimite: string }) => (r.urgencia === 'urgente' ? 0 : 1) * 1e9 + Date.parse(r.dataLimite) / 1e5;
        const rmes = (s: string) => D.rmes.filter((r) => r.status === s).sort((a, b) => urgencia(a) - urgencia(b));
        const textoRme = (r: (typeof D.rmes)[number]) => ({
          codigo: r.numero, texto: `${r.urgencia === 'urgente' ? 'URGENTE · ' : ''}${r.destinatario} · até ${data(r.dataLimite)}${r.dataLimite < hoje ? ' (vencida)' : ''}`,
        });
        const critica = (l: (typeof D.rmes)) => l.some((r) => r.urgencia === 'urgente' || r.dataLimite < hoje);
        const semDof = D.notas.filter((n) => n.situacao === 'aguardando_dof');
        const aReceber = D.notas.filter((n) => n.situacao === 'aguardando_recebimento');
        const dofs = dofsPendentes();
        const abertas = rmes('aberta'), emSep = rmes('em_separacao'), conferidas = rmes('conferida');
        const minhas = D.rmes.filter((r) => r.requisitante === (sessao ?? D.usuarioDemo).nome && r.status !== 'entregue' && r.status !== 'cancelada');
        const aprovar = D.movimentacoes.filter((m) => (m.tipo === 'perda' || m.tipo === 'ajuste') && m.status === 'pendente');
        const abertos = D.lotes.filter((l) => l.etapaInspecao !== 'concluida').map((l) => ({ l, s: sugestaoFardos(D, l.codigo) }));
        const prontos = abertos.filter((x) => x.s.semResultado === 0 && x.s.excedentes === 0);
        const aguardandoInsp = abertos.filter((x) => !prontos.includes(x));
        const lista: (Pendencia | false)[] = [
          pode('rme:separar') && abertas.length > 0 && {
            id: 'separar', nivel: critica(abertas) ? 'critico' : 'atencao', titulo: 'RMEs para separar', quantidade: abertas.length,
            exemplos: exemplos(abertas, textoRme), acao: { rotulo: 'Separar', link: '/rme?visao=lista&status=aberta' },
          },
          pode('rme:conferir') && emSep.length > 0 && {
            id: 'conferir', nivel: critica(emSep) ? 'critico' : 'atencao', titulo: 'RMEs para conferir', quantidade: emSep.length,
            descricao: 'A entrega e a baixa só acontecem depois da sua conferência.', exemplos: exemplos(emSep, textoRme), acao: { rotulo: 'Conferir', link: '/rme?visao=lista&status=em_separacao' },
          },
          pode('rme:separar') && conferidas.length > 0 && {
            id: 'entregar', nivel: 'atencao', titulo: 'RMEs conferidas para entregar', quantidade: conferidas.length,
            exemplos: exemplos(conferidas, textoRme), acao: { rotulo: 'Confirmar entrega', link: '/rme?visao=lista&status=conferida' },
          },
          pode('recebimento:registrar') && aReceber.length > 0 && {
            id: 'receber', nivel: 'atencao', titulo: 'NFs com DOF prontas para receber', quantidade: aReceber.length,
            exemplos: exemplos(aReceber, (n) => ({ codigo: `NF ${n.numero}`, texto: n.fornecedor })), acao: { rotulo: 'Receber', link: '/notas?visao=lista&etapa=aguardando_recebimento' },
          },
          pode('nf:cadastrar') && semDof.length > 0 && {
            id: 'dof', nivel: 'atencao', titulo: 'NFs aguardando DOF', quantidade: semDof.length, descricao: 'O recebimento não avança sem o DOF.',
            exemplos: exemplos(semDof, (n) => ({ codigo: `NF ${n.numero}`, texto: n.fornecedor })), acao: { rotulo: 'Cadastrar DOF', link: '/notas?visao=lista&etapa=aguardando_dof' },
          },
          pode('dof:declarar') && dofs.length > 0 && {
            id: 'declarar', nivel: dofs.some((d) => d.nivel === 'critico') ? 'critico' : dofs.some((d) => d.nivel === 'atencao') ? 'atencao' : 'info',
            titulo: 'DOFs para declarar no Sinaflor', quantidade: dofs.length,
            exemplos: exemplos(dofs, (d) => ({ codigo: `NF ${d.nfNumero}`, texto: `DOF ${d.dofNumero} · ${d.diasParaPrazo < 0 ? `prazo vencido há ${-d.diasParaPrazo} dia(s)` : `prazo ${data(d.prazoDeclaracao)}`}` })),
            acao: { rotulo: 'Declarar', link: '/relatorios?aba=dofs' },
          },
          pode('movimentacoes:aprovar') && aprovar.length > 0 && {
            id: 'aprovar', nivel: 'atencao', titulo: 'Perdas e ajustes para aprovar', quantidade: aprovar.length, descricao: 'O saldo só muda depois da aprovação.',
            exemplos: exemplos(aprovar, (m) => ({ codigo: m.fardoCodigo ?? m.loteCodigo, texto: `${m.tipo === 'perda' ? 'Perda' : 'Ajuste'} de ${m.quantidade} un. · ${m.usuario}` })),
            acao: { rotulo: 'Revisar', link: '/movimentacoes?status=pendente' },
          },
          pode('rme:abrir') && {
            id: 'minhas', nivel: 'info', titulo: minhas.length ? 'Minhas RMEs em andamento' : 'Nenhuma RME sua em andamento', quantidade: minhas.length,
            exemplos: exemplos(minhas, (r) => ({ codigo: r.numero, texto: `${({ aberta: 'Aberta', em_separacao: 'Em separação', conferida: 'Conferida' } as Record<string, string>)[r.status] ?? r.status} · ${r.destinatario}` })),
            acao: { rotulo: 'Abrir RME', link: '/rme' },
          },
          pode('inspecao:concluir') && prontos.length > 0 && {
            id: 'formar', nivel: 'atencao', titulo: 'Lotes inspecionados: formar os fardos', quantidade: prontos.length,
            descricao: 'Todas as peças têm resultado. O material só fica disponível depois de formar os fardos.',
            exemplos: exemplos(prontos, ({ l }) => ({ codigo: l.codigo, texto: `${l.quantidade} peças · ${l.especieDocumental}` })), acao: { rotulo: 'Formar fardos', link: '/inspecao' },
          },
          pode('inspecao:concluir', 'recebimento:registrar', 'admin') && aguardandoInsp.length > 0 && {
            id: 'inspecao', nivel: 'info', titulo: 'Lotes aguardando inspeção', quantidade: aguardandoInsp.length, descricao: 'Fora do estoque disponível até o resultado da inspeção.',
            exemplos: exemplos(aguardandoInsp, ({ l, s }) => ({ codigo: l.codigo, texto: `${s.pecasInspecionadas} de ${l.quantidade} peças inspecionadas` })),
            acao: { rotulo: 'Ver inspeção', link: '/inspecao' },
          },
        ];
        return lista.filter((x): x is Pendencia => !!x);
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
          link: '/relatorios?aba=dofs',
        }));
        const hoje = hojeSP();
        const ativas = D.rmes.filter((r) => r.status !== 'entregue' && r.status !== 'cancelada');
        const vencidas = ativas.filter((r) => r.dataLimite < hoje);
        const urgentes = ativas.filter((r) => r.urgencia === 'urgente' && r.dataLimite >= hoje);
        const aConferir = D.rmes.filter((r) => r.status === 'em_separacao').length;
        const velhos = D.lotes.map(comIdade).filter((l) => l.saldo > 0 && l.acimaLimiteIdade).length;
        const aguardando = D.lotes.filter((l) => l.etapaInspecao !== 'concluida').length;
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
          ...se(aguardando, { id: 'al-inspecao', nivel: 'atencao' as const, titulo: `${aguardando} lote(s) aguardando inspeção`, descricao: 'Material fora do estoque disponível até a inspeção e a formação dos fardos.', link: '/inspecao' }),
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
      listar: (q) => paginar(D.notas.map(comEtapa), q),
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
          situacao: 'aguardando_dof', etapa: 'aguardando_dof', emAndamento: true,
        };
        D.notas.unshift(nf);
        return comEtapa(nf);
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
        return comEtapa(nf);
      },
      declararDof: async (nfId) => {
        await atraso(500);
        const nf = D.notas.find((x) => x.id === nfId);
        if (!nf?.dof) throw new ApiError(404, 'NF ou DOF não encontrado.');
        if (nf.situacao !== 'recebida') throw new ApiError(409, 'O DOF só é declarado no Sinaflor depois do recebimento da NF.');
        if (nf.dof.declaracao === 'declarado') throw new ApiError(409, 'Este DOF já foi marcado como declarado.');
        Object.assign(nf.dof, { declaracao: 'declarado', declaradoPor: usuarioAtual(), declaradoEm: new Date().toISOString() });
        return comEtapa(nf);
      },
    },
    recebimentos: {
      listar: (q) => paginar(D.recebimentos, q),
      confirmar: async (d, fotos) => {
        await atraso(700);
        const nf = D.notas.find((x) => x.id === d.nfId);
        if (!nf) throw new ApiError(404, 'NF não encontrada.');
        return receber(D, nf, d, { quando: new Date().toISOString(), usuario: usuarioAtual(), fotos: fotos.length, novoId });
      },
    },
    lotes: {
      listar: (q) => paginar(D.lotes.map(comIdade), q),
      obter: async (codigo) => {
        await simularRede();
        const l = D.lotes.find((x) => x.codigo.toLowerCase() === codigo.trim().toLowerCase());
        if (!l) throw new ApiError(404, `Lote ${codigo} não encontrado.`);
        const nf = D.notas.find((n) => n.numero === l.nfNumero && n.fornecedor === l.fornecedor);
        const recebimento = nf && D.recebimentos.find((r) => r.nfId === nf.id);
        const fardos = D.fardos.filter((f) => f.loteCodigo === l.codigo).sort((a, b) => a.sequencia - b.sequencia);
        const titulos: Record<string, string> = { entrada: 'Entrada no estoque', saida: 'Saída por RME', transferencia: 'Transferência', perda: 'Perda', ajuste: 'Ajuste de saldo' };
        const historico: EventoLote[] = [
          ...(nf ? [{ quando: `${nf.emissao}T12:00:00-03:00`, tipo: 'nf' as const, titulo: `NF ${nf.numero} emitida`, detalhe: `${nf.fornecedor} · ${nf.origem === 'xml' ? 'importada do XML' : 'cadastro manual'}`, referencia: `NF ${nf.numero}` }] : []),
          ...(recebimento ? [{
            quando: recebimento.recebidoEm, tipo: 'recebimento' as const, titulo: 'Recebimento conferido', usuario: recebimento.conferente, referencia: `NF ${recebimento.nfNumero}`,
            detalhe: `Lote criado com ${l.quantidade} dormentes, aguardando inspeção.${recebimento.acimaTolerancia ? ' Divergência de volume acima da tolerância.' : ''}`,
          }] : []),
          ...(l.inspecaoConcluidaEm ? [{
            quando: l.inspecaoConcluidaEm, tipo: 'inspecao' as const, titulo: `Inspeção concluída: ${fardos.length} fardo(s) formado(s)`, usuario: l.inspecaoConcluidaPor,
            detalhe: resumoFardos(fardos),
          }] : []),
          ...(nf?.dof?.declaradoEm ? [{ quando: nf.dof.declaradoEm, tipo: 'declaracao' as const, titulo: `DOF ${nf.dof.numero} declarado no Sinaflor`, usuario: nf.dof.declaradoPor }] : []),
          ...D.movimentacoes.filter((m) => m.loteCodigo === l.codigo && m.tipo !== 'entrada').map((m) => ({
            quando: m.dataHora, tipo: m.tipo, titulo: `${titulos[m.tipo]}${m.fardoCodigo ? ` · ${m.fardoCodigo}` : ''}`, usuario: m.usuario, referencia: m.referencia, status: m.status,
            detalhe: `${m.tipo === 'ajuste' && m.quantidade > 0 ? '+' : ''}${m.quantidade} un. · ${m.origem} → ${m.destino}${m.motivo ? ` · ${m.motivo}` : ''}${m.dormentes?.length ? ` · dormentes ${m.dormentes.map((d) => d.slice(-4)).join(', ')}` : ''}`,
          })),
        ].sort((a, b) => a.quando.localeCompare(b.quando));
        const inspecoes = D.inspecoes.filter((x) => x.loteCodigo === l.codigo)
          .sort((a, b) => Number(b.vigente) - Number(a.vigente) || a.sequencia - b.sequencia || b.inspecionadoEm.localeCompare(a.inspecionadoEm));
        const dormentes = D.dormentes.filter((x) => x.loteCodigo === l.codigo).sort((a, b) => a.sequencia - b.sequencia);
        return { lote: comIdade(l), fardos, inspecoes, dormentes, nf, recebimento, historico };
      },
      sugestaoFardos: async (codigo) => { await simularRede(); return sugestaoFardos(D, codigo); },
      formarFardos: async (codigo, d) => {
        await atraso(700);
        formarFardos(D, codigo, d, agora());
        return servicos.lotes.obter(codigo);
      },
    },
    dormentes: { listar: (q) => paginar(D.dormentes, q) },
    inspecoes: {
      listar: (q) => paginar(D.inspecoes, q),
      lancar: async (loteCodigo, d) => { await atraso(500); return lancarManual(D, loteCodigo, d, agora()); },
    },
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
        const m: Movimentacao = { id: novoId('m'), tipo: n.tipo, loteCodigo: lote.codigo, especie: lote.especieDocumental, quantidade: n.quantidade, origem: n.origem || '—', destino: n.destino || '—', dataHora: new Date().toISOString(), usuario: usuarioAtual(), status: 'pendente' };
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
          // Por estado do saldo (vem dos fardos): um lote pode ter parte disponível e parte segregada.
          const vu = l.volumeCalculadoM3 / l.quantidade;
          const s = D.saldos.find((x) => x.loteCodigo === l.codigo);
          linha.lotes += 1; linha.quantidade += l.saldo; linha.volumeM3 += vu * l.saldo;
          if (s) {
            linha.disponivelM3 += vu * s.disponivel; linha.emAnaliseM3 += vu * s.emAnalise;
            linha.bloqueadoM3 += vu * s.bloqueado; linha.divergenteM3 += vu * s.divergente;
          }
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
        if (!Number.isInteger(d.categoria1IndiceMin) || d.categoria1IndiceMin < 1 || d.categoria1IndiceMin > 100) erros.categoria1IndiceMin = 'Inteiro entre 1 e 100.';
        if (!Number.isInteger(d.categoria2IndiceMin) || d.categoria2IndiceMin < 0 || d.categoria2IndiceMin >= d.categoria1IndiceMin) erros.categoria2IndiceMin = 'Inteiro, menor que o da Categoria 1.';
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
  return servicos;
}
