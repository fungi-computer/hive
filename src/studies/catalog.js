export const STUDY_GROUPS = Object.freeze([
  {
    id: "environment",
    title: "Environment & world",
    studies: [
      {
        id: "wet-clearing",
        title: "A hole in wet ground",
        href: "/wet-clearing.html",
        scope: "Dig one actual generated voxel and advance finite groundwater seepage. Local checkpoint reopen; no server or spill claim.",
        evidence: "Live local world",
      },
      {
        id: "brewhouse-air",
        title: "Warm air in the brewhouse",
        href: "/brewhouse-air.html",
        scope:
          "Light one stocked hearth and compare measured air downstairs and upstairs in an authored two-storey room. Browser-local saved state; not the complete game-world air join.",
        evidence: "Live authored-room study",
      },
      {
        id: "water-lab",
        title: "Water Lab",
        href: "/soil-water-lab.html",
        scope:
          "Recorded 201-frame nonlinear soil-block playback; controls only select saved physical samples.",
        evidence: "Recorded physical experiment",
      },
      {
        id: "slosh-lab",
        title: "Water motion",
        href: "/slosh-lab.html",
        scope:
          "Recorded 2D standing-wave surface playback; it is a visual reference, not live fluid physics.",
        evidence: "Recorded native reference",
      },
      {
        id: "gas-heat-lab",
        title: "Air, heat & smoke",
        href: "/gas-heat-lab.html",
        scope:
          "Recorded 46-frame air, heat, and passive-tracer playback from a native Node solver; controls only select saved samples.",
        evidence: "Recorded native Node solver",
      },
      {
        id: "world-lab",
        title: "World Lab",
        href: "/world-lab.html",
        scope:
          "A bounded browser terrain generator with local inspection and residency measurements.",
        evidence: "Live browser study",
      },
      {
        id: "vertical-layout",
        title: "Three storeys, one support route",
        href: "/vertical-study.html",
        scope:
          "Authored layout: Ground + two upper floors; support/routes fixture, not an earned build.",
        evidence: "Interactive original-art study",
      },
    ],
  },
  {
    id: "systems",
    title: "Game systems",
    studies: [
      {
        id: "clearing-minimap",
        title: "Clearing minimap",
        href: "/clearing-minimap-study.html",
        scope:
          "A non-mutating local component study using frozen Clearing display facts.",
        evidence: "Locally served interaction",
      },
      {
        id: "mixed-shelves",
        title: "Mixed shelves",
        href: "/mixed-shelf-study.html",
        scope:
          "A bounded art comparison; it does not define shelf capacity or storage policy.",
        evidence: "Interactive art study",
      },
    ],
  },
  {
    id: "people",
    title: "People & creatures",
    studies: [
      {
        id: "people-proportion",
        title: "People & proportion",
        href: "/study#people-proportion",
        scope:
          "Original figures, visitors, and the current baked Home actor texture bank.",
        evidence: "Interactive art study",
      },
      {
        id: "devil",
        title: "The Devil and demons",
        href: "/devil-study.html",
        scope:
          "A native character and motion study; encounters and chess are not playable.",
        evidence: "Interactive art study",
      },
      {
        id: "animals",
        title: "Animals on the road",
        href: "/animal-study.html",
        scope:
          "A native animal-motion study; the pack display is not inventory.",
        evidence: "Interactive art study",
      },
    ],
  },
  {
    id: "places",
    title: "Places & atmosphere",
    studies: [
      {
        id: "brewhouse",
        title: "The Copper Familiar",
        href: "/brewhouse-study.html",
        scope:
          "A building-kit and layout study; brewing does not run on this page.",
        evidence: "Interactive art study",
      },
      {
        id: "goblin-den",
        title: "Goblin hospitality",
        href: "/goblin-den-study.html",
        scope: "A recorded concept illustration, not an in-game scene.",
        evidence: "Concept",
      },
      {
        id: "goblin-mess",
        title: "Floor details",
        href: "/goblin-mess-study.html",
        scope: "A recorded static art study of room details and variants.",
        evidence: "Static art study",
      },
      {
        id: "fire",
        title: "Fire and light",
        href: "/fire-study.html",
        scope:
          "A native fire-art study; spread, fuel, and heat remain outside it.",
        evidence: "Interactive art study",
      },
      {
        id: "foliage-wind",
        title: "Still roots, moving leaves",
        href: "/foliage-wind-study.html",
        scope:
          "A cosmetic foliage motion study; it is not weather or growth simulation.",
        evidence: "Interactive art study",
      },
    ],
  },
]);

export const STUDIES = Object.freeze(
  STUDY_GROUPS.flatMap((group) =>
    group.studies.map((study) => Object.freeze({ ...study, group })),
  ),
);

export function studyById(id) {
  const study = STUDIES.find((candidate) => candidate.id === id);
  if (!study) throw new Error(`Unknown study catalog id: ${id}`);
  return study;
}
