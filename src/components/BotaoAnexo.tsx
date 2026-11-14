import { linkDoAnexo } from '../services/supabase/cliente';
import { mensagemSegura } from '../services/erros';
import { useToast } from './Toast';

interface Props {
  /** Objeto Anexo ou qualquer objeto com `nome` e opcionalmente `caminho`. */
  anexo: { nome: string; caminho?: string };
  /** Classe extra para o container. */
  className?: string;
}

/**
 * Exibe o nome do anexo. Se `caminho` estiver presente (bucket privado), mostra um botão "Abrir" que gera
 * o link assinado no clique.
 *
 * Safari: `window.open('', '_blank')` é chamado de forma síncrona dentro do handler; o endereço final é
 * definido após o `await` para que o pop-up não seja bloqueado.
 * Modo simulado: `caminho` é `undefined` → só o nome, sem botão.
 */
export function BotaoAnexo({ anexo, className }: Props) {
  const notificar = useToast();

  if (!anexo.caminho) return <span className={className}>{anexo.nome}</span>;

  function abrir() {
    // Abre a janela de forma síncrona (Safari bloqueia window.open dentro de await).
    const janela = window.open('', '_blank');
    linkDoAnexo(anexo.caminho!)
      .then((url) => {
        if (janela) janela.location.href = url;
        else window.open(url, '_blank'); // pop-up bloqueado → tenta de novo
      })
      .catch((e) => {
        janela?.close();
        notificar('erro', mensagemSegura(e));
      });
  }

  return (
    <span className={className}>
      {anexo.nome}{' '}
      <button type="button" className="btn btn-acao btn-peq" onClick={abrir}>
        Abrir
      </button>
    </span>
  );
}
