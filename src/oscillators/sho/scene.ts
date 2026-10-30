import { SHO_RANGES, shoEquilibrium, type ShoParams } from '../../models/sho/model';
import type { MechanicalScene } from '../../render/scene/types';
import { createSpringBlockScene, MAX_SPEED } from '../shared/springBlockScene';

export { MAX_SPEED };

/** Block side: area ∝ m, 0.34 m at m = 2 kg. */
export const blockSide = (m: number): number => 0.34 * Math.sqrt(m / 2);

export function createShoScene(): MechanicalScene<ShoParams> {
  return createSpringBlockScene<ShoParams>({
    kRange: SHO_RANGES.k,
    blockSide,
    wallHeight: 0.78,
    maxX: 1.5,
    equilibrium: shoEquilibrium,
  });
}
