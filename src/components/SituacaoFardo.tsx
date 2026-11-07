import { SITUACAO_FARDO } from '../dominio/rotulos';
import type { Fardo } from '../types/models';
import { numero } from '../utils/format';
import { Badge, BadgeDe } from './Badge';

/** Situação do fardo e, quando em estoque e incompleto (algum dormente já saiu numa RME), o selo secundário "Aberto". */
export function SituacaoFardo({ fardo }: { fardo: Pick<Fardo, 'situacao' | 'aberto'> }) {
  return (
    <span className="situacao-fardo">
      <BadgeDe mapa={SITUACAO_FARDO} valor={fardo.situacao} />
      {fardo.aberto && <Badge tom="cinza">Aberto</Badge>}
    </span>
  );
}

/**
 * Disponível do fardo com a diferença para o saldo explicada na linha: os reservados ainda estão no fardo (contam no
 * saldo), mas já não estão disponíveis para nova saída. O detalhe fica visível, também no cartão do celular.
 */
export function DisponivelFardo({ fardo }: { fardo: Pick<Fardo, 'saldo' | 'disponivel'> }) {
  const reservados = fardo.saldo - fardo.disponivel;
  return (
    <span className="disponivel-fardo">
      {numero(fardo.disponivel)}
      {reservados > 0 && (
        <span className="detalhe-linha" title={`Saldo ${fardo.saldo} = ${fardo.disponivel} disponíveis + ${reservados} reservados para RME (ainda no fardo)`}>
          {numero(reservados)} {reservados === 1 ? 'reservado' : 'reservados'}
        </span>
      )}
    </span>
  );
}
