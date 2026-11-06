const ICONES: Record<string, string> = {
  grid: 'M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z',
  file: 'M6 2h9l5 5v15H6zM14 2v6h6',
  truck: 'M2 6h12v10H2zM14 9h4l4 4v3h-8zM6 19a2 2 0 100-4 2 2 0 000 4zM17 19a2 2 0 100-4 2 2 0 000 4z',
  box: 'M3 7l9-4 9 4v10l-9 4-9-4zM3 7l9 4 9-4M12 11v10',
  layers: 'M12 3l9 5-9 5-9-5zM3 13l9 5 9-5',
  camera: 'M3 7h4l2-3h6l2 3h4v13H3zM12 17a4 4 0 100-8 4 4 0 000 8z',
  clipboard: 'M8 4h8v3H8zM6 5H5v17h14V5h-1M9 12h6M9 16h6',
  map: 'M3 6l6-2 6 2 6-2v14l-6 2-6-2-6 2zM9 4v14M15 6v14',
  swap: 'M4 8h14l-3-3M20 16H6l3 3',
  users: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c0-4 3-6 7-6s7 2 7 6M17 5a3 3 0 010 6M19 15c2 1 3 3 3 6',
  leaf: 'M5 19C5 9 11 4 21 3c0 10-5 16-14 16M5 19l8-8',
  ruler: 'M3 16L16 3l5 5L8 21zM7 12l2 2M10 9l2 2M13 6l2 2',
  pedido: 'M6 3h12v18H6zM9 7h6M9 11h6M9 15h4',
  medida: 'M3 8h18v8H3zM7 8v3M11 8v4M15 8v3M19 8v4',
  chart: 'M4 20V4M4 20h16M8 16v-5M12 16V8M16 16v-3',
  shield: 'M12 3l8 3v6c0 5-4 8-8 9-4-1-8-4-8-9V6z',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 2v3M12 19v3M2 12h3M19 12h3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2',
  bell: 'M6 16V11a6 6 0 1112 0v5l2 2H4zM10 21h4',
  search: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5',
  inspecao: 'M11 18a7 7 0 100-14 7 7 0 000 14zM21 21l-5-5M8 11l2 2 4-4',
  menu: 'M4 6h16M4 12h16M4 18h16',
  building: 'M4 21V8l8-5 8 5v13zM9 21v-6h6v6',
  out: 'M9 4H4v16h5M16 8l4 4-4 4M20 12H9',
  chevron: 'M15 6l-6 6 6 6',
  qr: 'M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 14h2M14 18h2v2M18 18h2v2h-2zM7 7h0M17 7h0M7 17h0',
  scan: 'M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M4 12h16',
  contrato: 'M6 2h9l5 5v15H6zM14 2v6h6M9 13h6M9 17h4M9 9h2',
  fabrica: 'M3 21V10l5 3V10l5 3V10l5 3V4h3v17zM7 17h2M11 17h2M15 17h2',
  impressora: 'M7 9V3h10v6M7 17H4v-7h16v7h-3M7 14h10v7H7z',
  etiqueta: 'M3 12V4h8l10 10-8 8zM7.5 8.5h0',
  local: 'M12 21s-7-6.5-7-12a7 7 0 0114 0c0 5.5-7 12-7 12zM12 11.5a2.5 2.5 0 100-5 2.5 2.5 0 000 5z',
  copiar: 'M9 9h11v11H9zM5 15H4V4h11v1',
  'seta-direita': 'M5 12h14M13 6l6 6-6 6',
};

export type NomeIcone = keyof typeof ICONES;

export function Icone({ nome, tamanho = 20 }: { nome: NomeIcone; tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICONES[nome]} />
    </svg>
  );
}
