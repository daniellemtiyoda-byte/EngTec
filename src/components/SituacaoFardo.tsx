import { SITUACAO_FARDO } from '../dominio/rotulos';
import type { Fardo } from '../types/models';
import { data, numero } from '../utils/format';
import { Badge, BadgeDe } from './Badge';

/**
 * Situação do fardo, com os selos secundários: "Aberto" (em estoque e incompleto: algum dormente já saiu numa RME) e
 * "Em cura até" (CCA ou CCB: 15 dias após o tratamento, fora do disponível até a data de liberação).
 */
export function SituacaoFardo({ fardo }: { fardo: Pick<Fardo, 'situacao' | 'aberto' | 'emCuraAte'> }) {
  return (
    <span className="situacao-fardo">
      <BadgeDe mapa={SITUACAO_FARDO} valor={fardo.situacao} />
      {fardo.aberto && <Badge tom="cinza">Aberto</Badge>}
      {fardo.emCuraAte && <Badge tom="laranja">Em cura até {data(fardo.emCuraAte)}</Badge>}
    </span>
  );
}

/**
 * Disponível do fardo com a diferença para o saldo explicada na linha: os reservados ainda estão no fardo (contam no
 * saldo), mas já não estão disponíveis para nova saída; os em cura só ficam disponíveis na liberação. O detalhe fica
 * visível, também no cartão do celular.
 */
export function DisponivelFardo({ fardo }: { fardo: Pick<Fardo, 'saldo' | 'disponivel' | 'reservados' | 'emCuraAte'> }) {
  const { reservados } = fardo;
  const emCura = fardo.emCuraAte ? fardo.saldo - reservados : 0;
  return (
    <span className="disponivel-fardo">
      {numero(fardo.disponivel)}
      {reservados > 0 && (
        <span className="detalhe-linha" title={`Saldo ${fardo.saldo}: ${reservados} reservados para RME (ainda no fardo)`}>
          {numero(reservados)} {reservados === 1 ? 'reservado' : 'reservados'}
        </span>
      )}
      {emCura > 0 && (
        <span className="detalhe-linha" title={`${emCura} em cura: disponíveis a partir de ${data(fardo.emCuraAte)}`}>
          {numero(emCura)} em cura até {data(fardo.emCuraAte)}
        </span>
      )}
    </span>
  );
}
