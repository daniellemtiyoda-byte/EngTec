import { useState } from 'react';
import { BadgeDe, StatusRegistroBadge } from '../components/Badge';
import { Aviso } from '../components/Estados';
import { FormModal } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { STATUS_OPCOES, TIPO_MOVIMENTACAO_OPCOES } from '../dominio/opcoes';
import { TIPO_MOVIMENTACAO } from '../dominio/rotulos';
import { servicos } from '../services';
import type { Movimentacao } from '../types/models';
import { dataHora, paraNumero, un } from '../utils/format';

export default function Movimentacoes() {
  const { pode } = useAuth();
  const notificar = useToast();
  const [aberto, setAberto] = useState(false);
  const [rec, setRec] = useState(0);

  const colunas: Coluna<Movimentacao>[] = [
    { chave: 'dataHora', titulo: 'Data/hora', ordenavel: true, render: (m) => dataHora(m.dataHora) },
    { chave: 'tipo', titulo: 'Tipo', render: (m) => <BadgeDe mapa={TIPO_MOVIMENTACAO} valor={m.tipo} /> },
    { chave: 'loteCodigo', titulo: 'Lote', ordenavel: true },
    { chave: 'fardoCodigo', titulo: 'Fardo', ordenavel: true, render: (m) => m.fardoCodigo ?? '—' },
    { chave: 'referencia', titulo: 'Referência', ordenavel: true, render: (m) => m.referencia ?? '—' },
    { chave: 'quantidade', titulo: 'Quantidade', alinhar: 'right', ordenavel: true, render: (m) => un(m.quantidade) },
    { chave: 'origem', titulo: 'Origem' }, { chave: 'destino', titulo: 'Destino' },
    { chave: 'usuario', titulo: 'Usuário' },
    { chave: 'status', titulo: 'Situação', render: (m) => <StatusRegistroBadge s={m.status} /> },
  ];

  return (
    <>
      <ListPage<Movimentacao>
        titulo="Movimentações de estoque"
        descricao="Registro de entradas, saídas e transferências."
        aviso={<Aviso>A entrada acontece só pelo <strong>recebimento</strong> e a saída só pela <strong>RME</strong>. Aqui se registram apenas transferências entre endereços.</Aviso>}
        listar={(q) => servicos.movimentacoes.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'tipo', rotulo: 'Tipo', opcoes: TIPO_MOVIMENTACAO_OPCOES }, { chave: 'status', rotulo: 'Situação', opcoes: STATUS_OPCOES }]}
        acoes={pode('movimentacoes:registrar') ? <button className="btn btn-pri" onClick={() => setAberto(true)}>Registrar transferência</button> : undefined}
      />
      <FormModal
        titulo="Registrar transferência" aberto={aberto} aoFechar={() => setAberto(false)} rotuloEnviar="Registrar"
        campos={[
          { nome: 'loteCodigo', rotulo: 'Código do lote', obrigatorio: true, ajuda: 'Ex.: LT26-0012' },
          { nome: 'quantidade', rotulo: 'Quantidade (un.)', tipo: 'number', obrigatorio: true, inteiro: true, min: 1 },
          { nome: 'origem', rotulo: 'Origem', obrigatorio: true },
          { nome: 'destino', rotulo: 'Destino', obrigatorio: true },
          { nome: 'motivo', rotulo: 'Motivo / observação', tipo: 'textarea' },
        ]}
        validar={(v): Record<string, string> => (v.origem.trim() && v.origem.trim() === v.destino.trim() ? { destino: 'Destino igual à origem.' } : {})}
        confirmacao={(v) => `Confirma a TRANSFERÊNCIA de ${un(paraNumero(v.quantidade, true))} do lote ${v.loteCodigo}? O saldo só muda após a confirmação do sistema responsável.`}
        aoEnviar={async (v) => {
          await servicos.movimentacoes.registrar({
            tipo: 'transferencia', loteCodigo: v.loteCodigo.trim(), quantidade: paraNumero(v.quantidade, true),
            origem: v.origem.trim(), destino: v.destino.trim(), motivo: v.motivo.trim() || undefined,
          });
          notificar('sucesso', `Transferência registrada; aguarda confirmação${SUFIXO_SIMULADO}.`);
          setRec((x) => x + 1);
        }}
      />
    </>
  );
}
