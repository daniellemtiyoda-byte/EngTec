import { describe, expect, it } from 'vitest';
import type { Perfil } from '../../dominio/permissoes';
import type { Usuario } from '../../types/models';
import { chaveComDigito } from '../../utils/nfeXml';
import { ApiError } from '../http';
import { justificativaPorFalta } from '../../dominio/parametros';
import { criarDados, usuarioDemo } from './data';
import { criarServicosSimulados } from './index';
import { receber } from './recebimento';
import { violacoes } from './invariantes';

const AGORA = new Date('2026-11-06T12:00:00-03:00');

/** Serviços simulados com relógio fixo, sem armazenamento e sem espera; `como` troca o usuário logado. */
function montar(perfil: Perfil | null = 'almoxarife', armazenamento: Map<string, string> = new Map()) {
  let usuario: Usuario | null = perfil ? usuarioDemo(perfil) : null;
  const store = { getItem: (k: string) => armazenamento.get(k) ?? null, setItem: (k: string, v: string) => void armazenamento.set(k, v), removeItem: (k: string) => void armazenamento.delete(k) };
  const s = criarServicosSimulados({ agora: () => AGORA, armazenamento: store, atrasoMs: 0, usuarioAtual: async () => usuario });
  /** Violações dos invariantes no estado salvo (vazia = tudo certo). */
  const invariantes = () => violacoes(JSON.parse(armazenamento.get('holz:demo:estado')!), '2026-11-06');
  return { s, como: (p: Perfil | null) => { usuario = p ? usuarioDemo(p) : null; }, invariantes };
}

/** Espera um ApiError com o status (e o campo, se informado). */
async function falhaCom(p: Promise<unknown>, status: number, campo?: string) {
  const erro = await p.then(() => null, (e: unknown) => e);
  expect(erro).toBeInstanceOf(ApiError);
  expect((erro as ApiError).status).toBe(status);
  if (campo) expect(Object.keys((erro as ApiError).detalhes ?? {})).toContain(campo);
  return erro as ApiError;
}

const chave = (cnpj: string, n: number) => chaveComDigito(`352611${cnpj}55001${String(n).padStart(9, '0')}1${String(n).padStart(8, '0')}`);
const CNPJ_A = '00000000000101';
/** Jataipeba, fornecida pelo fornecedor A (ids técnicos determinísticos da história). */
const JATAIPEBA = 'es0001';
const MACARANDUBA = 'es0002';

async function contrato(s: ReturnType<typeof montar>['s'], numero: string) {
  return s.contratos.obter(numero);
}
async function entregaACaminho(s: ReturnType<typeof montar>['s']) {
  const lista = await s.recebimentos.entregasACaminho();
  return lista.find((x) => x.situacao === 'a_caminho')!;
}
async function localPorCodigo(s: ReturnType<typeof montar>['s'], codigo: string) {
  return s.locais.obterPorCodigo(codigo);
}

describe('sessão e permissões', () => {
  it('sem sessão, nada é lido', async () => {
    const { s } = montar(null);
    await falhaCom(s.fornecedores.listar(), 401);
  });
  it('cada perfil só faz o que pode', async () => {
    const { s, como } = montar('requisitante');
    const c = await contrato(s, 'AR00224-01');
    await falhaCom(s.simulador.emitir({ contratoId: c.id, parcela: 1, comDocumentos: true, itens: [{ itemContratoId: c.itens[0].id, fardos: 1, dormentesPorFardo: 1 }] }), 403);
    como('gestor');
    const en = await entregaACaminho(s);
    await falhaCom(s.recebimentos.receber(en.id, { fardosLidos: en.fardosIds, ocorrencias: [], localEsperaId: 'x' }), 403);
    await falhaCom(s.parametros.reiniciarDemonstracao(), 403);
  });
  it('leituras devolvem cópias: alterar o resultado não altera os dados', async () => {
    const { s } = montar();
    const f = await s.fornecedores.listar();
    f.items[0].razaoSocial = 'alterado';
    expect((await s.fornecedores.listar()).items[0].razaoSocial).not.toBe('alterado');
  });
});

describe('NF e DOF antes da chegada', () => {
  it('cadastrar NF e DOF cria a entrega "a caminho"; a mesma chave é recusada', async () => {
    const { s } = montar();
    const c = await contrato(s, 'AR00224-01');
    const dados = {
      nf: { numero: '9001', serie: '1', chaveAcesso: chave(CNPJ_A, 9001), contratoId: c.id, emissao: '2026-11-05', itens: [{ itemContratoId: c.itens[0].id, quantidade: 28, volumeM3: 3.2 }] },
      parcela: 1,
      dof: { numero: '26999001', validade: '2026-11-20', volumes: [{ especieId: JATAIPEBA, volumeM3: 3.2 }] },
    };
    const en = await s.documentos.cadastrarEntrega(dados);
    expect(en.situacao).toBe('a_caminho');
    expect(en.origem).toBe('cadastro');
    expect(en.prazoDeclaracao).toBe('2026-11-21');
    expect((await s.recebimentos.entregasACaminho()).map((x) => x.id)).toContain(en.id);
    await falhaCom(s.documentos.cadastrarEntrega({ ...dados, dof: { ...dados.dof, numero: '26999002' } }), 409, 'nf.chaveAcesso');
  });
  it('administrador e almoxarife cadastram NF e DOF; gestor não', async () => {
    const { s, como } = montar('administrador');
    const c = await contrato(s, 'AR00224-01');
    const dados = (n: number) => ({
      nf: { numero: String(n), serie: '1', chaveAcesso: chave(CNPJ_A, n), contratoId: c.id, emissao: '2026-11-05', itens: [{ itemContratoId: c.itens[0].id, quantidade: 14, volumeM3: 1.6 }] },
      parcela: 1,
      dof: { numero: `26${n}`, validade: '2026-11-20', volumes: [{ especieId: JATAIPEBA, volumeM3: 1.6 }] },
    });
    expect((await s.documentos.cadastrarEntrega(dados(9021))).criadoPor).toBe('Administrador (demonstração)');
    como('gestor');
    await falhaCom(s.documentos.cadastrarEntrega(dados(9022)), 403);
  });
  it('recusa chave de outro CNPJ, chave inválida e entrega sem DOF', async () => {
    const { s } = montar();
    const c = await contrato(s, 'AR00224-01');
    const nf = { numero: '9002', serie: '1', chaveAcesso: chave('00000000000999', 9002), contratoId: c.id, emissao: '2026-11-05', itens: [{ itemContratoId: c.itens[0].id, quantidade: 1, volumeM3: 0.1 }] };
    const dof = { numero: '26999003', validade: '2026-11-20', volumes: [{ especieId: JATAIPEBA, volumeM3: 0.1 }] };
    await falhaCom(s.documentos.cadastrarEntrega({ nf, dof, parcela: 1 }), 422, 'nf.chaveAcesso');
    await falhaCom(s.documentos.cadastrarEntrega({ nf: { ...nf, chaveAcesso: '123' }, dof, parcela: 1 }), 422, 'nf.chaveAcesso');
    await falhaCom(s.documentos.cadastrarEntrega({ nf: { ...nf, chaveAcesso: chave(CNPJ_A, 9002) }, dof, parcela: 9 }), 422, 'parcela');
    await falhaCom(s.documentos.cadastrarEntrega({ nf: { ...nf, chaveAcesso: chave(CNPJ_A, 9002) }, dof: { ...dof, numero: '' }, parcela: 1 }), 422, 'dof.numero');
  });
  it('declara a DOF só depois do recebimento, e uma vez só', async () => {
    const { s } = montar();
    const en = await entregaACaminho(s);
    const dof = (await s.documentos.listarDofs({ pageSize: 50 })).items.find((d) => d.nfId === en.nfId)!;
    expect([dof.situacaoDeclaracao, dof.podeDeclarar, dof.nfNumero]).toEqual(['a_declarar', false, en.nfNumero]);
    await falhaCom(s.documentos.declararDof(dof.id), 409);
    const insp = await localPorCodigo(s, 'INSP-01');
    await s.recebimentos.receber(en.id, { fardosLidos: en.fardosIds, ocorrencias: [], localEsperaId: insp.id });
    const declarada = await s.documentos.declararDof(dof.id);
    expect(declarada.declarado?.quem).toBe('Almoxarife (demonstração)');
    expect(declarada.situacaoDeclaracao).toBe('declarado');
    await falhaCom(s.documentos.declararDof(dof.id), 409);
  });
  it('a prévia do recebimento bate com o que é gravado; as abas de Recebimentos seguem a etapa da entrega', async () => {
    const { s, invariantes } = montar();
    const en = await entregaACaminho(s);
    const lidos = ['AR00224-01-F006', 'AR00224-01-F007', 'AR00311-01-F001'];
    const previa = await s.recebimentos.previa(en.id, lidos);
    expect(previa.aceitos).toEqual(['AR00224-01-F006', 'AR00224-01-F007']);
    expect(previa.desconhecidos).toEqual(['AR00311-01-F001']);
    expect(previa.faltantes).toEqual(['AR00224-01-F008']);
    expect(previa.dormentes).toBe(28);
    expect(previa.exigeJustificativa).toBe(false);
    expect(previa.justificativaAutomatica).toBe(justificativaPorFalta(['AR00224-01-F008']));
    const insp = await localPorCodigo(s, 'INSP-01');
    const rec = await s.recebimentos.receber(en.id, { fardosLidos: lidos, ocorrencias: [], localEsperaId: insp.id });
    expect(rec.divergenciaVolume).toEqual(previa.divergenciaVolume);
    const naAba = async (etapa: string) => (await s.documentos.listarEntregas({ pageSize: 50, filters: { etapa } })).items.map((x) => x.id);
    expect(await naAba('a_caminho')).toContain(en.id); // recebida em parte continua "A caminho"
    expect(await naAba('com_ocorrencia')).toContain(en.id);
    await s.recebimentos.receber(en.id, { fardosLidos: ['AR00224-01-F008'], ocorrencias: [], localEsperaId: insp.id });
    expect(await naAba('aguardando_inspecao')).toContain(en.id);
    expect((await s.documentos.listarEntregas({ pageSize: 50 })).items.find((x) => x.id === en.id)?.recebimentosIds).toHaveLength(2);
    expect(invariantes()).toEqual([]);
  });
  it('cadastro na hora do recebimento fica com origem "recebimento"', async () => {
    const { s } = montar();
    const c = await contrato(s, 'AR00224-01');
    const en = await s.documentos.cadastrarEntrega({
      origem: 'recebimento',
      nf: { numero: '9031', serie: '1', chaveAcesso: chave(CNPJ_A, 9031), contratoId: c.id, emissao: '2026-11-05', itens: [{ itemContratoId: c.itens[0].id, quantidade: 14, volumeM3: 1.6 }] },
      parcela: 1,
      dof: { numero: '26999031', validade: '2026-11-20', volumes: [{ especieId: JATAIPEBA, volumeM3: 1.6 }] },
    });
    expect(en.origem).toBe('recebimento');
  });
});

describe('recebimento', () => {
  it('recebe em parte com falta automática e recebe o fardo que faltava depois', async () => {
    const { s, invariantes } = montar();
    const en = await entregaACaminho(s);
    const insp = await localPorCodigo(s, 'INSP-01');
    // Faltou o fardo de Maçaranduba: o volume dessa espécie diverge 100%, mas só por causa da falta. O sistema
    // preenche a justificativa com a lista dos fardos que faltaram e mantém o complemento da pessoa.
    const parcial = { fardosLidos: ['AR00224-01-F006', 'AR00224-01-F007', 'AR00311-01-F001'], ocorrencias: [], localEsperaId: insp.id };
    const automatica = justificativaPorFalta(['AR00224-01-F008']);
    const rec = await s.recebimentos.receber(en.id, { ...parcial, justificativaDivergencia: `${automatica} Veio em outro caminhão.` });
    expect(rec.justificativaAutomatica).toBe(true);
    expect(rec.justificativaDivergencia).toBe(`${automatica} Veio em outro caminhão.`);
    expect(rec.divergenciaVolume.find((d) => d.acimaTolerancia)?.percentual).toBe(100);
    expect(rec.fardosLidos).toEqual(['AR00224-01-F006', 'AR00224-01-F007']);
    expect(rec.ocorrencias.map((o) => `${o.tipo}:${o.fardoId}`)).toEqual(['falta:AR00224-01-F008', 'fardo_desconhecido:AR00311-01-F001']);
    expect(rec.conforme).toBe(false);
    const fardo = await s.fardos.obter('AR00224-01-F006');
    expect(fardo.fardo.situacao).toBe('aguardando_inspecao');
    expect(fardo.dormentes.every((d) => d.situacao === 'aguardando_inspecao')).toBe(true);
    expect((await s.fardos.obter('AR00224-01-F008')).fardo.situacao).toBe('em_transito');
    expect((await s.recebimentos.entregasACaminho()).find((x) => x.id === en.id)?.situacao).toBe('recebida_parcial');

    expect((await s.recebimentos.entregasACaminho()).find((x) => x.id === en.id)?.divergenciaVolume.some((d) => d.acimaTolerancia)).toBe(true);

    // Chegou o fardo que faltava: a divergência da DOF é recalculada e fecha.
    const resto = await s.recebimentos.receber(en.id, { fardosLidos: ['AR00224-01-F008'], ocorrencias: [], localEsperaId: insp.id });
    expect(resto.conforme).toBe(true);
    expect(resto.justificativaDivergencia).toBeUndefined();
    expect(resto.divergenciaVolume.every((d) => !d.acimaTolerancia)).toBe(true);
    const entrega = (await s.documentos.listarEntregas({ pageSize: 50 })).items.find((x) => x.id === en.id)!;
    expect(entrega.situacao).toBe('recebida');
    expect(entrega.divergenciaVolume.every((d) => !d.acimaTolerancia)).toBe(true);
    expect(invariantes()).toEqual([]);
  });
  it('sem justificativa da pessoa, a da falta é preenchida pelo sistema', async () => {
    const { s } = montar();
    const en = await entregaACaminho(s);
    const insp = await localPorCodigo(s, 'INSP-01');
    const rec = await s.recebimentos.receber(en.id, { fardosLidos: ['AR00224-01-F006', 'AR00224-01-F007'], ocorrencias: [], localEsperaId: insp.id });
    expect(rec.justificativaDivergencia).toBe(justificativaPorFalta(['AR00224-01-F008']));
  });
  it('divergência que não vem da falta continua exigindo justificativa', async () => {
    // Na regra: a DOF da entrega fixa com o dobro do volume. Todos os fardos lidos, sem falta: a pessoa justifica.
    const e = criarDados(AGORA);
    const en = e.entregas.find((x) => x.situacao === 'a_caminho')!;
    const dof = e.dofs.find((d) => d.id === en.dofId)!;
    dof.volumes = dof.volumes.map((v) => ({ ...v, volumeM3: v.volumeM3 * 2 }));
    const insp = e.locais.find((l) => l.codigo === 'INSP-01')!;
    const ctx = { agora: () => AGORA, quem: 'teste' };
    const dados = { fardosLidos: [...en.fardosIds], ocorrencias: [], localEsperaId: insp.id };
    await falhaCom(Promise.resolve().then(() => receber(e, en.id, dados, ctx)), 422, 'justificativaDivergencia');
    const rec = receber(e, en.id, { ...dados, justificativaDivergencia: 'DOF emitida com o volume errado; fornecedor vai corrigir.' }, ctx);
    expect(rec.justificativaAutomatica).toBe(false);
  });
  it('ocorrência declarada exige foto; local de espera tem de ser de inspeção', async () => {
    const { s } = montar();
    const en = await entregaACaminho(s);
    const insp = await localPorCodigo(s, 'INSP-01');
    const a01 = await localPorCodigo(s, 'A-01');
    await falhaCom(s.recebimentos.receber(en.id, { fardosLidos: en.fardosIds, ocorrencias: [], localEsperaId: a01.id }), 422, 'localEsperaId');
    await falhaCom(s.recebimentos.receber(en.id, { fardosLidos: en.fardosIds, ocorrencias: [{ tipo: 'avaria', descricao: 'Fardo amassado', fotos: [] }], localEsperaId: insp.id }), 422, 'ocorrencias.0');
    const foto = new File(['x'], 'avaria.jpg', { type: 'image/jpeg' });
    const rec = await s.recebimentos.receber(en.id, { fardosLidos: en.fardosIds, ocorrencias: [{ tipo: 'avaria', descricao: 'Fardo amassado', fardoId: 'AR00224-01-F006', fotos: [foto] }], localEsperaId: insp.id });
    expect(rec.ocorrencias[0].fotos[0].nome).toBe('avaria.jpg');
  });
});

describe('inspeção', () => {
  async function receberTudo(s: ReturnType<typeof montar>['s']) {
    const en = await entregaACaminho(s);
    const insp = await localPorCodigo(s, 'INSP-01');
    await s.recebimentos.receber(en.id, { fardosLidos: en.fardosIds, ocorrencias: [], localEsperaId: insp.id });
  }
  it('simula, conclui e guarda: o saldo fica igual aos aprovados', async () => {
    const { s, invariantes } = montar();
    await receberTudo(s);
    await falhaCom(s.inspecao.registrar('AR00224-01-000099', { origem: 'manual', resultado: 'aprovado', categoria: 1 }, 'AR00224-01-F006'), 409, 'dormenteId');
    await falhaCom(s.inspecao.registrar('AR00224-01-000071', { origem: 'manual', resultado: 'aprovado' }, 'AR00224-01-F006'), 422, 'categoria');
    const tela = await s.inspecao.simularFardo('AR00224-01-F006');
    expect(tela.pendentes).toBe(0);
    expect(tela.fardo.situacao).toBe('em_inspecao');
    const insp = await localPorCodigo(s, 'INSP-01');
    await falhaCom(s.inspecao.concluir('AR00224-01-F006', { localId: insp.id }), 422, 'localId');
    const a01 = await localPorCodigo(s, 'A-01');
    const fardo = await s.inspecao.concluir('AR00224-01-F006', { localId: a01.id });
    const aprovados = tela.dormentes.filter((d) => d.inspecao?.resultado === 'aprovado').length;
    expect(fardo.saldo).toBe(aprovados);
    expect(fardo.situacao).toBe('em_estoque');
    expect(fardo.localId).toBe(a01.id);
    const ficha = await s.dormentes.obter('AR00224-01-000071');
    expect(ficha.inspecao?.origem).toBe('simulado');
    expect(ficha.local?.codigo).toBe('A-01');
    expect(invariantes()).toEqual([]);
  });
  it('conclui com dormentes não lidos só com justificativa; o não localizado encontrado depois segue o fluxo', async () => {
    const { s, invariantes } = montar();
    await receberTudo(s);
    const tela = await s.inspecao.obterFardo('AR00224-01-F007');
    const [faltaA, faltaB, ...lidos] = tela.dormentes.map((d) => d.id);
    for (const id of lidos) await s.inspecao.registrar(id, { origem: 'inspector', veredito: 'APROVADO', indice: 85 }, 'AR00224-01-F007');
    const a02 = await localPorCodigo(s, 'A-02');
    await falhaCom(s.inspecao.concluir('AR00224-01-F007', { localId: a02.id }), 422, 'justificativa');
    const fardo = await s.inspecao.concluir('AR00224-01-F007', { localId: a02.id, justificativa: 'Duas plaquinhas ilegíveis.' });
    expect(fardo.saldo).toBe(12);
    expect(fardo.conclusaoInspecao?.naoLocalizados).toEqual([faltaA, faltaB]);
    expect((await s.inspecao.naoLocalizados({ pageSize: 50 })).items.map((d) => d.id)).toEqual(expect.arrayContaining([faltaA, faltaB]));

    await s.inspecao.registrar(faltaA, { origem: 'manual', resultado: 'aprovado', categoria: 2 });
    await s.inspecao.registrar(faltaB, { origem: 'inspector', veredito: 'ATENCAO', indice: 60 });
    const depois = await s.fardos.obter('AR00224-01-F007');
    expect(depois.fardo.saldo).toBe(13);
    expect(depois.dormentes.find((d) => d.id === faltaA)?.situacao).toBe('em_estoque');
    const reprovado = await s.dormentes.obter(faltaB);
    expect(reprovado.dormente.situacao).toBe('reprovado'); // ATENÇÃO conta como reprovado
    expect(reprovado.local?.tipo).toBe('segregacao');
    expect((await s.movimentacoes.listar({ filters: { tipo: 'segregacao' }, pageSize: 50 })).items[0].dormentesIds).toEqual([faltaB]);
    expect(invariantes()).toEqual([]);
  });
});

describe('simulador', () => {
  it('não passa do saldo a emitir (emitidos − reprovados), continua as sequências e atribui espécie e classe aos fardos', async () => {
    const { s, invariantes } = montar('administrador');
    const c = await contrato(s, 'AR00311-01');
    const item = c.itens[0];
    expect(item.saldoAEmitir).toBe(2); // 70 − (70 emitidos − 2 reprovados): reposição dos reprovados
    const antes = (await s.fardos.listar({ pageSize: 1 })).total;
    await falhaCom(s.simulador.emitir({ contratoId: c.id, parcela: 2, comDocumentos: true, itens: [{ itemContratoId: item.id, fardos: 1, dormentesPorFardo: 3 }] }), 422, 'itens.0');
    await falhaCom(s.simulador.emitir({ contratoId: c.id, parcela: 7, comDocumentos: true, itens: [{ itemContratoId: item.id, fardos: 1, dormentesPorFardo: 2 }] }), 422, 'parcela');
    expect((await s.fardos.listar({ pageSize: 1 })).total).toBe(antes);
    // Reentrega (reposição) com reprovados do contrato ainda na segregação: recusada até a retirada.
    await falhaCom(s.simulador.emitir({ contratoId: c.id, parcela: 2, reentrega: true, comDocumentos: true, itens: [{ itemContratoId: item.id, fardos: 1, dormentesPorFardo: 2 }] }), 409, 'reentrega');
    const em = await s.simulador.emitir({ contratoId: c.id, parcela: 2, comDocumentos: true, itens: [{ itemContratoId: item.id, fardos: 1, dormentesPorFardo: 2 }] });
    expect(em.fardosIds).toEqual(['AR00311-01-F006']);
    expect(em.situacao).toBe('a_caminho');
    expect(em.boletim.itens.reduce((t, i) => t + i.quantidade, 0)).toBe(2);
    const en = (await s.documentos.listarEntregas({ pageSize: 50 })).items.find((x) => x.id === em.entregaId)!;
    expect([en.origem, en.parcela, !!en.boletim, !!en.relatorioTecnico]).toEqual(['simulador', 2, true, true]);
    const etiquetas = await s.simulador.etiquetas(em.id);
    expect(etiquetas.fardos[0].dormentesIds[0]).toBe('AR00311-01-000071');
    const { fardo } = await s.fardos.obter('AR00311-01-F006');
    const ficha = await s.dormentes.obter('AR00311-01-000071');
    expect([ficha.dormente.especieId, ficha.dormente.classe, ficha.dormente.tratamentoId]).toEqual([fardo.especieId, fardo.classe, fardo.tratamentoId]);
    expect((await contrato(s, 'AR00311-01')).itens[0].saldoAEmitir).toBe(0);
    const xml = await s.simulador.xmlNf(em.id);
    expect(xml).toContain(`<nNF>${em.nf.numero}</nNF>`);
    expect(xml).toContain('<cProd>006234</cProd>');
    expect(invariantes()).toEqual([]);
  });
  it('só os fardos: a CPTM cadastra NF e DOF pelo XML e a entrega se liga à emissão', async () => {
    const { s, como, invariantes } = montar('administrador');
    const c = await contrato(s, 'AR00224-01');
    const amv = c.itens[1];
    const em = await s.simulador.emitir({ contratoId: c.id, parcela: 2, comDocumentos: false, itens: [{ itemContratoId: amv.id, fardos: 1, dormentesPorFardo: 10 }] });
    expect(em.situacao).toBe('aguardando_documentos');
    expect(em.entregaId).toBeUndefined();
    expect((await s.documentos.fardosSemEntrega(c.id)).map((f) => f.id)).toContain(em.fardosIds[0]);
    const xml = await s.simulador.xmlNf(em.id);
    // O leitor de XML (DOMParser) é do navegador; aqui, confere-se o que ele leria.
    expect(xml).toContain(`<chNFe>${em.nf.chaveAcesso}</chNFe>`);
    expect(xml).toContain(`DOF n. ${em.dof.numero}`);
    const nf = em.nf;
    // Sem fardos indicados: os da emissão viram os esperados. Boletim e relatório como anexos.
    const en = await s.documentos.cadastrarEntrega({
      nf: { numero: nf.numero, serie: nf.serie, chaveAcesso: nf.chaveAcesso, contratoId: c.id, emissao: nf.emissao, itens: [{ itemContratoId: amv.id, quantidade: 10, volumeM3: 1.224 }] },
      dof: { numero: em.dof.numero, validade: em.dof.validade, volumes: em.dof.volumes }, parcela: 2,
      boletim: em.boletim, relatorioTecnico: em.relatorioTecnico,
    }, { boletim: new File(['x'], 'boletim.pdf', { type: 'application/pdf' }) });
    expect(en.fardosIds).toEqual(em.fardosIds);
    expect(en.boletim?.arquivo?.nome).toBe('boletim.pdf');
    expect((await s.simulador.listar()).items.find((x) => x.id === em.id)?.entregaId).toBe(en.id);
    como('almoxarife');
    const loc = await localPorCodigo(s, 'INSP-01');
    await s.recebimentos.receber(en.id, { fardosLidos: em.fardosIds, ocorrencias: [], localEsperaId: loc.id });
    expect((await s.simulador.listar()).items.find((x) => x.id === em.id)?.situacao).toBe('recebida');
    expect(invariantes()).toEqual([]);
  });
  it('recusa contrato concluído e respeita o modo demonstração', async () => {
    const { s } = montar('administrador');
    const c2 = await contrato(s, 'AR00311-02');
    expect(c2.situacao).toBe('concluido');
    await falhaCom(s.simulador.emitir({ contratoId: c2.id, parcela: 1, comDocumentos: true, itens: [{ itemContratoId: c2.itens[0].id, fardos: 1, dormentesPorFardo: 1 }] }), 422);
    await s.parametros.atualizar({ modoDemonstracao: false });
    const c1 = await contrato(s, 'AR00224-01');
    await falhaCom(s.simulador.emitir({ contratoId: c1.id, parcela: 1, comDocumentos: true, itens: [{ itemContratoId: c1.itens[0].id, fardos: 1, dormentesPorFardo: 1 }] }), 409);
  });
});

describe('recebimento em duas fases, reprovados e garantia', () => {
  it('laudo técnico só depois da inspeção de toda a entrega, com prazo de 20 dias úteis', async () => {
    const { s, invariantes } = montar('almoxarife');
    const entregas = (await s.documentos.listarEntregas({ pageSize: 50 })).items;
    const aguardando = entregas.find((x) => x.etapa === 'aguardando_laudo' && x.nivelPrazoLaudo !== 'vencido')!;
    const emInspecao = entregas.find((x) => x.etapa === 'aguardando_inspecao')!;
    expect(aguardando.podeEmitirLaudo).toBe(true);
    await falhaCom(s.recebimentos.emitirLaudo(emInspecao.id), 409);
    const com = await s.recebimentos.emitirLaudo(aguardando.id);
    expect(com.laudo?.numero).toMatch(/^LT-2026-\d{4}$/);
    expect(com.etapa).toBe('concluida');
    expect(com.laudo!.aprovados + com.laudo!.reprovados).toBe(28);
    await falhaCom(s.recebimentos.emitirLaudo(aguardando.id), 409);
    expect(invariantes()).toEqual([]);
  });
  it('reprovados: comunicação e retirada; a reentrega só depois da retirada', async () => {
    const { s, como, invariantes } = montar('almoxarife');
    const fila = (await s.inspecao.reprovados({ pageSize: 50 })).items;
    const doContrato = fila.filter((f) => f.id.startsWith('AR00311-01'));
    expect(doContrato.length).toBeGreaterThan(0);
    const semComunicar = fila.find((f) => !f.reprovacao!.comunicadoEm)!;
    await falhaCom(s.inspecao.registrarRetirada(semComunicar.id), 409);
    await s.inspecao.registrarComunicacao(semComunicar.id);
    await falhaCom(s.inspecao.registrarComunicacao(semComunicar.id), 409);
    for (const f of doContrato) await s.inspecao.registrarRetirada(f.id);
    const retirado = (await s.fardos.obter(doContrato[0].id)).dormentes.find((d) => d.situacao === 'retirado')!;
    expect((await s.dormentes.obter(retirado.id)).local).toBeUndefined();
    expect((await s.movimentacoes.listar({ filters: { tipo: 'retirada', fardoId: doContrato[0].id } })).total).toBe(1);
    // Retirados os reprovados do AR00311-01, a reentrega (reposição) é aceita.
    como('administrador');
    const c = await contrato(s, 'AR00311-01');
    const em = await s.simulador.emitir({ contratoId: c.id, parcela: 2, reentrega: true, comDocumentos: true, itens: [{ itemContratoId: c.itens[0].id, fardos: 1, dormentesPorFardo: 2 }] });
    expect((await s.documentos.listarEntregas({ pageSize: 50 })).items.find((x) => x.id === em.entregaId)?.reentrega).toBe(true);
    expect(invariantes()).toEqual([]);
  });
  it('a ficha do dormente mostra a garantia (5 anos da entrega) e a empresa inspetora do boletim', async () => {
    const { s } = montar();
    const f = await s.dormentes.obter('AR00224-01-000002');
    expect(f.garantiaAte).toBe(`${Number(f.fardo.recebidoEm!.slice(0, 4)) + 5}${f.fardo.recebidoEm!.slice(4, 10)}`);
    expect(f.empresaInspetora?.nome).toMatch(/^(IPT|UFV)$/);
  });
});

describe('falta de dormentes e volume nominal × medido', () => {
  it('a falta declarada informa a quantidade, sai do recebido e do nominal; depois da inspeção vale o medido', async () => {
    const { s, invariantes } = montar('almoxarife');
    const en = await entregaACaminho(s);
    const loc = await localPorCodigo(s, 'INSP-01');
    const [f6, f7, f8] = en.fardosIds;
    const foto = new File(['x'], 'falta.jpg', { type: 'image/jpeg' });
    const c = await contrato(s, 'AR00224-01');
    const recebidoAntes = c.itens[0].recebidos;
    // Avaria sem foto é recusada; falta sem quantidade ou maior que o fardo também.
    await falhaCom(s.recebimentos.receber(en.id, { fardosLidos: [f6, f7, f8], ocorrencias: [{ tipo: 'avaria', descricao: 'Amarração rompida', fardoId: f6, fotos: [] }], localEsperaId: loc.id }), 422, 'ocorrencias.0');
    await falhaCom(s.recebimentos.receber(en.id, { fardosLidos: [f6, f7, f8], ocorrencias: [{ tipo: 'falta', descricao: 'Faltam dormentes', fardoId: f6, fotos: [foto] }], localEsperaId: loc.id }), 422, 'ocorrencias.0');
    await falhaCom(s.recebimentos.receber(en.id, { fardosLidos: [f6, f7, f8], ocorrencias: [{ tipo: 'falta', descricao: 'Faltam dormentes', fardoId: f6, quantidade: 99, fotos: [foto] }], localEsperaId: loc.id }), 422, 'ocorrencias.0');
    const faltas = [{ fardoId: f6, quantidade: 2 }];
    const previa = await s.recebimentos.previa(en.id, [f6, f7, f8], faltas);
    expect(previa.dormentes).toBe(42 - 2);
    const jat = previa.divergenciaVolume.find((d) => d.nominalM3 > 0 && d.documentalM3 > 0 && d.percentual !== 0)!;
    expect(jat.base).toBe('nominal');
    expect(jat.medidoM3).toBeUndefined();
    const rec = await s.recebimentos.receber(en.id, {
      fardosLidos: [f6, f7, f8], localEsperaId: loc.id,
      // Falta sem foto: não se fotografa o que não chegou.
      ocorrencias: [{ tipo: 'falta', descricao: 'Faltam 2 dormentes no fardo', fardoId: f6, quantidade: 2, fotos: [] }],
    });
    expect(rec.ocorrencias[0].quantidade).toBe(2);
    expect(rec.divergenciaVolume).toEqual(previa.divergenciaVolume);
    expect((await contrato(s, 'AR00224-01')).itens[0].recebidos).toBe(recebidoAntes + 28 - 2);
    // Inspeção: os 2 não lidos ficam não localizados com a justificativa sugerida pela falta.
    const insp = await s.inspecao.obterFardo(f6);
    expect(insp.faltaDeclarada).toBe(2);
    expect(insp.justificativaSugerida).toContain('2 dormentes');
    const lidos = insp.dormentes.slice(0, insp.dormentes.length - 2);
    // O primeiro é lançado à mão sem medidas: entra no volume medido como estimado.
    for (const [n, d] of lidos.entries()) await s.inspecao.registrar(d.id, { origem: 'manual', resultado: 'aprovado', categoria: 1, medidas: n === 0 ? undefined : { comprimentoCm: 280, larguraCm: 24, alturaCm: 17 } }, f6);
    const ins = await localPorCodigo(s, 'A-05');
    // Os não lidos cabem na falta declarada: conclui sem escrever a justificativa (vale a do sistema).
    const concluido = await s.inspecao.concluir(f6, { localId: ins.id });
    expect(concluido.conclusaoInspecao?.justificativa).toBe(insp.justificativaSugerida);
    expect(concluido.saldo).toBe(lidos.length);
    await s.inspecao.simularFardo(f7);
    await s.inspecao.concluir(f7, { localId: ins.id });
    const depois = (await s.documentos.listarEntregas({ pageSize: 50 })).items.find((x) => x.id === en.id)!;
    const jat2 = depois.divergenciaVolume!.find((d) => d.especieId === jat.especieId)!;
    expect(jat2.base).toBe('medido');
    expect(jat2.medidoM3).toBeGreaterThan(0);
    expect(jat2.estimados).toBe(1);
    expect(invariantes()).toEqual([]);
  });
});

describe('saída por RME', () => {
  it('abre, separa a sugestão (reserva) e entrega (baixa); o fardo fica aberto', async () => {
    const { s, como, invariantes } = montar('requisitante');
    const c = await contrato(s, 'AR00224-01');
    const item = c.itens[0];
    const rme = await s.rme.abrir({ destino: 'Linha 10 · Trecho Teste', tipoDestino: 'principal_pesado', necessidadeEm: '2026-11-20', itens: [{ tamanhoId: item.tamanhoId, classe: 1, quantidade: 5 }] });
    expect(rme.situacao).toBe('aberta');
    como('almoxarife');
    await s.rme.iniciarSeparacao(rme.numero);
    const sug = await s.rme.sugerirSeparacao(rme.numero);
    const [primeiro] = sug.itens[0].fardos;
    expect(sug.itens[0].faltam).toBe(0);
    await falhaCom(s.rme.entregar(rme.numero), 409);
    // Quantidade diferente da pedida é recusada.
    await falhaCom(s.rme.separar(rme.numero, [{ fardoId: primeiro.fardoId, dormentesIds: primeiro.dormentesIds.slice(0, 4) }]), 422);
    const pronta = await s.rme.separar(rme.numero, [{ fardoId: primeiro.fardoId, dormentesIds: primeiro.dormentesIds }]);
    expect(pronta.situacao).toBe('pronta');
    expect(pronta.separacao?.[0].seguiuSugestao).toBe(true);
    const reservado = await s.dormentes.obter(primeiro.dormentesIds[0]);
    expect(reservado.dormente.situacao).toBe('reservado');
    expect((await s.fardos.obter(primeiro.fardoId)).fardo.saldo).toBeGreaterThan((await s.fardos.obter(primeiro.fardoId)).fardo.disponivel);

    const entregue = await s.rme.entregar(rme.numero);
    expect(entregue.situacao).toBe('entregue');
    const ficha = await s.dormentes.obter(primeiro.dormentesIds[0]);
    expect(ficha.dormente.situacao).toBe('baixado');
    expect(ficha.rme?.destino).toBe('Linha 10 · Trecho Teste');
    // O fardo aberto continua em estoque, com o selo "aberto".
    const depois = (await s.fardos.obter(primeiro.fardoId)).fardo;
    expect(depois.situacao).toBe('em_estoque');
    expect(depois.aberto).toBe(true);
    expect((await s.estoque.porFardo({ filters: { aberto: 'true' }, pageSize: 50 })).items.map((x) => x.id)).toContain(primeiro.fardoId);
    expect((await s.movimentacoes.listar({ filters: { tipo: 'saida', referencia: rme.numero } })).total).toBe(1);
    expect(invariantes()).toEqual([]);
  });
  it('trocar de fardo exige justificativa; cancelar libera a reserva', async () => {
    const { s, como, invariantes } = montar('requisitante');
    const c = await contrato(s, 'AR00224-01');
    const item = c.itens[0];
    const rme = await s.rme.abrir({ destino: 'Linha 11 · Trecho Teste', tipoDestino: 'principal_medio', necessidadeEm: '2026-11-25', itens: [{ tamanhoId: item.tamanhoId, classe: 1, quantidade: 3 }] });
    como('almoxarife');
    const sug = await s.rme.sugerirSeparacao(rme.numero);
    const sugerido = sug.itens[0].fardos[0].fardoId;
    const outro = (await s.estoque.porFardo({ pageSize: 50 })).items.find((f) => f.itemContratoId === item.id && f.classe === 1 && f.id !== sugerido && f.disponivel >= 3)!;
    const dormentes = (await s.fardos.obter(outro.id)).dormentes.filter((d) => d.situacao === 'em_estoque').slice(0, 3).map((d) => d.id);
    await falhaCom(s.rme.separar(rme.numero, [{ fardoId: outro.id, dormentesIds: dormentes }]), 422, 'separacao.0');
    const pronta = await s.rme.separar(rme.numero, [{ fardoId: outro.id, dormentesIds: dormentes, justificativa: 'Fardo mais perto da expedição.' }]);
    expect(pronta.separacao?.[0].seguiuSugestao).toBe(false);
    como('gestor');
    await falhaCom(s.rme.cancelar(rme.numero, 'teste'), 403);
    como('requisitante');
    await falhaCom(s.rme.cancelar(rme.numero, ' '), 422, 'motivo');
    const cancelada = await s.rme.cancelar(rme.numero, 'Obra suspensa.');
    expect(cancelada.situacao).toBe('cancelada');
    expect((await s.dormentes.obter(dormentes[0])).dormente.situacao).toBe('em_estoque');
    expect(invariantes()).toEqual([]);
  });
  it('pedido por tamanho e classe: categoria mínima e espécie restringem a sugestão', async () => {
    const { s, como } = montar('requisitante');
    const c = await contrato(s, 'AR00224-01');
    const t = c.itens[0].tamanhoId;
    await falhaCom(s.rme.abrir({ destino: 'Teste', tipoDestino: 'desvio', necessidadeEm: '2026-11-20', itens: [{ tamanhoId: t, classe: 3 as 1, quantidade: 1 }] }), 422, 'itens.0');
    const rme = await s.rme.abrir({ destino: 'Teste', tipoDestino: 'desvio', necessidadeEm: '2026-11-20', itens: [{ tamanhoId: t, classe: 1, categoriaMinima: 1, quantidade: 2 }] });
    const porEspecie = await s.rme.abrir({ destino: 'Teste 2', tipoDestino: 'desvio', necessidadeEm: '2026-11-20', itens: [{ tamanhoId: t, classe: 1, especieId: MACARANDUBA, quantidade: 1 }] });
    como('almoxarife');
    const sug = await s.rme.sugerirSeparacao(rme.numero);
    expect(sug.itens[0].faltam).toBe(0);
    for (const f of sug.itens[0].candidatos) {
      for (const id of f.dormentesIds) {
        const d = (await s.dormentes.obter(id)).dormente;
        expect([d.classe, d.categoria]).toEqual([1, 1]);
      }
    }
    const sugEsp = await s.rme.sugerirSeparacao(porEspecie.numero);
    expect(sugEsp.itens[0].candidatos.length).toBeGreaterThan(0);
    for (const f of sugEsp.itens[0].candidatos) expect((await s.fardos.obter(f.fardoId)).fardo.especieId).toBe(MACARANDUBA);
    // Dormente que não atende à categoria mínima é recusado na separação.
    const fardo = sug.itens[0].fardos[0];
    const outro = (await s.fardos.obter(fardo.fardoId)).dormentes.find((d) => d.situacao === 'em_estoque' && d.categoria !== 1);
    if (outro) await falhaCom(s.rme.separar(rme.numero, [{ fardoId: fardo.fardoId, dormentesIds: [fardo.dormentesIds[0], outro.id] }]), 422, 'separacao.0');
  });
});

describe('cura e classe pelo tipo de destino', () => {
  it('fardo em cura não entra na sugestão nem na separação até a liberação', async () => {
    const { s, como } = montar('requisitante');
    const c = await contrato(s, 'AR00224-02');
    const amv = c.itens.find((i) => i.quantidade === 1500 && i.emitidos > 0)!;
    const rme = await s.rme.abrir({ destino: 'AMV de teste', tipoDestino: 'principal_medio', necessidadeEm: '2026-11-20', itens: [{ tamanhoId: amv.tamanhoId, classe: 1, quantidade: 2 }] });
    como('almoxarife');
    const sug = await s.rme.sugerirSeparacao(rme.numero);
    expect(sug.itens[0].faltam).toBe(2);
    const fardo = (await s.fardos.obter('AR00224-02-F001')).fardo;
    expect(fardo.emCuraAte).toBeTruthy();
    expect(fardo.disponivel).toBe(0);
    const ids = (await s.fardos.obter(fardo.id)).dormentes.filter((d) => d.situacao === 'em_estoque').slice(0, 2).map((d) => d.id);
    const erro = await falhaCom(s.rme.separar(rme.numero, [{ fardoId: fardo.id, dormentesIds: ids, justificativa: 'teste' }]), 422, 'separacao.0');
    expect(erro.detalhes?.['separacao.0']).toContain('cura');
    const ficha = await s.dormentes.obter(ids[0]);
    expect([ficha.item.usinaTratamento, ficha.item.dataTratamento]).toEqual([fardo.usinaTratamento, fardo.dataTratamento]);
  });
  it('classe abaixo da sugerida para o destino pede justificativa na separação', async () => {
    const { s, como, invariantes } = montar('requisitante');
    const t = (await contrato(s, 'AR00224-01')).itens[1].tamanhoId; // 006219, que tem 2ª classe em estoque
    await falhaCom(s.rme.abrir({ destino: 'Sem tipo', tipoDestino: 'outro' as 'patio', necessidadeEm: '2026-11-20', itens: [{ tamanhoId: t, classe: 2, quantidade: 1 }] }), 422, 'tipoDestino');
    const rme = await s.rme.abrir({ destino: 'Linha 10 · Via principal', tipoDestino: 'principal_pesado', necessidadeEm: '2026-11-20', itens: [{ tamanhoId: t, classe: 2, quantidade: 1 }] });
    como('almoxarife');
    const f = (await s.rme.sugerirSeparacao(rme.numero)).itens[0].fardos[0];
    const linha = { fardoId: f.fardoId, dormentesIds: f.dormentesIds };
    const erro = await falhaCom(s.rme.separar(rme.numero, [linha]), 422, 'separacao.0');
    expect(erro.detalhes?.['separacao.0']).toContain('1ª sugerida');
    const pronta = await s.rme.separar(rme.numero, [{ ...linha, justificativaClasse: 'Sem 1ª classe disponível; liberado pela engenharia.' }]);
    expect(pronta.separacao?.[0].justificativaClasse).toContain('engenharia');
    expect(invariantes()).toEqual([]);
  });
});

describe('expedição', () => {
  it('só recebe fardo inteiro reservado para RME pronta; separação parcial é recusada e cancelar devolve à origem', async () => {
    const { s, como, invariantes } = montar('requisitante');
    const c = await contrato(s, 'AR00224-01');
    const item = c.itens[0];
    const pedir = (quantidade: number) => s.rme.abrir({ destino: 'Linha 7 · Pátio', tipoDestino: 'patio', necessidadeEm: '2026-11-20', itens: [{ tamanhoId: item.tamanhoId, classe: 1, quantidade }] });
    const separarSugestao = async (numero: string) => {
      await s.rme.iniciarSeparacao(numero);
      const sug = await s.rme.sugerirSeparacao(numero);
      return s.rme.separar(numero, sug.itens[0].fardos.map((f) => ({ fardoId: f.fardoId, dormentesIds: f.dormentesIds })));
    };
    const exp = await localPorCodigo(s, 'EXP-01');
    // Separação parcial (1 dormente): o fardo fica no local atual.
    const parcial = await pedir(1);
    como('almoxarife');
    const p = await separarSugestao(parcial.numero);
    const fardoId = p.separacao![0].fardoId;
    const erro = await falhaCom(s.fardos.transferir(fardoId, exp.id), 422, 'localId');
    expect(erro.message).toContain('expedição');
    await s.rme.cancelar(parcial.numero, 'Teste');
    // Fardo inteiro: um fardo do item sem reservas, com todos os dormentes separados (troca justificada).
    const fardo = (await s.estoque.porFardo({ filters: { tamanhoId: item.tamanhoId, classe: '1' }, pageSize: 50 })).items.find((f) => f.saldo === f.disponivel && f.id !== fardoId)!;
    const ids = (await s.fardos.obter(fardo.id)).dormentes.filter((d) => d.situacao === 'em_estoque').map((d) => d.id);
    como('requisitante');
    const inteira = await pedir(ids.length);
    como('almoxarife');
    await s.rme.iniciarSeparacao(inteira.numero);
    await s.rme.separar(inteira.numero, [{ fardoId: fardo.id, dormentesIds: ids, justificativa: 'Fardo inteiro para a expedição.' }]);
    const origem = fardo.localId;
    const naExpedicao = await s.fardos.transferir(fardo.id, exp.id);
    expect(naExpedicao.localId).toBe(exp.id);
    expect((await s.movimentacoes.listar({ filters: { referencia: inteira.numero, tipo: 'transferencia' } })).total).toBe(1);
    expect(invariantes()).toEqual([]);
    // Cancelar devolve o fardo ao local de onde saiu e libera as reservas.
    await s.rme.cancelar(inteira.numero, 'Obra adiada.');
    const devolvido = (await s.fardos.obter(fardo.id)).fardo;
    expect(devolvido.localId).toBe(origem);
    expect(devolvido.disponivel).toBe(fardo.disponivel);
    expect((await s.movimentacoes.listar({ filters: { referencia: inteira.numero, tipo: 'transferencia' } })).total).toBe(2);
    expect(invariantes()).toEqual([]);
  });
});

describe('estoque, cadastros e contratos', () => {
  it('transfere fardo com saldo e atualiza local, movimentações e ficha', async () => {
    const { s, invariantes } = montar();
    const a05 = await localPorCodigo(s, 'A-05');
    const insp = await localPorCodigo(s, 'INSP-01');
    await falhaCom(s.fardos.transferir('AR00224-01-F003', insp.id), 422, 'localId');
    const ocupacaoAntes = a05.ocupacao;
    const f = await s.fardos.transferir('AR00224-01-F003', a05.id);
    expect(f.localId).toBe(a05.id);
    expect((await localPorCodigo(s, 'LOC-A-05')).ocupacao).toBe(ocupacaoAntes + f.saldo);
    const mov = (await s.movimentacoes.listar({ filters: { tipo: 'transferencia' } })).items[0];
    // Filtros do estoque por fardo e das movimentações.
    expect((await s.estoque.porFardo({ filters: { localId: a05.id }, pageSize: 50 })).items.map((x) => x.id)).toContain('AR00224-01-F003');
    expect((await s.movimentacoes.listar({ filters: { localId: a05.id, periodo: '7' } })).items[0].id).toBe(mov.id);
    // Saldo por classe e tamanho no serviço: filtros e busca pelo código (história: 006219 de 1ª classe em falta).
    expect((await s.estoque.porItem({ filters: { situacao: 'falta' } })).items.map((x) => x.id)).toHaveLength(1);
    expect((await s.estoque.porItem({ search: '006219', filters: { classe: '1' } })).items[0].situacao).toBe('falta');
    expect((await s.estoque.porItem({ filters: { uso: 'amv' }, pageSize: 50 })).items.every((x) => x.uso === 'amv')).toBe(true);
    expect((await s.estoque.porFardo({ filters: { uso: 'via_corrente' }, pageSize: 50 })).items.every((x) => x.id !== 'AR00224-01-F004')).toBe(true);
    const acima = (await s.estoque.porFardo({ filters: { acimaLimite: 'sim' }, pageSize: 50 })).items;
    expect(acima.map((x) => x.id)).toEqual(['AR00311-02-F002', 'AR00311-02-F003']);
    expect(mov.fardoId).toBe('AR00224-01-F003');
    const umDormente = (await s.fardos.obter('AR00224-01-F003')).dormentes.find((d) => d.situacao === 'em_estoque')!;
    expect((await s.dormentes.obter(umDormente.id)).local?.codigo).toBe('A-05');
    expect(invariantes()).toEqual([]);
  });
  it('contrato herda o fornecedor da ata e segue as regras dela: pedido mínimo, parcelas, saldo e prazos', async () => {
    const { s, invariantes } = montar('administrador');
    const ata = (await s.atas.listar()).items.find((a) => a.numero === 'AR00224')!;
    const tamanhos = (await s.tamanhos.listar({ pageSize: 50 })).items;
    const t = (codigo: string) => tamanhos.find((x) => x.codigo === codigo)!.id;
    const base = { numero: 'AR00224-04', ataId: ata.id, ano: 2026, dataAssinatura: '2026-11-06', gestor: 'Gestor Exemplo 4' };
    const p = (...itens: [string, number][]) => ({ itens: itens.map(([codigo, quantidade]) => ({ tamanhoId: t(codigo), quantidade })) });
    await falhaCom(s.contratos.criar({ ...base, parcelas: [p(['006234', 2000]), p(['006234', 4000])] }), 422, 'parcelas.0');
    await falhaCom(s.contratos.criar({ ...base, parcelas: [p(['006234', 3000])] }), 422, 'parcelas'); // abaixo do pedido mínimo
    await falhaCom(s.contratos.criar({ ...base, parcelas: Array.from({ length: 7 }, () => p(['006234', 3000])) }), 422, 'parcelas');
    await falhaCom(s.contratos.criar({ ...base, parcelas: [p(['006219', 3000]), p(['006234', 3000])] }), 422, 'parcelas'); // passa do saldo da ata
    await falhaCom(s.contratos.criar({ ...base, numero: 'AR00311-09', parcelas: [p(['006234', 3000]), p(['006234', 3000])] }), 422, 'numero');
    await falhaCom(s.contratos.criar({ ...base, gestor: ' ', parcelas: [p(['006234', 3000]), p(['006234', 3000])] }), 422, 'gestor');
    const c = await s.contratos.criar({ ...base, parcelas: [p(['006234', 3000]), p(['006234', 2000], ['006222', 1000])] });
    expect(c.fornecedorId).toBe(ata.fornecedorId);
    expect(c.itens.map((i) => i.quantidade)).toEqual([5000, 1000]);
    expect(c.parcelas.map((x) => [x.inicio, x.fim, x.situacao])).toEqual([['2026-11-06', '2027-02-04', 'a_entregar'], ['2027-02-05', '2027-03-06', 'a_entregar']]);
    // Saldo da ata por tamanho, descontado o novo contrato.
    const depois = (await s.atas.listar()).items.find((a) => a.numero === 'AR00224')!;
    expect(depois.itens.find((i) => i.tamanhoId === t('006234'))!.saldo).toBe(30000 - 5600 - 3000 - 6000 - 5000);
    // Novo cronograma não deixa item abaixo do já emitido.
    await falhaCom(s.contratos.atualizar('AR00224-01', { parcelas: [p(['006234', 3000]), p(['006234', 3000])] }), 422, 'parcelas');
    expect(invariantes()).toEqual([]);
  });
  it('ata: vigência de 12 meses e regras padrão; empresa inspetora vem do boletim, só ativa', async () => {
    const { s } = montar('administrador');
    const fA = (await s.fornecedores.listar()).items.find((f) => f.razaoSocial.startsWith('Madeireira'))!;
    const ata = await s.atas.criar({ numero: 'AR00999', fornecedorId: fA.id, vigenciaInicio: '2026-11-06' });
    expect([ata.vigenciaFim, ata.regras.pedidoMinimo, ata.regras.prazosParcelas[1]]).toEqual(['2027-11-05', 6000, [91, 120]]);
    await falhaCom(s.empresasInspetoras.criar({ nome: 'ufv' }), 422, 'nome');
    await falhaCom(s.empresasInspetoras.criar({ nome: 'Nova', cnpj: '123' }), 422, 'cnpj');
    const nova = await s.empresasInspetoras.criar({ nome: 'Inspetora Nova', cnpj: '00.000.000/0002-99' });
    expect(nova.cnpj).toBe('00000000000299');
    await s.empresasInspetoras.inativar(nova.id);
    const c = await contrato(s, 'AR00224-01');
    const dados = {
      nf: { numero: '9041', serie: '1', chaveAcesso: chave(CNPJ_A, 9041), contratoId: c.id, emissao: '2026-11-05', itens: [{ itemContratoId: c.itens[0].id, quantidade: 14, volumeM3: 1.6 }] },
      dof: { numero: '26999041', validade: '2026-11-20', volumes: [{ especieId: JATAIPEBA, volumeM3: 1.6 }] }, parcela: 1,
      boletim: { numero: 'BI-1', data: '2026-11-04', empresaInspetoraId: nova.id, itens: [{ tamanhoId: c.itens[0].tamanhoId, especieId: JATAIPEBA, quantidade: 14 }] },
    };
    await falhaCom(s.documentos.cadastrarEntrega(dados), 422, 'boletim.empresaInspetoraId');
    await s.empresasInspetoras.reativar(nova.id);
    expect((await s.documentos.cadastrarEntrega(dados)).boletim?.empresaInspetoraId).toBe(nova.id);
  });
  it('reativar respeita as regras de cada cadastro', async () => {
    const { s, invariantes } = montar('administrador');
    const especie = (await s.especies.listar()).items[0];
    await falhaCom(s.especies.reativar(especie.id), 409);
    await s.especies.inativar(especie.id);
    expect((await s.especies.reativar(especie.id)).ativo).toBe(true);
    // Fornecedor reativado continua bloqueado enquanto o CTF estiver vencido.
    const bloqueado = (await s.fornecedores.listar()).items.find((f) => f.bloqueado)!;
    await s.fornecedores.inativar(bloqueado.id);
    const reativado = await s.fornecedores.reativar(bloqueado.id);
    expect([reativado.situacao, reativado.bloqueado]).toEqual(['ativo', true]);
    // Local com dormentes não inativa; o vazio inativa e reativa com o mesmo código.
    const a01 = await s.locais.obterPorCodigo('A-01');
    await falhaCom(s.locais.inativar(a01.id), 409);
    const exp = await s.locais.obterPorCodigo('EXP-01');
    await s.locais.inativar(exp.id);
    expect((await s.locais.reativar(exp.id)).codigo).toBe('EXP-01');
    expect(invariantes()).toEqual([]);
  });
  it('resumo do fornecedor: contratos e taxa de reprovação por espécie; contratos filtrados por tamanho', async () => {
    const { s } = montar('gestor');
    const fA = (await s.fornecedores.listar()).items.find((f) => f.razaoSocial.startsWith('Madeireira'))!;
    const r = await s.fornecedores.resumo(fA.id);
    expect(r.contratos.map((c) => c.numero)).toEqual(['AR00224-01', 'AR00224-02', 'AR00224-03']);
    expect(r.reprovacao.reduce((t, x) => t + x.reprovados, 0)).toBe(6);
    expect(r.reprovacao.every((x) => x.percentual === Math.round((x.reprovados / x.inspecionados) * 1000) / 10)).toBe(true);
    const t006220 = (await s.tamanhos.listar({ pageSize: 50 })).items.find((x) => x.codigo === '006220')!;
    expect((await s.contratos.listar({ filters: { tamanhoId: t006220.id } })).items.map((c) => c.numero)).toEqual(['AR00224-02']);
    expect((await s.contratos.listar({ filters: { atrasada: 'sim' } })).items.map((c) => c.numero)).toEqual(['AR00311-01']);
  });
  it('fornecedor com CTF vencido fica bloqueado para nova ata', async () => {
    const { s } = montar('administrador');
    const bloqueado = (await s.fornecedores.listar()).items.find((f) => f.bloqueado)!;
    expect(bloqueado.razaoSocial).toBe('Serraria Exemplo C Ltda.');
    await falhaCom(s.atas.criar({ numero: 'AR00999', fornecedorId: bloqueado.id, vigenciaInicio: '2026-11-06' }), 422, 'fornecedorId');
  });
  it('local: código único, que não muda depois, e ID do QR lido como LOC-código', async () => {
    const { s } = montar('administrador');
    await falhaCom(s.locais.criar({ codigo: 'a-01', descricao: 'Repetido', tipo: 'armazenagem', capacidade: 10 }), 422, 'codigo');
    const novo = await s.locais.criar({ codigo: 'b-01', descricao: 'Pátio B', tipo: 'armazenagem', capacidade: 100 });
    expect(novo.codigo).toBe('B-01');
    expect((await s.locais.obterPorCodigo('LOC-B-01')).id).toBe(novo.id);
    await falhaCom(s.locais.atualizar(novo.id, { codigo: 'B-02' }), 422, 'codigo');
  });
});

describe('painel', () => {
  it('pendências conforme o perfil', async () => {
    const { s, como } = montar('almoxarife');
    expect((await s.dashboard.pendencias()).map((p) => p.id)).toEqual(expect.arrayContaining(['receber', 'inspecionar', 'separar', 'entregar', 'dof']));
    como('requisitante');
    expect((await s.dashboard.pendencias()).map((p) => p.id)).toEqual(['minhas-rmes']);
    como('gestor');
    expect((await s.dashboard.pendencias()).map((p) => p.id)).toEqual(expect.arrayContaining(['falta-excesso', 'parados', 'nao-localizados']));
    const ind = await s.dashboard.indicadores();
    expect([ind.itensAbaixoMinimo, ind.itensAcimaMaximo, ind.fardosAcimaLimite, ind.naoLocalizados, ind.rmesAbertas]).toEqual([1, 1, 2, 3, 1]);
    expect([ind.parcelasAtrasadas, ind.reprovadosAguardandoRetirada, ind.laudosAVencer]).toEqual([1, 4, 1]);
    // Reposição: o item em falta mostra o saldo na ata vigente e leva ao novo contrato.
    const falta = (await s.dashboard.alertas()).find((a) => a.titulo.startsWith('Falta'))!;
    expect(falta.descricao).toContain('Saldo na ata vigente');
    expect(falta.link).toBe('/contratos?novo=1');
    expect((await s.dashboard.alertas()).some((a) => a.nivel === 'critico' && a.titulo.startsWith('DOF'))).toBe(true);
  });
});

describe('persistência', () => {
  it('guarda no armazenamento, sobrevive a recarregar e reinicia a demonstração', async () => {
    const store = new Map<string, string>();
    const a = montar('administrador', store);
    await a.s.locais.criar({ codigo: 'C-01', descricao: 'Pátio C', tipo: 'armazenagem', capacidade: 50 });
    const b = montar('administrador', store);
    expect((await b.s.locais.obterPorCodigo('C-01')).descricao).toBe('Pátio C');
    await b.s.parametros.reiniciarDemonstracao();
    const c = montar('administrador', store);
    await falhaCom(c.s.locais.obterPorCodigo('C-01'), 404);
  });
  it('estado salvo em formato antigo (mesma versão) é descartado e a demonstração é recriada; as telas carregam', async () => {
    const casos: ((e: Record<string, any>) => void)[] = [
      (e) => { for (const f of e.fardos) delete f.dataTratamento; for (const d of e.dormentes) delete d.dataTratamento; },  // fardo de antes da marcação (Estoque quebrava)
      (e) => { delete e.eventos; for (const r of e.rmes) r.historico = []; },  // RME de antes da entidade Evento
      (e) => { delete e.parametros.feriados; },
      (e) => { e.rmes[0].criadoEm = 'ontem'; },  // data que não monta a tela
      (e) => { e.versao = 7; },
    ];
    for (const estragar of casos) {
      const store = new Map<string, string>();
      montar('administrador', store);
      const salvo = JSON.parse(store.get('holz:demo:estado')!);
      salvo.locais.push({ ...salvo.locais[0], id: 'lo-antigo', codigo: 'ANTIGO' });  // marca para saber se foi recriado
      estragar(salvo);
      store.set('holz:demo:estado', JSON.stringify(salvo));
      const { s, invariantes } = montar('administrador', store);
      await falhaCom(s.locais.obterPorCodigo('ANTIGO'), 404);
      expect((await s.estoque.porItem()).total).toBeGreaterThan(0);
      expect((await s.estoque.porFardo()).total).toBeGreaterThan(0);
      expect((await s.rme.listar()).total).toBe(7);
      expect(invariantes()).toEqual([]);
    }
  });
  it('registro novo sem um campo opcional que a demonstração sempre tem (inventário aberto) não apaga os dados', async () => {
    const store = new Map<string, string>();
    const a = montar('almoxarife', store);
    const local = await localPorCodigo(a.s, 'A-01');
    const inv = await a.s.inventarios.abrir([local.id]);
    const b = montar('almoxarife', store);
    expect((await b.s.inventarios.obter(inv.id)).situacao).toBe('aberto');
  });
  it('estado salvo no formato atual é mantido', async () => {
    const store = new Map<string, string>();
    montar('administrador', store);
    const salvo = JSON.parse(store.get('holz:demo:estado')!);
    salvo.locais.push({ ...salvo.locais[0], id: 'lo-novo', codigo: 'NOVO' });
    store.set('holz:demo:estado', JSON.stringify(salvo));
    const { s } = montar('administrador', store);
    expect((await s.locais.obterPorCodigo('NOVO')).id).toBe('lo-novo');
  });
});

describe('eventos (histórico e auditoria)', () => {
  it('toda operação que muda o estado registra um evento; as linhas do tempo vêm deles', async () => {
    const { s, como } = montar('administrador');
    const antes = (await s.eventos.listar({ pageSize: 1 })).total;
    await s.locais.criar({ codigo: 'C-02', descricao: 'Pátio C2', tipo: 'armazenagem', capacidade: 50 });
    const ev = (await s.eventos.listar({ pageSize: 1 })).items[0];
    expect((await s.eventos.listar({ pageSize: 1 })).total).toBe(antes + 1);
    expect([ev.entidade, ev.tipo, ev.quem]).toEqual(['local', 'criado', usuarioDemo('administrador').nome]);

    como('almoxarife');
    const rme = (await s.rme.listar({ pageSize: 50 })).items.find((r) => r.situacao === 'aberta')!;
    await s.rme.cancelar(rme.numero, 'Obra adiada');
    const daRme = await s.eventos.listar({ filters: { entidade: 'rme', entidadeId: rme.id } });
    expect(daRme.items[0].tipo).toBe('cancelado');
    expect(daRme.items[daRme.items.length - 1].tipo).toBe('criado');

    const ficha = await s.dormentes.obter('AR00224-01-000071');
    expect(ficha.eventos[0].tipo).toBe('emitido');
    const fardo = await s.fardos.obter('AR00224-01-F006');
    expect(fardo.eventos.map((x) => x.tipo)).toContain('emitido');
    const c = await contrato(s, 'AR00224-01');
    const doContrato = await s.eventos.listar({ filters: { entidade: 'contrato', entidadeId: c.id }, pageSize: 100 });
    expect(doContrato.items.map((x) => x.tipo)).toEqual(expect.arrayContaining(['criado', 'emitido', 'laudo']));
  });
});

describe('feriados e nível de estoque com a cura', () => {
  it('os dados iniciais trazem os feriados de 2026 e 2027, usados no prazo do laudo', async () => {
    const { s } = montar('administrador');
    const p = await s.parametros.obter();
    const datas = p.feriados.map((f) => f.data);
    expect(datas).toEqual(expect.arrayContaining(['2026-11-20', '2026-07-09', '2026-01-25', '2026-06-04', '2027-03-26', '2027-05-27', '2027-11-02']));
    expect(new Set(p.feriados.map((f) => f.abrangencia))).toEqual(new Set(['nacional', 'estadual', 'municipal']));
    const sem = await s.parametros.atualizar({ feriados: [] });
    expect(sem.feriados).toEqual([]);
  });
  it('compara mínimo e máximo com o disponível mais o que está em cura; só a cura não gera falta', async () => {
    const { s } = montar('administrador');
    const emCura = (await s.estoque.porItem({ pageSize: 100 })).items.find((x) => x.emCura > 0)!;
    expect(emCura.liberacaoCura).toBeTruthy();
    const p = await s.parametros.obter();
    const outros = p.niveis.filter((n) => !(n.classe === emCura.classe && n.tamanhoId === emCura.tamanhoId));
    const minimo = emCura.emEstoque + emCura.emCura;  // abaixo só por causa da cura
    await s.parametros.atualizar({ niveis: [...outros, { classe: emCura.classe, tamanhoId: emCura.tamanhoId, minimo, maximo: minimo * 3 }] });
    const ok = (await s.estoque.porItem({ pageSize: 100 })).items.find((x) => x.id === emCura.id)!;
    expect(ok.situacao).toBe('ok');
    await s.parametros.atualizar({ niveis: [...outros, { classe: emCura.classe, tamanhoId: emCura.tamanhoId, minimo: minimo + 1, maximo: minimo * 3 }] });
    const falta = (await s.estoque.porItem({ pageSize: 100 })).items.find((x) => x.id === emCura.id)!;
    expect(falta.situacao).toBe('falta');
  });
});

describe('IBAMA: destinação final e saldo do DOF', () => {
  it('a RME entregue gera a destinação final por espécie; lançar no DOF é registrado uma vez, com evento', async () => {
    const { s, como, invariantes } = montar('almoxarife');
    const pendentes = await s.ibama.destinacoes({ filters: { lancado: 'nao' } });
    expect(pendentes.total).toBeGreaterThan(0);
    const pronta = (await s.rme.listar({ pageSize: 50 })).items.find((r) => r.situacao === 'pronta')!;
    await s.rme.entregar(pronta.numero);
    const novas = (await s.ibama.destinacoes({ pageSize: 50 })).items.filter((d) => d.rmeNumero === pronta.numero);
    expect(novas.length).toBeGreaterThan(0);
    expect(novas.reduce((t, d) => t + d.quantidade, 0)).toBe(pronta.separacao!.reduce((t, l) => t + l.dormentesIds.length, 0));
    expect(novas.every((d) => d.volumeM3 > 0 && !d.lancadoEm)).toBe(true);

    como('gestor');
    await falhaCom(s.ibama.marcarLancado(novas[0].id), 403);
    como('almoxarife');
    const lancada = await s.ibama.marcarLancado(novas[0].id);
    expect([lancada.lancadoPor, !!lancada.lancadoEm]).toEqual([usuarioDemo('almoxarife').nome, true]);
    await falhaCom(s.ibama.marcarLancado(novas[0].id), 409);
    const ev = await s.eventos.listar({ filters: { entidade: 'rme', entidadeId: pronta.id } });
    expect(ev.items[0].tipo).toBe('lancado');
    expect(invariantes()).toEqual([]);
  });
  it('saldo do pátio por espécie e tamanho comparado com o último saldo informado; acima de 10% alerta', async () => {
    const { s } = montar('almoxarife');
    const saldo = await s.ibama.saldoPatio();
    const macaranduba = saldo.find((x) => x.especieId === MACARANDUBA)!;
    expect(macaranduba.acimaTolerancia).toBe(true);
    expect(saldo.filter((x) => x.acimaTolerancia)).toHaveLength(1);
    expect(macaranduba.porTamanho.reduce((t, x) => t + x.quantidade, 0)).toBe(macaranduba.quantidade);

    await falhaCom(s.ibama.informarSaldo({ data: '2026-11-07', itens: [] }), 422, 'data');
    await falhaCom(s.ibama.informarSaldo({ data: '2026-11-06', itens: [{ especieId: JATAIPEBA, volumeM3: 1 }, { especieId: JATAIPEBA, volumeM3: 2 }] }), 422, 'itens.1');
    await s.ibama.informarSaldo({ data: '2026-11-06', itens: saldo.map((x) => ({ especieId: x.especieId, volumeM3: x.fisicoM3 })) });
    expect((await s.ibama.saldoPatio()).some((x) => x.acimaTolerancia)).toBe(false);
    expect((await s.ibama.saldosInformados()).items[0].data).toBe('2026-11-06');
  });
});

describe('IBAMA: perdas e não localizados no saldo do pátio', () => {
  it('os não localizados ficam no saldo físico, mostrados à parte', async () => {
    const { s } = montar('gestor');
    const saldo = await s.ibama.saldoPatio();
    const nl = (await s.inspecao.naoLocalizados({ pageSize: 50 })).items;
    expect(saldo.reduce((t, x) => t + x.naoLocalizados.quantidade, 0)).toBe(nl.length);
    const comNl = saldo.find((x) => x.naoLocalizados.quantidade > 0)!;
    expect(comNl.naoLocalizados.volumeM3).toBeGreaterThan(0);
    expect(comNl.fisicoM3).toBeGreaterThanOrEqual(comNl.naoLocalizados.volumeM3);
  });
  it('o gestor transforma o não localizado em perdido: sai do saldo e fica a comunicar ao IBAMA', async () => {
    const { s, como, invariantes } = montar('gestor');
    const historia = await s.ibama.perdas({ filters: { comunicado: 'nao' } });
    expect(historia.total).toBe(1);
    const d = (await s.inspecao.naoLocalizados({ pageSize: 50 })).items[0];
    const antes = (await s.ibama.saldoPatio()).find((x) => x.especieId === d.especieId)!;

    await falhaCom(s.ibama.registrarPerda(d.id, { motivo: 'outro' }), 422, 'descricao');
    await falhaCom(s.ibama.registrarPerda(d.id, { motivo: 'sumiu' as never }), 422, 'motivo');
    como('almoxarife');
    await falhaCom(s.ibama.registrarPerda(d.id, { motivo: 'extravio' }), 403);
    como('gestor');
    const p = await s.ibama.registrarPerda(d.id, { motivo: 'intemperie', descricao: 'Enchente no pátio' });
    expect([p.motivo, p.volumeM3 > 0, p.comunicadoEm]).toEqual(['intemperie', true, undefined]);
    await falhaCom(s.ibama.registrarPerda(d.id, { motivo: 'extravio' }), 409);
    await falhaCom(s.ibama.registrarPerda('AR00224-01-000001', { motivo: 'extravio' }), 409);

    const ficha = await s.dormentes.obter(d.id);
    expect([ficha.dormente.situacao, ficha.perda?.id, ficha.eventos[ficha.eventos.length - 1].tipo]).toEqual(['perdido', p.id, 'perdido']);
    const depois = (await s.ibama.saldoPatio()).find((x) => x.especieId === d.especieId)!;
    expect(depois.quantidade).toBe(antes.quantidade - 1);
    expect(depois.naoLocalizados.quantidade).toBe(antes.naoLocalizados.quantidade - 1);
    expect((await s.inspecao.naoLocalizados({ pageSize: 50 })).items.map((x) => x.id)).not.toContain(d.id);

    const comunicada = await s.ibama.marcarPerdaComunicada(p.id);
    expect(comunicada.comunicadoPor).toBe(usuarioDemo('gestor').nome);
    await falhaCom(s.ibama.marcarPerdaComunicada(p.id), 409);
    expect((await s.ibama.perdas({ filters: { comunicado: 'sim' } })).items.map((x) => x.id)).toEqual([p.id]);
    expect(invariantes()).toEqual([]);
  });
});

describe('inventário físico por leitura de QR', () => {
  /** Fardos com dormentes no pátio de um local (pelo código). */
  async function fardosDoLocal(s: ReturnType<typeof montar>['s'], codigo: string) {
    const local = await localPorCodigo(s, codigo);
    const lista = (await s.estoque.porFardo({ pageSize: 100, filters: { localId: local.id } })).items;
    return { local, fardos: lista };
  }

  it('confere, corrige o local errado, marca o não encontrado e exige justificativa do inesperado', async () => {
    const { s, como, invariantes } = montar('almoxarife');
    const a01 = await fardosDoLocal(s, 'A-01');
    const a02 = await fardosDoLocal(s, 'A-02');
    expect(a01.fardos.length).toBeGreaterThan(0);
    expect(a02.fardos.length).toBeGreaterThan(0);
    const inv = await s.inventarios.abrir([a01.local.id, a02.local.id]);
    expect(inv.esperados.length).toBeGreaterThan(0);
    await falhaCom(s.inventarios.abrir([a01.local.id]), 409, 'locaisIds');

    // A-01: o primeiro fardo dormente a dormente, sem um; A-02: o fardo é lido em A-01 (local errado).
    const f1 = (await s.fardos.obter(a01.fardos[0].id)).dormentes.filter((d) => ['em_estoque', 'reservado'].includes(d.situacao));
    const sumido = f1[f1.length - 1];
    for (const d of f1.slice(0, -1)) expect((await s.inventarios.ler(inv.id, { tipo: 'dormente', id: d.id, localId: a01.local.id })).situacao).toBe('conferido');
    for (const f of a01.fardos.slice(1)) await s.inventarios.ler(inv.id, { tipo: 'fardo', id: f.id, localId: a01.local.id });
    const trocado = a02.fardos[0];
    expect((await s.inventarios.ler(inv.id, { tipo: 'fardo', id: trocado.id, localId: a01.local.id })).situacao).toBe('local_errado');
    for (const f of a02.fardos.slice(1)) await s.inventarios.ler(inv.id, { tipo: 'fardo', id: f.id, localId: a02.local.id });
    // Inesperado: dormente baixado lido em A-02.
    expect((await s.inventarios.ler(inv.id, { tipo: 'dormente', id: 'AR00224-01-000001', localId: a02.local.id })).situacao).toBe('inesperado');
    expect((await s.inventarios.ler(inv.id, { tipo: 'dormente', id: 'AR00224-01-000001', localId: a02.local.id })).situacao).toBe('repetido');
    await falhaCom(s.inventarios.ler(inv.id, { tipo: 'dormente', id: 'AR00224-01-999999', localId: a02.local.id }), 404);

    const previa = await s.inventarios.previa(inv.id);
    expect(previa.diferencas.map((d) => [d.grupo, d.id])).toEqual(expect.arrayContaining([
      ['local_errado', trocado.id], ['nao_encontrado', sumido.id], ['inesperado', 'AR00224-01-000001'],
    ]));
    como('gestor');
    await falhaCom(s.inventarios.fechar(inv.id, {}), 403);
    como('almoxarife');
    await falhaCom(s.inventarios.fechar(inv.id, {}), 422, 'dormente:AR00224-01-000001');
    const fechado = await s.inventarios.fechar(inv.id, { 'dormente:AR00224-01-000001': 'Plaquinha solta caída no pátio; recolhida.' });
    expect(fechado.situacao).toBe('fechado');
    await falhaCom(s.inventarios.ler(inv.id, { tipo: 'fardo', id: trocado.id, localId: a01.local.id }), 409);

    expect((await s.fardos.obter(trocado.id)).fardo.localId).toBe(a01.local.id);
    const ficha = await s.dormentes.obter(sumido.id);
    expect(ficha.dormente.situacao).toBe('nao_localizado');
    expect((await s.inspecao.naoLocalizados({ pageSize: 50 })).items.map((d) => d.id)).toContain(sumido.id);
    const movs = await s.movimentacoes.listar({ search: fechado.numero, pageSize: 20 });
    expect(movs.items.some((m) => m.fardoId === trocado.id && m.tipo === 'transferencia')).toBe(true);

    // O gestor trata o não encontrado pelo fluxo de perda; o relatório por local mostra o último inventário.
    como('gestor');
    await s.ibama.registrarPerda(sumido.id, { motivo: 'extravio' });
    const porLocal = await s.ibama.inventarioPorLocal();
    const l1 = porLocal.find((x) => x.localId === a01.local.id)!;
    expect([l1.numero, l1.naoEncontrados, l1.percentualLocalizados! < 100]).toEqual([fechado.numero, 1, true]);
    // A-02: o fardo lido em A-01 conta como localizado, mas não no lugar certo.
    const r2 = fechado.resultado!.porLocal.find((x) => x.localId === a02.local.id)!;
    expect(r2.localizados).toBe(r2.esperados);
    expect(r2.noLugarCerto).toBeLessThan(r2.esperados);
    expect((await s.locais.obterPorCodigo('A-01')).ultimoInventarioEm).toBe(fechado.fechadoEm);
    expect(invariantes()).toEqual([]);
  });

  it('o reservado não encontrado sai da separação e a RME volta a "em separação"', async () => {
    const { s, invariantes } = montar('almoxarife');
    const pronta = (await s.rme.listar({ pageSize: 50 })).items.find((r) => r.situacao === 'pronta')!;
    const linha = pronta.separacao![0];
    const fardo = (await s.fardos.obter(linha.fardoId)).fardo;
    const inv = await s.inventarios.abrir([fardo.localId!]);
    const faltando = linha.dormentesIds[0];
    for (const x of inv.esperados.filter((y) => y.dormenteId !== faltando)) await s.inventarios.ler(inv.id, { tipo: 'dormente', id: x.dormenteId, localId: x.localId });
    await s.inventarios.fechar(inv.id, {});
    const rme = await s.rme.obter(pronta.numero);
    // Só o não encontrado sai; as demais reservas ficam e a RME volta a "em separação" para completar.
    expect(rme.situacao).toBe('em_separacao');
    const restantes = rme.separacao!.flatMap((l) => l.dormentesIds);
    expect(restantes).not.toContain(faltando);
    expect(restantes.length).toBe(pronta.separacao!.flatMap((l) => l.dormentesIds).length - 1);
    for (const id of restantes) expect((await s.dormentes.obter(id)).dormente.situacao).toBe('reservado');
    const ev = await s.eventos.listar({ filters: { entidade: 'rme', entidadeId: rme.id } });
    expect(ev.items[0].descricao).toContain('faltam 1');
    // Completar: a sugestão pede só o que falta; separar soma à separação anterior e a RME fica pronta de novo.
    const sug = await s.rme.sugerirSeparacao(rme.numero);
    expect(sug.itens.reduce((t, i) => t + i.quantidade, 0)).toBe(1);
    expect(sug.itens.reduce((t, i) => t + i.jaSeparados, 0)).toBe(restantes.length);
    const novo = sug.itens.flatMap((i) => i.fardos).map((f) => ({ fardoId: f.fardoId, dormentesIds: f.dormentesIds, justificativa: 'completar' }));
    const pronta2 = await s.rme.separar(rme.numero, novo);
    expect(pronta2.situacao).toBe('pronta');
    expect(pronta2.separacao!.flatMap((l) => l.dormentesIds).length).toBe(restantes.length + 1);
    expect((await s.dormentes.obter(faltando)).dormente.situacao).toBe('nao_localizado');
    expect(invariantes()).toEqual([]);
  });
});
