# Artboards (reference only)

These `.dc.html` files are the source of the validated mockups, exported from the
Session Activity Chips design canvas: https://claude.ai/artifact/Vq3u2zZ6whyGNDGdXBFj3m

They do **not** open in a plain browser. The `<script src="./support.js"></script>` line in each
file is not a missing file: the canvas editor serves `support.js` itself at runtime, along with the
templating (`{{holes}}`, `<sc-for>`, `<sc-if>`, `<x-dc>`) that the markup relies on.
Nothing in this folder is meant to run, build or be ported.

Read them as source:

- The markup gives layout, spacing, colours, typography and exact interface copy.
- The `<script type="text/x-dc" data-dc-script>` block at the end of each file holds the sample
  data and the interaction logic (chip selection, filters, mute, settings toggles).
- `canvas.json` is the board index; its coordinates only matter on the canvas.

To see the boards rendered and click through them, open the canvas link above. To get runnable
copies, use an artboard's Export menu on the canvas: the HTML export bundles `support.js` and
`vendor/react.js`, `vendor/react-dom.js`; PNG export gives screenshots you can add to this folder.
The translation from these boards to the mod is in `../DESIGN.md`.
