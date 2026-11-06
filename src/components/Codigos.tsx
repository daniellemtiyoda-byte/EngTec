import { rotaDoCodigo } from '../utils/busca';
import { IdCodigo } from './IdCodigo';

/**
 * Códigos clicáveis nas tabelas: cada ID abre a página do seu objeto (regra em `rotaDoCodigo`).
 * Código que ainda não é reconhecido aparece em mono, sem link.
 */
export function CodigoLink({ codigo }: { codigo?: string }) {
  if (!codigo) return <>—</>;
  return <IdCodigo id={codigo} para={rotaDoCodigo(codigo) ?? undefined} />;
}

/** Lista de códigos separados por vírgula, cada um com seu link. */
export function CodigosLink({ codigos }: { codigos: string[] }) {
  return <>{codigos.map((c, i) => <span key={c}>{i > 0 && ', '}<CodigoLink codigo={c} /></span>)}</>;
}
