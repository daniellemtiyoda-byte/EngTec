import { dataSP, somarDias, ALERTA_DOF_DIAS_PADRAO, DORMENTES_POR_FARDO_PADRAO, LIMITE_DIAS_ESTOQUE_PADRAO, LIMITES_CATEGORIA_PADRAO, TOLERANCIA_VOLUME_PCT } from '../../dominio/parametros';
import { PERFIS, PERFIS_LISTA, type Perfil } from '../../dominio/permissoes';
import type { Id, Usuario } from '../../types/models';
import { criarAta, criarContrato, salvarEspecie, salvarFornecedor, salvarLocal, salvarTamanho, salvarTratamento } from './cadastros';
import { declararDof } from './documentos';
import { VERSAO_ESTADO, type Ctx, type EntregaReg, type Estado } from './estado';
import { concluirInspecao, registrarInspecao, simularFardo } from './inspecao';
import { receber } from './recebimento';
import { abrirRme, cancelarRme, entregarRme, iniciarSeparacao, separarRme, sugerirSeparacao } from './rme';
import { gerarEntrega } from './simulador';
import { sequenciaDe } from '../../dominio/identificacao';

/*
 * DADOS FICTÍCIOS de demonstração (seção 15 do plano). Nenhum valor representa fornecedores, documentos ou estoque reais.
 * A história é gerada CHAMANDO AS REGRAS do mock (simulador, recebimento, inspeção, RME), nunca montando registros à
 * mão, e é determinística: os mesmos IDs sempre. As datas são relativas ao dia em que a história é criada (`dataBase`),
 * para os prazos de DOF e a idade dos fardos fazerem sentido em qualquer dia da demonstração.
 * Gerada dentro de uma função para o build sem mock descartar este módulo inteiro.
 *
 * IDs fixos da entrega "a caminho" (etiquetas impressas com antecedência; conferidos nos testes):
 *   contrato AR00224-01 · fardos AR00224-01-F006 e F007 (Jataipeba 2,80 m, dormentes 000071 a 000098)
 *   e AR00224-01-F008 (Maçaranduba 2,00 m, dormentes 000099 a 000112).
 */

/** Nome dos usuários de demonstração, igual ao do login simulado (services/auth/simulado.ts). */
export const nomeDemo = (p: Perfil) => `${PERFIS[p].rotulo} (demonstração)`;
export const usuarioDemo = (p: Perfil): Usuario => ({ id: `demo-${p}`, nome: nomeDemo(p), email: `${p}@exemplo.invalid`, perfil: p, permissoes: PERFIS[p].permissoes, ativo: true });

export function criarDados(agoraReal: Date = new Date()): Estado {
  const base = dataSP(agoraReal);
  const e: Estado = {
    versao: VERSAO_ESTADO, dataBase: base,
    usuarios: PERFIS_LISTA.map(usuarioDemo),
    fornecedores: [], especies: [], tamanhos: [], tratamentos: [], locais: [], atas: [], contratos: [], fardos: [], dormentes: [],
    nfs: [], dofs: [], entregas: [], recebimentos: [], inspecoes: [], movimentacoes: [], rmes: [],
    parametros: {
      limiteDiasEstoque: LIMITE_DIAS_ESTOQUE_PADRAO, alertaDofDias: [...ALERTA_DOF_DIAS_PADRAO], toleranciaVolumePct: TOLERANCIA_VOLUME_PCT,
      limitesCategoria: [...LIMITES_CATEGORIA_PADRAO], dormentesPorFardoPadrao: DORMENTES_POR_FARDO_PADRAO, niveis: [], modoDemonstracao: true,
    },
    contadores: {},
  };

  // Relógio da história: cada passo acontece "N dias atrás", às 9h de São Paulo (ou na hora indicada).
  let atual = agoraReal;
  const em = (diasAtras: number, hora = 9) => { atual = new Date(`${somarDias(base, -diasAtras)}T${String(hora).padStart(2, '0')}:00:00-03:00`); };
  const como = (p: Perfil): Ctx => ({ agora: () => atual, quem: nomeDemo(p) });
  const adm = () => como('administrador');
  const alm = () => como('almoxarife');
  const req = () => como('requisitante');

  // ---------- Cadastros ----------
  em(400);
  const [jataipeba, macaranduba, cumaru, jatoba] = [
    salvarEspecie(e, { nomeCientifico: 'Dialium guianense', nomePopular: 'Jataipeba', classe: '1ª' }),
    salvarEspecie(e, { nomeCientifico: 'Manilkara huberi', nomePopular: 'Maçaranduba', classe: '1ª' }),
    salvarEspecie(e, { nomeCientifico: 'Dipteryx odorata', nomePopular: 'Cumaru', classe: '1ª' }),
    salvarEspecie(e, { nomeCientifico: 'Hymenaea courbaril', nomePopular: 'Jatobá' }),
  ];
  // Medidas PROVISÓRIAS, a confirmar com a CPTM.
  const t200 = salvarTamanho(e, { codigo: 'T200', comprimentoCm: 200, larguraCm: 22, alturaCm: 16, medidas: 'provisorio' });
  const t280 = salvarTamanho(e, { codigo: 'T280', comprimentoCm: 280, larguraCm: 24, alturaCm: 17, medidas: 'provisorio' });
  const cca = salvarTratamento(e, { preservativo: 'CCA', empresa: 'Granoski' });
  const ccb = salvarTratamento(e, { preservativo: 'CCB', empresa: 'Tratadora Exemplo Ltda.' });
  const local = (codigo: string, descricao: string, tipo: 'armazenagem' | 'inspecao' | 'segregacao' | 'expedicao', capacidade: number) =>
    salvarLocal(e, { codigo, descricao, tipo, capacidade }, adm());
  const [a01, a02, a03, a04, a05] = ['A-01', 'A-02', 'A-03', 'A-04', 'A-05'].map((c, i) => local(c, `Pátio A, área ${i + 1}`, 'armazenagem', 200));
  const insp = local('INSP-01', 'Área de inspeção', 'inspecao', 300);
  local('SEG-01', 'Segregação de reprovados', 'segregacao', 60);
  local('EXP-01', 'Expedição', 'expedicao', 120);

  const fA = salvarFornecedor(e, { razaoSocial: 'Madeireira Exemplo A Ltda.', cnpj: '00000000000101', cidadeUf: 'Cidade A/PA', ctfIbama: '1000001', ctfValidade: somarDias(base, 400), especiesIds: [jataipeba.id, macaranduba.id, cumaru.id] });
  const fB = salvarFornecedor(e, { razaoSocial: 'Florestal Exemplo B S.A.', cnpj: '00000000000102', cidadeUf: 'Cidade B/MT', ctfIbama: '1000002', ctfValidade: somarDias(base, 20), especiesIds: [macaranduba.id, jatoba.id] });
  salvarFornecedor(e, { razaoSocial: 'Serraria Exemplo C Ltda.', cnpj: '00000000000103', cidadeUf: 'Cidade C/RO', ctfIbama: '1000003', ctfValidade: somarDias(base, -10), especiesIds: [jataipeba.id] });

  // ---------- Atas e contratos ----------
  em(300);
  const ataA = criarAta(e, { numero: 'AR00224', fornecedorId: fA.id, vigenciaInicio: somarDias(base, -300), vigenciaFim: somarDias(base, 430) }, adm());
  const c1 = criarContrato(e, { numero: 'AR00224-01', ataId: ataA.id, empresaInspetora: 'UFV', ano: Number(base.slice(0, 4)), itens: [
    { especieId: jataipeba.id, tamanhoId: t280.id, tratamentoId: cca.id, quantidade: 280, unidade: 'un' },
    { especieId: macaranduba.id, tamanhoId: t200.id, tratamentoId: cca.id, quantidade: 140, unidade: 'un' },
  ] }, adm());
  const c2 = criarContrato(e, { numero: 'AR00224-02', ataId: ataA.id, empresaInspetora: 'UFV', ano: Number(base.slice(0, 4)), itens: [
    { especieId: cumaru.id, tamanhoId: t280.id, tratamentoId: ccb.id, quantidade: 28, unidade: 'un' },
  ] }, adm());
  em(200);
  const ataB = criarAta(e, { numero: 'AR00311', fornecedorId: fB.id, vigenciaInicio: somarDias(base, -200), vigenciaFim: somarDias(base, 530) }, adm());
  const c3 = criarContrato(e, { numero: 'AR00311-01', ataId: ataB.id, empresaInspetora: 'Inspetora Exemplo', ano: Number(base.slice(0, 4)), itens: [
    { especieId: jatoba.id, tamanhoId: t200.id, tratamentoId: cca.id, quantidade: 200, unidade: 'un' },
  ] }, adm());
  const c4 = criarContrato(e, { numero: 'AR00311-02', ataId: ataB.id, empresaInspetora: 'Inspetora Exemplo', ano: Number(base.slice(0, 4)), itens: [
    { especieId: macaranduba.id, tamanhoId: t280.id, tratamentoId: ccb.id, quantidade: 100, unidade: 'un' },
  ] }, adm());
  const [ic1, ic2] = c1.itens;
  const [ic3] = c2.itens;
  const [ic4] = c3.itens;
  const [ic5] = c4.itens;

  e.parametros.niveis = [
    { especieId: jataipeba.id, tamanhoId: t280.id, minimo: 10, maximo: 20 }, // fica acima do máximo
    { especieId: macaranduba.id, tamanhoId: t200.id, minimo: 10, maximo: 100 },
    { especieId: cumaru.id, tamanhoId: t280.id, minimo: 5, maximo: 60 },
    { especieId: jatoba.id, tamanhoId: t200.id, minimo: 50, maximo: 200 }, // fica abaixo do mínimo
    { especieId: macaranduba.id, tamanhoId: t280.id, minimo: 0, maximo: 100 },
  ];

  // ---------- Passos reutilizados ----------
  const gerar = (diasAtras: number, contratoId: Id, itens: { itemContratoId: Id; fardos: number; dormentesPorFardo?: number }[], validadeDofDias = 7) => {
    em(diasAtras, 8);
    return gerarEntrega(e, { contratoId, itens: itens.map((i) => ({ ...i, dormentesPorFardo: i.dormentesPorFardo ?? DORMENTES_POR_FARDO_PADRAO })) }, como('administrador'), validadeDofDias);
  };
  const receberEm = (diasAtras: number, entrega: EntregaReg, fardos = entrega.fardosIds, justificativaDivergencia?: string) => {
    em(diasAtras, 10);
    return receber(e, entrega.id, { fardosLidos: [...fardos], ocorrencias: [], localEsperaId: insp.id, justificativaDivergencia }, alm());
  };
  const inspecionarEGuardar = (diasAtras: number, fardoId: Id, localId: Id) => {
    em(diasAtras, 14);
    simularFardo(e, fardoId, alm());
    concluirInspecao(e, fardoId, { localId }, alm());
  };
  const declarar = (diasAtras: number, entrega: EntregaReg) => { em(diasAtras, 11); declararDof(e, entrega.dofId, alm()); };
  /** Separa exatamente a sugestão do sistema. */
  const separarSugestao = (numero: string) => {
    const s = sugerirSeparacao(e, numero, alm());
    separarRme(e, numero, s.itens.flatMap((i) => i.fardos.map((f) => ({ fardoId: f.fardoId, dormentesIds: f.dormentesIds }))), alm());
  };
  const abrir = (diasAtras: number, destino: string, especieId: Id, tamanhoId: Id, quantidade: number) => {
    em(diasAtras, 9);
    return abrirRme(e, { destino, necessidadeEm: somarDias(base, -diasAtras + 10), itens: [{ especieId, tamanhoId, quantidade }] }, usuarioDemo('requisitante'), req()).numero;
  };

  // ---------- Entregas concluídas ----------
  // E1: o fardo mais antigo, que acaba acima do limite de dias em estoque.
  const e1 = gerar(140, c1.id, [{ itemContratoId: ic1.id, fardos: 1 }]);
  receberEm(139, e1); inspecionarEGuardar(137, e1.fardosIds[0], a01.id); declarar(136, e1);

  // Contrato AR00224-02: 2 reprovados na inspeção e a reposição deles; termina concluído.
  const e4 = gerar(95, c2.id, [{ itemContratoId: ic3.id, fardos: 2 }]);
  receberEm(94, e4); e4.fardosIds.forEach((f) => inspecionarEGuardar(92, f, a02.id)); declarar(93, e4);
  const e5 = gerar(85, c2.id, [{ itemContratoId: ic3.id, fardos: 1, dormentesPorFardo: 2 }]);
  receberEm(84, e5); inspecionarEGuardar(83, e5.fardosIds[0], a02.id); declarar(83, e5);

  const r1 = abrir(75, 'Linha 10 · Trecho Santo André', cumaru.id, t280.id, 14);
  em(74); iniciarSeparacao(e, r1, alm()); separarSugestao(r1); em(73); entregarRme(e, r1, alm());

  const e2 = gerar(60, c1.id, [{ itemContratoId: ic1.id, fardos: 2 }, { itemContratoId: ic2.id, fardos: 2 }]);
  receberEm(59, e2);
  inspecionarEGuardar(57, e2.fardosIds[0], a03.id); inspecionarEGuardar(57, e2.fardosIds[1], a03.id);
  inspecionarEGuardar(57, e2.fardosIds[2], a04.id); inspecionarEGuardar(57, e2.fardosIds[3], a04.id);
  declarar(58, e2);

  const r2 = abrir(40, 'Linha 11 · Pátio Engenheiro São Paulo', jataipeba.id, t280.id, 8);
  em(39); iniciarSeparacao(e, r2, alm()); separarSugestao(r2); em(38); entregarRme(e, r2, alm());

  // E6: um fardo concluído com 2 dormentes não lidos (não localizados).
  const e6 = gerar(30, c3.id, [{ itemContratoId: ic4.id, fardos: 3 }]);
  receberEm(29, e6);
  inspecionarEGuardar(27, e6.fardosIds[0], a05.id); inspecionarEGuardar(27, e6.fardosIds[1], a05.id);
  em(27, 15);
  const ultimo = e6.fardosIds[2];
  const naoLidos = e.dormentes.filter((d) => d.fardoId === ultimo).slice(-2).map((d) => d.id);
  for (const d of e.dormentes.filter((x) => x.fardoId === ultimo && !naoLidos.includes(x.id))) {
    const seq = sequenciaDe(d.id) ?? 0;
    registrarInspecao(e, d.id, { origem: 'simulado', veredito: 'APROVADO', indice: 55 + (seq * 37) % 46 }, alm(), ultimo);
  }
  concluirInspecao(e, ultimo, { localId: a05.id, justificativa: 'Plaquinhas ilegíveis em 2 dormentes; separados para nova leitura.' }, alm());
  declarar(28, e6);

  const r3 = abrir(20, 'Linha 7 · Trecho Jundiaí', macaranduba.id, t200.id, 14);
  em(19); iniciarSeparacao(e, r3, alm()); separarSugestao(r3); entregarRme(e, r3, alm());

  // RME cancelada depois de separada: a reserva volta para o estoque.
  const r7 = abrir(12, 'Linha 12 · Trecho Calmon Viana', jatoba.id, t200.id, 10);
  em(12, 15); iniciarSeparacao(e, r7, alm()); separarSugestao(r7);
  em(11); cancelarRme(e, r7, 'Obra adiada pela manutenção.', req());

  // ---------- Entregas em andamento ----------
  // E8: DOF vencida sem declaração; recebida, um fardo em inspeção pela metade e outro aguardando.
  const e8 = gerar(10, c4.id, [{ itemContratoId: ic5.id, fardos: 2 }], 7);
  receberEm(2, e8);
  em(1, 15);
  for (const d of e.dormentes.filter((x) => x.fardoId === e8.fardosIds[0]).slice(0, 7)) {
    const seq = sequenciaDe(d.id) ?? 0;
    registrarInspecao(e, d.id, { origem: 'simulado', veredito: 'APROVADO', indice: 60 + (seq * 13) % 41 }, alm(), e8.fardosIds[0]);
  }
  // E7: DOF que vence em 1 dia; recebida em parte (um fardo ainda em trânsito).
  const e7 = gerar(8, c3.id, [{ itemContratoId: ic4.id, fardos: 2 }], 8);
  receberEm(1, e7, [e7.fardosIds[0]], 'Um dos dois fardos não veio neste caminhão; o fornecedor envia no próximo.');

  // RMEs em andamento: pronta, em separação e aberta.
  const r4 = abrir(6, 'Linha 10 · Trecho Mauá', jataipeba.id, t280.id, 10);
  em(5); iniciarSeparacao(e, r4, alm()); separarSugestao(r4);
  const r5 = abrir(4, 'Linha 11 · Trecho Mogi das Cruzes', jatoba.id, t200.id, 20);
  em(3); iniciarSeparacao(e, r5, alm());
  abrir(2, 'Linha 7 · Trecho Francisco Morato', macaranduba.id, t200.id, 6);

  // E3: a entrega "a caminho" com IDs fixos e DOF que vence em 3 dias.
  gerar(1, c1.id, [{ itemContratoId: ic1.id, fardos: 2 }, { itemContratoId: ic2.id, fardos: 1 }], 3);

  return e;
}
