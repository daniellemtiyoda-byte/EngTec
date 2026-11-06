import { CodigoLink } from './Codigos';
import { Vazio } from './Estados';
import { dataHora } from '../utils/format';

/** Evento genérico da linha do tempo; cada domínio (fardo, dormente, RME) converte os seus eventos para este formato. */
export interface EventoLinhaTempo {
  quando: string;
  quem?: string;
  titulo: string;
  detalhe?: string;
  /** Código do documento ou objeto ligado (vira link por `CodigoLink`). */
  referencia?: string;
  /** Sigla curta mostrada na marca do evento (ex. "REC"). */
  marca?: string;
  /** Usado na classe CSS `evento-<tipo>` para a cor da marca. */
  tipo?: string;
}

/** Linha do tempo de um objeto: cada evento com data, usuário e o documento de referência. */
export function LinhaTempo({ eventos }: { eventos: EventoLinhaTempo[] }) {
  if (!eventos.length) return <Vazio mensagem="Sem eventos registrados." />;
  return (
    <ol className="linha-tempo">
      {eventos.map((e, i) => (
        <li key={i} className={`evento${e.tipo ? ` evento-${e.tipo}` : ''}`}>
          <span className="evento-marca" aria-hidden="true">{e.marca ?? '•'}</span>
          <div>
            <div className="evento-topo"><strong>{e.titulo}</strong></div>
            <div className="mudo">{dataHora(e.quando)}{e.quem && ` · ${e.quem}`}{e.referencia && <> · <CodigoLink codigo={e.referencia} /></>}</div>
            {e.detalhe && <div>{e.detalhe}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
