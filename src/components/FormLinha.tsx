import { useId, useState, type ReactNode } from 'react';
import { ApiError, mensagemSegura } from '../services/http';
import { validarCampos, type Campo } from './FormModal';

interface Props {
  campos: Campo[];
  rotuloEnviar: string;
  /** Valores com que o formulário começa e para os quais volta depois de incluir (ex.: situação "Liberado"). */
  iniciais?: Record<string, string>;
  /** Linha de explicação embaixo dos campos (ex.: o que cada opção significa). */
  legenda?: ReactNode;
  validar?: (v: Record<string, string>) => Record<string, string>;
  /** Os valores chegam como texto, como no FormModal; a tela converte para o modelo. */
  aoEnviar: (valores: Record<string, string>) => Promise<void>;
}

/**
 * Inclusão em linha, acima da tabela de um cadastro: os campos lado a lado (empilhados no celular) e o botão no fim.
 * Os campos são os mesmos `Campo` do FormModal, com a mesma validação; a edição continua no FormModal.
 */
export function FormLinha({ campos, rotuloEnviar, iniciais, legenda, validar, aoEnviar }: Props) {
  const vazio = () => Object.fromEntries(campos.map((c) => [c.nome, iniciais?.[c.nome] ?? '']));
  const [valores, setValores] = useState<Record<string, string>>(vazio);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [erroGeral, setErroGeral] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const formId = useId();

  async function aoSubmeter(ev: React.FormEvent) {
    ev.preventDefault();
    const e = { ...validarCampos(campos, valores), ...(validar ? validar(valores) : {}) };
    setErros(e);
    setErroGeral(undefined);
    if (Object.keys(e).length) return;
    setEnviando(true);
    try {
      await aoEnviar(valores);
      setValores(vazio());
    } catch (err) {
      if (err instanceof ApiError && err.detalhes) setErros(err.detalhes);
      setErroGeral(mensagemSegura(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className="form-linha" onSubmit={aoSubmeter} noValidate>
      {erroGeral && <div className="aviso aviso-critico" role="alert">{erroGeral}</div>}
      <div className="form-linha-campos">
        {campos.map((c) => {
          const id = `${formId}-${c.nome}`;
          const comum = {
            id, name: c.nome, value: valores[c.nome] ?? '', title: c.rotulo, disabled: enviando,
            'aria-invalid': !!erros[c.nome], 'aria-describedby': erros[c.nome] ? `${id}-erro` : undefined,
            onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setValores((s) => ({ ...s, [c.nome]: e.target.value })),
          };
          return (
            <div className="campo" key={c.nome}>
              <label htmlFor={id} className="sr-only">{c.rotulo}{c.obrigatorio ? ' (obrigatório)' : ''}</label>
              {c.tipo === 'select' ? (
                <select {...comum}>
                  <option value="">{c.rotulo}{c.obrigatorio ? '' : ' (opcional)'}</option>
                  {c.opcoes?.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
                </select>
              ) : (
                <input
                  {...comum} placeholder={c.ajuda ? `${c.rotulo} (${c.ajuda})` : c.rotulo} maxLength={c.maxLength ?? 120} autoComplete="off"
                  type="text" inputMode={c.tipo === 'number' ? 'decimal' : undefined}
                />
              )}
              {erros[c.nome] && <span className="erro-campo" id={`${id}-erro`}>{erros[c.nome]}</span>}
            </div>
          );
        })}
        <button type="submit" className="btn btn-pri" disabled={enviando}>{enviando ? 'Incluindo…' : `+ ${rotuloEnviar}`}</button>
      </div>
      {legenda && <p className="ajuda form-linha-legenda">{legenda}</p>}
    </form>
  );
}
