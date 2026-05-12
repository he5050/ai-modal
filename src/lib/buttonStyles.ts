const BUTTON_TRANSITION_CLASS =
  "transition-colors duration-150 disabled:cursor-not-allowed disabled:opacity-45";

export const BUTTON_BASE_CLASS =
  `inline-flex items-center justify-center gap-1.5 rounded-lg font-medium outline-none ring-offset-0 focus-visible:ring-2 focus-visible:ring-indigo-500/60 active:scale-[0.985] ${BUTTON_TRANSITION_CLASS}`;

export const BUTTON_PRIMARY_CLASS =
  `${BUTTON_BASE_CLASS} border border-indigo-500/70 bg-indigo-600/90 text-white hover:bg-indigo-500 disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500`;

export const BUTTON_SECONDARY_CLASS =
  `${BUTTON_BASE_CLASS} border border-gray-700 bg-gray-900/75 text-gray-300 hover:border-gray-500 hover:bg-gray-800/80 hover:text-white`;

export const BUTTON_GHOST_CLASS =
  `${BUTTON_BASE_CLASS} border border-transparent text-gray-400 hover:bg-gray-800/70 hover:text-gray-200`;

export const BUTTON_DANGER_CLASS =
  `${BUTTON_BASE_CLASS} border border-red-500/65 bg-red-600/90 text-white hover:bg-red-500 disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500`;

export const BUTTON_DANGER_OUTLINE_CLASS =
  `${BUTTON_BASE_CLASS} border border-red-500/35 bg-red-500/8 text-red-200 hover:border-red-400/55 hover:bg-red-500/12 hover:text-white`;

export const BUTTON_ACCENT_OUTLINE_CLASS =
  `${BUTTON_BASE_CLASS} border border-indigo-500/45 bg-indigo-500/10 text-indigo-100 hover:border-indigo-300/70 hover:bg-indigo-400/16 hover:text-white`;

export const BUTTON_SIZE_XS_CLASS = "h-8 px-2.5 text-xs";
export const BUTTON_SIZE_SM_CLASS = "h-9 px-3 text-sm";
export const BUTTON_SIZE_MD_CLASS = "h-10 px-3.5 text-sm";

export const BUTTON_ICON_SM_CLASS =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-gray-700 bg-gray-900/80 text-gray-400 transition-colors duration-150 hover:border-gray-500 hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

export const BUTTON_ICON_MD_CLASS =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-gray-700 bg-gray-900/80 text-gray-400 transition-colors duration-150 hover:border-gray-500 hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

export const BUTTON_ICON_GHOST_SM_CLASS =
  `${BUTTON_GHOST_CLASS} h-7 w-7 rounded-md p-0 text-gray-500 hover:text-gray-300`;

export const BUTTON_ICON_GHOST_MD_CLASS =
  `${BUTTON_GHOST_CLASS} h-8 w-8 rounded-md p-0 text-gray-500 hover:text-gray-300`;

export const BUTTON_ICON_DANGER_SM_CLASS =
  "inline-flex h-7 w-7 items-center justify-center rounded-md border border-red-500/30 bg-gray-900/80 text-red-200 transition-colors duration-150 hover:border-red-400/40 hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";

export const BUTTON_ICON_DANGER_MD_CLASS =
  "inline-flex h-8 w-8 items-center justify-center rounded-md border border-red-500/30 bg-gray-900/80 text-red-200 transition-colors duration-150 hover:border-red-400/40 hover:bg-gray-800 hover:text-white disabled:cursor-not-allowed disabled:opacity-40";
