import type { ReactNode } from 'react';
import type { Rotulos, Tom } from '../dominio/rotulos';

export type { Tom };

export function Badge({ tom, children }: { tom: Tom; children: ReactNode }) {
  return <span className={`badge badge-${tom}`}>{children}</span>;
}

/** Badge de um estado do dicionário do domínio: `<BadgeDe mapa={SITUACAO_FARDO} valor={f.situacao} />`. */
export function BadgeDe<K extends string>({ mapa, valor }: { mapa: Rotulos<K>; valor: K }) {
  const [tom, rotulo] = mapa[valor] ?? ['cinza', valor];
  return <Badge tom={tom}>{rotulo}</Badge>;
}
