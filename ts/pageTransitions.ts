//#region Type Definitions
type NavKind = "push" | "pop";
type NavDirection = "forward" | "back";

type NavRequest = {
  url: URL;
  kind: NavKind;
  direction: NavDirection;
};
//#endregion

//#region Constants Values
const NAV_BUTTON_ID = "nav-button";
const NAV_OPEN_SESSION_KEY = "nav-open";

const TRUE = "1";
const FALSE = "0";

//#region Transition Cover Classnames
const ANIMATE_RIGHT_CLASSNAME = "right";
const ANIMATE_LEFT_CLASSNAME = "left";
const ANIMATE_IS_ENTERING_CLASSNAME = "is-entering";
const ANIMATE_IS_EXITING_CLASSNAME = "is-exiting";
//#endregion
//#endregion

//#region Constant Elements
const MAIN = document.querySelector("main") as HTMLElement | null;

const TRANSITION_COVER = document.getElementById(
  "transition-cover",
) as HTMLElement | null;
//#endregion

//#region Public Variables
let busy = false;
let pendingNav: NavRequest | null = null;
let navSeq = 0;
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
  document.querySelectorAll('#nav-menu a[aria-current="page"]').forEach((a) => {
    a.removeAttribute("aria-current");
    a.classList.remove("current-nav-link");
  });

  const match = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("#nav-menu a[href]"),
  ).find((a) => new URL(a.href, location.href).pathname == pathname);

  if (match) {
    match.setAttribute("aria-current", "page");
    match.classList.add("current-nav-link");
  }
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

//#region Public Methods (Transitions)
async function waitForAllAnimations(container: HTMLElement): Promise<void> {
  const children = Array.from(container.children) as HTMLElement[];

  await Promise.all(
    children.map(
      (child) =>
        new Promise<void>((resolve) => {
          child.addEventListener(
            "animationend",
            () => {
              resolve();
            },
            {
              once: true,
            },
          );
        }),
    ),
  );
}

async function transitionCover(
  slideIn: boolean,
  forward: boolean,
): Promise<void> {
  if (!TRANSITION_COVER) {
    return;
  }

  const list = TRANSITION_COVER.classList;
  list.remove(ANIMATE_RIGHT_CLASSNAME);
  list.remove(ANIMATE_LEFT_CLASSNAME);
  list.remove(ANIMATE_IS_ENTERING_CLASSNAME);
  list.remove(ANIMATE_IS_EXITING_CLASSNAME);

  void TRANSITION_COVER.offsetWidth;

  if (slideIn) {
    list.add(forward ? ANIMATE_RIGHT_CLASSNAME : ANIMATE_LEFT_CLASSNAME);
    list.add(ANIMATE_IS_ENTERING_CLASSNAME);
  } else {
    list.add(forward ? ANIMATE_LEFT_CLASSNAME : ANIMATE_RIGHT_CLASSNAME);
    list.add(ANIMATE_IS_EXITING_CLASSNAME);
  }

  await waitForAllAnimations(TRANSITION_COVER);
}
//#endregion

//#region Public Methods (Navigation)
function requestNavigation(req: NavRequest): void {
  if (busy) {
    pendingNav = req;
    return;
  }
  runNavigation(req);
}

async function runNavigation(req: NavRequest): Promise<void> {
  busy = true;
  const mySeq = ++navSeq;

  try {
    await transitionCover(true, req.direction === "forward");
    if (mySeq !== navSeq) return;

    const nextDoc = await fetchDocument(req.url.href);
    if (mySeq !== navSeq) return;

    swapMain(nextDoc);
    updateNav(req.url.pathname);
    await activatePageScripts(req.url.pathname);

    window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    if (req.kind === "push") {
      history.pushState({}, "", req.url.href);
    }

    await transitionCover(false, req.direction === "forward");
  } catch (err) {
    console.error(err);
    window.location.href = req.url.href;
  } finally {
    busy = false;

    const next = pendingNav;
    pendingNav = null;

    if (next) {
      runNavigation(next);
    }
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

    if (
      !anchor ||
      anchor.hasAttribute("download") ||
      (anchor.target && anchor.target !== "_self") ||
      !isInternalLink(anchor) ||
      isModifierClick(event as MouseEvent)
    ) {
      return;
    }

    event.preventDefault();

    const url = new URL(anchor.href);
    if (url.href === location.href) {
      return;
    }

    requestNavigation({
      url,
      kind: "push",
      direction: "forward",
    });
  },
  true,
);

window.addEventListener("popstate", () => {
  requestNavigation({
    url: new URL(location.href),
    kind: "pop",
    direction: "back",
  });
});
//#endregion

//#region Base Call
initiatePage();
//#endregion
