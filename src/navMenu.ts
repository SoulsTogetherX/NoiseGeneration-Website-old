const NAV_BUTTON_ID = "nav-button"
const NAV_MENU_ID = "nav-menu"
const ACTIVE_CLASSNAME = "active"

const NAV_BUTTON = document.getElementById(NAV_BUTTON_ID)
const NAV_MENU = document.getElementById(NAV_MENU_ID)

if (NAV_BUTTON && NAV_MENU) {
  NAV_BUTTON?.addEventListener("click", () => {
    NAV_BUTTON.classList.toggle(ACTIVE_CLASSNAME)
    NAV_MENU.classList.toggle(ACTIVE_CLASSNAME)
  })
}
