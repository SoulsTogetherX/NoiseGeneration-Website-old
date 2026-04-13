//#region Helper Methods
const clamp = (num: number, min: number, max: number) =>
  Math.min(Math.max(num, min), max)
//#endregion

//#region Random Number Generators
function xmur3(str: string): () => number {
  let h = 1779033703 ^ str.length
  for (let i = 0; i < str.length; i++) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507)
    h = Math.imul(h ^ (h >>> 13), 3266489909)
    return (h ^= h >>> 16) >>> 0
  }
}

function mulberry32(a: number): () => number {
  return (): number => {
    let t = (a += 0x6d2b79f5)

    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }
}

function sfc32(a: number, b: number, c: number, d: number): () => number {
  a >>>= 0
  b >>>= 0
  c >>>= 0
  d >>>= 0

  return (): number => {
    const t = (((a + b) | 0) + d) | 0
    d = (d + 1) | 0
    a = (b ^ (b >>> 9)) | 0
    b = (c + (c << 3)) | 0
    c = (c << 21) | (c >>> 11)
    c = (c + t) | 0
    return t >>> 0
  }
}
//#endregion

//#region Noise Canvases

//#region Abstract

//#region     Needed Types
type NoiseInputType = InputContainer | any | undefined
class InputContainer {
  private readonly inputElement: HTMLInputElement
  private readonly onUpdateMethod: () => void
  private readonly event: string

  constructor(
    inputElement: HTMLInputElement,
    event: string,
    onUpdate: () => void,
  ) {
    this.inputElement = inputElement
    this.onUpdateMethod = onUpdate
    this.event = event

    this.inputElement.addEventListener(event, this.onUpdateMethod)
  }

  public disconnectUpdateMethod(): void {
    this.inputElement.removeEventListener(this.event, this.onUpdateMethod)
  }
  public getValue(): any {
    return this.inputElement.value
  }
}
//#endregion

//#region     Class Definition
abstract class NoiseCanvas extends HTMLElement {
  //#region Constants
  private static readonly DEFAULT_RESOLUTION = "50"

  private static readonly RESOLUTION_NAMES = [
    "resolution",
    "resolutionX",
    "resolutionY",
  ]
  private static readonly PROGRESS_NAMES = ["progressCutoff", "progressRatio"]
  private static readonly SEED_NAMES = ["seed"]
  //#endregion

  //#region Private Variables
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D

  private buffer: ImageData
  private progressMemory: Uint8Array | Uint16Array | Uint32Array | undefined
  private writeIdx: number = 0

  private frame: number = 0

  private internalProgressCutoff: number = 0

  private valuesRecord: Record<string, NoiseInputType> = {}
  private randMethod: () => number
  //#endregion

  //#region Attribute Update Methods
  private readonly resolutionUpdaterMethod: () => void =
    this.resizeCanvas.bind(this)
  private readonly bufferUpdaterMethod: () => void =
    this.scheduleBufferRefresh.bind(this)
  private readonly progressUpdaterMethod: () => void =
    this.updateProgressCutoff.bind(this)
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

    this.initializeValues()
    this.randMethod = sfc32(0, 0, 0, 0)

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
  //    Used to return what parameters this NoiseType needs to function
  protected abstract getParameterNames(): Array<string>
  //#endregion

  //#region Virtual Methods
  //#region     Dom Enter/Exit
  connectedCallback(): void {
    this.connectAll()
    this.resizeCanvas()
    this.refreshBuffer()
  }
  disconnectedCallback(): void {
    cancelAnimationFrame(this.frame)

    this.disconnectAll()
  }
  //#endregion

  //#region     Attribute Changes
  static get observedAttributes() {
    return [
      "inputsRoot",
      "useProgress",
      ...NoiseCanvas.SEED_NAMES,
      ...NoiseCanvas.RESOLUTION_NAMES,
      ...NoiseCanvas.PROGRESS_NAMES,
    ]
  }

  attributeChangedCallback(name: string, oldValue: any, newValue: any): void {
    if (oldValue !== newValue) {
      if (NoiseCanvas.RESOLUTION_NAMES.includes(name)) {
        this.connectResolution(undefined, newValue)
        this.resizeCanvas()
      } else if (NoiseCanvas.PROGRESS_NAMES.includes(name)) {
        this.connectProgress(undefined, newValue)
        this.updateProgressCutoff()
      } else if (NoiseCanvas.SEED_NAMES.includes(name)) {
        //
      } else if (this.getParameterNames().includes(name)) {
        this.connectParameters(undefined, newValue)
        this.scheduleBufferRefresh()
      } else if (name === "useProgress") {
        this.createProgressMemory(this.getPixelCount())
        this.forceDraw()
      }
    }
  }
  //#endregion
  //#endregion

  //#region Resolution
  private resizeCanvas(): void {
    const canvas = this.canvas
    const [resolution, resolutionX, resolutionY] = NoiseCanvas.RESOLUTION_NAMES

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

    this.createProgressMemory(canvasX * canvasY)
    this.updateProgressCutoff()
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

    this.settupSeed()
    this.setBuffer(this.buffer)
    this.forceDraw()
  }

  //    Draw
  private forceDraw(): void {
    const cutoff = this.internalProgressCutoff

    if (this.drawCheck(this.buffer, cutoff)) {
      this.drawBuffer(this.buffer, cutoff)
    }
  }
  private drawCheck(buffer: ImageData, cutoff: number): boolean {
    if (this.progressMemory === undefined || cutoff >= this.getPixelCount()) {
      this.ctx.putImageData(buffer, 0, 0)
      return false
    }
    if (cutoff <= 0) {
      this.ctx.clearRect(0, 0, buffer.width, buffer.height)
      return false
    }
    return true
  }

  private drawBuffer(buffer: ImageData, cutoff: number): void {
    const memory = this.progressMemory!
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

  //#region Attributes Settup

  //#region     Base Value Accessing
  //#region         Initialize
  private initializeValues(): void {
    this.clearValues()
    ;[
      ...NoiseCanvas.RESOLUTION_NAMES,
      ...NoiseCanvas.PROGRESS_NAMES,
      ...this.getParameterNames(),
    ].map((name: string) => {
      this.valuesRecord[name] = this.getAttribute(name)
    })
  }
  private clearValues(): void {
    this.disconnectAll()
    this.valuesRecord = {}
  }
  //#endregion

  //#region         Accessors
  //#region             Generic
  private getValueFromType(val: NoiseInputType): any | undefined {
    if (val instanceof InputContainer) {
      return val.getValue()
    }
    return val
  }

  public isValueConnected(name: string): boolean {
    return this.valuesRecord[name] instanceof InputContainer
  }
  public getValue(name: string): any {
    return this.getValueFromType(this.valuesRecord[name])
  }
  //#endregion

  //#region             Specific
  public getResolution(): number {
    return Number(this.getValue(NoiseCanvas.RESOLUTION_NAMES[0]) ?? 50)
  }
  public getResolutionX(): number {
    return Number(this.getValue(NoiseCanvas.RESOLUTION_NAMES[1]) ?? 50)
  }
  public getResolutionY(): number {
    return Number(this.getValue(NoiseCanvas.RESOLUTION_NAMES[2]) ?? 50)
  }

  public getProgressCutoff(): number {
    return Number(
      this.getValue(NoiseCanvas.PROGRESS_NAMES[0]) ?? this.getPixelCount(),
    )
  }
  public getProgressRatio(): number {
    return Number(this.getValue(NoiseCanvas.PROGRESS_NAMES[1]) ?? 1.0)
  }

  public getSeed(): number {
    return (
      this.valuesRecord[NoiseCanvas.SEED_NAMES[0]] ??
      (Math.random() * 0xffffffff) | 0
    )
  }

  public getPixelCount(): number {
    return this.progressMemory?.length ?? 0
  }
  //#endregion
  //#endregion

  //#region         Direct Setters
  public setResolution(val: any): void {
    const name = NoiseCanvas.RESOLUTION_NAMES[0]
    if (this.isValueConnected(name)) {
      return
    }

    this.valuesRecord[name] = val
    this.resolutionUpdaterMethod()
  }
  public setResolutionX(val: any): void {
    const name = NoiseCanvas.RESOLUTION_NAMES[1]
    if (this.isValueConnected(name)) {
      return
    }

    this.valuesRecord[name] = val
    this.resolutionUpdaterMethod()
  }
  public setResolutionY(val: any): void {
    const name = NoiseCanvas.RESOLUTION_NAMES[2]
    if (this.isValueConnected(name)) {
      return
    }

    this.valuesRecord[name] = val
    this.resolutionUpdaterMethod()
  }

  public setProgressCutoff(val: any): void {
    const name = NoiseCanvas.PROGRESS_NAMES[0]
    if (this.isValueConnected(name)) {
      return
    }

    this.valuesRecord[name] = val
    this.progressUpdaterMethod()
  }
  public setProgressRatio(val: any): void {
    const name = NoiseCanvas.PROGRESS_NAMES[1]
    if (this.isValueConnected(name)) {
      return
    }

    this.valuesRecord[name] = val
    this.progressUpdaterMethod()
  }

  public setSeed(val: number): void {
    const name = NoiseCanvas.SEED_NAMES[1]
    if (this.isValueConnected(name)) {
      return
    }

    this.valuesRecord[name] = val
    this.bufferUpdaterMethod()
  }
  //#endregion

  //#region         Helper Setters
  public setParameter(name: string, val: any): void {
    if (!this.getParameterNames().includes(name)) {
      throw TypeError(
        `Parameter ${name} does not exist on current Noise Canvas.`,
      )
    }
    if (this.isValueConnected(name)) {
      return
    }

    this.valuesRecord[name] = val
  }
  //#endregion
  //#region

  //#region Attribute Event Settup
  //#region     Connection
  //                Base Connection
  private connectName(
    name: string,
    event: string,
    onUpdate: () => void,
    fallback: Array<HTMLInputElement>,
  ): void {
    if (name in this.valuesRecord) {
      this.disconnectName(name)
    }

    const attribute = this.getAttribute(name)
    if (attribute !== null) {
      if (!isNaN(Number(attribute)) && attribute.trim() !== "") {
        this.valuesRecord[name] = attribute
        return
      }

      const sliderId = document.getElementById(attribute)
      if (sliderId !== null) {
        this.valuesRecord[name] = new InputContainer(
          sliderId as HTMLInputElement,
          event,
          onUpdate,
        )
        return
      }
    }

    const slider: HTMLInputElement | undefined = fallback.find(
      (val: HTMLInputElement) => val.name === name,
    )
    if (slider !== undefined) {
      this.valuesRecord[name] = new InputContainer(slider, event, onUpdate)
      return
    }
  }
  private connectTemplate(
    selectors: Array<HTMLInputElement> | undefined = undefined,
    names: string | Array<string>,
    event: string,
    onUpdate: () => void,
  ): void {
    if (selectors === undefined) {
      selectors = this.getSelectors()
    }

    if (typeof names === "string") {
      this.connectName(names, event, onUpdate, selectors)
      return
    }
    names.map((val) => this.connectName(val, event, onUpdate, selectors))
  }

  //                Types of Connections
  private connectParameters(
    selectors: Array<HTMLInputElement> | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    this.connectTemplate(
      selectors,
      name ?? this.getParameterNames(),
      "input",
      this.bufferUpdaterMethod.bind(this),
    )
  }
  private connectResolution(
    selectors: Array<HTMLInputElement> | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    this.connectTemplate(
      selectors,
      name ?? NoiseCanvas.RESOLUTION_NAMES,
      "input",
      this.resolutionUpdaterMethod.bind(this),
    )
  }
  private connectProgress(
    selectors: Array<HTMLInputElement> | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    this.connectTemplate(
      selectors,
      name ?? NoiseCanvas.PROGRESS_NAMES,
      "input",
      this.progressUpdaterMethod.bind(this),
    )
  }
  private connectSeed(
    selectors: Array<HTMLInputElement> | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    this.connectTemplate(
      selectors,
      name ?? NoiseCanvas.SEED_NAMES,
      "change",
      this.bufferUpdaterMethod.bind(this),
    )
  }

  //                All Connections
  private connectAll(): void {
    const selectors = this.getSelectors()
    this.connectSeed(selectors)
    this.connectParameters(selectors)
    this.connectResolution(selectors)
    this.connectProgress(selectors)
  }
  //#endregion

  //#region     Disconnect
  //                Base Disconnect
  private disconnectName(name: string): void {
    const slider = this.valuesRecord[name]

    if (slider instanceof InputContainer) {
      slider.disconnectUpdateMethod()
    }
    this.valuesRecord[name] = undefined
  }

  //                All Disconnect
  private disconnectAll(): void {
    Object.values(this.valuesRecord).forEach((slider: NoiseInputType) => {
      if (slider instanceof InputContainer) {
        slider.disconnectUpdateMethod()
      }
    })
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

  //#region     Progress
  private updateProgressCutoff(): void {
    const pixelCutoff = this.getValue(NoiseCanvas.PROGRESS_NAMES[0])

    if (pixelCutoff !== undefined) {
      this.internalProgressCutoff = Number(pixelCutoff)
    } else {
      const pixelCount = this.getPixelCount()
      const pixelRatio = this.getValue(NoiseCanvas.PROGRESS_NAMES[1])

      if (pixelRatio !== undefined) {
        this.internalProgressCutoff = Number(pixelRatio) * pixelCount
      } else {
        this.internalProgressCutoff = pixelCount
      }
    }

    this.forceDraw()
  }

  private createProgressMemory(countmaxIndex: number): void {
    if (this.getAttribute("useProgress") !== "true") {
      this.progressMemory = undefined
      return
    }

    if (countmaxIndex <= 0xff) {
      this.progressMemory = new Uint8Array(countmaxIndex)
      return
    }
    if (countmaxIndex <= 0xffff) {
      this.progressMemory = new Uint16Array(countmaxIndex)
      return
    }
    if (countmaxIndex <= 0xffffffff) {
      this.progressMemory = new Uint32Array(countmaxIndex)
      return
    }

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

  //#region     Random Methods
  private settupSeed(): void {
    const hash = mulberry32(this.getSeed())
    this.randMethod = sfc32(hash(), hash(), hash(), hash())
  }

  protected random32bit(): number {
    return this.randMethod()
  }
  protected random16bit(): number {
    return this.randMethod() & 0xffff
  }
  protected random8bit(): number {
    return this.randMethod() & 0xff
  }

  // [0, 1)
  protected randomUFloat(): number {
    return (this.randMethod() >>> 0) / 0x100000000
  }
  // [-1, 1)
  protected randomFloat(): number {
    return (this.randMethod() | 0) / 0x80000000
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
    protected getParameterNames(): Array<string> {
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
    protected getParameterNames(): Array<string> {
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

      while (u === 0) u = this.randomUFloat()
      while (v === 0) v = this.randomUFloat()

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
    protected getParameterNames(): Array<string> {
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
            Math.sign(this.randomFloat()) * intensityScale,
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
