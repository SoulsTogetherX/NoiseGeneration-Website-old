//#region Helper Methods
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
//#endregion
//#region Noise Canvases
//#region Abstract
class InputContainer {
    constructor(inputElement, onUpdate) {
        this.inputElement = inputElement;
        this.onUpdateMethod = onUpdate;
        this.inputElement.addEventListener("input", this.onUpdateMethod);
    }
    disconnectUpdateMethod() {
        this.inputElement.removeEventListener("input", this.onUpdateMethod);
    }
    getValue() {
        return this.inputElement.value;
    }
}
class NoiseCanvas extends HTMLElement {
    constructor() {
        super();
        this.writeIdx = 0;
        this.allowCanvasDisplay = true;
        this.frame = 0;
        this.valueInputs = {};
        this.valueUpdaterMethod = this.scheduleBufferRefresh.bind(this);
        this.resolutionUpdaterMethod = this.resizeCanvas.bind(this);
        this.progressUpdaterMethod = this.forceDraw.bind(this);
        this.shadow = this.attachShadow({ mode: "closed" });
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
    `;
        this.updateAllowCanvasDisplay();
        this.canvas = this.shadow.querySelector("canvas");
        const ctx = this.canvas.getContext("2d");
        if (!ctx)
            throw new Error("2D canvas context not available");
        ctx.imageSmoothingEnabled = false;
        this.ctx = ctx;
        this.buffer = new ImageData(1, 1);
    }
    // Dom Enter/Exit
    connectedCallback() {
        this.connectAll();
        this.resizeCanvas();
        this.refreshBuffer();
    }
    disconnectedCallback() {
        cancelAnimationFrame(this.frame);
        this.disconnectAll();
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
        ];
    }
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            if (name === "resolution" ||
                name === "resolutionX" ||
                name === "resolutionY") {
                this.connectResolution(undefined, newValue);
                this.resizeCanvas();
            }
            else if (name === "draw") {
                this.updateAllowCanvasDisplay();
                this.forceDraw();
            }
            else if (name === "useProgress") {
                this.progressMemory = this.createProgressMemory(this.buffer.width * this.buffer.height);
                this.forceDraw();
            }
            else if (name === "progress") {
                this.connectProgress(undefined, newValue);
                this.forceDraw();
            }
            else if (this.getValueNames().includes(name)) {
                this.connectValues(undefined, newValue);
                this.scheduleBufferRefresh();
            }
        }
    }
    // Canvas
    resizeCanvas() {
        var _a, _b, _c, _d;
        const canvas = this.canvas;
        const [resolution, resolutionX, resolutionY] = NoiseCanvas.resolutionNames;
        const baseResolution = this.getValue(resolution);
        const canvasX = Number((_b = (_a = this.getValue(resolutionX)) !== null && _a !== void 0 ? _a : baseResolution) !== null && _b !== void 0 ? _b : NoiseCanvas.DEFAULT_RESOLUTION);
        const canvasY = Number((_d = (_c = this.getValue(resolutionY)) !== null && _c !== void 0 ? _c : baseResolution) !== null && _d !== void 0 ? _d : NoiseCanvas.DEFAULT_RESOLUTION);
        canvas.width = canvasX;
        canvas.height = canvasY;
        this.buffer = new ImageData(canvasX, canvasY);
        this.progressMemory = this.createProgressMemory(canvasX * canvasY);
        this.scheduleBufferRefresh();
    }
    // Draw Buffer
    scheduleBufferRefresh() {
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => this.refreshBuffer());
    }
    refreshBuffer() {
        this.writeIdx = 0;
        this.setBuffer(this.buffer);
        this.forceDraw();
    }
    forceDraw() {
        if (this.drawCheck(this.buffer, this.getProgress())) {
            this.drawBuffer(this.buffer, this.getProgress());
        }
    }
    drawBuffer(buffer, progress) {
        const memory = this.progressMemory;
        const cutoff = Math.floor(memory.length * progress);
        const copyArr = new Uint8ClampedArray(memory.length << 2);
        const dataArr = buffer.data;
        let i = 0;
        for (; i < cutoff; i++) {
            this.copyPixel(copyArr, dataArr, memory[i]);
        }
        for (; i < memory.length; i++) {
            this.clearPixel(copyArr, memory[i]);
        }
        this.ctx.putImageData(new ImageData(copyArr, buffer.width, buffer.height), 0, 0);
    }
    // Draw Frame
    drawCheck(buffer, progress) {
        if (!this.allowCanvasDisplay) {
            this.ctx.clearRect(0, 0, buffer.width, buffer.height);
            return false;
        }
        if (this.progressMemory === undefined || progress >= 1.0) {
            this.ctx.putImageData(buffer, 0, 0);
            return false;
        }
        if (progress <= 0.0) {
            this.ctx.clearRect(0, 0, buffer.width, buffer.height);
            return false;
        }
        return true;
    }
    // ValueTypes
    getInputsRoot() {
        var _a;
        const baseRoot = this.getAttribute("inputs");
        return baseRoot === null
            ? document
            : ((_a = document.querySelector(baseRoot)) !== null && _a !== void 0 ? _a : document);
    }
    getSelectors() {
        return Array.from(this.getInputsRoot().querySelectorAll("input[name]"));
    }
    getValueFromType(val) {
        if (val === undefined) {
            return undefined;
        }
        if (typeof val === "string") {
            return val;
        }
        return val.getValue();
    }
    getValue(name) {
        return this.getValueFromType(this.valueInputs[name]);
    }
    //    Connect
    connectName(name, onUpdate, fallback) {
        if (name in this.valueInputs) {
            this.disconnectName(name);
        }
        const attribute = this.getAttribute(name);
        if (attribute !== null) {
            if (!isNaN(Number(attribute)) && attribute.trim() !== "") {
                this.valueInputs[name] = attribute;
                return;
            }
            const sliderId = document.getElementById(attribute);
            if (sliderId !== null) {
                this.valueInputs[name] = new InputContainer(sliderId, onUpdate);
                return;
            }
        }
        const slider = fallback.find((val) => val.name === name);
        if (slider !== undefined) {
            this.valueInputs[name] = new InputContainer(slider, onUpdate);
            return;
        }
    }
    connectValues(selectors = undefined, name = undefined) {
        if (selectors === undefined) {
            selectors = this.getSelectors();
        }
        if (name !== undefined) {
            this.connectName(name, this.valueUpdaterMethod, selectors);
            return;
        }
        this.getValueNames().map((val) => this.connectName(val, this.valueUpdaterMethod, selectors));
    }
    connectResolution(selectors = undefined, name = undefined) {
        if (selectors === undefined) {
            selectors = this.getSelectors();
        }
        if (name !== undefined) {
            this.connectName(name, this.resolutionUpdaterMethod, selectors);
            return;
        }
        NoiseCanvas.resolutionNames.map((val) => this.connectName(val, this.resolutionUpdaterMethod, selectors));
    }
    connectProgress(selectors = undefined, name = undefined) {
        if (selectors === undefined) {
            selectors = this.getSelectors();
        }
        if (name !== undefined) {
            this.connectName(name, this.progressUpdaterMethod, selectors);
            return;
        }
        NoiseCanvas.progressNames.map((val) => this.connectName(val, this.progressUpdaterMethod, selectors));
    }
    connectAll() {
        const selectors = this.getSelectors();
        this.connectValues(selectors);
        this.connectResolution(selectors);
        this.connectProgress(selectors);
    }
    //    Disconnect
    disconnectName(name) {
        const slider = this.valueInputs[name];
        if (slider instanceof InputContainer) {
            slider.disconnectUpdateMethod();
        }
        delete this.valueInputs[name];
    }
    disconnectAll() {
        Object.values(this.valueInputs).forEach((slider) => {
            if (slider instanceof InputContainer) {
                slider.disconnectUpdateMethod();
            }
        });
        this.valueInputs = {};
    }
    // Helper
    //    Progress
    getProgress() {
        var _a;
        return ((_a = Number(this.getValue(NoiseCanvas.progressNames[0]))) !== null && _a !== void 0 ? _a : NoiseCanvas.DEFAULT_PROGRESS);
    }
    updateAllowCanvasDisplay() {
        this.allowCanvasDisplay = !(this.getAttribute("draw") === "false");
    }
    //    Create Progress Memory
    createProgressMemory(countmaxIndex) {
        if (this.getAttribute("useProgress") !== "true") {
            return undefined;
        }
        if (countmaxIndex <= 0xff)
            return new Uint8Array(countmaxIndex);
        if (countmaxIndex <= 0xffff)
            return new Uint16Array(countmaxIndex);
        if (countmaxIndex <= 0xffffffff)
            return new Uint32Array(countmaxIndex);
        return undefined;
    }
    //    Index
    getIndex(r, c) {
        return r * this.buffer.width + c;
    }
    //    Canvas
    fill(v, a) {
        const width = this.canvas.width;
        const height = this.canvas.height;
        this.ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${a.toFixed(3)})`;
        this.ctx.fillRect(0, 0, width, height);
    }
    //    Pixel
    //        Returns [Value, Alpha]
    getPixel(idx) {
        idx = idx << 2;
        return [this.buffer.data[idx], this.buffer.data[idx + 3]];
    }
    //        Returns Value
    getPixelValue(idx) {
        return this.buffer.data[idx << 2];
    }
    //        Returns Alpha
    getPixelAlpha(idx) {
        return this.buffer.data[(idx << 2) + 3];
    }
    setPixel(idx, v) {
        const buffer = this.buffer;
        if (this.progressMemory !== undefined) {
            this.progressMemory[this.writeIdx] = idx;
            this.writeIdx += 1;
        }
        idx = idx << 2;
        buffer.data[idx] = v;
        buffer.data[idx + 1] = v;
        buffer.data[idx + 2] = v;
        buffer.data[idx + 3] = 255;
    }
    copyPixel(newBuffer, oldBuffer, idx) {
        idx = idx << 2;
        newBuffer[idx] = oldBuffer[idx];
        newBuffer[idx + 1] = oldBuffer[idx + 1];
        newBuffer[idx + 2] = oldBuffer[idx + 2];
        newBuffer[idx + 3] = oldBuffer[idx + 3];
    }
    clearPixel(newBuffer, idx) {
        idx = idx << 2;
        newBuffer[idx] = 0;
        newBuffer[idx + 1] = 0;
        newBuffer[idx + 2] = 0;
        newBuffer[idx + 3] = 0;
    }
    //    Random Help
    random8bit() {
        return (Math.random() * 256) | 0;
    }
}
NoiseCanvas.DEFAULT_RESOLUTION = "50";
NoiseCanvas.DEFAULT_PROGRESS = 1.0;
NoiseCanvas.resolutionNames = [
    "resolution",
    "resolutionX",
    "resolutionY",
];
NoiseCanvas.progressNames = ["progress"];
//#endregion
//#region White Noise
customElements.define("white-noise", class WhiteNoiseCanvas extends NoiseCanvas {
    getValueNames() {
        return [];
    }
    setBuffer(buffer) {
        const [width, height] = [buffer.width, buffer.height];
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                this.setPixel(this.getIndex(r, c), this.random8bit());
            }
        }
    }
});
//#endregion
//#region Gaussian Noise
customElements.define("gaussian-noise", class GaussianNoise extends NoiseCanvas {
    getValueNames() {
        return ["intensity"];
    }
    static get observedAttributes() {
        return [...(super.observedAttributes || []), "intensity"];
    }
    standardNormal() {
        let u = 0;
        let v = 0;
        while (u === 0)
            u = Math.random();
        while (v === 0)
            v = Math.random();
        // Standard Normal Distribution (mean 0, stdev 1)
        return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
    }
    setBuffer(buffer) {
        var _a;
        const [width, height] = [buffer.width, buffer.height];
        const intensity_scale = (_a = Number(this.getValue("intensity"))) !== null && _a !== void 0 ? _a : 50;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                this.setPixel(this.getIndex(r, c), clamp(((this.standardNormal() * intensity_scale) | 0) + 128, 0, 255));
            }
        }
    }
});
customElements.define("random-walk-noise", class RandomWalkNoise extends NoiseCanvas {
    getValueNames() {
        return ["sc", "sr", "intensity", "balancePoint", "pull", "shape"];
    }
    setBuffer(buffer) {
        var _a, _b, _c, _d, _e, _f;
        const [width, height] = [buffer.width, buffer.height];
        const shape = (_a = this.getValue("shape")) !== null && _a !== void 0 ? _a : "spread";
        const sc = clamp(Number((_b = this.getValue("sc")) !== null && _b !== void 0 ? _b : 0), 0, width);
        const sr = clamp(Number((_c = this.getValue("sr")) !== null && _c !== void 0 ? _c : 0), 0, height);
        const sIdx = this.getIndex(sr, sc);
        const intensityScale = Number((_d = this.getValue("intensity")) !== null && _d !== void 0 ? _d : 20);
        const balancePoint = Number((_e = this.getValue("balancePoint")) !== null && _e !== void 0 ? _e : 128);
        const pull = Number((_f = this.getValue("pull")) !== null && _f !== void 0 ? _f : 0.99);
        const setWalkPixel = (sum, count, idx, memo) => {
            const value = clamp((count === 0 ? this.random8bit() - balancePoint : sum / count) *
                pull +
                (Math.random() * 2 - 1) * intensityScale, -balancePoint, 255 - balancePoint);
            memo[idx] = value;
            this.setPixel(idx, (value + balancePoint) | 0);
        };
        switch (shape) {
            case "diagonal":
                break;
            case "revDiagonal":
                break;
            case "horizontal":
                break;
            case "vertical":
                break;
            case "spread":
            default:
                this.walkSpread(width, height, sIdx, setWalkPixel);
        }
    }
    walkSpread(width, height, sIdx, setWalkPixel) {
        const memo = Array(width * height).fill(0);
        this.fill(0, 0);
        let open = [sIdx];
        let closed = [];
        while (open.length > 0) {
            closed = open;
            open = [];
            while (closed.length > 0) {
                const currentIdx = closed.pop();
                const [r, c] = [Math.floor(currentIdx / width), currentIdx % width];
                let count = 0;
                let sum = 0;
                if (this.getPixelAlpha(currentIdx) > 0)
                    continue;
                if (r > 0) {
                    const idx = this.getIndex(r - 1, c);
                    const alpha = this.getPixelAlpha(idx);
                    if (alpha > 0) {
                        sum += memo[idx];
                        count += 1;
                    }
                    else {
                        open.push(idx);
                    }
                }
                if (c > 0) {
                    const idx = this.getIndex(r, c - 1);
                    const alpha = this.getPixelAlpha(idx);
                    if (alpha > 0) {
                        sum += memo[idx];
                        count += 1;
                    }
                    else {
                        open.push(idx);
                    }
                }
                if (r < height - 1) {
                    const idx = this.getIndex(r + 1, c);
                    const alpha = this.getPixelAlpha(idx);
                    if (alpha > 0) {
                        sum += memo[idx];
                        count += 1;
                    }
                    else {
                        open.push(idx);
                    }
                }
                if (c < width - 1) {
                    const idx = this.getIndex(r, c + 1);
                    const alpha = this.getPixelAlpha(idx);
                    if (alpha > 0) {
                        sum += memo[idx];
                        count += 1;
                    }
                    else {
                        open.push(idx);
                    }
                }
                setWalkPixel(sum, count, currentIdx, memo);
            }
        }
    }
});
//#endregion
//#endregion
