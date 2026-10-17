import { useState } from 'react';
import { Badge, StatusRegistroBadge, type Tom } from '../components/Badge';
import { FormModal } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { servicos } from '../services';
import type { Movimentacao, TipoMovimentacao } from '../types/models';
import { dataHora, un } from '../utils/format';
import { STATUS_OPCOES } from './Documentos';

const TIPO: Record<TipoMovimentacao, [Tom, string]> = { entrada: ['verde', 'Entrada'], saida: ['laranja', 'Saída'], transferencia: ['azul', 'Transferência'] };

export default function Movimentacoes() {
  const { pode } = useAuth();
  const notificar = useToast();
  const [aberto, setAberto] = useState(false);
  const [rec, setRec] = useState(0);

  const colunas: Coluna<Movimentacao>[] = [
    { chave: 'dataHora', titulo: 'Data/hora', ordenavel: true, render: (m) => dataHora(m.dataHora) },
    { chave: 'tipo', titulo: 'Tipo', render: (m) => <Badge tom={TIPO[m.tipo][0]}>{TIPO[m.tipo][1]}</Badge> },
    { chave: 'loteCodigo', titulo: 'Lote', ordenavel: true },
    { chave: 'quantidade', titulo: 'Quantidade', alinhar: 'right', ordenavel: true, render: (m) => un(m.quantidade) },
    { chave: 'origem', titulo: 'Origem' }, { chave: 'destino', titulo: 'Destino' },
    { chave: 'usuario', titulo: 'Usuário' },
    { chave: 'status', titulo: 'Situação', render: (m) => <StatusRegistroBadge s={m.status} /> },
  ];

  return (
    <>
      <ListPage<Movimentacao>
        titulo="Movimentações de estoque"
        descricao="Entradas, saídas e transferências."
        listar={(q) => servicos.movimentacoes.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'tipo', rotulo: 'Tipo', opcoes: Object.entries(TIPO).map(([valor, [, rotulo]]) => ({ valor, rotulo })) }, { chave: 'status', rotulo: 'Situação', opcoes: STATUS_OPCOES }]}
        acoes={pode('movimentacoes:registrar') ? <button className="btn btn-pri" onClick={() => setAberto(true)}>Registrar movimentação</button> : undefined}
      />
      <FormModal
        titulo="Registrar movimentação" aberto={aberto} aoFechar={() => setAberto(false)} rotuloEnviar="Registrar"
        campos={[
          { nome: 'tipo', rotulo: 'Tipo', tipo: 'select', obrigatorio: true, opcoes: Object.entries(TIPO).map(([valor, [, rotulo]]) => ({ valor, rotulo })) },
          { nome: 'loteCodigo', rotulo: 'Código do lote', obrigatorio: true },
          { nome: 'quantidade', rotulo: 'Quantidade (un.)', tipo: 'number', obrigatorio: true, inteiro: true, min: 1 },
          { nome: 'origem', rotulo: 'Origem', ajuda: 'Obrigatória para saída e transferência.' },
          { nome: 'destino', rotulo: 'Destino', ajuda: 'Obrigatório para entrada e transferência.' },
          { nome: 'motivo', rotulo: 'Motivo / observação', tipo: 'textarea' },
        ]}
        validar={(v) => {
          const e: Record<string, string> = {};
          if ((v.tipo === 'saida' || v.tipo === 'transferencia') && !v.origem.trim()) e.origem = 'Informe a origem.';
          if ((v.tipo === 'entrada' || v.tipo === 'transferencia') && !v.destino.trim()) e.destino = 'Informe o destino.';
          if (v.tipo === 'transferencia' && v.origem.trim() && v.origem.trim() === v.destino.trim()) e.destino = 'Destino igual à origem.';
          return e;
        }}
        confirmacao={(v) => v.tipo === 'entrada' ? undefined : `Confirma ${v.tipo === 'saida' ? 'a SAÍDA' : 'a TRANSFERÊNCIA'} de ${v.quantidade} un. do lote ${v.loteCodigo}? O saldo só muda após a confirmação do sistema responsável.`}
        aoEnviar={async (v) => {
          await servicos.movimentacoes.registrar({
            tipo: v.tipo as TipoMovimentacao, loteCodigo: v.loteCodigo.trim(), quantidade: Number(v.quantidade),
            origem: v.origem.trim() || undefined, destino: v.destino.trim() || undefined, motivo: v.motivo.trim() || undefined,
          });
          notificar('sucesso', `Movimentação registrada; aguarda confirmação${SUFIXO_SIMULADO}.`);
          setRec((x) => x + 1);
        }}
      />
    </>
  );
}
