import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { PERFIS, type Permissao } from '../dominio/permissoes';
import { useTelaPequena } from '../hooks/useTelaPequena';
import { GRUPOS_MENU, ROTAS, type Rota } from '../rotas';
import { SeloDemo } from './Badge';
import { EntradaCodigo } from './EntradaCodigo';
import { ErroTela } from './ErroTela';
import { Vazio } from './Estados';
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

/**
 * Navegação de campo no celular (seção 11.1 do plano): quatro itens fixos para quem trabalha no pátio
 * (quem movimenta estoque); o menu completo continua na gaveta.
 */
function NavInferior({ aoLerQr }: { aoLerQr: () => void }) {
  const item = ({ isActive }: { isActive: boolean }) => `nav-inferior-item${isActive ? ' ativo' : ''}`;
  return (
    <nav className="nav-inferior" aria-label="Navegação de campo">
      <NavLink to="/" end className={item}><Icone nome="grid" /><span>Início</span></NavLink>
      <button type="button" className="nav-inferior-item nav-inferior-qr" onClick={aoLerQr}><Icone nome="qr" /><span>Ler QR</span></button>
      <NavLink to="/estoque" className={item}><Icone nome="box" /><span>Estoque</span></NavLink>
      <NavLink to="/saidas" className={item}><Icone nome="pedido" /><span>RME</span></NavLink>
    </nav>
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
  const [lendo, setLendo] = useState(false);
  const pequena = useTelaPequena();
  const campo = pequena && pode('estoque:movimentar');
  useEffect(() => setAberto(false), [loc.pathname]);

  return (
    <div className={`app ${recolhido ? 'recolhido' : ''} ${aberto ? 'menu-aberto' : ''} ${campo ? 'com-nav-inferior' : ''}`}>
      <a className="pular" href="#conteudo">Ir para o conteúdo</a>
      <aside className="sidebar" aria-label="Navegação principal">
        <div className="marca">
          <Logo />
          <div className="marca-texto"><strong>Holz Trilho</strong><span>Gestão de dormentes</span></div>
          <button className="recolher" onClick={() => setRecolhido((v) => !v)} aria-pressed={recolhido} aria-label={recolhido ? 'Expandir menu' : 'Recolher menu'} title={recolhido ? 'Expandir menu' : 'Recolher menu'}>
            <Icone nome="chevron" tamanho={18} />
          </button>
        </div>
        <nav>
          {grupos.map((g) => (
            <div key={g.titulo} className="nav-grupo">
              <span className="nav-titulo">{g.titulo}</span>
              {g.itens.map((i) => (
                <NavLink key={i.caminho} to={i.caminho} end={i.fim} className={({ isActive }) => `nav-item ${isActive ? 'ativo' : ''}`} title={i.rotulo}>
                  <Icone nome={i.icone} tamanho={18} /><span>{i.rotulo}</span>{i.demo && <SeloDemo curto />}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>
      </aside>
      {aberto && <div className="sombra" onClick={() => setAberto(false)} />}

      <div className="principal">
        <header className="topo">
          <button className="btn-icone btn-icone-claro menu-mobile" onClick={() => setAberto(true)} aria-label="Abrir menu"><Icone nome="menu" /></button>
          {/* Busca global volta na Etapa 4 (IDs v2) e o sino de alertas na Etapa 9. */}
          <button type="button" className="btn btn-sec btn-ler-qr" onClick={() => setLendo(true)}><Icone nome="qr" tamanho={18} /><span>Ler QR</span></button>
          <div className="usuario">
            <div><strong>{usuario?.nome}</strong><span>{usuario && PERFIS[usuario.perfil].rotulo}</span></div>
            <button className="btn-icone btn-icone-claro" aria-label="Sair" title="Sair" onClick={async () => { await sair(); nav('/login'); }}><Icone nome="out" /></button>
          </div>
        </header>
        <main id="conteudo" className="conteudo" tabIndex={-1}>
          <ErroTela key={loc.pathname}><Outlet /></ErroTela>
        </main>
      </div>
      {/* No celular: navegação de campo para quem trabalha no pátio; para os demais, o Ler QR flutuante. */}
      {campo ? <NavInferior aoLerQr={() => setLendo(true)} /> : (
        <button type="button" className="ler-qr-flutuante" onClick={() => setLendo(true)} aria-label="Ler QR"><Icone nome="qr" tamanho={26} /></button>
      )}
      <EntradaCodigo aberto={lendo} aoFechar={() => setLendo(false)} />
    </div>
  );
}
