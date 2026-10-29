import { useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Logo } from '../components/Logo';
import { env } from '../config/env';
import { useAuth } from '../contexts/AuthContext';
import { mensagemSegura } from '../services/http';

export default function Login() {
  const { usuario, entrar } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const [u, setU] = useState('');
  const [s, setS] = useState('');
  const [erros, setErros] = useState<{ u?: string; s?: string }>({});
  const [erro, setErro] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  if (usuario) return <Navigate to="/" replace />;

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    const v = { u: u.trim() ? undefined : 'Informe o usuário.', s: s ? undefined : 'Informe a senha.' };
    setErros(v);
    setErro(undefined);
    if (v.u || v.s) return;
    setEnviando(true);
    try {
      await entrar(u.trim(), s);
      nav((loc.state as { de?: string } | null)?.de ?? '/', { replace: true });
    } catch (err) {
      setErro(mensagemSegura(err));
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="login-pagina">
      <section className="login-painel" aria-label="Apresentação do sistema">
        <img className="login-ilustracao" src="/assets/ilustracao-estacao.jpg" alt="" />
        <div className="login-marca-bloco">
          <h1 className="login-nome">Holz Trilho</h1>
          <div className="login-linha">
            <Logo tamanho="medio" />
            <p className="login-lema">Gestão de dormentes ferroviários</p>
          </div>
        </div>
      </section>

      <main className="login-lado-form">
        <form className="login-form" onSubmit={enviar} noValidate>
          <h2>Entrar no sistema</h2>
          {env.USE_MOCK && (
            <p className="login-demo"><strong>Modo de demonstração.</strong> Qualquer senha entra, com dados fictícios. Para testar um perfil, use como usuário <code>almoxarife</code>, <code>supervisor</code>, <code>requisitante</code>, <code>operador</code> ou <code>gestor</code>; outro nome entra como administrador. Nenhuma autenticação real é feita.</p>
          )}
          {erro && <div className="aviso aviso-critico" role="alert">{erro}</div>}
          <div className="campo">
            <label htmlFor="usuario">Usuário</label>
            <input id="usuario" value={u} onChange={(e) => setU(e.target.value)} autoComplete="username" aria-invalid={!!erros.u} maxLength={80} />
            {erros.u && <span className="erro-campo">{erros.u}</span>}
          </div>
          <div className="campo">
            <label htmlFor="senha">Senha</label>
            <input id="senha" type="password" value={s} onChange={(e) => setS(e.target.value)} autoComplete="current-password" aria-invalid={!!erros.s} maxLength={128} />
            {erros.s && <span className="erro-campo">{erros.s}</span>}
          </div>
          <button className="btn btn-pri btn-grande" type="submit" disabled={enviando}>{enviando ? 'Entrando…' : 'Entrar'}</button>
        </form>
      </main>
    </div>
  );
}
