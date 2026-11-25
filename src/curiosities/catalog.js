import { buildAmmonite, buildAmethyst, buildPocketWatch } from './models.js';

/**
 * Contents of the cabinet. Each drawer can hold any number of items.
 *
 * Item fields:
 *   id, name, subtitle, description   text shown in the info panel
 *   build()  OR  model: 'path/to.glb'  the 3D model (a model URL wins if both are set)
 *   inspectRotation: [x, y, z]         Euler angles (radians) for the first view when inspected
 *   restRotationY                      yaw while lying in the drawer
 */
export const catalog = {
  drawers: [
    {
      label: 'Naturalia',
      items: [
        {
          id: 'ammonite',
          name: 'Ammonite',
          subtitle: 'Fossilised cephalopod · Lower Jurassic, c. 180 million years ago',
          description: [
            'Ammonites were shelled relatives of today’s squid and octopus. As the animal grew it added new, larger chambers to its coiled shell, sealing off the old ones and using them to control its buoyancy.',
            'Collectors once called these “snakestones”, believing they were coiled serpents turned to stone. Placeholder text: replace with your own research.',
          ],
          build: buildAmmonite,
          inspectRotation: [Math.PI / 2, 0, 0],
          restRotationY: 0.6,
        },
      ],
    },
    {
      label: 'Mineralia',
      items: [
        {
          id: 'amethyst',
          name: 'Amethyst Cluster',
          subtitle: 'Quartz, SiO₂ · coloured by traces of iron',
          description: [
            'Amethyst is the purple variety of quartz. Its colour comes from iron impurities in the crystal lattice that have been altered by natural radiation.',
            'The ancient Greeks believed the stone protected its owner from drunkenness: amethystos means “not intoxicated”. Placeholder text: replace with your own research.',
          ],
          build: buildAmethyst,
          inspectRotation: [0.35, 0, 0],
        },
      ],
    },
    {
      label: 'Artificialia',
      items: [
        {
          id: 'pocket-watch',
          name: 'Pocket Watch',
          subtitle: 'Gilt brass and enamel · London, late 18th century',
          description: [
            'Pocket watches were among the most complex objects an individual could own, combining hundreds of hand-finished parts in a case small enough to carry.',
            'This one still keeps time: its hands follow your own clock. Placeholder text: replace with your own research.',
          ],
          build: buildPocketWatch,
          inspectRotation: [Math.PI / 2.4, 0, 0],
          restRotationY: -0.4,
        },
      ],
    },
  ],
};
