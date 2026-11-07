import {
  dataSP, somarDias, ALERTA_DOF_DIAS_PADRAO, ALERTA_LAUDO_DIAS_PADRAO, DORMENTES_POR_FARDO_PADRAO, LIMITE_DIAS_ESTOQUE_PADRAO, LIMITES_CATEGORIA_PADRAO,
  FERIADOS_PADRAO, REGRAS_ATA_PADRAO, TOLERANCIA_VOLUME_PCT,
} from '../../dominio/parametros';
import { PERFIS, PERFIS_LISTA, type Perfil } from '../../dominio/permissoes';
import type { Classe, Id, TipoDestino, Usuario } from '../../types/models';
import { criarAta, criarContrato, salvarEmpresaInspetora, salvarEspecie, salvarFornecedor, salvarLocal, salvarTamanho, salvarTratamento } from './cadastros';
import { declararDof } from './documentos';
import { VERSAO_ESTADO, type Ctx, type EntregaReg, type Estado } from './estado';
import { concluirInspecao, registrarComunicacao, registrarInspecao, registrarRetirada, simularFardo } from './inspecao';
import { informarSaldoDof, marcarDestinacaoLancada, saldoPatio } from './ibama';
import { emitirLaudo, receber } from './recebimento';
import { abrirRme, cancelarRme, entregarRme, iniciarSeparacao, separarRme, sugerirSeparacao } from './rme';
import { emitir } from './simulador';
import { sequenciaDe } from '../../dominio/identificacao';

/*
 * DADOS FICTÍCIOS de demonstração (seção 15 do plano). Nenhum valor representa fornecedores, documentos ou estoque reais.
 * A história é gerada CHAMANDO AS REGRAS do mock (simulador, recebimento, inspeção, RME), nunca montando registros à
 * mão, e é determinística: os mesmos IDs sempre. As datas são relativas ao dia em que a história é criada (`dataBase`),
 * para os prazos de DOF e a idade dos fardos fazerem sentido em qualquer dia da demonstração.
 * Gerada dentro de uma função para o build sem mock descartar este módulo inteiro.
 *
 * Itens reais da CPTM (código de material, 240 × 170 mm) e as regras da Ata AR00224 (pedido mínimo de 6.000, parcelas
 * de 3.000 a 6.000). Pessoas são fictícias. A ata AR00311 (fictícia) usa regras reduzidas, só para a demonstração
 * mostrar o ciclo completo de um contrato pequeno (laudo, reposição de reprovados e recebimento definitivo).
 *
 * IDs fixos da entrega "a caminho" (etiquetas impressas com antecedência; conferidos nos testes):
 *   contrato AR00224-01 · fardos AR00224-01-F006 e F007 (006234, 2,80 m, dormentes 000071 a 000098)
 *   e AR00224-01-F008 (006219, 3,00 m, dormentes 000099 a 000112).
 */

/** Nome dos usuários de demonstração, igual ao do login simulado (services/auth/simulado.ts). */
export const nomeDemo = (p: Perfil) => `${PERFIS[p].rotulo} (demonstração)`;
export const usuarioDemo = (p: Perfil): Usuario => ({ id: `demo-${p}`, nome: nomeDemo(p), email: `${p}@exemplo.invalid`, perfil: p, permissoes: PERFIS[p].permissoes, ativo: true });

export function criarDados(agoraReal: Date = new Date()): Estado {
  const base = dataSP(agoraReal);
  const e: Estado = {
    versao: VERSAO_ESTADO, dataBase: base,
    usuarios: PERFIS_LISTA.map(usuarioDemo),
    fornecedores: [], especies: [], tamanhos: [], tratamentos: [], empresasInspetoras: [], locais: [], atas: [], contratos: [], fardos: [], dormentes: [],
    emissoes: [], nfs: [], dofs: [], entregas: [], recebimentos: [], inspecoes: [], movimentacoes: [], rmes: [], eventos: [], destinacoes: [], saldosDof: [],
    parametros: {
      limiteDiasEstoque: LIMITE_DIAS_ESTOQUE_PADRAO, alertaDofDias: [...ALERTA_DOF_DIAS_PADRAO], toleranciaVolumePct: TOLERANCIA_VOLUME_PCT,
      limitesCategoria: [...LIMITES_CATEGORIA_PADRAO], dormentesPorFardoPadrao: DORMENTES_POR_FARDO_PADRAO, niveis: [], alertaLaudoDias: [...ALERTA_LAUDO_DIAS_PADRAO],
      feriados: FERIADOS_PADRAO.map((f) => ({ ...f })),
      modoDemonstracao: true,
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
    salvarEspecie(e, { nomeCientifico: 'Dialium guianense', nomePopular: 'Jataipeba' }, adm()),
    salvarEspecie(e, { nomeCientifico: 'Manilkara huberi', nomePopular: 'Maçaranduba' }, adm()),
    salvarEspecie(e, { nomeCientifico: 'Dipteryx odorata', nomePopular: 'Cumaru' }, adm()),
    salvarEspecie(e, { nomeCientifico: 'Hymenaea courbaril', nomePopular: 'Jatobá' }, adm()),
  ];
  // Itens de compra da CPTM: código de material, todos com 240 mm × 170 mm. 2,80 m = via corrente; 3,00 a 5,40 m = AMV.
  const tamanho = (codigo: string, comprimentoCm: number) =>
    salvarTamanho(e, { codigo, comprimentoCm, larguraCm: 24, alturaCm: 17, uso: comprimentoCm === 280 ? 'via_corrente' : 'amv', medidas: 'confirmado' }, adm());
  const [t006234, t006219, t006220, t006221, t006222] = [
    tamanho('006234', 280), tamanho('006219', 300), tamanho('006220', 320), tamanho('006221', 340), tamanho('006222', 360),
  ];
  const amvMaiores = [['006223', 380], ['006224', 400], ['006225', 420], ['006226', 440], ['006227', 460], ['006228', 480], ['006231', 540]] as const;
  const outrosAmv = amvMaiores.map(([c, cm]) => tamanho(c, cm));
  salvarTratamento(e, { preservativo: 'CCA', empresa: 'Tratadora Exemplo A Ltda.' }, adm());
  salvarTratamento(e, { preservativo: 'CCB', empresa: 'Tratadora Exemplo B Ltda.' }, adm());
  salvarEmpresaInspetora(e, { nome: 'IPT' }, adm());
  salvarEmpresaInspetora(e, { nome: 'UFV' }, adm());
  const local = (codigo: string, descricao: string, tipo: 'armazenagem' | 'inspecao' | 'segregacao' | 'expedicao', capacidade: number) =>
    salvarLocal(e, { codigo, descricao, tipo, capacidade }, adm());
  const [a01, a02, a03, a04, a05] = ['A-01', 'A-02', 'A-03', 'A-04', 'A-05'].map((c, i) => local(c, `Pátio A, área ${i + 1}`, 'armazenagem', 200));
  const insp = local('INSP-01', 'Área de inspeção', 'inspecao', 300);
  local('SEG-01', 'Segregação de reprovados', 'segregacao', 60);
  local('EXP-01', 'Expedição', 'expedicao', 120);

  const fA = salvarFornecedor(e, { razaoSocial: 'Madeireira Exemplo A Ltda.', cnpj: '00000000000101', cidadeUf: 'Cidade A/PA', ctfIbama: '1000001', ctfValidade: somarDias(base, 400), especiesIds: [jataipeba.id, macaranduba.id, cumaru.id] }, adm());
  const fB = salvarFornecedor(e, { razaoSocial: 'Florestal Exemplo B S.A.', cnpj: '00000000000102', cidadeUf: 'Cidade B/MT', ctfIbama: '1000002', ctfValidade: somarDias(base, 20), especiesIds: [macaranduba.id, jatoba.id] }, adm());
  salvarFornecedor(e, { razaoSocial: 'Serraria Exemplo C Ltda.', cnpj: '00000000000103', cidadeUf: 'Cidade C/RO', ctfIbama: '1000003', ctfValidade: somarDias(base, -10), especiesIds: [jataipeba.id] }, adm());

  // ---------- Atas e contratos ----------
  const ano = Number(base.slice(0, 4));
  /** Cronograma: uma lista de [tamanho, quantidade] por parcela. */
  const cronograma = (...parcelas: [Id, number][][]) => parcelas.map((p) => ({ itens: p.map(([tamanhoId, quantidade]) => ({ tamanhoId, quantidade })) }));
  em(200);
  // Ata AR00224 com as regras dos documentos da CPTM e quantidades registradas por tamanho.
  const ataA = criarAta(e, {
    numero: 'AR00224', fornecedorId: fA.id, vigenciaInicio: somarDias(base, -200),
    itens: [
      { tamanhoId: t006234.id, quantidade: 30000 }, { tamanhoId: t006219.id, quantidade: 2000 }, { tamanhoId: t006220.id, quantidade: 2000 },
      { tamanhoId: t006221.id, quantidade: 2000 }, { tamanhoId: t006222.id, quantidade: 1000 }, ...outrosAmv.map((t) => ({ tamanhoId: t.id, quantidade: 600 })),
    ],
  }, adm());
  // Ata AR00311 (fictícia) com regras reduzidas: contratos pequenos, para a demonstração mostrar o ciclo completo.
  const regrasReduzidas = { ...REGRAS_ATA_PADRAO, pedidoMinimo: 28, parcelaMinima: 14, parcelaMaxima: 100 };
  const ataB = criarAta(e, {
    numero: 'AR00311', fornecedorId: fB.id, vigenciaInicio: somarDias(base, -200), regras: regrasReduzidas,
    itens: [{ tamanhoId: t006234.id, quantidade: 500 }, { tamanhoId: t006222.id, quantidade: 100 }],
  }, adm());
  em(160);
  const c5 = criarContrato(e, { numero: 'AR00311-02', ataId: ataB.id, ano, dataAssinatura: somarDias(base, -160), gestor: 'Gestor Exemplo 2', parcelas: cronograma([[t006222.id, 28]]) }, adm());
  const [ic5] = c5.itens;

  e.parametros.niveis = [
    { classe: 1, tamanhoId: t006234.id, minimo: 10, maximo: 40 }, // fica acima do máximo
    { classe: 2, tamanhoId: t006234.id, minimo: 0, maximo: 60 },
    { classe: 1, tamanhoId: t006219.id, minimo: 20, maximo: 100 }, // fica abaixo do mínimo
    { classe: 1, tamanhoId: t006222.id, minimo: 5, maximo: 60 },
    { classe: 1, tamanhoId: t006220.id, minimo: 20, maximo: 80 }, // abaixo do mínimo só pela cura: não é falta
  ];

  // ---------- Passos reutilizados ----------
  const gerar = (diasAtras: number, contratoId: Id, parcela: number, itens: { itemContratoId: Id; fardos: number; dormentesPorFardo?: number }[], validadeDofDias = 7, reentrega = false) => {
    em(diasAtras, 8);
    const emissao = emitir(e, { contratoId, parcela, reentrega, comDocumentos: true, itens: itens.map((i) => ({ ...i, dormentesPorFardo: i.dormentesPorFardo ?? DORMENTES_POR_FARDO_PADRAO })) }, como('administrador'), validadeDofDias);
    return e.entregas.find((x) => x.id === emissao.entregaId)!;
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
  const laudo = (diasAtras: number, entrega: EntregaReg) => { em(diasAtras, 16); emitirLaudo(e, entrega.id, alm()); };
  /** Comunicação ao fornecedor e, se informado, a retirada dos reprovados dos fardos. */
  const reprovados = (fardos: Id[], comunicadoHa: number, retiradoHa?: number) => {
    for (const f of fardos.filter((id) => e.fardos.find((x) => x.id === id)?.reprovacao)) {
      em(comunicadoHa, 10); registrarComunicacao(e, f, alm());
      if (retiradoHa !== undefined) { em(retiradoHa, 10); registrarRetirada(e, f, alm()); }
    }
  };
  /** Separa exatamente a sugestão do sistema. */
  const separarSugestao = (numero: string) => {
    const s = sugerirSeparacao(e, numero, alm());
    separarRme(e, numero, s.itens.flatMap((i) => i.fardos.map((f) => ({ fardoId: f.fardoId, dormentesIds: f.dormentesIds }))), alm());
  };
  const abrir = (diasAtras: number, destino: string, tipoDestino: TipoDestino, tamanhoId: Id, classe: Classe, quantidade: number) => {
    em(diasAtras, 9);
    return abrirRme(e, { destino, tipoDestino, necessidadeEm: somarDias(base, -diasAtras + 10), itens: [{ tamanhoId, classe, quantidade }] }, usuarioDemo('requisitante'), req()).numero;
  };

  // ---------- Entregas concluídas ----------
  // Contrato AR00311-02 (AMV 3,60 m): 2 reprovados, comunicados e retirados, e a reentrega (reposição) deles; termina
  // concluído, com os laudos e o recebimento definitivo. Um fardo dele fica acima do limite de dias em estoque.
  const e4 = gerar(150, c5.id, 1, [{ itemContratoId: ic5.id, fardos: 2 }]);
  receberEm(149, e4); e4.fardosIds.forEach((f) => inspecionarEGuardar(147, f, a02.id)); declarar(148, e4);
  reprovados(e4.fardosIds, 146, 143); laudo(145, e4);
  const e5 = gerar(140, c5.id, 1, [{ itemContratoId: ic5.id, fardos: 1, dormentesPorFardo: 2 }], 7, true);
  receberEm(139, e5); inspecionarEGuardar(138, e5.fardosIds[0], a02.id); declarar(138, e5); laudo(135, e5);

  em(130);
  // AR00311-01: assinado há 130 dias. A 1ª parcela chegou com atraso e a 2ª está ATRASADA (o caso proposital do alerta).
  const c3 = criarContrato(e, { numero: 'AR00311-01', ataId: ataB.id, ano, dataAssinatura: somarDias(base, -130), gestor: 'Gestor Exemplo 2', parcelas: cronograma([[t006234.id, 42]], [[t006234.id, 28]]) }, adm());
  const [ic3] = c3.itens;

  const lancarDestinacao = (rme: string) => { for (const d of e.destinacoes.filter((x) => x.rmeNumero === rme)) marcarDestinacaoLancada(e, d.id, alm()); };
  const r1 = abrir(125, 'Linha 10 · Trecho Santo André (AMV)', 'principal_pesado', t006222.id, 1, 14);
  em(124); iniciarSeparacao(e, r1, alm()); separarSugestao(r1); em(123); entregarRme(e, r1, alm());
  em(120); lancarDestinacao(r1);

  em(40);
  // AR00224-01 e -02 assinados há 40 dias: as parcelas estão dentro do prazo.
  const c1 = criarContrato(e, {
    numero: 'AR00224-01', ataId: ataA.id, ano, dataAssinatura: somarDias(base, -40), gestor: 'Gestor Exemplo 1',
    parcelas: cronograma([[t006234.id, 3000]], [[t006234.id, 2600], [t006219.id, 400]]),
  }, adm());
  const [ic1, ic2] = c1.itens; // 006234 e 006219
  const c2 = criarContrato(e, {
    numero: 'AR00224-02', ataId: ataA.id, ano, dataAssinatura: somarDias(base, -40), gestor: 'Gestor Exemplo 1',
    parcelas: cronograma([[t006234.id, 3000]], [[t006220.id, 1500], [t006221.id, 1500]]),
  }, adm());

  // E1 (1ª parcela do AR00224-01): 1 reprovado já retirado; laudo emitido.
  const e1 = gerar(38, c1.id, 1, [{ itemContratoId: ic1.id, fardos: 1 }]);
  receberEm(37, e1); inspecionarEGuardar(35, e1.fardosIds[0], a01.id); declarar(34, e1);
  reprovados(e1.fardosIds, 33, 30); laudo(31, e1);

  // E6 (1ª parcela do AR00311-01, entregue com atraso): um fardo concluído com 2 dormentes não lidos (não localizados);
  // reprovados comunicados e ainda não retirados (retirada atrasada); laudo não emitido (prazo vencido).
  const e6 = gerar(33, c3.id, 1, [{ itemContratoId: ic3.id, fardos: 3 }]);
  receberEm(32, e6);
  inspecionarEGuardar(27, e6.fardosIds[0], a05.id); inspecionarEGuardar(27, e6.fardosIds[1], a05.id);
  em(27, 15);
  const ultimo = e6.fardosIds[2];
  const naoLidos = e.dormentes.filter((d) => d.fardoId === ultimo).slice(-2).map((d) => d.id);
  for (const d of e.dormentes.filter((x) => x.fardoId === ultimo && !naoLidos.includes(x.id))) {
    const seq = sequenciaDe(d.id) ?? 0;
    registrarInspecao(e, d.id, { origem: 'simulado', veredito: 'APROVADO', indice: 55 + (seq * 37) % 46 }, alm(), ultimo);
  }
  concluirInspecao(e, ultimo, { localId: a05.id, justificativa: 'Plaquinhas ilegíveis em 2 dormentes; separados para nova leitura.' }, alm());
  declarar(28, e6); reprovados(e6.fardosIds, 25);

  // E2 (2ª parcela do AR00224-01): 006234 e 006219; reprovados comunicados e retirados; laudo emitido.
  const e2 = gerar(28, c1.id, 2, [{ itemContratoId: ic1.id, fardos: 2 }, { itemContratoId: ic2.id, fardos: 2 }]);
  receberEm(27, e2);
  inspecionarEGuardar(25, e2.fardosIds[0], a03.id); inspecionarEGuardar(25, e2.fardosIds[1], a03.id);
  inspecionarEGuardar(25, e2.fardosIds[2], a04.id); inspecionarEGuardar(25, e2.fardosIds[3], a04.id);
  declarar(26, e2); reprovados(e2.fardosIds, 24, 20); laudo(22, e2);

  // Saídas depois da cura dos dormentes da E2 (tratados 30 dias atrás, liberados há 15).
  const r3 = abrir(14, 'Linha 7 · Trecho Jundiaí (AMV)', 'principal_medio', t006219.id, 1, 10);
  em(14, 15); iniciarSeparacao(e, r3, alm()); separarSugestao(r3); entregarRme(e, r3, alm());
  em(13, 10); lancarDestinacao(r3);

  const r2 = abrir(13, 'Linha 11 · Pátio Engenheiro São Paulo', 'patio', t006234.id, 1, 8);
  em(13, 15); iniciarSeparacao(e, r2, alm()); separarSugestao(r2); em(12, 8); entregarRme(e, r2, alm());  // destinação final ainda não lançada no DOF (pendência)

  // E9 (AR00224-02, AMV 3,20 m): recebida e inspecionada, ainda EM CURA (CCA/CCB: 15 dias do tratamento); reprovado
  // ainda sem comunicação; laudo a emitir no prazo.
  const ic9 = c2.itens.find((i) => i.tamanhoId === t006220.id)!;
  const e9 = gerar(12, c2.id, 2, [{ itemContratoId: ic9.id, fardos: 2 }], 9);
  receberEm(10, e9); e9.fardosIds.forEach((f) => inspecionarEGuardar(8, f, a02.id)); declarar(9, e9);

  // RME cancelada depois de separada: a reserva volta para o estoque.
  const r7 = abrir(12, 'Linha 12 · Trecho Calmon Viana', 'principal_medio', t006234.id, 1, 10);
  em(12, 15); iniciarSeparacao(e, r7, alm()); separarSugestao(r7);
  em(11); cancelarRme(e, r7, 'Obra adiada pela manutenção.', req());

  // ---------- Entregas em andamento ----------
  em(12);
  const c4 = criarContrato(e, { numero: 'AR00311-03', ataId: ataB.id, ano, dataAssinatura: somarDias(base, -12), gestor: 'Gestor Exemplo 2', parcelas: cronograma([[t006234.id, 28]]) }, adm());
  const [ic4] = c4.itens;
  // E8: DOF vencida sem declaração; recebida, um fardo em inspeção pela metade e outro aguardando.
  const e8 = gerar(10, c4.id, 1, [{ itemContratoId: ic4.id, fardos: 2 }], 7);
  receberEm(2, e8);
  em(1, 15);
  for (const d of e.dormentes.filter((x) => x.fardoId === e8.fardosIds[0]).slice(0, 7)) {
    const seq = sequenciaDe(d.id) ?? 0;
    registrarInspecao(e, d.id, { origem: 'simulado', veredito: 'APROVADO', indice: 60 + (seq * 13) % 41 }, alm(), e8.fardosIds[0]);
  }
  // E7 (2ª parcela do AR00311-01): DOF que vence em 1 dia; recebida em parte (um fardo ainda em trânsito), por isso a
  // parcela fica atrasada.
  const e7 = gerar(8, c3.id, 2, [{ itemContratoId: ic3.id, fardos: 2 }], 8);
  // A divergência de volume vem só do fardo que faltou: a justificativa é preenchida pelo sistema.
  receberEm(1, e7, [e7.fardosIds[0]]);

  // RMEs em andamento: pronta, em separação e aberta.
  const r4 = abrir(6, 'Linha 10 · Trecho Mauá', 'principal_pesado', t006234.id, 1, 10);
  em(5); iniciarSeparacao(e, r4, alm()); separarSugestao(r4);
  em(5);
  criarContrato(e, { numero: 'AR00224-03', ataId: ataA.id, ano, dataAssinatura: somarDias(base, -5), gestor: 'Gestor Exemplo 3', parcelas: cronograma([[t006234.id, 6000]]) }, adm());
  const r5 = abrir(4, 'Linha 11 · Trecho Mogi das Cruzes', 'principal_pesado', t006234.id, 1, 20);
  em(3); iniciarSeparacao(e, r5, alm());
  abrir(2, 'Linha 7 · Desvio de Francisco Morato (AMV)', 'desvio', t006219.id, 2, 6);

  // Saldo do DOF informado há 7 dias: igual ao físico, menos a Maçaranduba, 15% acima (alerta do art. 41).
  em(7, 9);
  informarSaldoDof(e, {
    data: somarDias(base, -7),
    itens: saldoPatio(e).filter((s) => s.fisicoM3 > 0).map((s) => ({ especieId: s.especieId, volumeM3: s.especieId === 'es0002' ? s.fisicoM3 * 1.15 : s.fisicoM3 })),
    observacao: 'Consulta mensal do saldo no sistema DOF.',
  }, alm());

  // E3 (2ª parcela do AR00224-01): a entrega "a caminho" com IDs fixos e DOF que vence em 3 dias.
  gerar(1, c1.id, 2, [{ itemContratoId: ic1.id, fardos: 2 }, { itemContratoId: ic2.id, fardos: 1 }], 3);

  return e;
}
