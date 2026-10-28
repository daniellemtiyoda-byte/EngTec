import { paraNumero } from '../utils/format';

interface Props {
  valor: string;
  aoMudar: (v: string) => void;
  /** Texto para leitores de tela e para os botões (ex.: "Fardo 3: quantidade de dormentes"). */
  rotulo: string;
  min?: number;
  max?: number;
  invalido?: boolean;
}

/**
 * Campo numérico para uso no pátio: botões − e + grandes (toque com o polegar) e o número no meio, que também aceita digitação.
 * O valor continua texto, como nos demais formulários, e é convertido com `paraNumero` pela tela.
 */
export function Contador({ valor, aoMudar, rotulo, min = 0, max, invalido }: Props) {
  const n = paraNumero(valor, true);
  const atual = Number.isInteger(n) ? n : min;
  const mudar = (d: number) => aoMudar(String(Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min, atual + d))));
  return (
    <div className={`contador-campo${invalido ? ' invalido' : ''}`}>
      <button type="button" aria-label={`Diminuir: ${rotulo}`} onClick={() => mudar(-1)} disabled={atual <= min}>−</button>
      <input
        value={valor} inputMode="numeric" aria-label={rotulo} aria-invalid={invalido} maxLength={6}
        onChange={(e) => aoMudar(e.target.value)} onFocus={(e) => e.target.select()}
      />
      <button type="button" aria-label={`Aumentar: ${rotulo}`} onClick={() => mudar(1)} disabled={max !== undefined && atual >= max}>+</button>
    </div>
  );
}
