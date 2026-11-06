import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { lerCodigo, type CodigoLido } from '../dominio/identificacao';
import { rotaDoCodigo } from '../utils/busca';
import { Icone } from './Icone';
import { Modal } from './Modal';

/** BarcodeDetector ainda não está nos tipos do TypeScript. */
interface Detector { detect(fonte: CanvasImageSource): Promise<{ rawValue: string }[]> }
declare global {
  interface Window { BarcodeDetector?: new (op: { formats: string[] }) => Detector }
}

/** Resposta do chamador a uma leitura (modo capturar): mensagem de retorno e se foi aceita. */
export interface RetornoLeitura { ok: boolean; mensagem: string }

interface Props {
  aberto: boolean;
  aoFechar: () => void;
  /** navegar: lê e abre o objeto. capturar: devolve o código ao chamador (assistentes). */
  modo?: 'navegar' | 'capturar';
  /** capturar: mantém a câmera aberta e lista as leituras. */
  continuo?: boolean;
  aoLer?: (c: CodigoLido) => RetornoLeitura | void;
  titulo?: string;
  /** Conteúdo extra abaixo da câmera (ex. a lista dos fardos esperados com o contador "8 de 12 lidos"). */
  children?: ReactNode;
}

type EstadoCamera = 'iniciando' | 'ativa' | 'sem-permissao' | 'sem-camera' | 'inseguro' | 'erro';

const MENSAGEM_CAMERA: Record<Exclude<EstadoCamera, 'iniciando' | 'ativa'>, string> = {
  'sem-permissao': 'O navegador não liberou a câmera. Permita o acesso à câmera nas configurações do navegador ou digite o código abaixo.',
  'sem-camera': 'Nenhuma câmera encontrada neste aparelho. Digite o código abaixo.',
  inseguro: 'A câmera só funciona em endereço com https (ou em localhost). Abra o sistema pelo endereço seguro ou digite o código abaixo.',
  erro: 'Não foi possível abrir a câmera. Digite o código abaixo.',
};

/** Repetição da mesma leitura dentro deste intervalo é ignorada (a câmera lê o mesmo QR várias vezes por segundo). */
const INTERVALO_REPETIDA_MS = 2500;

/**
 * Leitor de QR único do sistema (seção 10.3 do plano): navega até o objeto ou devolve o código a um assistente.
 * Câmera traseira, moldura de mira, lanterna quando existir, leitura contínua com vibração curta e sempre a opção de
 * digitar o código. Só aceita códigos reconhecidos por `lerCodigo()`.
 */
export function LeitorQr({ aberto, aoFechar, modo = 'navegar', continuo, aoLer, titulo = 'Ler QR', children }: Props) {
  const nav = useNavigate();
  const idCampo = useId();
  const video = useRef<HTMLVideoElement>(null);
  const fluxo = useRef<MediaStream | null>(null);
  const ultima = useRef<{ texto: string; quando: number }>({ texto: '', quando: 0 });
  const [estado, setEstado] = useState<EstadoCamera>('iniciando');
  const [lanterna, setLanterna] = useState<boolean | null>(null);
  const [aviso, setAviso] = useState<RetornoLeitura | null>(null);
  const [digitado, setDigitado] = useState('');

  const parar = useCallback(() => {
    fluxo.current?.getTracks().forEach((t) => t.stop());
    fluxo.current = null;
  }, []);

  /** Trata um texto lido ou digitado; devolve se foi aceito. */
  const tratar = useCallback((texto: string): boolean => {
    const c = lerCodigo(texto);
    if (!c) { setAviso({ ok: false, mensagem: 'Este QR não pertence ao sistema.' }); return false; }
    if (modo === 'navegar') {
      const rota = rotaDoCodigo(c.id);
      if (!rota) { setAviso({ ok: false, mensagem: 'Código sem página no sistema.' }); return false; }
      parar();
      aoFechar();
      nav(rota);
      return true;
    }
    const r = aoLer?.(c) ?? { ok: true, mensagem: `${c.id} lido.` };
    setAviso(r);
    if (r.ok && typeof navigator.vibrate === 'function') navigator.vibrate(80);
    if (r.ok && !continuo) { parar(); aoFechar(); }
    return r.ok;
  }, [modo, aoLer, continuo, aoFechar, nav, parar]);
  // O laço da câmera chama sempre a versão atual (num assistente, a lista de lidos muda a cada leitura).
  const tratarAtual = useRef(tratar);
  tratarAtual.current = tratar;

  // Abre a câmera e procura QR nos quadros: BarcodeDetector nativo ou jsqr (carregado só se precisar).
  useEffect(() => {
    if (!aberto) return;
    setAviso(null); setDigitado(''); setLanterna(null);
    if (!window.isSecureContext) { setEstado('inseguro'); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setEstado('sem-camera'); return; }
    setEstado('iniciando');
    let vivo = true;
    let laco: number | undefined;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        if (!vivo) { s.getTracks().forEach((t) => t.stop()); return; }
        fluxo.current = s;
        const v = video.current!;
        v.srcObject = s;
        await v.play();
        setEstado('ativa');
        const trilha = s.getVideoTracks()[0];
        const capacidades = (trilha.getCapabilities?.() ?? {}) as { torch?: boolean };
        setLanterna(capacidades.torch ? false : null);

        const detector = window.BarcodeDetector ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
        const jsQR = detector ? null : (await import('jsqr')).default;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        const procurar = async () => {
          if (!vivo || !v.videoWidth) return;
          let texto: string | undefined;
          if (detector) {
            texto = (await detector.detect(v).catch(() => []))[0]?.rawValue;
          } else if (jsQR && ctx) {
            // Reduz o quadro para a leitura ficar leve em celulares mais simples.
            const escala = Math.min(1, 640 / v.videoWidth);
            canvas.width = Math.round(v.videoWidth * escala);
            canvas.height = Math.round(v.videoHeight * escala);
            ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
            const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
            texto = jsQR(img.data, img.width, img.height, { inversionAttempts: 'dontInvert' })?.data;
          }
          if (texto) {
            const agora = Date.now();
            if (texto !== ultima.current.texto || agora - ultima.current.quando > INTERVALO_REPETIDA_MS) {
              ultima.current = { texto, quando: agora };
              tratarAtual.current(texto);
            }
          }
        };
        laco = window.setInterval(() => { void procurar(); }, 250);
      } catch (e) {
        const nome = (e as DOMException)?.name;
        setEstado(nome === 'NotAllowedError' || nome === 'SecurityError' ? 'sem-permissao' : nome === 'NotFoundError' || nome === 'OverconstrainedError' ? 'sem-camera' : 'erro');
      }
    })();
    return () => { vivo = false; if (laco) window.clearInterval(laco); parar(); };
  }, [aberto]); // eslint-disable-line react-hooks/exhaustive-deps

  // Aviso de leitura some depois de 2 segundos (o item lido fica em destaque nesse tempo).
  useEffect(() => {
    if (!aviso) return;
    const t = window.setTimeout(() => setAviso(null), 2000);
    return () => window.clearTimeout(t);
  }, [aviso]);

  async function alternarLanterna() {
    const trilha = fluxo.current?.getVideoTracks()[0];
    if (!trilha || lanterna === null) return;
    try {
      await trilha.applyConstraints({ advanced: [{ torch: !lanterna } as MediaTrackConstraintSet] });
      setLanterna(!lanterna);
    } catch { setLanterna(null); }
  }

  function enviarDigitado(e: React.FormEvent) {
    e.preventDefault();
    if (!digitado.trim()) return;
    if (tratar(digitado)) setDigitado('');
  }

  const fechar = () => { parar(); aoFechar(); };

  return (
    <Modal titulo={titulo} aberto={aberto} aoFechar={fechar} largo>
      <div className="leitor">
        <div className="leitor-camera">
          <video ref={video} playsInline muted aria-label="Imagem da câmera" />
          {estado === 'ativa' && <div className="leitor-mira" aria-hidden="true" />}
          {estado === 'iniciando' && <p className="leitor-estado">Abrindo a câmera…</p>}
          {estado !== 'ativa' && estado !== 'iniciando' && <p className="leitor-estado" role="alert">{MENSAGEM_CAMERA[estado]}</p>}
          {lanterna !== null && (
            <button type="button" className="btn btn-sec leitor-lanterna" aria-pressed={lanterna} onClick={() => void alternarLanterna()}>
              {lanterna ? 'Apagar lanterna' : 'Acender lanterna'}
            </button>
          )}
        </div>
        <div className={`leitor-aviso${aviso ? (aviso.ok ? ' leitor-aviso-ok' : ' leitor-aviso-erro') : ''}`} aria-live="assertive" role="status">
          {aviso?.mensagem ?? (estado === 'ativa' ? 'Aponte a câmera para o QR da plaquinha.' : '')}
        </div>
        {children}
        <form className="leitor-digitar" onSubmit={enviarDigitado} noValidate>
          <label htmlFor={idCampo}>Digitar código</label>
          <div className="leitor-digitar-linha">
            <input
              id={idCampo} value={digitado} onChange={(e) => setDigitado(e.target.value)} autoComplete="off" autoCapitalize="characters"
              spellCheck={false} maxLength={300} placeholder="Ex.: AR00224-01-000357"
            />
            <button type="submit" className="btn btn-acao"><Icone nome="seta-direita" tamanho={18} /><span className="sr-only">Usar código</span></button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
