import { Link, useParams } from 'react-router-dom';
import { AbasSecao, useAbaNoEndereco, type Aba } from '../components/Abas';
import { BadgeDe } from '../components/Badge';
import { CabecalhoObjeto, FatoChave } from '../components/Cabecalhos';
import { Aviso, Carregando, Erro, Vazio } from '../components/Estados';
import { IdCodigo } from '../components/IdCodigo';
import { BarraProgresso } from '../components/Indicadores';
import { Relacionados } from '../components/Relacionados';
import { SITUACAO_CADASTRO, SITUACAO_CONTRATO } from '../dominio/rotulos';
import { useAsync } from '../hooks/useAsync';
import { useCadastros } from '../hooks/useCadastros';
import { servicos } from '../services';
import { cnpjFormatado, data, numero, pct } from '../utils/format';
import { totaisDoContrato } from './Contratos';
import { SituacaoCtf } from './Fornecedores';

type AbaFornecedor = 'contratos' | 'reprovacao' | 'certificados';

/** Página do fornecedor (seção 9.18 do plano): contratos e entregas, taxa de reprovação e certificados. */
export default function FornecedorDetalhe() {
  const { id = '' } = useParams();
  const cad = useCadastros();
  const r = useAsync(() => servicos.fornecedores.resumo(id), [id]);
  const [aba, setAba] = useAbaNoEndereco<AbaFornecedor>(['contratos', 'reprovacao', 'certificados']);

  if (r.carregando && !r.dados) return <section className="painel"><Carregando /></section>;
  if (r.erro || !r.dados) return <section className="painel"><Erro erro={r.erro} aoTentar={r.recarregar} /></section>;
  const { fornecedor: f, atas, contratos, reprovacao } = r.dados;
  const total = reprovacao.reduce((t, x) => ({ inspecionados: t.inspecionados + x.inspecionados, reprovados: t.reprovados + x.reprovados }), { inspecionados: 0, reprovados: 0 });

  const abas: Aba<AbaFornecedor>[] = [
    { valor: 'contratos', rotulo: 'Contratos', total: contratos.length },
    { valor: 'reprovacao', rotulo: 'Taxa de reprovação' },
    { valor: 'certificados', rotulo: 'Certificados', total: f.certificados.length },
  ];

  return (
    <section className="painel">
      <CabecalhoObjeto
        tipo="Fornecedor" titulo={f.razaoSocial} situacao={<BadgeDe mapa={SITUACAO_CADASTRO} valor={f.situacao} />}
        migalhas={[{ rotulo: 'Cadastros', para: '/cadastros?aba=fornecedores' }, { rotulo: f.razaoSocial }]}
        fatos={<>
          <FatoChave rotulo="CNPJ" valor={<span className="mono">{cnpjFormatado(f.cnpj)}</span>} />
          <FatoChave rotulo="Cidade/UF" valor={f.cidadeUf} />
          <FatoChave rotulo="CTF Ibama" valor={<>{f.ctfIbama} · <SituacaoCtf f={f} /></>} />
          <FatoChave rotulo="Espécies" valor={f.especiesIds.map(cad.nomeEspecie).join(', ')} />
          <FatoChave rotulo="Reprovação" valor={total.inspecionados ? pct((total.reprovados / total.inspecionados) * 100) : '—'} />
        </>}
      />
      {f.bloqueado && <Aviso tom="critico">CTF Ibama vencido em {data(f.ctfValidade)}: fornecedor bloqueado para novas atas e contratos.</Aviso>}

      <div className="objeto-grade">
        <AbasSecao abas={abas} ativa={aba} aoEscolher={setAba} rotulo="Seções do fornecedor">
          {aba === 'contratos' && (contratos.length === 0 ? <Vazio mensagem="Nenhum contrato deste fornecedor." /> : (
            <div className="tabela-wrap">
              <table className="tabela">
                <thead><tr><th scope="col">Contrato</th><th scope="col">Ata</th><th scope="col">Situação</th><th scope="col">Entregas</th></tr></thead>
                <tbody>
                  {contratos.map((c) => {
                    const t = totaisDoContrato(c);
                    return (
                      <tr key={c.id}>
                        <td><IdCodigo id={c.numero} para={`/contratos/${c.numero}`} /></td>
                        <td className="mono">{atas.find((a) => a.id === c.ataId)?.numero}</td>
                        <td><BadgeDe mapa={SITUACAO_CONTRATO} valor={c.situacao} /></td>
                        <td className="celula-progresso"><BarraProgresso total={t.contratado} recebido={t.recebidos} aprovado={t.aprovados} /></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ))}
          {aba === 'reprovacao' && (reprovacao.length === 0 ? <Vazio mensagem="Nenhum dormente deste fornecedor foi inspecionado ainda." /> : (
            <div className="tabela-wrap">
              <table className="tabela">
                <thead><tr><th scope="col">Espécie</th><th scope="col" className="al-right">Inspecionados</th><th scope="col" className="al-right">Reprovados</th><th scope="col" className="al-right">Taxa</th></tr></thead>
                <tbody>
                  {reprovacao.map((x) => (
                    <tr key={x.especieId}>
                      <td>{cad.nomeEspecie(x.especieId)}</td>
                      <td className="al-right">{numero(x.inspecionados)}</td>
                      <td className="al-right">{numero(x.reprovados)}</td>
                      <td className="al-right">{pct(x.percentual)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))}
          {aba === 'certificados' && (f.certificados.length === 0
            ? <Vazio mensagem="Nenhum certificado anexado." dica="O envio de certificados entra junto com o armazenamento de arquivos no Supabase." />
            : <ul>{f.certificados.map((c) => <li key={c.id}>{c.nome} · {data(c.enviadoEm)}</li>)}</ul>)}
        </AbasSecao>
        <Relacionados itens={[
          ...atas.map((a) => ({ icone: 'contrato' as const, tipo: 'Ata', valor: <span className="mono">{a.numero}</span>, detalhe: `Vigência ${data(a.vigenciaInicio)} a ${data(a.vigenciaFim)}` })),
          { icone: 'file', tipo: 'Contratos', valor: <Link to={`/contratos?fornecedorId=${f.id}`}>{contratos.length} contrato(s)</Link> },
        ]} />
      </div>
    </section>
  );
}
