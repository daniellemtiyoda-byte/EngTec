import { useState } from 'react';
import { mensagemSegura } from '../services/http';
import { ConfirmModal } from './Modal';
import { useToast } from './Toast';

export interface AlvoInativacao { nome: string; efeito: string; inativar: () => Promise<unknown> }

/**
 * Confirmação de inativação dos cadastros (nada é apagado). Sucesso só depois da resposta do serviço;
 * erro (ex. local com dormentes) aparece no toast.
 */
export function ConfirmarInativacao({ alvo, aoFechar, aoConcluir }: { alvo: AlvoInativacao | null; aoFechar: () => void; aoConcluir: () => void }) {
  const notificar = useToast();
  const [enviando, setEnviando] = useState(false);
  async function confirmar() {
    if (!alvo) return;
    setEnviando(true);
    try {
      await alvo.inativar();
      notificar('sucesso', `${alvo.nome} inativado.`);
      aoConcluir();
    } catch (e) {
      notificar('erro', mensagemSegura(e));
    } finally {
      setEnviando(false);
      aoFechar();
    }
  }
  return (
    <ConfirmModal
      titulo="Inativar" aberto={!!alvo} carregando={enviando} perigo rotuloConfirmar="Inativar"
      mensagem={alvo ? `Inativar ${alvo.nome}? ${alvo.efeito} O cadastro não é apagado.` : ''}
      aoCancelar={aoFechar} aoConfirmar={() => void confirmar()}
    />
  );
}
