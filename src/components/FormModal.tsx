import { useEffect, useId, useState } from 'react';
import { ApiError, mensagemSegura } from '../services/http';
import { paraNumero } from '../utils/format';
import { ConfirmModal, Modal } from './Modal';

export interface Campo {
  nome: string;
  rotulo: string;
  tipo?: 'text' | 'number' | 'select' | 'date' | 'textarea';
  obrigatorio?: boolean;
  opcoes?: { valor: string; rotulo: string }[];
  min?: number;
  max?: number;
  passo?: number;
  inteiro?: boolean;
  maxLength?: number;
  ajuda?: string;
}

interface Props {
  titulo: string;
  campos: Campo[];
  aberto: boolean;
  aoFechar: () => void;
  aoEnviar: (valores: Record<string, string>) => Promise<void>;
  rotuloEnviar?: string;
  /** Validação adicional entre campos; retorna { campo: mensagem }. */
  validar?: (v: Record<string, string>) => Record<string, string>;
  /** Se retornar texto, exibe modal de confirmação antes de enviar (operações críticas). */
  confirmacao?: (v: Record<string, string>) => string | undefined;
}

export function FormModal({ titulo, campos, aberto, aoFechar, aoEnviar, rotuloEnviar = 'Salvar', validar, confirmacao }: Props) {
  const vazio = () => Object.fromEntries(campos.map((c) => [c.nome, '']));
  const [valores, setValores] = useState<Record<string, string>>(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const [pendente, setPendente] = useState<Record<string, string> | null>(null);
  const formId = useId();

  useEffect(() => {
    if (aberto) { setValores(vazio()); setErros({}); setErroGeral(undefined); setPendente(null); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [aberto]);

  function validarCampos(): Record<string, string> {
    const e: Record<string, string> = {};
    for (const c of campos) {
      const v = (valores[c.nome] ?? '').trim();
      if (!v) { if (c.obrigatorio) e[c.nome] = 'Campo obrigatório.'; continue; }
      if (c.tipo === 'number') {
        // Mesma conversão que a tela usa no envio: o valor validado é o valor enviado.
        const n = paraNumero(v, c.inteiro);
        if (Number.isNaN(n)) e[c.nome] = c.inteiro ? 'Informe um número inteiro (ex.: 1000 ou 1.000).' : 'Informe um número válido (ex.: 2,8).';
        else if (c.inteiro && !Number.isInteger(n)) e[c.nome] = 'Informe um número inteiro.';
        else if (c.min !== undefined && n < c.min) e[c.nome] = `O valor mínimo é ${c.min}.`;
        else if (c.max !== undefined && n > c.max) e[c.nome] = `O valor máximo é ${c.max}.`;
      }
    }
    return { ...e, ...(validar ? validar(valores) : {}) };
  }

  async function enviar(v: Record<string, string>) {
    setEnviando(true);
    setErroGeral(undefined);
    try {
      await aoEnviar(v);
      setPendente(null);
      aoFechar();
    } catch (e) {
      setPendente(null);
      if (e instanceof ApiError && e.detalhes) setErros(e.detalhes);
      setErroGeral(mensagemSegura(e));
    } finally {
      setEnviando(false);
    }
  }

  function aoSubmeter(ev: React.FormEvent) {
    ev.preventDefault();
    const e = validarCampos();
    setErros(e);
    if (Object.keys(e).length) return;
    const msg = confirmacao?.(valores);
    if (msg) setPendente(valores);
    else void enviar(valores);
  }

  return (
    <>
      <Modal
        titulo={titulo} aberto={aberto && !pendente} aoFechar={aoFechar}
        rodape={<>
          <button type="button" className="btn btn-sec" onClick={aoFechar} disabled={enviando}>Cancelar</button>
          <button type="submit" form={formId} className="btn btn-pri" disabled={enviando}>{enviando ? 'Enviando…' : rotuloEnviar}</button>
        </>}
      >
        <form id={formId} onSubmit={aoSubmeter} noValidate>
          {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}
          {campos.map((c) => {
            const id = `${formId}-${c.nome}`;
            const comum = {
              id, name: c.nome, value: valores[c.nome] ?? '', 'aria-invalid': !!erros[c.nome], 'aria-describedby': erros[c.nome] ? `${id}-erro` : undefined,
              onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setValores((s) => ({ ...s, [c.nome]: e.target.value })),
            };
            return (
              <div className="campo" key={c.nome}>
                <label htmlFor={id}>{c.rotulo}{c.obrigatorio && <span className="obrig" aria-hidden="true"> *</span>}</label>
                {c.tipo === 'select' ? (
                  <select {...comum}>
                    <option value="">Selecione…</option>
                    {c.opcoes?.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                  </select>
                ) : c.tipo === 'textarea' ? (
                  <textarea {...comum} rows={3} maxLength={c.maxLength ?? 500} />
                ) : (
                  <input {...comum} type={c.tipo === 'number' ? 'text' : c.tipo ?? 'text'} inputMode={c.tipo === 'number' ? 'decimal' : undefined} maxLength={c.maxLength ?? 120} autoComplete="off" />
                )}
                {c.ajuda && <span className="ajuda">{c.ajuda}</span>}
                {erros[c.nome] && <span className="erro-campo" id={`${id}-erro`}>{erros[c.nome]}</span>}
              </div>
            );
          })}
        </form>
      </Modal>
      <ConfirmModal
        titulo="Confirmar operação" mensagem={pendente ? confirmacao?.(pendente) ?? '' : ''} aberto={!!pendente} carregando={enviando}
        aoCancelar={() => setPendente(null)} aoConfirmar={() => pendente && void enviar(pendente)}
      />
    </>
  );
}
