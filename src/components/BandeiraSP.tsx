import { useState } from 'react';
import { env } from '../config/env';

/**
 * Espaço institucional da bandeira do Estado de São Paulo.
 * O arquivo OFICIAL deve ser colocado em public/assets/bandeira-sp.svg (veja LEIA-ME.txt na pasta).
 * A bandeira não é redesenhada aqui: a proporção é fixada via CSS e o arquivo não é alterado.
 */
export function BandeiraSP({ tamanho = 'media' }: { tamanho?: 'pequena' | 'media' | 'grande' }) {
  const [falhou, setFalhou] = useState(false);
  if (falhou) {
    return (
      <span className={`bandeira bandeira-${tamanho} bandeira-reserva`} role="img" aria-label="Espaço reservado para a bandeira oficial do Estado de São Paulo">
        <span>Bandeira oficial<br />(arquivo pendente)</span>
      </span>
    );
  }
  return <img className={`bandeira bandeira-${tamanho}`} src={env.BANDEIRA_URL} alt="Bandeira do Estado de São Paulo" onError={() => setFalhou(true)} />;
}
