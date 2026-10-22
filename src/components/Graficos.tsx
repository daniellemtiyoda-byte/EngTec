import type { Serie } from '../types/models';
import { numero } from '../utils/format';

/** Gráfico de barras em SVG simples (sem dependências). */
export function BarChart({ dados, unidade, titulo }: { dados: Serie[]; unidade?: string; titulo: string }) {
  const max = Math.max(1, ...dados.map((d) => d.valor));
  const W = 360, H = 180, base = 150, larg = W / dados.length;
  return (
    <figure className="grafico">
      <figcaption>{titulo}</figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${titulo}: ${dados.map((d) => `${d.rotulo} ${d.valor}`).join(', ')}`}>
        <line x1="0" y1={base} x2={W} y2={base} stroke="var(--cinza-300)" />
        {dados.map((d, i) => {
          const h = (d.valor / max) * 115;
          const x = i * larg + larg * 0.2;
          return (
            <g key={d.rotulo}>
              <rect x={x} y={base - h} width={larg * 0.6} height={h} fill="var(--azul-600)" rx="2" />
              <text x={x + larg * 0.3} y={base - h - 6} textAnchor="middle" fontSize="12" fill="var(--texto)">{numero(d.valor)}</text>
              <text x={x + larg * 0.3} y={base + 16} textAnchor="middle" fontSize="12" fill="var(--texto-mudo)">{d.rotulo}</text>
            </g>
          );
        })}
      </svg>
      {unidade && <span className="mudo">Unidade: {unidade}</span>}
    </figure>
  );
}

export interface Parte { rotulo: string; valor: number; cor: string }

/** Barra empilhada com legenda (a cor nunca é a única informação). */
export function StackBar({ partes, titulo, unidade }: { partes: Parte[]; titulo: string; unidade: string }) {
  const total = partes.reduce((a, p) => a + p.valor, 0) || 1;
  return (
    <figure className="grafico">
      <figcaption>{titulo}</figcaption>
      <div className="stack" role="img" aria-label={`${titulo}: ${partes.map((p) => `${p.rotulo} ${p.valor} ${unidade}`).join(', ')}`}>
        {partes.map((p) => <div key={p.rotulo} style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }} />)}
      </div>
      <ul className="legenda">
        {partes.map((p) => (
          <li key={p.rotulo}><span className="amostra" style={{ background: p.cor }} />{p.rotulo}: <strong>{numero(p.valor)} {unidade}</strong> ({((p.valor / total) * 100).toFixed(0)}%)</li>
        ))}
      </ul>
    </figure>
  );
}

export function StatCard({ rotulo, valor, detalhe, tom }: { rotulo: string; valor: string; detalhe?: string; tom?: 'verde' | 'laranja' | 'vermelho' | 'azul' | 'cinza' }) {
  return (
    <div className={`stat ${tom ? `stat-${tom}` : ''}`}>
      <span className="stat-rotulo">{rotulo}</span>
      <span className="stat-valor">{valor}</span>
      {detalhe && <span className="stat-detalhe">{detalhe}</span>}
    </div>
  );
}
