const BUTTON_TRANSITION_CLASS =
  "transition-colors disabled:cursor-not-allowed disabled:opacity-40";

export const BUTTON_BASE_CLASS =
  `inline-flex items-center justify-center gap-2 rounded-lg font-medium ${BUTTON_TRANSITION_CLASS}`;

export const BUTTON_PRIMARY_CLASS =
  `${BUTTON_BASE_CLASS} bg-indigo-600 text-white hover:bg-indigo-500 disabled:bg-gray-700 disabled:text-gray-500`;

export const BUTTON_SECONDARY_CLASS =
  `${BUTTON_BASE_CLASS} border border-gray-700 text-gray-300 hover:border-gray-600 hover:text-white`;

export const BUTTON_GHOST_CLASS =
  `${BUTTON_BASE_CLASS} border border-transparent text-gray-400 hover:bg-white/5 hover:text-gray-200`;

export const BUTTON_DANGER_CLASS =
  `${BUTTON_BASE_CLASS} bg-red-600 text-white hover:bg-red-500 disabled:bg-gray-700 disabled:text-gray-500`;

export const BUTTON_DANGER_OUTLINE_CLASS =
  `${BUTTON_BASE_CLASS} border border-red-500/30 text-red-200 hover:border-red-400/40 hover:text-white`;

export const BUTTON_ACCENT_OUTLINE_CLASS =
  `${BUTTON_BASE_CLASS} border border-indigo-500/35 bg-indigo-500/10 text-indigo-100 hover:border-indigo-300/70 hover:bg-indigo-400/18 hover:text-white`;

export const BUTTON_SIZE_XS_CLASS = "px-3 py-1.5 text-xs";
export const BUTTON_SIZE_SM_CLASS = "px-3 py-2 text-sm";
export const BUTTON_SIZE_MD_CLASS = "h-11 px-3 text-sm";

export const BUTTON_ICON_SM_CLASS =
  "inline-flex h-7 w-7 items-center justify-center rounded-lg border border-gray-700 text-gray-400 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-30";

export const BUTTON_ICON_MD_CLASS =
  "inline-flex h-9 w-9 items-center justify-center rounded-lg border border-gray-700 text-gray-400 transition-colors hover:border-gray-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

export const BUTTON_ICON_GHOST_SM_CLASS =
  `${BUTTON_GHOST_CLASS} h-7 w-7 rounded-md p-0 text-gray-500 hover:text-gray-300`;

export const BUTTON_ICON_GHOST_MD_CLASS =
  `${BUTTON_GHOST_CLASS} h-9 w-9 rounded-lg p-0 text-gray-500 hover:text-gray-300`;
