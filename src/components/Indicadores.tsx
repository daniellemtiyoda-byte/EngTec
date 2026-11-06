import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Tom } from '../dominio/rotulos';
import { numero } from '../utils/format';

interface PropsIndicador {
  rotulo: string;
  valor: number | string;
  /** Variação ou alerta em texto (a cor só reforça). */
  detalhe?: ReactNode;
  tom?: Tom;
  /** Lista já filtrada que explica o número (todo indicador é clicável, seção 4 do plano). */
  para?: string;
}

/** Número grande com rótulo; clicável para a lista filtrada. */
export function CartaoIndicador({ rotulo, valor, detalhe, tom = 'azul', para }: PropsIndicador) {
  const conteudo = (
    <>
      <span className="indicador-rotulo">{rotulo}</span>
      <span className="indicador-valor">{typeof valor === 'number' ? numero(valor) : valor}</span>
      {detalhe && <span className="indicador-detalhe">{detalhe}</span>}
    </>
  );
  const classe = `indicador indicador-${tom}`;
  return para ? <Link className={`${classe} indicador-link`} to={para}>{conteudo}</Link> : <div className={classe}>{conteudo}</div>;
}

const pct = (v: number, t: number) => (t > 0 ? Math.min(100, Math.max(0, (v / t) * 100)) : 0);

/**
 * Contratado x recebido x aprovado (contratos e itens). O texto diz os números; a barra só ilustra.
 * `unidade` troca a palavra do texto (ex. "inspecionados" no progresso da inspeção do fardo).
 */
export function BarraProgresso({ total, recebido, aprovado, rotulo, unidade = 'recebidos' }: { total: number; recebido: number; aprovado?: number; rotulo?: string; unidade?: string }) {
  const pAprovado = aprovado === undefined ? 0 : pct(aprovado, total);
  const pRecebido = pct(recebido, total);
  return (
    <div className="progresso">
      {rotulo && <span className="progresso-rotulo">{rotulo}</span>}
      <div className="progresso-trilho" aria-hidden="true">
        {aprovado !== undefined && <span className="progresso-aprovado" style={{ width: `${pAprovado}%` }} />}
        <span className="progresso-recebido" style={{ width: `${Math.max(0, pRecebido - pAprovado)}%` }} />
      </div>
      <span className="progresso-texto">
        {numero(recebido)} de {numero(total)} {unidade} ({numero(Math.round(pRecebido))}%)
        {aprovado !== undefined && <> · {numero(aprovado)} aprovados</>}
      </span>
    </div>
  );
}
