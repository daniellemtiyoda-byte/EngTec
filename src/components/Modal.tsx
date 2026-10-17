import { useEffect, useRef, type ReactNode } from 'react';

interface ModalProps { titulo: string; aberto: boolean; aoFechar: () => void; children: ReactNode; rodape?: ReactNode }

export function Modal({ titulo, aberto, aoFechar, children, rodape }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') aoFechar(); };
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('keydown', tecla); anterior?.focus(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);
  if (!aberto) return null;
  return (
    <div className="modal-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="modal-titulo" tabIndex={-1} ref={ref}>
        <div className="modal-topo">
          <h2 id="modal-titulo">{titulo}</h2>
          <button className="btn-icone" onClick={aoFechar} aria-label="Fechar">×</button>
        </div>
        <div className="modal-corpo">{children}</div>
        {rodape && <div className="modal-rodape">{rodape}</div>}
      </div>
    </div>
  );
}

interface ConfirmProps { titulo: string; mensagem: string; aberto: boolean; aoConfirmar: () => void; aoCancelar: () => void; perigo?: boolean; carregando?: boolean; rotuloConfirmar?: string }

export function ConfirmModal({ titulo, mensagem, aberto, aoConfirmar, aoCancelar, perigo, carregando, rotuloConfirmar = 'Confirmar' }: ConfirmProps) {
  return (
    <Modal
      titulo={titulo} aberto={aberto} aoFechar={aoCancelar}
      rodape={<>
        <button className="btn btn-sec" onClick={aoCancelar} disabled={carregando}>Cancelar</button>
        <button className={`btn ${perigo ? 'btn-perigo' : 'btn-pri'}`} onClick={aoConfirmar} disabled={carregando}>{carregando ? 'Enviando…' : rotuloConfirmar}</button>
      </>}
    >
      <p>{mensagem}</p>
    </Modal>
  );
}
