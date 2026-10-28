import { useEffect, useId, useRef, type ReactNode } from 'react';

interface ModalProps { titulo: string; aberto: boolean; aoFechar: () => void; children: ReactNode; rodape?: ReactNode; /** Formulários com listas (itens da NF, fardos). */ largo?: boolean }

const FOCAVEIS = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function Modal({ titulo, aberto, aoFechar, children, rodape, largo }: ModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  // Guarda sempre o aoFechar mais recente: o efeito abaixo só roda ao abrir/fechar.
  const fecharRef = useRef(aoFechar);
  fecharRef.current = aoFechar;

  useEffect(() => {
    if (!aberto) return;
    const anterior = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { fecharRef.current(); return; }
      if (e.key !== 'Tab' || !ref.current) return;
      // Mantém o foco dentro do modal (Tab e Shift+Tab circulam entre os elementos dele).
      const itens = Array.from(ref.current.querySelectorAll<HTMLElement>(FOCAVEIS));
      if (!itens.length) return;
      const [primeiro, ultimo] = [itens[0], itens[itens.length - 1]];
      if (e.shiftKey && (document.activeElement === primeiro || document.activeElement === ref.current)) { e.preventDefault(); ultimo.focus(); }
      else if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro.focus(); }
    };
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('keydown', tecla); anterior?.focus(); };
  }, [aberto]);
  if (!aberto) return null;
  return (
    <div className="modal-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget) aoFechar(); }}>
      <div className={largo ? 'modal modal-largo' : 'modal'} role="dialog" aria-modal="true" aria-labelledby={tituloId} tabIndex={-1} ref={ref}>
        <div className="modal-topo">
          <h2 id={tituloId}>{titulo}</h2>
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
