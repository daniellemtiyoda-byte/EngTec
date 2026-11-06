import { useEffect, useId, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rotaDoCodigo } from '../utils/busca';
import { Modal } from './Modal';

/**
 * Botão "Ler QR" enquanto a câmera não chega (Etapa 4, `LeitorQr`): digitar o código escrito na plaquinha.
 * Código reconhecido abre o objeto; os IDs v2 passam a ser reconhecidos na Etapa 4.
 */
export function EntradaCodigo({ aberto, aoFechar }: { aberto: boolean; aoFechar: () => void }) {
  const nav = useNavigate();
  const id = useId();
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string>();
  useEffect(() => { if (aberto) { setTexto(''); setErro(undefined); } }, [aberto]);

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    const t = texto.trim();
    if (!t) { setErro('Digite o código.'); return; }
    const rota = rotaDoCodigo(t);
    if (!rota) { setErro(`"${t}" não é um código reconhecido pelo sistema. Confira o código escrito na plaquinha.`); return; }
    aoFechar();
    nav(rota);
  }

  return (
    <Modal titulo="Ler QR" aberto={aberto} aoFechar={aoFechar}>
      <form onSubmit={enviar} noValidate className="entrada-codigo">
        <p className="mudo">A leitura pela câmera ainda está em construção. Digite o código escrito na plaquinha do dormente, do fardo ou do local.</p>
        <div className="campo">
          <label htmlFor={id}>Código</label>
          <input id={id} value={texto} onChange={(e) => setTexto(e.target.value)} autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={80} aria-invalid={!!erro} aria-describedby={erro ? `${id}-erro` : undefined} placeholder="Ex.: AR00224-01-000357" />
          {erro && <span id={`${id}-erro`} className="erro-campo" role="alert">{erro}</span>}
        </div>
        <button type="submit" className="btn btn-pri">Abrir</button>
      </form>
    </Modal>
  );
}
