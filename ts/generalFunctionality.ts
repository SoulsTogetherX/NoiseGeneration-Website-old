//#region Screen Width Check
const DESKTOP_CLASSNAME = "desktop"
const MOBILE_CLASSNAME = "mobile"

const MOBILE_MEDIA_QUERY = window.matchMedia("(max-width: 768px)")

function handleLayoutChange() {
  document.body.classList.remove(MOBILE_CLASSNAME)
  document.body.classList.remove(DESKTOP_CLASSNAME)

  if (MOBILE_MEDIA_QUERY.matches) {
    document.body.classList.add(MOBILE_CLASSNAME)
    return
  }
  document.body.classList.add(DESKTOP_CLASSNAME)
}

MOBILE_MEDIA_QUERY.addEventListener("change", handleLayoutChange)
handleLayoutChange()
//#endregion

//#region Object Visiblity
// Constants
const VISIBLE_CLASSNAME = "visible"
const ONESHOT_ATTRIBUTE_NAME = "oneShot"

// Listener
export class HTMLObserverElement extends HTMLElement {
  //#region     Private Variables
  private _oneShot: boolean
  private _oneShotFinished: boolean = false

  private _observer: IntersectionObserver | undefined
  //#endregion

  //#region     Constructor
  constructor() {
    super()

    this._oneShot =
      (this.getAttribute(ONESHOT_ATTRIBUTE_NAME) ?? false) === "true"
  }
  //#endregion

  //#region     Dom Enter/Exit
  protected connectedCallback(): void {
    this._observer = new IntersectionObserver(this.onVisible)
  }
  protected disconnectedCallback(): void {
    this._observer = undefined
  }
  //#endregion

  //#region Private Methods
  private onVisible(elements: IntersectionObserverEntry[]): void {
    if (!this._oneShotFinished || !this._oneShot) {
      for (const element of elements) {
        if (element.isIntersecting) {
          this._oneShotFinished = true
          this.classList.add(VISIBLE_CLASSNAME)
          return
        }
      }
    }
    this.classList.remove(VISIBLE_CLASSNAME)
  }
  //#endregion
}
customElements.define("visible-observer", HTMLObserverElement)
//#endregion
