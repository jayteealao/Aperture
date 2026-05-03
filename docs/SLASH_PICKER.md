# Slash Picker

The slash picker helps Claude SDK sessions insert available commands and skills from the message composer. It is available only for Claude SDK sessions.

## Open and Filter

1. Focus the message composer.
2. Type `/` as the first word in an otherwise empty composer.
3. Continue typing letters after `/` to filter entries by name.

The picker closes for the current message once the initial slash word is separated by a space or tab. For example, `/review` can keep the picker open, but `/review ` is treated as normal composer text.

`Esc` closes the picker without changing the composer text. Replacing the composer text with `/` opens it again and refreshes the available entries.

## Sources

Rows are grouped by source:

| Group | Meaning |
| --- | --- |
| Favorites | Commands or skills you starred and that are still present in the current discovery result. |
| SDK | Slash commands returned by the active Claude SDK session. |
| Project | Commands and skills discovered from the workspace `.claude` folder. |
| Global | Commands and skills from active installed Claude plugins. |

Each row keeps its own source badge. If two sources expose the same visible command name, they appear as separate rows so you can choose the exact origin.

Source discovery is non-blocking. If one source is empty or unavailable, the picker still shows entries from the sources that loaded successfully.

## Insert

Use the arrow keys to move through rows. Press `Enter` or `Tab`, or click a row, to insert the entry token into the composer.

Selecting a row inserts only the slash token, such as `/review` or `/plugin:review`. It does not submit the message. When the selected entry includes an argument hint, the composer shows the hint below the input after insertion so you can complete the command before sending.

## Favorites

Use the star button on a row to add or remove a favorite. You can also press `Ctrl+Shift+F` on Windows and Linux, or `Cmd+Shift+F` on macOS, to toggle the currently active row.

Favorites are stored locally in the browser and keep their source-specific identity. A favorite is shown only when the matching entry is present in the current picker result, so removed project commands or inactive plugin entries do not appear as stale rows.

## Supported Entries

The picker includes:

- Claude SDK commands returned by the session.
- Workspace commands from `.claude/commands/**/*.md`.
- Workspace skills from `.claude/skills/*/SKILL.md`.
- Commands and skills from active installed Claude plugins.

The picker does not scan arbitrary global folders from the browser. Global entries are resolved by the backend from Claude plugin settings and installed-plugin metadata.

The existing Claude SDK commands panel remains separate. The picker uses its own normalized entry endpoint so commands, skills, project entries, and global plugin entries can appear together without changing the SDK command panel behavior.
