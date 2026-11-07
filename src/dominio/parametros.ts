/**
 * Regras fixas e cálculos do domínio usados pelas telas (prévia) e pelo mock. No Supabase (Etapa 9), as mesmas
 * regras valem no banco. Valores que a CPTM ainda vai definir NÃO ficam aqui: estão em `servicos.parametros`
 * (limite de dias em estoque, antecedência dos alertas de DOF, níveis de estoque, limites das categorias).
 */
import type { Categoria, Classe, NivelPrazo, RegrasAta, ResultadoInspecao, SituacaoParcela, SituacaoSaldo, TipoDestino, VereditoInspector } from '../types/models';

/** Divergência de volume acima disto (por espécie) gera alerta: regra da IN Ibama, não editável. */
export const TOLERANCIA_VOLUME_PCT = 10;

/** Padrões dos parâmetros editáveis (valores iniciais da demonstração). */
export const LIMITE_DIAS_ESTOQUE_PADRAO = 120;
export const ALERTA_DOF_DIAS_PADRAO: [number, number] = [3, 1];
/** PROVISÓRIO, a confirmar com o time da inspeção: índice ≥ 80 → categoria 1; ≥ 50 → 2; abaixo → 3. */
export const LIMITES_CATEGORIA_PADRAO: [number, number] = [80, 50];
export const DORMENTES_POR_FARDO_PADRAO = 14;
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

/** Soma dias úteis (segunda a sexta) a uma data AAAA-MM-DD. Feriados ainda não entram (a CPTM pode fornecer o calendário). */
export function somarDiasUteis(aaaammdd: string, dias: number): string {
  let d = aaaammdd;
  let falta = dias;
  while (falta > 0) {
    d = somarDias(d, 1);
    const semana = new Date(`${d}T00:00:00Z`).getUTCDay();
    if (semana !== 0 && semana !== 6) falta--;
  }
  return d;
}

/** Dias úteis de `de` até `ate` (negativo se `ate` já passou). */
export function diasUteisEntre(de: string, ate: string): number {
  if (ate < de) return -diasUteisEntre(ate, de);
  let n = 0;
  for (let d = de; d < ate; d = somarDias(d, 1)) {
    const semana = new Date(`${somarDias(d, 1)}T00:00:00Z`).getUTCDay();
    if (semana !== 0 && semana !== 6) n++;
  }
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
export function nivelPrazoUteis(prazo: string, hoje: string, [atencao, critico]: [number, number]): NivelPrazo {
  if (hoje > prazo) return 'vencido';
  const dias = diasUteisEntre(hoje, prazo);
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
