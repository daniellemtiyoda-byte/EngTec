import { useState } from 'react';
import { BadgeDe, StatusRegistroBadge } from '../components/Badge';
import { CodigoLink } from '../components/Codigos';
import { Aviso } from '../components/Estados';
import { FormModal } from '../components/FormModal';
import { ListPage, type Coluna } from '../components/ListPage';
import { ConfirmModal } from '../components/Modal';
import { useToast } from '../components/Toast';
import { SUFIXO_SIMULADO } from '../config/env';
import { useAlertas } from '../contexts/AlertasContext';
import { useAuth } from '../contexts/AuthContext';
import { MOTIVO_PERDA_OPCOES, STATUS_MOVIMENTACAO_OPCOES, TIPO_MOVIMENTACAO_OPCOES } from '../dominio/opcoes';
import { MOTIVO_PERDA, TIPO_MOVIMENTACAO } from '../dominio/rotulos';
import { servicos } from '../services';
import { mensagemSegura } from '../services/http';
import type { MotivoPerda, Movimentacao } from '../types/models';
import { dataHora, paraNumero, un } from '../utils/format';

const pendenteDeAprovacao = (m: Movimentacao) => (m.tipo === 'perda' || m.tipo === 'ajuste') && m.status === 'pendente';
const quantidade = (m: Movimentacao) => (m.tipo === 'ajuste' && m.quantidade > 0 ? `+${un(m.quantidade)}` : m.tipo === 'perda' ? `−${un(m.quantidade)}` : un(m.quantidade));

export default function Movimentacoes() {
  const { pode, usuario } = useAuth();
  const notificar = useToast();
  const alertas = useAlertas();
  const [form, setForm] = useState<'transferencia' | 'perda' | 'ajuste' | null>(null);
  const [aprovar, setAprovar] = useState<Movimentacao | null>(null);
  const [rejeitar, setRejeitar] = useState<Movimentacao | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string>();
  const [rec, setRec] = useState(0);

  const atualizado = (msg: string) => { notificar('sucesso', `${msg}${SUFIXO_SIMULADO}`); setRec((x) => x + 1); alertas.recarregar(); };

  async function confirmarAprovacao() {
    if (!aprovar) return;
    setEnviando(true);
    try {
      await servicos.movimentacoes.decidir(aprovar.id, { aprovada: true });
      setAprovar(null);
      atualizado(`${TIPO_MOVIMENTACAO[aprovar.tipo][1]} aprovada; saldo do fardo ${aprovar.fardoCodigo} atualizado`);
    } catch (e) {
      setErro(mensagemSegura(e));
    } finally {
      setEnviando(false);
    }
  }

  const colunas: Coluna<Movimentacao>[] = [
    { chave: 'dataHora', titulo: 'Data/hora', ordenavel: true, render: (m) => dataHora(m.dataHora) },
    { chave: 'tipo', titulo: 'Tipo', render: (m) => <BadgeDe mapa={TIPO_MOVIMENTACAO} valor={m.tipo} /> },
    { chave: 'fardoCodigo', titulo: 'Fardo / lote', ordenavel: true, render: (m) => <CodigoLink codigo={m.fardoCodigo ?? m.loteCodigo} /> },
    { chave: 'quantidade', titulo: 'Quantidade', alinhar: 'right', ordenavel: true, render: quantidade },
    { chave: 'referencia', titulo: 'Referência', ordenavel: true, render: (m) => <CodigoLink codigo={m.referencia} /> },
    { chave: 'loteCodigo', titulo: 'Lote', ordenavel: true, opcional: true, render: (m) => <CodigoLink codigo={m.loteCodigo} /> },
    { chave: 'origem', titulo: 'Origem', opcional: true }, { chave: 'destino', titulo: 'Destino', opcional: true },
    { chave: 'motivo', titulo: 'Motivo', opcional: true, render: (m) => (m.motivo ? <span title={m.motivo}>{m.motivoPerda ? `${MOTIVO_PERDA[m.motivoPerda][1]}: ` : ''}{m.motivo.slice(0, 40)}{m.motivo.length > 40 ? '…' : ''}</span> : '—') },
    { chave: 'usuario', titulo: 'Usuário' },
    {
      chave: 'status', titulo: 'Situação',
      render: (m) => <span title={m.decididoPor ? `${m.status === 'rejeitado' ? 'Rejeitado' : 'Aprovado'} por ${m.decididoPor} em ${dataHora(m.decididoEm)}${m.motivoRejeicao ? `: ${m.motivoRejeicao}` : ''}` : undefined}><StatusRegistroBadge s={m.status} /></span>,
    },
  ];

  return (
    <>
      <ListPage<Movimentacao>
        titulo="Movimentações de estoque"
        descricao="Registro imutável de entradas, saídas, transferências, perdas e ajustes."
        aviso={<Aviso>A entrada acontece só pelo <strong>recebimento</strong> e a saída só pela <strong>RME</strong>. Perda e ajuste são lançados por fardo, com motivo, e só alteram o saldo depois da aprovação do supervisor ou gestor. Nada é apagado: correção é um novo registro.</Aviso>}
        listar={(q) => servicos.movimentacoes.listar(q)}
        recarregar={rec}
        colunas={colunas}
        filtros={[{ chave: 'tipo', rotulo: 'Tipo', opcoes: TIPO_MOVIMENTACAO_OPCOES }, { chave: 'status', rotulo: 'Situação', opcoes: STATUS_MOVIMENTACAO_OPCOES }]}
        acoes={pode('movimentacoes:registrar') ? (
          <div className="acoes">
            <button className="btn btn-pri" onClick={() => setForm('transferencia')}>Registrar transferência</button>
            <button className="btn btn-sec" onClick={() => setForm('perda')}>Registrar perda</button>
            <button className="btn btn-sec" onClick={() => setForm('ajuste')}>Registrar ajuste</button>
          </div>
        ) : undefined}
        acoesLinha={[
          { rotulo: 'Aprovar', principal: true, aoClicar: (m) => { setErro(undefined); setAprovar(m); }, visivel: (m) => pendenteDeAprovacao(m) && pode('movimentacoes:aprovar') },
          { rotulo: 'Rejeitar', aoClicar: setRejeitar, visivel: (m) => pendenteDeAprovacao(m) && pode('movimentacoes:aprovar') },
        ]}
      />
      <FormModal
        titulo="Registrar transferência" aberto={form === 'transferencia'} aoFechar={() => setForm(null)} rotuloEnviar="Registrar"
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
          atualizado('Transferência registrada; aguarda confirmação');
        }}
      />
      <FormModal
        titulo="Registrar perda" aberto={form === 'perda'} aoFechar={() => setForm(null)} rotuloEnviar="Registrar perda"
        campos={[
          { nome: 'fardoCodigo', rotulo: 'Código do fardo', obrigatorio: true, ajuda: 'Ex.: LT26-0012-F03' },
          { nome: 'quantidade', rotulo: 'Quantidade perdida (un.)', tipo: 'number', obrigatorio: true, inteiro: true, min: 1 },
          { nome: 'motivoPerda', rotulo: 'Motivo', tipo: 'select', obrigatorio: true, opcoes: MOTIVO_PERDA_OPCOES, ajuda: 'Perdas, incêndios e intempéries devem ser informados ao órgão ambiental (IN Ibama 21/2014, art. 42).' },
          { nome: 'motivo', rotulo: 'Descrição', tipo: 'textarea', obrigatorio: true },
        ]}
        aoEnviar={async (v) => {
          await servicos.movimentacoes.registrar({
            tipo: 'perda', fardoCodigo: v.fardoCodigo.trim(), quantidade: paraNumero(v.quantidade, true), motivoPerda: v.motivoPerda as MotivoPerda, motivo: v.motivo.trim(),
          });
          atualizado('Perda registrada; o saldo só muda após a aprovação');
        }}
      />
      <FormModal
        titulo="Registrar ajuste" aberto={form === 'ajuste'} aoFechar={() => setForm(null)} rotuloEnviar="Registrar ajuste"
        campos={[
          { nome: 'fardoCodigo', rotulo: 'Código do fardo', obrigatorio: true, ajuda: 'Ex.: LT26-0012-F03' },
          { nome: 'quantidade', rotulo: 'Ajuste (un.)', tipo: 'number', obrigatorio: true, inteiro: true, min: -500, max: 500, ajuda: 'Positivo acrescenta dormentes ao fardo; negativo retira (ex.: -2).' },
          { nome: 'motivo', rotulo: 'Motivo', tipo: 'textarea', obrigatorio: true },
        ]}
        validar={(v): Record<string, string> => (paraNumero(v.quantidade, true) === 0 ? { quantidade: 'O ajuste não pode ser zero.' } : {})}
        aoEnviar={async (v) => {
          await servicos.movimentacoes.registrar({ tipo: 'ajuste', fardoCodigo: v.fardoCodigo.trim(), quantidade: paraNumero(v.quantidade, true), motivo: v.motivo.trim() });
          atualizado('Ajuste registrado; o saldo só muda após a aprovação');
        }}
      />
      <ConfirmModal
        titulo={aprovar ? `Aprovar ${TIPO_MOVIMENTACAO[aprovar.tipo][1].toLowerCase()}` : 'Aprovar'} aberto={!!aprovar} carregando={enviando} rotuloConfirmar="Aprovar e alterar o saldo"
        mensagem={aprovar ? [
          `${TIPO_MOVIMENTACAO[aprovar.tipo][1]} de ${quantidade(aprovar)} no fardo ${aprovar.fardoCodigo} (lote ${aprovar.loteCodigo}). Motivo: ${aprovar.motivo ?? '—'}.`,
          aprovar.usuario === usuario?.nome ? 'Atenção: você registrou esta movimentação. Pela regra de duas pessoas, outra pessoa deve aprovar e o servidor recusa; no modo simulado o fluxo fica liberado para teste.' : '',
          erro ? `Erro: ${erro}` : '',
        ].filter(Boolean).join(' ') : ''}
        aoCancelar={() => setAprovar(null)} aoConfirmar={() => void confirmarAprovacao()}
      />
      <FormModal
        titulo={rejeitar ? `Rejeitar ${TIPO_MOVIMENTACAO[rejeitar.tipo][1].toLowerCase()}` : 'Rejeitar'} aberto={!!rejeitar} aoFechar={() => setRejeitar(null)} rotuloEnviar="Rejeitar"
        campos={[{ nome: 'motivo', rotulo: 'Motivo da rejeição', tipo: 'textarea', obrigatorio: true, ajuda: 'O registro continua no histórico como rejeitado; o saldo não muda.' }]}
        aoEnviar={async (v) => { await servicos.movimentacoes.decidir(rejeitar!.id, { aprovada: false, motivo: v.motivo.trim() }); atualizado('Movimentação rejeitada'); }}
      />
    </>
  );
}
