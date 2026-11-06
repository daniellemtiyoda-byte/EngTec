/**
 * Regras fixas e cálculos do domínio usados pelas telas (prévia) e pelo mock. No Supabase (Etapa 10), as mesmas
 * regras valem no banco. Valores que a CPTM ainda vai definir NÃO ficam aqui: estão em `servicos.parametros`
 * (limite de dias em estoque, antecedência dos alertas de DOF, níveis de estoque, limites das categorias).
 */
import type { Categoria, NivelPrazo, ResultadoInspecao, SituacaoSaldo, VereditoInspector } from '../types/models';

/** Divergência de volume acima disto (por espécie) gera alerta: regra da IN Ibama, não editável. */
export const TOLERANCIA_VOLUME_PCT = 10;

/** Padrões dos parâmetros editáveis (valores iniciais da demonstração). */
export const LIMITE_DIAS_ESTOQUE_PADRAO = 120;
export const ALERTA_DOF_DIAS_PADRAO: [number, number] = [3, 1];
/** PROVISÓRIO, a confirmar com o time da inspeção: índice ≥ 80 → categoria 1; ≥ 50 → 2; abaixo → 3. */
export const LIMITES_CATEGORIA_PADRAO: [number, number] = [80, 50];
export const DORMENTES_POR_FARDO_PADRAO = 14;

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
export function justificativaPorFalta(fardosIds: string[]): string {
  if (!fardosIds.length) return '';
  const lista = fardosIds.join(', ');
  return `Divergência causada pela falta de ${fardosIds.length === 1 ? 'um fardo' : `${fardosIds.length} fardos`} da entrega, ainda em trânsito: ${lista}.`;
}

/** Datas AAAA-MM-DD (sem hora) somadas em dias. */
export function somarDias(aaaammdd: string, dias: number): string {
  return new Date(Date.parse(`${aaaammdd}T00:00:00Z`) + dias * DIA_MS).toISOString().slice(0, 10);
}

/** Dias de `de` até `ate` (AAAA-MM-DD); negativo se `ate` vier antes. */
export function diasEntre(de: string, ate: string): number {
  return Math.round((Date.parse(`${ate}T00:00:00Z`) - Date.parse(`${de}T00:00:00Z`)) / DIA_MS);
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
