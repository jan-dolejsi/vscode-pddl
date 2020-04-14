/* --------------------------------------------------------------------------------------------
 * Copyright (c) Jan Dolejsi. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */
'use strict';

import {
    workspace, Uri, TreeDataProvider, Event, TreeItem, EventEmitter, TreeItemCollapsibleState, window, FileType, WorkspaceFolder, RelativePattern
} from 'vscode';
import { basename, join } from 'path';
import { utils } from 'pddl-workspace';
import { TestsManifest } from './TestsManifest';
import { TestOutcome, Test } from './Test';
import { PddlExtensionContext } from 'pddl-workspace';
import { assertDefined } from '../utils';

export interface PTestNode {
    resource: Uri;
    kind: PTestNodeKind;
    label?: string;
    tooltip?: string;
}

export enum PTestNodeKind { Directory, Manifest, Test }

export class PTestTreeDataProvider implements TreeDataProvider<PTestNode> {

    private _onDidChange: EventEmitter<PTestNode> = new EventEmitter<PTestNode>();
    public get onDidChangeTreeData(): Event<PTestNode> { return this._onDidChange.event; }

    private testResults: Map<string, TestOutcome> = new Map();
    private treeNodeCache: Map<string, PTestNode> = new Map();

    constructor(private context: PddlExtensionContext) {

    }

    refresh(): void {
        this.testResults.clear();
        this.treeNodeCache.clear();
        this._onDidChange.fire();
    }

    getTestOutcome(testUri: Uri): TestOutcome {
        return this.testResults.get(testUri.toString()) ?? TestOutcome.UNKNOWN;
    }

    setTestOutcome(test: Test, testOutcome: TestOutcome): void {
        this.testResults.set(test.getUriOrThrow().toString(), testOutcome);
        const node = this.findNodeByResource(test.getUriOrThrow());
        this._onDidChange.fire(node);
    }

    findNodeByResource(resource: Uri): PTestNode {
        return assertDefined(this.treeNodeCache.get(resource.toString()), `No node for ${resource.toString()}`);
    }

    cache(node: PTestNode): PTestNode {
        this.treeNodeCache.set(node.resource.toString(), node);
        return node;
    }

    getTreeItem(element: PTestNode): TreeItem | Thenable<TreeItem> {

        let icon: string;
        let contextValue: string;

        if (element.kind === PTestNodeKind.Directory) {
            icon = 'folder' + '.svg';
            contextValue = 'folder';
        } else if (element.kind === PTestNodeKind.Manifest) {
            icon = 'beaker' + '.svg';
            contextValue = 'manifest';
        } else {
            const testOutcome = this.getTestOutcome(element.resource);
            switch (testOutcome) {
                case TestOutcome.UNKNOWN:
                    icon = 'exclamation';
                    break;
                case TestOutcome.SUCCESS:
                    icon = 'checked';
                    break;
                case TestOutcome.FAILED:
                    icon = 'error';
                    break;
                case TestOutcome.SKIPPED:
                    icon = 'skipped';
                    break;
                case TestOutcome.IN_PROGRESS:
                    icon = 'progress';
                    break;
                default:
                    icon = 'interrogation';
            }
            icon += '.svg';
            contextValue = 'test';
        }

        const isCollapsible = element.kind === PTestNodeKind.Directory || element.kind === PTestNodeKind.Manifest;

        return {
            id: element.resource.toString(),
            resourceUri: element.resource,
            collapsibleState: isCollapsible ? TreeItemCollapsibleState.Collapsed : void 0,
            contextValue: contextValue,
            label: element.label,
            iconPath: this.getIcon(icon),
            tooltip: element.tooltip
        };
    }

    getIcon(fileName: string): { light: string | Uri; dark: string | Uri } | undefined {
        if (!fileName) { return undefined; }
        return {
            light: this.context.asAbsolutePath(join('images', 'light', fileName)),
            dark: this.context.asAbsolutePath(join('images', 'dark', fileName))
        };
    }

    async getChildren(element?: PTestNode): Promise<PTestNode[]> {
        if (!element) {
            if (workspace.workspaceFolders) {
                const manifestPromises = workspace.workspaceFolders
                    .map(async wf => await this.findManifests(wf, 1));

                const manifestUris = utils.Util.flatMap(await Promise.all(manifestPromises));

                const rootNodes = workspace.workspaceFolders
                    .filter(wf => this.containsManifest(wf.uri.fsPath, manifestUris))
                    .map(wf => this.cache({ resource: wf.uri, kind: PTestNodeKind.Directory }));

                // if empty, will show the welcome message
                return rootNodes;
            } else {
                return [];
            }
        }
        else {
            const parentUri = element.resource;
            const parentPath = parentUri.fsPath;

            if (PTestTreeDataProvider.isTestManifest(parentPath)) {
                const manifest = this.tryLoadManifest(parentPath);
                if (!manifest) { return []; }

                // return test cases
                return manifest.testCases
                    .map(test => this.cache({
                        resource: test.getUriOrThrow(),
                        kind: PTestNodeKind.Test,
                        label: test.getLabel(),
                        tooltip: test.getDescription()
                    }));
            }
            else {
                const nestedManifestUris = await this.findManifests(parentPath, 1000);
                const directoryContent = await workspace.fs.readDirectory(parentUri);

                return directoryContent.map(childAndType => {
                    const [child, childType] = childAndType;
                    const childPath = join(parentPath, child);
                    return this.toCachedNode(childPath, childType, nestedManifestUris);
                })
                    .filter(node => !!node)
                    .map(node => node!);
            }
        }
    }

    toCachedNode(childPath: string, childType: FileType, nestedManifestUris: Uri[]): PTestNode | undefined {
        if (childType === FileType.File) {
            if (PTestTreeDataProvider.isTestManifest(childPath)) {
                let label = childPath;
                const baseName = basename(childPath);

                if (baseName.length === PTestTreeDataProvider.PTEST_SUFFIX.length) {
                    label = 'Test cases';
                } else {
                    label = baseName.substring(0, baseName.length - PTestTreeDataProvider.PTEST_SUFFIX.length);
                }
                return this.cache({
                    resource: Uri.file(childPath),
                    kind: PTestNodeKind.Manifest,
                    label: label
                });
            } else {
                return undefined; // file, but not manifest
            }
        }
        else if (childType === FileType.Directory) {
            if (this.containsManifest(childPath, nestedManifestUris)) {
                return this.cache({
                    resource: Uri.file(childPath),
                    kind: PTestNodeKind.Directory
                });
            }
            else {
                return undefined; // does not contain any manifests
            }
        }
        else {
            return undefined; // not following symbolic links
        }
    }

    containsManifest(folderPath: string, manifestUris: Uri[]): boolean {
        return manifestUris
            .some(uri => uri.fsPath.startsWith(folderPath));
    }

    private async findManifests(folder: WorkspaceFolder | string, maxEntries = 1): Promise<Uri[]> {
        return await workspace.findFiles(new RelativePattern(folder, '**/*' + PTestTreeDataProvider.PTEST_SUFFIX), '.git/', maxEntries);
    }

    tryLoadManifest(manifestPath: string): TestsManifest | undefined {
        try {
            return TestsManifest.load(manifestPath, this.context);
        } catch (error) {
            window.showErrorMessage(`Unable to load test manifest from: ${manifestPath} 
${error}`);
            return undefined;
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    getParent?(_element: PTestNode): PTestNode | Thenable<PTestNode> {
        throw new Error("Method not implemented.");
    }

    public static PTEST_SUFFIX = '.ptest.json';

    static isTestManifest(filePath: string): boolean {
        return basename(filePath).toLowerCase().endsWith(this.PTEST_SUFFIX);
    }
}
