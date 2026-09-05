# Contributing

Thank you for considering a contribution to DetailSearch Linker.

## Development setup

```bash
npm install
npm run check
```

The full check runs unit tests, lint, a production build, and release metadata verification.

Load the plugin in Obsidian by copying or symlinking the repository into your vault's `.obsidian/plugins/detailsearch-linker` folder, then enable it under **Settings -> Community plugins**.

## Pull requests

1. Fork the repository and create a feature branch.
2. Keep changes focused. Match the existing TypeScript style.
3. Add or update tests when behavior changes.
4. Run `npm run check` before opening a PR.
5. Describe what changed and why in the PR body.

CI runs the same check and uploads `main.js`, `manifest.json`, and `styles.css` as a short-lived plugin artifact.

## Reporting issues

Include your Obsidian version, DetailSearch Linker version, and steps to reproduce. Screenshots help when the problem is visual.

## Code of conduct

Be respectful in issues and pull requests. Maintainers may close contributions that are abusive or off-topic.
