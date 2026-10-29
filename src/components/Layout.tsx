import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, matchPath, useLocation, useNavigate, Link } from 'react-router-dom';
import { AlertasProvider, useAlertas } from '../contexts/AlertasContext';
import { useAuth } from '../contexts/AuthContext';
import type { Permissao } from '../dominio/permissoes';
import { GRUPOS_MENU, ROTAS, type Rota } from '../rotas';
import { destinoBusca } from '../utils/busca';
import { linkInterno } from '../utils/format';
import { ErroTela } from './ErroTela';
import { BannerSimulado, Vazio } from './Estados';
import { Icone } from './Icone';
import { Logo } from './Logo';

const permite = (pode: (p: Permissao) => boolean, r: Pick<Rota, 'permissoes'>) => !r.permissoes || r.permissoes.some(pode);

/** Tela sem permissão para o perfil: aviso no lugar do conteúdo (só UX; o servidor valida cada operação). */
export function ExigePermissao({ rota, children }: { rota: Pick<Rota, 'permissoes'>; children: ReactNode }) {
  const { pode } = useAuth();
  if (permite(pode, rota)) return <>{children}</>;
  return <section className="painel"><Vazio mensagem="Seu perfil não tem acesso a esta tela." dica="Use o menu para ver as funções do seu perfil. Se precisar deste acesso, fale com o administrador." /></section>;
}

/** O perfil pode abrir este link interno? Caminho desconhecido não é filtrado (cai no "*" do App). */
function podeAbrir(pode: (p: Permissao) => boolean, link?: string) {
  const caminho = linkInterno(link).split('?')[0];
  const rota = ROTAS.find((r) => matchPath({ path: r.caminho, end: true }, caminho));
  return !rota || permite(pode, rota);
}

export function RotaProtegida() {
  const { usuario, carregando, pode } = useAuth();
  const loc = useLocation();
  // Sino e painel mostram só alertas que levam a telas do perfil.
  const filtro = useCallback((a: { link?: string }) => podeAbrir(pode, a.link), [pode]);
  if (carregando) return <div className="tela-cheia" role="status">Carregando…</div>;
  // Guarda caminho + parâmetros (ex.: ?q=) para voltar exatamente à mesma tela depois do login.
  if (!usuario) return <Navigate to="/login" replace state={{ de: loc.pathname + loc.search }} />;
  return <AlertasProvider filtro={filtro}><Layout /></AlertasProvider>;
}

function Notificacoes() {
  const [aberto, setAberto] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { dados } = useAlertas();
  const n = dados?.length ?? 0;

  // Fecha com Esc ou clique fora do painel.
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setAberto(false); };
    const tecla = (e: KeyboardEvent) => { if (e.key === 'Escape') setAberto(false); };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    return () => { document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla); };
  }, [aberto]);

  return (
    <div className="notif" ref={ref}>
      <button className="btn-icone btn-icone-claro" onClick={() => setAberto((v) => !v)} aria-expanded={aberto} aria-label={`Notificações (${n})`}>
        <Icone nome="bell" />{n > 0 && <span className="contador">{n}</span>}
      </button>
      {aberto && (
        <div className="notif-painel" role="region" aria-label="Notificações">
          {n === 0 ? <p className="mudo">Sem notificações.</p> : dados!.map((a) => (
            <Link key={a.id} to={linkInterno(a.link)} className={`notif-item notif-${a.nivel}`} onClick={() => setAberto(false)}>
              <strong>{a.titulo}</strong><span>{a.descricao}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Layout() {
  const { usuario, sair, pode } = useAuth();
  const nav = useNavigate();
  // Menu do perfil: só as telas que ele pode usar, agrupadas pelo fluxo; grupos vazios não aparecem.
  const grupos = GRUPOS_MENU.map((titulo) => ({ titulo, itens: ROTAS.filter((r) => r.grupo === titulo && !r.foraDoMenu && permite(pode, r)) })).filter((g) => g.itens.length);
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
          <Logo />
          <div className="marca-texto"><strong>Holz Trilho</strong><span>Gestão de dormentes</span></div>
        </div>
        <nav>
          {grupos.map((g) => (
            <div key={g.titulo} className="nav-grupo">
              <span className="nav-titulo">{g.titulo}</span>
              {g.itens.map((i) => (
                <NavLink key={i.caminho} to={i.caminho} end={i.fim} className={({ isActive }) => `nav-item ${isActive ? 'ativo' : ''}`} title={i.rotulo}>
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
          <form className="busca-global" role="search" onSubmit={(e) => { e.preventDefault(); if (busca.trim()) { nav(destinoBusca(busca)); setBusca(''); } }}>
            <Icone nome="search" tamanho={18} />
            <label className="sr-only" htmlFor="busca-global">Pesquisa global</label>
            <input id="busca-global" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Lote, fardo, RME ou NF (ex.: LT26-0042-F03)…" maxLength={80} />
          </form>
          <Notificacoes />
          <div className="usuario">
            <div><strong>{usuario?.nome}</strong><span>{usuario?.perfil}</span></div>
            <button className="btn-icone btn-icone-claro" aria-label="Sair" title="Sair" onClick={async () => { await sair(); nav('/login'); }}><Icone nome="out" /></button>
          </div>
        </header>
        <BannerSimulado />
        <main id="conteudo" className="conteudo" tabIndex={-1}>
          <ErroTela key={loc.pathname}><Outlet /></ErroTela>
        </main>
      </div>
    </div>
  );
}
