# TabBar

The floating tab bar: an ink pill with a lime pill for the active tab and its label.

- Always `ink`, in both themes, floating 12px above the safe area.
- Only the active tab shows its label; the lime pill glides between tabs (View Transitions, 300ms `cubic-bezier(0.2, 0, 0, 1)`) and sits under the icons.

Hand-written from `src/styles.css` and the matching component in `src/` (static rendition).
