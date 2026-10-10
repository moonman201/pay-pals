import { THEME_BOOT_SCRIPT } from "@/lib/theme";

/** Puts the visitor's stored colour mode on the html element before the page paints, so there is no flash of the other mode. */
export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />;
}
