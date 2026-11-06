import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { Permissao } from '../dominio/permissoes';
import { GRUPOS_MENU, ROTAS, type Rota } from '../rotas';
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

export function RotaProtegida() {
  const { usuario, carregando } = useAuth();
  const loc = useLocation();
  if (carregando) return <div className="tela-cheia" role="status">Carregando…</div>;
  // Guarda caminho + parâmetros (ex.: ?q=) para voltar exatamente à mesma tela depois do login.
  if (!usuario) return <Navigate to="/login" replace state={{ de: loc.pathname + loc.search }} />;
  return <Layout />;
}

function Layout() {
  const { usuario, sair, pode } = useAuth();
  const nav = useNavigate();
  // Menu do perfil: só as telas que ele pode usar, agrupadas pelo fluxo; grupos vazios não aparecem.
  const grupos = GRUPOS_MENU.map((titulo) => ({ titulo, itens: ROTAS.filter((r) => r.grupo === titulo && !r.foraDoMenu && permite(pode, r)) })).filter((g) => g.itens.length);
  const loc = useLocation();
  const [recolhido, setRecolhido] = useState(false);
  const [aberto, setAberto] = useState(false);
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
          {/* Busca global, botão Ler QR e sino de alertas voltam na v2 (Etapas 1, 4 e 9 do docs/PLANO-V2.md). */}
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
