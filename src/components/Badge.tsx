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

/** Selo do Simulador do fornecedor: o único aviso de demonstração do sistema. `curto` mostra "Demo" (menu). */
export function SeloDemo({ curto }: { curto?: boolean }) {
  return <span className="selo-demo" title="Só para demonstração">{curto ? 'Demo' : 'Demonstração'}</span>;
}
