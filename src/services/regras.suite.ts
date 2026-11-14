import { describe, expect, it, vi } from 'vitest';
import { justificativaPorFalta } from '../dominio/parametros';
import type { Perfil } from '../dominio/permissoes';
import { chaveComDigito } from '../utils/nfeXml';
import type { Servicos } from './contracts';
import { ApiError } from './erros';
import { usuarioDemo } from './mock/data';

/**
 * Regras de negócio testadas pelos serviços, iguais para todas as fontes de dados: o modo simulado
 * (mock/regras.test.ts) e o Supabase sobre um Postgres em memória (supabase/regras.test.ts). Cada teste começa da
 * história de demonstração gerada em 06/11/2026, 12h (São Paulo).
 */
export const AGORA = new Date('2026-11-06T12:00:00-03:00');

export interface Montado {
  s: Servicos;
  /** Troca o usuário logado (null = sem sessão). */
  como: (p: Perfil | null) => void;
  /** Violações dos invariantes no estado gravado (vazia = tudo certo). */
  invariantes: () => Promise<string[]>;
}
export type Montar = (perfil?: Perfil | null) => Promise<Montado>;

/** Espera um ApiError com o status (e o campo, se informado). */
export async function falhaCom(p: Promise<unknown>, status: number, campo?: string) {
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

async function contrato(s: Servicos, numero: string) {
  return s.contratos.obter(numero);
}
async function entregaACaminho(s: Servicos) {
  const lista = await s.recebimentos.entregasACaminho();
  return lista.find((x) => x.situacao === 'a_caminho')!;
}
export async function localPorCodigo(s: Servicos, codigo: string) {
  return s.locais.obterPorCodigo(codigo);
}


export function regrasDosServicos(montar: Montar, tempoMs?: number) {
  if (tempoMs) vi.setConfig({ testTimeout: tempoMs });
  describe('sessão e permissões', () => {
    it('sem sessão, nada é lido', async () => {
      const { s } = await montar(null);
      await falhaCom(s.fornecedores.listar(), 401);
    });
    it('cada perfil só faz o que pode', async () => {
      const { s, como } = await montar('requisitante');
      const c = await contrato(s, 'AR00224-01');
      await falhaCom(s.simulador.emitir({ contratoId: c.id, parcela: 1, comDocumentos: true, itens: [{ itemContratoId: c.itens[0].id, fardos: 1, dormentesPorFardo: 1 }] }), 403);
      como('gestor');
      const en = await entregaACaminho(s);
      await falhaCom(s.recebimentos.receber(en.id, { fardosLidos: en.fardosIds, ocorrencias: [], localEsperaId: 'x' }), 403);
      await falhaCom(s.parametros.reiniciarDemonstracao(), 403);
    });
    it('leituras devolvem cópias: alterar o resultado não altera os dados', async () => {
      const { s } = await montar();
      const f = await s.fornecedores.listar();
      f.items[0].razaoSocial = 'alterado';
      expect((await s.fornecedores.listar()).items[0].razaoSocial).not.toBe('alterado');
    });
  });

  describe('NF e DOF antes da chegada', () => {
    it('cadastrar NF e DOF cria a entrega "a caminho"; a mesma chave é recusada', async () => {
      const { s } = await montar();
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
      const { s, como } = await montar('administrador');
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
      const { s } = await montar();
      const c = await contrato(s, 'AR00224-01');
      const nf = { numero: '9002', serie: '1', chaveAcesso: chave('00000000000999', 9002), contratoId: c.id, emissao: '2026-11-05', itens: [{ itemContratoId: c.itens[0].id, quantidade: 1, volumeM3: 0.1 }] };
      const dof = { numero: '26999003', validade: '2026-11-20', volumes: [{ especieId: JATAIPEBA, volumeM3: 0.1 }] };
      await falhaCom(s.documentos.cadastrarEntrega({ nf, dof, parcela: 1 }), 422, 'nf.chaveAcesso');
      await falhaCom(s.documentos.cadastrarEntrega({ nf: { ...nf, chaveAcesso: '123' }, dof, parcela: 1 }), 422, 'nf.chaveAcesso');
      await falhaCom(s.documentos.cadastrarEntrega({ nf: { ...nf, chaveAcesso: chave(CNPJ_A, 9002) }, dof, parcela: 9 }), 422, 'parcela');
      await falhaCom(s.documentos.cadastrarEntrega({ nf: { ...nf, chaveAcesso: chave(CNPJ_A, 9002) }, dof: { ...dof, numero: '' }, parcela: 1 }), 422, 'dof.numero');
    });
    it('declara a DOF só depois do recebimento, e uma vez só', async () => {
      const { s } = await montar();
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
      const { s, invariantes } = await montar();
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
      expect(await invariantes()).toEqual([]);
    });
    it('cadastro na hora do recebimento fica com origem "recebimento"', async () => {
      const { s } = await montar();
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
      const { s, invariantes } = await montar();
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
      expect(await invariantes()).toEqual([]);
    });
    it('sem justificativa da pessoa, a da falta é preenchida pelo sistema', async () => {
      const { s } = await montar();
      const en = await entregaACaminho(s);
      const insp = await localPorCodigo(s, 'INSP-01');
      const rec = await s.recebimentos.receber(en.id, { fardosLidos: ['AR00224-01-F006', 'AR00224-01-F007'], ocorrencias: [], localEsperaId: insp.id });
      expect(rec.justificativaDivergencia).toBe(justificativaPorFalta(['AR00224-01-F008']));
    });
    it('ocorrência declarada exige foto; local de espera tem de ser de inspeção', async () => {
      const { s } = await montar();
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
    async function receberTudo(s: Servicos) {
      const en = await entregaACaminho(s);
      const insp = await localPorCodigo(s, 'INSP-01');
      await s.recebimentos.receber(en.id, { fardosLidos: en.fardosIds, ocorrencias: [], localEsperaId: insp.id });
    }
    it('simula, conclui e guarda: o saldo fica igual aos aprovados', async () => {
      const { s, invariantes } = await montar();
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
      expect(await invariantes()).toEqual([]);
    });
    it('conclui com dormentes não lidos só com justificativa; o não localizado encontrado depois segue o fluxo', async () => {
      const { s, invariantes } = await montar();
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
      expect(await invariantes()).toEqual([]);
    });
  });

  describe('simulador', () => {
    it('não passa do saldo a emitir (emitidos − reprovados), continua as sequências e atribui espécie e classe aos fardos', async () => {
      const { s, invariantes } = await montar('administrador');
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
      expect(await invariantes()).toEqual([]);
    });
    it('só os fardos: a CPTM cadastra NF e DOF pelo XML e a entrega se liga à emissão', async () => {
      const { s, como, invariantes } = await montar('administrador');
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
      expect(await invariantes()).toEqual([]);
    });
    it('recusa contrato concluído e respeita o modo demonstração', async () => {
      const { s } = await montar('administrador');
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
      const { s, invariantes } = await montar('almoxarife');
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
      expect(await invariantes()).toEqual([]);
    });
    it('reprovados: comunicação e retirada; a reentrega só depois da retirada', async () => {
      const { s, como, invariantes } = await montar('almoxarife');
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
      expect(await invariantes()).toEqual([]);
    });
    it('a ficha do dormente mostra a garantia (5 anos da entrega) e a empresa inspetora do boletim', async () => {
      const { s } = await montar();
      const f = await s.dormentes.obter('AR00224-01-000002');
      expect(f.garantiaAte).toBe(`${Number(f.fardo.recebidoEm!.slice(0, 4)) + 5}${f.fardo.recebidoEm!.slice(4, 10)}`);
      expect(f.empresaInspetora?.nome).toMatch(/^(IPT|UFV)$/);
    });
  });

  describe('falta de dormentes e volume nominal × medido', () => {
    it('a falta declarada informa a quantidade, sai do recebido e do nominal; depois da inspeção vale o medido', async () => {
      const { s, invariantes } = await montar('almoxarife');
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
      expect(await invariantes()).toEqual([]);
    });
  });

  describe('saída por RME', () => {
    it('abre, separa a sugestão (reserva) e entrega (baixa); o fardo fica aberto', async () => {
      const { s, como, invariantes } = await montar('requisitante');
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
      expect(await invariantes()).toEqual([]);
    });
    it('trocar de fardo exige justificativa; cancelar libera a reserva', async () => {
      const { s, como, invariantes } = await montar('requisitante');
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
      expect(await invariantes()).toEqual([]);
    });
    it('pedido por tamanho e classe: categoria mínima e espécie restringem a sugestão', async () => {
      const { s, como } = await montar('requisitante');
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
      const { s, como } = await montar('requisitante');
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
      const { s, como, invariantes } = await montar('requisitante');
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
      expect(await invariantes()).toEqual([]);
    });
  });

  describe('expedição', () => {
    it('só recebe fardo inteiro reservado para RME pronta; separação parcial é recusada e cancelar devolve à origem', async () => {
      const { s, como, invariantes } = await montar('requisitante');
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
      expect(await invariantes()).toEqual([]);
      // Cancelar devolve o fardo ao local de onde saiu e libera as reservas.
      await s.rme.cancelar(inteira.numero, 'Obra adiada.');
      const devolvido = (await s.fardos.obter(fardo.id)).fardo;
      expect(devolvido.localId).toBe(origem);
      expect(devolvido.disponivel).toBe(fardo.disponivel);
      expect((await s.movimentacoes.listar({ filters: { referencia: inteira.numero, tipo: 'transferencia' } })).total).toBe(2);
      expect(await invariantes()).toEqual([]);
    });
  });

  describe('estoque, cadastros e contratos', () => {
    it('transfere fardo com saldo e atualiza local, movimentações e ficha', async () => {
      const { s, invariantes } = await montar();
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
      expect(await invariantes()).toEqual([]);
    });
    it('contrato herda o fornecedor da ata e segue as regras dela: pedido mínimo, parcelas, saldo e prazos', async () => {
      const { s, invariantes } = await montar('administrador');
      const ata = (await s.atas.listar()).items.find((a) => a.numero === 'AR00224')!;
      const tamanhos = (await s.tamanhos.listar({ pageSize: 50 })).items;
      const t = (codigo: string) => tamanhos.find((x) => x.codigo === codigo)!.id;
      const base = { numero: 'AR00224-04', ataId: ata.id, ano: 2026, dataAssinatura: '2026-11-06', gestor: 'Gestor Exemplo 4', localEntrega: 'Almoxarifado de via permanente' };
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
      expect(await invariantes()).toEqual([]);
    });
    it('ata: vigência de 12 meses e regras padrão; empresa inspetora vem do boletim, só ativa', async () => {
      const { s } = await montar('administrador');
      const fA = (await s.fornecedores.listar()).items.find((f) => f.razaoSocial.startsWith('Madeireira'))!;
      const t006234 = (await s.tamanhos.listar({ pageSize: 50 })).items.find((x) => x.codigo === '006234')!.id;
      const ata = await s.atas.criar({ numero: 'AR00999', fornecedorId: fA.id, vigenciaInicio: '2026-11-06', itens: [{ tamanhoId: t006234, quantidade: 100 }] });
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
      const { s, invariantes } = await montar('administrador');
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
      expect(await invariantes()).toEqual([]);
    });
    it('resumo do fornecedor: contratos e taxa de reprovação por espécie; contratos filtrados por tamanho', async () => {
      const { s } = await montar('gestor');
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
      const { s } = await montar('administrador');
      const bloqueado = (await s.fornecedores.listar()).items.find((f) => f.bloqueado)!;
      expect(bloqueado.razaoSocial).toBe('Serraria Exemplo C Ltda.');
      const t006234 = (await s.tamanhos.listar({ pageSize: 50 })).items.find((x) => x.codigo === '006234')!.id;
      await falhaCom(s.atas.criar({ numero: 'AR00999', fornecedorId: bloqueado.id, vigenciaInicio: '2026-11-06', itens: [{ tamanhoId: t006234, quantidade: 100 }] }), 422, 'fornecedorId');
    });
    it('ata: regras, vigência e itens próprios; itens obrigatórios; editável só até o primeiro contrato', async () => {
      const { s, invariantes } = await montar('administrador');
      const fA = (await s.fornecedores.listar()).items.find((f) => f.razaoSocial.startsWith('Madeireira'))!;
      const tamanhos = (await s.tamanhos.listar({ pageSize: 50 })).items;
      const t = (codigo: string) => tamanhos.find((x) => x.codigo === codigo)!.id;
      const regras = { pedidoMinimo: 20, maxParcelas: 2, parcelaMinima: 10, parcelaMaxima: 50, prazosParcelas: [[0, 30], [31, 60]] as [number, number][] };
      const base = { numero: 'AR00998', fornecedorId: fA.id, vigenciaInicio: '2026-11-01', vigenciaFim: '2027-04-30', regras };
      // Sem itens, janela fora de ordem e vigência ao contrário são recusados.
      await falhaCom(s.atas.criar({ ...base, itens: [] }), 422, 'itens');
      await falhaCom(s.atas.criar({ ...base, regras: { ...regras, prazosParcelas: [[0, 30], [20, 60]] }, itens: [{ tamanhoId: t('006234'), quantidade: 100 }] }), 422, 'regras.prazosParcelas.1');
      await falhaCom(s.atas.criar({ ...base, vigenciaFim: '2026-10-01', itens: [{ tamanhoId: t('006234'), quantidade: 100 }] }), 422, 'vigenciaFim');
      const ata = await s.atas.criar({ ...base, itens: [{ tamanhoId: t('006234'), quantidade: 100 }] });
      expect([ata.situacao, ata.editavel, ata.contratos, ata.regras.pedidoMinimo, ata.vigenciaFim]).toEqual(['vigente', true, 0, 20, '2027-04-30']);
      // Sem contrato, tudo muda (menos o número).
      const editada = await s.atas.atualizar('AR00998', { ...base, regras: { ...regras, parcelaMaxima: 40 }, itens: [{ tamanhoId: t('006234'), quantidade: 80 }, { tamanhoId: t('006222'), quantidade: 20 }] });
      expect([editada.numero, editada.regras.parcelaMaxima, editada.itens.map((i) => i.quantidade)]).toEqual(['AR00998', 40, [80, 20]]);
      // O contrato segue as regras da ata: parcela acima da máxima (40), tamanho fora da ata e o saldo dela.
      const p = (...itens: [string, number][]) => ({ itens: itens.map(([codigo, quantidade]) => ({ tamanhoId: t(codigo), quantidade })) });
      const ct = { numero: 'AR00998-01', ataId: ata.id, ano: 2026, dataAssinatura: '2026-11-06', gestor: 'Gestor Exemplo 9', localEntrega: 'Almoxarifado de via permanente' };
      await falhaCom(s.contratos.criar({ ...ct, parcelas: [p(['006234', 45])] }), 422, 'parcelas.0');
      await falhaCom(s.contratos.criar({ ...ct, parcelas: [p(['006219', 20])] }), 422, 'parcelas');
      await falhaCom(s.contratos.criar({ ...ct, parcelas: [p(['006234', 10]), p(['006234', 10]), p(['006234', 10])] }), 422, 'parcelas');
      // Local de entrega obrigatório; a vigência do contrato é o fim da última parcela.
      await falhaCom(s.contratos.criar({ ...ct, localEntrega: ' ', parcelas: [p(['006234', 20]), p(['006222', 10])] }), 422, 'localEntrega');
      const c = await s.contratos.criar({ ...ct, parcelas: [p(['006234', 20]), p(['006222', 10])] });
      expect(c.parcelas.map((x) => [x.inicio, x.fim])).toEqual([['2026-11-06', '2026-12-06'], ['2026-12-07', '2027-01-05']]);
      expect([c.localEntrega, c.vigenciaFim]).toEqual(['Almoxarifado de via permanente', '2027-01-05']);
      expect((await s.contratos.atualizar('AR00998-01', { localEntrega: 'Pátio B' })).localEntrega).toBe('Pátio B');
      await falhaCom(s.contratos.atualizar('AR00998-01', { localEntrega: '' }), 422, 'localEntrega');
      // Depois do primeiro contrato, a ata não muda mais (nem com o contrato cancelado).
      const depois = await s.atas.obter('AR00998');
      expect([depois.editavel, depois.contratos, depois.itens[0].saldo]).toEqual([false, 1, 60]);
      await falhaCom(s.atas.atualizar('AR00998', { ...base, itens: [{ tamanhoId: t('006234'), quantidade: 500 }] }), 409);
      await s.contratos.cancelar('AR00998-01', 'Teste');
      await falhaCom(s.atas.atualizar('AR00998', { ...base, itens: [{ tamanhoId: t('006234'), quantidade: 500 }] }), 409);
      // Situação pela data: a AR00224 da demonstração está vigente.
      expect((await s.atas.obter('AR00224')).situacao).toBe('vigente');
      expect(await invariantes()).toEqual([]);
    });
    it('local: código único, que não muda depois, e ID do QR lido como LOC-código', async () => {
      const { s } = await montar('administrador');
      await falhaCom(s.locais.criar({ codigo: 'a-01', descricao: 'Repetido', tipo: 'armazenagem', capacidade: 10 }), 422, 'codigo');
      const novo = await s.locais.criar({ codigo: 'b-01', descricao: 'Pátio B', tipo: 'armazenagem', capacidade: 100 });
      expect(novo.codigo).toBe('B-01');
      expect((await s.locais.obterPorCodigo('LOC-B-01')).id).toBe(novo.id);
      await falhaCom(s.locais.atualizar(novo.id, { codigo: 'B-02' }), 422, 'codigo');
    });
  });

  describe('painel', () => {
    it('pendências conforme o perfil', async () => {
      const { s, como } = await montar('almoxarife');
      expect((await s.dashboard.pendencias()).map((p) => p.id)).toEqual(expect.arrayContaining(['receber', 'inspecionar', 'separar', 'entregar', 'dof']));
      como('requisitante');
      expect((await s.dashboard.pendencias()).map((p) => p.id)).toEqual(['minhas-rmes']);
      como('gestor');
      expect((await s.dashboard.pendencias()).map((p) => p.id)).toEqual(expect.arrayContaining(['falta', 'excesso', 'parados', 'nao-localizados']));
      const ind = await s.dashboard.indicadores();
      expect([ind.itensAbaixoMinimo, ind.itensAcimaMaximo, ind.fardosAcimaLimite, ind.naoLocalizados, ind.rmesAbertas]).toEqual([1, 1, 2, 3, 1]);
      expect([ind.parcelasAtrasadas, ind.reprovadosAguardandoRetirada, ind.laudosAVencer]).toEqual([1, 4, 1]);
      // Reposição: o item em falta mostra o saldo na ata vigente e leva ao novo contrato.
      const falta = (await s.dashboard.alertas()).find((a) => a.titulo.startsWith('Falta'))!;
      expect(falta.descricao).toContain('Saldo na ata vigente');
      expect(falta.link).toBe('/contratos?novo=1');
      expect((await s.dashboard.alertas()).some((a) => a.nivel === 'critico' && a.titulo.startsWith('DOF'))).toBe(true);
    });

    it('alertas só para quem pode agir: cada perfil vê o seu', async () => {
      const { s, como } = await montar('gestor');
      const prefixos = async () => new Set((await s.dashboard.alertas()).map((a) => a.id.replace(/-.*/, '')));
      const gestor = await prefixos();
      expect([...gestor]).toEqual(expect.arrayContaining(['dof', 'falta', 'parcela', 'laudo', 'reprovados', 'parados', 'nao']));
      como('almoxarife');
      const almox = await prefixos();
      expect([...almox]).toEqual(expect.arrayContaining(['dof', 'laudo', 'reprovados', 'parados']));
      for (const x of ['falta', 'excesso', 'parcela', 'nao', 'ctf']) expect(almox.has(x)).toBe(false);
      como('requisitante');
      expect(await s.dashboard.alertas()).toEqual([]);
      como('administrador');
      // O administrador tem painel:gestao: vê o mesmo que o gestor.
      expect([...(await prefixos())].filter((x) => x !== 'ctf').sort()).toEqual([...gestor].sort()); // o alerta de CTF é só do administrador
    });

    it('pendências "Minhas RMEs" e "CTF vencendo": o número é o total da lista que o link abre', async () => {
      const { s, como } = await montar('requisitante');
      const um = { pageSize: 1 };
      const minhas = async () => (await s.dashboard.pendencias()).find((p) => p.id === 'minhas-rmes');
      const antes = (await minhas())?.quantidade ?? 0;
      const lista = await s.rme.listar({ ...um, filters: { minhas: 'sim' } });
      expect(lista.total).toBe(antes);
      expect((await minhas())?.link ?? '/saidas?minhas=sim').toBe('/saidas?minhas=sim');
      // Só as do usuário logado e só as em andamento: nova RME entra; cancelada sai.
      const item = (await contrato(s, 'AR00224-01')).itens[0];
      const r = await s.rme.abrir({ destino: 'Linha 12 · Trecho Teste', tipoDestino: 'principal_pesado', necessidadeEm: '2026-11-30', itens: [{ tamanhoId: item.tamanhoId, classe: 1, quantidade: 1 }] });
      expect((await s.rme.listar({ ...um, filters: { minhas: 'sim' } })).total).toBe(antes + 1);
      expect((await minhas())?.quantidade).toBe(antes + 1);
      await s.rme.cancelar(r.numero, 'teste');
      expect((await s.rme.listar({ ...um, filters: { minhas: 'sim' } })).total).toBe(antes);
      como('almoxarife');
      expect((await s.rme.listar({ ...um, filters: { minhas: 'sim' } })).total).toBe(0); // o almoxarife não abriu nenhuma
      // CTF: ativos com o CTF vencendo em até DIAS_AVISO_CTF dias, sem os já vencidos.
      como('administrador');
      const ctf = (await s.dashboard.pendencias()).find((p) => p.id === 'ctf');
      const vencendo = await s.fornecedores.listar({ pageSize: 50, filters: { ctf: 'vencendo' } });
      expect(vencendo.total).toBeGreaterThan(0);
      expect(ctf?.quantidade).toBe(vencendo.total);
      expect(ctf?.link).toBe('/cadastros?aba=fornecedores&ctf=vencendo');
      expect(vencendo.items.every((f) => f.situacao === 'ativo' && !f.bloqueado)).toBe(true);
    });

    it('alertas do IBAMA batem com as abas de Relatórios', async () => {
      const { s, como } = await montar('gestor');
      const alertas = await s.dashboard.alertas();
      const achar = (id: string) => alertas.find((a) => a.id === id);
      const aLancar = (await s.ibama.destinacoes({ pageSize: 1, filters: { lancado: 'nao' } })).total;
      expect(aLancar).toBeGreaterThan(0);
      expect(achar('ibama-destinacao')?.titulo).toContain(`${aLancar} destinação`);
      expect(achar('ibama-destinacao')?.link).toBe('/relatorios?aba=destinacoes');
      const aComunicar = (await s.ibama.perdas({ pageSize: 1, filters: { comunicado: 'nao' } })).total;
      expect(!!achar('ibama-perdas')).toBe(aComunicar > 0);
      if (aComunicar) expect(achar('ibama-perdas')?.titulo).toContain(`${aComunicar} perda`);
      const fora = (await s.ibama.saldoPatio()).filter((x) => x.acimaTolerancia).length;
      expect(!!achar('ibama-saldo')).toBe(fora > 0);
      if (fora) expect(achar('ibama-saldo')?.link).toBe('/relatorios?aba=saldo');
      // Lançada a destinação, o alerta acompanha (o almoxarife declara DOF).
      como('almoxarife');
      expect((await s.dashboard.alertas()).some((a) => a.id === 'ibama-destinacao')).toBe(true);
      const d = (await s.ibama.destinacoes({ pageSize: 50, filters: { lancado: 'nao' } })).items;
      for (const x of d) await s.ibama.marcarLancado(x.id);
      expect((await s.dashboard.alertas()).some((a) => a.id === 'ibama-destinacao')).toBe(false);
    });

    it('cartões do Painel: cada número é o total da lista que o link abre', async () => {
      const { s, como } = await montar('gestor');
      const cartoes = await s.dashboard.cartoes();
      const c = (id: string) => cartoes.find((x) => x.id === id)!;
      const um = { pageSize: 1 };
      expect(c('falta').valor).toBe((await s.estoque.porItem({ ...um, filters: { situacao: 'falta' } })).total);
      expect(c('excesso').valor).toBe((await s.estoque.porItem({ ...um, filters: { situacao: 'excesso' } })).total);
      expect(c('parados').valor).toBe((await s.estoque.porFardo({ ...um, filters: { acimaLimite: 'sim' } })).total);
      expect(c('dofs').valor).toBe((await s.documentos.listarDofs({ ...um, filters: { situacaoDeclaracao: 'a_declarar' } })).total);
      expect(c('inspecionar').valor).toBe((await s.inspecao.fila(um)).total);
      expect(c('reprovados').valor).toBe((await s.inspecao.reprovados(um)).total);
      expect(c('nao-localizados').valor).toBe((await s.inspecao.naoLocalizados(um)).total);
      expect(c('atrasadas').valor).toBe((await s.contratos.listar({ ...um, filters: { situacao: 'vigente', atrasada: 'sim' } })).total);
      expect(c('laudos').valor).toBe((await s.documentos.listarEntregas({ ...um, filters: { etapa: 'aguardando_laudo', laudo: 'a_vencer' } })).total);
      // RMEs: um cartão por aba, cada um com o número da sua aba e o link para ela.
      const ind = await s.dashboard.indicadores();
      expect(c('rmes-abertas')).toMatchObject({ valor: (await s.rme.listar({ ...um, filters: { situacao: 'aberta' } })).total, link: '/saidas' });
      expect(c('rmes-abertas').valor).toBe(ind.rmesAbertas);
      expect(c('rmes-em-separacao')).toMatchObject({ valor: (await s.rme.listar({ ...um, filters: { situacao: 'em_separacao' } })).total, link: '/saidas?situacao=em_separacao' });
      expect(c('rmes-em-separacao').valor).toBe(ind.rmesEmSeparacao);
      // Links corrigidos: o filtro de fardos acima do limite é acimaLimite=sim.
      expect(c('parados').link).toBe('/estoque?visao=fardo&acimaLimite=sim');
      expect((await s.dashboard.pendencias()).find((p) => p.id === 'parados')?.link).toBe(c('parados').link);
      // Perfis: o almoxarife não recebe cartões de gestão; o requisitante não recebe nenhum.
      como('almoxarife');
      const almox = (await s.dashboard.cartoes()).map((x) => x.id);
      expect(almox).toEqual(expect.arrayContaining(['inspecionar', 'dofs', 'rmes-abertas', 'rmes-em-separacao', 'laudos', 'reprovados']));
      for (const x of ['falta', 'excesso', 'parados', 'atrasadas', 'nao-localizados']) expect(almox).not.toContain(x);
      como('requisitante');
      expect(await s.dashboard.cartoes()).toEqual([]);
    });
  });

  describe('eventos (histórico e auditoria)', () => {
    it('toda operação que muda o estado registra um evento; as linhas do tempo vêm deles', async () => {
      const { s, como } = await montar('administrador');
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
      const { s } = await montar('administrador');
      const p = await s.parametros.obter();
      const datas = p.feriados.map((f) => f.data);
      expect(datas).toEqual(expect.arrayContaining(['2026-11-20', '2026-07-09', '2026-01-25', '2026-06-04', '2027-03-26', '2027-05-27', '2027-11-02']));
      expect(new Set(p.feriados.map((f) => f.abrangencia))).toEqual(new Set(['nacional', 'estadual', 'municipal']));
      const sem = await s.parametros.atualizar({ feriados: [] });
      expect(sem.feriados).toEqual([]);
    });
    it('compara mínimo e máximo com o disponível mais o que está em cura; só a cura não gera falta', async () => {
      const { s } = await montar('administrador');
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
      const { s, como, invariantes } = await montar('almoxarife');
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
      expect(await invariantes()).toEqual([]);
    });
    it('saldo do pátio por espécie e tamanho comparado com o último saldo informado; acima de 10% alerta', async () => {
      const { s } = await montar('almoxarife');
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

  describe('IBAMA: balanço por espécie e recebimentos de DOF (relatórios, só leitura)', () => {
    const soma = (xs: number[]) => xs.reduce((t, x) => t + x, 0);

    it('o balanço fecha com a história de demonstração: inicial + entradas − destinações − perdas − retiradas = final = físico', async () => {
      const { s, invariantes } = await montar('gestor');
      const b = await s.ibama.balanco();
      expect(b.comparaFisico).toBe(true);
      expect(b.especies.length).toBeGreaterThan(0);
      for (const x of b.especies) {
        expect(x.inicialPecas).toBe(0);
        expect(x.entradasPecas - x.destinacoesPecas - x.perdasPecas - x.retiradasPecas).toBe(x.finalPecas);
        expect(Math.abs(x.entradasM3 - x.destinacoesM3 - x.perdasM3 - x.retiradasM3 - x.finalM3)).toBeLessThan(0.005);
        expect([x.fecha, x.diferencaPecas]).toEqual([true, 0]);
      }
      // O que o balanço soma é o que as outras abas mostram.
      const saldo = await s.ibama.saldoPatio();
      expect(soma(b.especies.map((x) => x.fisicoPecas ?? 0))).toBe(soma(saldo.map((x) => x.quantidade)));
      expect(soma(b.especies.map((x) => x.destinacoesPecas))).toBe(soma((await s.ibama.destinacoes({ pageSize: 1000 })).items.map((d) => d.quantidade)));
      expect(soma(b.especies.map((x) => x.perdasPecas))).toBe((await s.ibama.perdas({ pageSize: 1000 })).total);
      expect(soma(b.especies.map((x) => x.perdasPecas))).toBeGreaterThan(0);
      expect(soma(b.especies.map((x) => x.retiradasPecas))).toBeGreaterThan(0);
      expect(await invariantes()).toEqual([]);
    });
    it('com o período aberto no meio da história, o saldo inicial carrega o que veio antes e o final não muda', async () => {
      const { s } = await montar('gestor');
      const tudo = await s.ibama.balanco();
      const meio = await s.ibama.balanco({ de: '2026-10-20' });
      expect(meio.especies.map((x) => [x.especieId, x.finalPecas])).toEqual(tudo.especies.map((x) => [x.especieId, x.finalPecas]));
      for (const x of meio.especies) {
        expect(x.inicialPecas + x.entradasPecas - x.destinacoesPecas - x.perdasPecas - x.retiradasPecas).toBe(x.finalPecas);
        expect(x.fecha).toBe(true);
      }
      expect(soma(meio.especies.map((x) => x.inicialPecas))).toBeGreaterThan(0);
      // Período que termina no passado: calcula o final, mas não compara com o físico de agora.
      const passado = await s.ibama.balanco({ ate: '2026-10-20' });
      expect(passado.comparaFisico).toBe(false);
      expect(passado.especies.every((x) => x.fisicoPecas === undefined && x.fecha === undefined)).toBe(true);
    });
    it('uma perda nova entra no balanço do período e ele continua fechando', async () => {
      const { s } = await montar('gestor');
      const d = (await s.inspecao.naoLocalizados({ pageSize: 50 })).items[0];
      const antes = (await s.ibama.balanco()).especies.find((x) => x.especieId === d.especieId)!;
      await s.ibama.registrarPerda(d.id, { motivo: 'extravio' });
      const depois = (await s.ibama.balanco()).especies.find((x) => x.especieId === d.especieId)!;
      expect([depois.perdasPecas, depois.finalPecas, depois.fecha]).toEqual([antes.perdasPecas + 1, antes.finalPecas - 1, true]);
    });
    it('destinações trazem tamanho, prazo (dia seguinte à entrega, art. 56) e atraso', async () => {
      const { s } = await montar('almoxarife');
      const lista = (await s.ibama.destinacoes({ pageSize: 1000 })).items;
      expect(lista.length).toBeGreaterThan(0);
      for (const d of lista) {
        expect(d.tamanhosIds?.length).toBeGreaterThan(0);
        const entrega = new Date(`${d.entregueEm.slice(0, 10)}T00:00:00Z`).getTime();
        expect(new Date(`${d.prazoLancamento}T00:00:00Z`).getTime() - entrega).toBe(86_400_000);
        if (d.lancadoEm && d.lancadoEm.slice(0, 10) <= d.prazoLancamento!) expect(d.diasAtraso).toBe(0);
      }
      expect(lista.some((d) => !d.lancadoEm && (d.diasAtraso ?? 0) > 0)).toBe(true);
    });
    it('recebimentos de DOF: situação pelo prazo e pela declaração, vencidas e pendentes primeiro', async () => {
      const { s } = await montar('almoxarife');
      const dofs = (await s.documentos.listarDofs({ pageSize: 1000 })).items;
      const linhas = await s.ibama.recebimentosDof();
      expect(new Set(linhas.map((l) => l.dofId))).toEqual(new Set(dofs.map((d) => d.id)));
      for (const l of linhas) {
        const dof = dofs.find((d) => d.id === l.dofId)!;
        expect(l.prazoDeclaracao).toBe(dof.prazoDeclaracao);
        const declarada = dof.situacaoDeclaracao === 'declarado';
        if (!declarada) expect(l.situacao).toBe(dof.nivelPrazo === 'vencido' ? 'vencida' : 'pendente');
        else expect(['no_prazo', 'declarada_atraso']).toContain(l.situacao);
        expect(l.declaradoEm !== undefined).toBe(declarada);
        if (l.recebidoM3 !== undefined) expect(l.quantidade).toBeGreaterThan(0);
      }
      const ordem = linhas.map((l) => ['vencida', 'pendente'].includes(l.situacao));
      expect(ordem.indexOf(false)).toBe(ordem.lastIndexOf(true) + 1);
      expect(linhas.some((l) => l.situacao === 'vencida')).toBe(true);
      expect(linhas.some((l) => l.situacao === 'pendente')).toBe(true);
      expect(linhas.some((l) => l.situacao === 'no_prazo')).toBe(true);
    });
    it('declarar a DOF vencida a leva a "declarada com atraso"; a pendente, a "no prazo"', async () => {
      const { s } = await montar('almoxarife');
      const antes = await s.ibama.recebimentosDof();
      const dofs = (await s.documentos.listarDofs({ pageSize: 1000 })).items;
      const declaravel = (situacao: string) => antes.find((l) => l.situacao === situacao && dofs.find((d) => d.id === l.dofId)!.podeDeclarar);
      const vencida = declaravel('vencida');
      const pendente = declaravel('pendente');
      expect(vencida).toBeDefined();
      expect(pendente).toBeDefined();
      await s.documentos.declararDof(vencida!.dofId);
      const l = (await s.ibama.recebimentosDof()).find((x) => x.id === vencida!.id)!;
      expect([l.situacao, (l.diasAtraso ?? 0) > 0]).toEqual(['declarada_atraso', true]);
      await s.documentos.declararDof(pendente!.dofId);
      expect((await s.ibama.recebimentosDof()).find((x) => x.id === pendente!.id)!.situacao).toBe('no_prazo');
    });
    it('recebimentos de DOF: período pela data do recebimento', async () => {
      const { s } = await montar('almoxarife');
      const todas = await s.ibama.recebimentosDof();
      expect((await s.ibama.recebimentosDof({ de: '2099-01-01' })).length).toBe(0);
      expect((await s.ibama.recebimentosDof({ ate: '2099-01-01' })).length).toBe(todas.length);
    });
  });

  describe('IBAMA: perdas e não localizados no saldo do pátio', () => {
    it('os não localizados ficam no saldo físico, mostrados à parte', async () => {
      const { s } = await montar('gestor');
      const saldo = await s.ibama.saldoPatio();
      const nl = (await s.inspecao.naoLocalizados({ pageSize: 50 })).items;
      expect(saldo.reduce((t, x) => t + x.naoLocalizados.quantidade, 0)).toBe(nl.length);
      const comNl = saldo.find((x) => x.naoLocalizados.quantidade > 0)!;
      expect(comNl.naoLocalizados.volumeM3).toBeGreaterThan(0);
      expect(comNl.fisicoM3).toBeGreaterThanOrEqual(comNl.naoLocalizados.volumeM3);
    });
    it('o gestor transforma o não localizado em perdido: sai do saldo e fica a comunicar ao IBAMA', async () => {
      const { s, como, invariantes } = await montar('gestor');
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
      expect(await invariantes()).toEqual([]);
    });
  });

  describe('inventário físico por leitura de QR', () => {
    /** Fardos com dormentes no pátio de um local (pelo código). */
    async function fardosDoLocal(s: Servicos, codigo: string) {
      const local = await localPorCodigo(s, codigo);
      const lista = (await s.estoque.porFardo({ pageSize: 100, filters: { localId: local.id } })).items;
      return { local, fardos: lista };
    }

    it('confere, corrige o local errado, marca o não encontrado e exige justificativa do inesperado', async () => {
      const { s, como, invariantes } = await montar('almoxarife');
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
      expect(await invariantes()).toEqual([]);
    });

    it('o reservado não encontrado sai da separação e a RME volta a "em separação"', async () => {
      const { s, invariantes } = await montar('almoxarife');
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
      expect(await invariantes()).toEqual([]);
    });
  });
}
