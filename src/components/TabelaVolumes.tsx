import { AVISO_ARTIGO_53 } from '../dominio/parametros';
import { useCadastros } from '../hooks/useCadastros';
import type { DivergenciaVolume } from '../types/models';
import { m3, numero, pct } from '../utils/format';
import { Badge } from './Badge';
import { Aviso } from './Estados';

/**
 * Volume por espécie (tabela no computador, cartões no celular): DOF × volume nominal (recebidos × volume do tamanho,
 * sem a falta declarada) e, depois da inspeção, volume medido (medidas reais). A diferença usa o medido quando existe;
 * antes, é provisória (nominal).
 */
export function TabelaVolumes({ volumes, legenda }: { volumes: DivergenciaVolume[]; legenda: string }) {
  const cad = useCadastros();
  const provisoria = volumes.some((d) => d.base === 'nominal');
  return (
    <>
      {volumes.some((d) => d.acimaTolerancia) && <Aviso tom="alerta">{AVISO_ARTIGO_53}</Aviso>}
      <div className="tabela-wrap">
        <table className="tabela tabela-cartoes">
          <caption className="sr-only">{legenda}</caption>
          <thead>
            <tr>
              <th scope="col">Espécie</th>
              <th scope="col" className="al-right">DOF</th>
              <th scope="col" className="al-right">Volume nominal</th>
              <th scope="col" className="al-right">Volume medido</th>
              <th scope="col" className="al-right">Diferença</th>
            </tr>
          </thead>
          <tbody>
            {volumes.map((d) => (
              <tr key={d.especieId}>
                <td data-rotulo="Espécie">{cad.nomeEspecie(d.especieId)}</td>
                <td className="al-right" data-rotulo="DOF">{m3(d.documentalM3)}</td>
                <td className="al-right" data-rotulo="Volume nominal">{m3(d.nominalM3)}</td>
                <td className="al-right" data-rotulo="Volume medido">
                  {d.medidoM3 !== undefined ? m3(d.medidoM3) : <span className="mudo">após a inspeção</span>}
                  {d.estimados ? <span className="mudo"> (inclui {numero(d.estimados)} {d.estimados === 1 ? 'estimado' : 'estimados'})</span> : null}
                </td>
                <td className="al-right" data-rotulo="Diferença">
                  {Number.isFinite(d.percentual) ? pct(d.percentual) : 'sem DOF'}
                  {d.base === 'nominal' && <> <Badge tom="cinza">provisória</Badge></>}
                  {d.acimaTolerancia && <> <Badge tom="vermelho">acima de 10%</Badge></>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mudo">
        {provisoria
          ? 'Diferença provisória, pelo volume nominal (dormentes recebidos × volume do tamanho). A oficial usa o volume medido na inspeção, quando todos os fardos recebidos da espécie forem inspecionados.'
          : 'Diferença oficial, pelo volume medido na inspeção (aprovados e reprovados).'}
        {volumes.some((d) => d.estimados) && ' Estimados: dormentes lançados à mão sem medidas, contados pelo volume do tamanho.'}
      </p>
    </>
  );
}
