import { CabecalhoPagina } from '../components/Cabecalhos';

/** Tela provisória da reestruturação v2: cada item do menu abre aqui até a sua etapa (docs/PLANO-V2.md, seção 13). */
export default function EmConstrucao({ titulo, etapa }: { titulo: string; etapa?: number }) {
  return (
    <section className="painel">
      <CabecalhoPagina titulo={titulo} subtitulo="Em construção" />
      <p>
        Esta tela está em construção na versão 2 do Holz Trilho, com rastreabilidade de cada dormente por QR code.
        {etapa !== undefined && <> Ela entra na etapa {etapa} do plano de desenvolvimento.</>}
      </p>
    </section>
  );
}
