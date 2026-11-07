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
    await falhaCom(s.simulador.emitir({ contratoId: c.id, comDocumentos: true, itens: [{ itemContratoId: c.itens[0].id, fardos: 1, dormentesPorFardo: 1 }] }), 403);
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
      dof: { numero: '26999001', validade: '2026-11-20', volumes: [{ especieId: c.itens[0].especieId, volumeM3: 3.2 }] },
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
      dof: { numero: `26${n}`, validade: '2026-11-20', volumes: [{ especieId: c.itens[0].especieId, volumeM3: 1.6 }] },
    });
    expect((await s.documentos.cadastrarEntrega(dados(9021))).criadoPor).toBe('Administrador (demonstração)');
    como('gestor');
    await falhaCom(s.documentos.cadastrarEntrega(dados(9022)), 403);
  });
  it('recusa chave de outro CNPJ, chave inválida e entrega sem DOF', async () => {
    const { s } = montar();
    const c = await contrato(s, 'AR00224-01');
    const nf = { numero: '9002', serie: '1', chaveAcesso: chave('00000000000999', 9002), contratoId: c.id, emissao: '2026-11-05', itens: [{ itemContratoId: c.itens[0].id, quantidade: 1, volumeM3: 0.1 }] };
    const dof = { numero: '26999003', validade: '2026-11-20', volumes: [{ especieId: c.itens[0].especieId, volumeM3: 0.1 }] };
    await falhaCom(s.documentos.cadastrarEntrega({ nf, dof }), 422, 'nf.chaveAcesso');
    await falhaCom(s.documentos.cadastrarEntrega({ nf: { ...nf, chaveAcesso: '123' }, dof }), 422, 'nf.chaveAcesso');
    await falhaCom(s.documentos.cadastrarEntrega({ nf: { ...nf, chaveAcesso: chave(CNPJ_A, 9002) }, dof: { ...dof, numero: '' } }), 422, 'dof.numero');
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
      dof: { numero: '26999031', validade: '2026-11-20', volumes: [{ especieId: c.itens[0].especieId, volumeM3: 1.6 }] },
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
  it('não passa do saldo a emitir (emitidos − reprovados) e continua as sequências do contrato', async () => {
    const { s, invariantes } = montar('administrador');
    const c = await contrato(s, 'AR00224-01');
    const mac = c.itens[1];
    expect(mac.saldoAEmitir).toBe(100); // 140 − (42 emitidos − 2 reprovados)
    const antes = (await s.fardos.listar({ pageSize: 1 })).total;
    await falhaCom(s.simulador.emitir({ contratoId: c.id, comDocumentos: true, itens: [{ itemContratoId: mac.id, fardos: 3, dormentesPorFardo: 34 }] }), 422, 'itens.0');
    expect((await s.fardos.listar({ pageSize: 1 })).total).toBe(antes);
    const em = await s.simulador.emitir({ contratoId: c.id, comDocumentos: true, itens: [{ itemContratoId: mac.id, fardos: 2, dormentesPorFardo: 50 }] });
    expect(em.fardosIds).toEqual(['AR00224-01-F009', 'AR00224-01-F010']);
    expect(em.situacao).toBe('a_caminho');
    const en = (await s.documentos.listarEntregas({ pageSize: 50 })).items.find((x) => x.id === em.entregaId)!;
    expect(en.origem).toBe('simulador');
    expect(en.fardosIds).toEqual(em.fardosIds);
    const etiquetas = await s.simulador.etiquetas(em.id);
    expect(etiquetas.fardos[0].dormentesIds[0]).toBe('AR00224-01-000113');
    expect((await contrato(s, 'AR00224-01')).itens[1].saldoAEmitir).toBe(0);
    const xml = await s.simulador.xmlNf(em.id);
    expect(xml).toContain(`<nNF>${em.nf.numero}</nNF>`);
    expect(invariantes()).toEqual([]);
  });
  it('só os fardos: a CPTM cadastra NF e DOF pelo XML e a entrega se liga à emissão', async () => {
    const { s, como, invariantes } = montar('administrador');
    const c = await contrato(s, 'AR00224-01');
    const mac = c.itens[1];
    const em = await s.simulador.emitir({ contratoId: c.id, comDocumentos: false, itens: [{ itemContratoId: mac.id, fardos: 1, dormentesPorFardo: 10 }] });
    expect(em.situacao).toBe('aguardando_documentos');
    expect(em.entregaId).toBeUndefined();
    expect((await s.documentos.fardosSemEntrega(c.id)).map((f) => f.id)).toContain(em.fardosIds[0]);
    const xml = await s.simulador.xmlNf(em.id);
    // O leitor de XML (DOMParser) é do navegador; aqui, confere-se o que ele leria.
    expect(xml).toContain(`<chNFe>${em.nf.chaveAcesso}</chNFe>`);
    expect(xml).toContain(`DOF n. ${em.dof.numero}`);
    const nf = em.nf;
    // Sem fardos indicados: os da emissão viram os esperados.
    const en = await s.documentos.cadastrarEntrega({
      nf: { numero: nf.numero, serie: nf.serie, chaveAcesso: nf.chaveAcesso, contratoId: c.id, emissao: nf.emissao, itens: [{ itemContratoId: mac.id, quantidade: 10, volumeM3: 0.704 }] },
      dof: { numero: em.dof.numero, validade: em.dof.validade, volumes: em.dof.volumes },
    });
    expect(en.fardosIds).toEqual(em.fardosIds);
    expect((await s.simulador.listar()).items.find((x) => x.id === em.id)?.entregaId).toBe(en.id);
    como('almoxarife');
    const loc = await localPorCodigo(s, 'INSP-01');
    await s.recebimentos.receber(en.id, { fardosLidos: em.fardosIds, ocorrencias: [], localEsperaId: loc.id });
    expect((await s.simulador.listar()).items.find((x) => x.id === em.id)?.situacao).toBe('recebida');
    expect(invariantes()).toEqual([]);
  });
  it('recusa contrato concluído e respeita o modo demonstração', async () => {
    const { s } = montar('administrador');
    const c2 = await contrato(s, 'AR00224-02');
    expect(c2.situacao).toBe('concluido');
    await falhaCom(s.simulador.emitir({ contratoId: c2.id, comDocumentos: true, itens: [{ itemContratoId: c2.itens[0].id, fardos: 1, dormentesPorFardo: 1 }] }), 422);
    await s.parametros.atualizar({ modoDemonstracao: false });
    const c1 = await contrato(s, 'AR00224-01');
    await falhaCom(s.simulador.emitir({ contratoId: c1.id, comDocumentos: true, itens: [{ itemContratoId: c1.itens[0].id, fardos: 1, dormentesPorFardo: 1 }] }), 409);
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
    const rme = await s.rme.abrir({ destino: 'Linha 10 · Trecho Teste', necessidadeEm: '2026-11-20', itens: [{ especieId: item.especieId, tamanhoId: item.tamanhoId, quantidade: 5 }] });
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
    const rme = await s.rme.abrir({ destino: 'Linha 11 · Trecho Teste', necessidadeEm: '2026-11-25', itens: [{ especieId: item.especieId, tamanhoId: item.tamanhoId, quantidade: 3 }] });
    como('almoxarife');
    const sug = await s.rme.sugerirSeparacao(rme.numero);
    const sugerido = sug.itens[0].fardos[0].fardoId;
    const outro = (await s.estoque.porFardo({ pageSize: 50 })).items.find((f) => f.itemContratoId === item.id && f.id !== sugerido && f.disponivel >= 3)!;
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
});

describe('expedição', () => {
  it('só recebe fardo inteiro reservado para RME pronta; separação parcial é recusada e cancelar devolve à origem', async () => {
    const { s, como, invariantes } = montar('requisitante');
    const c = await contrato(s, 'AR00224-01');
    const item = c.itens[0];
    const pedir = (quantidade: number) => s.rme.abrir({ destino: 'Linha 7 · Pátio', necessidadeEm: '2026-11-20', itens: [{ especieId: item.especieId, tamanhoId: item.tamanhoId, quantidade }] });
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
    const fardo = (await s.estoque.porFardo({ filters: { especieId: item.especieId, tamanhoId: item.tamanhoId }, pageSize: 50 })).items.find((f) => f.saldo === f.disponivel && f.id !== fardoId)!;
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
    // Saldo por item no serviço: filtro por situação e busca pelo nome (história: Jatobá T200 em falta).
    expect((await s.estoque.porItem({ filters: { situacao: 'falta' } })).items.map((x) => x.id)).toHaveLength(1);
    expect((await s.estoque.porItem({ search: 'jatobá' })).items[0].situacao).toBe('falta');
    const acima = (await s.estoque.porFardo({ filters: { acimaLimite: 'sim' }, pageSize: 50 })).items;
    expect(acima.map((x) => x.id)).toEqual(['AR00224-01-F001']);
    expect(mov.fardoId).toBe('AR00224-01-F003');
    const umDormente = (await s.fardos.obter('AR00224-01-F003')).dormentes.find((d) => d.situacao === 'em_estoque')!;
    expect((await s.dormentes.obter(umDormente.id)).local?.codigo).toBe('A-05');
    expect(invariantes()).toEqual([]);
  });
  it('contrato herda o fornecedor da ata, recusa espécie que ele não fornece e converte m³', async () => {
    const { s, invariantes } = montar('administrador');
    const ata = (await s.atas.listar()).items.find((a) => a.numero === 'AR00224')!;
    const especies = (await s.especies.listar()).items;
    const tamanhos = (await s.tamanhos.listar()).items;
    const trat = (await s.tratamentos.listar()).items[0];
    const jatoba = especies.find((x) => x.nomePopular === 'Jatobá')!;
    const jataipeba = especies.find((x) => x.nomePopular === 'Jataipeba')!;
    const t280 = tamanhos.find((t) => t.codigo === 'T280')!;
    const ufv = (await s.empresasInspetoras.listar()).items.find((x) => x.nome === 'UFV')!;
    const base = { numero: 'AR00224-03', ataId: ata.id, empresaInspetoraId: ufv.id, ano: 2026 };
    await falhaCom(s.contratos.criar({ ...base, itens: [{ especieId: jatoba.id, tamanhoId: t280.id, tratamentoId: trat.id, quantidade: 10, unidade: 'un' }] }), 422, 'itens.0');
    await falhaCom(s.contratos.criar({ ...base, numero: 'AR00311-09', itens: [{ especieId: jataipeba.id, tamanhoId: t280.id, tratamentoId: trat.id, quantidade: 10, unidade: 'un' }] }), 422, 'numero');
    const c = await s.contratos.criar({ ...base, itens: [{ especieId: jataipeba.id, tamanhoId: t280.id, tratamentoId: trat.id, quantidade: 2, unidade: 'm3' }] });
    expect(c.fornecedorId).toBe(ata.fornecedorId);
    expect(c.itens[0].quantidade).toBe(17); // 2 m³ ÷ 0,11424 m³ = 17,5 → 17
    expect(c.empresaInspetoraId).toBe(ufv.id);
    expect(invariantes()).toEqual([]);
  });
  it('empresa inspetora: cadastro, contrato só com empresa ativa e troca no contrato', async () => {
    const { s } = montar('administrador');
    await falhaCom(s.empresasInspetoras.criar({ nome: 'ufv' }), 422, 'nome');
    await falhaCom(s.empresasInspetoras.criar({ nome: 'Nova', cnpj: '123' }), 422, 'cnpj');
    const nova = await s.empresasInspetoras.criar({ nome: 'Inspetora Nova', cnpj: '00.000.000/0002-99' });
    expect(nova.cnpj).toBe('00000000000299');
    await s.empresasInspetoras.inativar(nova.id);
    await falhaCom(s.contratos.atualizar('AR00224-01', { empresaInspetoraId: nova.id }), 422, 'empresaInspetoraId');
    await s.empresasInspetoras.reativar(nova.id);
    expect((await s.contratos.atualizar('AR00224-01', { empresaInspetoraId: nova.id })).empresaInspetoraId).toBe(nova.id);
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
  it('resumo do fornecedor: contratos e taxa de reprovação por espécie; contratos filtrados por espécie', async () => {
    const { s } = montar('gestor');
    const fA = (await s.fornecedores.listar()).items.find((f) => f.razaoSocial.startsWith('Madeireira'))!;
    const r = await s.fornecedores.resumo(fA.id);
    expect(r.contratos.map((c) => c.numero)).toEqual(['AR00224-01', 'AR00224-02']);
    const cumaru = (await s.especies.listar()).items.find((x) => x.nomePopular === 'Cumaru')!;
    expect(r.reprovacao.find((x) => x.especieId === cumaru.id)).toEqual({ especieId: cumaru.id, inspecionados: 30, reprovados: 2, percentual: 6.7 });
    expect((await s.contratos.listar({ filters: { especieId: cumaru.id } })).items.map((c) => c.numero)).toEqual(['AR00224-02']);
  });
  it('fornecedor com CTF vencido fica bloqueado para nova ata', async () => {
    const { s } = montar('administrador');
    const bloqueado = (await s.fornecedores.listar()).items.find((f) => f.bloqueado)!;
    expect(bloqueado.razaoSocial).toBe('Serraria Exemplo C Ltda.');
    await falhaCom(s.atas.criar({ numero: 'AR00999', fornecedorId: bloqueado.id, vigenciaInicio: '2026-11-06', vigenciaFim: '2027-11-06' }), 422, 'fornecedorId');
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
    expect([ind.itensAbaixoMinimo, ind.itensAcimaMaximo, ind.fardosAcimaLimite, ind.naoLocalizados, ind.rmesAbertas]).toEqual([1, 1, 1, 2, 1]);
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
});
