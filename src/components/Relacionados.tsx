import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icone, type NomeIcone } from './Icone';

export interface ItemRelacionado {
  icone: NomeIcone;
  /** Tipo do objeto ligado ("Contrato", "NF"...). */
  tipo: string;
  valor: ReactNode;
  para?: string;
  detalhe?: string;
}

/** Objetos ligados ao da página (contrato ↔ fardos ↔ dormentes ↔ NF ↔ recebimento ↔ inspeção ↔ saída). */
export function Relacionados({ itens, titulo = 'Relacionados' }: { itens: ItemRelacionado[]; titulo?: string }) {
  return (
    <aside className="relacionados" aria-label={titulo}>
      <h2 className="relacionados-titulo">{titulo}</h2>
      {itens.length === 0 ? <p className="mudo">Nada ligado a este registro.</p> : (
        <ul>
          {itens.map((i, n) => (
            <li key={n}>
              <Icone nome={i.icone} tamanho={18} />
              <div>
                <span className="relacionado-tipo">{i.tipo}</span>
                <span className="relacionado-valor">{i.para ? <Link to={i.para}>{i.valor}</Link> : i.valor}</span>
                {i.detalhe && <span className="mudo">{i.detalhe}</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </aside>
  );
}
