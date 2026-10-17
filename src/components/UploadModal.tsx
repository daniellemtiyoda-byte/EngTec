import { useEffect, useState } from 'react';
import { env } from '../config/env';
import { mensagemSegura } from '../services/http';
import { Modal } from './Modal';

interface Props {
  titulo: string;
  aberto: boolean;
  aoFechar: () => void;
  /** Extensões aceitas, em minúsculas e sem ponto. O servidor deve validar novamente. */
  extensoes: string[];
  aoEnviar: (arquivo: File) => Promise<void>;
  aviso?: string;
  previaImagem?: boolean;
}

export function UploadModal({ titulo, aberto, aoFechar, extensoes, aoEnviar, aviso, previaImagem }: Props) {
  const [arquivo, setArquivo] = useState<File | null>(null);
  const [previa, setPrevia] = useState<string | null>(null);
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  useEffect(() => { if (aberto) { setArquivo(null); setErro(undefined); } }, [aberto]);
  useEffect(() => {
    if (!arquivo || !previaImagem) { setPrevia(null); return; }
    const u = URL.createObjectURL(arquivo);
    setPrevia(u);
    return () => URL.revokeObjectURL(u);
  }, [arquivo, previaImagem]);

  function escolher(f: File | undefined) {
    setErro(undefined);
    if (!f) return setArquivo(null);
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (!extensoes.includes(ext)) { setArquivo(null); return setErro(`Formato não permitido. Aceitos: ${extensoes.join(', ').toUpperCase()}.`); }
    if (f.size > env.UPLOAD_MAX_MB * 1024 * 1024) { setArquivo(null); return setErro(`Arquivo maior que o limite de ${env.UPLOAD_MAX_MB} MB.`); }
    if (f.size === 0) { setArquivo(null); return setErro('O arquivo está vazio.'); }
    setArquivo(f);
  }

  async function enviar() {
    if (!arquivo) return setErro('Selecione um arquivo.');
    setEnviando(true);
    try { await aoEnviar(arquivo); aoFechar(); }
    catch (e) { setErro(mensagemSegura(e)); }
    finally { setEnviando(false); }
  }

  return (
    <Modal
      titulo={titulo} aberto={aberto} aoFechar={aoFechar}
      rodape={<>
        <button className="btn btn-sec" onClick={aoFechar} disabled={enviando}>Cancelar</button>
        <button className="btn btn-pri" onClick={enviar} disabled={enviando || !arquivo}>{enviando ? 'Enviando…' : 'Enviar'}</button>
      </>}
    >
      {aviso && <div className="aviso aviso-info">{aviso}</div>}
      {erro && <div className="aviso aviso-critico" role="alert">{erro}</div>}
      <div className="campo">
        <label htmlFor="upload-arquivo">Arquivo ({extensoes.join(', ').toUpperCase()}, até {env.UPLOAD_MAX_MB} MB)</label>
        <input id="upload-arquivo" type="file" accept={extensoes.map((e) => `.${e}`).join(',')} onChange={(e) => escolher(e.target.files?.[0])} />
      </div>
      {arquivo && <p className="mudo">Selecionado: {arquivo.name} ({(arquivo.size / 1024).toFixed(0)} KB)</p>}
      {previa && <img className="previa" src={previa} alt="Pré-visualização da imagem selecionada" />}
    </Modal>
  );
}
