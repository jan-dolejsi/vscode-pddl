# Contributing to `vscode-pddl` extension

Are you looking for the [End-user documentation](client/README.md).

## Building extension

Run `npm install`.

This will ensure the extension dependencies are downloaded using the `--no-optional` switch.

## Packaging extension

The extension must be packaged on computers that have the `npm` version <= 5.5.1 installed globally. This is because of an issue with optional dependencies that `vsce` is wrongly enforcing via the `npm list --production --parsable --depth=99999` command.

Extension packaging and publishing is automated by the `client/publish.cmd` script - obviously only defined for Windows.

## Making a release

Modify following files:

- Update the version in `client/package.json`
- Update the version in `client/publish.cmd`
- Add section about new features and fixes on top of the `client\CHANGELOG.md` and refer to Git tag at the bottom of the file
- Add end-user documentation about new features to `client\README.md`