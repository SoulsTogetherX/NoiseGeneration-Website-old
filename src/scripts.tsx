//#region Helper Methods
const clamp = (num: number, min: number, max: number) =>
  Math.min(Math.max(num, min), max)
//#endregion

//#region Noise Canvases

//#region Abstract

//#region     Needed Types
type NoiseInputType = InputContainer | string | undefined
class InputContainer {
  private readonly inputElement: HTMLInputElement
  private readonly onUpdateMethod: () => void

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
//#endregion

//#region     Class Definition
abstract class NoiseCanvas extends HTMLElement {
  //#region Constants
  private static readonly DEFAULT_RESOLUTION = "50"
  private static readonly DEFAULT_PROGRESS = 1.0
  //#endregion

  //#region Private Accessors
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D

  private buffer: ImageData
  private progressMemory: Uint8Array | Uint16Array | Uint32Array | undefined
  private writeIdx: number = 0

  private allowCanvasDisplay: boolean = true

  private frame: number = 0
  //#endregion

  //#region Connection Attribute Names
  private static readonly resolutionNames = [
    "resolution",
    "resolutionX",
    "resolutionY",
  ]
  private static readonly progressNames = ["progress"]
  private valueInputs: Record<string, NoiseInputType> = {}
  //#endregion

  //#region Attribute Update Methods
  private readonly valueUpdaterMethod: () => void =
    this.scheduleBufferRefresh.bind(this)
  private readonly resolutionUpdaterMethod: () => void =
    this.resizeCanvas.bind(this)
  private readonly progressUpdaterMethod: () => void = this.forceDraw.bind(this)
  //#endregion

  //#region Constructor
  constructor() {
    super()

    const shadow = this.attachShadow({ mode: "closed" })
    shadow.innerHTML = `
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

    this.canvas = shadow.querySelector("canvas")!
    const ctx = this.canvas.getContext("2d")
    if (!ctx) throw new Error("2D canvas context not available")

    ctx.imageSmoothingEnabled = false
    this.ctx = ctx
    this.buffer = new ImageData(1, 1)
  }
  //#endregion

  //#region Abstract Methods
  //    Used to draw the desired buffer, which will be kept until a refresh or a redraw is requested
  protected abstract setBuffer(buffer: ImageData): void
  //    Used to return what values this NoiseType needs to function
  protected abstract getValueNames(): Array<string>
  //#endregion

  //#region Virtual Methods
  //    Dom Enter/Exit
  connectedCallback(): void {
    this.connectAll()
    this.resizeCanvas()
    this.refreshBuffer()
  }
  disconnectedCallback(): void {
    cancelAnimationFrame(this.frame)

    this.disconnectAll()
  }

  //    Attribute Changes
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
  //#endregion

  //#region Resolution
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
  //#endregion

  //#region Draw/Buffer Manipulation
  //    Buffer
  private scheduleBufferRefresh(): void {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.refreshBuffer())
  }
  private refreshBuffer(): void {
    this.writeIdx = 0

    this.setBuffer(this.buffer)
    this.forceDraw()
  }

  //    Draw
  private forceDraw(): void {
    if (this.drawCheck(this.buffer, this.getProgress())) {
      this.drawBuffer(this.buffer, this.getProgress())
    }
  }
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
  //#endregion

  //#region Attribute Event Settup
  //#region     Connection
  //                Base Connection
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
  private connectTemplate(
    selectors: Array<HTMLInputElement> | undefined = undefined,
    names: string | Array<string>,
    onUpdate: () => void,
  ): void {
    if (selectors === undefined) {
      selectors = this.getSelectors()
    }

    if (typeof names === "string") {
      this.connectName(names, onUpdate, selectors)
      return
    }
    names.map((val) => this.connectName(val, onUpdate, selectors))
  }

  //                Types of Connections
  private connectValues(
    selectors: Array<HTMLInputElement> | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    this.connectTemplate(
      selectors,
      name ?? this.getValueNames(),
      this.valueUpdaterMethod.bind(this),
    )
  }
  private connectResolution(
    selectors: Array<HTMLInputElement> | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    this.connectTemplate(
      selectors,
      name ?? NoiseCanvas.resolutionNames,
      this.resolutionUpdaterMethod.bind(this),
    )
  }
  private connectProgress(
    selectors: Array<HTMLInputElement> | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    this.connectTemplate(
      selectors,
      name ?? NoiseCanvas.progressNames,
      this.progressUpdaterMethod.bind(this),
    )
  }

  //                All Connections
  private connectAll(): void {
    const selectors = this.getSelectors()
    this.connectValues(selectors)
    this.connectResolution(selectors)
    this.connectProgress(selectors)
  }
  //#endregion

  //#region     Disconnect
  //                Base Disconnect
  private disconnectName(name: string): void {
    const slider = this.valueInputs[name]

    if (slider instanceof InputContainer) {
      slider.disconnectUpdateMethod()
    }
    delete this.valueInputs[name]
  }

  //                All Disconnect
  private disconnectAll(): void {
    Object.values(this.valueInputs).forEach((slider: NoiseInputType) => {
      if (slider instanceof InputContainer) {
        slider.disconnectUpdateMethod()
      }
    })
    this.valueInputs = {}
  }
  //#endregion

  //#region     Direct Attribute Updaters
  private updateAllowCanvasDisplay(): void {
    this.allowCanvasDisplay = !(this.getAttribute("draw") === "false")
  }
  //#endregion
  //#endregion

  //#region Helper Methods
  //#region     DOM Search
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
  //#endregion

  //#region     Base Value Accessing
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
  //#endregion

  //#region     Progress
  public getProgress(): number {
    return Number(
      this.getValue(NoiseCanvas.progressNames[0]) ??
        NoiseCanvas.DEFAULT_PROGRESS,
    )
  }

  private createProgressMemory(
    countmaxIndex: number,
  ): Uint8Array | Uint16Array | Uint32Array | undefined {
    if (this.getAttribute("useProgress") !== "true") {
      return undefined
    }

    if (countmaxIndex <= 0xff) return new Uint8Array(countmaxIndex)
    if (countmaxIndex <= 0xffff) return new Uint16Array(countmaxIndex)
    if (countmaxIndex <= 0xffffffff) return new Uint32Array(countmaxIndex)

    throw new Error(
      "Cannot save the progress of a canvas with more than 0xffffffff pixels.",
    )
  }
  //#endregion

  //#region     Entire Canvas Updaters
  protected fill(v: number, a: number): void {
    const width = this.canvas.width
    const height = this.canvas.height

    this.ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${a.toFixed(3)})`
    this.ctx.fillRect(0, 0, width, height)
  }
  //#endregion

  //#region     Pixel Canvus Updaters
  //#region         Index
  protected getIndex(r: number, c: number): number {
    return r * this.buffer.width + c
  }
  //#endregion

  //#region         Get Pixel
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
  //#endregion

  //#region         Set Pixel
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
  //#endregion
  //#endregion

  //#region     Buffer Copy Methods
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
  //#endregion

  //#region     Simple Random Method
  protected random8bit(): number {
    return (Math.random() * 256) | 0
  }
  //#endregion
  //#endregion
}
//#endregion

//#region White Noise
customElements.define(
  "white-noise",
  class WhiteNoiseCanvas extends NoiseCanvas {
    //#region Private Variables
    private static readonly customAttributes = []
    //#endregion

    //#region Attribute Methods
    protected getValueNames(): Array<string> {
      return WhiteNoiseCanvas.customAttributes
    }

    static get observedAttributes() {
      return [
        ...(super.observedAttributes || []),
        ...WhiteNoiseCanvas.customAttributes,
      ]
    }
    //#endregion

    //#region Buffer Draw Method
    protected setBuffer(buffer: ImageData): void {
      const [width, height] = [buffer.width, buffer.height]
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          this.setPixel(this.getIndex(r, c), this.random8bit())
        }
      }
    }
    //#endregion
  },
)
//#endregion

//#region Gaussian Noise
customElements.define(
  "gaussian-noise",
  class GaussianNoise extends NoiseCanvas {
    //#region Private Variables
    private static readonly customAttributes = ["intensity"]
    //#endregion

    //#region Attribute Methods
    protected getValueNames(): Array<string> {
      return GaussianNoise.customAttributes
    }

    static get observedAttributes() {
      return [
        ...(super.observedAttributes || []),
        ...GaussianNoise.customAttributes,
      ]
    }
    //#endregion

    //#region Buffer Draw Method
    protected setBuffer(buffer: ImageData): void {
      const [width, height] = [buffer.width, buffer.height]
      const intensity_scale = Number(this.getValue("intensity") ?? 50)

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
    //#endregion

    //#region Helper Methods
    private standardNormal(): number {
      let u = 0
      let v = 0

      while (u === 0) u = Math.random()
      while (v === 0) v = Math.random()

      // Standard Normal Distribution (mean 0, stdev 1)
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
    }
    //#endregion
  },
)
//#endregion

//#region Random Walk Noise
type RandomWalkNoiseSetPixelMethod = (
  pInfo: [number, number],
  idx: number,
  memo: number[],
) => void
type RandomWalkNoiseProcessPixelLocation = (
  idx: number,
  pInfo: [number, number],
) => [number, number]
type RandomWalkNoiseProcessWalkDirection = (
  r: number,
  c: number,
  pInfo: [number, number],
  processLocation: RandomWalkNoiseProcessPixelLocation,
) => [number, number]

customElements.define(
  "random-walk-noise",
  class RandomWalkNoise extends NoiseCanvas {
    //#region Private Variables
    private static readonly customAttributes = [
      "sc",
      "sr",
      "intensity",
      "balancePoint",
      "pull",
      "shape",
    ]
    //#endregion

    //#region Attribute Methods
    protected getValueNames(): Array<string> {
      return RandomWalkNoise.customAttributes
    }

    static get observedAttributes() {
      return [
        ...(super.observedAttributes || []),
        ...RandomWalkNoise.customAttributes,
      ]
    }
    //#endregion

    //#region Buffer Draw Method
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
        pInfo: [number, number],
        idx: number,
        memo: number[],
      ): void => {
        const value = clamp(
          (pInfo[1] === 0
            ? this.random8bit() - balancePoint
            : pInfo[0] / pInfo[1]) *
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
        case "spiral":
          break
        case "revSpiral":
          break
        case "spread":
        default:
          this.walkSpread(width, height, sIdx, setWalkPixel)
      }
    }
    //#endregion

    //#region Buffer Shape Draw Methods
    private walkTemplate(
      width: number,
      height: number,
      sIdx: number,
      setWalkPixel: RandomWalkNoiseSetPixelMethod,
      processWalkDirection: RandomWalkNoiseProcessWalkDirection,
    ): void {
      const memo: number[] = Array(width * height).fill(0)
      this.fill(0, 0)

      let open: number[] = [sIdx]
      let closed: number[] = []

      const processPixelLocation = (
        idx: number,
        pInfo: [number, number],
      ): [number, number] => {
        const alpha = this.getPixelAlpha(idx)
        if (alpha > 0) {
          pInfo[0] += memo[idx]
          pInfo[1] += 1
        } else {
          open.push(idx)
        }
        return pInfo
      }

      while (open.length > 0) {
        closed = open
        open = []

        while (closed.length > 0) {
          const currentIdx = closed.pop()!
          const [r, c] = [Math.floor(currentIdx / width), currentIdx % width]

          let pInfo: [number, number] = [0, 0]

          if (this.getPixelAlpha(currentIdx) > 0) continue
          processWalkDirection(r, c, pInfo, processPixelLocation)
          setWalkPixel(pInfo, currentIdx, memo)
        }
      }
    }

    private walkSpread(
      width: number,
      height: number,
      sIdx: number,
      setWalkPixel: RandomWalkNoiseSetPixelMethod,
    ): void {
      this.walkTemplate(
        width,
        height,
        sIdx,
        setWalkPixel,
        (
          r: number,
          c: number,
          pInfo: [number, number],
          processPixelLocation: RandomWalkNoiseProcessPixelLocation,
        ): [number, number] => {
          if (r > 0) {
            pInfo = processPixelLocation(this.getIndex(r - 1, c), pInfo)
          }
          if (c > 0) {
            pInfo = processPixelLocation(this.getIndex(r, c - 1), pInfo)
          }

          if (r < height - 1) {
            pInfo = processPixelLocation(this.getIndex(r + 1, c), pInfo)
          }
          if (c < width - 1) {
            pInfo = processPixelLocation(this.getIndex(r, c + 1), pInfo)
          }

          return pInfo
        },
      )
    }
    //#endregion
  },
)
//#endregion
//#endregion
