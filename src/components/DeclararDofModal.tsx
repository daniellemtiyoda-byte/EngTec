import { useEffect, useState } from 'react';
import { SUFIXO_SIMULADO } from '../config/env';
import { servicos } from '../services';
import { mensagemSegura } from '../services/http';
import { data } from '../utils/format';
import { ConfirmModal } from './Modal';
import { useToast } from './Toast';

export interface AlvoDeclaracao { nfId: string; nfNumero: string; dofNumero: string; prazoDeclaracao: string }

/**
 * "Marcar como declarado" (RF30): registra que o recebimento do DOF já foi declarado no Sinaflor.
 * A declaração em si é feita no sistema do IBAMA; aqui fica o registro de quem marcou e quando.
 */
export function DeclararDofModal({ alvo, aoFechar, aoConcluir }: { alvo: AlvoDeclaracao | null; aoFechar: () => void; aoConcluir: () => void }) {
  const notificar = useToast();
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  useEffect(() => setErro(undefined), [alvo]);

  async function confirmar() {
    if (!alvo) return;
    setEnviando(true);
    try {
      await servicos.notas.declararDof(alvo.nfId);
      notificar('sucesso', `DOF ${alvo.dofNumero} marcado como declarado no Sinaflor${SUFIXO_SIMULADO}.`);
      aoFechar();
      aoConcluir();
    } catch (e) {
      setErro(mensagemSegura(e));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <ConfirmModal
      titulo={alvo ? `Declarar DOF ${alvo.dofNumero}` : 'Declarar DOF'} aberto={!!alvo} carregando={enviando} rotuloConfirmar="Marcar como declarado"
      mensagem={alvo ? [
        `Confirma que o recebimento do DOF ${alvo.dofNumero} (NF ${alvo.nfNumero}) já foi declarado no Sinaflor? Prazo: ${data(alvo.prazoDeclaracao)}.`,
        'Seu usuário, a data e a hora ficam registrados.',
        erro ? `Erro: ${erro}` : '',
      ].filter(Boolean).join(' ') : ''}
      aoCancelar={aoFechar} aoConfirmar={() => void confirmar()}
    />
  );
}
