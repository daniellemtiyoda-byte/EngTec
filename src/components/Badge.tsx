import type { ReactNode } from 'react';
import { STATUS_ESTOQUE, STATUS_REGISTRO, type Rotulos, type Tom } from '../dominio/rotulos';
import type { StatusEstoque, StatusRegistro } from '../types/models';

export type { Tom };

export function Badge({ tom, children }: { tom: Tom; children: ReactNode }) {
  return <span className={`badge badge-${tom}`}>{children}</span>;
}

/** Badge de um estado do dicionário do domínio: `<BadgeDe mapa={ESTADO_INVENTARIO} valor={s.estado} />`. */
export function BadgeDe<K extends string>({ mapa, valor }: { mapa: Rotulos<K>; valor: K }) {
  const [tom, rotulo] = mapa[valor] ?? ['cinza', valor];
  return <Badge tom={tom}>{rotulo}</Badge>;
}

export const StatusRegistroBadge = ({ s }: { s: StatusRegistro }) => <BadgeDe mapa={STATUS_REGISTRO} valor={s} />;
export const StatusEstoqueBadge = ({ s }: { s: StatusEstoque }) => <BadgeDe mapa={STATUS_ESTOQUE} valor={s} />;
