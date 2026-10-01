# Chemistry Labs VR

A hands-on chemistry lab for **Meta Quest 3**. You can use the Touch controllers or hand tracking. You build molecules atom by atom, and a synthesizer machine turns them into real substances that pour into your glassware. Then you can mix, heat, measure, pour and break things.

It is a **WebXR** app, so there is nothing to compile for Android. The Quest Browser runs it directly, and you can also install it on the headset as an app (see [Install it on your Quest](#3-optional-install-it-as-an-app-on-the-quest)).

---

## Play it on your Meta Quest 3

### 1. Publish it (one time)

The repository includes a GitHub Actions workflow (`.github/workflows/deploy.yml`) that builds the game and publishes it to **GitHub Pages** each time `main` changes.

1. Merge this branch into `main`.
2. On GitHub, open **Settings → Pages**. Under **Build and deployment → Source**, choose **GitHub Actions**.
3. Open the **Actions** tab and wait for **Deploy to GitHub Pages** to show a green check. You can also run it by hand with **Run workflow**.
4. The game is now live at **`https://rg2kyt.github.io/Chemistry-Labs-VR/`**.

### 2. Launch it on the headset

1. Put on the Quest 3 and open **Browser**.
2. Go to `https://rg2kyt.github.io/Chemistry-Labs-VR/`. Bookmark it so you can open it with one click next time.
3. Pick a mode:
   - **Virtual Lab**: a complete virtual chemistry lab in VR.
   - **Your Room**: mixed reality (passthrough). The screens and the machine appear in your real room, and objects land on your real floor and tables.
   - **Scanned Room**: a stylised digital copy of your own room, built from the Quest room scan.
4. Allow the permissions the browser asks for: hand tracking, and *spatial data* for the room modes.

> For the room modes, scan your room first: **Settings → Physical Space → Space Setup**. Without a scan the game still works, but it only knows where your floor is.

### 3. (Optional) Install it as an app on the Quest

There are two ways to get it into your App Library:

- **Install from the browser.** If the Quest Browser shows an *Install* / *Add to library* option for the page, use it. The game ships a web-app manifest and an offline cache (service worker), so it runs like an app.
- **Build an APK and sideload it.** Go to [pwabuilder.com](https://www.pwabuilder.com/), enter the GitHub Pages address, choose **Meta Quest** as the package type and download the APK. Then turn on developer mode on the headset (Meta Horizon phone app → Devices → Developer Mode) and install the APK with **Meta Quest Developer Hub** (drag the APK onto the device) or with `adb install chemistry-labs-vr.apk`. The game then appears under **Apps → Unknown Sources**. You can do the same with Google's [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap) CLI using its Meta Quest option. These packaging tools change over time, so follow their current instructions.

### Run it from your own computer (development)

```bash
npm install
npm run dev:quest        # https dev server; WebXR needs a secure (https) page
```

Open the `https://<your-computer-ip>:5173/` address it prints in the Quest Browser. The headset and the computer must be on the same Wi-Fi. Accept the self-signed certificate warning. With a USB cable you can also run `adb reverse tcp:5173 tcp:5173` and open `https://localhost:5173/`.

`npm run build` writes the static site to `dist/`, which any https web host can serve.

---

## What you can do

### The lab layout
- **Right:** the full **periodic table** with all 118 elements. Tap an element to see its details: mass, electron configuration, electronegativity, melting and boiling points, density, valences, and a Bohr shell diagram when the screen is in portrait. Tap **+ atom** (or tap a selected element a second time) to spawn an atom. Hydrogen, nitrogen, oxygen and the halogens can also spawn as their natural diatomic molecules (H₂, O₂, N₂…).
- **Left:** the **Molecular Synthesizer**. Its top part is the reactor, where molecules go in. Its bottom part is the bay, where you dock a container and the product comes out.
- **Middle:** your workbench (in the Virtual Lab), with the **equipment list** floating beyond it: 27 items, including beakers, flasks, test tubes, a graduated cylinder, petri dish, watch glass, evaporating dish, crucible, mortar, reagent bottle, funnel, Bunsen burner, tripod and gauze, hot plate, thermometer, pH meter, digital balance, dropper, wash bottle, stirring rod, spatula, tongs and a test-tube rack.

### Building molecules
- Atoms show their **open bonds** as small glowing dots. Hold an atom or molecule and bring it close to another atom that has a free bond: a dashed preview appears, and the two **snap together**. A red line means one of the atoms has no free bonds.
- To **break a bond**, hold two atoms of the same molecule, one in each hand, and pull them apart.
- Molecules take their **real shape** (VSEPR): water is bent at 104.5°, ammonia is a pyramid, methane is a tetrahedron, CO₂ is linear and benzene is a flat ring.
- Bond orders are worked out automatically: O=O, N≡N, O=C=O, H–C≡N, ethene's C=C, Kekulé benzene, hypervalent sulfur in H₂SO₄ and so on.
- The label above each molecule shows its formula and name, or how many bonds are still open. The game recognises more than 120 compounds and tells isomers apart, for example ethanol and dimethyl ether.

**Example: making water.** Spawn **H₂** and an **O** atom. Grab both hydrogens and pull them apart. Bring each hydrogen to the oxygen to make H₂O. Put a beaker in the synthesizer's bay and drop the molecule into the reactor. The water runs down the glass tube and pours from the nozzle into your beaker.

### The synthesizer
- It scans the molecule. Unstable fragments (such as a lone O atom or CH₃) are **rejected and spat back out**, with an explanation.
- Choose the amount on its touch screen: 25, 50, 100 or 250 mL (grams for solids). **Make again** repeats the last product.
- Products look like the real thing. Water is clear. Bromine is a dark red-brown liquid. Mercury is a liquid metal. Gold, copper and sodium are shiny metals. Sulfur is a yellow powder and table salt forms cubic crystals. Copper sulfate is off-white and turns blue in water. Chlorine is a yellow-green gas and NO₂ is a brown gas.

### Physical form ⇄ atoms
- **Atoms → substance:** drop a molecule into the reactor on top of the synthesizer and the real substance pours into the container docked below.
- **Substance → atoms:** set a container with something in it **on top of the reactor**. The machine sucks the substance out, breaks it down and the **atoms come out of the bay below** — e.g. a beaker of water gives you an H₂O molecule, salt water gives NaCl + H₂O (up to three kinds of molecule at once).
- **Labels:** atoms and molecules show their **chemical formula** above them (H₂, H₂O, NaCl …); containers show the **name of the physical form** inside them (Water, Salt water, Bromine …). Hold or point at a container to also see amount, temperature and pH.
- **Combining physical forms:** hold a container and touch its rim against another container. A green ring appears and, after a moment, everything flows into the other container and they react — elements combine like they do in real chemistry: hydrogen + oxygen → water, hydrogen + chlorine → hydrochloric acid, nitrogen + hydrogen → ammonia, sodium + chlorine → salt, magnesium + oxygen → magnesium oxide, and so on. (Gas amounts are converted at game scale so the product is visible.)

### Undo
Every action can be undone with the **↶ Undo** button on the periodic table and on the equipment list (or Ctrl+Z on a computer): adding atoms or equipment, making or breaking bonds, synthesizing, turning substances into atoms, combining, pouring, broken glass, clearing atoms and even a reset. It keeps the last 30 steps.

### Experiments
- **Pouring:** tilt a container and the liquid pours from its lowest point on the rim as a real arcing stream. The liquid surface stays level as you tilt.
- **Mixing chemistry**, all with visual effects:
  - neutralisation, with live pH
  - acids with carbonates, which fizz (baking soda and vinegar overflow with foam)
  - metals in acid
  - **sodium and potassium in water** (alkali metals; caesium explodes)
  - precipitation: AgCl, PbI₂ "golden rain", Cu(OH)₂, BaSO₄
  - an iron nail in copper sulfate, which plates out copper
  - limewater turning milky
  - **elephant toothpaste** (H₂O₂ with KI or MnO₂)
  - sugar and sulfuric acid making a carbon snake
  - potassium permanganate and glycerol catching fire on their own
  - flammable solvents igniting over a flame
  - the hydrogen pop test
  - **flame tests**: hold a scoop of salt in the Bunsen flame (Na yellow, K lilac, Li red, Cu green…)
  - dissolving solids, which is faster when you stir
- **Heating:** use the Bunsen burner (press its red valve) with the tripod, or the hot plate. Liquids boil, and boiling salt water away leaves salt crystals behind.
- **Measuring:** the thermometer, the pH meter (dip its probe), the balance (with tare) and graduated glassware.
- **Acid:** pour an acid onto something and it dissolves with a sizzling green edge, then **re-forms 3–10 seconds later** exactly as it was. Hydrofluoric acid slowly etches glass, so keep it in the plastic beaker.
- **Physics:** everything can be picked up, thrown and stacked. Glassware that hits the floor too hard **shatters and disappears**. The tables and the machine are anchored.

### The floating screens ("lists")
- Each screen has **handle bars on its top and bottom**. Grab one bar to carry the screen. Grab both to turn it in any direction or to resize it.
- The screens levitate, with a gentle bob. They **have no physics**: if you try to throw one, it stops dead the moment you let go.
- Turn a screen **90°** and it re-lays itself out in **portrait**, like a phone. Turn it back and it becomes a landscape monitor again. If you turn it **upside down**, it flips itself back. When you let go it always turns its front towards you.

### Reset
On the synthesizer, hold the big red **RESET LAB** button for 2 seconds. The hold time stops it from being pressed by accident. The reset removes everything you made and puts the lab back the way it was at the start.

---

## Controls

| Action | Touch controllers | Hand tracking |
|---|---|---|
| Grab / hold | Grip button (or trigger) near an object | Pinch, or make a fist |
| Pull a far object to you | Point at it and grab | Point at it and pinch |
| Tap a screen or button | Touch it with the controller tip, or point and pull the trigger | Touch it with your index finger, or point and pinch |
| Use a held tool (squirt, dropper, drop powder) | Trigger while holding with the grip | Poke the tool's button with your other hand |
| Move / snap-turn (Virtual Lab) | Left stick / right stick | Walk around |

**On a computer** (for exploring and testing): left-drag grabs things and taps screens. The mouse wheel changes how far away a held object is. **Q/E** and **R/F** tilt the held object, so you can pour. **Shift + drag** on an atom pulls it out of its molecule. **Space** uses a tool. Right-drag or the arrow keys look around, and **WASD** walks.

---

## Development

```
src/
  app/App.js            renderer, XR sessions, modes, layout, reset, main loop
  chem/                 elements (118), bonding rules, SMILES parser, substance & compound database,
                        molecule entities + bond formation/breaking, mixtures and reactions
  lab/                  synthesizer machine, glassware & liquids, pouring streams, tools, effects,
                        acid dissolving, the virtual lab room
  ui/                   floating panels (periodic table, equipment), machine screen, toasts
  input/, interaction/  controllers, tracked hands and mouse; grabbing, poking and laser pointers
  ar/RoomScan.js        Quest room scan (plane + mesh detection) → physics and the digital room
  audio/Sound.js        procedurally synthesised, spatial sound effects
```

- `npm test` runs the chemistry unit tests, the headless-browser scenario tests and the emulated-Quest-3 XR tests. The last two run against a production build served on port 4173: `npm run build && npx vite preview --port 4173`.
- Adding `?emulate=1` to the URL loads Meta's Immersive Web Emulation Runtime, which emulates a Quest 3 on a desktop browser. Use `?emulate=1&room=living_room` to add a synthetic room for the mixed-reality modes.

Built with [three.js](https://threejs.org/) and the [Rapier](https://rapier.rs/) physics engine.
