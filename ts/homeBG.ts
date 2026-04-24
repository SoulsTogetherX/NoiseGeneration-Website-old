import { HTMLNoiseCanvasElement } from "./noiseCanvasComponenets.js"

//#region Constants
const HOME_BG_ID = "home-bg"
const HOME_BG_CHILD_CLASS = "home-noise-bg"

const DEFAULT_OPACITY = 0.2
//#endregion

//#region Quering
const HOME_BG_CONTAINER = document.getElementById(HOME_BG_ID)
const NOISE_CANVAS_BGS: HTMLNoiseCanvasElement[] =
  (HOME_BG_CONTAINER?.getElementsByClassName(HOME_BG_CHILD_CLASS) ??
    []) as HTMLNoiseCanvasElement[]
//#endregion

//#region Random Pick
let pickRandomNoConsecutiveLastIndex: number = -1
export function pickRandomNoConsecutive(): HTMLNoiseCanvasElement {
  if (NOISE_CANVAS_BGS.length <= 1) return NOISE_CANVAS_BGS[0]

  let newIndex: number
  do {
    // Standard Math.random calculation for array index
    newIndex = Math.floor(Math.random() * NOISE_CANVAS_BGS.length)
  } while (newIndex === pickRandomNoConsecutiveLastIndex)

  pickRandomNoConsecutiveLastIndex = newIndex
  return NOISE_CANVAS_BGS[newIndex]
}
//#endregion

//#region Main Animation
function startRandomNoise(): void {
  const randomNoise = pickRandomNoConsecutive()

  randomNoise.progressRatio = 0.0
  randomNoise.disableUpdates = false
  randomNoise.style.opacity = DEFAULT_OPACITY.toString()

  const progressNoiseFrame = () => {
    randomNoise.progressRatio += 0.0025

    if (randomNoise.progressRatio >= 1.0) {
      setTimeout(opacityNoiseFrame, 1000)
      return
    }
    requestAnimationFrame(progressNoiseFrame)
  }
  const opacityNoiseFrame = async () => {
    const animation = randomNoise.animate(
      [{ opacity: DEFAULT_OPACITY }, { opacity: 0.0 }],
      {
        duration: 1000,
        fill: "none",
      },
    )
    await animation.finished

    randomNoise.style.opacity = "0.0"
    setTimeout(startRandomNoise, 500)
  }

  requestAnimationFrame(progressNoiseFrame)
}

startRandomNoise()
//#endregion
