import { useState } from 'react';
import { mensagemSegura } from '../services/erros';
import { ConfirmModal } from './Modal';
import { useToast } from './Toast';

export interface AlvoInativacao {
  nome: string;
  /** O que muda, em uma frase (vai na confirmação). */
  efeito: string;
  /** Padrão: inativar. */
  acao?: 'inativar' | 'reativar';
  executar: () => Promise<unknown>;
}

/**
 * Confirmação de inativação e de reativação dos cadastros (nada é apagado). Sucesso só depois da resposta do
 * serviço; recusa da regra (ex. local com dormentes) aparece no toast.
 */
export function ConfirmarInativacao({ alvo, aoFechar, aoConcluir }: { alvo: AlvoInativacao | null; aoFechar: () => void; aoConcluir: () => void }) {
  const notificar = useToast();
  const [enviando, setEnviando] = useState(false);
  const reativar = alvo?.acao === 'reativar';
  async function confirmar() {
    if (!alvo) return;
    setEnviando(true);
    try {
      await alvo.executar();
      notificar('sucesso', `${alvo.nome}: ${reativar ? 'reativado' : 'inativado'}.`);
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
      titulo={reativar ? 'Reativar' : 'Inativar'} aberto={!!alvo} carregando={enviando} perigo={!reativar} rotuloConfirmar={reativar ? 'Reativar' : 'Inativar'}
      mensagem={alvo ? `${reativar ? 'Reativar' : 'Inativar'} ${alvo.nome}? ${alvo.efeito}${reativar ? '' : ' O cadastro não é apagado.'}` : ''}
      aoCancelar={aoFechar} aoConfirmar={() => void confirmar()}
    />
  );
}
