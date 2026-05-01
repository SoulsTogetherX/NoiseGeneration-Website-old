//#region Constants
const EXPAND_LIST_ID = "page-expand-list";
const EXPAND_SECTION_CLASSNAME = "page-expand-section";

const SHOW_EXPAND_SECTION_CLASSNAME = "show-expanded";
const HIDE_EXPAND_SECTION_CLASSNAME = "hide-expanded";
//#endregion

//#region BG Animations
export function start(): () => void {
  const expandList = document.getElementById(EXPAND_LIST_ID);
  const expandSections = expandList?.getElementsByClassName(
    EXPAND_SECTION_CLASSNAME,
  );
  if (!expandSections) {
    return () => {};
  }

  const onClick = (event: PointerEvent) => {
    if (event.target instanceof Node) {
      let found: Element | null = null;
      for (const section of expandSections) {
        const classList = section.classList;
        classList.remove(SHOW_EXPAND_SECTION_CLASSNAME);
        classList.remove(HIDE_EXPAND_SECTION_CLASSNAME);

        if (section === document.activeElement) {
          console.log(section);
          found = section;
        }
      }

      if (found !== null) {
        for (const section of expandSections) {
          if (section === found) {
            section.classList.add(SHOW_EXPAND_SECTION_CLASSNAME);
          } else {
            section.classList.add(HIDE_EXPAND_SECTION_CLASSNAME);
          }
        }
      }
    } else {
      for (const section of expandSections) {
        const classList = section.classList;

        classList.remove(SHOW_EXPAND_SECTION_CLASSNAME);
        classList.remove(HIDE_EXPAND_SECTION_CLASSNAME);
      }
    }
  };

  const cleanup = (): void => {
    document.removeEventListener("click", onClick);
  };

  document.addEventListener("click", onClick);
  return cleanup;
}
start();
//#endregion
