import { useEffect, useState } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { BandeiraSP } from './BandeiraSP';
import { BannerSimulado } from './Estados';
import { Icone, type NomeIcone } from './Icone';

interface ItemNav { to: string; rotulo: string; icone: NomeIcone; fim?: boolean }
const GRUPOS: { titulo: string; itens: ItemNav[] }[] = [
  { titulo: 'Visão geral', itens: [{ to: '/', rotulo: 'Dashboard', icone: 'grid', fim: true }] },
  {
    titulo: 'Operação',
    itens: [
      { to: '/documentos', rotulo: 'Importar documentos', icone: 'file' },
      { to: '/recebimento', rotulo: 'Recebimento', icone: 'truck' },
      { to: '/lotes', rotulo: 'Lotes', icone: 'layers' },
      { to: '/estoque', rotulo: 'Estoque', icone: 'box' },
      { to: '/movimentacoes', rotulo: 'Movimentações', icone: 'swap' },
      { to: '/patio', rotulo: 'Pátio', icone: 'map' },
      { to: '/inventario', rotulo: 'Inventário físico', icone: 'clipboard' },
      { to: '/visao-computacional', rotulo: 'Visão computacional', icone: 'camera' },
    ],
  },
  {
    titulo: 'Cadastros e controle',
    itens: [
      { to: '/fornecedores', rotulo: 'Fornecedores', icone: 'building' },
      { to: '/especies', rotulo: 'Espécies vegetais', icone: 'leaf' },
      { to: '/volumetria', rotulo: 'Controle volumétrico', icone: 'ruler' },
      { to: '/relatorios', rotulo: 'Relatórios', icone: 'chart' },
    ],
  },
  {
    titulo: 'Sistema',
    itens: [
      { to: '/administracao', rotulo: 'Usuários e auditoria', icone: 'shield' },
      { to: '/configuracoes', rotulo: 'Configurações', icone: 'gear' },
    ],
  },
];

export function RotaProtegida() {
  const { usuario, carregando } = useAuth();
  const loc = useLocation();
  if (carregando) return <div className="tela-cheia" role="status">Carregando…</div>;
  if (!usuario) return <Navigate to="/login" replace state={{ de: loc.pathname }} />;
  return <Layout />;
}

function Notificacoes() {
  const [aberto, setAberto] = useState(false);
  const { dados } = useAsync(() => servicos.dashboard.alertas(), []);
  const n = dados?.length ?? 0;
  return (
    <div className="notif">
      <button className="btn-icone btn-icone-claro" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} aria-label={`Notificações (${n})`}>
        <Icone nome="bell" />{n > 0 && <span className="contador">{n}</span>}
      </button>
      {aberto && (
        <div className="notif-painel" role="region" aria-label="Notificações">
          {n === 0 ? <p className="mudo">Sem notificações.</p> : dados!.map((a) => (
            <Link key={a.id} to={a.link ?? '/'} className={`notif-item notif-${a.nivel}`} onClick={() => setAberto(false)}>
              <strong>{a.titulo}</strong><span>{a.descricao}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Layout() {
  const { usuario, sair } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [recolhido, setRecolhido] = useState(false);
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState('');
  useEffect(() => setAberto(false), [loc.pathname]);

  return (
    <div className={`app ${recolhido ? 'recolhido' : ''} ${aberto ? 'menu-aberto' : ''}`}>
      <a className="pular" href="#conteudo">Ir para o conteúdo</a>
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="marca">
          <BandeiraSP tamanho="pequena" />
          <div className="marca-texto"><strong>Holz Trilho</strong><span>Gestão de dormentes</span></div>
        </div>
        <nav>
          {GRUPOS.map((g) => (
            <div key={g.titulo} className="nav-grupo">
              <span className="nav-titulo">{g.titulo}</span>
              {g.itens.map((i) => (
                <NavLink key={i.to} to={i.to} end={i.fim} className={({ isActive }) => `nav-item ${isActive ? 'ativo' : ''}`} title={i.rotulo}>
                  <Icone nome={i.icone} /><span>{i.rotulo}</span>
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
        <button className="recolher" onClick={() => setRecolhido((v) => !v)} aria-pressed={recolhido} title={recolhido ? 'Expandir menu' : 'Recolher menu'}>
          <Icone nome="chevron" /><span>Recolher menu</span>
        </button>
      </aside>
      {aberto && <div className="sombra" onClick={() => setAberto(false)} />}

      <div className="principal">
        <header className="topo">
          <button className="btn-icone btn-icone-claro menu-mobile" onClick={() => setAberto(true)} aria-label="Abrir menu"><Icone nome="menu" /></button>
          <form className="busca-global" role="search" onSubmit={(e) => { e.preventDefault(); nav(`/lotes?q=${encodeURIComponent(busca.trim())}`); }}>
            <Icone nome="search" tamanho={18} />
            <label className="sr-only" htmlFor="busca-global">Pesquisa global</label>
            <input id="busca-global" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Pesquisar lotes (código, fornecedor, espécie)…" maxLength={80} />
          </form>
          <Notificacoes />
          <div className="usuario">
            <div><strong>{usuario?.nome}</strong><span>{usuario?.perfil}</span></div>
            <button className="btn-icone btn-icone-claro" aria-label="Sair" title="Sair" onClick={async () => { await sair(); nav('/login'); }}><Icone nome="out" /></button>
          </div>
        </header>
        <BannerSimulado />
        <main id="conteudo" className="conteudo" tabIndex={-1}><Outlet /></main>
      </div>
    </div>
  );
}
