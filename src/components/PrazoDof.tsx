import { NIVEL_PRAZO } from '../dominio/rotulos';
import type { NivelPrazo } from '../types/models';
import { data } from '../utils/format';
import { BadgeDe } from './Badge';

/** Prazo de declaração da DOF com o nível (vencido, crítico, atenção) em texto e cor; "no prazo" só mostra a data. */
export function PrazoDof({ prazo, nivel, declarado }: { prazo: string; nivel: NivelPrazo; declarado?: boolean }) {
  return <span className="prazo-dof">{data(prazo)}{!declarado && nivel !== 'ok' && <> <BadgeDe mapa={NIVEL_PRAZO} valor={nivel} /></>}</span>;
}
