const clamp = (num: number, min: number, max: number) =>
  Math.min(Math.max(num, min), max)

abstract class NoiseCanvas extends HTMLElement {
  protected shadow: ShadowRoot
  protected canvas: HTMLCanvasElement
  protected ctx: CanvasRenderingContext2D

  private buffer: ImageData

  private resizeObserver?: ResizeObserver
  private frame = 0

  constructor() {
    super()

    this.shadow = this.attachShadow({ mode: "closed" })
    this.shadow.innerHTML = `
      <style>
        canvas {
          width: 100%;
          height: 100%;
          object-fit: contain;
        }
      </style>
      <canvas></canvas>
    `

    this.canvas = this.shadow.querySelector("canvas")!
    console.log(this.canvas)
    const ctx = this.canvas.getContext("2d")
    if (!ctx) throw new Error("2D canvas context not available")

    this.ctx = ctx
    this.buffer = new ImageData(1, 1)
  }

  // abstract
  protected abstract connectSliders(): void

  protected abstract draw(width: number, height: number): void

  // Dom Enter/Exit
  connectedCallback() {
    this.resizeCanvas()
    this.redraw()

    this.resizeObserver = new ResizeObserver(() => this.resizeCanvas())
    this.resizeObserver.observe(this)
  }

  disconnectedCallback() {
    this.resizeObserver?.disconnect()
    cancelAnimationFrame(this.frame)
  }

  // Attribute Changes
  static get observedAttributes() {
    return ["slider-container-id"]
  }

  attributeChangedCallback(name: string, oldValue: string, newValue: string) {
    if (oldValue !== newValue) {
      if (name === "slider-container-id") {
        this.updateSliderContainer(newValue)
      }
    }
  }

  get sliderContainerId() {
    return this.getAttribute("slider-container-id")
  }

  set sliderContainerId(val) {
    this.setAttribute("slider-container-id", val!)
  }

  // Canvas
  private resizeCanvas() {
    const rect = this.canvas.getBoundingClientRect()
    const dpr = window.devicePixelRatio || 1

    this.canvas.width = Math.max(1, Math.floor(rect.width * dpr))
    this.canvas.height = Math.max(1, Math.floor(rect.height * dpr))

    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    this.buffer = this.ctx.createImageData(
      this.canvas.width,
      this.canvas.height,
    )

    this.scheduleDraw()
  }

  // Draw
  private scheduleDraw() {
    cancelAnimationFrame(this.frame)
    this.frame = requestAnimationFrame(() => this.redraw())
  }

  private redraw() {
    const width = this.canvas.width
    const height = this.canvas.height

    this.draw(width, height)
    this.ctx.putImageData(this.buffer, 0, 0)
  }

  // Sliders
  updateSliderContainer(newId: string) {}

  // Helper
  //    Index
  private getIndex(r: number, c: number): number {
    return (r * this.canvas.width + c) << 2
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
    const index = this.getIndex(r, c)
    return [this.buffer.data[index], this.buffer.data[index + 3]]
  }
  //        Returns Value
  protected getPixelValue(r: number, c: number): number {
    const index = this.getIndex(r, c)
    return this.buffer.data[index]
  }
  //        Returns Alpha
  protected getPixelAlpha(r: number, c: number): number {
    const index = this.getIndex(r, c)
    return this.buffer.data[index + 3]
  }

  protected setPixel(r: number, c: number, v: number): void {
    const buffer = this.buffer

    const index = this.getIndex(r, c)
    buffer.data[index] = v
    buffer.data[index + 1] = v
    buffer.data[index + 2] = v
    buffer.data[index + 3] = 255
  }
  protected random8bit(): number {
    return (Math.random() * 256) | 0
  }
}

customElements.define(
  "white-noise",
  class WhiteNoiseCanvas extends NoiseCanvas {
    protected connectSliders(): void {}

    protected draw(width: number, height: number): void {
      for (let r = 0; r < height; r++) {
        for (let c = 0; c < width; c++) {
          this.setPixel(r, c, this.random8bit())
        }
      }
    }
  },
)

customElements.define(
  "gaussian-noise",
  class GaussianNoise extends NoiseCanvas {
    private intensity_scale: number = 50

    private standardNormal(): number {
      let u = 0
      let v = 0

      while (u === 0) u = Math.random()
      while (v === 0) v = Math.random()

      // Standard Normal Distribution (mean 0, stdev 1)
      return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v)
    }

    protected connectSliders(): void {}

    protected draw(width: number, height: number): void {
      const intensity_scale = this.intensity_scale

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

customElements.define(
  "random-walk-noise",
  class RandomWalkNoise extends NoiseCanvas {
    private sc: number = 0
    private sr: number = 0
    private intensity_scale: number = 20
    private balance_point: number = 128
    private pull: number = 0.99

    protected connectSliders(): void {}

    protected draw(width: number, height: number): void {
      const [sc, sr, intensity_scale, balance_point, pull] = [
        clamp(this.sc, 0, width),
        clamp(this.sr, 0, height),
        this.intensity_scale,
        this.balance_point,
        this.pull,
      ]

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
