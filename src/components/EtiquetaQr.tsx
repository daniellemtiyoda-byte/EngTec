import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { linkQr } from '../dominio/identificacao';

interface Props {
  tipo: 'dormente' | 'fardo' | 'local';
  id: string;
  /** Linhas de texto ao lado do QR (contrato, espécie, comprimento...). */
  linhas?: string[];
  /** Título acima do ID (ex. "FARDO"). */
  titulo?: string;
  tamanho?: 'normal' | 'grande';
  /** Base do link (padrão: VITE_APP_URL ou o endereço aberto). */
  base?: string;
}

/**
 * Etiqueta com QR (seção 10 do plano): o QR é o link do sistema com o ID (nível de correção M, margem de 2 módulos),
 * gerado como imagem (sem `dangerouslySetInnerHTML`); ao lado, o ID em fonte mono para leitura manual.
 */
export function EtiquetaQr({ tipo, id, linhas = [], titulo, tamanho = 'normal', base }: Props) {
  const [src, setSrc] = useState<string>();
  const link = base === undefined ? linkQr(tipo, id) : linkQr(tipo, id, base);
  useEffect(() => {
    let vivo = true;
    QRCode.toDataURL(link, { errorCorrectionLevel: 'M', margin: 2, width: tamanho === 'grande' ? 320 : 220 })
      .then((url) => { if (vivo) setSrc(url); })
      .catch(() => { if (vivo) setSrc(undefined); });
    return () => { vivo = false; };
  }, [link, tamanho]);
  return (
    <div className={`etiqueta etiqueta-${tipo}${tamanho === 'grande' ? ' etiqueta-grande' : ''}`}>
      <div className="etiqueta-cptm">CPTM</div>
      <div className="etiqueta-corpo">
        {src ? <img className="etiqueta-qr" src={src} alt={`QR code de ${id}`} /> : <div className="etiqueta-qr etiqueta-qr-vazio" aria-hidden="true" />}
        <div className="etiqueta-texto">
          {titulo && <span className="etiqueta-titulo">{titulo}</span>}
          <span className="etiqueta-id">{id}</span>
          {linhas.map((l) => <span key={l} className="etiqueta-linha">{l}</span>)}
        </div>
      </div>
    </div>
  );
}
