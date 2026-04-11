//#region Helper Methods
const clamp = (num: number, min: number, max: number) =>
  Math.min(Math.max(num, min), max)
//#endregion

//#region Noise Canvases
//#region Abstract
class InputContainer {
  private inputElement: HTMLInputElement
  private onUpdateMethod: () => void

  constructor(inputElement: HTMLInputElement, onUpdate: () => void) {
    this.inputElement = inputElement
    this.onUpdateMethod = onUpdate

    this.inputElement.addEventListener("input", this.onUpdateMethod)
  }

  public disconnectUpdateMethod(): void {
    this.inputElement.removeEventListener("input", this.onUpdateMethod)
  }
  public getValue(): string {
    return this.inputElement.value
  }
}

type NoiseInputType = InputContainer | string | undefined

abstract class NoiseCanvas extends HTMLElement {
  private static readonly DEFAULT_RESOLUTION = "50"
  private static readonly DEFAULT_PROGRESS = 1.0

  protected readonly shadow: ShadowRoot
  protected readonly canvas: HTMLCanvasElement
  protected readonly ctx: CanvasRenderingContext2D

  private buffer: ImageData
  private progressMemory: Uint8Array | Uint16Array | Uint32Array | undefined
  private writeIdx: number = 0

  private allowCanvasDisplay: boolean = true

  private frame: number = 0

  private static readonly resolutionNames = [
    "resolution",
    "resolutionX",
    "resolutionY",
  ]
  private static readonly progressNames = ["progress"]
  private valueInputs: Record<string, NoiseInputType> = {}

  private readonly valueUpdaterMethod: () => void =
    this.scheduleBufferRefresh.bind(this)
  private readonly resolutionUpdaterMethod: () => void =
    this.resizeCanvas.bind(this)
  private readonly progressUpdaterMethod: () => void = this.forceDraw.bind(this)

  constructor() {
    super()

    this.shadow = this.attachShadow({ mode: "closed" })
    this.shadow.innerHTML = `
      <style>
        canvas {
          width: 100%;
          height: 100%;
          object-fit: contain;
          pointer-events: none;
          user-select: none;
          image-rendering: pixelated;
        }
      </style>
      <canvas></canvas>
    `

    this.updateAllowCanvasDisplay()

    this.canvas = this.shadow.querySelector("canvas")!
    const ctx = this.canvas.getContext("2d")
    if (!ctx) throw new Error("2D canvas context not available")

    ctx.imageSmoothingEnabled = false
    this.ctx = ctx
    this.buffer = new ImageData(1, 1)
  }

  // Abstract
  protected abstract setBuffer(buffer: ImageData): void

  // Dom Enter/Exit
  connectedCallback(): void {
    this.connectAll()
    this.resizeCanvas()
    this.refreshBuffer()
  }
  disconnectedCallback(): void {
    cancelAnimationFrame(this.frame)

    this.disconnectAll()
  }

  // Attribute Changes
  static get observedAttributes() {
    return [
      "inputsRoot",
      "resolution",
      "resolutionX",
      "resolutionY",
      "progress",
      "draw",
      "useProgress",
    ]
  }

  attributeChangedCallback(
    name: string,
    oldValue: string,
    newValue: string,
  ): void {
    if (oldValue !== newValue) {
      if (
        name === "resolution" ||
        name === "resolutionX" ||
        name === "resolutionY"
      ) {
        this.connectResolution(undefined, newValue)
        this.resizeCanvas()
      } else if (name === "draw") {
        this.updateAllowCanvasDisplay()
        this.forceDraw()
      } else if (name === "useProgress") {
        this.progressMemory = this.createProgressMemory(
          this.buffer.width * this.buffer.height,
        )
        this.forceDraw()
      } else if (name === "progress") {
        this.connectProgress(undefined, newValue)
        this.forceDraw()
      } else if (this.getValueNames().includes(name)) {
        this.connectValues(undefined, newValue)
        this.scheduleBufferRefresh()
      }
    }
  }

  // Canvas
  private resizeCanvas(): void {
    const canvas = this.canvas
    const [resolution, resolutionX, resolutionY] = NoiseCanvas.resolutionNames

    const baseResolution = this.getValue(resolution)
    const canvasX = Number(
      this.getValue(resolutionX) ??
        baseResolution ??
        NoiseCanvas.DEFAULT_RESOLUTION,
    )
    const canvasY = Number(
      this.getValue(resolutionY) ??
        baseResolution ??
        NoiseCanvas.DEFAULT_RESOLUTION,
    )

    canvas.width = canvasX
    canvas.height = canvasY
    this.buffer = new ImageData(canvasX, canvasY)
    this.progressMemory = this.createProgressMemory(canvasX * canvasY)

    this.scheduleBufferRefresh()
  }

  // Draw Buffer
  private scheduleBufferRefresh(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.refreshBuffer())
  }

  private refreshBuffer(): void {
    this.writeIdx = 0

    this.setBuffer(this.buffer)
    this.forceDraw()
  }
  private forceDraw(): void {
    if (this.drawCheck(this.buffer, this.getProgress())) {
      this.drawBuffer(this.buffer, this.getProgress())
    }
  }
  private drawBuffer(buffer: ImageData, progress: number): void {
    const memory = this.progressMemory!
    const cutoff: number = Math.floor(memory.length * progress)
    const copyArr = new Uint8ClampedArray(memory.length << 2)
    const dataArr = buffer.data

    let i = 0
    for (; i < cutoff; i++) {
      this.copyPixel(copyArr, dataArr, memory[i])
    }
    for (; i < memory.length; i++) {
      this.clearPixel(copyArr, memory[i])
    }

    this.ctx.putImageData(
      new ImageData(copyArr, buffer.width, buffer.height),
      0,
      0,
    )
  }

  // Draw Frame
  private drawCheck(buffer: ImageData, progress: number): boolean {
    if (!this.allowCanvasDisplay) {
      this.ctx.clearRect(0, 0, buffer.width, buffer.height)
      return false
    }
    if (this.progressMemory === undefined || progress >= 1.0) {
      this.ctx.putImageData(buffer, 0, 0)
      return false
    }
    if (progress <= 0.0) {
      this.ctx.clearRect(0, 0, buffer.width, buffer.height)
      return false
    }
    return true
  }

  // ValueTypes
  private getInputsRoot(): Document | Element {
    const baseRoot = this.getAttribute("inputs")
    return baseRoot === null
      ? document
      : (document.querySelector(baseRoot) ?? document)
  }
  private getSelectors(): Array<HTMLInputElement> {
    return Array.from(
      this.getInputsRoot().querySelectorAll<HTMLInputElement>("input[name]"),
    )
  }

  //    Value
  protected abstract getValueNames(): Array<string>
  private getValueFromType(val: NoiseInputType): string | undefined {
    if (val === undefined) {
      return undefined
    }
    if (typeof val === "string") {
      return val
    }
    return val.getValue()
  }
  public getValue(name: string): string | undefined {
    return this.getValueFromType(this.valueInputs[name])
  }

  //    Connect
  private connectName(
    name: string,
    onUpdate: () => void,
    fallback: Array<HTMLInputElement>,
  ): void {
    if (name in this.valueInputs) {
      this.disconnectName(name)
    }

    const attribute = this.getAttribute(name)
    if (attribute !== null) {
      if (!isNaN(Number(attribute)) && attribute.trim() !== "") {
        this.valueInputs[name] = attribute
        return
      }

      const sliderId = document.getElementById(attribute)
      if (sliderId !== null) {
        this.valueInputs[name] = new InputContainer(
          sliderId as HTMLInputElement,
          onUpdate,
        )
        return
      }
    }

    const slider: HTMLInputElement | undefined = fallback.find(
      (val: HTMLInputElement) => val.name === name,
    )
    if (slider !== undefined) {
      this.valueInputs[name] = new InputContainer(slider, onUpdate)
      return
    }
  }

  private connectValues(
    selectors: Array<HTMLInputElement> | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    if (selectors === undefined) {
      selectors = this.getSelectors()
    }

    if (name !== undefined) {
      this.connectName(name, this.valueUpdaterMethod, selectors)
      return
    }
    this.getValueNames().map((val) =>
      this.connectName(val, this.valueUpdaterMethod, selectors),
    )
  }
  private connectResolution(
    selectors: Array<HTMLInputElement> | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    if (selectors === undefined) {
      selectors = this.getSelectors()
    }

    if (name !== undefined) {
      this.connectName(name, this.resolutionUpdaterMethod, selectors)
      return
    }
    NoiseCanvas.resolutionNames.map((val) =>
      this.connectName(val, this.resolutionUpdaterMethod, selectors),
    )
  }
  private connectProgress(
    selectors: Array<HTMLInputElement> | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    if (selectors === undefined) {
      selectors = this.getSelectors()
    }

    if (name !== undefined) {
      this.connectName(name, this.progressUpdaterMethod, selectors)
      return
    }
    NoiseCanvas.progressNames.map((val) =>
      this.connectName(val, this.progressUpdaterMethod, selectors),
    )
  }

  private connectAll(): void {
    const selectors = this.getSelectors()
    this.connectValues(selectors)
    this.connectResolution(selectors)
    this.connectProgress(selectors)
  }

  //    Disconnect
  private disconnectName(name: string): void {
    const slider = this.valueInputs[name]

    if (slider instanceof InputContainer) {
      slider.disconnectUpdateMethod()
    }
    delete this.valueInputs[name]
  }
  private disconnectAll(): void {
    Object.values(this.valueInputs).forEach((slider: NoiseInputType) => {
      if (slider instanceof InputContainer) {
        slider.disconnectUpdateMethod()
      }
    })
    this.valueInputs = {}
  }

  // Helper
  //    Progress
  public getProgress(): number {
    return (
      Number(this.getValue(NoiseCanvas.progressNames[0])) ??
      NoiseCanvas.DEFAULT_PROGRESS
    )
  }
  private updateAllowCanvasDisplay(): void {
    this.allowCanvasDisplay = !(this.getAttribute("draw") === "false")
  }

  //    Create Progress Memory
  private createProgressMemory(
    countmaxIndex: number,
  ): Uint8Array | Uint16Array | Uint32Array | undefined {
    if (this.getAttribute("useProgress") !== "true") {
      return undefined
    }

    if (countmaxIndex <= 0xff) return new Uint8Array(countmaxIndex)
    if (countmaxIndex <= 0xffff) return new Uint16Array(countmaxIndex)
    if (countmaxIndex <= 0xffffffff) return new Uint32Array(countmaxIndex)
    return undefined
  }

  //    Index
  protected getIndex(r: number, c: number): number {
    return r * this.buffer.width + c
  }

  //    Canvas
  protected fill(v: number, a: number): void {
    const width = this.canvas.width
    const height = this.canvas.height

    this.ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${a.toFixed(3)})`
    this.ctx.fillRect(0, 0, width, height)
  }

  //    Pixel
  //        Returns [Value, Alpha]
  protected getPixel(idx: number): number[] {
    idx = idx << 2
    return [this.buffer.data[idx], this.buffer.data[idx + 3]]
  }
  //        Returns Value
  protected getPixelValue(idx: number): number {
    return this.buffer.data[idx << 2]
  }
  //        Returns Alpha
  protected getPixelAlpha(idx: number): number {
    return this.buffer.data[(idx << 2) + 3]
  }

  protected setPixel(idx: number, v: number): void {
    const buffer = this.buffer

    if (this.progressMemory !== undefined) {
      this.progressMemory[this.writeIdx] = idx
      this.writeIdx += 1
    }

    idx = idx << 2
    buffer.data[idx] = v
    buffer.data[idx + 1] = v
    buffer.data[idx + 2] = v
    buffer.data[idx + 3] = 255
  }
  protected copyPixel(
    newBuffer: Uint8ClampedArray,
    oldBuffer: ImageDataArray,
    idx: number,
  ): void {
    idx = idx << 2

    newBuffer[idx] = oldBuffer[idx]
    newBuffer[idx + 1] = oldBuffer[idx + 1]
    newBuffer[idx + 2] = oldBuffer[idx + 2]
    newBuffer[idx + 3] = oldBuffer[idx + 3]
  }
  protected clearPixel(newBuffer: Uint8ClampedArray, idx: number): void {
    idx = idx << 2

    newBuffer[idx] = 0
    newBuffer[idx + 1] = 0
    newBuffer[idx + 2] = 0
    newBuffer[idx + 3] = 0
  }

  //    Random Help
  protected random8bit(): number {
    return (Math.random() * 256) | 0
  }
}
//#endregion

//#region White Noise
customElements.define(
  "white-noise",
  class WhiteNoiseCanvas extends NoiseCanvas {
    protected getValueNames(): Array<string> {
      return []
    }

    protected setBuffer(buffer: ImageData): void {
      const [width, height] = [buffer.width, buffer.height]
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          this.setPixel(this.getIndex(r, c), this.random8bit())
        }
      }
    }
  },
)
//#endregion

//#region Gaussian Noise
customElements.define(
  "gaussian-noise",
  class GaussianNoise extends NoiseCanvas {
    protected getValueNames(): Array<string> {
      return ["intensity"]
    }

    static get observedAttributes() {
      return [...(super.observedAttributes || []), "intensity"]
    }

    private standardNormal(): number {
      let u = 0
      let v = 0

      while (u === 0) u = Math.random()
      while (v === 0) v = Math.random()

      // Standard Normal Distribution (mean 0, stdev 1)
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
    }

    protected setBuffer(buffer: ImageData): void {
      const [width, height] = [buffer.width, buffer.height]
      const intensity_scale = Number(this.getValue("intensity")) ?? 50

      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          this.setPixel(
            this.getIndex(r, c),
            clamp(
              ((this.standardNormal() * intensity_scale) | 0) + 128,
              0,
              255,
            ),
          )
        }
      }
    }
  },
)
//#endregion

//#region Random Walk Noise
type RandomWalkNoiseSetPixelMethod = (
  sum: number,
  count: number,
  idx: number,
  memo: number[],
) => void

customElements.define(
  "random-walk-noise",
  class RandomWalkNoise extends NoiseCanvas {
    protected getValueNames(): Array<string> {
      return ["sc", "sr", "intensity", "balancePoint", "pull", "shape"]
    }

    protected setBuffer(buffer: ImageData): void {
      const [width, height] = [buffer.width, buffer.height]

      const shape = this.getValue("shape") ?? "spread"

      const sc = clamp(Number(this.getValue("sc") ?? 0), 0, width)
      const sr = clamp(Number(this.getValue("sr") ?? 0), 0, height)
      const sIdx = this.getIndex(sr, sc)
      const intensityScale = Number(this.getValue("intensity") ?? 20)
      const balancePoint = Number(this.getValue("balancePoint") ?? 128)
      const pull = Number(this.getValue("pull") ?? 0.99)

      const setWalkPixel: RandomWalkNoiseSetPixelMethod = (
        sum: number,
        count: number,
        idx: number,
        memo: number[],
      ): void => {
        const value = clamp(
          (count === 0 ? this.random8bit() - balancePoint : sum / count) *
            pull +
            (Math.random() * 2 - 1) * intensityScale,
          -balancePoint,
          255 - balancePoint,
        )
        memo[idx] = value
        this.setPixel(idx, (value + balancePoint) | 0)
      }

      switch (shape) {
        case "diagonal":
          break
        case "revDiagonal":
          break
        case "horizontal":
          break
        case "vertical":
          break
        case "spread":
        default:
          this.walkSpread(width, height, sIdx, setWalkPixel)
      }
    }

    private walkSpread(
      width: number,
      height: number,
      sIdx: number,
      setWalkPixel: RandomWalkNoiseSetPixelMethod,
    ): void {
      const memo: number[] = Array(width * height).fill(0)
      this.fill(0, 0)

      let open: number[] = [sIdx]
      let closed: number[] = []

      while (open.length > 0) {
        closed = open
        open = []

        while (closed.length > 0) {
          const currentIdx = closed.pop()!
          const [r, c] = [Math.floor(currentIdx / width), currentIdx % width]

          let count: number = 0
          let sum: number = 0

          if (this.getPixelAlpha(currentIdx) > 0) continue

          if (r > 0) {
            const idx = this.getIndex(r - 1, c)
            const alpha = this.getPixelAlpha(idx)
            if (alpha > 0) {
              sum += memo[idx]
              count += 1
            } else {
              open.push(idx)
            }
          }
          if (c > 0) {
            const idx = this.getIndex(r, c - 1)
            const alpha = this.getPixelAlpha(idx)
            if (alpha > 0) {
              sum += memo[idx]
              count += 1
            } else {
              open.push(idx)
            }
          }

          if (r < height - 1) {
            const idx = this.getIndex(r + 1, c)
            const alpha = this.getPixelAlpha(idx)
            if (alpha > 0) {
              sum += memo[idx]
              count += 1
            } else {
              open.push(idx)
            }
          }
          if (c < width - 1) {
            const idx = this.getIndex(r, c + 1)
            const alpha = this.getPixelAlpha(idx)
            if (alpha > 0) {
              sum += memo[idx]
              count += 1
            } else {
              open.push(idx)
            }
          }

          setWalkPixel(sum, count, currentIdx, memo)
        }
      }
    }
  },
)
//#endregion
//#endregion
