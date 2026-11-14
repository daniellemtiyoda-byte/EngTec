import { Link } from 'react-router-dom';
import { Badge } from '../components/Badge';
import { CabecalhoPagina } from '../components/Cabecalhos';
import { Carregando, Erro, Vazio } from '../components/Estados';
import { CartaoIndicador } from '../components/Indicadores';
import { useAuth } from '../contexts/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import type { NivelAlerta } from '../types/models';
import { numero } from '../utils/format';

const TOM_NIVEL = { info: 'azul', atencao: 'laranja', critico: 'vermelho' } as const;
const ROTULO_NIVEL: Record<NivelAlerta, string> = { info: 'Informação', atencao: 'Atenção', critico: 'Crítico' };

/**
 * Painel (seção 9.2 do plano, versão base da Etapa 10): cartões de indicadores, "Para fazer agora" e alertas, conforme o
 * perfil. Todo número leva à lista que o explica (o valor do cartão é o total dessa lista). Fora desta versão: gráficos,
 * taxa de reprovação por inspetora, pontualidade e Início de campo (ver CHANGELOG).
 */
export default function Painel() {
  const { usuario } = useAuth();
  const cartoes = useAsync(() => servicos.dashboard.cartoes(), []);
  const pendencias = useAsync(() => servicos.dashboard.pendencias(), []);
  const alertas = useAsync(() => servicos.dashboard.alertas(), []);

  return (
    <>
      <CabecalhoPagina titulo="Painel" subtitulo={usuario ? `Olá, ${usuario.nome}. O que precisa de atenção hoje.` : undefined} />

      {(cartoes.dados?.length ?? 0) > 0 && (
        <section className="painel" aria-labelledby="painel-indicadores">
          <h2 id="painel-indicadores" className="titulo-secao">Indicadores</h2>
          <div className="grade-indicadores">
            {cartoes.dados!.map((c) => <CartaoIndicador key={c.id} rotulo={c.rotulo} valor={c.valor} detalhe={c.detalhe} tom={c.tom} para={c.link} />)}
          </div>
        </section>
      )}
      {cartoes.erro && <Erro erro={cartoes.erro} aoTentar={cartoes.recarregar} />}

      <section className="painel" aria-labelledby="painel-fazer">
        <h2 id="painel-fazer" className="titulo-secao">Para fazer agora</h2>
        {pendencias.carregando && !pendencias.dados ? <Carregando linhas={2} /> : pendencias.erro ? <Erro erro={pendencias.erro} aoTentar={pendencias.recarregar} /> : !pendencias.dados?.length ? (
          <Vazio mensagem="Nada pendente para o seu perfil." />
        ) : (
          <ul className="lista-painel">
            {pendencias.dados.map((p) => (
              <li key={p.id}>
                <span className="lista-painel-texto"><strong>{numero(p.quantidade)}</strong> {p.titulo}</span>
                <Badge tom={TOM_NIVEL[p.nivel]}>{ROTULO_NIVEL[p.nivel]}</Badge>
                <Link className="btn btn-acao btn-peq" to={p.link}>{p.acao}</Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      {(alertas.dados?.length ?? 0) > 0 && (
        <section className="painel" aria-labelledby="painel-alertas">
          <h2 id="painel-alertas" className="titulo-secao">Alertas</h2>
          <ul className="lista-painel">
            {alertas.dados!.map((a) => (
              <li key={a.id}>
                <span className="lista-painel-texto"><strong>{a.titulo}</strong><span className="detalhe-linha" style={{ display: 'block' }}>{a.descricao}</span></span>
                <Badge tom={TOM_NIVEL[a.nivel]}>{ROTULO_NIVEL[a.nivel]}</Badge>
                <Link className="btn btn-sec btn-peq" to={a.link}>Ver</Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      {alertas.erro && <Erro erro={alertas.erro} aoTentar={alertas.recarregar} />}
    </>
  );
}
