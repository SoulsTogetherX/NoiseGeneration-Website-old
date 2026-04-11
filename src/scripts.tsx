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

type NoiseInputType = InputContainer | number | undefined

abstract class NoiseCanvas extends HTMLElement {
  private static DEFAULT_RESOLUTION = "50"
  private static DEFAULT_PROGRESS = 1.0

  protected shadow: ShadowRoot
  protected canvas: HTMLCanvasElement
  protected ctx: CanvasRenderingContext2D

  private buffer: ImageData
  private memory: Uint32Array = new Uint32Array()
  private writeIdx: number = 0
  private useProgress: boolean = true

  private frame: number = 0

  private static resolutionNames = ["resolution", "resolutionX", "resolutionY"]
  private static progressNames = ["progress"]
  private valueInputs: Record<string, NoiseInputType> = {}

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
      "hide",
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
      } else if (name === "hide" || name === "useProgress") {
        // TODO: hide, this.useProgress

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

    this.scheduleBufferRefresh()
  }

  // Draw Buffer
  private scheduleBufferRefresh(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.refreshBuffer())
  }

  private refreshBuffer(): void {
    if (this.useProgress) {
      this.memory = new Uint32Array(this.buffer.width * this.buffer.height)
      this.writeIdx = 0
    }

    this.setBuffer(this.buffer)
    this.forceDraw()
  }
  private forceDraw(): void {
    if (this.drawCheck(this.buffer, this.getProgress())) {
      this.drawBuffer(this.buffer, this.getProgress())
    }
  }
  private drawBuffer(buffer: ImageData, progress: number): void {
    const memory = this.memory
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
    if (progress <= 0.0) {
      this.ctx.clearRect(0, 0, buffer.width, buffer.height)
      return false
    }
    if (progress >= 1.0) {
      this.ctx.putImageData(buffer, 0, 0)
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
  private getValueFromType(val: NoiseInputType): number | undefined {
    if (val === undefined) {
      return undefined
    }
    if (typeof val === "number") {
      return val
    }
    return Number(val.getValue())
  }
  public getValue(name: string): number | undefined {
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
        this.valueInputs[name] = Number(attribute)
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
      this.connectName(name, this.scheduleBufferRefresh.bind(this), selectors)
      return
    }
    this.getValueNames().map((val) =>
      this.connectName(val, this.scheduleBufferRefresh.bind(this), selectors),
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
      this.connectName(name, this.resizeCanvas.bind(this), selectors)
      return
    }
    NoiseCanvas.resolutionNames.map((val) =>
      this.connectName(val, this.resizeCanvas.bind(this), selectors),
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
      this.connectName(name, this.forceDraw.bind(this), selectors)
      return
    }
    NoiseCanvas.progressNames.map((val) =>
      this.connectName(val, this.forceDraw.bind(this), selectors),
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
      this.getValue(NoiseCanvas.progressNames[0]) ??
      NoiseCanvas.DEFAULT_PROGRESS
    )
  }
  //    Index
  private getIndex(r: number, c: number): number {
    return r * this.canvas.width + c
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
  protected getPixel(r: number, c: number): number[] {
    const index = this.getIndex(r, c) << 2
    return [this.buffer.data[index], this.buffer.data[index + 3]]
  }
  //        Returns Value
  protected getPixelValue(r: number, c: number): number {
    const index = this.getIndex(r, c) << 2
    return this.buffer.data[index]
  }
  //        Returns Alpha
  protected getPixelAlpha(r: number, c: number): number {
    const index = this.getIndex(r, c) << 2
    return this.buffer.data[index + 3]
  }

  protected setPixel(r: number, c: number, v: number): void {
    const buffer = this.buffer

    let index = this.getIndex(r, c)
    if (this.useProgress) {
      this.memory[this.writeIdx] = index
      this.writeIdx += 1
    }

    index = index << 2
    buffer.data[index] = v
    buffer.data[index + 1] = v
    buffer.data[index + 2] = v
    buffer.data[index + 3] = 255
  }
  protected copyPixel(
    newBuffer: Uint8ClampedArray,
    oldBuffer: ImageDataArray,
    idx: number,
  ): void {
    idx = idx << 2

    newBuffer[idx] = oldBuffer[idx]
    newBuffer[idx + 1] = oldBuffer[idx]
    newBuffer[idx + 2] = oldBuffer[idx]
    newBuffer[idx + 3] = oldBuffer[idx]
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
          this.setPixel(r, c, this.random8bit())
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
      const intensity_scale = this.getValue("intensity") ?? 50

      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          this.setPixel(
            r,
            c,
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
customElements.define(
  "random-walk-noise",
  class RandomWalkNoise extends NoiseCanvas {
    protected getValueNames(): Array<string> {
      return ["sc", "sr", "intensity", "balancePoint", "pull"]
    }

    protected setBuffer(buffer: ImageData): void {
      const [width, height] = [buffer.width, buffer.height]

      const sc = clamp(this.getValue("sc") ?? 0, 0, width)
      const sr = clamp(this.getValue("sr") ?? 0, 0, height)
      const intensity_scale = this.getValue("intensity") ?? 20
      const balance_point = this.getValue("balancePoint") ?? 128
      const pull = this.getValue("pull") ?? 0.99

      const memo: number[][] = Array.from({ length: height }, () =>
        Array(width).fill(0),
      )
      this.fill(0, 0)

      const stack: [number, number][] = [[sr, sc]]

      while (stack.length > 0) {
        const [r, c] = stack.pop()!
        let count: number = 0
        let sum: number = 0

        if (r > 0) {
          const alpha = this.getPixelAlpha(r - 1, c)
          if (alpha > 0) {
            sum += memo[r - 1][c]
            count += 1
          } else {
            stack.push([r - 1, c])
          }
        }
        if (c > 0) {
          const alpha = this.getPixelAlpha(r, c - 1)
          if (alpha > 0) {
            sum += memo[r][c - 1]
            count += 1
          } else {
            stack.push([r, c - 1])
          }
        }

        if (r < height - 1) {
          const alpha = this.getPixelAlpha(r + 1, c)
          if (alpha > 0) {
            sum += memo[r + 1][c]
            count += 1
          } else {
            stack.push([r + 1, c])
          }
        }
        if (c < width - 1) {
          const alpha = this.getPixelAlpha(r, c + 1)
          if (alpha > 0) {
            sum += memo[r][c + 1]
            count += 1
          } else {
            stack.push([r, c + 1])
          }
        }

        if (count == 0) {
          const value = this.random8bit() - balance_point
          this.setPixel(r, c, value)
          memo[r][c] = value
          continue
        }

        const value = clamp(
          (sum / count) * pull + (Math.random() * 2 - 1) * intensity_scale,
          -balance_point,
          255 - balance_point,
        )
        memo[r][c] = value
        this.setPixel(r, c, (value + balance_point) | 0)
      }
    }
  },
)
//#endregion
//#endregion
