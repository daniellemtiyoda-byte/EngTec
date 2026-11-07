import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Aviso, Carregando, Erro } from '../components/Estados';
import { EtiquetaQr } from '../components/EtiquetaQr';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { metros, numero } from '../utils/format';
import { baseDosQr } from '../utils/qr';

/**
 * Folha de etiquetas de uma emissão do fornecedor (seção 9.6 do plano), sem o Layout: primeiro a etiqueta do fardo, depois as dos
 * seus dormentes. CSS de impressão em A4 sem cortar etiqueta. Com `?fardo=`, só a etiqueta daquele fardo.
 * Avisa quando o link dos QR não é a URL definitiva (VITE_APP_URL), para não imprimir etiqueta que não abre no celular.
 */
export default function EtiquetasImpressao() {
  const { emissao = '' } = useParams();
  const [params] = useSearchParams();
  const soFardo = params.get('fardo');
  const r = useAsync(() => servicos.simulador.etiquetas(emissao), [emissao]);
  const { base, real, configurada } = baseDosQr();

  if (r.carregando && !r.dados) return <main className="folha-tela"><Carregando /></main>;
  if (r.erro || !r.dados) return <main className="folha-tela"><Erro erro={r.erro} aoTentar={r.recarregar} /></main>;
  const { emissao: em, contrato, fardos } = r.dados;
  const lista = soFardo ? fardos.filter((f) => f.fardo.id === soFardo) : fardos;
  const total = lista.reduce((s, f) => s + 1 + (soFardo ? 0 : f.dormentesIds.length), 0);

  return (
    <main className="folha-tela">
      <div className="folha-barra nao-imprimir">
        <div>
          <h1 className="titulo">Etiquetas · NF {em.nf.numero}</h1>
          <p className="mudo">Contrato <span className="mono">{contrato.numero}</span> · {numero(total)} etiquetas{soFardo ? ` (só o fardo ${soFardo})` : ''}</p>
        </div>
        <div className="acoes">
          <Link className="btn btn-sec" to={soFardo ? `/f/${soFardo}` : '/simulador'}>Voltar</Link>
          <button type="button" className="btn btn-pri" onClick={() => window.print()}>Imprimir</button>
        </div>
      </div>
      {!real && (
        <div className="nao-imprimir">
          <Aviso tom="alerta">
            Os QR destas etiquetas apontam para <span className="mono">{base}</span>{configurada ? '' : ' (VITE_APP_URL não configurada)'}.
            Esse endereço não abre no celular de quem ler a plaquinha. Não imprima para uso real antes de configurar VITE_APP_URL com a URL da Vercel (https).
          </Aviso>
        </div>
      )}
      <div className="folha-etiquetas">
        {lista.map(({ fardo, item, dormentesIds }) => [
          <EtiquetaQr
            key={fardo.id} tipo="fardo" id={fardo.id} titulo="FARDO" tamanho="grande"
            linhas={[`Contrato ${contrato.numero}`, `${item.especie.nomePopular} · ${item.tamanho.codigo}`, `${numero(fardo.quantidadeInicial)} dormentes`]}
          />,
          ...(soFardo ? [] : dormentesIds.map((id) => (
            <EtiquetaQr key={id} tipo="dormente" id={id} titulo="DORMENTE" linhas={[`Contrato ${contrato.numero}`, item.especie.nomePopular, metros(item.tamanho.comprimentoCm / 100)]} />
          ))),
        ])}
      </div>
    </main>
  );
}
