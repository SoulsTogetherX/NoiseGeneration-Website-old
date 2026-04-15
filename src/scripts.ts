import { clamp, mulberry32, sfc32 } from "./helperMethods.js"

//#region Noise Canvases
//#region Abstract
//#region     Needed Types
class InputContainer {
  // The attached input
  private readonly inputElement: HTMLInputElement
  // The method to call when the input changes value
  private readonly onUpdateMethod: () => void

  // The Class Constructor
  constructor(inputElement: HTMLInputElement, onUpdate: () => void) {
    this.inputElement = inputElement
    this.onUpdateMethod = onUpdate

    this.inputElement.addEventListener("input", this.onUpdateMethod)
  }

  // Should be called on clear
  public disconnectUpdateMethod(): void {
    this.inputElement.removeEventListener("input", this.onUpdateMethod)
  }
  // Gets the value of the attached 'HTMLInputElement' element input
  public getValue(): any {
    return this.inputElement.value
  }
}
//#endregion

//#region     Class Definition
abstract class NoiseCanvas extends HTMLElement {
  //#region Constants
  //    Internal Variable Names
  private static readonly INTERAL_VARIABLE_NAMES = {
    INPUTS_ROOT: "inputsRoot",
    RESOLUTION: "resolution",
    RESOLUTION_X: "resolutionX",
    RESOLUTION_Y: "resolutionY",
    PROGRESS_CUTOFF: "progressCutoff",
    PROGRESS_RATIO: "progressRatio",
    USE_PROGRESS: "useProgress",
    DISABLE_UPDATES: "disableUpdates",
    SEED: "seed",
  } as const
  //#endregion

  //#region Private Variables
  //    The Canvas and context objects used to draw on
  private readonly canvas: HTMLCanvasElement
  private readonly ctx: CanvasRenderingContext2D

  //    Stores all generated info of the noise texture. Updated only in the writing phase, triggered only when
  //    relevant values or parameters change.
  private texture: ImageData

  //    The progress buffer, used to store the order of the indexes that should be drawn to the canvas as the internalProgressCutoff
  //    increases to simulate the texture being generated. Only relevant when useProgress is true.
  private progressMemory: Uint8Array | Uint16Array | Uint32Array | undefined
  //    The cuttoff point of indexes, in progressMemory, to display on the canvas when in draw phase.
  private internalProgressCutoff: number = 0
  //    An internal index used while recording indexes within the progressMemory, as they are being writen in the texture buffer.
  private writePtr: number = 0

  //    Indicate that the current resolution is dirty and needs to be refactored
  private resolutionDirty: boolean = false
  //    Indicate that the current progress memory is dirty and needs to be reallocated
  private progressMemoryDirty: boolean = false
  //    Indicate that the current texture is dirty and needs to be rewriten
  private textureDirty: boolean = false
  //    Indicate that the current progress cuttoff is dirty and needs to be recalculated
  private progressDirty: boolean = false
  //    Used to store the current canvas refresh request, allowing any request to be canceled and replaced for a newer one
  private rafId: number = 0

  //    Holds a record of all inscripied attributes, of this element, that could affect the writing or draw phases.
  private valuesRecord: Record<string, any> = {}
  //#endregion

  //#region Update Lambdas
  //    Used when an HTMLInputElement, in valuesRecord, that changes the resolution is edited.
  private readonly scheduleResolutionMethod: () => void =
    this.scheduleResolutionRefresh.bind(this)
  //    Used when an HTMLInputElement, in valuesRecord, that changes how the texture is writen is edited.
  private readonly scheduleTextureMethod: () => void =
    this.scheduleTextureRefresh.bind(this)
  //    Used when an HTMLInputElement, in valuesRecord, that changes the size of the progress buffer.
  private readonly scheduleProgresMemorysMethod: () => void =
    this.scheduleProgressMemoryRefresh.bind(this)
  //    Used when an HTMLInputElement, in valuesRecord, that changes the progress cutoff.
  private readonly scheduleProgressMethod: () => void =
    this.scheduleProgressRefresh.bind(this)
  //    Used when an HTMLInputElement, in valuesRecord, that changes how the texture is draw is edited.
  private readonly scheduleDrawMethod: () => void =
    this.scheduleDrawRefresh.bind(this)

  //    A consumable random number method. Expected to be a sfc32 generator, but with a mulberry32 generated seed.
  private randMethod!: () => number
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

    this.valuesRecord[NoiseCanvas.INTERAL_VARIABLE_NAMES.SEED] = 0
    this.settupSeed()

    this.canvas = shadow.querySelector("canvas")!
    const ctx = this.canvas.getContext("2d")
    if (!ctx) throw new Error("2D canvas context not available")

    ctx.imageSmoothingEnabled = false
    this.ctx = ctx
    this.texture = new ImageData(1, 1)
  }
  //#endregion

  //#region Abstract Methods
  //    Used to write the desired texture, which will be kept until a refresh or a rewrite is requested
  protected abstract writeTexture(texture: ImageData): void
  //    Used to return what attributes this NoiseType needs to function
  protected abstract getParameterNames(): string[]
  //    Used to return the default value of the attributes defined by getParameterNames()
  protected abstract getDefaultParameter(name: string): any
  //#endregion

  //#region Virtual Methods
  //#region     Dom Enter/Exit
  connectedCallback(): void {
    this.connectAll()
    this.scheduleResolutionRefresh()
  }
  disconnectedCallback(): void {
    cancelAnimationFrame(this.rafId)
    this.disconnectAll()
  }
  //#endregion

  //#region     Attribute Changes
  static get observedAttributes(): string[] {
    return Object.values(NoiseCanvas.INTERAL_VARIABLE_NAMES)
  }

  //     Called to react to attribute changes in the DOM
  attributeChangedCallback(name: string, oldValue: any, newValue: any): void {
    if (oldValue !== newValue) {
      switch (name) {
        case NoiseCanvas.INTERAL_VARIABLE_NAMES.INPUTS_ROOT:
          this.setInputsRoots(newValue)
          break
        case NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION:
          this.setResolution(newValue)
          break
        case NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION_X:
          this.setResolutionX(newValue)
          break
        case NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION_Y:
          this.setResolutionY(newValue)
          break
        case NoiseCanvas.INTERAL_VARIABLE_NAMES.PROGRESS_CUTOFF:
          this.setProgressCutoff(newValue)
          break
        case NoiseCanvas.INTERAL_VARIABLE_NAMES.PROGRESS_RATIO:
          this.setProgressRatio(newValue)
          break
        case NoiseCanvas.INTERAL_VARIABLE_NAMES.USE_PROGRESS:
          this.setUseProgress(newValue)
          break
        case NoiseCanvas.INTERAL_VARIABLE_NAMES.DISABLE_UPDATES:
          this.setDisableUpdates(newValue)
          break
        case NoiseCanvas.INTERAL_VARIABLE_NAMES.SEED:
          this.setSeed(newValue)
          break
        default:
          this.setParameter(name, newValue)
      }
    }
  }

  //     Used to get the default value of defined internal attributes
  public getDefaultAttribute(name: string): any {
    if (name === NoiseCanvas.INTERAL_VARIABLE_NAMES.INPUTS_ROOT) {
      return undefined
    } else if (NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION === name) {
      return 50
    } else if (
      NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION_X === name ||
      NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION_Y === name
    ) {
      return undefined
    } else if (
      name === NoiseCanvas.INTERAL_VARIABLE_NAMES.PROGRESS_CUTOFF ||
      name === NoiseCanvas.INTERAL_VARIABLE_NAMES.PROGRESS_RATIO
    ) {
      return undefined
    } else if (name === NoiseCanvas.INTERAL_VARIABLE_NAMES.USE_PROGRESS) {
      return false
    } else if (name === NoiseCanvas.INTERAL_VARIABLE_NAMES.DISABLE_UPDATES) {
      return false
    } else if (name === NoiseCanvas.INTERAL_VARIABLE_NAMES.SEED) {
      return (Math.random() * 255) >>> 0
    } else if (this.getParameterNames().includes(name)) {
      return this.getDefaultParameter(name)
    }

    return undefined
  }
  //#endregion
  //#endregion

  //#region     Base Attribute Accessing
  //#region         Accessors
  //#region             Generic
  //      Returns the direct value of a saved paramaeter, including if the value
  //      is from a connected HTMLInputElement.
  private getValueFromType(val: any): any | undefined {
    if (val instanceof InputContainer) {
      return val.getValue()
    }
    return val
  }

  //      Returns if value name, in valuesRecord, correlates to a connected HTMLInputElement.
  public isValueConnected(name: string): boolean {
    return this.valuesRecord[name] instanceof InputContainer
  }
  //      Returns the value of a saved attribute, fromvaluesRecord, of a given name
  public getValue(name: string): any {
    return this.getValueFromType(this.valuesRecord[name])
  }
  //#endregion

  //#region             Specific
  //      Gets the inputs_root value saved in valuesRecord
  public getInputsRoots(): Document | Element {
    return this.getValue(NoiseCanvas.INTERAL_VARIABLE_NAMES.INPUTS_ROOT)!
  }

  //      Gets the resolution value saved in valuesRecord
  public getResolution(): number {
    return this.getValue(NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION)!
  }
  //      Gets the resolution_x value saved in valuesRecord
  public getResolutionX(): number {
    return (
      this.getValue(NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION_X) ??
      this.getResolution()
    )
  }
  //      Gets the resolution_y value saved in valuesRecord
  public getResolutionY(): number {
    return (
      this.getValue(NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION_Y) ??
      this.getResolution()
    )
  }

  //      Gets the progress_cutoff value saved in valuesRecord
  public getProgressCutoff(): number {
    return (
      this.getValue(NoiseCanvas.INTERAL_VARIABLE_NAMES.PROGRESS_CUTOFF) ??
      this.getPixelCount()
    )
  }
  //      Gets the progress_ratio value saved in valuesRecord
  public getProgressRatio(): number {
    return (
      this.getValue(NoiseCanvas.INTERAL_VARIABLE_NAMES.PROGRESS_RATIO) ?? 1.0
    )
  }
  //      Gets the use_progress value saved in valuesRecord
  public getUseProgress(): number {
    console.log(
      1,
      this.getValue(NoiseCanvas.INTERAL_VARIABLE_NAMES.DISABLE_UPDATES),
    )
    return this.getValue(NoiseCanvas.INTERAL_VARIABLE_NAMES.USE_PROGRESS)!
  }

  //      Gets the disable_updates value saved in valuesRecord
  public getDisableUpdates(): boolean {
    console.log(
      2,
      this.getValue(NoiseCanvas.INTERAL_VARIABLE_NAMES.DISABLE_UPDATES),
    )
    return this.getValue(NoiseCanvas.INTERAL_VARIABLE_NAMES.DISABLE_UPDATES)!
  }

  //      Gets the seed value saved in valuesRecord
  public getSeed(): number {
    return this.getValue(NoiseCanvas.INTERAL_VARIABLE_NAMES.SEED)!
  }

  //      Gets the pixel_count value of the canvas (width * height)
  public getPixelCount(): number {
    return this.progressMemory?.length ?? 0
  }
  //#endregion
  //#endregion

  //#region         Direct Setters
  //      Assuming this is not a value connected from an HTMLInputElement, this method
  //      sets the inputs_root value, saved in valuesRecord
  public setInputsRoots(val: any): void {
    const name = NoiseCanvas.INTERAL_VARIABLE_NAMES.INPUTS_ROOT
    if (this.isValueConnected(name)) {
      return
    }

    this.valuesRecord[name] = val
    this.connectAll()
  }

  //      Assuming this is not a value connected from an HTMLInputElement, this method
  //      sets the resolution value, saved in valuesRecord
  public setResolution(val: any): void {
    const name = NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION
    if (this.isValueConnected(name)) {
      return
    }

    this.connectResolutionDependances(val)
    this.scheduleResolutionRefresh()
  }
  //      Assuming this is not a value connected from an HTMLInputElement, this method
  //      sets the resolution_x value, saved in valuesRecord
  public setResolutionX(val: any): void {
    const name = NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION_X
    if (this.isValueConnected(name)) {
      return
    }

    this.connectResolutionDependances(val)
    this.scheduleResolutionRefresh()
  }
  //      Assuming this is not a value connected from an HTMLInputElement, this method
  //      sets the resolution_y value, saved in valuesRecord
  public setResolutionY(val: any): void {
    const name = NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION_Y
    if (this.isValueConnected(name)) {
      return
    }

    this.connectResolutionDependances(val)
    this.scheduleResolutionRefresh()
  }

  //      Assuming this is not a value connected from an HTMLInputElement, this method
  //      sets the progress_cutoff value, saved in valuesRecord
  public setProgressCutoff(val: any): void {
    const name = NoiseCanvas.INTERAL_VARIABLE_NAMES.PROGRESS_CUTOFF
    if (this.isValueConnected(name)) {
      return
    }

    this.connectProgressDependances(val)
    this.scheduleProgressRefresh()
  }
  //      Assuming this is not a value connected from an HTMLInputElement, this method
  //      sets the progress_ratio value, saved in valuesRecord
  public setProgressRatio(val: any): void {
    const name = NoiseCanvas.INTERAL_VARIABLE_NAMES.PROGRESS_RATIO
    if (this.isValueConnected(name)) {
      return
    }

    this.connectProgressDependances(val)
    this.scheduleProgressRefresh()
  }
  //      Assuming this is not a value connected from an HTMLInputElement, this method
  //      sets the use_progress value, saved in valuesRecord
  public setUseProgress(val: any): void {
    const name = NoiseCanvas.INTERAL_VARIABLE_NAMES.USE_PROGRESS
    if (this.isValueConnected(name)) {
      return
    }

    this.connectProgressMemoryDependances(val)
    this.scheduleProgressMemoryRefresh()
  }

  //      Assuming this is not a value connected from an HTMLInputElement, this method
  //      sets the disable_updates value, saved in valuesRecord
  public setDisableUpdates(val: any): void {
    const name = NoiseCanvas.INTERAL_VARIABLE_NAMES.DISABLE_UPDATES
    if (this.isValueConnected(name)) {
      return
    }

    this.connectDrawDependances(val)
    this.scheduleDrawRefresh()
  }

  //      Assuming this is not a value connected from an HTMLInputElement, this method
  //      sets the seed value, saved in valuesRecord
  public setSeed(val: any): void {
    const name = NoiseCanvas.INTERAL_VARIABLE_NAMES.SEED
    if (this.isValueConnected(name)) {
      return
    }

    this.connectTextureDependances(val)
    this.scheduleTextureRefresh()
  }

  //      Assuming this is not a value connected from an HTMLInputElement, this method
  //      sets the value of a parameter, defined in getParameterNames(), saved in valuesRecord
  public setParameter(name: string, val: any): void {
    if (!this.getParameterNames().includes(name)) {
      throw TypeError(
        `Parameter ${name} does not exist on current Noise Canvas.`,
      )
    }
    if (this.isValueConnected(name)) {
      return
    }

    this.connectTextureDependances(val)
    this.scheduleTextureRefresh()
  }
  //#endregion
  //#endregion

  //#region Attribute Event Settup
  //#region     Connection
  //      Connects an HTMLInputElement or directly sets a value into the valuesRecord, with the given name as the
  //      key
  private connectName(
    name: string,
    onUpdate: () => void,
    fallback: HTMLInputElement[],
  ): void {
    this.disconnectName(name)

    const attribute = this.getAttribute(name)
    if (attribute !== null) {
      const sliderId = document.getElementById(attribute)
      if (sliderId !== null) {
        this.valuesRecord[name] = new InputContainer(
          sliderId as HTMLInputElement,
          onUpdate,
        )
        return
      }

      this.valuesRecord[name] = attribute
      console.log(name, this.valuesRecord[name])
    }

    const slider: HTMLInputElement | undefined = fallback.find(
      (val: HTMLInputElement) => val.name === name,
    )
    if (slider !== undefined) {
      this.valuesRecord[name] = new InputContainer(slider, onUpdate)
      return
    }

    this.valuesRecord[name] = this.getDefaultAttribute(name)
  }

  //      An abstract template used to connect an attribute for updates, or a direct set to the attribute in valuesRecord
  private connectTemplate(
    selectors: HTMLInputElement[] | undefined = undefined,
    names: string | string[],
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
  //      The default connector for resolution updates
  private connectResolutionDependances(
    selectors: HTMLInputElement[] | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    this.connectTemplate(
      selectors,
      name ?? [
        NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION,
        NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION_X,
        NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION_Y,
      ],
      this.scheduleResolutionMethod.bind(this),
    )
  }
  //      The default connector for parameter updates
  private connectTextureDependances(
    selectors: HTMLInputElement[] | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    this.connectTemplate(
      selectors,
      name ?? [
        ...this.getParameterNames(),
        NoiseCanvas.INTERAL_VARIABLE_NAMES.SEED,
      ],
      this.scheduleTextureMethod.bind(this),
    )
  }
  //      The default connector for progress updates
  private connectProgressMemoryDependances(
    selectors: HTMLInputElement[] | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    this.connectTemplate(
      selectors,
      name ?? [NoiseCanvas.INTERAL_VARIABLE_NAMES.USE_PROGRESS],
      this.scheduleProgresMemorysMethod.bind(this),
    )
  }
  //      The default connector for progress updates
  private connectProgressDependances(
    selectors: HTMLInputElement[] | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    this.connectTemplate(
      selectors,
      name ?? [
        NoiseCanvas.INTERAL_VARIABLE_NAMES.PROGRESS_CUTOFF,
        NoiseCanvas.INTERAL_VARIABLE_NAMES.PROGRESS_RATIO,
      ],
      this.scheduleProgressMethod.bind(this),
    )
  }
  //      The default connector for direct draw updates
  private connectDrawDependances(
    selectors: HTMLInputElement[] | undefined = undefined,
    name: string | undefined = undefined,
  ): void {
    this.connectTemplate(
      selectors,
      name ?? [NoiseCanvas.INTERAL_VARIABLE_NAMES.DISABLE_UPDATES],
      this.scheduleDrawMethod.bind(this),
    )
  }

  //      A methods that call all default connectors
  private connectAll(): void {
    const selectors = this.getSelectors()
    this.connectResolutionDependances(selectors)
    this.connectTextureDependances(selectors)
    this.connectProgressMemoryDependances(selectors)
    this.connectProgressDependances(selectors)
    this.connectDrawDependances(selectors)
  }
  //#endregion

  //#region     Disconnect
  //      Discnnects an HTMLInputElement or directly sets a name (in the valuesRecord) to undefined
  private disconnectName(name: string): void {
    if (!(name in this.valuesRecord)) return

    const slider = this.valuesRecord[name]

    if (slider instanceof InputContainer) {
      slider.disconnectUpdateMethod()
    }
    this.valuesRecord[name] = undefined
  }

  //      A methods that disconnects all HTMLInputElements saved in the valuesRecord
  private disconnectAll(): void {
    Object.values(this.valuesRecord).forEach((slider: any) => {
      if (slider instanceof InputContainer) {
        slider.disconnectUpdateMethod()
      }
    })
  }
  //#endregion
  //#endregion

  //#region Resolution/Draw/Texture Manipulation
  //#region     Resolution/Draw/Texture Scheduling
  //                Schedules a refresh, marking the resolution, texture, and progress cutoff dirty
  private scheduleResolutionRefresh(): void {
    this.resolutionDirty = true
    this.progressMemoryDirty = true
    this.textureDirty = true
    this.progressDirty = true
    this.scheduleDrawRefresh()
  }
  //                Schedules a refresh, marking the texture dirty
  private scheduleTextureRefresh(): void {
    this.textureDirty = true
    this.scheduleDrawRefresh()
  }
  //                Schedules a refresh, marking the progress memory dirty
  private scheduleProgressMemoryRefresh(): void {
    this.progressMemoryDirty = true
    this.progressDirty = true
    this.scheduleDrawRefresh()
  }
  //                Schedules a refresh, marking the progress cuttoff dirty
  private scheduleProgressRefresh(): void {
    this.progressDirty = true
    this.scheduleDrawRefresh()
  }
  //                Schedules a refresh
  private scheduleDrawRefresh(): void {
    cancelAnimationFrame(this.rafId)

    if (this.getDisableUpdates()) {
      return
    }
    this.rafId = requestAnimationFrame(() => this.canvasRefresh())
  }
  //                 Enacts a refresh, processing what is needed according to dirty flags
  private canvasRefresh(): void {
    if (this.resolutionDirty) {
      this.resizeCanvas()
      this.resolutionDirty = false
    }
    if (this.progressMemoryDirty) {
      this.createProgressMemory(this.texture.width * this.texture.height)
      this.progressMemoryDirty = false
    }
    if (this.textureDirty) {
      this.startTextureWrite()
      this.textureDirty = false
    }
    if (this.progressDirty) {
      this.updateProgressCutoff()
      this.progressDirty = false
    }

    this.startTextureDraw()
  }
  //#endregion

  //#region     Resolution/Draw/Texture Methods
  //      Resizes the texture, canvas, and requests a rewrite
  private resizeCanvas(): void {
    const canvas = this.canvas

    const baseResolution = this.getResolution()!
    const canvasX = Number(
      this.getValue(NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION_X) ??
        baseResolution,
    )
    const canvasY = Number(
      this.getValue(NoiseCanvas.INTERAL_VARIABLE_NAMES.RESOLUTION_Y) ??
        baseResolution,
    )

    canvas.width = canvasX
    canvas.height = canvasY
    this.texture = new ImageData(canvasX, canvasY)

    this.createProgressMemory(canvasX * canvasY)
  }

  //    Starts the write phase. It resets the seed and writePtr and then calls the abstract texture-writer method
  private startTextureWrite(): void {
    this.writePtr = 0

    this.settupSeed()
    this.writeTexture(this.texture)
  }

  //    Forces the draw phase. It draws the already-generated texture on the canvas.
  private startTextureDraw(): void {
    const cutoff = this.internalProgressCutoff

    if (this.drawCheck(this.texture, cutoff)) {
      this.drawTexture(this.texture, cutoff)
    }
  }
  //    Checks for base cases that can be used to skip uneeded processing, before attempting costly drawing.
  private drawCheck(texture: ImageData, cutoff: number): boolean {
    if (this.progressMemory === undefined || cutoff >= this.getPixelCount()) {
      this.ctx.putImageData(texture, 0, 0)
      return false
    }
    if (cutoff <= 0) {
      this.ctx.clearRect(0, 0, texture.width, texture.height)
      return false
    }
    return true
  }
  //    Draws the texture to the canvas, in order of how the pixels were writen to begin with, as saved
  //    in progressMemory
  private drawTexture(texture: ImageData, cutoff: number): void {
    const memory = this.progressMemory!
    const copyArr = new Uint8ClampedArray(memory.length << 2)
    const dataArr = texture.data

    let i = 0
    for (; i < cutoff; i++) {
      this.copyPixel(copyArr, dataArr, memory[i])
    }
    for (; i < memory.length; i++) {
      this.clearPixel(copyArr, memory[i])
    }

    this.ctx.putImageData(
      new ImageData(copyArr, texture.width, texture.height),
      0,
      0,
    )
  }
  //#endregion

  //#region Helper Methods
  //#region     DOM Search
  //      Gets the root where all HTMLInputElements, to be connected, are queried from.
  private getInputsRoot(): Document | Element {
    const baseRoot = this.getAttribute("inputs")
    return baseRoot === null
      ? document
      : (document.querySelector(baseRoot) ?? document)
  }
  //      From the root, provided by getInputsRoot, queries all HTMLInputElements with a name attribute.
  private getSelectors(): HTMLInputElement[] {
    return Array.from(
      this.getInputsRoot().querySelectorAll<HTMLInputElement>("input[name]"),
    )
  }
  //#endregion

  //#region     Progress
  //      Sets the cuttoff point for drawing to the canvas.
  private updateProgressCutoff(): void {
    const progressCutoff = this.getValue(
      NoiseCanvas.INTERAL_VARIABLE_NAMES.PROGRESS_CUTOFF,
    )

    if (progressCutoff !== undefined) {
      this.internalProgressCutoff = Number(progressCutoff)
    } else {
      const pixelCount = this.getPixelCount()
      const pixelRatio = this.getValue(
        NoiseCanvas.INTERAL_VARIABLE_NAMES.PROGRESS_RATIO,
      )

      if (pixelRatio !== undefined) {
        this.internalProgressCutoff = (Number(pixelRatio) * pixelCount) >>> 0
      } else {
        this.internalProgressCutoff = pixelCount
      }
    }
  }

  //        Dynamically creates an array of numbers to hold indexes. The array's bit size changes depending
  //        on the size of indexes it needs to store
  private createProgressMemory(maxIndex: number): void {
    if (!this.getUseProgress()) {
      this.progressMemory = undefined
      return
    }

    if (maxIndex <= 0xff) {
      this.progressMemory = new Uint8Array(maxIndex)
      return
    }
    if (maxIndex <= 0xffff) {
      this.progressMemory = new Uint16Array(maxIndex)
      return
    }
    if (maxIndex <= 0xffffffff) {
      this.progressMemory = new Uint32Array(maxIndex)
      return
    }

    throw new Error(
      "Cannot save the progress of a canvas with more than 0xffffffff pixels.",
    )
  }
  //#endregion

  //#region     Entire Canvas Updaters
  //        Fills the entire canvas with a single color and alpha
  protected fill(v: number, a: number): void {
    const width = this.texture.width
    const height = this.texture.height

    this.ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${a.toFixed(3)})`
    this.ctx.fillRect(0, 0, width, height)
  }
  //#endregion

  //#region     Pixel Canvus Updaters
  //#region         Index
  //        Converts a row and column to an array index
  protected getIndex(r: number, c: number): number {
    return r * this.texture.width + c
  }
  //#endregion

  //#region         Get Pixel
  //        Returns an array ([Value, Alpha]) of the pixel, in the writen texture, at the given index parameter.
  protected getPixel(idx: number): number[] {
    idx = idx << 2
    return [this.texture.data[idx], this.texture.data[idx + 3]]
  }
  //        Returns the color value of the pixel, in the writen texture, at the given index parameter.
  protected getPixelValue(idx: number): number {
    return this.texture.data[idx << 2]
  }
  //        Returns the alpha value of the pixel, in the writen texture, at the given index parameter.
  protected getPixelAlpha(idx: number): number {
    return this.texture.data[(idx << 2) + 3]
  }
  //#endregion

  //#region         Set Pixel
  //        Sets the pixel value, of unwriten texture, at the given index parameter. (Used in the write phase.)
  //        This also appends the index to the progressMemory for the draw phase.
  protected setPixel(idx: number, v: number): void {
    const texture = this.texture

    if (this.progressMemory !== undefined) {
      this.progressMemory[this.writePtr] = idx
      this.writePtr += 1
    }

    idx = idx << 2
    texture.data[idx] = v
    texture.data[idx + 1] = v
    texture.data[idx + 2] = v
    texture.data[idx + 3] = 255
  }
  //#endregion
  //#endregion

  //#region     Buffer Copy Methods
  //        Copies the pixel from a texture to a draw buffer
  protected copyPixel(
    drawTexture: Uint8ClampedArray,
    savedTexture: ImageDataArray,
    idx: number,
  ): void {
    idx = idx << 2

    drawTexture[idx] = savedTexture[idx]
    drawTexture[idx + 1] = savedTexture[idx + 1]
    drawTexture[idx + 2] = savedTexture[idx + 2]
    drawTexture[idx + 3] = savedTexture[idx + 3]
  }
  //        Sets the pixel, in a draw buffer, to a clear alpha.
  protected clearPixel(drawTexture: Uint8ClampedArray, idx: number): void {
    idx = idx << 2

    drawTexture[idx] = 0
    drawTexture[idx + 1] = 0
    drawTexture[idx + 2] = 0
    drawTexture[idx + 3] = 0
  }
  //#endregion

  //#region     Random Methods
  //        Sets up the randMethod's sfc32 method, based on the current seed of this element
  private settupSeed(): void {
    const hash = mulberry32(this.getSeed())
    this.randMethod = sfc32(hash(), hash(), hash(), hash())
  }

  //        Returns a random 32bit number
  protected random32bit(): number {
    return this.randMethod()
  }
  //        Returns a random 16bit number
  protected random16bit(): number {
    return this.randMethod() & 0xffff
  }
  //        Returns a random 8bit number
  protected random8bit(): number {
    return this.randMethod() & 0xff
  }

  //        Returns a random floating point number within [0, 1)
  protected randomUFloat(): number {
    return (this.randMethod() >>> 0) / 0x100000000
  }
  //        Returns a random floating point number within [-1, 1)
  protected randomFloat(): number {
    return (this.randMethod() | 0) / 0x80000000
  }
  //#endregion
  //#endregion
}
//#endregion
//#endregion

//#region White Noise
customElements.define(
  "white-noise",
  class WhiteNoiseCanvas extends NoiseCanvas {
    //#region Attribute Methods
    protected getParameterNames(): string[] {
      return []
    }
    protected getDefaultParameter(name: string) {
      return undefined
    }
    //#endregion

    //#region Buffer Draw Method
    protected writeTexture(texture: ImageData): void {
      const [width, height] = [texture.width, texture.height]

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
    private static readonly VARIABLE_NAMES = {
      INTENSITY: "intensity", // Defines how intense standard deviation values are consistered from the balancePoint
      BALANCE_POINT: "balancePoint", // Defines the "middle" point, which standard deviation will offset from
    } as const
    //#endregion

    //#region Attribute Methods
    protected getParameterNames(): string[] {
      return Object.values(GaussianNoise.VARIABLE_NAMES)
    }
    protected getDefaultParameter(name: string) {
      if (GaussianNoise.VARIABLE_NAMES.INTENSITY === name) {
        return 1.0
      } else if (GaussianNoise.VARIABLE_NAMES.BALANCE_POINT === name) {
        return 128
      }
      return undefined
    }

    static get observedAttributes(): string[] {
      return [
        ...(super.observedAttributes || []),
        ...Object.values(GaussianNoise.VARIABLE_NAMES),
      ]
    }
    //#endregion

    //#region     Base Attribute Accessors
    //#region         Setters
    public setIntensity(val: number): void {
      this.setParameter(GaussianNoise.VARIABLE_NAMES.INTENSITY, val)
    }
    //#endregion

    //#region         Getters
    //      Gets the intensity parameter saved in valuesRecord
    public getIntensity(): number {
      return this.getValue(GaussianNoise.VARIABLE_NAMES.INTENSITY)
    }
    //#endregion
    //#endregion

    //#region Buffer Draw Method
    protected writeTexture(texture: ImageData): void {
      const [width, height] = [texture.width, texture.height]
      const intensityScale = Number(
        this.getValue(GaussianNoise.VARIABLE_NAMES.INTENSITY),
      )
      const balancePoint = Number(
        this.getValue(GaussianNoise.VARIABLE_NAMES.BALANCE_POINT),
      )

      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          this.setPixel(
            this.getIndex(r, c),
            clamp(
              ((this.standardNormal() * intensityScale) | 0) + balancePoint,
              0,
              255,
            ),
          )
        }
      }
    }
    //#endregion

    //#region Helper Methods
    //    Returns a random number based on Standard Normal Distribution (mean 0, stdev 1)
    private standardNormal(): number {
      let u = 0
      let v = 0

      while (u === 0) u = this.randomUFloat()
      while (v === 0) v = this.randomUFloat()

      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
    }
    //#endregion
  },
)
//#endregion

//#region Random Walk Noise
//#region       Needed Types
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

type RandomWalkNoiseShapeType =
  | "diagonal"
  | "revDiagonal"
  | "horizontal"
  | "vertical"
  | "spiral"
  | "revSpiral"
  | "spread"
//#endregion

//#region       Class Definition
customElements.define(
  "random-walk-noise",
  class RandomWalkNoise extends NoiseCanvas {
    //#region Private Variables
    private static readonly VARIABLE_NAMES = {
      SOURCE_COLUMN: "sc", // The starting column for texture generation
      SOURCE_ROW: "sr", // The starting row for texture generation
      INTENSITY: "intensity", // Defines how large each step in the walk can increase or decrease a pixel's value
      BALANCE_POINT: "balancePoint", // Defines the "middle" point, which all pixel values will be pulled to
      PULL: "pull", // A factor multiplied to every pixel's value, which pulls the value closer to it's balancePoint
      SHAPE: "shape", // The type of random walk algorithm being used
    } as const
    //#endregion

    //#region Attribute Methods
    //        Returns needed attribute parameters
    protected getParameterNames(): string[] {
      return Object.values(RandomWalkNoise.VARIABLE_NAMES)
    }
    //        Returns the default value of all needed attribute parameters
    protected getDefaultParameter(name: string) {
      if (
        RandomWalkNoise.VARIABLE_NAMES.SOURCE_COLUMN === name ||
        RandomWalkNoise.VARIABLE_NAMES.SOURCE_ROW === name
      ) {
        return 0
      } else if (RandomWalkNoise.VARIABLE_NAMES.INTENSITY === name) {
        return 1.0
      } else if (RandomWalkNoise.VARIABLE_NAMES.BALANCE_POINT === name) {
        return 128
      } else if (RandomWalkNoise.VARIABLE_NAMES.PULL === name) {
        return 0.99
      } else if (RandomWalkNoise.VARIABLE_NAMES.SHAPE === name) {
        return "spread"
      }
      return undefined
    }

    static get observedAttributes(): string[] {
      return [
        ...(super.observedAttributes || []),
        ...Object.values(RandomWalkNoise.VARIABLE_NAMES),
      ]
    }
    //#endregion

    //#region     Base Attribute Accessors
    //#region         Setters
    //      Assuming this is not a value connected from an HTMLInputElement, this method
    //      sets the source_column value, saved in NoiseCanvas.valuesRecord
    public setSourceColumn(val: number): void {
      this.setParameter(RandomWalkNoise.VARIABLE_NAMES.SOURCE_COLUMN, val)
    }
    //      Assuming this is not a value connected from an HTMLInputElement, this method
    //      sets the source_row value, saved in NoiseCanvas.valuesRecord
    public setSourceRow(val: number): void {
      this.setParameter(RandomWalkNoise.VARIABLE_NAMES.SOURCE_ROW, val)
    }

    //      Assuming this is not a value connected from an HTMLInputElement, this method
    //      sets the intensity value, saved in NoiseCanvas.valuesRecord
    public setIntensity(val: number): void {
      this.setParameter(RandomWalkNoise.VARIABLE_NAMES.INTENSITY, val)
    }
    //      Assuming this is not a value connected from an HTMLInputElement, this method
    //      sets the balance_point value, saved in NoiseCanvas.valuesRecord
    public setBalancePoint(val: number): void {
      this.setParameter(RandomWalkNoise.VARIABLE_NAMES.BALANCE_POINT, val)
    }

    //      Assuming this is not a value connected from an HTMLInputElement, this method
    //      sets the pull value, saved in NoiseCanvas.valuesRecord
    public setPull(val: number): void {
      this.setParameter(RandomWalkNoise.VARIABLE_NAMES.PULL, val)
    }

    //      Assuming this is not a value connected from an HTMLInputElement, this method
    //      sets the shape value, saved in NoiseCanvas.valuesRecord
    public setShape(val: RandomWalkNoiseShapeType): void {
      this.setParameter(RandomWalkNoise.VARIABLE_NAMES.SHAPE, val)
    }
    //#endregion

    //#region         Getters
    //      Gets the source_column parameter saved in valuesRecord
    public getSourceColumn(): number {
      return this.getValue(RandomWalkNoise.VARIABLE_NAMES.SOURCE_COLUMN)
    }
    //      Gets the source_row parameter saved in valuesRecord
    public getSourceRow(): number {
      return this.getValue(RandomWalkNoise.VARIABLE_NAMES.SOURCE_ROW)
    }

    //      Gets the intensity parameter saved in valuesRecord
    public getIntensity(): number {
      return this.getValue(RandomWalkNoise.VARIABLE_NAMES.INTENSITY)
    }
    //      Gets the balence_point parameter saved in valuesRecord
    public getBalancePoint(): number {
      return this.getValue(RandomWalkNoise.VARIABLE_NAMES.BALANCE_POINT)
    }

    //      Gets the shape pull saved in valuesRecord
    public getPull(): number {
      return this.getValue(RandomWalkNoise.VARIABLE_NAMES.PULL)
    }

    //      Gets the shape parameter saved in valuesRecord
    public getShape(): RandomWalkNoiseShapeType {
      return this.getValue(RandomWalkNoise.VARIABLE_NAMES.SHAPE)
    }
    //#endregion
    //#endregion

    //#region Buffer Draw Method
    protected writeTexture(texture: ImageData): void {
      const [width, height] = [texture.width, texture.height]

      const sc = clamp(
        Number(this.getValue(RandomWalkNoise.VARIABLE_NAMES.SOURCE_COLUMN)),
        0,
        width,
      )
      const sr = clamp(
        Number(this.getValue(RandomWalkNoise.VARIABLE_NAMES.SOURCE_ROW)),
        0,
        height,
      )
      const sIdx = this.getIndex(sr, sc)
      const intensityScale = Number(
        this.getValue(RandomWalkNoise.VARIABLE_NAMES.INTENSITY),
      )
      const balancePoint = Number(
        this.getValue(RandomWalkNoise.VARIABLE_NAMES.BALANCE_POINT),
      )
      const pull = Number(this.getValue(RandomWalkNoise.VARIABLE_NAMES.PULL))
      const shape = this.getValue(
        RandomWalkNoise.VARIABLE_NAMES.SHAPE,
      ) as RandomWalkNoiseShapeType

      //      A lambda used to set the current pixel with the correct random value, according to it's neighbors.
      //      Defined here to keep all relevant parameters in local scope.
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
    // A template method used to make defining random walk algorithms easy
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

    // Defines a random walk algorithm that spreads outwards, in all directions, equally
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

//#endregion
