import { languages } from "@excalidraw/excalidraw";

/**
 * Language selector matching the "Preferences" row of excalidraw.com.
 * Rendered inside the main menu, so it must not trigger menu item selection.
 */
export function LanguagePicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (code: string) => void;
}) {
  return (
    <div className="language-picker">
      <label className="language-picker__label" htmlFor="whiteboard-language">
        <span className="language-picker__title">Language</span>
      </label>
      <select
        id="whiteboard-language"
        className="language-picker__select"
        value={value}
        onClick={(event) => event.stopPropagation()}
        onChange={(event) => onChange(event.target.value)}
      >
        {languages.map((lang) => (
          <option key={lang.code} value={lang.code}>
            {lang.label}
          </option>
        ))}
      </select>
    </div>
  );
}
