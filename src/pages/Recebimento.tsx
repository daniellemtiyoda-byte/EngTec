import { useState } from 'react';
import { Aviso } from '../components/Estados';
import { FormModal } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { StatusRegistroBadge } from '../components/Badge';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { STATUS_OPCOES } from '../dominio/opcoes';
import { servicos } from '../services';
import type { Recebimento } from '../types/models';
import { data, mLineares, paraNumero, un } from '../utils/format';

export default function RecebimentoPage() {
  const { pode } = useAuth();
  const notificar = useToast();
  const [aberto, setAberto] = useState(false);
  const [rec, setRec] = useState(0);

  const colunas: Coluna<Recebimento>[] = [
    { chave: 'loteCodigo', titulo: 'Lote', ordenavel: true },
    { chave: 'fornecedor', titulo: 'Fornecedor', ordenavel: true },
    { chave: 'documento', titulo: 'Documento' },
    { chave: 'recebidoEm', titulo: 'Recebido em', ordenavel: true, render: (r) => data(r.recebidoEm) },
    { chave: 'quantidadeDocumental', titulo: 'Qtd. documental', alinhar: 'right', render: (r) => un(r.quantidadeDocumental) },
    { chave: 'quantidadeConferida', titulo: 'Qtd. conferida', alinhar: 'right', render: (r) => un(r.quantidadeConferida) },
    { chave: 'divergencia', titulo: 'Divergência', alinhar: 'right', ordenavel: true, render: (r) => r.divergencia === 0 ? <span>Sem divergência</span> : <span className="val-erro">{r.divergencia > 0 ? '+' : ''}{un(r.divergencia)}</span> },
    { chave: 'metrosLinearesDocumentais', titulo: 'Metragem documental', alinhar: 'right', render: (r) => mLineares(r.metrosLinearesDocumentais) },
    { chave: 'metrosLinearesConferidos', titulo: 'Metragem conferida', alinhar: 'right', render: (r) => mLineares(r.metrosLinearesConferidos) },
    { chave: 'status', titulo: 'Aprovação', render: (r) => <StatusRegistroBadge s={r.status} /> },
  ];

  return (
    <>
      <ListPage<Recebimento>
        titulo="Recebimento e conferência de dormentes"
        descricao="Compare o documento com o que foi efetivamente conferido."
        aviso={<Aviso>A conferência registrada fica <strong>pendente</strong> até a aprovação pelo sistema responsável. Divergências entre documento e recebimento são destacadas.</Aviso>}
        listar={(q) => servicos.recebimentos.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'status', rotulo: 'Aprovação', opcoes: STATUS_OPCOES }]}
        acoes={pode('recebimento:registrar') ? <button className="btn btn-pri" onClick={() => setAberto(true)}>Registrar conferência</button> : undefined}
      />
      <FormModal
        titulo="Registrar conferência" aberto={aberto} aoFechar={() => setAberto(false)} rotuloEnviar="Registrar"
        campos={[
          { nome: 'loteCodigo', rotulo: 'Código do lote', obrigatorio: true, ajuda: 'Ex.: LT-2026-0001' },
          { nome: 'documentoNumero', rotulo: 'Número do documento', obrigatorio: true },
          { nome: 'quantidadeConferida', rotulo: 'Quantidade conferida (un.)', tipo: 'number', obrigatorio: true, inteiro: true, min: 0 },
          { nome: 'observacao', rotulo: 'Observação', tipo: 'textarea' },
        ]}
        aoEnviar={async (v) => {
          await servicos.recebimentos.registrarConferencia({
            loteCodigo: v.loteCodigo.trim(), documentoNumero: v.documentoNumero.trim(), quantidadeConferida: paraNumero(v.quantidadeConferida, true), observacao: v.observacao.trim() || undefined,
          });
          notificar('sucesso', `Conferência registrada; aguarda aprovação${SUFIXO_SIMULADO}.`);
          setRec((x) => x + 1);
        }}
      />
    </>
  );
}
