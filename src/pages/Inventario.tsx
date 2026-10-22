import { useState } from 'react';
import { Aviso } from '../components/Estados';
import { BadgeDe } from '../components/Badge';
import { FormModal } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { opcoesDe } from '../dominio/opcoes';
import { AJUSTE_INVENTARIO, ESTADO_INVENTARIO } from '../dominio/rotulos';
import { servicos } from '../services';
import type { SessaoInventario } from '../types/models';
import { dataHora, un } from '../utils/format';

export default function Inventario() {
  const { pode } = useAuth();
  const notificar = useToast();
  const [aberto, setAberto] = useState(false);
  const [rec, setRec] = useState(0);

  const colunas: Coluna<SessaoInventario>[] = [
    { chave: 'descricao', titulo: 'Sessão', ordenavel: true },
    { chave: 'local', titulo: 'Local', ordenavel: true },
    { chave: 'abertaEm', titulo: 'Aberta em', ordenavel: true, render: (s) => dataHora(s.abertaEm) },
    { chave: 'estado', titulo: 'Estado', render: (s) => <BadgeDe mapa={ESTADO_INVENTARIO} valor={s.estado} /> },
    { chave: 'itensContados', titulo: 'Itens contados', alinhar: 'right', ordenavel: true, render: (s) => un(s.itensContados) },
    { chave: 'divergencias', titulo: 'Divergências', alinhar: 'right', ordenavel: true, render: (s) => s.divergencias > 0 ? <span className="val-erro">{s.divergencias}</span> : '0' },
    { chave: 'ajuste', titulo: 'Ajuste de saldo', render: (s) => <BadgeDe mapa={AJUSTE_INVENTARIO} valor={s.ajuste} /> },
  ];

  return (
    <>
      <ListPage<SessaoInventario>
        titulo="Inventário físico"
        descricao="Sessões de contagem e divergências em relação ao saldo do sistema."
        aviso={<Aviso tom="alerta">Ajustes de inventário só valem após a <strong>aprovação</strong>. Até lá, o saldo oficial permanece inalterado.</Aviso>}
        listar={(q) => servicos.inventario.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'estado', rotulo: 'Estado', opcoes: opcoesDe(ESTADO_INVENTARIO) }]}
        acoes={pode('inventario:criar') ? <button className="btn btn-pri" onClick={() => setAberto(true)}>Nova sessão de contagem</button> : undefined}
      />
      <FormModal
        titulo="Nova sessão de contagem" aberto={aberto} aoFechar={() => setAberto(false)} rotuloEnviar="Criar sessão"
        campos={[
          { nome: 'descricao', rotulo: 'Descrição', obrigatorio: true, maxLength: 80 },
          { nome: 'local', rotulo: 'Local (quadra/baia)', obrigatorio: true, maxLength: 60 },
        ]}
        confirmacao={(v) => `Criar a sessão de contagem "${v.descricao}" para ${v.local}? Locais em inventário podem ter movimentações restringidas pelo sistema.`}
        aoEnviar={async (v) => {
          await servicos.inventario.criarSessao({ descricao: v.descricao.trim(), local: v.local.trim() });
          notificar('sucesso', `Sessão de contagem criada${SUFIXO_SIMULADO}.`);
          setRec((x) => x + 1);
        }}
      />
    </>
  );
}
