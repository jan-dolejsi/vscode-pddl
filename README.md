# Contributing to `vscode-pddl` extension

[![Downloads](https://vsmarketplacebadge.apphb.com/downloads/jan-dolejsi.pddl.svg?subject=Downloads)](https://marketplace.visualstudio.com/items?itemName=jan-dolejsi.pddl)
[![Installs](https://vsmarketplacebadge.apphb.com/installs/jan-dolejsi.pddl.svg?subject=Installations)](https://marketplace.visualstudio.com/items?itemName=jan-dolejsi.pddl)
[![Ratings](https://vsmarketplacebadge.apphb.com/rating-star/jan-dolejsi.pddl.svg?subject=Reviews)](https://marketplace.visualstudio.com/items?itemName=jan-dolejsi.pddl&ssr=false#review-details)
[![VS Code PDDL Extension CI/CD](https://github.com/jan-dolejsi/vscode-pddl/workflows/VS%20Code%20PDDL%20Extension%20CI/CD/badge.svg?branch=master)](https://github.com/jan-dolejsi/vscode-pddl/actions?query=workflow%3A%22VS+Code+PDDL+Extension+CI%2FCD%22)

Are you looking for the [End-user documentation](client/README.md)?

## Building extension

Run `npm install`.

This will ensure the extension dependencies are downloaded using the `--no-optional` switch.

## Packaging extension

Install the VS Code extension packaging tool:

```bash
npm install -g vsce
```

The extension must be packaged on computers that have the `npm` version <= 5.5.1 installed globally. This is because of an issue with optional dependencies that `vsce` is wrongly enforcing via the `npm list --production --parsable --depth=99999` command.

Extension packaging and publishing is automated by the `client/publish.cmd` script - obviously only defined for Windows.

## Testing the extension

Run `npm test` when all VS Code windows are closed.

## Making a release

Modify following files:

- Update the version in `client/package.json`
- Update the version in `client/publish.cmd`
- Add section about new features and fixes on top of the `client\CHANGELOG.md` and refer to Git tag at the bottom of the file
- Add end-user documentation about new features to `client\README.md`

## Credits

Icons made by [Pixel perfect](https://www.flaticon.com/authors/pixel-perfect) from [www.flaticon.com](https://www.flaticon.com/) is licensed by [CC 3.0 BY](http://creativecommons.org/licenses/by/3.0/).

Development of this extension was supported by [Schlumberger](https://www.slb.com). Visit [careers.slb.com](https://careers.slb.com/).
