//#region Constants
const NAV_BUTTON_ID = "nav-button";
const NAV_OPEN_SESSION_KEY = "nav-open";

const TRUE = "1";
const FALSE = "0";

const MAIN = document.querySelector("main") as HTMLElement | null;
//#endregion

//#region Public Variable Locks
let busy = false;
//#endregion

//#region Public Methods (Checker Helpers)
function isModifierClick(event: MouseEvent): boolean {
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.button !== 0
  );
}

function isInternalLink(anchor: HTMLAnchorElement): boolean {
  const url = new URL(anchor.href, location.href);
  return url.origin === location.origin;
}
//#endregion

//#region Public Methods (Document)
async function fetchDocument(url: string): Promise<Document> {
  const response = await fetch(url, { credentials: "same-origin" });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const html = await response.text();
  return new DOMParser().parseFromString(html, "text/html");
}

function swapMain(nextDoc: Document): void {
  if (!MAIN) {
    throw new Error("Missing #page-content");
  }

  const nextMain = nextDoc.querySelector("main");
  if (!nextMain) {
    throw new Error("Missing main in fetched page");
  }

  MAIN.innerHTML = nextMain.innerHTML;
  document.title = nextDoc.title || document.title;
}

function updateNav(pathname: string = "/"): void {
  document
    .querySelectorAll('#nav-menu a[aria-current="page"]')
    .forEach((a) => a.removeAttribute("aria-current"));

  const match = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("#nav-menu a[href]"),
  ).find((a) => new URL(a.href, location.href).pathname == pathname);

  match?.setAttribute("aria-current", "page");
}
//#endregion

//#region Public Methods (Page Scripts)
let currentPageCleanup: (() => void) | null = null;

async function activatePageScripts(pathname: string = "/"): Promise<void> {
  currentPageCleanup?.();
  currentPageCleanup = null;

  if (pathname === "/") {
    const mod = await import("./homeBG.js");
    currentPageCleanup = mod.startHomeBG();
  }
}
//#endregion

//#region Public Methods (Transition)
async function transitionTo(url: URL): Promise<void> {
  if (busy) return;
  busy = true;

  try {
    const nextDoc = await fetchDocument(url.href);
    nextDoc.documentElement.dataset.pageReady = TRUE;

    swapMain(nextDoc);
    updateNav(url.pathname);
    activatePageScripts(url.pathname);

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    window.history.pushState({}, "", url.href);
  } catch (err) {
    console.error(err);
    window.location.href = url.href;
  } finally {
    busy = false;
  }
}
//#endregion

//#region Public Methods (Initiation)
function initiatePage(): void {
  updateNav();
  activatePageScripts();

  const open = sessionStorage.getItem("nav-open") === TRUE;
  const root = document.documentElement;

  root.dataset.navOpen = open ? TRUE : FALSE;
  root.dataset.pageReady = FALSE;

  requestAnimationFrame(() => {
    document.documentElement.dataset.pageReady = TRUE;
  });
}
//#endregion

//#region Event Listeners
document.addEventListener(
  "click",
  (event) => {
    const target = event.target as Element | null;
    const anchor = target?.closest("a") as HTMLAnchorElement | null;

    if (!anchor) return;
    if (anchor.hasAttribute("download")) return;
    if (anchor.target && anchor.target !== "_self") return;
    if (!isInternalLink(anchor)) return;

    const href = anchor.href;
    if (href === location.href) return;
    if (isModifierClick(event as MouseEvent)) return;

    event.preventDefault();
    transitionTo(new URL(href));
  },
  true,
);

window.addEventListener("popstate", (event: PopStateEvent) => {
  transitionTo(new URL(location.href));
});
//#endregion

//#region Base Call
initiatePage();
//#endregion
