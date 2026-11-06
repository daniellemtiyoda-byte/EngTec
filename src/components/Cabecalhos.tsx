import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { IdCodigo } from './IdCodigo';

export interface Migalha { rotulo: string; para?: string }

/**
 * Migalhas da página de objeto (Estoque › Fardo … › Dormente …), montadas pela origem real do objeto,
 * não pelo histórico de navegação. O último item é a página atual.
 */
export function Migalhas({ itens }: { itens: Migalha[] }) {
  if (!itens.length) return null;
  return (
    <nav className="migalhas" aria-label="Você está em">
      <ol>
        {itens.map((m, i) => {
          const ultima = i === itens.length - 1;
          return (
            <li key={`${m.rotulo}-${i}`}>
              {m.para && !ultima ? <Link to={m.para}>{m.rotulo}</Link> : <span aria-current={ultima ? 'page' : undefined}>{m.rotulo}</span>}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

interface PropsPagina {
  titulo: string;
  /** Contagem ou descrição de uma linha. */
  subtitulo?: ReactNode;
  migalhas?: Migalha[];
  /** Ações à direita; no máximo uma principal (`btn-pri`). */
  acoes?: ReactNode;
  /** Selo ao lado do título (ex. `<SeloDemo />`). */
  selo?: ReactNode;
  nivel?: 1 | 2;
}

/** Cabeçalho das páginas de lista, painel e assistente (seção 8 do plano). */
export function CabecalhoPagina({ titulo, subtitulo, migalhas, acoes, selo, nivel = 1 }: PropsPagina) {
  const H = nivel === 1 ? 'h1' : 'h2';
  return (
    <header className="cabecalho-pagina">
      {migalhas && <Migalhas itens={migalhas} />}
      <div className="cabecalho-linha">
        <div className="cabecalho-textos">
          <H className={nivel === 1 ? 'titulo' : 'subtitulo'}>{titulo}{selo && <> {selo}</>}</H>
          {subtitulo && <p className="mudo">{subtitulo}</p>}
        </div>
        {acoes && <div className="acoes">{acoes}</div>}
      </div>
    </header>
  );
}

/** Um fato-chave do cabeçalho de objeto: rótulo pequeno em cima, valor embaixo; com `para`, o valor é link. */
export function FatoChave({ rotulo, valor, para }: { rotulo: string; valor: ReactNode; para?: string }) {
  return (
    <div className="fato">
      <dt>{rotulo}</dt>
      <dd>{para ? <Link to={para}>{valor}</Link> : valor}</dd>
    </div>
  );
}

interface PropsObjeto {
  /** Tipo do objeto ("Fardo", "Contrato"...), lido antes do ID. */
  tipo: string;
  /** ID impresso (mono, com copiar). Objetos sem ID impresso, como o fornecedor, usam `titulo`. */
  id?: string;
  titulo?: string;
  situacao?: ReactNode;
  /** 3 a 6 `<FatoChave />`. */
  fatos?: ReactNode;
  acoes?: ReactNode;
  migalhas?: Migalha[];
  /** 2 quando o objeto aparece dentro de outra página (ex. vitrine). */
  nivel?: 1 | 2;
}

/** Cabeçalho da página de objeto: ID grande em mono, situação, fatos-chave e barra de ações. */
export function CabecalhoObjeto({ tipo, id, titulo, situacao, fatos, acoes, migalhas, nivel = 1 }: PropsObjeto) {
  const H = nivel === 1 ? 'h1' : 'h2';
  return (
    <header className="cabecalho-objeto">
      {migalhas && <Migalhas itens={migalhas} />}
      <div className="cabecalho-linha">
        <div className="cabecalho-textos">
          <span className="objeto-tipo">{tipo}</span>
          <div className="objeto-titulo">
            {id ? <><H className="sr-only">{tipo} {id}</H><IdCodigo id={id} tamanho="grande" /></> : <H className="objeto-nome">{titulo}</H>}
            {situacao}
          </div>
        </div>
        {acoes && <div className="acoes">{acoes}</div>}
      </div>
      {fatos && <dl className="fatos">{fatos}</dl>}
    </header>
  );
}
