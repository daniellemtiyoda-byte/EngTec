import type { ReactNode } from 'react';
import { env } from '../config/env';
import { mensagemSegura } from '../services/http';

export function Carregando({ linhas = 5 }: { linhas?: number }) {
  return (
    <div className="estado" role="status" aria-label="Carregando">
      {Array.from({ length: linhas }, (_, i) => <div key={i} className="esqueleto" />)}
    </div>
  );
}

export function Vazio({ mensagem = 'Nenhum registro encontrado.', dica }: { mensagem?: string; dica?: string }) {
  return (
    <div className="estado estado-centro">
      <strong>{mensagem}</strong>
      {dica && <span className="mudo">{dica}</span>}
    </div>
  );
}

export function Erro({ erro, aoTentar }: { erro: unknown; aoTentar?: () => void }) {
  return (
    <div className="estado estado-centro estado-erro" role="alert">
      <strong>Não foi possível carregar os dados.</strong>
      <span>{mensagemSegura(erro)}</span>
      {aoTentar && <button className="btn btn-sec" onClick={aoTentar}>Tentar novamente</button>}
    </div>
  );
}

export function Aviso({ tom = 'info', children }: { tom?: 'info' | 'alerta' | 'critico'; children: ReactNode }) {
  return <div className={`aviso aviso-${tom}`} role={tom === 'critico' ? 'alert' : undefined}>{children}</div>;
}

export function BannerSimulado() {
  if (!env.USE_MOCK) return null;
  return (
    <div className="banner-simulado" role="note">
      <strong>MODO SIMULADO</strong> — todos os dados exibidos são fictícios e nenhuma operação é gravada em servidor. Não use para decisões operacionais.
    </div>
  );
}

export function PageHeader({ titulo, descricao, acoes, nivel = 1 }: { titulo: string; descricao?: string; acoes?: ReactNode; nivel?: 1 | 2 }) {
  const H = nivel === 1 ? 'h1' : 'h2';
  return (
    <div className="page-header">
      <div>
        <H className={nivel === 1 ? 'titulo' : 'subtitulo'}>{titulo}</H>
        {descricao && <p className="mudo">{descricao}</p>}
      </div>
      {acoes && <div className="acoes">{acoes}</div>}
    </div>
  );
}
