var _a, _b, _c;
//#region Helper Methods
const clamp = (num, min, max) => Math.min(Math.max(num, min), max);
//#endregion
//#region Random Number Generators
function xmur3(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    };
}
function mulberry32(a) {
    return () => {
        let t = (a += 0x6d2b79f5);
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return (t ^ (t >>> 14)) >>> 0;
    };
}
function sfc32(a, b, c, d) {
    a >>>= 0;
    b >>>= 0;
    c >>>= 0;
    d >>>= 0;
    return () => {
        const t = (((a + b) | 0) + d) | 0;
        d = (d + 1) | 0;
        a = (b ^ (b >>> 9)) | 0;
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        c = (c + t) | 0;
        return t >>> 0;
    };
}
class InputContainer {
    constructor(inputElement, event, onUpdate) {
        this.inputElement = inputElement;
        this.onUpdateMethod = onUpdate;
        this.event = event;
        this.inputElement.addEventListener(event, this.onUpdateMethod);
    }
    disconnectUpdateMethod() {
        this.inputElement.removeEventListener(this.event, this.onUpdateMethod);
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
        this.frame = 0;
        this.internalProgressCutoff = 0;
        this.valuesRecord = {};
        //#endregion
        //#region Attribute Update Methods
        this.resolutionUpdaterMethod = this.resizeCanvas.bind(this);
        this.bufferUpdaterMethod = this.scheduleBufferRefresh.bind(this);
        this.progressUpdaterMethod = this.updateProgressCutoff.bind(this);
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
        this.initializeValues();
        this.randMethod = sfc32(0, 0, 0, 0);
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
    //#region     Dom Enter/Exit
    connectedCallback() {
        this.connectAll();
        this.resizeCanvas();
        this.refreshBuffer();
    }
    disconnectedCallback() {
        cancelAnimationFrame(this.frame);
        this.disconnectAll();
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
        ];
    }
    attributeChangedCallback(name, oldValue, newValue) {
        if (oldValue !== newValue) {
            if (NoiseCanvas.RESOLUTION_NAMES.includes(name)) {
                this.connectResolution(undefined, newValue);
                this.resizeCanvas();
            }
            else if (NoiseCanvas.PROGRESS_NAMES.includes(name)) {
                this.connectProgress(undefined, newValue);
                this.updateProgressCutoff();
            }
            else if (NoiseCanvas.SEED_NAMES.includes(name)) {
                //
            }
            else if (this.getParameterNames().includes(name)) {
                this.connectParameters(undefined, newValue);
                this.scheduleBufferRefresh();
            }
            else if (name === "useProgress") {
                this.createProgressMemory(this.getPixelCount());
                this.forceDraw();
            }
        }
    }
    //#endregion
    //#endregion
    //#region Resolution
    resizeCanvas() {
        var _d, _e, _f, _g;
        const canvas = this.canvas;
        const [resolution, resolutionX, resolutionY] = NoiseCanvas.RESOLUTION_NAMES;
        const baseResolution = this.getValue(resolution);
        const canvasX = Number((_e = (_d = this.getValue(resolutionX)) !== null && _d !== void 0 ? _d : baseResolution) !== null && _e !== void 0 ? _e : NoiseCanvas.DEFAULT_RESOLUTION);
        const canvasY = Number((_g = (_f = this.getValue(resolutionY)) !== null && _f !== void 0 ? _f : baseResolution) !== null && _g !== void 0 ? _g : NoiseCanvas.DEFAULT_RESOLUTION);
        canvas.width = canvasX;
        canvas.height = canvasY;
        this.buffer = new ImageData(canvasX, canvasY);
        this.createProgressMemory(canvasX * canvasY);
        this.updateProgressCutoff();
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
        this.settupSeed();
        this.setBuffer(this.buffer);
        this.forceDraw();
    }
    //    Draw
    forceDraw() {
        const cutoff = this.internalProgressCutoff;
        if (this.drawCheck(this.buffer, cutoff)) {
            this.drawBuffer(this.buffer, cutoff);
        }
    }
    drawCheck(buffer, cutoff) {
        if (this.progressMemory === undefined || cutoff >= this.getPixelCount()) {
            this.ctx.putImageData(buffer, 0, 0);
            return false;
        }
        if (cutoff <= 0) {
            this.ctx.clearRect(0, 0, buffer.width, buffer.height);
            return false;
        }
        return true;
    }
    drawBuffer(buffer, cutoff) {
        const memory = this.progressMemory;
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
    //#region Attributes Settup
    //#region     Base Value Accessing
    //#region         Initialize
    initializeValues() {
        this.clearValues();
        [
            ...NoiseCanvas.RESOLUTION_NAMES,
            ...NoiseCanvas.PROGRESS_NAMES,
            ...this.getParameterNames(),
        ].map((name) => {
            this.valuesRecord[name] = this.getAttribute(name);
        });
    }
    clearValues() {
        this.disconnectAll();
        this.valuesRecord = {};
    }
    //#endregion
    //#region         Accessors
    //#region             Generic
    getValueFromType(val) {
        if (val instanceof InputContainer) {
            return val.getValue();
        }
        return val;
    }
    isValueConnected(name) {
        return this.valuesRecord[name] instanceof InputContainer;
    }
    getValue(name) {
        return this.getValueFromType(this.valuesRecord[name]);
    }
    //#endregion
    //#region             Specific
    getResolution() {
        var _d;
        return Number((_d = this.getValue(NoiseCanvas.RESOLUTION_NAMES[0])) !== null && _d !== void 0 ? _d : 50);
    }
    getResolutionX() {
        var _d;
        return Number((_d = this.getValue(NoiseCanvas.RESOLUTION_NAMES[1])) !== null && _d !== void 0 ? _d : 50);
    }
    getResolutionY() {
        var _d;
        return Number((_d = this.getValue(NoiseCanvas.RESOLUTION_NAMES[2])) !== null && _d !== void 0 ? _d : 50);
    }
    getProgressCutoff() {
        var _d;
        return Number((_d = this.getValue(NoiseCanvas.PROGRESS_NAMES[0])) !== null && _d !== void 0 ? _d : this.getPixelCount());
    }
    getProgressRatio() {
        var _d;
        return Number((_d = this.getValue(NoiseCanvas.PROGRESS_NAMES[1])) !== null && _d !== void 0 ? _d : 1.0);
    }
    getSeed() {
        var _d;
        return ((_d = this.valuesRecord[NoiseCanvas.SEED_NAMES[0]]) !== null && _d !== void 0 ? _d : (Math.random() * 0xffffffff) | 0);
    }
    getPixelCount() {
        var _d, _e;
        return (_e = (_d = this.progressMemory) === null || _d === void 0 ? void 0 : _d.length) !== null && _e !== void 0 ? _e : 0;
    }
    //#endregion
    //#endregion
    //#region         Direct Setters
    setResolution(val) {
        const name = NoiseCanvas.RESOLUTION_NAMES[0];
        if (this.isValueConnected(name)) {
            return;
        }
        this.valuesRecord[name] = val;
        this.resolutionUpdaterMethod();
    }
    setResolutionX(val) {
        const name = NoiseCanvas.RESOLUTION_NAMES[1];
        if (this.isValueConnected(name)) {
            return;
        }
        this.valuesRecord[name] = val;
        this.resolutionUpdaterMethod();
    }
    setResolutionY(val) {
        const name = NoiseCanvas.RESOLUTION_NAMES[2];
        if (this.isValueConnected(name)) {
            return;
        }
        this.valuesRecord[name] = val;
        this.resolutionUpdaterMethod();
    }
    setProgressCutoff(val) {
        const name = NoiseCanvas.PROGRESS_NAMES[0];
        if (this.isValueConnected(name)) {
            return;
        }
        this.valuesRecord[name] = val;
        this.progressUpdaterMethod();
    }
    setProgressRatio(val) {
        const name = NoiseCanvas.PROGRESS_NAMES[1];
        if (this.isValueConnected(name)) {
            return;
        }
        this.valuesRecord[name] = val;
        this.progressUpdaterMethod();
    }
    setSeed(val) {
        const name = NoiseCanvas.SEED_NAMES[1];
        if (this.isValueConnected(name)) {
            return;
        }
        this.valuesRecord[name] = val;
        this.bufferUpdaterMethod();
    }
    //#endregion
    //#region         Helper Setters
    setParameter(name, val) {
        if (!this.getParameterNames().includes(name)) {
            throw TypeError(`Parameter ${name} does not exist on current Noise Canvas.`);
        }
        if (this.isValueConnected(name)) {
            return;
        }
        this.valuesRecord[name] = val;
    }
    //#endregion
    //#region
    //#region Attribute Event Settup
    //#region     Connection
    //                Base Connection
    connectName(name, event, onUpdate, fallback) {
        if (name in this.valuesRecord) {
            this.disconnectName(name);
        }
        const attribute = this.getAttribute(name);
        if (attribute !== null) {
            if (!isNaN(Number(attribute)) && attribute.trim() !== "") {
                this.valuesRecord[name] = attribute;
                return;
            }
            const sliderId = document.getElementById(attribute);
            if (sliderId !== null) {
                this.valuesRecord[name] = new InputContainer(sliderId, event, onUpdate);
                return;
            }
        }
        const slider = fallback.find((val) => val.name === name);
        if (slider !== undefined) {
            this.valuesRecord[name] = new InputContainer(slider, event, onUpdate);
            return;
        }
    }
    connectTemplate(selectors = undefined, names, event, onUpdate) {
        if (selectors === undefined) {
            selectors = this.getSelectors();
        }
        if (typeof names === "string") {
            this.connectName(names, event, onUpdate, selectors);
            return;
        }
        names.map((val) => this.connectName(val, event, onUpdate, selectors));
    }
    //                Types of Connections
    connectParameters(selectors = undefined, name = undefined) {
        this.connectTemplate(selectors, name !== null && name !== void 0 ? name : this.getParameterNames(), "input", this.bufferUpdaterMethod.bind(this));
    }
    connectResolution(selectors = undefined, name = undefined) {
        this.connectTemplate(selectors, name !== null && name !== void 0 ? name : NoiseCanvas.RESOLUTION_NAMES, "input", this.resolutionUpdaterMethod.bind(this));
    }
    connectProgress(selectors = undefined, name = undefined) {
        this.connectTemplate(selectors, name !== null && name !== void 0 ? name : NoiseCanvas.PROGRESS_NAMES, "input", this.progressUpdaterMethod.bind(this));
    }
    connectSeed(selectors = undefined, name = undefined) {
        this.connectTemplate(selectors, name !== null && name !== void 0 ? name : NoiseCanvas.SEED_NAMES, "change", this.bufferUpdaterMethod.bind(this));
    }
    //                All Connections
    connectAll() {
        const selectors = this.getSelectors();
        this.connectSeed(selectors);
        this.connectParameters(selectors);
        this.connectResolution(selectors);
        this.connectProgress(selectors);
    }
    //#endregion
    //#region     Disconnect
    //                Base Disconnect
    disconnectName(name) {
        const slider = this.valuesRecord[name];
        if (slider instanceof InputContainer) {
            slider.disconnectUpdateMethod();
        }
        this.valuesRecord[name] = undefined;
    }
    //                All Disconnect
    disconnectAll() {
        Object.values(this.valuesRecord).forEach((slider) => {
            if (slider instanceof InputContainer) {
                slider.disconnectUpdateMethod();
            }
        });
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
    //#region     Progress
    updateProgressCutoff() {
        const pixelCutoff = this.getValue(NoiseCanvas.PROGRESS_NAMES[0]);
        if (pixelCutoff !== undefined) {
            this.internalProgressCutoff = Number(pixelCutoff);
        }
        else {
            const pixelCount = this.getPixelCount();
            const pixelRatio = this.getValue(NoiseCanvas.PROGRESS_NAMES[1]);
            if (pixelRatio !== undefined) {
                this.internalProgressCutoff = Number(pixelRatio) * pixelCount;
            }
            else {
                this.internalProgressCutoff = pixelCount;
            }
        }
        this.forceDraw();
    }
    createProgressMemory(countmaxIndex) {
        if (this.getAttribute("useProgress") !== "true") {
            this.progressMemory = undefined;
            return;
        }
        if (countmaxIndex <= 0xff) {
            this.progressMemory = new Uint8Array(countmaxIndex);
            return;
        }
        if (countmaxIndex <= 0xffff) {
            this.progressMemory = new Uint16Array(countmaxIndex);
            return;
        }
        if (countmaxIndex <= 0xffffffff) {
            this.progressMemory = new Uint32Array(countmaxIndex);
            return;
        }
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
    //#region     Random Methods
    settupSeed() {
        const hash = mulberry32(this.getSeed());
        this.randMethod = sfc32(hash(), hash(), hash(), hash());
    }
    random32bit() {
        return this.randMethod();
    }
    random16bit() {
        return this.randMethod() & 0xffff;
    }
    random8bit() {
        return this.randMethod() & 0xff;
    }
    // [0, 1)
    randomUFloat() {
        return (this.randMethod() >>> 0) / 0x100000000;
    }
    // [-1, 1)
    randomFloat() {
        return (this.randMethod() | 0) / 0x80000000;
    }
}
//#region Constants
NoiseCanvas.DEFAULT_RESOLUTION = "50";
NoiseCanvas.RESOLUTION_NAMES = [
    "resolution",
    "resolutionX",
    "resolutionY",
];
NoiseCanvas.PROGRESS_NAMES = ["progressCutoff", "progressRatio"];
NoiseCanvas.SEED_NAMES = ["seed"];
//#endregion
//#region White Noise
customElements.define("white-noise", (_a = class WhiteNoiseCanvas extends NoiseCanvas {
        //#endregion
        //#region Attribute Methods
        getParameterNames() {
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
        getParameterNames() {
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
                u = this.randomUFloat();
            while (v === 0)
                v = this.randomUFloat();
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
        getParameterNames() {
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
                    Math.sign(this.randomFloat()) * intensityScale, -balancePoint, 255 - balancePoint);
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
