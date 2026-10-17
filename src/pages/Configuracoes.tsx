import { useState } from 'react';
import { Badge } from '../components/Badge';
import { Aviso, PageHeader } from '../components/Estados';
import { useToast } from '../components/Toast';
import { env } from '../config/env';
import { servicos } from '../services';
import { LISTA_ENDPOINTS } from '../services/endpoints';

export default function Configuracoes() {
  const notificar = useToast();
  const [testando, setTestando] = useState(false);

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
          <dt>Bandeira</dt><dd>{env.BANDEIRA_URL}</dd>
        </dl>
        {env.USE_MOCK && <Aviso tom="alerta">Para testar estados de erro e vazio no modo simulado, acrescente <code>?simular=erro</code> ou <code>?simular=vazio</code> à URL (antes do <code>#</code>).</Aviso>}
      </section>
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
