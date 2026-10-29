import { useState } from 'react';
import { Badge } from '../components/Badge';
import { Aviso, Carregando, Erro, PageHeader } from '../components/Estados';
import { FormModal } from '../components/FormModal';
import { useToast } from '../components/Toast';
import { env, SUFIXO_SIMULADO } from '../config/env';
import { useAlertas } from '../contexts/AlertasContext';
import { useAuth } from '../contexts/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { dias, paraNumero } from '../utils/format';
import { LISTA_ENDPOINTS } from '../services/endpoints';

export default function Configuracoes() {
  const notificar = useToast();
  const { pode } = useAuth();
  const alertas = useAlertas();
  const [testando, setTestando] = useState(false);
  const [editar, setEditar] = useState(false);
  const par = useAsync(() => servicos.parametros.obter(), []);
  const p = par.dados;

  async function testar() {
    setTestando(true);
    try {
      const r = await servicos.sistema.testarConexao();
      notificar(r.ok ? (r.simulado ? 'alerta' : 'sucesso') : 'erro', r.mensagem);
    } finally { setTestando(false); }
  }

  return (
    <>
      <PageHeader titulo="Configurações" descricao="Ambiente e estado das integrações. Valores definidos em variáveis de ambiente (.env.local)." />
      <section className="painel">
        <PageHeader titulo="Ambiente" nivel={2} acoes={<button className="btn btn-pri" onClick={testar} disabled={testando}>{testando ? 'Testando…' : 'Testar conexão'}</button>} />
        <dl className="detalhes">
          <dt>Modo</dt><dd>{env.USE_MOCK ? <Badge tom="simulado">Simulado (VITE_USE_MOCK=true)</Badge> : <Badge tom="verde">API real</Badge>}</dd>
          <dt>URL do back-end</dt><dd>{env.API_URL || <span className="mudo">não configurada (VITE_API_URL)</span>}</dd>
          <dt>Limite de upload</dt><dd>{env.UPLOAD_MAX_MB} MB (o servidor valida novamente)</dd>
          <dt>Logo</dt><dd>{env.LOGO_URL}</dd>
        </dl>
        {env.USE_MOCK && <Aviso tom="alerta">Para testar estados de erro e vazio no modo simulado, acrescente <code>?simular=erro</code> ou <code>?simular=vazio</code> à URL (antes do <code>#</code>).</Aviso>}
      </section>
      <section className="painel">
        <PageHeader
          titulo="Parâmetros de negócio" nivel={2} descricao="Guardados no servidor e usados nos alertas, no destaque de idade dos lotes e no dashboard."
          acoes={pode('admin') && p ? <button className="btn btn-sec" onClick={() => setEditar(true)}>Editar parâmetros</button> : undefined}
        />
        {par.carregando && !p ? <Carregando linhas={3} /> : par.erro ? <Erro erro={par.erro} aoTentar={par.recarregar} /> : p && (
          <>
            {p.provisorio && <Aviso tom="alerta">Valores <strong>provisórios</strong>: o limite de dias em estoque ainda será definido com a CPTM e os limites de categoria, com o projeto de inspeção.</Aviso>}
            <dl className="detalhes">
              <dt>Limite de dias em estoque</dt><dd>{dias(p.limiteIdadeDias)}: lotes mais antigos aparecem em destaque e geram alerta</dd>
              <dt>Alerta crítico de DOF</dt><dd>prazo de declaração vencido ou vencendo em até {dias(p.alertaDofCriticoDias)}</dd>
              <dt>Alerta de atenção de DOF</dt><dd>prazo vencendo em até {dias(p.alertaDofAtencaoDias)}</dd>
              <dt>Categoria pela inspeção</dt>
              <dd>índice do Inspector a partir de {p.categoria1IndiceMin} = Categoria 1; de {p.categoria2IndiceMin} a {p.categoria1IndiceMin - 1} = Categoria 2; abaixo, Categoria 3 (a combinar com o projeto de inspeção)</dd>
              <dt>Prazo de declaração</dt><dd>dia seguinte ao fim da validade do DOF (IN Ibama 21/2014, art. 51); não é editável</dd>
            </dl>
          </>
        )}
      </section>
      <FormModal
        titulo="Editar parâmetros de negócio" aberto={editar} aoFechar={() => setEditar(false)}
        iniciais={p ? {
          limiteIdadeDias: String(p.limiteIdadeDias), alertaDofCriticoDias: String(p.alertaDofCriticoDias), alertaDofAtencaoDias: String(p.alertaDofAtencaoDias),
          categoria1IndiceMin: String(p.categoria1IndiceMin), categoria2IndiceMin: String(p.categoria2IndiceMin),
        } : undefined}
        campos={[
          { nome: 'limiteIdadeDias', rotulo: 'Limite de dias em estoque', tipo: 'number', inteiro: true, obrigatorio: true, min: 1, max: 3650 },
          { nome: 'alertaDofCriticoDias', rotulo: 'Alerta crítico de DOF: dias antes do prazo', tipo: 'number', inteiro: true, obrigatorio: true, min: 0, max: 60, ajuda: 'Prazo vencido sempre é crítico.' },
          { nome: 'alertaDofAtencaoDias', rotulo: 'Alerta de atenção de DOF: dias antes do prazo', tipo: 'number', inteiro: true, obrigatorio: true, min: 0, max: 60 },
          { nome: 'categoria1IndiceMin', rotulo: 'Categoria 1: índice da inspeção a partir de', tipo: 'number', inteiro: true, obrigatorio: true, min: 1, max: 100, ajuda: 'Índice de integridade 0–100 do Inspector.' },
          { nome: 'categoria2IndiceMin', rotulo: 'Categoria 2: índice a partir de (abaixo, Categoria 3)', tipo: 'number', inteiro: true, obrigatorio: true, min: 0, max: 99 },
        ]}
        validar={(v): Record<string, string> => ({
          ...(paraNumero(v.alertaDofAtencaoDias, true) < paraNumero(v.alertaDofCriticoDias, true) ? { alertaDofAtencaoDias: 'Precisa ser maior ou igual ao do alerta crítico.' } : {}),
          ...(paraNumero(v.categoria2IndiceMin, true) >= paraNumero(v.categoria1IndiceMin, true) ? { categoria2IndiceMin: 'Precisa ser menor que o da Categoria 1.' } : {}),
        })}
        aoEnviar={async (v) => {
          await servicos.parametros.atualizar({
            limiteIdadeDias: paraNumero(v.limiteIdadeDias, true), alertaDofCriticoDias: paraNumero(v.alertaDofCriticoDias, true), alertaDofAtencaoDias: paraNumero(v.alertaDofAtencaoDias, true),
            categoria1IndiceMin: paraNumero(v.categoria1IndiceMin, true), categoria2IndiceMin: paraNumero(v.categoria2IndiceMin, true),
          });
          notificar('sucesso', `Parâmetros atualizados${SUFIXO_SIMULADO}.`);
          par.recarregar();
          alertas.recarregar();
        }}
      />
      <section className="painel">
        <PageHeader titulo="Contratos de API" nivel={2} descricao="Todos os endpoints abaixo são provisórios até a documentação do back-end ser recebida e validada." />
        <div className="tabela-wrap">
          <table className="tabela">
            <thead><tr><th scope="col">Módulo</th><th scope="col">Operação</th><th scope="col">Método</th><th scope="col">Caminho provisório</th><th scope="col">Estado</th></tr></thead>
            <tbody>
              {LISTA_ENDPOINTS.map((e) => (
                <tr key={`${e.modulo}-${e.operacao}`}>
                  <td>{e.modulo}</td><td>{e.operacao}</td><td>{e.metodo}</td><td><code>{e.caminho}</code></td>
                  <td><Badge tom={e.estado === 'confirmado' ? 'verde' : 'laranja'}>{e.estado === 'confirmado' ? 'Confirmado' : 'Pendente de confirmação'}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
