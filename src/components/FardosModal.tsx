import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ESTADO_FARDO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { mensagemSegura } from '../services/http';
import type { Lote } from '../types/models';
import { metros, rotuloClasse, un } from '../utils/format';
import { BadgeDe } from './Badge';
import { Carregando } from './Estados';
import { Modal } from './Modal';

/** Fardos de um lote e impressão das etiquetas pelo navegador (RF07): código, espécie, classe e tamanho. */
export function FardosModal({ lote, aoFechar }: { lote: Lote | null; aoFechar: () => void }) {
  const fardos = useAsync(
    () => (lote ? servicos.fardos.listar({ filters: { loteCodigo: lote.codigo }, sortBy: 'sequencia', pageSize: 500 }) : Promise.resolve(null)),
    [lote?.codigo],
  );
  const lista = fardos.dados?.items ?? [];

  // A classe no <body> limita a impressão às etiquetas (ver styles.css) e sai depois de imprimir.
  useEffect(() => {
    const limpar = () => document.body.classList.remove('imprimir-etiquetas');
    window.addEventListener('afterprint', limpar);
    return () => { window.removeEventListener('afterprint', limpar); limpar(); };
  }, []);
  function imprimir() {
    document.body.classList.add('imprimir-etiquetas');
    window.print();
  }

  return (
    <Modal
      titulo={lote ? `Fardos do lote ${lote.codigo}` : 'Fardos'} aberto={!!lote} aoFechar={aoFechar} largo
      rodape={<>
        <button className="btn btn-sec" onClick={aoFechar}>Fechar</button>
        <button className="btn btn-pri" onClick={imprimir} disabled={!lista.length}>Imprimir etiquetas</button>
      </>}
    >
      {lote && (
        <dl className="detalhes">
          <dt>Espécie</dt><dd><em>{lote.especieDocumental}</em></dd><dt>Classe</dt><dd>{rotuloClasse(lote.classe)}</dd>
          <dt>Tamanho</dt><dd>{lote.tamanho}</dd><dt>NF / DOF</dt><dd>{lote.nfNumero} / {lote.dofNumero}</dd>
        </dl>
      )}
      {fardos.carregando ? <Carregando /> : fardos.erro ? <div className="aviso aviso-critico" role="alert">{mensagemSegura(fardos.erro)}</div> : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>Fardo</th><th className="al-right">Quantidade inicial</th><th className="al-right">Saldo</th><th>Estado</th><th>Local</th></tr></thead>
            <tbody>
              {lista.map((f) => (
                <tr key={f.id}>
                  <td>{f.codigo}</td><td className="al-right">{un(f.quantidadeInicial)}</td><td className="al-right">{un(f.saldo)}</td>
                  <td><BadgeDe mapa={ESTADO_FARDO} valor={f.estado} /></td><td>{f.local}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {lote && createPortal(
        <div className="etiquetas" aria-hidden="true">
          {lista.map((f) => (
            <div className="etiqueta" key={f.id}>
              <div className="etiqueta-codigo">{f.codigo}</div>
              <div><em>{lote.especieDocumental}</em></div>
              <div>{rotuloClasse(lote.classe)} · Tamanho {lote.tamanho} ({metros(lote.comprimentoM)})</div>
              <div>{un(f.quantidadeInicial)} · Lote {lote.codigo} · NF {lote.nfNumero}</div>
            </div>
          ))}
        </div>,
        document.body,
      )}
    </Modal>
  );
}
