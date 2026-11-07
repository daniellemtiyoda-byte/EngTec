import { Link, useSearchParams } from 'react-router-dom';
import { Aviso, Carregando, Erro, Vazio } from '../components/Estados';
import { EtiquetaQr } from '../components/EtiquetaQr';
import { idLocal } from '../dominio/identificacao';
import { TIPO_LOCAL } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { servicos } from '../services';
import { numero } from '../utils/format';
import { baseDosQr } from '../utils/qr';

/**
 * Etiquetas de endereço dos locais (seção 9.15 do plano), sem o Layout: uma etiqueta grande por local ativo, com o QR
 * `LOC-<código>` que abre a página do local e é lido na guarda e na transferência. Com `?local=`, só aquele local.
 * Avisa quando o link dos QR não é a URL definitiva, como a folha de etiquetas dos fardos.
 */
export default function EtiquetasLocais() {
  const [params] = useSearchParams();
  const so = params.get('local')?.toUpperCase();
  const r = useAsync(() => servicos.locais.listar({ pageSize: 500 }), []);
  const { base, real, configurada } = baseDosQr();

  if (r.carregando && !r.dados) return <main className="folha-tela"><Carregando /></main>;
  if (r.erro || !r.dados) return <main className="folha-tela"><Erro erro={r.erro} aoTentar={r.recarregar} /></main>;
  const lista = r.dados.items.filter((l) => (so ? l.codigo === so : l.ativo)).sort((a, b) => a.codigo.localeCompare(b.codigo, 'pt-BR'));

  return (
    <main className="folha-tela">
      <div className="folha-barra nao-imprimir">
        <div>
          <h1 className="titulo">QR dos locais</h1>
          <p className="mudo">{so ? `Só o local ${so}` : `${numero(lista.length)} locais ativos`}</p>
        </div>
        <div className="acoes">
          <Link className="btn btn-sec" to={so ? `/locais/${so}` : '/locais'}>Voltar</Link>
          <button type="button" className="btn btn-pri" onClick={() => window.print()} disabled={!lista.length}>Imprimir</button>
        </div>
      </div>
      {!real && (
        <div className="nao-imprimir">
          <Aviso tom="alerta">
            Os QR destas etiquetas apontam para <span className="mono">{base}</span>{configurada ? '' : ' (VITE_APP_URL não configurada)'}.
            Esse endereço não abre no celular de quem ler a etiqueta. Não imprima para uso real antes de configurar VITE_APP_URL com a URL da Vercel (https).
          </Aviso>
        </div>
      )}
      {!lista.length ? <Vazio mensagem={so ? `Local ${so} não encontrado.` : 'Nenhum local ativo.'} /> : (
        <div className="folha-etiquetas">
          {lista.map((l) => (
            <EtiquetaQr key={l.id} tipo="local" id={idLocal(l.codigo)} titulo="LOCAL" tamanho="grande" linhas={[l.descricao, TIPO_LOCAL[l.tipo][1]]} />
          ))}
        </div>
      )}
    </main>
  );
}
