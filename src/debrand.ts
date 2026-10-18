/**
 * Branding patcher for the embedded editor.
 *
 * The upstream component renders a handful of third-party references that are
 * not configurable via props:
 *
 * - the "Excalidraw Library" section heading in the library sidebar,
 * - the "Mermaid to Excalidraw" tool name (tools menu + dialog),
 * - links to excalidraw.com resources in the help dialog.
 *
 * We rewrite them after render instead of forking the component:
 *
 * - text is mutated in place (never replaced) so React keeps its node
 *   identity and cannot throw "node to be removed is not a child" errors;
 * - third-party links are repointed at our repo, or hidden with an inline
 *   `display: none` rather than removed.
 *
 * A MutationObserver re-applies the patches whenever the editor re-renders
 * (dialogs opening, language switch, library updates, ...). Every pass is
 * idempotent, so the observer settles instead of looping.
 */

const REPO_URL = "https://github.com/sachinpatilgit/sachins-whiteboard";

/** Exact English UI strings we replace (all contain the old brand name). */
const TEXT_PATCHES: ReadonlyArray<readonly [string, string]> = [
  ["Mermaid to Excalidraw", "Mermaid to Whiteboard"],
  ["rendered as image in Excalidraw", "rendered as an image on the whiteboard"],
  ["Made with Excalidraw", "Made with Sachin’s Whiteboard"],
  [
    "Join a live collaboration session on Excalidraw",
    "Join a live collaboration session",
  ],
  ["Install Excalidraw locally (PWA)", "Install this whiteboard locally (PWA)"],
  ["Excalidraw Library", "Built-in Library"],
  ["Excalidraw JSON data", "whiteboard data"],
];

/**
 * Element-targeted patches keyed by CSS selector. Language independent: the
 * element is found structurally and its label replaced outright.
 */
const HEADING_PATCHES: ReadonlyArray<readonly [string, string]> = [
  // Section heading above the bundled shape library in the library sidebar.
  [".library-menu-items-container__header--excal", "Built-in Library"],
];

/** Rewrites a single text node in place when it mentions the old brand. */
const patchTextNode = (node: Text): void => {
  const current = node.nodeValue;
  // Cheap guard: every patch below replaces a string containing the brand.
  if (!current || !current.includes("Excalidraw")) {
    return;
  }
  let value = current;
  for (const [from, to] of TEXT_PATCHES) {
    if (value.includes(from)) {
      value = value.split(from).join(to);
    }
  }
  if (value !== current) {
    node.nodeValue = value;
  }
};

/** Sets the label of a heading element by mutating its text child. */
const setHeadingText = (element: Element, text: string): void => {
  for (const child of element.childNodes) {
    if (
      child.nodeType === Node.TEXT_NODE &&
      child.nodeValue?.trim() &&
      child.nodeValue !== text
    ) {
      child.nodeValue = text;
      return;
    }
  }
};

/** Repoints third-party help links at our repo, or hides the ones we drop. */
const patchLinks = (root: ParentNode): void => {
  for (const anchor of root.querySelectorAll<HTMLAnchorElement>("a[href]")) {
    const { href } = anchor;
    if (href.includes("docs.excalidraw.com")) {
      anchor.href = `${REPO_URL}#readme`;
    } else if (href.includes("github.com/excalidraw/excalidraw/issues")) {
      anchor.href = `${REPO_URL}/issues`;
    } else if (
      href.includes("plus.excalidraw.com") ||
      href.includes("youtube.com/@excalidraw")
    ) {
      anchor.style.display = "none";
    }
  }
};

const applyPatches = (root: HTMLElement): void => {
  for (const [selector, text] of HEADING_PATCHES) {
    for (const element of root.querySelectorAll(selector)) {
      setHeadingText(element, text);
    }
  }

  // Walk text nodes; skip anything the user can type into so their own
  // content (text elements, the mermaid editor) is never rewritten.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node: Node | null;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    if (!parent || parent.closest("script,style,textarea,[contenteditable]")) {
      continue;
    }
    patchTextNode(node as Text);
  }

  patchLinks(root);
};

/**
 * Starts patching the app. The target should be `document.body`: the editor
 * keeps its main UI in the React root but renders dialogs (help, mermaid, ...)
 * into a separate portal container appended to the body, so a single observer
 * on the body covers both. Returns a cleanup function that stops the observer.
 */
export const attachDebranding = (target: HTMLElement): (() => void) => {
  let frame = 0;
  const run = () => {
    frame = 0;
    applyPatches(target);
  };
  // Coalesce bursts of mutations into one pass per animation frame.
  const schedule = () => {
    if (!frame) {
      frame = requestAnimationFrame(run);
    }
  };

  schedule();

  const observer = new MutationObserver(schedule);
  observer.observe(target, {
    subtree: true,
    childList: true,
    characterData: true,
  });

  return () => {
    observer.disconnect();
    if (frame) {
      cancelAnimationFrame(frame);
    }
  };
};
