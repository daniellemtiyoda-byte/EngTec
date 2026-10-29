import { diferencaVolumePct, foraDaTolerancia } from '../../dominio/parametros';
import type {
  Especie, Lote, Movimentacao, NotaFiscal, NovoRecebimento, Recebimento, ResultadoRecebimento, SaldoEstoque, Tamanho,
  VolumeRecebidoEspecie, VolumetriaLote,
} from '../../types/models';
import { ApiError } from '../http';

/** O que a confirmação de recebimento lê e altera nos dados simulados. */
export interface BaseRecebimento {
  especies: Especie[];
  tamanhos: Tamanho[];
  lotes: Lote[];
  saldos: SaldoEstoque[];
  volumetria: VolumetriaLote[];
  recebimentos: Recebimento[];
  movimentacoes: Movimentacao[];
}

interface Contexto {
  quando: string;
  usuario: string;
  fotos: number;
  novoId: (prefixo: string) => string;
}

/** Próximo código de lote do ano: LT26-0001, LT26-0002... */
function proximoCodigoLote(B: BaseRecebimento, quando: string) {
  const aa = quando.slice(2, 4);
  const prefixo = `LT${aa}-`;
  const ultimo = B.lotes.filter((l) => l.codigo.startsWith(prefixo)).reduce((m, l) => Math.max(m, Number(l.codigo.slice(prefixo.length)) || 0), 0);
  return `${prefixo}${String(ultimo + 1).padStart(4, '0')}`;
}

/**
 * Regras do recebimento (no modo real, aplicadas pelo servidor):
 * sem DOF não recebe; um lote por espécie + tamanho, em unidades (os fardos são formados depois da inspeção, em mock/inspecao.ts);
 * divergência de quantidade ou avaria exige foto; volume por espécie comparado ao DOF, acima da tolerância exige justificativa
 * e deixa os lotes "com divergência"; tudo fica aguardando inspeção.
 */
export function receber(B: BaseRecebimento, nf: NotaFiscal, n: NovoRecebimento, ctx: Contexto): ResultadoRecebimento {
  if (nf.situacao === 'recebida') throw new ApiError(409, 'Esta NF já foi recebida.');
  if (!nf.dof) throw new ApiError(409, 'Recebimento bloqueado: a NF não tem DOF cadastrado.');
  const dof = nf.dof;

  const erros: Record<string, string> = {};
  const porItem = new Map(n.itens.map((i) => [i.itemId, i.quantidade]));
  for (const item of nf.itens) {
    const q = porItem.get(item.id);
    if (q === undefined || !Number.isInteger(q) || q < 1) erros[`item-${item.id}`] = 'Informe a quantidade conferida (ao menos 1).';
  }
  if (Object.keys(erros).length) throw new ApiError(422, 'Confira as quantidades informadas.', erros);

  const conferida = (itemId: string) => porItem.get(itemId) ?? 0;
  const divergenciaQuantidade = nf.itens.some((i) => conferida(i.id) !== i.quantidade);
  if ((divergenciaQuantidade || n.avaria) && ctx.fotos === 0) {
    throw new ApiError(422, 'Fotos da carga são obrigatórias quando há divergência com a NF ou avaria.', { fotos: 'Anexe ao menos uma foto.' });
  }

  // Agrupa os itens da NF por espécie + tamanho: cada grupo vira um lote.
  const grupos = new Map<string, { especieId: string; tamanhoId: string; quantidade: number }>();
  for (const item of nf.itens) {
    const k = `${item.especieId}|${item.tamanhoId}`;
    const g = grupos.get(k) ?? { especieId: item.especieId, tamanhoId: item.tamanhoId, quantidade: 0 };
    g.quantidade += conferida(item.id);
    grupos.set(k, g);
  }
  const calculos = [...grupos.values()].map((g) => {
    const tamanho = B.tamanhos.find((t) => t.id === g.tamanhoId);
    const especie = B.especies.find((e) => e.id === g.especieId);
    if (!tamanho || !especie) throw new ApiError(422, 'Espécie ou tamanho do item não encontrado no cadastro.');
    return { ...g, tamanho, especie, volumeM3: g.quantidade * tamanho.volumeM3 };
  });

  // Comparação por espécie: soma dos lotes da espécie x volume do DOF da espécie.
  const volumes: VolumeRecebidoEspecie[] = dof.volumes.map((v) => {
    const recebido = calculos.filter((c) => c.especieId === v.especieId).reduce((a, c) => a + c.volumeM3, 0);
    return { especie: v.especie, volumeDofM3: v.volumeM3, volumeRecebidoM3: recebido, diferencaPct: diferencaVolumePct(recebido, v.volumeM3) };
  });
  const maior = volumes.reduce((m, v) => (Math.abs(v.diferencaPct) > Math.abs(m) ? v.diferencaPct : m), 0);
  const acimaTolerancia = volumes.some((v) => foraDaTolerancia(v.diferencaPct));
  const justificativa = n.justificativa?.trim();
  if (acimaTolerancia && !justificativa) {
    throw new ApiError(422, 'Divergência de volume acima da tolerância: a justificativa é obrigatória.', { justificativa: 'Informe a justificativa.' });
  }

  const lotes: Lote[] = [];
  for (const c of calculos) {
    const codigo = proximoCodigoLote(B, ctx.quando);
    const volEspecie = volumes.find((v) => v.especie === c.especie.nomeCientifico);
    const calcEspecie = calculos.filter((x) => x.especieId === c.especieId).reduce((a, x) => a + x.volumeM3, 0);
    // Volume do DOF da espécie distribuído entre os lotes dela, proporcional ao volume calculado.
    const volumeDocumentalM3 = volEspecie && calcEspecie > 0 ? volEspecie.volumeDofM3 * (c.volumeM3 / calcEspecie) : 0;
    const lote: Lote = {
      id: ctx.novoId('l'), codigo, fornecedor: nf.fornecedor, nfNumero: nf.numero, dofNumero: dof.numero,
      especieDocumental: c.especie.nomeCientifico, classe: c.especie.classe, inspecao: 'aguardando', etapaInspecao: 'aguardando',
      pecasInspecionadas: 0, unidadesSemFardo: c.quantidade, tamanho: c.tamanho.codigo,
      quantidade: c.quantidade, saldo: c.quantidade, fardos: 0,
      comprimentoM: c.tamanho.comprimentoCm / 100, larguraM: c.tamanho.larguraCm / 100, alturaM: c.tamanho.alturaCm / 100,
      metrosLineares: (c.quantidade * c.tamanho.comprimentoCm) / 100, volumeDocumentalM3, volumeCalculadoM3: c.volumeM3,
      recebidoEm: ctx.quando, idadeDias: 0, acimaLimiteIdade: false, situacao: acimaTolerancia ? 'divergente' : 'aguardando_inspecao', status: 'pendente', estoqueStatus: acimaTolerancia ? 'divergente' : 'em_analise', local: 'A definir',
    };
    B.lotes.unshift(lote);
    lotes.push(lote);
    B.saldos.unshift({
      id: `s${lote.id}`, loteCodigo: codigo, especieDocumental: lote.especieDocumental, classe: lote.classe,
      disponivel: 0, bloqueado: 0, emAnalise: acimaTolerancia ? 0 : c.quantidade, divergente: acimaTolerancia ? c.quantidade : 0,
      metrosLineares: lote.metrosLineares, volumeM3: c.volumeM3, local: lote.local, idadeDias: 0, acimaLimiteIdade: false,
    });
    const dif = volumeDocumentalM3 - c.volumeM3;
    B.volumetria.unshift({
      id: `v${lote.id}`, loteCodigo: codigo, volumeDocumentalM3, volumeCalculadoM3: c.volumeM3, diferencaM3: dif,
      diferencaPct: c.volumeM3 > 0 ? (dif / c.volumeM3) * 100 : 0, situacao: acimaTolerancia ? 'divergente' : 'conforme',
    });
    B.movimentacoes.unshift({
      id: ctx.novoId('m'), tipo: 'entrada', loteCodigo: codigo, especie: c.especie.nomeCientifico, referencia: `NF ${nf.numero}`, quantidade: c.quantidade, origem: nf.fornecedor, destino: 'A definir',
      dataHora: ctx.quando, usuario: ctx.usuario, status: 'aprovado',
    });
  }
  const quantidadeConferida = nf.itens.reduce((a, i) => a + conferida(i.id), 0);
  const recebimento: Recebimento = {
    id: ctx.novoId('r'), nfId: nf.id, nfNumero: nf.numero, dofNumero: dof.numero, fornecedor: nf.fornecedor, recebidoEm: ctx.quando,
    quantidadeDocumental: nf.quantidadeTotal, quantidadeConferida, divergencia: quantidadeConferida - nf.quantidadeTotal, divergenciaQuantidade,
    volumes, divergenciaVolumePct: maior, acimaTolerancia, avaria: n.avaria, fotos: ctx.fotos, justificativa: justificativa || undefined,
    observacao: n.observacao?.trim() || undefined, lotes: lotes.map((l) => l.codigo), conferente: ctx.usuario,
  };
  B.recebimentos.unshift(recebimento);
  nf.situacao = 'recebida';
  for (const e of B.especies) e.lotesAtivos = B.lotes.filter((l) => l.especieDocumental === e.nomeCientifico).length;
  return { recebimento, lotes };
}
