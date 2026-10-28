import { useId, useState } from 'react';
import { TIPO_MOVIMENTACAO_OPCOES } from '../dominio/opcoes';
import { MOTIVO_PERDA, TIPO_MOVIMENTACAO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import type { FiltroMovimentacoes, TipoMovimentacao } from '../types/models';
import { dataHora, un } from '../utils/format';
import { BadgeDe, StatusRegistroBadge } from './Badge';
import { Aviso, Carregando, Erro, Vazio } from './Estados';
import { StatCard } from './Graficos';

const diaSP = (d: Date) => d.toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
const periodoInicial = (): FiltroMovimentacoes => ({ de: diaSP(new Date(Date.now() - 30 * 86_400_000)), ate: diaSP(new Date()) });

/** RF24 (e RF33 com tipo = perda): movimentações por período, espécie, tipo e usuário. */
export function RelatorioMovimentacoes() {
  const id = useId();
  const [rascunho, setRascunho] = useState<FiltroMovimentacoes>(periodoInicial);
  const [filtro, setFiltro] = useState<FiltroMovimentacoes>(rascunho);
  const esp = useAsync(() => servicos.especies.listar({ pageSize: 100, sortBy: 'numero' }), []);
  const r = useAsync(() => servicos.relatorios.movimentacoesPeriodo(filtro), [filtro]);
  const mudar = (k: keyof FiltroMovimentacoes, v: string) => setRascunho((f) => ({ ...f, [k]: v || undefined }));

  return (
    <>
      <form className="toolbar" onSubmit={(e) => { e.preventDefault(); setFiltro({ ...rascunho }); }}>
        <div className="filtro"><label htmlFor={`${id}-de`}>De</label><input id={`${id}-de`} type="date" value={rascunho.de} onChange={(e) => mudar('de', e.target.value)} /></div>
        <div className="filtro"><label htmlFor={`${id}-ate`}>Até</label><input id={`${id}-ate`} type="date" value={rascunho.ate} onChange={(e) => mudar('ate', e.target.value)} /></div>
        <div className="filtro">
          <label htmlFor={`${id}-esp`}>Espécie</label>
          <select id={`${id}-esp`} value={rascunho.especie ?? ''} onChange={(e) => mudar('especie', e.target.value)}>
            <option value="">Todas</option>
            {esp.dados?.items.map((e) => <option key={e.id} value={e.nomeCientifico}>{e.nomeCientifico}</option>)}
          </select>
        </div>
        <div className="filtro">
          <label htmlFor={`${id}-tipo`}>Tipo</label>
          <select id={`${id}-tipo`} value={rascunho.tipo ?? ''} onChange={(e) => mudar('tipo', e.target.value as TipoMovimentacao)}>
            <option value="">Todos</option>
            {TIPO_MOVIMENTACAO_OPCOES.map((o) => <option key={o.valor} value={o.valor}>{o.rotulo}</option>)}
          </select>
        </div>
        <div className="filtro"><label htmlFor={`${id}-usu`}>Usuário</label><input id={`${id}-usu`} value={rascunho.usuario ?? ''} maxLength={60} onChange={(e) => mudar('usuario', e.target.value)} /></div>
        <button className="btn btn-pri" type="submit">Consultar</button>
      </form>
      {r.carregando && !r.dados ? <Carregando /> : r.erro ? <Erro erro={r.erro} aoTentar={r.recarregar} /> : r.dados && (
        <>
          <Aviso>Os totais consideram só movimentações aprovadas (as que alteraram o saldo). Para o relatório de perdas ao órgão ambiental, filtre o tipo "Perda".</Aviso>
          {r.dados.totais.length > 0 && (
            <div className="grade-cards">
              {r.dados.totais.map((t) => <StatCard key={t.tipo} rotulo={TIPO_MOVIMENTACAO[t.tipo][1]} valor={un(t.quantidade)} detalhe={`${t.registros} registro(s)`} />)}
            </div>
          )}
          {!r.dados.linhas.length ? <Vazio mensagem="Nenhuma movimentação no período." /> : (
            <div className="tabela-wrap">
              <table className="tabela">
                <thead><tr><th>Data/hora</th><th>Tipo</th><th>Espécie</th><th>Lote / fardo</th><th>Referência</th><th className="al-right">Quantidade</th><th>Origem → destino</th><th>Motivo</th><th>Usuário</th><th>Situação</th></tr></thead>
                <tbody>
                  {r.dados.linhas.map((m) => (
                    <tr key={m.id}>
                      <td>{dataHora(m.dataHora)}</td><td><BadgeDe mapa={TIPO_MOVIMENTACAO} valor={m.tipo} /></td><td><em>{m.especie}</em></td>
                      <td>{m.fardoCodigo ?? m.loteCodigo}</td><td>{m.referencia ?? '—'}</td><td className="al-right">{un(m.quantidade)}</td>
                      <td>{m.origem} → {m.destino}</td><td>{m.motivoPerda ? `${MOTIVO_PERDA[m.motivoPerda][1]}: ` : ''}{m.motivo ?? '—'}</td><td>{m.usuario}</td><td><StatusRegistroBadge s={m.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}
