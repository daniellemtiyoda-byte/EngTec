import { PageHeader } from '../components/Estados';

/** Tela provisória da reestruturação v2: as telas novas entram etapa a etapa (docs/PLANO-V2.md, seção 13). */
export default function EmConstrucao() {
  return (
    <section className="painel">
      <PageHeader titulo="Em construção" descricao="O Holz Trilho está sendo reestruturado para a versão 2, com rastreabilidade de cada dormente por QR code." />
      <p>As telas voltam aos poucos, na ordem do plano: casca visual, cadastros e contratos, QR code, recebimento, inspeção, estoque, saídas e painel.</p>
    </section>
  );
}
