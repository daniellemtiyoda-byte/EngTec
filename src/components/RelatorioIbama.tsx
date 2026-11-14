import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { PATIO_CPTM } from '../dominio/parametros';
import { cnpjFormatado, dataHora } from '../utils/format';

/**
 * Cabeçalho de cada relatório do IBAMA (IN Ibama 21/2014, art. 40): pátio da CPTM (nome, CNPJ, CTF, endereço), o
 * relatório e o período, e quando foi emitido e por quem. Aparece na tela e na impressão, em todas as abas.
 */
export function CabecalhoIbama({ titulo, artigo, periodo }: { titulo: string; artigo: string; periodo: string }) {
  const { usuario } = useAuth();
  const emitidoEm = useMemo(() => new Date().toISOString(), []);
  return (
    <header className="cab-ibama">
      <div className="cab-ibama-patio">
        <strong>{PATIO_CPTM.nome}</strong>
        <span>CNPJ {cnpjFormatado(PATIO_CPTM.cnpj)} · CTF {PATIO_CPTM.ctf}</span>
        <span>{PATIO_CPTM.endereco}</span>
      </div>
      <div className="cab-ibama-relatorio">
        <h2>{titulo} <span className="detalhe-linha">({artigo})</span></h2>
        <span>{periodo}</span>
        <span>Emitido em {dataHora(emitidoEm)} por {usuario?.nome ?? '—'}</span>
      </div>
    </header>
  );
}

/**
 * Tabela de relatório que cabe em 1280 px sem barra horizontal: colunas com largura em % (`table-layout: fixed`), texto
 * que quebra ou corta com reticências (`.corta` + `title`), e cartões no celular (`.tabela-cartoes`: cada célula leva
 * `data-rotulo`, e a primeira é o título do cartão). A soma das larguras deve dar 100.
 */
export function TabelaRelatorio({ larguras, cabecalho, legenda, children, rodape }: { larguras: number[]; cabecalho: ReactNode; legenda: string; children: ReactNode; rodape?: ReactNode }) {
  return (
    <div className="tabela-wrap tabela-sem-rolagem">
      <table className="tabela tabela-fixa tabela-cartoes">
        <caption className="sr-only">{legenda}</caption>
        <colgroup>{larguras.map((l, i) => <col key={i} style={{ width: `${l}%` }} />)}</colgroup>
        <thead><tr>{cabecalho}</tr></thead>
        <tbody>{children}</tbody>
        {rodape && <tfoot>{rodape}</tfoot>}
      </table>
    </div>
  );
}

/** Texto longo numa linha só, com reticências e o texto completo no `title`. */
export function Corta({ children, texto }: { children?: ReactNode; texto: string }) {
  return <span className="corta" title={texto}>{children ?? texto}</span>;
}
