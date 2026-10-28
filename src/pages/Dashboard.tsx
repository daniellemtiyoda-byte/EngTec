import { Link } from 'react-router-dom';
import { Carregando, Erro, PageHeader, Vazio } from '../components/Estados';
import { BarChart, BarrasHorizontais, StackBar, StatCard } from '../components/Graficos';
import { useAlertas } from '../contexts/AlertasContext';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { dias, linkInterno, m3, mLineares, numero, pct, un } from '../utils/format';

export default function Dashboard() {
  const ind = useAsync(() => servicos.dashboard.indicadores(), []);
  const al = useAlertas();
  const d = ind.dados;

  return (
    <>
      <header className="faixa-ilustrada">
        <img src="/assets/ilustracao-estacao.jpg" alt="" />
        <div className="faixa-texto">
          <h1 className="titulo">Dashboard</h1>
          <p>Indicadores do projeto, estoque e alertas.</p>
        </div>
      </header>
      {ind.carregando && !d ? <Carregando /> : ind.erro ? <Erro erro={ind.erro} aoTentar={ind.recarregar} /> : d ? (
        <>
          {d.origem === 'simulado' && <div className="aviso aviso-alerta">Indicadores calculados sobre dados simulados.</div>}
          <h2 className="titulo-secao">Indicadores do projeto</h2>
          <div className="grade-cards">
            <StatCard
              rotulo="Saídas que respeitaram o FIFO" valor={d.fifoPct === undefined ? '—' : pct(d.fifoPct)} tom={d.fifoPct === undefined ? undefined : d.fifoPct >= 90 ? 'verde' : 'laranja'}
              detalhe={d.rmesEntregues ? `${d.rmesEntregues} RME(s) entregue(s)` : 'Ainda sem RME entregue'}
            />
            <StatCard
              rotulo="Idade média do estoque" valor={dias(d.idadeMediaDias)} tom={d.lotesAcimaLimite ? 'laranja' : 'verde'}
              detalhe={`${d.lotesAcimaLimite} lote(s) acima de ${d.limiteIdadeDias} dias`}
            />
            <StatCard rotulo="Divergência no inventário" valor={pct(d.divergenciaInventarioPct)} detalhe="Contagem física x saldo do sistema" />
            <StatCard rotulo="Lotes com histórico NF → destino" valor={pct(d.rastreabilidadePct)} tom={d.rastreabilidadePct >= 100 ? 'verde' : 'laranja'} detalhe="NF, DOF e todas as saídas registradas" />
            <StatCard rotulo="RMEs emitidas no sistema" valor={numero(d.rmesNoSistema)} detalhe="O % digital depende da contagem de RMEs em papel (linha de base)" />
            <StatCard rotulo="DOFs pendentes no Sinaflor" valor={numero(d.dofsPendentes)} tom={d.dofsPendentes ? 'vermelho' : 'verde'} detalhe="Recebidos e ainda não declarados" />
            <StatCard rotulo="Lotes aguardando inspeção" valor={numero(d.lotesAguardandoInspecao)} tom={d.lotesAguardandoInspecao ? 'azul' : undefined} detalhe="Fora do estoque disponível" />
          </div>
          <p className="mudo">Tempo de localização e tempo de registro são medidos no piloto (cronômetro), fora do sistema.</p>
          <h2 className="titulo-secao">Estoque</h2>
          <div className="grade-cards">
            <StatCard rotulo="Estoque disponível" valor={un(d.disponivel)} tom="verde" />
            <StatCard rotulo="Em análise" valor={un(d.emAnalise)} tom="azul" />
            <StatCard rotulo="Bloqueado" valor={un(d.bloqueado)} tom="cinza" />
            <StatCard rotulo="Com divergência" valor={un(d.divergente)} tom="vermelho" />
            <StatCard rotulo="Metragem linear total" valor={mLineares(d.metrosLineares)} />
            <StatCard rotulo="Volume documental" valor={m3(d.volumeDocumentalM3)} detalhe="Conforme documentos" />
            <StatCard rotulo="Volume calculado" valor={m3(d.volumeCalculadoM3)} detalhe="Conforme dimensões conferidas" />
            <StatCard rotulo="Recebimentos pendentes" valor={String(d.recebimentosPendentes)} tom="laranja" detalhe={`${d.inventariosAbertos} inventário(s) em aberto`} />
          </div>
          <div className="grade-2">
            <section className="painel">
              <StackBar titulo="Estoque por situação" unidade="un." partes={[
                { rotulo: 'Disponível', valor: d.disponivel, cor: 'var(--verde)' },
                { rotulo: 'Em análise', valor: d.emAnalise, cor: 'var(--azul-600)' },
                { rotulo: 'Bloqueado', valor: d.bloqueado, cor: 'var(--cinza-600)' },
                { rotulo: 'Com divergência', valor: d.divergente, cor: 'var(--vermelho)' },
              ]} />
            </section>
            <section className="painel"><BarChart titulo="Disponível por classe" unidade="un." dados={d.estoquePorClasse} /></section>
            <section className="painel"><BarrasHorizontais titulo="Saldo em m³ por espécie" dados={d.saldoM3PorEspecie} formatar={m3} /></section>
            <section className="painel"><BarChart titulo="Recebimentos por mês" unidade="lotes" dados={d.recebimentosPorMes} /></section>
          </div>
        </>
      ) : null}

      <section className="painel">
        <PageHeader titulo="Alertas" nivel={2} />
        {al.carregando && !al.dados ? <Carregando linhas={3} /> : al.erro ? <Erro erro={al.erro} aoTentar={al.recarregar} /> : al.dados?.length ? (
          <div className="lista-alertas">
            {al.dados.map((a) => (
              <Link key={a.id} to={linkInterno(a.link)} className={`alerta-item alerta-${a.nivel}`}>
                <div><strong>{a.titulo}</strong><br /><span className="mudo">{a.descricao}</span></div>
              </Link>
            ))}
          </div>
        ) : <Vazio mensagem="Nenhum alerta no momento." />}
      </section>
    </>
  );
}
