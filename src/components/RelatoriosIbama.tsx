import { Fragment, useState } from 'react';
import { useAlertas } from '../contexts/AlertasContext';
import { useAuth } from '../contexts/AuthContext';
import { NIVEL_PRAZO_DOF } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import type { LinhaSaldoIbama } from '../types/models';
import { data, m3, un } from '../utils/format';
import { BadgeDe } from './Badge';
import { DeclararDofModal, type AlvoDeclaracao } from './DeclararDofModal';
import { Aviso, Carregando, Erro, Vazio } from './Estados';

const somar = (ls: LinhaSaldoIbama[], k: 'quantidade' | 'volumeM3' | 'disponivelM3' | 'emAnaliseM3' | 'bloqueadoM3' | 'divergenteM3') => ls.reduce((a, l) => a + l[k], 0);

function Valores({ ls }: { ls: LinhaSaldoIbama[] }) {
  return (
    <>
      <td className="al-right">{un(somar(ls, 'quantidade'))}</td>
      <td className="al-right">{m3(somar(ls, 'disponivelM3'))}</td><td className="al-right">{m3(somar(ls, 'emAnaliseM3'))}</td>
      <td className="al-right">{m3(somar(ls, 'bloqueadoM3'))}</td><td className="al-right">{m3(somar(ls, 'divergenteM3'))}</td>
      <td className="al-right"><strong>{m3(somar(ls, 'volumeM3'))}</strong></td>
    </>
  );
}

/** RF32: saldo físico em m³ por espécie (nome científico) e dimensão, para conferir com o saldo do DOF. */
export function RelatorioSaldoIbama() {
  const r = useAsync(() => servicos.relatorios.saldoIbama(), []);
  if (r.carregando && !r.dados) return <Carregando />;
  if (r.erro) return <Erro erro={r.erro} aoTentar={r.recarregar} />;
  const linhas = r.dados ?? [];
  if (!linhas.length) return <Vazio mensagem="Sem saldo em estoque." />;
  const especies = [...new Set(linhas.map((l) => l.especie))];
  return (
    <>
      <Aviso>Saldo físico (todas as situações), calculado a partir das dimensões dos tamanhos. O IBAMA trabalha com nome científico e volume: compare com o saldo do DOF; a tolerância em vistoria é de 10% (IN Ibama 21/2014, art. 41).</Aviso>
      <div className="tabela-wrap">
        <table className="tabela">
          <thead>
            <tr><th>Espécie</th><th>Tamanho (L × A × C cm)</th><th className="al-right">Lotes</th><th className="al-right">Quantidade</th><th className="al-right">Disponível</th>
              <th className="al-right">Em análise</th><th className="al-right">Bloqueado</th><th className="al-right">Com divergência</th><th className="al-right">Total</th></tr>
          </thead>
          <tbody>
            {especies.map((e) => {
              const ls = linhas.filter((l) => l.especie === e);
              return (
                <Fragment key={e}>
                  {ls.map((l) => (
                    <tr key={l.id}>
                      <td><em>{l.especie}</em></td><td>{l.tamanho} ({l.larguraCm} × {l.alturaCm} × {l.comprimentoCm})</td><td className="al-right">{l.lotes}</td><Valores ls={[l]} />
                    </tr>
                  ))}
                  {ls.length > 1 && <tr><td colSpan={3}><strong>Subtotal <em>{e}</em></strong></td><Valores ls={ls} /></tr>}
                </Fragment>
              );
            })}
            <tr><td colSpan={3}><strong>Total geral</strong></td><Valores ls={linhas} /></tr>
          </tbody>
        </table>
      </div>
    </>
  );
}

/** RF30: DOFs de NFs recebidas pendentes de declaração no Sinaflor, com o prazo (dia seguinte ao fim da validade). */
export function RelatorioDofsPendentes() {
  const { pode } = useAuth();
  const alertas = useAlertas();
  const [rec, setRec] = useState(0);
  const [declarar, setDeclarar] = useState<AlvoDeclaracao | null>(null);
  const r = useAsync(() => servicos.relatorios.dofsPendentes(), [rec]);
  if (r.carregando && !r.dados) return <Carregando />;
  if (r.erro) return <Erro erro={r.erro} aoTentar={r.recarregar} />;
  const linhas = r.dados ?? [];
  return (
    <>
      <Aviso>O recebimento de cada DOF deve ser declarado no Sinaflor até o dia seguinte ao fim da validade (IN Ibama 21/2014, art. 51); sem isso, novos DOFs podem ser suspensos. Aqui fica o registro de quem marcou a declaração e quando.</Aviso>
      {!linhas.length ? <Vazio mensagem="Nenhum DOF pendente de declaração." /> : (
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th>DOF</th><th>Código de controle</th><th>NF</th><th>Fornecedor</th><th>Recebido em</th><th>Validade</th><th>Prazo</th><th>Situação</th>{pode('dof:declarar') && <th>Ação</th>}</tr></thead>
            <tbody>
              {linhas.map((d) => (
                <tr key={d.id}>
                  <td>{d.dofNumero}</td><td>{d.codigoControle}</td><td>{d.nfNumero}</td><td>{d.fornecedor}</td><td>{data(d.recebidoEm)}</td><td>{data(d.validade)}</td>
                  <td>{data(d.prazoDeclaracao)}</td>
                  <td><BadgeDe mapa={NIVEL_PRAZO_DOF} valor={d.nivel} /> <span className={d.nivel === 'critico' ? 'val-erro' : 'mudo'}>{d.diasParaPrazo < 0 ? `venceu há ${-d.diasParaPrazo} dia(s)` : d.diasParaPrazo === 0 ? 'vence hoje' : `faltam ${d.diasParaPrazo} dia(s)`}</span></td>
                  {pode('dof:declarar') && <td><button className="btn btn-sec btn-peq" onClick={() => setDeclarar({ nfId: d.nfId, nfNumero: d.nfNumero, dofNumero: d.dofNumero, prazoDeclaracao: d.prazoDeclaracao })}>Marcar como declarado</button></td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <DeclararDofModal alvo={declarar} aoFechar={() => setDeclarar(null)} aoConcluir={() => { setRec((x) => x + 1); alertas.recarregar(); }} />
    </>
  );
}
