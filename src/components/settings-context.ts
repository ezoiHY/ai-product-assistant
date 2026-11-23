"use client";

import { createContext, useContext } from "react";

/** Opens the "API 设置" sheet from anywhere (e.g. an error box). */
export const SettingsContext = createContext<() => void>(() => {});
export const useOpenSettings = () => useContext(SettingsContext);

/** Error codes that a different API configuration can fix. */
export const CONFIG_ERROR_CODES = new Set(["not_configured", "auth", "permission", "billing", "bad_config"]);
