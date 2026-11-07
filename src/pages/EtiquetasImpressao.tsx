import { Link, useParams } from 'react-router-dom';
import { Aviso, Carregando, Erro } from '../components/Estados';
import { EtiquetaQr } from '../components/EtiquetaQr';
import { ordinalClasse } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { metros, numero } from '../utils/format';
import { baseDosQr } from '../utils/qr';

/**
 * Folha de etiquetas de uma emissão do fornecedor (seção 9.6 do plano), sem o Layout: primeiro a etiqueta do fardo, depois as dos
 * seus dormentes. CSS de impressão em A4 sem cortar etiqueta. É a única impressão de etiquetas de fardo e dormente do sistema
 * (a reimpressão de etiqueta danificada, de contingência, é melhoria futura).
 * Avisa quando o link dos QR não é a URL definitiva (VITE_APP_URL), para não imprimir etiqueta que não abre no celular.
 */
export default function EtiquetasImpressao() {
  const { emissao = '' } = useParams();
  const r = useAsync(() => servicos.simulador.etiquetas(emissao), [emissao]);
  const { base, real, configurada } = baseDosQr();

  if (r.carregando && !r.dados) return <main className="folha-tela"><Carregando /></main>;
  if (r.erro || !r.dados) return <main className="folha-tela"><Erro erro={r.erro} aoTentar={r.recarregar} /></main>;
  const { emissao: em, contrato, fardos } = r.dados;
  const total = fardos.reduce((s, f) => s + 1 + f.dormentesIds.length, 0);

  return (
    <main className="folha-tela">
      <div className="folha-barra nao-imprimir">
        <div>
          <h1 className="titulo">Etiquetas · NF {em.nf.numero}</h1>
          <p className="mudo">Contrato <span className="mono">{contrato.numero}</span> · {numero(total)} etiquetas</p>
        </div>
        <div className="acoes">
          <Link className="btn btn-sec" to="/simulador">Voltar</Link>
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
        {fardos.map(({ fardo, item, dormentesIds }) => [
          <EtiquetaQr
            key={fardo.id} tipo="fardo" id={fardo.id} titulo="FARDO" tamanho="grande"
            linhas={[`Contrato ${contrato.numero}`, `Item ${item.tamanho.codigo} · ${metros(item.tamanho.comprimentoCm / 100)}`, `${item.especie.nomePopular} · ${ordinalClasse(item.classe)} classe`, `${numero(fardo.quantidadeInicial)} dormentes`]}
          />,
          ...dormentesIds.map((id) => (
            <EtiquetaQr key={id} tipo="dormente" id={id} titulo="DORMENTE" linhas={[`Contrato ${contrato.numero}`, `${item.especie.nomePopular} · ${ordinalClasse(item.classe)} classe`, `${item.tamanho.codigo} · ${metros(item.tamanho.comprimentoCm / 100)}`]} />
          )),
        ])}
      </div>
    </main>
  );
}
