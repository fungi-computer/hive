# Fate Chess / Chess of Death: bounded play probe

Read-only reference probe, 2026-09-07. The public primary page is [Fate
Chess by Null Tale](https://nulltale.itch.io/chess-of-death). It describes two
layers: a one-time narrative meta and a replayable self-playing chess sandbox.
It names three asymmetric roles—Card offers three non-random choices, Dice
forces a die-selected move, and Direct permits any available chess move—and
players including Living One, King, Pretender, Fool, and Mad. It labels the
HTML5 game as mouse input, Unity-made, with an approximately half-hour session.

## Actual embedded run

The mandated Playwright run was wrapped by
`/home/levi/src/Botanical-next/.agents/skills/orchestrate-multi-lane-work/scripts/run-proof.sh`,
using the pinned headless shell and browser library path. It opened a fresh
context, clicked the page's `Run this Game`, and observed a live Unity WebGL
iframe at:

`https://html-classic.itch.zone/html/11639030/index.html?v=1782542449`

The Unity console reported engine `2020.3.48f1`, WebGL 2.0 initialization and
successful loading of `BuildWeb.data`. A center click on the game canvas caused
the opening text to advance and produced the visible “Click to continue” state;
the saved follow-up frame then showed the narrative choice “Worry” / “Fall into
eternal Sleep.” This is a real input response from the embed.

Screenshots and raw observations are retained here:

- [01-page.png](./01-page.png) — public page before run
- [03-game.png](./03-game.png) — live embedded opening scene
- [04-after-input.png](./04-after-input.png) — opening text advanced after click
- [05-after-narrative-steps.png](./05-after-narrative-steps.png) — narrative choice
- [06-after-choice.png](./06-after-choice.png) — choice remained visible after the
  bounded coordinate attempt; it was not counted as selected
- [observations.json](./observations.json) — frame URLs, console events and canvas
  dimensions (`960 × 540`)

## What this establishes

The run confirms a functioning public HTML5 embed and a narrative interaction.
It does not establish board dimensions, starting-piece arrangement, a chess move,
or an opponent response: the bounded pass did not successfully select the
narrative option or reach the board. The page's promotional images are not
treated as gameplay evidence. The page itself calls the narrative one-time and
the chess layer a sandbox, so narrative riddles and repeatable asymmetric board
play should remain separate concepts in our reference notes.

No account, purchase, comment, Hive source, tracked documentation, or gameplay
implementation was changed.
