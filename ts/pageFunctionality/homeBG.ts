import { HTMLNoiseCanvasElement } from "../general/noiseCanvasComponenets.js";

//#region Constants
const HOME_BG_ID = "home-bg";
const HOME_BG_CHILD_CLASS = "home-noise-bg";

const DEFAULT_OPACITY = 0.2;
//#endregion

//#region Main Code
export function start(): () => void {
  //#region Document Query
  const HOME_BG_CONTAINER = document.getElementById(HOME_BG_ID);
  if (!HOME_BG_CONTAINER) {
    return () => {};
  }

  const NOISE_CANVASES = Array.from(
    HOME_BG_CONTAINER.getElementsByClassName(HOME_BG_CHILD_CLASS),
  ) as HTMLNoiseCanvasElement[];
  //#endregion

  //#region Public Variables
  let rafId = 0;
  let timeoutId: number | undefined;
  let stopped = false;
  let currentNoise: HTMLNoiseCanvasElement | undefined;
  let lastPickedIndex: number = -1;
  //#endregion

  //#region Method Definitions
  function pickRandomNoConsecutive(): HTMLNoiseCanvasElement {
    if (NOISE_CANVASES.length <= 1) return NOISE_CANVASES[0];

    let newIndex: number;
    do {
      newIndex = Math.floor(Math.random() * NOISE_CANVASES.length);
    } while (newIndex === lastPickedIndex);

    lastPickedIndex = newIndex;
    return NOISE_CANVASES[newIndex];
  }

  const cleanup = (): void => {
    stopped = true;
    if (rafId) {
      cancelAnimationFrame(rafId);
    }
    if (timeoutId !== undefined) {
      window.clearTimeout(timeoutId);
    }
    if (currentNoise) {
      currentNoise.disableUpdates = true;
    }
  };

  const startRandomNoise = (): void => {
    if (stopped) return;

    currentNoise = pickRandomNoConsecutive();
    if (!currentNoise) return;

    currentNoise.progressRatio = 0.0;
    currentNoise.disableUpdates = false;
    currentNoise.style.opacity = DEFAULT_OPACITY.toString();

    const progressNoiseFrame = (): void => {
      if (stopped || !currentNoise) return;

      currentNoise.progressRatio += 0.0025;

      if (currentNoise.progressRatio >= 1.0) {
        timeoutId = window.setTimeout(() => {
          if (!stopped) {
            const animation = currentNoise!.animate(
              [{ opacity: DEFAULT_OPACITY }, { opacity: 0.0 }],
              { duration: 1000, fill: "none" },
            );

            animation.finished.then(() => {
              if (stopped) return;
              currentNoise!.style.opacity = "0.0";
              timeoutId = window.setTimeout(startRandomNoise, 500);
            });
          }
        }, 1000);

        return;
      }

      rafId = requestAnimationFrame(progressNoiseFrame);
    };

    rafId = requestAnimationFrame(progressNoiseFrame);
  };
  //#endregion

  startRandomNoise();
  return cleanup;
}
//#endregion
