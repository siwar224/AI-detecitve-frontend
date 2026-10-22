// lib/gsap.ts  ("use client" consumers only)
import gsap from "gsap";

/*
 * The shared core: the gsap instance and the house defaults, and no plugins.
 *
 * This file is a `registry:lib` item, so `shadcn add` copies it into the
 * consumer's project alongside every component that ships it.
 * `gsap.registerPlugin()` is a side effect on an imported module, so any plugin
 * registered here is bundled into their app whether or not the component they
 * installed ever calls it, and tree-shaking cannot remove it.
 *
 * It previously registered ScrollTrigger, SplitText and ScrambleTextPlugin
 * together, about 61KB minified, for all 41 items that ship it. Measured
 * against actual use: 33 need ScrollTrigger, 5 need SplitText, 1 needs
 * ScrambleText, and 8 need none of them. Registering the rest of the suite the
 * same way (D24) would have put roughly 200KB of plugin code in every GSAP
 * component. See #353.
 *
 * So each plugin now has its own sibling module that imports this one and
 * registers just itself. Defaults still live in exactly one place, because
 * every one of those modules routes through this file.
 */

/*
 * ---------------------------------------------------------------------------
 * There is a house ease here and deliberately no house duration (#484)
 * ---------------------------------------------------------------------------
 *
 * This line used to read `gsap.defaults({ ease: "expo.out", duration: 0.6 })`,
 * and the duration half of it was a real animation beat rather than engine
 * configuration: fourteen registry components animated entrances that named no
 * duration of their own, so 600ms of visible movement in each of them came
 * from this file and from nowhere else. It was also the least visible beat in
 * the library. The ratchet in `tests/motion-duration-tokens.spec.ts` scans for
 * a numeric `duration:`, and a component that writes no `duration:` at all
 * gives that scan nothing to find.
 *
 * It could not be made token-backed *here*, and the reason is worth recording
 * because the obvious fix looks right and is not. `useDurationTokens` needs a
 * scope element and a mount, and a module side effect has neither. Reading
 * `document.documentElement` instead would honour a `:root` override and
 * silently ignore one written on any other ancestor, which is the half-fix
 * docs/13 Tier 3 rule 2 rules out. The remaining option is a function-based
 * value, which GSAP resolves per target at tween creation and which would
 * therefore read the token off the animated element itself. That was built and
 * measured, and it changes the *shape* of every tween that inherits it:
 * `_isFuncOrString(duration)` sends the tween down the nested-timeline path,
 * where the child holding the property tweens has a parent whose
 * `data === "nested"` and so never immediate-renders. A `gsap.from` or
 * `gsap.fromTo` built that way applies its from-state and then cannot restore
 * it, so `matchMedia.revert()` and `useGSAP` cleanup leave that from-state on
 * screen. `hero-split-media`'s parallax layer was measured stuck at
 * `translateY(-24px)` after its own playground reverted it. One shared file,
 * forty-four components, and a defect none of their specs would have named.
 *
 * So the beat moved to where a beat belongs: each of those fourteen components
 * now reads `--dur-3` through `useDurationTokens` against its own root, which
 * is scoped, retunable from any ancestor, and visible to the scan. Nothing is
 * left here to inherit, which is why no duration is set. GSAP's own default of
 * 0.5s applies to a tween that names none, and after that migration the only
 * tweens in this library that name none are ScrollTrigger-scrubbed ones, whose
 * duration is a proportion of a scroll range rather than a length of time and
 * has no observable value of its own.
 *
 * The ease stays. It is a curve, not a beat: `--ease-out-expo` is a fixed
 * cubic-bezier in the token contract rather than something an install retunes
 * for feel, and mirroring it here costs a consumer nothing.
 */
gsap.defaults({ ease: "expo.out" }); // mirrors --ease-out-expo

export { gsap };
