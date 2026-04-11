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
        this.memory = new Uint32Array();
        this.writeIdx = 0;
        this.useProgress = true;
        this.frame = 0;
        this.valueInputs = {};
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
            "hide",
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
        this.scheduleBufferRefresh();
    }
    // Draw Buffer
    scheduleBufferRefresh() {
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => this.refreshBuffer());
    }
    refreshBuffer() {
        if (this.useProgress) {
            this.memory = new Uint32Array(this.buffer.width * this.buffer.height);
            this.writeIdx = 0;
        }
        this.setBuffer(this.buffer);
        console.log(this.writeIdx, this.memory);
        this.forceDraw();
    }
    forceDraw() {
        if (this.drawCheck(this.buffer, this.getProgress())) {
            this.drawBuffer(this.buffer, this.getProgress());
        }
    }
    drawBuffer(buffer, progress) {
        const memory = this.memory;
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
        if (progress <= 0.0) {
            this.ctx.clearRect(0, 0, buffer.width, buffer.height);
            return false;
        }
        if (progress >= 1.0) {
            this.ctx.putImageData(buffer, 0, 0);
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
        if (typeof val === "number") {
            return val;
        }
        return Number(val.getValue());
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
                this.valueInputs[name] = Number(attribute);
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
            this.connectName(name, this.scheduleBufferRefresh.bind(this), selectors);
            return;
        }
        this.getValueNames().map((val) => this.connectName(val, this.scheduleBufferRefresh.bind(this), selectors));
    }
    connectResolution(selectors = undefined, name = undefined) {
        if (selectors === undefined) {
            selectors = this.getSelectors();
        }
        if (name !== undefined) {
            this.connectName(name, this.resizeCanvas.bind(this), selectors);
            return;
        }
        NoiseCanvas.resolutionNames.map((val) => this.connectName(val, this.resizeCanvas.bind(this), selectors));
    }
    connectProgress(selectors = undefined, name = undefined) {
        if (selectors === undefined) {
            selectors = this.getSelectors();
        }
        if (name !== undefined) {
            this.connectName(name, this.forceDraw.bind(this), selectors);
            return;
        }
        NoiseCanvas.progressNames.map((val) => this.connectName(val, this.forceDraw.bind(this), selectors));
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
        return ((_a = this.getValue(NoiseCanvas.progressNames[0])) !== null && _a !== void 0 ? _a : NoiseCanvas.DEFAULT_PROGRESS);
    }
    //    Index
    getIndex(r, c) {
        return r * this.canvas.width + c;
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
    getPixel(r, c) {
        const index = this.getIndex(r, c) << 2;
        return [this.buffer.data[index], this.buffer.data[index + 3]];
    }
    //        Returns Value
    getPixelValue(r, c) {
        const index = this.getIndex(r, c) << 2;
        return this.buffer.data[index];
    }
    //        Returns Alpha
    getPixelAlpha(r, c) {
        const index = this.getIndex(r, c) << 2;
        return this.buffer.data[index + 3];
    }
    setPixel(r, c, v) {
        const buffer = this.buffer;
        let index = this.getIndex(r, c);
        if (this.useProgress) {
            this.memory[this.writeIdx] = index;
            this.writeIdx += 1;
        }
        index = index << 2;
        buffer.data[index] = v;
        buffer.data[index + 1] = v;
        buffer.data[index + 2] = v;
        buffer.data[index + 3] = 255;
    }
    copyPixel(newBuffer, oldBuffer, idx) {
        idx = idx << 2;
        newBuffer[idx] = oldBuffer[idx];
        newBuffer[idx + 1] = oldBuffer[idx];
        newBuffer[idx + 2] = oldBuffer[idx];
        newBuffer[idx + 3] = oldBuffer[idx];
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
NoiseCanvas.resolutionNames = ["resolution", "resolutionX", "resolutionY"];
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
                this.setPixel(r, c, this.random8bit());
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
        const intensity_scale = (_a = this.getValue("intensity")) !== null && _a !== void 0 ? _a : 50;
        for (let r = 0; r < height; r++) {
            for (let c = 0; c < width; c++) {
                this.setPixel(r, c, clamp(((this.standardNormal() * intensity_scale) | 0) + 128, 0, 255));
            }
        }
    }
});
//#endregion
//#region Random Walk Noise
customElements.define("random-walk-noise", class RandomWalkNoise extends NoiseCanvas {
    getValueNames() {
        return ["sc", "sr", "intensity", "balancePoint", "pull"];
    }
    setBuffer(buffer) {
        var _a, _b, _c, _d, _e;
        const [width, height] = [buffer.width, buffer.height];
        const sc = clamp((_a = this.getValue("sc")) !== null && _a !== void 0 ? _a : 0, 0, width);
        const sr = clamp((_b = this.getValue("sr")) !== null && _b !== void 0 ? _b : 0, 0, height);
        const intensity_scale = (_c = this.getValue("intensity")) !== null && _c !== void 0 ? _c : 20;
        const balance_point = (_d = this.getValue("balancePoint")) !== null && _d !== void 0 ? _d : 128;
        const pull = (_e = this.getValue("pull")) !== null && _e !== void 0 ? _e : 0.99;
        const memo = Array.from({ length: height }, () => Array(width).fill(0));
        this.fill(0, 0);
        const stack = [[sr, sc]];
        while (stack.length > 0) {
            const [r, c] = stack.pop();
            let count = 0;
            let sum = 0;
            if (r > 0) {
                const alpha = this.getPixelAlpha(r - 1, c);
                if (alpha > 0) {
                    sum += memo[r - 1][c];
                    count += 1;
                }
                else {
                    stack.push([r - 1, c]);
                }
            }
            if (c > 0) {
                const alpha = this.getPixelAlpha(r, c - 1);
                if (alpha > 0) {
                    sum += memo[r][c - 1];
                    count += 1;
                }
                else {
                    stack.push([r, c - 1]);
                }
            }
            if (r < height - 1) {
                const alpha = this.getPixelAlpha(r + 1, c);
                if (alpha > 0) {
                    sum += memo[r + 1][c];
                    count += 1;
                }
                else {
                    stack.push([r + 1, c]);
                }
            }
            if (c < width - 1) {
                const alpha = this.getPixelAlpha(r, c + 1);
                if (alpha > 0) {
                    sum += memo[r][c + 1];
                    count += 1;
                }
                else {
                    stack.push([r, c + 1]);
                }
            }
            if (count == 0) {
                const value = this.random8bit() - balance_point;
                this.setPixel(r, c, value);
                memo[r][c] = value;
                continue;
            }
            const value = clamp((sum / count) * pull + (Math.random() * 2 - 1) * intensity_scale, -balance_point, 255 - balance_point);
            memo[r][c] = value;
            this.setPixel(r, c, (value + balance_point) | 0);
        }
    }
});
//#endregion
//#endregion
