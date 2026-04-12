var _a, _b, _c;
//#region Helper Methods
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
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
//#endregion
//#region     Class Definition
class NoiseCanvas extends HTMLElement {
    //#endregion
    //#region Constructor
    constructor() {
        super();
        this.writeIdx = 0;
        this.allowCanvasDisplay = true;
        this.frame = 0;
        this.valueInputs = {};
        //#endregion
        //#region Attribute Update Methods
        this.valueUpdaterMethod = this.scheduleBufferRefresh.bind(this);
        this.resolutionUpdaterMethod = this.resizeCanvas.bind(this);
        this.progressUpdaterMethod = this.forceDraw.bind(this);
        const shadow = this.attachShadow({ mode: "closed" });
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
    `;
        this.updateAllowCanvasDisplay();
        this.canvas = shadow.querySelector("canvas");
        const ctx = this.canvas.getContext("2d");
        if (!ctx)
            throw new Error("2D canvas context not available");
        ctx.imageSmoothingEnabled = false;
        this.ctx = ctx;
        this.buffer = new ImageData(1, 1);
    }
    //#endregion
    //#region Virtual Methods
    //    Dom Enter/Exit
    connectedCallback() {
        this.connectAll();
        this.resizeCanvas();
        this.refreshBuffer();
    }
    disconnectedCallback() {
        cancelAnimationFrame(this.frame);
        this.disconnectAll();
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
    //#endregion
    //#region Resolution
    resizeCanvas() {
        var _d, _e, _f, _g;
        const canvas = this.canvas;
        const [resolution, resolutionX, resolutionY] = NoiseCanvas.resolutionNames;
        const baseResolution = this.getValue(resolution);
        const canvasX = Number((_e = (_d = this.getValue(resolutionX)) !== null && _d !== void 0 ? _d : baseResolution) !== null && _e !== void 0 ? _e : NoiseCanvas.DEFAULT_RESOLUTION);
        const canvasY = Number((_g = (_f = this.getValue(resolutionY)) !== null && _f !== void 0 ? _f : baseResolution) !== null && _g !== void 0 ? _g : NoiseCanvas.DEFAULT_RESOLUTION);
        canvas.width = canvasX;
        canvas.height = canvasY;
        this.buffer = new ImageData(canvasX, canvasY);
        this.progressMemory = this.createProgressMemory(canvasX * canvasY);
        this.scheduleBufferRefresh();
    }
    //#endregion
    //#region Draw/Buffer Manipulation
    //    Buffer
    scheduleBufferRefresh() {
        cancelAnimationFrame(this.frame);
        this.frame = requestAnimationFrame(() => this.refreshBuffer());
    }
    refreshBuffer() {
        this.writeIdx = 0;
        this.setBuffer(this.buffer);
        this.forceDraw();
    }
    //    Draw
    forceDraw() {
        if (this.drawCheck(this.buffer, this.getProgress())) {
            this.drawBuffer(this.buffer, this.getProgress());
        }
    }
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
    //#endregion
    //#region Attribute Event Settup
    //#region     Connection
    //                Base Connection
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
    connectTemplate(selectors = undefined, names, onUpdate) {
        if (selectors === undefined) {
            selectors = this.getSelectors();
        }
        if (typeof names === "string") {
            this.connectName(names, onUpdate, selectors);
            return;
        }
        names.map((val) => this.connectName(val, onUpdate, selectors));
    }
    //                Types of Connections
    connectValues(selectors = undefined, name = undefined) {
        this.connectTemplate(selectors, name !== null && name !== void 0 ? name : this.getValueNames(), this.valueUpdaterMethod.bind(this));
    }
    connectResolution(selectors = undefined, name = undefined) {
        this.connectTemplate(selectors, name !== null && name !== void 0 ? name : NoiseCanvas.resolutionNames, this.resolutionUpdaterMethod.bind(this));
    }
    connectProgress(selectors = undefined, name = undefined) {
        this.connectTemplate(selectors, name !== null && name !== void 0 ? name : NoiseCanvas.progressNames, this.progressUpdaterMethod.bind(this));
    }
    //                All Connections
    connectAll() {
        const selectors = this.getSelectors();
        this.connectValues(selectors);
        this.connectResolution(selectors);
        this.connectProgress(selectors);
    }
    //#endregion
    //#region     Disconnect
    //                Base Disconnect
    disconnectName(name) {
        const slider = this.valueInputs[name];
        if (slider instanceof InputContainer) {
            slider.disconnectUpdateMethod();
        }
        delete this.valueInputs[name];
    }
    //                All Disconnect
    disconnectAll() {
        Object.values(this.valueInputs).forEach((slider) => {
            if (slider instanceof InputContainer) {
                slider.disconnectUpdateMethod();
            }
        });
        this.valueInputs = {};
    }
    //#endregion
    //#region     Direct Attribute Updaters
    updateAllowCanvasDisplay() {
        this.allowCanvasDisplay = !(this.getAttribute("draw") === "false");
    }
    //#endregion
    //#endregion
    //#region Helper Methods
    //#region     DOM Search
    getInputsRoot() {
        var _d;
        const baseRoot = this.getAttribute("inputs");
        return baseRoot === null
            ? document
            : ((_d = document.querySelector(baseRoot)) !== null && _d !== void 0 ? _d : document);
    }
    getSelectors() {
        return Array.from(this.getInputsRoot().querySelectorAll("input[name]"));
    }
    //#endregion
    //#region     Base Value Accessing
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
    //#endregion
    //#region     Progress
    getProgress() {
        var _d;
        return Number((_d = this.getValue(NoiseCanvas.progressNames[0])) !== null && _d !== void 0 ? _d : NoiseCanvas.DEFAULT_PROGRESS);
    }
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
        throw new Error("Cannot save the progress of a canvas with more than 0xffffffff pixels.");
    }
    //#endregion
    //#region     Entire Canvas Updaters
    fill(v, a) {
        const width = this.canvas.width;
        const height = this.canvas.height;
        this.ctx.fillStyle = `rgba(${v}, ${v}, ${v}, ${a.toFixed(3)})`;
        this.ctx.fillRect(0, 0, width, height);
    }
    //#endregion
    //#region     Pixel Canvus Updaters
    //#region         Index
    getIndex(r, c) {
        return r * this.buffer.width + c;
    }
    //#endregion
    //#region         Get Pixel
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
    //#endregion
    //#region         Set Pixel
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
    //#endregion
    //#endregion
    //#region     Buffer Copy Methods
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
    //#endregion
    //#region     Simple Random Method
    random8bit() {
        return (Math.random() * 256) | 0;
    }
}
//#region Constants
NoiseCanvas.DEFAULT_RESOLUTION = "50";
NoiseCanvas.DEFAULT_PROGRESS = 1.0;
//#endregion
//#region Connection Attribute Names
NoiseCanvas.resolutionNames = [
    "resolution",
    "resolutionX",
    "resolutionY",
];
NoiseCanvas.progressNames = ["progress"];
//#endregion
//#region White Noise
customElements.define("white-noise", (_a = class WhiteNoiseCanvas extends NoiseCanvas {
        //#endregion
        //#region Attribute Methods
        getValueNames() {
            return _a.customAttributes;
        }
        static get observedAttributes() {
            return [
                ...(super.observedAttributes || []),
                ..._a.customAttributes,
            ];
        }
        //#endregion
        //#region Buffer Draw Method
        setBuffer(buffer) {
            const [width, height] = [buffer.width, buffer.height];
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    this.setPixel(this.getIndex(r, c), this.random8bit());
                }
            }
        }
    },
    //#region Private Variables
    _a.customAttributes = [],
    _a));
//#endregion
//#region Gaussian Noise
customElements.define("gaussian-noise", (_b = class GaussianNoise extends NoiseCanvas {
        //#endregion
        //#region Attribute Methods
        getValueNames() {
            return _b.customAttributes;
        }
        static get observedAttributes() {
            return [
                ...(super.observedAttributes || []),
                ..._b.customAttributes,
            ];
        }
        //#endregion
        //#region Buffer Draw Method
        setBuffer(buffer) {
            var _d;
            const [width, height] = [buffer.width, buffer.height];
            const intensity_scale = Number((_d = this.getValue("intensity")) !== null && _d !== void 0 ? _d : 50);
            for (let r = 0; r < height; r++) {
                for (let c = 0; c < width; c++) {
                    this.setPixel(this.getIndex(r, c), clamp(((this.standardNormal() * intensity_scale) | 0) + 128, 0, 255));
                }
            }
        }
        //#endregion
        //#region Helper Methods
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
    },
    //#region Private Variables
    _b.customAttributes = ["intensity"],
    _b));
customElements.define("random-walk-noise", (_c = class RandomWalkNoise extends NoiseCanvas {
        //#endregion
        //#region Attribute Methods
        getValueNames() {
            return _c.customAttributes;
        }
        static get observedAttributes() {
            return [
                ...(super.observedAttributes || []),
                ..._c.customAttributes,
            ];
        }
        //#endregion
        //#region Buffer Draw Method
        setBuffer(buffer) {
            var _d, _e, _f, _g, _h, _j;
            const [width, height] = [buffer.width, buffer.height];
            const shape = (_d = this.getValue("shape")) !== null && _d !== void 0 ? _d : "spread";
            const sc = clamp(Number((_e = this.getValue("sc")) !== null && _e !== void 0 ? _e : 0), 0, width);
            const sr = clamp(Number((_f = this.getValue("sr")) !== null && _f !== void 0 ? _f : 0), 0, height);
            const sIdx = this.getIndex(sr, sc);
            const intensityScale = Number((_g = this.getValue("intensity")) !== null && _g !== void 0 ? _g : 20);
            const balancePoint = Number((_h = this.getValue("balancePoint")) !== null && _h !== void 0 ? _h : 128);
            const pull = Number((_j = this.getValue("pull")) !== null && _j !== void 0 ? _j : 0.99);
            const setWalkPixel = (pInfo, idx, memo) => {
                const value = clamp((pInfo[1] === 0
                    ? this.random8bit() - balancePoint
                    : pInfo[0] / pInfo[1]) *
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
                case "spiral":
                    break;
                case "revSpiral":
                    break;
                case "spread":
                default:
                    this.walkSpread(width, height, sIdx, setWalkPixel);
            }
        }
        //#endregion
        //#region Buffer Shape Draw Methods
        walkTemplate(width, height, sIdx, setWalkPixel, processWalkDirection) {
            const memo = Array(width * height).fill(0);
            this.fill(0, 0);
            let open = [sIdx];
            let closed = [];
            const processPixelLocation = (idx, pInfo) => {
                const alpha = this.getPixelAlpha(idx);
                if (alpha > 0) {
                    pInfo[0] += memo[idx];
                    pInfo[1] += 1;
                }
                else {
                    open.push(idx);
                }
                return pInfo;
            };
            while (open.length > 0) {
                closed = open;
                open = [];
                while (closed.length > 0) {
                    const currentIdx = closed.pop();
                    const [r, c] = [Math.floor(currentIdx / width), currentIdx % width];
                    let pInfo = [0, 0];
                    if (this.getPixelAlpha(currentIdx) > 0)
                        continue;
                    processWalkDirection(r, c, pInfo, processPixelLocation);
                    setWalkPixel(pInfo, currentIdx, memo);
                }
            }
        }
        walkSpread(width, height, sIdx, setWalkPixel) {
            this.walkTemplate(width, height, sIdx, setWalkPixel, (r, c, pInfo, processPixelLocation) => {
                if (r > 0) {
                    pInfo = processPixelLocation(this.getIndex(r - 1, c), pInfo);
                }
                if (c > 0) {
                    pInfo = processPixelLocation(this.getIndex(r, c - 1), pInfo);
                }
                if (r < height - 1) {
                    pInfo = processPixelLocation(this.getIndex(r + 1, c), pInfo);
                }
                if (c < width - 1) {
                    pInfo = processPixelLocation(this.getIndex(r, c + 1), pInfo);
                }
                return pInfo;
            });
        }
    },
    //#region Private Variables
    _c.customAttributes = [
        "sc",
        "sr",
        "intensity",
        "balancePoint",
        "pull",
        "shape",
    ],
    _c));
//#endregion
//#endregion
