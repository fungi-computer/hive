export const STUDY_GROUPS = Object.freeze([
  {
    id: "environment",
    title: "Environment & world",
    studies: [
      {
        id: "water-lab",
        title: "Water Lab",
        href: null,
        scope:
          "Recorded native fluid evidence is ready; its study page has not joined yet.",
        evidence: "Recorded native experiment",
      },
      {
        id: "gas-heat-lab",
        title: "Air, heat & smoke",
        href: null,
        scope:
          "Recorded solver qualification is ready; its study page has not joined yet.",
        evidence: "Recorded Node qualification",
      },
      {
        id: "world-lab",
        title: "World Lab",
        href: "/world-lab.html",
        scope:
          "A bounded browser terrain generator with local inspection and residency measurements.",
        evidence: "Live browser study",
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
