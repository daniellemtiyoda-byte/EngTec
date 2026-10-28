import { Link } from 'react-router-dom';
import { rotaDoCodigo } from '../utils/busca';

/**
 * Códigos clicáveis nas tabelas: lote e fardo abrem a página do lote, RME e NF abrem a lista já filtrada.
 * Texto que não é código conhecido aparece sem link.
 */
export function CodigoLink({ codigo }: { codigo?: string }) {
  if (!codigo) return <>—</>;
  const rota = rotaDoCodigo(codigo);
  return rota ? <Link className="codigo" to={rota}>{codigo}</Link> : <>{codigo}</>;
}

/** Lista de códigos separados por vírgula, cada um com seu link. */
export function CodigosLink({ codigos }: { codigos: string[] }) {
  return <>{codigos.map((c, i) => <span key={c}>{i > 0 && ', '}<CodigoLink codigo={c} /></span>)}</>;
}
