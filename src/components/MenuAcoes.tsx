import { useEffect, useId, useRef, useState } from 'react';

export interface ItemMenu { rotulo: string; aoClicar: () => void }

/**
 * Menu "⋯" com as ações secundárias de uma linha. Abre em posição fixa (não é cortado pela rolagem da tabela)
 * e fecha com clique fora, Esc, rolagem ou ao escolher uma ação.
 */
export function MenuAcoes({ itens, rotulo = 'Mais ações' }: { itens: ItemMenu[]; rotulo?: string }) {
  const id = useId();
  const botao = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLUListElement>(null);
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useEffect(() => {
    if (!pos) return;
    menu.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const fechar = () => setPos(null);
    const fora = (e: MouseEvent) => { if (!menu.current?.contains(e.target as Node) && !botao.current?.contains(e.target as Node)) fechar(); };
    const tecla = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { fechar(); botao.current?.focus(); }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const bs = Array.from(menu.current?.querySelectorAll<HTMLButtonElement>('button') ?? []);
        const i = bs.indexOf(document.activeElement as HTMLButtonElement);
        bs[(i + (e.key === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]?.focus();
      }
    };
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', tecla);
    window.addEventListener('scroll', fechar, true);
    window.addEventListener('resize', fechar);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', tecla);
      window.removeEventListener('scroll', fechar, true);
      window.removeEventListener('resize', fechar);
    };
  }, [pos]);

  function alternar() {
    if (pos) return setPos(null);
    const r = botao.current!.getBoundingClientRect();
    setPos({ top: r.bottom + 4, right: Math.max(8, window.innerWidth - r.right) });
  }

  return (
    <>
      <button
        ref={botao} type="button" className="btn btn-sec btn-peq btn-menu" aria-label={rotulo} title={rotulo}
        aria-haspopup="menu" aria-expanded={!!pos} aria-controls={pos ? id : undefined} onClick={alternar}
      >⋯</button>
      {pos && (
        <ul ref={menu} id={id} role="menu" className="menu-acoes" style={{ top: pos.top, right: pos.right }}>
          {itens.map((i) => (
            <li key={i.rotulo} role="none">
              <button type="button" role="menuitem" onClick={() => { setPos(null); i.aoClicar(); }}>{i.rotulo}</button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
