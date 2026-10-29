import { StatusRegistroBadge } from './Badge';
import { CodigoLink } from './Codigos';
import { Vazio } from './Estados';
import { TIPO_MOVIMENTACAO } from '../dominio/rotulos';
import type { EventoLote } from '../types/models';
import { dataHora } from '../utils/format';

const ICONE_EVENTO: Record<EventoLote['tipo'], string> = {
  nf: 'NF', recebimento: 'REC', declaracao: 'DOF', inspecao: 'INS', entrada: 'ENT', saida: 'SAÍ', transferencia: 'TRF', perda: 'PER', ajuste: 'AJU',
};

/** Linha do tempo do lote ou do fardo (RF23): cada evento com data, usuário e o documento de referência. */
export function LinhaTempo({ eventos }: { eventos: EventoLote[] }) {
  if (!eventos.length) return <Vazio mensagem="Sem eventos registrados." />;
  return (
    <ol className="linha-tempo">
      {eventos.map((e, i) => (
        <li key={i} className={`evento evento-${e.tipo}`}>
          <span className="evento-marca" aria-hidden="true">{ICONE_EVENTO[e.tipo]}</span>
          <div>
            <div className="evento-topo">
              <strong>{e.titulo}</strong>
              {e.tipo in TIPO_MOVIMENTACAO && e.status && e.status !== 'aprovado' && <StatusRegistroBadge s={e.status} />}
            </div>
            <div className="mudo">{dataHora(e.quando)}{e.usuario && ` · ${e.usuario}`}{e.referencia && <> · <CodigoLink codigo={e.referencia} /></>}</div>
            {e.detalhe && <div>{e.detalhe}</div>}
          </div>
        </li>
      ))}
    </ol>
  );
}
