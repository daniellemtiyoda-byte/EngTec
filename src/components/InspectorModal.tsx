import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { PROTOCOLO_INSPECTOR } from '../config/env';
import type { Lote } from '../types/models';
import { un } from '../utils/format';
import { Modal } from './Modal';

/** Dados que o Holz Trilho manda ao sistema de inspeção (PRD, "Estoque → Inspeção"). */
function dadosDoLote(l: Lote) {
  const ultima = String(l.quantidade).padStart(4, '0');
  return {
    lote: l.codigo, nf: l.nfNumero, especie: l.especieDocumental, tamanho: l.tamanho, quantidade: String(l.quantidade),
    pecas: `${l.codigo}-0001 a ${l.codigo}-${ultima}`,
  };
}

/**
 * RF05: abre o Railway Edge Inspector (app de desktop) com os dados do lote, por um protocolo próprio.
 * Só funciona no computador onde o Inspector está instalado e registrado; por isso os dados também aparecem
 * para copiar e digitar à mão (e no celular, onde o Inspector não abre).
 */
export function InspectorModal({ lote, aoFechar }: { lote: Lote | null; aoFechar: () => void }) {
  const [copiado, setCopiado] = useState(false);
  // A classe no <body> limita a impressão às etiquetas (ver styles.css) e sai depois de imprimir.
  useEffect(() => {
    const limpar = () => document.body.classList.remove('imprimir-etiquetas');
    window.addEventListener('afterprint', limpar);
    return () => { window.removeEventListener('afterprint', limpar); limpar(); };
  }, []);
  if (!lote) return null;
  const d = dadosDoLote(lote);
  const { pecas, ...params } = d;
  const endereco = `${PROTOCOLO_INSPECTOR}?${new URLSearchParams(params).toString()}`;
  const texto = `Lote ${d.lote} · NF ${d.nf} · ${d.especie} · Tamanho ${d.tamanho} · ${d.quantidade} peças · códigos ${pecas}`;

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(true);
    } catch {
      setCopiado(false);
    }
  }

  return (
    <Modal
      titulo={`Inspecionar o lote ${lote.codigo}`} aberto aoFechar={() => { setCopiado(false); aoFechar(); }}
      rodape={<>
        <button type="button" className="btn btn-sec" onClick={() => { document.body.classList.add('imprimir-etiquetas'); window.print(); }}>Imprimir etiquetas das peças</button>
        <button type="button" className="btn btn-sec" onClick={() => void copiar()}>{copiado ? 'Copiado' : 'Copiar dados'}</button>
        <a className="btn btn-pri" href={endereco}>Abrir no Inspector</a>
      </>}
    >
      <p>
        Cada peça é fotografada no Inspector com o código do lote e a sua sequência. O resultado de cada peça chega aqui sozinho;
        nada muda no estoque até você formar os fardos.
      </p>
      <dl className="detalhes">
        <dt>Lote</dt><dd><strong>{d.lote}</strong></dd>
        <dt>NF</dt><dd>{d.nf}</dd>
        <dt>Espécie declarada</dt><dd><em>{d.especie}</em></dd>
        <dt>Tamanho</dt><dd>{d.tamanho}</dd>
        <dt>Quantidade</dt><dd>{un(lote.quantidade)}</dd>
        <dt>Código das peças</dt><dd><code>{pecas}</code></dd>
      </dl>
      <p className="mudo">
        "Abrir no Inspector" só funciona no computador onde o Inspector está instalado. Se nada abrir, copie os dados e digite o código de
        cada peça no campo "código da peça" do Inspector.
      </p>
      <p className="mudo">
        Cole uma etiqueta em cada dormente antes de fotografar: o código dela é o que vai no Inspector e é por ele que a peça é
        rastreada no fardo, na separação e na saída.
      </p>
      {copiado && <span className="sr-only" role="status">Dados copiados.</span>}
      {createPortal(
        <div className="etiquetas etiquetas-pecas" aria-hidden="true">
          {Array.from({ length: lote.quantidade }, (_, i) => `${lote.codigo}-${String(i + 1).padStart(4, '0')}`).map((c) => (
            <div className="etiqueta" key={c}>
              <div className="etiqueta-codigo">{c}</div>
              <div><em>{lote.especieDocumental}</em> · {lote.tamanho}</div>
              <div>NF {lote.nfNumero}</div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Modal>
  );
}
