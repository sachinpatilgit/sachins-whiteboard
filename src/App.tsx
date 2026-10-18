import { useCallback, useEffect, useRef, useState } from "react";
import {
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  defaultLang,
  languages,
  restoreAppState,
  restoreElements,
  useHandleLibrary,
} from "@excalidraw/excalidraw";
import type {
  ExcalidrawImperativeAPI,
  ExcalidrawInitialDataState,
  ExcalidrawProps,
} from "@excalidraw/excalidraw/types";

import { LanguagePicker } from "./LanguagePicker";
import { attachDebranding } from "./debrand";
import brandLogo from "./assets/brand-logo.svg";
import {
  flushSceneSave,
  libraryPersistenceAdapter,
  loadFilesFromStorage,
  loadSceneFromStorage,
  loadStoredLangCode,
  loadStoredThemeChoice,
  persistLangCode,
  persistThemeChoice,
  removeObsoleteFiles,
  resolveTheme,
  saveFilesToStorage,
  scheduleSceneSave,
} from "./persistence";
import type { ThemeChoice } from "./persistence";
import "./brand.css";

type SceneOnChange = NonNullable<ExcalidrawProps["onChange"]>;

/**
 * Stable module-level objects: the editor re-syncs when these props change
 * identity, so they must not be recreated on every render.
 */
const UI_OPTIONS: ExcalidrawProps["UIOptions"] = {
  canvasActions: {
    toggleTheme: true,
  },
};

const LIBRARY_RETURN_URL = `${window.location.origin}${window.location.pathname}`;

const GITHUB_URL = "https://github.com/sachinpatilgit/sachins-whiteboard";

/** GitHub mark (octicon) used in the main menu and the welcome screen. */
const GITHUB_ICON = (
  <svg
    viewBox="0 0 16 16"
    width="1em"
    height="1em"
    fill="currentColor"
    aria-hidden="true"
  >
    <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8z" />
  </svg>
);

/** Picks the best UI language from the browser preferences. */
function detectLangCode(): string {
  const preferred = navigator.languages ?? [navigator.language];
  for (const candidate of preferred) {
    if (!candidate) {
      continue;
    }
    const normalized = candidate.toLowerCase();
    const exact = languages.find((lang) => lang.code.toLowerCase() === normalized);
    if (exact) {
      return exact.code;
    }
    const base = normalized.split("-")[0];
    const prefix = languages.find(
      (lang) => lang.code.toLowerCase().split("-")[0] === base,
    );
    if (prefix) {
      return prefix.code;
    }
  }
  return defaultLang.code;
}

/**
 * Restores the last session from the browser: scene + user preferences from
 * localStorage, embedded image files from IndexedDB. Mirrors the excalidraw.com
 * behaviour of keeping everything local and offline-capable.
 */
async function loadInitialData(): Promise<ExcalidrawInitialDataState | null> {
  const storedScene = loadSceneFromStorage();
  const files = await loadFilesFromStorage();

  const elements = restoreElements(
    (storedScene?.elements ?? null) as Parameters<typeof restoreElements>[0],
    null,
    {
      repairBindings: true,
    },
  );

  const appState = restoreAppState(
    (storedScene?.appState ?? null) as Parameters<typeof restoreAppState>[0],
    null,
  );
  appState.theme = resolveTheme(loadStoredThemeChoice());

  const referencedFileIds = new Set<string>();
  for (const element of elements) {
    const fileId = (element as { fileId?: string }).fileId;
    if (fileId && !element.isDeleted) {
      referencedFileIds.add(fileId);
    }
  }
  removeObsoleteFiles(referencedFileIds).catch(() => undefined);

  return {
    elements,
    appState,
    files,
    scrollToContent: false,
  };
}

export default function App() {
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [api, setApi] = useState<ExcalidrawImperativeAPI | null>(null);

  const [themeChoice, setThemeChoice] = useState<ThemeChoice>(() =>
    loadStoredThemeChoice(),
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia?.("(prefers-color-scheme: dark)").matches ?? false,
  );
  const [langCode, setLangCode] = useState<string>(
    () => loadStoredLangCode() ?? detectLangCode(),
  );

  const resolvedTheme =
    themeChoice === "system"
      ? systemPrefersDark
        ? "dark"
        : "light"
      : themeChoice;

  const resolvedThemeRef = useRef(resolvedTheme);
  resolvedThemeRef.current = resolvedTheme;

  const initialDataRef = useRef<Promise<ExcalidrawInitialDataState | null> | null>(
    null,
  );
  if (!initialDataRef.current) {
    initialDataRef.current = loadInitialData();
  }

  useHandleLibrary({
    excalidrawAPI: api,
    adapter: libraryPersistenceAdapter,
  });

  // Follow the OS theme while the user has picked "system".
  useEffect(() => {
    const media = window.matchMedia?.("(prefers-color-scheme: dark)");
    if (!media) {
      return;
    }
    const handleChange = (event: MediaQueryListEvent) =>
      setSystemPrefersDark(event.matches);
    media.addEventListener("change", handleChange);
    return () => media.removeEventListener("change", handleChange);
  }, []);

  useEffect(() => {
    persistThemeChoice(themeChoice);
    document.documentElement.dataset.theme = resolvedTheme;
  }, [themeChoice, resolvedTheme]);

  useEffect(() => {
    persistLangCode(langCode);
  }, [langCode]);

  const handleChange = useCallback<SceneOnChange>((elements, appState, files) => {
    // Catch theme changes coming from the editor itself (Shift+Alt+D,
    // command palette, etc.) so our controlled theme stays in sync.
    if (appState.theme && appState.theme !== resolvedThemeRef.current) {
      setThemeChoice(appState.theme as ThemeChoice);
    }
    scheduleSceneSave(elements, appState);
    saveFilesToStorage(files).catch((error) => {
      console.warn("[whiteboard] Failed to persist image files", error);
    });
  }, []);

  useEffect(() => {
    const flush = () => {
      const instance = apiRef.current;
      if (!instance) {
        return;
      }
      flushSceneSave(
        instance.getSceneElementsIncludingDeleted(),
        instance.getAppState(),
      );
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        flush();
      }
    };
    window.addEventListener("beforeunload", flush);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", flush);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  // Rewrite third-party branding that the editor renders internally (see
  // debrand.ts): library section heading, mermaid tool name, help dialog
  // links. Observed from the body so the dialog portal container is covered
  // too; re-applied on every re-render via a MutationObserver.
  useEffect(() => attachDebranding(document.body), []);

  const handleExcalidrawApi = useCallback((instance: ExcalidrawImperativeAPI) => {
    apiRef.current = instance;
    setApi(instance);
  }, []);

  return (
    <div className="whiteboard-root">
      <Excalidraw
        autoFocus
        excalidrawAPI={handleExcalidrawApi}
        initialData={initialDataRef.current}
        onChange={handleChange}
        theme={resolvedTheme}
        langCode={langCode}
        UIOptions={UI_OPTIONS}
        libraryReturnUrl={LIBRARY_RETURN_URL}
      >
        <WelcomeScreen>
          <WelcomeScreen.Center>
            <WelcomeScreen.Center.Logo>
              <span className="brand-logo">
                <img
                  className="brand-logo__mark"
                  src={brandLogo}
                  alt=""
                  draggable={false}
                />
                <span className="brand-logo__wordmark">
                  Sachin&rsquo;s Whiteboard
                </span>
              </span>
            </WelcomeScreen.Center.Logo>
            <WelcomeScreen.Center.Heading>
              Sketch. Diagram. Done.
            </WelcomeScreen.Center.Heading>
            <WelcomeScreen.Center.Menu>
              <WelcomeScreen.Center.MenuItemLoadScene />
              <WelcomeScreen.Center.MenuItemHelp />
              <WelcomeScreen.Center.MenuItemLink
                href={GITHUB_URL}
                icon={GITHUB_ICON}
              >
                GitHub
              </WelcomeScreen.Center.MenuItemLink>
            </WelcomeScreen.Center.Menu>
          </WelcomeScreen.Center>
          <WelcomeScreen.Hints.MenuHint />
          <WelcomeScreen.Hints.ToolbarHint />
          <WelcomeScreen.Hints.HelpHint />
        </WelcomeScreen>
        <MainMenu>
          <MainMenu.DefaultItems.LoadScene />
          <MainMenu.DefaultItems.SaveToActiveFile />
          <MainMenu.DefaultItems.Export />
          <MainMenu.DefaultItems.SaveAsImage />
          <MainMenu.DefaultItems.SearchMenu />
          <MainMenu.DefaultItems.Help />
          <MainMenu.DefaultItems.ClearCanvas />
          <MainMenu.Separator />
          <MainMenu.ItemLink href={GITHUB_URL} icon={GITHUB_ICON} target="_blank" rel="noreferrer">
            GitHub
          </MainMenu.ItemLink>
          <MainMenu.Separator />
          <MainMenu.DefaultItems.ToggleTheme
            allowSystemTheme
            theme={themeChoice}
            onSelect={(choice) => setThemeChoice(choice as ThemeChoice)}
          />
          <MainMenu.ItemCustom>
            <LanguagePicker value={langCode} onChange={setLangCode} />
          </MainMenu.ItemCustom>
          <MainMenu.DefaultItems.ChangeCanvasBackground />
        </MainMenu>
      </Excalidraw>
    </div>
  );
}
