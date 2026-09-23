# Authored magical palette, lighting, grass, and leaves

Status: future independent visual studies after the home foundation.

Run two independent small studies. The wind study adds original animated grass clumps and separate leaf canopies with staggered phases. The night study replaces the simple dusk presentation with an authored palette/LUT treatment and a small light field: daylight, violet-blue night, a warm hearth, and an eerie lantern. Keep both in the existing Three-to-fixed-bake-to-Pixi path, avoid a per-frame pixel recolor loop, and keep wall/floor occlusion and gameplay vision separate. The night study uses [NullTale/LutLight2D at fc346b267069ff7557d8bf0dd19f411beab064ba](https://github.com/NullTale/LutLight2D/tree/fc346b267069ff7557d8bf0dd19f411beab064ba); it does not adopt its Unity package.

First useful proof for wind: compare a small clearing patch with still trunks, animated grass, and staggered leaf canopies at intended scale. First useful proof for night: compare the same clearing, Rowan, and Bramble in daylight, violet-blue night, and local magic light while labels and controls remain readable. Neither study gates the other or adds a scheduler.
