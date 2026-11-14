/**
 * Regras fixas e cálculos do domínio usados pelas telas (prévia) e pelo mock. No Supabase (Etapa 9), as mesmas
 * regras valem no banco. Valores que a CPTM ainda vai definir NÃO ficam aqui: estão em `servicos.parametros`
 * (limite de dias em estoque, antecedência dos alertas de DOF, níveis de estoque, limites das categorias).
 */
import type { Categoria, Classe, Feriado, NivelPrazo, RegrasAta, ResultadoInspecao, SituacaoParcela, SituacaoSaldo, TipoDestino, VereditoInspector } from '../types/models';

/** Divergência de volume acima disto (por espécie) gera alerta: regra da IN Ibama, não editável. */
export const TOLERANCIA_VOLUME_PCT = 10;

/** Padrões dos parâmetros editáveis (valores iniciais da demonstração). */
export const LIMITE_DIAS_ESTOQUE_PADRAO = 120;
export const ALERTA_DOF_DIAS_PADRAO: [number, number] = [3, 1];
/** PROVISÓRIO, a confirmar com o time da inspeção: índice ≥ 80 → categoria 1 (A); ≥ 50 → 2 (B); abaixo → 3 (C). */
export const LIMITES_CATEGORIA_PADRAO: [number, number] = [80, 50];
export const DORMENTES_POR_FARDO_PADRAO = 14;
/**
 * PROVISÓRIO: a CPTM vai confirmar quantos dormentes cabem num fardo de cada tamanho. Chave = código do tamanho (material
 * CPTM); tamanho fora da tabela usa o parâmetro "dormentes por fardo" das Configurações.
 */
export const DORMENTES_POR_FARDO_POR_CODIGO: Record<string, number> = {
  '006234': 14, '006219': 14, '006220': 14, '006221': 14, '006222': 14,
  '006223': 14, '006224': 14, '006225': 14, '006226': 14, '006227': 14, '006228': 14, '006231': 14,
};
/** CTF Ibama vencendo em até tantos dias aparece em atenção (o vencido bloqueia o fornecedor). */
export const DIAS_AVISO_CTF = 30;

/**
 * Regras da ata nos documentos da CPTM (Ata AR00224): padrão de cada nova ata, editáveis por ata. Pedido mínimo de
 * 6.000 dormentes por contrato, até 6 parcelas de 3.000 a 6.000 (somando os itens), com prazos contados da
 * assinatura: 1ª até 90 dias; 2ª do 91º ao 120º; 3ª do 121º ao 150º; 4ª do 151º ao 180º; 5ª do 181º ao 210º; 6ª do 211º ao 240º.
 */
export const REGRAS_ATA_PADRAO: RegrasAta = {
  pedidoMinimo: 6000, maxParcelas: 6, parcelaMinima: 3000, parcelaMaxima: 6000,
  prazosParcelas: [[0, 90], [91, 120], [121, 150], [151, 180], [181, 210], [211, 240]],
};
/** Vigência da ata de registro de preços. */
export const VIGENCIA_ATA_MESES = 12;
/** Laudo Técnico de aprovação: até 20 dias úteis contados da entrega (recebimento provisório). */
export const PRAZO_LAUDO_DIAS_UTEIS = 20;
export const ALERTA_LAUDO_DIAS_PADRAO: [number, number] = [5, 2];
/** Recebimento definitivo do contrato: 15 dias após o laudo da última entrega. */
export const DIAS_RECEBIMENTO_DEFINITIVO = 15;
/** Reprovados: comunicação ao fornecedor em até 5 dias úteis e retirada em até 15 dias úteis da conclusão da inspeção. */
export const PRAZO_COMUNICACAO_REPROVADOS_DIAS_UTEIS = 5;
export const PRAZO_RETIRADA_REPROVADOS_DIAS_UTEIS = 15;
/** Garantia do dormente: 5 anos a partir da entrega. */
export const GARANTIA_ANOS = 5;

/**
 * Cura (PIM-14 do DNIT e NBR 7511; a AD1956-4 da CPTM prevalece quando obtida): dormente tratado com CCA ou CCB só
 * fica disponível para separação 15 dias após a data de tratamento.
 */
export const DIAS_CURA = 15;
export const PRESERVATIVOS_COM_CURA = ['CCA', 'CCB'];
export const exigeCura = (preservativo: string) => PRESERVATIVOS_COM_CURA.some((p) => preservativo.trim().toUpperCase().startsWith(p));
/** Data em que o dormente sai da cura (ou a própria data de tratamento, se o preservativo não exige cura). */
export const liberacaoDaCura = (dataTratamento: string, preservativo: string) => (exigeCura(preservativo) ? somarDias(dataTratamento, DIAS_CURA) : dataTratamento);

/** Classe mínima sugerida pelo tipo de destino da RME: 1ª para linha principal de tráfego pesado; 2ª aceita nos demais. */
export const classeSugerida = (tipo: TipoDestino): Classe => (tipo === 'principal_pesado' ? 1 : 2);
/** A classe é inferior à sugerida (2ª é inferior à 1ª). */
export const classeInferior = (classe: Classe, sugerida: Classe) => classe > sugerida;

const DIA_MS = 86_400_000;

/**
 * PROVISÓRIO, a confirmar com o time da inspeção: no protótipo o resultado é só aprovado ou reprovado,
 * e o ATENÇÃO do Inspector conta como reprovado.
 */
export function resultadoDoVeredito(v: VereditoInspector): ResultadoInspecao {
  return v === 'APROVADO' ? 'aprovado' : 'reprovado';
}

/** Categoria pelo índice 0 a 100 do Inspector (limites PROVISÓRIOS, editáveis nos parâmetros). */
export function categoriaDoIndice(indice: number, [lim1, lim2]: [number, number] = LIMITES_CATEGORIA_PADRAO): Categoria {
  if (indice >= lim1) return 1;
  if (indice >= lim2) return 2;
  return 3;
}

/** Volume de um dormente em m³ a partir das medidas do tamanho em cm. */
export const volumeM3 = (comprimentoCm: number, larguraCm: number, alturaCm: number) => (comprimentoCm * larguraCm * alturaCm) / 1_000_000;

/** Item do contrato informado em m³: converte em unidades pelo volume do tamanho, arredondando para baixo. */
export function unidadesDeM3(m3: number, volumeUnitarioM3: number): number {
  if (volumeUnitarioM3 <= 0) return 0;
  // A folga evita que 2.0 / 0.1 vire 19,999… e perca uma unidade.
  return Math.floor(m3 / volumeUnitarioM3 + 1e-9);
}

/** Diferença percentual entre o volume calculado e o documental (DOF), sempre positiva. Sem volume documental: 0 ou infinito. */
export function diferencaVolumePct(documentalM3: number, calculadoM3: number): number {
  if (documentalM3 <= 0) return calculadoM3 > 0 ? Infinity : 0;
  return (Math.abs(calculadoM3 - documentalM3) / documentalM3) * 100;
}

export const foraDaTolerancia = (pct: number) => pct > TOLERANCIA_VOLUME_PCT;

/**
 * Justificativa preenchida pelo sistema quando a divergência de volume vem só dos fardos que faltaram no
 * recebimento. A tela mostra este texto no campo e a pessoa pode complementar.
 */
export function justificativaPorFalta(fardosIds: string[], faltasDormentes: { fardoId: string; quantidade: number }[] = []): string {
  const partes: string[] = [];
  if (fardosIds.length) partes.push(`${fardosIds.length === 1 ? 'um fardo' : `${fardosIds.length} fardos`} da entrega, ainda em trânsito: ${fardosIds.join(', ')}`);
  for (const f of faltasDormentes) partes.push(`${f.quantidade} ${f.quantidade === 1 ? 'dormente' : 'dormentes'} no fardo ${f.fardoId}`);
  return partes.length ? `Divergência causada pela falta de ${partes.join('; ')}.` : '';
}

/** Datas AAAA-MM-DD (sem hora) somadas em dias. */
export function somarDias(aaaammdd: string, dias: number): string {
  return new Date(Date.parse(`${aaaammdd}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Dias de `de` até `ate` (AAAA-MM-DD); negativo se `ate` vier antes. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS);
}

/**
 * Feriados de 2026 e 2027 nos dados iniciais: nacionais (inclusive a Consciência Negra, nacional desde 2024), do estado
 * de São Paulo (9 de julho) e da cidade de São Paulo (25 de janeiro e Corpus Christi). Carnaval é ponto facultativo e
 * não entra. Editáveis nos parâmetros.
 */
export const FERIADOS_PADRAO: Feriado[] = [2026, 2027].flatMap((ano) => {
  const pascoa = ano === 2026 ? '2026-04-05' : '2027-03-28';
  const n = (data: string, nome: string): Feriado => ({ data, nome, abrangencia: 'nacional' });
  return [
    n(`${ano}-01-01`, 'Confraternização Universal'),
    { data: `${ano}-01-25`, nome: 'Aniversário da cidade de São Paulo', abrangencia: 'municipal' as const },
    n(somarDias(pascoa, -2), 'Sexta-feira Santa'),
    n(`${ano}-04-21`, 'Tiradentes'),
    n(`${ano}-05-01`, 'Dia do Trabalho'),
    { data: somarDias(pascoa, 60), nome: 'Corpus Christi', abrangencia: 'municipal' as const },
    { data: `${ano}-07-09`, nome: 'Revolução Constitucionalista', abrangencia: 'estadual' as const },
    n(`${ano}-09-07`, 'Independência do Brasil'),
    n(`${ano}-10-12`, 'Nossa Senhora Aparecida'),
    n(`${ano}-11-02`, 'Finados'),
    n(`${ano}-11-15`, 'Proclamação da República'),
    n(`${ano}-11-20`, 'Dia Nacional de Zumbi e da Consciência Negra'),
    n(`${ano}-12-25`, 'Natal'),
  ];
});

const util = (d: string, feriados: Set<string>) => { const s = new Date(`${d}T00:00:00Z`).getUTCDay(); return s !== 0 && s !== 6 && !feriados.has(d); };

/** Soma dias úteis (segunda a sexta, fora os feriados dos parâmetros) a uma data AAAA-MM-DD. */
export function somarDiasUteis(aaaammdd: string, dias: number, feriados: Feriado[] = []): string {
  const f = new Set(feriados.map((x) => x.data));
  let d = aaaammdd;
  let falta = dias;
  while (falta > 0) {
    d = somarDias(d, 1);
    if (util(d, f)) falta--;
  }
  return d;
}

/** Dias úteis de `de` até `ate` (negativo se `ate` já passou), fora os feriados. */
export function diasUteisEntre(de: string, ate: string, feriados: Feriado[] = []): number {
  if (ate < de) return -diasUteisEntre(ate, de, feriados);
  const f = new Set(feriados.map((x) => x.data));
  let n = 0;
  for (let d = de; d < ate; d = somarDias(d, 1)) if (util(somarDias(d, 1), f)) n++;
  return n;
}

/** Soma anos a uma data AAAA-MM-DD (29/02 vira 28/02 em ano não bissexto). */
export function somarAnos(aaaammdd: string, anos: number): string {
  const [a, m, d] = aaaammdd.split('-').map(Number);
  const ultimo = new Date(Date.UTC(a + anos, m, 0)).getUTCDate();
  return `${a + anos}-${String(m).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

/** Soma meses a uma data AAAA-MM-DD (vigência da ata). */
export function somarMeses(aaaammdd: string, meses: number): string {
  const [a, m, d] = aaaammdd.split('-').map(Number);
  const alvo = new Date(Date.UTC(a, m - 1 + meses, 1));
  const ultimo = new Date(Date.UTC(alvo.getUTCFullYear(), alvo.getUTCMonth() + 1, 0)).getUTCDate();
  return `${alvo.getUTCFullYear()}-${String(alvo.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, ultimo)).padStart(2, '0')}`;
}

/** Janela de entrega da parcela `numero` (1, 2…): dias contados da assinatura do contrato, pelas regras da ata. */
export function janelaParcela(assinatura: string, regras: RegrasAta, numero: number): { inicio: string; fim: string } {
  const [de, ate] = regras.prazosParcelas[numero - 1] ?? regras.prazosParcelas[regras.prazosParcelas.length - 1];
  return { inicio: somarDias(assinatura, de), fim: somarDias(assinatura, ate) };
}

/** Situação da parcela: entregue (no prazo ou com atraso) quando os recebidos alcançam a quantidade; senão, atrasada depois do fim. */
export function situacaoParcela(quantidade: number, recebidos: number, fim: string, hoje: string, entregueEm?: string): SituacaoParcela {
  if (recebidos >= quantidade && entregueEm) return entregueEm > fim ? 'entregue_com_atraso' : 'entregue';
  return hoje > fim ? 'atrasada' : 'a_entregar';
}

/** Nível do prazo em dias úteis (laudo): vencido, crítico, atenção ou ok. */
export function nivelPrazoUteis(prazo: string, hoje: string, [atencao, critico]: [number, number], feriados: Feriado[] = []): NivelPrazo {
  if (hoje > prazo) return 'vencido';
  const dias = diasUteisEntre(hoje, prazo, feriados);
  if (dias <= critico) return 'critico';
  if (dias <= atencao) return 'atencao';
  return 'ok';
}

/** Data AAAA-MM-DD de um instante, no fuso de São Paulo. */
export const dataSP = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });

/** Prazo de declaração da DOF no Sinaflor: o dia seguinte ao fim da validade. */
export const prazoDeclaracao = (validade: string) => somarDias(validade, 1);

/**
 * Nível do prazo da DOF ainda não declarada: vencido (já passou), crítico (até o menor alerta, padrão 1 dia),
 * atenção (até o maior, padrão 3 dias) ou ok.
 */
export function nivelPrazo(prazo: string, hoje: string, [atencao, critico]: [number, number] = ALERTA_DOF_DIAS_PADRAO): NivelPrazo {
  const dias = diasEntre(hoje, prazo);
  if (dias < 0) return 'vencido';
  if (dias <= critico) return 'critico';
  if (dias <= atencao) return 'atencao';
  return 'ok';
}

/** Falta (abaixo do mínimo), excesso (acima do máximo) ou ok, pelo estoque disponível do item. */
export function situacaoSaldo(disponivel: number, minimo: number, maximo: number): SituacaoSaldo {
  if (disponivel < minimo) return 'falta';
  if (disponivel > maximo) return 'excesso';
  return 'ok';
}

/** Limites da emissão (iguais aos do serviço e do banco): dormentes por fardo e fardos por item. Valem só para validar. */
export const MAX_DORMENTES_POR_FARDO = 50;
export const MAX_FARDOS_POR_ITEM = 50;
/**
 * PROVISÓRIO, a CPTM vai confirmar: quantos fardos cheios (do padrão) formam uma carga. A sugestão do Simulador é de uma
 * carga, não da parcela inteira.
 */
export const CARGA_PADRAO_FARDOS = 3;

export interface DivisaoEmFardos { fardos: number; dormentesPorFardo: number; aviso?: string }

/** Texto "28 dormentes em 2 fardos de 14" (singular quando for um fardo só). */
export const textoDivisao = (fardos: number, porFardo: number) => `${fardos} ${fardos === 1 ? 'fardo' : 'fardos'} de ${porFardo}`;

/**
 * Divide `total` dormentes (o que a pessoa quer enviar) em fardos iguais, para uma carga. O total enviado é sempre
 * fardos × dormentesPorFardo, nunca o digitado:
 * - total maior que uma carga (`carga` fardos do `padrao`): `carga` fardos do padrão, o resto fica para a próxima emissão;
 * - total que cabe em uma carga: o maior número por fardo, até o padrão, que divide o total exatamente (40 com padrão 14 →
 *   4 × 10; 42 → 3 × 14); menor que o padrão, um fardo só; se o melhor divisor ficar abaixo da metade do padrão (ex.
 *   total primo), fardos cheios do padrão e aviso com a sobra (41 → 2 × 14, os outros 13 ficam para a próxima emissão).
 * Total 0 (ou inválido): sem fardos.
 */
export function sugerirDivisao(total: number, padrao: number, carga: number = CARGA_PADRAO_FARDOS): DivisaoEmFardos {
  const p = Math.max(1, Math.floor(padrao) || 1);
  if (!Number.isInteger(total) || total <= 0) return { fardos: 0, dormentesPorFardo: p };
  const fardosDaCarga = Math.max(1, Math.floor(carga) || 1);
  const comSobra = (fardos: number) => ({
    fardos, dormentesPorFardo: p,
    aviso: `Vão ${fardos * p} dormentes em ${textoDivisao(fardos, p)}. Os outros ${(total - fardos * p).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ficam para a próxima emissão.`,
  });
  if (total > fardosDaCarga * p) return comSobra(fardosDaCarga);
  if (total <= p) return { fardos: 1, dormentesPorFardo: total };
  let d = p;
  while (total % d !== 0) d--;
  if (d >= p / 2) return { fardos: total / d, dormentesPorFardo: d };
  return comSobra(Math.floor(total / p));
}
