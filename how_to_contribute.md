# Contributing to `vscode-pddl` extension

[![Downloads](https://vsmarketplacebadge.apphb.com/downloads/jan-dolejsi.pddl.svg?subject=Downloads)](https://marketplace.visualstudio.com/items?itemName=jan-dolejsi.pddl)
[![Installs](https://vsmarketplacebadge.apphb.com/installs/jan-dolejsi.pddl.svg?subject=Installations)](https://marketplace.visualstudio.com/items?itemName=jan-dolejsi.pddl)
[![Ratings](https://vsmarketplacebadge.apphb.com/rating-star/jan-dolejsi.pddl.svg?subject=Reviews)](https://marketplace.visualstudio.com/items?itemName=jan-dolejsi.pddl&ssr=false#review-details)
[![VS Code PDDL Extension CI/CD](https://img.shields.io/github/workflow/status/jan-dolejsi/vscode-pddl/Build/master.svg?logo=github)](https://github.com/jan-dolejsi/vscode-pddl/actions?query=workflow%3ABuild)

Are you looking for the [End-user documentation](README.md)?

## Building extension

Prerequisites:

- NodeJS 18.16

Run `npm install`.

This will ensure the extension dependencies are downloaded using the `--no-optional` switch.

## Packaging extension

On Windows, you can use the `deploy.cmd` script to review the content of the package before building it, installing it, testing it. 
The extension is published to the marketplace automatically by the GitHub CI/CD workflow, when the master branch is updated and the version number was bumped.

## Testing the extension

Run `npm test` when all VS Code windows are closed.

## Making a release

Modify following files:

- Update the version in `package.json` (adhere to the major.minor.patch semantic versioning practice)
- Add section about new features and fixes on top of the `CHANGELOG.md` and refer to Git tag at the bottom of the file
- Add relevant end-user documentation about new features to `README.md`
- Submit pull request

## Credits

Icons made by [Pixel perfect](https://www.flaticon.com/authors/pixel-perfect) from [www.flaticon.com](https://www.flaticon.com/) is licensed by [CC 3.0 BY](http://creativecommons.org/licenses/by/3.0/).

Development of this extension was supported by [SLB](https://www.slb.com). Visit [careers.slb.com](https://careers.slb.com/).
