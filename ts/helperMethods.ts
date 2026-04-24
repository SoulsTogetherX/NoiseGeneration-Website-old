//#region Helper Types
export type RGB = `rgb(${number}, ${number}, ${number}, ${number})`
export type RGBA = `rgba(${number}, ${number}, ${number}, ${number})`
export type HEX = `#${string}`
export type ColorString = RGB | RGBA | HEX
export type ColorValue = {
  r: number
  g: number
  b: number
  a: number
}
//#endregion

//#region Helper Methods
//#region Unexported Hex Methods
function parseHexNibble(ch: string): number {
  const n = parseInt(ch + ch, 16)
  if (Number.isNaN(n)) throw new Error(`Invalid hex digit: ${ch}`)
  return n
}

function parseHexByte(s: string): number {
  const n = parseInt(s, 16)
  if (Number.isNaN(n)) throw new Error(`Invalid hex byte: ${s}`)
  return n
}
function hexToColorValue(hex: string): ColorValue {
  // #RGB
  if (hex.length === 4) {
    const r = parseHexNibble(hex[1])
    const g = parseHexNibble(hex[2])
    const b = parseHexNibble(hex[3])
    return { r, g, b, a: 255 }
  }

  // #RGBA
  if (hex.length === 5) {
    const r = parseHexNibble(hex[1])
    const g = parseHexNibble(hex[2])
    const b = parseHexNibble(hex[3])
    const a = parseHexNibble(hex[4])
    return { r, g, b, a }
  }

  // #RRGGBB
  if (hex.length === 7) {
    return {
      r: parseHexByte(hex.slice(1, 3)),
      g: parseHexByte(hex.slice(3, 5)),
      b: parseHexByte(hex.slice(5, 7)),
      a: 255,
    }
  }

  // #RRGGBBAA
  if (hex.length === 9) {
    return {
      r: parseHexByte(hex.slice(1, 3)),
      g: parseHexByte(hex.slice(3, 5)),
      b: parseHexByte(hex.slice(5, 7)),
      a: parseHexByte(hex.slice(7, 9)),
    }
  }

  throw new Error(`Invalid hex color: ${hex}`)
}
//#endregion

//#region Small Methods
export function clamp(num: number, min: number, max: number) {
  return Math.min(Math.max(num, min), max)
}
export function lerp(a: number, b: number, d: number): number {
  return a + (b - a) * d
}
//#endregion

//#region Color Methods
export function interpolateColors(
  c1: ColorValue,
  c2: ColorValue,
  val: number,
): ColorValue {
  return {
    r: Math.round(lerp(c1.r, c2.r, val)),
    g: Math.round(lerp(c1.g, c2.g, val)),
    b: Math.round(lerp(c1.b, c2.b, val)),
    a: Math.round(lerp(c1.a, c2.a, val)),
  }
}

export function colorValueToString(color: ColorValue): RGBA {
  return `rgba(${clamp(color.r, 0, 255)}, ${clamp(color.g, 0, 255)}, ${clamp(color.b, 0, 255)}, ${clamp(color.a, 0, 255)})`
}
export function colorStringToValue(input: ColorString): ColorValue {
  const s = input.trim().toLowerCase()

  if (s.startsWith("#")) {
    return hexToColorValue(s)
  }

  if (s.startsWith("rgb(")) {
    const parts = s
      .slice(4, -1)
      .split(",")
      .map((x) => x.trim())
    if (parts.length !== 3) throw new Error(`Invalid rgb color: ${input}`)

    return {
      r: clamp(Number(parts[0]), 0, 255),
      g: clamp(Number(parts[1]), 0, 255),
      b: clamp(Number(parts[2]), 0, 255),
      a: 1,
    }
  }

  if (s.startsWith("rgba(")) {
    const parts = s
      .slice(5, -1)
      .split(",")
      .map((x) => x.trim())
    if (parts.length !== 4) throw new Error(`Invalid rgba color: ${input}`)

    return {
      r: clamp(Number(parts[0]), 0, 255),
      g: clamp(Number(parts[1]), 0, 255),
      b: clamp(Number(parts[2]), 0, 255),
      a: clamp(Number(parts[3]), 0, 1),
    }
  }

  throw new Error(`Unsupported color string: ${input}`)
}
//#endregion

//#region Random Number Generators
export function xmur3(str: string): () => number {
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

export function mulberry32(a: number): () => number {
  return (): number => {
    let t = (a += 0x6d2b79f5)

    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return (t ^ (t >>> 14)) >>> 0
  }
}

export function sfc32(
  a: number,
  b: number,
  c: number,
  d: number,
): () => number {
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
